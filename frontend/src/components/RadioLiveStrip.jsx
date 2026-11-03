import { useEffect, useState } from 'react';
import { X, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useRadio } from '../context/RadioContext';
import { useI18n } from '../i18n/index.jsx';
import { RADIO_REQUIRES_LOGIN } from '../data/radioAccess';

/**
 * "On air" bar for the public pages — Bhim Radio's announcement.
 *
 * It used to be a blue strip on a blue site, and visitors read straight past
 * it. It is now in broadcast red, the colour every channel uses for LIVE and the
 * same red as the news crawl, with a yellow ऑन एयर tag, a pulsing light, what
 * is being read out right now, and a yellow Listen button that is the
 * brightest thing in the top of the page.
 *
 * Shown only to signed-out visitors (signed-in users have the radio in their
 * sidebar). From md it is one 48px line pinned under the navbar, exactly the
 * height MainLayout reserves; on phones it is two lines in the flow.
 *
 * The current story comes from the radio context: priming loads only the
 * day's small manifest, not the audio.
 */
export default function RadioLiveStrip({ className = '', onHide }) {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { primeStation, track, configured } = useRadio();
  const [visible, setVisible] = useState(true);

  const show = visible && !currentUser;
  useEffect(() => { if (show && configured) primeStation(); }, [show, configured, primeStation]);

  function dismiss() {
    setVisible(false);
    onHide?.();
  }

  function goListen() {
    if (!RADIO_REQUIRES_LOGIN) {
      navigate('/bhimradio');
      return;
    }
    sessionStorage.setItem('auth_redirect', '/bhimradio');
    navigate('/login');
  }

  if (!show) return null;

  const now = track?.title;

  return (
    <div
      className={`radio-live-strip onair-bar w-full overflow-hidden border-y border-[#ffc72c]/70 ${className}`}
      role="region"
      aria-label={t('radioStrip.aria')}
    >
      {/* A slow light sweep, so the bar moves in the corner of the eye. */}
      <span aria-hidden="true" className="onair-sweep pointer-events-none absolute inset-y-0 -left-1/3 w-1/3" />

      <div className="relative mx-auto flex min-h-[48px] max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 md:h-[46px] md:flex-nowrap md:px-10 md:py-0">
        {/* ऑन एयर tag, as on the news crawl */}
        <span className="order-1 inline-flex shrink-0 items-center gap-1.5 rounded-[5px] bg-[#ffc72c] px-2 py-1 text-[12px] font-black leading-none text-[#3a0a0d]">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#d4141f] opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#d4141f]" />
          </span>
          {t('radioStrip.onAir')}
        </span>

        <span className="order-2 shrink-0 font-display text-[14px] font-bold tracking-tight text-white md:text-[15px]">
          {t('radioStrip.station')}
        </span>

        {/* Equaliser: says "sound is coming out of this" without words. */}
        <span aria-hidden="true" className="order-2 hidden h-4 items-end gap-[3px] sm:flex">
          {[0, 1, 2, 3].map((i) => <span key={i} className="onair-eq w-[3px] rounded-sm bg-[#ffc72c]" style={{ animationDelay: `${i * 0.18}s` }} />)}
        </span>

        <p className="order-5 m-0 min-w-0 basis-full text-[13px] leading-[1.45] text-white md:order-3 md:basis-auto md:flex-1 md:truncate md:text-[14px]">
          {now
            ? <><span className="font-semibold text-[#ffd75e]">{t('radioStrip.nowLabel')}</span> {now}</>
            : t('radioStrip.body')}
        </p>

        <button
          type="button"
          onClick={goListen}
          className="onair-cta order-3 ml-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#ffc72c] px-4 text-[13px] font-extrabold text-[#3a0a0d] transition hover:bg-[#ffd75e] focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#a50e16] md:order-4 md:ml-0 md:h-8"
        >
          <Play size={13} strokeWidth={0} fill="currentColor" />
          {t(RADIO_REQUIRES_LOGIN ? 'radioStrip.cta' : 'radioStrip.ctaOpen')}
        </button>

        <button
          type="button"
          onClick={dismiss}
          aria-label={t('radioStrip.dismiss')}
          className="order-4 -mr-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/15 hover:text-white md:order-5 md:h-8 md:w-8"
        >
          <X size={15} strokeWidth={2.5} />
        </button>
      </div>

      <style>{`
        .onair-bar {
          position: relative;
          background: linear-gradient(90deg, #7d0a11 0%, #a50e16 30%, #d4141f 70%, #a50e16 100%);
          box-shadow: 0 6px 24px rgba(212, 20, 31, 0.35);
          animation: onair-in .45s cubic-bezier(.16,1,.3,1) both;
        }
        .onair-sweep {
          background: linear-gradient(100deg, transparent, rgba(255,255,255,.16), transparent);
          animation: onair-sweep 4.5s ease-in-out infinite;
        }
        .onair-eq { height: 30%; animation: onair-eq .9s ease-in-out infinite alternate; }
        .onair-cta { box-shadow: 0 0 0 0 rgba(255,199,44,.7); animation: onair-pulse 2s ease-out infinite; }
        @keyframes onair-in { from { opacity: 0; transform: translateY(-100%); } to { opacity: 1; transform: none; } }
        @keyframes onair-sweep { 0% { transform: translateX(0); } 60%, 100% { transform: translateX(450%); } }
        @keyframes onair-eq { from { height: 25%; } to { height: 100%; } }
        @keyframes onair-pulse {
          0% { box-shadow: 0 0 0 0 rgba(255,199,44,.65); }
          70% { box-shadow: 0 0 0 10px rgba(255,199,44,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,199,44,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .onair-bar, .onair-sweep, .onair-eq, .onair-cta { animation: none !important; }
          .onair-eq { height: 70%; }
        }
      `}</style>
    </div>
  );
}
