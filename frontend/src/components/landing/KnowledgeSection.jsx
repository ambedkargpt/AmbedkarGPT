import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Edit3, Headphones, Mic2, Video, Newspaper, Scale, ArrowRight, Check } from 'lucide-react';
import SectionLabel from './SectionLabel';
import ToolCardCarousel from './ToolCardCarousel';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import useSlidingPill, { pillStyle } from '../generate/useSlidingPill';
import { prefersReducedMotion } from '../../hooks/useScrollAnimations';
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

function ServiceCard({ service, compact = false }) {
  const { t } = useI18n();
  const { icon: Icon, id, color, gradient, live, route } = service;
  const title = t(`svc.${id}.title`);
  const sub = t(`svc.${id}.sub`);
  const features = [1, 2, 3].map((n) => t(`svc.${id}.f${n}`));
  const index = SERVICES.findIndex((x) => x.id === id);
  return (
    <div
      onMouseMove={handleCardMove}
      // The service's own colour runs through the card: a wash from the
      // corner, the top edge, the progress bar, the feature tiles and, for a
      // live service, a filled button.
      className={`group relative flex w-full flex-1 flex-col overflow-hidden rounded-[20px] border ${compact ? 'p-5 sm:p-7' : 'min-h-[460px] p-7 md:p-8'}`}
      style={{
        borderColor: `${color}55`,
        background: `radial-gradient(90% 70% at 100% 0%, ${color}33 0%, transparent 60%), radial-gradient(60% 60% at 0% 100%, ${color}14 0%, transparent 70%), linear-gradient(165deg, #121b40 0%, #0b1130 55%, #090d24 100%)`,
        boxShadow: `0 40px 80px -40px ${color}99, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${color} 0%, ${color}00 80%)` }} />
      {/* cursor spotlight */}
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(260px circle at var(--mx,50%) var(--my,50%), ${color}26, transparent 65%)` }}
      />
      {/* The service's icon, large and faint, behind the copy. */}
      <Icon aria-hidden="true" size={compact ? 140 : 230} strokeWidth={0.9} className="pointer-events-none absolute -bottom-10 -right-10 opacity-[0.07]" style={{ color }} />

      {/* ── Top row: icon, place in the set, status ── */}
      <div className="relative flex items-center gap-4">
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br ${gradient}`}
          style={{ boxShadow: `0 10px 28px ${color}66` }}
        >
          <Icon size={25} strokeWidth={1.8} className="text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-count text-[13px] font-semibold tabular-nums" style={{ color }}>
            {String(index + 1).padStart(2, '0')} <span className="text-white/35">/ {String(SERVICES.length).padStart(2, '0')}</span>
          </p>
          {/* Where this service sits among the six. */}
          <div className="mt-1.5 flex max-w-[180px] gap-1" aria-hidden="true">
            {SERVICES.map((x, k) => (
              <span key={x.id} className="h-1 flex-1 rounded-full" style={{ background: k <= index ? color : 'rgba(255,255,255,0.12)' }} />
            ))}
          </div>
        </div>
        {live ? (
          <span className="flex items-center gap-1.5 rounded-full border border-green-500/40 bg-green-500/15 px-3 py-1 font-count text-[12px] font-semibold uppercase tracking-widest text-green-300">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 motion-safe:animate-pulse" />
            {t('landing.live')}
          </span>
        ) : (
          <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 font-count text-[12px] font-semibold uppercase tracking-widest text-[#9fb3d6]">
            {t('landing.soon')}
          </span>
        )}
      </div>

      {/* ── Title & description ── */}
      <p className="relative mt-6 font-display text-[28px] font-bold leading-tight text-white md:text-[32px]">{title}</p>
      <p className="relative mt-2 max-w-[620px] text-[clamp(15px,4vw,19px)] leading-relaxed text-[#b4c6e4]">{sub}</p>

      {/* ── Features, each on a tile in the service's colour ── */}
      <ul className={`relative mt-6 grid flex-1 content-start gap-2.5 ${compact ? '' : 'sm:grid-cols-3'}`}>
        {features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2.5 rounded-[14px] border px-3.5 py-3"
            style={{ borderColor: `${color}33`, background: `${color}12` }}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: color }}>
              <Check size={12} strokeWidth={3} className="text-white" />
            </span>
            <span className="text-[16.5px] leading-snug text-[#dbe6f7]">{f}</span>
          </li>
        ))}
      </ul>

      {/* ── Bottom CTA ── */}
      <div className="relative mt-6">
        {live && route ? (
          <Link
            to={route}
            className="inline-flex h-12 items-center gap-2 rounded-[14px] px-6 text-[17px] font-bold text-white transition hover:brightness-110"
            style={{ background: `linear-gradient(135deg, ${color} 0%, ${color}b3 100%)`, boxShadow: `0 12px 28px ${color}55` }}
          >
            {t('landing.tryNow')}
            <ArrowRight size={17} strokeWidth={2.4} className="transition-transform group-hover:translate-x-1" />
          </Link>
        ) : (
          <p className="inline-flex h-12 items-center rounded-[14px] border border-white/10 bg-white/[0.04] px-5 text-[16px] text-[#9fb3d6]">{t('landing.comingSoon')}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Services, as tabs that the scroll moves through (desktop, lg and up): the
 * section pins, the list on the left lights the current service with a
 * sliding highlight, and the card on the right crossfades. A click on the
 * list jumps there. Under reduced motion nothing pins; the list is plain tabs.
 */
// How much of the top of the screen fixed bars cover (navbar, radio strip).
function fixedTopHeight() {
  const pinned = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const pos = getComputedStyle(n).position;
      if (pos === 'fixed' || pos === 'sticky') return true;
    }
    return false;
  };
  let bottom = 0;
  document.querySelectorAll('header, .radio-live-strip').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.height && r.top < 200 && pinned(el)) bottom = Math.max(bottom, r.bottom);
  });
  return Math.round(bottom);
}

function PinnedServices() {
  const { t } = useI18n();
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const triggerRef = useRef(null);
  const [active, setActive] = useState(0);
  const pill = useSlidingPill(listRef, active);
  const n = SERVICES.length;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || prefersReducedMotion()) return undefined;
    const mm = gsap.matchMedia();
    mm.add('(min-width: 1024px)', () => {
      triggerRef.current = ScrollTrigger.create({
        trigger: el,
        // Pinned just under whatever is fixed at the top (the navbar and the
        // radio strip), measured rather than guessed, so nothing is covered.
        // Centred in the space under the fixed bars (navbar, radio strip),
        // not pressed up against them. The bars grow a little once the page
        // scrolls, so the measurement gets a margin.
        // Then a little lower than the exact middle (56px), which reads as
        // settled rather than hanging under the navbar, while keeping at
        // least 16px clear at the bottom of the screen.
        start: () => {
          const top = fixedTopHeight() + 24;
          const room = window.innerHeight - top;
          const centred = top + Math.max(0, (room - el.offsetHeight) / 2);
          const lowest = window.innerHeight - el.offsetHeight - 16;
          return `top ${Math.round(Math.max(top, Math.min(centred + 56, lowest)))}px`;
        },
        invalidateOnRefresh: true,
        end: () => `+=${Math.round(window.innerHeight * 0.6 * n)}`,
        pin: true,
        anticipatePin: 1,
        onUpdate: (self) => setActive(Math.min(n - 1, Math.floor(self.progress * n))),
      });
      // The bars above change height (the radio strip is dismissed, the
      // navbar settles once the page scrolls): measure the pin again then.
      const ro = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => ScrollTrigger.refresh())
        : null;
      document.querySelectorAll('header').forEach((h) => ro?.observe(h));
      return () => { ro?.disconnect(); triggerRef.current = null; };
    });
    return () => mm.revert();
  }, [n]);

  function choose(i) {
    const st = triggerRef.current;
    if (!st) { setActive(i); return; }
    const y = st.start + ((i + 0.5) / n) * (st.end - st.start);
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  return (
    <div ref={wrapRef} className="mx-auto max-w-7xl px-6 py-6">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <ul ref={listRef} className="relative space-y-1.5" role="tablist" aria-label={t('landing.ourServices')}>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 rounded-[14px] border transition-[transform,width,height,opacity,background-color,border-color] duration-500 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
            style={{ ...pillStyle(pill), borderColor: `${SERVICES[active].color}66`, backgroundColor: `${SERVICES[active].color}1f` }}
          >
            <span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full transition-colors duration-500" style={{ background: SERVICES[active].color }} />
          </span>
          {SERVICES.map((s, i) => {
            const on = i === active;
            const Icon = s.icon;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-pill-active={on ? 'true' : undefined}
                  onClick={() => choose(i)}
                  className={`relative flex w-full items-center gap-4 rounded-[14px] px-4 py-3.5 text-left transition-colors duration-300 ${on ? 'text-white' : 'text-[#8aabcc] hover:text-white'}`}
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br ${s.gradient} transition-opacity duration-300 ${on ? 'opacity-100' : 'opacity-60'}`}>
                    <Icon size={20} strokeWidth={1.9} className="text-white" />
                  </span>
                  <span className="min-w-0 flex-1 text-[19px] font-semibold leading-snug">{t(`svc.${s.id}.title`)}</span>
                  <span className={`shrink-0 font-count text-[13px] ${s.live ? 'text-green-400' : 'text-[#5a7aaa]'}`}>
                    {s.live ? t('landing.live') : t('landing.soon')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {/* All six cards share one grid cell, so the panel is as tall as the
            tallest and the change is a pure crossfade. */}
        <div className="grid" role="tabpanel">
          {SERVICES.map((s, i) => (
            <div
              key={s.id}
              aria-hidden={i !== active}
              className={`flex [grid-area:1/1] transition-opacity duration-500 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none ${i === active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
            >
              <ServiceCard service={s} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function KnowledgeSection() {
  const { t } = useI18n();
  return (
    <section id="services" className="relative py-8 md:py-10">

      <div className="relative mx-auto max-w-7xl px-6">
        <SectionLabel>{t('landing.ourServices')}</SectionLabel>

        <h2 className="mx-auto mt-5 max-w-[820px] md:mt-8 text-center font-display text-[clamp(30px,8vw,46px)] font-bold leading-[1.05] text-white md:text-[62px]">
          {t('know.headPre')}{' '}
          <span className="gradient-text-blue italic">{t('landing.creatorJourney')}</span>
        </h2>

        {/* A phone gets the short line, so the cards are on the first screen. */}
        <p className="mx-auto mt-3 max-w-[340px] text-center text-[15px] leading-snug text-[#bfcfe8] md:hidden">
          {t('hero.mobileSub')}
        </p>
        <p className="mx-auto mt-6 hidden max-w-[760px] text-center text-[clamp(16px,4.3vw,22px)] leading-9 text-[#bfcfe8] md:block md:text-[24px]">
          {t('know.sub')}
        </p>
      </div>

      {/* Phones: compact tool cards in a carousel, the next one peeking in. */}
      <div className="mt-6 md:hidden">
        <ToolCardCarousel />
      </div>

      {/* Tablets: the services as plain cards, two across, no pinning. */}
      <div className="mx-auto mt-10 hidden max-w-7xl gap-4 px-6 md:grid md:grid-cols-2 lg:hidden">
        {SERVICES.map((s) => (
          <div key={s.id} data-card className="flex rounded-2xl">
            <ServiceCard service={s} compact />
          </div>
        ))}
      </div>

      {/* lg and up: scroll moves through the services. */}
      <div className="mt-10 hidden lg:block">
        <PinnedServices />
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
