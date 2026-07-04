import { create } from 'zustand';
import type { Device } from '@/types';
import { PresenceClient } from '@/services/presence';
import { defaultSignalingUrl } from '@/services/signaling';
import { useAppStore } from '@/store/useAppStore';

/**
 * Nearby-device discovery state. `init()` is idempotent and called once from
 * the app root; the underlying PresenceClient outlives page navigation and
 * reconnects on server drops.
 */

interface PresenceState {
  /** Same-network devices currently online (excluding this one). */
  nearby: Device[];
  /** A pending connect invitation from a nearby device. */
  invite: { device: Device; code: string } | null;

  init: () => void;
  sendInvite: (targetId: string, code: string) => void;
  clearInvite: () => void;
}

let client: PresenceClient | null = null;

function localDevice(): Device {
  const { deviceId, deviceName } = useAppStore.getState();
  return {
    id: deviceId,
    name: deviceName,
    platform: 'web',
    lastSeenAt: Date.now(),
    trusted: false,
  };
}

export const usePresenceStore = create<PresenceState>((set) => ({
  nearby: [],
  invite: null,

  init() {
    if (client) return;
    client = new PresenceClient(defaultSignalingUrl(), localDevice, {
      onNearby: (devices) => set({ nearby: devices }),
      onInvite: (device, code) => set({ invite: { device, code } }),
    });
    client.start();
    // Keep the advertised name current after a rename in Settings.
    useAppStore.subscribe((state, prev) => {
      if (state.deviceName !== prev.deviceName) client?.announce();
    });
  },

  sendInvite(targetId, code) {
    client?.invite(targetId, code);
  },

  clearInvite() {
    set({ invite: null });
  },
}));
