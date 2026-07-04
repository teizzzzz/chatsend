import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android/iOS shell config. Like the Tauri desktop shell, this wraps the
 * built web app (dist/) with zero product logic of its own. The signalling
 * server URL comes from VITE_SIGNALING_URL at build time or the in-app
 * Settings → Server field at runtime.
 */
const config: CapacitorConfig = {
  appId: 'app.chatsend.mobile',
  appName: 'ChatSend',
  webDir: 'dist',
};

export default config;
