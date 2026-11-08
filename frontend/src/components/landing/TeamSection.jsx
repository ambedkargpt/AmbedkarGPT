import { useState, useEffect, useRef, useCallback } from "react";
import { LinkedinIcon, TwitterIcon } from "./SocialIcons";
import SectionLabel from "./SectionLabel";
import { NavButton } from "./CarouselNav";
import PeekCarousel from "./PeekCarousel";
import team1 from "../../assets/images/team/team1.webp";
import team2 from "../../assets/images/team/team2.webp";
import team3 from "../../assets/images/team/team3.webp";
import team4 from "../../assets/images/team/team4.webp";
import team5 from "../../assets/images/team/team5.webp";
import team6 from "../../assets/images/team/team6.webp";
import team7 from "../../assets/images/team/team7.webp";
import { useI18n } from '../../i18n/index.jsx';

// `position` sets each photo's focal point so faces are never cropped out, and
// stays tied to its photo when the display order changes.
const TEAM = [
  { id: "kinjalk", role: "team.founder",    photo: team4, position: "50% 20%" },
  { id: "kishore", role: "team.advisor",    photo: team5, position: "50% 55%" },
  { id: "arpit",   role: "team.research",   photo: team6, position: "50% 0%"  },
  { id: "michale", role: "team.advisor",    photo: team7, position: "50% 40%" },
  { id: "kunal",   role: "team.influencer", photo: team1, position: "50% 25%" },
  { id: "kalpik",  role: "team.kganalyst",  photo: team2, position: "50% 20%" },
  { id: "sajjal",  role: "team.opsmanager", photo: team3, position: "50% 30%" },
];

// Renders only the profiles that exist.
//
// Both icons used to be href="#" on every card, so a visitor clicking a named
// person's LinkedIn was scrolled to the top of the page. An icon that does
// nothing is a worse answer than no icon.
//
// The wiring is left in place rather than deleted: add `linkedin` or `twitter`
// to a TEAM entry and that person's icon appears, with no component to rebuild.
// Nobody has one yet, so nothing renders today.
function SocialLinks({ linkedin, twitter }) {
  const links = [
    { href: linkedin, label: 'LinkedIn', Icon: LinkedinIcon },
    { href: twitter,  label: 'Twitter',  Icon: TwitterIcon  },
  ].filter((l) => l.href);

  if (!links.length) return null;

  return (
    <div className="flex shrink-0 gap-2">
      {links.map(({ href, label, Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#2a4375]/70 bg-[#0a1430]/60 text-[#aec0de] backdrop-blur transition hover:border-[#4a78c8]/90 hover:text-white"
        >
          <Icon width={13} height={13} />
        </a>
      ))}
    </div>
  );
}

function TeamCard({ member }) {
  const { t } = useI18n();
  return (
    <div className="group relative h-[400px] w-[300px] shrink-0 overflow-hidden rounded-2xl border border-[#2a4375]/60 bg-[#0a1430] shadow-[0_20px_50px_rgba(0,0,0,0.45)] transition hover:-translate-y-1 hover:border-[#4a78c8]/80">
      <div className="absolute inset-0 bg-gradient-to-b from-[#11204a] via-[#0b1633] to-[#070c1f]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_25%,rgba(63,159,255,0.18),transparent_65%)]" />

      <img
        src={member.photo}
        alt={t(`team.${member.id}`)}
        loading="lazy"
        decoding="async"
        className="relative h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
        style={{ objectPosition: member.position || "50% 25%", filter: "saturate(1.05) contrast(1.02)" }}
      />

      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#030611] via-[#030611]/70 to-transparent p-5">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[22px] font-semibold leading-tight text-white md:text-[24px]">
              {t(`team.${member.id}`)}
            </h3>
            <p className="mt-1 text-[13px] uppercase tracking-[0.15em] text-[#7aa6e5]">
              {t(member.role)}
            </p>
          </div>
          <SocialLinks linkedin={member.linkedin} twitter={member.twitter} />
        </div>
      </div>
    </div>
  );
}

// Triple-clone so the track is always deep enough to loop seamlessly
const TRACK        = [...TEAM, ...TEAM, ...TEAM];
const CARD_W       = 300;
const GAP          = 20;
const STEP         = CARD_W + GAP;           // px per card slot
const VIEWPORT_W   = 4 * CARD_W + 3 * GAP;  // show 4 cards = 1260px
const AUTO_MS      = 3000;
const SLIDE_EASE   = "transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94)";

function DesktopCarousel() {
  // Start in the middle copy so we can go left or right without hitting the edge
  const [trackIdx, setTrackIdx] = useState(TEAM.length);
  const [animated, setAnimated] = useState(true);
  const trackIdxRef             = useRef(TEAM.length);
  const timerRef                = useRef(null);

  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const next = trackIdxRef.current + 1;
      trackIdxRef.current = next;
      setAnimated(true);
      setTrackIdx(next);
    }, AUTO_MS);
  }, []);

  useEffect(() => {
    startTimer();
    return () => clearInterval(timerRef.current);
  }, [startTimer]);

  // After each slide completes, silently jump back to the middle copy if needed
  function onTransitionEnd() {
    const n   = TEAM.length;
    const cur = trackIdxRef.current;
    if (cur >= n * 2) {
      const next = cur - n;
      trackIdxRef.current = next;
      setAnimated(false);
      setTrackIdx(next);
    } else if (cur < n) {
      const next = cur + n;
      trackIdxRef.current = next;
      setAnimated(false);
      setTrackIdx(next);
    }
  }

  // Re-enable transition on the frame after the silent jump
  useEffect(() => {
    if (!animated) {
      const id = requestAnimationFrame(() =>
        requestAnimationFrame(() => setAnimated(true))
      );
      return () => cancelAnimationFrame(id);
    }
  }, [animated]);

  function goPrev() {
    const next = trackIdxRef.current - 1;
    trackIdxRef.current = next;
    setAnimated(true);
    setTrackIdx(next);
    startTimer();
  }
  function goNext() {
    const next = trackIdxRef.current + 1;
    trackIdxRef.current = next;
    setAnimated(true);
    setTrackIdx(next);
    startTimer();
  }
  function goTo(memberIdx) {
    const n    = TEAM.length;
    const cur  = trackIdxRef.current;
    // jump to whichever copy of memberIdx is closest to current position
    const base = Math.round(cur / n) * n + memberIdx;
    trackIdxRef.current = base;
    setAnimated(true);
    setTrackIdx(base);
    startTimer();
  }

  const activeMember = ((trackIdx % TEAM.length) + TEAM.length) % TEAM.length;

  return (
    <div className="mt-8 sm:mt-14">
      {/* Viewport + side buttons */}
      <div className="relative" style={{ width: VIEWPORT_W, margin: "0 auto" }}>
        {/* Left button — sits outside the left edge, vertically centred on the cards */}
        <div className="absolute top-1/2 -translate-y-1/2" style={{ left: -64 }}>
          <NavButton onClick={goPrev} direction="left" label="Previous" />
        </div>

        {/* Clipped viewport */}
        <div style={{ overflow: "hidden" }}>
          <div
            onTransitionEnd={onTransitionEnd}
            style={{
              display:    "flex",
              gap:        GAP,
              transform:  `translateX(${-(trackIdx * STEP)}px)`,
              transition: animated ? SLIDE_EASE : "none",
            }}
          >
            {TRACK.map((member, i) => (
              <div key={i} style={{ flexShrink: 0 }}>
                <TeamCard member={member} />
              </div>
            ))}
          </div>
        </div>

        {/* Right button */}
        <div className="absolute top-1/2 -translate-y-1/2" style={{ right: -64 }}>
          <NavButton onClick={goNext} direction="right" label="Next" />
        </div>
      </div>

      {/* Dots */}
      <div className="mt-7 flex justify-center gap-2">
        {TEAM.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            className={[
              "rounded-full transition-all duration-300",
              i === activeMember
                ? "h-2 w-6 bg-[#3f9fff]"
                : "h-2 w-2 bg-[#2a4375]/60 hover:bg-[#3f9fff]/50",
            ].join(" ")}
            aria-label={`Go to team member ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function MobileCarousel() {
  const { t } = useI18n();
  return (
    <PeekCarousel
      className="mt-10"
      count={TEAM.length}
      labelFor={(i) => `Go to team member ${i + 1}`}
      renderItem={(i) => {
        const member = TEAM[i];
        return (
          <div className="relative h-[400px] w-full overflow-hidden rounded-2xl border border-[#2a4375]/60 bg-[#0a1430] shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
            <div className="absolute inset-0 bg-gradient-to-b from-[#11204a] via-[#0b1633] to-[#070c1f]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_25%,rgba(63,159,255,0.18),transparent_65%)]" />
            <img
              src={member.photo}
              alt={t(`team.${member.id}`)}
              loading="lazy"
              decoding="async"
              className="relative h-full w-full object-cover"
              style={{ objectPosition: member.position || "50% 25%", filter: "saturate(1.05) contrast(1.02)" }}
            />
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#030611] via-[#030611]/70 to-transparent p-5">
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[22px] font-semibold leading-tight text-white">{t(`team.${member.id}`)}</h3>
                  <p className="mt-1 text-[13px] uppercase tracking-[0.15em] text-[#7aa6e5]">{t(member.role)}</p>
                </div>
                <SocialLinks linkedin={member.linkedin} twitter={member.twitter} />
              </div>
            </div>
          </div>
        );
      }}
    />
  );
}

// Team section — "A team like never seen before" as a looping carousel
export default function TeamSection() {
  const { t } = useI18n();
  return (
    <section id="charity" className="relative py-8 md:py-10">
      {/* Ambient glow — bottom glow bleeds into ContactSection */}
      <div className="pointer-events-none absolute inset-x-0 -top-28 -bottom-28">
        <div className="hidden md:block absolute left-1/4 top-1/4 h-[420px] w-[600px] rounded-full bg-[#1e4fb5]/8 blur-[150px]" />
        <div className="hidden md:block absolute right-1/4 bottom-0 h-[360px] w-[500px] rounded-full bg-[#2d6fff]/8 blur-[140px]" />
      </div>

      <div className="mx-auto max-w-7xl px-6">
        <SectionLabel>{t('team.label')}</SectionLabel>

        <h2 className="mx-auto mt-8 max-w-[820px] text-center font-display text-[clamp(30px,8vw,46px)] font-bold leading-[1.05] text-white md:text-[62px]">
          {t('team.headA')}{" "}
          <span className="italic gradient-text-blue">{t('team.headEm')}</span> {t('team.headPost')}
        </h2>

        <p className="mx-auto mt-10 max-w-[720px] text-center text-[clamp(16px,4.3vw,22px)] leading-9 text-[#bfcfe8] md:text-[24px]">
          {t('team.sub')}
        </p>
      </div>

      {/* Mobile: one-by-one carousel */}
      <div className="md:hidden">
        <MobileCarousel />
      </div>

      {/* Desktop: carousel with left/right nav */}
      <div className="hidden md:block">
        <DesktopCarousel />
      </div>
    </section>
  );
}
