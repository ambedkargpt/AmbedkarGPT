import { Link } from 'react-router-dom';
import { UserRound } from 'lucide-react';

import { useI18n } from '../../i18n/index.jsx';

/**
 * Across the top of the news for someone reading without an account: what that
 * means (the news is theirs to read; writing a post needs an account) and the
 * two ways to get one. Not shown to a signed-in account.
 */
export default function GuestStrip() {
  const { t } = useI18n();
  return (
    <div
      role="status"
      className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#3a6bc4]/40 bg-gradient-to-r from-[#0d1b3e] via-[#0f2250] to-[#141a3c] px-4 py-3 sm:px-6 md:px-10"
    >
      <p className="flex min-w-0 items-center gap-3 text-[15px] text-[#dbe6ff]">
        <UserRound size={18} strokeWidth={2} className="shrink-0 text-[#8fb0ff]" aria-hidden="true" />
        <span>
          <strong className="font-semibold text-white">{t('guest.stripTitle')}</strong>{' '}
          <span className="text-[#b4c2e2]">{t('guest.stripBody')}</span>
        </span>
      </p>
      <div className="flex shrink-0 items-center gap-2.5">
        <Link
          to="/login"
          className="inline-flex h-10 items-center rounded-full border border-[#3a6bc4]/70 px-4 text-[14px] font-semibold text-[#dbe6ff] transition hover:border-[#6b9bff] hover:bg-[#3a6bc4]/20 hover:text-white"
        >
          {t('guest.logIn')}
        </Link>
        <Link
          to="/signup"
          className="inline-flex h-10 items-center rounded-full bg-[#2d6fff] px-4 text-[14px] font-semibold text-white shadow-[0_0_18px_rgba(45,111,255,0.35)] transition hover:bg-[#3d7fff]"
        >
          {t('guest.signUp')}
        </Link>
      </div>
    </div>
  );
}
