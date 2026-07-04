import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode } from '@/types';
import { createId, detectPlatform } from '@/lib/utils';

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

  setDeviceName: (name: string) => void;
  setTheme: (theme: ThemeMode) => void;
}

/** A friendly default device name so first-run isn't blank. */
function defaultDeviceName(): string {
  const platform = detectPlatform();
  const label =
    platform === 'mobile' ? 'Phone' : platform === 'tablet' ? 'Tablet' : 'Device';
  return `My ${label}`;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      deviceId: createId('dev_'),
      deviceName: defaultDeviceName(),
      theme: 'system',

      setDeviceName: (name) => set({ deviceName: name.trim() || defaultDeviceName() }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'chatsend.settings',
      version: 1,
    },
  ),
);
