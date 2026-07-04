import { expect } from '@playwright/test';
import { test, newDevice } from './helpers';

/**
 * Device blocklist (req §6.2 第二阶段): blocking hides a device from the
 * nearby list, silently drops its invitations, and is revocable in Settings.
 */

test('blocking a device hides it, drops its invites, and can be undone', async ({
  browser,
}) => {
  const { page: pageA } = await newDevice(browser, 'Alpha');
  const { page: pageB } = await newDevice(browser, 'Beta');

  await pageA.goto('/');
  await pageB.goto('/');
  await expect(pageB.getByText('Alpha', { exact: true })).toBeVisible({ timeout: 10_000 });

  // Alpha invites Beta; Beta blocks from the banner.
  await pageA.getByText('Beta', { exact: true }).click();
  await expect(pageB.getByText('wants to connect')).toBeVisible({ timeout: 10_000 });
  await pageB.getByRole('button', { name: 'Block' }).click();
  await expect(pageB.getByText('wants to connect')).toBeHidden();

  // Alpha vanishes from Beta's nearby list.
  await pageB.goto('/');
  await expect(pageB.getByText('Alpha', { exact: true })).toBeHidden({ timeout: 10_000 });

  // A second invitation from Alpha never reaches Beta.
  await pageA.goto('/');
  await expect(pageA.getByText('Beta', { exact: true })).toBeVisible({ timeout: 10_000 });
  await pageA.getByText('Beta', { exact: true }).click();
  await pageA.waitForURL('**/connect**');
  await pageB.waitForTimeout(2000);
  await expect(pageB.getByText('wants to connect')).toBeHidden();

  // Unblock in Settings restores discovery.
  await pageB.goto('/settings');
  await expect(pageB.getByText('Alpha', { exact: true })).toBeVisible();
  await pageB.getByRole('button', { name: 'Unblock' }).click();
  await expect(pageB.getByText('No blocked devices.')).toBeVisible();
  await pageB.goto('/');
  await expect(pageB.getByText('Alpha', { exact: true })).toBeVisible({ timeout: 10_000 });
});
