/**
 * The parties the news comes from, in the order the feed lists them, with the
 * election symbol the dashboard's top story already uses. The symbol files are
 * alpha masks, so each one is painted in its party's colour here rather than
 * shipping a coloured logo per party.
 */
export const PARTY_META = {
  congress:  { hi: 'कांग्रेस', short: 'INC', color: '#3f9fff', glow: '#1a5fff', symbol: '/party-symbols/congress.png' },
  samajwadi: { hi: 'सपा', short: 'SP',  color: '#e5484d', glow: '#c2262e', symbol: '/party-symbols/samajwadi.png' },
  bjp:       { hi: 'भाजपा', short: 'BJP', color: '#e5484d', glow: '#c2262e', symbol: '/party-symbols/bjp.png' },
};

const FALLBACK = { short: '', color: '#8FA8FF', glow: '#4f6bff', symbol: null };

export const PARTY_ORDER = ['congress', 'samajwadi', 'bjp'];

// Colour says whose news it is to the reader: their own party in the action
// blue, the opposition in red. Three accents in the whole app (blue, amber for
// radio and live, red for the opposition), and the symbol already says which
// party it is. The page sets the reader's party once it knows it.
const OWN = { color: '#3f9fff', glow: '#1a5fff' };
const OPPOSITION = { color: '#e5484d', glow: '#c2262e' };
let ownParty = 'congress';

export function setOwnParty(slug) {
  if (slug && PARTY_META[slug]) ownParty = slug;
}

export function partyMeta(slug) {
  const meta = PARTY_META[slug];
  if (!meta) return FALLBACK;
  return { ...meta, ...(slug === ownParty ? OWN : OPPOSITION) };
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

/** The party's short name in the reader's language: INC / कांग्रेस. */
export function partyShort(slug, lang) {
  const meta = partyMeta(slug);
  return (lang === 'hi' && meta.hi) || meta.short;
}

/**
 * When a story was published, the way a person says it: "3 घंटे पहले" / "3h
 * ago" for today's, "8 नवंबर" / "8 Nov" for anything older.
 */
export function newsDate(iso, lang) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const mins = Math.round((Date.now() - ms) / 60000);
  const hi = lang === 'hi';
  if (mins >= 0 && mins < 60) return mins < 1 ? (hi ? 'अभी' : 'just now') : (hi ? `${mins} मिनट पहले` : `${mins}m ago`);
  if (mins >= 0 && mins < 24 * 60) {
    const h = Math.round(mins / 60);
    return hi ? `${h} घंटे पहले` : `${h}h ago`;
  }
  return new Date(ms).toLocaleDateString(hi ? 'hi-IN' : 'en-IN', { day: 'numeric', month: hi ? 'long' : 'short' });
}
