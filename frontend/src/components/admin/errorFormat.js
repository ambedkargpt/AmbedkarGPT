// Small helpers shared by the admin Errors pages.

// Chart series: dark-mode steps of the reference palette, checked for
// colour-blind separation and contrast on the page's #07101f surface.
export const SERIES = {
  backend: { key: 'backend', label: 'Backend', color: '#3987e5' },
  frontend: { key: 'frontend', label: 'Browser', color: '#d95926' },
};

// The API sends UTC. Older dates can arrive without a "Z"; add it so the
// browser does not read them as local time.
export function toDate(iso) {
  if (!iso) return null;
  const value = /[zZ]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`;
  return new Date(value);
}

export function formatTime(iso) {
  const date = toDate(iso);
  return date ? date.toLocaleString() : '—';
}

export function formatShortTime(iso, withDay) {
  const date = toDate(iso);
  if (!date) return '';
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!withDay) return time;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

// Name, colours and a one-line meaning for each kind of issue.
export const KIND_INFO = {
  exception: { label: 'Crash', color: '#ff8a7a', help: 'Our code raised an exception.' },
  logged: { label: 'Logged error', color: '#fbbf24', help: 'Our code logged an error without crashing.' },
  http_5xx: { label: '5xx answer', color: '#fb923c', help: 'An endpoint answered 5xx on purpose.' },
  slow_request: { label: 'Slow request', color: '#fbbf24', help: 'Took long enough for API Gateway to give up (503).' },
  api_failure: { label: 'API failed in browser', color: '#c084fc', help: 'The browser got 502/503/504 or no answer.' },
  browser_crash: { label: 'Browser crash', color: '#c084fc', help: 'JavaScript error in a visitor\'s browser.' },
};

export function kindInfo(kind) {
  return KIND_INFO[kind] || { label: kind || 'Error', color: '#9aa6c8', help: '' };
}

/**
 * Splits a Python traceback into its parts, so the page can highlight our
 * own code and fold away library code.
 *
 * Returns a list of sections, one per exception in the chain (the first is
 * the root cause), each { frames: [{ file, shortFile, line, func, code, ours }], error }.
 */
export function parsePythonTraceback(text) {
  if (!text) return [];
  const sections = text.split(/\n\s*The above exception was the direct cause of the following exception:\s*\n|\n\s*During handling of the above exception, another exception occurred:\s*\n/);

  return sections.map((section) => {
    const lines = section.split('\n');
    const frames = [];
    let error = '';
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(/^\s*File "(.+?)", line (\d+), in (.+)$/);
      if (match) {
        const file = match[1];
        const normalized = file.replace(/\\/g, '/');
        const index = normalized.indexOf('backend/');
        const next = (lines[i + 1] || '').trim();
        const hasCode = next && !next.startsWith('File "') && !/^[~^\s]+$/.test(next);
        frames.push({
          file,
          shortFile: index === -1 ? normalized : normalized.slice(index),
          line: Number(match[2]),
          func: match[3],
          code: hasCode ? next : '',
          ours: index !== -1 && !normalized.includes('site-packages'),
        });
      } else if (lines[i].trim() && !lines[i].startsWith(' ') && !lines[i].startsWith('Traceback')) {
        // The last unindented line of a section is the error itself.
        error = lines[i].trim();
      }
    }
    return { frames, error };
  }).filter((section) => section.frames.length || section.error);
}
