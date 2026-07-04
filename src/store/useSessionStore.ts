import { create } from 'zustand';
import type { Device, Message } from '@/types';
import { SignalingClient } from '@/services/signaling';
import { PeerSession } from '@/services/peer';
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
  /** Chat timeline. Phase 1 only produces system messages. */
  messages: Message[];

  createRoom: () => Promise<void>;
  joinRoom: (code: string) => Promise<void>;
  /** Tear down any connection/attempt and reset to idle. */
  leave: () => void;
}

let signaling: SignalingClient | null = null;
let peer: PeerSession | null = null;
let epoch = 0;

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
  const pushSystemMessage = (content: string): void => {
    const { sessionId, peer: peerDevice } = get();
    const message: Message = {
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
    };
    set((s) => ({ messages: [...s.messages, message] }));
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
        onMessage: () => {
          // Phase 2: text messages over the DataChannel land here.
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

  const beginAttempt = (isHost: boolean): number => {
    epoch += 1;
    teardownServices();
    set({
      status: 'connecting',
      code: null,
      peer: null,
      error: null,
      isHost,
      sessionId: createId('sess_'),
      messages: [],
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

    leave() {
      epoch += 1;
      teardownServices();
      set({
        status: 'idle',
        code: null,
        peer: null,
        error: null,
        isHost: false,
        sessionId: null,
        messages: [],
      });
    },
  };
});
