import { useLayoutEffect, useState } from 'react';

/**
 * Where the selected item of a row or list sits, so one highlight can slide
 * from the old choice to the new one instead of jumping. The selected child
 * carries data-pill-active="true"; the container is position: relative.
 *
 * Measured in a frame callback and on resize, so a wrapping row of chips or a
 * rail that changes width keeps the highlight under the right item.
 */
export default function useSlidingPill(containerRef, activeKey) {
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    const host = containerRef.current;
    if (!host) return undefined;
    const measure = () => {
      const el = host.querySelector('[data-pill-active="true"]');
      setBox(el ? { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight } : null);
    };
    const frame = requestAnimationFrame(measure);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(host);
    return () => { cancelAnimationFrame(frame); ro?.disconnect(); };
  }, [containerRef, activeKey]);
  return box;
}

/** The style that puts the highlight on `box`, moving with transform and size only. */
export function pillStyle(box) {
  if (!box) return { opacity: 0 };
  return {
    opacity: 1,
    width: box.w,
    height: box.h,
    transform: `translate(${box.x}px, ${box.y}px)`,
  };
}
