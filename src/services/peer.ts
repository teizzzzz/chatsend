import type { SignalPayload } from '@/types/signaling';

/**
 * Wrapper around RTCPeerConnection + a single RTCDataChannel.
 *
 * Owns WebRTC mechanics only: offer/answer negotiation, trickle ICE (with
 * buffering for candidates that arrive before the remote description), and
 * channel lifecycle. It knows nothing about rooms or React — signalling is
 * injected as a `sendSignal` callback so the transport layer stays testable.
 *
 * The host (room creator) is the initiator: it creates the DataChannel and
 * the offer. The guest answers and receives the channel via `ondatachannel`.
 */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

/** Single ordered, reliable channel for both chat and file chunks. */
const CHANNEL_LABEL = 'chatsend';

export interface PeerEvents {
  /** DataChannel is open — the pairing is usable. */
  onOpen: () => void;
  /** DataChannel closed (peer left, tab closed, network dropped). */
  onClose: () => void;
  /** A message arrived on the channel (text frames or binary chunks). */
  onMessage: (data: string | ArrayBuffer) => void;
  /** Underlying connection state changed (for status UI / failure detection). */
  onStateChange: (state: RTCPeerConnectionState) => void;
}

export class PeerSession {
  private readonly pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  /** ICE candidates received before the remote description was set. */
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(
    private readonly initiator: boolean,
    private readonly sendSignal: (payload: SignalPayload) => void,
    private readonly events: PeerEvents,
  ) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal({ kind: 'ice', data: event.candidate.toJSON() });
      }
    };
    this.pc.onconnectionstatechange = () => {
      this.events.onStateChange(this.pc.connectionState);
    };
    if (!this.initiator) {
      this.pc.ondatachannel = (event) => this.attachChannel(event.channel);
    }
  }

  /** Kick off negotiation. Only the initiator sends an offer. */
  async start(): Promise<void> {
    if (!this.initiator) return;
    this.attachChannel(this.pc.createDataChannel(CHANNEL_LABEL));
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.sendSignal({ kind: 'offer', data: offer });
  }

  /** Feed a relayed offer / answer / ICE candidate into the connection. */
  async handleSignal(payload: SignalPayload): Promise<void> {
    switch (payload.kind) {
      case 'offer': {
        await this.pc.setRemoteDescription(payload.data);
        await this.flushPendingCandidates();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.sendSignal({ kind: 'answer', data: answer });
        break;
      }
      case 'answer':
        await this.pc.setRemoteDescription(payload.data);
        await this.flushPendingCandidates();
        break;
      case 'ice':
        if (this.pc.remoteDescription) {
          await this.pc.addIceCandidate(payload.data);
        } else {
          this.pendingCandidates.push(payload.data);
        }
        break;
    }
  }

  /** Send a frame over the DataChannel. Returns false if it isn't open. */
  send(data: string | ArrayBuffer): boolean {
    if (this.channel?.readyState !== 'open') return false;
    if (typeof data === 'string') this.channel.send(data);
    else this.channel.send(data);
    return true;
  }

  close(): void {
    this.channel?.close();
    this.pc.close();
  }

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => this.events.onOpen();
    channel.onclose = () => this.events.onClose();
    channel.onmessage = (event) => this.events.onMessage(event.data);
  }

  private async flushPendingCandidates(): Promise<void> {
    const pending = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of pending) {
      await this.pc.addIceCandidate(candidate);
    }
  }
}
