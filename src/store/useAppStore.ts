import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode } from '@/types';
import { createId, detectFormFactor } from '@/lib/utils';

/**
 * Global app-level settings that must survive reloads: this device's identity
 * and the chosen theme. Persisted to localStorage via Zustand's `persist`
 * middleware. Transient connection state (rooms, peers, messages) will live in
 * a separate store once WebRTC lands, so this store stays small and stable.
 */
interface AppState {
  /** Stable id for this browser/device. */
  deviceId: string;
  /** User-facing device name shown to peers. */
  deviceName: string;
  /** Selected theme mode. */
  theme: ThemeMode;
  /** When off, transfers still work but nothing is written to history. */
  saveHistory: boolean;
  /**
   * Devices this user marked as trusted (req §6.2). File offers from a
   * trusted device are accepted automatically.
   */
  trustedDevices: Record<string, { name: string; trustedAt: number }>;
  /**
   * Custom signalling server URL (e.g. wss://chatsend.example.com/ws).
   * Required in the desktop shell, where the page origin isn't the server;
   * empty means same-origin /ws (the web default).
   */
  serverUrl: string;

  setDeviceName: (name: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setSaveHistory: (on: boolean) => void;
  trustDevice: (id: string, name: string) => void;
  untrustDevice: (id: string) => void;
  setServerUrl: (url: string) => void;
}

/** A friendly default device name so first-run isn't blank. */
function defaultDeviceName(): string {
  const form = detectFormFactor();
  const label =
    form === 'mobile' ? 'Phone' : form === 'tablet' ? 'Tablet' : 'Device';
  return `My ${label}`;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      deviceId: createId('dev_'),
      deviceName: defaultDeviceName(),
      theme: 'system',
      saveHistory: true,
      trustedDevices: {},
      serverUrl: '',

      setDeviceName: (name) => set({ deviceName: name.trim() || defaultDeviceName() }),
      setTheme: (theme) => set({ theme }),
      setSaveHistory: (on) => set({ saveHistory: on }),
      trustDevice: (id, name) =>
        set((s) => ({
          trustedDevices: { ...s.trustedDevices, [id]: { name, trustedAt: Date.now() } },
        })),
      untrustDevice: (id) =>
        set((s) => {
          const rest = { ...s.trustedDevices };
          delete rest[id];
          return { trustedDevices: rest };
        }),
      setServerUrl: (url) => set({ serverUrl: url.trim() }),
    }),
    {
      name: 'chatsend.settings',
      version: 1,
    },
  ),
);
