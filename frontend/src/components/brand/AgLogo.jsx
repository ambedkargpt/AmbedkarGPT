import AgMark from './AgMark';
import Pravartan from './Pravartan';

/**
 * Full AmbedkarGPT logo: A2 mark + "AmbedkarGPT" wordmark (Anek Devanagari 750 — the site's
 * --font-np-display, already loaded).
 *
 * tone="ink"   (default) neela-300 mark, light text — on the dark UI
 * tone="paper" neela mark, paper-ink text           — on #F3EBDD / white
 * tone="neela" white mark, white text               — on #2E56E8
 *
 * animated   use Pravartan (plays once on mount, spins on hover) instead of the static mark
 */
const TONES = {
  ink: { mark: '#8FA8FF', a: '#EDEEF2', g: '#8FA8FF' },
  paper: { mark: '#2E56E8', a: '#1B1A22', g: '#2E56E8' },
  neela: { mark: '#FFFFFF', a: '#FFFFFF', g: '#C9D6FF' },
};

export default function AgLogo({ size = 24, tone = 'ink', stacked = false, tagline, animated = false, className = '' }) {
  const t = TONES[tone] || TONES.ink;
  const markSize = Math.round(size * (stacked ? 2.6 : 1.7));
  const Mark = animated
    ? <Pravartan size={markSize} color={t.mark} hoverSpin decorative />
    : <AgMark size={markSize} color={t.mark} decorative />;
  return (
    <span
      className={className}
      role="img"
      aria-label="AmbedkarGPT"
      style={{ display: 'inline-flex', alignItems: 'center', flexDirection: stacked ? 'column' : 'row', gap: stacked ? size * 0.3 : size * 0.35 }}
    >
      {Mark}
      <span aria-hidden="true" style={{ fontFamily: "'Anek Devanagari', 'Mukta', sans-serif", fontWeight: 750, fontSize: size, lineHeight: 1.15, color: t.a, whiteSpace: 'nowrap' }}>
        Ambedkar<span style={{ color: t.g }}>GPT</span>
      </span>
      {stacked && tagline && (
        <span aria-hidden="true" style={{ fontFamily: "'Tiro Devanagari Hindi', Georgia, serif", fontSize: size * 0.42, lineHeight: 1.5, color: tone === 'paper' ? '#5E5A66' : '#C9CCD6' }}>
          {tagline}
        </span>
      )}
    </span>
  );
}
