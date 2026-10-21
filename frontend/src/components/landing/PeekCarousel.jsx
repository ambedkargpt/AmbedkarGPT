import { useRef } from 'react';

import { MobileCarouselControls } from './CarouselNav';
import useAutoCarousel from '../../hooks/useAutoCarousel';

/*
 * The landing page's phone carousel: one card in the middle with the cards
 * either side peeking in, so it is plain there is more to swipe to. It runs
 * round - the last card waits to the left of the first - so there is always
 * something on both sides. Auto-advances while on screen, pauses under a
 * finger, stays still under reduced motion (see useAutoCarousel). Every phone
 * carousel on the page uses this, so they look and move alike.
 *
 * Every card sits in the same grid cell (so the box is as tall as the tallest
 * card) and is moved into place by its distance from the active one. 100% in
 * a card's translate is its own width, so one step is 100% plus the gap.
 * Only the active card and its two neighbours are shown; a card coming round
 * from the far side travels while hidden.
 */
// iOS-like: quick off the mark, long soft landing.
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const DURATION = 480;
const GAP = 12;
const PEEK = 22;
const SIDE = GAP + PEEK;
const CARD_W = `calc(100% - ${2 * SIDE}px)`;

function offsetFrom(i, active, count) {
  let d = (i - active) % count;
  if (d > count / 2) d -= count;
  if (d < -count / 2) d += count;
  // Two cards: the other one shows on the right, not on both sides at once.
  if (count === 2 && d === -1) d = 1;
  return d;
}

export default function PeekCarousel({ count, renderItem, labelFor, interval, className = '' }) {
  const { activeIdx, goPrev, goNext, goTo, rootRef, swipeHandlers } = useAutoCarousel(count, interval ? { interval } : undefined);

  // The track follows the finger while it is down, written straight to the
  // element once per frame rather than through React state, so a drag costs
  // no re-render. On release it eases back to 0 while the hook decides
  // whether that was a swipe to the next or previous card.
  const trackRef = useRef(null);
  const drag = useRef({ x: 0, y: 0, dx: 0, axis: null, frame: 0 });

  function paint() {
    drag.current.frame = 0;
    const el = trackRef.current;
    if (el) el.style.transform = `translate3d(${drag.current.dx}px,0,0)`;
  }

  const handlers = {
    onTouchStart(e) {
      const t = e.touches[0];
      drag.current = { x: t.clientX, y: t.clientY, dx: 0, axis: null, frame: 0 };
      if (trackRef.current) trackRef.current.style.transition = 'none';
      swipeHandlers.onTouchStart(e);
    },
    onTouchMove(e) {
      const t = e.touches[0];
      const d = drag.current;
      const dx = t.clientX - d.x;
      const dy = t.clientY - d.y;
      // Decide once whether this is a sideways drag or the page scrolling.
      if (!d.axis && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis !== 'x') return;
      d.dx = dx * 0.9;
      if (!d.frame) d.frame = requestAnimationFrame(paint);
    },
    onTouchEnd(e) {
      release();
      swipeHandlers.onTouchEnd(e);
    },
    onTouchCancel(e) {
      release();
      swipeHandlers.onTouchCancel(e);
    },
  };

  function release() {
    const d = drag.current;
    if (d.frame) cancelAnimationFrame(d.frame);
    d.frame = 0;
    d.dx = 0;
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = `transform ${DURATION}ms ${EASE}`;
    el.style.transform = 'translate3d(0,0,0)';
  }

  return (
    <div ref={rootRef} className={className}>
      <div className="peek-track touch-pan-y overflow-hidden py-1" {...handlers}>
        <div ref={trackRef} className="grid" style={{ transform: 'translate3d(0,0,0)', willChange: 'transform' }}>
          {Array.from({ length: count }, (_, i) => {
            const d = offsetFrom(i, activeIdx, count);
            const active = d === 0;
            const near = Math.abs(d) <= 1;
            return (
              <div
                key={i}
                className={[
                  'relative flex [grid-area:1/1] motion-reduce:!transition-none',
                  active ? 'z-10 opacity-100' : near ? 'opacity-55' : 'pointer-events-none opacity-0',
                ].join(' ')}
                style={{
                  width: CARD_W,
                  marginLeft: SIDE,
                  transform: `translate3d(calc(${d} * (100% + ${GAP}px)),0,0)`,
                  transition: `transform ${DURATION}ms ${EASE}, opacity ${DURATION}ms ${EASE}`,
                  // Its own layer, painted once up front, so moving it never
                  // repaints it - including a card coming round from hidden.
                  willChange: 'transform, opacity',
                  backfaceVisibility: 'hidden',
                }}
                aria-hidden={active ? undefined : true}
              >
                <div className="flex w-full" inert={!active}>
                  {renderItem(i, active)}
                </div>
                {/* A peeking card is a way to it, not a dead edge. */}
                {near && !active && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => goTo(i)}
                    className="absolute inset-0 rounded-2xl"
                    aria-label={labelFor(i)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4">
        <MobileCarouselControls
          count={count}
          activeIdx={activeIdx}
          onPrev={goPrev}
          onNext={goNext}
          onSelect={goTo}
          labelFor={labelFor}
        />
      </div>
    </div>
  );
}
