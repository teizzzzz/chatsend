import { expect } from '@playwright/test';
import { test, newDevice } from './helpers';

/**
 * Nearby-device discovery: devices connecting from the same network (same
 * client IP bucket on the signalling server) see each other on the home
 * screen; tapping one sends an invitation that pairs them end-to-end.
 */

test('same-network devices discover each other and pair via invite', async ({
  browser,
}) => {
  const { page: pageA } = await newDevice(browser, 'Alpha');
  const { page: pageB } = await newDevice(browser, 'Beta');

  await pageA.goto('/');
  await pageB.goto('/');

  // Presence: each sees the other in "Nearby devices".
  await expect(pageA.getByText('Beta', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByText('Alpha', { exact: true })).toBeVisible({ timeout: 10_000 });

  // A taps Beta → room + invitation; B accepts the banner.
  await pageA.getByText('Beta', { exact: true }).click();
  await expect(pageB.getByText('wants to connect')).toBeVisible({ timeout: 10_000 });
  await pageB.getByRole('button', { name: 'Accept' }).click();

  await pageA.waitForURL('**/chat', { timeout: 15_000 });
  await pageB.waitForURL('**/chat', { timeout: 15_000 });
  await expect(pageA.getByText('Connected', { exact: true })).toBeVisible();
  await expect(pageB.getByText('Connected', { exact: true })).toBeVisible();
});

test('a departed device disappears from the nearby list', async ({ browser }) => {
  const { page: pageA } = await newDevice(browser, 'Alpha');
  const { context: ctxB, page: pageB } = await newDevice(browser, 'Beta');

  await pageA.goto('/');
  await pageB.goto('/');
  await expect(pageA.getByText('Beta', { exact: true })).toBeVisible({ timeout: 10_000 });

  await ctxB.close();
  await expect(pageA.getByText('Beta', { exact: true })).toBeHidden({ timeout: 10_000 });
});
