import { ArrowRight, ChevronDown, FileText, Globe, LayoutGrid, List, Radio, Search } from 'lucide-react';
import Spinner from '../Spinner';
import { useI18n } from '../../i18n/index.jsx';
import { MAX_POSTS_PER_STORY } from '../../data/postLimits';

// The news page from lg up, laid out the way rssgpt's /write is: a rail that
// chooses what to read (party, section, day, type) and a feed
// of cards. Drawn in the dashboard's own surfaces, so it reads as one product
// with it. Phones and tablets keep the page's own feed markup.

const SECTION_ACCENT = { party: '#3f9fff', opposition: '#e5484d', general: '#f0a63a' };

const TYPE_OPTIONS = [
  { id: 'all', label: 'gen.v2.allTypes' },
  { id: 'press_conference', label: 'gen.pressConference' },
  { id: 'news', label: 'gen.newsArticle' },
];

function accentFor(article) {
  if (article.tenantSlug === 'general') return SECTION_ACCENT.general;
  if (article.tenantSlug === 'bjp') return SECTION_ACCENT.opposition;
  return SECTION_ACCENT.party;
}

function locale(lang) {
  return lang === 'hi' ? 'hi-IN' : 'en-IN';
}

function shortDate(dateValue, lang) {
  const d = new Date(dateValue ?? '');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale(lang), { day: 'numeric', month: lang === 'hi' ? 'long' : 'short' });
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "आज" / "कल" for the two most recent days, the date for anything older. */
function dayChipLabel(key, t, lang) {
  const d = new Date(Number(key));
  if (Number.isNaN(d.getTime())) return t('gen.v2.undated');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return t('gen.v2.today');
  if (sameDay(d, yesterday)) return t('gen.v2.yesterday');
  return d.toLocaleDateString(locale(lang), { day: 'numeric', month: 'short' });
}

function SectionIcon({ id, partyLogo, partyShort, active, accent }) {
  const base = 'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl';
  if (id === 'party') {
    return (
      <span className={`${base} relative font-display text-[11px] font-bold text-white`} style={{ backgroundColor: active ? 'rgba(255,255,255,0.18)' : 'rgba(30,38,54,0.9)' }}>
        {partyShort}
        {partyLogo && (
          <img src={partyLogo} alt="" className="absolute inset-0 h-full w-full bg-white object-contain p-0.5" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        )}
      </span>
    );
  }
  if (id === 'opposition') {
    return (
      <span className={`${base} font-display text-[11px] font-bold`} style={{ backgroundColor: active ? 'rgba(255,255,255,0.18)' : 'rgba(30,38,54,0.9)', color: active ? '#fff' : accent }}>
        BJP
      </span>
    );
  }
  return (
    <span className={base} style={{ backgroundColor: active ? 'rgba(255,255,255,0.18)' : 'rgba(30,38,54,0.9)', color: active ? '#fff' : '#8b94b8' }}>
      <Globe size={17} strokeWidth={1.9} />
    </span>
  );
}

function TypeChip({ type }) {
  const { t } = useI18n();
  const press = type === 'press_conference';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
      style={press
        ? { backgroundColor: 'rgba(240,166,58,0.16)', color: '#f5b860' }
        : { backgroundColor: 'rgba(63,159,255,0.12)', color: '#8fb6ff' }}
    >
      {press ? <Radio size={11} strokeWidth={2.2} /> : <FileText size={11} strokeWidth={2.2} />}
      {t(press ? 'gen.pressConference' : 'gen.newsArticle')}
    </span>
  );
}

function WriteButton({ full, onClick, lead }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={full}
      title={full ? t('gen.v2.slotsFull') : undefined}
      className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 ${
        lead ? 'bg-white text-[#0a1030]' : 'btn-gradient text-white'
      }`}
    >
      {t('gen.v2.write')}
      <ArrowRight size={15} strokeWidth={2.2} />
    </button>
  );
}

function SlotChip({ count }) {
  if (!count) return null;
  return (
    <span className="rounded-full border border-[#3f9fff]/40 bg-[#3f9fff]/10 px-2.5 py-0.5 font-count text-[12px] font-semibold text-[#8fb6ff]">
      {count}/{MAX_POSTS_PER_STORY}
    </span>
  );
}

function StoryCard({ article, lead, count, onOpen }) {
  const { t, lang } = useI18n();
  const accent = accentFor(article);
  const full = count >= MAX_POSTS_PER_STORY;
  return (
    <article
      data-story-card
      onClick={() => onOpen(article)}
      className={`dash-panel dash-hover group relative flex cursor-pointer flex-col gap-3 overflow-hidden p-5 ${lead ? 'col-span-2' : ''}`}
      style={lead
        ? { background: `linear-gradient(135deg, ${accent}40 0%, #0d1638 55%, #0a1030 100%)`, borderColor: `${accent}66` }
        : { borderTop: `3px solid ${accent}` }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <TypeChip type={article.contentType} />
        {lead && (
          <span className="rounded-full bg-[#f0a63a] px-2.5 py-0.5 text-[12px] font-bold text-[#1a1205]">{t('gen.v2.top')}</span>
        )}
        <span className="min-w-0 truncate text-[12.5px] text-[#8b94b8]">
          {[article.source, shortDate(article.date, lang)].filter(Boolean).join(' · ')}
        </span>
      </div>
      <h3 className={`font-hindi font-bold leading-[1.5] text-white ${lead ? 'line-clamp-3 text-[24px]' : 'line-clamp-3 text-[18px]'}`}>
        {article.title}
      </h3>
      {lead && (
        <p className="line-clamp-2 text-[15px] leading-[1.6] text-[#c4d0ea]">{article.summary || article.content}</p>
      )}
      <div className="mt-auto flex items-center gap-2.5 pt-1">
        <WriteButton full={full} onClick={() => onOpen(article)} lead={lead} />
        <SlotChip count={count} />
      </div>
    </article>
  );
}

function StoryRow({ article, count, onOpen }) {
  const { lang } = useI18n();
  return (
    <div
      data-story-card
      onClick={() => onOpen(article)}
      className="group flex cursor-pointer items-center gap-4 border-b border-white/5 px-5 py-4 transition-colors last:border-b-0 hover:bg-white/[0.03]"
    >
      <span aria-hidden="true" className="h-10 w-1 shrink-0 rounded-full" style={{ backgroundColor: accentFor(article) }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <TypeChip type={article.contentType} />
          <span className="truncate text-[12.5px] text-[#8b94b8]">{[article.source, shortDate(article.date, lang)].filter(Boolean).join(' · ')}</span>
        </div>
        <p className="mt-1.5 truncate font-hindi text-[16.5px] font-bold text-white">{article.title}</p>
      </div>
      <SlotChip count={count} />
      <WriteButton full={count >= MAX_POSTS_PER_STORY} onClick={() => onOpen(article)} />
    </div>
  );
}

export default function NewsDesk({
  firstName, partyName, partyTags, partyLogo, partyShort,
  searchInput, onSearch, sortOrder, onSort, cardView, onCardView,
  sectionTabs, newsSection, onSection,
  dateFilter, availableDays, onDate, dayPrefix,
  typeFilter, onType, showType,
  loading, error, onRetry, opposition,
  groups, total, currentPage, totalPages, pageItems, onPage,
  postCounts, onOpen,
}) {
  const { t, lang } = useI18n();
  const active = sectionTabs.find((s) => s.id === newsSection) ?? sectionTabs[0];
  const recentDays = availableDays.filter((d) => d.key !== 'undated').slice(0, 2);
  const titleWords = t('gen.v2.writeToday').split(' ');
  let leadShown = false;

  return (
    <div
      className="hidden min-h-0 flex-1 gap-6 overflow-hidden p-6 lg:flex"
      style={{
        background:
          'radial-gradient(1200px 700px at 18% -4%, #101c46 0%, rgba(7,11,28,0) 58%),'
          + 'linear-gradient(168deg, #0a1030 0%, #070b1f 48%, #04081a 100%)',
      }}
    >
      {/* The rail: what to read. The app's own navigation sits left of it
          (the dashboard sidebar, closed to icons), so the brand is not
          repeated here. */}
      <aside
        aria-label={t('gen.v2.chooseNews')}
        className="dash-panel flex w-[300px] shrink-0 flex-col gap-4 overflow-y-auto p-4"
      >
        {partyName && (
          <div className="flex items-center gap-3 rounded-2xl border border-[#3f9fff]/30 bg-gradient-to-br from-[#16306f] to-[#0d1638] p-3.5">
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#3f9fff] font-display text-[14px] font-bold text-white">
              {partyShort}
              {partyLogo && <img src={partyLogo} alt="" className="absolute inset-0 h-full w-full bg-white object-contain p-1" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-[16px] font-bold text-white">{partyName}</p>
              {partyTags && <p className="truncate text-[12.5px] text-[#a9b6d8]">{partyTags}</p>}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] px-3.5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3f9fff] to-[#7b5cff] text-[15px] font-bold text-white">
            {(firstName?.[0] ?? '?').toUpperCase()}
          </span>
          <p className="truncate text-[15px] font-semibold text-white">{t('gen.v2.namaste', { name: firstName })}</p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="dash-eyebrow px-1">{t('gen.v2.chooseNews')}</p>
          {sectionTabs.map((s) => {
            const on = s.id === newsSection;
            const accent = SECTION_ACCENT[s.id];
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => onSection(s.id)}
                className="flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors"
                style={on
                  ? { backgroundColor: accent, borderColor: accent }
                  : { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(120,150,220,0.14)' }}
              >
                <SectionIcon id={s.id} partyLogo={partyLogo} partyShort={partyShort} active={on} accent={accent} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold text-white">{s.label}</span>
                  <span className={`block truncate text-[12.5px] ${on ? 'text-white/85' : 'text-[#8b94b8]'}`}>{s.sub}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 font-count text-[12px] font-bold ${on ? 'bg-black/25 text-white' : 'bg-white/5 text-[#c7d1eb]'}`}>{s.count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2">
          <p className="dash-eyebrow px-1">{t('gen.v2.when')}</p>
          <div className="grid grid-cols-3 gap-2">
            {[{ id: 'all', label: t('gen.v2.allDays') }, ...recentDays.map((d) => ({ id: `${dayPrefix}${d.key}`, label: dayChipLabel(d.key, t, lang) }))].map((chip) => {
              const on = dateFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onDate(chip.id)}
                  className={`h-10 rounded-full border text-[14px] font-semibold transition-colors ${on ? 'border-white bg-white text-[#0a1030]' : 'border-white/15 text-[#c7d1eb] hover:border-white/40'}`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
          {showType && (
            <label className="relative mt-1 block">
              <span className="sr-only">{t('gen.v2.type')}</span>
              <select
                id="news-type"
                value={typeFilter}
                onChange={(e) => onType(e.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-[#0b1230] px-4 text-[14px] font-medium text-white outline-none focus:border-[#3f9fff]/60"
              >
                {TYPE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8b94b8]" />
            </label>
          )}
        </div>

      </aside>

      {/* The feed */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto pr-1">
        <div className="flex items-center gap-3">
          <h1 className="min-w-0 flex-1 truncate font-display text-[38px] font-bold leading-tight text-white">
            <span className="gradient-text-blue">{titleWords[0]}</span>{' '}{titleWords.slice(1).join(' ')}
          </h1>
          <label className="relative flex h-12 items-center" style={{ flex: '0 1 320px' }}>
            <span className="sr-only">{t('gen.searchContent')}</span>
            <Search size={16} className="pointer-events-none absolute left-4 text-[#8b94b8]" />
            <input
              id="news-desk-search"
              type="text"
              value={searchInput}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={t('gen.v2.search')}
              className="h-full w-full rounded-full border border-white/10 bg-[#0b1230] pl-11 pr-4 text-[15px] text-white placeholder-[#6b78a0] outline-none focus:border-[#3f9fff]/60"
            />
          </label>
          <label className="relative">
            <span className="sr-only">{t('gen.v2.sort')}</span>
            <select
              id="news-sort"
              value={sortOrder}
              onChange={(e) => onSort(e.target.value)}
              className="h-12 appearance-none rounded-full border border-white/10 bg-[#0b1230] pl-4 pr-10 text-[14.5px] font-medium text-white outline-none focus:border-[#3f9fff]/60"
            >
              <option value="latest">{t('gen.latestFirst')}</option>
              <option value="oldest">{t('gen.oldestFirst')}</option>
            </select>
            <ChevronDown size={15} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#8b94b8]" />
          </label>
          <div className="flex h-12 items-center gap-1 rounded-full border border-white/10 bg-[#0b1230] p-1">
            {[
              { id: 'list', label: 'gen.viewList', Icon: List },
              { id: 'grid', label: 'gen.viewGrid', Icon: LayoutGrid },
            ].map((opt) => {
              const Icon = opt.Icon;
              const on = cardView === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-label={t(opt.label)}
                  title={t(opt.label)}
                  aria-pressed={on}
                  onClick={() => onCardView(opt.id)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${on ? 'bg-white text-[#0a1030]' : 'text-[#8b94b8] hover:text-white'}`}
                >
                  <Icon size={17} strokeWidth={2} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <h2 className="font-display text-[24px] font-bold text-white">{active?.heading}</h2>
          <span className="rounded-full bg-[#3f9fff]/15 px-3 py-0.5 font-count text-[13px] font-semibold text-[#8fb6ff]">
            {t('gen.v2.storiesN', { n: total })}
          </span>
          <span className="text-[14px] text-[#8b94b8]">{t('gen.v2.pickHint')}</span>
          {totalPages > 1 && (
            <span className="ml-auto font-count text-[13px] text-[#8b94b8]">{t('gen.v2.pageOnly', { p: currentPage, t: totalPages })}</span>
          )}
        </div>

        <div className="mt-4 pb-6">
          {loading && <div className="flex justify-center py-16"><Spinner size={30} label={t('gen.v2.loading')} showLabel /></div>}
          {!loading && error && (
            <div className="dash-panel flex flex-col items-center gap-3 px-6 py-10 text-center">
              <p className="text-[14px] text-red-400">{t('gen.failedToLoad')}</p>
              <button type="button" onClick={onRetry} className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-[13px] font-medium text-red-400">{t('gen.retry')}</button>
            </div>
          )}
          {!loading && !error && total === 0 && (
            <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-[15px] text-[#8b94b8]">
              {t(opposition ? 'gen.oppositionComingSoon' : 'gen.noArticlesFound')} {t(opposition ? 'gen.oppositionComingSoonSub' : 'gen.tryDifferent')}
            </div>
          )}
          {!loading && !error && total > 0 && groups.map((group, gi) => (
            <section key={group.label} className={gi ? 'mt-6' : ''}>
              {gi > 0 && (
                <div className="mb-3 flex items-center gap-3">
                  <span className="dash-eyebrow">{shortDate(group.items[0]?.date, lang)}</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
              )}
              {cardView === 'list' ? (
                <div className="dash-panel overflow-hidden">
                  {group.items.map((a) => <StoryRow key={a.id} article={a} count={postCounts[a._backendId] ?? 0} onOpen={onOpen} />)}
                </div>
              ) : (
                <div className="grid auto-rows-[minmax(230px,auto)] grid-cols-3 gap-4 min-[1680px]:grid-cols-4">
                  {group.items.map((a) => {
                    const lead = currentPage === 1 && !leadShown;
                    leadShown = true;
                    return <StoryCard key={a.id} article={a} lead={lead} count={postCounts[a._backendId] ?? 0} onOpen={onOpen} />;
                  })}
                </div>
              )}
            </section>
          ))}

          {!loading && !error && totalPages > 1 && (
            <nav aria-label={t('gen.v2.pages')} className="mt-8 flex flex-wrap items-center justify-center gap-2">
              {pageItems.map((item, i) => (item === '…'
                ? <span key={`gap-${i}`} className="px-1.5 text-[14px] text-[#6b78a0]">…</span>
                : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onPage(item)}
                    aria-current={item === currentPage ? 'page' : undefined}
                    className={`h-10 min-w-10 rounded-full px-3 font-count text-[14px] font-semibold transition-colors ${item === currentPage ? 'bg-white text-[#0a1030]' : 'border border-white/10 text-[#c7d1eb] hover:border-white/40'}`}
                  >
                    {item}
                  </button>
                )))}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
