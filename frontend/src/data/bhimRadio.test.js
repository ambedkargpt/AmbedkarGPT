// What the player plays, derived from Bheem Radio's manifest.
//
// These three functions decide which story a listener hears when they press
// next, and every way they can be wrong is silent: an off-by-one puts them
// half a sentence into the wrong story, and a bad filter makes the skip
// buttons land on a nine-second station ident.

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  broadcastPositionSec, loadStation, partyStation, stationForParty, trackAt,
} from './bhimRadio';

// A manifest shaped exactly like the one in Bheem Radio's integration guide.
const MANIFEST = {
  version: 1,
  tenant: 'congress',
  date: '2026-10-04',
  lang: 'hi',
  title: 'कांग्रेस बुलेटिन',
  duration_sec: 2410.5,
  audio_key: 'congress/2026-10-04-3716a8dc0a.mp3',
  audio_url: 'https://radio.example.net/congress/2026-10-04-3716a8dc0a.mp3',
  segments: [
    { kind: 'intro', title: 'Station ident', start_sec: 0.0, end_sec: 12.9 },
    { kind: 'headlines', title: 'Headlines', start_sec: 12.9, end_sec: 48.2 },
    { kind: 'story', title: 'First story', story_id: 'news_001', tenant: 'congress',
      start_sec: 48.2, end_sec: 96.4 },
    { kind: 'story', title: 'Second story', story_id: 'news_002', tenant: 'congress',
      start_sec: 96.4, end_sec: 150.0 },
    { kind: 'story', title: 'A General story', story_id: 'news_003', tenant: 'general',
      start_sec: 150.0, end_sec: 200.0 },
    { kind: 'outro', title: 'Sign-off', start_sec: 2380.1, end_sec: 2410.5 },
  ],
};

function mockFetch(body, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('stationForParty', () => {
  // One bulletin is being built, so one station is what anyone can be sent to.
  // The picker went with it, which means a listener routed to a silent station
  // has no way off it - the case this pins.
  it('sends everybody to the station that is actually on air', () => {
    expect(stationForParty('Indian National Congress (INC)')).toBe('general');
    expect(stationForParty('Samajwadi Party (SP)')).toBe('general');
    expect(stationForParty('')).toBe('general');
    expect(stationForParty(null)).toBe('general');
  });
});

describe('partyStation', () => {
  // Kept working while only General is built, so switching the others on is a
  // line in stationForParty rather than rewriting this from memory.
  it('sends a listener to their own party', () => {
    expect(partyStation('Indian National Congress (INC)')).toBe('congress');
    expect(partyStation('Samajwadi Party (SP)')).toBe('samajwadi');
  });

  it("never makes BJP someone's own station", () => {
    // BJP is scraped to be answered, not represented. The signup picker does
    // not offer it either, so a stored value naming it must not select it.
    expect(partyStation('Bharatiya Janata Party (BJP)')).toBe('general');
  });

  it('does not mistake Trinamool Congress for Congress', () => {
    // Substring matching is what resolves the news tenant too, and "Trinamool
    // Congress" contains "congress".
    expect(partyStation('Trinamool Congress (TMC)')).toBe('general');
  });

  it('falls back to General for no party and for parties we have no corpus for', () => {
    expect(partyStation('')).toBe('general');
    expect(partyStation(null)).toBe('general');
    expect(partyStation('Aam Aadmi Party (AAP)')).toBe('general');
  });
});

describe('loadStation', () => {
  it('keeps only the stories as skippable tracks', async () => {
    mockFetch(MANIFEST);
    const station = await loadStation('congress');

    // The intro, the headline montage and the sign-off are part of the
    // broadcast but not places anyone wants to land on pressing next.
    expect(station.tracks.map((t) => t.title))
      .toEqual(['First story', 'Second story', 'A General story']);
  });

  it('keeps each track\'s offsets into the one file', async () => {
    mockFetch(MANIFEST);
    const station = await loadStation('congress');

    expect(station.audioUrl).toBe(MANIFEST.audio_url);
    expect(station.durationSec).toBe(2410.5);
    expect(station.tracks[1]).toMatchObject({
      id: 'news_002', startSec: 96.4, endSec: 150.0,
    });
    // No per-track source: skipping seeks, it does not load.
    expect(station.tracks[0].src).toBeUndefined();
  });

  it('builds the audio URL from audio_key when audio_url is absent', async () => {
    mockFetch({ ...MANIFEST, audio_url: undefined });
    const station = await loadStation('congress');

    expect(station.audioUrl).toMatch(/congress\/2026-10-04-3716a8dc0a\.mp3$/);
  });

  it('ignores a dev-server audio_url once a base URL is configured', async () => {
    // The build writes audio_url as a path on whatever served the manifest,
    // which in development is the dev server at /radio. Production serves the
    // audio from a different host, so taking that path pointed the player at
    // a gitignored directory that has never been deployed - the station came
    // up, the running order filled, and the audio 404ed. audio_key carries no
    // host, which is why it is the one that travels.
    //
    // The base URL is read once when the module loads, so the module has to
    // be re-imported after the environment is stubbed.
    vi.stubEnv('VITE_RADIO_BASE_URL', 'https://cdn.example.net');
    vi.resetModules();
    const { loadStation: load } = await import('./bhimRadio');

    mockFetch({ ...MANIFEST, audio_url: '/radio/congress/2026-10-04-3716a8dc0a.mp3' });

    expect((await load('congress')).audioUrl)
      .toBe('https://cdn.example.net/congress/2026-10-04-3716a8dc0a.mp3');
  });

  it('ignores an absolute audio_url too, because upstream writes localhost', async () => {
    // This one shipped. Bheem Radio composes audio_url from its own
    // public_base_url, which defaults to http://localhost:8000/media, so a
    // build that is not told otherwise puts a localhost URL in a manifest
    // served worldwide. Letting an absolute URL win on the grounds that it
    // "named a host deliberately" meant production played that URL: the audio
    // element raised MEDIA_ERR_SRC_NOT_SUPPORTED, the page disabled tune-in,
    // and everything else - clock, running order, transcript - kept running,
    // so the station looked alive and simply would not play.
    vi.stubEnv('VITE_RADIO_BASE_URL', 'https://cdn.example.net');
    vi.resetModules();
    const { loadStation: load } = await import('./bhimRadio');

    mockFetch({ ...MANIFEST, audio_url: 'http://localhost:8000/media/radio/congress/x.mp3' });

    expect((await load('congress')).audioUrl)
      .toBe('https://cdn.example.net/congress/2026-10-04-3716a8dc0a.mp3');
  });

  it('reports nothing on air rather than throwing when there is no manifest', async () => {
    // A party with no news today, or a build that has never run. Both are
    // ordinary, and neither should look like a broken station.
    mockFetch(null, 404);
    expect(await loadStation('samajwadi')).toBeNull();
  });

  it('throws on a server error, so the panel can offer a retry', async () => {
    mockFetch(null, 500);
    await expect(loadStation('congress')).rejects.toThrow(/500/);
  });

  it('survives a manifest with no segments at all', async () => {
    mockFetch({ ...MANIFEST, segments: undefined });
    const station = await loadStation('congress');
    expect(station.tracks).toEqual([]);
  });
});

describe('trackAt', () => {
  const tracks = [
    { startSec: 48.2 }, { startSec: 96.4 }, { startSec: 150.0 },
  ];

  it('is -1 during the intro, before any story has started', () => {
    expect(trackAt(tracks, 0)).toBe(-1);
    expect(trackAt(tracks, 48.1)).toBe(-1);
  });

  it('takes the story whose start has just passed', () => {
    expect(trackAt(tracks, 48.2)).toBe(0);     // exactly on the boundary
    expect(trackAt(tracks, 96.3)).toBe(0);     // a tenth before the next
    expect(trackAt(tracks, 96.4)).toBe(1);
    expect(trackAt(tracks, 149.9)).toBe(1);
  });

  it('stays on the last story through the sign-off', () => {
    // The outro is not a track, so "now playing" holds rather than blanking
    // out for the final thirty seconds.
    expect(trackAt(tracks, 2400)).toBe(2);
  });

  it('is -1 when there are no stories', () => {
    expect(trackAt([], 10)).toBe(-1);
  });
});

/* ── broadcastPositionSec ─────────────────────────────────────────────────
   The station runs on a clock, not on where a listener stopped. These pin
   that, because the failure is quiet: a wrong epoch still plays audio, it
   just plays the wrong part of the day, and nobody can tell by looking.
   ------------------------------------------------------------------------ */

// 2026-10-06 00:00 IST, which is 2026-10-05 18:30 UTC.
const MIDNIGHT_IST = Date.UTC(2026, 9, 5, 18, 30, 0);
const station = { date: '2026-10-06', durationSec: 200 };

describe('broadcastPositionSec', () => {
  it('is at the station ident at midnight', () => {
    expect(broadcastPositionSec(station, MIDNIGHT_IST)).toBe(0);
  });

  it('is however many seconds have passed, inside the first loop', () => {
    expect(broadcastPositionSec(station, MIDNIGHT_IST + 90_000)).toBe(90);
  });

  it('wraps, because the file is played round all day', () => {
    // 200s loop: ten minutes in is the start of the fourth pass.
    expect(broadcastPositionSec(station, MIDNIGHT_IST + 600_000)).toBe(0);
    expect(broadcastPositionSec(station, MIDNIGHT_IST + 630_000)).toBe(30);
  });

  it('gives the same answer to every listener, whatever their own timezone', () => {
    // The argument is an absolute instant, so this is really a guard against
    // anyone rewriting it with local getHours()/getDate().
    const instant = Date.parse('2026-10-06T12:00:00+05:30');
    expect(broadcastPositionSec(station, instant)).toBe((12 * 3600) % 200);
  });

  it('stays positive for a bulletin dated ahead of the clock', () => {
    // An early build, or a listener whose clock is behind. `%` alone would
    // return a negative offset here and the seek would be refused.
    const pos = broadcastPositionSec(station, MIDNIGHT_IST - 30_000);
    expect(pos).toBeGreaterThanOrEqual(0);
    expect(pos).toBe(170);
  });

  it('falls back to the start when there is nothing to go on', () => {
    expect(broadcastPositionSec(null, MIDNIGHT_IST)).toBe(0);
    expect(broadcastPositionSec({ date: '', durationSec: 200 }, MIDNIGHT_IST)).toBe(0);
    expect(broadcastPositionSec({ date: 'today', durationSec: 200 }, MIDNIGHT_IST)).toBe(0);
    expect(broadcastPositionSec({ date: '2026-10-06', durationSec: 0 }, MIDNIGHT_IST)).toBe(0);
  });
});

describe('broadcastPositionSec with starts_at', () => {
  // A rebuild for a new story starts the loop from the moment it went on air,
  // so the newest story is what a listener hears next.
  const station = { durationSec: 600, date: '2026-10-20', startsAt: '2026-10-20T10:00:00+00:00' };

  it('counts from starts_at, not from midnight', () => {
    expect(broadcastPositionSec(station, Date.parse('2026-10-20T10:00:30Z'))).toBeCloseTo(30);
  });

  it('loops round the bulletin after that', () => {
    expect(broadcastPositionSec(station, Date.parse('2026-10-20T10:12:00Z'))).toBeCloseTo(120);
  });

  it('falls back to midnight IST without it', () => {
    const { startsAt, ...noStart } = station;   // eslint-disable-line no-unused-vars
    const midnightIst = Date.UTC(2026, 9, 20) - 5.5 * 3600 * 1000;
    expect(broadcastPositionSec(noStart, midnightIst + 45_000)).toBeCloseTo(45);
  });
});
