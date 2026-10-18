import { expect, test } from '@playwright/test';

/**
 * Bhim Radio as a standalone page.
 *
 * Anyone can open /bhimradio and listen, signed in or not, and a link to it
 * previews with a title and a picture when it is pasted into a chat. Each of
 * those is a thing that only holds in a real render, and most of them are
 * undone by a single wrong line somewhere else - a route left inside the login
 * guard, a Disallow left in robots.txt - so they are checked in the browser
 * rather than inferred from the code.
 */

test.beforeEach(async ({ page }) => {
  // Past the opening splash, which covers the whole viewport on a first visit.
  await page.addInitScript(() => sessionStorage.setItem('skip-splash', '1'));
});

async function signedIn(page) {
  // Every call: the axios client sends any 401 on a protected page to /login.
  await page.route('**/api/v1/**', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(route.request().url().includes('questions/pending')
      ? { party: false, position: false } : []),
  }));
  await page.addInitScript(() => {
    sessionStorage.setItem('ambedkargpt_questionnaire_prompted', '1');
    sessionStorage.setItem('user', JSON.stringify({
      id: 'e2e', username: 'e2e', email: 'e2e@example.com',
      political_party: 'Indian National Congress (INC)',
    }));
  });
}

test.describe('the radio without an account', () => {
  test('a visitor who is not signed in opens the station directly', async ({ page }) => {
    await page.goto('/bhimradio');

    // Not bounced to a login form, which is what the old route did.
    await expect(page).toHaveURL(/\/bhimradio$/);
    await expect(page.getByText(/now on air|अभी ऑन एयर/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /play bhim radio|भीम रेडियो प्ले/i }))
      .toBeVisible();
  });

  test('it is a public page with the public frame, not the dashboard', async ({ page }) => {
    await page.goto('/bhimradio');

    await expect(page.locator('nav').first()).toBeVisible();   // the site's navbar
    // The dashboard rail is what a signed-in-only page would be wearing.
    await expect(page.locator('.np-rail')).toHaveCount(0);
  });

  test('the promotional strips are not on the page they promote', async ({ page }) => {
    await page.goto('/bhimradio');
    await expect(page.getByText(/now on air|अभी ऑन एयर/i).first()).toBeVisible();

    // An announcement that Bhim Radio is live, above Bhim Radio.
    await expect(page.locator('.radio-live-strip')).toHaveCount(0);
  });

  test('the navbar marks the radio as the current page, not home', async ({ page }) => {
    // The active item was scroll-tracked state that starts as 'home', so every
    // page other than the landing page claimed to be home.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/bhimradio');
    const nav = page.locator('header nav').first();
    await expect(nav.getByRole('button', { name: /bhim radio|भीम रेडियो/i })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('button', { name: /^(home|होम)$/i })).not.toHaveAttribute('aria-current', /.+/);
  });

  test('the navbar item on the landing page goes straight to it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: /bhim radio|भीम रेडियो/i }).first().click();

    await expect(page).toHaveURL(/\/bhimradio$/);
    expect(await page.evaluate(() => sessionStorage.getItem('auth_redirect'))).toBeNull();
  });

  test('the back arrow goes home, even from a link opened cold', async ({ page }) => {
    // Opened straight from a shared link there is no history; back() would
    // leave the site, so the arrow is a link home.
    await page.goto('/bhimradio');
    await page.getByRole('link', { name: /back to the home page|होम पेज पर वापस/i }).click();

    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('the way in', () => {
  // The tuner is the one control the page exists for. In the dashboard it sat at
  // the foot of a full-height desk and was always on screen; in the public
  // frame the navbar and the crawl take 118px and the story below is taller
  // than the window, which put it at y=1044 on a laptop and past 2000 on a
  // phone. Geometry, because the markup is correct in both places.
  for (const [name, size] of [
    ['a laptop', { width: 1280, height: 720 }],
    ['a phone', { width: 390, height: 844 }],
  ]) {
    test(`Play is on screen without scrolling, on ${name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/bhimradio');
      const tune = page.getByRole('button', { name: /play bhim radio|भीम रेडियो प्ले/i });
      await expect(tune).toBeVisible();

      const box = await tune.boundingBox();
      expect(box.y + box.height, 'bottom edge of the button').toBeLessThanOrEqual(size.height);
    });
  }
});

test.describe('the rail', () => {
  test('has no radio row for a signed-in user', async ({ page }) => {
    // It is a standalone feature now, reached from the navbar or a shared link.
    // The row comes back with the login wall, via VITE_RADIO_REQUIRES_LOGIN.
    await signedIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dashboard');

    await expect(page.locator('aside').first()).toBeVisible();
    await expect(page.locator('aside').getByText(/bhim radio|भीम रेडियो/i)).toHaveCount(0);
  });
});

test.describe('sharing the link', () => {
  test('Share opens a menu of apps, each sending the message with the link and emoji', async ({ page }) => {
    await page.goto('/bhimradio');
    await page.getByRole('button', { name: /^(share|शेयर)$/i }).first().click();
    const menu = page.getByRole('menu');
    for (const app of ['WhatsApp', 'Telegram', 'Instagram', 'X', 'Facebook', 'LinkedIn', 'Email']) {
      await expect(menu.getByRole('menuitem', { name: new RegExp(`^${app}`) })).toBeVisible();
    }

    const wa = await menu.getByRole('menuitem', { name: /^WhatsApp/ }).getAttribute('href');
    // A computer goes to WhatsApp Web: the Windows app mangled emoji from wa.me.
    expect(wa).toMatch(/^https:\/\/web\.whatsapp\.com\/send\?text=/);
    const text = decodeURIComponent(wa.split('text=')[1]);
    expect(text).toContain('https://www.ambedkargpt.in/bhimradio');
    // One link only: WhatsApp builds the card from the first one it finds.
    expect(text.match(/https?:\/\//g)).toHaveLength(1);
    expect(text).toMatch(/\p{Extended_Pictographic}/u);

    const tg = await menu.getByRole('menuitem', { name: /^Telegram/ }).getAttribute('href');
    expect(decodeURIComponent(tg)).toContain('url=https://www.ambedkargpt.in/bhimradio');

    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });



  test('the page carries its own title, description and image in the HTML', async ({ request }) => {
    // Fetched without running any script, the way a link-preview crawler does.
    // WhatsApp, Facebook, X and Telegram read these tags from the response and
    // never execute the app, so tags set by the page's JavaScript are tags
    // nobody sees.
    const res = await request.get('/bhimradio');
    expect(res.ok()).toBe(true);
    const html = await res.text();

    expect(html).toMatch(/<title>[^<]*(Bhim Radio|भीम रेडियो)[^<]*<\/title>/);
    expect(html).toMatch(/property="og:title"/);
    expect(html).toMatch(/property="og:description"/);
    expect(html).toMatch(/name="twitter:card" content="summary_large_image"/);

    // Absolute: a preview image given as a relative path is ignored by every
    // platform, because the crawler has no page to resolve it against.
    const image = html.match(/property="og:image" content="([^"]+)"/)?.[1];
    expect(image).toMatch(/^https:\/\/.+\/og\/bhimradio-v3\.jpg$/);
  });

  test('and the image it names exists, at the size the card is built for', async ({ request }) => {
    const res = await request.get('/og/bhimradio-v3.jpg');
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toMatch(/image\/jpeg/);

    const bytes = (await res.body()).length;
    // WhatsApp drops the thumbnail on anything much past 300 KB, and a link
    // that shares with a blank preview is the failure this card is here for.
    expect(bytes).toBeLessThan(300 * 1024);
    expect(bytes).toBeGreaterThan(5 * 1024);
  });

  test('crawlers are allowed to read the page', async ({ request }) => {
    // Facebook's and X's preview bots honour robots.txt. A Disallow left over
    // from when the page was behind a login means no preview anywhere.
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).not.toMatch(/Disallow:\s*\/bhimradio/);
  });
});

test.describe('on a phone', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('bhim-radio-layout', 'desk'));
  });

  test('the player is a card at the top, with the story and what is next below it', async ({ page }) => {
    await page.goto('/bhimradio');

    const player = page.locator('.bhim-m-player');
    await expect(player).toBeVisible();
    const play = player.getByRole('button', { name: /play bhim radio|भीम रेडियो प्ले/i });
    const box = await play.boundingBox();
    expect(box.y + box.height).toBeLessThan(844);   // no scrolling to reach it

    await expect(page.locator('.bhim-m-headline')).toBeVisible();
    await expect(page.locator('.bhim-m-card').first()).toBeAttached();
    // The cards scroll inside their row, never the page sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('the story on air says it went out at the time the clock shows', async ({ page }) => {
    // Air time was counted from today's midnight while the broadcast loops from
    // the bulletin's own date, so the label ran up to a cycle ahead of the clock.
    await page.goto('/bhimradio');
    const clock = (await page.locator('.bhim-m-clock').innerText()).slice(0, 5);
    const aired = (await page.locator('.bhim-m-aired').innerText()).match(/\d{2}:\d{2}/)[0];
    const mins = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
    const gap = (mins(clock) - mins(aired) + 1440) % 1440;
    expect(gap).toBeLessThanOrEqual(10);   // no story is ten minutes long
  });
});
