import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Minus, Play } from 'lucide-react';
import { useRadio } from '../../context/RadioContext';
import { useI18n } from '../../i18n/index.jsx';
import { RADIO_REQUIRES_LOGIN } from '../../data/radioAccess';

/**
 * Bhim Radio beacon — the landing page's floating "on air" card.
 *
 * The red bar at the top is read once and scrolled past. This one waits until
 * the visitor has scrolled past the hero (or ~8s have gone by), then rises in
 * the bottom corner: a turning chakra with pulse rings, LIVE, what is being
 * read out right now, and one big button that starts the radio right here,
 * without leaving the page. The now-playing bar takes over once it plays.
 *
 * Closing it does not make it disappear: it shrinks to a round "on air"
 * button that keeps pulsing in the corner, and that choice is remembered for
 * the tab. So the radio is always one tap away, never in the way.
 *
 * Portalled to <body> because the page has transformed ancestors, which would
 * otherwise become the containing block for a fixed element.
 */

const MIN_KEY = 'ag-radio-beacon';
const SPOKES = Array.from({ length: 24 }, (_, i) => i * 15);

function readMin() {
  try { return sessionStorage.getItem(MIN_KEY) === 'min'; } catch { return false; }
}

function Chakra({ size, spin = true }) {
  return (
    <svg width={size} height={size} viewBox="8 -2 84 84" aria-hidden="true">
      <g className={spin ? 'rb-spin' : undefined}>
        <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          {SPOKES.map((a) => <line key={a} x1="50" y1="30.5" x2="50" y2="12" transform={`rotate(${a} 50 40)`} />)}
        </g>
        <circle cx="50" cy="40" r="30" fill="none" stroke="currentColor" strokeWidth="6" />
        <circle cx="50" cy="40" r="6" fill="currentColor" />
      </g>
    </svg>
  );
}

export default function RadioBeacon() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { configured, primeStation, status, track, playing, play } = useRadio();
  const [armed, setArmed] = useState(false);        // has the visitor earned it yet
  const [minimised, setMinimised] = useState(readMin);

  // Arm after the hero has scrolled away, or after a while on the page.
  useEffect(() => {
    if (armed) return undefined;
    const onScroll = () => { if (window.scrollY > window.innerHeight * 0.7) setArmed(true); };
    const timer = setTimeout(() => setArmed(true), 8000);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => { clearTimeout(timer); window.removeEventListener('scroll', onScroll); };
  }, [armed]);

  // Only the day's manifest (small JSON), so the card can say what is on.
  useEffect(() => { if (armed && configured) primeStation(); }, [armed, configured, primeStation]);

  function setMin(v) {
    setMinimised(v);
    try { sessionStorage.setItem(MIN_KEY, v ? 'min' : 'open'); } catch { /* not worth failing over */ }
  }

  const canPlayHere = configured && !RADIO_REQUIRES_LOGIN && status === 'ready';

  function openFull() {
    if (RADIO_REQUIRES_LOGIN) {
      sessionStorage.setItem('auth_redirect', '/bhimradio');
      navigate('/login');
      return;
    }
    navigate('/bhimradio');
  }

  function listen() {
    if (canPlayHere) play();
    else openFull();
  }

  if (!armed || playing) return null;

  const node = minimised ? (
    <button
      type="button"
      onClick={() => setMin(false)}
      aria-label={t('radioBeacon.fabLabel')}
      className="rb-fab group fixed bottom-5 right-4 z-30 flex items-center gap-2 rounded-full border border-[#ffc72c]/60 bg-[#a50e16] p-1.5 pr-1.5 text-white shadow-[0_10px_30px_rgba(165,14,22,0.55)] md:bottom-6 md:right-6"
    >
      <span className="rb-ring" aria-hidden="true" />
      <span className="rb-ring rb-ring-2" aria-hidden="true" />
      <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#d4141f] text-[#ffc72c]">
        <Chakra size={34} />
      </span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-[13px] font-bold transition-all duration-300 group-hover:max-w-[180px] group-hover:pr-3 group-focus-visible:max-w-[180px] group-focus-visible:pr-3">
        {t('radioBeacon.fabLabel')}
      </span>
      <span className="absolute -right-1 -top-1 rounded-full bg-[#ffc72c] px-1.5 py-0.5 text-[10px] font-black leading-none text-[#3a0a0d]">
        {t('radioBeacon.live')}
      </span>
    </button>
  ) : (
    <section
      role="dialog"
      aria-label={t('radioBeacon.aria')}
      className="rb-card fixed inset-x-3 bottom-3 z-30 overflow-hidden rounded-[22px] border border-[#ffc72c]/50 text-white shadow-[0_24px_60px_rgba(0,0,0,0.55),0_0_40px_rgba(212,20,31,0.35)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[360px]"
      style={{ background: 'radial-gradient(260px 180px at 0% 0%, rgba(255,199,44,0.22), transparent 70%), linear-gradient(150deg, #b3111a 0%, #7d0a11 55%, #3d060b 100%)' }}
    >
      <span aria-hidden="true" className="rb-sweep pointer-events-none absolute inset-y-0 -left-1/2 w-1/2" />

      {/* header */}
      <div className="relative flex items-center gap-2 px-4 pt-3.5">
        <span className="inline-flex items-center gap-1.5 rounded-[5px] bg-[#ffc72c] px-2 py-1 text-[11.5px] font-black leading-none text-[#3a0a0d]">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#d4141f] opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#d4141f]" />
          </span>
          {t('radioBeacon.live')}
        </span>
        <span className="font-display text-[16px] font-bold tracking-tight">{t('radioBeacon.title')}</span>
        <span aria-hidden="true" className="ml-1 flex h-4 items-end gap-[3px]">
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className="rb-eq w-[3px] rounded-sm bg-[#ffc72c]" style={{ animationDelay: `${i * 0.15}s` }} />)}
        </span>
        <button
          type="button"
          onClick={() => setMin(true)}
          aria-label={t('radioBeacon.minimise')}
          title={t('radioBeacon.minimise')}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/15 hover:text-white"
        >
          <Minus size={16} strokeWidth={2.5} />
        </button>
      </div>

      {/* body: the dial and what is on */}
      <div className="relative flex items-center gap-4 px-4 pb-4 pt-3">
        <span className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center">
          <span className="rb-ring rb-ring-card" aria-hidden="true" />
          <span className="rb-ring rb-ring-card rb-ring-2" aria-hidden="true" />
          <span className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#2a0408]/60 text-[#ffc72c] ring-2 ring-[#ffc72c]/50">
            <Chakra size={56} />
          </span>
        </span>
        <div className="min-w-0">
          <p className="m-0 text-[12.5px] font-semibold text-[#ffd75e]">{t(track?.title ? 'radioBeacon.now' : 'radioBeacon.today')}</p>
          <p className="m-0 mt-1 line-clamp-3 text-[15px] font-semibold leading-snug">
            {track?.title || t('radioBeacon.fallback')}
          </p>
        </div>
      </div>

      {/* actions */}
      <div className="relative flex gap-2 px-4 pb-4">
        <button
          type="button"
          onClick={listen}
          className="rb-cta flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#ffc72c] text-[15px] font-extrabold text-[#3a0a0d] transition hover:bg-[#ffd75e] focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Play size={16} strokeWidth={0} fill="currentColor" />
          {t(RADIO_REQUIRES_LOGIN ? 'radioStrip.cta' : canPlayHere ? 'radioBeacon.playHere' : 'radioStrip.ctaOpen')}
        </button>
        <button
          type="button"
          onClick={openFull}
          aria-label={t('radioBeacon.openFull')}
          title={t('radioBeacon.openFull')}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
        >
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </div>
    </section>
  );

  return createPortal(
    <>
      {node}
      <style>{`
        .rb-card { animation: rb-rise .6s cubic-bezier(.34,1.4,.64,1) both; }
        .rb-fab { animation: rb-pop .45s cubic-bezier(.34,1.5,.64,1) both; }
        .rb-spin { animation: rb-spin 9s linear infinite; transform-box: view-box; transform-origin: 50px 40px; }
        .rb-eq { height: 30%; animation: rb-eq .8s ease-in-out infinite alternate; }
        .rb-sweep { background: linear-gradient(100deg, transparent, rgba(255,255,255,.12), transparent); animation: rb-sweep 5s ease-in-out infinite; }
        .rb-ring { position: absolute; inset: 6px; border-radius: 9999px; border: 2px solid rgba(255,199,44,.6); animation: rb-ring 2.4s ease-out infinite; pointer-events: none; }
        .rb-ring-card { inset: 2px; }
        .rb-ring-2 { animation-delay: 1.2s; }
        .rb-cta { animation: rb-pulse 2.2s ease-out infinite; }
        @keyframes rb-rise { from { opacity: 0; transform: translateY(40px) scale(.96); } to { opacity: 1; transform: none; } }
        @keyframes rb-pop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }
        @keyframes rb-spin { to { transform: rotate(360deg); } }
        @keyframes rb-eq { from { height: 25%; } to { height: 100%; } }
        @keyframes rb-sweep { 0% { transform: translateX(0); } 60%, 100% { transform: translateX(320%); } }
        @keyframes rb-ring { from { transform: scale(1); opacity: .9; } to { transform: scale(1.55); opacity: 0; } }
        @keyframes rb-pulse {
          0% { box-shadow: 0 0 0 0 rgba(255,199,44,.6); }
          70% { box-shadow: 0 0 0 12px rgba(255,199,44,0); }
          100% { box-shadow: 0 0 0 0 rgba(255,199,44,0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .rb-card, .rb-fab, .rb-spin, .rb-eq, .rb-sweep, .rb-ring, .rb-cta { animation: none !important; }
          .rb-ring { display: none; }
          .rb-eq { height: 70%; }
        }
      `}</style>
    </>,
    document.body,
  );
}
