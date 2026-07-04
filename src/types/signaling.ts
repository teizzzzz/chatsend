import type { Device } from './index';

/**
 * Wire protocol between the browser and the signalling server, and the shape
 * of the WebRTC payloads relayed through it. The server (server/index.js)
 * implements the same message set — keep the two in sync when editing.
 *
 * The signalling server only ever *relays* offer/answer/ICE blobs between the
 * two members of a room; it never inspects or stores them.
 */

/** WebRTC negotiation payloads relayed verbatim between peers. */
export type SignalPayload =
  | { kind: 'offer'; data: RTCSessionDescriptionInit }
  | { kind: 'answer'; data: RTCSessionDescriptionInit }
  | { kind: 'ice'; data: RTCIceCandidateInit };

/** Messages the browser sends to the server. */
export type ClientMessage =
  | { type: 'create-room'; device: Device }
  | { type: 'join-room'; code: string; device: Device }
  | { type: 'signal'; payload: SignalPayload };

/** Machine-readable error identifiers the server can return. */
export type SignalingErrorCode =
  | 'room-not-found'
  | 'room-full'
  | 'room-expired'
  | 'not-in-room'
  | 'invalid-message';

/** Messages the server sends to the browser. */
export type ServerMessage =
  | { type: 'room-created'; code: string }
  /** Sent to the guest on successful join; `device` is the host. */
  | { type: 'room-joined'; device: Device }
  /** Sent to the host when a guest joins; `device` is the guest. */
  | { type: 'peer-joined'; device: Device }
  | { type: 'signal'; payload: SignalPayload }
  | { type: 'peer-left' }
  | { type: 'error'; code: SignalingErrorCode; message: string };
