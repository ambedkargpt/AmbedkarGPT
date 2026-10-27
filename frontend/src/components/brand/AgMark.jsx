import { useId } from 'react';
import { SPOKE_ANGLES, SPOKE, RIM, HUB, NIB, NIB_OUTLINE, BOLD_SPOKE_ANGLES, BOLD_NIB } from './geometry';

/**
 * AmbedkarGPT mark — A2 "Spoke Nib" (static).
 *
 * <AgMark size={40} />                       inherits text colour
 * <AgMark size={40} color="#8FA8FF" />       on ink (default dark UI)
 * <AgMark size={40} color="#2E56E8" />       on paper / white
 * <AgMark size={40} color="#FFFFFF" />       on a neela tile
 * <AgMark size={16} variant="bold" />        favicon weight, anything under 24px
 */
export default function AgMark({ size = 40, color = 'currentColor', variant = 'solid', title = 'AmbedkarGPT', decorative = false, className, style }) {
  const id = useId().replace(/:/g, '');
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': title };

  if (variant === 'bold') {
    return (
      <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} {...a11y}>
        {!decorative && <title>{title}</title>}
        <g stroke={color} strokeWidth="5">
          {BOLD_SPOKE_ANGLES.map((a) => <line key={a} x1="50" y1="10" x2="50" y2="66" transform={`rotate(${a} 50 38)`} />)}
        </g>
        <circle cx="50" cy="38" r="28" fill="none" stroke={color} strokeWidth="9" />
        <circle cx="50" cy="38" r="9" fill={color} />
        <path d={BOLD_NIB} fill={color} fillRule="evenodd" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} style={style} {...a11y}>
      {!decorative && <title>{title}</title>}
      <mask id={`${id}g`} maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
        <rect x="-10" y="-10" width="120" height="120" fill="#fff" />
        <path d={NIB_OUTLINE} fill="#000" stroke="#000" strokeWidth="6" strokeLinejoin="round" />
      </mask>
      <g mask={`url(#${id}g)`}>
        <g stroke={color} strokeWidth="2.3" strokeLinecap="round">
          {SPOKE_ANGLES.map((a) => <line key={a} {...SPOKE} transform={`rotate(${a} 50 40)`} />)}
        </g>
        <circle cx={RIM.cx} cy={RIM.cy} r={RIM.r} fill="none" stroke={color} strokeWidth={RIM.strokeWidth} />
      </g>
      <circle {...HUB} fill={color} />
      <path d={NIB} fill={color} fillRule="evenodd" />
    </svg>
  );
}
