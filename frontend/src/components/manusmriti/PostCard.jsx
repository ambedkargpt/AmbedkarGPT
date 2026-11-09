import { useState } from 'react';
import { Check, ChevronDown, Copy, ExternalLink } from 'lucide-react';
import GlassCard from '../ui/GlassCard';
import { copyText, isThread, xComposeUrl } from '../../data/manusmriti';
import { useI18n } from '../../i18n/index.jsx';

// The same button the BhimBot page uses for Copy, so the two screens feel like one product.
const actionBtn =
  'inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#1e3260]/70 bg-[#0a1428]/80 px-4 text-[14.5px] font-semibold text-[#c7d6ee] transition hover:border-[#3a6bc4]/70 hover:text-white';

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
 * One critique post, laid out the way it would read on X, with the verse(s) it is built on one tap away.
 *
 * The post itself is English whatever the interface language is, so it is set in the Latin font and marked
 * lang="en": under the Hindi interface the page's own font stack would otherwise render it in Mangal.
 */
export default function PostCard({ post, topicTitle, verses }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const thread = isThread(post);
  const compose = xComposeUrl(post);

  return (
    <GlassCard className="flex flex-col gap-4 !p-5 md:!p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#64b5ff]">{topicTitle}</span>
        {!post.reviewed && (
          <span className="rounded-full border border-[#f5b942]/40 bg-[#f5b942]/10 px-2.5 py-0.5 text-[11px] font-medium text-[#f5b942]">
            {t('msm.draft')}
          </span>
        )}
      </div>

      <div lang="en" style={{ fontFamily: 'var(--font-sans)' }} className={thread ? 'space-y-3 border-l-2 border-[#2a4375] pl-4' : ''}>
        {post.parts.map((part, i) => (
          <p key={i} className={`whitespace-pre-line text-[17px] leading-7 text-white ${i ? 'mt-3' : ''}`}>{part}</p>
        ))}
      </div>

      <div className="flex flex-col gap-3 pt-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-[#1e3260]/70 bg-[#0a1428]/60 px-4 text-left text-[14.5px] text-[#c7d6ee] transition hover:border-[#3a6bc4]/70 hover:text-white"
        >
          <span>
            <span className="font-semibold">{t(post.verses.length > 1 ? 'msm.showVerses' : 'msm.showVerse')}</span>
            <span className="ml-2 text-[#8aa4d6]" lang="en">{post.verses.join(' · ')}</span>
          </span>
          <ChevronDown size={16} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>

        {open && (
          <div className="space-y-3" lang="en" style={{ fontFamily: 'var(--font-sans)' }}>
            {post.verses.map((id) => (
              <blockquote key={id} className="rounded-xl border-l-2 border-[#3f6bd4] bg-white/[0.04] px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8aa4d6]">Manusmriti {id}</p>
                <p className="mt-1.5 text-[15px] leading-6 text-[#d7e1f5]">{verses[id]?.text}</p>
              </blockquote>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <CopyButton post={post} />
          {compose && (
            <a href={compose} target="_blank" rel="noopener noreferrer" className={actionBtn}>
              <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
              {t('msm.postOnX')}
            </a>
          )}
        </div>
        {thread && <p className="text-[13px] text-[#8aa4d6]">{t('msm.threadHint')}</p>}
      </div>
    </GlassCard>
  );
}
