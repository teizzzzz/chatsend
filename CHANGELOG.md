# Changelog

All notable changes to ChatSend are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project
follows a phase-based roadmap (see the README).

## [0.4.0] — Phase 3: File transfer

Files now move peer-to-peer. Verified end-to-end with an automated
two-browser test: a 2 MB file transferred and SHA-256-verified byte-for-byte,
reject propagation with a working retry, and file records persisting to
history across reloads.

### Added

- **File control frames** (`src/types/channel.ts`): `file-offer` /
  `file-accept` / `file-reject` / `file-cancel`, all validated in
  `parseFrame`. File bytes travel as raw binary frames — the channel is
  ordered+reliable and MVP allows one transfer at a time, so chunks need no
  per-frame header.
- **Transfer service** (`src/services/transfer.ts`): 64 KiB chunking with
  `pumpFile` (progress + cancellation callbacks) and `ChunkAssembler`
  (reassembles to a Blob). Pure logic, no React, no channel knowledge.
- **Backpressure** (`src/services/peer.ts`): `sendWithBackpressure` waits on
  `bufferedamountlow` above a 1 MiB high-water mark so large files don't
  balloon memory or stall the channel (req §6.3: UI stays responsive).
- **Store orchestration**: `sendFile` (offer), `acceptFile` / `rejectFile`
  (receiver confirmation, req §5.2), `cancelTransfer` (either side, checked
  between chunks), `retryFile` (re-offers with the same message id; the
  receiver resets the existing bubble instead of duplicating). Received
  files become object URLs (`fileUrls`) for download; empty files complete
  immediately. Status transitions persist to IndexedDB; per-chunk progress
  stays in memory.
- **File bubbles** (ChatPage): file icon, name, size, type badge; Accept /
  Decline buttons for the receiver; live progress bar + percentage with
  Cancel during transfer; Download link on completion; Declined / Cancelled
  / Failed states with Retry for the sender. Paperclip button wired to a
  file picker, disabled while a transfer is active.

## [0.3.0] — Phase 2: Text messages + local history

Paired devices now exchange real text messages over the DataChannel, and
every message is persisted locally. Verified end-to-end with an automated
two-browser test (send/reply both directions, URL linkification, bubble
direction styling, history surviving reload, search, delete, clear-all).

### Added

- **DataChannel frame protocol** (`src/types/channel.ts`): versioned JSON
  frames with a validating `parseFrame` (length-capped); file control/binary
  frames will extend the same union in Phase 3.
- **Persistence layer** (`src/services/db.ts`): Dexie/IndexedDB `messages`
  table (indexed by createdAt/sessionId) with save / delete / clear-all.
  History never leaves the device (req §6.1).
- **`sendText` + receive handling** in the session store: sender and
  receiver both write the message to the timeline and to IndexedDB; the
  sender's message id is reused on the receiving side.
- **Chat bubbles**: sent right (brand), received left, system chips
  centered; per-message copy button (req §5.4/§5.3); URLs auto-linked via
  `src/lib/linkify.tsx`; auto-scroll to the newest message; composer enabled
  while connected.
- **History page on live data**: `dexie-react-hooks` `useLiveQuery` keeps
  the list in sync; search, single-record delete, and confirm-guarded
  clear-all now operate on IndexedDB.
- **Settings**: "Save transfer history" toggle (req §7.5) and a working
  confirm-guarded "Clear all history".

## [0.2.0] — Phase 1: Pairing system

Two devices can now actually connect: create a room, share the 6-character
code, and a direct WebRTC DataChannel is established between the browsers.
Verified end-to-end with an automated two-browser test (pairing, peer names,
disconnect propagation, and the room-not-found error path).

### Added

- **Signalling server** (`server/index.js`): Node.js + `ws`. Creates rooms
  with unambiguous 6-character codes, relays WebRTC offer / answer / ICE
  between the two room members, notifies on peer departure, expires stale
  rooms after 10 minutes. Stores no content. Run with `npm run server`.
- **Wire protocol types** (`src/types/signaling.ts`): shared shape of
  client/server messages and relayed signal payloads.
- **Signalling client** (`src/services/signaling.ts`): WebSocket wrapper with
  explicit handler callbacks and intentional-close semantics.
- **Peer service** (`src/services/peer.ts`): `RTCPeerConnection` +
  `RTCDataChannel` wrapper — offer/answer negotiation, trickle ICE with
  candidate buffering, channel lifecycle events.
- **Session store** (`src/store/useSessionStore.ts`): orchestrates
  signalling + peer into one status machine (`idle → waiting/joining →
  negotiating → connected → disconnected/failed`), holds the message
  timeline, and guards stale async callbacks with an attempt epoch.
- **Vite `/ws` proxy** (dev + preview) so the frontend needs no signalling
  URL configuration; `VITE_SIGNALING_URL` overrides it.

### Changed

- **Types aligned to requirements doc v0.1 §8**: `Device` (platform enum,
  `trusted`, `lastSeenAt`), `Message` (`type` incl. `system`, `direction:
  sent/received`, `progress`, `error`, sender/receiver ids), `FileMeta`
  (`extension`, `chunkSize`, `totalChunks`), `TransferSession`
  (`connectionState`). Added denormalised `Message.peerDeviceName` for
  history display (req §5.5).
- **ConnectPage**: real room creation with live code, join-by-code with
  status line, error messages, retry; auto-navigates to chat on connect.
- **ChatPage**: header shows the real peer name and live connection status;
  timeline renders system messages ("Connected to X", "Connection closed");
  composer visible but disabled until Phase 2.
- **HistoryPage** sample data migrated to the new `Message` shape.

### Notes

- Messaging over the DataChannel is intentionally deferred to Phase 2 — this
  phase is pairing only, per the development plan (§10).

## [0.1.0] — Phase 0: Scaffolding

Initial project skeleton. No networking yet — this phase establishes the
structure, screens, and data model everything else builds on.

### Added

- **Tooling & config**: Vite + React + TypeScript setup, Tailwind CSS with
  class-based dark mode, ESLint, path alias `@/ → src/`, `.gitignore`.
- **Core types** (`src/types/index.ts`): `Device`, `TransferSession`,
  `Message`, `FileMeta`, plus supporting unions (`ConnectionStatus`,
  `MessageStatus`, `Direction`, `ThemeMode`). Single source of truth for the
  data model.
- **Routing** (`src/App.tsx`): flat route table for the five MVP screens with a
  catch-all redirect to home.
- **Screens** (`src/pages/`):
  - `HomePage` — entry points for create / join / history / settings.
  - `ConnectPage` — generate a 6-digit code (create) or enter one (join).
  - `ChatPage` — chat-style transfer UI: header, bubble list (own right /
    peer left), and composer with text/file/send controls (local echo only).
  - `HistoryPage` — searchable list of transfer records with per-row delete
    and clear-all.
  - `SettingsPage` — device name, theme selector, clear-data (stub).
- **UI system** (`src/components/`): `Layout` app shell, plus `Button`,
  `Card`, `Input`, and an inline SVG `icons` set.
- **State** (`src/store/useAppStore.ts`): Zustand store persisting device
  identity and theme to localStorage.
- **Helpers** (`src/lib/`): `utils.ts` (id/code generation, byte & time
  formatting, `cn`) and `useTheme.ts` (applies light/dark/system).
- **Services placeholder** (`src/services/README.md`): documents the planned
  signalling / peer / transfer / db modules kept out of Phase 0 on purpose.
- **Docs**: `README.md` (overview, structure, data model, roadmap) and this
  changelog.

### Notes

- Pairing, messaging, and file transfer are intentionally **stubbed**. Chat and
  history render sample data so the interaction shape is reviewable before the
  transport layer exists.
