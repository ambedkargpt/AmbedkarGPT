import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Sparkle from "./Sparkle";
import { useAuth } from "../../context/AuthContext";
import squiggleSrc from "../../assets/images/squiggle-lines.webp";
import ambedkarPortrait from "../../assets/images/hero-ambedkar.webp";
import { useI18n } from '../../i18n/index.jsx';

// Headline words — null = <br /> slot
const RAW_WORDS = [
  { key: "hero.w1", cyan: false },
  { key: "hero.w2", cyan: false },
  { key: "hero.w3", cyan: true  },
  null,
  { key: "hero.w4", cyan: true  },
  null,
  { key: "hero.w5", cyan: false },
  { key: "hero.w6", cyan: false },
  { key: "hero.w7", cyan: true  },
];

let _wi = 0;
const WORDS = RAW_WORDS.map((w) =>
  w ? { ...w, delay: 150 + _wi++ * 130 } : null
);

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function HeroSection({ splashDone = true }) {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const sectionRef = useRef(null);
  const hasPlayedOnce = useRef(false);

  // Initial play — fires once when splash clears
  useEffect(() => {
    if (!splashDone) return;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        setReady(true);
        hasPlayedOnce.current = true;
      })
    );
    return () => cancelAnimationFrame(id);
  }, [splashDone]);

  // Replay on scroll-back-up
  useEffect(() => {
    if (!splashDone) return;
    const el = sectionRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          setReady(false);
        } else if (hasPlayedOnce.current) {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => setReady(true))
          );
        }
      },
      { threshold: 0 }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [splashDone]);

  // Same destination and same signed-out path as the CTA further down the
  // page, so both entry points land people in the generator rather than on
  // the dashboard after logging in.
  function handleBuildNarrative() {
    const target = "/generate/social-media";
    if (currentUser) {
      navigate(target);
    } else {
      sessionStorage.setItem("auth_redirect", target);
      navigate("/login");
    }
  }

  function handleBheemBot() {
    if (currentUser) {
      navigate("/bhimbot");
    } else {
      sessionStorage.setItem("auth_redirect", "/bhimbot");
      navigate("/login");
    }
  }

  function fadeUp(delayMs) {
    return {
      transition: `opacity 0.9s ${EASE}, transform 0.9s ${EASE}`,
      transitionDelay: ready ? `${delayMs}ms` : "0ms",
      opacity: ready ? 1 : 0,
      transform: ready ? "translateY(0)" : "translateY(24px)",
    };
  }

  return (
    <section id="home" ref={sectionRef} className="relative pt-0 md:pt-2">

      {/* Glows + squiggle */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -bottom-32">
        <div className="absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(circle_at_50%_0%,rgba(41,108,255,0.16),transparent_55%)]" />
        <div className="hidden md:block absolute -left-24 -top-16 h-[460px] w-[460px] rounded-full bg-[#2d7dfb]/22 blur-[130px]" />
        <div className="hidden md:block absolute -right-24 top-0 h-[460px] w-[460px] rounded-full bg-[#1d66de]/22 blur-[120px]" />
        <div className="hidden md:block absolute left-1/2 top-[58%] h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-[#1e4fb5]/20 blur-[120px]" />
        <div className="hidden md:block absolute bottom-0 left-1/2 h-[260px] w-[800px] -translate-x-1/2 rounded-full bg-[#1a3fa0]/15 blur-[120px]" />
        <div
          className="absolute inset-0 bg-cover bg-center opacity-15"
          style={{ backgroundImage: `url(${squiggleSrc})` }}
        />
      </div>

      {/* ── The portrait, on phones ──
          Below md the right-hand column is not rendered, so the one face the
          product is named for was missing from the screen most visitors see.
          It comes back here as part of the background rather than as a column:
          anchored to the right edge, behind the text, and masked so it has
          dissolved into the navy well before it reaches the headline.

          Absolute on purpose. In the flow it would push the heading and both
          buttons down a screen-height, and the hero's whole job on a phone is
          to get the buttons above the fold. */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[72%] overflow-hidden md:hidden" aria-hidden="true">
        <img
          src={ambedkarPortrait}
          alt=""
          loading="eager"
          decoding="async"
          className="h-full w-full object-cover"
          style={{
            // A crop window left of centre, which puts the face itself over
            // toward the right edge and away from the text.
            objectPosition: "28% 22%",
            opacity: 0.26,
            // Two masks at once: out to the left, where the headline and the
            // paragraph sit, and out at the bottom so it does not end on a
            // hard horizontal edge above the buttons.
            maskImage:
              "linear-gradient(to left, #000 8%, rgba(0,0,0,0.6) 45%, transparent 88%), linear-gradient(to top, transparent 4%, #000 34%)",
            maskComposite: "intersect",
            WebkitMaskImage:
              "linear-gradient(to left, #000 8%, rgba(0,0,0,0.6) 45%, transparent 88%), linear-gradient(to top, transparent 4%, #000 34%)",
            WebkitMaskComposite: "source-in",
          }}
        />
      </div>

      {/* Scanner beam */}
      <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: "96px" }}>
        <div className="hero-scan-beam relative h-px w-full">
          <div
            className="absolute inset-x-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(63,159,255,0.12) 8%, rgba(63,210,255,0.85) 30%, rgba(180,230,255,1) 50%, rgba(63,210,255,0.85) 70%, rgba(63,159,255,0.12) 92%, transparent 100%)",
            }}
          />
          <div
            className="absolute inset-x-0 -top-3 h-7"
            style={{
              background:
                "linear-gradient(90deg, transparent 5%, rgba(63,159,255,0.04) 20%, rgba(100,200,255,0.18) 40%, rgba(160,225,255,0.22) 50%, rgba(100,200,255,0.18) 60%, rgba(63,159,255,0.04) 80%, transparent 95%)",
              filter: "blur(4px)",
            }}
          />
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="relative z-10 mx-auto grid max-w-[1440px] items-stretch gap-8 px-6 pb-6 pt-4 md:grid-cols-[1fr_auto] md:pb-10 md:pt-8">

        {/* LEFT: text */}
        {/* No bottom padding. The grid is items-stretch, so both columns are the
            same height and mt-auto drops the buttons to the bottom of this
            one - but pb-3 held them 12px short of it, leaving the buttons
            floating just above the image's bottom edge instead of level with
            it. */}
        <div className="flex flex-col items-start">

          {/* Badge */}
          <div
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#3a5e94] bg-[#0f1d3b]/75 px-4 py-2 text-[13px] text-[#d3e4ff] shadow-[0_0_24px_rgba(43,126,255,0.22)] sm:mb-7 sm:gap-3 sm:px-7 sm:py-3 sm:text-[18px]"
            style={fadeUp(0)}
          >
            <Sparkle size={16} color="#4fb4ff" />
            {t('landing.badge')}
          </div>

          {/* Headline — slow word-by-word */}
          {/* The halo sits behind the words so the headline reads as lifting
              off the background rather than printed flat on it. */}
          <div className="relative">
            <span className="heading-halo" aria-hidden="true" />
          {/* clamp rather than a mobile font size: it grows with the screen up
              to the 46px this design already used, so every width from 320px
              to the md breakpoint gets a size that fits, and md upward is
              untouched. */}
          <h1 className="relative mt-1 font-display max-w-[900px] text-[clamp(31px,8.6vw,46px)] font-bold leading-[1.16] tracking-tight text-white md:text-[60px] md:leading-[1.18]">
            {WORDS.map((item, i) => {
              if (!item) return <br key={i} />;
              return (
                <span
                  key={i}
                  className={item.cyan ? "gradient-text-cyan ai-emphasis italic" : undefined}
                  style={{
                    display: "inline-block",
                    marginRight: "0.26em",
                    transition: `opacity 0.7s ${EASE}, transform 0.7s ${EASE}`,
                    transitionDelay: ready ? `${item.delay}ms` : "0ms",
                    opacity: ready ? 1 : 0,
                    transform: ready ? "translateY(0)" : "translateY(18px)",
                  }}
                >
                  {t(item.key)}
                </span>
              );
            })}
          </h1>
          </div>

          {/* Sub-copy */}
          {/* sm:mb-10 is the floor under the CTA's sm:mt-auto. An auto margin
              only distributes space that is left over, so once this column
              fills its row the gap collapses to nothing - which is what Hindi
              does, running to three lines where English runs to two, and the
              buttons ended up sitting on the descenders of the last line. Auto
              still takes over whenever there is slack to take.

              Only from sm up: below that the CTA carries its own mt-8 and the
              gap was never in question, so a margin here would just double it. */}
          <p
            className="font-count mt-5 max-w-[700px] text-[clamp(16px,4.3vw,22px)] leading-[1.6] text-[#b7c6e1] sm:mt-6 sm:mb-10 sm:leading-8 md:text-[24px] md:leading-9"
            style={fadeUp(1050)}
          >
            {t('landing.heroSub')}
          </p>

          {/* CTA */}
          {/* Stacked on a phone, where the two labels cannot share a line
              without wrapping inside the buttons. */}
          <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:mt-auto sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-4" style={fadeUp(1300)}>
            <button
              type="button"
              onClick={handleBheemBot}
              className="btn-gradient group inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl px-6 font-count text-[16px] font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_14px_38px_rgba(17,122,255,0.42)] sm:h-14 sm:w-auto sm:justify-start sm:px-9 sm:text-[20px] md:h-15 md:text-[22px]"
            >
              {t('bot.title')}
              <ArrowRight size={19} strokeWidth={2.2} className="cta-arrow shrink-0" />
            </button>

            <button
              type="button"
              onClick={handleBuildNarrative}
              className="btn-glass-violet group inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl px-6 font-count text-[16px] font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(90,80,220,0.32)] sm:h-14 sm:w-auto sm:justify-start sm:px-9 sm:text-[20px] md:h-15 md:text-[22px]"
            >
              {t('landing.buildNarrative')}
              <ArrowRight size={19} strokeWidth={2.2} className="cta-arrow shrink-0" />
            </button>
          </div>

        </div>

        {/* RIGHT: image */}
        <div
          className="relative hidden md:flex md:w-[460px] md:flex-col md:items-end"
          style={{
            transition: `opacity 1.1s ${EASE}, transform 1.1s ${EASE}`,
            transitionDelay: ready ? "600ms" : "0ms",
            opacity: ready ? 1 : 0,
            transform: ready ? "translateX(0)" : "translateX(36px)",
          }}
        >
          <div className="relative w-full overflow-hidden rounded-2xl" style={{ height: "535px" }}>
            <img
              src={ambedkarPortrait}
              alt="Dr. B. R. Ambedkar holding the Constitution of India"
              className="h-full w-full object-cover"
              style={{ objectPosition: "center 28%" }}
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#030611]/60" />
          </div>
        </div>

      </div>
    </section>
  );
}
