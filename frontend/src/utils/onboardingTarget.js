import { HOME_ROUTE } from '../data/features';

/**
 * Where an account that is missing its profile is sent: the Settings page,
 * not a separate onboarding form.
 *
 * `step` is what usePendingQuestions / the server named: 'profile' (party and
 * role) lands on the Profile tab, anything else on "Your voice". `next` is
 * where to go once the profile is complete, so someone who tried to write a
 * post is put back on the news instead of being left in Settings.
 */
export function settingsTarget(step, next = HOME_ROUTE) {
  const params = new URLSearchParams({ tab: step === 'profile' ? 'profile' : 'voice' });
  if (next) params.set('next', next);
  return `/settings?${params.toString()}`;
}

/** A `next` value from the address bar, accepted only if it is a path in this app. */
export function safeNext(value) {
  if (typeof value !== 'string') return null;
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : null;
}
