import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutGrid,
  Search,
  SlidersHorizontal,
  Bookmark,
  BarChart3,
  User,
  Settings,
  Bot,
  Radio,
  X,
  LogOut,
  Sparkles,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import logoSrc from '../../assets/images/logo-animation.webp';
import { useI18n } from '../../i18n/index.jsx';
import { useRadio } from '../../context/RadioContext';
import { RADIO_REQUIRES_LOGIN } from '../../data/radioAccess';

// Generating a post is the product's primary action, so it leads the nav and is
// styled as a call to action rather than another list item.
const PRIMARY = { id: 'generate', labelKey: 'nav.generate', Icon: Sparkles, route: '/generate' };

// `soon: true` marks a destination that does not exist yet. Rendering these as
// plain items made them look broken: clicking did nothing and gave no feedback.
const ALL_NAV = [
  { id: 'dashboard',  labelKey: 'nav.dashboard',        Icon: LayoutGrid },
  { id: 'bheembot',   labelKey: 'dash.bheembot',         Icon: Bot, route: '/bhimbot' },
  { id: 'radio',      labelKey: 'radio.title',            Icon: Radio, route: '/bhimradio' },
  { id: 'searches',   labelKey: 'nav.postHistory',     Icon: Search, route: '/posts' },
  { id: 'prefs',      labelKey: 'nav.preferences',      Icon: SlidersHorizontal, route: '/preferences' },
  { id: 'saved',      labelKey: 'nav.savedPrompts',    Icon: Bookmark, soon: true },
  { id: 'analytics',  labelKey: 'nav.analytics',        Icon: BarChart3, soon: true },
  { id: 'profile',    labelKey: 'nav.profile',          Icon: User, route: '/profile-setup' },
  { id: 'settings',   labelKey: 'nav.settings',         Icon: Settings, soon: true },
];

// The radio is a standalone public page for now, reached from the navbar or a
// shared link, so it has no row in the rail. It comes back with the login wall
// (see data/radioAccess.js), which is when it is a signed-in feature again.
const NAV = ALL_NAV.filter((item) => item.id !== 'radio' || RADIO_REQUIRES_LOGIN);

// The rail remembers whether it was collapsed. It frames every signed-in
// screen, so a state that reset on navigation would be a state nobody could
// use: collapse it on the dashboard, open the generator, and it is wide again.
const COLLAPSED_KEY = 'ambedkargpt_sidebar_collapsed';

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}

// Every label stays in the row while the rail narrows: the width clips it and
// it fades, the way the panel in the reference recording closes. Removing it
// from the DOM made each row re-centre its icon on the first frame, so the
// whole rail jumped before the width had started to move.
function fadeCls(collapsed) {
  return `whitespace-nowrap transition-opacity duration-300 ease-out motion-reduce:transition-none ${
    collapsed ? 'pointer-events-none opacity-0' : 'opacity-100 delay-150'
  }`;
}

function SidebarContent({ active, onSelect, onClose, onLogout, collapsed = false, onToggleCollapse }) {
  // Read, never controlled: the rail reports the broadcast, it does not drive
  // it. Both copies of the rail - the desktop column and the mobile drawer -
  // render through here, so the note cannot appear on one and not the other.
  const { station, playing } = useRadio();
  const radioState = playing ? 'tuned' : station ? 'onair' : null;

  const { t } = useI18n();
  // Signing out calls the API to revoke the refresh token before it clears the
  // session, so there is a round trip to show. Without a state the button just
  // sat there looking unpressed, and on a slow connection people clicked it
  // twice.
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    onClose?.();
    try {
      await onLogout();
    } finally {
      // The dashboard unmounts on success, so this only runs when logout
      // failed and the button has to become usable again.
      setLoggingOut(false);
    }
  }

  // Collapsed, a row is its icon and nothing else, so the name has to arrive
  // some other way. The native tooltip is enough here and costs no markup,
  // no positioning and no library.
  const tip = (label) => (collapsed ? label : undefined);

  const navigate = useNavigate();
  const fade = fadeCls(collapsed);
  return (
    <>
      {/* The masthead. It used to say "Dashboard" — a wordmark for the page
          you were already on, above a nav item of the same name. This is the
          product's own mark, and it is the one place the brand is stated on a
          signed-in screen. Collapsed, the mark stands in for the whole thing. */}
      <div className="relative flex items-center gap-2.5 px-5 pt-5 pb-5 lg:pt-6">
        {/* Collapsed, the toggle has nowhere to sit, so the mark opens the
            rail again (it shows the arrow on hover); open, it goes home. */}
        <button
          type="button"
          onClick={() => {
            if (collapsed && onToggleCollapse) { onToggleCollapse(); return; }
            navigate('/dashboard'); onClose?.();
          }}
          className="group/mark flex min-w-0 flex-1 items-center gap-2.5 text-left transition-opacity hover:opacity-85"
          aria-label={collapsed && onToggleCollapse ? t('side.expand') : t('nav.dashboard')}
          title={collapsed && onToggleCollapse ? t('side.expand') : undefined}
        >
          <span
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#3f7fd8]/45"
            style={{
              background: 'radial-gradient(70% 70% at 50% 35%, rgba(45,111,255,0.3) 0%, rgba(8,14,36,0.9) 70%)',
              boxShadow: 'inset 0 1px 0 rgba(160,205,255,0.22), 0 0 16px rgba(63,159,255,0.2)',
            }}
          >
            <img
              src={logoSrc}
              alt=""
              className="h-[27px] w-[27px] object-contain"
              style={{ filter: 'brightness(1.7) saturate(1.25)' }}
            />
            {collapsed && onToggleCollapse && (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-[#0c1330]/90 text-white opacity-0 transition-opacity duration-150 group-hover/mark:opacity-100">
                <ChevronRight size={16} strokeWidth={2.2} />
              </span>
            )}
          </span>
          <span className={`min-w-0 ${onToggleCollapse ? 'pr-8' : ''} ${fade}`}>
              {/* 14px rather than 16. With the line underneath it the two read
                  as one mark; at 16 the name was a few pixels from losing its
                  GPT to the truncation whenever the toggle sat beside it. */}
              <span className="block truncate font-display text-[14px] font-bold leading-none tracking-tight">
                <span className="text-white">{t('brand.ambedkar')}</span>
                <span className="gradient-text-cyan">GPT</span>
              </span>
              <span className="mt-[3px] block truncate text-[10.5px] font-medium leading-none text-[#5f7099]">
                {t('splash.tagline')}
              </span>
          </span>
        </button>

        {/* An outlined square rather than a bare icon, so it reads as a control
            sitting beside the brand instead of a stray glyph in the row.

            Only the desktop rail passes a toggle, so the drawer never draws
            one: a drawer that collapses to a strip is a drawer that should
            close. */}
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className={`absolute right-4 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg border border-[#22315c] bg-[#0c1330] text-[#6b83ab] transition hover:border-[#3f6bd4]/70 hover:bg-[#101a3c] hover:text-white lg:mt-0.5 ${
              collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
            }`}
            aria-label={t('side.collapse')}
            aria-expanded={!collapsed}
            aria-hidden={collapsed || undefined}
            tabIndex={collapsed ? -1 : undefined}
            title={t('side.collapse')}
          >
            <ChevronLeft size={16} strokeWidth={2.2} />
          </button>
        )}

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#5a7a9e] transition hover:text-white lg:hidden"
            aria-label={t('side.closeMenu')}
          >
            <X size={17} strokeWidth={1.8} />
          </button>
        )}
      </div>

      {/* nav */}
      <nav className="flex-1 space-y-1.5 px-4">
        {/* Primary action */}
        <button
          type="button"
          onClick={() => { navigate(PRIMARY.route); onClose?.(); }}
          className="group mb-3 flex w-full items-center gap-2.5 overflow-hidden rounded-xl px-3.5 py-3 text-[14px] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110"
          style={{
            background: 'linear-gradient(135deg, #1a5fff 0%, #3f9fff 100%)',
            // On the services page this button is where you already are, so it
            // wears the active ring instead of a second nav row saying so.
            boxShadow: active === PRIMARY.id
              ? '0 0 0 2px rgba(150,200,255,0.55), 0 6px 22px rgba(26,95,255,0.45)'
              : '0 6px 22px rgba(26,95,255,0.38)',
          }}
          aria-current={active === PRIMARY.id ? 'page' : undefined}
          title={tip(t(PRIMARY.labelKey))}
        >
          <PRIMARY.Icon size={17} strokeWidth={2} className="shrink-0" />
          <span className={fade}>{t(PRIMARY.labelKey)}</span>
          <ChevronRight
            size={15}
            strokeWidth={2}
            className={`ml-auto shrink-0 transition-[transform,opacity] duration-300 group-hover:translate-x-0.5 ${collapsed ? 'opacity-0' : 'opacity-100'}`}
          />
        </button>

        {NAV.map((item) => {
          const isActive = item.id === active;
          const IconComp = item.Icon;
          if (item.soon) {
            // Not navigable yet — say so instead of failing silently on click.
            return (
              <div
                key={item.id}
                title={`${t(item.labelKey)} — ${t('nav.comingSoonSuffix')}`}
                aria-disabled="true"
                className="flex w-full cursor-not-allowed items-center gap-3 overflow-hidden rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium text-[#4d587a]"
              >
                <IconComp size={17} strokeWidth={1.8} className="shrink-0" />
                <span className={fade}>{t(item.labelKey)}</span>
                <span className={`ml-auto rounded-full bg-[#141d3a] px-1.5 py-0.5 font-count text-[11px] uppercase tracking-wider text-[#5a6e9a] ${fade}`}>
                  {t('nav.soonBadge')}
                </span>
              </div>
            );
          }
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.route) { navigate(item.route); }
                else { onSelect?.(item.id); }
                onClose?.();
              }}
              title={tip(t(item.labelKey))}
              className={[
                'group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-all duration-200',
                isActive
                  ? 'text-white'
                  : 'text-[#7b88ad] hover:text-[#c7d1eb] hover:bg-[#0f173a]/70',
              ].join(' ')}
              style={
                isActive
                  ? {
                      background:
                        'linear-gradient(90deg, rgba(63,110,255,0.32) 0%, rgba(79,107,255,0.12) 100%)',
                      border: '1px solid rgba(79,135,255,0.28)',
                      boxShadow: '0 4px 18px rgba(15,40,100,0.35)',
                    }
                  : { border: '1px solid transparent' }
              }
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-gradient-to-b from-[#3f9fff] to-[#7b5cff]" />
              )}
              <IconComp size={17} strokeWidth={1.8} className="shrink-0" />
              <span className={fade}>{t(item.labelKey)}</span>
              {/* The station runs whether or not anyone has it open, so the
                  rail says so: ON AIR when it is broadcasting, TUNED IN when
                  this listener is the one hearing it. */}
              {item.id === 'radio' && radioState && (
                <span
                  className={`ml-auto flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] ${fade}`}
                  style={{ color: radioState === 'tuned' ? '#3f9fff' : '#ff6b5a' }}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${radioState === 'tuned' ? '' : 'motion-safe:animate-pulse'}`}
                    style={{ background: 'currentColor' }}
                  />
                  {radioState === 'tuned' ? t('radio.tunedIn') : t('ticker.label')}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-4 pb-4 pt-2">
        {onLogout && (
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            title={tip(t('auth.logout'))}
            className="flex w-full items-center gap-3 overflow-hidden rounded-xl border-t border-[#141d3a]/70 px-3.5 py-3 text-[13.5px] font-medium text-[#7b88ad] transition hover:bg-[#0f173a]/70 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-transparent disabled:hover:text-[#7b88ad]"
          >
            {loggingOut ? (
              <>
                <span className="spinner-ring shrink-0" style={{ width: 17, height: 17, borderWidth: 2 }} />
                <span className={fade}>{t('auth.signingOut')}</span>
              </>
            ) : (
              <>
                <LogOut size={17} strokeWidth={1.8} className="shrink-0" />
                <span className={fade}>{t('auth.logout')}</span>
              </>
            )}
          </button>
        )}
        {/* The version line has no short form, so collapsed it fades out. */}
        <div className={`px-2 pt-2 text-[11px] font-count text-[#4e5a80] tracking-wide ${fade}`}>
          v1.0 · AmbedkarGPT
        </div>
      </div>
    </>
  );
}

export default function Sidebar({ active = 'dashboard', onSelect, mobileOpen = false, onMobileClose, onLogout }) {
  // Read once, on the first render, rather than in an effect: starting wide and
  // narrowing a frame later is a visible jump on every page load.
  const [collapsed, setCollapsed] = useState(readCollapsed);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  // Escape closes the drawer, and the first item in it takes focus when it
  // opens, so the drawer can be operated without a pointer.
  const drawerRef = useRef(null);
  useEffect(() => {
    if (!mobileOpen) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onMobileClose?.();
    }
    document.addEventListener('keydown', onKey);
    drawerRef.current?.querySelector('button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      {/* Desktop sidebar. The width eases while every icon keeps its place
          (76px is exactly the nav's padding plus a row's, so the icons already
          sit centred in it) and the labels are clipped and faded rather than
          removed. They never wrap mid-way: each one is whitespace-nowrap. */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 overflow-hidden border-r border-[#141d3a]/70 transition-[width] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
          collapsed ? 'w-[76px]' : 'w-[252px]'
        }`}
        style={{ background: 'linear-gradient(180deg,#0a1024 0%,#070b1c 100%)' }}
      >
        <SidebarContent
          active={active}
          onSelect={onSelect}
          onLogout={onLogout}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
        />
      </aside>

      {/* Mobile drawer. The backdrop carries the dim and the blur itself —
          before, the page behind was blurred and the drawer took half the
          screen, which read as the page having broken rather than a panel
          having opened. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="dash-backdrop absolute inset-0 bg-[#03060f]/78 backdrop-blur-[3px]"
            onClick={onMobileClose}
          />
          <aside
            ref={drawerRef}
            className="dash-drawer absolute left-0 top-0 flex h-full w-[min(82vw,320px)] flex-col border-r border-[#243665]/80 shadow-[16px_0_48px_rgba(0,0,0,0.55)]"
            style={{ background: 'linear-gradient(180deg,#0a1024 0%,#070b1c 100%)' }}
          >
            <SidebarContent active={active} onSelect={onSelect} onClose={onMobileClose} onLogout={onLogout} />
          </aside>
        </div>
      )}
    </>
  );
}
