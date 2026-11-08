import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, List,
  Search, Sparkles, Users, Flag, Star, X as XIcon, SlidersHorizontal, CalendarDays,
} from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import { byParty, newsDate, partyMeta, partyShort } from './partyMeta';
import { PartyChip, PartySymbol } from './PartyMark';

const PAGE_SIZE = 13; // a featured story and twelve more
const VIEW_KEY = 'ambedkargpt-news-view';
const SORT_KEY = 'ambedkargpt-news-order';

function readLocal(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function writeLocal(key, value) {
  try { localStorage.setItem(key, value); } catch { /* the choice just is not remembered */ }
}

const DAY = 86400000;
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function inWhen(date, when) {
  if (when === 'all') return true;
  const ms = Date.parse(date);
  if (Number.isNaN(ms)) return false;
  const today = startOfToday();
  if (when === 'today') return ms >= today;
  if (when === 'yesterday') return ms >= today - DAY && ms < today;
  return ms >= Date.now() - 7 * DAY;
}

// The calendar day a story belongs to, for the dividers between days.
function dayOf(d) {
  const ms = Date.parse(d);
  if (Number.isNaN(ms)) return 'undated';
  const x = new Date(ms);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function dayLabel(day, t, lang) {
  if (day === 'undated') return '';
  const today = startOfToday();
  if (day === today) return t('gen.browse.today');
  if (day === today - DAY) return t('gen.browse.yesterday');
  return new Date(day).toLocaleDateString(lang === 'hi' ? 'hi-IN' : undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** A rule across the grid where the stories move on to an earlier (or later) day. */
function DayDivider({ day, count, t, lang }) {
  const label = dayLabel(day, t, lang);
  const sub = day !== 'undated' && day >= startOfToday() - DAY
    ? new Date(day).toLocaleDateString(lang === 'hi' ? 'hi-IN' : undefined, { day: 'numeric', month: 'long' })
    : '';
  return (
    <div className="col-span-full flex items-center gap-3 pt-2 first:pt-0" role="separator" aria-label={label}>
      <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-4 py-1.5 text-[15px] font-bold text-white">
        <CalendarDays size={15} className="text-[#8FA8FF]" />
        {label}
        {sub && <span className="font-medium text-[#9fb0d4]">· {sub}</span>}
      </span>
      <span className="font-count text-[13px] text-[#7f8db3]">{t(count === 1 ? 'gen.browse.dayOne' : 'gen.browse.dayMany', { n: count })}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-white/20 to-transparent" />
    </div>
  );
}

function shortDate(d, lang) {
  return newsDate(d, lang);
}

/**
 * Every story of one level, laid out the way rssgpt lays out its feed: a panel
 * of choices on the left (whose news, when, which topic, which kind) and the
 * stories on the right, the first one large as the top story.
 */
export default function NewsBrowser({
  levelTitle, articles, loading, error, onRetry, onOpen, onBack,
  partySlug, partyName, partyTagline, welcomeName, roleName, stateControl,
}) {
  const { t, lang } = useI18n();
  const [section, setSection] = useState('party');
  const [when, setWhen] = useState('all');
  const [topic, setTopic] = useState('all');
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(() => readLocal(SORT_KEY, 'party'));
  const [view, setView] = useState(() => readLocal(VIEW_KEY, 'grid'));
  const [page, setPage] = useState(1);
  // Phones: when / topic / kind fold behind one button, so the stories are not a screen away.
  const [filtersShown, setFiltersShown] = useState(false);

  const partyList = useMemo(
    () => (partySlug ? articles.filter((a) => a.tenantSlug === partySlug) : articles),
    [articles, partySlug],
  );
  const oppositionList = useMemo(
    () => (partySlug ? articles.filter((a) => a.tenantSlug !== partySlug && a.tenantSlug !== 'general') : []),
    [articles, partySlug],
  );
  const base = !partySlug ? articles.filter((a) => a.tenantSlug !== 'general')
    : section === 'opposition' ? oppositionList : partyList;

  const topics = useMemo(() => {
    const counts = new Map();
    for (const a of base) if (a.category) counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
    return [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30);
  }, [base]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = base.filter((a) => inWhen(a.date, when)
      && (topic === 'all' || a.category === topic)
      && (kind === 'all' || a.contentType === kind)
      && (!q || `${a.title} ${a.summary || ''}`.toLowerCase().includes(q)));
    if (sort === 'party') return byParty(list, partySlug);
    const dir = sort === 'oldest' ? 1 : -1;
    return [...list].sort((x, y) => dir * ((Date.parse(x.date) || 0) - (Date.parse(y.date) || 0)));
  }, [base, when, topic, kind, query, sort, partySlug]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const featured = view === 'grid' && current === 1 ? shown[0] : null;

  const filtersOn = (when !== 'all') + (topic !== 'all') + (kind !== 'all') + (query ? 1 : 0);
  const accent = section === 'opposition' ? '#e5484d' : partyMeta(partySlug).color;

  function reset(fn) { return (v) => { fn(v); setPage(1); }; }
  const pickSection = reset((v) => { setSection(v); setTopic('all'); });

  const sections = [
    { id: 'party', Icon: Flag, label: t('gen.partyNews'), sub: t('gen.browse.partySub', { party: partyName || '' }), count: partyList.length, color: partyMeta(partySlug).color },
    { id: 'opposition', Icon: Users, label: t('gen.oppositionNews'), sub: t('gen.browse.oppSub'), count: oppositionList.length, color: '#e5484d' },
  ];

  const today = new Date().toLocaleDateString(lang === 'hi' ? 'hi-IN' : undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="ag-page-in">
      <button
        type="button"
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[15px] font-semibold text-[#c7d1eb] transition hover:border-white/25 hover:text-white"
      >
        <ArrowLeft size={16} strokeWidth={2.2} />
        {t('gen.levels.allLevels')}
        <span className="text-[#6b7a9e]">·</span>
        <span className="text-white">{levelTitle}</span>
      </button>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)] [&>*]:min-w-0">
        {/* ── The panel of choices ── */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div
            className="relative overflow-hidden rounded-[20px] border border-white/[0.08] p-5"
            style={{ background: 'linear-gradient(165deg, #141d44 0%, #0c1230 45%, #0a0f26 100%)', boxShadow: '0 20px 50px rgba(2,6,20,0.5)' }}
          >
            <span className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl" style={{ background: `${partyMeta(partySlug).color}30` }} />

            {partySlug && (
              <div className="relative flex items-center gap-3.5">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px]"
                  style={{ background: `linear-gradient(140deg, ${partyMeta(partySlug).color} 0%, ${partyMeta(partySlug).glow} 100%)`, boxShadow: `0 10px 26px ${partyMeta(partySlug).glow}66` }}
                >
                  <PartySymbol slug={partySlug} size={34} color="#ffffff" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-[21px] font-bold uppercase leading-tight tracking-wide text-white">{partyName}</p>
                  {partyTagline && <p className="mt-0.5 text-[13px] leading-snug text-[#9fb0d4]">{partyTagline}</p>}
                </div>
              </div>
            )}

            {(welcomeName || roleName) && (
              <div className="relative mt-4 hidden items-center gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.035] px-3.5 py-3 lg:flex">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3f9fff] to-[#5b7cff] font-display text-[17px] font-bold text-white">
                  {(welcomeName || '?')[0]?.toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[17px] font-semibold text-white">{t('gen.browse.welcome', { name: welcomeName })}</p>
                  {roleName && <p className="truncate text-[13px] font-medium text-[#9db8ff]">{roleName}</p>}
                </div>
              </div>
            )}

            {partySlug && (
              <>
                <PanelLabel>{t('gen.browse.chooseNews')}</PanelLabel>
                <div className="relative grid min-w-0 gap-2.5">
                  {sections.map((s) => {
                    const on = section === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickSection(s.id)}
                        aria-pressed={on}
                        className="flex w-full min-w-0 items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition"
                        style={on
                          ? { borderColor: `${s.color}aa`, background: `linear-gradient(135deg, ${s.color}e6 0%, ${s.color}99 100%)`, boxShadow: `0 10px 26px ${s.color}44` }
                          : { borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)' }}
                      >
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${on ? 'bg-black/25 text-white' : 'bg-white/[0.06] text-[#9fb0d4]'}`}>
                          <s.Icon size={18} strokeWidth={2.1} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[17px] font-semibold text-white">{s.label}</span>
                          <span className={`block truncate text-[13px] ${on ? 'text-white/85' : 'text-[#7f8db3]'}`}>{s.sub}</span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-count text-[13px] font-bold ${on ? 'bg-black/30 text-white' : 'bg-white/[0.07] text-[#9fb0d4]'}`}>
                          {s.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {stateControl && (
              <>
                <PanelLabel>{t('gen.statePicker')}</PanelLabel>
                <div className="relative">{stateControl}</div>
              </>
            )}

            <button
              type="button"
              onClick={() => setFiltersShown((v) => !v)}
              aria-expanded={filtersShown}
              className="relative mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.04] text-[15px] font-semibold text-white lg:hidden"
            >
              <SlidersHorizontal size={16} />
              {t('gen.filterNewsBtn')}
              {filtersOn > 0 && <span className="rounded-full bg-[#3f9fff] px-2 font-count text-[13px]">{filtersOn}</span>}
              <ChevronDown size={16} className={`transition-transform ${filtersShown ? 'rotate-180' : ''}`} />
            </button>
            <div className={`${filtersShown ? '' : 'hidden'} lg:block`}>
            <PanelLabel>{t('gen.browse.when')}</PanelLabel>
            <div className="relative grid grid-cols-2 gap-2">
              {[
                ['all', 'gen.browse.anytime'], ['today', 'gen.browse.today'],
                ['yesterday', 'gen.browse.yesterday'], ['week', 'gen.browse.week'],
              ].map(([id, key]) => {
                const on = when === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => reset(setWhen)(id)}
                    aria-pressed={on}
                    className={`h-11 rounded-full text-[15px] font-semibold transition ${on ? 'bg-white text-[#0b1029] shadow-[0_6px_18px_rgba(255,255,255,0.18)]' : 'border border-white/10 bg-white/[0.03] text-[#c7d1eb] hover:border-white/25 hover:text-white'}`}
                  >
                    {t(key)}
                  </button>
                );
              })}
            </div>

            <div className="relative mt-4 grid gap-2.5">
              <Select value={topic} onChange={reset(setTopic)} label={t('gen.browse.topic')}>
                <option value="all">{t('gen.browse.allTopics')}</option>
                {topics.map(([name, n]) => <option key={name} value={name}>{name} ({n})</option>)}
              </Select>
              <Select value={kind} onChange={reset(setKind)} label={t('gen.browse.kind')}>
                <option value="all">{t('gen.browse.allKinds')}</option>
                <option value="news">{t('gen.newsArticle')}</option>
                <option value="press_conference">{t('gen.pressConference')}</option>
              </Select>
            </div>

            {filtersOn > 0 && (
              <button
                type="button"
                onClick={() => { setWhen('all'); setTopic('all'); setKind('all'); setQuery(''); setPage(1); }}
                className="relative mt-3 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#9fb0d4] transition hover:text-white"
              >
                <XIcon size={14} /> {t('gen.clearFilters')}
              </button>
            )}
            </div>
          </div>
        </aside>

        {/* ── The stories ── */}
        <main className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="font-display text-[28px] font-bold uppercase leading-none tracking-tight text-white sm:text-[40px]">
              {t('gen.browse.titleA')}{' '}
              <span className="bg-gradient-to-r from-[#9db8ff] via-[#ff7a59] to-[#ff4f8b] bg-clip-text text-transparent">{t('gen.browse.titleB')}</span>
              {' '}{t('gen.browse.titleC')}
            </h1>
            <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
              <label className="relative min-w-0 basis-full sm:w-[260px] sm:basis-auto sm:flex-none">
                <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7f8db3]" />
                <span className="sr-only">{t('gen.browse.search')}</span>
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                  placeholder={t('gen.browse.search')}
                  className="h-12 w-full rounded-full border border-white/10 bg-white/[0.04] pl-11 pr-4 text-[15px] text-white placeholder-[#7f8db3] outline-none transition focus:border-[#3f9fff] focus:bg-white/[0.06]"
                />
              </label>
              <div className="relative">
                <select
                  value={sort}
                  onChange={(e) => { setSort(e.target.value); writeLocal(SORT_KEY, e.target.value); setPage(1); }}
                  aria-label={t('gen.browse.sort')}
                  className="h-12 appearance-none rounded-full border border-white/10 bg-[#0e1531] pl-4 pr-10 text-[15px] font-medium text-white outline-none transition focus:border-[#3f9fff]"
                >
                  <option value="party">{t('gen.browse.byParty')}</option>
                  <option value="latest">{t('gen.latestFirst')}</option>
                  <option value="oldest">{t('gen.oldestFirst')}</option>
                </select>
                <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7f8db3]" />
              </div>
              <div className="flex h-12 items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
                {[['list', List, 'gen.viewList'], ['grid', LayoutGrid, 'gen.viewGrid']].map(([id, Icon, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => { setView(id); writeLocal(VIEW_KEY, id); }}
                    aria-pressed={view === id}
                    aria-label={t(label)}
                    title={t(label)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition ${view === id ? 'bg-white text-[#0b1029]' : 'text-[#9fb0d4] hover:text-white'}`}
                  >
                    <Icon size={17} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mb-5 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-display text-[21px] font-bold uppercase tracking-wide" style={{ color: accent }}>
              {section === 'opposition' ? t('gen.oppositionNews') : t('gen.browse.headlines')}
            </span>
            <span className="rounded-full px-3 py-0.5 font-count text-[15px] font-bold" style={{ color: accent, background: `${accent}1f`, border: `1px solid ${accent}44` }}>
              {filtered.length} {t(filtered.length === 1 ? 'gen.storyOne' : 'gen.storyMany')}
            </span>
            <span className="text-[15px] text-[#8f9cc2]">{t('gen.browse.pick')}</span>
            <span className="ml-auto hidden font-count text-[15px] text-[#7f8db3] sm:block">{today}</span>
          </div>

          {loading && articles.length === 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className={`ag-shimmer h-[250px] rounded-[20px] border border-white/[0.06] bg-[#0e1430] ${i === 0 ? 'sm:col-span-2' : ''}`} />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 rounded-[20px] border border-red-500/25 bg-red-500/[0.06] px-6 py-12 text-center">
              <p className="text-[17px] text-red-300">{t('gen.failedToLoad')}</p>
              <button type="button" onClick={onRetry} className="rounded-full border border-red-400/40 bg-red-500/10 px-5 py-2 text-[15px] font-semibold text-red-200 transition hover:bg-red-500/20">
                {t('gen.retry')}
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] px-6 py-14 text-center">
              <p className="text-[17px] font-semibold text-white">{t('gen.noArticlesFound')}</p>
              <p className="mt-1 text-[15px] text-[#8f9cc2]">{t('gen.tryDifferent')}</p>
            </div>
          ) : (
            <>
              <div className={view === 'list' ? 'flex flex-col gap-3' : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
                {shown.map((a, i) => {
                  // A divider wherever the day changes from the story before.
                  const day = dayOf(a.date);
                  const newDay = i === 0 || dayOf(shown[i - 1].date) !== day;
                  let n = 0;
                  if (newDay) for (let j = i; j < shown.length && dayOf(shown[j].date) === day; j++) n++;
                  const card = a === featured
                    ? <FeaturedCard key={a.id} article={a} onOpen={onOpen} t={t} lang={lang} />
                    : view === 'list'
                      ? <RowCard key={a.id} article={a} onOpen={onOpen} t={t} lang={lang} index={i} />
                      : <GridCard key={a.id} article={a} onOpen={onOpen} t={t} lang={lang} index={i} />;
                  return newDay && day !== 'undated'
                    ? [<DayDivider key={`day-${day}-${i}`} day={day} count={n} t={t} lang={lang} />, card]
                    : card;
                })}
              </div>

              {pages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, current - 1))}
                    disabled={current === 1}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 text-[15px] font-semibold text-[#c7d1eb] transition hover:border-white/25 hover:text-white disabled:opacity-35"
                  >
                    <ChevronLeft size={16} /> {t('gen.prev')}
                  </button>
                  <span className="font-count text-[15px] text-[#9fb0d4]">{current} / {pages}</span>
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(pages, current + 1))}
                    disabled={current === pages}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 text-[15px] font-semibold text-[#c7d1eb] transition hover:border-white/25 hover:text-white disabled:opacity-35"
                  >
                    {t('gen.next')} <ChevronRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function PanelLabel({ children }) {
  const { lang } = useI18n();
  return <p className={`relative mb-2.5 mt-5 font-semibold uppercase text-[#8f9cc2] ${lang === 'hi' ? 'text-[15px]' : 'font-count text-[13px] tracking-[0.2em]'}`}>{children}</p>;
}

function Select({ value, onChange, label, children }) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full appearance-none rounded-[14px] border border-white/10 bg-[#0e1531] pl-4 pr-10 text-[15px] font-medium text-white outline-none transition focus:border-[#3f9fff]"
      >
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#7f8db3]" />
    </label>
  );
}

function WriteButton({ color, t, solid = false }) {
  return (
    <span
      className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-5 text-[15px] font-bold transition group-hover:gap-3"
      style={solid
        ? { background: `linear-gradient(135deg, ${color} 0%, ${color}cc 100%)`, color: '#fff', boxShadow: `0 8px 22px ${color}55` }
        : { background: `linear-gradient(135deg, ${color}e6 0%, ${color}b3 100%)`, color: '#fff', boxShadow: `0 6px 18px ${color}40` }}
    >
      {t('gen.feed.writePost')}
      <ArrowRight size={16} strokeWidth={2.4} />
    </span>
  );
}

/** The top story: twice as wide, on its party's colour, with the symbol behind it. */
function FeaturedCard({ article: a, onOpen, t, lang }) {
  const meta = partyMeta(a.tenantSlug);
  return (
    <button
      type="button"
      onClick={(e) => onOpen(a, e.currentTarget)}
      className="ag-rise group relative flex min-h-[260px] flex-col overflow-hidden rounded-[20px] border p-6 text-left transition duration-300 hover:-translate-y-1 sm:col-span-2 sm:p-7"
      style={{
        borderColor: `${meta.color}55`,
        background: `radial-gradient(120% 140% at 100% 0%, ${meta.color}55 0%, transparent 50%), linear-gradient(130deg, #1b1430 0%, #120f26 45%, #0b0f24 100%)`,
        boxShadow: `0 20px 50px ${meta.glow}33`,
      }}
    >
      <PartySymbol slug={a.tenantSlug} size={210} className="pointer-events-none absolute -bottom-10 -right-6 opacity-[0.12] transition-transform duration-700 group-hover:scale-105" color="#ffffff" />
      <div className="relative flex flex-wrap items-center gap-2">
        {a.category && (
          <span className="rounded-full px-3 py-1 font-hindi text-[15px] font-semibold text-white" style={{ background: `${meta.color}d9` }}>{a.category}</span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#8fb0ff] px-3 py-1 text-[15px] font-bold text-[#ffffff]">
          <Star size={13} fill="currentColor" /> {t('gen.browse.topStory')}
        </span>
        <PartyChip slug={a.tenantSlug} />
        <span className="font-count text-[15px] text-white/60">{shortDate(a.date, lang)}</span>
      </div>
      <p data-vt-title className="font-hindi relative mt-4 line-clamp-3 max-w-[760px] text-[clamp(23px,1.4vw+14px,32px)] font-bold leading-[1.45] text-white">
        {a.title}
      </p>
      <div className="relative mt-auto pt-5">
        <WriteButton color="#3f9fff" t={t} solid />
      </div>
    </button>
  );
}

function GridCard({ article: a, onOpen, t, lang, index }) {
  const meta = partyMeta(a.tenantSlug);
  return (
    <button
      type="button"
      onClick={(e) => onOpen(a, e.currentTarget)}
      className="ag-rise group relative flex min-h-[260px] flex-col overflow-hidden rounded-[20px] border border-white/[0.07] p-5 text-left transition duration-300 hover:-translate-y-1"
      style={{ '--i': index, background: 'linear-gradient(180deg, #121a3a 0%, #0b1029 100%)', boxShadow: '0 10px 30px rgba(2,6,20,0.45)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${meta.color}88`; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
    >
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${meta.color} 0%, ${meta.glow}00 100%)` }} />
      <div className="flex flex-wrap items-center gap-2">
        {a.category && (
          <span className="max-w-full truncate rounded-full px-2.5 py-0.5 font-hindi text-[13px] font-semibold" style={{ color: meta.color, background: `${meta.color}1c`, border: `1px solid ${meta.color}44` }}>
            {a.category}
          </span>
        )}
        <PartyChip slug={a.tenantSlug} />
      </div>
      <p data-vt-title className="font-hindi mt-3.5 line-clamp-3 text-[clamp(19px,0.5vw+14px,21px)] font-semibold leading-[1.5] text-white">{a.title}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-5">
        <WriteButton color={meta.color} t={t} />
        <span className="font-count text-[15px] text-[#7f8db3]">{shortDate(a.date, lang)}</span>
      </div>
    </button>
  );
}

function RowCard({ article: a, onOpen, t, lang, index }) {
  const meta = partyMeta(a.tenantSlug);
  return (
    <button
      type="button"
      onClick={(e) => onOpen(a, e.currentTarget)}
      className="ag-rise group flex items-center gap-4 rounded-[20px] border border-white/[0.07] px-4 py-3.5 text-left transition hover:border-white/20 sm:px-5"
      style={{ '--i': index, background: 'linear-gradient(100deg, #121a3a 0%, #0b1029 100%)' }}
    >
      <span className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-[14px] sm:flex" style={{ background: `linear-gradient(140deg, ${meta.color}55 0%, ${meta.glow}22 100%)` }}>
        <PartySymbol slug={a.tenantSlug} size={30} color="#ffffff" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="font-bold" style={{ color: meta.color }}>{partyShort(a.tenantSlug, lang)}</span>
          {a.category && <span className="font-hindi text-[#9fb0d4]">{a.category}</span>}
          <span className="font-count text-[#6b7a9e]">{shortDate(a.date, lang)}</span>
        </span>
        <span data-vt-title className="font-hindi mt-1 line-clamp-2 block text-[17px] font-semibold leading-[1.5] text-white">{a.title}</span>
      </span>
      <span className="hidden shrink-0 sm:block"><WriteButton color={meta.color} t={t} /></span>
      <Sparkles size={18} className="shrink-0 sm:hidden" style={{ color: meta.color }} />
    </button>
  );
}
