import type { Device } from '@/types';
import type {
  ClientMessage,
  ServerMessage,
  SignalPayload,
  SignalingErrorCode,
} from '@/types/signaling';
import { useAppStore } from '@/store/useAppStore';

/**
 * Thin WebSocket client for the signalling server (server/index.js).
 *
 * React-free by design: callers provide callbacks and drive it from a store.
 * One instance handles one room lifecycle; create a fresh instance per
 * connection attempt rather than reusing.
 */

export interface SignalingHandlers {
  onRoomCreated: (code: string) => void;
  /** Fired on the guest after a successful join; `device` is the host. */
  onRoomJoined: (device: Device) => void;
  /** Fired on the host when a guest joins; `device` is the guest. */
  onPeerJoined: (device: Device) => void;
  onSignal: (payload: SignalPayload) => void;
  onPeerLeft: () => void;
  onError: (code: SignalingErrorCode, message: string) => void;
  /** Fired when the socket drops unexpectedly (not after close()). */
  onClose: () => void;
}

/**
 * Server URL resolution, most specific first:
 *  1. user-configured server (Settings — required in the desktop shell,
 *     where the page origin isn't the server)
 *  2. VITE_SIGNALING_URL baked in at build time
 *  3. same origin under /ws (the web default; Vite proxies this in dev)
 */
export function defaultSignalingUrl(): string {
  const fromSettings = useAppStore.getState().serverUrl;
  if (fromSettings) return fromSettings;
  const fromEnv = import.meta.env.VITE_SIGNALING_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws`;
}

export class SignalingClient {
  private ws: WebSocket | null = null;
  private closedByUs = false;

  constructor(private readonly handlers: SignalingHandlers) {}

  /** Open the socket. Resolves once connected, rejects if it can't. */
  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let opened = false;
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        opened = true;
        resolve();
      };
      ws.onerror = () => {
        if (!opened) reject(new Error('Could not reach the signalling server.'));
      };
      ws.onclose = () => {
        if (!opened) reject(new Error('Signalling connection closed before opening.'));
        else if (!this.closedByUs) this.handlers.onClose();
      };
      ws.onmessage = (event) => this.handleMessage(String(event.data));
    });
  }

  createRoom(device: Device): void {
    this.send({ type: 'create-room', device });
  }

  joinRoom(code: string, device: Device): void {
    this.send({ type: 'join-room', code, device });
  }

  sendSignal(payload: SignalPayload): void {
    this.send({ type: 'signal', payload });
  }

  /** Intentional shutdown — suppresses the onClose handler. */
  close(): void {
    this.closedByUs = true;
    this.ws?.close();
    this.ws = null;
  }

  private send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(raw: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return; // ignore malformed frames
    }

    const h = this.handlers;
    switch (message.type) {
      case 'room-created':
        h.onRoomCreated(message.code);
        break;
      case 'room-joined':
        h.onRoomJoined(message.device);
        break;
      case 'peer-joined':
        h.onPeerJoined(message.device);
        break;
      case 'signal':
        h.onSignal(message.payload);
        break;
      case 'peer-left':
        h.onPeerLeft();
        break;
      case 'error':
        h.onError(message.code, message.message);
        break;
    }
  }
}
