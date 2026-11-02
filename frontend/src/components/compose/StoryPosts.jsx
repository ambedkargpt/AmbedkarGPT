import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { getPosts } from '../../api/posts';
import { PLATFORM_LOOK, platformIdFromLabel } from './platformLook';

// "Your posts on this story": what this writer already wrote on the story,
// newest first, each with its platform and whether it went out. Reads the
// existing GET /posts?news_id=… (getPosts). Clicking one opens it in the phone.
//
// refreshKey: bump it after a generate / regenerate / publish so the list
// refetches (the page passes selectedPostId + postStatus).
export default function StoryPosts({ newsId, activePostId, refreshKey, maxPosts = 5, onOpen, onCount }) {
  const { t } = useI18n();
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (!newsId) return undefined;
    let alive = true;
    getPosts({ newsId, limit: maxPosts * 2 })
      .then((rows) => {
        if (!alive) return;
        const list = (Array.isArray(rows) ? rows : rows?.items ?? [])
          .filter((p) => p.status !== 'archived')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setPosts(list);
        onCount?.(list.length);
      })
      .catch(() => { if (alive) setPosts([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newsId, refreshKey]);

  return (
    <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-hidden rounded-[14px] border border-[#22305c]/80 bg-[#101937] p-3">
      <div className="flex items-center">
        <span className="font-count text-[13px] font-semibold uppercase tracking-[.08em] text-[#8b94b8]">{t('cmp.storyPosts')}</span>
        <span className="ml-auto font-count text-[13.5px] font-semibold text-[#6aa8ff]">{posts.length}/{maxPosts}</span>
      </div>
      {posts.length === 0 && <p className="m-0 text-[14px] text-[#6b78a0]">{t('cmp.storyPostsEmpty')}</p>}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {posts.map((p) => {
          const pid = platformIdFromLabel(p.generation_meta?.profile_used?.target_platform);
          const look = PLATFORM_LOOK[pid];
          const live = p.status === 'published';
          const firstLine = (p.content || '').trim().split('\n')[0];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen?.(p, pid)}
              aria-current={p.id === activePostId ? 'true' : undefined}
              className="cmp-act flex items-center gap-2.5 rounded-[10px] border px-2.5 py-1.5 text-left"
              style={{ borderColor: p.id === activePostId ? '#3f9fff' : '#22305c' }}
            >
              <span aria-hidden="true" className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] text-[11px] font-bold text-white" style={{ background: look.iconBg }}>
                {look.icon}
              </span>
              <span className="font-hindi min-w-0 flex-1 truncate text-[14.5px] text-[#c0cde8]">{firstLine}</span>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 font-count text-[12px] font-semibold uppercase tracking-[.08em]"
                style={live
                  ? { background: 'rgba(74,222,128,0.12)', color: '#4ade80' }
                  : { background: 'rgba(139,148,184,0.12)', color: '#8b94b8' }}
              >
                {live ? t('gen.published') : t('cmp.draft')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
