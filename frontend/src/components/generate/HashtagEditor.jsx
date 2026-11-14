import { useState } from 'react';
import { Hash, Plus, X } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';

/**
 * The post's hashtags as chips the writer can remove, plus a box to add one.
 * Starts with the hashtag the post was written with. Every change is passed
 * to onChange with the whole new list; the parent saves it, and the post text
 * (which ends with these hashtags) comes back rewritten.
 *
 * A typed tag is tidied the way the server stores it: a leading #, spaces as
 * underscores. Duplicates are ignored.
 */
function tidyTag(raw) {
  const text = String(raw || '').trim().replace(/^#+/, '').replace(/[।.,!?;:"'“”‘’()[\]{}]/g, '').trim()
    .replace(/[\s\-–—]+/g, '_').replace(/^_+|_+$/g, '');
  return text ? `#${text}` : '';
}

export default function HashtagEditor({ tags, onChange, suggestions = [], saving = false, error = '', max = 10 }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');
  // Offered with one tap: the topic's and the party's, less those already on the post (so a default that was
  // removed comes back here).
  const offered = suggestions.filter((s) => !tags.some((x) => x.toLowerCase() === s.toLowerCase()));

  function add() {
    const tag = tidyTag(draft);
    if (!tag) return;
    setDraft('');
    if (tags.some((x) => x.toLowerCase() === tag.toLowerCase()) || tags.length >= max) return;
    onChange([...tags, tag]);
  }

  return (
    <section
      aria-label={t('tags.title')}
      className="mt-4 rounded-[20px] border border-white/[0.08] bg-white/[0.035] p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="inline-flex items-center gap-1.5 text-[15px] font-bold text-white">
          <Hash size={15} className="text-[#6aa8ff]" aria-hidden="true" />
          {t('tags.title')}
        </p>
        <span className="text-[13px] text-[#9aa8cc]" aria-live="polite">
          {saving ? t('tags.saving') : error || t('tags.sub')}
        </span>
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {tags.length === 0 && <li className="text-[14px] text-[#8a97bd]">{t('tags.none')}</li>}
        {tags.map((tag) => (
          <li
            key={tag}
            className="font-hindi inline-flex h-9 items-center gap-1 rounded-full border border-[#3f9fff]/35 bg-[#3f9fff]/10 pl-3 pr-1 text-[14px] font-medium text-[#8fc0ff]"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((x) => x !== tag))}
              aria-label={t('tags.remove', { tag })}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#8fc0ff] transition hover:bg-white/10 hover:text-white"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          </li>
        ))}
      </ul>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => { e.preventDefault(); add(); }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('tags.placeholder')}
          aria-label={t('tags.placeholder')}
          maxLength={80}
          className="font-hindi h-11 min-w-0 flex-1 rounded-[12px] border border-white/12 bg-[#0a1130]/80 px-3.5 text-[15px] text-white placeholder-[#7f8db3] outline-none transition focus:border-[#6e8cff] focus:shadow-[0_0_0_3px_rgba(110,140,255,0.22)]"
        />
        <button
          type="submit"
          disabled={!tidyTag(draft) || tags.length >= max}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[12px] border border-[#6e8cff]/45 bg-[#4f7dff]/15 px-4 text-[15px] font-semibold text-[#cfdcff] transition hover:bg-[#4f7dff]/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={16} strokeWidth={2.4} />
          {t('tags.add')}
        </button>
      </form>

      {offered.length > 0 && (
        <div className="mt-3.5">
          <p className="text-[13px] font-semibold text-[#9aa8cc]">{t('tags.suggested')}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {offered.map((tag) => (
              <li key={tag}>
                <button
                  type="button"
                  onClick={() => tags.length < max && onChange([...tags, tag])}
                  disabled={tags.length >= max}
                  aria-label={t('tags.addOne', { tag })}
                  className="font-hindi inline-flex h-9 items-center gap-1 rounded-full border border-dashed border-white/25 px-3 text-[14px] font-medium text-[#cfd8f0] transition hover:border-[#6e8cff] hover:bg-[#4f7dff]/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={13} strokeWidth={2.6} aria-hidden="true" />
                  {tag}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
