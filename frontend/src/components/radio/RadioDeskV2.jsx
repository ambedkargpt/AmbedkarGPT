import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Home, Loader2, RotateCw } from 'lucide-react';
import AgMark from '../brand/AgMark';
import LanguageSwitcher from '../LanguageSwitcher';
import ShareMenu from './ShareMenu';
import ChakraDial from './ChakraDial';
import {
  Label, ProgramLine, SignalMeter, StatusLine, Transcript, VolumeControl,
} from './deskParts.jsx';
import { MUTED, RULE, SURFACE, airTime, istClock, mmss } from './radioTokens';
import { STATIONS } from '../../data/bhimRadio';
import { useI18n } from '../../i18n/index.jsx';

// Station colours, the same ones the news page gives each party.
const STATION_COLOR = {
  congress: '#2a7de1',
  samajwadi: '#d1394a',
  bjp: '#f0872a',
  general: '#3f9fff',
};
const STATION_LOGO = {
  congress: '/party-logos/inc.png',
  samajwadi: '/party-logos/sp.png',
};

/**
 * Stories and minutes each party has in this bulletin. The bulletin deals the
 * parties' stories in turns, so these are shares of one broadcast, not
 * separate stations.
 */
function partyShares(tracks) {
  const out = {};
  for (const tr of tracks) {
    const slug = STATION_COLOR[tr.tenant] ? tr.tenant : 'general';
    const row = out[slug] ?? (out[slug] = { stories: 0, seconds: 0 });
    row.stories += 1;
    row.seconds += Math.max(0, (tr.endSec ?? tr.startSec) - tr.startSec);
  }
  return out;
}

function StationIcon({ slug, color }) {
  const logo = STATION_LOGO[slug];
  const base = 'flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-full';
  if (logo) {
    return (
      <span className={`${base} bg-white`}>
        <img src={logo} alt="" className="h-full w-full object-contain p-1" />
      </span>
    );
  }
  if (slug === 'bjp') {
    return <span className={`${base} font-display text-[12px] font-bold text-white`} style={{ backgroundColor: color }}>BJP</span>;
  }
  return <span className={base} style={{ backgroundColor: `${color}33`, color }}><Globe size={20} strokeWidth={1.8} /></span>;
}

function MiniEq({ color, moving }) {
  return (
    <span aria-hidden="true" className="ml-auto flex h-4 items-end gap-[3px]">
      {[0.5, 1, 0.7].map((h, i) => (
        <span
          key={i}
          className={moving ? 'radio-eq-bar' : ''}
          style={{ width: 3, height: `${h * 100}%`, backgroundColor: color, animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </span>
  );
}

/**
 * Bhim Radio's desk from lg up: the parties in this bulletin on the left, the
 * dial and what is on air in the middle, the transcript and the running order
 * on the right. The bulletin mixes every party's stories, so the left column
 * is not a picker: the party whose story is on air lights up, and the dial
 * takes its colour.
 */
export default function RadioDeskV2({
  tracks, status, configured, onRetry, onBack, headline, clockLabel,
  now, story, storyIndex, total, offsetInStory, storyDuration, textOffset, textDuration,
  upcoming, listening, onTune, canTune, nextInSec, progress, volume, onVolume, cycleLength,
}) {
  const { t, lang } = useI18n();
  const shares = useMemo(() => partyShares(tracks), [tracks]);
  const live = story ? (STATION_COLOR[story.tenant] ? story.tenant : 'general') : null;
  const color = STATION_COLOR[live] ?? STATION_COLOR.general;
  const onAir = status === 'ready';
  const next = upcoming.find((u) => u.state === 'next');
  const hiCaps = lang === 'hi' ? '' : 'uppercase tracking-[0.16em]';

  return (
    <div className="flex min-h-[calc(100vh-140px)] flex-col">
      {/* Header */}
      <header className="flex h-[76px] shrink-0 items-center gap-4 border-b border-[#1b2350]">
        {/* A link home, so a page opened cold from a shared link still has
            somewhere to go; with history behind it, it steps back instead. */}
        <Link
          to="/"
          onClick={onBack}
          aria-label={t('radio.backHome')}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-[#3a4a85] bg-[#0d1333] px-4 text-[15px] font-semibold text-white transition hover:border-[#1d7afc] hover:bg-[#13205a]"
        >
          <Home size={18} strokeWidth={2} />
          {t('radio.home')}
        </Link>
        <AgMark size={38} color="#8FA8FF" decorative />
        <div className="min-w-0">
          <h1 className="font-display text-[30px] font-extrabold leading-tight text-white">{t('radio.title')}</h1>
          <div className="radio-v2-program"><ProgramLine /></div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="inline-flex h-11 items-center gap-2.5 rounded-full border border-[#2a3566] bg-[#0d1333] pl-1.5 pr-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1d7afc] font-hindi text-[13px] font-bold text-white">
              {t('radio.anchorName').slice(0, 2)}
            </span>
            <span className="leading-tight">
              <span className="block text-[12px] text-[#8b94b8]">{t('radio.v2.anchor')}</span>
              <span className="block font-hindi text-[15.5px] font-semibold text-white">{t('radio.anchorName')}</span>
            </span>
          </span>
          <span
            className="inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[14px] font-bold"
            style={listening
              ? { borderColor: 'rgba(239,68,68,0.55)', backgroundColor: 'rgba(239,68,68,0.15)', color: '#ff8a8a' }
              : { borderColor: RULE, color: MUTED }}
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              {listening && <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />}
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: listening ? '#ef4444' : MUTED }} />
            </span>
            {t(listening ? 'radio.v2.live' : 'radio.v2.standby')}
          </span>
          <span className="font-count text-[20px] font-semibold tabular-nums text-white">
            {clockLabel} <span className="text-[12px] text-[#8b94b8]">IST</span>
          </span>
          <ShareMenu headline={headline} className="bhim-share radio-v2-share" />
          <LanguageSwitcher />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-5 pt-6 lg:grid-cols-[260px_minmax(0,1fr)_340px] xl:grid-cols-[300px_minmax(0,1fr)_420px] xl:gap-7">
        {/* Stations */}
        <aside className="flex min-w-0 flex-col gap-3">
          <p className="text-[15px] font-semibold text-[#c7d1eb]">{t('radio.v2.parties')}</p>
          <ul className="flex flex-col gap-3">
            {STATIONS.map(({ slug, labelKey }) => {
              const c = STATION_COLOR[slug];
              const share = shares[slug];
              const on = slug === live;
              return (
                <li
                  key={slug}
                  aria-current={on ? 'true' : undefined}
                  className="flex h-[70px] items-center gap-3 rounded-2xl border px-3 transition-[background-color,border-color,opacity] duration-300"
                  style={{
                    borderLeft: `3px solid ${c}`,
                    borderColor: on ? c : '#1b2350',
                    borderLeftColor: c,
                    backgroundColor: on ? `${c}26` : SURFACE,
                    boxShadow: on ? `0 0 24px ${c}33` : 'none',
                    opacity: share ? 1 : 0.45,
                  }}
                >
                  <StationIcon slug={slug} color={c} />
                  <span className="min-w-0">
                    <span className="block truncate font-hindi text-[17px] font-bold text-white">{t(labelKey)}</span>
                    <span className="block truncate text-[13.5px] text-[#9aa5c8]">
                      {share
                        ? t('radio.v2.stationStats', { n: share.stories, m: Math.max(1, Math.round(share.seconds / 60)) })
                        : t('radio.v2.notToday')}
                    </span>
                  </span>
                  {on && <MiniEq color={c} moving={listening} />}
                </li>
              );
            })}
          </ul>

          <div className="mt-2 rounded-2xl border border-[#1b2350] p-4" style={{ backgroundColor: SURFACE }}>
            <p className="text-[15px] font-semibold text-[#c7d1eb]">{t('radio.v2.today')}</p>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              {[
                { v: onAir ? total : '—', k: 'radio.v2.stories' },
                { v: onAir ? Math.max(1, Math.round(cycleLength / 60)) : '—', k: 'radio.v2.minutes' },
              ].map((x) => (
                <div key={x.k} className="rounded-xl bg-[#0a0e27] px-3 py-2.5">
                  <p className="font-count text-[26px] font-bold text-white">{x.v}</p>
                  <p className="text-[13px] text-[#9aa5c8]">{t(x.k)}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13.5px] leading-relaxed text-[#9aa5c8]">{t('radio.v2.loop')}</p>
          </div>
        </aside>

        {/* The dial and what is on air */}
        <section data-radio-now className="flex min-w-0 flex-col items-center">
          {!onAir ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-[14px] text-[#8b94b8]">
              {(status === 'idle' || status === 'loading') && (
                <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />{t('radio.loading')}</span>
              )}
              {!configured && <span>{t('radio.empty')}</span>}
              {status === 'empty' && <span className="max-w-sm">{t('radio.emptyStation')}</span>}
              {status === 'error' && (
                <>
                  <span className="text-[#ff6b5a]">{t('radio.loadFailed')}</span>
                  <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a3566] px-3 py-1.5 text-[12px] text-white">
                    <RotateCw size={12} />{t('radio.retry')}
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {/* Sized by the height left over as well as the width: on the
                  public page the navbar, the layout switch and the crawl take 250px. */}
              <div className="relative w-full" style={{ maxWidth: 'min(400px, 38vh)' }}>
                <ChakraDial color={color} progress={progress} listening={listening} canTune={canTune} onTune={onTune} />
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 whitespace-nowrap rounded-full border border-[#2a3566] bg-[#0a0e27] px-4 py-1.5 font-count text-[14px] text-[#dfe6f7]">
                  {storyIndex < 0
                    ? t('radio.opening')
                    : `${t('radio.v2.storyN', { n: storyIndex + 1, total })} · ${t('radio.v2.left', { t: mmss(storyDuration - offsetInStory) })}`}
                </span>
              </div>

              <div className="mt-8 flex w-full max-w-[560px] flex-col items-center text-center">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className={`text-[15px] font-semibold ${hiCaps}`} style={{ color }}>{t('radio.nowOnAir')}</span>
                  {story?.storyType && <span className="rounded-full border border-[#2a3566] px-2 py-0.5 text-[11.5px] text-[#c7d1eb]">{story.storyType}</span>}
                  {story?.tenant && <span className="rounded-full border border-[#2a3566] px-2 py-0.5 text-[11.5px] text-[#c7d1eb]">{story.tenant}</span>}
                </div>
                <h2 lang="hi" aria-live="polite" className="mt-2 font-hindi text-[30px] font-bold leading-[1.4] text-white" style={{ textWrap: 'balance' }}>
                  {story?.title || t('radio.title')}
                </h2>
                <p className="mt-1.5 text-[15px] text-[#9aa5c8]">
                  {t('radio.airedAt', { time: istClock(airTime(now, offsetInStory)) })}
                </p>
                {next && (
                  <p className="mt-4 inline-flex max-w-full items-center gap-2.5 rounded-full border border-[#2a3566] bg-[#0d1333] px-5 py-2 text-[14.5px]">
                    <span className="shrink-0 text-[#8b94b8]">{t('radio.v2.upNext')}</span>
                    <span lang="hi" className="min-w-0 truncate font-hindi text-white">{next.track.title}</span>
                    <span className="shrink-0 font-count text-[#c7d1eb]">{mmss(nextInSec)}</span>
                  </p>
                )}
              </div>

              <div className="mt-6 flex min-h-16 w-full items-center gap-5 rounded-2xl border border-[#1b2350] px-5 py-3" style={{ backgroundColor: SURFACE }}>
                {/* Moves whenever the station is on air, bright in the station's
                    colour while this listener hears it: the broadcast does not
                    stop because nobody is listening. */}
                <SignalMeter active={listening} live={canTune} bars={22} color={color} />
                <StatusLine listening={listening} nextInSec={nextInSec} progress={progress} compact />
                <VolumeControl volume={volume} onChange={onVolume} listening={listening} disabled={!canTune} color={color} compact />
              </div>
            </>
          )}
        </section>

        {/* Transcript and running order */}
        <aside className="flex min-h-0 min-w-0 flex-col gap-5">
          <div className="rounded-2xl border border-[#1b2350] p-5" style={{ backgroundColor: SURFACE }}>
            <div className="mb-3 flex items-center justify-between">
              <Label>{t('radio.transcript')}</Label>
              <span className="text-[13px] text-[#9aa5c8]">{t('radio.v2.follows')}</span>
            </div>
            <div data-transcript-scroll className="relative max-h-[26vh] overflow-y-auto">
              {onAir && <Transcript text={story?.text} offsetSec={textOffset} durationSec={textDuration} listening={listening} size={20} follow />}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-[#1b2350] py-4" style={{ backgroundColor: SURFACE }}>
            <div className="mb-2 flex items-center justify-between px-5">
              <span className="text-[15px] font-semibold text-[#c7d1eb]">{t('radio.v2.order')}</span>
              <span className="text-[13.5px] text-[#9aa5c8]">{t('radio.v2.storiesN', { n: total })}</span>
            </div>
            <ol data-radio-order className="min-h-0 flex-1 overflow-y-auto" style={{ maxHeight: '44vh' }}>
              {upcoming.map(({ track, state, at }) => (
                <li
                  key={`${track.id}-${state}`}
                  className="relative grid h-[60px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5"
                  style={{ backgroundColor: state === 'onair' ? `${color}14` : 'transparent' }}
                >
                  {state === 'onair' && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: color }} />}
                  <span aria-hidden="true" className="absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full" style={{ backgroundColor: STATION_COLOR[track.tenant] ?? STATION_COLOR.general }} />
                  <span className="font-count text-[14px] tabular-nums" style={{ color: state === 'aired' ? '#5a6789' : '#8fb6ff' }}>{istClock(at)}</span>
                  <span lang="hi" title={track.title} className="truncate font-hindi text-[15.5px]" style={{ color: state === 'aired' ? '#5a6789' : '#e5e7eb' }}>
                    {track.title}
                  </span>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[12px] font-bold"
                    style={state === 'onair'
                      ? { backgroundColor: '#dc2626', color: '#fff' }
                      : state === 'aired'
                        ? { backgroundColor: 'rgba(42,53,102,0.5)', color: '#6b78a0' }
                        : { backgroundColor: 'rgba(29,122,252,0.15)', color: '#6aa8ff' }}
                  >
                    {t(state === 'onair' ? 'radio.onAirRow' : state === 'aired' ? 'radio.airedRow' : 'radio.nextRow')}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>

      <style>{`
        .radio-v2-program p:first-child { font-size: 16px !important; line-height: 1.3 !important; }
        .radio-v2-program p:last-child { font-size: 14px !important; }
        .radio-v2-share { border-radius: 12px; height: 40px; font-size: 13px !important; letter-spacing: 0 !important; text-transform: none !important; }
        .radio-eq-bar { animation: radio-eq 0.9s ease-in-out infinite alternate; transform-origin: bottom; }
        @keyframes radio-eq { from { transform: scaleY(0.35); } to { transform: scaleY(1); } }
        @media (prefers-reduced-motion: reduce) { .radio-eq-bar { animation: none; } }
      `}</style>
    </div>
  );
}
