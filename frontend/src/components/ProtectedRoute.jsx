import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps a route so only authenticated users can access it.
 * When unauthenticated, saves the intended path in sessionStorage
 * so Login/Signup can redirect back after a successful auth.
 *
 * It used to also send accounts with an unfinished profile or unanswered
 * preference questions to /profile-setup or /questionnaire, from whatever page
 * they had opened, the moment the check came back. Someone who signed in with
 * Google only to look around was pulled into a form at random. That is now said
 * by the strip at the top of the app (OnboardingStrip), and only the post
 * generator, which cannot work without a profile, is locked (OnboardingGate).
 *
 * `allowGuest` opens the page to someone with no account: the news can be
 * read by anyone (the API serves it to anyone), and the page asks for an
 * account only where one is needed, at the moment of writing a post.
 */
export default function ProtectedRoute({ children, allowGuest = false }) {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // Save the intended destination before redirecting to login
    if (!loading && !currentUser && !allowGuest) {
      const intended = location.pathname + location.search;
      if (intended !== '/login' && intended !== '/signup') {
        sessionStorage.setItem('auth_redirect', intended);
      }
    }
  }, [loading, currentUser, location, allowGuest]);

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1e3260] border-t-brand-cyan" />
    </div>
  );
  if (!currentUser && allowGuest) return children;
  if (!currentUser) return <Navigate to="/" replace />;

  return children;
}
