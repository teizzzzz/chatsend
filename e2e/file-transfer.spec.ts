import { expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { test, pairDevices } from './helpers';

/** Phase 3 acceptance: chunked transfer, confirmation, retry, integrity. */

test('a 2 MB file arrives byte-for-byte intact', async ({ browser }) => {
  const { pageA, pageB } = await pairDevices(browser);

  const payload = Buffer.alloc(2 * 1024 * 1024);
  for (let i = 0; i < payload.length; i += 4) {
    payload.writeUInt32LE((i * 2654435761) >>> 0, i);
  }
  const wantHash = createHash('sha256').update(payload).digest('hex');

  await pageA.locator('input[type=file]').setInputFiles({
    name: 'photos.zip',
    mimeType: 'application/zip',
    buffer: payload,
  });

  await expect(pageB.getByText('photos.zip')).toBeVisible({ timeout: 10_000 });
  await expect(pageB.getByText('2.0 MB')).toBeVisible();
  await pageB.getByRole('button', { name: 'Accept' }).click();

  await expect(pageB.locator('a[download="photos.zip"]')).toBeVisible({ timeout: 30_000 });
  await expect(pageA.getByText('Sent ✓')).toBeVisible({ timeout: 30_000 });

  const gotHash = await pageB.evaluate(async (sel) => {
    const url = document.querySelector(sel)!.getAttribute('href')!;
    const buf = await (await fetch(url)).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }, 'a[download="photos.zip"]');
  expect(gotHash).toBe(wantHash);
});

test('declined offer can be retried and then completes', async ({ browser }) => {
  const { pageA, pageB } = await pairDevices(browser);

  await pageA.locator('input[type=file]').setInputFiles({
    name: 'notes.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('pdf-bytes-'.repeat(1000)),
  });

  await pageB.getByRole('button', { name: 'Decline' }).click();
  await expect(pageA.getByText('Declined by peer')).toBeVisible({ timeout: 10_000 });
  await expect(pageA.getByText('Peer declined the file')).toBeVisible(); // system chip

  await pageA.getByRole('button', { name: 'Retry' }).click();
  await pageB.getByRole('button', { name: 'Accept' }).click();
  await expect(pageB.locator('a[download="notes.pdf"]')).toBeVisible({ timeout: 15_000 });

  // Both records land in history on the receiver.
  await pageB.goto('/history');
  await expect(pageB.getByText('notes.pdf')).toBeVisible({ timeout: 10_000 });
});
