import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import AgLogo from './brand/AgLogo';
import { useAuth } from '../context/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';
import { SITE_LANGUAGES } from '../utils/siteLanguage';
import { useI18n } from '../i18n/index.jsx';
import { RADIO_REQUIRES_LOGIN } from '../data/radioAccess';

// action: 'scroll' (default) | 'bheembot' | 'dashboard' | 'radio' | 'section:<id>'
const navItems = [
  { key: 'nav.homeCaps',     sectionId: 'home' },
  { key: 'nav.corpusCaps',   sectionId: 'ambedkarverse' },
  { key: 'nav.servicesCaps', sectionId: 'services' },
  { key: 'nav.bheemCaps',    sectionId: 'bheem',   action: 'bheembot' },
  { key: 'nav.radioCaps',    sectionId: 'radio',   action: 'radio' },
  { key: 'nav.contactCaps',  sectionId: 'contact' },
];

// Off the landing page there are no sections to scroll-track, so the item to
// light is the page itself. Anything not listed lights nothing: /about is not
// "home", and claiming it is told the reader they were somewhere they were not.
const ITEM_FOR_PATH = {
  '/bhimradio': 'radio',
  '/bhimbot': 'bheem',
  '/contact': 'contact',
};

export default function Navbar() {
  const { t, lang, changeLanguage } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const [active,   setActive]   = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const headerRef  = useRef(null);

  // Highlight nav item based on scroll position
  useEffect(() => {
    if (location.pathname !== '/') return;
    // Only observe sections that actually scroll — skip items that navigate away
    const scrollItems = navItems.filter((i) => !i.action || i.action.startsWith('section:'));
    const ids = scrollItems.map((i) => i.sectionId);
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: [0.1, 0.5, 1] }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [location.pathname]);

  // Close dropdown when clicking outside the header
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e) {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e) { if (e.key === 'Escape') setMenuOpen(false); }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  // On the landing page the scroll position decides; anywhere else the path
  // does. `active` used to be the only source, and it starts as 'home', so
  // every other page - the radio included - showed HOME as the current one.
  const current = location.pathname === '/'
    ? active
    : (ITEM_FOR_PATH[location.pathname] ?? null);

  // Close dropdown on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);


  function scrollToSection(id) {
    if (location.pathname === '/') {
      const target = document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      sessionStorage.setItem('pending-section-scroll', id);
      navigate('/');
    }
  }

  function handleNav(item) {
    setActive(item.sectionId);
    setMenuOpen(false);

    // The radio is a standalone page now - anyone can listen, signed in or
    // not. The login handshake below is the wall coming back: it is only
    // taken when VITE_RADIO_REQUIRES_LOGIN is set, which is how to put it
    // back once there are enough users to want an account behind it.
    if (item.action === 'radio') {
      if (currentUser || !RADIO_REQUIRES_LOGIN) {
        navigate('/bhimradio');
      } else {
        sessionStorage.setItem('auth_redirect', '/bhimradio');
        navigate('/login');
      }
      return;
    }

    if (item.action === 'bheembot') {
      if (currentUser) {
        navigate('/bhimbot');
      } else {
        sessionStorage.setItem('auth_redirect', '/bhimbot');
        navigate('/login');
      }
      return;
    }

    if (item.action === 'dashboard') {
      if (currentUser) {
        navigate('/dashboard');
      } else {
        sessionStorage.setItem('auth_redirect', '/dashboard');
        navigate('/login');
      }
      return;
    }

    if (item.action?.startsWith('section:')) {
      scrollToSection(item.action.split(':')[1]);
      return;
    }

    scrollToSection(item.sectionId);
  }

  return (
    <header
      ref={headerRef}
      // While the menu is open the bar goes solid and drops its blur: a
      // backdrop-filter on the header stops the menu (its child) from
      // painting its own background in Chromium, and the page showed through.
      className={`fixed inset-x-0 top-0 z-40 border-b border-[#1a2c55]/40 shadow-[0_8px_32px_rgba(0,0,0,0.35)] ${
        menuOpen ? 'bg-[#060a18]' : 'bg-[rgba(6,10,24,0.55)] backdrop-blur-xl'
      }`}
    >
      <div className="mx-auto flex h-[72px] w-full max-w-[1440px] items-center justify-between gap-2 px-4 sm:px-6 md:h-[80px] md:gap-3 md:px-10">

        {/* ── Logo ─────────────────────────────── */}
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2"
          onClick={() => {
            if (location.pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <span className="md:hidden"><AgLogo size={20} animated /></span>
          <span className="hidden md:inline-flex"><AgLogo size={24} animated /></span>
        </Link>

        {/* ── Desktop nav ──────────────────────── */}
        <nav className="hidden items-center gap-7 font-count text-[13px] font-medium tracking-[0.1em] lg:flex">
          {navItems.map((item) => {
            const isActive = current === item.sectionId;
            return (
              <button
                key={item.sectionId}
                type="button"
                onClick={() => handleNav(item)}
                aria-current={isActive ? (location.pathname === '/' ? 'location' : 'page') : undefined}
                className={`relative rounded-md px-3 py-1.5 transition-all duration-200 ${
                  isActive
                    ? 'bg-[#0d1a3a] border border-[#3f6bd4]/60 text-[#3f9fff] shadow-[0_0_12px_rgba(63,159,255,0.18)]'
                    : 'border border-transparent text-white/70 hover:text-[#3f9fff] hover:bg-[#3f9fff]/10 hover:border-[#3f9fff]/30 hover:shadow-[0_0_10px_rgba(63,159,255,0.2)]'
                }`}
              >
                {t(item.key)}
              </button>
            );
          })}
        </nav>

        {/* ── Right cluster: hamburger + CTAs ─── */}
        {/* Phones: Get Started, then the menu at the edge. The language
            switch moves into the menu below sm, where the bar had room for
            three controls and the CTA ran off the screen. */}
        <div className="flex min-w-0 shrink-0 items-center gap-2 md:gap-3">

          {/* Hamburger — mobile/tablet only */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="order-last flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white/80 transition hover:border-white/30 hover:text-white sm:h-9 sm:w-9 lg:hidden"
          >
            {menuOpen
              ? <X    size={16} strokeWidth={1.8} />
              : <Menu size={18} strokeWidth={1.8} />
            }
          </button>

          <div className="hidden sm:block"><LanguageSwitcher /></div>

          <Link
            to="/login"
            className="hidden h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-[#3f9fff]/50 bg-[#3f9fff]/10 px-4 font-count text-[13px] font-semibold text-[#7fc8ff] shadow-[0_0_14px_rgba(63,159,255,0.15)] transition hover:border-[#3f9fff]/80 hover:bg-[#3f9fff]/20 hover:text-white hover:shadow-[0_0_20px_rgba(63,159,255,0.3)] sm:inline-flex md:h-10 md:px-5 md:text-[13.5px]"
          >
            {t('nav.login')}
          </Link>
          <Link
            to="/signup"
            className="inline-flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-linear-to-r from-[#0a7dff] to-[#3a9fff] px-4 font-count text-[13px] font-semibold text-white shadow-[0_4px_14px_rgba(17,122,255,0.4)] transition hover:-translate-y-0.5 hover:brightness-110 sm:h-8 sm:px-3.5 sm:text-[11.5px] md:h-10 md:px-5 md:text-[13px] md:shadow-[0_6px_24px_rgba(17,122,255,0.45)]"
          >
            {t('nav.getStarted')}
          </Link>
        </div>
      </div>

      {/* ── Mobile dropdown menu ─────────────── */}
      {menuOpen && (
        <div
          className="absolute inset-x-0 top-full z-10 max-h-[calc(100dvh-72px)] overflow-y-auto border-b border-[#1a2c55]/50 bg-[#050814] lg:hidden"
          style={{ animation: 'nav-dropdown 160ms ease-out both' }}
        >
          <nav className="mx-auto w-full max-w-[1440px] px-4 py-2">
            {navItems.map((item) => {
              const isActive = current === item.sectionId;
              return (
                <button
                  key={item.sectionId}
                  type="button"
                  onClick={() => handleNav(item)}
                  aria-current={isActive ? (location.pathname === '/' ? 'location' : 'page') : undefined}
                  className={[
                    `flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left font-medium transition-all duration-150 ${
                      lang === 'hi' ? 'text-[15px]' : 'font-count text-[11.5px] tracking-[0.14em]'
                    }`,
                    isActive
                      ? 'bg-[#0d1a36] text-[#3f9fff] border border-[#3f6bd4]/35'
                      : 'border border-transparent text-white/70 hover:text-[#3f9fff] hover:bg-[#3f9fff]/10 hover:border-[#3f9fff]/25',
                  ].join(' ')}
                >
                  {isActive && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#3f9fff] shadow-[0_0_7px_rgba(63,159,255,0.8)]" />
                  )}
                  {t(item.key)}
                </button>
              );
            })}

            {/* Log in lives here below sm, where the bar has room for one CTA
                only. From sm upward it is back in the bar and this is hidden,
                so nothing is lost at any width. */}
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className={`mt-1 flex w-full items-center gap-3 rounded-xl border border-[#3f9fff]/40 bg-[#3f9fff]/10 px-4 py-3 text-left font-semibold text-[#7fc8ff] sm:hidden ${
                lang === 'hi' ? 'text-[15px]' : 'font-count text-[12px] tracking-[0.14em]'
              }`}
            >
              {t('nav.login')}
            </Link>

            {/* Language, here on phones (the bar keeps the globe from sm). */}
            <div className="mb-1 mt-2 flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-2.5 sm:hidden">
              <span className={`font-medium text-white/60 ${lang === 'hi' ? 'text-[14px]' : 'font-count text-[11.5px] tracking-[0.14em]'}`}>{t('lang.heading')}</span>
              <div role="group" aria-label={t('lang.change')} className="flex rounded-full border border-[#2a4375]/80 p-0.5">
                {SITE_LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    type="button"
                    aria-pressed={lang === l.code}
                    onClick={() => changeLanguage(l.code)}
                    className="min-h-8 rounded-full px-3.5 text-[13px] font-semibold transition"
                    style={lang === l.code ? { background: '#EDEEF2', color: '#0a0e18' } : { color: '#a3b0d4' }}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
