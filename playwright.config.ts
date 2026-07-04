import { defineConfig } from '@playwright/test';

/**
 * E2E test setup. Every test drives two real browser contexts through the
 * full stack: Vite dev server + signalling server + WebRTC between the pages.
 *
 * Locally, set CHROMIUM_PATH to reuse a pre-installed Chromium instead of
 * downloading one (e.g. CHROMIUM_PATH=/opt/pw-browsers/.../chrome).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  // Tests share one signalling server; run serially for deterministic rooms.
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: {
      args: ['--no-sandbox'],
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : {}),
    },
  },
  webServer: [
    {
      command: 'node server/index.js',
      port: 3001,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite --port 5173',
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
