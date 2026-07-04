/**
 * Core domain types for ChatSend.
 *
 * This file mirrors the data model in the requirements doc (v0.1 §8) and is
 * the single source of truth: UI, stores, and services all import from here.
 * Types are transport-agnostic — they describe *what* the app moves around
 * (devices, sessions, messages, files), not *how* (WebSocket / WebRTC).
 */

/** Platforms a device can report. Web builds always report 'web'. */
export type Platform = 'web' | 'windows' | 'macos' | 'linux' | 'android' | 'ios';

/** A participant in a transfer — this browser or the remote peer. */
export interface Device {
  /** Stable per-browser id, persisted locally. */
  id: string;
  /** Human-readable name shown in the UI (e.g. "Alex's MacBook"). */
  name: string;
  platform: Platform;
  /** Last time we saw activity from this device (epoch ms). */
  lastSeenAt: number;
  /** Trusted devices can skip confirmations (second phase feature). */
  trusted: boolean;
}

/** WebRTC-level lifecycle of a pairing. */
export type ConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

/**
 * One pairing between two devices, created when a room is made or joined and
 * lasting until the peers disconnect. Messages belong to a session.
 */
export interface TransferSession {
  id: string;
  peerDevice: Device;
  connectionState: ConnectionState;
  createdAt: number;
  updatedAt: number;
}

/** Kind of message rendered in the chat timeline. */
export type MessageType = 'text' | 'file' | 'system';

/** Which way a message travelled relative to this device. */
export type Direction = 'sent' | 'received';

/** Delivery / transfer state used for status labels and progress UI. */
export type MessageStatus =
  | 'pending' // created locally / offer awaiting peer confirmation
  | 'accepted' // peer accepted a file offer
  | 'transferring' // bytes in flight
  | 'completed' // fully delivered
  | 'rejected' // peer declined the file
  | 'failed' // transfer errored
  | 'cancelled'; // sender or receiver aborted

/** Metadata describing a file, independent of its bytes. */
export interface FileMeta {
  name: string;
  /** Size in bytes. */
  size: number;
  mimeType: string;
  /** File extension without the dot, e.g. "pdf". */
  extension: string;
  /** Chunk size in bytes used for DataChannel transfer. */
  chunkSize: number;
  totalChunks: number;
}

/**
 * A single item in the chat timeline and the unit stored as transfer history.
 * Text messages carry `content`; file messages carry `file`; system messages
 * (connection events, rejections…) carry `content` and are rendered centered.
 */
export interface Message {
  id: string;
  sessionId: string;
  type: MessageType;
  direction: Direction;
  senderDeviceId: string;
  receiverDeviceId: string;
  /** Text body (text/system messages). */
  content?: string;
  /** File metadata (file messages). */
  file?: FileMeta;
  status: MessageStatus;
  /** Transfer progress 0–100. Non-file messages jump straight to 100. */
  progress: number;
  createdAt: number;
  completedAt?: number;
  /** Human-readable failure reason when status is 'failed'. */
  error?: string;
  /**
   * Peer device name, denormalised onto the record so the history page can
   * show "对方设备名称" (req §5.5) without a devices lookup table in MVP.
   */
  peerDeviceName?: string;
}

/** UI theme options exposed in Settings. */
export type ThemeMode = 'light' | 'dark' | 'system';
