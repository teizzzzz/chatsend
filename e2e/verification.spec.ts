import { expect } from '@playwright/test';
import { test, pairDevices } from './helpers';

/**
 * Connection verification (端到端身份确认, req §6.2): both devices derive a
 * six-digit code from the DTLS certificate fingerprints. The codes must be
 * identical — and must change between different pairings.
 */

test('both devices show the same verification code', async ({ browser }) => {
  const { pageA, pageB } = await pairDevices(browser);

  const codeA = pageA.getByTestId('verification-code');
  const codeB = pageB.getByTestId('verification-code');
  await expect(codeA).toBeVisible({ timeout: 10_000 });
  await expect(codeB).toBeVisible({ timeout: 10_000 });

  const a = (await codeA.textContent())!.replace(/\D/g, '');
  const b = (await codeB.textContent())!.replace(/\D/g, '');
  expect(a).toHaveLength(6);
  expect(a).toBe(b);

  // Also announced in the timeline so it lands in history.
  await expect(pageA.getByText(/Verification code \d{3} \d{3}/)).toBeVisible();

  // A fresh pairing (new DTLS certs) produces a different code.
  const second = await pairDevices(browser);
  await expect(second.pageA.getByTestId('verification-code')).toBeVisible({
    timeout: 10_000,
  });
  const a2 = (await second.pageA.getByTestId('verification-code').textContent())!.replace(
    /\D/g,
    '',
  );
  expect(a2).not.toBe(a);
});
