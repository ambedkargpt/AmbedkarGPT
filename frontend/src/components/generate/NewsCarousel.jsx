import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Clock, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';

/**
 * One level of news (national, state, city, social) as a row of cards that
 * slides sideways, the way a shop shows a shelf of shoes: a few at a glance,
 * arrows to move along, and "View all" for the full grid.
 *
 * @param {object}   p
 * @param {string}   p.title      – the level's name
 * @param {string}   p.subtitle   – one line under it
 * @param {string}   p.accent     – the level's colour
 * @param {Array}    p.items      – adapted news (adaptNews), newest first
 * @param {Function} p.onOpen     – (article) => open it to write a post
 * @param {Function} p.onViewAll  – opens the full grid for this level
 * @param {boolean}  p.loading
 * @param {boolean}  p.comingSoon – a level with no source yet
 * @param {Function} p.accentFor  – (article) => that card's colour
 * @param {Function} p.dateLabel  – (iso) => short date
 */
export default function NewsCarousel({
  title, subtitle, accent = '#3f9fff', items = [], onOpen, onViewAll,
  loading = false, comingSoon = false, accentFor, dateLabel, emptyText,
}) {
  const { t } = useI18n();
  const rowRef = useRef(null);
  const shown = items.slice(0, 12);
  // Paused while the reader's pointer, finger or keyboard focus is on the row.
  const [held, setHeld] = useState(false);

  function slide(dir) {
    const row = rowRef.current;
    if (!row) return;
    row.scrollBy({ left: dir * Math.max(280, row.clientWidth * 0.8), behavior: 'smooth' });
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
      const step = card ? card.getBoundingClientRect().width + 16 : 300;
      const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 8;
      row.scrollTo({ left: atEnd ? 0 : row.scrollLeft + step, behavior: 'smooth' });
    }, 4000);
    return () => { clearInterval(id); io?.disconnect(); };
  }, [held, shown.length]);

  return (
    <section className="mb-8 last:mb-2" aria-label={title}>
      <div className="mb-3.5 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <span className="mb-2 block h-[3px] w-10 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 10px ${accent}88` }} />
          <h2 className="font-display text-[22px] font-bold leading-tight text-white sm:text-[26px]">{title}</h2>
          {subtitle && <p className="mt-1 text-[14px] text-[#8a97b8] sm:text-[15px]">{subtitle}</p>}
        </div>
        {!comingSoon && shown.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => slide(-1)}
              aria-label={t('gen.levels.prev')}
              className="hidden h-10 w-10 items-center justify-center rounded-full border border-[#1e3260]/70 bg-[#0d1531]/80 text-[#a3b0d4] transition hover:border-[#3f9fff]/60 hover:text-white sm:flex"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => slide(1)}
              aria-label={t('gen.levels.next')}
              className="hidden h-10 w-10 items-center justify-center rounded-full border border-[#1e3260]/70 bg-[#0d1531]/80 text-[#a3b0d4] transition hover:border-[#3f9fff]/60 hover:text-white sm:flex"
            >
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              onClick={onViewAll}
              className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold text-white transition hover:brightness-110"
              style={{ backgroundColor: `${accent}26`, border: `1px solid ${accent}66` }}
            >
              {t('gen.levels.viewAll')}
              <ArrowRight size={15} strokeWidth={2.2} />
            </button>
          </div>
        )}
      </div>

      {comingSoon ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[#2a3a6a] bg-[#0b1126]/60 px-5 py-6 text-[15px] text-[#8a97b8]">
          <Clock size={18} className="shrink-0" style={{ color: accent }} />
          {t('gen.levels.comingSoon')}
        </div>
      ) : loading && shown.length === 0 ? (
        <div className="flex gap-4 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <div key={i} className="ag-shimmer h-[200px] w-[280px] shrink-0 rounded-2xl border border-[#1e2636] bg-[#0e1320] sm:w-[320px]" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-[#1e2636] bg-[#0b1126]/60 px-5 py-6 text-[15px] text-[#8a97b8]">
          {emptyText || t('gen.levels.empty')}
        </div>
      ) : (
        <div
          ref={rowRef}
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onTouchStart={() => setHeld(true)}
          onTouchEnd={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={() => setHeld(false)}
          // No scrollbar: the arrows, a swipe and the auto-advance move it.
          // Room above and below (pt / pb, pulled back with -mt): a scrolling
          // row clips both ways, and a hovered card rises 6px with a shadow,
          // which cut its top off.
          className="-mx-4 -mt-3 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto scroll-smooth px-4 pb-6 pt-3 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 md:-mx-8 md:scroll-px-8 md:px-8 [&::-webkit-scrollbar]:hidden"
        >
          {shown.map((a, i) => {
            const cardAccent = accentFor ? accentFor(a) : accent;
            return (
              <button
                key={a.id}
                type="button"
                data-story-card
                onClick={() => onOpen(a)}
                className="ag-rise ag-card group flex w-[78vw] max-w-[320px] shrink-0 snap-start flex-col rounded-2xl border bg-[#0e1320] p-5 text-left sm:w-[320px]"
                style={{ borderColor: 'rgba(30,38,54,0.9)', borderTop: `3px solid ${cardAccent}`, '--i': i, '--cat': cardAccent }}
              >
                <span className="mb-2 text-[12.5px] font-semibold" style={{ color: cardAccent }}>
                  {a.source || a.category}
                </span>
                <span className="font-hindi line-clamp-3 text-[17.5px] font-bold leading-[1.55] text-white">
                  {a.title}
                </span>
                <span className="font-hindi mt-2 line-clamp-2 text-[14px] leading-[1.6] text-[#a9b6d4]">
                  {a.summary}
                </span>
                <span className="mt-auto flex items-center justify-between gap-2 pt-4 text-[13px]">
                  <span className="font-count text-[#6b7a9e]">{dateLabel ? dateLabel(a.date) : ''}</span>
                  <span className="inline-flex items-center gap-1 font-semibold" style={{ color: cardAccent }}>
                    <Sparkles size={13} />
                    {t('gen.generate')}
                    <ArrowRight size={13} className="ag-arrow" />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
