import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { useCurtain } from '../context/CurtainContext';
import { HOME_ROUTE } from '../data/features';
import { useI18n } from '../i18n/index.jsx';

/**
 * "Continue as guest", on the sign-up and login screens: one button per party.
 *
 * A guest gets a ready-made account for that party (made by POST /auth/guest),
 * already set up as the party's national spokesperson with preferences chosen
 * for the strongest posts, so it can read the news and write posts straight
 * away, with no sign-up. It sits apart from the account buttons, under a rule.
 */
const PARTIES = [
  { id: 'congress', labelKey: 'guest.asCongress', logo: '/party-logos/inc.png', ring: '#3f8cff' },
  { id: 'samajwadi', labelKey: 'guest.asSamajwadi', logo: '/party-logos/sp.png', ring: '#e5484d' },
];

export default function GuestButton() {
  const { t } = useI18n();
  const { loginAsGuest } = useAuth();
  const { go: curtainGo } = useCurtain();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  async function start(party) {
    if (busy) return;
    setBusy(party);
    setError('');
    try {
      await loginAsGuest(party);
      curtainGo(HOME_ROUTE, { replace: true });
    } catch (err) {
      const detail = err?.response?.data?.detail;
      setError(detail?.error === 'guest_limit' ? t('guest.tooMany') : t('guest.failed'));
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 border-t border-white/10 pt-6 text-center">
      <p className="text-[15px] font-semibold" style={{ color: '#ffe2bd' }}>{t('guest.choose')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {PARTIES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => start(p.id)}
            disabled={Boolean(busy)}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-xl border border-[#f0a04b]/60 bg-[#f0a04b]/10 px-4 text-[15.5px] font-semibold text-[#ffe2bd] transition hover:border-[#f0a04b] hover:bg-[#f0a04b]/20 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f0a04b] disabled:cursor-wait disabled:opacity-70"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white" style={{ boxShadow: `0 0 0 2px ${p.ring}` }}>
              <img src={p.logo} alt="" className="h-6 w-6 object-contain" />
            </span>
            <span className="min-w-0 text-left leading-tight">{t(p.labelKey)}</span>
            {busy === p.id
              ? <Loader2 size={17} className="shrink-0 animate-spin" aria-hidden="true" />
              : <ArrowRight size={17} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="text-[14px] font-medium text-[#ffb4b4]">{error}</p>}
      <p className="text-[14px] leading-snug" style={{ color: '#a9b6d8' }}>{t('guest.hint')}</p>
    </div>
  );
}
