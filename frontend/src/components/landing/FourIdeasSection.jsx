import { Handshake, Landmark, ScrollText } from 'lucide-react';

import SectionLabel from './SectionLabel';
import { MobileCarouselControls, MobileCardStack } from './CarouselNav';
import useAutoCarousel from '../../hooks/useAutoCarousel';
import { useI18n } from '../../i18n/index.jsx';

// Keyed rather than literal: the card copy is translated at render, so the
// array carries identity and the dictionary carries the words.
//
// Drawn icons rather than emoji. Emoji are rendered by the reader's own
// platform, so the same card is a flat Twemoji on one phone and a glossy
// Apple glyph on another, at a weight and palette this page never chose. These
// are stroked at the same width as every other icon in the product and take
// the accent colour, so the row reads as part of the design.
const IDEAS = [
  { Icon: Handshake, id: 'unite' },
  { Icon: ScrollText, id: 'const' },
  { Icon: Landmark, id: 'country' },
];

function IdeaCard({ idea, className = '' }) {
  const { t } = useI18n();
  return (
    <div className={`liquid-glass hover-lift flex flex-col rounded-2xl p-7 md:p-8 ${className}`}>
      {/* The icon sits on its own tile rather than loose on the card,
          which gives the three cards a shared anchor at the same size
          whatever the glyph inside happens to be. */}
      <span
        className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#3f9fff]/25"
        style={{ background: 'linear-gradient(145deg, rgba(63,159,255,0.18), rgba(123,92,255,0.10))' }}
      >
        <idea.Icon size={26} strokeWidth={1.6} className="text-[#7fc0ff]" aria-hidden="true" />
      </span>

      <p className="mt-6 whitespace-pre-line font-display text-[20px] font-bold leading-tight text-white md:text-[22px]">
        {t(`ideas.${idea.id}.title`)}
      </p>

      <p className="mt-3 text-[clamp(15px,4vw,19px)] leading-relaxed text-[#9ab8d8] md:text-[21px]">
        {t(`ideas.${idea.id}.body`)}
      </p>
    </div>
  );
}

function IdeasMobileCarousel() {
  const { t } = useI18n();
  const { activeIdx, goPrev, goNext, goTo, animation, rootRef, swipeHandlers } = useAutoCarousel(IDEAS.length);

  return (
    <div ref={rootRef} className="mt-10 sm:hidden">
      <div className="mx-auto max-w-[360px] touch-pan-y" {...swipeHandlers}>
        <MobileCardStack
          items={IDEAS}
          activeIdx={activeIdx}
          animation={animation}
          renderItem={(idea) => <IdeaCard idea={idea} className="w-full" />}
        />
      </div>

      <MobileCarouselControls
        count={IDEAS.length}
        activeIdx={activeIdx}
        onPrev={goPrev}
        onNext={goNext}
        onSelect={goTo}
        labelFor={(i) => t(`ideas.${IDEAS[i].id}.body`)}
      />
    </div>
  );
}

export default function FourIdeasSection() {
  const { t } = useI18n();
  return (
    <section className="relative pt-6 pb-10 sm:pb-20 md:pt-8 md:pb-28">
      <div className="pointer-events-none absolute inset-x-0 -top-20 -bottom-20">
        <div className="hidden md:block absolute left-1/2 top-1/2 h-[400px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2d3fa0]/10 blur-[140px]" />
      </div>

      <div className="relative mx-auto max-w-[1440px] px-6">
        <div className="flex flex-col items-center text-center">
          <SectionLabel>{t('ideas.label')}</SectionLabel>

          <h2 className="mt-6 font-display text-[clamp(26px,7.2vw,38px)] font-extrabold leading-[1.05] text-white md:text-[58px]">
            {t('ideas.headA')}{' '}
            <span className="gradient-text-blue">{t('ideas.headB')}</span>
          </h2>
        </div>

        {/* Phones: one card at a time, swiped or auto-advanced, instead of
            three cards stacked down the page. From sm up it is the same
            three-column grid as before. */}
        <IdeasMobileCarousel />

        <div className="mt-10 hidden gap-5 sm:grid sm:grid-cols-3">
          {IDEAS.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      </div>
    </section>
  );
}
