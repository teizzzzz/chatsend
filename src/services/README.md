# services/

Connection and transport logic lives here. Empty in Phase 0 by design — the
scaffolding is in place first. Planned modules:

- `signaling.ts` — WebSocket client that talks to the signalling server:
  create/join room, exchange WebRTC offer / answer / ICE candidates.
- `peer.ts` — thin wrapper around `RTCPeerConnection` + `RTCDataChannel`,
  emitting connection-state and message events.
- `transfer.ts` — file chunking, offer/accept flow, progress accounting, and
  reassembly on the receiving side.
- `db.ts` — Dexie (IndexedDB) schema + queries for the local transfer history.

Each module depends only on the types in `src/types` and stays free of React,
so it can be unit-tested in isolation and driven from a Zustand store.
