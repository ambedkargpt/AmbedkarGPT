import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Check, ExternalLink, Loader2, X } from 'lucide-react';

import { getNewsById } from '../../api/news';
import {
  getRedditAuthorizeUrl,
  getRedditStatus,
  publishPostToReddit,
} from '../../api/integrations';
import { updatePost } from '../../api/posts';
import { useI18n } from '../../i18n/index.jsx';

// Reddit caps a post title here, and it is the one limit the user has to work
// inside rather than one we can paper over.
const TITLE_MAX = 300;

// Reddit posts through the user's connected account. X, WhatsApp and
// Facebook open in a new tab with the post ready: X and WhatsApp take the
// text in the link; Facebook lets no site fill in a post, so the text goes on
// the clipboard to paste. LinkedIn is listed as "not yet" — a platform missing
// from the list reads as never coming.
const DESTINATIONS = [
  { id: 'reddit', labelKey: 'pub.reddit', live: true, accent: '#ff4500' },
  { id: 'twitter', labelKey: 'pub.twitter', live: true, accent: '#1d9bf0', link: true },
  { id: 'whatsapp', labelKey: 'pub.whatsapp', live: true, accent: '#25d366', link: true },
  { id: 'instagram', labelKey: 'pub.instagram', live: true, accent: '#e1306c', link: true, copy: true },
  { id: 'facebook', labelKey: 'pub.facebook', live: true, accent: '#1877f2', link: true, copy: true },
  { id: 'linkedin', labelKey: 'pub.linkedin', live: false, accent: '#0a66c2' },
];

/** Where a link destination opens, with the post exactly as it reads on screen. */
function shareUrl(id, text) {
  const enc = encodeURIComponent;
  if (id === 'twitter') return `https://twitter.com/intent/tweet?text=${enc(text)}`;
  if (id === 'whatsapp') return `https://wa.me/?text=${enc(text)}`;
  if (id === 'facebook') return 'https://www.facebook.com/';
  if (id === 'instagram') return 'https://www.instagram.com/';
  return '';
}

/** The first sentence of the post, when there is no headline to fall back on. */
function firstSentence(text = '') {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  const cut = trimmed.search(/[।.!?]/);
  const candidate = cut > 20 ? trimmed.slice(0, cut) : trimmed;
  return candidate.slice(0, TITLE_MAX);
}

/**
 * Where a finished post goes.
 *
 * The post lands on our subreddit under the user's own Reddit account, never a
 * shared one: a subreddit where every author is the same bot reads as spam,
 * to Reddit and to anyone browsing it.
 */
export default function PublishSheet({ post, initialTarget, onClose, onPublished }) {
  const { t } = useI18n();
  // Opens on the platform the post was written for; Reddit otherwise.
  const [target, setTarget] = useState(
    DESTINATIONS.some((d) => d.id === initialTarget && d.live) ? initialTarget : 'reddit',
  );
  const [status, setStatus] = useState(null);      // reddit connection status
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);          // the publication, once live
  const closeRef = useRef(null);

  // Escape closes, and the close button takes focus, so the sheet can be
  // dismissed without a pointer.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' && !posting) onClose();
    }
    document.addEventListener('keydown', onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, posting]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [connection, article] = await Promise.all([
        getRedditStatus().catch(() => null),
        // The headline makes a far better Reddit title than the post's own
        // opening line, so it is worth one request. Its absence is not an
        // error — the fallback below covers it.
        post?.news_id ? getNewsById(post.news_id).catch(() => null) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setStatus(connection);
      setTitle((article?.headline || firstSentence(post?.content)).slice(0, TITLE_MAX));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [post?.news_id, post?.content]);

  async function connect() {
    setError('');
    try {
      // A full navigation, not a popup: Reddit's consent screen refuses to be
      // framed, and popups are blocked on phones more often than not.
      window.location.href = await getRedditAuthorizeUrl();
    } catch {
      setError(t('pub.connectFailed'));
    }
  }

  async function publish() {
    if (posting) return;
    setPosting(true);
    setError('');
    try {
      const publication = await publishPostToReddit(post.id, {
        title: title.trim(),
        body: post.content,
      });
      setDone(publication);
      onPublished?.(publication);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail?.error === 'not_connected') {
        setStatus((prev) => ({ ...(prev || {}), connected: false }));
        setError(t('pub.needsConnect'));
      } else {
        setError(detail?.message || t('pub.failed'));
      }
    } finally {
      setPosting(false);
    }
  }

  // X, WhatsApp, Facebook. The tab is opened before the publish call, while
  // the click still counts as one, or the browser blocks it as a popup; it is
  // pointed at the platform only once the post is marked published, and
  // closed if that is refused (the daily limit).
  async function share(dest) {
    if (posting) return;
    setPosting(true);
    setError('');
    const text = post.content || '';
    const url = shareUrl(dest.id, text);
    if (dest.copy) navigator.clipboard?.writeText(text).catch(() => {});
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      await updatePost(post.id, { status: 'published' });
      if (tab) tab.location.href = url;
      setDone({ link: true, url, label: t(dest.labelKey), copied: Boolean(dest.copy), opened: Boolean(tab) });
      // A blocked tab keeps the sheet open on its "Open" link; the caller
      // hears of the publish when the sheet is closed.
      if (tab) onPublished?.({ platform: dest.id, url });
    } catch (err) {
      tab?.close();
      const detail = err?.response?.data?.detail;
      setError((typeof detail === 'object' ? detail?.message : detail) || t('pub.failed'));
    } finally {
      setPosting(false);
    }
  }

  const dest = DESTINATIONS.find((d) => d.id === target) || DESTINATIONS[0];
  const close = () => {
    if (posting) return;
    if (done?.link && !done.opened) onPublished?.({ platform: target, url: done.url });
    else onClose();
  };
  const connected = Boolean(status?.connected);
  const configured = status?.configured !== false;
  // The server's answer, never a guess. A hardcoded fallback here named a
  // community the post was not going to whenever the status call had not
  // answered yet - harmless while the two matched, wrong the moment the
  // deployment pointed somewhere else, and wrong in the worst way: it would
  // have told someone their post went to r/ambedkargpt while it went elsewhere.
  const subreddit = status?.subreddit || '';
  const overLimit = title.trim().length > TITLE_MAX;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <div
        className="dash-backdrop absolute inset-0 bg-[#03060f]/78 backdrop-blur-[3px]"
        onClick={close}
      />

      <div className="sheet-up relative w-full max-w-[520px] overflow-y-auto rounded-t-2xl border border-[#1e3260]/70 bg-[#07101f] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:max-h-[86vh] sm:rounded-2xl sm:pb-6"
        style={{ maxHeight: '88vh' }}
      >
        <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-[#2a3a66] sm:hidden" aria-hidden="true" />

        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[17px] font-semibold text-white">{t('pub.title')}</h2>
            <p className="mt-0.5 text-[12.5px] text-[#7d89ad]">{t('pub.sub')}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label={t('common.close')}
            className="dash-icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#8b94b8]"
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        {/* ── Done ── */}
        {done?.link ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0e2a1d] text-[#5bdb90]">
              <Check size={22} strokeWidth={2.5} />
            </span>
            <p className="font-display text-[16px] font-semibold text-white">{t('pub.shared', { platform: done.label })}</p>
            {done.copied && <p className="max-w-[40ch] text-[12.5px] leading-relaxed text-[#8b94b8]">{t('pub.pasteNote')}</p>}
            {/* If the browser blocked the new tab, this is the way there. */}
            <a
              href={done.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#2a4375]/80 bg-[#0d1531]/80 px-5 text-[13px] font-semibold text-white transition hover:border-[#4d8bff]/70"
            >
              {t('pub.open', { platform: done.label })}
              <ExternalLink size={14} strokeWidth={2} />
            </a>
          </div>
        ) : done ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0e2a1d] text-[#5bdb90]">
              <Check size={22} strokeWidth={2.5} />
            </span>
            <p className="font-display text-[16px] font-semibold text-white">
              {t('pub.posted', { sub: subreddit })}
            </p>
            {/* New accounts often land in the moderation queue, so the post may
                not be visible the moment this link is opened. Said plainly
                rather than leaving the user to wonder where it went. */}
            <p className="max-w-[40ch] text-[12.5px] leading-relaxed text-[#8b94b8]">
              {t('pub.postedNote')}
            </p>
            {done.url && (
              <a
                href={done.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#2a4375]/80 bg-[#0d1531]/80 px-5 text-[13px] font-semibold text-white transition hover:border-[#4d8bff]/70"
              >
                {t('pub.viewOnReddit')}
                <ExternalLink size={14} strokeWidth={2} />
              </a>
            )}
          </div>
        ) : (
          <>
            {/* ── Where ── */}
            <div className="grid gap-2">
              {DESTINATIONS.map((d) => {
                const on = d.id === target;
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={!d.live}
                    onClick={() => d.live && setTarget(d.id)}
                    aria-pressed={on}
                    className={[
                      'flex min-h-12 items-center gap-3 rounded-xl border px-4 text-left transition',
                      d.live
                        ? 'border-[#1e3260]/70 bg-[#0a1130]/60 hover:border-[#3a6bc4]/60'
                        : 'cursor-not-allowed border-[#1e3260]/40 bg-[#0a1130]/30 opacity-60',
                    ].join(' ')}
                    style={on ? { borderColor: `${d.accent}99`, backgroundColor: `${d.accent}14` } : undefined}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: d.live ? d.accent : '#3a4668' }}
                    />
                    <span className="min-w-0 flex-1 text-[14px] font-medium text-white">
                      {t(d.labelKey)}
                      {d.id === 'reddit' && subreddit && (
                        <span className="ml-2 font-count text-[12px] text-[#7d89ad]">r/{subreddit}</span>
                      )}
                    </span>
                    {!d.live && (
                      <span className="shrink-0 rounded-full bg-[#141d3a] px-2 py-0.5 font-count text-[10.5px] uppercase tracking-wider text-[#5a6e9a]">
                        {t('nav.soonBadge')}
                      </span>
                    )}
                    {on && d.live && <Check size={16} strokeWidth={2.5} style={{ color: d.accent }} />}
                  </button>
                );
              })}
            </div>

            {dest.link ? (
              <div className="mt-5 rounded-xl border border-[#1e3260]/60 bg-[#0a1130]/50 p-4">
                <p className="text-[13.5px] font-semibold text-white">
                  {dest.copy ? t('pub.copyTitle', { platform: t(dest.labelKey) }) : t('pub.linkTitle', { platform: t(dest.labelKey) })}
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#8b94b8]">
                  {dest.copy ? t('pub.copyBody', { platform: t(dest.labelKey) }) : t('pub.linkBody')}
                </p>
                <button
                  type="button"
                  onClick={() => share(dest)}
                  disabled={posting}
                  className="mt-3.5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: dest.accent }}
                >
                  {posting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      {t('pub.posting')}
                    </>
                  ) : (
                    <>
                      {dest.copy ? t('pub.copyOpen', { platform: t(dest.labelKey) }) : t('pub.open', { platform: t(dest.labelKey) })}
                      <ArrowUpRight size={16} strokeWidth={2.2} />
                    </>
                  )}
                </button>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-[#7d89ad]">
                <Loader2 size={15} className="animate-spin" />
                {t('common.loading')}
              </div>
            ) : !configured ? (
              <p className="mt-5 rounded-xl border border-[#3a2a1a]/70 bg-[#261a0e]/60 px-4 py-3 text-[12.5px] leading-relaxed text-[#c5935b]">
                {t('pub.notConfigured')}
              </p>
            ) : !connected ? (
              /* ── Connect, asked for at the moment it is needed rather than
                    at signup, where most people have no Reddit account yet. ── */
              <div className="mt-5 rounded-xl border border-[#1e3260]/60 bg-[#0a1130]/50 p-4">
                <p className="text-[13.5px] font-semibold text-white">{t('pub.connectTitle')}</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#8b94b8]">
                  {t('pub.connectBody', { sub: subreddit })}
                </p>
                <button
                  type="button"
                  onClick={connect}
                  className="mt-3.5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white transition hover:brightness-110"
                  style={{ background: 'linear-gradient(90deg,#ff4500,#ff6a33)' }}
                >
                  {t('pub.connectCta')}
                  <ArrowUpRight size={16} strokeWidth={2.2} />
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5">
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <label htmlFor="reddit-title" className="dash-eyebrow">{t('pub.titleLabel')}</label>
                    <span className={`font-count text-[11.5px] tabular-nums ${overLimit ? 'text-red-400' : 'text-[#5a6e9a]'}`}>
                      {title.trim().length}/{TITLE_MAX}
                    </span>
                  </div>
                  {/* Editable, because on Reddit the title is the post. The
                      headline is only a starting point. */}
                  <textarea
                    id="reddit-title"
                    rows={2}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full resize-none rounded-xl border border-[#1e3260]/80 bg-[#0b1226]/80 px-3.5 py-2.5 font-hindi text-[14px] leading-relaxed text-white outline-none transition focus:border-[#3f9fff]/60"
                  />
                  <p className="mt-2 text-[11.5px] text-[#5a6e9a]">
                    {t('pub.postingAs', { user: status?.account?.account_handle || '' })}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={publish}
                  disabled={posting || !title.trim() || overLimit}
                  className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl btn-gradient text-[14px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {posting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      {t('pub.posting')}
                    </>
                  ) : (
                    t('pub.postTo', { sub: subreddit })
                  )}
                </button>
              </>
            )}

            {error && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-red-300">
                <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0" />
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
