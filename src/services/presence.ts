import type { Device } from '@/types';
import type { ServerMessage } from '@/types/signaling';

/**
 * Long-lived WebSocket used for nearby-device discovery: announce this
 * device, receive the same-network peer list, and relay connect invitations.
 * Separate from the per-attempt SignalingClient — this one lives as long as
 * the app tab and quietly reconnects if the server drops.
 */

export interface PresenceHandlers {
  onNearby: (devices: Device[]) => void;
  onInvite: (device: Device, code: string) => void;
}

const RECONNECT_DELAY_MS = 10_000;

export class PresenceClient {
  private ws: WebSocket | null = null;
  private stopped = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly url: string,
    private readonly getDevice: () => Device,
    private readonly handlers: PresenceHandlers,
  ) {}

  start(): void {
    this.open();
  }

  /** Re-announce (e.g. after a device rename). */
  announce(): void {
    this.send({ type: 'announce', device: this.getDevice() });
  }

  invite(targetId: string, code: string): void {
    this.send({ type: 'invite', targetId, code });
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private open(): void {
    if (this.stopped) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => this.announce();
    ws.onmessage = (event) => this.handleMessage(String(event.data));
    ws.onclose = () => {
      this.ws = null;
      if (!this.stopped) {
        this.handlers.onNearby([]);
        this.reconnectTimer = setTimeout(() => this.open(), RECONNECT_DELAY_MS);
      }
    };
    ws.onerror = () => {
      // onclose follows and schedules the reconnect.
    };
  }

  private send(message: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleMessage(raw: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    if (message.type === 'nearby') this.handlers.onNearby(message.devices);
    else if (message.type === 'invite') this.handlers.onInvite(message.device, message.code);
  }
}
