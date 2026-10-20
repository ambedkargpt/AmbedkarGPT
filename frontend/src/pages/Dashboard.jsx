import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Send, SlidersHorizontal, Bot, Sparkles, Music, ChevronRight, ChevronDown, Calendar, LayoutGrid } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { getPosts, getDailyQuota } from '../api/posts';
import { getProfileAnswers } from '../api/profile';
import MilestoneBanner from '../components/MilestoneBanner';
import DailyQuotaWidget from '../components/dashboard/DailyQuotaWidget';
import RevealOnScroll from '../components/ui/RevealOnScroll';

import Topbar               from '../components/dashboard/Topbar';
import TopStoryCarousel     from '../components/dashboard/TopStoryCarousel';
import { SectionHeading }   from '../components/dashboard/Card';
import StatCard             from '../components/dashboard/StatCard';
import SearchActivityChart  from '../components/dashboard/SearchActivityChart';
import DailyActivityChart   from '../components/dashboard/DailyActivityChart';
import CategoriesPieChart   from '../components/dashboard/CategoriesPieChart';
import ImageGenerationCard  from '../components/dashboard/ImageGenerationCard';
import ProfileCard          from '../components/dashboard/ProfileCard';
import PreferencesCard      from '../components/dashboard/PreferencesCard';
import RecentSearchesTable  from '../components/dashboard/RecentSearchesTable';
import SavedPromptsGrid     from '../components/dashboard/SavedPromptsGrid';
import AchievementsGrid     from '../components/dashboard/AchievementsGrid';
import DashboardFooter      from '../components/dashboard/DashboardFooter';
import { partyLogo }        from '../utils/politicalParties';
import { labelForId }       from '../utils/partyRoles';
import { useI18n }         from '../i18n/index.jsx';
import {
  formatFullDate, fromInputValue, sameDay, startOfDay, toInputValue, weekdayShort,
} from '../utils/dashboardDates';

// The three ways into generation, in the order they are worth trying.
const QUICK_ACTIONS = [
  { labelKey: 'dash.socialPost',  descKey: 'dash.socialPostDesc',  Icon: Sparkles, route: '/generate/social-media', accent: '#3f9fff' },
  { labelKey: 'dash.musicStudio', descKey: 'dash.musicStudioDesc', Icon: Music,    route: '/generate/music',        accent: '#7b5cff' },
  { labelKey: 'dash.bheembot',    descKey: 'dash.bheembotDesc',    Icon: Bot,      route: '/bhimbot',              accent: '#22c55e' },
];

export default function Dashboard() {
  const { currentUser } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const [posts,            setPosts]           = useState([]);
  const [profileAnswers,   setProfileAnswers]  = useState([]);
  const [dataLoading,      setDataLoading]     = useState(true);
  const [quota,            setQuota]           = useState(null);
  const [quotaLoading,     setQuotaLoading]    = useState(true);

  // The day both charts end on. Today by default; the date pill changes it.
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const dateInputRef = useRef(null);

  useEffect(() => {
    if (!currentUser?.id) return;
    // Reset loading states on every mount so re-login always shows fresh data
    setDataLoading(true);
    setQuotaLoading(true);
    Promise.all([
      getPosts({ limit: 100 }).catch(() => []),
      getProfileAnswers(currentUser.id).catch(() => []),
    ]).then(([p, a]) => {
      setPosts(p ?? []);
      setProfileAnswers(a ?? []);
    }).finally(() => setDataLoading(false));

    getDailyQuota().then(setQuota).catch(() => {}).finally(() => setQuotaLoading(false));
  }, [currentUser?.id]);

  // The native picker, opened from the pill. showPicker() is missing in older
  // browsers and throws without a user gesture; focusing the input is the
  // fallback there.
  function openDatePicker() {
    const el = dateInputRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  }

  const dateLabel = `${
    sameDay(anchorDate, new Date()) ? t('dash.today') : weekdayShort(anchorDate, lang)
  }, ${formatFullDate(anchorDate, lang)}`;

  // Resolved from the full party list, not the offered one, so an account
  // carrying a party we no longer offer still shows its own mark.
  const welcomeLogo  = partyLogo(currentUser?.political_party);
  // Who the posts are written as: the party and the position in it. Both
  // shape every post, so they are stated where the user lands.
  const roleName = labelForId(currentUser?.party_position || '', currentUser?.political_party || '', lang);
  const displayName  = currentUser?.username ?? '—';
  const displayEmail = currentUser?.email ?? currentUser?.phone ?? '—';
  const joinedLabel  = (() => {
    // Not `t`: that is the translate function in this scope now.
    const created = currentUser?.created_at;
    if (!created) return '';
    const d = new Date(created);
    return `Joined ${d.toLocaleString('en-US', { month: 'long', year: 'numeric' })}`;
  })();

  const totalPosts     = posts.length;
  const publishedPosts = posts.filter((p) => p.status === 'published').length;
  const draftPosts     = posts.filter((p) => p.status === 'draft').length;
  const prefsAnswered  = profileAnswers.length;

  const topbarUser  = {
    name: displayName,
    email: displayEmail,
    party: currentUser?.political_party ?? '',
  };
  const profileUser = { name: displayName, email: displayEmail, joined: joinedLabel, postCount: totalPosts };

  const first = displayName.split('_')[0];

  // The date pill. It belongs to the activity numbers and the charts under
  // them, so it rides in that section's heading; below sm the heading wraps and
  // it takes its own line rather than squeezing the label.
  const datePill = (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={openDatePicker}
        aria-label={t('dash.pickDate')}
        className="dash-icon-btn inline-flex items-center gap-2 rounded-lg border border-[#1e3260]/70 bg-[#0d1531]/70 px-3 py-2 text-[12.5px] font-medium text-white/90"
      >
        <Calendar size={14} strokeWidth={2} className="text-[#6f8fce]" />
        {dateLabel}
        <ChevronDown size={13} strokeWidth={2} className="text-[#6b78a0]" />
      </button>
      <input
        ref={dateInputRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        max={toInputValue(new Date())}
        value={toInputValue(anchorDate)}
        onChange={(e) => {
          const picked = fromInputValue(e.target.value);
          if (picked) setAnchorDate(picked);
        }}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        style={{ colorScheme: 'dark' }}
      />
    </div>
  );

  return (
    <>
      <MilestoneBanner totalPosts={quota?.total_streak_posts} />

      <div className="relative px-4 sm:px-6 md:px-10">
        {/* totalPosts comes from the same source the milestone banner counts
            from, so the bell and the banner cannot disagree. */}
        <Topbar
          user={topbarUser}
          totalPosts={quota?.total_streak_posts ?? totalPosts}
          title={t('nav.dashboard')}
          icon={<LayoutGrid size={16} strokeWidth={2} className="hidden shrink-0 text-[#4f7fd4] lg:block" />}
        />

        {/* ── Welcome ── The party mark leads, then the greeting on one line.
            The disc stays 52px and the logo fills it to 48px: these symbols are
            drawn on their own coloured circle, so a wide white ring around them
            just makes the mark smaller for no gain. */}
        <div className="mb-7 flex items-center gap-4">
          {welcomeLogo && (
            <span
              className="relative inline-flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-white shadow-[0_0_0_2px_rgba(63,159,255,0.45),0_0_26px_rgba(63,159,255,0.28)]"
              title={currentUser?.political_party || ''}
            >
              <img
                src={welcomeLogo}
                alt={currentUser?.political_party || 'Party'}
                className="h-[48px] w-[48px] object-contain"
                onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
              />
              <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[2.5px] border-[#070b1c] bg-[#22c55e]" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight sm:text-[28px] md:text-[32px]">
              <span className="text-white">{t('dash.welcomeBack')} </span>
              <span className="gradient-text-blue">{first}</span>
            </h1>
            {(currentUser?.political_party || roleName) && (
              <p className="mt-2 inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-[#2a4a8a]/60 bg-[#0d1838]/80 px-3 py-1 text-[13px] font-medium text-[#c7d6ee]">
                {currentUser?.political_party && <span className="truncate">{currentUser.political_party}</span>}
                {currentUser?.political_party && roleName && <span className="text-[#4f7fd4]" aria-hidden="true">·</span>}
                {roleName && <span className="font-semibold text-white">{roleName}</span>}
              </p>
            )}
            <p className="mt-1.5 text-[15px] leading-snug text-[#9aa5c4] md:text-[16.5px]">
              {t('dash.subtitle')}
            </p>
          </div>
        </div>

        {/* ── Today's top story ── The primary action: the latest party,
            opposition and general story in turn, with Generate Post. */}
        <TopStoryCarousel />

        {/* ── Activity ── The four numbers, and the date they are counted to. */}
        <RevealOnScroll delayMs={40} yOffset={15}>
          <section className="mt-8">
            <SectionHeading label={t('dash.activity')} right={datePill} />
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <StatCard
                label={t('dash.postsGenerated')}
                value={dataLoading ? '…' : String(totalPosts)}
                icon={<FileText size={15} strokeWidth={2} />}
                accent="#3f9fff"
              />
              <StatCard
                label={t('dash.publishedPosts')}
                value={dataLoading ? '…' : String(publishedPosts)}
                icon={<Send size={15} strokeWidth={2} />}
                accent="#a855f7"
              />
              <StatCard
                label={t('dash.draftPosts')}
                value={dataLoading ? '…' : String(draftPosts)}
                icon={<FileText size={15} strokeWidth={2} />}
                accent="#22c55e"
              />
              <StatCard
                label={t('dash.preferencesSet')}
                value={dataLoading ? '…' : String(prefsAnswered)}
                icon={<SlidersHorizontal size={15} strokeWidth={2} />}
                accent="#ffb056"
              />
            </div>
          </section>
        </RevealOnScroll>

        {/* ── Analytics ── */}
        <RevealOnScroll delayMs={40} yOffset={15}>
          <section className="mt-8">
            <SectionHeading label={t('dash.secAnalytics')} />
            <div className="grid gap-4 lg:grid-cols-2">
              <SearchActivityChart posts={posts} anchor={anchorDate} />
              <DailyActivityChart posts={posts} anchor={anchorDate} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <CategoriesPieChart posts={posts} />
              <ImageGenerationCard postCount={totalPosts} />
            </div>
          </section>
        </RevealOnScroll>

        {/* ── Quick actions ──
            The header's Generate button used to be the only way in. These
            surface the destinations directly, below the analytics: the top
            story card is the dashboard's main way into post generation. */}
        <RevealOnScroll delayMs={40} yOffset={15}>
          <section className="mt-8">
            <SectionHeading label={t('dash.secQuickActions')} />
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
              {QUICK_ACTIONS.map(({ labelKey, descKey, Icon, route, accent }) => (
                <button
                  key={labelKey}
                  type="button"
                  onClick={() => navigate(route)}
                  className="dash-tile dash-hover group flex items-center gap-3.5 p-4 text-left"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${accent}1f`, color: accent, boxShadow: `inset 0 0 0 1px ${accent}2e` }}
                  >
                    <Icon size={18} strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-[14.5px] font-semibold text-white">{t(labelKey)}</span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-[#8b94b8]">{t(descKey)}</span>
                  </span>
                  <ChevronRight
                    size={16}
                    strokeWidth={2}
                    className="cta-arrow ml-auto shrink-0"
                    style={{ color: accent }}
                  />
                </button>
              ))}
            </div>
          </section>
        </RevealOnScroll>

        {/* ── Account ── Who you are, what you are allowed today, and the
            preferences every generated post is written against. */}
        <RevealOnScroll delayMs={40} yOffset={15}>
          <section id="profile-section" className="mt-8 scroll-mt-24">
            <SectionHeading label={t('dash.secAccount')} />
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="flex flex-col gap-4">
                <ProfileCard user={profileUser} />
                <DailyQuotaWidget quota={quota} loading={quotaLoading} />
              </div>
              <div className="lg:col-span-2">
                <PreferencesCard answers={profileAnswers} />
              </div>
            </div>
          </section>
        </RevealOnScroll>

        {/* ── Recent content ── */}
        <RevealOnScroll delayMs={40} yOffset={15}>
          <section className="mt-8">
            <SectionHeading label={t('dash.secRecent')} />
            <div className="grid gap-4">
              <RecentSearchesTable posts={posts} loading={dataLoading} />
              <SavedPromptsGrid posts={posts.filter((p) => p.status === 'published')} />
            </div>
          </section>
        </RevealOnScroll>

        {/* ── BheemBot + Achievements ── Both carry their own titles, so this
            row is left without a section marker. */}
        <RevealOnScroll delayMs={40} yOffset={15}>
          <section className="mt-8 grid gap-4 lg:grid-cols-3">
            <div className="dash-panel relative flex flex-col overflow-hidden p-4 sm:p-5">
              <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-[#2d6fff]/18 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-10 -left-10 h-24 w-24 rounded-full bg-[#22c55e]/10 blur-2xl" />

              {/* flex-1 + mt-auto on the button: beside the achievements grid
                  this card is stretched to the row's height, and without it
                  the bottom half was empty. */}
              <div className="relative flex flex-1 flex-col">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#2d6fff] to-[#7b5cff] shadow-[0_0_18px_rgba(79,107,255,0.4)]">
                    <Bot size={18} strokeWidth={2} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-display text-[15px] font-semibold text-white">{t('bot.title')}</h3>
                    <div className="flex items-center gap-2">
                      <span className="dot-online relative h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
                      <span className="text-[11px] text-[#22c55e]">{t('dash.online')}</span>
                    </div>
                  </div>
                </div>

                <p className="mb-4 text-[12.5px] leading-relaxed text-[#8b94b8]">
                  {t('dash.bheembotDesc')}
                </p>

                <div className="mb-4 flex flex-wrap gap-1.5">
                  {['bot.tagConstitution', 'bot.tagJustice', 'bot.tagWritings'].map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-[#1e3260]/60 bg-[#0a1428]/70 px-2.5 py-1 text-[10.5px] text-[#7f92b8]"
                    >
                      {t(tag)}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => navigate('/bhimbot')}
                  className="group mt-auto inline-flex w-fit items-center gap-2 rounded-xl btn-gradient px-4 py-2.5 text-[13px] font-semibold text-white shadow-[0_8px_22px_rgba(45,111,255,0.32)]"
                >
                  <Sparkles size={13} strokeWidth={2} />
                  {t('dash.openChat')}
                </button>
              </div>
            </div>

            {/* Achievements — takes remaining 2 cols */}
            <div className="lg:col-span-2">
              <AchievementsGrid totalPosts={totalPosts} prefsAnswered={prefsAnswered} />
            </div>
          </section>
        </RevealOnScroll>

        <DashboardFooter />
      </div>{/* end px wrapper */}
    </>
  );
}
