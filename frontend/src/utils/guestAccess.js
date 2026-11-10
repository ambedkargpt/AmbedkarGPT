import { useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';

/**
 * What a guest account ("Continue as guest") can and cannot do with a post.
 *
 * A guest can read the news and write posts to see what the product does, but
 * cannot take a post away: copy, publish/share, listen (text to speech),
 * translate and edit are for signed-up accounts. Without that, a guest account
 * would be a free, sign-up-less way to produce posts for use. The server refuses
 * the ones it serves (publish, translate, edit) as well; copy and listening
 * happen in the browser, so they are only hidden.
 */
export function useIsGuest() {
  const { currentUser } = useAuth();
  return Boolean(currentUser?.is_guest);
}

/** Ends the guest session and opens sign-up, so the new account starts clean. */
export function useGuestSignUp() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return async () => {
    try { await logout(); } catch { /* the session is dropped locally either way */ }
    navigate('/signup');
  };
}

/** Spread on a guest's post text: it cannot be selected and copied by hand. */
export const noCopyProps = {
  onCopy: (e) => e.preventDefault(),
  onCut: (e) => e.preventDefault(),
  style: { userSelect: 'none', WebkitUserSelect: 'none' },
};
