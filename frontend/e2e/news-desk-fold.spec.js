import { expect, test } from '@playwright/test';

/**
 * The news page from lg up: the first story card has to start within the top
 * 230px, at the laptop sizes people actually use. Before the v2 layout the
 * party banner and three tall section cards pushed it below the fold.
 */

const now = Date.now();
const story = (i, slug) => ({
  id: `6a0000000000000000000${String(i).padStart(3, '0')}`,
  headline: `[Sample] खबर ${i}: रामलीला मैदान में बड़ी रैली, चुनाव आयोग पर सवाल`,
  description: 'नमूना विवरण जो कार्ड पर दो पंक्तियों तक दिखता है।',
  summary: 'नमूना सारांश। रैली में नेताओं ने कई माँगें रखीं और सरकार को घेरा।',
  source_name: 'Sample',
  published_at: new Date(now - i * 40 * 60_000).toISOString(),
  tenant_slug: slug,
  content_type: i % 3 ? 'news' : 'press_conference',
  tags: ['Politics'],
});

async function signedIn(page) {
  const news = [
    ...Array.from({ length: 14 }, (_, i) => story(i + 1, 'congress')),
    ...Array.from({ length: 4 }, (_, i) => story(i + 20, 'general')),
    ...Array.from({ length: 3 }, (_, i) => story(i + 30, 'bjp')),
  ];
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    let body = [];
    if (url.includes('/news/tenants')) {
      body = { tenants: [
        { slug: 'congress', name: 'Indian National Congress', is_general: false, is_opposition: false },
        { slug: 'general', name: 'General', is_general: true, is_opposition: false },
        { slug: 'bjp', name: 'Bharatiya Janata Party', is_general: false, is_opposition: true },
      ] };
    } else if (/\/news\/?(\?|$)/.test(url)) body = news;
    else if (url.includes('questions/pending')) body = { party: false, position: false };
    else if (url.includes('daily-quota')) {
      body = { daily_used: 2, daily_limit: 5, daily_remaining: 3, reset_at: new Date(now + 3_600_000).toISOString(),
               total_posts: 4, streak_days: 6, total_streak_posts: 6, streak_at_risk: true };
    }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('skip-splash', '1');
    sessionStorage.setItem('ambedkargpt_questionnaire_prompted', '1');
    sessionStorage.setItem('user', JSON.stringify({
      id: 'e2e-user', username: 'e2e', email: 'e2e@example.com',
      political_party: 'Indian National Congress (INC)', party_position: 'district_president',
    }));
  });
}

for (const [width, height] of [[1440, 900], [1366, 768], [1280, 720]]) {
  test(`first story card is above 230px at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await signedIn(page);
    await page.goto('/generate/social-media');

    const first = page.locator('[data-story-card]:visible').first();
    await expect(first).toBeVisible();
    const top = await first.evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThanOrEqual(230);
  });
}
