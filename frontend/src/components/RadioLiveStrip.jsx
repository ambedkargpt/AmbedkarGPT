import { useState } from 'react';
import { X, Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n/index.jsx';
import { RADIO_REQUIRES_LOGIN } from '../data/radioAccess';

/**
 * "Bhim Radio is live" strip for the public pages.
 *
 * Shown only to signed-out visitors. The station sits behind the dashboard
 * shell, so for anyone already signed in this would be an advert for a page
 * they can reach from their own sidebar — and it would push the whole landing
 * page down by another 48px to say so.
 *
 * It carries the player's blue so a visitor who clicks through recognises
 * where they landed.
 */
export default function RadioLiveStrip({ className = '', onHide }) {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(true);

  function dismiss() {
    setVisible(false);
    onHide?.();
  }

  function goListen() {
    // Straight to the station: it needs no account. With the wall up this is
    // the same handshake the navbar uses, so the listener lands on the player
    // itself after signing in rather than on a generic dashboard.
    if (!RADIO_REQUIRES_LOGIN) {
      navigate('/bhimradio');
      return;
    }
    sessionStorage.setItem('auth_redirect', '/bhimradio');
    navigate('/login');
  }

  if (!visible || currentUser) return null;

  return (
    <div
      className={`radio-live-strip w-full overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(90deg, #0b2a5c 0%, #15418c 25%, #3f9fff 50%, #15418c 75%, #0b2a5c 100%)',
        backgroundSize: '200% 100%',
        animation: 'radio-strip-shimmer 5s linear infinite, radio-strip-slide-down 0.4s cubic-bezier(0.16,1,0.3,1) both',
      }}
      role="banner"
      aria-label={t('radioStrip.aria')}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent 0px, transparent 20px, rgba(255,255,255,0.18) 20px, rgba(255,255,255,0.18) 21px)' }}
      />

      {/* Same three-part phone layout as the milestone bar, and for the same
          reason: a centred sentence between two small children collapses into
          a narrow column at 360px. */}
      <div className="relative flex min-h-[48px] items-center gap-2.5 px-4 py-2.5 sm:gap-3 md:px-6">
        <Radio size={16} strokeWidth={2} className="mt-px shrink-0 self-start text-sky-100 sm:mt-0 sm:self-center" />

        <p className="min-w-0 flex-1 text-left text-[12px] font-semibold leading-[1.45] text-white sm:text-center sm:leading-snug md:text-[13px]">
          <span className="mr-2 inline-flex items-center gap-1.5 align-middle">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            <span className="font-black tracking-wide">{t('radioStrip.live')}</span>
          </span>
          {t('radioStrip.body')}
          <button
            type="button"
            onClick={goListen}
            className="ml-2 inline-flex items-center rounded-full bg-white/95 px-3 py-[3px] text-[11px] font-bold text-[#0b2a5c] align-middle transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#15418c] md:text-[12px]"
          >
            {t(RADIO_REQUIRES_LOGIN ? 'radioStrip.cta' : 'radioStrip.ctaOpen')}
          </button>
        </p>

        <button
          type="button"
          onClick={dismiss}
          aria-label={t('radioStrip.dismiss')}
          className="-mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-full text-sky-100/70 transition hover:bg-white/15 hover:text-white sm:-mr-1 sm:h-7 sm:w-7 sm:self-center"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>

      <style>{`
        @keyframes radio-strip-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes radio-strip-slide-down {
          from { opacity: 0; transform: translateY(-100%); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .radio-live-strip { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
