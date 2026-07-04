import { create } from 'zustand';
import type { Device, Message } from '@/types';
import { parseFrame, type ChannelFrame } from '@/types/channel';
import { SignalingClient } from '@/services/signaling';
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
  /** Object URLs for received files, by message id. Session-lifetime only. */
  fileUrls: Record<string, string>;

  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  /** Send a text message over the DataChannel. False if not connected. */
  sendText: (content: string) => boolean;
  /** Offer a file to the peer. Bytes flow only after they accept. */
  sendFile: (file: File) => void;
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

function signalingUrl(): string {
  const fromEnv = import.meta.env.VITE_SIGNALING_URL as string | undefined;
  if (fromEnv) return fromEnv;
  // Default: same origin under /ws (Vite dev/preview proxy handles this).
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
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
    const url = URL.createObjectURL(blob);
    set((s) => ({ fileUrls: { ...s.fileUrls, [id]: url }, transferring: false }));
    updateMessage(id, { status: 'completed', progress: 100, completedAt: Date.now() }, true);
  };

  /** Sender pump: reads the file chunk by chunk with backpressure. */
  const runSend = async (id: string, file: File, myEpoch: number): Promise<void> => {
    const result = await pumpFile(
      file,
      (chunk) => (peer ? peer.sendWithBackpressure(chunk) : Promise.resolve(false)),
      (sentBytes) => {
        if (epoch !== myEpoch) return;
        const pct = Math.round((sentBytes / Math.max(1, file.size)) * 100);
        if (findMessage(id)?.progress !== pct) updateMessage(id, { progress: pct });
      },
      () => cancelledSends.has(id) || epoch !== myEpoch,
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
        break;
      }

      case 'file-accept': {
        const file = outgoingFiles.get(frame.id);
        if (!file || get().transferring) break;
        cancelledSends.delete(frame.id);
        set({ transferring: true });
        updateMessage(frame.id, { status: 'transferring', progress: 0 }, true);
        void runSend(frame.id, file, myEpoch);
        break;
      }

      case 'file-reject': {
        if (!outgoingFiles.has(frame.id)) break;
        updateMessage(frame.id, { status: 'rejected' }, true);
        pushSystemMessage('Peer declined the file');
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
        // Receiver side: drop the partial transfer.
        if (activeReceive?.id === frame.id) {
          activeReceive = null;
          set({ transferring: false });
        }
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
        },
        onClose: () => {
          if (epoch !== myEpoch) return;
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
              error: wasConnected ? null : 'Could not establish a peer connection.',
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

  const openSignaling = (myEpoch: number): Promise<void> => {
    signaling = new SignalingClient({
      onRoomCreated: (code) => {
        if (epoch === myEpoch) set({ code, status: 'waiting' });
      },
      onRoomJoined: (hostDevice) => {
        if (epoch !== myEpoch) return;
        set({ peer: hostDevice, status: 'negotiating' });
        startPeer(false, myEpoch);
      },
      onPeerJoined: (guestDevice) => {
        if (epoch !== myEpoch) return;
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
    return signaling.connect(signalingUrl());
  };

  /** Release everything tied to the previous session's transfers. */
  const resetTransferState = (): void => {
    outgoingFiles.clear();
    cancelledSends.clear();
    activeReceive = null;
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

    sendFile(file: File) {
      const { status, transferring, sessionId, peer: peerDevice } = get();
      if (status !== 'connected' || transferring || !peer) return;

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
    },

    acceptFile(messageId: string) {
      const message = findMessage(messageId);
      if (!message?.file || message.status !== 'pending' || get().transferring) return;
      if (!sendFrame({ v: 1, type: 'file-accept', id: messageId })) return;

      if (message.file.size === 0) {
        // Nothing will arrive for an empty file — complete immediately.
        updateMessage(messageId, { status: 'transferring' });
        finishReceive(messageId, new Blob([], { type: message.file.mimeType }));
        return;
      }
      activeReceive = { id: messageId, assembler: new ChunkAssembler(message.file) };
      set({ transferring: true });
      updateMessage(messageId, { status: 'transferring' }, true);
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
        }
      } else {
        if (activeReceive?.id === messageId) activeReceive = null;
        set({ transferring: false });
        updateMessage(messageId, { status: 'cancelled' }, true);
      }
    },

    retryFile(messageId: string) {
      const { status, transferring } = get();
      const message = findMessage(messageId);
      const file = outgoingFiles.get(messageId);
      if (!message?.file || !file || status !== 'connected' || transferring) return;
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
      });
    },
  };
});
