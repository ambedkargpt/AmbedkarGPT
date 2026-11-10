import { Lock } from 'lucide-react';

import { useI18n } from '../../i18n/index.jsx';
import { useGuestSignUp } from '../../utils/guestAccess';

/**
 * In place of a post's actions for a guest account (see utils/guestAccess.js).
 * `compact`: one small button for cards and toolbars; otherwise a panel saying
 * what is locked and offering to sign up.
 */
export default function GuestLock({ compact = false, className = '' }) {
  const { t } = useI18n();
  const signUp = useGuestSignUp();

  if (compact) {
    return (
      <button
        type="button"
        onClick={signUp}
        title={t('guest.locked.body')}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#f0a04b]/60 bg-[#f0a04b]/10 px-3.5 text-[14px] font-semibold text-[#ffe2bd] transition hover:border-[#f0a04b] hover:bg-[#f0a04b]/20 hover:text-white ${className}`}
      >
        <Lock size={14} strokeWidth={2.2} aria-hidden="true" />
        {t('guest.locked.short')}
      </button>
    );
  }

  return (
    <div className={`rounded-[16px] border border-[#f0a04b]/45 bg-[#f0a04b]/[0.08] p-4 ${className}`}>
      <p className="flex items-center gap-2 text-[16px] font-bold text-[#ffe2bd]">
        <Lock size={17} strokeWidth={2.2} aria-hidden="true" /> {t('guest.locked.title')}
      </p>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-[#e9d6bd]">{t('guest.locked.body')}</p>
      <button
        type="button"
        onClick={signUp}
        className="mt-3.5 inline-flex h-12 w-full items-center justify-center rounded-[14px] bg-[#2d6fff] px-4 text-[15.5px] font-bold text-white shadow-[0_0_18px_rgba(45,111,255,0.35)] transition hover:bg-[#3d7fff]"
      >
        {t('guest.locked.cta')}
      </button>
    </div>
  );
}
