import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  Copy,
  Check,
  Search,
  Sparkles,
  Trash2,
  BookmarkCheck,
  Languages,
  X,
  Maximize2,
  RefreshCw,
} from "lucide-react";
import SpeakButton from "../components/generate/SpeakButton";
import PublishSheet from "../components/publish/PublishSheet";
import Topbar from "../components/dashboard/Topbar";
import { useAuth } from "../context/AuthContext";
import { getPosts, deletePost, translatePost, togglePostVersion } from "../api/posts";
import PostContent from "../components/generate/PostContent";
import { useI18n } from "../i18n/index.jsx";

const STATUS_COLORS = {
  draft: {
    bg: "rgba(255,176,56,0.12)",
    border: "rgba(255,176,56,0.35)",
    text: "#ffb038",
  },
  published: {
    bg: "rgba(34,197,94,0.10)",
    border: "rgba(34,197,94,0.35)",
    text: "#22c55e",
  },
  archived: {
    bg: "rgba(148,163,184,0.10)",
    border: "rgba(148,163,184,0.3)",
    text: "#94a3b8",
  },
};

function StatusBadge({ status }) {
  const { t, lang } = useI18n();
  const s = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize"
      style={{
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        color: s.text,
      }}
    >
      {t(`status.${status}`)}
    </span>
  );
}

// Full-screen reader for one post. A dialog rather than a route so the list
// keeps its scroll position and filters when it closes.
function PostModal({ post, onClose, onCopy, copiedId }) {
  const { t } = useI18n();

  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState("");
  const [showTranslated, setShowTranslated] = useState(false);

  const content =
    showTranslated && translated ? translated : (post?.content ?? "");

  // Escape to close, and hold the background still while the dialog is open.
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function handleTranslate() {
    if (showTranslated) {
      setShowTranslated(false);
      return;
    }
    if (translated) {
      setShowTranslated(true);
      return;
    }
    setTranslating(true);
    try {
      const res = await translatePost(post.id, "en");
      setTranslated(res.translated_content ?? "");
      setShowTranslated(true);
    } catch {
      /* ignore */
    } finally {
      setTranslating(false);
    }
  }

  const date = post.created_at
    ? new Date(post.created_at).toLocaleDateString("hi-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  // Rendered into document.body. An ancestor with will-change/transform becomes
  // the containing block for position:fixed, which pinned the dialog inside the
  // page instead of the viewport and pushed its header off screen.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto p-4 md:p-8"
      style={{
        backgroundColor: "rgba(3,6,17,0.86)",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative my-auto flex w-full max-w-[860px] flex-col overflow-hidden rounded-2xl border"
        style={{
          backgroundColor: "#0a1130",
          borderColor: "#1e3260",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          maxHeight: "calc(100vh - 4rem)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div
          className="flex shrink-0 items-center gap-3 border-b border-[#1a2c55]/80 px-6 py-4"
          style={{ backgroundColor: "#0a1130" }}
        >
          <StatusBadge status={post.status} />
          <span className="text-[12px] text-[#5a6e9a]">{date}</span>
          <div className="ml-auto flex items-center gap-2">
            <SpeakButton
              content={content}
              lang={showTranslated && translated ? "en" : "hi"}
            />
            <button
              type="button"
              onClick={handleTranslate}
              disabled={translating}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1e3a6e]/80 bg-[#0d1840]/80 px-3 py-2 text-[12px] font-medium text-[#6aa8ff] transition hover:text-white disabled:opacity-40"
            >
              <Languages size={13} strokeWidth={2} />
              {translating
                ? "Translating…"
                : showTranslated
                  ? "Show original"
                  : "Translate"}
            </button>
            <button
              type="button"
              onClick={() => onCopy(post.id, content)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1e3260]/80 bg-[#0d1531]/80 px-3 py-2 text-[12px] font-medium text-[#8b94b8] transition hover:text-white"
            >
              {copiedId === post.id ? (
                <Check size={13} strokeWidth={2.4} />
              ) : (
                <Copy size={13} strokeWidth={2} />
              )}
              {copiedId === post.id ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1e3260]/80 text-[#8b94b8] transition hover:text-white"
            >
              <X size={15} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* body — same renderer as the generator, so it reads identically */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-7 md:px-8">
          <PostContent content={content} lang={showTranslated && translated ? 'en' : 'hi'} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PostCard({ post, onOpen, onCopy, onPublish, onArchive, onToggleVersion, copiedId }) {
  const { t } = useI18n();
  const [translating, setTranslating] = useState(false);
  const [translated, setTranslated] = useState("");
  const [showTranslated, setShowTranslated] = useState(false);

  const rawContent = post.content ?? "";
  const content = showTranslated && translated ? translated : rawContent;
  const preview = content.slice(0, 200);
  const hasMore = content.length > 200;
  const date = post.created_at
    ? new Date(post.created_at).toLocaleDateString("hi-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  async function handleTranslate() {
    if (showTranslated) {
      setShowTranslated(false);
      return;
    }
    if (translated) {
      setShowTranslated(true);
      return;
    }
    setTranslating(true);
    try {
      const res = await translatePost(post.id, "en");
      setTranslated(res.translated_content ?? "");
      setShowTranslated(true);
    } catch {
      /* ignore */
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div
      className="group relative flex flex-col gap-3 rounded-2xl border p-5 transition-all duration-200"
      style={{
        backgroundColor: "#07101f",
        borderColor: "#1a2c55",
        boxShadow: "0 2px 16px rgba(0,0,0,0.25)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(63,159,255,0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#1a2c55";
      }}
    >
      {/* top row */}
      <div className="flex items-center justify-between gap-2">
        {/* badge + date */}
        <div className="flex min-w-0 items-center gap-2">
          <StatusBadge status={post.status} />
          <span className="whitespace-nowrap text-[11px] text-[#4e5a80]">
            {date}
          </span>
        </div>

        {/* action buttons — icon-only on mobile, icon+label on sm+ */}
        <div className="flex shrink-0 items-center gap-1">
          {/* Read aloud. Speaks whichever version is on screen, so a
              translated post is read in English rather than the Hindi it
              was generated in. */}
          <SpeakButton
            content={content}
            lang={showTranslated && translated ? "en" : "hi"}
            compact
          />

          {/* Translate */}
          <button
            type="button"
            onClick={handleTranslate}
            disabled={translating}
            title={showTranslated ? "Show Hindi" : "Translate to English"}
            className="flex h-7 items-center justify-center gap-1 rounded-lg border border-[#1e3260]/60 px-1.5 text-[#6b78a0] transition hover:border-[#3f9fff]/50 hover:text-[#3f9fff] disabled:opacity-50 sm:px-2.5"
            style={
              showTranslated
                ? { borderColor: "rgba(63,159,255,0.4)", color: "#3f9fff" }
                : {}
            }
          >
            <Languages size={12} strokeWidth={2} />
            <span className="hidden text-[11px] font-medium sm:inline">
              {translating ? "…" : showTranslated ? "हिंदी" : "EN"}
            </span>
          </button>

          {/* Switch version — a refined draft keeps both texts until it is
              published, and publishing takes whichever one is showing. Without
              this the choice would only exist on the generator screen, so a
              draft published from here could not be switched. */}
          {post.status === "draft" && post.previous_content && (
            <button
              type="button"
              onClick={() => onToggleVersion(post.id)}
              title={post.refined_is_live === false ? t('gen.showRefined') : t('gen.showOriginal')}
              className="flex h-7 items-center justify-center gap-1 rounded-lg border border-[#1e3260]/60 px-1.5 text-[#6b78a0] transition hover:border-[#3f9fff]/50 hover:text-[#3f9fff] sm:px-2.5"
            >
              <RefreshCw size={12} strokeWidth={2} />
              <span className="hidden text-[11px] font-medium sm:inline">
                {post.refined_is_live === false ? t('gen.showRefined') : t('gen.showOriginal')}
              </span>
            </button>
          )}

          {/* Publish */}
          {post.status === "draft" && (
            <button
              type="button"
              onClick={() => onPublish(post.id)}
              title={t('history.publish')}
              className="flex h-7 items-center justify-center gap-1 rounded-lg border border-[#1e3260]/60 px-1.5 text-[#6b78a0] transition hover:border-[#22c55e]/50 hover:text-[#22c55e] sm:px-2.5"
            >
              <BookmarkCheck size={12} strokeWidth={2} />
              <span className="hidden text-[11px] font-medium sm:inline">
                {t("gen.publish")}
              </span>
            </button>
          )}

          {/* Archive */}
          {post.status !== "archived" && (
            <button
              type="button"
              onClick={() => onArchive(post.id)}
              title={t('history.archive')}
              className="flex h-9 w-9 items-center justify-center sm:h-7 sm:w-7 rounded-lg border border-[#1e3260]/60 text-[#6b78a0] transition hover:border-red-500/40 hover:text-red-400"
            >
              <Trash2 size={12} strokeWidth={2} />
            </button>
          )}

          {/* Copy */}
          <button
            type="button"
            onClick={() => onCopy(post.id, content)}
            title="Copy"
            className="flex h-7 items-center justify-center gap-1 rounded-lg border border-[#1e3260]/60 px-1.5 transition sm:px-2.5"
            style={{
              color: copiedId === post.id ? "#22c55e" : "#6b78a0",
              borderColor:
                copiedId === post.id ? "rgba(34,197,94,0.4)" : undefined,
            }}
          >
            {copiedId === post.id ? (
              <>
                <Check size={12} strokeWidth={2.5} />
                <span className="hidden text-[11px] font-medium sm:inline">
                  {t("common.copied")}
                </span>
              </>
            ) : (
              <>
                <Copy size={12} strokeWidth={2} />
                <span className="hidden text-[11px] font-medium sm:inline">
                  {t("common.copy")}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* content */}
      <p
        className="whitespace-pre-wrap text-[13.5px] leading-relaxed"
        style={{ color: "#c5d0e8" }}
      >
        {hasMore ? preview + "…" : content}
      </p>

      <button
        type="button"
        onClick={() => onOpen(post)}
        className="group/open self-start inline-flex items-center gap-1.5 text-[12.5px] font-semibold transition hover:opacity-80"
        style={{ color: "#3f9fff" }}
      >
        <Maximize2 size={12} strokeWidth={2.2} />
        {t("history.readFull")}
      </button>

      {/* hashtags */}
      {post.hashtags?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {post.hashtags.map((tag) => (
            <span
              key={tag}
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: "rgba(63,159,255,0.1)",
                color: "#5fa5ff",
                border: "1px solid rgba(63,159,255,0.2)",
              }}
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PostHistory() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const [posts, setPosts] = useState([]);
  // The post whose destination is being chosen, or null.
  const [publishing, setPublishing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [copiedId, setCopied] = useState(null);
  const [openPost, setOpenPost] = useState(null);

  useEffect(() => {
    getPosts({ limit: 200 })
      .then((data) => setPosts(data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCopy(id, content) {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      /* ignore */
    }
    setCopied(id);
    setTimeout(() => setCopied(null), 1800);
  }

  // Publishing means choosing a destination. The sheet does the posting and
  // the status change together, so "published" stops being a flag the user
  // set on their own database row and starts meaning the post is somewhere.
  function handlePublish(id) {
    setPublishing(posts.find((p) => p.id === id) ?? null);
  }

  function handlePublished(id) {
    setPosts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "published" } : p)),
    );
  }

  async function handleToggleVersion(id) {
    try {
      const updated = await togglePostVersion(id);
      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updated } : p)));
    } catch {
      /* ignore */
    }
  }

  async function handleArchive(id) {
    try {
      await deletePost(id);
      setPosts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "archived" } : p)),
      );
    } catch {
      /* ignore */
    }
  }

  const filtered = posts.filter((p) => {
    if (filter !== "all" && p.status !== filter) return false;
    if (search && !p.content?.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  const counts = {
    all: posts.length,
    draft: posts.filter((p) => p.status === "draft").length,
    published: posts.filter((p) => p.status === "published").length,
    archived: posts.filter((p) => p.status === "archived").length,
  };

  return (
    <>
      {/* The brand and the back-to-dashboard button that used to head this page
          are both in the sidebar now, which is always on screen. */}
      <div className="relative px-4 sm:px-6 md:px-10">
        <Topbar
          title={t("history.title")}
          icon={<Search size={15} strokeWidth={2} className="hidden shrink-0 text-[#4f7fd4] lg:block" />}
          right={
            <button
              type="button"
              onClick={() => navigate("/generate")}
              className="hidden items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-[13px] font-semibold text-white sm:inline-flex"
              style={{
                background: "linear-gradient(90deg,#0a7dff,#3a9fff)",
                boxShadow: "0 4px 18px rgba(10,125,255,0.35)",
              }}
            >
              <Sparkles size={14} strokeWidth={2.1} />
              {t("history.generateNew")}
            </button>
          }
        />

        <main className="relative z-10 mx-auto max-w-[960px] pb-8">
        {/* The page's name is in the bar above; this keeps only what it is for. */}
        <p className="mb-6 text-[16px] text-[#9fb0d4]">
          {t("history.sub")}
        </p>

        {/* Search + filter bar */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              size={14}
              strokeWidth={2}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#4e5a80]"
            />
            <input
              type="text"
              placeholder={t("history.searchPosts")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-[#1a2c55] bg-[#07101f] py-2.5 pl-9 pr-4 text-[13.5px] text-white placeholder:text-[#4e5a80] outline-none transition focus:border-[#3f9fff]/50"
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-[#1a2c55] bg-[#07101f] p-1">
            {["all", "draft", "published", "archived"].map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium capitalize transition-all duration-150"
                style={{
                  backgroundColor: filter === tab ? "#1a2a5e" : "transparent",
                  color: filter === tab ? "#fff" : "#6b78a0",
                  boxShadow:
                    filter === tab ? "0 1px 4px rgba(0,0,0,0.4)" : "none",
                }}
              >
                {t(`status.${tab}`)}{" "}
                <span className="ml-0.5 opacity-60">({counts[tab]})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Posts list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-[#4e5a80] text-[14px]">
            {t('history.loading')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#1e3260]/60 bg-[#07101f]">
              <Sparkles
                size={24}
                strokeWidth={1.6}
                className="text-[#3f9fff]"
              />
            </div>
            <p className="text-[14px] text-[#6b78a0]">
              {search ? t("history.emptySearch") : t("history.emptyStart")}
            </p>
            {!search && (
              <button
                type="button"
                onClick={() => navigate("/generate")}
                className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(90deg,#0a7dff,#3a9fff)" }}
              >
                <Sparkles size={13} strokeWidth={2} />
                {t("history.generateAPost")}
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onOpen={setOpenPost}
                onCopy={handleCopy}
                onPublish={handlePublish}
                onArchive={handleArchive}
                onToggleVersion={handleToggleVersion}
                copiedId={copiedId}
              />
            ))}
          </div>
        )}

        {openPost && (
          <PostModal
            post={openPost}
            onClose={() => setOpenPost(null)}
            onCopy={handleCopy}
            copiedId={copiedId}
          />
        )}
        </main>
      </div>

      {publishing && (
        <PublishSheet
          post={publishing}
          onClose={() => setPublishing(null)}
          onPublished={() => {
            handlePublished(publishing.id);
            setPublishing(null);
          }}
        />
      )}
    </>
  );
}
