import { expect, test } from '@playwright/test';

/**
 * A post from the INC topic flow: a card made from one topic of a video,
 * written from the topic's narrative frames (backend services/inc_topic_posts.py).
 * The post is a couplet, a short paragraph and a hashtag; the hashtags can be
 * added and removed, and "next angle" writes from the next frame.
 */

const now = () => new Date().toISOString().slice(0, 19);
const TOPIC = {
  id: 't1', news_id: 'news_t1', headline: 'राजधानी को जेल बना दिया', description: 'अस्सी शब्दों का सार।', summary: 'अस्सी शब्दों का सार।',
  source_name: 'INC', source_url: 'https://www.youtube.com/watch?v=t1#topic-1', published_at: now(), language: null, tags: [],
  tenant_id: 1, tenant_slug: 'congress', scope: 'national', region: null, content_type: 'press_conference',
  legacy_source: 'current', original_sort_timestamp: Date.now() / 1000, post_flow: 'inc_topics_v1',
};
const TENANTS = { tenants: [{ tenant_id: 1, slug: 'congress', name: 'Indian National Congress', is_general: false, is_opposition: false }] };
const FRAMES = ['डर की सरकार', 'युवाओं की आवाज़'];
const DEFAULT_TAGS = ['#बैरिकेडिंग_हटाओ', '#कांग्रेस', '#राहुल_गांधी'];
const SUGGESTED = ['#छात्रों_की_आवाज़', '#कांग्रेस', '#राहुल_गांधी', '#INC'];
const post = (n, hashtags = DEFAULT_TAGS) => ({
  id: `p${n}`, user_id: 'guest-congress', news_id: 't1', status: 'draft', created_at: now(), updated_at: now(),
  content: `बैरिकेडिंग से आवाज़ नहीं दबेगी,\nसंविधान की लड़ाई लड़ी जाएगी।\n\nपोस्ट ${n} का पाठ।${hashtags.length ? `\n\n${hashtags.join(' ')}` : ''}`,
  hashtags,
  generation_meta: { narrative_frame: { index: n, of: 2, text: FRAMES[n - 1] }, profile_used: { target_platform: 'WhatsApp' },
    post_parts: { suggested_hashtags: SUGGESTED } },
});

async function api(page) {
  const sent = { generate: 0, patches: [] };
  let current = null;
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    const url = req.url();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/auth/guest')) {
      return json({ user: { id: 'guest-congress', username: 'guest_con_1', full_name: 'Guest', political_party: 'Indian National Congress (INC)',
        party_position: 'national_spokesperson', is_email_verified: false, is_phone_verified: false, auth_providers: ['guest'], is_guest: true,
        created_at: now() }, tokens: { access_token: 'a', refresh_token: 'r', token_type: 'bearer' } });
    }
    if (url.includes('/posts/generate')) {
      sent.generate += 1;
      current = post(sent.generate);
      return json({ post: current, references: [], retrieval_snapshot_id: 'rs_1', retrieval_reused: false });
    }
    if (req.method() === 'PATCH' && /\/posts\/p\d/.test(url)) {
      const body = req.postDataJSON();
      sent.patches.push(body);
      current = post(Number(url.match(/p(\d)/)[1]), body.hashtags);
      return json(current);
    }
    if (url.includes('questions/pending')) return json({ party: false, position: false, profile: false });
    if (url.includes('daily-quota')) return json({ daily_used: 0, daily_remaining: 5, total_posts: 0 });
    if (url.includes('/news/tenants')) return json(TENANTS);
    if (url.includes('scope=state')) return json([]);
    if (url.includes('/news/')) return json([TOPIC]);
    return json([]);
  });
  await page.addInitScript(() => sessionStorage.setItem('skip-splash', '1'));
  return sent;
}

async function writeFirstPost(page) {
  await page.goto('/signup');
  await page.getByRole('button', { name: /guest as congress|कांग्रेस गेस्ट/i }).click();
  await expect(page).toHaveURL(/\/generate\/social-media$/);
  await page.getByText(TOPIC.headline).first().click();
  await page.getByRole('button', { name: /write my post|मेरी पोस्ट लिखें/i }).click();
}

test('the post starts with three hashtags; one can be removed and new ones typed in', async ({ page }) => {
  const sent = await api(page);
  await writeFirstPost(page);

  await expect(page.getByText('पोस्ट 1 का पाठ।')).toBeVisible();
  const editor = page.getByRole('region', { name: /^hashtags$|^हैशटैग$/i });
  for (const tag of DEFAULT_TAGS) await expect(editor.getByRole('listitem').filter({ hasText: tag })).toBeVisible();

  await editor.getByRole('textbox').fill('संविधान बचाओ');
  await editor.getByRole('button', { name: /^add$|^जोड़ें$/i }).click();
  await expect.poll(() => sent.patches.length).toBe(1);
  expect(sent.patches[0].hashtags).toEqual([...DEFAULT_TAGS, '#संविधान_बचाओ']);
  // The post text now ends with it.
  await expect(page.getByText('#संविधान_बचाओ').first()).toBeVisible();

  await editor.getByRole('button', { name: /remove #बैरिकेडिंग_हटाओ|#बैरिकेडिंग_हटाओ हटाएँ/i }).click();
  await expect.poll(() => sent.patches.length).toBe(2);
  expect(sent.patches[1].hashtags).toEqual(['#कांग्रेस', '#राहुल_गांधी', '#संविधान_बचाओ']);
});

test('suggestions add with one tap, and a removed default is offered back', async ({ page }) => {
  const sent = await api(page);
  await writeFirstPost(page);
  const editor = page.getByRole('region', { name: /^hashtags$|^हैशटैग$/i });

  // Only what is not on the post yet is offered.
  const offer = (tag) => editor.getByRole('button', { name: new RegExp(`^(add ${tag}|${tag} जोड़ें)$`, 'i') });
  await expect(offer('#छात्रों_की_आवाज़')).toBeVisible();
  await expect(offer('#INC')).toBeVisible();
  await expect(offer('#कांग्रेस')).toHaveCount(0);

  await offer('#INC').click();
  await expect.poll(() => sent.patches.length).toBe(1);
  expect(sent.patches[0].hashtags).toEqual([...DEFAULT_TAGS, '#INC']);
  await expect(offer('#INC')).toHaveCount(0);

  await editor.getByRole('button', { name: /remove #कांग्रेस|#कांग्रेस हटाएँ/i }).click();
  await expect(offer('#कांग्रेस')).toBeVisible();
});

test('"next angle" writes the next post, from the next frame, with no Refine box', async ({ page }) => {
  const sent = await api(page);
  await writeFirstPost(page);
  await expect(page.getByText(/angle 1 of 2|एंगल 1 \/ 2/i)).toBeVisible();
  await expect(page.getByText(FRAMES[0])).toBeVisible();
  await expect(page.getByPlaceholder(/what should change|क्या बदलना/i)).toHaveCount(0);

  await page.getByRole('button', { name: /write the next angle|अगला एंगल लिखें/i }).click();
  await expect.poll(() => sent.generate).toBe(2);
  await expect(page.getByText('पोस्ट 2 का पाठ।')).toBeVisible();
  await expect(page.getByText(/angle 2 of 2|एंगल 2 \/ 2/i)).toBeVisible();
});
