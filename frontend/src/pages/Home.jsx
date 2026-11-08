import { useEffect, useRef } from 'react';
import 'lenis/dist/lenis.css';

import MainLayout from '../layouts/MainLayout';
import useScrollAnimations from '../hooks/useScrollAnimations';

import LandingBackground   from '../components/landing/LandingBackground';
import HeroSection         from '../components/landing/HeroSection';
import KnowledgeSection    from '../components/landing/KnowledgeSection';
import UseCasesGrid        from '../components/landing/UseCasesGrid';
import DalitHistoryMakers  from '../components/landing/DalitHistoryMakers';
import DalitCorpusSection  from '../components/landing/DalitCorpusSection';
import ContactSection      from '../components/landing/ContactSection';
import FourIdeasSection    from '../components/landing/FourIdeasSection';
import WarRoomBanner       from '../components/landing/WarRoomBanner';
import WhySection          from '../components/landing/WhySection';

export default function Home({ splashDone = true }) {
  // Scroll motion and the smooth scroll it rides on (Lenis, desktop only),
  // set up and torn down together: see hooks/useScrollAnimations.
  const rootRef = useRef(null);
  useScrollAnimations(rootRef);

  // support deep-linking to a section after navigating from another route
  useEffect(() => {
    const pending = sessionStorage.getItem('pending-section-scroll');
    if (!pending) return;
    const t = setTimeout(() => {
      const target = document.getElementById(pending);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      sessionStorage.removeItem('pending-section-scroll');
    }, 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <MainLayout>
      <div ref={rootRef}>
      {/* Full-page animated background — absolute so it grows with page height */}
      <LandingBackground />

      <HeroSection splashDone={splashDone} />


      {/* Seams, not rules: a hairline that fades at both ends with a wide soft
          glow above it, so one section reads into the next instead of stacking
          as separate blocks. */}
      <div className="section-seam" aria-hidden="true" />

      {/* The war room: right under the hero, the first thing a party worker
          reads after the headline. */}
      <WarRoomBanner />

      <KnowledgeSection />

      {/* Why AmbedkarGPT: the sticky-list story, after cerebrium.ai. */}
      <WhySection />

      <DalitCorpusSection />

      <DalitHistoryMakers />

      <div className="section-seam" aria-hidden="true" />

      <FourIdeasSection />

      <UseCasesGrid />

      <div className="section-seam" aria-hidden="true" />

      <ContactSection />
      </div>
    </MainLayout>
  );
}
