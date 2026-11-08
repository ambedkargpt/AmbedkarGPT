import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Sidebar from '../components/dashboard/Sidebar';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/index.jsx';
import { labelForId } from '../utils/partyRoles';
import { ShellContext } from './dashboardShellContext';
import OnboardingStrip from '../components/onboarding/OnboardingStrip';
import NewsTicker from '../components/NewsTicker';

/**
 * The frame every signed-in working screen sits in: the navigation on the
 * left, one scrolling column on the right, and the dashboard's atmosphere
 * behind both.
 *
 * Post history, preferences and profile used to each be their own full page
 * with a "back to dashboard" button, so moving between them meant going back
 * to the dashboard first. They share this shell now, and the sidebar is always
 * there to move sideways with.
 */

// Which nav item to light up, by route. The ids are the Sidebar's own.
const ACTIVE_BY_PATH = {
  '/dashboard': 'dashboard',
  '/generate': 'generate',
  '/posts': 'searches',
  '/preferences': 'prefs',
  '/settings': 'profile',
  '/profile-setup': 'profile',
  '/bhimbot': 'bheembot',
  '/bhimradio': 'radio',
  '/admin/errors': 'errors',
};

export default function DashboardShell({ children, background, active: activeProp }) {
  const { logout, currentUser } = useAuth();
  const { lang } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const active = activeProp ?? ACTIVE_BY_PATH[pathname] ?? '';
  const ctx = useMemo(() => ({ openMenu: () => setMobileOpen(true) }), []);

  // The ON AIR strip opens the public station and signs out on the way: the
  // radio is for anyone, and this is the way from the app to it.
  async function openRadio() {
    try { await logout(); } catch { /* still go to the station */ }
    navigate('/bhimradio', { replace: true });
  }

  async function handleLogout() {
    await logout();
    // The landing page, not the login form: signing out is leaving, and being
    // dropped straight onto a form reads as "sign in again" rather than "done".
    navigate('/', { replace: true });
  }

  return (
    <ShellContext.Provider value={ctx}>
      <div
        className="flex h-screen overflow-hidden text-[#e5e7eb]"
        style={{
          background:
            background ??
            // The ground the atmosphere sits on. Two wide pools of navy over a
            // near-black base, rather than one flat radial: the shell frames
            // every working screen, and a single colour behind all of them read
            // as unfinished.
            // The same ground as the news page, so moving between the
            // screens does not change the room you are in.
            'radial-gradient(1100px 650px at 85% -10%, rgba(123,92,255,0.22) 0%, transparent 60%),' +
            'radial-gradient(900px 600px at 15% 0%, rgba(26,95,255,0.22) 0%, transparent 60%),' +
            'radial-gradient(900px 700px at 50% 110%, rgba(240,135,42,0.10) 0%, transparent 60%),' +
            'linear-gradient(180deg, #0a0f26 0%, #070b1c 60%, #060914 100%)',
        }}
      >
        <Sidebar
          wide
          user={{
            name: currentUser?.full_name || currentUser?.username || '—',
            sub: labelForId(currentUser?.party_position || '', currentUser?.political_party || '', lang) || currentUser?.email || '',
            initial: (currentUser?.full_name || currentUser?.username || 'A')[0].toUpperCase(),
          }}
          active={active}
          onSelect={(id) => { if (id === 'dashboard') navigate('/dashboard'); }}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          onLogout={handleLogout}
        />

        {/* A column, so the ticker can sit outside the scrolling element.
            Inside it would have to be sticky, and the Topbar already holds
            sticky top-0 - two of them would land on each other. */}
        <div className="flex min-w-0 flex-1 flex-col">

        {/* While the drawer is open the page behind it must not scroll. This
            is the scrolling element, so the lock goes here rather than on
            body. */}
        <div className={`relative min-h-0 flex-1 overflow-x-hidden ${mobileOpen ? 'overflow-y-hidden' : 'overflow-y-auto'}`}>
          {/* Atmosphere, in the order it stacks: the pools of colour, the shaft
              of light crossing them, a deeper edge, and a trace of grain over
              everything. All of it decorative, none of it clickable. */}
          <div className="dash-bloom" aria-hidden="true" />
          <div className="dash-beam" aria-hidden="true" />
          <div className="dash-vignette" aria-hidden="true" />
          <div className="dash-grain" aria-hidden="true" />

          <OnboardingStrip />
          {children}
        </div>
        {/* The last row of the screen-high column: the bottom of the screen,
            the way a channel runs its crawl. */}
        <NewsTicker className="shrink-0" onOpen={openRadio} />
        </div>
      </div>
    </ShellContext.Provider>
  );
}
