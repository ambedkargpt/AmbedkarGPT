import { useEffect } from 'react';

/**
 * Pauses decorative CSS animations while they are off screen.
 *
 * The landing page is about seventeen screens tall and carries dozens of
 * animations that never end: drifting orbs, particles, breathing pills,
 * twinkles. The browser kept working on all of them on every frame, wherever
 * the reader was, and on a slower phone or laptop that work is what made
 * scrolling stutter (measured: about a third of the lost frames).
 *
 * Nothing changes on screen. An animation is only paused once its element is
 * more than a full screen away, and it carries on from where it stopped when
 * it comes back, so there is no jump and nothing to notice.
 *
 * How: find every element under `rootRef` with an endless CSS animation, watch
 * it with an IntersectionObserver, and add the class `anim-offscreen` (see
 * index.css) while it is far from view. Elements that mount later are picked
 * up by the two later scans; any that are missed simply keep running as before.
 */
export default function usePauseOffscreenAnimations(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    // Older browsers without these keep every animation running, as before.
    if (!root || !('IntersectionObserver' in window) || !root.getAnimations) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.classList.toggle('anim-offscreen', !entry.isIntersecting);
        });
      },
      // A full screen of margin above and below: an orb's glow reaches well
      // past its own box, and nothing may visibly start or stop.
      { rootMargin: '100% 0px' },
    );

    const watched = new Set();
    function scan() {
      root.getAnimations({ subtree: true }).forEach((animation) => {
        if (!(animation instanceof CSSAnimation)) return;
        const effect = animation.effect;
        const target = effect?.target;
        if (!target || watched.has(target)) return;
        // Only animations that never end. A one-off entrance must play through.
        if (effect.getComputedTiming().iterations !== Infinity) return;
        watched.add(target);
        observer.observe(target);
      });
    }

    scan();
    // Sections and images that arrive after the first paint.
    const later = [setTimeout(scan, 2000), setTimeout(scan, 6000)];

    return () => {
      later.forEach(clearTimeout);
      observer.disconnect();
      watched.forEach((el) => el.classList.remove('anim-offscreen'));
    };
  }, [rootRef]);
}
