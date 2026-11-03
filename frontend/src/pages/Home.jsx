import { useEffect } from 'react';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

import MainLayout from '../layouts/MainLayout';
import RevealOnScroll from '../components/ui/RevealOnScroll';

import LandingBackground   from '../components/landing/LandingBackground';
import HeroSection         from '../components/landing/HeroSection';
import KnowledgeSection    from '../components/landing/KnowledgeSection';
import UseCasesGrid        from '../components/landing/UseCasesGrid';
import DalitHistoryMakers  from '../components/landing/DalitHistoryMakers';
import DalitCorpusSection  from '../components/landing/DalitCorpusSection';
import ContactSection      from '../components/landing/ContactSection';
import FourIdeasSection    from '../components/landing/FourIdeasSection';

export default function Home({ splashDone = true }) {
  // Smooth, weighted scrolling on the landing page, as rssgpt's has. Off for
  // reduced motion and on touch screens, where native scrolling is better;
  // a scrollable box inside the page (a dialog, a list) still scrolls itself.
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    if (reduce || coarse) return undefined;
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true, autoRaf: true, anchors: false, allowNestedScroll: true });
    return () => lenis.destroy();
  }, []);

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
      {/* Full-page animated background — absolute so it grows with page height */}
      <LandingBackground />

      <HeroSection splashDone={splashDone} />


      {/* Seams, not rules: a hairline that fades at both ends with a wide soft
          glow above it, so one section reads into the next instead of stacking
          as separate blocks. */}
      <div className="section-seam" aria-hidden="true" />

      <RevealOnScroll delayMs={60}>
        <KnowledgeSection />
      </RevealOnScroll>

      <RevealOnScroll delayMs={60}>
        <DalitCorpusSection />
      </RevealOnScroll>

      <RevealOnScroll delayMs={60}>
        <DalitHistoryMakers />
      </RevealOnScroll>

      <div className="section-seam" aria-hidden="true" />

      <RevealOnScroll delayMs={60}>
        <FourIdeasSection />
      </RevealOnScroll>

      <RevealOnScroll delayMs={60}>
        <UseCasesGrid />
      </RevealOnScroll>

      <div className="section-seam" aria-hidden="true" />

      <RevealOnScroll delayMs={60}>
        <ContactSection />
      </RevealOnScroll>
    </MainLayout>
  );
}
