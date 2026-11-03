import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearPendingQuestions } from '../hooks/usePendingQuestions';
import {
  ArrowLeft, Filter, Sparkles,
  Copy, Check, RefreshCw, ChevronDown, FileText, Star, Radio,
  ArrowUpDown, List, LayoutGrid, Users, ArrowRight,
  CalendarDays, Clock, ChevronRight, X as XIcon,
  MessageCircle, Repeat2, Heart, Share, Flame, AlertTriangle, Smartphone, PenLine,
} from 'lucide-react';

import PreferencesPanel from '../components/generate/PreferencesPanel';
import DevSourceTag from '../components/DevSourceTag';
import PostContent from '../components/generate/PostContent';
import AgMark from '../components/brand/AgMark';
import { useAuth } from '../context/AuthContext';
import { getNews, getNewsById, getNewsByStoryId, getTenants } from '../api/news';
import { adaptNews, resolveTenantForUser } from '../utils/newsTenants';
import { generatePostForNews, regeneratePostFromSnapshot, translatePost, getDailyQuota, togglePostVersion, updatePost, warmGenerator } from '../api/posts';
import { getPartyQuestions } from '../api/questions';
import { getProfileAnswers, saveProfileAnswers } from '../api/profile';
import { CORE_QUESTION_IDS } from '../utils/preferenceQuestions';
import { getSiteLanguage, SITE_LANGUAGES } from '../utils/siteLanguage';
import { parsePost, hashtagsText } from '../utils/parsePost';
import Spinner from '../components/Spinner';
import { useI18n } from '../i18n/index.jsx';
import SpeakButton from '../components/generate/SpeakButton';
import Sidebar from '../components/dashboard/Sidebar';
import NewsCarousel from '../components/generate/NewsCarousel';
import NotificationBell from '../components/dashboard/NotificationBell';
import ProfileMenu from '../components/dashboard/ProfileMenu';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { labelForId } from '../utils/partyRoles';
import { PREFERENCES_ENABLED } from '../data/features';
import PhonePreview from '../components/compose/PhonePreview';
import { PLATFORM_LOOK } from '../components/compose/platformLook';
import '../components/compose/compose.css';
import { partyLabel } from '../utils/displayLabel';
import { partyLogo } from '../utils/politicalParties';
import { trackEvent } from '../analytics/metrics';

const CATEGORIES = ['All', 'Legacy', 'Policy', 'Education', 'Research', 'Grassroots'];

function useCountdown(resetAt) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!resetAt) return;
    function tick() {
      const diff = Math.max(0, Math.floor((new Date(resetAt) - Date.now()) / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setLabel(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resetAt]);
  return label;
}

// WhatsApp first and X last: in the order these posts are most shared.
const PLATFORMS = [
  { id: 'whatsapp',  label: 'WhatsApp',      short: 'WA',  limit: 65536, color: '#25d366' },
  // Reddit's self-post body limit really is 40,000 — the counter says so
  // rather than a rounder number that would be a guess.
  { id: 'reddit',    label: 'Reddit',        short: 'r/',  limit: 40000, color: '#ff4500' },
  // WhatsApp and Facebook accept far more than anyone writes (65,536 and
  // 63,206 characters); the length the post aims for is set on the server.
  { id: 'facebook',  label: 'Facebook',      short: 'f',   limit: 63206, color: '#1877f2' },
  { id: 'twitter',   label: 'Twitter / X',  short: '𝕏',   limit: 280,  color: '#1d9bf0' },
];

/**
 * Where "Post to …" opens, with the text exactly as shown (as on rssgpt).
 * Reddit takes the first line, the headline, as its title (300 characters at
 * most) and the rest as the body. Facebook lets no site fill in a post, so
 * its text is copied (`copy`) and Facebook opens to paste it.
 */
// Past this a share link is refused: Reddit answers "URI Too Long" at about
// 8 KB. Each Devanagari letter is 9 characters once encoded (%E0%A4%B0), so a
// long Hindi post crosses it at well under a thousand letters.
const MAX_SHARE_URL = 6000;

// A long post opens the platform without its body, and the body is copied
// instead (`copy` is then the text to copy, and `pasteBody` says so).
function shareTarget(platform, text) {
  const enc = encodeURIComponent;
  if (platform === 'twitter') return { url: `https://twitter.com/intent/tweet?text=${enc(text)}` };
  if (platform === 'whatsapp') {
    const url = `https://wa.me/?text=${enc(text)}`;
    return url.length <= MAX_SHARE_URL ? { url } : { url: 'https://wa.me/', copy: text, pasteBody: true };
  }
  if (platform === 'reddit') {
    const [first = '', ...rest] = text.trim().split('\n');
    const title = `https://www.reddit.com/submit?type=TEXT&title=${enc(first.trim().slice(0, 300))}`;
    const body = rest.join('\n').trim();
    const url = `${title}&text=${enc(body)}`;
    return url.length <= MAX_SHARE_URL ? { url } : { url: title, copy: body, pasteBody: true };
  }
  if (platform === 'facebook') return { url: 'https://www.facebook.com/', copy: true };
  return { url: null, copy: true };
}


const MIN_PANEL = 220;
const MAX_PANEL = 500;
const PAGE_SIZE = 12; // news cards per page

// Feed ordering and card layout are remembered per browser. Both are reading
// preferences, not account settings, and localStorage throws outright in some
// contexts (private windows, blocked site data), so every access is guarded and
// falls back to the default rather than taking the page down.
const SORT_KEY = 'ambedkargpt-news-sort';
const VIEW_KEY = 'ambedkargpt-news-view';

function readLocal(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the preference simply does not survive this session.
  }
}

// Build a compact page-number list with ellipsis gaps for the pager
function getPageItems(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) items.push('…');
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push('…');
  items.push(total);
  return items;
}

// The side panel carries the ten party questions only. The seven profile
// questions describe who the writer is and live on the Preferences page; the
// post's length is not asked at all, because the platform picked decides it
// (280 characters for X, as on rssgpt).

// adaptNews and resolveTenantForUser live in utils/newsTenants, shared with the
// dashboard's top-story card so both read the same party and story shape.

// Livestreamed briefings read differently from regular uploads, so the card
// says which it is.
const CONTENT_TYPES = {
  press_conference: { label: 'Press Conference', color: '#f0a63a' },
  news:             { label: 'News Article',     color: '#5a6e9a' },
};

// Short form of the party for the feed heading: "INC" rather than "Indian
// National Congress". The tenant registry stores only the full name, so this
// prefers a translated short form, falls back to the abbreviation the signup
// list carries in brackets ("Samajwadi Party (SP)"), and finally to the full
// name, which is always correct if never brief.
function partyShortLabel(tenant, userPartyName, t, lang) {
  const key = `partyShort.${tenant?.slug ?? ''}`;
  const short = t(key);
  if (short && short !== key) return short;
  const bracketed = String(userPartyName ?? '').match(/\(([^)]{1,12})\)\s*$/);
  if (bracketed) return bracketed[1].trim();
  return partyLabel(tenant?.name, lang);
}

// Two standing ranges, plus a per-day jump built from the days that actually
// carry articles. A free calendar would let the user land on a day with nothing
// published; a list built from the data cannot be picked wrong.
// "Last 7 days" is gone. It was a rolling window over a feed that only ever
// holds a few days, so it selected either everything or nearly everything and
// told nobody which days those were. The day list below does that job, and
// does it from the days that actually carry articles.
const DATE_RANGES = [
  { id: 'all', label: 'All dates', days: null },
];

const DAY_PREFIX = 'day:';

function withinDays(dateValue, days) {
  if (!days) return true;
  if (!dateValue) return false;
  const t = new Date(dateValue).getTime();
  if (Number.isNaN(t)) return false;
  return t >= Date.now() - days * 86400000;
}

// Day buckets for the feed headings. Compared on local calendar days so an
// article published late yesterday does not read as "Today" on a time diff.
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function dayGroupLabel(dateValue) {
  if (!dateValue) return 'Undated';
  const t = new Date(dateValue);
  if (Number.isNaN(t.getTime())) return 'Undated';
  // The date, always. "Today" and "Day before yesterday" sat in a list beside
  // "Sunday, Aug 30" and read as a different kind of thing, and they are the
  // one label that stops being true while the page is open: a tab left
  // overnight keeps calling yesterday's stories Today.
  return t.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

// Stable per-day identity for the day picker. Articles without a usable date
// still need a bucket, otherwise they vanish from the day list entirely.
function dayKey(dateValue) {
  if (!dateValue) return 'undated';
  const t = new Date(dateValue);
  return Number.isNaN(t.getTime()) ? 'undated' : String(startOfDay(t));
}

function dayKeyLabel(key) {
  return key === 'undated' ? 'Undated' : dayGroupLabel(Number(key));
}

function matchesDate(dateValue, filterId) {
  if (filterId.startsWith(DAY_PREFIX)) {
    return dayKey(dateValue) === filterId.slice(DAY_PREFIX.length);
  }
  return withinDays(dateValue, DATE_RANGES.find((d) => d.id === filterId)?.days ?? null);
}

// Accent per section so party news, opposition news and general news are
// visually distinct.
// The content types a party feed carries, in the order the chooser lists them.
const TYPE_OPTIONS = [
  { id: 'all',              label: 'gen.all' },
  { id: 'press_conference', label: 'gen.pressConference' },
  { id: 'news',             label: 'gen.newsArticle' },
];

const SECTION_THEME = {
  party:      { accent: '#3f9fff', soft: 'rgba(63,159,255,0.12)', ring: 'rgba(63,159,255,0.45)' },
  opposition: { accent: '#e5484d', soft: 'rgba(229,72,77,0.12)',  ring: 'rgba(229,72,77,0.45)' },
  general:    { accent: '#f0a63a', soft: 'rgba(240,166,58,0.12)', ring: 'rgba(240,166,58,0.45)' },
};

// The banner's own colour, by party. Chosen to read as that party without
// reproducing its election symbol or logo, which are not ours to ship: the
// initials badge and a tint carry the recognition instead.
//
// A party with no entry still gets a banner, in the neutral house blue. That
// matters because the tenant registry can grow without this file.
const PARTY_THEME = {
  congress:  { accent: '#2a7de1', tint: 'rgba(42,125,225,0.16)' },
  samajwadi: { accent: '#d1394a', tint: 'rgba(209,57,74,0.16)' },
  bjp:       { accent: '#f0872a', tint: 'rgba(240,135,42,0.16)' },
};

const DEFAULT_PARTY_THEME = { accent: '#3f9fff', tint: 'rgba(63,159,255,0.14)' };

// One line of what the party stands for, under its name. Not in the tenant
// registry, so it lives here as i18n keys; a party without one shows nothing
// rather than a placeholder.
const PARTY_TAG_KEYS = {
  congress:  ['ptag.congress.1', 'ptag.congress.2', 'ptag.congress.3'],
  samajwadi: ['ptag.samajwadi.1', 'ptag.samajwadi.2', 'ptag.samajwadi.3'],
  bjp:       ['ptag.bjp.1', 'ptag.bjp.2', 'ptag.bjp.3'],
};

// Newest first, for the overview's rows.
function byNewest(list) {
  return [...list].sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
}

// A card's colour in the overview: the opposition's red, otherwise the party's.
function levelCardAccent(article) {
  return article.tenantSlug === 'bjp' ? '#e5484d' : '#3f9fff';
}

function formatNewsDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Trim card body to a short teaser and append an ellipsis.
function truncateText(text = '', max = 160) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

// How deep each view sits, for stepping back through them with the history.
const VIEW_DEPTH = { feed: 0, preview: 1, generated: 2 };

export default function SocialMediaPostGenerator() {
  const navigate = useNavigate();

  // The server refuses a post until the party and the preference questions
  // are done. The route guard normally gets there first; this covers a check
  // that was stale, by sending them to the step the server named.
  function sendToOnboarding(err) {
    const detail = err?.response?.data?.detail;
    if (err?.response?.status !== 403 || detail?.code !== 'onboarding_required') return false;
    clearPendingQuestions();
    try { sessionStorage.setItem('auth_redirect', '/generate/social-media'); } catch { /* ignore */ }
    navigate(detail.step === 'profile' ? '/profile-setup' : '/questionnaire', { replace: true });
    return true;
  }
  const { currentUser, logout } = useAuth();

  const [nationalArticles, setArticles]       = useState([]);
  // The news page is split by level of politics. National is the parties'
  // central channels (everything there was before), state is the state units
  // (INC MP, BJP MP for now); city and social come later.
  const [stateArticles,   setStateArticles]   = useState([]);
  const [stateLoading,    setStateLoading]    = useState(true);
  // null: the overview, a row per level. 'national' / 'state': that level's
  // full grid, which is the feed as it was.
  const [level,           setLevel]           = useState(null);
  const articles = level === 'state' ? stateArticles : nationalArticles;
  const [newsLoading,     setNewsLoading]     = useState(true);
  const [newsError,       setNewsError]       = useState(false);
  const [search,          setSearch]          = useState('');
  const [activeFilter,    setActiveFilter]    = useState('All');
  const [dateFilter,      setDateFilter]      = useState('all');
  const [typeFilter,      setTypeFilter]      = useState('all'); // all | news | press_conference
  const [page,            setPage]            = useState(1);
  const [tenants,         setTenants]         = useState([]);
  const [newsSection,     setNewsSection]     = useState('party'); // 'party' | 'opposition' | 'general'
  const [sharing,         setSharing]         = useState(false);  // a share is marking the post published
  const [shareMsg,        setShareMsg]        = useState('');     // "paste it in Facebook", or why the share failed
  const [articleOpen,     setArticleOpen]     = useState(false);   // phones: the article starts as a preview
  const [filterOpen,      setFilterOpen]      = useState(false);
  const [view,            setView]            = useState('feed'); // 'feed' | 'preview' | 'generated'
  const [generating,      setGenerating]      = useState(false);
  const [genSeconds,      setGenSeconds]      = useState(0);
  const [generatedPost,   setGeneratedPost]   = useState('');
  // A refusal used to be written into generatedPost behind a warning emoji, so
  // the message was then laid out as if it were a post, in the post's own type
  // and line height. This says which of the two the string holds, and the
  // render gives an error its own frame.
  const [postFailed,      setPostFailed]      = useState(false);
  // The post drawn inside a phone, the way the platform shows it, on request.
  const [phoneOpen,       setPhoneOpen]       = useState(false);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [selectedPostId,  setSelectedPostId]  = useState(null);
  const [copied,          setCopied]          = useState(false);
  const [panelWidth,      setPanelWidth]      = useState(300);
  const [searchInput] = useState('');
  const [prefQuestions,   setPrefQuestions]   = useState([]);
  const [preferences,     setPreferences]     = useState({});
  const [savedPrefs,      setSavedPrefs]      = useState({});
  const [translatedPost,  setTranslatedPost]  = useState('');
  const [showTranslated,  setShowTranslated]  = useState(false);
  const [translating,     setTranslating]     = useState(false);
  const [quota,           setQuota]           = useState(null);
  const [postStatus,      setPostStatus]      = useState('draft');
  // WhatsApp first: it is where these posts are mostly shared.
  const [platform,        setPlatform]        = useState('whatsapp');
  // Always the platform preview. The Post/Preview toggle is gone: a plain-text
  // rendering of the same words told nobody anything the preview did not, and
  // the preview is what someone is actually about to publish.
  const postView = 'preview';
  // Feed ordering and card layout. Both are per-viewer conveniences, so they
  // live in localStorage rather than on the account: someone reading on a phone
  // wants the list, the same person on a desktop wants the grid.
  const [sortOrder,       setSortOrder]       = useState(() => readLocal(SORT_KEY, 'latest'));
  const [sortOpen,        setSortOpen]        = useState(false);
  const [typeOpen,        setTypeOpen]        = useState(false);
  const [cardView,        setCardView]        = useState(() => readLocal(VIEW_KEY, 'grid'));
  const [refinementNote,  setRefinementNote]  = useState('');
  const [refineHint,      setRefineHint]      = useState('');
  // A post gets one refinement. Until it is published both versions are kept,
  // and the user picks which one goes out.
  const [refinedAt,       setRefinedAt]       = useState(null);
  const [hasOtherVersion, setHasOtherVersion] = useState(false);
  const [refinedIsLive,   setRefinedIsLive]   = useState(true);
  const [switchingVersion, setSwitchingVersion] = useState(false);
  const [copiedHashtags,  setCopiedHashtags]  = useState(false);
  const [showMobilePrefs, setShowMobilePrefs] = useState(false);
  const filterRef = useRef(null);
  const sortRef = useRef(null);
  const typeRef = useRef(null);

  const { t, lang } = useI18n();
  const siteLang = getSiteLanguage() ?? 'hi';
  const atDailyLimit = quota?.daily_remaining === 0;
  const quotaCountdown = useCountdown(atDailyLimit ? quota?.reset_at : null);

  // Fetch daily quota on mount
  useEffect(() => {
    if (!currentUser?.id) return;
    getDailyQuota().then(setQuota).catch(() => {});
  }, [currentUser?.id]);

  // The party comes from the user's signup choice — it is not switchable here.
  // Declared before loadNews because that callback reads it.
  const activeParty = useMemo(
    () => resolveTenantForUser(currentUser?.political_party, tenants),
    [currentUser?.political_party, tenants]
  );
  const selectedParty = activeParty?.slug ?? '';

  const loadNews = useCallback(() => {
    setNewsLoading(true);
    setNewsError(false);
    // Ask for the chosen party plus general and opposition news in one call;
    // the UI splits them into the three sections locally.
    const query = { limit: 100, language: siteLang };
    if (selectedParty) { query.tenant = selectedParty; query.includeGeneral = false; query.includeOpposition = true; }
    getNews(query)
      .then((data) => {
        if (data?.length) {
          setArticles(data.map(adaptNews).filter((a) => a.scope !== 'state'));
          setNewsLoading(false);
        } else {
          const fallback = { limit: 100 };
          if (selectedParty) { fallback.tenant = selectedParty; fallback.includeGeneral = false; fallback.includeOpposition = true; }
          getNews(fallback).then((all) => {
            if (all?.length) setArticles(all.map(adaptNews).filter((a) => a.scope !== 'state'));
          }).catch(() => setNewsError(true)).finally(() => setNewsLoading(false));
        }
      })
      .catch(() => { setNewsLoading(false); setNewsError(true); });

    setStateLoading(true);
    const stateQuery = { limit: 100, scope: 'state' };
    if (selectedParty) { stateQuery.tenant = selectedParty; stateQuery.includeGeneral = false; stateQuery.includeOpposition = true; }
    getNews(stateQuery)
      .then((data) => setStateArticles((data || []).map(adaptNews).filter((a) => a.scope === 'state')))
      .catch(() => setStateArticles([]))
      .finally(() => setStateLoading(false));
  }, [siteLang, selectedParty]);

  // Debounce search input 300ms before filtering
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Fetch news filtered by site language + selected party; fall back to all if empty
  useEffect(() => {
    loadNews();
  }, [loadNews]);

  // Load the tenant registry (selectable parties) once
  useEffect(() => {
    getTenants().then(setTenants).catch(() => {});
  }, []);

  useEffect(() => {
    if (!currentUser?.id) return;

    Promise.all([
      getProfileAnswers(currentUser.id).catch(() => []),
      // The ten written for this party. They ask what the writer wants said
      // about their party, which is the thing a particular story most often
      // needs changed for one post: the same news deserves a different stance
      // depending on how the party is named in it.
      //
      // The five position questions are deliberately not here. Those describe
      // how someone at this level writes, which does not move from story to
      // story, and carrying both sets put sixteen dropdowns in the panel and
      // made it something to scroll past rather than reach for. They still
      // shape every post: the generator reads the saved answers, and the
      // questionnaire is where they are set.
      getPartyQuestions(currentUser.political_party || '').catch(() => []),
    ]).then(([saved, partyQs]) => {
      // The ten for this writer's party. The list is empty for a party with
      // no set written for it, and the panel is then empty rather than broken.
      const qs = [
        // The question text is localised here rather than in the panel, so the
        // panel keeps taking one string per question. options_hi travels
        // untouched: the panel draws it but still writes back the English
        // option, which is what the defaults, the saved answers and the
        // backend's matching all speak.
        ...partyQs.map((q) => ({
          ...q,
          question_text: siteLang === 'hi' && q.question_text_hi ? q.question_text_hi : q.question_text,
        })),
      ];
      setPrefQuestions(qs);

      // Build a { question_id: answer } map from the saved answers array
      const savedMap = Object.fromEntries(
        (saved ?? []).map((a) => [a.question_id, a.answer])
      );
      // Fill any missing question with first available option
      const initial = Object.fromEntries(
        qs.map((q) => [q.question_id, savedMap[q.question_id] ?? q.options[0] ?? ''])
      );
      setPreferences(initial);
      setSavedPrefs(initial);
    }).catch(() => {});
    // Re-runs on a language switch, so the party questions come back in the
    // language now on screen, and on a party change, so they come back as the
    // new party's set rather than the old one's. Position is not a dependency
    // any more: the panel no longer asks anything that varies by level.
  }, [currentUser?.id, currentUser?.political_party, siteLang]);

  // Resize drag refs
  const resizing  = useRef(false);
  const startX    = useRef(0);
  const startW    = useRef(0);

  useEffect(() => {
    function onMove(e) {
      if (!resizing.current) return;
      const delta = startX.current - e.clientX;
      setPanelWidth(Math.min(MAX_PANEL, Math.max(MIN_PANEL, startW.current + delta)));
    }
    function onUp() { resizing.current = false; document.body.style.cursor = ''; document.body.style.userSelect = ''; }
    function onClickOutside(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false);
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
      if (typeRef.current && !typeRef.current.contains(e.target)) setTypeOpen(false);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, []);

  function startResize(e) {
    resizing.current = true;
    startX.current   = e.clientX;
    startW.current   = panelWidth;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  }


  // Split the feed into three sections: the chosen party's news, the
  // opposition's (BJP, not scraped yet), and the neutral/general news
  // (Ravish) that every user sees.
  const partyArticles = useMemo(
    () => (activeParty ? articles.filter((a) => a.tenantSlug === activeParty.slug) : []),
    [articles, activeParty]
  );
  // No tenant scrapes BJP yet, so this is always empty for now — the tab
  // exists so the section has a home once that scraping exists, rather than
  // needing this whole area rewired later.
  const oppositionArticles = useMemo(
    () => articles.filter((a) => a.tenantSlug === 'bjp'),
    [articles]
  );
  // General news is no longer shown: two feeds, the party's and the
  // opposition's. Without a party chosen there is only one list, so show
  // everything except general.
  const sectionArticles = !activeParty
    ? articles.filter((a) => a.tenantSlug !== 'general')
    : newsSection === 'opposition' ? oppositionArticles
    : partyArticles;

  // The three feeds, described once. Phones show them as a chip row and wider
  // screens as the three cards; both read this and both call chooseSection.
  const sectionTabs = [
    { id: 'party', Icon: FileText, label: t('gen.partyNews'),
      sub: t('gen.partyNewsSub', { party: partyLabel(activeParty?.name ?? '', lang) }),
      count: partyArticles.length },
    { id: 'opposition', Icon: Users, label: t('gen.oppositionNews'),
      sub: t('gen.oppositionNewsSub'), count: oppositionArticles.length },
  ];

  function chooseSection(id) {
    if (id === 'general') id = 'party';
    setNewsSection(id);
    setPage(1);
    // Neither general nor opposition has press conferences, so carrying that
    // filter across from the party tab would show an empty section.
    if (id === 'opposition') setTypeFilter('all');
  }

  // Accent for the section currently on screen; falls back to the party colour
  // when no party is set, so the heading is never unstyled.
  const theme = SECTION_THEME[activeParty ? newsSection : 'party'] ?? SECTION_THEME.party;

  // Everything except the date rule. The day picker counts off this list, so the
  // number beside each day is what that day will actually show.
  const dateScopedArticles = useMemo(() => {
    const q = search.toLowerCase();
    return sectionArticles.filter((a) => {
      const matchSearch = !search || a.title.toLowerCase().includes(q);
      const matchFilter = activeFilter === 'All' || a.category === activeFilter;
      const matchType   = typeFilter === 'all' || a.contentType === typeFilter;
      return matchSearch && matchFilter && matchType;
    });
  }, [sectionArticles, search, activeFilter, typeFilter]);

  const filteredArticles = useMemo(
    () => dateScopedArticles.filter((a) => matchesDate(a.date, dateFilter)),
    [dateScopedArticles, dateFilter],
  );

  // Days holding at least one article, newest first. Undated sorts last.
  const availableDays = useMemo(() => {
    const counts = new Map();
    for (const a of dateScopedArticles) {
      const key = dayKey(a.date);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count, label: dayKeyLabel(key) }))
      .sort((a, b) => {
        if (a.key === 'undated') return 1;
        if (b.key === 'undated') return -1;
        return Number(b.key) - Number(a.key);
      });
  }, [dateScopedArticles]);

  // Switching party, section or type can retire the chosen day. Left alone that
  // reads as an empty feed with no visible cause, so fall back to all dates.
  useEffect(() => {
    if (!dateFilter.startsWith(DAY_PREFIX)) return;
    const key = dateFilter.slice(DAY_PREFIX.length);
    if (!availableDays.some((d) => d.key === key)) {
      setDateFilter('all');
      setPage(1);
    }
  }, [availableDays, dateFilter]);

  const selectedDayLabel = dateFilter.startsWith(DAY_PREFIX)
    ? dayKeyLabel(dateFilter.slice(DAY_PREFIX.length))
    : null;

  const filtersActive = (dateFilter !== 'all' ? 1 : 0)
    + (typeFilter !== 'all' ? 1 : 0)
    + (activeFilter !== 'All' ? 1 : 0);

  // Numbered pagination — slice the filtered list into fixed-size pages.
  // The API already returns newest first, so "latest" costs nothing and
  // "oldest" is the same list reversed by date. Sorting happens before
  // pagination, or page 2 of "oldest" would be page 2 of the newest items.
  // Undated items sort last either way: they carry no claim to a position.
  const orderedArticles = useMemo(() => {
    const stamp = (a) => {
      const ms = new Date(a.date ?? '').getTime();
      return Number.isNaN(ms) ? null : ms;
    };
    return [...filteredArticles].sort((a, b) => {
      const x = stamp(a);
      const y = stamp(b);
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return sortOrder === 'oldest' ? x - y : y - x;
    });
  }, [filteredArticles, sortOrder]);

  // Clamp during render so a stale-high page never slices out of range
  // (handlers reset to page 1 whenever the search/filter changes).
  const totalPages = Math.max(1, Math.ceil(orderedArticles.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedArticles = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return orderedArticles.slice(start, start + PAGE_SIZE);
  }, [orderedArticles, currentPage]);

  // Group the current page into day buckets, preserving the newest-first order
  // the API already applied.
  // Changes whenever a different set of cards is shown, so they rise again.
  const feedKey = `${newsSection}|${dateFilter}|${typeFilter}|${page}|${cardView}`;
  const pagedGroups = useMemo(() => {
    const groups = [];
    let current = null;
    for (const article of pagedArticles) {
      const label = dayGroupLabel(article.date);
      if (!current || current.label !== label) {
        current = { label, items: [] };
        groups.push(current);
      }
      current.items.push(article);
    }
    return groups;
  }, [pagedArticles]);

  const activeContent = showTranslated && translatedPost ? translatedPost : generatedPost;
  const chars = activeContent.trim().length;
  const words = activeContent.trim() ? activeContent.trim().split(/\s+/).length : 0;
  const activePlatform = PLATFORMS.find((p) => p.id === platform) ?? PLATFORMS[0];
  const charPct = activePlatform.limit ? chars / activePlatform.limit : 0;
  const charOverLimit = chars > activePlatform.limit;
  const charWarning = charPct > 0.85 && !charOverLimit;

  // A story handed over by the dashboard's top-story card. The card names the
  // story it was showing when Generate Post was clicked, and this opens that
  // story's page, never the one the carousel moved to next. Generation is left
  // to the user from there, so preferences can be checked first. Fetched by id
  // rather than looked up in the feed, which may still be loading or may be in
  // another language. The route state is cleared at once, so a refresh or a
  // back-navigation lands on the feed rather than reopening the story.
  const location = useLocation();
  const topStory = location.state?.topStory;

  // Load the retrieval stack in the API while the user picks a story, so the
  // first generate is not the one that pays for it (see /posts/warm).
  useEffect(() => {
    if (currentUser?.id) warmGenerator().catch(() => {});
  }, [currentUser?.id]);

  // Each step into a story (feed -> preview -> generated) is its own history
  // entry, so the phone's back button steps back out of it - to the story, then
  // to the feed - instead of leaving the page. The view follows the entry.
  const [viewKey, setViewKey] = useState(location.key);
  if (viewKey !== location.key) {
    setViewKey(location.key);
    setView(location.state?.smView || 'feed');
  }

  function goView(next) {
    const here = window.history.state?.usr?.smView || 'feed';
    const steps = VIEW_DEPTH[next] - VIEW_DEPTH[here];
    if (steps > 0) navigate(location.pathname + location.search, { state: { smView: next } });
    else if (steps < 0) navigate(steps);
    setView(next);
  }

  // The page's one back control, one step up: the post goes back to its
  // story, the story to the news, and the news to Services. A plain history
  // step from the feed went to whatever came before it - after signing in,
  // that was the landing page.
  function goBack() {
    if (view === 'generated') goView('preview');
    else if (view === 'preview') goView('feed');
    else if (level !== null) { setLevel(null); setPage(1); }
    else navigate('/generate');
  }

  function openLevel(id) {
    setLevel(id);
    setPage(1);
    setNewsSection('party');
  }
  const handoffDone = useRef(false);

  useEffect(() => {
    if (handoffDone.current || !(topStory?.newsId || topStory?.storyId) || !currentUser?.id) return;
    handoffDone.current = true;
    // newsId is the database id (the dashboard's top story); storyId is the
    // story's own id, which is what the radio knows it by.
    const { newsId, storyId, section } = topStory;
    navigate(location.pathname, { replace: true, state: null });
    (newsId ? getNewsById(newsId) : getNewsByStoryId(storyId))
      .then((item) => {
        if (!item) return;
        const article = adaptNews(item);
        if (section) setNewsSection(section === 'general' ? 'party' : section);
        setSelectedArticle(article);
        setGeneratedPost('');
        setSelectedPostId(null);
        goView('preview');
      })
      .catch(() => {});
  }, [topStory, currentUser?.id]);

  // Escape closes the preferences sheet, like every other overlay here.
  useEffect(() => {
    if (!showMobilePrefs) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setShowMobilePrefs(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showMobilePrefs]);

  function handlePreview(article) {
    setArticleOpen(false);
    setSelectedArticle(article);
    setGeneratedPost('');
    setSelectedPostId(null);
    setRefinementNote('');
    setRefineHint('');
    setShareMsg('');
    applyVersionState(null);
    goView('preview');
  }

  async function handleGenerate() {
    if (!selectedArticle) return;
    setGenerating(true);
    setGenSeconds(0);
    setShareMsg('');
    goView('generated');
    const timer = setInterval(() => setGenSeconds((s) => s + 1), 1000);
    try {
      if (!selectedArticle._backendId || !currentUser?.id) {
        throw new Error('Missing news or user context for generation.');
      }
      // Save preferences to DB so "Preferences Set" count is accurate
      if (currentUser?.id && Object.keys(preferences).length > 0) {
        saveProfileAnswers(currentUser.id, preferences).catch(() => {});
      }
      const platformObj = PLATFORMS.find((p) => p.id === platform);
      const response = await generatePostForNews({
        userId: currentUser.id,
        newsId: selectedArticle._backendId,
        language: siteLang,
        profileOverrides: { ...preferences, target_platform: platformObj?.label ?? platform },
      });
      const content = response?.post?.content || '';
      if (!content.trim()) throw new Error('empty_content');
      // After the content check, not before: a response that came back empty
      // is a failure, and counting it would flatter the numbers.
      trackEvent('generate_post', { platform, language: siteLang });
      setGeneratedPost(content);
      setPostFailed(false);
      setSelectedPostId(response?.post?.id || null);
      setPostStatus('draft');
      setRefinementNote('');
      setRefineHint('');
      applyVersionState(response?.post);
      setTranslatedPost(response?.post?.translations?.[siteLang] || '');
      setShowTranslated(false);
    } catch (err) {
      console.error('Generate failed:', err);
      if (sendToOnboarding(err)) return;
      if (err?.response?.status === 429) {
        const detail = err.response.data?.detail;
        const msg = detail?.message ?? "You've reached your 5 posts/day limit. Come back tomorrow!";
        setGeneratedPost(msg);
        setPostFailed(true);
        // Refresh quota so the UI reflects the limit
        getDailyQuota().then(setQuota).catch(() => {});
      } else {
        // Show what the server actually said. It sends a reason on every
        // refusal — "no source material could be gathered", an invalid key,
        // an unavailable dependency — and replacing all of them with "try
        // again" cost two evenings of guessing at a failure that was
        // describing itself the whole time. Falls back to the generic line
        // only when there is genuinely nothing to show (a gateway error, a
        // dropped connection), where the status code is the only signal.
        const detail = err?.response?.data?.detail;
        const reason = typeof detail === 'string' ? detail : detail?.message;
        setGeneratedPost(
          reason
            || `Could not generate post right now. Please try again.${
              err?.response?.status ? ` (error ${err.response.status})` : ''
            }`,
        );
        setPostFailed(true);
      }
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
  }

  async function handleRegenerate() {
    if (!selectedArticle) return;
    // If there's no saved post ID (e.g. previous generation failed), do a fresh generate instead
    if (!selectedPostId) { handleGenerate(); return; }
    // The note is the whole basis of a refinement: it is what the user wants
    // different, and without it the request is identical to the generation it
    // came from. The server refuses a blank one, so stop here rather than
    // spending a round trip to be told.
    if (!refinementNote.trim()) { setRefineHint(t('gen.refineNeedsNote')); return; }
    if (refinedAt) { setRefineHint(t('gen.refineAlreadyUsed')); return; }
    setRefineHint('');
    setGeneratedPost('');
    setTranslatedPost('');
    setShowTranslated(false);
    setGenerating(true);
    setGenSeconds(0);
    const timer = setInterval(() => setGenSeconds((s) => s + 1), 1000);
    try {
      const response = await regeneratePostFromSnapshot(selectedPostId, {
        language: siteLang,
        profileOverrides: preferences,
        refinementNote,
      });
      const content = response?.post?.content || '';
      if (!content.trim()) throw new Error('empty_content');
      trackEvent('refine_post', { language: siteLang });
      setGeneratedPost(content);
      setPostFailed(false);
      setSelectedPostId(response?.post?.id || selectedPostId);
      setPostStatus('draft');
      setRefinementNote('');
      applyVersionState(response?.post);
      setTranslatedPost(response?.post?.translations?.[siteLang] || '');
      setShowTranslated(false);
    } catch (err) {
      console.error('Regenerate failed:', err);
      if (sendToOnboarding(err)) return;
      const detail = err?.response?.data?.detail;
      const reason = typeof detail === 'string' ? detail : detail?.message;
      setGeneratedPost(reason || t('gen.regenerateFailed'));
      setPostFailed(true);
      if (detail?.error === 'already_refined') setRefinedAt(new Date().toISOString());
    } finally {
      clearInterval(timer);
      setGenerating(false);
    }
  }

  // Switch between the refinement and the text it replaced. Both are kept
  // until the post is published, when whichever was not published is dropped.
  async function handleToggleVersion() {
    if (!selectedPostId || !hasOtherVersion || switchingVersion) return;
    setSwitchingVersion(true);
    try {
      const post = await togglePostVersion(selectedPostId);
      setGeneratedPost(post?.content || '');
      applyVersionState(post);
      // The other version has its own translation, so the one on screen no
      // longer belongs to the text being shown.
      setTranslatedPost(post?.translations?.[siteLang] || '');
      setShowTranslated(false);
    } catch (err) {
      console.error('Version switch failed:', err);
    } finally {
      setSwitchingVersion(false);
    }
  }

  function applyVersionState(post) {
    setRefinedAt(post?.refined_at || null);
    setHasOtherVersion(Boolean(post?.previous_content));
    setRefinedIsLive(post?.refined_is_live !== false);
  }

  async function handleTranslate() {
    if (!selectedPostId || translating) return;

    // Already translated in this session — just show it, no API call needed
    if (translatedPost) {
      setShowTranslated(true);
      return;
    }

    setTranslating(true);
    try {
      const result = await translatePost(selectedPostId, siteLang);
      setTranslatedPost(result.translated_content);
      setShowTranslated(true);
    } catch (err) {
      console.error('Translation failed:', err);
    } finally {
      setTranslating(false);
    }
  }

  async function handleCopyHashtags() {
    const activeContent = showTranslated && translatedPost ? translatedPost : generatedPost;
    const { hashtags } = parsePost(activeContent);
    if (!hashtags.length) return;
    try {
      await navigator.clipboard.writeText(hashtags.join(' '));
      setCopiedHashtags(true);
      setTimeout(() => setCopiedHashtags(false), 1600);
    } catch { /* ignore */ }
  }

  // "Post to …" goes straight to the platform, as on rssgpt: no sheet, no
  // connected account. What is on screen goes out, the translation when it is
  // showing. The tab is opened before the publish call, while the click still
  // counts as one, or the browser blocks it as a popup; it is pointed at the
  // platform once the post is marked published, and closed if that is refused
  // (the daily limit). Facebook lets no site fill in a post, so its text is copied.
  async function handlePublish() {
    if (!selectedPostId || sharing) return;
    const text = showTranslated && translatedPost ? translatedPost : generatedPost;
    const { url, copy, pasteBody } = shareTarget(platform, text);
    setShareMsg('');
    if (copy) {
      await navigator.clipboard?.writeText(typeof copy === 'string' ? copy : text).catch(() => {});
      setShareMsg(t(pasteBody ? 'gen.pasteBody' : 'gen.pasteIn', { platform: activePlatform.label }));
    }
    if (postStatus === 'published') {
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    const tab = url ? window.open('', '_blank') : null;
    if (tab) tab.opener = null;
    setSharing(true);
    try {
      await updatePost(selectedPostId, { status: 'published' });
      if (tab) tab.location.href = url;
      setPostStatus('published');
      // The quota and the streak moved, so the widgets that read them refresh.
      getDailyQuota().then(setQuota).catch(() => {});
    } catch (err) {
      tab?.close();
      const detail = err?.response?.data?.detail;
      setShareMsg((typeof detail === 'object' ? detail?.message : detail) || t('pub.failed'));
    } finally {
      setSharing(false);
    }
  }

  async function handleCopy() {
    try {
      const text = showTranslated && translatedPost ? translatedPost : generatedPost;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { setCopied(false); }
  }

  useEffect(() => {
    if (!phoneOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPhoneOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phoneOpen]);

  const authorName = currentUser?.full_name || currentUser?.username || 'AmbedkarGPT';
  // "Madhya Pradesh" as the reader says it, and a fallback before any state
  // story has arrived.
  function regionLabel(region) {
    const r = region || 'Madhya Pradesh';
    return lang === 'hi' ? ({ 'Madhya Pradesh': 'मध्य प्रदेश' }[r] ?? r) : r;
  }
  const welcomeLogo = partyLogo(currentUser?.political_party);
  const accountControls = (
    <div className="flex shrink-0 items-center gap-2 sm:gap-3">
      <LanguageSwitcher />
      <NotificationBell totalPosts={quota?.total_streak_posts ?? 0} />
      <ProfileMenu
        name={currentUser?.full_name || currentUser?.username || '—'}
        email={currentUser?.email ?? currentUser?.phone ?? ''}
        initial={(currentUser?.full_name || currentUser?.username || 'A')[0].toUpperCase()}
        party={currentUser?.political_party ?? ''}
        onLogout={async () => { await logout(); navigate('/', { replace: true }); }}
      />
    </div>
  );
  const welcomeName = (currentUser?.full_name || currentUser?.username || '').split(/[\s_]/)[0];
  const roleName = labelForId(currentUser?.party_position || '', currentUser?.political_party || '', lang);

  // Today's posts, at the top of a story: five slots, the count in words, the
  // streak, and how many are left in large type. It used to be a small grey
  // line beside the generate button, easy to miss until the limit was hit.
  function renderQuota() {
    if (!quota) return null;
    const limit = quota.daily_limit ?? 5;
    const used = Math.min(quota.daily_used ?? 0, limit);
    return (
      <div
        className="mb-5 flex items-center gap-4 rounded-2xl border px-4 py-3.5 sm:px-5 sm:py-4"
        style={{
          borderColor: atDailyLimit ? 'rgba(248,113,113,0.45)' : 'rgba(63,159,255,0.35)',
          background: atDailyLimit
            ? 'linear-gradient(100deg, rgba(60,14,20,0.55) 0%, rgba(14,19,32,0.9) 70%)'
            : 'linear-gradient(100deg, rgba(20,40,96,0.55) 0%, rgba(14,19,32,0.9) 70%)',
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-snug text-white sm:text-[16.5px]">
            {atDailyLimit ? t('gen.quota.allUsed', { limit }) : t('gen.quota.today', { used, limit })}
          </p>
          <div className="mt-2 flex items-center gap-1.5" aria-hidden="true">
            {Array.from({ length: limit }, (_, i) => (
              <span
                key={i}
                className="h-2 flex-1 rounded-full sm:max-w-[48px]"
                style={{ background: i < used ? (atDailyLimit ? '#f87171' : '#3f9fff') : 'rgba(63,159,255,0.14)' }}
              />
            ))}
          </div>
          {quota.streak_days > 0 && (
            <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-amber-400">
              <Flame size={14} strokeWidth={2.2} />
              {t('gen.quota.streak', { n: quota.streak_days })}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          {atDailyLimit ? (
            <>
              <p className="font-count text-[20px] font-bold leading-none tabular-nums text-red-400 sm:text-[24px]">
                {quotaCountdown}
              </p>
              <p className="mt-1 text-[12.5px] font-medium text-[#8b94b8]">{t('gen.quota.resets')}</p>
            </>
          ) : (
            <>
              <p className="font-count text-[30px] font-bold leading-none tabular-nums text-[#6aa8ff] sm:text-[34px]">
                {quota.daily_remaining ?? Math.max(0, limit - used)}
              </p>
              <p className="mt-1 text-[12.5px] font-medium text-[#8b94b8]">{t('gen.quota.left')}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // The party's banner: logo, name and what it stands for. It heads the feed,
  // the story and the post alike, so you always see whose voice you write in.
  function renderPartyBanner() {
    if (!activeParty) return null;
    const pt = PARTY_THEME[activeParty.slug] ?? DEFAULT_PARTY_THEME;
    const initials = partyShortLabel(activeParty, currentUser?.political_party, t, lang);
    const logo = partyLogo(currentUser?.political_party || activeParty.name);
    const tags = (PARTY_TAG_KEYS[activeParty.slug] ?? [])
      .map((k) => t(k))
      .filter((v) => v && !v.startsWith('ptag.'));
    return (
      <div
        className="mb-4 mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-4 rounded-2xl border px-5 py-4 sm:mt-6"
        style={{
          borderColor: `${pt.accent}3d`,
          background: `linear-gradient(100deg, #0e1320 0%, #0e1320 45%, ${pt.tint} 100%)`,
        }}
      >
        {/* The party's own logo, as the dashboard shows it, with
            the lettered tile behind it. A logo that is missing or
            fails to load hides itself and leaves the initials, so
            a party we have no artwork for still reads as itself
            rather than as a broken image. */}
        <span
          className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl font-display text-[20px] font-bold text-white"
          style={{
            background: `linear-gradient(150deg, ${pt.accent} 0%, ${pt.accent}b0 100%)`,
            boxShadow: `0 6px 20px ${pt.accent}55`,
          }}
        >
          {initials}
          {logo && (
            <img
              src={logo}
              alt={activeParty.name}
              className="absolute inset-0 h-full w-full bg-white object-contain p-1.5"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
        </span>

        {/* Sizes to its own text rather than filling the row. The
            "Change party" button used to hold the right-hand end,
            and without it a stretched block left the name marooned
            against a wide empty gap. It can still shrink, so a long
            name truncates rather than pushing the logo off. */}
        <div className="min-w-0">
          {/* Wraps on a phone, where truncating turned the party's
              name into "India…". Ellipsis only once there is a
              column to run out of. */}
          <h2 className="font-display text-[19px] font-bold leading-snug tracking-tight text-white sm:truncate sm:text-[21px]">
            {partyLabel(activeParty.name, lang)}
          </h2>
          {tags.length > 0 && (
            <p className="mt-0.5 text-[12.5px] leading-snug text-[#8b94b8] sm:truncate sm:text-[13px]">
              {tags.join('  ·  ')}
            </p>
          )}
        </div>

        {/* There was a "Change party" button here. The party is
            write-once, so it only ever led to a form that would
            refuse the change: an offer the product cannot keep. */}
      </div>
    );
  }


  return (
    <div
      className="ag-page-in relative flex min-h-screen text-[#e5e7eb]"
      style={{ background: 'radial-gradient(1200px 700px at 50% -10%, #0c111e 0%, #080b13 55%, #06080e 100%)' }}
    >
      {/* The dashboard's own navigation, closed to icons; it opens over the
          page on hover. Laptops only - phones keep their header. */}
      <Sidebar
        hoverExpand
        active="generate"
        onSelect={(id) => { if (id === 'dashboard') navigate('/dashboard'); }}
        onLogout={async () => { await logout(); navigate('/', { replace: true }); }}
      />

      {/* ambient glows */}
      <div className="pointer-events-none fixed left-[240px] top-0 h-[500px] w-[500px] rounded-full bg-[#3f9fff]/8 blur-[140px]" />
      <div className="pointer-events-none fixed bottom-0 right-[300px] h-[420px] w-[420px] rounded-full bg-[#7b5cff]/8 blur-[140px]" />

      {/* ── LEFT SIDEBAR ── */}
      <aside
        className="hidden lg:flex w-[240px] shrink-0 flex-col overflow-y-auto border-r border-[#1a2130]/70"
        style={{ background: 'linear-gradient(180deg,#0a0e18 0%,#080b13 100%)' }}
      >
        {/* Brand header */}
        <div className="border-b border-[#141d3a]/70 px-5 py-4">
          {/* Which tool you are in. This used to sit as a banner across the top
              of the feed, where it repeated the logo already shown here and ate
              a strip of vertical space above the stories. In the rail it still
              names the page, and the feed starts at the search bar. */}
          {/* The brand and the way to Services live in the dashboard sidebar
              beside this rail, so it starts with the tool's name. */}
          <div>
            <p className="font-display text-[16px] font-bold leading-snug text-white">
              {t('gen.title')}
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-[#6b78a0]">
              {t('gen.motto')}
              <span className="block text-[#5a6584]">{t('brand.attrib')}</span>
            </p>
            <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-[#3f9fff]/20 bg-[#3f9fff]/8 px-2.5 py-1 text-[10.5px] font-semibold text-[#6aa8ff]">
              <Sparkles size={9} strokeWidth={2} />
              {t('gen.aiPowered')}
            </span>
          </div>
        </div>

        {/* User profile card */}
        <div className="px-4 pt-4">
          <div className="rounded-2xl border border-[#1e2636]/80 bg-[#0e1320] px-5 py-5">
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#3f9fff] to-[#7b5cff] text-[22px] font-bold text-white shadow-[0_0_24px_rgba(63,159,255,0.35)]">
                  {(currentUser?.username?.[0] ?? '?').toUpperCase()}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-[#0e1320] bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
              </div>
              <p className="mt-3 font-display text-[16px] font-semibold text-white">{currentUser?.username ?? '—'}</p>
              <p className="mt-0.5 text-[11.5px] text-[#8b93a5]">{currentUser?.email ?? currentUser?.phone ?? ''}</p>
              <button
                type="button"
                onClick={() => navigate('/profile-setup')}
                className="mt-1.5 text-[11.5px] font-medium text-[#6aa8ff] transition hover:text-white"
              >
                {t('gen.customize')}
              </button>
            </div>
          </div>
        </div>

        {/* Target platform */}
        <div className="px-4 pt-5">
          <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#8b93a5]">{t('gen.targetPlatform')}</p>
          <div className="space-y-2">
            {PLATFORMS.map((p) => {
              const active = platform === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  className="flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-[13px] font-medium transition"
                  style={{
                    borderColor: active ? p.color : 'rgba(30,38,54,0.8)',
                    backgroundColor: active ? `${p.color}1f` : '#0e1320',
                    color: active ? '#ffffff' : '#8b93a5',
                  }}
                >
                  <span className="flex h-6 w-6 items-center justify-center text-[13px] font-bold" style={{ color: p.color }}>
                    {p.short}
                  </span>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Keeps the version line at the foot of the sidebar. */}
        <div className="flex-1" />

        <div className="px-6 py-5 text-[11px] font-count text-[#4e5a80] tracking-wide">
          v1.0 · AmbedkarGPT
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <div
        className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden border-x border-[#1a2130]/50"
        style={{ background: 'linear-gradient(180deg,#0a0e18 0%,#080b12 100%)' }}
      >

        {/* On a story or a post: back on the left, the account (language,
            notifications, profile, log out) on the right. The feed carries
            both in its welcome row instead. */}
        {view !== 'feed' && (
        <header className="dash-header flex h-14 shrink-0 items-center gap-3 px-4 sm:gap-4 sm:px-6 md:h-16 md:px-8">
          <button
            type="button"
            onClick={goBack}
            aria-label={t('common.back')}
            title={t('common.back')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#1e3260]/70 bg-[#0d1531]/60 px-3 py-2 text-[12px] font-medium text-[#8b94b8] transition hover:text-white"
          >
            <ArrowLeft size={12} strokeWidth={2} />
          </button>

          <span className="flex-1" />
          {accountControls}
        </header>
        )}

        {/* ── Feed view ── */}
        {view === 'feed' && (
          <div className="ag-page-in flex-1 overflow-y-auto px-4 pb-10 sm:px-6 md:px-8">
            {/* On a phone the back button and the account share the first
                line and the greeting gets the full width under them; from sm
                up it is one row. */}
            <div className="mb-5 mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-4 sm:mb-7 sm:mt-5 sm:flex-nowrap sm:gap-5">
              <button
                type="button"
                onClick={goBack}
                aria-label={t('common.back')}
                title={t('common.back')}
                className="order-1 inline-flex items-center gap-1.5 rounded-full border border-[#1e3260]/70 bg-[#0d1531]/60 px-3 py-2 text-[12px] font-medium text-[#8b94b8] transition hover:text-white"
              >
                <ArrowLeft size={12} strokeWidth={2} />
              </button>
              {welcomeLogo && (
                <span
                  className="relative order-4 inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center self-start rounded-full bg-white shadow-[0_0_0_2px_rgba(63,159,255,0.45),0_0_24px_rgba(63,159,255,0.28)] sm:order-2 sm:ml-2 sm:h-[76px] sm:w-[76px] sm:self-center"
                  title={currentUser?.political_party || ''}
                >
                  <img
                    src={welcomeLogo}
                    alt={currentUser?.political_party || 'Party'}
                    className="h-[46px] w-[46px] object-contain sm:h-[70px] sm:w-[70px]"
                    onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                  />
                  <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#070b1c] bg-[#22c55e] sm:bottom-0.5 sm:right-0.5 sm:h-4 sm:w-4" />
                </span>
              )}
              <div className="order-5 min-w-0 flex-1 sm:order-3">
                {/* Phones: "Welcome back," is a small line above the name, so
                    the name never breaks mid-greeting beside the logo. Sized
                    in em: the Hindi type scale in index.css rewrites px tokens
                    such as text-[13.5px] with a rule that beats sm:, which kept
                    the greeting small on desktop in Hindi. */}
                <h1 className="font-display text-[24px] font-bold leading-tight tracking-tight sm:text-[28px] md:text-[32px]">
                  <span className="block text-[0.5625em] font-medium tracking-normal text-[#8b94b8] sm:inline sm:text-[1em] sm:font-bold sm:tracking-tight sm:text-white">{t('dash.welcomeBack')} </span>
                  <span className="gradient-text-blue">{welcomeName}</span>
                </h1>
                {(activeParty || roleName) && (
                  <p className="mt-1.5 flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] font-medium leading-snug text-[#9fb0d4] sm:mt-2 sm:inline-flex sm:gap-x-2 sm:rounded-full sm:border sm:border-[#2a4a8a]/60 sm:bg-[#0d1838]/80 sm:px-3 sm:py-1 sm:text-[#c7d6ee]">
                    {activeParty && <span className="sm:truncate">{partyLabel(activeParty.name, lang)}</span>}
                    {activeParty && roleName && <span className="text-[#4f7fd4]" aria-hidden="true">·</span>}
                    {roleName && <span className="font-semibold text-white">{roleName}</span>}
                  </p>
                )}
              </div>
              <div className="order-2 ml-auto sm:order-4 sm:self-start">{accountControls}</div>
              <span className="order-3 basis-full sm:hidden" aria-hidden="true" />
            </div>
            {level === null ? (
              <>
                <NewsCarousel
                  title={t('gen.levels.national')}
                  subtitle={t('gen.levels.nationalSub')}
                  accent="#3f9fff"
                  items={byNewest(nationalArticles.filter((a) => a.tenantSlug !== 'general'))}
                  loading={newsLoading}
                  onOpen={handlePreview}
                  onViewAll={() => openLevel('national')}
                  accentFor={levelCardAccent}
                  dateLabel={formatNewsDate}
                />
                <NewsCarousel
                  title={t('gen.levels.state', { region: regionLabel(stateArticles[0]?.region) })}
                  subtitle={t('gen.levels.stateSub')}
                  accent="#f0a63a"
                  items={byNewest(stateArticles)}
                  loading={stateLoading}
                  onOpen={handlePreview}
                  onViewAll={() => openLevel('state')}
                  accentFor={levelCardAccent}
                  dateLabel={formatNewsDate}
                  emptyText={t('gen.levels.stateEmpty')}
                />
                <NewsCarousel title={t('gen.levels.city')} subtitle={t('gen.levels.citySub')} accent="#22c55e" comingSoon />
                <NewsCarousel title={t('gen.levels.social')} subtitle={t('gen.levels.socialSub')} accent="#a78bfa" comingSoon />
              </>
            ) : (
            <>
            {/* Inside a level: the way back to the overview, then the feed as it was. */}
            <button
              type="button"
              onClick={() => { setLevel(null); setPage(1); }}
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#1e3260]/70 bg-[#0d1531]/70 px-4 py-2 text-[14px] font-semibold text-[#c7d1eb] transition hover:border-[#3f9fff]/60 hover:text-white"
            >
              <ArrowLeft size={15} strokeWidth={2.2} />
              {t('gen.levels.allLevels')}
              <span className="text-[#6b7a9e]">·</span>
              <span className="text-white">
                {level === 'state'
                  ? t('gen.levels.state', { region: regionLabel(stateArticles[0]?.region) })
                  : t('gen.levels.national')}
              </span>
            </button>
            {/* Three news sections: chosen party, opposition (BJP, empty
                until it is scraped), and general (neutral) news. Underlined
                tabs rather than pills, and each section carries its own
                accent so it is obvious which feed you are reading. */}
            {activeParty && (
              <>
              {/* Party banner. The name used to be the first tab's label,
                  which made three tabs read as one proper noun beside two
                  categories, and a long name pushed the other two off a narrow
                  screen. It gets its own band here, in the party's colour, so
                  the tabs below are three comparable things. */}
              {/* Section chooser. Cards rather than a tab strip: each one
                  now carries a count and a line saying what is in it, which a
                  tab has no room for, and the three read as siblings. */}
              {/* Phones: one scrolling row of chips. Three stacked cards with
                  a description each pushed the headlines most of a screen
                  down, and on a phone the description is not what picks the
                  feed — the name and the count are. */}
              <div role="group" aria-label={t('gen.newsSections')} className="mb-5 grid grid-cols-2 gap-1 rounded-2xl border border-[#1e2636]/90 bg-[#0b101c] p-1 sm:hidden">
                {sectionTabs.map((s) => {
                  const active = newsSection === s.id;
                  const tint = SECTION_THEME[s.id].accent;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => chooseSection(s.id)}
                      aria-pressed={active}
                      aria-label={`${s.label} (${s.count})`}
                      className="flex h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[13.5px] leading-tight transition"
                      style={{
                        backgroundColor: active ? `${tint}1f` : 'transparent',
                        boxShadow: active ? `inset 0 0 0 1px ${tint}` : 'none',
                        color: active ? '#ffffff' : '#8b94b8',
                        fontWeight: active ? 600 : 500,
                      }}
                    >
                      <span className="truncate">{s.label}</span>
                      <span
                        className="font-count text-[11.5px] font-semibold leading-none"
                        style={{ color: active ? tint : '#5a6e9a' }}
                      >
                        {s.count}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="mb-6 hidden gap-3 sm:grid sm:grid-cols-2">
                {sectionTabs.map((s) => {
                  const active = newsSection === s.id;
                  const tint = SECTION_THEME[s.id].accent;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => chooseSection(s.id)}
                      aria-pressed={active}
                      className="flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition duration-150"
                      style={{
                        borderColor: active ? tint : 'rgba(30,38,54,0.9)',
                        backgroundColor: active ? `${tint}12` : '#0b101c',
                        boxShadow: active ? `0 0 0 1px ${tint}, 0 8px 24px ${tint}22` : 'none',
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = 'rgba(58,107,196,0.5)'; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = 'rgba(30,38,54,0.9)'; }}
                    >
                      <span
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition"
                        style={{
                          backgroundColor: active ? `${tint}22` : 'rgba(30,38,54,0.75)',
                          color: active ? tint : '#6b78a0',
                        }}
                      >
                        <s.Icon size={16} strokeWidth={2} />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className="truncate text-[14px] font-semibold"
                            style={{ color: active ? '#ffffff' : '#c0cde8' }}
                          >
                            {s.label}
                          </span>
                          <span
                            className="shrink-0 rounded-md px-1.5 py-0.5 font-count text-[11px] leading-none"
                            style={{
                              backgroundColor: active ? `${tint}26` : 'rgba(30,38,54,0.9)',
                              color: active ? tint : '#5a6e9a',
                            }}
                          >
                            {s.count}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-[12px] text-[#6b78a0]">
                          {s.sub}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              </>
            )}


            {newsLoading && (
              <>
                {/* A spinner above the grid, because six empty rectangles
                    pulsing at low contrast read as a broken page rather than
                    a loading one — especially on the first visit, when there
                    is no remembered content to compare them against. */}
                <div className="flex justify-center py-6">
                  <Spinner size={30} label="Loading news…" showLabel />
                </div>
                <div className="grid gap-5 lg:grid-cols-2" aria-hidden="true">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-[240px] w-full animate-pulse rounded-2xl border border-[#1e2636]/60 bg-[#0e1320]/70 p-5"
                    >
                      {/* Card-shaped, so the wait previews what arrives
                          instead of showing a blank box. */}
                      <div className="h-3 w-24 rounded bg-[#1b2340]/70" />
                      <div className="mt-4 h-4 w-4/5 rounded bg-[#1b2340]/80" />
                      <div className="mt-2.5 h-4 w-3/5 rounded bg-[#1b2340]/60" />
                      <div className="mt-6 space-y-2">
                        <div className="h-2.5 w-full rounded bg-[#161d33]/80" />
                        <div className="h-2.5 w-11/12 rounded bg-[#161d33]/70" />
                        <div className="h-2.5 w-9/12 rounded bg-[#161d33]/60" />
                      </div>
                      <div className="mt-6 h-8 w-28 rounded-lg bg-[#1b2340]/70" />
                    </div>
                  ))}
                </div>
              </>
            )}
            {!newsLoading && newsError && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-10 text-center">
                <p className="text-[13px] text-red-400">{t('gen.failedToLoad')}</p>
                <button
                  type="button"
                  onClick={loadNews}
                  className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-[12px] font-medium text-red-400 transition hover:bg-red-500/20"
                >
                  {t('gen.retry')}
                </button>
              </div>
            )}
            {!newsLoading && !newsError && filteredArticles.length === 0 && newsSection === 'opposition' && (
              // Distinct from the generic empty state below: there is no
              // filter to change here, the scrape just does not exist yet.
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <p className="text-[14px] font-medium" style={{ color: SECTION_THEME.opposition.accent }}>
                  {t('gen.oppositionComingSoon')}
                </p>
                <p className="text-[12px] text-[#4a5a80]">{t('gen.oppositionComingSoonSub')}</p>
              </div>
            )}
            {!newsLoading && !newsError && filteredArticles.length === 0 && newsSection !== 'opposition' && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <p className="text-[14px] font-medium text-[#6aa8ff]">{t('gen.noArticlesFound')}</p>
                <p className="text-[12px] text-[#4a5a80]">{t('gen.tryDifferent')}</p>
              </div>
            )}
            {!newsLoading && !newsError && filteredArticles.length > 0 && (
              <>
              {/* Section heading for the cards, with the feed's own controls.
                  Left-aligned rather than centred: the count, the ordering and
                  the layout switch belong on the same line as the title, and a
                  centred title leaves nowhere for them to sit. The accent bar
                  sits above the title, which is what a left-aligned block
                  wants. */}
              <div className="mb-4 mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-3.5 sm:mb-6">
                <div className="min-w-0">
                  <span
                    className="mb-2.5 block h-[3px] w-12 rounded-full sm:mb-3 sm:w-14"
                    style={{ backgroundColor: theme.accent, boxShadow: `0 0 12px ${theme.accent}88` }}
                  />
                  <h3 className="font-display text-[24px] font-bold leading-tight tracking-tight text-white sm:text-[30px] md:text-[34px]">
                    {t('gen.headlines')}
                  </h3>
                  <p className="mt-1 text-[13.5px] text-[#7d8aa6] sm:mt-1.5 sm:text-[14px]">
                    {t('gen.pickStory')}
                  </p>
                </div>

                {/* Phones: the count and the layout switch share the first
                    line, and filter / type / sort split the second evenly, so
                    nothing wraps into a stray half-row with loose dividers. */}
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-x-3 sm:gap-y-2.5">
                  {/* Counts the whole filtered feed, not the current page: it
                      answers "how much is here", which paging should not change. */}
                  <span className="order-1 whitespace-nowrap font-count text-[13px] text-[#7d8aa6]">
                    <span className="font-semibold text-white">{orderedArticles.length}</span>{' '}
                    {t(orderedArticles.length === 1 ? 'gen.storyOne' : 'gen.storyMany')}
                  </span>

                  <span className="order-1 hidden h-5 w-px bg-[#1e2636] sm:block" />
                  <span className="order-3 basis-full sm:hidden" aria-hidden="true" />

                  {/* Date filter. It sat in the page header beside a search
                      box; it belongs with the feed it filters. */}
                    <div ref={filterRef} className="relative order-4 min-w-0 flex-1 sm:order-1 sm:flex-none">
                      <button
                        type="button"
                        onClick={() => { setFilterOpen((p) => !p); goView('feed'); }}
                        className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border px-3 text-[12.5px] font-medium transition sm:h-auto sm:w-auto sm:px-4 sm:py-2.5 ${
                          filtersActive
                            ? 'border-[#3f9fff]/60 bg-[#0d1a3a] text-[#6aa8ff]'
                            : 'border-[#1e3260]/70 bg-[#0d1531]/80 text-[#8b94b8] hover:border-[#3a6bc4]/60 hover:text-white'
                        }`}
                      >
                        <Filter size={13} strokeWidth={2} className="shrink-0" />
                        <span className="truncate">{selectedDayLabel ?? (
                          <>
                            <span className="sm:hidden">{t('gen.filterShort')}</span>
                            <span className="hidden sm:inline">{t('gen.filterNewsBtn')}</span>
                          </>
                        )}</span>
                        {filtersActive > 0 && (
                          <span className="rounded-full bg-[#3f9fff] px-1.5 py-0.5 font-count text-[10px] leading-none text-white">
                            {filtersActive}
                          </span>
                        )}
                      </button>

                      {filterOpen && (
                        <div className="absolute left-0 top-[calc(100%+6px)] z-40 w-64 max-w-[calc(100vw-2rem)] sm:left-auto sm:right-0 overflow-hidden rounded-xl border border-[#1e3260]/70 bg-[#0d1531] shadow-xl">
                          {/* Date */}
                          <p className="px-4 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#5a6e9a]">
                            {t('gen.date')}
                          </p>
                          {DATE_RANGES.map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              onClick={() => { setDateFilter(d.id); setPage(1); goView('feed'); }}
                              className={`flex w-full items-center justify-between px-4 py-2 text-[12.5px] transition hover:bg-[#0f1a3a] ${
                                d.id === dateFilter ? 'text-[#3f9fff]' : 'text-white/80'
                              }`}
                            >
                              {d.label}
                              {d.id === dateFilter && <span className="h-1.5 w-1.5 rounded-full bg-[#3f9fff]" />}
                            </button>
                          ))}

                          {availableDays.length > 0 && (
                            <>
                              <p className="mt-1 border-t border-[#1e3260]/60 px-4 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#5a6e9a]">
                                {t('gen.pickADay')}
                              </p>
                              <div className="max-h-52 overflow-y-auto">
                                {availableDays.map((d) => {
                                  const id = `${DAY_PREFIX}${d.key}`;
                                  const selected = id === dateFilter;
                                  return (
                                    <button
                                      key={id}
                                      type="button"
                                      onClick={() => { setDateFilter(id); setPage(1); goView('feed'); }}
                                      className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-[12.5px] transition hover:bg-[#0f1a3a] ${
                                        selected ? 'text-[#3f9fff]' : 'text-white/80'
                                      }`}
                                    >
                                      <span className="truncate">{d.label}</span>
                                      <span className="flex shrink-0 items-center gap-2">
                                        <span className="font-count text-[11px] text-[#5a6e9a]">{d.count}</span>
                                        {selected && <span className="h-1.5 w-1.5 rounded-full bg-[#3f9fff]" />}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}

                          {filtersActive > 0 && (
                            <button
                              type="button"
                              onClick={() => { setDateFilter('all'); setTypeFilter('all'); setActiveFilter('All'); setPage(1); }}
                              className="w-full border-t border-[#1e3260]/60 px-4 py-2.5 text-left text-[12px] text-[#8b94b8] transition hover:bg-[#0f1a3a] hover:text-white"
                            >
                              {t('gen.clearFilters')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                  {/* Content type. General and Opposition are scraped from the
                      videos tab alone, so every item in them is one type and a
                      chooser over one option is furniture: it is left out for
                      those sections rather than shown with nothing to pick. */}
                  {newsSection === 'party' && (
                    <div ref={typeRef} className="relative order-4 min-w-0 flex-1 sm:order-1 sm:flex-none">
                      <button
                        type="button"
                        onClick={() => setTypeOpen((p) => !p)}
                        aria-expanded={typeOpen}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[#1e3260]/70 bg-[#0d1531]/80 px-3 text-[12.5px] sm:h-auto sm:w-auto sm:px-4 sm:py-2 font-medium text-[#a3b0d4] transition hover:border-[#3a6bc4]/60 hover:text-white"
                      >
                        {typeFilter === 'press_conference'
                          ? <Radio size={13} strokeWidth={2} />
                          : <FileText size={13} strokeWidth={2} />}
                        <span className="truncate">{t(TYPE_OPTIONS.find((o) => o.id === typeFilter)?.label ?? 'gen.all')}</span>
                        <ChevronDown size={13} strokeWidth={2} className="hidden shrink-0 text-[#6b78a0] sm:block" />
                      </button>
                      {typeOpen && (
                        <div className="absolute left-1/2 top-[calc(100%+6px)] z-40 w-56 -translate-x-1/2 overflow-hidden sm:left-auto sm:right-0 sm:translate-x-0 rounded-xl border border-[#1e3260]/70 bg-[#0d1531] shadow-xl">
                          {TYPE_OPTIONS.map((o) => {
                            const on = typeFilter === o.id;
                            const count = o.id === 'all'
                              ? sectionArticles.length
                              : sectionArticles.filter((a) => a.contentType === o.id).length;
                            return (
                              <button
                                key={o.id}
                                type="button"
                                onClick={() => {
                                  setTypeFilter(o.id);
                                  setTypeOpen(false);
                                  setPage(1);
                                  goView('feed');
                                }}
                                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[12.5px] transition hover:bg-[#0f1a3a] ${
                                  on ? 'text-[#3f9fff]' : 'text-white/80'
                                }`}
                              >
                                <span className="truncate">{t(o.label)}</span>
                                <span className="shrink-0 font-count text-[11px] text-[#5a6e9a]">{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {newsSection === 'party' && <span className="order-1 hidden h-5 w-px bg-[#1e2636] sm:block" />}

                  {/* Sort */}
                  <div ref={sortRef} className="relative order-4 min-w-0 flex-1 sm:order-1 sm:flex-none">
                    <button
                      type="button"
                      onClick={() => setSortOpen((p) => !p)}
                      aria-expanded={sortOpen}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full border border-[#1e3260]/70 bg-[#0d1531]/80 px-3 text-[12.5px] sm:h-auto sm:w-auto sm:px-4 sm:py-2 font-medium text-[#a3b0d4] transition hover:border-[#3a6bc4]/60 hover:text-white"
                    >
                      <ArrowUpDown size={13} strokeWidth={2} className="shrink-0" />
                      <span className="truncate sm:hidden">{t(sortOrder === 'oldest' ? 'gen.sortShortOldest' : 'gen.sortShortLatest')}</span>
                      <span className="hidden truncate sm:inline">{t(sortOrder === 'oldest' ? 'gen.oldestFirst' : 'gen.latestFirst')}</span>
                      <ChevronDown size={13} strokeWidth={2} className="hidden shrink-0 text-[#6b78a0] sm:block" />
                    </button>
                    {sortOpen && (
                      <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-44 overflow-hidden rounded-xl border border-[#1e3260]/70 bg-[#0d1531] shadow-xl">
                        {['latest', 'oldest'].map((id) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              setSortOrder(id);
                              writeLocal(SORT_KEY, id);
                              setSortOpen(false);
                              setPage(1);
                            }}
                            className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[12.5px] transition hover:bg-[#0f1a3a] ${
                              sortOrder === id ? 'text-[#3f9fff]' : 'text-white/80'
                            }`}
                          >
                            {t(id === 'oldest' ? 'gen.oldestFirst' : 'gen.latestFirst')}
                            {sortOrder === id && <span className="h-1.5 w-1.5 rounded-full bg-[#3f9fff]" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Layout */}
                  <div className="order-2 ml-auto flex items-center gap-1 rounded-xl border border-[#1e3260]/70 bg-[#0d1531]/80 p-1 sm:order-1 sm:ml-0">
                    {[
                      { id: 'list', Icon: List,       label: 'gen.viewList' },
                      { id: 'grid', Icon: LayoutGrid, label: 'gen.viewGrid' },
                    ].map(({ id, Icon, label }) => {
                      const on = cardView === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => { setCardView(id); writeLocal(VIEW_KEY, id); }}
                          aria-label={t(label)}
                          title={t(label)}
                          aria-pressed={on}
                          className="flex h-8 w-9 items-center justify-center rounded-lg transition"
                          style={{
                            backgroundColor: on ? 'rgba(63,159,255,0.14)' : 'transparent',
                            color: on ? '#6aa8ff' : '#6b78a0',
                            boxShadow: on ? 'inset 0 0 0 1px rgba(63,159,255,0.45)' : 'none',
                          }}
                        >
                          <Icon size={15} strokeWidth={2} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {pagedGroups.map((group, gi) => (
                <div key={`${feedKey}|${group.label}`} className="mb-7 last:mb-0">
                  {/* Day heading */}
                  <div className="mb-3 flex items-center gap-3">
                    <h4 className="font-count text-[11.5px] font-semibold uppercase tracking-[0.2em] text-[#8a9ac0]">
                      {group.label}
                    </h4>
                    <span className="font-count text-[11px] text-[#5a6e9a]">{group.items.length}</span>
                    <span className="h-px flex-1 bg-[#1e2636]/80" />
                  </div>

                  <div className={cardView === 'list' ? 'flex flex-col gap-3' : 'grid gap-3.5 sm:gap-5 lg:grid-cols-2'}>
                {group.items.map((article, ai) => {
                  const dateLabel = formatNewsDate(article.date);
                  // Where the card sits in the page, for the rise stagger.
                  const riseIndex = pagedGroups.slice(0, gi).reduce((n, g) => n + g.items.length, 0) + ai;
                  // Colour follows the article's own tenant, so a mixed list
                  // still reads correctly rather than following the active tab.
                  const cardAccent = article.tenantSlug === 'general'
                    ? SECTION_THEME.general.accent
                    : SECTION_THEME.party.accent;
                  return (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => handlePreview(article)}
                      className={`ag-rise ag-card group flex flex-col overflow-hidden rounded-2xl border text-left hover:bg-[#111726] ${
                        cardView === 'list' ? 'px-4 py-3.5 sm:px-5 sm:py-4' : 'p-4 sm:p-6'
                      }`}
                      style={{
                        borderColor: 'rgba(30,38,54,0.8)',
                        backgroundColor: '#0e1320',
                        // Accent rail marks which feed the card belongs to
                        borderLeft: `3px solid ${cardAccent}`,
                        '--i': riseIndex,
                        '--cat': cardAccent,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${cardAccent}70`; e.currentTarget.style.borderLeftColor = cardAccent; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(30,38,54,0.8)'; e.currentTarget.style.borderLeftColor = cardAccent; }}
                    >
                      {/* Header row: NEWS ARTICLE label · category tag.
                          Wraps: "Bharatiya Janata Party" beside the type and
                          the category is wider than a phone card, and clipping
                          a party's name to "BHARATIYA JANATA PA…" is worse
                          than giving it a second line. */}
                      <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2 sm:mb-3 sm:gap-x-3">
                        <span
                          className={`inline-flex items-center gap-1.5 font-count text-[11px] font-semibold uppercase ${lang === 'hi' ? 'tracking-normal text-[12px]' : 'tracking-[0.12em] sm:tracking-[0.18em]'}`}
                          style={{ color: (CONTENT_TYPES[article.contentType] ?? CONTENT_TYPES.news).color }}
                        >
                          {article.contentType === 'press_conference'
                            ? <Radio size={12} strokeWidth={2} />
                            : <FileText size={12} strokeWidth={2} />}
                          {article.contentType === 'press_conference'
                            ? t('gen.pressConference')
                            : t('gen.newsArticle')}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] sm:px-3 sm:py-1 ${/[\u0900-\u097F]/.test(article.category) ? 'font-hindi' : 'font-count uppercase tracking-wider text-[11px]'}`}
                          style={{
                            borderColor: `${cardAccent}55`,
                            backgroundColor: `${cardAccent}14`,
                            color: cardAccent,
                          }}
                        >
                          {article.category}
                        </span>
                        <DevSourceTag source={article.source} />
                      </div>

                      <p className={`font-hindi font-bold leading-[1.6] pt-0.5 text-white ${
                        cardView === 'list'
                          ? 'line-clamp-2 text-[clamp(15.5px,1.1vw+11px,19px)]'
                          : 'line-clamp-3 text-[clamp(16px,1.2vw+11px,21px)]'
                      }`}>
                        {article.title}
                      </p>
                      {/* The summary is what makes a card tall. In a single
                          column that height is the whole cost of scanning the
                          feed, so the list keeps one line of it and the grid,
                          which has two columns to fill, keeps three. */}
                      <p className={`font-hindi mt-2 flex-1 leading-[1.65] text-[#b9c8e4] ${
                        cardView === 'list'
                          ? 'line-clamp-1 text-[clamp(13px,0.7vw+10.3px,15px)]'
                          : 'line-clamp-2 text-[clamp(13.5px,0.9vw+10px,16.5px)] sm:mt-3 sm:line-clamp-3'
                      }`}>
                        {truncateText(article.summary || article.content, cardView === 'list' ? 120 : 200)}
                      </p>

                      {/* Footer — short by {source} · date */}
                      <div className={`flex items-center justify-between gap-2 border-t border-[#141d3a]/70 ${
                        cardView === 'list' ? 'mt-2.5 pt-2.5' : 'mt-3 pt-2.5 sm:mt-4 sm:pt-3'
                      }`}>
                        <span className="min-w-0 truncate font-count text-[11.5px] text-[#5a6e9a]">
                          {dateLabel || 'AmbedkarGPT'}
                        </span>
                        <span
                          className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-semibold transition group-hover:gap-1.5"
                          style={{ color: cardAccent }}
                        >
                          <Sparkles size={12} strokeWidth={2} />
                          {t('gen.generate')}
                          <ArrowRight size={12} strokeWidth={2.2} className="ag-arrow" />
                        </span>
                      </div>
                    </button>
                  );
                })}
                  </div>
                </div>
              ))}

              {/* ── Pagination ── */}
              {totalPages > 1 && (
                <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1e2636]/80 bg-[#0e1320] px-3 text-[12.5px] font-medium text-[#8a9ac0] transition hover:border-[#3f9fff]/45 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronDown size={13} strokeWidth={2} className="rotate-90" />
                    {t('gen.prev')}
                  </button>

                  {getPageItems(currentPage, totalPages).map((item, i) =>
                    item === '…' ? (
                      <span key={`gap-${i}`} className="px-1.5 text-[13px] text-[#4a5a80]">…</span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setPage(item)}
                        aria-current={item === currentPage ? 'page' : undefined}
                        className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 font-count text-[12.5px] font-semibold transition"
                        style={{
                          borderColor: item === currentPage ? '#3f9fff' : 'rgba(30,38,54,0.8)',
                          backgroundColor: item === currentPage ? 'rgba(63,159,255,0.14)' : '#0e1320',
                          color: item === currentPage ? '#6aa8ff' : '#8a9ac0',
                        }}
                      >
                        {item}
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1e2636]/80 bg-[#0e1320] px-3 text-[12.5px] font-medium text-[#8a9ac0] transition hover:border-[#3f9fff]/45 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t('gen.next')}
                    <ChevronDown size={13} strokeWidth={2} className="-rotate-90" />
                  </button>
                </div>
              )}
              </>
            )}
            </>
            )}
          </div>
        )}

        {/* ── Preview view ── */}
        {view === 'preview' && selectedArticle && (() => {
          const hasSecondPara = Boolean(
            selectedArticle.summary
            && selectedArticle.content
            && selectedArticle.content !== selectedArticle.summary
          );
          // Whether opening the article would actually show anything more. A
          // five-line preview covers a short summary entirely, and a toggle
          // that reveals nothing is worse than no toggle at all.
          const articleHasMore = hasSecondPara || (selectedArticle.summary || '').length > 200;
          const words = `${selectedArticle.summary || ''} ${hasSecondPara ? selectedArticle.content : ''}`
            .trim().split(/[\s।]+/).filter(Boolean).length;
          const readingMinutes = Math.max(1, Math.round(words / 200));
          return (
          <div className="ag-page-in flex-1 overflow-y-auto px-4 pb-10 sm:px-6 md:px-8">
            {renderPartyBanner()}
            {renderQuota()}
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-block rounded-full border border-[#1e3a6e]/60 bg-[#0d1840]/60 px-2.5 py-0.5 font-count text-[10px] uppercase tracking-widest text-[#6aa8ff]">
                {selectedArticle.category}
              </span>
              <DevSourceTag source={selectedArticle.source} />
            </div>

            <div className="rounded-2xl border border-[#1e3260]/60 bg-[#0a1130]/70 p-5 sm:p-7 md:p-8">
              <h2 className="font-hindi text-[clamp(22px,5.9vw,26px)] font-bold leading-[1.45] pt-0.5 text-white sm:leading-[1.55] md:text-[28px]">
                {selectedArticle.title}
              </h2>
              {/* Prefer the fuller summary over the one-line description, and keep
                  Devanagari at a larger size — it needs more height than Latin
                  to stay legible. */}
              <p className={`font-hindi mt-5 text-[17.5px] leading-[1.85] text-[#e6eefb] sm:text-[19px] sm:leading-[2] md:text-[21px] ${
                articleOpen ? '' : 'line-clamp-5 lg:line-clamp-none'
              }`}>
                {selectedArticle.summary || selectedArticle.content}
              </p>
              {hasSecondPara && (
                <p className={`font-hindi mt-5 border-t border-[#1e3260]/50 pt-5 text-[17px] leading-[1.95] text-[#c3d3ee] md:text-[18px] ${
                  articleOpen ? '' : 'hidden lg:block'
                }`}>
                  {selectedArticle.content}
                </p>
              )}

              {/* Phones only: the whole story is a tap away, and generating a
                  post never required reading it first. */}
              {articleHasMore && (
                <button
                  type="button"
                  onClick={() => setArticleOpen((o) => !o)}
                  aria-expanded={articleOpen}
                  className="mt-4 inline-flex h-9 items-center gap-1.5 text-[13.5px] font-semibold text-[#6aa8ff] transition hover:text-white lg:hidden"
                >
                  {t(articleOpen ? 'gen.showLess' : 'gen.readFull')}
                  <ChevronDown size={14} strokeWidth={2.2} className={`transition-transform duration-200 ${articleOpen ? 'rotate-180' : ''}`} />
                </button>
              )}

              {/* Date · kind · how long it takes to read. */}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#1e3260]/50 pt-4 text-[12.5px] text-[#7d89ad]">
                {formatNewsDate(selectedArticle.date) && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays size={13} strokeWidth={2} />
                    {formatNewsDate(selectedArticle.date)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <FileText size={13} strokeWidth={2} />
                  {t(selectedArticle.contentType === 'press_conference' ? 'gen.pressConference' : 'gen.newsArticle')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={13} strokeWidth={2} />
                  {t('gen.minRead', { n: readingMinutes })}
                </span>
              </div>
            </div>

            {/* Platform selector */}
            <div className="mt-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-[#6aa8ff]">{t('gen.platform')}</p>
              <div className="grid grid-cols-4 gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatform(p.id)}
                    className="flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border py-2.5 text-center transition sm:gap-1"
                    style={{
                      borderColor: platform === p.id ? p.color : 'rgba(30,50,100,0.5)',
                      backgroundColor: platform === p.id ? `${p.color}18` : 'rgba(10,17,48,0.6)',
                    }}
                  >
                    <span className="font-bold text-[13px]" style={{ color: platform === p.id ? p.color : '#5a6e9a' }}>
                      {p.short}
                    </span>
                    <span className="text-[9.5px] font-medium" style={{ color: platform === p.id ? p.color : '#3d4e70' }}>
                      {p.limit.toLocaleString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Mobile preferences (right panel is hidden on mobile) ── */}
            {PREFERENCES_ENABLED && (
            <div className="mt-4 lg:hidden">
              <button
                type="button"
                onClick={() => setShowMobilePrefs((p) => !p)}
                className="flex w-full items-center justify-between rounded-xl border border-[#1e3260]/60 bg-[#0a1130]/60 px-4 py-3 text-left transition hover:border-[#3f9fff]/40"
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={13} strokeWidth={2} className="text-[#6aa8ff]" />
                  <span className="text-[13px] font-semibold text-white">{t('gen.postPreferences')}</span>
                  <span className="text-[11px] text-[#6b78a0]">{t('gen.tuneVoice')}</span>
                </div>
                <ChevronRight size={14} strokeWidth={2} className="shrink-0 text-[#6b78a0]" />
              </button>
            </div>
            )}

            {/* The preferences arrive as a sheet from the bottom rather than
                pushing the rest of the page down: they are a detour from the
                story, not part of reading it. */}
            {PREFERENCES_ENABLED && showMobilePrefs && prefQuestions.length > 0 && (
              <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={t('gen.postPreferences')}>
                <div
                  className="dash-backdrop absolute inset-0 bg-[#03060f]/78 backdrop-blur-[3px]"
                  onClick={() => setShowMobilePrefs(false)}
                />
                <div className="sheet-up absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-[#1e3260]/70 bg-[#07101f] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
                  <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-[#2a3a66]" aria-hidden="true" />
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[15px] font-semibold text-white">
                        <Sparkles size={15} strokeWidth={2} className="text-[#6aa8ff]" />
                        {t('gen.postPreferences')}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-[#7d89ad]">{t('gen.tuneVoice')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMobilePrefs(false)}
                      aria-label={t('bot.close')}
                      className="dash-icon-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#8b94b8]"
                    >
                      <XIcon size={17} strokeWidth={2} />
                    </button>
                  </div>
                <div className="space-y-3 pb-2">
                  {prefQuestions.map((q, i) => {
                    const labels = {
                      profile_user_role: 'Your role',
                      profile_tone: 'Preferred tone',
                      profile_target_audience: 'Target audience',
                      profile_primary_focus: 'Primary focus',
                      profile_ambedkarite_perspective: 'Perspective',
                      profile_call_to_action: 'Call to action',
                    };
                    return (
                      <div key={q.question_id}>
                        <label className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wider text-[#6aa8ff]">
                          <span className="mr-1 text-[#4e5a80]">{i + 1}.</span>
                          {labels[q.question_id] ?? q.question_text}
                        </label>
                        <div className="relative">
                          <select
                            value={preferences[q.question_id] ?? q.options[0]}
                            onChange={(e) => setPreferences((prev) => ({ ...prev, [q.question_id]: e.target.value }))}
                            className="w-full appearance-none rounded-lg border border-[#1e3260]/70 bg-[#0a1130]/80 py-2 pl-3 pr-8 text-[12.5px] text-white outline-none transition focus:border-[#3f9fff]/60"
                          >
                            {q.options.map((opt) => (
                              <option key={opt} value={opt} className="bg-[#0a1130]">{opt}</option>
                            ))}
                          </select>
                          <ChevronDown size={12} strokeWidth={2} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b78a0]" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                  <button
                    type="button"
                    onClick={() => setShowMobilePrefs(false)}
                    className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-xl btn-gradient text-[14px] font-semibold text-white"
                  >
                    {t('gen.applyPrefs')}
                  </button>
                </div>
              </div>
            )}

            {/* Sticky on a phone so the action never scrolls out of reach while
                you read; in the flow from lg up, where it always was. */}
            <div className="sticky bottom-0 z-20 -mx-4 mt-3 border-t border-[#1e3260]/50 bg-[#050a18]/85 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={atDailyLimit}
                className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 lg:h-auto lg:py-3.5 ${atDailyLimit ? '' : 'btn-gradient shadow-[0_6px_24px_rgba(17,122,255,0.35)]'}`}
                style={{ background: atDailyLimit ? 'rgba(30,50,100,0.4)' : undefined }}
                title={atDailyLimit ? `Come back in ${quotaCountdown}` : undefined}
              >
                {atDailyLimit ? (
                  <>⏳ Come back in {quotaCountdown}</>
                ) : (
                  <><Sparkles size={15} strokeWidth={2} /> {t('gen.generatePost')}</>
                )}
              </button>
            </div>
          </div>
          );
        })()}

        {/* ── Generated post view ── */}
        {view === 'generated' && (
          <div className="ag-page-in flex-1 overflow-y-auto px-4 pb-10 sm:px-6 md:px-8">
            {renderPartyBanner()}
            {/* Header: title on left, actions on right (icon-only on mobile
                to prevent overflow). The way back is the page's single back
                control at the top, which steps back to the story. */}
            <div className="mb-4 flex items-center gap-2">
              {/* nowrap, and small enough on a phone that it does not need to
                  wrap: at 16px it broke across two lines and doubled the height
                  of the whole row. */}
              <h2 className="font-display whitespace-nowrap text-[13px] font-semibold text-white sm:text-[18px]">{t('gen.generatedPost')}</h2>

              {/* Action buttons */}
              <div className="ml-auto flex items-center gap-1 sm:gap-2">
                {/* Read aloud. Sits first because in a demo it is the control
                    being reached for, and it speaks whichever version is on
                    screen rather than always the Hindi original. */}
                {!generating && !translating && generatedPost && (
                  <SpeakButton
                    content={showTranslated && translatedPost ? translatedPost : generatedPost}
                    lang={showTranslated && translatedPost ? 'en' : 'hi'}
                  />
                )}
                {/* Preview in a phone: the post drawn the way the picked
                    platform will show it. Icon-only on a phone, like its
                    neighbours. */}
                {selectedPostId && !generating && !postFailed && generatedPost && (
                  <button
                    type="button"
                    onClick={() => setPhoneOpen(true)}
                    title={t('cmp.phonePreview')}
                    aria-label={t('cmp.phonePreview')}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#1e3a6e]/80 bg-[#0d1840]/80 text-[12px] font-medium text-[#6aa8ff] transition hover:border-[#3f9fff]/60 hover:text-white sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2"
                  >
                    <Smartphone size={13} strokeWidth={2} />
                    <span className="hidden sm:inline">{t('cmp.phonePreview')}</span>
                  </button>
                )}
                {/* Translate. Icon-only on a phone and labelled from sm up. It used to be removed below sm instead, so the one
                    control that turns a Hindi post into one the reader can
                    actually read was missing from the screen most people are
                    on. An icon costs the same 32px as its neighbours. */}
                {selectedPostId && !generating && siteLang !== 'hi' && (
                  <button
                    type="button"
                    onClick={showTranslated ? () => setShowTranslated(false) : handleTranslate}
                    disabled={translating}
                    title={showTranslated ? 'Show Hindi' : 'Translate to English'}
                    aria-label={showTranslated ? 'Show Hindi' : 'Translate to English'}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#1e3a6e]/80 bg-[#0d1840]/80 text-[12px] font-medium text-[#6aa8ff] transition hover:border-[#3f9fff]/60 hover:text-white disabled:opacity-40 sm:h-auto sm:w-auto sm:gap-1.5 sm:px-3 sm:py-2"
                  >
                    {translating ? (
                      <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6" />
                      </svg>
                    )}
                    <span className="hidden sm:inline">
                      {showTranslated ? 'Show Hindi' : translating ? 'Translating…' : 'Translate'}
                    </span>
                  </button>
                )}

              </div>
            </div>

            {/* Post / Preview toggle + translation badge */}
            {!generating && !translating && generatedPost && (
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {showTranslated && translatedPost && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1e3a6e]/60 bg-[#0d1840]/60 px-2.5 py-0.5 font-count text-[10px] uppercase tracking-widest text-[#6aa8ff]">
                      {t('gen.translatedEnglish')}
                    </span>
                  )}
                  <span
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-count text-[10px] uppercase tracking-wider"
                    style={{ borderColor: `${activePlatform.color}55`, color: activePlatform.color, backgroundColor: `${activePlatform.color}12` }}
                  >
                    {activePlatform.short} · {activePlatform.label}
                  </span>
                </div>
              </div>
            )}

            {(generating || translating) ? (
              <div className="ag-page-in flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-2xl border border-[#1e3260]/60 bg-[#0a1130]/70 p-5">
                {/* A skeleton of the post being written, the way rssgpt shows it. */}
                <div className="w-full" aria-hidden="true">
                  <div className="ag-progress h-1 w-full rounded-full bg-[#14224a]" />
                  <div className="ag-shimmer mt-5 flex items-center gap-3">
                    <span className="h-10 w-10 rounded-full bg-[#1e2a4f]" />
                    <span className="flex flex-col gap-2">
                      <span className="h-2.5 w-28 rounded-full bg-[#1e2a4f]" />
                      <span className="h-2 w-20 rounded-full bg-[#18223f]" />
                    </span>
                  </div>
                  <div className="ag-shimmer mt-5 flex flex-col gap-3">
                    <span className="h-3 w-full rounded-full bg-[#1e2a4f]" />
                    <span className="h-3 w-[92%] rounded-full bg-[#1e2a4f]" />
                    <span className="h-3 w-[96%] rounded-full bg-[#1e2a4f]" />
                    <span className="h-3 w-[60%] rounded-full bg-[#1e2a4f]" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-[13px] font-medium text-[#6aa8ff]">
                    {generating ? 'Generating your post…' : 'Translating…'}
                  </p>
                  {generating && (
                    <p className="mt-1 font-count text-[11px] text-[#3a4e70]">{genSeconds}s elapsed</p>
                  )}
                </div>
                {generating && (
                  /* The server sends nothing until the whole post is written, so
                     there is no real percentage to show. The bar is honest about
                     that: it eases toward 94% and stops, and only the arriving
                     post ends it. A bar that marched to 100% and then sat there
                     would be claiming something we do not know. */
                  <div
                    className="h-1 w-full max-w-[260px] overflow-hidden rounded-full bg-[#14224a]"
                    role="progressbar"
                    aria-label="Generating your post"
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#2563eb] to-[#7b5cff]"
                      style={{
                        width: `${Math.min(94, 100 * (1 - Math.exp(-genSeconds / 9))).toFixed(1)}%`,
                        transition: 'width 1s linear',
                      }}
                    />
                  </div>
                )}
              </div>
            ) : postView === 'preview' ? (
              /* ── Mock social card preview ── */
              <div className="rounded-2xl border border-[#1e3260]/60 bg-[#0a1130]/70 p-5">
                {/* Platform chrome */}
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#3f9fff] to-[#7b5cff] text-[15px] font-bold text-white">
                    {(currentUser?.username?.[0] ?? 'A').toUpperCase()}
                  </div>
                  <div>
                    <p className="text-[13.5px] font-semibold text-white">{currentUser?.username ?? 'You'}</p>
                    <p className="text-[11.5px]" style={{ color: activePlatform.color }}>
                      @{currentUser?.username?.toLowerCase() ?? 'user'} · {activePlatform.short}
                    </p>
                  </div>
                </div>
                <div className="border-t border-[#141d3a]/60 pt-4">
                  <PostContent
                    animate
                    content={showTranslated && translatedPost ? translatedPost : generatedPost}
                    lang={showTranslated && translatedPost ? 'en' : 'hi'}
                  />
                </div>
                {/* Mock engagement row */}
                {/* Drawn icons, because this row is pretending to be a real
                    social card and the real ones do not use emoji. Emoji also
                    render in whatever style the reader's platform ships, which
                    is the one thing a mock of someone else's UI cannot afford. */}
                <div className="mt-4 flex items-center gap-5 border-t border-[#141d3a]/60 pt-3 text-[11.5px] text-[#3a4e70]">
                  <span className="inline-flex items-center gap-1.5"><MessageCircle size={13} strokeWidth={1.8} />Reply</span>
                  <span className="inline-flex items-center gap-1.5"><Repeat2 size={14} strokeWidth={1.8} />Repost</span>
                  <span className="inline-flex items-center gap-1.5"><Heart size={13} strokeWidth={1.8} />Like</span>
                  <span className="inline-flex items-center gap-1.5"><Share size={13} strokeWidth={1.8} />Share</span>
                </div>
              </div>
            ) : postFailed ? (
              /* ── The generator refused, and said why ── */
              <div className="flex min-h-[260px] items-start gap-3 rounded-2xl border border-[#e0a04b]/35 bg-[#1a1206]/60 p-5">
                <AlertTriangle size={18} strokeWidth={1.9} className="mt-0.5 shrink-0 text-[#f0b877]" />
                <p className="text-[14px] leading-relaxed text-[#f0d9b8]">{generatedPost}</p>
              </div>
            ) : (
              /* ── Styled post text ── */
              <div className="min-h-[260px] rounded-2xl border border-[#1e3260]/60 bg-[#0a1130]/70 p-5">
                <PostContent
                    animate
                    content={showTranslated && translatedPost ? translatedPost : generatedPost}
                    lang={showTranslated && translatedPost ? 'en' : 'hi'}
                  />
              </div>
            )}

            {/* Under the post, as on rssgpt: one wide button named for the
                platform the post was written for, then copy and regenerate as
                icons. Regenerate needs the note once a post exists; with no
                saved post it is the retry for a generation that failed, so
                that path stays clickable. */}
            {!generating && !translating && generatedPost && (
              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                {selectedPostId && (
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={sharing || charOverLimit}
                    className="inline-flex min-h-11 min-w-0 flex-[1_1_200px] items-center justify-center gap-2 rounded-xl border px-5 text-[14px] font-semibold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:brightness-100"
                    style={postStatus === 'published'
                      ? { borderColor: 'rgba(34,197,94,0.5)', backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e' }
                      : { borderColor: activePlatform.color, backgroundColor: activePlatform.color, color: '#05081a' }}
                  >
                    {postStatus === 'published' ? <Check size={16} strokeWidth={2.4} /> : <Share size={16} strokeWidth={2.2} />}
                    {postStatus === 'published' ? t('gen.published') : t(`gen.postTo.${platform}`)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCopy}
                  title={copied ? 'Copied' : 'Copy'}
                  aria-label={copied ? 'Copied' : 'Copy'}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#1e3260]/70 bg-[#0d1531]/60 text-[#8b94b8] transition hover:border-[#3f9fff]/60 hover:text-white"
                  style={{ color: copied ? '#22c55e' : undefined, borderColor: copied ? 'rgba(34,197,94,0.4)' : undefined }}
                >
                  {copied ? <Check size={18} strokeWidth={2.4} /> : <Copy size={18} strokeWidth={2} />}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={Boolean(refinedAt) || (Boolean(selectedPostId) && !refinementNote.trim())}
                  title={
                    refinedAt
                      ? t('gen.refineAlreadyUsed')
                      : selectedPostId && !refinementNote.trim()
                        ? t('gen.refineNeedsNote')
                        : t('gen.regenerate')
                  }
                  aria-label={t('gen.regenerate')}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#1e3260]/70 bg-[#0d1531]/60 text-[#8b94b8] transition hover:border-[#3f9fff]/60 hover:text-white disabled:opacity-40"
                >
                  <RefreshCw size={18} strokeWidth={2} />
                </button>
              </div>
            )}
            {shareMsg && !generating && (
              <p role="status" className="mt-2 text-[12px] text-[#fbbf24]">{shareMsg}</p>
            )}

            {/* Version switch — only while both the refinement and the text it
                replaced are still on the post, which is until it is published. */}
            {!generating && !translating && selectedPostId && hasOtherVersion && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#1e3260]/50 bg-[#0a1130]/60 px-3 py-2.5">
                <span className="text-[11.5px] text-[#8b94b8]">
                  {refinedIsLive ? t('gen.versionRefined') : t('gen.versionOriginal')}
                </span>
                <button
                  type="button"
                  onClick={handleToggleVersion}
                  disabled={switchingVersion}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#1e3260]/70 bg-[#0d1531]/60 px-2.5 py-1.5 text-[11.5px] font-medium text-[#8b94b8] transition hover:border-[#3f9fff]/60 hover:text-white disabled:opacity-40"
                >
                  <RefreshCw size={11} strokeWidth={2} className={switchingVersion ? 'animate-spin' : ''} />
                  {refinedIsLive ? t('gen.showOriginal') : t('gen.showRefined')}
                </button>
                <span className="text-[10.5px] text-[#3a4e70]">{t('gen.versionHint')}</span>
              </div>
            )}

            {/* Refinement: change the post in your own words. It was a faint
                one-line input that nobody noticed; now a card with a title,
                a large box, ready-made asks and a button that says what it does. */}
            {!generating && !translating && generatedPost && selectedPostId && !refinedAt && (
              <div
                className="mt-4 rounded-2xl border p-4 sm:p-5"
                style={{ borderColor: 'rgba(240,166,58,0.5)', background: 'linear-gradient(135deg, rgba(240,166,58,0.12) 0%, rgba(10,17,48,0.75) 60%)' }}
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f0a63a] text-[#2a1600]">
                    <PenLine size={19} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[17px] font-bold leading-snug text-white sm:text-[18px]">{t('gen.refine.title')}</p>
                    <p className="mt-0.5 text-[14px] leading-snug text-[#c9b48f]">{t('gen.refine.sub')}</p>
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={refinementNote}
                  onChange={(e) => { setRefinementNote(e.target.value); if (refineHint) setRefineHint(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && refinementNote.trim()) { e.preventDefault(); handleRegenerate(); } }}
                  placeholder={t('gen.refine.placeholder')}
                  className="mt-3.5 w-full resize-none rounded-xl border border-[#f0a63a]/40 bg-[#0a1130]/80 px-4 py-3 text-[16px] leading-relaxed text-white placeholder-[#7d89ad] outline-none transition focus:border-[#f0a63a] focus:shadow-[0_0_0_3px_rgba(240,166,58,0.18)]"
                />
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {['gen.refine.q.shorter', 'gen.refine.q.stronger', 'gen.refine.q.question', 'gen.refine.q.number', 'gen.refine.q.simpler'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => { setRefinementNote(t(k)); if (refineHint) setRefineHint(''); }}
                      className="rounded-full border border-[#f0a63a]/40 bg-[#f0a63a]/10 px-3.5 py-1.5 text-[14px] font-medium text-[#ffd59a] transition hover:border-[#f0a63a] hover:bg-[#f0a63a]/20"
                    >
                      {t(k)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={!refinementNote.trim()}
                  className="mt-3.5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f0a63a] text-[16px] font-bold text-[#2a1600] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:px-6"
                >
                  <RefreshCw size={17} strokeWidth={2.4} />
                  {t('gen.refine.button')}
                </button>
                <p className="mt-2 text-[12.5px] text-[#9a8f7c]">{t('gen.refine.once')}</p>
                {refineHint && (
                  <p className="mt-1.5 text-[13px] text-[#fbbf24]">{refineHint}</p>
                )}
              </div>
            )}

            {/* Watermark */}
            {!generating && generatedPost && (
              <div className="mt-2 flex items-center gap-1.5 justify-end">
                <AgMark size={14} variant="bold" color="#8FA8FF" decorative className="opacity-60" />
                <span className="text-[10.5px] text-[#3a4e70]">{t('gen.generatedBy')}</span>
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-3">
              {/* Platform-aware char counter */}
              <div
                className="rounded-xl border px-4 py-3 text-center transition"
                style={{
                  borderColor: charOverLimit ? 'rgba(239,68,68,0.5)' : charWarning ? 'rgba(251,191,36,0.4)' : 'rgba(30,50,100,0.6)',
                  backgroundColor: charOverLimit ? 'rgba(239,68,68,0.08)' : 'rgba(10,17,48,0.6)',
                }}
              >
                <div className="text-[10.5px]" style={{ color: charOverLimit ? '#ef4444' : charWarning ? '#fbbf24' : '#8b94b8' }}>
                  Chars · {activePlatform.short} limit {activePlatform.limit.toLocaleString()}
                </div>
                <div
                  className="mt-1 font-count text-[22px] font-bold tabular-nums"
                  style={{ color: charOverLimit ? '#ef4444' : charWarning ? '#fbbf24' : 'white' }}
                >
                  {chars}
                </div>
                {activePlatform.limit && (
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#1e3260]/60">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(charPct * 100, 100)}%`,
                        backgroundColor: charOverLimit ? '#ef4444' : charWarning ? '#fbbf24' : '#3f9fff',
                      }}
                    />
                  </div>
                )}
              </div>
              {/* Words */}
              <div className="rounded-xl border border-[#1e3260]/60 bg-[#0a1130]/60 px-4 py-3 text-center">
                <div className="text-[11px] text-[#8b94b8]">{t('gen.words')}</div>
                <div className="mt-1 font-count text-[22px] font-bold tabular-nums text-white">{words}</div>
              </div>
              {/* Hashtags copy */}
              <button
                type="button"
                onClick={handleCopyHashtags}
                disabled={!generatedPost}
                className="rounded-xl border border-[#1e3260]/60 bg-[#0a1130]/60 px-4 py-3 text-center transition hover:border-[#3f9fff]/40 hover:bg-[#0d1635]/70 disabled:opacity-40"
              >
                <div className="text-[11px] text-[#8b94b8]">{t('gen.hashtags')}</div>
                <div className="mt-1 flex items-center justify-center gap-1.5">
                  {copiedHashtags
                    ? <><Check size={14} strokeWidth={2.5} className="text-[#22c55e]" /><span className="font-count text-[13px] font-bold text-[#22c55e]">{t('gen.copied')}</span></>
                    : <><Copy size={13} strokeWidth={2} className="text-[#5fa5ff]" /><span className="font-count text-[13px] font-bold text-[#5fa5ff]">{t('common.copy')}</span></>
                  }
                </div>
              </button>
            </div>

          </div>
        )}
      </div>

      {/* ── RESIZE HANDLE + RIGHT SIDEBAR ──
          Only with a story open: the preferences shape a post, and on the
          feed they took a column from the stories for nothing. */}
      {PREFERENCES_ENABLED && view !== 'feed' && (
      <div className="sticky top-0 z-20 hidden h-screen shrink-0 lg:flex" style={{ width: panelWidth + 8 }}>
        {/* Drag handle */}
        <div
          onMouseDown={startResize}
          className="group flex w-2 shrink-0 cursor-col-resize flex-col items-center justify-center border-l border-[#141d3a]/70 transition-colors hover:border-[#3f9fff]/30 hover:bg-[#3f9fff]/5"
        >
          <div className="h-10 w-[3px] rounded-full bg-[#1e3260] transition-colors group-hover:bg-[#3f9fff]/50" />
        </div>

        {/* Preferences panel */}
        <div className="h-full flex-1 overflow-hidden">
          <PreferencesPanel
            questions={prefQuestions}
            value={preferences}
            onChange={setPreferences}
            defaultValues={savedPrefs}
          />
        </div>
      </div>
      )}

      {/* In document.body, so the backdrop covers the whole screen whatever
          stacking context the page column makes. */}
      {phoneOpen && generatedPost && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={t('cmp.phonePreview')}>
          <div className="ag-fade absolute inset-0 bg-[#03060f]/78 backdrop-blur-[3px]" onClick={() => setPhoneOpen(false)} />
          <div
            className="ag-pop relative h-[min(620px,calc(100vh-96px))]"
            style={{ filter: `drop-shadow(0 0 60px rgba(${PLATFORM_LOOK[activePlatform.id].hue},0.35))` }}
          >
            <PhonePreview
              platform={activePlatform.id}
              state="ready"
              text={activeContent}
              authorName={authorName}
              authorHandle={(currentUser?.username || 'you').replace(/\s+/g, '').toLowerCase()}
              article={selectedArticle}
              translated={Boolean(showTranslated && translatedPost)}
            />
            <button
              type="button"
              onClick={() => setPhoneOpen(false)}
              aria-label={t('bot.close')}
              className="absolute -top-12 right-0 flex h-10 w-10 items-center justify-center rounded-full border border-[#1e3a6e] bg-[#0a1130] text-[#c0cde8] transition hover:text-white sm:-right-14 sm:top-0"
            >
              <XIcon size={17} />
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
