import { useEffect, useState } from 'react';
import { ChevronLeft, Check, X as XIcon } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import StoryStrip from './StoryStrip';
import PlatformCards from './PlatformCards';
import PartyPrefsGrid from './PartyPrefsGrid';
import PhonePreview from './PhonePreview';
import ComposeActions from './ComposeActions';
import StoryPosts from './StoryPosts';
import ChakraIcon from './ChakraIcon';
import { PLATFORM_LOOK } from './platformLook';
import './compose.css';

/**
 * Composer v3 — the desktop (lg and up) screen for one story: Studio on the
 * left, the phone stage on the right. It replaces BOTH the 'preview' and the
 * 'generated' views on lg+; phones keep the existing two-view flow.
 *
 * Pure layout: all state and every handler stay in SocialMediaPostGenerator,
 * passed in through `c`. It sits in the page's own column, beside the
 * dashboard sidebar, on the dashboard's navy.
 */
export default function ComposerDesk({ c }) {
  const { t, lang, changeLanguage } = useI18n();
  const [storyCount, setStoryCount] = useState(0);
  const [storyOpen, setStoryOpen] = useState(false);

  useEffect(() => {
    if (!storyOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setStoryOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [storyOpen]);
  const look = PLATFORM_LOOK[c.platform];

  const text = c.showTranslated && c.translatedPost ? c.translatedPost : c.generatedPost;
  const busy = c.generating || c.translating;
  const phoneState = busy ? 'busy' : c.postFailed ? 'error' : text?.trim() ? 'ready' : 'empty';
  const ready = phoneState === 'ready';
  const atStoryLimit = storyCount >= c.maxPosts;
  const left = Math.max(0, c.maxPosts - storyCount);

  let genLabel = t('gen.generatePost');
  if (c.generating) genLabel = t('gen.generating');
  else if (c.atDailyLimit) genLabel = t('cmp.comeBack', { time: c.quotaCountdown });
  else if (atStoryLimit) genLabel = t('cmp.storyFull');
  else if (storyCount > 0) genLabel = t('cmp.writeAnother', { n: left });

  return (
    <div className="cmp-root hidden min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex">
      {/* ── top bar ── */}
      <header className="flex h-16 shrink-0 items-center gap-[18px] border-b border-[#1f2b52]/70 px-6">
        <button type="button" onClick={c.onBack} className="flex items-center gap-2 text-[16px] text-[#c0cde8] hover:text-white">
          <ChevronLeft size={18} strokeWidth={2.2} />{t('cmp.allStories')}
        </button>
        <ol aria-label={t('cmp.steps')} className="mx-auto flex list-none items-center gap-2.5 p-0">
          {[t('cmp.s1'), t('cmp.s2')].map((s) => (
            <li key={s} className="contents">
              <span className="flex items-center gap-2 text-[16px] text-[#c0cde8]">
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#15224f] text-[#6aa8ff]"><Check size={13} strokeWidth={3.4} /></span>{s}
              </span>
              <span aria-hidden="true" className="h-0.5 w-[34px] rounded-sm" style={{ background: busy && s === t('cmp.s2') ? '#3a4e70' : '#3f9fff' }} />
            </li>
          ))}
          <li aria-current="step" className="flex items-center gap-2 text-[16px] font-bold text-white">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[#3f9fff] font-count text-[14.5px] font-bold text-white">3</span>{t('cmp.s3')}
          </li>
        </ol>
        <div role="group" aria-label={t('cmp.langLabel')} className="flex rounded-full border border-[#3a4e70] p-0.5">
          {[['en', 'EN'], ['hi', 'हिं']].map(([code, label]) => (
            <button
              key={code}
              type="button"
              aria-pressed={lang === code}
              onClick={() => changeLanguage(code)}
              className="min-h-[30px] rounded-full px-2.5 text-[14px] font-semibold"
              style={lang === code ? { background: '#EDEEF2', color: '#0c1430' } : { color: '#c0cde8' }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* ── the story ── */}
      <StoryStrip
        article={c.article}
        accent={c.sectionAccent}
        kindLabel={c.kindLabel}
        kindColor={c.kindColor}
        tagLabel={c.tagLabel}
        metaLine={c.metaLine}
        postsWritten={storyCount}
        maxPosts={c.maxPosts}
        onReadFull={() => setStoryOpen(true)}
        onChangeStory={c.onBack}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] gap-5 px-6 pb-5 pt-4 xl:grid-cols-[480px_minmax(0,1fr)] xl:gap-6">
        {/* ── STUDIO ── */}
        <section aria-label={t('cmp.studio')} className="dash-panel flex min-h-0 flex-col gap-3 rounded-[20px] px-[18px] py-4">
          {/* The choices scroll on a short screen; the generate button below
              them never does. */}
          <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-0.5">
          <PlatformCards platforms={c.platforms} value={c.platform} onChange={c.setPlatform} disabled={busy} />
          <PartyPrefsGrid
            questions={c.prefQuestions}
            value={c.preferences}
            onChange={c.setPreferences}
            defaultValues={c.savedPrefs}
            disabled={busy}
          />
          <span className="text-[13.5px] leading-[1.5] text-[#6b78a0]">{t('cmp.prefFoot')}</span>
          </div>
          <button
            type="button"
            onClick={c.onGenerate}
            aria-busy={c.generating}
            disabled={c.generating || c.atDailyLimit || atStoryLimit}
            className="cmp-gen btn-gradient flex min-h-14 shrink-0 items-center justify-center gap-3 rounded-[14px] text-[17px] font-semibold text-white disabled:opacity-60"
          >
            <ChakraIcon size={24} spinning={c.generating} />
            {genLabel}
          </button>
        </section>

        {/* ── STAGE ── */}
        <section
          aria-label={t('cmp.preview')}
          className="relative grid min-h-0 grid-cols-[auto_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-4 overflow-hidden rounded-[20px] border border-[#22305c]/80 py-[18px] pl-5 pr-4 xl:gap-[22px] xl:pl-[26px] xl:pr-5"
          style={{ background: `radial-gradient(420px 420px at 30% 46%, rgba(${look.hue},0.18), transparent 70%), rgba(8,13,36,0.72)` }}
        >
          <PhonePreview
            platform={c.platform}
            state={phoneState}
            text={phoneState === 'error' ? c.generatedPost : text}
            authorName={c.authorName}
            authorHandle={c.authorHandle}
            article={c.article}
            lensLabel={c.lensLabel}
            translated={Boolean(c.showTranslated && c.translatedPost)}
            genSeconds={c.genSeconds}
          />
          <ComposeActions
            platform={c.platform}
            platformLimit={c.platformLimit}
            text={text}
            ready={ready && Boolean(c.selectedPostId)}
            busy={busy}
            hasOtherVersion={c.hasOtherVersion}
            refinedIsLive={c.refinedIsLive}
            switchingVersion={c.switchingVersion}
            onToggleVersion={c.onToggleVersion}
            showTranslated={Boolean(c.showTranslated && c.translatedPost)}
            translating={c.translating}
            onTranslate={c.onTranslate}
            onShowOriginal={() => c.setShowTranslated(false)}
            postStatus={c.postStatus}
            sharing={c.sharing}
            shareMsg={c.shareMsg}
            onPublish={c.onPublish}
            copied={c.copied}
            onCopy={c.onCopy}
            copiedHashtags={c.copiedHashtags}
            onCopyHashtags={c.onCopyHashtags}
            canRefine={ready && Boolean(c.selectedPostId)}
            refinedAt={c.refinedAt}
            refinementNote={c.refinementNote}
            onNoteChange={c.onNoteChange}
            refineHint={c.refineHint}
            onRegenerate={c.onRegenerate}
          >
            <StoryPosts
              newsId={c.article?._backendId}
              activePostId={c.selectedPostId}
              refreshKey={`${c.selectedPostId}|${c.postStatus}|${c.refinedAt}`}
              maxPosts={c.maxPosts}
              onCount={setStoryCount}
              onOpen={c.onOpenPost}
            />
          </ComposeActions>
        </section>
      </div>
      {/* ── the full story, over the composer ── */}
      {storyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={c.article.title}>
          <div className="absolute inset-0 bg-[#03060f]/78 backdrop-blur-[3px]" onClick={() => setStoryOpen(false)} />
          <article className="cmp-fadein relative max-h-[86vh] w-full max-w-[760px] overflow-y-auto rounded-2xl border border-[#1e3260]/60 bg-[#0a1130] p-8">
            <button type="button" onClick={() => setStoryOpen(false)} aria-label={t('common.close')} className="cmp-act absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-lg border border-[#22305c] text-[#8b94b8]">
              <XIcon size={17} />
            </button>
            <p className="m-0 font-count text-[13px] text-[#7d89ad]">{c.metaLine}</p>
            <h2 className="font-hindi mt-3 pr-10 text-[28px] font-bold leading-[1.5] text-white">{c.article.title}</h2>
            {c.article.summary && <p className="font-hindi mt-5 text-[20px] leading-[1.9] text-[#e6eefb]">{c.article.summary}</p>}
            {c.article.content && c.article.content !== c.article.summary && (
              <p className="font-hindi mt-5 border-t border-[#1e3260]/50 pt-5 text-[18px] leading-[1.95] text-[#c3d3ee]">{c.article.content}</p>
            )}
          </article>
        </div>
      )}
    </div>
  );
}
