import { expect, test } from '@playwright/test';

/**
 * The "Bhim Radio is live" strip on the landing page.
 *
 * Written because the strip looked missing in the browser and reading the
 * component could not settle it: everything that decides whether it paints -
 * the signed-in check, the pinned stack it shares with the milestone bar, the
 * slide-down animation's fill mode - only resolves in a real render. A unit
 * test with a mocked DOM would have agreed with the code and still been wrong.
 */

const STRIP = '.radio-live-strip';

// The opening splash and the language chooser cover the whole viewport on a
// first visit, so a click aimed at the strip lands on the modal instead. The
// app already has a way past them, and using it keeps these tests about the
// strip rather than about the intro.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('skip-splash', '1'));
});

test.describe('radio live strip', () => {
  test('a signed-out visitor sees it, with a way into the player', async ({ page }) => {
    await page.goto('/');

    const strip = page.locator(STRIP);
    await expect(strip).toBeVisible();

    // Visible is not enough: a zero-height or transparent strip is "visible"
    // to Playwright and invisible to a person.
    const box = await strip.boundingBox();
    expect(box.height).toBeGreaterThan(24);
    expect(box.width).toBeGreaterThan(200);

    await expect(strip.getByRole('button', { name: /listen now|अभी सुनिए/i })).toBeVisible();
  });

  test('it takes the visitor straight to the station, with no login in between',
    async ({ page }) => {
      // The radio is a standalone page: nobody needs an account to hear it,
      // and a visitor sent to a login form to reach a thing described as
      // "live now" is a visitor who leaves.
      await page.goto('/');
      await page.locator(STRIP).getByRole('button', { name: /listen now|अभी सुनिए/i }).click();

      await expect(page).toHaveURL(/\/bhimradio/);
      // No login handshake left behind either: a stale auth_redirect would
      // send them to the radio again after some later, unrelated sign-in.
      const intended = await page.evaluate(() => sessionStorage.getItem('auth_redirect'));
      expect(intended).toBeNull();
    });
  test('it is not shown to someone already signed in', async ({ page }) => {
    // Signed in, the navbar already carries the radio, and the strip would
    // push the whole landing page down 48px to say what it says.
    await page.addInitScript(() => {
      sessionStorage.setItem('user', JSON.stringify({ id: 'u1', username: 'tester' }));
    });
    await page.goto('/');

    await expect(page.locator(STRIP)).toHaveCount(0);
  });
});
