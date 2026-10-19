import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Scale, BookOpen, Heart, HelpCircle,
  Search, Send, Mic, Paperclip,
  Sparkles, LayoutDashboard, Menu, X,
  ChevronRight, Bot, ExternalLink,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sendChatMessage } from '../api/chat';
import logoSrc from '../assets/images/logo-animation.webp';
import { useI18n } from '../i18n/index.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher';
import FormattedReply, { parseReply, visibleBlockCount } from '../components/FormattedReply';

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: 'constitution',
    icon: Scale,
  },
  {
    id: 'writings',
    icon: BookOpen,
  },
  {
    id: 'justice',
    icon: Heart,
  },
  {
    id: 'faqs',
    icon: HelpCircle,
  },
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

const SIDEBAR_WIDTH_KEY  = 'bheembot_sidebar_width';
const sessionKey = (userId) => `bheembot_history_${userId || 'anon'}`;
const CHAT_TIMEOUT_MS    = 45_000;
const SIDEBAR_MIN        = 160;
const SIDEBAR_MAX        = 420;
const SIDEBAR_DEFAULT    = 220;

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

// ── Message bubble ─────────────────────────────────────────────────────────────

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  const [expanded, setExpanded] = useState(false);

  // Replies are rendered from their markup; a long one collapses at a block boundary,
  // never mid-sentence.
  const blocks = isUser ? null : parseReply(msg.content);
  const collapsedCount = blocks ? visibleBlockCount(blocks) : 0;
  const isLong = !isUser && blocks.length > collapsedCount;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="mr-2.5 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2d6fff] to-[#7b5cff] shadow-[0_0_14px_rgba(79,107,255,0.4)]">
          <Bot size={14} strokeWidth={2} className="text-white" />
        </div>
      )}

      <div className={`max-w-[75%] ${isUser ? 'max-w-[65%]' : ''}`}>
        <div
          className={[
            'rounded-2xl px-4 py-3 text-[13.5px] leading-[1.7]',
            isUser
              ? 'rounded-tr-sm bg-[#2d6fff] text-white'
              : 'rounded-tl-sm border border-[#1e3260]/60 bg-[#070f24] text-[#d0dff2]',
          ].join(' ')}
        >
          {msg.typing ? (
            <TypingDots />
          ) : (
            <>
              {isUser ? (
                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
              ) : (
                <FormattedReply blocks={blocks} maxBlocks={isLong && !expanded ? collapsedCount : undefined} />
              )}
              {isLong && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-2 block text-[12.5px] text-[#4d94ff] underline underline-offset-2 hover:text-[#7ab4ff]"
                >
                  {expanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </>
          )}
        </div>

        {!isUser && !msg.typing && msg.sources?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {msg.sources.map((s, i) => {
              const label = s.video_title.length > 40 ? s.video_title.slice(0, 40) + '…' : s.video_title;
              const pill = 'inline-flex items-center gap-1 rounded-full border border-[#1a3060]/60 bg-[#0a1428] px-2.5 py-0.5 text-[10.5px] text-[#5a80b8]';
              // A book source opens its scanned page in a new tab; other sources stay plain labels.
              return s.url ? (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${s.snippet}\n\nOpen this page of the book in a new tab`}
                  className={`${pill} transition-colors hover:border-[#4d94ff] hover:text-[#9cc3ff] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#4d94ff]`}
                >
                  <BookOpen size={9} strokeWidth={1.8} />
                  {label}
                  <ExternalLink size={8} strokeWidth={2} className="opacity-70" aria-hidden="true" />
                </a>
              ) : (
                <span key={i} title={s.snippet} className={pill}>
                  <BookOpen size={9} strokeWidth={1.8} />
                  {label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

function ChatSidebar({ onCategoryClick, searchQuery, setSearchQuery, onClose, mobile }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const filtered = searchQuery
    ? CATEGORIES.filter(
        (c) =>
          t(`bot.cat.${c.id}.title`).toLowerCase().includes(searchQuery.toLowerCase()) ||
          t(`bot.cat.${c.id}.desc`).toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : CATEGORIES;

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden bg-[#070c1e]">
      {/* Header — logo + name */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80"
        >
          <img
            src={logoSrc}
            alt="AmbedkarGPT"
            className="h-7 w-7 shrink-0 rounded-lg object-contain"
            style={{ background: 'transparent' }}
          />
          <span className="truncate font-display text-[14px] font-semibold gradient-text-blue">
            {t('brand.ambedkar')}GPT
          </span>
        </button>
        {mobile && (
          <button type="button" onClick={onClose} className="ml-2 shrink-0 text-[#5a7a9e] hover:text-white">
            <X size={18} strokeWidth={1.8} />
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-xl border border-[#1e3260]/60 bg-[#0a1428] px-3 py-2.5">
          <Search size={12} strokeWidth={2} className="shrink-0 text-[#4a6080]" />
          <input
            type="text"
            placeholder={t('bot.searchCategories')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-[12px] text-white placeholder:text-[#4a6080] outline-none"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        <p className="mb-2 px-1 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[#4a6080]">
          {t('bot.knowledgeCategories')}
        </p>
        <div className="space-y-1">
          {/* eslint-disable-next-line no-unused-vars */}
          {filtered.map(({ id, icon: CatIcon }) => (
            <button
              key={id}
              type="button"
              onClick={() => { onCategoryClick(t(`bot.cat.${id}.prompt`)); if (mobile) onClose?.(); }}
              className="group w-full rounded-xl border border-transparent px-3 py-2.5 text-left transition-all hover:border-[#1e3260]/70 hover:bg-[#0d1531]/70"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-[#1e3260]/60 bg-[#0a1428] text-[#4d94ff]">
                  <CatIcon size={12} strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold text-white">{t(`bot.cat.${id}.title`)}</p>
                  <p className="mt-0.5 text-[10.5px] leading-snug text-[#5a7a9e]">{t(`bot.cat.${id}.desc`)}</p>
                </div>
                <ChevronRight size={12} strokeWidth={1.8} className="mt-1 shrink-0 text-[#1e3260] transition group-hover:text-[#4d94ff]" />
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-3 text-[11.5px] text-[#4a6080]">{t('bot.noCategories')}</p>
          )}
        </div>
      </div>

      {/* Back to dashboard */}
      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="flex w-full items-center gap-2 rounded-xl border border-[#1e3260]/40 bg-[#0a1428]/60 px-3 py-2 text-[11.5px] text-[#5a7a9e] transition hover:border-[#3a6bc4]/60 hover:text-white"
        >
          <LayoutDashboard size={13} strokeWidth={1.8} />
          {t('bot.backToDashboard')}
        </button>
      </div>

      {/* Footer */}
      <p className="px-4 pb-4 text-[10px] text-[#2a3a5e]">
        {t('bot.poweredBy')}
      </p>
    </aside>
  );
}

// ── Resize handle ──────────────────────────────────────────────────────────────

function ResizeHandle({ onMouseDown, isDragging }) {
  const { t } = useI18n();
  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative z-20 hidden w-[5px] shrink-0 cursor-col-resize select-none md:flex md:items-center md:justify-center"
      title={t('bot.dragResize')}
      style={{ background: 'transparent' }}
    >
      {/* Visible line */}
      <div
        className="h-full w-px transition-all duration-150"
        style={{
          background: isDragging
            ? 'linear-gradient(180deg, transparent 0%, rgba(63,159,255,0.7) 30%, rgba(63,159,255,0.7) 70%, transparent 100%)'
            : 'linear-gradient(180deg, transparent 0%, rgba(30,50,96,0.7) 30%, rgba(30,50,96,0.7) 70%, transparent 100%)',
        }}
      />
      {/* Hover/active highlight — wider invisible hit zone */}
      <div
        className="absolute inset-y-0 -left-1 -right-1 transition-opacity duration-150"
        style={{
          opacity: isDragging ? 1 : 0,
          background:
            'linear-gradient(180deg, transparent 0%, rgba(63,159,255,0.12) 30%, rgba(63,159,255,0.12) 70%, transparent 100%)',
        }}
      />
      {/* Grab dots indicator at center */}
      <div
        className="absolute top-1/2 -translate-y-1/2 flex flex-col gap-[3px] opacity-0 transition-opacity group-hover:opacity-100"
        style={{ opacity: isDragging ? 1 : undefined }}
      >
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[3px] w-[3px] rounded-full bg-[#3f9fff]/60" />
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function BheemBot() {
  const { t, lang } = useI18n();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  // ── Sidebar width (resizable) ──
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY), 10);
    return stored >= SIDEBAR_MIN && stored <= SIDEBAR_MAX ? stored : SIDEBAR_DEFAULT;
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX   = useRef(0);
  const dragStartW   = useRef(0);

  // ── Chat state ──
  const [messages,     setMessages]     = useState(() => {
    try {
      const stored = sessionStorage.getItem(sessionKey(currentUser?.id));
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return [welcomeMessage(t)];
  });
  const [input,        setInput]        = useState('');
  const [sending,      setSending]      = useState(false);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [sidebarOpen,  setSidebarOpen]  = useState(false);

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  // ── Remove legacy shared key on first mount ──
  useEffect(() => {
    sessionStorage.removeItem('bheembot_history');
  }, []);

  // ── Persist chat (per-user) ──
  useEffect(() => {
    try {
      const toStore = messages.filter((m) => !m.typing);
      sessionStorage.setItem(sessionKey(currentUser?.id), JSON.stringify(toStore));
    } catch { /* storage full */ }
  }, [messages, currentUser?.id]);

  // ── Persist sidebar width ──
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  // ── Reset chat when user changes (account switch) ──
  const prevUserIdRef = useRef(currentUser?.id);
  useEffect(() => {
    if (prevUserIdRef.current !== currentUser?.id) {
      prevUserIdRef.current = currentUser?.id;
      try {
        const stored = sessionStorage.getItem(sessionKey(currentUser?.id));
        setMessages(stored ? JSON.parse(stored) : [welcomeMessage(t)]);
      } catch {
        setMessages([welcomeMessage(t)]);
      }
    }
  }, [currentUser?.id]);

  // ── Auto-scroll ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Drag-resize logic ──────────────────────────────────────────────────────
  const handleResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartW.current = sidebarWidth;
    setIsDragging(true);
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e) => {
      const delta = e.clientX - dragStartX.current;
      const next  = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, dragStartW.current + delta));
      setSidebarWidth(next);
    };

    const onMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };
  }, [isDragging]);

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
        { id: Date.now(), role: 'assistant', content: t('bot.slowReply'), sources: [], timestamp: Date.now() },
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
          { id: Date.now(), role: 'assistant', content: t('bot.sessionExpired'), sources: [], timestamp: Date.now() },
        ]);
        setTimeout(() => {
          sessionStorage.setItem('auth_redirect', '/bhimbot');
          logout().catch(() => {});
          navigate('/login', { replace: true });
        }, 2000);
      } else {
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== typingId),
          { id: Date.now(), role: 'assistant', content: t('bot.error'), sources: [], timestamp: Date.now() },
        ]);
      }
    } finally {
      if (!timedOut) setSending(false);
    }
  }, [input, sending, messages, navigate, logout, lang, t]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function handleCategoryClick(prompt) {
    setInput(prompt);
    inputRef.current?.focus();
  }

  return (
    <div
      className="flex h-screen overflow-hidden text-[#e5e7eb]"
      style={{
        background: 'radial-gradient(1200px 700px at 20% 0%, #0d1636 0%, #070b1c 55%, #05081a 100%)',
        // Disable text selection while dragging to avoid highlighting content
        userSelect: isDragging ? 'none' : undefined,
        cursor: isDragging ? 'col-resize' : undefined,
      }}
    >
      {/* ── Keyframe CSS ── */}
      <style>{`
        @keyframes bheembot-dot {
          0%, 60%, 100% { transform: translateY(0); opacity: .5; }
          30%            { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>

      {/* ── Desktop sidebar (resizable) ── */}
      <div
        className="hidden md:block shrink-0 border-r border-[#141d3a]/70"
        style={{ width: sidebarWidth }}
      >
        <ChatSidebar
          onCategoryClick={handleCategoryClick}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      </div>

      {/* ── Resize handle ── */}
      <ResizeHandle onMouseDown={handleResizeMouseDown} isDragging={isDragging} />

      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[260px]">
            <ChatSidebar
              mobile
              onCategoryClick={handleCategoryClick}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ── Main chat area ── */}
      <div className="relative flex flex-1 min-w-0 flex-col">

        {/* Ambient glows */}
        <div className="pointer-events-none fixed top-0 right-0 h-[380px] w-[380px] rounded-full bg-[#3f9fff]/8 blur-[130px]" />
        <div className="pointer-events-none fixed bottom-0 left-1/3 h-[320px] w-[320px] rounded-full bg-[#7b5cff]/8 blur-[130px]" />

        {/* ── Header ── */}
        <header className="relative z-10 flex shrink-0 items-center justify-between border-b border-[#141d3a]/70 bg-[#070b1c]/90 px-4 py-3.5 backdrop-blur-sm md:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="mr-1 flex h-8 w-8 items-center justify-center rounded-lg border border-[#1e3260]/60 text-[#5a7a9e] transition hover:text-white md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={16} strokeWidth={1.8} />
            </button>

            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#2d6fff] to-[#7b5cff] shadow-[0_0_18px_rgba(79,107,255,0.4)]">
              <Sparkles size={16} strokeWidth={2} className="text-white" />
            </div>
            <div>
              <h1 className="font-display text-[15px] font-semibold text-white">{t('bot.assistant')}</h1>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.8)]" />
                <span className="text-[11px] text-[#22c55e]">{t('bot.online')}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <span className="hidden text-[12px] text-[#5a7a9e] sm:block">
              {currentUser?.username ?? ''}
            </span>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="hidden items-center gap-1.5 rounded-xl border border-[#1e3260]/60 bg-[#0a1428]/60 px-3 py-1.5 text-[12px] text-[#5a7a9e] transition hover:border-[#3a6bc4]/60 hover:text-white sm:flex"
            >
              <LayoutDashboard size={12} strokeWidth={1.8} />
              {t('nav.dashboard')}
            </button>
          </div>
        </header>

        {/* ── Messages ── */}
        <div className="relative z-10 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg.id === 'welcome' ? { ...msg, content: t('bot.welcome') } : msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Input bar ── */}
        <div className="relative z-10 shrink-0 border-t border-[#141d3a]/70 bg-[#070b1c]/90 px-4 py-4 backdrop-blur-sm md:px-6">
          <div className="flex items-end gap-2.5 rounded-2xl border border-[#1e3260]/70 bg-[#0a1428] px-4 py-3 transition focus-within:border-[#3f6bd4] focus-within:shadow-[0_0_0_3px_rgba(63,107,212,0.15)]">
            <button
              type="button"
              disabled
              title={t('bot.attachSoon')}
              className="mb-0.5 shrink-0 text-[#2a3a5e]"
            >
              <Paperclip size={16} strokeWidth={1.8} />
            </button>

            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('bot.askAnything')}
              className="flex-1 resize-none bg-transparent text-[13.5px] text-white placeholder:text-[#3a4e6e] outline-none leading-[1.5]"
              style={{ maxHeight: '120px', overflowY: 'auto' }}
              onInput={(e) => {
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
            />

            <button
              type="button"
              disabled
              title={t('bot.voiceSoon')}
              className="mb-0.5 shrink-0 text-[#2a3a5e]"
            >
              <Mic size={16} strokeWidth={1.8} />
            </button>

            <button
              type="button"
              onClick={() => send()}
              disabled={!input.trim() || sending}
              className={[
                'mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition',
                input.trim() && !sending
                  ? 'bg-[#2d6fff] text-white shadow-[0_0_14px_rgba(45,111,255,0.4)] hover:bg-[#3d7fff]'
                  : 'bg-[#0d1531] text-[#2a3a5e]',
              ].join(' ')}
            >
              <Send size={14} strokeWidth={2.2} />
            </button>
          </div>
          <p className="mt-2 text-center text-[10.5px] text-[#2a3a5e]">
            {t('bot.disclaimer')}
          </p>
        </div>
      </div>
    </div>
  );
}
