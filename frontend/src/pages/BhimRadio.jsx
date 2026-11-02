import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { useRadio } from '../context/RadioContext';
import RadioDeskV2 from '../components/radio/RadioDeskV2';
import { INK, MUTED, RULE, SURFACE, mmss } from '../components/radio/radioTokens';
import { useI18n } from '../i18n/index.jsx';
import { RADIO_REQUIRES_LOGIN } from '../data/radioAccess';

/* ── the station ──────────────────────────────────────────────────────────
   One layout at every width: the desk (stations, the dial, the running order
   and the transcript), which arranges itself for a phone, a tablet and a
   laptop. The tape layout and the older desk and phone layouts are gone.
   ------------------------------------------------------------------------ */

// The radio is a public page of its own unless it sits behind the login.
const STANDALONE = !RADIO_REQUIRES_LOGIN;

// Accounts that may hold the tape still: play/pause, a scrub that stays put,
// and the segment walk-through. Hard-coded because it is for one demonstration
// and is meant to be deleted after it, which a settings flag quietly would not.
const DEMO_ACCOUNTS = ['krishprakash1232@gmail.com'];

// The same controls for whoever is running the app on their own machine,
// signed in or not. Gated on DEV as well as the variable, so a stray value in
// a production environment cannot switch it on: DEV is false in a build.
// Set VITE_RADIO_DEMO_CONTROLS=true in frontend/.env.local (gitignored).
const LOCAL_DEMO = import.meta.env.DEV && import.meta.env.VITE_RADIO_DEMO_CONTROLS === 'true';


export default function BhimRadioPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const {
    primeStation, configured,
    station, status, retry,
    tracks, segments, broadcastNow,
    playing, play, pause, toggle,
    position, duration, seek,
    volume, setVolume, muted, toggleMute,
    streamError, setFollowBroadcast,
  } = useRadio();

  // Open from the start locally: the panel is what the flag is for.
  const [showDemo, setShowDemo] = useState(LOCAL_DEMO);
  const [now, setNow] = useState(() => new Date());

  // Fetch the manifest. Nothing is torn down on unmount - the listener may
  // navigate away and want the audio to keep running, which is the whole point
  // of the context living above <Routes>.
  useEffect(() => { primeStation(); }, [primeStation]);

  const isDemo = LOCAL_DEMO
    || DEMO_ACCOUNTS.includes(String(currentUser?.email || '').toLowerCase());

  // The demo account holds the tape rather than riding the broadcast. Set on
  // the context, not here, because the audio outlives this page.
  useEffect(() => { setFollowBroadcast(!isDemo); }, [isDemo, setFollowBroadcast]);

  // A wall clock for the headers and the tape's labels, on the same beat as
  // the broadcast clock in the context.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(timer);
  }, []);

  const onAir = status === 'ready' && Boolean(station);
  const canTune = onAir && !streamError;
  const cycleLength = station?.durationSec || 0;

  // Where the panel is drawn.
  //
  // The clock, except for a demonstration that is actually playing - there the
  // panel has to match what is coming out of the speakers, because the whole
  // point is to stop on a segment and talk about it.
  //
  // Paused, even a demonstration goes back to the clock: the station does not
  // stop because someone stopped listening, and a frozen tape says it did.
  // The audio still resumes where it was left; that is `position`, and it is
  // what the scrubber and the transport read.
  const at = (isDemo && playing) ? position : broadcastNow;

  let storyIndex = -1;
  for (let i = tracks.length - 1; i >= 0; i -= 1) {
    if (at >= tracks[i].startSec) { storyIndex = i; break; }
  }
  const story = storyIndex >= 0 ? tracks[storyIndex] : null;
  const storyStart = story?.startSec ?? 0;
  const storyEnd = story?.endSec ?? cycleLength;
  const storyDuration = Math.max(1, storyEnd - storyStart);
  const offsetInStory = Math.min(Math.max(at - storyStart, 0), storyDuration);
  const progress = offsetInStory / storyDuration;

  // Where the transcript is. Measured from when the words start, when the
  // manifest says so; spreading them over the whole story put the highlight
  // seconds ahead of the voice while the link and the headline were playing.
  const hasTextSpan = story?.textStartSec != null && story?.textEndSec > story?.textStartSec;
  const textOffset = hasTextSpan ? at - story.textStartSec : offsetInStory;
  const textDuration = hasTextSpan ? story.textEndSec - story.textStartSec : storyDuration;

  // Before the first story the clock is in the opening music, so the next
  // thing on air is story one rather than "the rest of this story".
  // After a story, to when the next one starts - not to when this one ended:
  // an ad break or the closing recap sits between them, and counting to the
  // end of the story left "next story in 0:00" frozen through the whole break.
  const nextInSec = storyIndex < 0
    ? Math.max(0, (tracks[0]?.startSec ?? 0) - at)
    : Math.max(0, (tracks[storyIndex + 1]?.startSec ?? cycleLength) - at);

  // The running order: what just aired, what is on now, and what is coming.
  // The whole rest of the bulletin, not a window of ten. The column is as
  // tall as the story beside it, and a fixed count left a third of it empty
  // on a desktop while hiding forty stories that were going out tonight.
  // The list scrolls inside the column, so a long bulletin does not stretch
  // the page.
  const upcoming = [];
  if (tracks.length) {
    for (let k = -1; k < tracks.length; k += 1) {
      // Wrapped, because the bulletin loops all day. Without this the list
      // ran out as the broadcast neared the last story - four rows left in a
      // column built to hold thirty - when what comes next is the top of the
      // bulletin again.
      const raw = storyIndex + k;
      const i = ((raw % tracks.length) + tracks.length) % tracks.length;
      const wrapped = raw >= tracks.length;
      const startSec = tracks[i].startSec + (wrapped ? cycleLength : 0);
      upcoming.push({
        track: tracks[i],
        state: k < 0 ? 'aired' : k === 0 ? 'onair' : 'next',
        at: new Date(now.getTime() + (startSec - at) * 1000),
      });
    }
  }

  const shared = {
    // storyIndex stays as it is, -1 and all: clamping it here while leaving
    // `story` null is what made the tape read startSec off nothing. The two
    // describe the same thing and have to agree.
    now, story, storyIndex, total: tracks.length,
    offsetInStory, storyDuration, cycleLength, elapsed: at,
    textOffset, textDuration,
    listening: playing, canTune, nextInSec, progress,
    volume: muted ? 0 : volume,
    onVolume: (v) => { if (muted && v > 0) toggleMute(); setVolume(v); },
    onTune: () => (playing ? pause() : play()),
  };

  return (
    <>
      {/* The ground. Inside the dashboard the shell already paints one; as a
          standalone page the station sat on the public layout's flat navy,
          which read as an empty room. Full-bleed, static, behind the desk. */}
      <div className={STANDALONE ? 'bhim-ground' : undefined}>
      <div className="bhim-station bhim-station-v2">

        {/* The desk carries its own Home link and share. Only the demo
            account's walk-through toggle sits above it. */}
        <div className="bhim-station-switch">
          {isDemo && onAir && (
            <button
              type="button"
              onClick={() => setShowDemo((v) => !v)}
              style={{
                marginLeft: 'auto', padding: '6px 14px',
                border: `2px solid ${RULE}`, background: 'transparent', color: '#6b9fff',
                font: '600 14px/1 Inter, system-ui, sans-serif',
                letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
              }}
            >
              {showDemo ? t('radio.demoHide') : t('radio.demoShow')}
            </button>
          )}
        </div>

        {/* ── what is on, or why it is not ── */}
          <RadioDeskV2
            {...shared}
            upcoming={upcoming}
            tracks={tracks}
            status={onAir ? 'ready' : status}
            configured={configured}
            onRetry={retry}
            onBack={(e) => { if (location.key !== 'default') { e.preventDefault(); navigate(-1); } }}
            headline={story?.title}
            clockLabel={new Intl.DateTimeFormat('en-IN', {
              timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
            }).format(now)}
          />

        {/* ── the walk-through ──
            Every part of the bulletin, furniture included, so it can be shown
            to somebody a piece at a time. Only for the demo account, and only
            because that account is also off the clock - stepping through a
            broadcast that keeps moving would be unusable. */}
        {/* Local only: which news is on air right now, and a way to it. Shown
            while a story's own span is playing - not over the intro, the ads
            or the music between stories, which are nobody's news. */}
        {import.meta.env.DEV && onAir && story && at >= story.startSec && (story.endSec == null || at < story.endSec) && (
          <button
            type="button"
            onClick={() => navigate('/generate/social-media', { state: { topStory: { storyId: story.id } } })}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 16,
              border: `2px solid ${RULE}`, background: SURFACE, color: INK, textAlign: 'left',
              padding: '10px 14px', font: '600 13px/1.35 Inter, sans-serif', cursor: 'pointer',
            }}
          >
            <span style={{ color: MUTED, whiteSpace: 'nowrap' }}>{t('radio.openNews')}</span>
            <span lang="hi" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {story.title}
            </span>
            <span aria-hidden="true">→</span>
          </button>
        )}

        {isDemo && showDemo && onAir && (
          <div style={{ borderTop: `2px solid ${RULE}`, padding: '18px 0 0', marginTop: 20 }}>
            <p style={{
              margin: '0 0 12px', font: '600 11px/1 Inter, sans-serif',
              letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED,
            }}>
              {t('radio.demoTitle')}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {segments.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => seek(s.startSec)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    border: `2px solid ${RULE}`, background: SURFACE, color: INK,
                    padding: '8px 12px', font: '600 12px/1 Inter, sans-serif', cursor: 'pointer',
                  }}
                >
                  {t(`radio.kind.${s.kind}`)}
                  <span style={{ font: '500 11px/1 ui-monospace, monospace', color: MUTED }}>
                    {mmss(s.startSec)}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={toggle}
                style={{
                  marginLeft: 8,
                  border: '2px solid #1d7afc', background: '#1d7afc', color: '#fff',
                  padding: '8px 16px', font: '600 12px/1 Inter, sans-serif', cursor: 'pointer',
                }}
              >
                {playing ? t('radio.pause') : t('radio.play')}
              </button>
              <input
                type="range"
                min={0} max={duration || 0} step={0.5}
                value={Math.min(position, duration || 0)}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label={t('radio.seek')}
                style={{ flex: 1, minWidth: 160, accentColor: '#1d7afc' }}
              />
            </div>
          </div>
        )}
      </div>
      </div>

      <style>{`
        /* Light sources rather than a wash: a wide blue pool from the top-left
           where the title is, a fainter one at the right edge, and a low warm
           glow at the foot like an on-air lamp. No animation - a moving
           gradient repaints the whole page on every frame, on a page whose
           tape is already moving. */
        .bhim-ground {
          position: relative;
          min-height: 100vh;
          background:
            radial-gradient(1100px 560px at 12% -6%, rgba(29, 122, 252, 0.22), transparent 62%),
            radial-gradient(800px 600px at 100% 30%, rgba(63, 110, 255, 0.10), transparent 60%),
            radial-gradient(900px 420px at 78% 108%, rgba(255, 107, 90, 0.07), transparent 65%),
            linear-gradient(180deg, #08113a 0%, #05081a 48%, #040617 100%);
        }
        .bhim-station {
          max-width: 1280px;
          margin-inline: auto;
          padding-inline: 16px;
          padding-block: 24px 40px;
          min-height: 100%;
          display: flex;
          flex-direction: column;
        }
        @media (min-width: 768px) { .bhim-station { padding-inline: 32px; } }
        .bhim-station-v2 { max-width: 1440px; padding-block: 8px 24px; }
        .bhim-station-switch {
          display: flex; gap: 8px; align-items: center;
          flex-wrap: wrap;
        }
        .bhim-station-switch:not(:empty) { margin-bottom: 20px; }
        .bhim-station input[type="range"] { accent-color: #1d7afc; }
        .bhim-station :focus-visible { outline: 2px solid #1d7afc; outline-offset: 2px; }
      `}</style>
    </>
  );
}
