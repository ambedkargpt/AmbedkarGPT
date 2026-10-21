import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Edit3, Headphones, Mic2, Video, Newspaper, Scale, ArrowRight, Check } from 'lucide-react';
import SectionLabel from './SectionLabel';
import { NavButton, MobileCarouselControls, MobileCardStack } from './CarouselNav';
import useAutoCarousel from '../../hooks/useAutoCarousel';
import { useI18n } from '../../i18n/index.jsx';

const SERVICES = [
  {
    icon: Edit3,
    color: '#ff4f8a',
    gradient: 'from-[#ff4f8a] to-[#d43a68]',
    live: true,
    route: '/generate/social-media',
    id: 'social',
  },
  {
    icon: Headphones,
    color: '#06b6d4',
    gradient: 'from-[#06b6d4] to-[#0891b2]',
    live: false,
    id: 'podcast',
  },
  {
    icon: Mic2,
    color: '#22c55e',
    gradient: 'from-[#22c55e] to-[#16a34a]',
    live: false,
    id: 'speech',
  },
  {
    icon: Video,
    color: '#a855f7',
    gradient: 'from-[#a855f7] to-[#7b3fd4]',
    live: false,
    id: 'video',
  },
  {
    icon: Newspaper,
    color: '#f59e0b',
    gradient: 'from-[#f59e0b] to-[#d97706]',
    live: false,
    id: 'editorial',
  },
  {
    icon: Scale,
    color: '#3f9fff',
    gradient: 'from-[#3f9fff] to-[#5bc0ff]',
    live: false,
    id: 'debate',
  },
];

function handleCardMove(e) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
  el.style.setProperty('--my', `${e.clientY - rect.top}px`);
}

function ServiceCard({ service }) {
  const { t } = useI18n();
  const { icon: Icon, id, color, gradient, live, route } = service;
  const title = t(`svc.${id}.title`);
  const sub = t(`svc.${id}.sub`);
  const features = [1, 2, 3].map((n) => t(`svc.${id}.f${n}`));
  return (
    <div
      onMouseMove={handleCardMove}
      /* min-h, not h: the card was pinned to 480px with overflow hidden, so a
         longer description — or a Hindi one, which the type scale sets larger
         — pushed the "coming soon" line out through the bottom edge. The
         carousel stretches every card to the tallest, so they still line up. */
      className="liquid-glass group relative flex min-h-[480px] w-full flex-1 flex-col overflow-hidden rounded-2xl p-7"
    >
      {/* cursor spotlight */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(220px circle at var(--mx,50%) var(--my,50%), ${color}22, transparent 65%)` }}
      />
      <div
        className="pointer-events-none absolute -top-14 -right-14 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `${color}20` }}
      />

      {/* ── Top row: icon + badge ── */}
      <div className="relative flex items-start justify-between">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-[0_4px_18px_rgba(0,0,0,0.35)]`}
        >
          <Icon size={24} strokeWidth={1.8} className="text-white" />
        </span>
        {live ? (
          <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 font-count text-[11px] font-semibold uppercase tracking-widest text-green-400">
            {t('landing.live')}
          </span>
        ) : (
          <span className="rounded-full border border-[#2a4375]/50 bg-[#0c1735]/60 px-2.5 py-1 font-count text-[11px] font-semibold uppercase tracking-widest text-[#5a7aaa]">
            {t('landing.soon')}
          </span>
        )}
      </div>

      {/* ── Title & description ── */}
      {/* The service's place in the set, so the four read as one product
          ecosystem rather than four loose cards. */}
      <p className="card-index relative mt-5 font-count text-[11px] font-semibold">
        {String(SERVICES.findIndex((s) => s.id === id) + 1).padStart(2, '0')}
      </p>
      <p className="relative mt-1.5 text-[26px] font-semibold text-white">{title}</p>
      <p className="relative mt-2 text-[clamp(15px,4vw,19px)] leading-relaxed text-[#8aabcc]">{sub}</p>

      {/* ── Divider ── */}
      <div className="relative my-5 h-px w-full rounded-full bg-[#1e3260]/70" />

      {/* ── Feature bullets ── */}
      <ul className="relative flex-1 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2.5">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${color}22` }}
            >
              <Check size={11} strokeWidth={2.5} style={{ color }} />
            </span>
            <span className="text-[18px] text-[#a8c0dc]">{f}</span>
          </li>
        ))}
      </ul>

      {/* ── Bottom CTA ── */}
      <div className="relative mt-6 border-t border-[#1e3260]/50 pt-5">
        {live && route ? (
          <Link
            to={route}
            className="inline-flex items-center gap-1.5 text-[18px] font-semibold transition-all duration-200 hover:gap-2.5"
            style={{ color }}
          >
            {t('landing.tryNow')}
            <ArrowRight size={14} strokeWidth={2.2} />
          </Link>
        ) : (
          <p className="text-[17px] text-[#3d5a80]">{t('landing.comingSoon')}</p>
        )}
      </div>
    </div>
  );
}

// Triple-clone so the track is always deep enough to loop seamlessly
const TRACK      = [...SERVICES, ...SERVICES, ...SERVICES];
const GAP        = 24;
// The width a card wants. How many actually fit is measured, not assumed.
const CARD_TARGET = 360;
const AUTO_MS    = 3000;

/**
 * How many cards fit in the measured width, and how wide each one is.
 *
 * This used to be three 360px cards in a hard 1128px box, with the arrows
 * pinned 64px outside it. That needs 1256px of screen. Below it the arrows
 * simply left the viewport, and the box itself overflowed the page: at 800px
 * wide, or at 100% on a 1280px screen zoomed to 150%, the carousel was cut off
 * at both edges with no way to reach the controls.
 *
 * Browser zoom is the same thing as a narrower screen as far as CSS is
 * concerned, which is why zooming in reproduced it exactly.
 */
function layoutFor(width) {
  if (!width) return { visible: 3, cardW: CARD_TARGET, step: CARD_TARGET + GAP };
  const visible = Math.max(1, Math.min(3, Math.floor((width + GAP) / (CARD_TARGET + GAP))));
  const cardW = (width - GAP * (visible - 1)) / visible;
  return { visible, cardW, step: cardW + GAP };
}
const SLIDE_EASE = 'transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

function DesktopCarousel() {
  // Measured rather than assumed, so the carousel fits whatever width it is
  // given. A callback ref backed by state, because the element is present from
  // the first render but its width is not known until layout.
  const [viewportEl, setViewportEl] = useState(null);
  const viewportRef = useCallback((el) => setViewportEl(el), []);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!viewportEl || typeof ResizeObserver === 'undefined') return undefined;
    // observe() delivers the current size straight away, so there is no need to
    // measure once by hand first. Without a ResizeObserver at all, width stays
    // 0 and layoutFor falls back to the three fixed cards it used to draw.
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(viewportEl);
    return () => ro.disconnect();
  }, [viewportEl]);

  const { cardW, step } = layoutFor(width);

  // Start in the middle copy so we can go left or right without hitting the edge
  const [trackIdx, setTrackIdx] = useState(SERVICES.length);
  const [animated, setAnimated] = useState(true);
  const trackIdxRef             = useRef(SERVICES.length);
  const timerRef                = useRef(null);

  // Where a move starts from. The wrap back to the middle copy happens on
  // transitionend, and a hidden tab runs no transitions, so that event never
  // came while the timer kept stepping: after a while in the background the
  // track had slid past every card and the section came back empty, just the
  // arrows and dots. A position outside the middle copy is brought back into
  // it before the next step, whatever happened to the events.
  function settled() {
    const n = SERVICES.length;
    const cur = trackIdxRef.current;
    return cur >= n && cur < n * 2 ? cur : n + (((cur % n) + n) % n);
  }

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (document.hidden) return;   // nothing to see, and nothing would settle
      const next = settled() + 1;
      trackIdxRef.current = next;
      setAnimated(true);
      setTrackIdx(next);
    }, AUTO_MS);
  }, []);

  useEffect(() => {
    startTimer();
    return () => clearInterval(timerRef.current);
  }, [startTimer]);

  // Coming back to the tab: put the track on the middle copy at once, without
  // a slide, in case a step was taken that never settled.
  useEffect(() => {
    function onVisible() {
      if (document.hidden) return;
      const cur = settled();
      if (cur !== trackIdxRef.current) {
        trackIdxRef.current = cur;
        setAnimated(false);
        setTrackIdx(cur);
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // After each slide completes, silently jump back to the middle copy if needed
  function onTransitionEnd() {
    const n   = SERVICES.length;
    const cur = trackIdxRef.current;
    if (cur >= n * 2) {
      const next = cur - n;
      trackIdxRef.current = next;
      setAnimated(false);
      setTrackIdx(next);
    } else if (cur < n) {
      const next = cur + n;
      trackIdxRef.current = next;
      setAnimated(false);
      setTrackIdx(next);
    }
  }

  // Re-enable transition on the frame after the silent jump
  useEffect(() => {
    if (!animated) {
      const id = requestAnimationFrame(() =>
        requestAnimationFrame(() => setAnimated(true))
      );
      return () => cancelAnimationFrame(id);
    }
  }, [animated]);

  function goPrev() {
    const next = settled() - 1;
    trackIdxRef.current = next;
    setAnimated(true);
    setTrackIdx(next);
    startTimer();
  }
  function goNext() {
    const next = settled() + 1;
    trackIdxRef.current = next;
    setAnimated(true);
    setTrackIdx(next);
    startTimer();
  }
  function goTo(serviceIdx) {
    const n    = SERVICES.length;
    const cur  = trackIdxRef.current;
    // jump to whichever copy of serviceIdx is closest to current position
    const base = Math.round(cur / n) * n + serviceIdx;
    trackIdxRef.current = base;
    setAnimated(true);
    setTrackIdx(base);
    startTimer();
  }

  const activeService = ((trackIdx % SERVICES.length) + SERVICES.length) % SERVICES.length;

  return (
    <div className="mt-8 sm:mt-14">
      {/* The gutters are padding rather than negative offsets, so the buttons
          are inside the element's own box and cannot leave the screen however
          narrow it gets. 56px holds a 44px button with room either side. */}
      <div className="relative mx-auto w-full max-w-[1256px] px-12 lg:px-14">
        <div className="absolute left-0 top-1/2 z-10 -translate-y-1/2 pl-1 lg:pl-1.5">
          <NavButton onClick={goPrev} direction="left" label="Previous" />
        </div>

        {/* Clipped viewport */}
        <div ref={viewportRef} style={{ overflow: 'hidden' }}>
          <div
            onTransitionEnd={onTransitionEnd}
            style={{
              display:    'flex',
              gap:        GAP,
              transform:  `translateX(${-(trackIdx * step)}px)`,
              transition: animated ? SLIDE_EASE : 'none',
            }}
          >
            {TRACK.map((service, i) => (
              <div key={i} style={{ flexShrink: 0, width: cardW, display: 'flex' }}>
                <ServiceCard service={service} />
              </div>
            ))}
          </div>
        </div>

        <div className="absolute right-0 top-1/2 z-10 -translate-y-1/2 pr-1 lg:pr-1.5">
          <NavButton onClick={goNext} direction="right" label="Next" />
        </div>
      </div>

      {/* Dots */}
      <div className="mt-7 flex justify-center gap-2">
        {SERVICES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            className={[
              'rounded-full transition-all duration-300',
              i === activeService
                ? 'h-2 w-6 bg-[#3f9fff]'
                : 'h-2 w-2 bg-[#2a4375]/60 hover:bg-[#3f9fff]/50',
            ].join(' ')}
            aria-label={`Go to ${SERVICES[i].title}`}
          />
        ))}
      </div>
    </div>
  );
}

function MobileCarousel() {
  const { t } = useI18n();
  const { activeIdx, goPrev, goNext, goTo, animation, rootRef, swipeHandlers } = useAutoCarousel(SERVICES.length);

  return (
    <div ref={rootRef} className="mt-10 px-6">
      <div className="mx-auto max-w-[360px] touch-pan-y" {...swipeHandlers}>
        <MobileCardStack
          items={SERVICES}
          activeIdx={activeIdx}
          animation={animation}
          renderItem={(service) => <ServiceCard service={service} />}
        />
      </div>

      <MobileCarouselControls
        count={SERVICES.length}
        activeIdx={activeIdx}
        onPrev={goPrev}
        onNext={goNext}
        onSelect={goTo}
        labelFor={(i) => `Go to ${t(`svc.${SERVICES[i].id}.title`)}`}
      />
    </div>
  );
}

export default function KnowledgeSection() {
  const { t } = useI18n();
  return (
    <section id="services" className="relative py-8 md:py-10">
      <div className="pointer-events-none absolute inset-x-0 -top-28 -bottom-28">
        <div className="hidden md:block absolute left-[20%] top-[30%] h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2d7dfb]/9 blur-[140px]" />
        <div className="hidden md:block absolute right-[10%] bottom-[20%] h-[380px] w-[380px] rounded-full bg-[#1a5fff]/7 blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-[1440px] px-6">
        <SectionLabel>{t('landing.ourServices')}</SectionLabel>

        <h2 className="mx-auto mt-8 max-w-[820px] text-center font-display text-[clamp(30px,8vw,46px)] font-bold leading-[1.05] text-white md:text-[62px]">
          {t('know.headPre')}{' '}
          <span className="gradient-text-blue italic">{t('landing.creatorJourney')}</span>
        </h2>

        <p className="mx-auto mt-6 max-w-[760px] text-center text-[clamp(16px,4.3vw,22px)] leading-9 text-[#bfcfe8] md:text-[24px]">
          {t('know.sub')}
        </p>
      </div>

      {/* Mobile: one-by-one carousel */}
      <div className="md:hidden">
        <MobileCarousel />
      </div>

      {/* Desktop: carousel with left/right nav */}
      <div className="hidden md:block">
        <DesktopCarousel />
      </div>

      {/* ── CTA ── */}
      <div className="mt-12 flex justify-center">
        <Link
          to="/signup"
          className="inline-flex h-14 items-center gap-3 rounded-xl bg-[#2d6fff] px-9 text-[17px] font-semibold text-white shadow-[0_0_24px_rgba(45,111,255,0.4)] transition-all duration-300 hover:bg-[#3d7fff] hover:-translate-y-0.5 hover:shadow-[0_0_36px_rgba(45,111,255,0.6)]"
        >
          {t('landing.getStartedFree')}
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>
    </section>
  );
}
