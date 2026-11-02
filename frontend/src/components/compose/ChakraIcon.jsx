// The small 8-spoke chakra used on the generate button and the big 24-spoke
// one that turns inside the phone while a post is being written.
export default function ChakraIcon({ size = 24, spokes = 8, color = '#fff', spinning = false, rimWidth, spokeWidth }) {
  const step = 360 / spokes;
  const angles = Array.from({ length: spokes }, (_, i) => i * step);
  const rim = rimWidth ?? (spokes > 8 ? 6 : 7);
  const sw = spokeWidth ?? (spokes > 8 ? 2.3 : 4.5);
  return (
    <svg width={size} height={size} viewBox={spokes > 8 ? '8 -2 84 84' : '15 5 70 70'} aria-hidden="true">
      <g className={spinning ? 'cmp-spin' : undefined}>
        <g stroke={color} strokeWidth={sw} strokeLinecap="round">
          {angles.map((a) => (
            <line key={a} x1="50" y1="30.5" x2="50" y2="12" transform={`rotate(${a} 50 40)`} />
          ))}
        </g>
        <circle cx="50" cy="40" r="30" fill="none" stroke={color} strokeWidth={rim} />
        {spokes > 8 && <circle cx="50" cy="40" r="6" fill={color} />}
      </g>
    </svg>
  );
}
