/**
 * Application-level protocol on top of the WebRTC DataChannel.
 *
 * Text frames are JSON strings; file chunks (Phase 3) will travel as binary
 * frames alongside JSON control frames (offer / accept / reject / done), all
 * added to this union. Every JSON frame carries `v` so the protocol can
 * evolve without breaking older peers.
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

export type ChannelFrame = TextFrame;

/** Parse an incoming string frame; returns null for anything malformed. */
export function parseFrame(raw: string): ChannelFrame | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const frame = data as Partial<TextFrame>;
  if (frame.v !== 1) return null;
  if (frame.type === 'text' && typeof frame.content === 'string') {
    return {
      v: 1,
      type: 'text',
      id: typeof frame.id === 'string' ? frame.id.slice(0, 64) : '',
      // Cap pathological frames; real text messages are far smaller.
      content: frame.content.slice(0, 65_536),
      sentAt: typeof frame.sentAt === 'number' ? frame.sentAt : Date.now(),
    };
  }
  return null;
}
