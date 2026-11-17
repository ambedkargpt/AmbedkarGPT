/**
 * The post as a 1080x1080 image card, after the designer's redesign
 * (post-card-redesign: template.html and README.md). Two looks, "dark" (navy)
 * and "light" (warm cream, after a party poster), each in the writer's party
 * colours: Congress saffron on navy, Samajwadi green on red.
 *
 *   party logo, name and line
 *   kicker pill            "सवाल देश का"
 *   two-line headline      line 2 larger, in the accent colour
 *   supporting line        beside an accent bar
 *   0-2 chips              "A -> B"
 *   the post               at the foot of the column, the key phrase coloured
 *   footer                 the party's other leaders, the hashtags, AmbedkarGPT
 *   the main leader        large on the right (dark: a halo behind; light: an arch)
 *
 * The headline is the couplet; the kicker, supporting line, chips and coloured
 * phrase come from the post's generation (post_parts.card). A post without
 * them (written before, or by the old flow) gets the party's default kicker
 * and none of the rest.
 *
 * Drawn on a canvas rather than by capturing HTML: the same pixels on every
 * phone, no dependency. Text is fitted, not cut: the headline and the post get
 * smaller first, then the chips and the supporting line are left out, and only
 * then is the post cut with an ellipsis.
 *
 * Fonts (Khand, Hind, Poppins; SIL Open Font Licence) are in
 * public/post-card/fonts; leader photos in public/leaders (see CREDITS.txt).
 */

export const SIZE = 1080;
const LEFT = 64;
const TOP = 52;
const FOOT_H = 150;
const FOOT_Y = SIZE - FOOT_H;
const COPY_BOTTOM = SIZE - 170;

const KHAND = '"PC Khand", "Noto Sans Devanagari Variable", sans-serif';
const HIND = '"PC Hind", "Noto Sans Devanagari Variable", sans-serif';
const POPPINS = '"PC Poppins", "Inter Variable", sans-serif';

export const PARTIES = {
  congress: {
    name: 'भारतीय राष्ट्रीय कांग्रेस', line: 'सच के साथ, देश के साथ', kicker: 'सवाल देश का',
    logo: '/party-logos/inc.png', symbol: '/party-symbols/congress.png', stripe: ['#ff9933', '#ffffff', '#138808'],
    leader: '/leaders/congress/rahul-gandhi.webp',
    team: ['/leaders/congress/sonia-gandhi.jpg', '/leaders/congress/mallikarjun-kharge.jpg',
      '/leaders/congress/priyanka-gandhi.jpg', '/leaders/congress/jairam-ramesh.jpg'],
  },
  samajwadi: {
    name: 'समाजवादी पार्टी', line: 'काम बोलता है', kicker: 'जनता का सवाल',
    logo: '/party-logos/sp.png', symbol: '/party-symbols/samajwadi.png', stripe: ['#e3262f', '#ffffff', '#2fa84f'],
    leader: '/leaders/samajwadi/akhilesh-yadav.webp',
    team: ['/leaders/samajwadi/dimple-yadav.jpg'],
  },
};

// The two looks, per party. Token names follow the redesign's CSS.
const LOOKS = {
  dark: {
    congress: {
      bg: ['#0b1d55', '#071436', '#050d26'], glow: 'rgba(255,153,51,0.30)', glow2: 'rgba(18,48,126,1)',
      l1: '#ffffff', l2: '#ff9933', ink: '#ffffff', muted: 'rgba(255,255,255,0.82)', strong: '#ffb347',
      kickerBg: '#ff9933', kickerInk: '#1d0b02', dot: '#b91c1c', bar: '#ff9933',
      chipBg: 'rgba(255,255,255,0.08)', chipLine: 'rgba(255,255,255,0.22)', arrow: '#ffb347',
      foot: '#030919', footLine: '#ff9933', footLineW: 4, tags: '#ffc27a', brand: '#ffffff', ring: '#030919', halo: 'rgba(255,153,51,',
    },
    samajwadi: {
      bg: ['#5c0b12', '#2c0508', '#150204'], glow: 'rgba(60,207,102,0.24)', glow2: 'rgba(122,16,24,1)',
      l1: '#ffffff', l2: '#5be38a', ink: '#ffffff', muted: 'rgba(255,255,255,0.84)', strong: '#7cf0a3',
      kickerBg: '#e3262f', kickerInk: '#ffffff', dot: '#5be38a', bar: '#5be38a',
      chipBg: 'rgba(255,255,255,0.08)', chipLine: 'rgba(255,255,255,0.22)', arrow: '#7cf0a3',
      foot: '#0d0203', footLine: '#e3262f', footLineW: 4, tags: '#a8f5bf', brand: '#ffffff', ring: '#0d0203', halo: 'rgba(91,227,138,',
    },
  },
  light: {
    congress: {
      bg: ['#fff8ea', '#fde7bf', '#f9d38f'], glow: 'rgba(255,214,140,0.9)',
      l1: '#7a2008', l2: '#e2570f', ink: '#3b1206', muted: '#5a2a14', strong: '#c2410c',
      kickerBg: '#7a2008', kickerInk: '#ffffff', dot: '#ffb347', bar: '#7a2008',
      chipBg: 'rgba(255,255,255,0.6)', chipLine: 'rgba(122,32,8,0.25)', arrow: '#c2410c',
      foot: '#fffaf0', footLine: '#7a2008', footLineW: 6, tags: '#c2410c', brand: '#0d2363', ring: '#fffaf0',
      arch: ['#0d2363', '#071436'],
    },
    samajwadi: {
      bg: ['#fff6f2', '#ffe3db', '#ffcbbf'], glow: 'rgba(255,190,170,0.85)',
      l1: '#8c1018', l2: '#1f8a43', ink: '#3b0a0d', muted: '#5a1a1d', strong: '#1f8a43',
      kickerBg: '#8c1018', kickerInk: '#ffffff', dot: '#7cf0a3', bar: '#8c1018',
      chipBg: 'rgba(255,255,255,0.6)', chipLine: 'rgba(140,16,24,0.25)', arrow: '#1f8a43',
      foot: '#fffaf6', footLine: '#8c1018', footLineW: 6, tags: '#1f8a43', brand: '#3b0a0d', ring: '#fffaf6',
      arch: ['#7a0f16', '#3a0508'],
    },
  },
};

/** "congress" or "samajwadi", from the writer's party as stored on the account. */
export function partyKey(politicalParty) {
  return /samajwadi|\bsp\b|सपा|समाजवादी/i.test(String(politicalParty || '')) ? 'samajwadi' : 'congress';
}

/**
 * Lines of `text` within `width`, keeping its own line breaks.
 * `measure(s)` returns a width; on a canvas it is ctx.measureText.
 */
export function wrap(text, width, measure) {
  const lines = [];
  for (const para of String(text || '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = words[0];
    for (const w of words.slice(1)) {
      const next = `${line} ${w}`;
      if (measure(next) <= width) line = next;
      else { lines.push(line); line = w; }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * The largest size from `max` down to `min` at which `text` fits `height`
 * (lines x size x lineHeight). At `min` it is cut to the lines that fit, the
 * last one ending in an ellipsis.
 */
export function fit(text, { width, height, max, min, lineHeight, measureAt }) {
  for (let size = max; size >= min; size -= 2) {
    const lines = wrap(text, width, (s) => measureAt(size, s));
    if (lines.length * size * lineHeight <= height) return { size, lines };
  }
  const lines = wrap(text, width, (s) => measureAt(min, s));
  const keep = Math.max(1, Math.floor(height / (min * lineHeight)));
  if (lines.length <= keep) return { size: min, lines };
  const cut = lines.slice(0, keep);
  let last = cut[keep - 1];
  while (last && measureAt(min, `${last}…`) > width) last = last.split(' ').slice(0, -1).join(' ');
  cut[keep - 1] = `${last}…`;
  return { size: min, lines: cut };
}

/** The two headline lines: the couplet's own two, or a one-line headline split near its middle. */
export function headlineLines(headline) {
  const parts = String(headline || '').split('\n').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return [parts[0], parts.slice(1).join(' ')];
  const words = (parts[0] || '').split(/\s+/).filter(Boolean);
  if (words.length < 2) return [parts[0] || '', ''];
  let best = 1;
  let gap = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (d < gap) { gap = d; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

/** The post's words, each marked if it belongs to the phrase to colour. */
export function markHighlight(text, phrase) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const target = String(phrase || '').split(/\s+/).filter(Boolean);
  const marks = words.map(() => false);
  const bare = (w) => w.replace(/[।,.!?]+$/, '');
  if (target.length) {
    for (let i = 0; i + target.length <= words.length; i += 1) {
      if (target.every((w, j) => bare(words[i + j]) === bare(w))) {
        target.forEach((_, j) => { marks[i + j] = true; });
        break;
      }
    }
  }
  return words.map((w, i) => ({ w, strong: marks[i] }));
}

/**
 * Wrapped lines re-split as evenly as the same number of lines allows, instead
 * of full lines and a last word left on its own: the narrowest width that does
 * not need another line.
 */
export function balance(lines, width, measure) {
  if (lines.length < 2) return lines;
  const text = lines.join(' ');
  let best = lines;
  for (let w = width - 4; w > width * 0.4; w -= 4) {
    const next = wrap(text, w, measure);
    if (next.length > lines.length) break;
    best = next;
  }
  return best;
}

/** Lines of marked words within `width`; `measure(s, strong)` measures in the right weight. */
export function wrapWords(words, width, measure) {
  const lines = [];
  let line = [];
  let used = 0;
  words.forEach((tok) => {
    if (line.length && used + measure(tok.w, tok.strong) > width) {
      lines.push(line); line = []; used = 0;
    }
    line.push(tok);
    used += measure(`${tok.w} `, tok.strong);
  });
  if (line.length) lines.push(line);
  return lines;
}

let fontsLoading = null;
function loadFonts() {
  if (fontsLoading) return fontsLoading;
  const DEV = 'U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+25CC, U+A830-A839, U+A8E0-A8FF';
  const LAT = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2190-2193, U+2212, U+2215, U+FEFF, U+FFFD';
  const faces = [
    ['PC Khand', 700, 'khand-devanagari-700-normal', DEV], ['PC Khand', 700, 'khand-latin-700-normal', LAT],
    ['PC Hind', 500, 'hind-devanagari-500-normal', DEV], ['PC Hind', 500, 'hind-latin-500-normal', LAT],
    ['PC Hind', 600, 'hind-devanagari-600-normal', DEV], ['PC Hind', 600, 'hind-latin-600-normal', LAT],
    ['PC Hind', 700, 'hind-devanagari-700-normal', DEV], ['PC Hind', 700, 'hind-latin-700-normal', LAT],
    ['PC Poppins', 700, 'poppins-latin-700-normal', LAT],
  ];
  fontsLoading = typeof FontFace === 'undefined' ? Promise.resolve() : Promise.all(faces.map(async ([family, weight, file, range]) => {
    try {
      const face = new FontFace(family, `url(/post-card/fonts/${file}.woff2) format("woff2")`, { weight: String(weight), unicodeRange: range });
      document.fonts.add(await face.load());
    } catch { /* a face that fails falls back to the next family */ }
  }));
  return fontsLoading;
}

/** The photo at w x h with its bottom `fade` px fading to nothing. */
function fadedFoot(img, w, h, fade = 160) {
  const c = document.createElement('canvas');
  c.width = Math.round(w);
  c.height = Math.round(h);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  g.globalCompositeOperation = 'destination-out';
  const m = g.createLinearGradient(0, h - fade, 0, h);
  m.addColorStop(0, 'rgba(0,0,0,0)');
  m.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = m;
  g.fillRect(0, h - fade, w, fade);
  return c;
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** The arch of the light look: a tall card with a round top, its foot on the footer. */
function archPath(ctx, x, y, w, h) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.arc(x + r, y + r, r, Math.PI, 0);
  ctx.lineTo(x + w, y + h - 28);
  ctx.arcTo(x + w, y + h, x + w - 28, y + h, 28);
  ctx.lineTo(x + 28, y + h);
  ctx.arcTo(x, y + h, x, y + h - 28, 28);
  ctx.closePath();
}

/**
 * Draws the card on `canvas` (made 1080x1080). Resolves when it is done.
 * `card` is the post's {kicker, sub, chips, highlight}, any of them optional.
 */
export async function drawPostImage(canvas, { headline, body, hashtags = [], party = 'congress', look = 'dark', card = {}, author = '', role = '' }) {
  const P = PARTIES[party] || PARTIES.congress;
  const T = (LOOKS[look] || LOOKS.dark)[party] || LOOKS.dark.congress;
  const light = look === 'light';
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  await loadFonts();
  const [logo, leader, symbol, ...teamPhotos] = await Promise.all([
    loadImage(P.logo), loadImage(P.leader), loadImage(P.symbol), ...P.team.map(loadImage),
  ]);
  const team = teamPhotos.filter(Boolean).slice(0, 4);
  const colW = light ? 500 : 560;
  const width = (font, s) => { ctx.font = font; return ctx.measureText(s).width; };

  // ── Ground ──────────────────────────────────────────────────────────────
  const g = light ? ctx.createLinearGradient(0, 0, SIZE, SIZE) : ctx.createLinearGradient(SIZE * 0.25, 0, SIZE * 0.75, SIZE);
  T.bg.forEach((c, i) => g.addColorStop(i / (T.bg.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SIZE, SIZE);
  const glow = ctx.createRadialGradient(SIZE * 0.84, SIZE * 0.36, 0, SIZE * 0.84, SIZE * 0.36, light ? 700 : 620);
  glow.addColorStop(0, T.glow);
  glow.addColorStop(0.64, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, SIZE, SIZE);
  if (!light) {
    const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, 800);
    g2.addColorStop(0, T.glow2);
    g2.addColorStop(0.6, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, SIZE, SIZE);
    // A fine grain, so the dark ground does not band.
    const dot = document.createElement('canvas');
    dot.width = 6; dot.height = 6;
    const dc = dot.getContext('2d');
    dc.fillStyle = 'rgba(255,255,255,0.7)';
    dc.beginPath(); dc.arc(3, 3, 1, 0, Math.PI * 2); dc.fill();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = ctx.createPattern(dot, 'repeat');
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.globalAlpha = 1;
  }

  // ── The main leader ─────────────────────────────────────────────────────
  if (light) {
    const ax = SIZE - 30 - 460;
    const ay = FOOT_Y - 780;
    ctx.save();
    ctx.shadowColor = 'rgba(80,30,0,0.45)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 30;
    archPath(ctx, ax, ay, 460, 780);
    const ag = ctx.createLinearGradient(0, ay, 0, ay + 780);
    ag.addColorStop(0, T.arch[0]); ag.addColorStop(1, T.arch[1]);
    ctx.fillStyle = ag;
    ctx.fill();
    ctx.restore();
    // The party-colour edge round the arch.
    archPath(ctx, ax - 10, ay - 10, 480, 800);
    const eg = ctx.createLinearGradient(0, ay - 10, 0, ay + 790);
    P.stripe.forEach((c, i) => eg.addColorStop(i / (P.stripe.length - 1), c));
    ctx.lineWidth = 4;
    ctx.strokeStyle = eg;
    ctx.stroke();
    ctx.save();
    archPath(ctx, ax, ay, 460, 780);
    ctx.clip();
    if (leader && P.leaderBox) {
      const w = P.leaderBox.w;
      const h = (leader.height / leader.width) * w;
      ctx.drawImage(fadedFoot(leader, w, h), ax + (460 - w) / 2, P.leaderBox.top, w, h);
    } else if (leader) {
      // Inside the arch with room above the head and at the sides, standing
      // on the footer: taller or wider and the arch crops the head and arms.
      const s = Math.min(660 / leader.height, 430 / leader.width);
      const w = leader.width * s;
      const h = leader.height * s;
      ctx.drawImage(leader, ax + (460 - w) / 2, FOOT_Y - h, w, h);
    } else if (symbol) {
      ctx.globalAlpha = 0.25;
      ctx.drawImage(symbol, ax + 60, ay + 260, 340, 340);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  } else {
    let photo = null;
    if (leader && P.leaderBox) {
      photo = { w: P.leaderBox.w, h: (leader.height / leader.width) * P.leaderBox.w, faded: true };
      photo.x = SIZE + 40 - photo.w;
      photo.y = P.leaderBox.top;
    } else if (leader) {
      // Never wider than the space right of the text column.
      const s = Math.min(860 / leader.height, 470 / leader.width);
      photo = { w: leader.width * s, h: leader.height * s };
      photo.x = SIZE + 6 - photo.w;
      photo.y = FOOT_Y - photo.h;
    }
    // The halo sits behind the head, near the top of the photo.
    const hx = photo ? photo.x + photo.w / 2 : SIZE - 70 - 235;
    const hy = photo ? Math.max(260, photo.y + photo.h * (photo.faded ? 0.36 : 0.3)) : 355;
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, 253, 0, Math.PI * 2);
    ctx.fillStyle = `${T.halo}0.08)`; ctx.fill();
    ctx.shadowColor = `${T.halo}0.35)`; ctx.shadowBlur = 120;
    ctx.beginPath(); ctx.arc(hx, hy, 235, 0, Math.PI * 2);
    ctx.lineWidth = 3; ctx.strokeStyle = `${T.halo}0.55)`; ctx.stroke();
    ctx.restore();
    if (photo) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 30;
      ctx.drawImage(photo.faded ? fadedFoot(leader, photo.w, photo.h) : leader, photo.x, photo.y, photo.w, photo.h);
      ctx.restore();
    } else if (symbol) {
      ctx.globalAlpha = 0.22;
      ctx.drawImage(symbol, hx - 170, hy - 170, 340, 340);
      ctx.globalAlpha = 1;
    }
    // The photo fades into the footer.
    const fade = ctx.createLinearGradient(0, FOOT_Y - 150, 0, FOOT_Y);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, T.bg[2]);
    ctx.fillStyle = fade;
    ctx.fillRect(0, FOOT_Y - 150, SIZE, 150);
  }

  // ── Party stripe ────────────────────────────────────────────────────────
  P.stripe.forEach((c, i, all) => { ctx.fillStyle = c; ctx.fillRect((i * SIZE) / all.length, 0, SIZE / all.length + 1, 12); });

  // ── The column ──────────────────────────────────────────────────────────
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // Party: logo in a white ring, name and line.
  if (logo) {
    ctx.save();
    ctx.beginPath(); ctx.arc(LEFT + 34, TOP + 34, 38, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
    ctx.beginPath(); ctx.arc(LEFT + 34, TOP + 34, 34, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logo, LEFT, TOP, 68, 68);
    ctx.restore();
  }
  ctx.fillStyle = T.ink;
  ctx.font = `700 28px ${HIND}`;
  ctx.fillText(P.name, LEFT + 84, TOP + 32);
  ctx.fillStyle = T.muted;
  ctx.font = `500 20px ${HIND}`;
  ctx.fillText(P.line, LEFT + 84, TOP + 58);

  const [line1, line2] = headlineLines(headline);
  const kicker = String(card.kicker || P.kicker).trim();
  const words = markHighlight(body, card.highlight);

  // The headline at a size: each line wrapped to the column (a couplet line
  // runs to some thirty characters, twice what fits at the full size).
  const LH = 1.08;
  const headAt = (h1, h2) => {
    const l1 = balance(wrap(line1, colW, (t) => width(`700 ${h1}px ${KHAND}`, t)), colW, (t) => width(`700 ${h1}px ${KHAND}`, t));
    const l2 = line2 ? balance(wrap(line2, colW, (t) => width(`700 ${h2}px ${KHAND}`, t)), colW, (t) => width(`700 ${h2}px ${KHAND}`, t)) : [];
    const widest = Math.max(...[...l1.map((t) => width(`700 ${h1}px ${KHAND}`, t)), ...l2.map((t) => width(`700 ${h2}px ${KHAND}`, t)), 0]);
    return { l1, l2, height: l1.length * h1 * LH + l2.length * h2 * LH, lines: l1.length + l2.length, widest };
  };

  // The column at given sizes: where each block goes, and whether all fit.
  const layout = ({ h1, h2, punchSize, chips, sub }) => {
    let y = TOP + 68 + 44;
    const B = { kickerY: y };
    y += 56 + 22;
    B.head = headAt(h1, h2);
    B.headY = y;
    y += B.head.height;
    B.subLines = [];
    if (sub) {
      B.subLines = wrap(sub, colW - 26, (s) => width(`600 40px ${HIND}`, s)).slice(0, 2);
      B.subY = y + 18;
      y += 18 + B.subLines.length * 52;
    }
    if (chips.length) {
      B.chipsY = y + 24;
      let rows = 1;
      let x = 0;
      chips.forEach(([a, b]) => {
        const cw = width(`600 28px ${HIND}`, `${a}${b}`) + 40 + 34;
        if (x && x + cw > colW) { rows += 1; x = 0; }
        x += cw + 12;
      });
      y += 24 + rows * 56 + (rows - 1) * 12;
    }
    B.contentBottom = y;
    B.punchLines = wrapWords(words, colW, (s, strong) => width(`${strong ? 700 : 500} ${punchSize}px ${HIND}`, s));
    B.punchTop = COPY_BOTTOM - B.punchLines.length * punchSize * 1.38;
    return { B, fits: y + 24 <= B.punchTop };
  };

  // Headline: the largest size at which it is at most four lines, a word
  // never overflows, and it leaves room for the rest.
  let h1 = 108;
  let h2 = 128;
  for (let a = headAt(h1, h2); h1 > 52 && (a.lines > 4 || a.height > 380 || a.widest > colW); a = headAt(h1, h2)) { h1 -= 2; h2 -= 2; }
  const h1Start = h1;
  let punchSize = 37;
  let chips = (card.chips || []).slice(0, 2);
  let sub = String(card.sub || '').trim();
  let laid = layout({ h1, h2, punchSize, chips, sub });
  // Too tall: a smaller post, then a smaller headline, then fewer extras.
  while (!laid.fits && (punchSize > 28 || h1 > 52)) {
    if (punchSize > 28) punchSize -= 1;
    else { h1 -= 2; h2 -= 2; }
    laid = layout({ h1, h2, punchSize, chips, sub });
  }
  if (!laid.fits && chips.length) { chips = []; laid = layout({ h1, h2, punchSize, chips, sub }); }
  if (!laid.fits && sub) { sub = ''; laid = layout({ h1, h2, punchSize, chips, sub }); }
  // Room freed by what was left out goes back to the post, then the headline.
  const startH1 = h1Start;
  for (let grow = true; grow && laid.fits;) {
    grow = false;
    if (punchSize < 37) {
      const next = layout({ h1, h2, punchSize: punchSize + 1, chips, sub });
      if (next.fits) { punchSize += 1; laid = next; grow = true; continue; }
    }
    if (h1 < startH1) {
      const next = layout({ h1: h1 + 2, h2: h2 + 2, punchSize, chips, sub });
      if (next.fits) { h1 += 2; h2 += 2; laid = next; grow = true; }
    }
  }
  const B = laid.B;
  if (!laid.fits) {
    // Last resort: the lines of the post that fit, ending on an ellipsis.
    const room = Math.max(1, Math.floor((COPY_BOTTOM - B.contentBottom - 24) / (punchSize * 1.38)));
    B.punchLines = B.punchLines.slice(0, room);
    B.punchLines[B.punchLines.length - 1]?.push({ w: '…', strong: false });
    B.punchTop = COPY_BOTTOM - B.punchLines.length * punchSize * 1.38;
  }

  // Kicker pill.
  ctx.font = `700 30px ${HIND}`;
  const kw = ctx.measureText(kicker).width + 64;
  roundRect(ctx, LEFT, B.kickerY, kw, 56, 28);
  ctx.fillStyle = T.kickerBg; ctx.fill();
  ctx.beginPath(); ctx.arc(LEFT + 24, B.kickerY + 28, 11, 0, Math.PI * 2);
  ctx.fillStyle = light ? 'rgba(255,179,71,0.3)' : 'rgba(185,28,28,0.25)'; ctx.fill();
  ctx.beginPath(); ctx.arc(LEFT + 24, B.kickerY + 28, 6, 0, Math.PI * 2);
  ctx.fillStyle = T.dot; ctx.fill();
  ctx.fillStyle = T.kickerInk;
  ctx.fillText(kicker, LEFT + 42, B.kickerY + 39);

  // Headline: line 1 in the ink, line 2 larger in the accent.
  let hy = B.headY;
  ctx.font = `700 ${h1}px ${KHAND}`;
  ctx.fillStyle = T.l1;
  B.head.l1.forEach((t) => { ctx.fillText(t, LEFT, hy + h1 * 0.9); hy += h1 * LH; });
  if (B.head.l2.length) {
    ctx.save();
    ctx.font = `700 ${h2}px ${KHAND}`;
    if (!light) { ctx.shadowColor = 'rgba(255,153,51,0.25)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 6; }
    ctx.fillStyle = T.l2;
    B.head.l2.forEach((t) => { ctx.fillText(t, LEFT, hy + h2 * 0.9); hy += h2 * LH; });
    ctx.restore();
  }

  // Supporting line beside the bar.
  if (sub && B.subLines.length) {
    ctx.fillStyle = T.bar;
    ctx.fillRect(LEFT, B.subY, 6, B.subLines.length * 52 - 4);
    ctx.fillStyle = T.ink;
    ctx.font = `600 40px ${HIND}`;
    B.subLines.forEach((l, i) => ctx.fillText(l, LEFT + 26, B.subY + 40 + i * 52));
  }

  // Chips: "A -> B".
  if (chips.length) {
    let x = LEFT;
    let y = B.chipsY;
    chips.forEach(([a, b]) => {
      ctx.font = `600 28px ${HIND}`;
      const aw = ctx.measureText(a).width;
      const bw = ctx.measureText(b).width;
      const cw = aw + bw + 40 + 34;
      if (x > LEFT && x + cw > LEFT + colW) { x = LEFT; y += 68; }
      roundRect(ctx, x, y, cw, 56, 14);
      ctx.fillStyle = T.chipBg; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = T.chipLine; ctx.stroke();
      ctx.fillStyle = T.ink;
      ctx.fillText(a, x + 20, y + 39);
      ctx.fillStyle = T.arrow;
      ctx.font = `700 24px ${POPPINS}`;
      ctx.fillText('→', x + 20 + aw + 8, y + 37);
      ctx.fillStyle = T.ink;
      ctx.font = `600 28px ${HIND}`;
      ctx.fillText(b, x + 20 + aw + 42, y + 39);
      x += cw + 12;
    });
  }

  // The post, at the foot of the column, its key phrase coloured.
  B.punchLines.forEach((line, i) => {
    let x = LEFT;
    const y = B.punchTop + punchSize + i * punchSize * 1.38;
    line.forEach((tok, j) => {
      ctx.font = `${tok.strong ? 700 : 500} ${punchSize}px ${HIND}`;
      ctx.fillStyle = tok.strong ? T.strong : T.muted;
      const text = j < line.length - 1 ? `${tok.w} ` : tok.w;
      ctx.fillText(text, x, y);
      x += ctx.measureText(text).width;
    });
  });

  // ── The party's other leaders, top right, each on its own ──────────────
  const R = 46;          // ring radius; the photo sits 4px inside it
  const GAP = 16;
  const teamY = TOP + 38;
  let tx = SIZE - 48 - (team.length ? team.length * 2 * R + (team.length - 1) * GAP : 0);
  team.forEach((img) => {
    const cx = tx + R;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, teamY, R, 0, Math.PI * 2); ctx.fillStyle = T.bar; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, teamY, R - 4, 0, Math.PI * 2); ctx.clip();
    const d = 2 * (R - 4);
    const s = Math.max(d / img.width, d / img.height);
    ctx.drawImage(img, cx - (img.width * s) / 2, teamY - (R - 4), img.width * s, img.height * s);
    ctx.restore();
    tx += 2 * R + GAP;
  });

  // ── Footer: who is saying it, the hashtags, the brand ──────────────────
  ctx.fillStyle = T.foot;
  ctx.fillRect(0, FOOT_Y, SIZE, FOOT_H);
  ctx.fillStyle = T.footLine;
  ctx.fillRect(0, FOOT_Y, SIZE, T.footLineW);
  const cy = FOOT_Y + FOOT_H / 2 + 2;
  // The writer's name and party position, set smaller if long, never past 300px.
  const NAME_W = 300;
  let x = LEFT;
  if (author || role) {
    const shrink = (text, weight, max, min) => {
      let size = max;
      while (size > min && width(`${weight} ${size}px ${HIND}`, text) > NAME_W) size -= 1;
      let t = text;
      while (t.length > 1 && width(`${weight} ${size}px ${HIND}`, t) > NAME_W) t = `${t.slice(0, -2)}…`;
      return { size, t };
    };
    const n = shrink(author, 700, 30, 22);
    const r = shrink(role, 500, 21, 16);
    ctx.fillStyle = T.brand;
    ctx.font = `700 ${n.size}px ${HIND}`;
    ctx.fillText(n.t, LEFT, role ? cy - 4 : cy + n.size * 0.35);
    if (role) {
      ctx.fillStyle = T.muted;
      ctx.font = `500 ${r.size}px ${HIND}`;
      ctx.fillText(r.t, LEFT, cy + 26);
    }
    x = LEFT + Math.max(width(`700 ${n.size}px ${HIND}`, n.t), role ? width(`500 ${r.size}px ${HIND}`, r.t) : 0) + 32;
  }
  const brandW = 190;
  const tagsX = x;
  const tagsW = SIZE - 48 - brandW - 24 - tagsX;
  const tagText = hashtags.slice(0, 3).join('   ');
  if (tagText) {
    const tf = fit(tagText, { width: tagsW, height: 70, max: 27, min: 20, lineHeight: 1.25,
      measureAt: (size, s) => width(`600 ${size}px ${HIND}`, s) });
    ctx.font = `600 ${tf.size}px ${HIND}`;
    ctx.fillStyle = T.tags;
    const top = cy - (tf.lines.length * tf.size * 1.25) / 2;
    tf.lines.forEach((l, i) => ctx.fillText(l, tagsX, top + tf.size * 0.95 + i * tf.size * 1.25));
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = T.brand;
  ctx.font = `700 24px ${POPPINS}`;
  ctx.fillText('AmbedkarGPT', SIZE - 48, cy - 2);
  ctx.fillStyle = T.muted;
  ctx.font = `500 17px ${HIND}`;
  ctx.fillText('AI से बनी पोस्ट', SIZE - 48, cy + 24);
  ctx.textAlign = 'left';
}
