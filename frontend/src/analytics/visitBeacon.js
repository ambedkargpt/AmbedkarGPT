/**
 * One "visit" per browser tab, for the twice-daily activity report: which page
 * people land on and which link brought them (utm_source, or the referring
 * site), so the team can see what the Instagram banner and shared links bring.
 * The server adds the address and, from it, the city and state.
 *
 * Sent with navigator.sendBeacon as text/plain, which needs no CORS preflight
 * and survives the page navigating away. Never throws.
 */
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
const SENT_KEY = 'ag_visit_sent';

export function sendVisitBeacon() {
  try {
    if (sessionStorage.getItem(SENT_KEY)) return;
    sessionStorage.setItem(SENT_KEY, '1');
  } catch {
    // Storage blocked: still send, at most once per page load.
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const body = JSON.stringify({
      path: window.location.pathname,
      referrer: document.referrer || '',
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      lang: navigator.language || '',
    });
    const url = `${BASE_URL}/track/visit`;
    const blob = new Blob([body], { type: 'text/plain' });
    if (!(navigator.sendBeacon && navigator.sendBeacon(url, blob))) {
      fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'text/plain' }, keepalive: true, mode: 'no-cors' }).catch(() => {});
    }
  } catch {
    /* a lost visit is not worth an error */
  }
}
