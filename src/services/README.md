# services/

Connection and transport logic. React-free by design: each module depends only
on `src/types` and is driven from Zustand stores, so it can be tested in
isolation.

Current modules:

- `signaling.ts` — WebSocket client for the signalling server
  (`server/index.js`): create/join room, relay WebRTC offer / answer / ICE
  candidates. Wire protocol types live in `src/types/signaling.ts`.
- `peer.ts` — wrapper around `RTCPeerConnection` + `RTCDataChannel`:
  offer/answer negotiation, trickle ICE with pre-remote-description
  buffering, channel lifecycle events, `send()`.

Planned modules:

- `transfer.ts` — file chunking, offer/accept flow, progress accounting, and
  reassembly on the receiving side (Phase 3).
- `db.ts` — Dexie (IndexedDB) schema + queries for the local transfer history
  (Phase 2/4).
