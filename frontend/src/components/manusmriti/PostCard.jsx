import { useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { copyText, isThread, xComposeUrl } from '../../data/manusmriti';
import { useI18n } from '../../i18n/index.jsx';

// The same button the BhimBot page uses for Copy, so the two screens feel like one product.
const actionBtn =
  'inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#1e3260]/70 bg-[#0a1428]/80 px-4 text-[14.5px] font-semibold text-[#c7d6ee] transition hover:border-[#3a6bc4]/70 hover:text-white';

// The entry's words are English whatever the interface language is, so they are set in the Latin font and
// marked lang="en": under the Hindi interface the page's own font stack would render them in Mangal.
const latin = { fontFamily: 'var(--font-sans)' };

// How many verses a card shows before offering the rest. The first three carry the argument; a longer run
// (a range the entry cites to name who a rule is about) would push the critique off the screen.
const VERSES_SHOWN = 3;

function CopyButton({ post }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText(post));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked: nothing to do */ }
  }
  return (
    <button type="button" onClick={copy} className={actionBtn}>
      {copied ? <Check size={14} strokeWidth={2.2} className="text-[#22c55e]" /> : <Copy size={14} strokeWidth={2} />}
      {copied ? t('msm.copied') : t(isThread(post) ? 'msm.copyThread' : 'msm.copy')}
    </button>
  );
}

/**
 * One entry of the Manusmriti section, set out the way an argument is read: the headline, the verse itself,
 * what it says in plain words, then the critique, set apart and marked as opinion so the reader can tell
 * what the text says from what the writer makes of it. A note on the other side, where the verse itself
 * offers one, follows. The short post for X, which the entry is also written as, is behind a tap.
 */
export default function PostCard({ post, topicTitle, verses }) {
  const { t, lang } = useI18n();
  const [showPost, setShowPost] = useState(false);
  const [allVerses, setAllVerses] = useState(false);
  const thread = isThread(post);
  const compose = xComposeUrl(post);

  const shown = allVerses ? post.verses : post.verses.slice(0, VERSES_SHOWN);
  const hidden = post.verses.length - shown.length;
  // Letter-spaced capitals suit Latin small print; in Devanagari the spacing pulls conjuncts apart.
  const caps = lang === 'hi' ? '' : 'uppercase tracking-[0.12em]';
  const label = `${lang === 'hi' ? 'text-[14px]' : 'text-xs'} font-semibold ${caps}`;

  return (
    <GlassCard className="flex flex-col gap-5 !p-5 md:!p-7">
      <div className="flex items-center justify-between gap-3">
        <span className={`text-xs font-medium text-[#64b5ff] ${lang === 'hi' ? '' : 'uppercase tracking-[0.14em]'}`}>{topicTitle}</span>
        {!post.reviewed && (
          <span className="rounded-full border border-[#f5b942]/40 bg-[#f5b942]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#f5b942]">
            {t('msm.draft')}
          </span>
        )}
      </div>

      {/* Each part below is drawn only if the entry has it, so data from before the commentary was added (a cached
          answer during a deploy) shows the verses and the post instead of empty labels. */}
      {post.headline && <h2 lang="en" style={latin} className="text-[22px] font-semibold leading-snug text-white md:text-[24px]">{post.headline}</h2>}

      <div lang="en" style={latin} className="space-y-3">
        {shown.map((id) => (
          <blockquote key={id} className="rounded-xl border-l-[3px] border-[#3f6bd4] bg-white/[0.04] px-4 py-3.5">
            <p className="text-[16px] leading-7 text-[#e3ebfb]">{verses[id]?.text}</p>
            <footer className="mt-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#8aa4d6]">Manusmriti {id}</footer>
          </blockquote>
        ))}
        {hidden > 0 && (
          <button type="button" onClick={() => setAllVerses(true)} className="text-[14px] font-medium text-[#64b5ff] transition hover:text-white">
            {hidden === 1 ? t('msm.moreVerse') : t('msm.moreVerses', { n: hidden })}
          </button>
        )}
      </div>

      {post.says && (
        <section lang="en" style={latin}>
          <h3 className={`${label} text-[#8aa4d6]`}>{t('msm.says')}</h3>
          <p className="mt-1.5 text-[16px] leading-7 text-[#d7e1f5]">{post.says}</p>
        </section>
      )}

      {post.critique && (
        <section lang="en" style={latin} className="rounded-xl border border-[#f08a5d]/30 bg-[#f08a5d]/[0.07] p-4 md:p-5">
          <h3 className={`${label} flex items-center gap-2 text-[#f4a77c]`}>
            {t('msm.critique')}
            <span className="rounded-full border border-[#f08a5d]/40 px-2 py-0.5 text-[10.5px] font-medium normal-case tracking-normal">{t('msm.opinion')}</span>
          </h3>
          <p className="mt-2 text-[16.5px] leading-7 text-white">{post.critique}</p>
        </section>
      )}

      {post.fair_note && (
        <p lang="en" style={latin} className="border-l-2 border-[#3a4a6e] pl-3 text-[14.5px] leading-6 text-[#a9bbdd]">
          <span className="font-semibold text-[#c7d6ee]">{t('msm.fair')}</span> {post.fair_note}
        </p>
      )}

      <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton post={post} />
          {compose && (
            <a href={compose} target="_blank" rel="noopener noreferrer" className={actionBtn}>
              <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
              {t('msm.postOnX')}
            </a>
          )}
          <button
            type="button"
            onClick={() => setShowPost((o) => !o)}
            aria-expanded={showPost}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 px-1 text-[14px] font-medium text-[#8aa4d6] transition hover:text-white"
          >
            {t(showPost ? 'msm.hidePost' : 'msm.showPost')}
            <ChevronDown size={15} className={`transition-transform ${showPost ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>

        {showPost && (
          <div lang="en" style={latin} className="space-y-3 rounded-xl border border-white/10 bg-[#070d1c] p-4">
            {post.parts.map((part, i) => (
              <p key={i} className="whitespace-pre-line text-[15.5px] leading-7 text-[#e3ebfb]">{part}</p>
            ))}
          </div>
        )}
        {showPost && thread && <p className="text-[13px] text-[#8aa4d6]">{t('msm.threadHint')}</p>}
      </div>
    </GlassCard>
  );
}
