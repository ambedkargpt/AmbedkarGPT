import { partyMeta } from './partyMeta';

/** The party's symbol, painted in its colour. */
export function PartySymbol({ slug, size = 20, className = '', color }) {
  const meta = partyMeta(slug);
  if (!meta.symbol) return null;
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color ?? meta.color,
        WebkitMaskImage: `url(${meta.symbol})`,
        maskImage: `url(${meta.symbol})`,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}

/** A small glass chip: the symbol and the party's short name. */
export function PartyChip({ slug, label, className = '' }) {
  const meta = partyMeta(slug);
  const text = label ?? meta.short;
  if (!text && !meta.symbol) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-bold leading-none tracking-wide text-white ${className}`}
      style={{ borderColor: `${meta.color}55`, background: `linear-gradient(135deg, ${meta.color}33 0%, ${meta.color}12 100%)` }}
    >
      <PartySymbol slug={slug} size={15} />
      {text}
    </span>
  );
}
