import { Navigate, useLocation } from 'react-router-dom';

/**
 * /preferences is a tab of Settings now. Old links land on Profile, and so does
 * the return from Reddit's sign-in (which carries ?reddit=...): there is no
 * Accounts or "Your voice" tab any more.
 */
export default function PreferencesRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  // The Accounts and "Your voice" tabs are gone; everything lands on Profile.
  params.delete('reddit');
  params.set('tab', 'profile');
  return <Navigate to={`/settings?${params.toString()}`} replace />;
}
