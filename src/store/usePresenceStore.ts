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
/** Unfiltered list from the server; the store exposes it minus blocked. */
let rawNearby: Device[] = [];

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
    const applyBlocklist = () => {
      const blocked = useAppStore.getState().blockedDevices;
      set((s) => ({
        nearby: rawNearby.filter((d) => !blocked[d.id]),
        // Blocking also dismisses that device's pending invitation.
        invite: s.invite && blocked[s.invite.device.id] ? null : s.invite,
      }));
    };
    client = new PresenceClient(defaultSignalingUrl(), localDevice, {
      onNearby: (devices) => {
        rawNearby = devices;
        applyBlocklist();
      },
      onInvite: (device, code) => {
        // Invitations from blocked devices are dropped silently.
        if (useAppStore.getState().blockedDevices[device.id]) return;
        set({ invite: { device, code } });
      },
    });
    client.start();
    useAppStore.subscribe((state, prev) => {
      // Keep the advertised name current after a rename in Settings.
      if (state.deviceName !== prev.deviceName) client?.announce();
      if (state.blockedDevices !== prev.blockedDevices) applyBlocklist();
    });
  },

  sendInvite(targetId, code) {
    client?.invite(targetId, code);
  },

  clearInvite() {
    set({ invite: null });
  },
}));
