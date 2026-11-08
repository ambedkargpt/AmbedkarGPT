import Sparkle from './Sparkle';

export default function SectionLabel({ children, size = 'md' }) {
  const isLg = size === 'lg';
  return (
    <div data-eyebrow className="flex justify-center">
      <div
        className={`pill-premium relative inline-flex max-w-full items-center gap-2 rounded-full sm:gap-4 ${
          isLg ? 'px-5 py-2.5 sm:px-12 sm:py-5' : 'px-4 py-2 sm:px-11 sm:py-4.5'
        }`}
      >
        {/* inner top-edge highlight */}
        <span className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(100,180,255,0.6),transparent)]" />

        <span className="sparkle-twinkle inline-flex shrink-0 scale-[0.62] sm:scale-100">
          <Sparkle size={isLg ? 28 : 26} color="#4fb4ff" />
        </span>

        <span
          className={`whitespace-nowrap font-bold tracking-wide ${
            isLg ? 'text-[17px] sm:text-[28px]' : 'text-[16px] sm:text-[26px]'
          }`}
          style={{
            background: 'linear-gradient(90deg, #a8d0ff 0%, #4fb4ff 50%, #a8d0ff 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          {children}
        </span>

        <span className="sparkle-twinkle-delay inline-flex shrink-0 scale-[0.62] sm:scale-100">
          <Sparkle size={isLg ? 28 : 26} color="#4fb4ff" />
        </span>
      </div>
    </div>
  );
}
