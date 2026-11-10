import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CurtainProvider } from './context/CurtainContext';
import { RadioProvider } from './context/RadioContext';
import RadioNowPlayingBar from './components/radio/RadioNowPlayingBar';
import MainLayout from './layouts/MainLayout';
import { RADIO_REQUIRES_LOGIN } from './data/radioAccess';
import { usePageViews } from './analytics/usePageViews';
import ProtectedRoute   from './components/ProtectedRoute';

import Home       from './pages/Home';

// Route chunks. Every page used to sit in the entry bundle, so a visitor
// to the landing page downloaded the dashboard, the chatbot, the post
// generator and the music studio before anything could paint. On a weak
// mobile connection that was the difference between a fast load and a
// blank screen for seconds.
const About = lazy(() => import('./pages/About'));
const Solutions = lazy(() => import('./pages/Solutions'));
const Resources = lazy(() => import('./pages/Resources'));
const Contact = lazy(() => import('./pages/Contact'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Otp = lazy(() => import('./pages/Otp'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Questionnaire = lazy(() => import('./pages/Questionnaire'));
const ProfileSetup = lazy(() => import('./pages/ProfileSetup'));
const SignupDetails = lazy(() => import('./pages/SignupDetails'));
const ServiceSelection = lazy(() => import('./pages/ServiceSelection'));
const SocialMediaPostGenerator = lazy(() => import('./pages/SocialMediaPostGenerator'));
const MusicGeneration = lazy(() => import('./pages/MusicGeneration'));
const MusicGenerationStudio = lazy(() => import('./pages/MusicGenerationStudio'));
const Settings = lazy(() => import('./pages/Settings'));
const PreferencesRedirect = lazy(() => import('./pages/PreferencesRedirect'));
const PostHistory = lazy(() => import('./pages/PostHistory'));
const BheemBot = lazy(() => import('./pages/BheemBot'));
// Opened in a new tab from a BheemBot source pill; carries pdf.js, so it is its own chunk.
const BookPage = lazy(() => import('./pages/BookPage'));
const BhimRadio = lazy(() => import('./pages/BhimRadio'));
const Manusmriti = lazy(() => import('./pages/Manusmriti'));
// Admin only. The page itself checks with the API and shows nothing to others.
const AdminErrors = lazy(() => import('./pages/AdminErrors'));
const AdminErrorDetail = lazy(() => import('./pages/AdminErrorDetail'));
import ScrollProgress      from './components/ScrollProgress';
import OpeningSplash       from './components/OpeningSplash';
import LanguagePopup       from './components/LanguagePopup';
import DashboardLayout from './layouts/DashboardLayout';
import { DASHBOARD_ENABLED, HOME_ROUTE, MANUSMRITI_SECTION_ENABLED } from './data/features';
import Spinner             from './components/Spinner';
import { I18nProvider }    from './i18n/index.jsx';
import TransitionCurtain   from './components/TransitionCurtain';
import ErrorBoundary       from './components/ErrorBoundary';
import OnboardingGate       from './components/onboarding/OnboardingGate';
import RouteTitle          from './components/seo/RouteTitle';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Wraps <Routes> and re-keys on every pathname change so the CSS
// pageEnter animation replays on each navigation.
// Screens that share the signed-in frame. Moving between them must not look
// like arriving somewhere new, because the rail does not go anywhere.
// Which paths are the signed-in app, for the page transition's key. The radio
// is one of them only while it sits inside the dashboard shell; as a public
// page it is an ordinary route with its own frame, like /about.
const APP_PATHS = [
  '/dashboard', '/generate', '/preferences', '/posts',
  ...(RADIO_REQUIRES_LOGIN ? ['/bhimradio'] : []),
];

function PageTransition({ children }) {
  const location = useLocation();
  // Keying on the path tells React the tree is a different one, so it throws
  // the old one away and builds it again - rail, collapsed state, scroll
  // position and all. The signed-in screens therefore share one key: the
  // fade belongs to arriving at the app, not to moving around inside it.
  const inApp = APP_PATHS.some((p) => location.pathname.startsWith(p));
  return (
    <div key={inApp ? 'app' : location.pathname} className="page-enter">
      {children}
    </div>
  );
}

// Splash + language popup are for first-time visitors only. Signed-in users
// have already chosen a language, so refreshing should not ask them again.
// Rendered inside AuthProvider so it can read the session, and it waits for
// `loading` to settle — otherwise the popup flashes before auth resolves.
function IntroGate({ stage, onSplashDone, onLanguageDone }) {
  const { currentUser, loading } = useAuth();

  useEffect(() => {
    if (!loading && currentUser && stage !== 'done') onLanguageDone();
  }, [loading, currentUser, stage, onLanguageDone]);

  if (loading || currentUser) return null;
  return (
    <>
      {stage === 'splash'   && <OpeningSplash onDone={onSplashDone} />}
      {stage === 'language' && <LanguagePopup onDone={onLanguageDone} />}
    </>
  );
}

/** Reports one page_view per route change. Renders nothing; it has to live
    inside the router because that is where the location comes from. */
function AnalyticsPageViews() {
  usePageViews();
  return null;
}

export default function App() {
  // stage: 'splash' -> 'language' -> 'done'
  const [stage, setStage] = useState(() => {
    // A book page opens in a new tab from a BheemBot citation, and sessionStorage is per tab,
    // so without this every citation would replay the splash and language prompt first.
    if (window.location.pathname.startsWith('/book/')) return 'done';
    const skip = sessionStorage.getItem('skip-splash') === '1';
    if (skip) sessionStorage.removeItem('skip-splash');
    return skip ? 'done' : 'splash';
  });
  const handleSplashDone   = useCallback(() => setStage('language'), []);
  const handleLanguageDone = useCallback(() => setStage('done'), []);
  const splashDone = stage === 'done';

  return (
    <ErrorBoundary>
    <I18nProvider>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <CurtainProvider>
        <AuthProvider>
        {/* Above the routes on purpose. Every public page mounts its own
            MainLayout, so a radio living in a layout would be torn down and
            recreated on each navigation and the audio would cut out. Here it
            outlives the page the listener is on. */}
        <RadioProvider>
          <IntroGate
            stage={stage}
            onSplashDone={handleSplashDone}
            onLanguageDone={handleLanguageDone}
          />
          <AnalyticsPageViews />
          <TransitionCurtain />
          <ScrollProgress />

          <PageTransition>
          {/* Route chunks load on navigation. The fallback matches the page
              background so a chunk arriving late reads as a pause rather than
              a flash of empty white — but a bare coloured div is
              indistinguishable from a dead page, so it carries a spinner. */}
          <Suspense
            fallback={(
              <div
                className="flex items-center justify-center"
                style={{ minHeight: '100vh', background: '#05081a' }}
              >
                <Spinner size={36} />
              </div>
            )}
          >
          <RouteTitle />
          <Routes>
            {/* public */}
            <Route path="/"          element={<Home splashDone={splashDone} />} />
            <Route path="/about"     element={<About />} />
            <Route path="/solutions" element={<Solutions />} />
            <Route path="/resources" element={<Resources />} />
            <Route path="/contact"   element={<Contact />} />
            {MANUSMRITI_SECTION_ENABLED && <Route path="/manusmriti" element={<Manusmriti />} />}
            <Route path="/book/:volume/:page" element={<BookPage />} />
            <Route path="/login"     element={<Login />} />
            <Route path="/signup"    element={<Signup />} />
            <Route path="/otp"              element={<Otp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />

            {/* Standalone: no account needed, so a link to it works for anyone.
                It gets the public frame - navbar and footer - rather than the
                dashboard rail, because a visitor who has just arrived from a
                shared link has no dashboard to be in. `bare` drops the two
                promotional strips, which on this page would be a milestone
                bar and an announcement of the thing they are already
                looking at. */}
            {!RADIO_REQUIRES_LOGIN && (
              <Route path="/bhimradio" element={<MainLayout bare noNav><BhimRadio /></MainLayout>} />
            )}

            {/* protected */}
            <Route path="/signup/details" element={
              <ProtectedRoute><SignupDetails /></ProtectedRoute>
            } />
            <Route path="/profile-setup" element={
              <ProtectedRoute><ProfileSetup /></ProtectedRoute>
            } />
            <Route path="/questionnaire" element={
              <ProtectedRoute><Questionnaire /></ProtectedRoute>
            } />
            {/* One frame for all of these: the rail is mounted by the layout
                and outlives the screen inside it, so moving between them
                changes only the content column. Before this each page
                rendered its own shell and the whole sidebar was rebuilt. */}
            <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              {/* Switched off, not removed: see data/features.js. */}
              <Route path="/dashboard" element={DASHBOARD_ENABLED ? <Dashboard /> : <Navigate to={HOME_ROUTE} replace />} />
              <Route path="/generate" element={<ServiceSelection />} />
              <Route path="/settings" element={<Settings />} />
              {/* Preferences and accounts are tabs of Settings now. Reddit's
                  sign-in still returns to /preferences, so its ?reddit= result
                  is carried over to the Accounts tab. */}
              <Route path="/preferences" element={<PreferencesRedirect />} />
              <Route path="/posts" element={<PostHistory />} />
              {RADIO_REQUIRES_LOGIN && <Route path="/bhimradio" element={<BhimRadio />} />}
              <Route path="/admin/errors" element={<AdminErrors />} />
              <Route path="/admin/errors/:id" element={<AdminErrorDetail />} />
            </Route>
            <Route path="/generate/social-media" element={
              <ProtectedRoute><OnboardingGate><SocialMediaPostGenerator /></OnboardingGate></ProtectedRoute>
            } />
            <Route path="/generate/music" element={
              <ProtectedRoute><MusicGeneration /></ProtectedRoute>
            } />
            <Route path="/generate/music/:type" element={
              <ProtectedRoute><MusicGenerationStudio /></ProtectedRoute>
            } />
            <Route path="/bhimbot" element={
              <BheemBot />
            } />
            {/* The page was /bheembot until the spelling was corrected. Anyone
                holding that link - a bookmark, a shared message - still lands
                on the page rather than the catch-all redirect to home. */}
            <Route path="/bheembot" element={<Navigate to="/bhimbot" replace />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </PageTransition>
          {/* Shown where the panel is not, so sound is never coming out of a
              page with no visible way to stop it. */}
          <RadioNowPlayingBar />
        </RadioProvider>
        </AuthProvider>
        </CurtainProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
    </I18nProvider>
    </ErrorBoundary>
  );
}
