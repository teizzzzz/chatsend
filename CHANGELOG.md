# Changelog

All notable changes to ChatSend are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project
follows a phase-based roadmap (see the README).

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
