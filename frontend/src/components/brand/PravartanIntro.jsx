import Pravartan from './Pravartan';
import './pravartan.css';

/**
 * Logo + wordmark + slogan, choreographed as one 3.4s piece.
 * Drop it into OpeningSplash (first visit) and TransitionCurtain (page changes) in place of
 * the old logo-animation.webp <img>. The parent keeps its own timing; hold for >= 3.2s
 * so the slogan lands before the exit.
 *
 * <PravartanIntro tagline={t('brand.tagline')} />                 dark splash
 * <PravartanIntro size={96} tone="neela" caption={t('loader.dashboard')} />   neela curtain
 */
export default function PravartanIntro({ size = 160, tone = 'ink', tagline, caption }) {
  const onNeela = tone === 'neela';
  const mark = onNeela ? '#FFFFFF' : '#8FA8FF';
  const text = onNeela ? '#FFFFFF' : '#EDEEF2';
  const gpt = onNeela ? '#C9D6FF' : '#8FA8FF';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.1 }} role="status" aria-live="polite">
      <Pravartan size={size} color={mark} decorative />
      <span
        className="pv-word"
        aria-label="AmbedkarGPT"
        style={{ fontFamily: "'Anek Devanagari', 'Mukta', sans-serif", fontWeight: 750, fontSize: Math.round(size * 0.26), lineHeight: 1.15, color: text, whiteSpace: 'nowrap' }}
      >
        Ambedkar<span style={{ color: gpt }}>GPT</span>
      </span>
      {tagline && (
        <span className="pv-tag" style={{ fontFamily: "'Tiro Devanagari Hindi', Georgia, serif", fontSize: Math.max(15, Math.round(size * 0.11)), lineHeight: 1.5, color: onNeela ? '#E6ECFF' : '#C9CCD6' }}>
          {tagline}
        </span>
      )}
      {caption && (
        <span className="pv-tag" style={{ fontFamily: "'Mukta', sans-serif", fontWeight: 600, fontSize: 17, lineHeight: 1.5, color: onNeela ? '#FFFFFF' : '#C9CCD6' }}>
          {caption}
        </span>
      )}
    </div>
  );
}
