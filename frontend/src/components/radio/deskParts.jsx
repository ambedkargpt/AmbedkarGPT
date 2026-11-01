import { useEffect, useLayoutEffect, useRef } from 'react';
import { Mic, Play } from 'lucide-react';

import { useI18n } from '../../i18n/index.jsx';
import { ACCENT, ACCENT_HOVER, INK, MUTED, RULE, mmss } from './radioTokens';

/* ── pieces both broadcast layouts are built from ─────────────────────────
   Flat surfaces, no radius, 2px rules between regions. The two layouts differ
   in arrangement, not in parts, so everything shared lives here and neither
   layout owns a second copy that can drift from the other.
   ------------------------------------------------------------------------ */

/* ── small label ──────────────────────────────────────────────────────────── */

export function Label({ children, tone = MUTED, className = '' }) {
  // Devanagari is not letter-spaced: the marks sit on the letters and tracking
  // pulls them off. index.css already makes that exception for .dash-eyebrow.
  return (
    <span
      className={`dash-eyebrow ${className}`}
      style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', color: tone }}
    >
      {children}
    </span>
  );
}

/* ── programme and anchor ─────────────────────────────────────────────────── */

/** The programme's name with the station's line under it. */
export function ProgramLine({ align = 'left' }) {
  const { t } = useI18n();
  return (
    <div style={{ textAlign: align }}>
      <p lang="hi" style={{ margin: 0, font: '700 21px/1.3 var(--font-hindi)', color: '#ffc72c' }}>
        {t('radio.program')}
      </p>
      <p lang="hi" style={{ margin: '2px 0 0', fontSize: 15, color: MUTED, fontFamily: 'var(--font-hindi)' }}>
        {t('radio.slogan')}
      </p>
    </div>
  );
}

/**
 * Who is reading - a channel's lower-third: a red block with the role, the
 * anchor's name beside it.
 */
export function AnchorTag() {
  const { t } = useI18n();
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'stretch', overflow: 'hidden',
        borderRadius: 6, border: '1px solid rgba(255, 199, 44, 0.45)',
        font: '600 16px/1 var(--font-hindi)', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 10px', background: '#d4141f', color: '#fff' }}>
        <Mic size={16} strokeWidth={2.4} aria-hidden="true" />
        {t('radio.anchorLabel')}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 12px', background: '#0d1333', color: '#fff' }}>
        {t('radio.anchorName')}
      </span>
    </span>
  );
}

/* ── transcript ───────────────────────────────────────────────────────────── */

/**
 * The words being read, with the current one lit.
 *
 * The manifest carries the narration itself, so this is the text the voice is
 * actually speaking rather than a summary written beside it. There are no word
 * timings in the manifest, so the position is estimated from how far into the
 * story the broadcast is - even spacing, which drifts within a sentence and
 * re-syncs at every story boundary. Good enough to follow, and honest about it
 * by never claiming a word is exact.
 */
export function Transcript({ text, offsetSec, durationSec, listening, size = 23, follow = false }) {
  const { t } = useI18n();
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const paraRef = useRef(null);
  // The last position the page reported, and when. The clock arrives four
  // times a second; between those the position is carried forward here, every
  // frame, so the highlight moves the way the voice does instead of in jumps.
  const base = useRef({ offset: offsetSec, at: 0 });

  useLayoutEffect(() => {
    base.current = { offset: offsetSec, at: performance.now() };
  }, [offsetSec, text]);

  useEffect(() => {
    const para = paraRef.current;
    if (!para || !words.length) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    // Spoken time runs with the length of a word, not one slot per word: a long
    // compound takes several times as long to say as "का". So the position is
    // laid over the letters and mapped back to the word they belong to, with
    // how far through that word it is. Before the words start nothing is lit;
    // after they end, all of them are.
    const weights = words.map((w) => w.length + 1);
    const total = weights.reduce((x, y) => x + y, 0);
    const spans = para.children;
    // In a box that scrolls, the word being said is kept in view: a third of
    // the way down, so what comes next is visible below it.
    const box = follow ? para.closest('[data-transcript-scroll]') : null;
    let shown = -2;
    let frame = 0;

    function paint() {
      const since = Math.min((performance.now() - base.current.at) / 1000, 0.5);
      const offset = base.current.offset + (reduced ? 0 : since);
      const ratio = durationSec > 0 ? Math.min(offset / durationSec, 1) : 0;
      let current = -1;
      let within = 0;
      if (ratio >= 1) {
        current = words.length;
      } else if (ratio >= 0) {
        const target = ratio * total;
        let run = 0;
        for (let i = 0; i < weights.length; i += 1) {
          if (run + weights[i] > target) { current = i; within = (target - run) / weights[i]; break; }
          run += weights[i];
        }
      }
      for (let i = 0; i < spans.length; i += 1) {
        const state = i < current ? 'done' : i === current ? 'now' : 'next';
        if (spans[i].dataset.s !== state) spans[i].dataset.s = state;
      }
      if (current >= 0 && current < spans.length) {
        spans[current].style.setProperty('--p', `${reduced ? 100 : Math.round(within * 100)}%`);
      }
      if (box && current !== shown && current >= 0 && current < spans.length) {
        shown = current;
        const top = spans[current].offsetTop - para.offsetTop - box.clientHeight / 3;
        box.scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
      }
      frame = requestAnimationFrame(paint);
    }
    paint();
    return () => cancelAnimationFrame(frame);
  }, [text, durationSec, follow]);   // eslint-disable-line react-hooks/exhaustive-deps

  if (!words.length) return null;

  return (
    <div style={{ opacity: listening ? 1 : 0.55 }}>
      <p
        ref={paraRef}
        lang="hi"
        className="bhim-transcript"
        style={{
          fontFamily: 'var(--font-hindi)',
          fontSize: size,
          lineHeight: 1.75,
          margin: 0,
          color: INK,
        }}
      >
        {words.map((word, i) => (
          <span key={`${i}-${word}`}>{word}{' '}</span>
        ))}
      </p>
      {!listening && (
        <p style={{ margin: '12px 0 0', fontSize: 12, color: MUTED }}>
          {t('radio.tuneInToHear')}
        </p>
      )}
      <style>{`
        /* Upcoming words are dim, spoken ones full ink, and the word being said
           fills from left to right as it is said. The colour change is eased so
           a word settles into "spoken" rather than snapping. */
        .bhim-transcript > span { color: #5a6789; transition: color .35s ease; }
        .bhim-transcript > span[data-s="done"] { color: ${INK}; }
        .bhim-transcript > span[data-s="now"] {
          color: #fff;
          border-radius: 4px;
          background-image: linear-gradient(90deg, #1a3a80 var(--p, 0%), rgba(26, 58, 128, 0.35) var(--p, 0%));
          -webkit-box-decoration-break: clone; box-decoration-break: clone;
        }
        @media (prefers-reduced-motion: reduce) {
          .bhim-transcript > span { transition: none; }
        }
      `}</style>
    </div>
  );
}

/* ── signal meter ─────────────────────────────────────────────────────────── */

/** Twenty-eight bars that move only while sound is coming out. */
/**
 * The meter moves whenever the station is on air, listening or not.
 *
 * It used to move only while the listener could hear it, which said the wrong
 * thing: the clock keeps counting, the headline keeps changing and the tape
 * keeps sliding for someone tuned out, and then the one part that actually
 * looks like sound sat still. The broadcast is running either way - what
 * changes is whether this person is receiving it, and that is the colour.
 */
export function SignalMeter({ active, live, bars = 28, color = ACCENT_HOVER }) {
  const moving = active || live;
  return (
    <span
      aria-hidden="true"
      style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 26 }}
    >
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={moving ? 'bhim-signal-bar' : ''}
          style={{
            width: 3,
            height: moving ? undefined : 3,
            // Bright while it is reaching this listener, dim while it is
            // going out past them.
            background: active ? color : moving ? '#2f4a7a' : RULE,
            animationDelay: `${(i % 7) * 0.13}s`,
            // Shorter throw when nobody is listening, so the two states read
            // differently at a glance rather than only by colour.
            animationDuration: active ? undefined : '0.9s',
          }}
        />
      ))}
    </span>
  );
}

/* ── tune button ──────────────────────────────────────────────────────────── */

export function TuneButton({ listening, onClick, disabled, width = 220, height = 60 }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? t('radio.tuneOff') : t('radio.tuneInAria')}
      className="bhim-tune"
      style={{
        width, height,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        padding: '0 20px', borderRadius: 999,
        border: listening ? `2px solid ${ACCENT}` : '2px solid transparent',
        background: listening ? 'transparent' : ACCENT,
        color: listening ? ACCENT_HOVER : '#fff',
        font: '700 21px/1 var(--font-body, Inter), system-ui, sans-serif',
        letterSpacing: '0.02em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {listening
        ? <span style={{ width: 10, height: 10, background: ACCENT_HOVER, flex: 'none' }} />
        : <Play size={22} strokeWidth={2.2} fill="currentColor" style={{ flex: 'none' }} />}
      <span style={{ textAlign: 'left' }}>
        {listening ? t('radio.tuneOff') : t('radio.tuneIn')}
      </span>
    </button>
  );
}

/* ── volume ───────────────────────────────────────────────────────────────── */

export function VolumeControl({ volume, onChange, listening, disabled, color = ACCENT, compact = false }) {
  const { t } = useI18n();
  const pct = `${Math.round(volume * 100)}%`;
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        opacity: listening ? 1 : 0.4,
        minWidth: 0,
      }}
    >
      {!compact && <Label>{t('radio.volume')}</Label>}
      <input
        type="range"
        min={0} max={1} step={0.01}
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        aria-label={t('radio.volume')}
        style={{
          width: 120, height: 3, appearance: 'none', cursor: 'pointer',
          background: `linear-gradient(90deg, ${color} ${pct}, ${RULE} ${pct})`,
        }}
      />
      <span
        style={{
          font: compact ? '500 13.5px/1 Inter, system-ui, sans-serif' : '500 14px/1 ui-monospace, monospace',
          color: MUTED, fontVariantNumeric: 'tabular-nums', minWidth: 34,
        }}
      >
        {pct}
      </span>
    </label>
  );
}

/* ── status line ──────────────────────────────────────────────────────────── */

export function StatusLine({ listening, nextInSec, progress, compact = false }) {
  const { t } = useI18n();
  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div
        style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          gap: 16, marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: compact ? 14.5 : 15, color: listening ? INK : MUTED,
            ...(compact ? { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : {}),
          }}
        >
          {listening ? t('radio.listeningLive') : t('radio.runningTuneIn')}
        </span>
        <span
          style={{
            font: compact ? '500 14px/1 Inter, system-ui, sans-serif' : '500 14px/1 ui-monospace, monospace',
            color: MUTED, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          }}
        >
          {t('radio.nextIn', { time: mmss(nextInSec) })}
        </span>
      </div>
      <div style={{ height: 3, background: RULE }} aria-hidden="true">
        <div style={{ height: '100%', width: `${progress * 100}%`, background: ACCENT }} />
      </div>
    </div>
  );
}
