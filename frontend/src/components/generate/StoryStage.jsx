import { ArrowRight, CalendarDays, Check, ChevronDown, Clock, FileText, Radio, Sparkles, Zap } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import { PLATFORM_ICON } from './platformIcons';
import { newsDate, partyMeta } from './partyMeta';
import { PartyChip, PartySymbol } from './PartyMark';

function longDate(d, lang) {
  const ms = Date.parse(d);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString(lang === 'hi' ? 'hi-IN' : undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * A story, opened: the story itself on its party's colour on the left, and on
 * the right everything that turns it into a post - who you write as, where it
 * goes, how many posts are left today, and the button.
 */
export default function StoryStage({
  article, platforms, platform, onPlatform, quota, atDailyLimit, onGenerate, guest = false,
  writingAs, articleOpen, onToggleArticle, related = [], onOpenRelated, existingCount = 0, onViewExisting,
}) {
  const { t, lang } = useI18n();
  const meta = partyMeta(article.tenantSlug);
  const hasSecond = Boolean(article.summary && article.content && article.content !== article.summary);
  const hasMore = hasSecond || (article.summary || '').length > 200;
  const words = `${article.summary || ''} ${hasSecond ? article.content : ''}`.trim().split(/[\s।]+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 200));
  const isPress = article.contentType === 'press_conference';

  const limit = quota?.daily_limit ?? 5;

  return (
    <div className="ag-page-in pb-4 pt-2">
    {/* The story and its panel share one grid; the related stories sit
        below it, outside. In the same grid the sticky panel stayed stuck
        through the related row and the cards slid underneath it. */}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px] [&>*]:min-w-0">
      {/* ── The story ── */}
      <article
        className="relative overflow-hidden rounded-[20px] border p-6 sm:p-9"
        style={{
          borderColor: `${meta.color}44`,
          background: `radial-gradient(90% 120% at 100% 0%, ${meta.color}40 0%, transparent 55%), radial-gradient(70% 90% at 0% 100%, #5b7cff26 0%, transparent 60%), linear-gradient(160deg, #141c42 0%, #0c1230 50%, #090d24 100%)`,
          boxShadow: `0 30px 70px rgba(2,6,20,0.55), inset 0 1px 0 rgba(255,255,255,0.06)`,
        }}
      >
        <PartySymbol slug={article.tenantSlug} size={300} color="#ffffff" className="pointer-events-none absolute -bottom-16 -right-10 opacity-[0.07]" />

        <div className="relative flex flex-wrap items-center gap-2.5">
          <PartyChip slug={article.tenantSlug} label={lang === 'hi' ? undefined : (article.source || meta.short)} />
          {article.category && (
            <span className="rounded-full px-3 py-1 font-hindi text-[15px] font-semibold text-white" style={{ background: `${meta.color}cc` }}>
              {article.category}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1 text-[13px] font-semibold text-[#d5ddf3]">
            {isPress ? <Radio size={14} /> : <FileText size={14} />}
            {t(isPress ? 'gen.pressConference' : 'gen.newsArticle')}
          </span>
        </div>

        {/* view-transition-name: the headline of the card that was tapped flies here (see openStory in the page). */}
        <h1 data-vt-story className="font-hindi relative mt-5 text-[clamp(26px,2vw+16px,40px)] font-bold leading-[1.4] text-white" style={{ viewTransitionName: 'story-title' }}>
          {article.title}
        </h1>

        <div className="relative mt-5 h-px w-24 rounded-full" style={{ background: `linear-gradient(90deg, ${meta.color}, transparent)` }} />

        <p className={`font-hindi relative mt-5 text-[17px] leading-[1.95] text-[#e3eaf9] sm:text-[21px] ${articleOpen ? '' : 'line-clamp-5 lg:line-clamp-none'}`}>
          {article.summary || article.content}
        </p>
        {hasSecond && (
          <p className={`font-hindi relative mt-5 rounded-[14px] border border-white/[0.07] bg-white/[0.035] p-5 text-[17px] leading-[1.95] text-[#c9d5ef] sm:text-[17px] ${articleOpen ? '' : 'hidden lg:block'}`}>
            {article.content}
          </p>
        )}
        {hasMore && (
          <button
            type="button"
            onClick={onToggleArticle}
            aria-expanded={articleOpen}
            className="relative mt-4 inline-flex h-10 items-center gap-1.5 text-[15px] font-semibold text-[#8fc0ff] transition hover:text-white lg:hidden"
          >
            {t(articleOpen ? 'gen.showLess' : 'gen.readFull')}
            <ChevronDown size={15} className={`transition-transform ${articleOpen ? 'rotate-180' : ''}`} />
          </button>
        )}

        <div className="relative mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.08] pt-5 text-[15px] text-[#a3b0d4]">
          {longDate(article.date, lang) && (
            <span className="inline-flex items-center gap-2"><CalendarDays size={16} />{longDate(article.date, lang)}</span>
          )}
          <span className="inline-flex items-center gap-2"><Clock size={16} />{t('gen.minRead', { n: minutes })}</span>
        </div>
      </article>

      {/* ── Turn it into a post ── */}
      <aside className="xl:sticky xl:top-4 xl:self-start">
        <div
          className="relative overflow-hidden rounded-[20px] border border-white/[0.09] p-5 sm:p-6"
          style={{ background: 'linear-gradient(170deg, #17204b 0%, #0e1435 50%, #0a0e27 100%)', boxShadow: '0 30px 70px rgba(2,6,20,0.55)' }}
        >
          <span className="pointer-events-none absolute -left-20 -top-24 h-60 w-60 rounded-full bg-[#3f9fff]/20 blur-3xl" />
          <span className="pointer-events-none absolute -bottom-24 -right-16 h-60 w-60 rounded-full bg-[#5b7cff]/20 blur-3xl" />

          <p className="relative font-display text-[21px] font-bold text-white">{t('gen.story.title')}</p>
          <p className="relative mt-1 text-[15px] text-[#9fb0d4]">{t('gen.story.sub')}</p>

          {writingAs && (
            <div className="relative mt-5 flex items-center gap-3 rounded-[14px] border border-white/[0.08] bg-white/[0.04] px-3.5 py-3">
              {writingAs.logo ? (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white">
                  <img src={writingAs.logo} alt="" className="h-10 w-10 object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                </span>
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: partyMeta(writingAs.slug).color }}>
                  <PartySymbol slug={writingAs.slug} size={24} color="#fff" />
                </span>
              )}
              <div className="min-w-0">
                <p className={`text-[13px] font-semibold uppercase text-[#7f8db3] ${lang === 'hi' ? '' : 'tracking-[0.14em]'}`}>{t('gen.story.writingAs')}</p>
                <p className="truncate text-[15px] font-semibold text-white">
                  {writingAs.partyName}
                  {writingAs.roleName && <span className="text-[#9db8ff]"> · {writingAs.roleName}</span>}
                </p>
              </div>
            </div>
          )}

          <p className={`relative mb-3 mt-6 font-semibold uppercase text-[#8f9cc2] ${lang === 'hi' ? 'text-[15px]' : 'font-count text-[13px] tracking-[0.2em]'}`}>{t('gen.story.where')}</p>
          <div className="relative grid grid-cols-2 gap-2.5">
            {platforms.map((p) => {
              const on = platform === p.id;
              const Icon = PLATFORM_ICON[p.id];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPlatform(p.id)}
                  aria-pressed={on}
                  className="relative flex flex-col items-start gap-2 rounded-[14px] border px-3.5 py-3.5 text-left transition duration-200 hover:-translate-y-0.5 sm:flex-row sm:items-center sm:gap-3"
                  style={on
                    ? { borderColor: p.color, background: `linear-gradient(140deg, ${p.color}40 0%, ${p.color}12 100%)`, boxShadow: `0 10px 26px ${p.color}33` }
                    : { borderColor: 'rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.03)' }}
                >
                  <span
                    key={on ? 'on' : 'off'}
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] ${on ? 'ag-bounce' : ''}`}
                    style={{ background: on ? p.color : `${p.color}22`, color: on ? '#fff' : p.color, boxShadow: on ? `0 0 0 3px ${p.color}55` : 'none', '--alien': on ? p.color : 'white' }}
                  >
                    {Icon && <Icon width={21} height={21} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-white">{p.label}</span>
                    <span className="block font-count text-[13px] text-[#8f9cc2]">{p.id === 'twitter' ? t('gen.story.short') : t('gen.story.long')}</span>
                  </span>
                  {on && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-white shadow" style={{ background: p.color }}>
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {existingCount > 0 && (
            <div className="relative mt-5 flex items-center gap-3 rounded-[14px] border border-[#3f9fff]/35 bg-[#3f9fff]/10 px-4 py-3">
              <Check size={18} className="shrink-0 text-[#8fb0ff]" />
              <p className="min-w-0 flex-1 text-[15px] text-[#dbe4fb]">
                {existingCount === 1 ? t('gen.story.alreadyOne') : t('gen.story.alreadyMany', { n: existingCount })}
              </p>
              <button type="button" onClick={onViewExisting} className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-[15px] font-semibold text-white underline-offset-4 hover:underline">
                {t('gen.story.view')} <ArrowRight size={15} />
              </button>
            </div>
          )}

          {/* Sticky at the foot of a phone's screen, so the action is never
              scrolled out of reach while reading; in place from xl. */}
          <div className="sticky bottom-0 z-20 -mx-5 mt-5 bg-gradient-to-t from-[#0a0e27] via-[#0a0e27]/95 to-transparent px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:-mx-6 sm:px-6 xl:static xl:mx-0 xl:bg-none xl:p-0">
            <button
              type="button"
              onClick={onGenerate}
              disabled={atDailyLimit}
              className="ag-cta group relative inline-flex h-14 w-full items-center justify-center gap-2.5 overflow-hidden rounded-[14px] text-[17px] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: atDailyLimit ? 'rgba(60,70,110,0.5)' : 'linear-gradient(120deg, #1a5fff 0%, #4f7dff 45%, #5b7cff 100%)',
                boxShadow: atDailyLimit ? 'none' : '0 14px 34px rgba(60,90,255,0.45), inset 0 1px 0 rgba(255,255,255,0.25)',
              }}
            >
              {!atDailyLimit && <span className="ag-sheen pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-white/25" />}
              <Sparkles size={19} />
              {atDailyLimit ? t('gen.quota.allUsed', { limit }) : guest ? t('guest.signUpToWrite') : t('gen.story.cta')}
            </button>
            {atDailyLimit ? (
              <p className="mt-2.5 text-center text-[15px] font-medium text-[#ffb4b4]">{t('gen.story.limitNote', { limit })}</p>
            ) : (
              <p className="mt-2.5 flex items-center justify-center gap-1.5 text-[13px] text-[#9aa8cc]">
                <Zap size={14} className="text-[#8fb0ff]" /> {guest ? t('guest.writeHint') : t('gen.story.hint')}
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
      {related.length > 0 && (
        <section className="mt-8" aria-label={t('gen.story.related')}>
          <h2 className="mb-3.5 mt-2 font-display text-[21px] font-bold text-white">{t('gen.story.related')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {related.map((r, i) => {
              const m = partyMeta(r.tenantSlug);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={(e) => onOpenRelated?.(r, e.currentTarget)}
                  className="ag-rise group flex min-h-[150px] flex-col rounded-[20px] border border-white/[0.07] p-5 text-left transition duration-300 hover:-translate-y-1"
                  style={{ '--i': i, background: 'linear-gradient(180deg, #121a3a 0%, #0b1029 100%)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${m.color}88`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
                >
                  <span className="flex items-center gap-2">
                    <PartyChip slug={r.tenantSlug} />
                    <span className="font-count text-[13px] text-[#9aa8cc]">{newsDate(r.date, lang)}</span>
                  </span>
                  <span data-vt-title className="font-hindi mt-3 line-clamp-2 text-[17px] font-semibold leading-[1.5] text-white">{r.title}</span>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[15px] font-semibold" style={{ color: m.color }}>
                    <Sparkles size={14} /> {t('gen.feed.writePost')}
                    <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
