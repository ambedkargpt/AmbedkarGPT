import { useI18n } from '../../i18n/index.jsx';

// The story, folded into one band above the composer: kind · tag · meta, a
// one-line headline, a one-line summary, then the posts-on-this-story dots and
// the two links. The full story is one click away ("Read full story") instead
// of taking a whole column.
export default function StoryStrip({
  article, accent = '#3f9fff', kindLabel, kindColor = '#5a6e9a', tagLabel, metaLine,
  postsWritten = 0, maxPosts = 5, onReadFull, onChangeStory,
}) {
  const { t } = useI18n();
  return (
    <section
      aria-label={t('cmp.storyLabel')}
      className="mx-6 mt-4 flex shrink-0 items-center gap-5 rounded-2xl border border-[#22305c]/80 px-[18px] py-3.5"
      style={{
        borderLeft: `3px solid ${accent}`,
        background: `radial-gradient(520px 160px at 100% 0%, ${accent}24, transparent 70%), #101937`,
      }}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2.5 whitespace-nowrap">
          {kindLabel && (
            <span className="font-count text-[12.5px] font-semibold uppercase tracking-[.16em]" style={{ color: kindColor }}>
              {kindLabel}
            </span>
          )}
          {tagLabel && (
            <span
              className="rounded-full border px-2.5 py-px font-count text-[12.5px] font-medium tracking-[.08em]"
              style={{ color: accent, borderColor: `${accent}59`, background: `${accent}14` }}
            >
              {tagLabel}
            </span>
          )}
          {metaLine && <span className="truncate font-count text-[13px] font-medium text-[#5a6e9a]">{metaLine}</span>}
        </div>
        <h1 className="font-hindi truncate text-[22px] font-bold leading-[1.5] text-white">{article.title}</h1>
        {(article.summary || article.content) && (
          <p className="font-hindi truncate text-[15.5px] text-[#b9c8e4]">{article.summary || article.content}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          <span className="font-count text-[12.5px] font-semibold uppercase tracking-[.12em] text-[#8b94b8]">{t('cmp.postsShort')}</span>
          <span aria-hidden="true" className="flex gap-[3px]">
            {Array.from({ length: maxPosts }, (_, i) => (
              <span key={i} className="h-1.5 w-3.5 rounded-[3px]" style={{ background: i < postsWritten ? '#3f9fff' : '#22305c' }} />
            ))}
          </span>
          <span className="font-count text-[14.5px] font-semibold text-[#6aa8ff]">{postsWritten}/{maxPosts}</span>
        </div>
        <div className="flex gap-3.5 text-[15px] font-semibold">
          <button type="button" onClick={onReadFull} className="text-[#6aa8ff] underline-offset-2 hover:underline">{t('gen.readFull')}</button>
          <button type="button" onClick={onChangeStory} className="text-[#6aa8ff] underline-offset-2 hover:underline">{t('cmp.changeStory')}</button>
        </div>
      </div>
    </section>
  );
}
