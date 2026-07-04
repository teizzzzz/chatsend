/**
 * ChatSend signalling server.
 *
 * Responsibilities (and nothing more — see requirements §9.1):
 *   - create rooms identified by a 6-character code
 *   - let a second device join a room by code
 *   - relay WebRTC offer / answer / ICE candidates between the two members
 *   - notify each member when the other leaves
 *
 * It never sees file bytes or chat content: once the WebRTC DataChannel is
 * open the clients close their signalling sockets and the room is deleted.
 *
 * Protocol: JSON messages mirroring src/types/signaling.ts — keep in sync.
 */
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 3001;
const ROOM_TTL_MS = 10 * 60 * 1000; // unjoined/idle rooms expire after 10 min
const MAX_MESSAGE_BYTES = 64 * 1024; // signalling blobs are small; drop junk
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** @type {Map<string, {host: import('ws').WebSocket, guest: import('ws').WebSocket | null, createdAt: number}>} */
const rooms = new Map();

function send(ws, message) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function sendError(ws, code, message) {
  send(ws, { type: 'error', code, message });
}

function generateCode() {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i += 1) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  } while (rooms.has(code));
  return code;
}

/** Basic sanitisation of the peer-provided device object before relaying. */
function sanitizeDevice(device) {
  if (!device || typeof device !== 'object') return null;
  const { id, name, platform } = device;
  if (typeof id !== 'string' || typeof name !== 'string') return null;
  return {
    id: id.slice(0, 64),
    name: name.slice(0, 64) || 'Unknown device',
    platform: typeof platform === 'string' ? platform.slice(0, 16) : 'web',
    lastSeenAt: Date.now(),
    trusted: false,
  };
}

/** The other member of the socket's room, if any. */
function peerOf(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room) return null;
  return ws === room.host ? room.guest : room.host;
}

function leaveRoom(ws) {
  const room = rooms.get(ws.roomCode);
  if (!room) return;
  const peer = peerOf(ws);
  rooms.delete(ws.roomCode);
  ws.roomCode = undefined;
  if (peer) {
    peer.roomCode = undefined;
    send(peer, { type: 'peer-left' });
  }
}

function handleMessage(ws, raw) {
  if (typeof raw !== 'string' && !(raw instanceof Buffer)) return;
  const text = raw.toString();
  if (text.length > MAX_MESSAGE_BYTES) return;

  let message;
  try {
    message = JSON.parse(text);
  } catch {
    sendError(ws, 'invalid-message', 'Messages must be JSON.');
    return;
  }

  switch (message.type) {
    case 'create-room': {
      const device = sanitizeDevice(message.device);
      if (!device) return sendError(ws, 'invalid-message', 'Missing device info.');
      leaveRoom(ws); // one room per socket
      const code = generateCode();
      rooms.set(code, { host: ws, guest: null, createdAt: Date.now() });
      ws.roomCode = code;
      ws.device = device;
      send(ws, { type: 'room-created', code });
      break;
    }

    case 'join-room': {
      const device = sanitizeDevice(message.device);
      if (!device) return sendError(ws, 'invalid-message', 'Missing device info.');
      const code = String(message.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) {
        return sendError(ws, 'room-not-found', 'No room with that code. Check the code and try again.');
      }
      if (room.guest) {
        return sendError(ws, 'room-full', 'That room already has two devices.');
      }
      leaveRoom(ws);
      room.guest = ws;
      ws.roomCode = code;
      ws.device = device;
      send(ws, { type: 'room-joined', device: room.host.device });
      send(room.host, { type: 'peer-joined', device });
      break;
    }

    case 'signal': {
      const peer = peerOf(ws);
      if (!peer) return sendError(ws, 'not-in-room', 'Not in a room with a peer.');
      send(peer, { type: 'signal', payload: message.payload });
      break;
    }

    default:
      sendError(ws, 'invalid-message', `Unknown message type: ${String(message.type)}`);
  }
}

const wss = new WebSocketServer({ port: PORT, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('message', (raw) => handleMessage(ws, raw));
  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

// Expire stale rooms so abandoned codes can't be joined forever.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      sendError(room.host, 'room-expired', 'The room expired. Create a new connection.');
      if (room.guest) sendError(room.guest, 'room-expired', 'The room expired. Create a new connection.');
      rooms.delete(code);
    }
  }
}, 60 * 1000);

console.log(`ChatSend signalling server listening on ws://localhost:${PORT}/ws`);
