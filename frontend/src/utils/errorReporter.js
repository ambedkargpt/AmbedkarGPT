import client from '../api/client';
import { sendErrorReport } from '../api/monitoring';

/**
 * Sends errors that happen in the visitor's browser to the backend, so they
 * show up on the admin Errors page next to the server errors.
 *
 * What gets reported:
 *   - window "error"               an uncaught exception anywhere
 *   - window "unhandledrejection"  a promise that failed with no .catch()
 *   - ErrorBoundary                a React component crashed while rendering
 *   - failed API calls             502/503/504 or no answer at all. These are
 *                                  the failures the server never sees, like
 *                                  API Gateway giving up after 30 seconds.
 *
 * Only production builds report. While developing, the error is already on
 * your screen, and a local build may be pointed at the live API.
 */

// Enough to see what went wrong; a page stuck in a loop should not send hundreds.
const MAX_REPORTS_PER_PAGE_LOAD = 10;

// Browser noise that is not a bug in our code.
const IGNORED_MESSAGES = [
  'ResizeObserver loop',   // harmless layout warning from the browser
  'Script error.',         // an error from another site's script; it has no details
  'canceled',              // an axios request we cancelled on purpose
];

const alreadySent = new Set();
let started = false;

function toMessage(error) {
  if (error && error.message) {
    return `${error.name || 'Error'}: ${error.message}`;
  }
  return String(error ?? 'Unknown error');
}

// Remembers this report and says whether it may be sent.
function shouldSend(key) {
  if (alreadySent.has(key) || alreadySent.size >= MAX_REPORTS_PER_PAGE_LOAD) return false;
  alreadySent.add(key);
  return true;
}

function currentPage() {
  // The path only, not the full URL: a query string can hold a reset code or a token.
  return window.location.pathname.slice(0, 500);
}

export function reportError(error, { kind = 'manual', componentStack = '' } = {}) {
  try {
    if (!import.meta.env.PROD) return;

    // Failed axios calls are reported by reportApiFailure below, with more detail.
    if (error?.isAxiosError) return;

    const message = toMessage(error).slice(0, 2000);
    const stack = String(error?.stack || '');

    if (IGNORED_MESSAGES.some((text) => message.includes(text))) return;
    // Errors thrown by browser extensions the visitor has installed.
    if (stack.includes('chrome-extension://') || stack.includes('moz-extension://')) return;
    // The same error repeating on one page load only needs to be sent once.
    if (!shouldSend(message)) return;

    sendErrorReport({
      message,
      stack: stack.slice(0, 8000),
      component_stack: String(componentStack || '').slice(0, 4000),
      page: currentPage(),
      user_agent: navigator.userAgent.slice(0, 300),
      kind,
    });
  } catch {
    // Reporting an error must never cause a new one.
  }
}

// '/posts/generate' with baseURL 'https://api.x/api/v1' -> '/api/v1/posts/generate'
function apiPathOf(config) {
  const url = config.url || '';
  const full = /^https?:\/\//.test(url)
    ? url
    : `${(config.baseURL || '').replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
  return new URL(full, window.location.origin).pathname.slice(0, 300);
}

function reportApiFailure(error) {
  try {
    if (!import.meta.env.PROD) return;
    if (error?.code === 'ERR_CANCELED') return;

    // 0 means no answer reached the browser.
    const status = error?.response?.status ?? 0;
    // 4xx answers are the app working as designed: a bad form, signed out,
    // the daily post limit. Only server-side failures are bugs.
    if (status && status < 500) return;
    // An answer with our request_id came from our own code, and the server
    // has already recorded it. Without one, the failure happened in front of
    // the server (API Gateway, the network), which only the browser can see.
    if (error?.response?.data?.request_id) return;

    const config = error?.config || {};
    const method = (config.method || 'get').toUpperCase();
    const apiPath = apiPathOf(config);
    if (!shouldSend(`api ${method} ${apiPath} ${status}`)) return;

    const startedAt = config.metadata?.startedAt;
    sendErrorReport({
      kind: 'api',
      message: String(error?.message || 'API call failed').slice(0, 2000),
      method,
      api_path: apiPath,
      status,
      duration_ms: startedAt ? Math.round(performance.now() - startedAt) : null,
      page: currentPage(),
      user_agent: navigator.userAgent.slice(0, 300),
    });
  } catch {
    // Reporting an error must never cause a new one.
  }
}

export function startErrorReporting() {
  if (started) return;
  started = true;

  window.addEventListener('error', (event) => {
    reportError(event.error || event.message, { kind: 'window-error' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason, { kind: 'unhandled-rejection' });
  });

  // Note the start time of every API call, so a failure can say how long it
  // took (about 30s means API Gateway gave up).
  client.interceptors.request.use((config) => {
    config.metadata = { ...(config.metadata || {}), startedAt: performance.now() };
    return config;
  });

  // Runs after the existing 401/refresh handling in api/client.js, so it
  // only sees the final outcome. It always passes the error on unchanged,
  // so the page handles it exactly as before.
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      reportApiFailure(error);
      return Promise.reject(error);
    },
  );
}
