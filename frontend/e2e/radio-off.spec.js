import { expect, test } from '@playwright/test';

/**
 * Bhim Radio is switched off (RADIO_ENABLED in src/data/features.js) until
 * there are enough users: no link, no strip, no floating card, and its address
 * goes home. Delete this file when the radio comes back.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('skip-splash', '1'));
});

test('the radio is nowhere on the site, and its address goes home', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('navigation').first()).toBeVisible();
  await expect(page.getByText(/^(bhim radio|भीम रेडियो)$/i)).toHaveCount(0);
  await expect(page.locator('.radio-live-strip')).toHaveCount(0);
  await page.mouse.wheel(0, 1600);
  await page.waitForTimeout(800);
  await expect(page.getByRole('button', { name: /listen right here|यहीं सुनिए/i })).toHaveCount(0);

  await page.goto('/bhimradio');
  await expect(page).toHaveURL(/\/$/);
});
