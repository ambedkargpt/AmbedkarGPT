import { ShieldCheck, Sparkles } from 'lucide-react';

// Feature chip: icon in a soft glass square + body label
function FeatureChip({ icon: Icon, children }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[#1e3260]/60 bg-[#0a1330]/60 p-3 pr-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#2a4375]/70 bg-[#0c1735]/80 text-[#5fa5ff] shadow-[0_0_12px_rgba(63,159,255,0.25)]">
        <Icon size={15} strokeWidth={1.8} />
      </span>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#aac0e3]">{children}</p>
    </div>
  );
}

// Poster frame — image inside a dark glass card with optional wordmark overlay
function PosterFrame({ image, alt, banner, showBanner, imagePosition = 'object-center' }) {
  return (
    <div className="relative mx-auto w-full max-w-[360px]">
      {/* ambient glow behind the frame */}
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[28px] bg-[radial-gradient(circle,rgba(63,120,255,0.22)_0%,transparent_70%)] blur-2xl" />

      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-[#2a4375]/60 bg-[#0a1430] shadow-[0_24px_60px_rgba(0,0,0,0.55),inset_0_0_0_1px_rgba(115,160,240,0.08)]">
        {image ? (
          <img src={image} alt={alt} className={`h-full w-full object-cover ${imagePosition}`} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#0b1432] via-[#0d1a3f] to-[#0a1430]">
            <span className="font-display text-4xl font-bold text-white/20">{alt}</span>
          </div>
        )}

        {showBanner && banner && (
          <>
            {/* darken strip behind the wordmark */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/55 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 top-5 flex justify-center">
              <span className="font-display text-[clamp(27px,7.4vw,40px)] font-black italic tracking-[0.06em] text-white drop-shadow-[0_3px_10px_rgba(0,0,0,0.75)]">
                {banner}
              </span>
            </div>
          </>
        )}

        {/* bottom fade so the frame blends into the dark page */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#030611]/80 to-transparent" />
      </div>
    </div>
  );
}

// MissionStatement — label pill + two-line title + description + 2 feature chips
// paired with a framed image. Matches Screenshots 183232 / 212605 / 212620.
export default function MissionStatement({
  label         = 'MISSION STATEMENT',
  titlePrimary  = 'Empowering with',
  titleAccent   = 'Truth',
  description   = '',
  image,
  imageAlt      = 'Ambedkar portrait',
  imagePosition = 'object-center',
  banner        = '',
  showBanner    = false,
  imageFirst    = false,
  chips = [
    { icon: ShieldCheck, text: 'Verified insights with exact source citations' },
    { icon: Sparkles,    text: 'AI-powered simplification of complex knowledge' },
  ],
}) {
  const copy = (
    <div className="w-full max-w-[460px]">
      <span className="inline-flex items-center rounded-md border border-[#3a6bc4]/60 bg-[#0d1a36]/70 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#9dc3ff]">
        {label}
      </span>

      <h2 className="mt-6 font-display text-[clamp(30px,8.2vw,48px)] font-bold leading-[1.03] tracking-tight text-white md:text-[60px]">
        {titlePrimary}
        <br />
        <span className="italic gradient-text-blue">{titleAccent}</span>
      </h2>

      <p className="mt-6 text-[14.5px] leading-[1.8] text-[#aec0de]">
        {description}
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {chips.map((c, i) => (
          <FeatureChip key={i} icon={c.icon}>
            {c.text}
          </FeatureChip>
        ))}
      </div>
    </div>
  );

  const imageBlock = (
    <div className="w-full">
      <PosterFrame
        image={image}
        alt={imageAlt}
        imagePosition={imagePosition}
        banner={banner}
        showBanner={showBanner}
      />
    </div>
  );

  return (
    <section className="relative py-12 md:py-16">

      <div className="mx-auto grid max-w-[1180px] items-start gap-7 sm:gap-12 px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:gap-14">
        {imageFirst ? (
          <>
            {imageBlock}
            {copy}
          </>
        ) : (
          <>
            {copy}
            {imageBlock}
          </>
        )}
      </div>
    </section>
  );
}
