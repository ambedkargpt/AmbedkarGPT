import { expect, test } from '@playwright/test';

/**
 * Reading the news needs no account. The sign-up and login screens offer
 * "Continue as guest"; it opens the news with a strip saying so and a rail with
 * the two ways to get an account. Writing a post is where an account is asked
 * for: the button on a story sends the guest to sign up.
 */

const STORY = {
  id: 'g1', news_id: 'news_guest_1', headline: 'Congress announces a big investment',
  description: 'A short description of the announcement.', summary: 'A short summary of the announcement.',
  source_name: 'Indian National Congress', source_url: 'https://www.youtube.com/watch?v=abc#story-1',
  published_at: new Date().toISOString().slice(0, 19), language: null, tags: ['Investment'],
  tenant_id: 1, tenant_slug: 'congress', scope: 'national', region: null, content_type: 'news',
  legacy_source: 'current', original_sort_timestamp: Date.now() / 1000,
};
const TENANTS = { tenants: [
  { tenant_id: 1, slug: 'congress', name: 'Indian National Congress', is_general: false, is_opposition: false },
  { tenant_id: 3, slug: 'bjp', name: 'Bharatiya Janata Party', is_general: false, is_opposition: true },
] };

const CONTINUE = /continue as guest|गेस्ट के रूप में जारी रखें/i;

async function asGuest(page) {
  const writes = [];
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    if (req.method() !== 'GET') writes.push(`${req.method()} ${req.url()}`);
    const url = req.url();
    const body = url.includes('/news/tenants') ? TENANTS
      : url.includes('scope=state') ? []
        : url.includes('/news/') ? [STORY]
          : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(() => sessionStorage.setItem('skip-splash', '1'));
  return writes;
}

for (const path of ['/signup', '/login']) {
  test(`${path} offers "Continue as guest", which opens the news with no account`, async ({ page }) => {
    await asGuest(page);
    await page.goto(path);
    await page.getByRole('button', { name: CONTINUE }).click();

    await expect(page).toHaveURL(/\/generate\/social-media$/);
    // Not sent back to the home page or asked for a profile.
    await expect(page.getByRole('heading', { name: /set up your profile first|पहले अपनी प्रोफ़ाइल/i })).toHaveCount(0);
    // Says what it is, and offers the way to an account (in the strip and in the rail).
    await expect(page.getByText(/reading as a guest|गेस्ट के रूप में पढ़/i).first()).toBeVisible();
    await expect(page.locator('aside').getByRole('button', { name: /sign up free|मुफ़्त साइन अप/i })).toBeVisible();
    // No profile card or log out for someone with no account, and no history or settings to open.
    await expect(page.locator('aside').getByText(/log out|लॉग आउट/i)).toHaveCount(0);
    await expect(page.locator('aside').getByText(/post history|पोस्ट इतिहास/i)).toHaveCount(0);
  });
}

test('the button on a story asks a guest to sign up and writes nothing', async ({ page }) => {
  const writes = await asGuest(page);
  await page.goto('/generate/social-media');

  await page.getByText(STORY.headline).first().click();
  const cta = page.getByRole('button', { name: /sign up to write this post|यह पोस्ट लिखने के लिए साइन अप करें/i });
  await expect(cta).toBeVisible();
  await cta.click();

  await expect(page).toHaveURL(/\/signup$/);
  // Remembered, so that signing up returns to the news.
  expect(await page.evaluate(() => sessionStorage.getItem('auth_redirect'))).toBe('/generate/social-media');
  expect(writes).toEqual([]);
});

test('pages that need an account still send a guest away', async ({ page }) => {
  await asGuest(page);
  await page.goto('/posts');
  await expect(page).not.toHaveURL(/\/posts$/);
  await page.goto('/settings');
  await expect(page).not.toHaveURL(/\/settings$/);
});
