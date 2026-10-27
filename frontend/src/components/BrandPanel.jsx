import { useState } from 'react';
import { Link } from 'react-router-dom';
import ImagePlaceholder from './ImagePlaceholder';
import { useI18n } from '../i18n/index.jsx';

// Three named imports, not a glob over the folder.
//
// This used to be `import.meta.glob('../assets/images/*', { eager: true })`
// picking three keys out of the result. The other thirty went into the build
// too - 3.6 MB of images nothing on the site renders - and every file anyone
// dropped in that folder afterwards joined them silently.
import portraitSrc from '../assets/images/ambedkar-portrait.webp';
import statueSrc from '../assets/images/ambedkar-statue.webp';
import AgLogo from './brand/AgLogo';

function BrandLogo() {
  const { t } = useI18n();
  return (
    <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-85">
      <AgLogo size={34} stacked tagline={t('brand.tagline')} />
    </Link>
  );
}

// Framed image with a soft blue border glow.
// `variant` lets us tune the blend for the signup statue (whose native beige/stone
// background would otherwise clash with the dark card).
function FramedImage({ src, label, variant = 'login' }) {
  const [error, setError] = useState(false);
  const isSignup = variant === 'signup';

  if (isSignup) {
    return (
      <div className="relative mx-auto w-full max-w-[520px]">
        {src && !error ? (
          <img
            src={src}
            alt={label}
            onError={() => setError(true)}
            className="h-full w-full object-contain"
          />
        ) : (
          <ImagePlaceholder label={label} />
        )}
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div className="pointer-events-none absolute -inset-8 rounded-[30px] bg-[radial-gradient(circle,rgba(95,140,255,0.22)_0%,transparent_70%)] blur-xl" />

      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-[#2a4375]/60 bg-[#0a1430] shadow-[0_26px_68px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(115,160,240,0.08)]">
        {src && !error ? (
          <img
            src={src}
            alt={label}
            onError={() => setError(true)}
            className="h-full w-full object-cover object-center"
            style={{ filter: 'brightness(0.98) saturate(1.05)' }}
          />
        ) : (
          <ImagePlaceholder label={label} />
        )}

        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(10,20,48,0.12) 0%, rgba(10,20,48,0) 45%, rgba(5,10,28,0.45) 100%)' }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/5 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#050a18]/70 to-transparent" />
      </div>
    </div>
  );
}

export default function BrandPanel({ variant = 'login' }) {
  const { t } = useI18n();
  const isSignup = variant === 'signup';
  const src = isSignup ? statueSrc : portraitSrc;
  const label = isSignup ? 'Ambedkar Statue' : 'Ambedkar Portrait';

  return (
    <div className="relative flex h-full min-h-[100svh] flex-col px-6 pt-8 pb-10 md:px-8 md:pt-10 md:pb-12">
      {/* Image + tagline vertically centered */}
      <div className="flex flex-1 flex-col items-center justify-center gap-0 py-2">
        <FramedImage src={src} label={label} variant={variant} />

        <div className={`text-center ${isSignup ? '-mt-8' : ''}`}>
          <p className="font-serif text-[15px] italic text-[#9fb5e0]">
            {t('brand.quote')}
          </p>
          <p className="mt-1 text-[11.5px] uppercase tracking-[0.18em] text-[#6b80ab]">
            {t('brand.attrib')}
          </p>
          <div className="mt-4">
            <p className="font-display text-[26px] font-semibold leading-[1.1] text-white md:text-[30px]">
              {t('brand.empowering')}
            </p>
            <p className="font-display text-[26px] font-semibold italic leading-[1.1] gradient-text-cyan md:text-[30px]">
              {t('brand.knowledge')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
