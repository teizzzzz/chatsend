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
Windows `.exe`/`.msi` needs Windows). The **Release builds** workflow
(`.github/workflows/release.yml`) does this automatically on every `v*` tag:
its matrix produces the Windows NSIS setup `.exe` + `.msi`, macOS `.dmg`,
and Linux `.deb`/`.AppImage` as downloadable artifacts.

## Android (Capacitor) — scaffolded in `android/`

The Capacitor Android project is committed (`capacitor.config.ts` +
`android/`). Two ways to get an APK:

### CI (no local setup)

Push a tag (`git tag v0.10.0 && git push --tags`) or run the
**Release builds** workflow manually — the `android` job builds
`app-debug.apk` on a GitHub runner and uploads it as an artifact. The debug
APK is signed with the auto-generated debug key and installs directly on any
device that allows unknown sources.

### Locally (Android Studio / SDK required)

```bash
npm run build && npx cap sync android
npx cap open android        # then Build ▸ Build APK(s) in Android Studio
# or headless:
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

For a **Play Store release**: generate a keystore
(`keytool -genkey -v -keystore chatsend.keystore …`), configure
`signingConfigs` in `android/app/build.gradle`, and run
`./gradlew assembleRelease` (or `bundleRelease` for an .aab).

Same rule as desktop: set the server URL via `VITE_SIGNALING_URL` at build
time (CI reads the `CHATSEND_SERVER_URL` repo variable) or the in-app
Settings → Server field. WebRTC works in the Android WebView; iOS (add via
`npx cap add ios`, requires Xcode) still limits background transfers
(doc §4 技术边界).
