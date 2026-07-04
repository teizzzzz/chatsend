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
 * In production it also serves the built frontend from ../dist on the same
 * port, so one process (behind a TLS-terminating reverse proxy) is the whole
 * deployment. In dev, Vite serves the app and proxies /ws here instead.
 *
 * Protocol: JSON messages mirroring src/types/signaling.ts — keep in sync.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 3001;
const ROOM_TTL_MS = 10 * 60 * 1000; // unjoined/idle rooms expire after 10 min
const MAX_MESSAGE_BYTES = 64 * 1024; // signalling blobs are small; drop junk
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

/** @type {Map<string, {host: import('ws').WebSocket, guest: import('ws').WebSocket | null, createdAt: number}>} */
const rooms = new Map();

/**
 * Nearby-device presence: sockets bucketed by client IP. Devices behind the
 * same NAT / on the same LAN share a public IP, so they see each other in
 * the "nearby" list — the browser-compatible stand-in for mDNS discovery.
 * @type {Map<string, Set<import('ws').WebSocket>>}
 */
const presence = new Map();

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function broadcastNearby(ip) {
  const bucket = presence.get(ip);
  if (!bucket) return;
  for (const member of bucket) {
    const devices = [...bucket]
      .filter((other) => other !== member && other.device)
      .map((other) => other.device);
    send(member, { type: 'nearby', devices });
  }
}

function leavePresence(ws) {
  const bucket = presence.get(ws.ip);
  if (!bucket) return;
  bucket.delete(ws);
  if (bucket.size === 0) presence.delete(ws.ip);
  else broadcastNearby(ws.ip);
}

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

    case 'announce': {
      const device = sanitizeDevice(message.device);
      if (!device) return sendError(ws, 'invalid-message', 'Missing device info.');
      ws.device = device;
      let bucket = presence.get(ws.ip);
      if (!bucket) {
        bucket = new Set();
        presence.set(ws.ip, bucket);
      }
      bucket.add(ws);
      broadcastNearby(ws.ip);
      break;
    }

    case 'invite': {
      // Relay a connect invitation to a device on the same network only.
      if (!ws.device) return sendError(ws, 'invalid-message', 'Announce first.');
      const code = String(message.code || '').toUpperCase().trim();
      const targetId = String(message.targetId || '');
      if (!rooms.has(code)) return sendError(ws, 'room-not-found', 'Invite room not found.');
      const bucket = presence.get(ws.ip);
      const target = bucket && [...bucket].find((m) => m.device?.id === targetId);
      if (target) send(target, { type: 'invite', code, device: ws.device });
      break;
    }

    default:
      sendError(ws, 'invalid-message', `Unknown message type: ${String(message.type)}`);
  }
}

// ---------------------------------------------------------------------------
// Static frontend (production). Serves ../dist with an SPA fallback; harmless
// in dev where dist may not exist and Vite serves the app anyway.
// ---------------------------------------------------------------------------

const DIST_DIR =
  process.env.STATIC_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

async function handleHttp(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (pathname.includes('..')) {
    res.writeHead(400).end();
    return;
  }
  // Real asset paths get the asset; everything else (SPA routes like
  // /connect, /history) falls back to index.html.
  const assetPath = extname(pathname)
    ? join(DIST_DIR, pathname)
    : join(DIST_DIR, 'index.html');
  try {
    const body = await readFile(assetPath);
    res.writeHead(200, {
      'content-type': MIME[extname(assetPath)] ?? 'application/octet-stream',
      'cache-control': pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(
      extname(pathname)
        ? 'Not found'
        : 'ChatSend signalling server is running, but no frontend build was found (run `npm run build`).',
    );
  }
}

const server = createServer(handleHttp);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws, req) => {
  ws.ip = clientIp(req);
  ws.on('message', (raw) => handleMessage(ws, raw));
  ws.on('close', () => {
    leaveRoom(ws);
    leavePresence(ws);
  });
  ws.on('error', () => {
    leaveRoom(ws);
    leavePresence(ws);
  });
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

server.listen(PORT, () => {
  console.log(
    `ChatSend server listening on http://localhost:${PORT} (signalling at /ws)`,
  );
});
