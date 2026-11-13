import { Handshake, Landmark, ScrollText } from 'lucide-react';

import SectionLabel from './SectionLabel';
import PeekCarousel from './PeekCarousel';
import { useI18n } from '../../i18n/index.jsx';

// Keyed rather than literal: the card copy is translated at render, so the
// array carries identity and the dictionary carries the words.
//
// Drawn icons rather than emoji. Emoji are rendered by the reader's own
// platform, so the same card is a flat Twemoji on one phone and a glossy
// Apple glyph on another, at a weight and palette this page never chose. These
// are stroked at the same width as every other icon in the product and take
// the accent colour, so the row reads as part of the design.
// Each idea takes a colour of the tricolour (saffron, the chakra's blue,
// green), so the three read as three ideas of one flag rather than one card
// printed three times.
const IDEAS = [
  { Icon: Handshake, id: 'unite', color: '#ff9933' },
  { Icon: ScrollText, id: 'const', color: '#5b8cff' },
  { Icon: Landmark, id: 'country', color: '#22c55e' },
];

function IdeaCard({ idea, className = '' }) {
  const { t } = useI18n();
  const c = idea.color;
  const n = IDEAS.indexOf(idea) + 1;
  const Icon = idea.Icon;
  return (
    <div
      data-card
      className={`group relative flex flex-col overflow-hidden rounded-[20px] border p-7 md:p-8 ${className}`}
      style={{
        borderColor: `${c}45`,
        background: `radial-gradient(110% 80% at 100% 0%, ${c}2b 0%, transparent 55%), linear-gradient(165deg, #121b40 0%, #0b1130 60%, #090d24 100%)`,
        boxShadow: `0 30px 60px -34px ${c}99`,
      }}
    >
      {/* The idea's colour along the top edge. */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${c} 0%, ${c}00 85%)` }} />
      {/* Its icon again, large and faint, in the corner. */}
      <Icon
        aria-hidden="true"
        size={170}
        strokeWidth={1}
        className="pointer-events-none absolute -bottom-8 -right-8 opacity-[0.07] transition-transform duration-700 group-hover:-rotate-6 group-hover:scale-105"
        style={{ color: c }}
      />

      <div className="relative flex items-center justify-between">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-[16px] text-white"
          style={{ background: `linear-gradient(145deg, ${c} 0%, ${c}a6 100%)`, boxShadow: `0 10px 26px ${c}55` }}
        >
          <Icon size={26} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="font-count text-[15px] font-semibold tabular-nums" style={{ color: `${c}cc` }}>
          {String(n).padStart(2, '0')}
        </span>
      </div>

      <p className="relative mt-6 whitespace-pre-line font-display text-[21px] font-bold leading-tight text-white md:text-[23px]">
        {t(`ideas.${idea.id}.title`)}
      </p>
      <span aria-hidden="true" className="relative mt-4 block h-[3px] w-10 rounded-full" style={{ background: c }} />

      <p className="relative mt-4 text-[clamp(15px,4vw,19px)] leading-relaxed text-[#b4c6e4] md:text-[20px]">
        {t(`ideas.${idea.id}.body`)}
      </p>
    </div>
  );
}

function IdeasMobileCarousel() {
  const { t } = useI18n();
  return (
    <PeekCarousel
      className="-mx-6 mt-10 sm:hidden"
      count={IDEAS.length}
      labelFor={(i) => t(`ideas.${IDEAS[i].id}.body`)}
      renderItem={(i) => <IdeaCard idea={IDEAS[i]} className="w-full" />}
    />
  );
}

export default function FourIdeasSection() {
  const { t } = useI18n();
  return (
    <section className="relative pt-6 pb-10 sm:pb-20 md:pt-8 md:pb-28">

      <div className="relative mx-auto max-w-7xl px-6">
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
