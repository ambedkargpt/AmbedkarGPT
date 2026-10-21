// Shared controls for the landing page carousels: the round prev/next button
// and the mobile row of [prev] dots [next] under a one-card carousel.

export function NavButton({ onClick, direction, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#2a4375]/60 bg-[#0a1430] text-[#7a90b8] transition hover:border-[#4a78c8]/80 hover:bg-[#0f1e45] hover:text-white"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        {direction === 'left'
          ? <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          : <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        }
      </svg>
    </button>
  );
}

export function MobileCarouselControls({ count, activeIdx, onPrev, onNext, onSelect, labelFor }) {
  return (
    <div className="mt-5 flex items-center justify-center gap-4">
      <NavButton onClick={onPrev} direction="left" label="Previous" />

      <div className="flex items-center gap-2">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={i === activeIdx ? 'true' : undefined}
            className={[
              'rounded-full transition-all duration-200',
              i === activeIdx
                ? 'h-2 w-6 bg-[#3f9fff]'
                : 'h-2 w-2 bg-[#2a4375]/60 hover:bg-[#3f9fff]/50',
            ].join(' ')}
            aria-label={labelFor ? labelFor(i) : `Go to slide ${i + 1}`}
          />
        ))}
      </div>

      <NavButton onClick={onNext} direction="right" label="Next" />
    </div>
  );
}

/**
 * One card at a time, all cards stacked in the same grid cell so the box is as
 * tall as the tallest card and the dots and the content below never jump as
 * the slides change. Only the active card is visible and focusable.
 */
export function MobileCardStack({ items, activeIdx, animation, renderItem, className = '' }) {
  return (
    <div className={`grid ${className}`}>
      {items.map((item, i) => {
        const active = i === activeIdx;
        return (
          <div
            key={i}
            className={`flex [grid-area:1/1] ${active ? '' : 'invisible'}`}
            style={active ? { animation } : undefined}
            aria-hidden={active ? undefined : true}
            inert={!active}
          >
            {renderItem(item, i)}
          </div>
        );
      })}
    </div>
  );
}
