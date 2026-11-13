import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Radio, X } from 'lucide-react';

import { useRadio } from '../../context/RadioContext';
import { stationArt, STATIONS } from '../../data/bhimRadio';
import { useI18n } from '../../i18n/index.jsx';

/**
 * A slim "on air" bar that follows the listener around the product.
 *
 * The radio outlives the page it was started from, which is the point of the
 * context sitting above <Routes> - but until now nothing said so once you
 * navigated away. Sound came out of a site with no visible player, and the
 * only way to stop it was to find the radio page again.
 *
 * It appears on every page except the radio page itself, which is the player.
 * There used to be a floating panel as well; it was a second player for the
 * same stream, carrying a station picker for stations that are not on air.
 *
 * Portalled to document.body for the same reason the panel is - the page has
 * transformed ancestors (the curtain, the page transition, several animated
 * sections) and a transform makes its element the containing block for any
 * fixed descendant, so a fixed bar written inside one anchors to that box
 * instead of the viewport.
 */

export default function RadioNowPlayingBar() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { playing, pause, station, tenant, track } = useRadio();

  const onRadioPage = location.pathname.startsWith('/bhimradio');

  if (!playing || !station || onRadioPage) return null;

  const stationLabel = t(STATIONS.find((s) => s.slug === tenant)?.labelKey || 'radio.title');

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-3 pointer-events-none"
      // Above the headline crawl, which also lives on the bottom edge.
      style={{ bottom: 'var(--ticker-h, 0px)' }}
      role="region"
      aria-label={t('nowPlaying.aria')}
    >
      <div
        className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-[#2a4374]/70 px-3 py-2.5 backdrop-blur-md"
        style={{
          background: 'linear-gradient(135deg, rgba(14,24,56,0.94) 0%, rgba(8,13,34,0.96) 100%)',
          boxShadow: '0 0 0 1px rgba(63,127,255,0.10), 0 14px 40px rgba(2,5,18,0.6)',
          animation: 'radio-bar-rise 0.35s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* Artwork doubles as the link: the whole left side is the way back to
            the player, which is a larger target than a text link. */}
        <button
          type="button"
          onClick={() => navigate('/bhimradio')}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3f9fff] rounded-xl"
          aria-label={t('nowPlaying.openPlayer')}
        >
          <span className="relative shrink-0">
            <img
              src={stationArt(tenant)}
              alt=""
              aria-hidden="true"
              className="h-9 w-9 rounded-lg object-contain p-1"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            />
            <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-red-300">
              <Radio size={11} strokeWidth={2.4} />
              {t('nowPlaying.onAir')}
              <span className="font-semibold text-[#5a6a90] normal-case tracking-normal">
                · {stationLabel}
              </span>
            </span>
            <span className="mt-0.5 block truncate text-[13px] font-semibold text-white">
              {track?.title || station.title || t('radio.title')}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={pause}
          className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-[#ef4444]/50 bg-[#ef4444]/15 px-4 text-[14px] font-bold text-[#ffb4b4] transition hover:bg-[#ef4444]/25 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3f9fff]"
        >
          <X size={16} strokeWidth={2.6} />
          {t('nowPlaying.tuneOut')}
        </button>
      </div>

      <style>{`
        @keyframes radio-bar-rise {
          from { opacity: 0; transform: translateY(120%); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body,
  );
}
