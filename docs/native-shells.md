# Native shells

ChatSend is a web-first app (PWA installable on every platform). Native
shells wrap the **same built frontend** — no product logic lives in the
shell, so web and native can't drift apart.

## Desktop (Tauri v2) — scaffolded in `src-tauri/`

The desktop shell is a thin Tauri window around `dist/`.

### Prerequisites

- Rust (stable) — https://rustup.rs
- Platform build deps: on Linux `libwebkit2gtk-4.1-dev librsvg2-dev
  libayatana-appindicator3-dev`; on macOS Xcode CLT; on Windows the
  WebView2 runtime (preinstalled on Win 11).
- `npm i -D @tauri-apps/cli` (or use `cargo` directly, see below).

### Point the app at your server

A desktop window has no "same origin" server, so configure the signalling
URL one of two ways:

1. Bake it in at build time:
   `VITE_SIGNALING_URL=wss://chatsend.example.com/ws npm run build`
2. Or let users set it at runtime: Settings → **Server** field
   (e.g. `wss://chatsend.example.com/ws`).

### Develop & build

```bash
npx tauri dev              # dev window against the Vite dev server
npx tauri build            # installer/bundle for the current OS
# CI-friendly compile check without bundling:
npm run build && cd src-tauri && cargo build
```

Cross-platform installers are built per-OS (a macOS `.dmg` needs a Mac, a
Windows `.msi` needs Windows) — use a CI matrix (e.g.
`tauri-apps/tauri-action`) for releases.

## Mobile (documented path, not scaffolded)

The PWA already covers the doc's mobile MVP (§4: 手机浏览器 / PWA 安装模式).
When store distribution becomes worth it, the low-risk path is Capacitor:

```bash
npm i -D @capacitor/cli @capacitor/core @capacitor/android @capacitor/ios
npx cap init ChatSend app.chatsend.mobile --web-dir=dist
npx cap add android && npx cap add ios
npm run build && npx cap sync
npx cap open android   # requires Android Studio / SDK
npx cap open ios       # requires Xcode on macOS
```

Same rule as desktop: set the server URL via `VITE_SIGNALING_URL` at build
time or the in-app Settings → Server field. WebRTC works in both WebViews;
iOS still limits background transfers (doc §4 技术边界).

Tauri v2 also supports iOS/Android targets if a single toolchain across
desktop + mobile is preferred later.
