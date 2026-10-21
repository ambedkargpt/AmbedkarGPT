import { expect, test } from '@playwright/test';

/**
 * Nobody generates a post without a party, a position and the preference
 * questions - but nobody is dragged into a form either.
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

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('link', { name: /set up profile|प्रोफ़ाइल सेट/i })).toBeVisible();

  await page.goto('/generate/social-media');
  await expect(page).toHaveURL(/\/generate\/social-media$/);
  await expect(page.getByRole('heading', { name: /set up your profile first|पहले अपनी प्रोफ़ाइल/i })).toBeVisible();
  await page.getByRole('link', { name: /set up profile|प्रोफ़ाइल सेट/i }).click();
  await expect(page).toHaveURL(/\/profile-setup$/);
});

test('a party with unanswered preferences is pointed to the questions, and can skip with defaults', async ({ page }) => {
  await signedIn(page, { political_party: INC, party_position: 'national_vice_president' },
    { party: false, position: true, profile: false });

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('link', { name: /answer preferences|प्राथमिकताएँ चुनिए/i })).toBeVisible();

  await page.goto('/generate/social-media');
  await expect(page.getByRole('heading', { name: /set up your profile first|पहले अपनी प्रोफ़ाइल/i })).toBeVisible();

  await page.goto('/questionnaire');
  // No partial save past required questions; the way out is the recommended answers.
  await expect(page.getByRole('button', { name: /save.*later|बाद/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /recommended answers|सुझाए गए जवाब/i })).toBeVisible();
});

test('an account that has done both gets in', async ({ page }) => {
  await signedIn(page, { political_party: INC, party_position: 'national_vice_president' },
    { party: false, position: false, profile: false });

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('link', { name: /set up profile|answer preferences|प्रोफ़ाइल सेट|प्राथमिकताएँ चुनिए/i })).toHaveCount(0);
});

test('the ON AIR strip on the dashboard opens the station and signs out', async ({ page }) => {
  await signedIn(page, { political_party: INC, party_position: 'national_vice_president' },
    { party: false, position: false, profile: false });
  await page.goto('/dashboard');
  const strip = page.getByRole('link', { name: /open bhim radio|भीम रेडियो खोलें/i });
  await expect(strip).toBeVisible({ timeout: 15000 });
  await strip.click();

  await expect(page).toHaveURL(/\/bhimradio$/);
  expect(await page.evaluate(() => sessionStorage.getItem('user'))).toBeNull();
});
