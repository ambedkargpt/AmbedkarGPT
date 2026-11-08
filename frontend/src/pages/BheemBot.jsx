import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Scale, BookOpen, Heart, HelpCircle,
  Send, Plus, Copy, Check,
  ExternalLink, X, ArrowLeft, Menu, History, Trash2, PlayCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sendChatMessage } from '../api/chat';
import { useI18n } from '../i18n/index.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher';
import FormattedReply, { parseReply, visibleBlockCount } from '../components/FormattedReply';
import DashboardShell from '../layouts/DashboardShell';
import { useShell } from '../layouts/dashboardShellContext';

/**
 * BhimBot, laid out the way the coming redesign has it, in today's theme:
 *
 *   app rail | the conversation, with the composer under it | categories
 *
 * Signed in, the page sits in the same frame as every other app screen, so
 * the rail on the left is the app's own. A guest (the bot is public) gets the
 * page on its own ground with a way back home instead.
 */

const CATEGORIES = [
  { id: 'constitution', icon: Scale },
  { id: 'writings',     icon: BookOpen },
  { id: 'justice',      icon: Heart },
  { id: 'faqs',         icon: HelpCircle },
];

// A factory, not a constant: the greeting has to be built in the language in
// force when the chat opens, and a module-level object is frozen in whatever
// language happened to be loaded first.
const welcomeMessage = (t) => ({
  id: 'welcome',
  role: 'assistant',
  content: t('bot.welcome'),
  sources: [],
  timestamp: Date.now(),
});

const sessionKey = (userId) => `bheembot_history_${userId || 'anon'}`;
const chatsKey = (userId) => `bheembot_chats_${userId || 'anon'}`;
const CHAT_TIMEOUT_MS = 45_000;
const MAX_CHATS = 30;

const newChatId = () => `c${Date.now().toString(36)}`;

/**
 * Past conversations, kept in this browser. "New chat" used to replace the
 * one conversation there was, so whatever had been asked was gone. Each chat
 * is now its own entry, newest first, and the last one is reopened on return.
 * The old single-chat session copy is brought in once so nothing is lost.
 */
function loadChats(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(chatsKey(userId)) || 'null');
    if (Array.isArray(saved)) return saved;
  } catch { /* unreadable: start fresh */ }
  try {
    const legacy = JSON.parse(sessionStorage.getItem(sessionKey(userId)) || 'null');
    if (Array.isArray(legacy) && legacy.some((m) => m.role === 'user')) {
      return [{ id: newChatId(), updatedAt: Date.now(), messages: legacy }];
    }
  } catch { /* ignore */ }
  return [];
}

function saveChats(userId, chats) {
  try { localStorage.setItem(chatsKey(userId), JSON.stringify(chats.slice(0, MAX_CHATS))); } catch { /* storage full */ }
}

function chatTitle(chat) {
  const first = chat.messages?.find((m) => m.role === 'user')?.content || '';
  return first.length > 60 ? `${first.slice(0, 60)}…` : first;
}

function clock(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** The reply as plain text, for the clipboard and for reading aloud. */
function plainText(markup) {
  return (markup || '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/[*_`#]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Typing dots ────────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-[5px] py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full bg-[#4d94ff]"
          style={{ animation: `bheembot-dot 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </span>
  );
}

// ── Answer actions ─────────────────────────────────────────────────────────────

const actionBtn =
  'inline-flex items-center gap-1.5 rounded-xl border border-[#1e3260]/70 bg-[#0a1428]/80 px-3.5 py-2 text-[12.5px] font-medium text-[#c7d6ee] transition hover:border-[#3a6bc4]/70 hover:text-white';

function CopyButton({ text }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked: nothing to do */ }
  }
  return (
    <button type="button" onClick={copy} className={actionBtn}>
      {copied ? <Check size={14} strokeWidth={2.2} className="text-[#22c55e]" /> : <Copy size={14} strokeWidth={2} />}
      {copied ? t('bot.copied') : t('bot.copy')}
    </button>
  );
}

// ── Messages ───────────────────────────────────────────────────────────────────

function UserMessage({ msg }) {
  const { t } = useI18n();
  return (
    <div className="mb-5 flex justify-end">
      <div className="max-w-[78%] rounded-2xl rounded-tr-sm border border-[#1e3260]/70 bg-[#0d1838] px-4 py-3">
        <p className="mb-1 text-[11px] text-[#6f86ad]">
          {t('bot.you')}{msg.timestamp ? ` · ${clock(msg.timestamp)}` : ''}
        </p>
        <p className="whitespace-pre-wrap text-[14px] font-medium leading-relaxed text-white">{msg.content}</p>
      </div>
    </div>
  );
}

function SourcePill({ s }) {
  const { t } = useI18n();
  // Two kinds: a page of Babasaheb's books (opens the page viewer) and a video
  // from the channels' archive (opens it on YouTube).
  const isBook = !s.url || s.url.startsWith('/book/');
  const Icon = isBook ? BookOpen : PlayCircle;
  const label = s.video_title.length > 48 ? `${s.video_title.slice(0, 48)}…` : s.video_title;
  const pill =
    'inline-flex items-center gap-1.5 rounded-lg border border-[#1e3260]/80 bg-[#0a1428] px-2.5 py-1 text-[11.5px] text-[#9db6dc]';
  return s.url ? (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${s.snippet}\n\n${isBook ? t('bot.openBook') : t('bot.openVideo')}`}
      className={`${pill} transition-colors hover:border-[#4d94ff] hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#4d94ff]`}
    >
      <Icon size={12} strokeWidth={1.8} />
      {label}
      <ExternalLink size={10} strokeWidth={2} className="opacity-70" aria-hidden="true" />
    </a>
  ) : (
    <span title={s.snippet} className={pill}>
      <Icon size={12} strokeWidth={1.8} />
      {label}
    </span>
  );
}

function BotMessage({ msg, showActions }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const blocks = msg.typing ? [] : parseReply(msg.content);
  const collapsedCount = blocks.length ? visibleBlockCount(blocks) : 0;
  const isLong = blocks.length > collapsedCount;
  const text = plainText(msg.content);

  return (
    <div className="mb-5">
      <article className="max-w-[860px] rounded-2xl border border-[#1e3260]/70 bg-[#081127]/95 px-5 py-4 shadow-[0_12px_32px_rgba(0,0,0,0.35)]">
        <header className="mb-2.5 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-[#2d6fff] to-[#7b5cff]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18" />
            </svg>
          </span>
          <span className="text-[12.5px] font-semibold text-white">{t('bot.name')}</span>
          {msg.timestamp && !msg.typing && (
            <span className="font-mono text-[11px] text-[#6f86ad]">{clock(msg.timestamp)}</span>
          )}
        </header>

        <div className="text-[14.5px] leading-[1.75] text-[#d6e2f5]">
          {msg.typing ? (
            <TypingDots />
          ) : (
            <>
              <FormattedReply blocks={blocks} maxBlocks={isLong && !expanded ? collapsedCount : undefined} />
              {isLong && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-2 block text-[12.5px] text-[#4d94ff] underline underline-offset-2 hover:text-[#7ab4ff]"
                >
                  {expanded ? t('bot.showLess') : t('bot.showMore')}
                </button>
              )}
            </>
          )}
        </div>

        {!msg.typing && msg.sources?.length > 0 && (
          <div className="mt-4 border-t border-[#1e3260]/60 pt-3">
            <p className="mb-2 text-[11px] font-medium text-[#6f86ad]">{t('bot.sources')}</p>
            <div className="flex flex-wrap gap-2">
              {msg.sources.map((s, i) => <SourcePill key={i} s={s} />)}
            </div>
          </div>
        )}
      </article>

      {showActions && !msg.typing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CopyButton text={text} />
        </div>
      )}
    </div>
  );
}

/** The app drawer's opener on a phone. A component of its own so the hook
 *  runs inside the shell that provides it. */
function AppMenuButton() {
  const { t } = useI18n();
  const { openMenu } = useShell();
  return (
    <button
      type="button"
      onClick={openMenu}
      aria-label={t('common.openMenu')}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#1e3260]/70 text-[#8ea3c7] transition hover:text-white md:hidden"
    >
      <Menu size={17} strokeWidth={1.9} />
    </button>
  );
}

// ── Past chats ─────────────────────────────────────────────────────────────────

function RecentChats({ chats, currentId, onOpen, onDelete }) {
  const { t, lang } = useI18n();
  if (!chats.length) return null;
  const when = (ts) => new Date(ts).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short' });
  return (
    <div className="mb-6">
      <h2 className="mb-2 flex items-center gap-2 font-display text-[15px] font-semibold text-white">
        <History size={15} strokeWidth={2} className="text-[#7fb5ff]" /> {t('bot.recent')}
      </h2>
      <ul className="space-y-1">
        {chats.map((c) => (
          <li key={c.id} className="group relative">
            <button
              type="button"
              onClick={() => onOpen(c.id)}
              className={[
                'w-full rounded-xl border px-3 py-2 pr-8 text-left transition',
                c.id === currentId
                  ? 'border-[#3f6bd4]/70 bg-[#0d1838]'
                  : 'border-transparent hover:border-[#1e3260]/70 hover:bg-[#0d1531]/60',
              ].join(' ')}
            >
              <span className="line-clamp-2 block text-[12.5px] leading-snug text-[#d6e2f5]">{chatTitle(c)}</span>
              <span className="mt-0.5 block text-[10.5px] text-[#6f86ad]">{when(c.updatedAt)}</span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(c.id)}
              aria-label={t('bot.deleteChat')}
              title={t('bot.deleteChat')}
              className="absolute right-2 top-2 rounded-md p-1 text-[#6f86ad] opacity-0 transition hover:text-[#ff8a8a] focus:opacity-100 group-hover:opacity-100"
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Categories ─────────────────────────────────────────────────────────────────

function CategoryList({ onPick }) {
  const { t } = useI18n();
  return (
    <>
      <ul className="divide-y divide-[#1e3260]/60 border-y border-[#1e3260]/60">
        {/* eslint-disable-next-line no-unused-vars -- used as a JSX tag */}
        {CATEGORIES.map(({ id, icon: CatIcon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => onPick(t(`bot.cat.${id}.prompt`))}
              className="group flex w-full items-start gap-2.5 px-1 py-3 text-left transition hover:bg-[#0d1531]/60"
            >
              <CatIcon size={14} strokeWidth={1.9} className="mt-0.5 shrink-0 text-[#7fb5ff]" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-white group-hover:text-[#9cc3ff]">
                  {t(`bot.cat.${id}.title`)}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-[#6f86ad]">{t(`bot.cat.${id}.desc`)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11.5px] leading-relaxed text-[#6f86ad]">{t('bot.pickHint')}</p>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BheemBot() {
  const { t, lang } = useI18n();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  // ── Chat state ──
  const [chats, setChats] = useState(() => loadChats(currentUser?.id));
  const [chatId, setChatId] = useState(() => chats[0]?.id ?? newChatId());
  const [messages, setMessages] = useState(() => chats[0]?.messages ?? [welcomeMessage(t)]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  // ── Remove legacy shared key on first mount ──
  useEffect(() => {
    sessionStorage.removeItem('bheembot_history');
  }, []);

  // ── Keep this conversation in the list of chats ──
  // Only once something has been asked: an empty "new chat" is not worth a row.
  const [lastSaved, setLastSaved] = useState(messages);
  if (lastSaved !== messages) {
    setLastSaved(messages);
    const settled = messages.filter((m) => !m.typing);
    if (settled.some((m) => m.role === 'user')) {
      setChats([
        { id: chatId, updatedAt: settled[settled.length - 1]?.timestamp ?? 0, messages: settled },
        ...chats.filter((c) => c.id !== chatId),
      ].slice(0, MAX_CHATS));
    }
  }
  useEffect(() => { saveChats(currentUser?.id, chats); }, [chats, currentUser?.id]);

  // ── Another account: its own chats ──
  const [chatUser, setChatUser] = useState(currentUser?.id);
  if (chatUser !== currentUser?.id) {
    setChatUser(currentUser?.id);
    const theirs = loadChats(currentUser?.id);
    setChats(theirs);
    setChatId(theirs[0]?.id ?? newChatId());
    setMessages(theirs[0]?.messages ?? [welcomeMessage(t)]);
  }

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);


  // ── Build history for API ──
  function buildHistory(msgs) {
    return msgs
      .filter((m) => m.id !== 'welcome' && !m.typing && (m.role === 'user' || m.role === 'assistant'))
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  // ── Send message ──────────────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || sending) return;

    setInput('');
    const userMsg = { id: Date.now(), role: 'user', content: trimmed, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    const typingId = Date.now() + 1;
    setMessages((prev) => [...prev, { id: typingId, role: 'assistant', typing: true, content: '', sources: [] }]);
    setSending(true);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== typingId),
        { id: Date.now(), role: 'assistant', content: t('bot.slowReply'), sources: [], timestamp: Date.now(), failed: true },
      ]);
      setSending(false);
    }, CHAT_TIMEOUT_MS);

    try {
      const history = buildHistory(messages.concat(userMsg));
      // The first question after a quiet spell lands on a cold server and can
      // run past the gateway's limit (a 502/503/504, or no response at all).
      // The second attempt finds it warm, so one silent retry is made before
      // anything is shown as an error.
      const ask = () => sendChatMessage({ message: trimmed, history, language: lang });
      let res;
      try {
        res = await ask();
      } catch (first) {
        const code = first?.response?.status;
        if (timedOut || (code && code < 500)) throw first;
        res = await ask();
      }
      const { reply, sources } = res;
      if (timedOut) return;
      clearTimeout(timer);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== typingId),
        { id: Date.now(), role: 'assistant', content: reply, sources: sources || [], timestamp: Date.now() },
      ]);
    } catch (err) {
      if (timedOut) return;
      clearTimeout(timer);
      const httpStatus = err?.response?.status;
      if (httpStatus === 401) {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== typingId),
          { id: Date.now(), role: 'assistant', content: t('bot.sessionExpired'), sources: [], timestamp: Date.now(), failed: true },
        ]);
        setTimeout(() => {
          sessionStorage.setItem('auth_redirect', '/bhimbot');
          logout().catch(() => {});
          navigate('/login', { replace: true });
        }, 2000);
      } else {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== typingId),
          { id: Date.now(), role: 'assistant', content: t('bot.error'), sources: [], timestamp: Date.now(), failed: true },
        ]);
      }
    } finally {
      if (!timedOut) setSending(false);
    }
  }, [input, sending, messages, navigate, logout, lang, t]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // A category is a ready question: it is asked straight away.
  function pickCategory(prompt) {
    setCatsOpen(false);
    send(prompt);
  }

  function newChat() {
    if (sending) return;
    setChatId(newChatId());
    setMessages([welcomeMessage(t)]);
    setInput('');
    setCatsOpen(false);
    inputRef.current?.focus();
  }

  function openChat(id) {
    if (sending) return;
    const chat = chats.find((c) => c.id === id);
    if (!chat) return;
    setChatId(id);
    // Opening a chat is not a new turn in it, so it keeps its place in the list.
    setLastSaved(chat.messages);
    setMessages(chat.messages);
    setCatsOpen(false);
  }

  function deleteChat(id) {
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (id === chatId) {
      setChatId(newChatId());
      setMessages([welcomeMessage(t)]);
    }
  }

  const lastBot = [...messages].reverse().find((m) => m.role === 'assistant' && !m.typing);
  const showTopics = !sending;

  const page = (
    <div className="relative flex h-full min-h-0 text-[#e5e7eb]">
      <style>{`
        @keyframes bheembot-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: .5; }
          30%            { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>

      {/* ── Conversation column ── */}
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 shrink-0 px-4 pt-4 md:px-8 md:pt-6">
          <div className="flex items-start justify-between gap-3 border-b border-[#1e3260]/60 pb-3 md:pb-4">
            <div className="flex min-w-0 items-start gap-2.5">
            {currentUser && <AppMenuButton />}
            <div className="min-w-0">
              {!currentUser && (
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-[#6f86ad] transition hover:text-white"
                >
                  <ArrowLeft size={13} strokeWidth={2} /> {t('bot.home')}
                </button>
              )}
              <h1 className="font-display text-[24px] font-bold leading-tight text-white md:text-[34px]">{t('bot.name')}</h1>
              <p className="mt-1 hidden text-[13px] text-[#8ea3c7] sm:block">{t('bot.subtitle')}</p>
            </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Signed in, the language is in the rail. */}
              {!currentUser && <LanguageSwitcher />}
              <button
                type="button"
                onClick={() => setCatsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#1e3260]/70 bg-[#0a1428]/80 px-3 py-2 text-[12.5px] font-medium text-[#c7d6ee] transition hover:text-white xl:hidden"
              >
                <History size={14} strokeWidth={2} /> <span className="hidden sm:inline">{t('bot.chatsAndTopics')}</span>
              </button>
              <button
                type="button"
                onClick={newChat}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#1e3260]/70 bg-[#0a1428]/80 px-3 py-2 text-[12.5px] font-medium text-[#c7d6ee] transition hover:border-[#3a6bc4]/70 hover:text-white"
              >
                <Plus size={14} strokeWidth={2.2} /> <span className="hidden sm:inline">{t('bot.newChat')}</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── Messages ── */}
        <div className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6">
          {messages.map((m) => {
            if (m.role === 'user') return <UserMessage key={m.id} msg={m} />;
            const shown = m.id === 'welcome' ? { ...m, content: t('bot.welcome') } : m;
            const actionable = m === lastBot && m.id !== 'welcome' && !m.failed;
            return <BotMessage key={m.id} msg={shown} showActions={actionable} />;
          })}

          {showTopics && (
            <div className="mt-2">
              <p className="mb-2 text-[12px] text-[#6f86ad]">{t('bot.startTopic')}</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(({ id }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => pickCategory(t(`bot.cat.${id}.prompt`))}
                    className="rounded-full border border-[#1e3260]/80 bg-[#0a1428]/80 px-3.5 py-1.5 text-[12.5px] text-[#c7d6ee] transition hover:border-[#4d94ff] hover:text-white"
                  >
                    {t(`bot.cat.${id}.title`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Composer ── */}
        <div className="relative z-10 shrink-0 border-t border-[#1e3260]/60 bg-[#070b1c]/85 px-4 pb-3 pt-3 backdrop-blur-sm md:px-8 md:pb-4">
          <label htmlFor="bhimbot-input" className="mb-2 hidden text-[12px] font-medium text-[#8ea3c7] sm:block">
            {t('bot.askLabel')}
          </label>
          <div className="flex items-stretch gap-2.5">
            <div className="flex min-w-0 flex-1 items-center rounded-2xl border border-[#1e3260]/80 bg-[#0a1428] px-4 py-3 transition focus-within:border-[#3f6bd4] focus-within:shadow-[0_0_0_3px_rgba(63,107,212,0.15)]">
              <textarea
                id="bhimbot-input"
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('bot.askAnything')}
                className="w-full resize-none bg-transparent text-[14px] leading-[1.5] text-white outline-none placeholder:text-[#4a5f84]"
                style={{ maxHeight: '120px', overflowY: 'auto' }}
                onInput={(e) => {
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => send()}
              disabled={!input.trim() || sending}
              aria-label={t('bot.send')}
              className={[
                'flex w-14 shrink-0 items-center justify-center rounded-2xl transition',
                input.trim() && !sending
                  ? 'bg-[#2d6fff] text-white shadow-[0_0_16px_rgba(45,111,255,0.4)] hover:bg-[#3d7fff]'
                  : 'bg-[#1a2c5c] text-[#6f86ad]',
              ].join(' ')}
            >
              <Send size={17} strokeWidth={2.2} />
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[#4a5f84]">{t('bot.disclaimer')}</p>
        </div>
      </section>

      {/* ── Categories panel (wide screens) ── */}
      <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-l border-[#1e3260]/60 px-5 py-6 xl:block">
        <RecentChats chats={chats} currentId={chatId} onOpen={openChat} onDelete={deleteChat} />
        <h2 className="mb-3 font-display text-[17px] font-semibold text-white">{t('bot.categories')}</h2>
        <CategoryList onPick={pickCategory} />
      </aside>

      {/* ── Categories sheet (narrower screens) ── */}
      {catsOpen && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCatsOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-[300px] max-w-[85vw] overflow-y-auto border-l border-[#1e3260]/70 bg-[#070c1e] px-5 py-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-[17px] font-semibold text-white">{t('bot.categories')}</h2>
              <button type="button" onClick={() => setCatsOpen(false)} className="text-[#6f86ad] hover:text-white" aria-label={t('bot.close')}>
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>
            <RecentChats chats={chats} currentId={chatId} onOpen={openChat} onDelete={deleteChat} />
            <CategoryList onPick={pickCategory} />
          </div>
        </div>
      )}
    </div>
  );

  // Signed in, the page lives in the app frame with its rail; a guest gets it
  // on its own ground.
  if (currentUser) return <DashboardShell active="bheembot">{page}</DashboardShell>;
  return (
    <div
      className="h-screen overflow-hidden"
      style={{ background: 'radial-gradient(1200px 700px at 20% 0%, #0d1636 0%, #070b1c 55%, #05081a 100%)' }}
    >
      {page}
    </div>
  );
}

