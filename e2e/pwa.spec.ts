import { test, expect } from '@playwright/test';

/**
 * PWA acceptance (req §4: install mode). These tests hit the production
 * server on :3001 (started by the webServer config), which serves the built
 * `dist/` — so `npm run build` must have run first (CI does; see workflow).
 */

const PROD = 'http://localhost:3001';

test('manifest and icons are served with install metadata', async ({ page }) => {
  await page.goto(`${PROD}/`);
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBeTruthy();

  const manifest = await page.evaluate(async (href) => {
    const res = await fetch(href!);
    return { status: res.status, body: await res.json() };
  }, manifestHref);
  expect(manifest.status).toBe(200);
  expect(manifest.body.name).toBe('ChatSend');
  expect(manifest.body.display).toBe('standalone');
  expect(manifest.body.icons.length).toBeGreaterThanOrEqual(3);

  for (const icon of ['/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']) {
    const status = await page.evaluate(
      async (url) => (await fetch(url)).status,
      icon,
    );
    expect(status, icon).toBe(200);
  }
});

test('service worker precaches the shell and the app loads offline', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${PROD}/`);
  // Wait for the SW to install and activate (precache complete).
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Reload so the page is controlled by the worker.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // Cut the network: the shell must come from the SW cache.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Send files like messages')).toBeVisible({
    timeout: 10_000,
  });
  // Client-side routing still works offline (history is local IndexedDB).
  await page.getByText('History').click();
  await expect(page.getByPlaceholder('Search history…')).toBeVisible();

  await context.close();
});
