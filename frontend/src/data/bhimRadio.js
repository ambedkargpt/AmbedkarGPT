// Where Bhim Radio gets what it plays.
//
// Bheem Radio builds one looped MP3 per party per day and writes a manifest
// beside it. This module turns that manifest into the shape the player wants
// and is the only place that knows the manifest exists.
//
// The base URL is read from the environment rather than written here: the
// files are served from an object store whose host is still being decided
// (CloudFront, S3 directly, or R2 - the player cannot tell the difference, it
// only needs something that answers HTTP with byte ranges). Without the
// variable every call here is a no-op and the panel says nothing is on air,
// which is also what a developer running the site locally should see.

const BASE_URL = (import.meta.env.VITE_RADIO_BASE_URL || '').replace(/\/+$/, '');

export const radioConfigured = Boolean(BASE_URL);

// The four streams Bheem Radio builds. Fixed by its own config
// (`daily_tenants`), so they are written out rather than fetched: one more
// request on page load to learn four strings that have not changed would be a
// poor trade.
// The symbol each station is known by - the same marks the news carousel puts
// beside a story, so a listener recognises the station from the feed. General
// has no party of its own and carries the product mark instead.
const STATION_ART = {
  congress:  '/party-symbols/congress.png',   // the open hand
  samajwadi: '/party-symbols/samajwadi.png',  // the cycle
  bjp:       '/party-symbols/bjp.png',        // the lotus
  general:   '/icon-512.png',
};

/** Artwork for a station, falling back to the product mark. */
export function stationArt(slug) {
  return STATION_ART[slug] || STATION_ART.general;
}

export const STATIONS = [
  { slug: 'congress',  labelKey: 'radio.stationCongress' },
  { slug: 'samajwadi', labelKey: 'radio.stationSamajwadi' },
  { slug: 'bjp',       labelKey: 'radio.stationBjp' },
  // General news is no longer collected, so its station is not offered.
];

/**
 * Which stream to open for a listener.
 *
 * Everyone gets General, because General is the only bulletin being built.
 * The station picker is gone with it: with one station on air, a picker
 * offered three ways to reach an empty panel - which is exactly what a
 * Congress account saw, since the party on the account chose the station and
 * no Congress bulletin exists.
 *
 * When the other three are building, the intended order is congress, then
 * samajwadi, then bjp, then general, and the party on the account chooses
 * again. The matching that did that is kept below rather than deleted, so
 * turning it back on is one line and not a re-derivation.
 */
export function stationForParty(partyName) {
  return 'general';
  // eslint-disable-next-line no-unreachable
  return partyStation(partyName);
}

/**
 * The station a party would listen to, once they are all on air.
 *
 * Matched loosely on the stored name, the same way the news feed resolves a
 * tenant. BJP is deliberately not matched: it is scraped to be answered, never
 * to be someone's own party, and the signup picker does not offer it either.
 * Anyone else - no party, or one we hold no corpus for - gets General.
 */
export function partyStation(partyName) {
  const name = String(partyName || '').toLowerCase();
  if (name.includes('congress') && !name.includes('trinamool')) return 'congress';
  if (name.includes('samajwadi')) return 'samajwadi';
  return 'general';
}

/**
 * The day's stream for one party.
 *
 * Returns null when nothing is on air - no base URL configured, no manifest
 * yet, or a manifest the build never finished. Throws only on a network or
 * parse failure, which the player reports separately so a station that is
 * merely quiet does not look broken.
 */
export async function loadStation(tenant) {
  if (!BASE_URL) return null;

  // `latest.json` is written last by the build and carries a 60-second
  // Cache-Control, so a fresh fetch here is cheap and a failed build leaves
  // yesterday's stream in place rather than an empty station.
  const response = await fetch(`${BASE_URL}/${encodeURIComponent(tenant)}/latest.json`, {
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404 || response.status === 403) return null;  // nothing on air yet
  if (!response.ok) throw new Error(`radio manifest: HTTP ${response.status}`);

  const manifest = await response.json();
  // Where the audio actually is.
  //
  // The manifest carries both `audio_key` - the object's own path, no host in
  // it - and `audio_url`, which the build composes from whatever base URL it
  // was configured with. That base defaults to http://localhost:8000/media
  // upstream, so a build that is not told otherwise writes a localhost URL
  // into a manifest served worldwide.
  //
  // So when this app has been given a base URL, that is the authority and the
  // key is what gets appended to it. audio_url is only read when there is no
  // base URL to use, which is local development.
  //
  // An earlier version let an absolute audio_url win on the grounds that it
  // named a host deliberately. It does not: production played the manifest's
  // localhost URL, the audio element raised MEDIA_ERR_SRC_NOT_SUPPORTED, and
  // the page disabled its own tune-in button while the rest of the station -
  // clock, running order, transcript - carried on as though nothing was wrong.
  const audioUrl = BASE_URL && manifest.audio_key
    ? `${BASE_URL}/${manifest.audio_key}`
    : manifest.audio_url || '';
  if (!audioUrl) return null;

  return {
    tenant: manifest.tenant || tenant,
    date: manifest.date || '',
    // When this bulletin went on air. A rebuild for a new story starts the
    // loop from here, so the newest story is what a listener hears next.
    startsAt: manifest.starts_at || '',
    title: manifest.title || '',
    audioUrl,
    durationSec: Number(manifest.duration_sec) || 0,
    tracks: tracksFrom(manifest),
    segments: segmentsFrom(manifest),
  };
}

/**
 * Every part of the broadcast, in order, including the ones a listener is not
 * meant to land on.
 *
 * `tracksFrom` deliberately throws away the intro, the headline montage and
 * the sign-off, because nobody wants "next" to stop on a nine-second ident.
 * This keeps them, for the one case where stepping through the furniture is
 * the point: showing somebody how a bulletin is put together.
 */
export function segmentsFrom(manifest) {
  const segments = Array.isArray(manifest?.segments) ? manifest.segments : [];
  return segments
    .filter((s) => s && Number.isFinite(Number(s.start_sec)))
    .map((s, i) => ({
      id: String(s.story_id || `${manifest.date || 'day'}-seg-${i}`),
      kind: String(s.kind || 'segment'),
      title: String(s.title || '').trim(),
      startSec: Number(s.start_sec),
      endSec: Number.isFinite(Number(s.end_sec)) ? Number(s.end_sec) : null,
    }));
}

/**
 * The manifest's segments, as things a listener can skip between.
 *
 * Only `story` segments become tracks. The intro, the headline montage and the
 * sign-off are part of the broadcast but not places anyone wants to land when
 * they press next, and a "track" called "intro" lasting nine seconds makes the
 * skip buttons useless.
 *
 * Each track keeps its offsets into the one MP3. Nothing here has its own
 * file: skipping seeks, it does not load.
 */
function tracksFrom(manifest) {
  const segments = Array.isArray(manifest.segments) ? manifest.segments : [];
  return segments
    .filter((s) => s && s.kind === 'story' && Number.isFinite(Number(s.start_sec)))
    .map((s, i) => ({
      id: String(s.story_id || `${manifest.date || 'day'}-${i}`),
      title: String(s.title || '').trim(),
      startSec: Number(s.start_sec),
      endSec: Number.isFinite(Number(s.end_sec)) ? Number(s.end_sec) : null,
      tenant: s.tenant || manifest.tenant || '',
      // The narration itself, which the manifest carries. It is what the
      // transcript shows and what the word highlight runs over - the words a
      // listener is hearing, not a summary written separately from them.
      text: String(s.text || '').trim(),
      storyType: String(s.story_type || '').trim(),
      // When the narration itself starts and stops, if the build says. The
      // story's own span also holds the link into it, its headline and the
      // music after it, none of which are the words on screen.
      textStartSec: Number.isFinite(Number(s.text_start_sec)) ? Number(s.text_start_sec) : null,
      textEndSec: Number.isFinite(Number(s.text_end_sec)) ? Number(s.text_end_sec) : null,
    }));
}

// India has one offset and no daylight saving, so a fixed number is correct
// here and a timezone library would buy nothing.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Where the broadcast has got to right now, in seconds into the loop.
 *
 * A radio station does not wait for you. The day's bulletin is one file played
 * round and round from midnight, so what you hear when you tune in is decided
 * by the clock, not by where you stopped listening yesterday. That is the
 * whole difference between a station and a podcast, and it is the reason this
 * is computed rather than remembered.
 *
 * Midnight is IST for every listener, not each listener's own midnight: two
 * people tuning in at the same moment have to hear the same sentence, or it is
 * not a broadcast. The offsets in the manifest are relative to the file, so
 * nothing else here needs to know about time zones.
 *
 * Returns 0 when there is nothing on air or the manifest carries no usable
 * date, which lands the listener at the station ident - the right place to
 * start when we cannot tell what time the broadcast thinks it is.
 */
export function broadcastPositionSec(station, nowMs = Date.now()) {
  const duration = Number(station?.durationSec);
  if (!Number.isFinite(duration) || duration <= 0) return 0;

  // A bulletin that says when it went on air runs from that moment: it is
  // rebuilt whenever a story comes in, with that story first, and joining the
  // new file at "time since midnight" would drop the listener somewhere in
  // the middle of it instead of at the news they have not heard.
  const startedMs = Date.parse(String(station?.startsAt || ''));
  if (Number.isFinite(startedMs)) {
    const sinceStart = (nowMs - startedMs) / 1000;
    return ((sinceStart % duration) + duration) % duration;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(station?.date || ''));
  if (!match) return 0;

  const [, y, m, d] = match;
  const midnightIst = Date.UTC(Number(y), Number(m) - 1, Number(d)) - IST_OFFSET_MS;
  const elapsedSec = (nowMs - midnightIst) / 1000;
  if (!Number.isFinite(elapsedSec)) return 0;

  // Two modulos: a bulletin dated tomorrow (a clock that is behind, or a build
  // that ran early) gives a negative elapsed time, and `%` keeps the sign.
  return ((elapsedSec % duration) + duration) % duration;
}

/** The track playing at `seconds`, or -1 before the first story starts. */
export function trackAt(tracks, seconds) {
  for (let i = tracks.length - 1; i >= 0; i -= 1) {
    if (seconds >= tracks[i].startSec) return i;
  }
  return -1;
}
