/**
 * The parties the news comes from, in the order the feed lists them, with the
 * election symbol the dashboard's top story already uses. The symbol files are
 * alpha masks, so each one is painted in its party's colour here rather than
 * shipping a coloured logo per party.
 */
export const PARTY_META = {
  congress:  { short: 'INC', color: '#3f9fff', glow: '#1a5fff', symbol: '/party-symbols/congress.png' },
  samajwadi: { short: 'SP',  color: '#f2545b', glow: '#d1213a', symbol: '/party-symbols/samajwadi.png' },
  bjp:       { short: 'BJP', color: '#ff8a2a', glow: '#f06a00', symbol: '/party-symbols/bjp.png' },
};

const FALLBACK = { short: '', color: '#8FA8FF', glow: '#4f6bff', symbol: null };

export const PARTY_ORDER = ['congress', 'samajwadi', 'bjp'];

export function partyMeta(slug) {
  return PARTY_META[slug] ?? FALLBACK;
}

/**
 * Party by party, taking turns: the reader's own party, then the next, then
 * back again (INC, BJP, INC, BJP ...), each party's stories newest first. A
 * block of one party and then a block of the other read as one party's feed.
 */
export function byParty(list, ownSlug) {
  const order = ownSlug && PARTY_ORDER.includes(ownSlug)
    ? [ownSlug, ...PARTY_ORDER.filter((p) => p !== ownSlug)]
    : PARTY_ORDER;
  const newest = (a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0);
  const queues = new Map();
  for (const a of list) {
    const key = order.includes(a.tenantSlug) ? a.tenantSlug : '_other';
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(a);
  }
  const lanes = [...order, '_other'].filter((k) => queues.has(k)).map((k) => queues.get(k).sort(newest));
  const out = [];
  for (let i = 0; out.length < list.length; i++) {
    for (const lane of lanes) if (i < lane.length) out.push(lane[i]);
  }
  return out;
}
