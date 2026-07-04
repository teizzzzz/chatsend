import { expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { test, pairDevices } from './helpers';

/**
 * Resumable transfer (断点续传): interrupt a large transfer mid-flight, retry
 * the offer, and verify the receiver resumes from its partial copy — proven
 * by a position-dependent payload whose SHA-256 only matches if every byte
 * lands at the right offset.
 */

const SIZE = 120 * 1024 * 1024; // large enough to reliably cancel mid-flight

function expectedHash(): string {
  const chunk = Buffer.alloc(1024 * 1024);
  const hash = createHash('sha256');
  for (let mb = 0; mb < SIZE / chunk.length; mb += 1) {
    for (let i = 0; i < chunk.length; i += 1) chunk[i] = (mb * chunk.length + i) % 251;
    hash.update(chunk);
  }
  return hash.digest('hex');
}

test('interrupted transfer resumes from the partial copy', async ({ browser }) => {
  test.setTimeout(180_000);
  const { pageA, pageB } = await pairDevices(browser);

  // Build the file inside the page (cheap) and drop it on the chat surface.
  const dataTransfer = await pageA.evaluateHandle((size) => {
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i += 1) bytes[i] = i % 251;
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'big.bin', { type: 'application/octet-stream' }));
    return dt;
  }, SIZE);
  await pageA.dispatchEvent('[data-dropzone]', 'drop', { dataTransfer });

  await pageB.getByRole('button', { name: 'Accept' }).click();

  // Cancel on the sender while bytes are in flight.
  const cancelButton = pageA.getByRole('button', { name: 'Cancel' });
  await expect(cancelButton).toBeVisible({ timeout: 15_000 });
  await cancelButton.click();
  await expect(pageA.getByText('Cancelled', { exact: true })).toBeVisible({
    timeout: 15_000,
  });

  // Retry: the receiver accepts again and must resume, not restart.
  await pageA.getByRole('button', { name: 'Retry' }).click();
  await pageB.getByRole('button', { name: 'Accept' }).click();
  await expect(pageA.getByText(/Resuming transfer from \d+%/)).toBeVisible({
    timeout: 15_000,
  });

  await expect(pageB.locator('a[download="big.bin"]')).toBeVisible({ timeout: 120_000 });

  // Byte-perfect reassembly across the resume boundary.
  const gotHash = await pageB.evaluate(async () => {
    const url = document.querySelector('a[download="big.bin"]')!.getAttribute('href')!;
    const buf = await (await fetch(url)).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  });
  expect(gotHash).toBe(expectedHash());
});
