/**
 * Draws the link-preview card for /bhimradio.
 *
 *     node scripts/og-bhimradio.mjs
 *
 * Writes public/og/bhimradio-v3.jpg - 1200x630, the size every platform's
 * large-card preview is built around. It is kept as a script rather than a
 * bare image so the wording can be changed and the card redrawn instead of
 * being re-made in an editor from memory.
 *
 * Two constraints decide how it is saved:
 *
 *   JPEG, under ~300 KB. WhatsApp quietly drops the thumbnail on anything
 *   much larger, and a link that shares with a blank preview is the one thing
 *   this card exists to prevent.
 *
 *   Fonts come from the machine running it. Devanagari is drawn with whatever
 *   Hindi face the system has (Nirmala UI or Mangal on Windows, Noto on
 *   Linux), so redraw on the same kind of machine to get the same card.
 *
 * Needs Playwright's Chromium, which the e2e suite already installs.
 */
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const asDataUri = (rel, mime) =>
  `data:${mime};base64,${readFileSync(resolve(root, rel)).toString('base64')}`;

const portrait = asDataUri('src/assets/images/ambedkar-portrait.webp', 'image/webp');
const logo = asDataUri('public/logo.png', 'image/png');

// Centred, so the picture still reads when WhatsApp shows it as a small
// square thumbnail (it crops to the middle) as well as a full-width card.
const RAYS = Array.from({ length: 24 }, (_, i) => i * 15);
const BARS = [18, 34, 52, 30, 70, 46, 88, 60, 100, 60, 88, 46, 70, 30, 52, 34, 18];

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative; color: #fff;
    font-family: 'Nirmala UI', 'Mangal', 'Noto Sans Devanagari', 'Segoe UI', system-ui, sans-serif;
    background:
      radial-gradient(520px 420px at 50% 46%, rgba(46, 110, 255, .45), transparent 70%),
      linear-gradient(180deg, #0b1442 0%, #060a24 55%, #04061a 100%);
  }
  /* The chakra, faint, behind everything: twenty-four spokes. */
  .chakra { position: absolute; left: 50%; top: 46%; width: 760px; height: 760px;
            transform: translate(-50%, -50%); opacity: .14; }
  .chakra i { position: absolute; left: 50%; top: 0; width: 2px; height: 50%;
              background: linear-gradient(#9cc2ff, transparent); transform-origin: 50% 100%; }
  .chakra::after { content: ''; position: absolute; inset: 0; border-radius: 50%; border: 3px solid #9cc2ff; }

  .portrait { position: absolute; right: -40px; bottom: 0; height: 640px; opacity: .22;
              filter: grayscale(1) brightness(1.2); mix-blend-mode: screen;
              -webkit-mask-image: linear-gradient(90deg, transparent, #000 45%); }

  .center { position: absolute; inset: 0; display: flex; flex-direction: column;
            align-items: center; justify-content: center; text-align: center; }
  .live { display: inline-flex; align-items: center; gap: 10px; padding: 7px 18px 7px 14px;
          border-radius: 999px; background: rgba(255, 70, 60, .16); border: 1.5px solid rgba(255, 110, 95, .7);
          font: 800 20px/1 'Segoe UI', sans-serif; letter-spacing: .16em; color: #ff9a8c; }
  .live i { width: 11px; height: 11px; border-radius: 50%; background: #ff4d3d; box-shadow: 0 0 0 5px rgba(255, 77, 61, .25); }
  h1 { margin-top: 14px; font-size: 150px; line-height: 1.15; font-weight: 800;
       background: linear-gradient(180deg, #fff6d6 0%, #ffd56b 38%, #e7a326 70%, #b8740f 100%);
       -webkit-background-clip: text; background-clip: text; color: transparent;
       filter: drop-shadow(0 6px 18px rgba(255, 190, 60, .35)); }
  .wave { display: flex; align-items: center; gap: 7px; height: 46px; margin-top: 2px; }
  .wave b { width: 8px; border-radius: 4px; background: linear-gradient(180deg, #ffd56b, #e7a326); }
  .tag { margin-top: 14px; font-size: 44px; font-weight: 700; color: #eef3ff; }
  .en { margin-top: 6px; font: 700 22px/1 'Segoe UI', sans-serif; letter-spacing: .42em; color: #7fb2ff; }

  .brand { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%);
           display: flex; align-items: center; gap: 10px; font: 700 24px/1 'Segoe UI', sans-serif; }
  .brand img { width: 34px; height: 34px; object-fit: contain; }
  .brand span span { color: #5fb0ff; }
</style></head>
<body>
  <div class="chakra">${RAYS.map((d) => `<i style="transform: translateX(-50%) rotate(${d}deg)"></i>`).join('')}</div>
  <img class="portrait" src="${portrait}" alt="">
  <div class="center">
    <div class="live"><i></i>ON AIR</div>
    <h1>भीम रेडियो</h1>
    <div class="wave">${BARS.map((h) => `<b style="height:${h}%"></b>`).join('')}</div>
    <div class="tag">दैनिक मध्य भारत समाचार</div>
    <div class="en">BHIM RADIO · HINDI NEWS</div>
  </div>
  <div class="brand"><img src="${logo}" alt=""><span>Ambedkar<span>GPT</span></span></div>
</body></html>`;

const out = resolve(root, 'public/og/bhimradio-v3.jpg');
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
writeFileSync(out, await page.screenshot({ type: 'jpeg', quality: 82 }));
await browser.close();

const kb = Math.round(statSync(out).size / 1024);
console.log(`wrote ${out} (${kb} KB)`);
if (kb > 300) {
  console.warn('over 300 KB: WhatsApp may drop the thumbnail. Lower the quality in this script.');
}
