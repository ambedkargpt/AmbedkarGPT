import { expect, test } from '@playwright/test';

/**
 * The radio page as a physical set, and the walk-through controls on it.
 *
 * No backend: the route only asks whether a user is in session storage, and
 * the bulletin is static files the dev server hands over. That is enough to
 * answer the two things worth asking - does the set render, and do the
 * demonstration controls appear for exactly one account.
 */

const DEMO_EMAIL = 'krishprakash1232@gmail.com';

async function signedInAs(page, email) {
  // The axios client sends anyone who gets a 401 on a protected page to
  // /login, so the one call this page makes has to be answered. With no
  // backend running it would 401, and the test would be looking at a login
  // form rather than at the radio.
  await page.route('**/questions/pending', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify({ party: false, position: false }) }));

  await page.addInitScript((e) => {
    sessionStorage.setItem('skip-splash', '1');
    sessionStorage.setItem('ambedkargpt_questionnaire_prompted', '1');
    sessionStorage.setItem('user', JSON.stringify({
      id: 'e2e-user', username: 'e2e', email: e,
      political_party: 'Indian National Congress (INC)',
    }));
  }, email);
}

test.describe('the broadcast desk', () => {
  test('shows what is on air, the running order, and the transcript', async ({ page }) => {
    await signedInAs(page, 'someone.else@example.com');
    await page.goto('/bhimradio');
    await expect(page).toHaveURL(/\/bhimradio/);

    await expect(page.getByText(/now on air|अभी ऑन एयर/i).first()).toBeVisible();
    await expect(page.getByRole('heading', { level: 2 })).not.toBeEmpty();

    // The running order is the rest of the bulletin, and it must not be
    // clickable: a station has no "skip to".
    const order = page.locator('ol li');
    expect(await order.count()).toBeGreaterThan(1);
    await expect(order.first().getByRole('button')).toHaveCount(0);

    // The transcript is the narration the manifest carries, not a summary
    // written beside it, so it has to have words in it.
    await expect(page.getByText(/transcript|पाठ/i).first()).toBeVisible();
  });

  test('offers tune in and nothing that pauses the broadcast', async ({ page }) => {
    await signedInAs(page, 'someone.else@example.com');
    await page.goto('/bhimradio');

    await expect(page.getByRole('button', { name: /play bhim radio|भीम रेडियो प्ले/i })).toBeVisible();
    // No transport for an ordinary listener - that was the whole point of the
    // brief, and the demo account is the one exception.
    await expect(page.getByRole('button', { name: /^(previous|next) track$/i })).toHaveCount(0);
  });

  test('the clock keeps moving for someone who never tuned in', async ({ page }) => {
    await signedInAs(page, 'someone.else@example.com');
    await page.goto('/bhimradio');

    // The status line's countdown, which carries the time with the label. The
    // v2 desk's "up next" pill also says अगली ख़बर, as a label on its own.
    const countdown = page.getByText(/(next story in|अगली ख़बर).*\d+:\d{2}/i).first();
    const first = await countdown.textContent();
    await page.waitForTimeout(2400);
    expect(await countdown.textContent()).not.toBe(first);
  });

  test('the demo account still gets its transport', async ({ page }) => {
    await signedInAs(page, DEMO_EMAIL);
    await page.goto('/bhimradio');

    await page.getByRole('button', { name: /walk-through|पूरी सैर/i }).click();
    await expect(page.getByRole('button', { name: /play|चलाएँ/i }).first()).toBeVisible();
    await expect(page.getByRole('slider', { name: /seek|आगे-पीछे/i })).toBeVisible();
  });

  test('and nobody else does', async ({ page }) => {
    await signedInAs(page, 'someone.else@example.com');
    await page.goto('/bhimradio');

    await expect(page.getByText(/now on air|अभी ऑन एयर/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /walk-through|पूरी सैर/i })).toHaveCount(0);
    // The controls themselves, not just the button that opens them. The panel
    // can be open from the start (the local-demo flag does that), and then the
    // toggle reads "hide" - so checking only for the "walk-through" label
    // passed while the seek slider was on screen for everyone.
    await expect(page.getByRole('slider', { name: /seek|आगे-पीछे/i })).toHaveCount(0);
  });
  test('the story sits left of the running order, both on screen', async ({ page }) => {
    // Geometry rather than class names: an earlier grid put a generated
    // element in a column, the real children auto-placed around it, and the
    // story landed on the right while every class was still correct. From lg
    // the v2 desk has stations, then what is on air, then the running order.
    await page.setViewportSize({ width: 1440, height: 900 });
    await signedInAs(page, 'someone.else@example.com');
    await page.goto('/bhimradio');
    await expect(page).toHaveURL(/\/bhimradio/);

    const story = await page.locator('[data-radio-now]').boundingBox();
    const order = await page.locator('[data-radio-order]').boundingBox();

    expect(story.x).toBeLessThan(order.x);          // story on the left
    expect(story.width).toBeGreaterThan(order.width);
    expect(order.x + order.width).toBeLessThanOrEqual(1441);
    // Side by side, not stacked: the running order starts within the story's
    // height rather than under it.
    expect(order.y).toBeLessThan(story.y + story.height);
  });
  test('the running order holds the whole bulletin and scrolls', async ({ page }) => {
    // It used to show ten rows and hide forty stories that were going out
    // tonight. The whole rest of the bulletin is listed, and the list scrolls
    // inside its card instead of stretching the page.
    await page.setViewportSize({ width: 1440, height: 900 });
    await signedInAs(page, 'someone.else@example.com');
    await page.goto('/bhimradio');
    await expect(page).toHaveURL(/\/bhimradio/);

    const list = page.locator('[data-radio-order]');
    await expect(list.locator('li').nth(2)).toBeVisible();
    const { scrollHeight, clientHeight } = await list.evaluate((el) => ({
      scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
    }));
    expect(scrollHeight).toBeGreaterThan(clientHeight);
  });
  test('the meter moves while tuned out', async ({ page }) => {
    // The station does not stop because nobody is listening: the clock
    // counts and the headline changes. The meter sitting still
    // was the one part that said otherwise. Measured by sampling a bar's
    // height, because the class is applied either way.
    await signedInAs(page, 'someone.else@example.com');
    await page.goto('/bhimradio');
    await expect(page).toHaveURL(/\/bhimradio/);

    async function barMoves() {
      const bar = page.locator('.bhim-signal-bar').first();
      await expect(bar).toBeVisible();
      const seen = new Set();
      for (let i = 0; i < 12; i += 1) {
        seen.add(Math.round((await bar.boundingBox()).height));
        await page.waitForTimeout(90);
      }
      return seen.size > 1;
    }

    expect(await barMoves()).toBe(true);
  });
});
