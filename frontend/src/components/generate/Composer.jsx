import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, Copy, Languages, Minus, Plus, RefreshCw, Smartphone, X as XIcon } from 'lucide-react';
import PhonePreview from '../compose/PhonePreview';
import { PLATFORM_LOOK } from '../compose/platformLook';
import '../compose/compose.css';
import SpeakButton from './SpeakButton';
import { useI18n } from '../../i18n/index.jsx';
import { getMeta } from '../../utils/prefMeta';
import { labelWithSize } from '../../utils/preferenceQuestions';
import { parsePost } from '../../utils/parsePost';
import { shortOption, shortQuestion } from '../../data/partyQuestionsShort';
import { MAX_POSTS_PER_STORY } from '../../data/postLimits';

// The post composer from lg up, laid out the way rssgpt's is: the story and
// the post on the left with everything you do to the post under it, and a
// "voice" panel on the right that holds what shapes it (platform, your role,
// the party line for this post). Phones keep the page's own flow.

const QUICK_NOTES = ['gen.v2.q1', 'gen.v2.q2', 'gen.v2.q3', 'gen.v2.q4'];

/** Text with its hashtags in the platform's link colour. */
function Tagged({ text, color }) {
  const parts = String(text ?? '').split(/(#[^\s#]+)/g);
  return parts.map((part, i) => (part.startsWith('#')
    ? <span key={i} style={{ color }}>{part}</span>
    : <span key={i}>{part}</span>));
}

function optionText(q, opt, lang) {
  const short = shortOption(opt, lang);
  if (short) return short;
  const i = q.options.indexOf(opt);
  const hi = lang === 'hi' ? q.options_hi?.[i] : '';
  return hi || labelWithSize(opt, lang);
}

/** One party question as a compact select with a short label. */
function StanceRow({ q, value, saved, onChange }) {
  const { t, lang } = useI18n();
  const label = shortQuestion(q.question_id, lang) || getMeta(q.question_id, q.question_text, t, lang).label;
  const current = value ?? q.options[0] ?? '';
  const changed = saved !== undefined && current !== saved;
  const id = `stance-${q.question_id}`;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} title={q.question_text} className="flex items-baseline gap-2 text-[14.5px] font-semibold text-[#dfe6f7]">
        {label}
        {changed && (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#6aa8ff]">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#3f9fff]" />
            {t('gen.v2.thisPostOnly')}
          </span>
        )}
      </label>
      <div className="relative">
        <select
          id={id}
          value={current}
          onChange={(e) => onChange(q.question_id, e.target.value)}
          className={`h-12 w-full appearance-none rounded-xl border bg-[#0b1230] pl-4 pr-10 text-[15px] text-white outline-none transition focus:border-[#3f9fff] ${changed ? 'border-[#3f9fff]/70' : 'border-white/10'}`}
        >
          {q.options.map((opt) => (
            <option key={opt} value={opt} title={opt} className="bg-[#0a1130]">{optionText(q, opt, lang)}</option>
          ))}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8b94b8]" />
      </div>
    </div>
  );
}

/** The post as the platform will show it. */
function PostCard({ platform, content, name, chars }) {
  const { t } = useI18n();
  const text = String(content ?? '').trim();
  const isReddit = platform.id === 'reddit';
  const [first = '', ...rest] = text.split('\n');
  const link = { twitter: '#1d9bf0', whatsapp: '#53bdeb', facebook: '#4599ff', reddit: '#ff8a5c' }[platform.id];
  const isX = platform.id === 'twitter';
  return (
    <div className="dash-panel p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3f9fff] to-[#7b5cff] text-[16px] font-bold text-white">
          {(name?.[0] ?? '?').toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[15.5px] font-bold text-white">{name}</p>
          <p className="text-[12.5px] text-[#8b94b8]">{t(`gen.v2.pf.${platform.id}`)}</p>
        </div>
      </div>
      {isReddit ? (
        <>
          <p className="mt-4 font-hindi text-[19px] font-bold leading-[1.5] text-white">{first}</p>
          <p className="mt-2 whitespace-pre-wrap font-hindi text-[16.5px] leading-[1.75] text-[#dfe6f7]">{rest.join('\n').trim()}</p>
        </>
      ) : (
        <p className="mt-4 whitespace-pre-wrap font-hindi text-[17px] leading-[1.75] text-[#eef2fb]">
          <Tagged text={text} color={link} />
        </p>
      )}
      <div className="mt-4 flex items-center justify-end border-t border-white/5 pt-3 font-count text-[13px]">
        <span style={{ color: isX ? (chars > 280 ? '#ef4444' : chars > 238 ? '#fbbf24' : '#8b94b8') : '#8b94b8' }}>
          {isX ? `${chars} / 280` : t('gen.v2.charsN', { n: chars })}
        </span>
      </div>
    </div>
  );
}

export default function Composer({
  article, onBack,
  platforms, platform, onPlatform,
  questions, preferences, savedPrefs, onPreference,
  quota, atDailyLimit, quotaCountdown,
  postCount, roleLabel, partyName,
  generating, genSeconds, onGenerate,
  content, postFailed, selectedPostId, postStatus,
  hasOtherVersion, refinedIsLive, switchingVersion, onToggleVersion, refinedAt,
  showTranslated, translating, onTranslate, onShowOriginal,
  copied, onCopy, copiedHashtags, onCopyHashtags,
  onPublish, sharing, shareMsg, charOverLimit,
  refinementNote, onRefinementNote, refineHint, onRegenerate,
  userName,
}) {
  const { t, lang } = useI18n();
  const [stanceOpen, setStanceOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  // The post drawn inside a phone, the way the platform will show it. Opened
  // on request rather than standing on the page.
  const [phoneOpen, setPhoneOpen] = useState(false);
  useEffect(() => {
    if (!phoneOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPhoneOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phoneOpen]);
  const active = platforms.find((p) => p.id === platform) ?? platforms[0];

  const used = quota?.daily_used ?? 0;
  const limit = quota?.daily_limit ?? 5;
  const left = Math.max(0, MAX_POSTS_PER_STORY - postCount);
  const storyFull = postCount >= MAX_POSTS_PER_STORY;

  const text = String(content ?? '').trim();
  const hasPost = Boolean(selectedPostId && text && !postFailed && !generating);
  const tags = parsePost(text).hashtags;
  const changedCount = questions.filter((q) => {
    const v = preferences[q.question_id] ?? q.options[0];
    return savedPrefs[q.question_id] !== undefined && v !== savedPrefs[q.question_id];
  }).length;

  const date = new Date(article.date ?? '');
  const dateLabel = Number.isNaN(date.getTime())
    ? '' : date.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
  const isPress = article.contentType === 'press_conference';

  return (
    <div
      className="hidden min-h-0 flex-1 flex-col overflow-y-auto px-8 py-6 lg:flex"
      style={{
        background:
          'radial-gradient(1200px 700px at 18% -4%, #101c46 0%, rgba(7,11,28,0) 58%),'
          + 'linear-gradient(168deg, #0a1030 0%, #070b1f 48%, #04081a 100%)',
      }}
    >
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 px-5 text-[15px] font-semibold text-white transition hover:border-white/40">
          <ArrowLeft size={16} strokeWidth={2.2} />
          {t('gen.v2.allNews')}
        </button>
        {quota && (
          <span className="ml-auto inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-[14px] text-[#c7d1eb]">
            {t('gen.v2.published', { used, limit })}
          </span>
        )}
      </div>

      <div className="mt-6 flex min-w-0 items-start gap-6">
        {/* The story and the post */}
        <section className="flex min-w-0 flex-[1.6_1_560px] flex-col gap-4">
          <div className="flex items-end justify-between gap-3">
            <h1 className="font-display text-[32px] font-bold text-white">{t('gen.v2.previewTitle')}</h1>
            <span className="pb-1.5 text-[13.5px] text-[#8b94b8]">
              {t(`gen.v2.pf.${active.id}`)} · {t(lang === 'hi' ? 'gen.v2.langHi' : 'gen.v2.langEn')}
            </span>
          </div>

          <article className="dash-panel p-5">
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-[#8b94b8]">
              <span className="rounded-full px-2.5 py-0.5 font-semibold" style={isPress ? { backgroundColor: 'rgba(240,166,58,0.16)', color: '#f5b860' } : { backgroundColor: 'rgba(63,159,255,0.12)', color: '#8fb6ff' }}>
                {t(isPress ? 'gen.pressConference' : 'gen.newsArticle')}
              </span>
              {[article.source, dateLabel].filter(Boolean).join(' · ')}
            </div>
            <h2 className={`mt-3 font-hindi font-bold leading-[1.5] text-white ${hasPost ? 'text-[18px]' : 'text-[24px]'}`}>{article.title}</h2>
            {(!hasPost || storyOpen) && (
              <p className={`mt-2 text-[16px] leading-[1.7] text-[#c4d0ea] ${storyOpen ? '' : 'line-clamp-4'}`}>
                {article.summary || article.content}
              </p>
            )}
            <button type="button" onClick={() => setStoryOpen((o) => !o)} className="mt-2 text-[13.5px] font-semibold text-[#6aa8ff] underline underline-offset-4 hover:text-white">
              {t(storyOpen ? 'gen.v2.readLess' : 'gen.v2.readFull')}
            </button>
          </article>

          {!hasPost && (
            <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-white/15 p-6 text-center text-[15px] text-[#8b94b8]">
              {generating ? (
                <span className="flex flex-col items-center gap-3 text-[#8fb6ff]">
                  <RefreshCw size={26} className="animate-spin motion-reduce:animate-none" />
                  {t('gen.v2.writing')}{genSeconds >= 8 ? ` · ${genSeconds}s` : ''}
                </span>
              ) : postFailed && text ? (
                <span className="text-[#f5b860]">{text}</span>
              ) : t('gen.v2.emptyHint')}
            </div>
          )}

          {hasPost && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {hasOtherVersion && (
                  <span className="inline-flex rounded-full border border-white/10 p-1">
                    {[{ live: false, key: 'gen.v2.original' }, { live: true, key: 'gen.v2.new' }].map((v) => {
                      const on = refinedIsLive === v.live;
                      return (
                        <button key={v.key} type="button" disabled={switchingVersion} aria-pressed={on}
                          onClick={() => { if (!on) onToggleVersion(); }}
                          className={`h-8 rounded-full px-3.5 text-[13px] font-semibold ${on ? 'bg-white text-[#0a1030]' : 'text-[#c7d1eb]'}`}>
                          {t(v.key)}
                        </button>
                      );
                    })}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPhoneOpen(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#3f9fff]/45 bg-[#15224f] px-3.5 text-[13px] font-semibold text-[#cfe0ff] transition hover:border-[#3f9fff] hover:text-white"
                  >
                    <Smartphone size={14} strokeWidth={2} />
                    {t('cmp.phonePreview')}
                  </button>
                  <SpeakButton content={content} lang={showTranslated ? 'en' : 'hi'} compact />
                  {active.id !== 'reddit' && tags.length > 0 && (
                    <button type="button" onClick={onCopyHashtags} className="h-9 rounded-full border border-white/10 px-3.5 text-[13px] text-[#c7d1eb] hover:text-white">
                      {copiedHashtags ? t('common.copied') : t('gen.v2.copyTags')}
                    </button>
                  )}
                </span>
              </div>

              <PostCard platform={active} content={content} name={userName} chars={text.length} />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onPublish}
                  disabled={sharing || charOverLimit}
                  className="btn-gradient inline-flex h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-full text-[16px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {postStatus === 'published' && <Check size={17} strokeWidth={2.4} />}
                  {postStatus === 'published' ? t('gen.published') : t(`gen.postTo.${active.id}`)}
                  <ArrowRight size={17} strokeWidth={2.2} />
                </button>
                <button type="button" onClick={onCopy} aria-label={t('common.copy')} title={t('common.copy')}
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/15 text-white transition hover:border-white/40">
                  {copied ? <Check size={18} className="text-[#22c55e]" /> : <Copy size={18} />}
                </button>
              </div>
              {shareMsg && <p role="status" className="text-[13.5px] text-[#fbbf24]">{shareMsg}</p>}

              <button
                type="button"
                onClick={showTranslated ? onShowOriginal : onTranslate}
                disabled={translating}
                className="inline-flex h-11 items-center gap-2 self-start rounded-full border border-white/15 px-5 text-[14.5px] font-semibold text-white transition hover:border-white/40 disabled:opacity-50"
              >
                {translating ? <RefreshCw size={15} className="animate-spin" /> : <Languages size={16} />}
                {t(showTranslated ? 'gen.v2.showHindi' : 'gen.v2.translateEn')}
              </button>

              {refinedAt ? (
                <p className="text-[14px] text-[#8b94b8]">{t('gen.refineAlreadyUsed')}</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <div className="relative">
                    <label htmlFor="composer-refine" className="sr-only">{t('gen.v2.notePlaceholder')}</label>
                    <input
                      id="composer-refine"
                      type="text"
                      value={refinementNote}
                      onChange={(e) => onRefinementNote(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && refinementNote.trim()) onRegenerate(); }}
                      placeholder={t('gen.v2.notePlaceholder')}
                      className="h-14 w-full rounded-full border border-white/15 bg-[#0b1230] pl-5 pr-16 text-[15px] text-white placeholder-[#6b78a0] outline-none focus:border-[#3f9fff]/60"
                    />
                    <button type="button" onClick={onRegenerate} disabled={!refinementNote.trim() || generating} aria-label={t('gen.v2.rewrite')}
                      className="btn-gradient absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white disabled:opacity-40">
                      <ArrowUp size={17} strokeWidth={2.4} />
                    </button>
                  </div>
                  {refineHint && <p className="text-[13px] text-[#fbbf24]">{refineHint}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    {QUICK_NOTES.map((key) => (
                      <button key={key} type="button" onClick={() => onRefinementNote(t(key))}
                        className="h-9 rounded-full border border-white/10 px-4 text-[13.5px] text-[#c7d1eb] transition hover:border-[#3f9fff]/60 hover:text-white">
                        {t(key)}
                      </button>
                    ))}
                    <span className="ml-auto text-[12.5px] text-[#6b78a0]">{t('gen.v2.once')}</span>
                  </div>
                </div>
              )}
            </>
          )}

          {(!hasPost || left > 0) && (
            <button
              type="button"
              onClick={onGenerate}
              disabled={generating || atDailyLimit || storyFull}
              title={atDailyLimit ? quotaCountdown : storyFull ? t('gen.v2.slotsFull') : undefined}
              className={`inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-[16.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${
                hasPost ? 'border border-white/15 text-white hover:border-white/40' : 'btn-gradient text-white hover:brightness-110'
              }`}
            >
              {hasPost ? t('gen.v2.another', { n: left }) : t('gen.v2.write')}
              <ArrowRight size={17} strokeWidth={2.2} />
            </button>
          )}
        </section>

        {/* What shapes the post */}
        <aside className="dash-panel sticky top-0 flex min-w-0 flex-[1_1_340px] flex-col gap-6 p-6">
          <h2 className="font-display text-[26px] font-bold text-white">{t('gen.v2.voice')}</h2>

          <fieldset className="m-0 border-0 p-0">
            <legend className="mb-3 p-0 text-[15px] font-semibold text-[#c7d1eb]">{t('gen.platform')}</legend>
            <div role="radiogroup" aria-label={t('gen.platform')} className="flex flex-wrap gap-2">
              {platforms.map((p) => {
                const on = p.id === platform;
                return (
                  <button key={p.id} type="button" role="radio" aria-checked={on} onClick={() => onPlatform(p.id)}
                    className={`h-11 rounded-full border px-5 text-[15px] transition-colors ${on ? 'border-white bg-white font-semibold text-[#0a1030]' : 'border-white/15 font-medium text-white hover:border-white/40'}`}>
                    {t(`gen.v2.pf.${p.id}`)}
                  </button>
                );
              })}
            </div>
            <p className="mt-2.5 text-[13px] text-[#8b94b8]">{t(`gen.rule.${active.id}`)}</p>
          </fieldset>

          <div className="rounded-2xl border border-[#3f9fff]/30 bg-gradient-to-br from-[#16306f] to-[#0d1638] p-4">
            <p className="text-[12px] text-[#a9b6d8]">{t('gen.v2.yourVoice')}</p>
            <p className="mt-0.5 font-display text-[20px] font-bold text-white">{roleLabel || t('gen.v2.noRole')}</p>
            {partyName && <p className="mt-0.5 text-[13px] text-[#a9b6d8]">{partyName}</p>}
          </div>

          {questions.length > 0 && (
            <div>
              <button type="button" onClick={() => setStanceOpen((o) => !o)} aria-expanded={stanceOpen}
                className="flex w-full items-center justify-between text-left text-[16px] font-semibold text-white">
                <span>
                  {t('gen.v2.stanceForPost')}
                  {changedCount > 0 && <span className="ml-2 rounded-full bg-[#3f9fff]/20 px-2 py-0.5 font-count text-[12px] text-[#8fb6ff]">{changedCount}</span>}
                </span>
                {stanceOpen ? <Minus size={18} /> : <Plus size={18} />}
              </button>
              {stanceOpen && (
                <div className="mt-4 flex flex-col gap-4">
                  {questions.map((q) => (
                    <StanceRow key={q.question_id} q={q} value={preferences[q.question_id]} saved={savedPrefs[q.question_id]} onChange={onPreference} />
                  ))}
                </div>
              )}
              <a href="/preferences" className="mt-3 inline-block text-[13.5px] font-semibold text-[#6aa8ff] underline underline-offset-4 hover:text-white">
                {t('gen.v2.allPrefs')}
              </a>
            </div>
          )}

          <p className="text-[13.5px] text-[#8b94b8]">
            {t('gen.v2.langNote', { lang: t(lang === 'hi' ? 'gen.v2.langHi' : 'gen.v2.langEn') })}
          </p>
        </aside>
      </div>

      {/* In document.body: the page column is its own stacking context, and
          inside it the sidebar would stay above the backdrop. */}
      {phoneOpen && hasPost && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={t('cmp.phonePreview')}>
          <div className="absolute inset-0 bg-[#03060f]/78 backdrop-blur-[3px]" onClick={() => setPhoneOpen(false)} />
          <div
            className="cmp-fadein relative h-[min(620px,calc(100vh-48px))]"
            style={{ filter: `drop-shadow(0 0 60px rgba(${PLATFORM_LOOK[active.id].hue},0.35))` }}
          >
            <PhonePreview
              platform={active.id}
              state="ready"
              text={content}
              authorName={userName || 'AmbedkarGPT'}
              authorHandle={(userName || 'you').replace(/\s+/g, '').toLowerCase()}
              article={article}
              translated={showTranslated}
            />
            <button type="button" onClick={() => setPhoneOpen(false)} aria-label={t('common.close')} className="absolute -right-14 top-0 flex h-10 w-10 items-center justify-center rounded-full border border-[#22305c] bg-[#0c1430] text-[#c0cde8] transition hover:text-white">
              <XIcon size={17} />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
