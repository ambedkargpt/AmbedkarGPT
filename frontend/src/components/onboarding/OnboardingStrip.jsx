import { Link } from 'react-router-dom';
import { UserCog, ArrowRight } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import usePendingQuestions, { onboardingStep } from '../../hooks/usePendingQuestions';
import { useI18n } from '../../i18n/index.jsx';

/**
 * What a signed-in account still has to set up, said at the top of the app
 * rather than by taking the user somewhere.
 *
 * Accounts used to be sent to the profile screen or the questionnaire from
 * whatever page they opened, the moment the check came back - so someone who
 * signed in with Google just to look around was pulled into a form at random.
 * Nothing is forced now: this strip says what is missing and links to it, and
 * only the post generator, which cannot work without it, is locked (see
 * OnboardingGate).
 *
 * `profile` is a party (and, where the party's questions depend on it, a
 * position); `position` is the preference questions for that position.
 */
export default function OnboardingStrip() {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const { pending, checked } = usePendingQuestions(currentUser?.id);
  const step = checked ? onboardingStep(pending) : null;
  if (!step) return null;

  const to = step === 'profile' ? '/profile-setup' : '/questionnaire';
  return (
    <div
      role="status"
      className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#f0a04b]/35 bg-gradient-to-r from-[#2a1a06] via-[#1f1608] to-[#141026] px-4 py-2.5 sm:px-6 md:px-10"
    >
      <p className="flex min-w-0 items-center gap-2.5 text-[13.5px] text-[#f5d9b0]">
        <UserCog size={16} strokeWidth={2} className="shrink-0 text-[#f0a04b]" />
        <span>{t(step === 'profile' ? 'onboard.stripProfile' : 'onboard.stripPreferences')}</span>
      </p>
      <Link
        to={to}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#f0a04b] px-3.5 py-1.5 text-[12.5px] font-semibold text-[#1a0f02] transition hover:brightness-110"
      >
        {t(step === 'profile' ? 'onboard.setUpProfile' : 'onboard.answerPreferences')}
        <ArrowRight size={13} strokeWidth={2.4} />
      </Link>
    </div>
  );
}
