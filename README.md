# ChatSend

> Send files like you send messages.

ChatSend is a cross-platform, peer-to-peer file transfer web app in the spirit
of LocalSend / LANDrop, but with a **chat-first** experience: you pair two
devices with a short code and then exchange text and files in a familiar
message thread. Files travel **directly between devices** over WebRTC — nothing
is uploaded to a server — and history is kept **locally** in the browser.

---

## Status

🚧 **Phase 0 — Scaffolding.** The full app structure, routes, screens, UI
system, and data model are in place. Real pairing and transfer are stubbed and
land in later phases (see the roadmap).

## Tech stack

| Concern            | Choice                          |
| ------------------ | ------------------------------- |
| Framework          | React + TypeScript              |
| Build tool         | Vite                            |
| Styling            | Tailwind CSS (class dark mode)  |
| State              | Zustand (persisted settings)    |
| Local database     | IndexedDB via Dexie.js *(later)*|
| Signalling         | WebSocket server *(later)*      |
| Transport          | WebRTC DataChannel *(later)*    |

## Getting started

```bash
npm install
npm run dev      # start Vite dev server on http://localhost:5173
npm run build    # type-check + production build
npm run preview  # preview the production build
npm run lint     # lint
npm run typecheck
```

## Project structure

```
src/
├── main.tsx              # React entry, mounts the router
├── App.tsx               # Route table + theme application
├── index.css            # Tailwind layers + base styles
├── types/               # Core domain types (single source of truth)
│   └── index.ts         #   Device, TransferSession, Message, FileMeta …
├── pages/               # One component per screen (routed)
│   ├── HomePage.tsx     #   create / join / history / settings entry points
│   ├── ConnectPage.tsx  #   generate or enter a 6-digit connection code
│   ├── ChatPage.tsx     #   chat-style transfer view (bubbles + composer)
│   ├── HistoryPage.tsx  #   searchable transfer history
│   └── SettingsPage.tsx #   device name, theme, clear data
├── components/          # Reusable UI
│   ├── Layout.tsx       #   app shell (header + centered column)
│   └── ui/              #   Button, Card, Input, icons
├── store/               # Zustand stores
│   └── useAppStore.ts   #   device identity + theme (persisted)
├── lib/                 # Framework-agnostic helpers
│   ├── utils.ts         #   ids, codes, byte/time formatting, cn()
│   └── useTheme.ts      #   applies light/dark/system to <html>
└── services/            # Connection & transport layer (empty in Phase 0)
    └── README.md        #   planned signaling / peer / transfer / db modules
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
- [ ] **Phase 1** — Local IndexedDB (Dexie) history + real settings wiring.
- [ ] **Phase 2** — WebSocket signalling server + room create/join.
- [ ] **Phase 3** — WebRTC DataChannel + text messaging over the wire.
- [ ] **Phase 4** — Chunked file transfer with accept/reject + progress.

See [CHANGELOG.md](./CHANGELOG.md) for what shipped in each phase.
