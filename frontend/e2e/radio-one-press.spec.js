import { expect, test } from '@playwright/test';

/**
 * One press of "Listen now" (the ON AIR bar) or "Listen right here" (the
 * landing page's radio card) starts the sound. Before, the bar only opened
 * the station and a press made before the day's bulletin had loaded did
 * nothing, so listeners were left looking for a second Play button.
 */
// The radio's audio is a detached new Audio(); record every one made.
const playing = (page) => page.evaluate(() => (window.__audios || []).some((a) => !a.paused && a.currentTime > 0));
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('skip-splash', '1');
    const A = window.Audio;
    window.__audios = [];
    window.Audio = function (...args) { const a = new A(...args); window.__audios.push(a); return a; };
    window.Audio.prototype = A.prototype;
  });
});
test('strip Listen now starts the radio', async ({ page }) => {
  await page.goto('/');
  await page.locator('.radio-live-strip').getByRole('button', { name: /listen now|अभी सुनिए/i }).click();
  await expect(page).toHaveURL(/\/bhimradio/);
  await expect.poll(() => playing(page), { timeout: 15000 }).toBe(true);
});
test('a click before the station has loaded still starts it', async ({ page }) => {
  await page.route('**/latest.json', async (r) => { await new Promise((x) => setTimeout(x, 2500)); await r.continue(); });
  await page.goto('/');
  await page.locator('.radio-live-strip').getByRole('button', { name: /listen now|अभी सुनिए/i }).click();
  await expect.poll(() => playing(page), { timeout: 20000 }).toBe(true);
});
test('beacon Listen here starts it on the landing page', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.mouse.move(700, 500); await page.mouse.wheel(0, 1400);
  const btn = page.getByRole('button', { name: /listen right here|यहीं सुनिए/i });
  await btn.click({ timeout: 15000 });
  await expect.poll(() => playing(page), { timeout: 15000 }).toBe(true);
  await expect(page).toHaveURL(/\/$/);
});
test('on a phone the strip only opens the station, it does not start the sound', async ({ page }) => {
  // People tapped it by mistake while scrolling and could not find how to stop it.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.radio-live-strip').getByRole('button', { name: /listen now|अभी सुनिए/i }).click();
  await expect(page).toHaveURL(/\/bhimradio/);
  await page.waitForTimeout(3000);
  expect(await playing(page)).toBe(false);
});
test('while the radio plays, the same strip button stops it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.mouse.move(700, 500); await page.mouse.wheel(0, 1400);
  await page.getByRole('button', { name: /listen right here|यहीं सुनिए/i }).click({ timeout: 15000 });
  await expect.poll(() => playing(page), { timeout: 15000 }).toBe(true);
  const stop = page.locator('.radio-live-strip').getByRole('button', { name: /stop radio|रेडियो रोकें/i });
  await stop.click();
  await expect.poll(() => playing(page), { timeout: 5000 }).toBe(false);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.radio-live-strip').getByRole('button', { name: /listen now|अभी सुनिए/i })).toBeVisible();
});
