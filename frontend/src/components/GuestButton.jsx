import { useNavigate } from 'react-router-dom';
import { ArrowRight, Newspaper } from 'lucide-react';

import { HOME_ROUTE } from '../data/features';
import { useI18n } from '../i18n/index.jsx';

/**
 * "Continue as guest", on the sign-up and login screens.
 *
 * The news can be read without an account (the API serves it to anyone); only
 * writing a post needs one. So the way in is offered here, where someone is
 * deciding whether to sign up, not after they already have. It sits apart from
 * the account buttons, under a rule, and says what a guest gets.
 */
export default function GuestButton() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="space-y-3 border-t border-white/10 pt-6 text-center">
      <button
        type="button"
        onClick={() => navigate(HOME_ROUTE)}
        className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-[#f0a04b]/60 bg-[#f0a04b]/10 px-5 text-[16px] font-semibold text-[#ffe2bd] transition hover:border-[#f0a04b] hover:bg-[#f0a04b]/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0a04b]"
      >
        <Newspaper size={18} strokeWidth={2} aria-hidden="true" />
        {t('guest.continue')}
        <ArrowRight size={17} strokeWidth={2.2} aria-hidden="true" />
      </button>
      <p className="text-[14px] leading-snug" style={{ color: '#a9b6d8' }}>{t('guest.hint')}</p>
    </div>
  );
}
