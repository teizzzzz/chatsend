import type { Browser, BrowserContext, Page, ViewportSize } from '@playwright/test';
import { test as base, expect } from '@playwright/test';

/**
 * Contexts made via newDevice are closed after each test — the browser is
 * shared per worker, and a leaked context would keep announcing itself to
 * the presence system and pollute later tests' "nearby" lists.
 */
const createdContexts: BrowserContext[] = [];

export const test = base.extend<{ _deviceCleanup: void }>({
  _deviceCleanup: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixture signature
    async ({}, use) => {
      await use(undefined);
      while (createdContexts.length > 0) {
        await createdContexts.pop()!.close();
      }
    },
    { auto: true },
  ],
});

/**
 * Shared plumbing for the two-browser E2E tests: seed device settings into
 * localStorage (Zustand persist format) and pair two fresh contexts through
 * the real signalling + WebRTC stack.
 */

export function deviceSettings(deviceName: string): string {
  return JSON.stringify({
    state: {
      deviceId: `dev_${deviceName}`,
      deviceName,
      theme: 'light',
      saveHistory: true,
    },
    version: 1,
  });
}

export async function newDevice(
  browser: Browser,
  name: string,
  viewport?: ViewportSize,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(viewport ? { viewport } : {});
  createdContexts.push(context);
  // Seed device identity on first load only — later navigations must keep
  // whatever the app persisted (e.g. trusted devices).
  await context.addInitScript((v: string) => {
    if (!localStorage.getItem('chatsend.settings')) {
      localStorage.setItem('chatsend.settings', v);
    }
  }, deviceSettings(name));
  const page = await context.newPage();
  return { context, page };
}

export interface PairedSession {
  pageA: Page; // host ("Alpha")
  pageB: Page; // guest ("Beta")
  code: string;
}

/** Read the 6-character room code off the host's connect screen. */
export async function readRoomCode(pageA: Page): Promise<string> {
  const codeEl = pageA.locator('p.font-mono').first();
  await expect(codeEl).toHaveText(/^[A-Z2-9]{6}$/, { timeout: 10_000 });
  return (await codeEl.textContent())!.trim();
}

/** Pair two fresh devices and land both on /chat, connected. */
export async function pairDevices(
  browser: Browser,
  options: { viewportB?: ViewportSize } = {},
): Promise<PairedSession> {
  const { page: pageA } = await newDevice(browser, 'Alpha');
  const { page: pageB } = await newDevice(browser, 'Beta', options.viewportB);

  await pageA.goto('/connect?mode=create');
  const code = await readRoomCode(pageA);

  await pageB.goto('/connect?mode=join');
  await pageB.getByPlaceholder('ABC123').fill(code);
  await pageB.getByRole('button', { name: 'Connect' }).click();

  await pageA.waitForURL('**/chat', { timeout: 15_000 });
  await pageB.waitForURL('**/chat', { timeout: 15_000 });
  await expect(pageA.getByText('Connected', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(pageB.getByText('Connected', { exact: true })).toBeVisible({ timeout: 15_000 });

  return { pageA, pageB, code };
}
