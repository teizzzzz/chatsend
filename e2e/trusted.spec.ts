import { test, expect } from '@playwright/test';
import { pairDevices } from './helpers';

/**
 * Trusted devices (req §6.2): files from a trusted peer are auto-accepted;
 * trust persists across sessions and can be revoked from Settings.
 */

test('trusted peer files auto-accept; untrust restores confirmation', async ({
  browser,
}) => {
  const { pageA, pageB } = await pairDevices(browser);

  // B trusts Alpha from the chat header.
  await pageB.getByRole('button', { name: 'Trust', exact: true }).click();
  await expect(pageB.getByRole('button', { name: 'Trusted ✓' })).toBeVisible();

  // A sends a file — B must download it with no Accept click.
  await pageA.locator('input[type=file]').setInputFiles({
    name: 'auto.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('pdf'.repeat(10_000)),
  });
  await expect(pageB.getByText('Auto-accepted from trusted device')).toBeVisible({
    timeout: 10_000,
  });
  await expect(pageB.locator('a[download="auto.pdf"]')).toBeVisible({ timeout: 15_000 });

  // Trust survives the session: disconnect, check Settings, revoke.
  await pageB.getByRole('button', { name: 'Disconnect' }).click();
  await pageB.goto('/settings');
  await expect(pageB.getByText('Alpha', { exact: true })).toBeVisible();
  await pageB.getByRole('button', { name: 'Remove' }).click();
  await expect(pageB.getByText('No trusted devices yet.')).toBeVisible();
});

test('multi-file queue auto-accepts sequentially from a trusted peer', async ({
  browser,
}) => {
  const { pageA, pageB } = await pairDevices(browser);
  await pageB.getByRole('button', { name: 'Trust', exact: true }).click();

  await pageA.locator('input[type=file]').setInputFiles([
    { name: 'a1.png', mimeType: 'image/png', buffer: Buffer.from('x'.repeat(30_000)) },
    { name: 'a2.png', mimeType: 'image/png', buffer: Buffer.from('y'.repeat(30_000)) },
  ]);

  // Both arrive without any Accept clicks.
  await expect(pageB.locator('a[download="a1.png"]')).toBeVisible({ timeout: 15_000 });
  await expect(pageB.locator('a[download="a2.png"]')).toBeVisible({ timeout: 15_000 });
});
