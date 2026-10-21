import { MobileCarouselControls } from './CarouselNav';
import useAutoCarousel from '../../hooks/useAutoCarousel';

/*
 * The landing page's phone carousel: one card at a time, the next one peeking
 * in on the right, so it is plain there is more to swipe to. Auto-advances
 * while on screen, pauses under a finger, stays still under reduced motion
 * (see useAutoCarousel). Every phone carousel on the page uses this, so they
 * look and move alike.
 *
 * The track is as wide as the screen, so 100% in its translate is the screen
 * width: a 16px gutter on the left, 16px between cards, and what is left of
 * the right gutter shows the next card.
 */
const GUTTER = 16;
const GAP = 16;
const PEEK = 28;
const CARD_W = `calc(100% - ${GUTTER + GAP + PEEK}px)`;
const STEP = `(100% - ${GUTTER + PEEK}px)`;

export default function PeekCarousel({ count, renderItem, labelFor, interval, className = '' }) {
  const { activeIdx, goPrev, goNext, goTo, rootRef, swipeHandlers } = useAutoCarousel(count, interval ? { interval } : undefined);

  return (
    <div ref={rootRef} className={className}>
      <div className="touch-pan-y overflow-hidden py-1" {...swipeHandlers}>
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] motion-reduce:transition-none"
          style={{ gap: GAP, transform: `translateX(calc(${GUTTER}px - ${activeIdx} * ${STEP}))` }}
        >
          {Array.from({ length: count }, (_, i) => {
            const active = i === activeIdx;
            return (
              <div
                key={i}
                className={`relative flex shrink-0 transition-opacity duration-500 motion-reduce:transition-none ${active ? '' : 'opacity-55'}`}
                style={{ width: CARD_W }}
                aria-hidden={active ? undefined : true}
              >
                <div className="flex w-full" inert={!active}>
                  {renderItem(i, active)}
                </div>
                {/* The peeking card is a way to it, not a dead edge. */}
                {!active && (
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
