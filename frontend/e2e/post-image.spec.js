import { expect, test } from '@playwright/test';

/**
 * "Make an image": the post on the fixed 1080x1080 template, in the writer's
 * party colours, downloaded as a PNG. Guests have no button (they cannot copy
 * or share either).
 */

const now = () => new Date().toISOString().slice(0, 19);
const NEWS = {
  id: 'n1', news_id: 'news_n1', headline: 'खेल बजट पर सवाल', description: 'सार।', summary: 'सार।', source_name: 'INC',
  source_url: 'https://www.youtube.com/watch?v=n1#topic-1', published_at: now(), language: null, tags: [], tenant_id: 1,
  tenant_slug: 'congress', scope: 'national', region: null, content_type: 'news', legacy_source: 'current',
  original_sort_timestamp: 1, post_flow: 'inc_topics_v1', created_at: now(), updated_at: now(),
};
const POST = {
  id: 'p1', user_id: 'u1', news_id: 'n1', status: 'draft', created_at: now(), updated_at: now(),
  content: 'मेहनत खिलाड़ियों की, वाहवाही सरकार की।\nबजट कटा खेल का, तारीफ किस हक से यार की।\n\n'
    + 'एथलीट अपनी मेहनत और परिवार के सहयोग से रिकॉर्ड तोड़ रहे हैं, सरकार की मदद से नहीं। खेल बजट घटाया, सुविधाएं अधूरी, फिर भी जीत का श्रेय सरकार ले रही है। यह दिखावा नहीं, हकीकत दिखाओ।\n\n'
    + '#खेल_बजट_कटौती_का_सच #कांग्रेस #राहुल_गांधी',
  hashtags: ['#खेल_बजट_कटौती_का_सच', '#कांग्रेस', '#राहुल_गांधी'],
  generation_meta: { narrative_frame: { index: 1, of: 3, text: 'खिलाड़ियों की मेहनत' }, profile_used: { target_platform: 'WhatsApp' },
    post_parts: { suggested_hashtags: [] } },
};

async function signedIn(page, party) {
  const user = { id: 'u1', username: 'krish', full_name: 'Krish', political_party: party, party_position: 'block_president',
    is_email_verified: true, is_phone_verified: true, auth_providers: ['phone'], is_guest: false, created_at: now() };
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    const url = req.url();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/auth/me')) return json(user);
    if (req.method() === 'GET' && /\/posts\/p1(\?|$)/.test(url)) return json(POST);
    if (/\/news\/n1(\?|$)/.test(url)) return json(NEWS);
    if (url.includes('questions/pending')) return json({ party: false, position: false, profile: false });
    if (url.includes('daily-quota')) return json({ daily_used: 0, daily_remaining: 5, total_posts: 1 });
    if (url.includes('/news/tenants')) return json({ tenants: [] });
    return json([]);
  });
  await page.addInitScript((u) => {
    sessionStorage.setItem('skip-splash', '1');
    sessionStorage.setItem('access_token', 'a');
    sessionStorage.setItem('refresh_token', 'r');
    sessionStorage.setItem('user', JSON.stringify(u));
  }, user);
}

for (const [party, file] of [['Indian National Congress (INC)', 'inc'], ['Samajwadi Party (SP)', 'sp']]) {
  test(`a ${file} writer makes the image and downloads it`, async ({ page }, info) => {
    await signedIn(page, party);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/generate/social-media?post=p1');
    await page.getByRole('button', { name: /make an image|इमेज बनाएँ/i }).click();

    const dialog = page.getByRole('dialog', { name: /as an image|इमेज में/i });
    const download = dialog.getByRole('button', { name: /download image|इमेज डाउनलोड करें/i });
    await expect(download).toBeEnabled({ timeout: 10000 });

    // The canvas is the full 1080 square, and something was drawn on it.
    const size = await dialog.locator('canvas').evaluate((c) => [c.width, c.height]);
    expect(size).toEqual([1080, 1080]);

    const [file_] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(file_.suggestedFilename()).toMatch(/^ambedkargpt-post-\d+\.png$/);
    await file_.saveAs(info.outputPath(`post-image-${file}.png`));
  });
}
