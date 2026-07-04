import { test, expect } from '@playwright/test';
import { pairDevices } from './helpers';

/** Phase 2 acceptance: text over the DataChannel + IndexedDB history. */

test('text flows both directions and URLs are linkified', async ({ browser }) => {
  const { pageA, pageB } = await pairDevices(browser);

  await pageA
    .getByPlaceholder('Type a message…')
    .fill('Final PDF here: https://example.com/report.pdf please check');
  await pageA.getByRole('button', { name: 'Send' }).click();
  await expect(pageB.getByText('please check')).toBeVisible({ timeout: 10_000 });
  await expect(pageB.locator('a', { hasText: 'example.com' })).toHaveAttribute(
    'href',
    'https://example.com/report.pdf',
  );

  await pageB.getByPlaceholder('Type a message…').fill('Got it, thanks!');
  await pageB.getByPlaceholder('Type a message…').press('Enter');
  await expect(pageA.getByText('Got it, thanks!')).toBeVisible({ timeout: 10_000 });

  // Own message styled as outgoing on the sender, incoming on the receiver.
  await expect(
    pageA.locator('div:has(> p)', { hasText: 'please check' }).last(),
  ).toHaveClass(/bg-brand-600/);
  await expect(
    pageB.locator('div:has(> p)', { hasText: 'please check' }).last(),
  ).not.toHaveClass(/bg-brand-600/);
});

test('history persists across reload with search, delete, clear', async ({ browser }) => {
  const { pageA, pageB } = await pairDevices(browser);

  await pageA.getByPlaceholder('Type a message…').fill('alpha says hello');
  await pageA.getByPlaceholder('Type a message…').press('Enter');
  await pageB.getByPlaceholder('Type a message…').fill('beta replies thanks');
  await pageB.getByPlaceholder('Type a message…').press('Enter');
  await expect(pageA.getByText('beta replies thanks')).toBeVisible({ timeout: 10_000 });

  // Survives reload (IndexedDB, not memory).
  await pageB.goto('/history');
  await pageB.reload();
  await expect(pageB.getByText('alpha says hello')).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByText('beta replies thanks')).toBeVisible();

  // Search narrows.
  await pageB.getByPlaceholder('Search history…').fill('replies');
  await expect(pageB.getByText('beta replies thanks')).toBeVisible();
  await expect(pageB.getByText('alpha says hello')).toBeHidden();

  // Single delete.
  await pageB.getByPlaceholder('Search history…').fill('');
  const before = await pageB.getByLabel('Delete record').count();
  await pageB.getByLabel('Delete record').first().click();
  await expect(pageB.getByLabel('Delete record')).toHaveCount(before - 1);

  // Clear all (confirm-guarded).
  pageB.once('dialog', (d) => void d.accept());
  await pageB.getByRole('button', { name: 'Clear' }).click();
  await expect(pageB.getByText('No history yet.')).toBeVisible({ timeout: 10_000 });
});
