import { useEffect, useState, useCallback } from 'react';
import PravartanIntro from './brand/PravartanIntro';
import { useI18n } from '../i18n/index.jsx';

const EXIT_MS = 180;
// How long the splash holds before handing off to the landing page: the
// length of one Pravartan run, so the slogan has landed before it goes.
const HOLD_MS = 3400;
// The logo at its largest: 240px, or half a narrow phone so the wordmark
// under it still fits across the screen.
const LOGO_MAX = 240;
const LOGO_SHARE = 0.5;

export default function OpeningSplash({ onDone }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState('enter');
  const [logoSize] = useState(() => Math.round(Math.min(LOGO_MAX, window.innerWidth * LOGO_SHARE)));

  // Lock body scroll while splash is visible
  useEffect(() => {
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = prev; };
  }, []);

  const dismiss = useCallback(() => {
    setPhase((p) => {
      if (p !== 'enter') return p; // a click and the timer must not both fire
      setTimeout(() => {
        setPhase('gone');
        onDone?.();
      }, EXIT_MS);
      return 'exit';
    });
  }, [onDone]);

  // Auto-advance to the landing page; no interaction required.
  useEffect(() => {
    const id = setTimeout(dismiss, HOLD_MS);
    return () => clearTimeout(id);
  }, [dismiss]);

  // Let an impatient visitor skip ahead with a click, tap or key.
  useEffect(() => {
    window.addEventListener('keydown', dismiss);
    window.addEventListener('pointerdown', dismiss);
    return () => {
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('pointerdown', dismiss);
    };
  }, [dismiss]);

  if (phase === 'gone') return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('splash.welcome')}
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-180 ease-out ${
        phase === 'exit' ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
      style={{ background: 'radial-gradient(ellipse at 50% 30%, #0e1d4a 0%, #080e22 45%, #04080f 100%)' }}
    >
      {/* Logo: the rim draws, the spokes spin in, the nib comes out, then the
          wordmark writes in and the slogan lands (see brand/Pravartan.jsx). */}
      <div className="relative z-10">
        <PravartanIntro size={logoSize} tagline={t('brand.tagline')} />
      </div>

      {/* ESTD */}
      <p className="splash-estd relative z-10 mt-4 font-count text-[11px] uppercase tracking-[0.38em]" style={{ color: '#5a82c0' }}>
        ESTD. 2026
      </p>

      {/* Progress bar — replaces the old Continue button now that the splash
          advances on its own. It shows the wait is finite and deliberate. */}
      <div className="splash-lang relative z-10 mt-9 flex flex-col items-center gap-3">
        <div
          className="h-[3px] w-[148px] overflow-hidden rounded-full"
          style={{ background: 'rgba(90,130,192,0.22)' }}
        >
          <div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, #1a5fff 0%, #3f9fff 100%)',
              boxShadow: '0 0 10px rgba(63,159,255,0.6)',
              animation: `splashProgress ${HOLD_MS}ms linear forwards`,
            }}
          />
        </div>
        <span className="font-count text-[10.5px] uppercase tracking-[0.28em]" style={{ color: '#4d6da6' }}>
          {t('splash.loading')}
        </span>
      </div>

      <style>{`
        @keyframes splashProgress { from { width: 0%; } to { width: 100%; } }
      `}</style>
    </div>
  );
}
