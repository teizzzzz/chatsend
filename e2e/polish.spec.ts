import { expect } from '@playwright/test';
import { test, newDevice, pairDevices, readRoomCode } from './helpers';

/** Phase 4/5 acceptance: history filters, QR join, queue, drag & drop. */

test('QR code renders and its link auto-joins the room', async ({ browser }) => {
  const { page: pageA } = await newDevice(browser, 'Alpha');
  await pageA.goto('/connect?mode=create');
  const code = await readRoomCode(pageA);
  await expect(pageA.locator('img[alt="QR code to join"]')).toBeVisible({ timeout: 5000 });

  // Simulate scanning: open the encoded URL on a phone-sized device.
  const { page: pageB } = await newDevice(browser, 'Beta', { width: 375, height: 667 });
  await pageB.goto(`/connect?mode=join&code=${code}`);
  await pageA.waitForURL('**/chat', { timeout: 15_000 });
  await pageB.waitForURL('**/chat', { timeout: 15_000 });
  await expect(pageB.getByText('Connected', { exact: true })).toBeVisible();
});

test('multi-file selection queues offers one at a time', async ({ browser }) => {
  const { pageA, pageB } = await pairDevices(browser);

  await pageA.locator('input[type=file]').setInputFiles([
    { name: 'q1.png', mimeType: 'image/png', buffer: Buffer.from('img'.repeat(20_000)) },
    { name: 'q2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('pdf'.repeat(20_000)) },
    { name: 'q3.zip', mimeType: 'application/zip', buffer: Buffer.from('zip'.repeat(20_000)) },
  ]);

  for (const name of ['q1.png', 'q2.pdf', 'q3.zip']) {
    await expect(pageB.getByRole('button', { name: 'Accept' })).toBeVisible({
      timeout: 10_000,
    });
    // Serialised queue: never more than one live offer.
    await expect(pageB.getByRole('button', { name: 'Accept' })).toHaveCount(1);
    await expect(pageB.getByText(name)).toBeVisible();
    await pageB.getByRole('button', { name: 'Accept' }).click();
    await expect(pageB.locator(`a[download="${name}"]`)).toBeVisible({ timeout: 15_000 });
  }
});

test('dropping a file on the chat surface sends it', async ({ browser }) => {
  const { pageA, pageB } = await pairDevices(browser);

  const dataTransfer = await pageA.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['dropped-file-bytes'], 'dropped.txt', { type: 'text/plain' }));
    return dt;
  });
  await pageA.dispatchEvent('[data-dropzone]', 'drop', { dataTransfer });

  await expect(pageB.getByText('dropped.txt')).toBeVisible({ timeout: 10_000 });
  await pageB.getByRole('button', { name: 'Accept' }).click();
  await expect(pageB.locator('a[download="dropped.txt"]')).toBeVisible({ timeout: 15_000 });
});

test('history filter chips and device filter work', async ({ browser }) => {
  const { pageA, pageB } = await pairDevices(browser);

  // Build a mixed history: image accepted, archive declined.
  await pageA.locator('input[type=file]').setInputFiles({
    name: 'sunset.png',
    mimeType: 'image/png',
    buffer: Buffer.from('img'.repeat(10_000)),
  });
  await pageB.getByRole('button', { name: 'Accept' }).click();
  await expect(pageB.locator('a[download="sunset.png"]')).toBeVisible({ timeout: 15_000 });

  await pageA.locator('input[type=file]').setInputFiles({
    name: 'backup.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('zip'.repeat(10_000)),
  });
  await pageB.getByRole('button', { name: 'Decline' }).click();
  await expect(pageA.getByText('Declined by peer')).toBeVisible({ timeout: 10_000 });

  await pageA.goto('/history');
  await expect(pageA.getByText('sunset.png')).toBeVisible({ timeout: 10_000 });
  const chip = (label: string) => pageA.locator('button', { hasText: label }).first();

  await chip('Images').click();
  await expect(pageA.getByText('sunset.png')).toBeVisible();
  await expect(pageA.getByText('backup.zip')).toBeHidden();

  await chip('Failed').click();
  await expect(pageA.getByText('backup.zip')).toBeVisible();
  await expect(pageA.getByText('sunset.png')).toBeHidden();
  await expect(pageA.getByText('Declined', { exact: true })).toBeVisible(); // status badge

  await chip('Sent').click();
  await expect(pageA.getByText('sunset.png')).toBeVisible();

  await pageA.getByLabel('Filter by device').selectOption('Beta');
  await expect(pageA.getByText('sunset.png')).toBeVisible();
});
