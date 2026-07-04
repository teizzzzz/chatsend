import { create } from 'zustand';
import type { Device, Message } from '@/types';
import { parseFrame, type ChannelFrame } from '@/types/channel';
import { SignalingClient, defaultSignalingUrl } from '@/services/signaling';
import { PeerSession } from '@/services/peer';
import { ChunkAssembler, makeFileMeta, pumpFile } from '@/services/transfer';
import { saveMessage } from '@/services/db';
import { useAppStore } from '@/store/useAppStore';
import { createId } from '@/lib/utils';

/**
 * Live connection state — the glue between the React pages and the
 * signalling / WebRTC services. Exactly one pairing at a time (MVP).
 *
 * The services themselves are module-level singletons, not store fields:
 * they hold sockets and RTCPeerConnections, which don't belong in React
 * state. `epoch` guards against callbacks from an abandoned attempt (e.g.
 * StrictMode double-mount, user cancelling and retrying) mutating the store.
 */

export type SessionStatus =
  | 'idle' // no attempt in progress
  | 'connecting' // opening the signalling socket
  | 'waiting' // host: room created, waiting for a guest
  | 'joining' // guest: join request sent
  | 'negotiating' // both peers present, WebRTC handshake running
  | 'connected' // DataChannel open
  | 'disconnected' // was connected, then lost the peer
  | 'failed'; // attempt failed before connecting

interface SessionState {
  status: SessionStatus;
  /** 6-character room code (host gets it from the server). */
  code: string | null;
  isHost: boolean;
  peer: Device | null;
  error: string | null;
  /** Local session id; groups this pairing's messages. */
  sessionId: string | null;
  /** Chat timeline: text, file, and system messages. */
  messages: Message[];
  /** True while a file is being sent or received (one at a time in MVP). */
  transferring: boolean;
  /**
   * Six-digit code derived from both DTLS fingerprints; identical on both
   * devices when the connection is untampered (端到端身份确认, req §6.2).
   */
  verificationCode: string | null;
  /** Object URLs for received files, by message id. Session-lifetime only. */
  fileUrls: Record<string, string>;

  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  /** Send a text message over the DataChannel. False if not connected. */
  sendText: (content: string) => boolean;
  /**
   * Queue one or more files to send. Files are offered one at a time: the
   * next offer goes out when the current transfer reaches a terminal state.
   */
  sendFiles: (files: File[]) => void;
  /** Receiver: accept a pending file offer. */
  acceptFile: (messageId: string) => void;
  /** Receiver: decline a pending file offer. */
  rejectFile: (messageId: string) => void;
  /** Abort a pending or in-flight transfer (either side). */
  cancelTransfer: (messageId: string) => void;
  /** Sender: re-offer a failed / rejected / cancelled file. */
  retryFile: (messageId: string) => void;
  /** Tear down any connection/attempt and reset to idle. */
  leave: () => void;
}

let signaling: SignalingClient | null = null;
let peer: PeerSession | null = null;
let epoch = 0;

/** Sender keeps File handles for the active session (send + retry). */
const outgoingFiles = new Map<string, File>();
/** Send-loop cancellation flags, checked between chunks. */
const cancelledSends = new Set<string>();
/** The one in-flight incoming transfer (single transfer at a time in MVP). */
let activeReceive: { id: string; assembler: ChunkAssembler } | null = null;
/** Files waiting to be offered (multi-file selection / drag & drop). */
const sendQueue: File[] = [];
/**
 * Partial downloads kept after an interrupted attempt so a retried offer
 * resumes from where it stopped instead of starting over (断点续传).
 * In-memory only: resume works within the page's lifetime.
 */
const partialReceives = new Map<string, ChunkAssembler>();

function localDevice(): Device {
  const { deviceId, deviceName } = useAppStore.getState();
  return {
    id: deviceId,
    name: deviceName,
    platform: 'web',
    lastSeenAt: Date.now(),
    trusted: false,
  };
}

function teardownServices(): void {
  peer?.close();
  peer = null;
  signaling?.close();
  signaling = null;
}

export const useSessionStore = create<SessionState>((set, get) => {
  /** Append to the timeline and persist (unless history saving is off). */
  const pushMessage = (message: Message): void => {
    set((s) => ({ messages: [...s.messages, message] }));
    if (useAppStore.getState().saveHistory) void saveMessage(message);
  };

  /**
   * Patch a timeline message in place. `persist` re-saves the record — used
   * on status transitions; bare progress ticks stay in memory only.
   */
  const updateMessage = (id: string, patch: Partial<Message>, persist = false): void => {
    let updated: Message | undefined;
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? (updated = { ...m, ...patch }) : m)),
    }));
    if (persist && updated && useAppStore.getState().saveHistory) {
      void saveMessage(updated);
    }
  };

  const findMessage = (id: string): Message | undefined =>
    get().messages.find((m) => m.id === id);

  const sendFrame = (frame: ChannelFrame): boolean =>
    peer?.send(JSON.stringify(frame)) ?? false;

  /** Finish an incoming file: build the Blob, expose a download URL. */
  const finishReceive = (id: string, blob: Blob): void => {
    partialReceives.delete(id);
    const url = URL.createObjectURL(blob);
    set((s) => ({ fileUrls: { ...s.fileUrls, [id]: url }, transferring: false }));
    updateMessage(id, { status: 'completed', progress: 100, completedAt: Date.now() }, true);
  };

  /** Interrupted incoming transfer: stash the bytes so a retry can resume. */
  const stashPartialReceive = (): void => {
    if (!activeReceive) return;
    if (activeReceive.assembler.received > 0) {
      partialReceives.set(activeReceive.id, activeReceive.assembler);
    }
    activeReceive = null;
  };

  /** An outgoing file that hasn't reached a terminal state yet? */
  const hasActiveOutgoingFile = (): boolean =>
    get().messages.some(
      (m) =>
        m.type === 'file' &&
        m.direction === 'sent' &&
        (m.status === 'pending' || m.status === 'transferring'),
    );

  /** Offer the file without queue checks — callers guard. */
  const offerFile = (file: File): void => {
    const { sessionId, peer: peerDevice } = get();
    const id = createId('msg_');
    const meta = makeFileMeta(file);
    if (!sendFrame({ v: 1, type: 'file-offer', id, file: meta })) return;
    outgoingFiles.set(id, file);
    pushMessage({
      id,
      sessionId: sessionId ?? 'none',
      type: 'file',
      direction: 'sent',
      senderDeviceId: localDevice().id,
      receiverDeviceId: peerDevice?.id ?? 'unknown',
      file: meta,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
      peerDeviceName: peerDevice?.name,
    });
  };

  /** Pop the next queued file once nothing is pending or in flight. */
  const offerNextQueued = (): void => {
    if (get().status !== 'connected' || !peer) {
      sendQueue.length = 0;
      return;
    }
    if (get().transferring || hasActiveOutgoingFile()) return;
    const file = sendQueue.shift();
    if (file) offerFile(file);
  };

  /** Sender pump: reads the file chunk by chunk with backpressure. */
  const runSend = async (
    id: string,
    file: File,
    myEpoch: number,
    startOffset = 0,
  ): Promise<void> => {
    const result = await pumpFile(
      file,
      (chunk) => (peer ? peer.sendWithBackpressure(chunk) : Promise.resolve(false)),
      (sentBytes) => {
        if (epoch !== myEpoch) return;
        const pct = Math.round((sentBytes / Math.max(1, file.size)) * 100);
        if (findMessage(id)?.progress !== pct) updateMessage(id, { progress: pct });
      },
      () => cancelledSends.has(id) || epoch !== myEpoch,
      startOffset,
    );
    if (epoch !== myEpoch) return;
    set({ transferring: false });
    if (result === 'completed') {
      updateMessage(id, { status: 'completed', progress: 100, completedAt: Date.now() }, true);
    } else if (result === 'cancelled') {
      updateMessage(id, { status: 'cancelled' }, true);
    } else {
      updateMessage(id, { status: 'failed', error: 'Transfer failed — connection dropped.' }, true);
    }
    offerNextQueued();
  };

  const pushSystemMessage = (content: string): void => {
    const { sessionId, peer: peerDevice } = get();
    pushMessage({
      id: createId('msg_'),
      sessionId: sessionId ?? 'none',
      type: 'system',
      direction: 'received',
      senderDeviceId: 'system',
      receiverDeviceId: localDevice().id,
      content,
      status: 'completed',
      progress: 100,
      createdAt: Date.now(),
      peerDeviceName: peerDevice?.name,
    });
  };

  const handleFrame = (frame: ChannelFrame, myEpoch: number): void => {
    const { sessionId, peer: peerDevice } = get();
    switch (frame.type) {
      case 'text': {
        pushMessage({
          // Reuse the sender's id so both sides address the same message.
          id: frame.id || createId('msg_'),
          sessionId: sessionId ?? 'none',
          type: 'text',
          direction: 'received',
          senderDeviceId: peerDevice?.id ?? 'unknown',
          receiverDeviceId: localDevice().id,
          content: frame.content,
          status: 'completed',
          progress: 100,
          createdAt: Date.now(),
          peerDeviceName: peerDevice?.name,
        });
        break;
      }

      case 'file-offer': {
        // A retry re-offers with the same id: reset the existing bubble
        // instead of appending a duplicate.
        if (findMessage(frame.id)) {
          updateMessage(
            frame.id,
            { status: 'pending', progress: 0, error: undefined, file: frame.file },
            true,
          );
        } else {
          pushMessage({
            id: frame.id,
            sessionId: sessionId ?? 'none',
            type: 'file',
            direction: 'received',
            senderDeviceId: peerDevice?.id ?? 'unknown',
            receiverDeviceId: localDevice().id,
            file: frame.file,
            status: 'pending',
            progress: 0,
            createdAt: Date.now(),
            peerDeviceName: peerDevice?.name,
          });
        }
        // Trusted devices skip the manual confirmation (req §6.2).
        if (
          peerDevice &&
          useAppStore.getState().trustedDevices[peerDevice.id] &&
          !get().transferring
        ) {
          pushSystemMessage('Auto-accepted from trusted device');
          get().acceptFile(frame.id);
        }
        break;
      }

      case 'file-accept': {
        const file = outgoingFiles.get(frame.id);
        if (!file || get().transferring) break;
        cancelledSends.delete(frame.id);
        // Resume from the receiver's partial copy when it has one.
        const offset =
          frame.offset && frame.offset > 0 && frame.offset < file.size ? frame.offset : 0;
        const startPct = Math.round((offset / Math.max(1, file.size)) * 100);
        set({ transferring: true });
        updateMessage(frame.id, { status: 'transferring', progress: startPct }, true);
        if (offset > 0) pushSystemMessage(`Resuming transfer from ${startPct}%`);
        void runSend(frame.id, file, myEpoch, offset);
        break;
      }

      case 'file-reject': {
        if (!outgoingFiles.has(frame.id)) break;
        updateMessage(frame.id, { status: 'rejected' }, true);
        pushSystemMessage('Peer declined the file');
        offerNextQueued();
        break;
      }

      case 'file-cancel': {
        // Sender side: flag the pump; it marks the message itself. If the
        // offer was still pending (no pump running), mark it here.
        cancelledSends.add(frame.id);
        const message = findMessage(frame.id);
        if (message && (message.status === 'pending' || message.direction === 'received')) {
          updateMessage(frame.id, { status: 'cancelled' }, true);
        }
        // Receiver side: keep the partial bytes for a future resume.
        if (activeReceive?.id === frame.id) {
          stashPartialReceive();
          set({ transferring: false });
        }
        offerNextQueued();
        break;
      }
    }
  };

  /** Incoming binary frame = one chunk of the accepted transfer. */
  const handleChunk = (chunk: ArrayBuffer): void => {
    if (!activeReceive) return;
    const { id, assembler } = activeReceive;
    assembler.append(chunk);
    const pct = Math.round((assembler.received / Math.max(1, assembler.meta.size)) * 100);
    if (findMessage(id)?.progress !== pct) updateMessage(id, { progress: pct });
    if (assembler.done) {
      const blob = assembler.toBlob();
      activeReceive = null;
      finishReceive(id, blob);
    }
  };

  /** Both peers are in the room — run the WebRTC handshake. */
  const startPeer = (initiator: boolean, myEpoch: number): void => {
    peer = new PeerSession(
      initiator,
      (payload) => signaling?.sendSignal(payload),
      {
        onOpen: () => {
          if (epoch !== myEpoch) return;
          set({ status: 'connected' });
          pushSystemMessage(`Connected to ${get().peer?.name ?? 'peer'}`);
          // P2P link is up — the signalling socket has done its job.
          signaling?.close();
          signaling = null;
          void peer?.verificationCode().then((code) => {
            if (epoch !== myEpoch || !code) return;
            set({ verificationCode: code });
            pushSystemMessage(
              `Verification code ${code.slice(0, 3)} ${code.slice(3)} — matches on both devices when the connection is secure`,
            );
          });
        },
        onClose: () => {
          if (epoch !== myEpoch) return;
          // Fail anything mid-flight; keep received bytes for a resume.
          if (activeReceive) {
            const receiveId = activeReceive.id;
            stashPartialReceive();
            updateMessage(
              receiveId,
              { status: 'failed', error: 'Connection lost during transfer.' },
              true,
            );
            set({ transferring: false });
          }
          if (get().status === 'connected') {
            set({ status: 'disconnected' });
            pushSystemMessage('Connection closed');
          }
        },
        onStateChange: (state) => {
          if (epoch !== myEpoch) return;
          if (state === 'failed') {
            const wasConnected = get().status === 'connected';
            set({
              status: wasConnected ? 'disconnected' : 'failed',
              error: wasConnected
                ? null
                : 'Could not establish a direct connection. Make sure both devices are online — the same Wi-Fi network works best.',
            });
            if (wasConnected) pushSystemMessage('Connection lost');
          }
        },
        onMessage: (data) => {
          if (epoch !== myEpoch) return;
          if (typeof data === 'string') {
            const frame = parseFrame(data);
            if (frame) handleFrame(frame, myEpoch);
          } else {
            handleChunk(data);
          }
        },
      },
    );
    void peer.start();
  };

  /** Refuse to pair with a blocked device (req §6.2: 设备黑名单). */
  const rejectIfBlocked = (device: Device): boolean => {
    if (!useAppStore.getState().blockedDevices[device.id]) return false;
    teardownServices();
    set({
      status: 'failed',
      error: `"${device.name}" is blocked. Unblock it in Settings to connect.`,
    });
    return true;
  };

  const openSignaling = (myEpoch: number): Promise<void> => {
    signaling = new SignalingClient({
      onRoomCreated: (code) => {
        if (epoch === myEpoch) set({ code, status: 'waiting' });
      },
      onRoomJoined: (hostDevice) => {
        if (epoch !== myEpoch) return;
        if (rejectIfBlocked(hostDevice)) return;
        set({ peer: hostDevice, status: 'negotiating' });
        startPeer(false, myEpoch);
      },
      onPeerJoined: (guestDevice) => {
        if (epoch !== myEpoch) return;
        if (rejectIfBlocked(guestDevice)) return;
        set({ peer: guestDevice, status: 'negotiating' });
        startPeer(true, myEpoch);
      },
      onSignal: (payload) => {
        void peer?.handleSignal(payload);
      },
      onPeerLeft: () => {
        if (epoch !== myEpoch) return;
        if (get().status !== 'connected') {
          set({ status: 'failed', error: 'The other device left before the connection was ready.' });
        }
      },
      onError: (_code, message) => {
        if (epoch === myEpoch) set({ status: 'failed', error: message });
      },
      onClose: () => {
        if (epoch !== myEpoch) return;
        const { status } = get();
        if (status !== 'connected' && status !== 'disconnected' && status !== 'failed' && status !== 'idle') {
          set({ status: 'failed', error: 'Lost connection to the signalling server.' });
        }
      },
    });
    return signaling.connect(defaultSignalingUrl());
  };

  /** Release everything tied to the previous session's transfers. */
  const resetTransferState = (): void => {
    outgoingFiles.clear();
    cancelledSends.clear();
    activeReceive = null;
    sendQueue.length = 0;
    partialReceives.clear();
    for (const url of Object.values(get().fileUrls)) URL.revokeObjectURL(url);
  };

  const beginAttempt = (isHost: boolean): number => {
    epoch += 1;
    teardownServices();
    resetTransferState();
    set({
      status: 'connecting',
      code: null,
      peer: null,
      error: null,
      isHost,
      sessionId: createId('sess_'),
      messages: [],
      transferring: false,
      fileUrls: {},
      verificationCode: null,
    });
    return epoch;
  };

  return {
    status: 'idle',
    code: null,
    isHost: false,
    peer: null,
    error: null,
    sessionId: null,
    messages: [],
    transferring: false,
    fileUrls: {},
    verificationCode: null,

    async createRoom() {
      const myEpoch = beginAttempt(true);
      try {
        await openSignaling(myEpoch);
        if (epoch !== myEpoch) return;
        signaling?.createRoom(localDevice());
      } catch (err) {
        if (epoch === myEpoch) {
          set({ status: 'failed', error: (err as Error).message });
        }
      }
    },

    async joinRoom(code: string) {
      const myEpoch = beginAttempt(false);
      set({ status: 'joining' });
      try {
        await openSignaling(myEpoch);
        if (epoch !== myEpoch) return;
        signaling?.joinRoom(code.toUpperCase().trim(), localDevice());
      } catch (err) {
        if (epoch === myEpoch) {
          set({ status: 'failed', error: (err as Error).message });
        }
      }
    },

    sendText(content: string) {
      const { status, sessionId, peer: peerDevice } = get();
      const text = content.trim();
      if (!text || status !== 'connected' || !peer) return false;

      const id = createId('msg_');
      const frame: ChannelFrame = { v: 1, type: 'text', id, content: text, sentAt: Date.now() };
      if (!peer.send(JSON.stringify(frame))) return false;

      pushMessage({
        id,
        sessionId: sessionId ?? 'none',
        type: 'text',
        direction: 'sent',
        senderDeviceId: localDevice().id,
        receiverDeviceId: peerDevice?.id ?? 'unknown',
        content: text,
        status: 'completed',
        progress: 100,
        createdAt: Date.now(),
        peerDeviceName: peerDevice?.name,
      });
      return true;
    },

    sendFiles(files: File[]) {
      if (get().status !== 'connected' || !peer || files.length === 0) return;
      sendQueue.push(...files);
      offerNextQueued();
    },

    acceptFile(messageId: string) {
      const message = findMessage(messageId);
      if (!message?.file || message.status !== 'pending' || get().transferring) return;

      // Resume from a stashed partial when the retried offer matches it.
      const partial = partialReceives.get(messageId);
      const resumable =
        partial && partial.meta.size === message.file.size && !partial.done
          ? partial
          : undefined;
      const offset = resumable?.received ?? 0;

      if (!sendFrame({ v: 1, type: 'file-accept', id: messageId, offset })) return;

      if (message.file.size === 0) {
        // Nothing will arrive for an empty file — complete immediately.
        updateMessage(messageId, { status: 'transferring' });
        finishReceive(messageId, new Blob([], { type: message.file.mimeType }));
        return;
      }
      activeReceive = {
        id: messageId,
        assembler: resumable ?? new ChunkAssembler(message.file),
      };
      const startPct = Math.round((offset / Math.max(1, message.file.size)) * 100);
      set({ transferring: true });
      updateMessage(messageId, { status: 'transferring', progress: startPct }, true);
      if (offset > 0) pushSystemMessage(`Resuming transfer from ${startPct}%`);
    },

    rejectFile(messageId: string) {
      const message = findMessage(messageId);
      if (!message || message.status !== 'pending') return;
      sendFrame({ v: 1, type: 'file-reject', id: messageId });
      updateMessage(messageId, { status: 'rejected' }, true);
    },

    cancelTransfer(messageId: string) {
      const message = findMessage(messageId);
      if (!message) return;
      sendFrame({ v: 1, type: 'file-cancel', id: messageId });

      if (message.direction === 'sent') {
        // The pump notices the flag and finalises the message itself; if the
        // offer was still pending there is no pump, so mark it here.
        cancelledSends.add(messageId);
        if (message.status === 'pending') {
          updateMessage(messageId, { status: 'cancelled' }, true);
          offerNextQueued();
        }
      } else {
        if (activeReceive?.id === messageId) stashPartialReceive();
        set({ transferring: false });
        updateMessage(messageId, { status: 'cancelled' }, true);
      }
    },

    retryFile(messageId: string) {
      const { status, transferring } = get();
      const message = findMessage(messageId);
      const file = outgoingFiles.get(messageId);
      if (!message?.file || !file || status !== 'connected' || transferring) return;
      if (hasActiveOutgoingFile()) return; // one outgoing offer at a time
      cancelledSends.delete(messageId);
      if (!sendFrame({ v: 1, type: 'file-offer', id: messageId, file: message.file })) return;
      updateMessage(messageId, { status: 'pending', progress: 0, error: undefined }, true);
    },

    leave() {
      epoch += 1;
      teardownServices();
      resetTransferState();
      set({
        status: 'idle',
        code: null,
        peer: null,
        error: null,
        isHost: false,
        sessionId: null,
        messages: [],
        transferring: false,
        fileUrls: {},
        verificationCode: null,
      });
    },
  };
});
