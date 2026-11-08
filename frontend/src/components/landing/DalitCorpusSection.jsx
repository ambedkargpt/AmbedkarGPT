import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import SectionLabel from './SectionLabel';
import CorpusContactModal from './CorpusContactModal';
import CorpusContributeModal from './CorpusContributeModal';
import libraryImg   from '../../assets/images/corpus-library.webp';
import { useI18n } from '../../i18n/index.jsx';

// Keys, not prose: the section is rendered through the dictionary so both
// languages read from the same structure.
const CORPUS = {
  question: 'corpus.question',
  intro: ['corpus.intro1', 'corpus.intro2', 'corpus.intro3', 'corpus.intro4'],
  whyItMatters: ['corpus.why1', 'corpus.why2', 'corpus.why3', 'corpus.why4'],
  whyWeNeedIt: 'corpus.need',
};

function handleCardMove(e) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - rect.left}px`);
  el.style.setProperty('--my', `${e.clientY - rect.top}px`);
}

export default function DalitCorpusSection() {
  const { t } = useI18n();
  // Neither route is self-serve yet. Contribute used to scroll to the contact
  // form and Buy sent people to signup, which promised a purchase flow that
  // does not exist. Both now open the same prompt to email us.
  const [contactType, setContactType] = useState(null);

  return (
    <section id="ambedkarverse" className="relative overflow-hidden pb-8 pt-0 md:pb-10">
      {/* The word the section is about, set once behind the heading as
          outlined type. Hidden on phones, where it would sit under the text
          rather than behind it. */}
      <span className="bg-word top-16 hidden sm:block" aria-hidden="true">CORPUS</span>
      <div className="pointer-events-none absolute inset-x-0 -top-28 -bottom-28">
        <div className="hidden md:block absolute left-[10%] top-[20%] h-[420px] w-[420px] rounded-full bg-[#2d7dfb]/9 blur-[130px]" />
        <div className="hidden md:block absolute right-[5%] bottom-[10%] h-[360px] w-[360px] rounded-full bg-[#1a3fa0]/7 blur-[130px]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="flex justify-center">
          <SectionLabel size="lg">{t('landing.dalitCorpus')}</SectionLabel>
        </div>

        <h2 className="mx-auto mt-8 max-w-[900px] text-center font-display text-[clamp(31px,8.4vw,52px)] font-bold leading-[1.05] text-white md:text-[72px]">
          {t('corpus.headPre')}{' '}
          <span className="italic gradient-text-blue">{t('landing.theMovement')}</span>
        </h2>

        <p className="mx-auto mt-6 max-w-[760px] text-center text-[clamp(16px,4.3vw,22px)] leading-9 text-[#bfcfe8] md:text-[24px]">
          {t('corpus.tagline')}
        </p>

        <div
          onMouseMove={handleCardMove}
          className="card-premium group relative mt-10 overflow-hidden rounded-2xl"
        >
          {/* cursor spotlight */}
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{ background: 'radial-gradient(320px circle at var(--mx,50%) var(--my,50%), #3f9fff26, transparent 65%)' }}
          />
          <div
            className="pointer-events-none absolute -top-16 -right-16 z-0 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100"
            style={{ background: '#3f9fff26' }}
          />

          <div className="relative z-10 grid md:grid-cols-[1.4fr_0.6fr]">

            {/* ── Col 1: Dalit Corpus ── */}
            <div className="border-b border-[#1a2d55]/50 p-5 sm:p-8 md:border-b-0 md:border-r md:p-10">
              <p className="card-index font-count text-[11px] font-semibold">01</p>
              <h3 className="mt-1.5 font-display text-[26px] font-semibold text-white md:text-[31px]">
                {t(CORPUS.question)}
              </h3>
              {CORPUS.intro.map((para) => (
                <p key={para} className="mt-4 text-[18px] leading-[1.95] text-[#cddcf5] md:text-[19px]">
                  {t(para)}
                </p>
              ))}

              <h4 className="mt-7 font-display text-[19px] font-semibold text-white md:text-[20px]">
                {t('landing.whyItMatters')}
              </h4>
              <ul className="mt-3 space-y-3">
                {CORPUS.whyItMatters.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-[17px] leading-relaxed text-[#cddcf5] md:text-[18px]">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#4d94ff]" />
                    {t(point)}
                  </li>
                ))}
              </ul>

              <p className="card-index mt-7 font-count text-[11px] font-semibold">02</p>
              <h4 className="mt-1.5 font-display text-[19px] font-semibold text-white md:text-[20px]">
                {t('landing.whyWeNeedIt')}
              </h4>
              <p className="mt-3 text-[17px] leading-[1.95] text-[#cddcf5] md:text-[18px]">
                {t(CORPUS.whyWeNeedIt)}
              </p>

              {/* Stacked below sm: at 360px these two labels cannot share a
                  row without breaking inside the buttons. */}
              <div className="mt-6 flex flex-col gap-3 sm:mt-7 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <button
                  type="button"
                  onClick={() => setContactType('contribute')}
                  className="btn-gradient inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 font-count text-[15px] font-semibold text-white sm:h-14 sm:w-auto sm:flex-1 sm:px-7 sm:text-[17px]"
                >
                  {t('landing.contributeCorpus')}
                </button>
                <button
                  type="button"
                  onClick={() => setContactType('buy')}
                  className="btn-outline-blue inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 font-count text-[15px] font-medium text-white sm:h-14 sm:w-auto sm:flex-1 sm:px-7 sm:text-[17px]"
                >
                  {t('landing.buyCorpus')}
                </button>
              </div>
            </div>

            {/* ── Col 2: Library image ── */}
            <div className="hidden md:block">
              <img
                src={libraryImg}
                alt="A vast circular library representing the Dalit Corpus"
                className="h-full w-full object-cover object-top"
              />
            </div>

          </div>
        </div>
      </div>

      {/* Contributing is a form with an upload; buying is still a conversation. */}
      {contactType === 'contribute' && (
        <CorpusContributeModal onClose={() => setContactType(null)} />
      )}
      {contactType === 'buy' && (
        <CorpusContactModal
          type={contactType}
          onClose={() => setContactType(null)}
        />
      )}
    </section>
  );
}
