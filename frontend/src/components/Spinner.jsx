import { SPOKE_ANGLES, SPOKE, RIM, HUB } from './brand/geometry';

/**
 * The one spinner.
 *
 * There were eleven inline copies of `animate-spin rounded-full border-2`
 * before this, several of them the same ring at the same size with slightly
 * different colours, and the places that most needed one — the lazy route
 * fallback, the news grid — had none at all and rendered a bare coloured div.
 *
 * It is the logo's wheel (brand/geometry.js) without the nib, so loading reads
 * as the brand turning rather than a generic ring.
 *
 * `label` is read by screen readers and, when `showLabel` is set, printed
 * under the ring. A spinner with no text tells a sighted user something is
 * happening but not what; on a slow connection that difference is the whole
 * message.
 */
export default function Spinner({ size = 32, label = 'Loading', showLabel = false, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`} role="status" aria-live="polite">
      <svg width={size} height={size} viewBox="18 8 64 64" className="spinner-wheel" aria-hidden="true">
        <g stroke="#8FA8FF" strokeWidth="2.3" strokeLinecap="round">
          {SPOKE_ANGLES.map((a) => <line key={a} {...SPOKE} transform={`rotate(${a} 50 40)`} />)}
        </g>
        <circle cx={RIM.cx} cy={RIM.cy} r={RIM.r} fill="none" stroke="#8FA8FF" strokeWidth={RIM.strokeWidth} />
        <circle {...HUB} fill="#8FA8FF" />
      </svg>
      {showLabel ? (
        <span className="text-[12.5px] tracking-wide text-[#8b94b8]">{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </div>
  );
}
