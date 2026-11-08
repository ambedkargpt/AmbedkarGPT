import { useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

export const EASE = 'power3.out';

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The landing page's scroll motion, in one place.
 *
 * Lenis (smooth wheel scrolling, desktop only) and ScrollTrigger run off the
 * same clock, gsap's ticker, so a reveal or a scrubbed effect is always in step
 * with the smoothed scroll rather than the raw one.
 *
 * Everything starts visible in the markup. The hidden "from" states are set
 * here, by gsap, only when motion is allowed, so without JavaScript, before it
 * loads, or under prefers-reduced-motion the page is simply all there.
 * Devanagari is never split into characters (it breaks conjuncts and
 * matras): headings are revealed whole, with a mask.
 *
 * What it animates, by markup:
 *   section h2 (+ a preceding [data-eyebrow], following <p>s)  heading reveal
 *   [data-card]                       grid cards stagger in; hover glow via --x/--y
 *   .section-seam                     the seam line draws out from the centre
 *   [data-parallax="0.12"]            background layer, moves slower than the scroll
 *   [data-hero-media]                 hero image eases back as the hero scrolls away
 *   [data-wr-console]                 war-room console plays once when it enters
 *   [data-sheet]                      a rounded panel rises and grows as it comes up
 */
export default function useScrollAnimations(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const reduce = prefersReducedMotion();
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;

    // Cursor glow on cards: a CSS radial-gradient follows --x/--y. One
    // delegated listener for the whole page.
    const onMove = (e) => {
      const card = e.target.closest?.('[data-card]');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--x', `${e.clientX - r.left}px`);
      card.style.setProperty('--y', `${e.clientY - r.top}px`);
    };
    root.addEventListener('pointermove', onMove, { passive: true });

    if (reduce) {
      return () => root.removeEventListener('pointermove', onMove);
    }

    // Smooth scrolling, driven by gsap's ticker and reporting to ScrollTrigger.
    let lenis = null;
    let tick = null;
    if (!coarse) {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true, autoRaf: false, anchors: false, allowNestedScroll: true });
      lenis.on('scroll', ScrollTrigger.update);
      tick = (time) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }

    const ctx = gsap.context(() => {
      // ── Section headings: eyebrow, then the heading through a mask, then the body.
      root.querySelectorAll('section h2').forEach((h2) => {
        if (h2.closest('#home') || h2.closest('[data-no-reveal]')) return;
        const box = h2.parentElement;
        const eyebrow = [...box.querySelectorAll('[data-eyebrow]')]
          .find((el) => el.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING);
        const body = [];
        for (let n = h2.nextElementSibling; n && n.tagName === 'P' && body.length < 2; n = n.nextElementSibling) body.push(n);
        const tl = gsap.timeline({ scrollTrigger: { trigger: h2, start: 'top 80%', once: true } });
        if (eyebrow) tl.from(eyebrow, { opacity: 0, y: 12, duration: 0.5, ease: EASE, clearProps: 'transform,opacity' });
        // inset bottom reveals the heading upward; cleared at the end so
        // matras above the line box are never clipped afterwards.
        tl.fromTo(h2,
          { clipPath: 'inset(-20% -5% 100% -5%)', y: 28 },
          { clipPath: 'inset(-20% -5% -20% -5%)', y: 0, duration: 0.8, ease: EASE, clearProps: 'clipPath,transform' },
          eyebrow ? '-=0.25' : 0);
        if (body.length) tl.from(body, { opacity: 0, y: 16, duration: 0.6, stagger: 0.08, ease: EASE, clearProps: 'transform,opacity' }, '-=0.45');
      });

      // ── Card grids: each group of cards rises in, 60ms apart.
      const groups = new Map();
      root.querySelectorAll('[data-card]').forEach((card) => {
        const parent = card.parentElement;
        if (!groups.has(parent)) groups.set(parent, []);
        groups.get(parent).push(card);
      });
      groups.forEach((cards, parent) => {
        gsap.from(cards, {
          opacity: 0, y: 16, duration: 0.6, ease: EASE, stagger: 0.06,
          clearProps: 'transform,opacity',
          scrollTrigger: { trigger: parent, start: 'top 85%', once: true },
        });
      });

      // ── Seams draw out from the centre.
      root.querySelectorAll('.section-seam').forEach((seam) => {
        gsap.from(seam, {
          scaleX: 0, transformOrigin: '50% 50%', duration: 0.9, ease: EASE,
          scrollTrigger: { trigger: seam, start: 'top 92%', once: true },
        });
      });

      // ── Background glow layers drift slower than the page.
      root.querySelectorAll('[data-parallax]').forEach((layer) => {
        const speed = Number(layer.dataset.parallax) || 0.12;
        gsap.to(layer, {
          y: () => ScrollTrigger.maxScroll(window) * speed,
          ease: 'none',
          scrollTrigger: { start: 0, end: 'max', scrub: true, invalidateOnRefresh: true },
        });
      });

      // ── The hero image eases back as the hero scrolls away (scrubbed).
      const media = root.querySelector('[data-hero-media]');
      const hero = root.querySelector('#home');
      if (media && hero) {
        gsap.to(media, {
          scale: 0.92, opacity: 0.8, ease: 'none', transformOrigin: '50% 30%',
          scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
        });
      }

      // ── Sheets: a rounded panel rises over the section before it, growing
      //    to full size as it comes up (scrubbed).
      root.querySelectorAll('[data-sheet]').forEach((sheet) => {
        gsap.fromTo(sheet, { scale: 0.94, y: 60 }, {
          scale: 1, y: 0, ease: 'none', transformOrigin: '50% 0%',
          scrollTrigger: { trigger: sheet, start: 'top bottom', end: 'top 25%', scrub: true },
        });
      });

      // ── War-room console: rows arrive, the tick pops, the reply writes itself in.
      const con = root.querySelector('[data-wr-console]');
      if (con) {
        const tl = gsap.timeline({ scrollTrigger: { trigger: con, start: 'top 75%', once: true } });
        tl.from(con.querySelectorAll('[data-wr-row]'), { opacity: 0, x: -14, duration: 0.45, stagger: 0.18, ease: EASE, clearProps: 'transform,opacity' })
          .from(con.querySelectorAll('[data-wr-check]'), { opacity: 0, scale: 0.4, duration: 0.45, ease: 'back.out(2.2)', clearProps: 'transform,opacity' }, '+=0.1')
          .from(con.querySelectorAll('[data-wr-platform]'), { opacity: 0, scale: 0.6, duration: 0.35, stagger: 0.06, ease: 'back.out(2)', clearProps: 'transform,opacity' }, '-=0.2')
          .from(con.querySelectorAll('[data-wr-word]'), { opacity: 0, duration: 0.25, stagger: 0.035, ease: 'none', clearProps: 'opacity' }, '-=0.2');
      }
    }, root);

    // Fonts and images change heights after first paint; measure again then.
    const refresh = () => ScrollTrigger.refresh();
    window.addEventListener('load', refresh);
    document.fonts?.ready.then(refresh).catch(() => {});

    return () => {
      root.removeEventListener('pointermove', onMove);
      window.removeEventListener('load', refresh);
      ctx.revert();
      if (tick) gsap.ticker.remove(tick);
      lenis?.destroy();
    };
  }, [rootRef]);
}
