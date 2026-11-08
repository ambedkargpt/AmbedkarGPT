import { useEffect, useRef, useState } from 'react';

/**
 * A number that counts up to its value when it first appears or changes,
 * in about 0.7 seconds. The landing page's CountUp waits for the opening
 * splash, which the signed-in screens never show, so it sat at 0 here.
 * Reduced motion shows the value at once.
 */
export default function CountTo({ value, durationMs = 700 }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    const start = performance.now();
    const base = from.current;
    let raf = 0;
    const step = (now) => {
      const k = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(base + (value - base) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);
  return <span className="tabular-nums">{shown}</span>;
}
