import { Cpu, Search, Zap, Target, ArrowRight } from "lucide-react";
import SectionLabel from "./SectionLabel";
import StaggerReveal from "../ui/StaggerReveal";
import PeekCarousel from "./PeekCarousel";
import { useI18n } from "../../i18n/index.jsx";

const USE_CASES = [
  { icon: Cpu,    id: "principle" },
  { icon: Search, id: "problems"  },
  { icon: Zap,    id: "debate"    },
  { icon: Target, id: "weakness"  },
];

function UseCaseCard({ icon: Icon, id }) {
  const { t } = useI18n();
  return (
    <div className="group relative">
      <div
        className="pointer-events-none absolute -inset-6 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(ellipse at 50% 55%, rgba(63,159,255,0.28) 0%, rgba(63,159,255,0.10) 45%, transparent 70%)",
          filter: "blur(18px)",
        }}
      />

      <div className="glass-card hover-lift relative flex h-full flex-col overflow-hidden p-8 transition-all duration-500 hover:border-[#3f9fff]/30 md:p-10">
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(ellipse at 50% 60%, rgba(63,159,255,0.22) 0%, rgba(63,159,255,0.10) 40%, transparent 72%)",
          }}
        />
        <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-[#3f9fff]/15 blur-3xl" />

        <div className="flex items-center gap-5">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[#2a4375]/80 bg-[#0c1735]/80 text-[#5fa5ff] shadow-[0_0_22px_rgba(63,159,255,0.25)]">
            <Icon size={24} strokeWidth={1.7} />
          </span>
          <h3 className="text-[28px] font-semibold text-white md:text-[30px]">
            {t(`uc.${id}.title`)}
          </h3>
        </div>
        <div className="mt-3 h-px w-12 rounded-full bg-[#2a4375]/60" />
        <p className="mt-4 flex-1 text-[clamp(15px,4vw,19px)] leading-8 text-[#bfcfe8] md:text-[20px]">
          {t(`uc.${id}.body`)}
        </p>
      </div>
    </div>
  );
}

function UseCasesMobileCarousel() {
  const { t } = useI18n();
  return (
    <PeekCarousel
      className="mt-8 sm:mt-14 md:hidden"
      count={USE_CASES.length}
      labelFor={(i) => `Go to ${t(`uc.${USE_CASES[i].id}.title`)}`}
      renderItem={(i) => (
        <div className="w-full">
          <UseCaseCard {...USE_CASES[i]} />
        </div>
      )}
    />
  );
}

export default function UseCasesGrid() {
  const { t } = useI18n();
  return (
    <section id="bheem" className="relative py-8 md:py-10">
      <div className="pointer-events-none absolute inset-x-0 -top-28 -bottom-28">
        <div className="hidden md:block absolute left-1/2 top-0 h-[480px] w-[800px] -translate-x-1/2 rounded-full bg-[#3f78ff]/8 blur-[150px]" />
        <div className="hidden md:block absolute left-1/2 bottom-0 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-[#2d55c0]/7 blur-[130px]" />
      </div>

      <div className="relative mx-auto max-w-[1440px] px-6">
        <SectionLabel>{t('uc.label')}</SectionLabel>

        <h2 className="mx-auto mt-8 max-w-[900px] text-center font-display text-[clamp(26px,7.2vw,38px)] font-bold leading-[1.2] text-white md:text-[52px]">
          {t('uc.headA')}{" "}
          <span className="italic gradient-text-blue">{t('uc.headEm1')}</span>
          {" "}{t('uc.headMid')}{" "}
          <span className="italic gradient-text-blue">{t('uc.headEm2')}</span>
        </h2>

        {/* Below md: one card at a time, swiped or auto-advanced, instead of
            four tall cards stacked down the page. From md up, the 2x2 grid. */}
        <UseCasesMobileCarousel />

        <StaggerReveal step={100} className="mt-8 sm:mt-14 hidden gap-6 md:grid md:grid-cols-2">
          {USE_CASES.map((uc) => (
            <UseCaseCard key={uc.id} {...uc} />
          ))}
        </StaggerReveal>

        <div className="mt-8 sm:mt-14 flex justify-center px-2">
          <button
            type="button"
            onClick={() =>
              document
                .getElementById("contact")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="btn-gradient group inline-flex min-h-[3.5rem] max-w-full items-center justify-center gap-3 rounded-xl px-7 py-3.5 text-center font-count text-[16px] font-semibold leading-snug text-white md:px-9 md:text-[17px]"
          >
            {t('uc.contest')}
            <ArrowRight
              size={18}
              className="shrink-0 transition-transform group-hover:translate-x-1"
            />
          </button>
        </div>
      </div>
    </section>
  );
}
