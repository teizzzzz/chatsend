# ChatSend

> Send files like you send messages.

ChatSend is a cross-platform, peer-to-peer file transfer web app in the spirit
of LocalSend / LANDrop, but with a **chat-first** experience: you pair two
devices with a short code and then exchange text and files in a familiar
message thread. Files travel **directly between devices** over WebRTC — nothing
is uploaded to a server — and history is kept **locally** in the browser.

---

## Status

✅ **v0.2 feature set (Phase 11).** Everything from the MVP — pairing by code
/ QR / nearby list, text messaging, chunked P2P file transfer with
accept/decline + progress + retry, multi-file queue, drag & drop, history
with filters, PWA install mode — plus **resumable transfers**, **trusted
devices with auto-accept**, **same-network device discovery**, and a Tauri
desktop shell. A 19-test Playwright suite runs the whole stack (two browsers
+ real WebRTC) in CI on every push; deployment is one Node process or one
Docker image.

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
npm run test:e2e # Playwright E2E suite (see Testing)
```

The frontend connects to `ws(s)://<origin>/ws` by default (the Vite dev/preview
proxy forwards it to port 3001); set `VITE_SIGNALING_URL` to point elsewhere.

## Testing

The E2E suite (`e2e/`) drives **two real browser contexts** through the whole
stack — Vite, the signalling server, and an actual WebRTC DataChannel between
the pages. It covers pairing, disconnects, error paths, bidirectional text,
history persistence/search/filters, a SHA-256-verified 2 MB file transfer,
decline→retry, the multi-file queue, drag & drop, QR auto-join, and the PWA
(manifest metadata + service-worker offline shell against the production
server — build first: `npm run build`).

It also covers resumable transfers (a 120 MB transfer cancelled mid-flight
resumes from the partial copy), trusted-device auto-accept, and nearby
discovery + invite pairing.

```bash
npx playwright install chromium   # once
npm run test:e2e
```

Playwright starts both dev servers automatically (`webServer` config). To use
a pre-installed Chromium, set `CHROMIUM_PATH=/path/to/chrome`. CI runs the
same suite on every push (`.github/workflows/ci.yml`).

## Deployment

`server/index.js` doubles as a static file server for `dist/`, so production
is a single Node process:

```bash
npm ci && npm run build
node server/index.js          # serves the app + /ws signalling on :3001
```

Or with Docker:

```bash
docker build -t chatsend .
docker run -p 3001:3001 chatsend
```

Two production notes:

- **HTTPS is required.** Browsers only allow WebRTC (and clipboard, etc.) on
  secure origins. Put the process behind a TLS-terminating proxy (Caddy,
  nginx, or any PaaS); WebSocket upgrade for `/ws` must be forwarded.
- **TURN for strict NATs.** Public STUN is the default and works on most
  networks (and always on the same LAN). For peers behind symmetric NAT,
  provide a TURN server at build time:
  `VITE_ICE_SERVERS='[{"urls":"turn:turn.example.com:3478","username":"u","credential":"c"}]' npm run build`

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
│   └── channel.ts        #   DataChannel frames: text + file offer/accept/
│                         #   reject/cancel controls (binary frames = chunks)
├── pages/                # One component per screen (routed)
│   ├── HomePage.tsx      #   create / join / history / settings entry points
│   ├── ConnectPage.tsx   #   create room (show code) or join by code
│   ├── ChatPage.tsx      #   chat-style transfer view (live peer + status)
│   ├── HistoryPage.tsx   #   searchable transfer history
│   └── SettingsPage.tsx  #   device name, theme, clear data
├── components/           # Reusable UI
│   ├── Layout.tsx        #   app shell (header + centered column)
│   ├── FileTypeIcon.tsx  #   category-coloured file icon (chat + history)
│   └── ui/               #   Button, Card, Input, icons
├── store/                # Zustand stores
│   ├── useAppStore.ts    #   device identity + theme (persisted)
│   └── useSessionStore.ts#   live pairing state, orchestrates the services
├── lib/                  # Framework-agnostic helpers
│   ├── utils.ts          #   ids, codes, byte/time formatting, cn()
│   ├── linkify.tsx       #   URL auto-linking for message text
│   ├── fileKind.ts       #   MIME/extension → image/video/document/… category
│   └── useTheme.ts       #   applies light/dark/system to <html>
└── services/             # Connection & transport layer (React-free)
    ├── signaling.ts      #   WebSocket client for the signalling server
    ├── peer.ts           #   RTCPeerConnection + DataChannel wrapper
    │                     #   (incl. backpressure-aware binary send)
    ├── transfer.ts       #   file chunking / reassembly (64 KiB chunks)
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
- [x] **Phase 3** — Chunked file transfer: offer → accept/decline, live
      progress both sides, cancel, retry, download on completion.
- [x] **Phase 4** — History filters (direction / image / video / document /
      failed), device filter, file-type icons, status badges.
- [x] **Phase 5** — Polish: drag & drop, multi-file queue, QR-code join
      (scan → auto-join link), mobile viewport/safe-area fit, clearer errors.
- [x] **Phase 6** — Engineering: in-repo Playwright E2E suite, GitHub Actions
      CI, single-process production server (static + /ws), Dockerfile,
      configurable ICE/TURN servers.
- [x] **Phase 7** — PWA install mode (req §4): manifest + icons (incl.
      maskable), auto-updating service worker precaching the app shell,
      verified offline load in E2E.
- [x] **Phase 8** — Resumable transfers (断点续传): interrupted transfers
      retry from the receiver's partial copy, SHA-256-verified across the
      resume boundary.
- [x] **Phase 9** — Trusted devices (req §6.2): auto-accept from trusted
      peers, persisted, managed in Settings.
- [x] **Phase 10** — Nearby-device discovery: same-network devices appear on
      the home screen; one tap sends an invitation and pairs.
- [x] **Phase 11** — Desktop shell (Tauri v2, `src-tauri/`) + configurable
      server URL in Settings; mobile store path documented
      (see `docs/native-shells.md`).

### Later candidates

Folder transfer, PIN verification, device blocklist, calendar-view history,
store-distributed mobile builds.

See [CHANGELOG.md](./CHANGELOG.md) for what shipped in each phase.
