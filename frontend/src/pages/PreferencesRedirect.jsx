import { Navigate, useLocation } from 'react-router-dom';

/**
 * /preferences is a tab of Settings now. Old links land on "Your voice"; the
 * return from Reddit's sign-in (which carries ?reddit=...) lands on Accounts
 * with its query intact, so the "connected as u/..." message still shows.
 */
export default function PreferencesRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  // The Accounts tab is gone; everything lands on "Your voice".
  params.delete('reddit');
  params.set('tab', 'voice');
  return <Navigate to={`/settings?${params.toString()}`} replace />;
}
