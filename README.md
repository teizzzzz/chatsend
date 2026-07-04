# ChatSend

> Send files like you send messages.

ChatSend is a cross-platform, peer-to-peer file transfer web app in the spirit
of LocalSend / LANDrop, but with a **chat-first** experience: you pair two
devices with a short code and then exchange text and files in a familiar
message thread. Files travel **directly between devices** over WebRTC — nothing
is uploaded to a server — and history is kept **locally** in the browser.

---

## Status

🚧 **Phase 2 — Text messaging works.** Paired devices exchange text messages
over the WebRTC DataChannel (URLs auto-link, messages are copyable), and every
message is persisted to IndexedDB — the history page survives reloads with
search, delete, and clear-all. File transfer is next (Phase 3).

## Tech stack

| Concern            | Choice                          |
| ------------------ | ------------------------------- |
| Framework          | React + TypeScript              |
| Build tool         | Vite                            |
| Styling            | Tailwind CSS (class dark mode)  |
| State              | Zustand (persisted settings)    |
| Local database     | IndexedDB via Dexie.js          |
| Signalling         | Node.js + `ws` WebSocket server |
| Transport          | WebRTC DataChannel              |

## Getting started

Two processes in dev — the web app and the signalling server:

```bash
npm install
npm run server   # signalling server on ws://localhost:3001/ws
npm run dev      # Vite dev server on http://localhost:5173 (proxies /ws)
```

Open http://localhost:5173 in two browser windows: *Create connection* in one,
*Join connection* + the code in the other.

Other scripts:

```bash
npm run build    # type-check + production build
npm run preview  # preview the production build
npm run lint     # lint
npm run typecheck
```

The frontend connects to `ws(s)://<origin>/ws` by default (the Vite dev/preview
proxy forwards it to port 3001); set `VITE_SIGNALING_URL` to point elsewhere.

## Project structure

```
server/
└── index.js              # WebSocket signalling server (rooms + relay only)
src/
├── main.tsx              # React entry, mounts the router
├── App.tsx               # Route table + theme application
├── index.css             # Tailwind layers + base styles
├── types/                # Core domain types (single source of truth)
│   ├── index.ts          #   Device, TransferSession, Message, FileMeta …
│   ├── signaling.ts      #   client<->server wire protocol + signal payloads
│   └── channel.ts        #   DataChannel frame protocol (text now, files next)
├── pages/                # One component per screen (routed)
│   ├── HomePage.tsx      #   create / join / history / settings entry points
│   ├── ConnectPage.tsx   #   create room (show code) or join by code
│   ├── ChatPage.tsx      #   chat-style transfer view (live peer + status)
│   ├── HistoryPage.tsx   #   searchable transfer history
│   └── SettingsPage.tsx  #   device name, theme, clear data
├── components/           # Reusable UI
│   ├── Layout.tsx        #   app shell (header + centered column)
│   └── ui/               #   Button, Card, Input, icons
├── store/                # Zustand stores
│   ├── useAppStore.ts    #   device identity + theme (persisted)
│   └── useSessionStore.ts#   live pairing state, orchestrates the services
├── lib/                  # Framework-agnostic helpers
│   ├── utils.ts          #   ids, codes, byte/time formatting, cn()
│   ├── linkify.tsx       #   URL auto-linking for message text
│   └── useTheme.ts       #   applies light/dark/system to <html>
└── services/             # Connection & transport layer (React-free)
    ├── signaling.ts      #   WebSocket client for the signalling server
    ├── peer.ts           #   RTCPeerConnection + DataChannel wrapper
    └── db.ts             #   Dexie/IndexedDB schema + history queries
```

### Design principles

- **Types first.** Everything the app moves around is described in
  `src/types`. UI and services both depend on it, so the data model can't drift.
- **Layered.** UI (pages/components) never talks to the network directly.
  Transport lives in `services/`, exposed to React through stores.
- **Small, readable files.** No mega-components; each file has one job.

## Data model

The four core entities (defined in `src/types/index.ts`):

- **`Device`** — a participant (this browser or the remote peer): id, name,
  platform.
- **`TransferSession`** — one pairing between two devices, with a connection
  code and lifecycle status.
- **`Message`** — a chat-timeline item, `text` or `file`, with direction and
  transfer status. Persisted as the history record.
- **`FileMeta`** — a file's metadata (name, size, type, chunk counts) separate
  from its bytes.

## Roadmap

- [x] **Phase 0** — Project scaffolding, routes, screens, UI system, types.
- [x] **Phase 1** — Pairing: signalling server, room create/join by code,
      WebRTC DataChannel establishment, live connection status.
- [x] **Phase 2** — Text messages over the DataChannel (linkified, copyable) +
      IndexedDB history with search / delete / clear and a save-history toggle.
- [ ] **Phase 3** — Chunked file transfer with accept/reject + progress.
- [ ] **Phase 4** — History page backed by real data: search, filter, delete.
- [ ] **Phase 5** — Polish: drag & drop, multi-file queue, mobile fit & finish.

See [CHANGELOG.md](./CHANGELOG.md) for what shipped in each phase.
