import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  Archive, Check, Copy, FileText, LayoutGrid, Languages, List, Maximize2, MoreHorizontal,
  RefreshCw, Search, Send, Sparkles, X,
} from 'lucide-react';

import SpeakButton from '../components/generate/SpeakButton';
import PublishSheet from '../components/publish/PublishSheet';
import Topbar from '../components/dashboard/Topbar';
import PostContent from '../components/generate/PostContent';
import { PLATFORM_ICON } from '../components/generate/platformIcons';
import { getPosts, deletePost, translatePost, togglePostVersion } from '../api/posts';
import { useI18n } from '../i18n/index.jsx';

/**
 * My posts.
 *
 *   heading and counts
 *   search · status filter · grid or list
 *   posts grouped by day (today, yesterday, then dates), newest first
 *
 * Each card says where the post was written for, its status and time, and
 * offers the one action that matters for its status: Publish for a draft,
 * Copy for the rest. Everything else (read, listen, translate, switch version,
 * archive) is in the card's menu or the reader.
 */

const STATUS = {
  draft:     { fg: '#ffb038', bg: 'rgba(255,176,56,0.12)', border: 'rgba(255,176,56,0.35)', dashed: true },
  published: { fg: '#4ade80', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.35)' },
  archived:  { fg: '#94a3b8', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.3)' },
};

const PLATFORMS = {
  whatsapp: { name: 'WhatsApp', color: '#25d366' },
  reddit:   { name: 'Reddit',   color: '#ff4500' },
  facebook: { name: 'Facebook', color: '#1877f2' },
  twitter:  { name: 'X',        color: '#e7e9ea' },
};

const VIEW_KEY = 'ag-history-view';

function readView() {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; }
}

/** Where the post was written for, from the profile it was generated with. */
function platformOf(post) {
  const raw = String(post?.generation_meta?.profile_used?.target_platform || '').toLowerCase();
  if (raw.includes('whatsapp')) return 'whatsapp';
  if (raw.includes('reddit')) return 'reddit';
  if (raw.includes('facebook')) return 'facebook';
  if (raw.includes('twitter') || raw === 'x' || raw.includes(' x')) return 'twitter';
  return null;
}

function dayKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function StatusBadge({ status }) {
  const { t } = useI18n();
  const s = STATUS[status] ?? STATUS.draft;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12.5px] font-bold"
      style={{ color: s.fg, background: s.bg, border: `1px ${s.dashed ? 'dashed' : 'solid'} ${s.border}` }}
    >
      {t(`status.${status}`)}
    </span>
  );
}

function PlatformLabel({ id }) {
  const { t } = useI18n();
  const p = PLATFORMS[id];
  const Icon = id ? PLATFORM_ICON[id] : null;
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[14.5px] font-semibold text-white">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ background: p ? `${p.color}1f` : '#13204a', color: p?.color ?? '#9cc3ff' }}
        aria-hidden="true"
      >
        {Icon ? <Icon width={15} height={15} /> : <FileText size={14} strokeWidth={2} />}
      </span>
      <span className="truncate">{p?.name ?? t('hist.post')}</span>
    </span>
  );
}

// ── Reader ───────────────────────────────────────────────────────────────────

function PostReader({ post, onClose, onCopy, copiedId }) {
  const { t, lang } = useI18n();
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState('');
  const [showTranslated, setShowTranslated] = useState(false);
  const content = showTranslated && translated ? translated : (post?.content ?? '');
  const contentLang = showTranslated && translated ? 'en' : 'hi';

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  async function toggleTranslate() {
    if (showTranslated) { setShowTranslated(false); return; }
    if (translated) { setShowTranslated(true); return; }
    setTranslating(true);
    try {
      const res = await translatePost(post.id, 'en');
      setTranslated(res.translated_content ?? '');
      setShowTranslated(true);
    } catch { /* stays on the original */ } finally { setTranslating(false); }
  }

  const when = post.created_at
    ? new Date(post.created_at).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : '';

  // Into document.body: a transformed ancestor would otherwise pin the dialog
  // inside the page instead of the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-[#030611]/85 p-4 backdrop-blur-sm md:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('hist.read')}
    >
      <div
        className="hist-pop relative my-auto flex max-h-[calc(100vh-4rem)] w-full max-w-[820px] flex-col overflow-hidden rounded-3xl border border-[#1e3260] bg-[#0a1130] shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[#1a2c55]/80 px-5 py-4 md:px-7">
          <PlatformLabel id={platformOf(post)} />
          <StatusBadge status={post.status} />
          <span className="text-[13.5px] text-[#7d89ad]">{when}</span>
          <div className="ml-auto flex items-center gap-2">
            <SpeakButton content={content} lang={contentLang} />
            <button
              type="button"
              onClick={toggleTranslate}
              disabled={translating}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#1e3a6e] bg-[#0d1840] px-3.5 text-[14px] font-semibold text-[#9cc3ff] transition hover:text-white disabled:opacity-50"
            >
              <Languages size={15} strokeWidth={2} />
              {translating ? t('hist.translating') : showTranslated ? t('hist.original') : t('hist.translate')}
            </button>
            <button
              type="button"
              onClick={() => onCopy(post.id, content)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#1e3260] px-3.5 text-[14px] font-semibold text-[#c5d0e8] transition hover:text-white"
            >
              {copiedId === post.id ? <Check size={15} strokeWidth={2.6} className="text-[#4ade80]" /> : <Copy size={15} strokeWidth={2} />}
              {copiedId === post.id ? t('hist.copied') : t('hist.copy')}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('hist.close')}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#1e3260] text-[#8b94b8] transition hover:text-white"
            >
              <X size={17} strokeWidth={2} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 md:px-9">
          <PostContent content={content} lang={contentLang} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function CardMenu({ post, translated, translating, onRead, onTranslate, onToggleVersion, onArchive, onCopy }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function away(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    function esc(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const run = (fn) => () => { setOpen(false); fn(); };
  const item = 'flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-[#dbe5f7] transition hover:bg-[#13204a]';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('hist.more')}
        className={`flex h-11 w-11 items-center justify-center rounded-xl border transition ${open ? 'border-[#3f9fff] bg-[#13204a] text-white' : 'border-[#1e3260] text-[#8b94b8] hover:border-[#2f4a7a] hover:text-white'}`}
      >
        <MoreHorizontal size={18} strokeWidth={2.2} />
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="hist-pop absolute bottom-full right-0 z-30 mb-2 w-64 overflow-hidden rounded-2xl border border-[#1e3260] bg-[#0b1430] py-1 shadow-[0_24px_50px_rgba(0,0,0,0.6)]"
        >
          <button type="button" role="menuitem" className={item} onClick={run(onRead)}>
            <Maximize2 size={16} className="text-[#9cc3ff]" /> {t('hist.read')}
          </button>
          <button type="button" role="menuitem" className={item} onClick={run(onTranslate)} disabled={translating}>
            <Languages size={16} className="text-[#9cc3ff]" /> {translating ? t('hist.translating') : translated ? t('hist.original') : t('hist.translate')}
          </button>
          {post.status === 'draft' && (
            <button type="button" role="menuitem" className={item} onClick={run(onCopy)}>
              <Copy size={16} className="text-[#9cc3ff]" /> {t('hist.copy')}
            </button>
          )}
          {post.status === 'draft' && post.previous_content && (
            <button type="button" role="menuitem" className={item} onClick={run(onToggleVersion)}>
              <RefreshCw size={16} className="text-[#9cc3ff]" /> {post.refined_is_live === false ? t('gen.showRefined') : t('gen.showOriginal')}
            </button>
          )}
          {post.status !== 'archived' && (
            <>
              <div className="my-1 h-px bg-[#1e3260]" />
              <button type="button" role="menuitem" className={`${item} text-[#ff8a8a] hover:bg-[#3a1420]/60`} onClick={run(onArchive)}>
                <Archive size={16} /> {t('hist.archive')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PostCard({ post, view, index, onOpen, onCopy, onPublish, onArchive, onToggleVersion, copiedId }) {
  const { t, lang } = useI18n();
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState('');
  const [showTranslated, setShowTranslated] = useState(false);
  const content = showTranslated && translated ? translated : (post.content ?? '');
  const platform = platformOf(post);
  const time = post.created_at
    ? new Date(post.created_at).toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', { hour: '2-digit', minute: '2-digit' })
    : '';

  async function toggleTranslate() {
    if (showTranslated) { setShowTranslated(false); return; }
    if (translated) { setShowTranslated(true); return; }
    setTranslating(true);
    try {
      const res = await translatePost(post.id, 'en');
      setTranslated(res.translated_content ?? '');
      setShowTranslated(true);
    } catch { /* stays on the original */ } finally { setTranslating(false); }
  }

  const copied = copiedId === post.id;
  const accent = PLATFORMS[platform]?.color ?? '#3f9fff';
  const list = view === 'list';

  return (
    <article
      className={`hist-card group relative flex rounded-2xl border border-[#1a2c55] bg-[#081127]/90 transition duration-300 hover:-translate-y-0.5 hover:border-[#2f4a7a] hover:shadow-[0_20px_40px_-24px_rgba(0,0,0,0.9)] ${list ? 'flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-5' : 'flex-col gap-3 p-5'}`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms`, '--accent': accent }}
    >
      <span aria-hidden="true" className="absolute left-0 top-5 h-8 w-[3px] rounded-r-full" style={{ background: accent }} />

      <div className={`flex items-center justify-between gap-3 ${list ? 'sm:w-[210px] sm:shrink-0 sm:flex-col sm:items-start sm:gap-2' : ''}`}>
        <PlatformLabel id={platform} />
        <StatusBadge status={post.status} />
      </div>

      <button
        type="button"
        onClick={() => onOpen(post)}
        className="min-w-0 flex-1 text-left"
        aria-label={t('hist.read')}
      >
        <p className={`whitespace-pre-line text-[16px] leading-[1.65] text-[#d5def0] ${list ? 'line-clamp-2' : 'line-clamp-4'}`}>
          {content}
        </p>
      </button>

      <div className={`flex items-center gap-2 border-t border-[#1a2c55] pt-3 ${list ? 'sm:border-t-0 sm:pt-0' : 'mt-auto'}`}>
        <span className="mr-auto font-count text-[13.5px] text-[#7d89ad]">{time}</span>
        {post.status === 'draft' ? (
          <button
            type="button"
            onClick={() => onPublish(post.id)}
            className="btn-gradient inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold text-white"
          >
            <Send size={15} strokeWidth={2.2} /> {t('hist.publish')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onCopy(post.id, content)}
            className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-[15px] font-semibold transition ${copied ? 'border-[#22c55e]/50 text-[#4ade80]' : 'border-[#1e3260] text-[#dbe5f7] hover:border-[#2f4a7a] hover:text-white'}`}
          >
            {copied ? <Check size={15} strokeWidth={2.6} /> : <Copy size={15} strokeWidth={2} />}
            {copied ? t('hist.copied') : t('hist.copy')}
          </button>
        )}
        <CardMenu
          post={post}
          translated={showTranslated}
          translating={translating}
          onRead={() => onOpen(post)}
          onTranslate={toggleTranslate}
          onToggleVersion={() => onToggleVersion(post.id)}
          onArchive={() => onArchive(post.id)}
          onCopy={() => onCopy(post.id, content)}
        />
      </div>
    </article>
  );
}

function CardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#1a2c55] bg-[#081127]/70 p-5">
      <div className="flex justify-between"><div className="h-7 w-28 animate-pulse rounded-lg bg-[#13204a]" /><div className="h-6 w-20 animate-pulse rounded-full bg-[#13204a]" /></div>
      <div className="h-4 w-full animate-pulse rounded bg-[#13204a]" />
      <div className="h-4 w-11/12 animate-pulse rounded bg-[#13204a]" />
      <div className="h-4 w-3/5 animate-pulse rounded bg-[#13204a]" />
      <div className="mt-2 flex justify-end gap-2"><div className="h-11 w-28 animate-pulse rounded-xl bg-[#13204a]" /><div className="h-11 w-11 animate-pulse rounded-xl bg-[#13204a]" /></div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PostHistory() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const [posts, setPosts] = useState([]);
  const [publishing, setPublishing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopied] = useState(null);
  const [openPost, setOpenPost] = useState(null);
  const [view, setView] = useState(readView);

  useEffect(() => {
    getPosts({ limit: 200 })
      .then((data) => setPosts(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function chooseView(v) {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* per-viewer convenience only */ }
  }

  async function handleCopy(id, content) {
    try { await navigator.clipboard.writeText(content); } catch { /* ignore */ }
    setCopied(id);
    setTimeout(() => setCopied(null), 1800);
  }

  // Publishing is choosing a destination; the sheet posts and marks it together.
  function handlePublish(id) {
    setPublishing(posts.find((p) => p.id === id) ?? null);
  }

  function handlePublished(id) {
    setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'published' } : p)));
  }

  async function handleToggleVersion(id) {
    try {
      const updated = await togglePostVersion(id);
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
    } catch { /* ignore */ }
  }

  async function handleArchive(id) {
    try {
      await deletePost(id);
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status: 'archived' } : p)));
    } catch { /* ignore */ }
  }

  const counts = useMemo(() => ({
    all: posts.length,
    draft: posts.filter((p) => p.status === 'draft').length,
    published: posts.filter((p) => p.status === 'published').length,
    archived: posts.filter((p) => p.status === 'archived').length,
  }), [posts]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const shown = posts
      .filter((p) => (filter === 'all' || p.status === filter) && (!q || p.content?.toLowerCase().includes(q)))
      .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const out = [];
    for (const p of shown) {
      const d = p.created_at ? new Date(p.created_at) : null;
      const key = d ? dayKey(d) : 'none';
      let label = '';
      if (d && key === dayKey(today)) label = t('hist.today');
      else if (d && key === dayKey(yesterday)) label = t('hist.yesterday');
      else if (d) label = d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'short', day: 'numeric', month: 'long' });
      const last = out[out.length - 1];
      if (last && last.key === key) last.posts.push(p);
      else out.push({ key, label, posts: [p] });
    }
    return out;
  }, [posts, filter, search, t, lang]);

  const shownCount = groups.reduce((n, g) => n + g.posts.length, 0);
  let running = 0;

  return (
    <>
      <div className="relative px-4 sm:px-6 md:px-10">
        <div className="lg:hidden">
        <Topbar
          title={t('hist.title')}
          icon={<FileText size={17} strokeWidth={2} />}
          right={(
            <button
              type="button"
              onClick={() => navigate('/generate/social-media')}
              className="btn-gradient inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-[15px] font-semibold text-white shadow-[0_8px_22px_rgba(37,99,235,0.35)]"
            >
              <Sparkles size={16} strokeWidth={2.1} />
              <span className="hidden sm:inline">{t('hist.new')}</span>
            </button>
          )}
        />
        </div>

        <main className="relative z-10 mx-auto max-w-[1180px] pb-12 lg:pt-10">
          <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1e3260]/60 pb-6">
            <div className="flex flex-col gap-2">
              <h1 className="hidden font-display text-[48px] font-bold leading-[1.05] text-white lg:block">{t('hist.title')}</h1>
              <p className="text-[16px] text-[#8ea3c7]">
                {loading
                  ? <span className="inline-block h-4 w-64 animate-pulse rounded bg-[#13204a] align-middle" />
                  : t('hist.stats', { n: counts.all, d: counts.draft, p: counts.published })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/generate/social-media')}
              className="btn-gradient hidden min-h-12 items-center gap-2 rounded-xl px-5 text-[16px] font-semibold text-white shadow-[0_10px_26px_rgba(37,99,235,0.35)] lg:inline-flex"
            >
              <Sparkles size={17} strokeWidth={2.1} /> {t('hist.new')}
            </button>
          </header>

          {/* Controls */}
          <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">{t('hist.search')}</span>
              <Search size={17} strokeWidth={2.2} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7d89ad]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('hist.search')}
                className="min-h-[52px] w-full rounded-2xl border border-[#1e3260] bg-[#0a1128]/90 pl-11 pr-4 text-[16px] text-white outline-none transition placeholder:text-[#4e5a80] focus:border-[#3f9fff] focus:shadow-[0_0_0_3px_rgba(63,159,255,0.18)]"
              />
            </label>

            <div className="flex items-center gap-3 overflow-x-auto [scrollbar-width:none]">
              <div role="tablist" aria-label={t('history.title')} className="flex shrink-0 gap-1 rounded-2xl border border-[#1e3260]/70 bg-[#0a1130]/70 p-1.5">
                {['all', 'draft', 'published', 'archived'].map((tab) => {
                  const on = filter === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setFilter(tab)}
                      className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-[15px] font-semibold transition ${on ? 'btn-gradient text-white shadow-[0_8px_22px_rgba(37,99,235,0.3)]' : 'text-[#9fb0d4] hover:bg-[#13204a]/70 hover:text-white'}`}
                    >
                      {t(`status.${tab}`)}
                      <span className={`font-count text-[13px] ${on ? 'text-white/80' : 'text-[#6b7a9e]'}`}>{counts[tab]}</span>
                    </button>
                  );
                })}
              </div>

              <div role="group" aria-label={t('hist.view')} className="flex shrink-0 gap-1 rounded-2xl border border-[#1e3260]/70 bg-[#0a1130]/70 p-1.5">
                {/* eslint-disable-next-line no-unused-vars -- Icon is used as a JSX tag */}
                {[['grid', LayoutGrid, t('hist.grid')], ['list', List, t('hist.list')]].map(([id, Icon, label]) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={view === id}
                    onClick={() => chooseView(id)}
                    title={label}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[15px] font-semibold transition ${view === id ? 'bg-[#13204a] text-white' : 'text-[#9fb0d4] hover:text-white'}`}
                  >
                    <Icon size={17} strokeWidth={2.1} />
                    <span className="hidden xl:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Posts */}
          {loading ? (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : shownCount === 0 ? (
            <div className="mt-8 flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-[#1e3260] px-6 py-16 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#13204a] text-[#3f9fff]">
                <Sparkles size={26} strokeWidth={1.7} />
              </span>
              <p className="max-w-[420px] text-[16px] text-[#9fb0d4]">{search ? t('history.emptySearch') : t('history.emptyStart')}</p>
              {!search && (
                <button
                  type="button"
                  onClick={() => navigate('/generate/social-media')}
                  className="btn-gradient inline-flex min-h-12 items-center gap-2 rounded-xl px-6 text-[16px] font-semibold text-white"
                >
                  <Sparkles size={16} strokeWidth={2} /> {t('history.generateAPost')}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-8 flex flex-col gap-9">
              {groups.map((g) => (
                <section key={g.key} aria-label={g.label}>
                  <div className="mb-4 flex items-center gap-4">
                    <h2 className="font-display text-[22px] font-bold text-white md:text-[24px]">{g.label}</h2>
                    <span className="h-px flex-1 bg-[#1e3260]/70" aria-hidden="true" />
                    <span className="font-count text-[13.5px] text-[#7d89ad]">
                      {g.posts.length === 1 ? t('hist.countOne') : t('hist.count', { n: g.posts.length })}
                    </span>
                  </div>
                  <div className={view === 'list' ? 'flex flex-col gap-3' : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
                    {g.posts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        view={view}
                        index={running++}
                        onOpen={setOpenPost}
                        onCopy={handleCopy}
                        onPublish={handlePublish}
                        onArchive={handleArchive}
                        onToggleVersion={handleToggleVersion}
                        copiedId={copiedId}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {search && (
                <p className="text-center text-[14px] text-[#7d89ad]">{t('hist.showing', { n: shownCount, total: counts.all })}</p>
              )}
            </div>
          )}
        </main>
      </div>

      {openPost && (
        <PostReader post={openPost} onClose={() => setOpenPost(null)} onCopy={handleCopy} copiedId={copiedId} />
      )}

      {publishing && (
        <PublishSheet
          post={publishing}
          onClose={() => setPublishing(null)}
          onPublished={() => { handlePublished(publishing.id); setPublishing(null); }}
        />
      )}

      <style>{`
        .hist-card { animation: hist-rise .38s cubic-bezier(.2,.8,.2,1) backwards; }
        @keyframes hist-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .hist-pop { animation: hist-pop .2s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes hist-pop { from { opacity: 0; transform: translateY(6px) scale(.98); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .hist-card, .hist-pop { animation: none; } }
      `}</style>
    </>
  );
}
