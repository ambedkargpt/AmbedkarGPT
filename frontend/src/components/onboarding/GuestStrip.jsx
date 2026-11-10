import { Link, useNavigate } from 'react-router-dom';
import { UserRound } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../i18n/index.jsx';

/**
 * Across the top of the news for a guest.
 *
 * Two kinds of guest:
 *  - no account at all (opened the news without signing in): reading only,
 *    with the two ways to get an account;
 *  - a guest account (`partyName` given, from "Continue as guest"): it can
 *    write posts, and the strip says so and offers to sign up to keep them.
 *    Sign up ends the guest session first, so the new account starts clean.
 */
export default function GuestStrip({ partyName }) {
  const { t } = useI18n();
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function signUp() {
    try { await logout(); } catch { /* the session is dropped locally either way */ }
    navigate('/signup');
  }

  const btnOutline = 'inline-flex h-10 items-center rounded-full border border-[#3a6bc4]/70 px-4 text-[14px] font-semibold text-[#dbe6ff] transition hover:border-[#6b9bff] hover:bg-[#3a6bc4]/20 hover:text-white';
  const btnSolid = 'inline-flex h-10 items-center rounded-full bg-[#2d6fff] px-4 text-[14px] font-semibold text-white shadow-[0_0_18px_rgba(45,111,255,0.35)] transition hover:bg-[#3d7fff]';

  return (
    <div
      role="status"
      className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#3a6bc4]/40 bg-gradient-to-r from-[#0d1b3e] via-[#0f2250] to-[#141a3c] px-4 py-3 sm:px-6 md:px-10"
    >
      <p className="flex min-w-0 items-center gap-3 text-[15px] text-[#dbe6ff]">
        <UserRound size={18} strokeWidth={2} className="shrink-0 text-[#8fb0ff]" aria-hidden="true" />
        {partyName ? (
          <span>
            <strong className="font-semibold text-white">{t('guest.accountTitle', { party: partyName })}</strong>{' '}
            <span className="text-[#b4c2e2]">{t('guest.accountBody')}</span>
          </span>
        ) : (
          <span>
            <strong className="font-semibold text-white">{t('guest.stripTitle')}</strong>{' '}
            <span className="text-[#b4c2e2]">{t('guest.stripBody')}</span>
          </span>
        )}
      </p>
      <div className="flex shrink-0 items-center gap-2.5">
        {partyName ? (
          <button type="button" onClick={signUp} className={btnSolid}>{t('guest.signUp')}</button>
        ) : (
          <>
            <Link to="/login" className={btnOutline}>{t('guest.logIn')}</Link>
            <Link to="/signup" className={btnSolid}>{t('guest.signUp')}</Link>
          </>
        )}
      </div>
    </div>
  );
}
