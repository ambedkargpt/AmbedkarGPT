import { readSession } from '../api/sessionStore';

/**
 * Downloads the code for the pages a visitor is likely to open next, once the
 * current page has finished loading and the browser is idle.
 *
 * Each page is its own file, fetched only when its link is clicked, so the
 * first visit to every page paused on a spinner while the file came down. With
 * the file already in the browser's cache, the page opens at once.
 *
 * It changes nothing else: the same files, from the same static host, asked
 * for a little earlier. No API is called. It is skipped on a data-saver or
 * slow connection, and a failed download is ignored (the page then loads the
 * normal way when it is opened).
 *
 * The import() paths must stay the same as the lazy() ones in App.jsx, so the
 * bundler treats them as the same file.
 */

// Small pages anyone may open from the landing page.
const FOR_EVERYONE = [
  () => import('../pages/Login'),
  () => import('../pages/Signup'),
  () => import('../pages/ServiceSelection'),
  () => import('../pages/BheemBot'),
  () => import('../pages/BhimRadio'),
];

// The working screens, only worth fetching for someone who is signed in.
const FOR_SIGNED_IN = [
  () => import('../pages/SocialMediaPostGenerator'),
  () => import('../pages/PostHistory'),
  () => import('../pages/Settings'),
];

const START_DELAY_MS = 3000;   // after the page has loaded
const GAP_MS = 400;            // between files, so nothing else is held up

function connectionIsSlow() {
  const connection = navigator.connection;
  if (!connection) return false;   // unknown (Safari, Firefox): assume fine
  return connection.saveData === true || /(^|-)2g$/.test(connection.effectiveType || '');
}

export function prefetchRoutes() {
  try {
    // Development loads every file on demand already.
    if (!import.meta.env.PROD || connectionIsSlow()) return;

    const pages = [...FOR_EVERYONE];
    if (readSession('access_token')) pages.push(...FOR_SIGNED_IN);

    let index = 0;
    const next = () => {
      if (index >= pages.length) return;
      const load = pages[index];
      index += 1;
      // Whether it worked or not, move on to the next one.
      load().catch(() => {}).finally(() => setTimeout(next, GAP_MS));
    };

    const start = () => setTimeout(next, START_DELAY_MS);
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  } catch {
    // Prefetching is a convenience; it must never break the page.
  }
}
