import { expect } from '@playwright/test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { test, pairDevices } from './helpers';

/**
 * Folder transfer (req P2): a picked directory is zipped on the sender with
 * its structure preserved and arrives as one downloadable archive.
 */

test('a folder is packed and arrives with structure intact', async ({ browser }) => {
  const { pageA, pageB } = await pairDevices(browser);

  // Real directory tree on disk, uploaded via the webkitdirectory input.
  const root = mkdtempSync(join(tmpdir(), 'chatsend-'));
  const dir = join(root, 'photos');
  mkdirSync(join(dir, 'sub'), { recursive: true });
  writeFileSync(join(dir, 'readme.txt'), 'top level file');
  writeFileSync(join(dir, 'sub', 'nested.txt'), 'nested file content');

  await pageA.locator('input[webkitdirectory]').setInputFiles(dir);

  // Offer arrives as photos.zip; receiver accepts and downloads.
  await expect(pageB.getByText('photos.zip')).toBeVisible({ timeout: 15_000 });
  await pageB.getByRole('button', { name: 'Accept' }).click();
  await expect(pageB.locator('a[download="photos.zip"]')).toBeVisible({ timeout: 15_000 });

  // Pull the archive bytes out of the receiving page and unzip in Node.
  const bytes = await pageB.evaluate(async () => {
    const url = document.querySelector('a[download="photos.zip"]')!.getAttribute('href')!;
    const buf = await (await fetch(url)).arrayBuffer();
    return [...new Uint8Array(buf)];
  });
  const entries = unzipSync(Uint8Array.from(bytes));

  expect(strFromU8(entries['photos/readme.txt'])).toBe('top level file');
  expect(strFromU8(entries['photos/sub/nested.txt'])).toBe('nested file content');
});
