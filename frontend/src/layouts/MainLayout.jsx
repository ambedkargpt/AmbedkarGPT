import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import RadioLiveStrip from '../components/RadioLiveStrip';
import NewsTicker from '../components/NewsTicker';

// Tailwind needs these spellings present in the source to emit the classes,
// so they are a lookup rather than a computed `md:pt-${n}`.
const PINNED_PAD = ['md:pt-20', 'md:pt-[128px]'];

/**
 * `bare` leaves out the radio strip. A page that is itself the thing being
 * promoted - the radio - has no use for a bar announcing it.
 * The news crawl stays: it is content, not promotion.
 */
export default function MainLayout({ children, bare = false, noNav = false }) {
  const [radioStripVisible, setRadioStripVisible] = useState(true);
  const { pathname, hash } = useLocation();
  // Not on the landing page: a visitor being told what the product is should
  // not be reading today's politics crawl past the pitch.
  const showTicker = pathname !== '/';
  const showStrips = !bare;

  // Scroll to #section after a route change. Nothing did this, so a link from
  // another page to "/#contact" landed at the top of the home page and the
  // reader had to find the section themselves. The section may not be mounted
  // on the first frame, so retry briefly before giving up.
  useEffect(() => {
    if (!hash) return undefined;
    const id = hash.slice(1);
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        clearInterval(timer);
      } else if (++tries > 20) {
        clearInterval(timer);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [pathname, hash]);

  return (
    <>
      {/*
        The Navbar lives outside <main>.
        CSS spec: overflow != visible on an ancestor creates a containing block
        for fixed descendants — keeping them outside avoids that trap.
      */}
      {/* The radio is a full screen of its own, with its own way back. */}
      {!noNav && <Navbar />}
      {/* Film grain over the whole page. Barely visible on its own; it stops
          the large flat navy areas from banding and gives the dark ground a
          printed texture. */}
      <div className="grain-overlay" aria-hidden="true" />
      {/* Padding = navbar height, plus a 48px row for the pinned radio strip
          from md. The strip can be dismissed, so the offset follows it rather
          than being hard-coded: a fixed one left a 48px gap under the navbar. */}
      <main
        className={`relative min-h-screen overflow-x-hidden bg-[#05081a] text-white transition-all duration-300 ${noNav ? '' : `pt-[72px] ${PINNED_PAD[Number(showStrips && radioStripVisible)]}`} ${showTicker ? 'pb-[var(--ticker-h,0px)]' : ''}`}
      >
        {/* In the flow on a phone, pinned from md.
            A strip's sentence needs three lines at 360px, and pinned under
            the navbar that is ~96px of a 640px screen covered for the whole
            visit: it sat over section headings on every scroll. In the flow it
            scrolls away after it has been read. From md it is one line and
            stays under the navbar exactly as before. */}
        {/* The strip keeps `relative` because it paints an absolutely
            positioned texture over itself. */}
        <div className="relative z-30 md:fixed md:inset-x-0 md:top-20">
          {showStrips && (
            <RadioLiveStrip
              className="relative"
              onHide={() => setRadioStripVisible(false)}
            />
          )}
        </div>
        <div className="relative z-10">{children}</div>
        {/* Along the bottom of the screen, like a channel's crawl. */}
        {showTicker && <NewsTicker docked />}
        <Footer />
      </main>
    </>
  );
}
