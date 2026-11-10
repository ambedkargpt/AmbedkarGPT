import { HOME_ROUTE } from '../data/features';

/**
 * Where an account that is missing its profile is sent: the Settings page,
 * not a separate onboarding form.
 *
 * Always the Profile tab: it is where party and role are set, and the
 * preference questions are no longer asked. `step` (what the server or
 * usePendingQuestions named) is kept so callers do not change. `next` is where
 * to go once the profile is complete, so someone who tried to write a post is
 * put back on the news instead of being left in Settings.
 */
export function settingsTarget(step, next = HOME_ROUTE) {
  const params = new URLSearchParams({ tab: 'profile' });
  if (next) params.set('next', next);
  return `/settings?${params.toString()}`;
}

/** A `next` value from the address bar, accepted only if it is a path in this app. */
export function safeNext(value) {
  if (typeof value !== 'string') return null;
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : null;
}
