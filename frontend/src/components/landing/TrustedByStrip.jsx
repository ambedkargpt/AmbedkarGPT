import Sparkle from './Sparkle';
import indiaAiLogo     from '../../assets/images/indiaai-logo.webp';
import digitalIndiaLogo from '../../assets/images/digital-india-logo.webp';

// "Trusted By" partners strip — logos with evenly spaced sparkle separators.
export default function TrustedByStrip() {
  return (
    <section className="relative py-4 pb-6 md:py-6 md:pb-8">

      <div className="relative mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center gap-10 md:flex-row md:justify-evenly">
          <Sparkle size={32} color="#ffffff" className="hidden md:inline-flex" />

          <img
            src={indiaAiLogo}
            alt="INDIAai"
            className="h-20 w-auto object-contain drop-shadow-[0_0_24px_rgba(63,159,255,0.25)] md:h-24"
          />

          <Sparkle size={32} color="#ffffff" />

          <img
            src={digitalIndiaLogo}
            alt="Digital India"
            className="h-20 w-auto object-contain drop-shadow-[0_0_24px_rgba(63,159,255,0.25)] md:h-24"
          />

          <Sparkle size={32} color="#ffffff" className="hidden md:inline-flex" />
        </div>
      </div>
    </section>
  );
}
