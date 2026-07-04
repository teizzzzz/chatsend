import { expect } from '@playwright/test';
import { test, pairDevices } from './helpers';

/**
 * Calendar-view history (第二阶段: 日历视图): today's records appear on
 * today's cell; selecting a day filters the list, deselecting restores it.
 */

test('calendar view groups records by day and filters on selection', async ({
  browser,
}) => {
  const { pageA, pageB } = await pairDevices(browser);

  await pageA.getByPlaceholder('Type a message…').fill('calendar test message');
  await pageA.getByPlaceholder('Type a message…').press('Enter');
  await expect(pageB.getByText('calendar test message')).toBeVisible({ timeout: 10_000 });

  await pageA.goto('/history');
  await expect(pageA.getByText('calendar test message')).toBeVisible({ timeout: 10_000 });

  // Switch to calendar: today's cell carries a record count.
  await pageA.getByRole('button', { name: 'calendar' }).click();
  // Local-timezone key, matching the app's dayKeyOf.
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayCell = pageA.locator(`button[aria-label^="Day ${todayKey},"]`);
  await expect(todayCell).toBeVisible();

  // Selecting today keeps today's records visible.
  await todayCell.click();
  await expect(pageA.getByText('calendar test message')).toBeVisible();

  // Selecting an empty day filters everything out.
  const emptyCell = pageA
    .locator('button[aria-label^="Day "]')
    .filter({ hasNot: pageA.locator('span') })
    .first();
  await emptyCell.click();
  await expect(pageA.getByText('calendar test message')).toBeHidden();
  await expect(pageA.getByText('No matching records.')).toBeVisible();

  // Deselecting restores the full list.
  await emptyCell.click();
  await expect(pageA.getByText('calendar test message')).toBeVisible();
});
