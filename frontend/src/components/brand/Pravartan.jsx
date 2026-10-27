import { useId } from 'react';
import { SPOKE_ANGLES, SPOKE, RIM, HUB, NIB, NIB_OUTLINE } from './geometry';
import './pravartan.css';

/**
 * "Pravartan" — the animated A2 Spoke Nib.
 * The rim draws from the top, the hub appears, 24 spokes spin in, then the nib comes out of the wheel.
 * Afterwards the wheel keeps turning very slowly (one turn every 24s).
 *
 * mode="once"  (default) plays once in 3.4s, then holds  → splash, navbar, page transitions
 * mode="loop"  4.4s loop with fade                       → long waits, 404, footer
 * hoverSpin    the wheel does one quick turn when the nearest `.group` / link is hovered
 *
 * <Pravartan size={160} />
 * <Pravartan size={44} hoverSpin />
 * <Pravartan size={96} color="#FFFFFF" />               on the neela curtain
 * <Pravartan size={120} mode="loop" />
 */
export default function Pravartan({
  size = 120,
  color = '#8FA8FF',
  nibColor,
  mode = 'once',
  hoverSpin = false,
  title = 'AmbedkarGPT',
  decorative = false,
  className = '',
  style,
}) {
  const id = useId().replace(/:/g, '');
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': title };
  const cls = ['pv', mode === 'loop' ? 'pv--loop' : 'pv--once', hoverSpin ? 'pv--hover' : '', className].join(' ');

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={cls} style={{ overflow: 'visible', ...style }} {...a11y}>
      {!decorative && <title>{title}</title>}
      <defs>
        <mask id={`${id}g`} maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
          <rect x="-10" y="-10" width="120" height="120" fill="#fff" />
          <path className="pv-nib" d={NIB_OUTLINE} fill="#000" stroke="#000" strokeWidth="6" strokeLinejoin="round" />
        </mask>
      </defs>
      <g mask={`url(#${id}g)`}>
        <g className="pv-hov">
          <g className="pv-idle">
            <g className="pv-spin">
              <g className="pv-spokes" stroke={color} strokeWidth="2.3" strokeLinecap="round">
                {SPOKE_ANGLES.map((a) => <line key={a} {...SPOKE} transform={`rotate(${a} 50 40)`} />)}
              </g>
            </g>
          </g>
        </g>
        <circle
          className="pv-rim" cx={RIM.cx} cy={RIM.cy} r={RIM.r}
          fill="none" stroke={color} strokeWidth={RIM.strokeWidth} transform="rotate(-90 50 40)"
        />
      </g>
      <circle className="pv-hub" {...HUB} fill={color} />
      <path className="pv-nib" d={NIB} fill={nibColor || color} fillRule="evenodd" />
    </svg>
  );
}
