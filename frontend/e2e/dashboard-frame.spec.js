import { expect, test } from '@playwright/test';

/**
 * The signed-in frame survives navigation between the screens inside it.
 *
 * Three things used to rebuild it on every move: PageTransition keyed on the
 * pathname, each page mounting its own DashboardShell, and one app-wide
 * Suspense whose fallback filled the viewport. All three are invisible in the
 * markup afterwards - the rail is present either way - so these tests mark the
 * live DOM node and check the same node is still there, which is the only
 * thing that distinguishes "kept" from "rebuilt and identical".
 */

async function signedIn(page) {
  // Every call, not just the one: the axios client sends any 401 on a
  // protected page to /login, and the dashboard asks for quota, posts and
  // notifications as well. One 401 and the test is looking at a login form.
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    // Shape matters as much as status: a screen that does posts.filter()
    // crashes on {} and takes the whole app to the error boundary, which
    // looks exactly like the bug being tested.
    // A list by default, because most of these are lists and a screen that
    // iterates one crashes on {} - which takes the whole app to the error
    // boundary and looks exactly like the bug being tested.
    let body = [];
    if (url.includes('questions/pending')) body = { party: false, position: false };
    else if (url.includes('daily-quota')) body = { total_streak_posts: 0 };
    route.fulfill({ status: 200, contentType: 'application/json',
                    body: JSON.stringify(body) });
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('skip-splash', '1');
    sessionStorage.setItem('ambedkargpt_questionnaire_prompted', '1');
    sessionStorage.setItem('user', JSON.stringify({
      id: 'e2e-user', username: 'e2e', email: 'e2e@example.com',
      political_party: 'Indian National Congress (INC)',
    }));
  });
}

const RAIL = 'aside, nav';

test.describe('the dashboard frame', () => {
  test('the rail is the same element before and after navigating', async ({ page }) => {
    await signedIn(page);
    await page.goto('/generate');

    const rail = page.locator(RAIL).first();
    await expect(rail).toBeVisible();

    // A property set on the live node. It survives a re-render and cannot
    // survive an unmount, which is exactly the difference being tested.
    await rail.evaluate((el) => { el.dataset.e2eMark = 'kept'; });

    await page.getByRole('button', { name: /post history|पोस्ट इतिहास/i }).click();
    await expect(page).toHaveURL(/\/posts/);

    await expect(page.locator(RAIL).first()).toHaveAttribute('data-e2e-mark', 'kept');
  });

  test('it survives several moves, not just one', async ({ page }) => {
    await signedIn(page);
    await page.goto('/posts');

    const rail = page.locator(RAIL).first();
    await rail.evaluate((el) => { el.dataset.e2eMark = 'kept'; });

    for (const name of [/generate|पोस्ट बनाएँ/i, /post history|पोस्ट इतिहास/i, /generate|पोस्ट बनाएँ/i]) {
      await page.getByRole('button', { name }).first().click();
      await page.waitForTimeout(400);
      await expect(page.locator(RAIL).first()).toHaveAttribute('data-e2e-mark', 'kept');
    }
  });

  test('a lazy screen does not blank the rail while it loads', async ({ page }) => {
    // The app-wide Suspense fallback was 100vh, so a chunk arriving late
    // covered the rail as well. Scoped to the content column, the rail stays.
    await signedIn(page);
    await page.goto('/posts');
    await page.locator(RAIL).first().evaluate((el) => { el.dataset.e2eMark = 'kept'; });

    // Hold the chunk back so the fallback is actually on screen.
    await page.route('**/*.js', async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.continue();
    });

    // Any lazy screen inside the frame will do. The radio used to be the one
    // here, until it became a public page with a frame of its own.
    await page.getByRole('button', { name: /generate|पोस्ट बनाएँ/i }).first().click();
    await expect(page.locator(RAIL).first()).toHaveAttribute('data-e2e-mark', 'kept');
  });
});
