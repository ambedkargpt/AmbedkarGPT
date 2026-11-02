import { Check, Copy, Languages, RefreshCw } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import SpeakButton from '../generate/SpeakButton';
import { parsePost } from '../../utils/parsePost';
import { PLATFORM_LOOK } from './platformLook';

// The column beside the phone. Everything here calls the page's existing
// handlers — nothing new on the server.
export default function ComposeActions({
  platform, platformLimit, text, ready, busy,
  // version switch (refine)
  hasOtherVersion, refinedIsLive, switchingVersion, onToggleVersion,
  // listen / translate
  showTranslated, translating, onTranslate, onShowOriginal,
  // publish / copy
  postStatus, sharing, shareMsg, onPublish, copied, onCopy, copiedHashtags, onCopyHashtags,
  // refine
  canRefine, refinedAt, refinementNote, onNoteChange, refineHint, onRegenerate,
  children, // StoryPosts goes here
}) {
  const { t, lang } = useI18n();
  const look = PLATFORM_LOOK[platform];
  const isRd = platform === 'reddit';

  const chars = Array.from(text || '').length;
  const words = (text || '').trim().split(/[\s।]+/).filter(Boolean).length;
  const { hashtags = [] } = parsePost(text || '');
  const tagCount = isRd ? 0 : hashtags.length;

  let fitNum; let fitLabel; let fitOk = true;
  if (platform === 'twitter') { fitNum = `${chars}/${platformLimit}`; fitLabel = t('cmp.chars'); fitOk = chars <= platformLimit; }
  else if (platform === 'facebook') { fitOk = words >= 100 && words <= 180; fitNum = fitOk ? t('cmp.fits') : `${words}`; fitLabel = '100–180'; }
  else if (isRd) { fitOk = tagCount === 0; fitNum = fitOk ? t('cmp.noTags') : `${tagCount} #`; fitLabel = t('cmp.redditRule'); }
  else { fitNum = chars.toLocaleString('en-IN'); fitLabel = t('cmp.chars'); }

  const quick = [t('cmp.q.shorter'), t('cmp.q.question'), t('cmp.q.number'), t('cmp.q.assertive')];
  const regenDisabled = Boolean(refinedAt) || !refinementNote.trim() || busy;

  return (
    <div className={`flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto transition-opacity duration-300 ${busy ? 'opacity-45' : ''}`}>
      {/* header: version switch · listen · translate */}
      <div className="flex min-h-[34px] shrink-0 flex-wrap items-center gap-2">
        {hasOtherVersion && (
          <div role="group" aria-label={refinedIsLive ? t('gen.versionRefined') : t('gen.versionOriginal')} className="flex rounded-lg border border-[#22305c] p-0.5">
            {[['orig', !refinedIsLive, t('cmp.vOrig')], ['new', refinedIsLive, t('cmp.vNew')]].map(([k, on, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                disabled={on || switchingVersion}
                onClick={onToggleVersion}
                className="rounded-md px-2 py-0.5 text-[14px] font-semibold"
                style={on ? { background: '#EDEEF2', color: '#0c1430' } : { color: '#c0cde8' }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <span className="flex-1" />
        {ready && (
          <SpeakButton
            content={text}
            lang={showTranslated ? 'en' : lang}
          />
        )}
        {ready && (
          <button
            type="button"
            aria-pressed={showTranslated}
            onClick={showTranslated ? onShowOriginal : onTranslate}
            disabled={translating}
            className="cmp-act flex h-[34px] items-center gap-1.5 rounded-[9px] border border-[#22305c] px-2.5 text-[14.5px] font-semibold text-[#EDEEF2]"
            style={{ background: showTranslated ? '#15224f' : '#101937' }}
          >
            <Languages size={15} strokeWidth={2} />
            {translating ? t('gen.translating') : showTranslated ? t('gen.showHindi') : t('gen.translate')}
          </button>
        )}
      </div>

      {/* three tiles */}
      <div className="grid grid-cols-3 gap-2">
        {[
          [ready ? fitNum : '—', fitLabel, ready ? (fitOk ? '#4ade80' : '#F0705A') : '#fff'],
          [ready ? String(words) : '—', t('gen.words'), '#fff'],
          [ready ? String(tagCount) : '—', t('gen.hashtags'), '#fff'],
        ].map(([n, l, c]) => (
          <div key={l} className="min-w-0 rounded-xl border border-[#22305c]/80 bg-[#101937] px-2.5 py-2.5 xl:px-3">
            <div className="truncate font-count text-[17px] font-bold tabular-nums xl:text-[20px]" style={{ color: c }}>{n}</div>
            <div className="truncate text-[13.5px] text-[#8b94b8]">{l}</div>
          </div>
        ))}
      </div>

      {/* publish */}
      <button
        type="button"
        onClick={onPublish}
        disabled={!ready || sharing}
        className="cmp-gen btn-gradient flex min-h-[52px] items-center justify-center gap-2.5 rounded-[14px] text-[17px] font-semibold text-white disabled:opacity-50"
      >
        <span aria-hidden="true" className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-white/20 text-[12px] font-bold">{look.icon}</span>
        {postStatus === 'published' ? t('gen.published') : t(`gen.postTo.${platform}`)}
      </button>
      <div className="flex gap-2">
        <button type="button" onClick={onCopy} disabled={!ready} className="cmp-act flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#22305c] bg-[#101937] text-[15.5px] font-semibold text-[#EDEEF2] disabled:opacity-50">
          {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? t('gen.copied') : t('common.copy')}
        </button>
        {tagCount > 0 && (
          <button type="button" onClick={onCopyHashtags} className="cmp-act flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[#22305c] bg-[#101937] text-[15.5px] font-semibold text-[#EDEEF2]">
            {copiedHashtags ? <Check size={15} /> : '#'} {copiedHashtags ? t('gen.copied') : t('gen.hashtags')}
          </button>
        )}
      </div>
      {shareMsg && <span className="text-[14px] leading-[1.5] text-[#8b94b8]" role="status">{shareMsg}</span>}

      {/* refine (once per post, note required) */}
      {canRefine && (
        <div className="flex flex-col gap-2 rounded-[14px] border border-[#22305c]/80 bg-[#101937] p-3">
          <div className="flex items-center">
            <span className="font-count text-[13px] font-semibold uppercase tracking-[.08em] text-[#8b94b8]">{t('cmp.refine')}</span>
            <span className="ml-auto text-[13.5px] text-[#6b78a0]">{t('cmp.onceNote')}</span>
          </div>
          <label className="flex h-[42px] items-center gap-2 rounded-[10px] border bg-[#0c1430] pl-3 pr-[5px]" style={{ borderColor: refinementNote.trim() && !refinedAt ? '#6aa8ff' : '#22305c' }}>
            <input
              aria-label={t('cmp.refine')}
              value={refinementNote}
              disabled={Boolean(refinedAt)}
              onChange={(e) => onNoteChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !regenDisabled && onRegenerate()}
              placeholder={refinedAt ? t('gen.refineAlreadyUsed') : t('gen.refinementPlaceholder')}
              className="min-w-0 flex-1 border-0 bg-transparent text-[15.5px] text-[#EDEEF2] outline-none placeholder:text-[#5a6e9a]"
            />
            <button
              type="button"
              onClick={onRegenerate}
              aria-disabled={regenDisabled}
              className="flex h-8 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 text-[14.5px] font-semibold"
              style={regenDisabled ? { background: '#15224f', color: '#6b78a0' } : { background: '#3f9fff', color: '#fff' }}
            >
              <RefreshCw size={13} strokeWidth={2.2} /> {t('gen.regenerate')}
            </button>
          </label>
          {!refinedAt && (
            <div className="flex flex-wrap gap-1.5">
              {quick.map((q) => (
                <button key={q} type="button" onClick={() => onNoteChange(q)} className="cmp-act min-h-7 rounded-full border border-[#22305c] px-2.5 text-[14px] text-[#c0cde8]">
                  {q}
                </button>
              ))}
            </div>
          )}
          {refineHint && <p className="m-0 text-[13px] text-[#fbbf24]">{refineHint}</p>}
        </div>
      )}

      {children}
    </div>
  );
}
