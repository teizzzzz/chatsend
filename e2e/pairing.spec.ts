import { expect } from '@playwright/test';
import { test, newDevice, pairDevices, readRoomCode } from './helpers';

/** Phase 1 acceptance: pairing, peer identity, disconnect, error paths. */

test('two devices pair via code and see each other\'s names', async ({ browser }) => {
  const { pageA, pageB } = await pairDevices(browser);

  await expect(pageA.locator('header p').first()).toHaveText('Beta');
  await expect(pageB.locator('header p').first()).toHaveText('Alpha');
  await expect(pageA.getByText('Connected to Beta')).toBeVisible();
  await expect(pageB.getByText('Connected to Alpha')).toBeVisible();
});

test('disconnect propagates to the peer', async ({ browser }) => {
  const { pageA, pageB } = await pairDevices(browser);

  await pageA.getByRole('button', { name: 'Disconnect' }).click();
  await expect(pageB.getByText('Disconnected', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(pageB.getByText('Connection closed')).toBeVisible();
});

test('joining a nonexistent room shows a clear error', async ({ browser }) => {
  const { page } = await newDevice(browser, 'Loner');
  await page.goto('/connect?mode=join');
  await page.getByPlaceholder('ABC123').fill('ZZZZZZ');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText(/No room with that code/)).toBeVisible({ timeout: 10_000 });
});

test('host screen renders the room code before anyone joins', async ({ browser }) => {
  const { page } = await newDevice(browser, 'Host');
  await page.goto('/connect?mode=create');
  const code = await readRoomCode(page);
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  await expect(page.getByText('Waiting for a peer to join…')).toBeVisible();
});
