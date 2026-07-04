/**
 * Core domain types for ChatSend.
 *
 * These types are intentionally transport-agnostic: they describe *what* the
 * app moves around (devices, sessions, messages, files) without knowing *how*
 * (WebSocket signalling, WebRTC DataChannel). Services and UI layers both
 * depend on these, so they live in one place and are the single source of
 * truth for the data model.
 */

/** A participant in a transfer — either this browser or the remote peer. */
export interface Device {
  /** Stable per-browser id, persisted in local storage. */
  id: string;
  /** Human-readable name shown in the UI (e.g. "Alex's MacBook"). */
  name: string;
  /** Best-effort platform hint for the device icon. */
  platform?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  /** Last time we saw activity from this device (epoch ms). */
  lastSeen?: number;
}

/** Lifecycle of a peer connection. */
export type ConnectionStatus =
  | 'idle' // nothing happening yet
  | 'creating' // creating a room, waiting for a code
  | 'waiting' // room created, waiting for the other side to join
  | 'joining' // entered a code, negotiating
  | 'connecting' // signalling exchanged, establishing DataChannel
  | 'connected' // DataChannel open, ready to transfer
  | 'disconnected' // peer left or channel closed
  | 'error'; // negotiation or transport failed

/**
 * One pairing between two devices. A session is created when a room is made or
 * joined and lasts until the peers disconnect. Messages belong to a session.
 */
export interface TransferSession {
  /** Local session id. */
  id: string;
  /** 6-character connection code used to pair. */
  code: string;
  /** Current connection state. */
  status: ConnectionStatus;
  /** The remote device, once identified. */
  peer?: Device;
  /** Whether this device created the room (true) or joined it (false). */
  isHost: boolean;
  /** When the session started (epoch ms). */
  createdAt: number;
}

/** Which way a message/file travelled relative to this device. */
export type Direction = 'incoming' | 'outgoing';

/** Kind of message rendered in the chat view. */
export type MessageKind = 'text' | 'file';

/** Delivery / transfer state used for status ticks and progress UI. */
export type MessageStatus =
  | 'pending' // queued locally, not yet sent
  | 'offered' // file offer sent, awaiting accept/reject
  | 'accepted' // peer accepted the file, transfer may start
  | 'rejected' // peer declined the file
  | 'sending' // bytes in flight
  | 'sent' // fully sent (sender side)
  | 'receiving' // bytes arriving
  | 'received' // fully received (receiver side)
  | 'failed'; // transfer aborted / errored

/** Metadata describing a file, independent of its bytes. */
export interface FileMeta {
  /** Local id for this file within a message. */
  id: string;
  /** Original file name. */
  name: string;
  /** Size in bytes. */
  size: number;
  /** MIME type, if known. */
  mimeType: string;
  /** Total number of chunks the file is split into during transfer. */
  totalChunks?: number;
  /** Chunks transferred so far, for progress display. */
  receivedChunks?: number;
}

/**
 * A single item in the chat timeline. Text messages carry `text`; file
 * messages carry `file` and progress-related fields. Persisted to IndexedDB
 * as the transfer history record.
 */
export interface Message {
  /** Unique message id. */
  id: string;
  /** Session this message belongs to. */
  sessionId: string;
  /** text or file. */
  kind: MessageKind;
  /** incoming or outgoing. */
  direction: Direction;
  /** Delivery / transfer status. */
  status: MessageStatus;
  /** Text body (present when kind === 'text'). */
  text?: string;
  /** File metadata (present when kind === 'file'). */
  file?: FileMeta;
  /** Transfer progress 0–100 (file messages). */
  progress?: number;
  /** Name of the device on the other end, denormalised for history display. */
  peerName?: string;
  /** When the message was created (epoch ms). */
  createdAt: number;
}

/** UI theme options exposed in Settings. */
export type ThemeMode = 'light' | 'dark' | 'system';
