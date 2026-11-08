import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearPendingQuestions } from '../hooks/usePendingQuestions';
import {
  ArrowLeft, Sparkles, Copy, Check, RefreshCw, ChevronDown, ChevronRight, X as XIcon,
  LayoutGrid, ArrowRight, MessageCircle, Repeat2, Heart, Share, AlertTriangle, Smartphone, PenLine,
  Landmark, MapPin, Building2, MessagesSquare, Menu,
} from 'lucide-react';

import PreferencesPanel from '../components/generate/PreferencesPanel';
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
import { useI18n } from '../i18n/index.jsx';
import SpeakButton from '../components/generate/SpeakButton';
import Sidebar from '../components/dashboard/Sidebar';
import NewsCarousel from '../components/generate/NewsCarousel';
import NewsBrowser from '../components/generate/NewsBrowser';
import StoryStage from '../components/generate/StoryStage';
import { PLATFORM_ICON } from '../components/generate/platformIcons';
import { PARTY_ORDER, byParty, partyMeta } from '../components/generate/partyMeta';
import { PartyChip, PartySymbol } from '../components/generate/PartyMark';
import { labelForId } from '../utils/partyRoles';
import { PREFERENCES_ENABLED } from '../data/features';
import PhonePreview from '../components/compose/PhonePreview';
import { PLATFORM_LOOK } from '../components/compose/platformLook';
import '../components/compose/compose.css';
import { partyLabel } from '../utils/displayLabel';
import { partyLogo } from '../utils/politicalParties';
import { trackEvent } from '../analytics/metrics';

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
// The side panel carries the ten party questions only. The seven profile
// questions describe who the writer is and live on the Preferences page; the
// post's length is not asked at all, because the platform picked decides it
// (280 characters for X, as on rssgpt).

// adaptNews and resolveTenantForUser live in utils/newsTenants, shared with the
// dashboard's top-story card so both read the same party and story shape.

// One line of what the party stands for, under its name. Not in the tenant
// registry, so it lives here as i18n keys; a party without one shows nothing
// rather than a placeholder.
const PARTY_TAG_KEYS = {
  congress:  ['ptag.congress.1', 'ptag.congress.2', 'ptag.congress.3'],
  samajwadi: ['ptag.samajwadi.1', 'ptag.samajwadi.2', 'ptag.samajwadi.3'],
  bjp:       ['ptag.bjp.1', 'ptag.bjp.2', 'ptag.bjp.3'],
};

function formatNewsDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
  const [selectedState,   setSelectedState]   = useState('all');
  // null: the overview, a row per level. 'national' / 'state': that level's
  // full grid, which is the feed as it was.
  const [level,           setLevel]           = useState(null);
  // The overview's party chips: every party, or one.
  const [partyFilter,     setPartyFilter]     = useState('all');
  // The rail as a drawer, on a phone.
  const [menuOpen,        setMenuOpen]        = useState(false);
  const visibleStateArticles = stateArticles.filter((a) => selectedState === 'all'
    ? ['madhya pradesh', 'uttar pradesh'].includes(String(a.region || '').toLowerCase())
    : String(a.region || '').toLowerCase() === selectedState.toLowerCase());
  const [newsLoading,     setNewsLoading]     = useState(true);
  const [newsError,       setNewsError]       = useState(false);
  const [tenants,         setTenants]         = useState([]);
  const [sharing,         setSharing]         = useState(false);  // a share is marking the post published
  const [shareMsg,        setShareMsg]        = useState('');     // "paste it in Facebook", or why the share failed
  const [articleOpen,     setArticleOpen]     = useState(false);   // phones: the article starts as a preview
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

  const { t, lang } = useI18n();
  const siteLang = getSiteLanguage() ?? 'hi';
  const atDailyLimit = quota?.daily_remaining === 0;

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
    // State selection is independent of the reader's party: show both state
    // units' coverage so the MP feed can include BJP and Congress stories.
    const stateQuery = { limit: 100, scope: 'state' };
    getNews(stateQuery)
      .then((data) => setStateArticles((data || []).map(adaptNews).filter((a) => a.scope === 'state')))
      .catch(() => setStateArticles([]))
      .finally(() => setStateLoading(false));
  }, [siteLang, selectedParty]);

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
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  function startResize(e) {
    resizing.current = true;
    startX.current   = e.clientX;
    startW.current   = panelWidth;
    document.body.style.cursor     = 'col-resize';
    document.body.style.userSelect = 'none';
  }


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
    else if (level !== null) setLevel(null);
    else navigate('/generate');
  }

  function openLevel(id) {
    setLevel(id);
    window.scrollTo({ top: 0 });
  }
  const handoffDone = useRef(false);

  useEffect(() => {
    if (handoffDone.current || !(topStory?.newsId || topStory?.storyId) || !currentUser?.id) return;
    handoffDone.current = true;
    // newsId is the database id (the dashboard's top story); storyId is the
    // story's own id, which is what the radio knows it by.
    const { newsId, storyId } = topStory;
    navigate(location.pathname, { replace: true, state: null });
    (newsId ? getNewsById(newsId) : getNewsByStoryId(storyId))
      .then((item) => {
        if (!item) return;
        const article = adaptNews(item);
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
    if (r === 'all') return t('gen.stateAll');
    return lang === 'hi' ? ({ 'Madhya Pradesh': 'मध्य प्रदेश', 'Uttar Pradesh': 'उत्तर प्रदेश' }[r] ?? r) : r;
  }
  const welcomeLogo = partyLogo(currentUser?.political_party);
  const welcomeName = (currentUser?.full_name || currentUser?.username || '').split(/[\s_]/)[0];
  const roleName = labelForId(currentUser?.party_position || '', currentUser?.political_party || '', lang);



  // The overview, party by party (the reader's own party first, then INC, SP,
  // BJP) rather than newest first, narrowed by the party chips.
  const byChip = (list) => (partyFilter === 'all' ? list : list.filter((a) => a.tenantSlug === partyFilter));
  // An INC worker writes about INC and answers BJP; SP's news is neither,
  // so it is not shown (and the same for SP's workers and INC's news).
  const ownAndOpposition = (a) => !selectedParty || a.tenantSlug === selectedParty || a.tenantSlug === 'bjp';
  const nationalNews = nationalArticles.filter((a) => a.tenantSlug !== 'general' && ownAndOpposition(a));
  const stateNews = visibleStateArticles.filter(ownAndOpposition);
  const overviewNational = byParty(byChip(nationalNews), selectedParty);
  const overviewState = byParty(byChip(stateNews), selectedParty);
  const partiesShown = PARTY_ORDER.filter((slug) => nationalNews.some((a) => a.tenantSlug === slug)
    || stateNews.some((a) => a.tenantSlug === slug));
  const partyTags = (PARTY_TAG_KEYS[activeParty?.slug] ?? []).map((k) => t(k)).filter((v) => v && !v.startsWith('ptag.'));

  const stateSelect = (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{t('gen.statePicker')}</span>
      <select
        value={selectedState}
        onChange={(event) => setSelectedState(event.target.value)}
        className="h-10 max-w-full appearance-none rounded-full border border-[#f0a63a]/50 bg-[#1a1530] pl-4 pr-9 text-[14.5px] font-semibold text-white outline-none transition focus:border-[#f0a63a] focus:ring-2 focus:ring-[#f0a63a]/25"
      >
        <option value="all">{t('gen.stateAll')}</option>
        <option value="Madhya Pradesh">{regionLabel('Madhya Pradesh')} (MP)</option>
        <option value="Uttar Pradesh">{regionLabel('Uttar Pradesh')} (UP)</option>
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 text-[#f0c27a]" />
    </label>
  );

  // The welcome, as a shop's banner: who you are on the left, today's top
  // story of your party on the right, ready to write on.
  function renderHero() {
    const pm = partyMeta(selectedParty);
    const top = byParty(nationalNews, selectedParty)[0];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const freshToday = [...nationalNews, ...stateNews].filter((a) => Date.parse(a.date) >= today.getTime()).length;
    const stats = [
      { Icon: Landmark, n: nationalNews.length, label: t('gen.feed.statNational'), c: '#6aa8ff' },
      { Icon: MapPin, n: stateNews.length, label: t('gen.feed.statState'), c: '#f0b45a' },
      { Icon: Sparkles, n: freshToday, label: t('gen.feed.statToday'), c: '#b69bff' },
    ];
    return (
      <section
        className="ag-rise relative mb-8 overflow-hidden rounded-[32px] border border-white/[0.09] p-6 sm:p-8 lg:p-10"
        style={{
          background: `radial-gradient(55% 90% at 0% 0%, ${pm.color}55 0%, transparent 62%), radial-gradient(50% 80% at 100% 100%, #8b5cff45 0%, transparent 60%), linear-gradient(120deg, #16215c 0%, #0f1641 45%, #1b1347 100%)`,
          boxShadow: '0 30px 80px rgba(2,6,20,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
      >
        <span
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage: 'radial-gradient(80% 80% at 30% 20%, #000 10%, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(80% 80% at 30% 20%, #000 10%, transparent 80%)',
          }}
        />
        <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
          <div className="min-w-0">
            <div className="flex items-center gap-4 sm:gap-5">
              {welcomeLogo && (
                <span className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.18),0_12px_30px_rgba(0,0,0,0.4)] sm:h-[84px] sm:w-[84px]">
                  <img
                    src={welcomeLogo}
                    alt={currentUser?.political_party || 'Party'}
                    className="h-[58px] w-[58px] object-contain sm:h-[76px] sm:w-[76px]"
                    onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                  />
                  <span className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-[3px] border-[#141d52] bg-[#22c55e]" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-[16px] font-medium text-[#b8c6ea] sm:text-[18px]">{t('dash.welcomeBack')}</p>
                <h1 className="font-display text-[34px] font-bold leading-[1.05] tracking-tight sm:text-[46px]">
                  <span className="bg-gradient-to-r from-white via-[#cfe0ff] to-[#9db8ff] bg-clip-text text-transparent">{welcomeName}</span>
                </h1>
              </div>
            </div>
            {(activeParty || roleName) && (
              <p className="mt-4 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-white/15 bg-white/[0.07] px-4 py-1.5 text-[14.5px] font-medium text-[#dbe4fb] backdrop-blur">
                {activeParty && <span>{partyLabel(activeParty.name, lang)}</span>}
                {activeParty && roleName && <span className="text-white/40" aria-hidden="true">·</span>}
                {roleName && <span className="font-bold text-[#ffc27a]">{roleName}</span>}
              </p>
            )}
            <p className="mt-5 max-w-[520px] text-[17px] leading-relaxed text-[#c9d5f3] sm:text-[19px]">{t('gen.feed.heroSub')}</p>
            <div className="mt-6 grid max-w-[560px] grid-cols-3 gap-2.5 sm:gap-3">
              {stats.map(({ Icon, n, label, c }) => (
                <div key={label} className="rounded-2xl border border-white/[0.1] bg-white/[0.06] px-3 py-3 backdrop-blur sm:px-4">
                  <Icon size={18} style={{ color: c }} />
                  <p className="mt-1.5 font-count text-[26px] font-bold leading-none text-white sm:text-[30px]">{n}</p>
                  <p className="mt-1 text-[12.5px] leading-tight text-[#aebbe0] sm:text-[13.5px]">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {top && (
            <button
              type="button"
              onClick={() => handlePreview(top)}
              className="group relative flex min-h-[250px] flex-col overflow-hidden rounded-[26px] border border-white/15 p-6 text-left transition duration-300 hover:-translate-y-1 hover:border-white/30"
              style={{
                background: `radial-gradient(100% 120% at 100% 0%, ${partyMeta(top.tenantSlug).color}50 0%, transparent 55%), linear-gradient(160deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)`,
                boxShadow: '0 24px 60px rgba(2,6,20,0.5)',
                backdropFilter: 'blur(8px)',
              }}
            >
              <PartySymbol slug={top.tenantSlug} size={170} color="#ffffff" className="pointer-events-none absolute -bottom-8 -right-6 opacity-[0.1] transition-transform duration-700 group-hover:scale-110" />
              <span className={`relative inline-flex items-center gap-2 font-bold uppercase text-[#ffc24b] ${lang === 'hi' ? 'text-[15px]' : 'text-[13px] tracking-[0.16em]'}`}>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#ffc24b] opacity-70 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#ffc24b]" />
                </span>
                {t('gen.feed.topStory')}
              </span>
              <span className="relative mt-3 flex items-center gap-2.5">
                <PartyChip slug={top.tenantSlug} />
                <span className="font-count text-[14px] text-white/65">{formatNewsDate(top.date)}</span>
              </span>
              <span className="font-hindi relative mt-3 line-clamp-3 text-[clamp(21px,0.8vw+15px,25px)] font-bold leading-[1.45] text-white">{top.title}</span>
              <span className="relative mt-auto inline-flex h-12 w-fit items-center gap-2 rounded-full bg-white px-6 pt-0 text-[16px] font-bold text-[#0d1440] shadow-[0_10px_26px_rgba(255,255,255,0.18)] transition group-hover:gap-3">
                <Sparkles size={17} />
                {t('gen.feed.writePost')}
                <ArrowRight size={17} />
              </span>
            </button>
          )}
        </div>
      </section>
    );
  }

  // Shop-style category chips: every party, or one, each with its symbol.
  function renderPartyFilter() {
    if (partiesShown.length < 2) return null;
    const chips = [{ id: 'all' }, ...partiesShown.map((id) => ({ id }))];
    return (
      <div role="group" aria-label={t('gen.feed.allParties')} className="-mx-4 mb-9 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
        {chips.map(({ id }) => {
          const on = partyFilter === id;
          const meta = partyMeta(id);
          const n = id === 'all'
            ? nationalNews.length + stateNews.length
            : nationalNews.filter((a) => a.tenantSlug === id).length + stateNews.filter((a) => a.tenantSlug === id).length;
          const c = id === 'all' ? '#8FA8FF' : meta.color;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setPartyFilter(id)}
              aria-pressed={on}
              className="inline-flex h-12 shrink-0 items-center gap-2.5 rounded-full border pl-2 pr-5 text-[16px] font-semibold transition duration-200 hover:-translate-y-0.5"
              style={on
                ? { borderColor: c, background: `linear-gradient(135deg, ${c} 0%, ${id === 'all' ? '#7b5cff' : meta.glow} 100%)`, color: '#fff', boxShadow: `0 10px 26px ${c}55` }
                : { borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#d5ddf3' }}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: on ? 'rgba(0,0,0,0.22)' : `${c}22` }}>
                {id === 'all' ? <LayoutGrid size={16} style={{ color: on ? '#fff' : c }} /> : <PartySymbol slug={id} size={19} color={on ? '#fff' : c} />}
              </span>
              {id === 'all' ? t('gen.feed.allParties') : meta.short}
              <span className={`font-count text-[13.5px] ${on ? 'text-white/80' : 'text-[#7f8db3]'}`}>{n}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="ag-page-in relative flex min-h-screen text-[#e5e7eb]"
      style={{ background: 'radial-gradient(1100px 650px at 85% -10%, rgba(123,92,255,0.22) 0%, transparent 60%), radial-gradient(900px 600px at 15% 0%, rgba(26,95,255,0.22) 0%, transparent 60%), radial-gradient(900px 700px at 50% 110%, rgba(240,135,42,0.10) 0%, transparent 60%), linear-gradient(180deg, #0a0f26 0%, #070b1c 60%, #060914 100%)', backgroundAttachment: 'fixed' }}
    >
      {/* The dashboard's own navigation, closed to icons; it opens over the
          page on hover. Laptops only - phones keep their header. */}
      <Sidebar
        wide
        mobileOpen={menuOpen}
        onMobileClose={() => setMenuOpen(false)}
        user={{
          name: currentUser?.full_name || currentUser?.username || '—',
          sub: roleName || currentUser?.email || '',
          initial: (currentUser?.full_name || currentUser?.username || 'A')[0].toUpperCase(),
        }}
        active="generate"
        onSelect={(id) => { if (id === 'dashboard') navigate('/dashboard'); }}
        onLogout={async () => { await logout(); navigate('/', { replace: true }); }}
      />

      {/* ambient glows */}
      <div className="pointer-events-none fixed left-[300px] top-[-120px] h-[520px] w-[520px] rounded-full bg-[#3f6bff]/14 blur-[150px]" />
      <div className="pointer-events-none fixed bottom-[-120px] right-[-60px] h-[480px] w-[480px] rounded-full bg-[#8b5cff]/14 blur-[150px]" />

      {/* ── MAIN CONTENT ── */}
      <div
        // Clipped sideways, not hidden: overflow-hidden made this column the
        // scroll box, and the sticky panels inside it then stuck to nothing.
        className="relative z-10 flex min-w-0 flex-1 flex-col overflow-x-clip"
      >

        {/* On a story or a post: back on the left, the account (language,
            notifications, profile, log out) on the right. The feed carries
            both in its welcome row instead. */}
        {view !== 'feed' && (
        <header className="dash-header flex h-14 shrink-0 items-center gap-3 px-4 sm:gap-4 sm:px-6 md:h-16 md:px-8">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label={t('common.openMenu')}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white lg:hidden"
          >
            <Menu size={19} />
          </button>
          <button
            type="button"
            onClick={goBack}
            aria-label={t('common.back')}
            title={t('common.back')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#1e3260]/70 bg-[#0d1531]/60 px-3 py-2 text-[12px] font-medium text-[#8b94b8] transition hover:text-white"
          >
            <ArrowLeft size={12} strokeWidth={2} />
          </button>

        </header>
        )}

        {/* ── Feed view ── */}
        {view === 'feed' && (
          <div className="ag-page-in flex-1 px-4 pb-14 pt-4 sm:px-6 md:px-8 lg:px-10 lg:pt-8">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label={t('common.openMenu')}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white lg:hidden"
              >
                <Menu size={19} />
              </button>
            </div>
            {level === null ? (
              <>
                {renderHero()}
                {renderPartyFilter()}
                <NewsCarousel
                  Icon={Landmark}
                  title={t('gen.levels.national')}
                  subtitle={t('gen.levels.nationalSub')}
                  accent="#3f9fff"
                  items={overviewNational}
                  loading={newsLoading}
                  onOpen={handlePreview}
                  onViewAll={() => openLevel('national')}
                  dateLabel={formatNewsDate}
                />
                <NewsCarousel
                  Icon={MapPin}
                  title={t('gen.levels.state', { region: regionLabel(selectedState) })}
                  subtitle={t('gen.levels.stateSub')}
                  accent="#f0a63a"
                  items={overviewState}
                  loading={stateLoading}
                  onOpen={handlePreview}
                  onViewAll={() => openLevel('state')}
                  dateLabel={formatNewsDate}
                  emptyText={t('gen.levels.stateEmpty')}
                  headingControl={stateSelect}
                />
                <NewsCarousel Icon={Building2} title={t('gen.levels.city')} subtitle={t('gen.levels.citySub')} accent="#22c55e" comingSoon />
                <NewsCarousel Icon={MessagesSquare} title={t('gen.levels.social')} subtitle={t('gen.levels.socialSub')} accent="#a78bfa" comingSoon />
              </>
            ) : (
              <NewsBrowser
                key={level}
                levelTitle={level === 'state'
                  ? t('gen.levels.state', { region: regionLabel(selectedState) })
                  : t('gen.levels.national')}
                articles={level === 'state' ? stateNews : nationalNews}
                loading={level === 'state' ? stateLoading : newsLoading}
                error={level === 'state' ? false : newsError}
                onRetry={loadNews}
                onOpen={handlePreview}
                onBack={() => setLevel(null)}
                partySlug={activeParty?.slug}
                partyName={activeParty ? partyLabel(activeParty.name, lang) : ''}
                partyTagline={partyTags.join(' · ')}
                welcomeName={welcomeName}
                roleName={roleName}
                stateControl={level === 'state' ? stateSelect : null}
              />
            )}
          </div>
        )}

        {/* ── Preview view ── */}
        {view === 'preview' && selectedArticle && (
          <div className="ag-page-in flex-1 px-4 pb-10 sm:px-6 md:px-8 lg:px-10">
            <StoryStage
              article={selectedArticle}
              platforms={PLATFORMS}
              platform={platform}
              onPlatform={setPlatform}
              quota={quota}
              atDailyLimit={atDailyLimit}
              onGenerate={handleGenerate}
              writingAs={activeParty ? { slug: activeParty.slug, logo: welcomeLogo, partyName: partyLabel(activeParty.name, lang), roleName } : null}
              articleOpen={articleOpen}
              onToggleArticle={() => setArticleOpen((o) => !o)}
            />
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

          </div>
        )}

        {/* ── Generated post view ── */}
        {view === 'generated' && (() => {
          const PIcon = PLATFORM_ICON[activePlatform.id];
          const shown = showTranslated && translatedPost ? translatedPost : generatedPost;
          const ready = !generating && !translating && generatedPost;
          return (
          <div className="ag-page-in flex-1 px-4 pb-10 sm:px-6 md:px-8 lg:px-10">
            <div className="grid gap-6 pt-2 xl:grid-cols-[minmax(0,1fr)_400px] [&>*]:min-w-0">
              {/* ── The post ── */}
              <div>
                <div className="mb-4 flex flex-wrap items-center gap-3.5">
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white"
                    style={{ background: activePlatform.color, boxShadow: `0 10px 26px ${activePlatform.color}55` }}
                  >
                    {PIcon && <PIcon width={24} height={24} />}
                  </span>
                  <div className="min-w-0">
                    <h1 className="font-display text-[24px] font-bold leading-tight text-white sm:text-[28px]">{t('gen.post.title')}</h1>
                    <p className="text-[15px] text-[#9fb0d4]">{t('gen.post.for', { platform: activePlatform.label })}</p>
                  </div>
                  {showTranslated && translatedPost && (
                    <span className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[13px] font-semibold text-[#cfe0ff]">{t('gen.translatedEnglish')}</span>
                  )}
                </div>

                {(generating || translating) ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center gap-5 rounded-[28px] border border-white/[0.08] p-6" style={{ background: 'linear-gradient(160deg, #141c42 0%, #0c1230 60%, #0a0e27 100%)' }}>
                    <div className="w-full max-w-[560px]" aria-hidden="true">
                      <div className="ag-shimmer flex items-center gap-3">
                        <span className="h-11 w-11 rounded-full bg-white/10" />
                        <span className="flex flex-col gap-2">
                          <span className="h-3 w-32 rounded-full bg-white/10" />
                          <span className="h-2.5 w-20 rounded-full bg-white/[0.07]" />
                        </span>
                      </div>
                      <div className="ag-shimmer mt-6 flex flex-col gap-3">
                        <span className="h-3.5 w-full rounded-full bg-white/10" />
                        <span className="h-3.5 w-[92%] rounded-full bg-white/10" />
                        <span className="h-3.5 w-[96%] rounded-full bg-white/10" />
                        <span className="h-3.5 w-[60%] rounded-full bg-white/10" />
                      </div>
                    </div>
                    <p className="text-[17px] font-semibold text-white">{generating ? t('gen.post.writing') : t('gen.translating')}</p>
                    {generating && (
                      <div className="h-1.5 w-full max-w-[320px] overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={t('gen.post.writing')}>
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#1a5fff] via-[#4f7dff] to-[#8b5cff]"
                          style={{ width: `${Math.min(94, 100 * (1 - Math.exp(-genSeconds / 9))).toFixed(1)}%`, transition: 'width 1s linear' }}
                        />
                      </div>
                    )}
                    {generating && <p className="font-count text-[13px] text-[#7f8db3]">{genSeconds}s</p>}
                  </div>
                ) : postFailed ? (
                  <div className="flex min-h-[200px] items-start gap-3 rounded-[28px] border border-[#e0a04b]/40 bg-[#1a1206]/70 p-6">
                    <AlertTriangle size={20} strokeWidth={1.9} className="mt-0.5 shrink-0 text-[#f0b877]" />
                    <p className="text-[16px] leading-relaxed text-[#f0d9b8]">{generatedPost}</p>
                  </div>
                ) : (
                  <article
                    className="relative overflow-hidden rounded-[28px] border p-6 sm:p-8"
                    style={{
                      borderColor: `${activePlatform.color}44`,
                      background: `radial-gradient(80% 100% at 100% 0%, ${activePlatform.color}22 0%, transparent 55%), linear-gradient(160deg, #141c42 0%, #0c1230 55%, #0a0e27 100%)`,
                      boxShadow: '0 30px 70px rgba(2,6,20,0.5)',
                    }}
                  >
                    <div className="flex items-center gap-3 border-b border-white/[0.08] pb-4">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#3f9fff] to-[#7b5cff] font-display text-[19px] font-bold text-white">
                        {(authorName[0] || 'A').toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[16.5px] font-semibold text-white">{authorName}</p>
                        <p className="truncate text-[13.5px] text-[#8f9cc2]">{roleName || `@${(currentUser?.username || 'you').toLowerCase()}`}</p>
                      </div>
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `${activePlatform.color}26`, color: activePlatform.color }}>
                        {PIcon && <PIcon width={19} height={19} />}
                      </span>
                    </div>
                    <div className="pt-5">
                      <PostContent animate content={shown} lang={showTranslated && translatedPost ? 'en' : 'hi'} />
                    </div>
                    <div className="mt-5 flex items-center gap-6 border-t border-white/[0.08] pt-4 text-[13px] text-[#6b7a9e]">
                      <span className="inline-flex items-center gap-1.5"><MessageCircle size={15} strokeWidth={1.8} />Reply</span>
                      <span className="inline-flex items-center gap-1.5"><Repeat2 size={16} strokeWidth={1.8} />Repost</span>
                      <span className="inline-flex items-center gap-1.5"><Heart size={15} strokeWidth={1.8} />Like</span>
                    </div>
                  </article>
                )}

                {ready && (
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div
                      className="rounded-2xl border px-4 py-3"
                      style={{
                        borderColor: charOverLimit ? 'rgba(239,68,68,0.5)' : charWarning ? 'rgba(251,191,36,0.45)' : 'rgba(255,255,255,0.08)',
                        background: charOverLimit ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.035)',
                      }}
                    >
                      <p className="text-[13px] text-[#8f9cc2]">{t('gen.post.chars')}</p>
                      <p className="mt-0.5 font-count text-[22px] font-bold tabular-nums" style={{ color: charOverLimit ? '#ef4444' : charWarning ? '#fbbf24' : '#fff' }}>{chars}</p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3">
                      <p className="text-[13px] text-[#8f9cc2]">{t('gen.words')}</p>
                      <p className="mt-0.5 font-count text-[22px] font-bold tabular-nums text-white">{words}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyHashtags}
                      className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-left transition hover:border-[#3f9fff]/50"
                    >
                      <p className="text-[13px] text-[#8f9cc2]">{t('gen.hashtags')}</p>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-[15px] font-bold" style={{ color: copiedHashtags ? '#22c55e' : '#6aa8ff' }}>
                        {copiedHashtags ? <Check size={15} strokeWidth={2.5} /> : <Copy size={14} />}
                        {copiedHashtags ? t('gen.copied') : t('common.copy')}
                      </p>
                    </button>
                  </div>
                )}

                {ready && selectedPostId && hasOtherVersion && (
                  <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3">
                    <span className="text-[14px] text-[#c7d1eb]">{refinedIsLive ? t('gen.versionRefined') : t('gen.versionOriginal')}</span>
                    <button
                      type="button"
                      onClick={handleToggleVersion}
                      disabled={switchingVersion}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-[13.5px] font-semibold text-white transition hover:border-[#3f9fff] disabled:opacity-40"
                    >
                      <RefreshCw size={13} className={switchingVersion ? 'animate-spin' : ''} />
                      {refinedIsLive ? t('gen.showOriginal') : t('gen.showRefined')}
                    </button>
                    <span className="text-[12.5px] text-[#7f8db3]">{t('gen.versionHint')}</span>
                  </div>
                )}

                {!generating && generatedPost && (
                  <div className="mt-3 flex items-center justify-end gap-1.5">
                    <AgMark size={14} variant="bold" color="#8FA8FF" decorative className="opacity-60" />
                    <span className="text-[12px] text-[#5a6a92]">{t('gen.generatedBy')}</span>
                  </div>
                )}
              </div>

              {/* ── Share it, or change it ── */}
              <aside className="space-y-5 xl:sticky xl:top-4 xl:self-start">
                {ready && (
                  <div
                    className="relative overflow-hidden rounded-[28px] border border-white/[0.09] p-5 sm:p-6"
                    style={{ background: 'linear-gradient(170deg, #17204b 0%, #0e1435 50%, #0a0e27 100%)', boxShadow: '0 30px 70px rgba(2,6,20,0.5)' }}
                  >
                    <span className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full blur-3xl" style={{ background: `${activePlatform.color}30` }} />
                    <p className="relative font-display text-[21px] font-bold text-white">{t('gen.post.ready')}</p>
                    <p className="relative mt-1 text-[14.5px] text-[#9fb0d4]">{t('gen.post.readySub')}</p>
                    {selectedPostId && (
                      <button
                        type="button"
                        onClick={handlePublish}
                        disabled={sharing || charOverLimit}
                        className="relative mt-5 inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-[17px] font-bold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                        style={postStatus === 'published'
                          ? { border: '1px solid rgba(34,197,94,0.5)', background: 'rgba(34,197,94,0.14)', color: '#22c55e' }
                          : { background: activePlatform.color, color: activePlatform.id === 'whatsapp' ? '#04220f' : '#fff', boxShadow: `0 14px 34px ${activePlatform.color}55` }}
                      >
                        {postStatus === 'published' ? <Check size={19} strokeWidth={2.6} /> : (PIcon && <PIcon width={21} height={21} />)}
                        {postStatus === 'published' ? t('gen.published') : t(`gen.postTo.${platform}`)}
                      </button>
                    )}
                    {shareMsg && <p role="status" className="relative mt-2.5 text-[13.5px] text-[#fbbf24]">{shareMsg}</p>}
                    <div className="relative mt-3 grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] text-[15px] font-semibold text-white transition hover:border-white/30"
                        style={copied ? { color: '#22c55e', borderColor: 'rgba(34,197,94,0.45)' } : undefined}
                      >
                        {copied ? <Check size={17} strokeWidth={2.4} /> : <Copy size={17} />}
                        {copied ? t('gen.copied') : t('common.copy')}
                      </button>
                      {selectedPostId && !postFailed && (
                        <button
                          type="button"
                          onClick={() => setPhoneOpen(true)}
                          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] text-[15px] font-semibold text-white transition hover:border-white/30"
                        >
                          <Smartphone size={17} />
                          {t('cmp.phonePreview')}
                        </button>
                      )}
                      {selectedPostId && siteLang !== 'hi' && (
                        <button
                          type="button"
                          onClick={showTranslated ? () => setShowTranslated(false) : handleTranslate}
                          disabled={translating}
                          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] text-[15px] font-semibold text-white transition hover:border-white/30 disabled:opacity-40"
                        >
                          {translating ? <RefreshCw size={16} className="animate-spin" /> : <span aria-hidden="true">अ/A</span>}
                          {showTranslated ? t('gen.showHindi') : t('gen.translate')}
                        </button>
                      )}
                    </div>
                    <div className="relative mt-3">
                      <SpeakButton content={shown} lang={showTranslated && translatedPost ? 'en' : 'hi'} />
                    </div>
                  </div>
                )}

            {/* Refinement: change the post in your own words. It was a faint
                one-line input that nobody noticed; now a card with a title,
                a large box, ready-made asks and a button that says what it does. */}
            {!generating && !translating && generatedPost && selectedPostId && !refinedAt && (
              <div
                className="rounded-[26px] border p-5 sm:p-6"
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

              </aside>
            </div>
          </div>
          );
        })()}
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
