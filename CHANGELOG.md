# Changelog

All notable changes to ChatSend are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and the project
follows a phase-based roadmap (see the README).

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
