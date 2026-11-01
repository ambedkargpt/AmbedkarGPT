import { Pause, Play } from 'lucide-react';
import { useI18n } from '../../i18n/index.jsx';
import { DEEP, RULE } from './radioTokens';

const SIZE = 400;
const C = SIZE / 2;
const RING_R = 188;
const RING_C = 2 * Math.PI * RING_R;

/**
 * The radio's dial: the story's progress as a ring, a chakra that turns
 * slowly when idle and quickly while listening, and the play button at its
 * hub. Scales to its column; the drawing is 400 x 400.
 */
export default function ChakraDial({ color, progress = 0, listening, canTune, onTune }) {
  const { t } = useI18n();
  const glowId = `dial-glow-${color.replace('#', '')}`;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[400px]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" aria-hidden="true">
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="70%" stopColor={color} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={C} fill={`url(#${glowId})`} className="chakra-glow" />

        {Array.from({ length: 60 }, (_, i) => {
          const major = i % 5 === 0;
          return (
            <line
              key={i}
              x1={C} y1={C - 194} x2={C} y2={C - (major ? 178 : 182)}
              stroke={major ? '#3a4e80' : RULE}
              strokeWidth={major ? 2 : 1.2}
              transform={`rotate(${i * 6} ${C} ${C})`}
            />
          );
        })}

        <circle cx={C} cy={C} r={RING_R} fill="none" stroke="#141c44" strokeWidth="7" />
        <circle
          cx={C} cy={C} r={RING_R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - Math.min(1, Math.max(0, progress)))}
          transform={`rotate(-90 ${C} ${C})`}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />

        <g className={`chakra-spokes ${listening ? 'chakra-fast' : 'chakra-slow'}`}>
          {Array.from({ length: 24 }, (_, i) => (
            <line
              key={i}
              x1={C} y1={C - 50} x2={C} y2={C - 138}
              stroke={color} strokeWidth="4.5" strokeLinecap="round"
              transform={`rotate(${i * 15} ${C} ${C})`}
            />
          ))}
        </g>
        <circle cx={C} cy={C} r="146" fill="none" stroke={color} strokeOpacity="0.85" strokeWidth="12" />
        <circle cx={C} cy={C} r="56" fill={DEEP} stroke={color} strokeWidth="4" />
      </svg>

      <button
        type="button"
        onClick={onTune}
        disabled={!canTune}
        aria-pressed={listening}
        aria-label={listening ? t('radio.tuneOff') : t('radio.tuneInAria')}
        className="btn-gradient absolute left-1/2 top-1/2 flex h-[24%] w-[24%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white transition-transform duration-200 hover:scale-[1.06] hover:shadow-[0_0_32px_rgba(63,159,255,0.55)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 motion-reduce:transition-none"
      >
        {listening
          ? <Pause className="h-[38%] w-[38%]" strokeWidth={2.4} fill="currentColor" />
          : <Play className="ml-[6%] h-[38%] w-[38%]" strokeWidth={2.4} fill="currentColor" />}
      </button>

      <style>{`
        .chakra-spokes { transform-box: view-box; transform-origin: 200px 200px; animation: chakra-spin linear infinite; }
        .chakra-slow { animation-duration: 90s; }
        .chakra-fast { animation-duration: 14s; }
        .chakra-glow { animation: chakra-pulse 2.4s ease-in-out infinite; }
        @keyframes chakra-spin { to { transform: rotate(360deg); } }
        @keyframes chakra-pulse { 0%, 100% { opacity: .35; } 50% { opacity: .75; } }
        @media (prefers-reduced-motion: reduce) {
          .chakra-spokes, .chakra-glow { animation: none; }
        }
      `}</style>
    </div>
  );
}
