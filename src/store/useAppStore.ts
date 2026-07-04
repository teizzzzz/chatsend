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

  setDeviceName: (name: string) => void;
  setTheme: (theme: ThemeMode) => void;
  setSaveHistory: (on: boolean) => void;
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

      setDeviceName: (name) => set({ deviceName: name.trim() || defaultDeviceName() }),
      setTheme: (theme) => set({ theme }),
      setSaveHistory: (on) => set({ saveHistory: on }),
    }),
    {
      name: 'chatsend.settings',
      version: 1,
    },
  ),
);
