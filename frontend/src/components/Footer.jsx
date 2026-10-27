import { useState } from "react";
import { Link } from "react-router-dom";
import AgLogo from "./brand/AgLogo";
import LegalModal from "./LegalModal";
import { FacebookIcon, InstagramIcon, LinkedinIcon, TwitterIcon, YoutubeIcon } from "./landing/SocialIcons";
import { useI18n } from '../i18n/index.jsx';

// Section anchors resolve on the home page. MainLayout scrolls to the hash after
// a route change, so these work from /pricing and /about too, which plain
// "#contact" links did not: they appended a hash to whatever page you were on.
const PRODUCT_LINKS = [
  { key: "foot.generatePosts", to: "/generate/social-media" },
  { key: "foot.bheembot", to: "/bhimbot" },
  { key: "foot.useCases", to: "/#bheem" },
  { key: "foot.solutions", to: "/solutions" },
];

const COMPANY_LINKS = [
  { key: "foot.about", to: "/about" },
  { key: "foot.dalitCorpus", to: "/#ambedkarverse" },
  { key: "foot.resources", to: "/resources" },
  { key: "foot.contactUs", to: "/contact" },
  // Straight to the form rather than the top of the section: someone who
  // clicked this has already decided to write to us. MainLayout does the hash
  // scrolling, retrying briefly because the section is not mounted on the
  // first frame after a route change.
  { key: "foot.donate", to: "/#contact-form" },
];

// Accounts with no URL are skipped rather than rendered as links that go
// nowhere, so filling one in is all it takes to make it appear.
const SOCIAL_LINKS = [
  { label: "Instagram", href: "https://www.instagram.com/ambedkargpt/", icon: InstagramIcon },
  { label: "YouTube",   href: "https://www.youtube.com/@AmbedkarGPT",   icon: YoutubeIcon },
  { label: "Facebook",  href: "", icon: FacebookIcon },
  { label: "LinkedIn",  href: "", icon: LinkedinIcon },
  { label: "X",         href: "", icon: TwitterIcon },
];

const EMAIL = "smartbhaujan@gmail.com";

function ColumnHeading({ children }) {
  return (
    <div>
      <h4 className="text-[15px] font-semibold text-white">{children}</h4>
      <span className="mt-2 block h-[2px] w-8 rounded-full bg-[linear-gradient(90deg,#3f9fff,transparent)]" />
    </div>
  );
}

function LinkColumn({ heading, links }) {
  const { t } = useI18n();
  return (
    <div>
      <ColumnHeading>{heading}</ColumnHeading>
      <ul className="mt-5 space-y-2.5">
        {links.map((l) => (
          <li key={l.key}>
            <Link
              to={l.to}
              className="inline-block text-[13.5px] text-[#9fb2d1] transition hover:translate-x-0.5 hover:text-white"
            >
              {t(l.key)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const { t } = useI18n();
  const [legal, setLegal] = useState(null);
  const socials = SOCIAL_LINKS.filter((s) => s.href);

  return (
    <footer className="relative overflow-hidden border-t border-[#1a2c55]/70 bg-[#040712]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(63,159,255,0.45),transparent)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-72 w-[65%] -translate-x-1/2 rounded-full bg-[#2d7dfb]/10 blur-[120px]" />

      <div className="relative mx-auto max-w-[1280px] px-5 py-12 sm:px-6 sm:py-14 md:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr] lg:gap-14">

          {/* Brand */}
          <div>
            <Link to="/" className="inline-flex items-center gap-2.5">
              <AgLogo size={22} />
            </Link>

            <p className="mt-4 max-w-[46ch] text-[13.5px] leading-relaxed text-[#9fb2d1]">
              {t('landing.footerTagline')}
            </p>

            <div className="mt-5 space-y-1 text-[13px] leading-relaxed text-[#8296bd]">
              <p className="text-[#9fb2d1]">KalpiT Ltd</p>
              <p>71-75 Shelton Street, Covent Garden, London WC2H 9JQ</p>
              <p>
                <a href={`mailto:${EMAIL}`} className="transition hover:text-white">
                  {EMAIL}
                </a>
              </p>
            </div>

            {socials.length > 0 && (
              <div className="mt-5 flex items-center gap-2.5">
                {socials.map(({ label, href, icon: Icon }) => (
                  <a
                    key={label}
                    href={href}
                    aria-label={label}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="icon-btn flex h-10 w-10 items-center justify-center rounded-lg border border-[#2a4375]/70 bg-[#0b1430]/60 text-[#aec0de] hover:text-white sm:h-9 sm:w-9"
                  >
                    <Icon width={14} height={14} />
                  </a>
                ))}
              </div>
            )}
          </div>

          <LinkColumn heading={t('foot.product')} links={PRODUCT_LINKS} />
          <LinkColumn heading={t('foot.company')} links={COMPANY_LINKS} />
        </div>

        <div className="relative mt-12 h-px w-full bg-[#1a2c55]/60">
          <span className="absolute left-1/2 top-1/2 h-[2px] w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,transparent,rgba(63,159,255,0.85),transparent)] blur-[0.5px]" />
        </div>

        {/* The name set once, edge to edge, as the last thing on the page.
            An SVG with textLength so it fills the column exactly at every
            width, whatever the font's own metrics. */}
        <svg
          viewBox="0 0 1000 126"
          className="mt-10 block w-full select-none"
          aria-hidden="true"
        >
          <text
            x="0"
            y="120"
            textLength="1000"
            lengthAdjust="spacingAndGlyphs"
            style={{ fontFamily: "var(--font-brand)", fontWeight: 750, fontSize: 155 }}
            fill="#EDEEF2"
          >
            Ambedkar<tspan fill="#8FA8FF">GPT</tspan>
          </text>
        </svg>

        {/* One legal row. There were two competing groups before, one of which
            was plain text, and every link in both went nowhere. */}
        <div className="mt-7 flex flex-col-reverse items-start justify-between gap-4 text-[12.5px] text-[#8296bd] md:flex-row md:items-center">
          <p>
            AmbedkarGPT, developed by KalpiT Ltd (UK) © {new Date().getFullYear()}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <button
              type="button"
              onClick={() => setLegal("terms")}
              className="transition hover:text-white"
            >
              {t('landing.terms')}
            </button>
            <button
              type="button"
              onClick={() => setLegal("privacy")}
              className="transition hover:text-white"
            >
              {t('landing.privacy')}
            </button>
            <Link to="/contact" className="transition hover:text-white">
              {t('landing.support')}
            </Link>
          </div>
        </div>
      </div>

      {legal && <LegalModal type={legal} onClose={() => setLegal(null)} />}
    </footer>
  );
}
