import { useState } from 'react';
import { formatShortTime, kindInfo, SERIES } from './errorFormat';

/**
 * Charts for the admin Errors pages. Plain divs and one small SVG, no chart
 * library, so they are easy to read and change.
 *
 * Colours: the two series use the dark-mode steps of the reference palette
 * (blue for backend, orange for browser), checked for colour-blind
 * separation and contrast against this page's #07101f surface. Text never
 * takes a series colour; the coloured swatch beside it carries the meaning.
 */

const GRID = 'rgba(255,255,255,0.06)';
const BASELINE = 'rgba(255,255,255,0.16)';

// 0..max rounded up to 1, 2 or 5 x 10^n, so the axis has tidy numbers.
function niceMax(value) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) {
    if (step * power >= value) return step * power;
  }
  return value;
}

export function Panel({ title, subtitle, right, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-[#1a2c55] bg-[#07101f]/85 p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-[14px] font-semibold text-white">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12px] text-[#6b78a0]">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, sub, accent }) {
  return (
    <div className="rounded-2xl border border-[#1a2c55] bg-[#07101f]/85 px-4 py-3.5">
      <div className="flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-wider text-[#6b78a0]">
        {accent && <span className="h-2 w-2 rounded-full" style={{ background: accent }} />}
        {label}
      </div>
      <div className="mt-1 text-[24px] font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value ?? '—'}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] text-[#6b78a0]">{sub}</div>}
    </div>
  );
}

/** "Crash", "Slow request"... with a dot. The label carries the meaning, not the colour. */
export function KindBadge({ kind }) {
  const info = kindInfo(kind);
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#c7d1eb]"
      title={info.help}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: info.color }} />
      {info.label}
    </span>
  );
}

function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <div className="flex items-center gap-4 text-[12px] text-[#9aa6c8]">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/**
 * Stacked bars over time: how many times errors happened in each hour (or
 * each 6 hours for a week). Hover a bar to see its exact numbers.
 *
 * @param {object[]} p.buckets        – [{ start, backend, frontend }]
 * @param {number}   p.bucketMinutes  – 60 or 360
 * @param {object[]} p.series         – which of SERIES to draw, bottom first
 */
export function TimelineChart({ buckets, bucketMinutes, series = [SERIES.backend, SERIES.frontend], height = 170 }) {
  const [hovered, setHovered] = useState(null);
  const totals = buckets.map((b) => series.reduce((sum, s) => sum + (b[s.key] || 0), 0));
  const top = niceMax(Math.max(0, ...totals));
  const ticks = [top, top / 2, 0];
  const labelEvery = Math.ceil(buckets.length / 6);
  const withDay = bucketMinutes > 60;
  const allZero = totals.every((t) => t === 0);

  return (
    <div>
      <div className="mb-3 flex justify-end"><Legend series={series} /></div>
      <div className="flex gap-2">
        {/* y axis */}
        <div className="relative w-7 shrink-0 text-right text-[10.5px] text-[#6b78a0]" style={{ height, fontVariantNumeric: 'tabular-nums' }}>
          {ticks.map((tick) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - tick / top) * 100}%` }}>
              {Number.isInteger(tick) ? tick : tick.toFixed(1)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height }}>
            {/* gridlines and baseline */}
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute inset-x-0"
                style={{ top: `${(1 - tick / top) * 100}%`, borderTop: `1px solid ${tick === 0 ? BASELINE : GRID}` }}
              />
            ))}
            {allZero && (
              <div className="absolute inset-0 flex items-center justify-center text-[12.5px] text-[#6b78a0]">
                Nothing in this period
              </div>
            )}

            {/* bars */}
            <div className="absolute inset-0 flex items-end">
              {buckets.map((bucket, index) => {
                const total = totals[index];
                return (
                  <div
                    key={bucket.start}
                    className="relative flex h-full flex-1 items-end justify-center"
                    onMouseEnter={() => setHovered(index)}
                    onMouseLeave={() => setHovered(null)}
                    aria-label={`${formatShortTime(bucket.start, true)}: ${series.map((s) => `${s.label} ${bucket[s.key] || 0}`).join(', ')}`}
                  >
                    {hovered === index && <div className="absolute inset-y-0 w-full rounded bg-white/[0.04]" />}
                    <div className="relative flex w-[60%] max-w-[16px] flex-col-reverse gap-[2px]" style={{ height: `${(total / top) * 100}%` }}>
                      {series.map((s, i) => {
                        const value = bucket[s.key] || 0;
                        if (!value) return null;
                        const isTop = series.slice(i + 1).every((later) => !(bucket[later.key] || 0));
                        return (
                          <div
                            key={s.key}
                            style={{
                              flexGrow: value,
                              flexBasis: 0,
                              minHeight: 2,
                              background: s.color,
                              borderRadius: isTop ? '4px 4px 0 0' : 0,
                            }}
                          />
                        );
                      })}
                    </div>

                    {hovered === index && (
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 rounded-lg border border-[#22315c] bg-[#0c1330] px-3 py-2 text-[12px] shadow-xl">
                        <div className="mb-1 text-[#9aa6c8]">{formatShortTime(bucket.start, true)}</div>
                        {series.map((s) => (
                          <div key={s.key} className="flex items-center gap-2 text-white">
                            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                            <span className="text-[#9aa6c8]">{s.label}</span>
                            <span className="ml-auto pl-3 font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>{bucket[s.key] || 0}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* x axis */}
          <div className="mt-1.5 flex text-[10.5px] text-[#6b78a0]">
            {buckets.map((bucket, index) => (
              <div key={bucket.start} className="flex-1 text-center">
                {index % labelEvery === 0 ? formatShortTime(bucket.start, withDay) : ''}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A tiny trend line for a table row. One series, so no legend. */
export function Sparkline({ values, width = 96, height = 24 }) {
  if (!values?.length) return null;
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true">
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke={BASELINE} strokeWidth="1" />
      <polyline points={points} fill="none" stroke={SERIES.backend.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Ranked list with a bar per row: top failing paths, error types... */
export function BarList({ items, emptyText = 'Nothing yet' }) {
  if (!items?.length) {
    return <div className="py-6 text-center text-[12.5px] text-[#6b78a0]">{emptyText}</div>;
  }
  const max = Math.max(...items.map((i) => i.count));
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item.name}>
          <div className="flex items-baseline gap-3 text-[12.5px]">
            <span className="min-w-0 flex-1 truncate font-mono text-[#c7d1eb]" title={item.name}>{item.name}</span>
            <span className="text-[#9aa6c8]" style={{ fontVariantNumeric: 'tabular-nums' }}>{item.count}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-white/[0.05]">
            <div className="h-full rounded-full" style={{ width: `${(item.count / max) * 100}%`, background: SERIES.backend.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
