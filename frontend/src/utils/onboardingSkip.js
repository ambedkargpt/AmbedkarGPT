/**
 * "Skip for now" on the sign-up and profile screens.
 *
 * A new account can go straight to the news without a party or a position.
 * The news reads fine without them (it shows every party), but a post cannot
 * be written without them: the server refuses with 403 onboarding_required,
 * and the generator sends the user to the profile screen at that moment.
 *
 * Remembered per account on this device, so the news page does not lock again
 * on the next visit. Storage can be blocked (private mode); then the skip lasts
 * for this page load only, which is still enough to reach the news.
 */
const KEY = 'ambedkargpt_onboarding_skipped';
const memory = new Set();

export function skipOnboarding(userId) {
  if (!userId) return;
  memory.add(String(userId));
  try {
    const ids = new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
    ids.add(String(userId));
    localStorage.setItem(KEY, JSON.stringify([...ids]));
  } catch { /* storage blocked: the in-memory set still lets them through */ }
}

export function onboardingSkipped(userId) {
  if (!userId) return false;
  if (memory.has(String(userId))) return true;
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]').includes(String(userId));
  } catch {
    return false;
  }
}
