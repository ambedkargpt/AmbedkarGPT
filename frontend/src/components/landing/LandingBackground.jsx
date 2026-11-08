/**
 * LandingBackground — full-page animated background for the home page.
 *
 * Rendered as `absolute inset-0` inside the page's content wrapper so it
 * grows with the page height (not viewport-fixed). This means every section
 * gets the same ambient light no matter how far down you scroll.
 *
 * Layered effects:
 *  1. Aurora sweep        — slow diagonal gradient band drifting across the page
 *  2. Drifting orbs       — large blurred circles drift organically (2 parallax depths)
 *  3. Floating particles  — tiny light dots float upward at different speeds
 *  4. Twinkling stars     — sparse sparkle accents scattered down the page
 */

import { useEffect, useRef, useState } from 'react';
import Sparkle from './Sparkle';

/**
 * How many of each layer a phone gets.
 *
 * Every orb is a 500-750px element under a 150-190px blur. The browser has to
 * keep a texture the size of the element plus roughly three blur radii on each
 * side, so one orb is about six megabytes of GPU memory and the full set is
 * near a hundred. A desktop GPU absorbs that. A phone does not: it evicts
 * layers and re-rasterises them as they scroll back in, which is exactly the
 * stutter you feel going past a heavy section.
 *
 * So a narrow screen gets a handful. The page still has ambient light and
 * colour, from four orbs instead of seventeen.
 */
const MOBILE = { bgOrbs: 4, accentOrbs: 1, particles: 14, sparkles: 3 };

// Matches Tailwind's lg, which is where the layout stops being a phone layout.
function useNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = (e) => setNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

// ── Drifting orb definitions ───────────────────────────────────────────────────
// left/top are percentages of the background element (= full page height)
const BG_ORBS = [
  // ── Top band ──────────────────────────────────────────────────
  { left: '-8%',  top: '1%',  w: 680, h: 580, color: 'rgba(29,102,222,0.09)',  blur: 160, anim: 'lbg-drift-a', dur: 38 },
  { left: '55%',  top: '3%',  w: 750, h: 640, color: 'rgba(45,125,251,0.07)',  blur: 190, anim: 'lbg-drift-b', dur: 45, delay: 5 },
  { left: '30%',  top: '8%',  w: 500, h: 460, color: 'rgba(63,110,255,0.06)',  blur: 150, anim: 'lbg-drift-c', dur: 42, delay: 3 },
  // ── Upper-mid band ────────────────────────────────────────────
  { left: '-5%',  top: '22%', w: 620, h: 540, color: 'rgba(30,79,181,0.08)',   blur: 170, anim: 'lbg-drift-b', dur: 48, delay: 9 },
  { left: '65%',  top: '18%', w: 700, h: 600, color: 'rgba(41,108,255,0.07)',  blur: 180, anim: 'lbg-drift-a', dur: 44, delay: 14 },
  { left: '32%',  top: '30%', w: 560, h: 500, color: 'rgba(55,90,220,0.07)',   blur: 160, anim: 'lbg-drift-c', dur: 36, delay: 7 },
  // ── Mid band ─────────────────────────────────────────────────
  { left: '10%',  top: '46%', w: 600, h: 540, color: 'rgba(30,79,181,0.08)',   blur: 170, anim: 'lbg-drift-c', dur: 40, delay: 12 },
  { left: '70%',  top: '42%', w: 640, h: 560, color: 'rgba(29,102,222,0.07)',  blur: 175, anim: 'lbg-drift-b', dur: 46, delay: 2 },
  { left: '42%',  top: '52%', w: 520, h: 480, color: 'rgba(63,140,255,0.06)',  blur: 155, anim: 'lbg-drift-a', dur: 52, delay: 18 },
  // ── Lower-mid band ────────────────────────────────────────────
  { left: '-3%',  top: '64%', w: 660, h: 580, color: 'rgba(41,108,255,0.08)',  blur: 165, anim: 'lbg-drift-a', dur: 43, delay: 6 },
  { left: '60%',  top: '68%', w: 640, h: 560, color: 'rgba(41,108,255,0.07)',  blur: 180, anim: 'lbg-drift-c', dur: 50, delay: 8 },
  { left: '28%',  top: '74%', w: 580, h: 520, color: 'rgba(30,79,181,0.07)',   blur: 160, anim: 'lbg-drift-b', dur: 39, delay: 16 },
  // ── Bottom band ───────────────────────────────────────────────
  { left: '15%',  top: '86%', w: 620, h: 540, color: 'rgba(29,102,222,0.08)',  blur: 170, anim: 'lbg-drift-c', dur: 47, delay: 4 },
  { left: '65%',  top: '88%', w: 700, h: 600, color: 'rgba(45,125,251,0.07)',  blur: 185, anim: 'lbg-drift-a', dur: 41, delay: 11 },
];

// Accent color orbs — cyan + violet, sit on their own (faster) parallax layer
const ACCENT_ORBS = [
  { left: '78%',  top: '12%', w: 460, h: 420, color: 'rgba(63,224,255,0.06)',  blur: 150, anim: 'lbg-drift-b', dur: 49, delay: 13 },
  { left: '6%',   top: '38%', w: 480, h: 440, color: 'rgba(123,92,255,0.07)',  blur: 160, anim: 'lbg-drift-c', dur: 45, delay: 10 },
  { left: '50%',  top: '80%', w: 460, h: 420, color: 'rgba(123,92,255,0.06)',  blur: 155, anim: 'lbg-drift-a', dur: 50, delay: 17 },
];

// ── Edge-rail nodes ─────────────────────────────────────────────────────────────
// top values are percentages down the full page; only rendered on 2xl+ screens
// (see .lbg-edge-rail in index.css) where the side gutters are wide enough to need it.
const EDGE_NODES = [8, 24, 40, 56, 72, 88];

// ── Twinkling sparkle accents ───────────────────────────────────────────────────
const SPARKLES = [
  { left: '12%', top: '6%',  size: 18, color: '#5fa5ff', delay: false },
  { left: '88%', top: '16%', size: 14, color: '#7b5cff', delay: true  },
  { left: '6%',  top: '34%', size: 16, color: '#3fe0ff', delay: true  },
  { left: '92%', top: '48%', size: 20, color: '#5fa5ff', delay: false },
  { left: '15%', top: '60%', size: 14, color: '#7b5cff', delay: true  },
  { left: '85%', top: '72%', size: 18, color: '#3fe0ff', delay: false },
  { left: '8%',  top: '88%', size: 16, color: '#5fa5ff', delay: true  },
];

// ── Particle definitions ───────────────────────────────────────────────────────
// top spans 0–98% of total page height so particles cover every section
const FLOAT_ANIMS = ['lbg-float-a', 'lbg-float-b', 'lbg-float-c', 'lbg-float-d'];

const PARTICLES = [
  { left: '7%',  top: '2%',  size: 2.5, dur: 9.0, delay: 0.0 },
  { left: '22%', top: '7%',  size: 2.0, dur: 7.5, delay: 1.2 },
  { left: '66%', top: '4%',  size: 3.0, dur: 11.0, delay: 0.5 },
  { left: '87%', top: '11%', size: 2.0, dur: 8.0,  delay: 2.1 },
  { left: '44%', top: '17%', size: 2.5, dur: 10.5, delay: 0.8 },
  { left: '11%', top: '25%', size: 2.0, dur: 7.5,  delay: 1.5 },
  { left: '77%', top: '21%', size: 2.0, dur: 9.5,  delay: 3.0 },
  { left: '34%', top: '33%', size: 3.0, dur: 12.0, delay: 0.3 },
  { left: '55%', top: '39%', size: 2.0, dur: 8.5,  delay: 2.4 },
  { left: '90%', top: '44%', size: 2.5, dur: 7.0,  delay: 1.0 },
  { left: '4%',  top: '51%', size: 3.0, dur: 10.5, delay: 0.7 },
  { left: '71%', top: '54%', size: 2.0, dur: 9.0,  delay: 3.5 },
  { left: '27%', top: '61%', size: 2.0, dur: 8.0,  delay: 1.8 },
  { left: '47%', top: '67%', size: 2.5, dur: 11.0, delay: 0.4 },
  { left: '82%', top: '63%', size: 2.0, dur: 7.5,  delay: 2.7 },
  { left: '14%', top: '74%', size: 2.0, dur: 10.0, delay: 0.9 },
  { left: '61%', top: '79%', size: 3.0, dur: 8.5,  delay: 1.6 },
  { left: '37%', top: '85%', size: 2.0, dur: 9.5,  delay: 3.2 },
  { left: '18%', top: '90%', size: 2.5, dur: 7.0,  delay: 2.0 },
  { left: '73%', top: '94%', size: 3.0, dur: 11.5, delay: 0.6 },
  { left: '50%', top: '57%', size: 2.0, dur: 8.0,  delay: 4.0 },
  { left: '93%', top: '30%', size: 2.5, dur: 10.0, delay: 1.4 },
];

export default function LandingBackground() {
  const bgLayerRef = useRef(null);
  const accentLayerRef = useRef(null);
  const particleLayerRef = useRef(null);
  const narrow = useNarrow();

  const bgOrbs     = narrow ? BG_ORBS.slice(0, MOBILE.bgOrbs)         : BG_ORBS;
  const accentOrbs = narrow ? ACCENT_ORBS.slice(0, MOBILE.accentOrbs) : ACCENT_ORBS;
  const particles  = narrow ? PARTICLES.slice(0, MOBILE.particles)    : PARTICLES;
  const sparkles   = narrow ? SPARKLES.slice(0, MOBILE.sparkles)      : SPARKLES;

  // Parallax is driven by useScrollAnimations (data-parallax): each layer
  // moves 10-15% slower than the page, on the same clock as the smooth scroll.

  return (
    <div className="lbg-grad-layer pointer-events-none absolute inset-0 z-0 overflow-hidden">

      {/* ── 1. Aurora sweep ── */}
      <div className="lbg-aurora absolute inset-0" />

      {/* ── 2a. Drifting orbs — background layer (slow parallax) ── */}
      <div ref={bgLayerRef} data-parallax="0.10" className="absolute inset-0 will-change-transform">
        {bgOrbs.map((orb, i) => (
          <div
            key={i}
            className="lbg-orb absolute rounded-full"
            style={{
              left: orb.left,
              top:  orb.top,
              width:  orb.w,
              height: orb.h,
              background: orb.color,
              filter: `blur(${orb.blur}px)`,
              animation: `${orb.anim} ${orb.dur}s ease-in-out ${orb.delay ?? 0}s infinite`,
            }}
          />
        ))}
      </div>

      {/* ── 2b. Accent orbs — foreground layer (faster parallax) ── */}
      <div ref={accentLayerRef} data-parallax="0.15" className="absolute inset-0 will-change-transform">
        {accentOrbs.map((orb, i) => (
          <div
            key={i}
            className="lbg-orb absolute rounded-full"
            style={{
              left: orb.left,
              top:  orb.top,
              width:  orb.w,
              height: orb.h,
              background: orb.color,
              filter: `blur(${orb.blur}px)`,
              animation: `${orb.anim} ${orb.dur}s ease-in-out ${orb.delay ?? 0}s infinite`,
            }}
          />
        ))}
      </div>

      {/* ── 3. Floating particles (medium parallax) ── */}
      <div ref={particleLayerRef} data-parallax="0.12" className="absolute inset-0 will-change-transform">
        {particles.map((p, i) => (
          <div
            key={i}
            className="lbg-particle absolute rounded-full"
            style={{
              left:   p.left,
              top:    p.top,
              width:  p.size,
              height: p.size,
              background: 'rgba(100, 170, 255, 0.7)',
              boxShadow: `0 0 ${p.size * 3}px ${p.size * 1.5}px rgba(79, 148, 255, 0.3)`,
              animation: `${FLOAT_ANIMS[i % 4]} ${p.dur}s ease-in-out ${p.delay}s infinite`,
            }}
          />
        ))}
      </div>

      {/* ── 4. Edge rails — fill the wide side gutters on 2xl+ screens ── */}
      <div className="lbg-edge-rail lbg-edge-rail--left">
        {EDGE_NODES.map((top, i) => (
          <span key={i} className="lbg-edge-node" style={{ top: `${top}%`, animationDelay: `${i * 0.7}s` }} />
        ))}
      </div>
      <div className="lbg-edge-rail lbg-edge-rail--right">
        {EDGE_NODES.map((top, i) => (
          <span key={i} className="lbg-edge-node" style={{ top: `${top}%`, animationDelay: `${i * 0.7 + 1.4}s` }} />
        ))}
      </div>

      {/* ── 5. Twinkling stars ── */}
      {sparkles.map((s, i) => (
        <Sparkle
          key={i}
          size={s.size}
          color={s.color}
          className={`absolute opacity-40 ${s.delay ? 'sparkle-twinkle-delay' : 'sparkle-twinkle'}`}
          style={{ left: s.left, top: s.top }}
        />
      ))}
    </div>
  );
}
