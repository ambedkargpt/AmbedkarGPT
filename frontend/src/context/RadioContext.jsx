import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuth } from './AuthContext';
import {
  broadcastPositionSec, loadStation, radioConfigured, stationForParty, trackAt } from '../data/bhimRadio';
import { trackEvent } from '../analytics/metrics';

/**
 * Bhim Radio's one audio element and everything that knows about it.
 *
 * This sits above <Routes> rather than in a layout or the navbar, and that
 * placement is the point: every public page wraps itself in its own
 * MainLayout, so a player living there would unmount on navigation and the
 * audio would stop mid-sentence. A radio that dies when you open another page
 * is not a radio.
 *
 * What it plays is one file. Bheem Radio builds a single looped MP3 per party
 * per day and a manifest of offsets into it, so "next story" is a seek, not a
 * load: the audio never stops, and skipping is instant once the file is
 * buffered. That is why there is no per-track `src` anywhere here.
 */

const RadioContext = createContext(null);

const VOLUME_KEY = 'bhim-radio-volume';
// How far into a story "previous" still means "start this one again", the way
// every other player behaves.
const RESTART_WINDOW_SEC = 3;

/**
 * Put the needle at `seconds`, now or as soon as the file admits its length.
 *
 * Assigning currentTime before `loadedmetadata` is silently ignored, which
 * would land a listener at the top of the file instead of on air - and
 * silently, because the audio plays perfectly well from the wrong place.
 */
function seekWhenReady(el, seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return;
  if (el.readyState > 0) {
    el.currentTime = seconds;
    return;
  }
  const once = () => {
    el.removeEventListener('loadedmetadata', once);
    el.currentTime = seconds;
  };
  el.addEventListener('loadedmetadata', once);
}

function readStoredVolume() {
  // Per-viewer convenience only. Private windows and blocked site data make
  // this throw or come back empty, which is not worth an error - it just means
  // this listener starts at full volume.
  try {
    const raw = window.localStorage.getItem(VOLUME_KEY);
    const n = Number(raw);
    return raw !== null && Number.isFinite(n) && n >= 0 && n <= 1 ? n : 1;
  } catch {
    return 1;
  }
}

export function RadioProvider({ children }) {
  const { currentUser } = useAuth();

  const audioRef = useRef(null);
  // Built on mount rather than during render: touching a ref while rendering
  // is not allowed, and an <audio> is a side effect besides.
  const [audioReady, setAudioReady] = useState(false);

  // Set by anything that needs to know what is on air - the station page, the
  // headline ticker. Until something asks, no manifest is fetched, so a reader
  // who never meets the radio does not pay for it.
  const [primed, setPrimed] = useState(false);
  const primeStation = useCallback(() => setPrimed(true), []);

  // Whether this listener is on the broadcast or holding the tape.
  //
  // On (the default) the station runs on a clock: tuning in joins it wherever
  // it has got to, and the position keeps moving while tuned out. That is what
  // a radio does, and it is wrong for one job - showing somebody how a
  // bulletin is built. There you have to stop on the opening music, talk over
  // it, and carry on from that exact second; and a scrub while stopped has to
  // stay where it was put instead of being overwritten by the clock a second
  // later. Off, this behaves like any player.
  const [followBroadcast, setFollowBroadcast] = useState(true);
  const [tenant, setTenantState] = useState('general');
  const [station, setStation] = useState(null);
  // idle | loading | ready | empty | error. `idle` until the panel is first
  // opened: someone who never presses Radio should not pay for the manifest.
  const [status, setStatus] = useState('idle');
  const [playing, setPlaying] = useState(false);
  const [volume, setVolumeState] = useState(readStoredVolume);
  const [muted, setMuted] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [streamError, setStreamError] = useState(false);

  // Follows the signed-in user's party until they choose a station themselves,
  // after which their choice stands - switching party mid-session is not a
  // reason to yank the stream they are listening to.
  const chosen = useRef(false);
  useEffect(() => {
    if (chosen.current) return;
    setTenantState(stationForParty(currentUser?.political_party));
  }, [currentUser?.political_party]);

  const setTenant = useCallback((next) => {
    chosen.current = true;
    setTenantState(next);
  }, []);

  // Memoised because the `?? []` would otherwise hand out a new array on
  // every render, which would make the context value new every render too
  // and re-render every listener of it for nothing.
  const tracks = useMemo(() => station?.tracks ?? [], [station]);
  // Everything, furniture included - see segmentsFrom. Only the demo controls
  // use it, and for the same reason as `tracks`, it is memoised.
  const segments = useMemo(() => station?.segments ?? [], [station]);
  const index = trackAt(tracks, position);
  const track = index >= 0 ? tracks[index] : null;
  // Read by the manifest check, which runs on a timer and must see the
  // current values rather than the ones it was set up with.
  const indexRef = useRef(index);
  const playingRef = useRef(false);
  useEffect(() => { indexRef.current = index; playingRef.current = playing; }, [index, playing]);

  // ── Load the day's stream ───────────────────────────────────────────────
  const [reloadToken, setReloadToken] = useState(0);
  const retry = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (!primed || !radioConfigured) return undefined;
    let cancelled = false;
    setStatus('loading');
    loadStation(tenant)
      .then((next) => {
        if (cancelled) return;
        setStation(next);
        setStatus(next && next.tracks.length ? 'ready' : 'empty');
      })
      .catch(() => {
        if (cancelled) return;
        setStation(null);
        setStatus('error');
      });
    return () => { cancelled = true; };
  }, [primed, tenant, reloadToken]);

  // ── A newer bulletin ────────────────────────────────────────────────────
  // The bulletin is rebuilt whenever a story comes in, newest first. Every two
  // minutes the manifest is asked for again (it is cached for sixty seconds,
  // so this is one small request). A new one is put on straight away for
  // someone not listening; for someone who is, it waits for the story they
  // are in to finish, so nobody is cut off mid-sentence.
  const [pending, setPending] = useState(null);   // { station, fromIndex }
  useEffect(() => {
    if (!primed || !radioConfigured || !station) return undefined;
    let cancelled = false;
    const check = () => {
      loadStation(tenant)
        .then((next) => {
          if (cancelled || !next || !next.tracks.length || next.audioUrl === station.audioUrl) return;
          if (playingRef.current) {
            setPending({ station: next, fromIndex: indexRef.current });
          } else {
            setPending(null);
            setStation(next);
          }
        })
        .catch(() => {});
    };
    const timer = setInterval(check, 120_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [primed, tenant, station]);

  // The story that was playing when the new bulletin arrived has ended: put
  // the new one on. The audio effect below then joins it where it has got to.
  if (pending && index !== pending.fromIndex) {
    setPending(null);
    setStation(pending.station);
  }

  // ── The element ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = new Audio();
    el.preload = 'none';
    // One file, played round. The build puts the sign-off at the end and the
    // station ident at the start, so looping reads as a broadcast rather than
    // as a track repeating.
    el.loop = true;
    audioRef.current = el;
    setAudioReady(true);
    return () => { el.pause(); el.src = ''; audioRef.current = null; };
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return undefined;
    const onTime = () => setPosition(el.currentTime || 0);
    const onMeta = () => setDuration(Number.isFinite(el.duration) ? el.duration : 0);
    const onPlay = () => { setPlaying(true); setStreamError(false); };
    const onPause = () => setPlaying(false);
    const onError = () => { setPlaying(false); setStreamError(true); };

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('error', onError);
    };
  }, [audioReady]);

  // Point the element at the day's file. Only ever runs when the station
  // changes, which is why skipping between stories costs nothing.
  const wantPlay = useRef(false);
  const audioUrl = station?.audioUrl ?? '';
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!audioUrl) { el.removeAttribute('src'); el.load(); return; }
    el.src = audioUrl;
    el.preload = 'metadata';
    const live = broadcastPositionSec(station);
    seekWhenReady(el, live);
    setPosition(live);
    setDuration(station?.durationSec || 0);
    setStreamError(false);
    if (wantPlay.current) {
      // Rejects when the browser refuses playback - autoplay rules, or a file
      // it cannot decode. Either way the element stays paused and state
      // follows it, so the button never lies about what is happening.
      el.play().catch(() => setPlaying(false));
    }
  }, [audioUrl, audioReady]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = audioRef.current;
    if (el) { el.volume = volume; el.muted = muted; }
  }, [volume, muted, audioReady]);

  // The clock, ticking on its own four times a second.
  //
  // Separate from `position`, which follows the audio element: the panel has
  // to keep moving for someone who is not listening at all, and a tape that
  // scrolls at eleven pixels a second needs finer resolution than `timeupdate`
  // fires at. Nothing here touches the audio.
  const [broadcastNow, setBroadcastNow] = useState(0);
  useEffect(() => {
    if (!station) return undefined;
    const tick = () => setBroadcastNow(broadcastPositionSec(station));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [station]);

  // While tuned out, the broadcast carries on without us, and the panel says
  // so: the position keeps moving and the story name keeps changing. Nothing
  // is decoding and nothing is being downloaded - this is the clock, not the
  // audio. Without it a listener who tunes out sees a frozen player and has
  // every reason to think the station went off air with them.
  useEffect(() => {
    if (playing || !station || !followBroadcast) return undefined;
    const tick = () => setPosition(broadcastPositionSec(station));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [playing, station, followBroadcast]);

  // ── Controls ────────────────────────────────────────────────────────────
  const play = useCallback(() => {
    // Asked for before the station has loaded (a "Listen now" on the landing
    // page, say): remember it and load the station. The effect that sets the
    // source starts playback as soon as the file is there, so one press is
    // enough - nobody has to find a Play button afterwards. The click has
    // already given the page permission to play sound.
    wantPlay.current = true;
    setPrimed(true);
    const el = audioRef.current;
    if (!el || !el.src) return;
    trackEvent('radio_play', { station: tenant });
    // Tuning in joins the broadcast where it is now, not where this listener
    // left it. Someone who tunes out for ten minutes and back in has missed
    // ten minutes, exactly as they would on a real set.
    if (followBroadcast) {
      const live = broadcastPositionSec(station);
      seekWhenReady(el, live);
      setPosition(live);
    }
    el.play().catch(() => setPlaying(false));
  }, [tenant, station, followBroadcast]);

  const pause = useCallback(() => {
    wantPlay.current = false;
    audioRef.current?.pause();
  }, []);

  const toggle = useCallback(() => { if (playing) pause(); else play(); }, [playing, play, pause]);

  const seek = useCallback((seconds) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(seconds)) return;
    const limit = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
    const to = Math.max(0, limit ? Math.min(seconds, limit - 0.25) : seconds);
    el.currentTime = to;
    setPosition(to);
  }, []);

  // Skipping is a seek inside the one file, so it is instant and never
  // interrupts playback - there is no new source to buffer.
  const next = useCallback(() => {
    if (!tracks.length) return;
    const to = tracks[Math.min(index + 1, tracks.length - 1)];
    // Past the last story, the outro is still ahead; let it run rather than
    // jumping backwards, which would be a surprising thing for "next" to do.
    if (index >= tracks.length - 1) return;
    seek(to.startSec);
  }, [tracks, index, seek]);

  const previous = useCallback(() => {
    if (!tracks.length) return;
    if (index < 0) { seek(tracks[0].startSec); return; }
    const current = tracks[index];
    const restart = position - current.startSec > RESTART_WINDOW_SEC || index === 0;
    seek(restart ? current.startSec : tracks[index - 1].startSec);
  }, [tracks, index, position, seek]);

  const setVolume = useCallback((v) => {
    const clamped = Math.min(1, Math.max(0, v));
    setVolumeState(clamped);
    // Moving the slider off zero is the clearest possible "unmute me".
    if (clamped > 0) setMuted(false);
    try { window.localStorage.setItem(VOLUME_KEY, String(clamped)); } catch { /* not worth failing over */ }
  }, []);

  const value = useMemo(() => ({
    configured: radioConfigured,
    tenant, setTenant,
    station, status, retry,
    tracks, segments, track, index,
    broadcastNow,
    playing, play, pause, toggle,
    primeStation,
    followBroadcast, setFollowBroadcast,
    next, previous,
    position, duration, seek,
    volume, setVolume,
    muted, toggleMute: () => setMuted((m) => !m),
    streamError,
  }), [
    tenant, setTenant, station, status, retry, tracks, segments, track, index, broadcastNow,
    playing, play, pause, toggle, next, previous, position, duration, seek, primeStation,
    followBroadcast,
    volume, setVolume, muted, streamError,
  ]);

  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>;
}

export function useRadio() {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error('useRadio must be used inside <RadioProvider>');
  return ctx;
}
