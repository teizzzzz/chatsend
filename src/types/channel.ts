import type { FileMeta } from './index';

/**
 * Application-level protocol on top of the WebRTC DataChannel.
 *
 * Control frames are JSON strings; file bytes travel as raw binary frames.
 * The channel is ordered and reliable, and only one file transfer is active
 * at a time (MVP), so binary frames unambiguously belong to the transfer
 * that was last accepted — no per-chunk header needed.
 *
 * File handshake: offer → (accept | reject) → binary chunks → receiver
 * completes when it has `file.size` bytes. Either side may send cancel.
 * Every JSON frame carries `v` so the protocol can evolve without breaking
 * older peers.
 */

/** A plain chat message. */
export interface TextFrame {
  v: 1;
  type: 'text';
  /** Sender-generated message id, reused on the receiving side. */
  id: string;
  content: string;
  sentAt: number;
}

/** Sender proposes a file; receiver must accept before bytes flow. */
export interface FileOfferFrame {
  v: 1;
  type: 'file-offer';
  id: string;
  file: FileMeta;
}

export interface FileAcceptFrame {
  v: 1;
  type: 'file-accept';
  id: string;
}

export interface FileRejectFrame {
  v: 1;
  type: 'file-reject';
  id: string;
}

/** Either side aborts a pending or in-flight transfer. */
export interface FileCancelFrame {
  v: 1;
  type: 'file-cancel';
  id: string;
}

export type ChannelFrame =
  | TextFrame
  | FileOfferFrame
  | FileAcceptFrame
  | FileRejectFrame
  | FileCancelFrame;

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 64;
}

function parseFileMeta(value: unknown): FileMeta | null {
  if (typeof value !== 'object' || value === null) return null;
  const meta = value as Partial<FileMeta>;
  if (typeof meta.name !== 'string' || meta.name.length === 0) return null;
  if (typeof meta.size !== 'number' || !Number.isFinite(meta.size) || meta.size < 0) return null;
  return {
    name: meta.name.slice(0, 255),
    size: Math.floor(meta.size),
    mimeType:
      typeof meta.mimeType === 'string' && meta.mimeType
        ? meta.mimeType.slice(0, 128)
        : 'application/octet-stream',
    extension: typeof meta.extension === 'string' ? meta.extension.slice(0, 16) : '',
    chunkSize: typeof meta.chunkSize === 'number' ? meta.chunkSize : 0,
    totalChunks: typeof meta.totalChunks === 'number' ? meta.totalChunks : 0,
  };
}

/** Parse an incoming string frame; returns null for anything malformed. */
export function parseFrame(raw: string): ChannelFrame | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const frame = data as { v?: unknown; type?: unknown; id?: unknown } & Record<string, unknown>;
  if (frame.v !== 1) return null;

  switch (frame.type) {
    case 'text': {
      if (typeof frame.content !== 'string') return null;
      return {
        v: 1,
        type: 'text',
        id: isValidId(frame.id) ? frame.id : '',
        // Cap pathological frames; real text messages are far smaller.
        content: frame.content.slice(0, 65_536),
        sentAt: typeof frame.sentAt === 'number' ? frame.sentAt : Date.now(),
      };
    }
    case 'file-offer': {
      if (!isValidId(frame.id)) return null;
      const file = parseFileMeta(frame.file);
      if (!file) return null;
      return { v: 1, type: 'file-offer', id: frame.id, file };
    }
    case 'file-accept':
    case 'file-reject':
    case 'file-cancel': {
      if (!isValidId(frame.id)) return null;
      return { v: 1, type: frame.type, id: frame.id };
    }
    default:
      return null;
  }
}
