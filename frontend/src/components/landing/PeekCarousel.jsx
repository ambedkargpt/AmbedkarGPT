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

  return (
    <div ref={rootRef} className={className}>
      <div className="touch-pan-y overflow-hidden py-1" {...swipeHandlers}>
        <div className="grid">
          {Array.from({ length: count }, (_, i) => {
            const d = offsetFrom(i, activeIdx, count);
            const active = d === 0;
            const near = Math.abs(d) <= 1;
            return (
              <div
                key={i}
                className={[
                  'relative flex [grid-area:1/1] transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] motion-reduce:transition-none',
                  active ? 'z-10 opacity-100' : near ? 'opacity-55' : 'pointer-events-none opacity-0',
                ].join(' ')}
                style={{
                  width: CARD_W,
                  marginLeft: SIDE,
                  transform: `translateX(calc(${d} * (100% + ${GAP}px)))`,
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
