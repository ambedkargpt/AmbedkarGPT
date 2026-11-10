import { expect, test } from '@playwright/test';

/**
 * Nobody generates a post without a party and a position - but nobody is
 * dragged into a form either. The preference questions are no longer asked:
 * the server answers them with defaults for the party and role.
 *
 * A Google sign-up arrives with a name and no party. It used to be sent to
 * the profile screen from whatever page it opened, which pulled people who
 * only came to look around into a form at random. Now the app says what is
 * missing in a strip at the top, and only the post generator is locked until
 * it is done. The backend refuses such a post as well.
 */

const INC = 'Indian National Congress (INC)';

async function signedIn(page, user, pending) {
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    const body = url.includes('questions/pending') ? pending
      : url.includes('/questions/position') || url.includes('/questions/party') ? [
        { question_id: 'pos_inc_national_q1', question_text: 'Q1', options: ['A', 'B'], options_hi: ['अ', 'ब'] },
      ]
        : url.includes('daily-quota') ? { used: 0, limit: 5, remaining: 5 }
          : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript((u) => {
    sessionStorage.setItem('skip-splash', '1');
    sessionStorage.setItem('user', JSON.stringify(u));
  }, { id: 'e2e', username: 'e2e', email: 'e2e@example.com', full_name: 'E2E User', ...user });
}

test('a new account with no party is told, not redirected, and cannot generate', async ({ page }) => {
  await signedIn(page, {}, { party: false, position: false, profile: true });

  // The dashboard is switched off: its address opens the news feed.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/generate\/social-media$/);
  await expect(page.getByRole('heading', { name: /set up your profile first|पहले अपनी प्रोफ़ाइल/i })).toBeVisible();
  await page.getByRole('link', { name: /set up profile|प्रोफ़ाइल सेट/i }).click();
  // Settings, not the old onboarding form, and it remembers where to go back to.
  await expect(page).toHaveURL(/\/settings\?tab=profile&next=%2Fgenerate%2Fsocial-media$/);
});

// "Skip for now": a new account can read the news without setting anything up.
// Writing a post still needs the profile, and the server still refuses it.
const SKIP = /skip for now, go to the news|अभी छोड़ें, सीधे ख़बरें देखें/i;
const GATE = /set up your profile first|पहले अपनी प्रोफ़ाइल/i;

test('the gate can be skipped, and stays open on the next visit', async ({ page }) => {
  await signedIn(page, {}, { party: false, position: false, profile: true });
  await page.goto('/generate/social-media');
  await expect(page.getByRole('heading', { name: GATE })).toBeVisible();

  await page.getByRole('button', { name: SKIP }).click();
  await expect(page.getByRole('heading', { name: GATE })).toHaveCount(0);

  await page.reload();
  await expect(page).toHaveURL(/\/generate\/social-media$/);
  await expect(page.getByRole('heading', { name: GATE })).toHaveCount(0);
});

test('sign-up details can be skipped straight to the news', async ({ page }) => {
  await signedIn(page, { full_name: '' }, { party: false, position: false, profile: true });
  await page.goto('/signup/details');
  await page.getByRole('button', { name: SKIP }).click();
  await expect(page).toHaveURL(/\/generate\/social-media$/);
  await expect(page.getByRole('heading', { name: GATE })).toHaveCount(0);
});

test('the old profile form is gone: its address opens Settings', async ({ page }) => {
  await signedIn(page, {}, { party: false, position: false, profile: true });
  await page.goto('/profile-setup');
  await expect(page).toHaveURL(/\/settings\?tab=profile/);
});

test('saving a complete profile on Settings returns to the news; a foreign address is ignored', async ({ page }) => {
  const user = { id: 'e2e', username: 'e2e', email: 'e2e@example.com', full_name: 'E2E User', political_party: INC, party_position: 'national_vice_president' };
  await signedIn(page, user, { party: false, position: false, profile: false });
  // The account's own update: answer with the user, as the server does.
  await page.route('**/api/v1/auth/me', (route) => (route.request().method() === 'PATCH'
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...user, full_name: 'Renamed' }) })
    : route.fallback()));

  // Sent here by a refused post: it carries where to go back to.
  await page.goto('/settings?tab=profile&next=%2Fgenerate%2Fsocial-media');
  await page.getByLabel(/full name|पूरा नाम/i).fill('Renamed');
  await page.getByRole('button', { name: /save changes|बदलाव सेव करें/i }).click();
  await expect(page).toHaveURL(/\/generate\/social-media$/);

  // An address that leaves the app is not followed: the reader stays in Settings.
  await page.goto('/settings?tab=profile&next=https%3A%2F%2Fexample.com');
  await page.getByLabel(/full name|पूरा नाम/i).fill('Renamed again');
  await page.getByRole('button', { name: /save changes|बदलाव सेव करें/i }).click();
  await expect(page.getByText(/saved|सेव हो गया|सहेज/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/settings/);
});

test('the sidebar offers no dashboard, preferences or unbuilt pages', async ({ page }) => {
  await signedIn(page, { political_party: INC, party_position: 'national_vice_president' },
    { party: false, position: false, profile: false });

  await page.goto('/posts');
  const rail = page.locator('aside').first();
  await expect(rail.getByRole('button', { name: /post history|पोस्ट इतिहास/i })).toBeVisible();
  await expect(rail.getByRole('button', { name: /^(dashboard|डैशबोर्ड)$/i })).toHaveCount(0);
  await expect(rail.getByText(/preferences|प्राथमिकताएँ/i)).toHaveCount(0);
  await expect(rail.getByText(/soon|जल्द/i)).toHaveCount(0);
});

test('an account that has done both gets in', async ({ page }) => {
  await signedIn(page, { political_party: INC, party_position: 'national_vice_president' },
    { party: false, position: false, profile: false });

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/generate\/social-media$/);
  await expect(page.getByRole('heading', { name: /set up your profile first|पहले अपनी प्रोफ़ाइल/i })).toHaveCount(0);
});

test('the ON AIR strip in the app frame opens the station and signs out', async ({ page }) => {
  await signedIn(page, { political_party: INC, party_position: 'national_vice_president' },
    { party: false, position: false, profile: false });
  await page.goto('/posts');
  const strip = page.getByRole('link', { name: /open bhim radio|भीम रेडियो खोलें/i });
  await expect(strip).toBeVisible({ timeout: 15000 });
  await strip.click();

  await expect(page).toHaveURL(/\/bhimradio$/);
  expect(await page.evaluate(() => sessionStorage.getItem('user'))).toBeNull();
});
