import { expect, test } from '@playwright/test';

/**
 * Guests.
 *
 * "Continue as guest" on the sign-up and login screens is one button per party
 * (Congress, Samajwadi). It makes a ready-made account for that party
 * (POST /auth/guest), so the guest reads the news and writes posts with no
 * sign-up. Someone who opens the news with no account at all can still read
 * it; writing a post is where they are asked to sign up.
 */

const now = () => new Date().toISOString().slice(0, 19);
const story = (id, headline, tenant) => ({
  id, news_id: `news_${id}`, headline, description: `${headline}: description.`, summary: `${headline}: summary.`,
  source_name: tenant, source_url: `https://www.youtube.com/watch?v=${id}#story-1`, published_at: now(),
  language: null, tags: ['Politics'], tenant_id: 1, tenant_slug: tenant, scope: 'national', region: null,
  content_type: 'news', legacy_source: 'current', original_sort_timestamp: Date.now() / 1000,
});
const INC_STORY = story('g1', 'Congress announces a big investment', 'congress');
const SP_STORY = story('g2', 'Akhilesh Yadav questions the government', 'samajwadi');
const BJP_STORY = story('g3', 'BJP holds a rally', 'bjp');
const TENANTS = { tenants: [
  { tenant_id: 1, slug: 'congress', name: 'Indian National Congress', is_general: false, is_opposition: false },
  { tenant_id: 2, slug: 'samajwadi', name: 'Samajwadi Party', is_general: false, is_opposition: false },
  { tenant_id: 3, slug: 'bjp', name: 'Bharatiya Janata Party', is_general: false, is_opposition: true },
] };
const PARTY_NAME = { congress: 'Indian National Congress (INC)', samajwadi: 'Samajwadi Party (SP)' };

const AS_CONGRESS = /guest as congress|कांग्रेस गेस्ट/i;
const AS_SAMAJWADI = /guest as samajwadi|सपा गेस्ट/i;

/** The API, mocked. Returns what the page sent, to assert on. */
async function api(page, { generate = 'ok' } = {}) {
  const sent = { guest: [], generate: 0, writes: [] };
  let user = null;
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    const url = req.url();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (req.method() !== 'GET') sent.writes.push(`${req.method()} ${url}`);
    if (url.includes('/auth/guest')) {
      const body = req.postDataJSON();
      sent.guest.push(body);
      user = {
        id: `guest-${body.party}`, username: `guest_${body.party.slice(0, 3)}_ab12cd34`, full_name: 'Guest',
        political_party: PARTY_NAME[body.party], party_position: 'national_spokesperson',
        is_email_verified: false, is_phone_verified: false, auth_providers: ['guest'], is_guest: true,
        created_at: now(),
      };
      return json({ user, tokens: { access_token: 'a', refresh_token: 'r', token_type: 'bearer' } });
    }
    if (url.includes('/auth/me')) return user ? json(user) : json({ detail: 'no' }, 401);
    if (url.includes('/posts/generate')) {
      sent.generate += 1;
      if (generate === 'limit') {
        return json({ detail: { error: 'guest_limit', message: 'A guest can write 5 posts a day. Sign up free to write more.' } }, 429);
      }
      return json({ post: { id: 'p1', content: 'नई पोस्ट\nदूसरी पंक्ति\n\nपोस्ट का पाठ।', status: 'draft' } });
    }
    if (url.includes('questions/pending')) return json({ party: false, position: false, profile: false });
    if (url.includes('daily-quota')) return json({ daily_used: 0, daily_remaining: 5, total_posts: 0 });
    if (url.includes('/news/tenants')) return json(TENANTS);
    if (url.includes('scope=state')) return json([]);
    if (url.includes('/news/')) return json([INC_STORY, SP_STORY, BJP_STORY]);
    return json([]);
  });
  await page.addInitScript(() => sessionStorage.setItem('skip-splash', '1'));
  return sent;
}

for (const path of ['/signup', '/login']) {
  test(`${path} offers a guest button for each party; Congress opens the news as a Congress guest`, async ({ page }) => {
    const sent = await api(page);
    await page.goto(path);
    await expect(page.getByRole('button', { name: AS_SAMAJWADI })).toBeVisible();
    await page.getByRole('button', { name: AS_CONGRESS }).click();

    await expect(page).toHaveURL(/\/generate\/social-media$/);
    expect(sent.guest).toHaveLength(1);
    expect(sent.guest[0].party).toBe('congress');
    expect(sent.guest[0].device_id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    await expect(page.getByText(/writing as a (congress|कांग्रेस) guest|कांग्रेस गेस्ट के रूप में लिख रहे/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: /set up your profile first|पहले अपनी प्रोफ़ाइल/i })).toHaveCount(0);
  });
}

test('the same browser sends the same device id, so it gets the same guest back', async ({ page }) => {
  const sent = await api(page);
  await page.goto('/signup');
  await page.getByRole('button', { name: AS_CONGRESS }).click();
  await expect(page).toHaveURL(/\/generate\/social-media$/);
  await page.goto('/login');
  await page.getByRole('button', { name: AS_SAMAJWADI }).click();
  await expect(page).toHaveURL(/\/generate\/social-media$/);
  expect(sent.guest.map((g) => g.party)).toEqual(['congress', 'samajwadi']);
  expect(sent.guest[1].device_id).toBe(sent.guest[0].device_id);
});

test('a Congress guest writes a post from a story', async ({ page }) => {
  const sent = await api(page);
  await page.goto('/signup');
  await page.getByRole('button', { name: AS_CONGRESS }).click();
  await expect(page).toHaveURL(/\/generate\/social-media$/);

  await page.getByText(INC_STORY.headline).first().click();
  const cta = page.getByRole('button', { name: /write my post|मेरी पोस्ट लिखें/i });
  await expect(cta).toBeVisible();
  await cta.click();
  await expect.poll(() => sent.generate).toBe(1);
  await expect(page).not.toHaveURL(/\/signup$/);
});

test('an SP guest sees SP news in the state row; a Congress guest does not', async ({ page }) => {
  await api(page);
  await page.goto('/signup');
  await page.getByRole('button', { name: AS_SAMAJWADI }).click();
  await expect(page).toHaveURL(/\/generate\/social-media$/);
  const stateRow = page.getByRole('region', { name: /state news|राज्य की ख़बरें/i });
  await expect(stateRow.getByText(SP_STORY.headline)).toBeVisible();

  await page.goto('/login');
  await page.getByRole('button', { name: AS_CONGRESS }).click();
  await expect(page).toHaveURL(/\/generate\/social-media$/);
  await expect(page.getByRole('region', { name: /state news|राज्य की ख़बरें/i }).getByText(SP_STORY.headline)).toHaveCount(0);
});

test('a guest who has used up the day is told so, in the page language', async ({ page }) => {
  await api(page, { generate: 'limit' });
  await page.goto('/signup');
  await page.getByRole('button', { name: AS_CONGRESS }).click();
  await page.getByText(INC_STORY.headline).first().click();
  await page.getByRole('button', { name: /write my post|मेरी पोस्ट लिखें/i }).click();
  await expect(page.getByText(/a guest can write 5 posts a day|गेस्ट दिन में 5 पोस्ट बना सकते हैं/i).first()).toBeVisible();
});

test('with no account at all, the button on a story asks to sign up and writes nothing', async ({ page }) => {
  const sent = await api(page);
  await page.goto('/generate/social-media');
  await expect(page.getByText(/reading as a guest|गेस्ट के रूप में पढ़/i).first()).toBeVisible();

  await page.getByText(INC_STORY.headline).first().click();
  const cta = page.getByRole('button', { name: /sign up to write this post|यह पोस्ट लिखने के लिए साइन अप करें/i });
  await expect(cta).toBeVisible();
  await cta.click();

  await expect(page).toHaveURL(/\/signup$/);
  expect(await page.evaluate(() => sessionStorage.getItem('auth_redirect'))).toBe('/generate/social-media');
  expect(sent.writes).toEqual([]);
});

test('pages that need an account still send someone with no account away', async ({ page }) => {
  await api(page);
  await page.goto('/posts');
  await expect(page).not.toHaveURL(/\/posts$/);
  await page.goto('/settings');
  await expect(page).not.toHaveURL(/\/settings$/);
});
