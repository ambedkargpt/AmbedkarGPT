import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Clock, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import { partyMeta } from './partyMeta';
import { PartyChip, PartySymbol } from './PartyMark';

/**
 * One level of news (national, state, city, social) as a shelf of cards that
 * slides sideways, the way a shop shows a row of products: a few at a glance,
 * arrows to move along, and "View all" for the full page.
 *
 * Each card is a story with its party's symbol as the "product shot", so a
 * row reads INC, SP, BJP at a glance before a headline is read.
 *
 * @param {object}    p
 * @param {string}    p.title      – the level's name
 * @param {string}    p.subtitle   – one line under it
 * @param {string}    p.accent     – the level's colour
 * @param {Component} p.Icon       – the level's icon (lucide)
 * @param {Array}     p.items      – adapted news (adaptNews), already in order
 * @param {Function}  p.onOpen     – (article) => open it to write a post
 * @param {Function}  p.onViewAll  – opens the full page for this level
 * @param {boolean}   p.loading
 * @param {boolean}   p.comingSoon – a level with no source yet
 * @param {Function}  p.dateLabel  – (iso) => short date
 */
const GAP = 18;

export default function NewsCarousel({
  title, subtitle, accent = '#3f9fff', Icon, items = [], onOpen, onViewAll,
  loading = false, comingSoon = false, dateLabel, emptyText, headingControl, total,
}) {
  const { t } = useI18n();
  const rowRef = useRef(null);
  const shown = items.slice(0, 14);
  // Paused while the reader's pointer, finger or keyboard focus is on the row.
  const [held, setHeld] = useState(false);

  function slide(dir) {
    const row = rowRef.current;
    if (!row) return;
    // A whole shelf at a time: the cards are sized to fill the row exactly,
    // so moving by the row's width plus one gap lands on the next full set.
    row.scrollBy({ left: dir * (row.clientWidth + GAP), behavior: 'smooth' });
  }

  // Moves on by one card every few seconds, as the landing page's carousels
  // do, and starts over at the end. Only while the row is on screen, never
  // while held, and not at all under reduced motion.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || held || shown.length < 2) return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let visible = true;
    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.3 })
      : null;
    io?.observe(row);
    const id = setInterval(() => {
      if (!visible) return;
      const card = row.querySelector('[data-story-card]');
      const step = card ? card.getBoundingClientRect().width + GAP : 300;
      const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 8;
      row.scrollTo({ left: atEnd ? 0 : row.scrollLeft + step, behavior: 'smooth' });
    }, 4500);
    return () => { clearInterval(id); io?.disconnect(); };
  }, [held, shown.length]);

  const count = total ?? items.length;

  return (
    <section className="relative mb-10 last:mb-2" aria-label={title}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          {Icon && (
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
              style={{
                background: `linear-gradient(140deg, ${accent} 0%, ${accent}99 100%)`,
                boxShadow: `0 10px 28px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
              }}
            >
              <Icon size={22} strokeWidth={2.1} />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2 className="break-words font-display text-[23px] font-bold leading-tight text-white [overflow-wrap:anywhere] sm:text-[27px]">{title}</h2>
              {!comingSoon && count > 0 && (
                <span
                  className="rounded-full px-2.5 py-0.5 font-count text-[13px] font-bold"
                  style={{ color: accent, background: `${accent}1f`, border: `1px solid ${accent}44` }}
                >
                  {count}
                </span>
              )}
              {headingControl}
            </div>
            {subtitle && <p className="mt-0.5 text-[15px] text-[#8f9cc2] sm:text-[16px]">{subtitle}</p>}
          </div>
        </div>
        {!comingSoon && shown.length > 0 && (
          <button
            type="button"
            onClick={onViewAll}
            className="group inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[15px] font-semibold text-white transition hover:brightness-110"
            style={{
              background: `linear-gradient(135deg, ${accent}40 0%, ${accent}14 100%)`,
              border: `1px solid ${accent}77`,
              boxShadow: `0 6px 20px ${accent}22`,
            }}
          >
            {t('gen.levels.viewAll')}
            <ArrowRight size={16} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
      </div>

      {comingSoon ? (
        <div
          className="relative flex items-center gap-4 overflow-hidden rounded-3xl border px-6 py-7"
          style={{ borderColor: `${accent}40`, background: `linear-gradient(110deg, ${accent}1f 0%, rgba(12,18,40,0.7) 55%, rgba(12,18,40,0.4) 100%)` }}
        >
          <span className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full blur-3xl" style={{ background: `${accent}33` }} />
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: `${accent}26`, color: accent }}>
            <Clock size={20} />
          </span>
          <div className="relative min-w-0">
            <p className="text-[17px] font-semibold text-white">{t('gen.levels.comingSoon')}</p>
            <p className="text-[14.5px] text-[#93a0c4]">{t('gen.feed.soonSub')}</p>
          </div>
        </div>
      ) : loading && shown.length === 0 ? (
        <div className="flex gap-[18px] overflow-hidden">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ag-shimmer h-[300px] w-[290px] shrink-0 rounded-[24px] border border-white/[0.06] bg-[#0e1430]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-3xl border border-white/[0.07] bg-[#0b1126]/60 px-6 py-7 text-[15.5px] text-[#8f9cc2]">
          {emptyText || t('gen.levels.empty')}
        </div>
      ) : (
        <div className="relative sm:px-14">
          {/* The arrows sit beside the shelf, halfway down the cards, where
              the eye already is. From sm the row is inset 64px each side, so
              they stand in that gutter rather than over a headline. */}
          <button
            type="button"
            onClick={() => slide(-1)}
            aria-label={t('gen.levels.prev')}
            className="absolute left-0 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#121b42]/90 text-white shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur transition hover:scale-105 hover:border-white/40 sm:flex"
          >
            <ChevronLeft size={22} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={() => slide(1)}
            aria-label={t('gen.levels.next')}
            className="absolute right-0 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#121b42]/90 text-white shadow-[0_10px_30px_rgba(0,0,0,0.55)] backdrop-blur transition hover:scale-105 hover:border-white/40 sm:flex"
          >
            <ChevronRight size={22} strokeWidth={2.4} />
          </button>
          <div
            ref={rowRef}
            onMouseEnter={() => setHeld(true)}
            onMouseLeave={() => setHeld(false)}
            onTouchStart={() => setHeld(true)}
            onTouchEnd={() => setHeld(false)}
            onFocus={() => setHeld(true)}
            onBlur={() => setHeld(false)}
            // No scrollbar: the arrows, a swipe and the auto-advance move it.
            // Room above and below, pulled back with -mt: a scrolling row clips
            // both ways, and a hovered card rises with a shadow. No side
            // padding from sm: the row ends where its last whole card ends.
            className="-mx-4 -mt-3 flex snap-x snap-mandatory scroll-px-4 gap-[18px] overflow-x-auto scroll-smooth px-4 pb-7 pt-3 [scrollbar-width:none] sm:mx-0 sm:scroll-px-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {shown.map((a, i) => (
              <StoryCard key={a.id} article={a} index={i} onOpen={onOpen} dateLabel={dateLabel} t={t} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** A story as a product card: the party's symbol on a coloured stage, then the headline. */
function StoryCard({ article: a, index, onOpen, dateLabel, t }) {
  const meta = partyMeta(a.tenantSlug);
  const c = meta.color;
  return (
    <button
      type="button"
      data-story-card
      onClick={() => onOpen(a)}
      className="ag-rise group relative flex h-[312px] w-[80vw] max-w-[318px] shrink-0 snap-start flex-col overflow-hidden rounded-[24px] border text-left transition duration-300 hover:-translate-y-1.5 sm:w-[calc((100%-18px)/2)] sm:max-w-none lg:w-[calc((100%-36px)/3)] 2xl:w-[calc((100%-54px)/4)]"
      style={{
        '--i': index,
        borderColor: 'rgba(255,255,255,0.07)',
        background: 'linear-gradient(180deg, #121a3a 0%, #0b1029 100%)',
        boxShadow: '0 10px 30px rgba(2,6,20,0.45)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${c}88`; e.currentTarget.style.boxShadow = `0 18px 40px ${meta.glow}33, 0 0 0 1px ${c}55`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(2,6,20,0.45)'; }}
    >
      {/* The stage: the party's colour, a faint grid and its symbol. */}
      <div
        className="relative h-[96px] shrink-0 overflow-hidden"
        style={{ background: `radial-gradient(130% 140% at 100% 0%, ${c}66 0%, transparent 55%), linear-gradient(120deg, ${meta.glow}40 0%, rgba(14,20,48,0.2) 70%)` }}
      >
        <span
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            maskImage: 'linear-gradient(90deg, transparent 0%, #000 60%)',
            WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 60%)',
          }}
        />
        <PartySymbol
          slug={a.tenantSlug}
          size={78}
          className="absolute -bottom-2 right-3 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110"
          color="rgba(255,255,255,0.92)"
        />
        <div className="absolute left-4 top-4 flex items-center gap-2">
          <PartyChip slug={a.tenantSlug} className="backdrop-blur-sm" />
        </div>
        {dateLabel && (
          <span className="absolute bottom-3 left-4 font-count text-[13px] font-medium text-white/75">{dateLabel(a.date)}</span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-5 pb-4 pt-4">
        <span className="font-hindi line-clamp-3 text-[clamp(19px,0.5vw+14px,21px)] font-semibold leading-[1.5] text-white">
          {a.title}
        </span>
        <span
          className="mt-auto inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white transition duration-300"
          style={{ background: `linear-gradient(135deg, ${c}38 0%, ${c}18 100%)`, border: `1px solid ${c}55` }}
        >
          <Sparkles size={15} />
          {t('gen.feed.writePost')}
          <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </button>
  );
}
