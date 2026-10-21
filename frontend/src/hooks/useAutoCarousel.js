import { useCallback, useEffect, useRef, useState } from 'react';

const SWIPE_PX = 40;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * State for the landing page's one-card-at-a-time mobile carousels.
 *
 * Auto-advances every `interval` ms, but only while the carousel is on screen
 * (an element inside a `md:hidden` wrapper never intersects, so the desktop
 * layout never runs this timer), never while a finger is on it, and not at all
 * for readers who asked for reduced motion. Any change of slide - automatic,
 * swiped or tapped - restarts the countdown, so a slide the reader just chose
 * gets the full interval.
 *
 * Returns the active index, prev/next/goTo, the entry animation for the active
 * card, a ref for the carousel root and touch handlers for the swipe area.
 */
export default function useAutoCarousel(count, { interval = 4500 } = {}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [direction, setDirection] = useState(1);
  const [touching, setTouching] = useState(false);
  // Without IntersectionObserver there is no way to tell, so assume on screen.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [rootEl, setRootEl] = useState(null);
  const rootRef = useCallback((el) => setRootEl(el), []);
  const touchStart = useRef(null);

  const goNext = useCallback(() => {
    setDirection(1);
    setActiveIdx((i) => (i + 1) % count);
  }, [count]);
  const goPrev = useCallback(() => {
    setDirection(-1);
    setActiveIdx((i) => (i - 1 + count) % count);
  }, [count]);
  const goTo = useCallback((i) => {
    setDirection(i < activeIdx ? -1 : 1);
    setActiveIdx(i);
  }, [activeIdx]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (!rootEl || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.3 });
    io.observe(rootEl);
    return () => io.disconnect();
  }, [rootEl]);

  useEffect(() => {
    if (reduced || touching || !inView || count < 2) return undefined;
    const id = setTimeout(goNext, interval);
    return () => clearTimeout(id);
  }, [activeIdx, reduced, touching, inView, count, interval, goNext]);

  const swipeHandlers = {
    onTouchStart(e) {
      const t = e.touches[0];
      touchStart.current = { x: t.clientX, y: t.clientY };
      setTouching(true);
    },
    onTouchEnd(e) {
      const start = touchStart.current;
      touchStart.current = null;
      setTouching(false);
      const t = e.changedTouches[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
      if (dx < 0) goNext();
      else goPrev();
    },
    onTouchCancel() {
      touchStart.current = null;
      setTouching(false);
    },
  };

  const animation = `${direction < 0 ? 'makerJumpInLeft' : 'makerJumpIn'} 0.22s ease-out both`;

  return { activeIdx, goNext, goPrev, goTo, animation, rootRef, swipeHandlers };
}
