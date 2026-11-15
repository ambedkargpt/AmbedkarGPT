import { expect, test } from '@playwright/test';

/**
 * Post history: expanding a post opens it as a page - the same view a freshly
 * written post has, at /generate/social-media?post=<id> - not a pop-up over the
 * list. The address holds the post, so a refresh shows it again.
 */

const now = () => new Date().toISOString().slice(0, 19);
const NEWS = {
  id: 'n1', news_id: 'news_n1', headline: 'राजधानी को जेल बना दिया', description: 'सार।', summary: 'सार।', source_name: 'INC',
  source_url: 'https://www.youtube.com/watch?v=n1#topic-1', published_at: now(), language: null, tags: [], tenant_id: 1,
  tenant_slug: 'congress', scope: 'national', region: null, content_type: 'news', legacy_source: 'current',
  original_sort_timestamp: 1, post_flow: 'inc_topics_v1', created_at: now(), updated_at: now(),
};
const POST = {
  id: 'p1', user_id: 'guest-congress', news_id: 'n1', status: 'draft', created_at: now(), updated_at: now(),
  content: 'बैरिकेडिंग से आवाज़ नहीं दबेगी,\nसंविधान की लड़ाई लड़ी जाएगी।\n\nइतिहास वाली पोस्ट का पाठ।\n\n#बैरिकेडिंग_हटाओ #कांग्रेस',
  hashtags: ['#बैरिकेडिंग_हटाओ', '#कांग्रेस'],
  generation_meta: { narrative_frame: { index: 1, of: 2, text: 'डर की सरकार' }, profile_used: { target_platform: 'Twitter / X' },
    post_parts: { suggested_hashtags: ['#INC'] } },
};

async function api(page) {
  const seen = { getPost: 0 };
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    const url = req.url();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const user = { id: 'guest-congress', username: 'guest_con_1', full_name: 'Guest', political_party: 'Indian National Congress (INC)',
      party_position: 'national_spokesperson', is_email_verified: false, is_phone_verified: false, auth_providers: ['guest'], is_guest: true,
      created_at: now() };
    if (url.includes('/auth/guest')) return json({ user, tokens: { access_token: 'a', refresh_token: 'r', token_type: 'bearer' } });
    if (url.includes('/auth/me')) return json(user);
    if (req.method() === 'GET' && /\/posts\/p1(\?|$)/.test(url)) { seen.getPost += 1; return json(POST); }
    if (req.method() === 'GET' && /\/posts(\/?\?|\/?$)/.test(url)) return json([POST]);
    if (/\/news\/n1(\?|$)/.test(url)) return json(NEWS);
    if (url.includes('questions/pending')) return json({ party: false, position: false, profile: false });
    if (url.includes('daily-quota')) return json({ daily_used: 0, daily_remaining: 5, total_posts: 1 });
    if (url.includes('/news/tenants')) return json({ tenants: [] });
    return json([]);
  });
  await page.addInitScript(() => sessionStorage.setItem('skip-splash', '1'));
  return seen;
}

test('expanding a post opens it as a page with the generated-post view', async ({ page }) => {
  const seen = await api(page);
  await page.goto('/signup');
  await page.getByRole('button', { name: /guest as congress|कांग्रेस गेस्ट/i }).click();
  await expect(page).toHaveURL(/\/generate\/social-media$/);

  await page.goto('/posts');
  await page.getByRole('button', { name: /read the full post|पूरी पोस्ट पढ़ें/i }).first().click();

  await expect(page).toHaveURL(/\/generate\/social-media\?post=p1$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);                              // no pop-up
  await expect(page.getByText('इतिहास वाली पोस्ट का पाठ।')).toBeVisible();
  await expect(page.getByRole('region', { name: /^hashtags$|^हैशटैग$/i })).toBeVisible();  // the same view a new post has
  await expect(page.getByText(/written for twitter|twitter \/ x के लिए/i).first()).toBeVisible();

  // The address holds the post: a refresh shows it again.
  await page.reload();
  await expect(page.getByText('इतिहास वाली पोस्ट का पाठ।')).toBeVisible();
  expect(seen.getPost).toBeGreaterThanOrEqual(2);
});
