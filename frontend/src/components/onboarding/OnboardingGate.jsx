import { Link, useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, ArrowLeft, Check } from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import usePendingQuestions, { onboardingStep } from '../../hooks/usePendingQuestions';
import { useI18n } from '../../i18n/index.jsx';

/**
 * The post generator, locked until the account is set up.
 *
 * Every post is written as somebody: a party, a position in it, and how they
 * want it to sound. Without those there is nothing to write as, and the API
 * refuses the request anyway (403 onboarding_required) - so instead of letting
 * someone pick a story and then fail, the page says what is missing first.
 * Everything else in the app stays open.
 */
export default function OnboardingGate({ children }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { pending, checked } = usePendingQuestions(currentUser?.id);
  const step = checked ? onboardingStep(pending) : null;
  if (!step) return children;

  const steps = [
    { key: 'profile', label: t('onboard.stepProfile'), done: step !== 'profile', to: '/profile-setup' },
    { key: 'preferences', label: t('onboard.stepPreferences'), done: false, to: '/questionnaire' },
  ];
  const next = steps.find((s) => !s.done);

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: 'radial-gradient(1200px 700px at 20% 0%, #0d1636 0%, #070b1c 55%, #05081a 100%)' }}
    >
      <div className="w-full max-w-[460px] rounded-2xl border border-[#1e3260]/80 bg-[#081127]/95 p-7 text-center shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#f0a04b]/50 bg-[#f0a04b]/10">
          <Lock size={24} strokeWidth={2} className="text-[#f0a04b]" />
        </span>
        <h1 className="mt-4 font-display text-[22px] font-bold text-white">{t('onboard.lockTitle')}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-[#9aa5c4]">{t('onboard.lockBody')}</p>

        <ol className="mt-5 space-y-2 text-left">
          {steps.map((s, i) => (
            <li
              key={s.key}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-[13.5px] ${
                s.done ? 'border-[#1f5a3a]/70 bg-[#0b2418]/70 text-[#9fe3bd]' : 'border-[#1e3260]/80 bg-[#0a1428] text-[#d6e2f5]'
              }`}
            >
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                s.done ? 'bg-[#22c55e] text-[#04150b]' : 'bg-[#1a2c5c] text-white'
              }`}
              >
                {s.done ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>
              {s.label}
            </li>
          ))}
        </ol>

        <Link
          to={next.to}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2d6fff] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_0_18px_rgba(45,111,255,0.35)] transition hover:bg-[#3d7fff]"
        >
          {t(next.key === 'profile' ? 'onboard.setUpProfile' : 'onboard.answerPreferences')}
          <ArrowRight size={15} strokeWidth={2.2} />
        </Link>
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-[#6f86ad] transition hover:text-white"
        >
          <ArrowLeft size={13} strokeWidth={2} /> {t('onboard.backToDashboard')}
        </button>
      </div>
    </div>
  );
}
