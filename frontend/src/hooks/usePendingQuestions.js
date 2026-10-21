import { useEffect, useState } from 'react';

import { getPendingQuestionSets } from '../api/questions';

/**
 * Which new question sets the signed-in user has never answered.
 *
 * Asked once per signed-in user and held here, not in component state: this is
 * read by ProtectedRoute, which mounts on every protected route, and without
 * the cache signing in would fire the request again on each navigation.
 *
 * Returns { pending, checked }. `checked` is what callers should gate on —
 * `pending` is all false both before the answer arrives and when there is
 * genuinely nothing to ask, and redirecting on the first is wrong.
 */

const NONE = { party: false, position: false, profile: false };

let cache = { userId: null, promise: null, value: null };

// Called when the questionnaire finishes, so the next route change does not
// send the user straight back into it on a stale answer.
export function clearPendingQuestions() {
  cache = { userId: null, promise: null, value: null };
}

function load(userId) {
  if (cache.userId === userId && cache.promise) return cache.promise;
  const promise = getPendingQuestionSets()
    .then((value) => {
      if (cache.userId === userId) cache.value = value;
      return value;
    })
    // A failed check must not block the app. Nothing pending is the safe
    // answer: the worst case is that someone is not asked until next time.
    .catch(() => NONE);
  cache = { userId, promise, value: null };
  return promise;
}

/** What a signed-in account still has to set up before it can post, if anything. */
export function onboardingStep(pending) {
  if (pending.profile) return 'profile';
  if (pending.position) return 'preferences';
  return null;
}

export default function usePendingQuestions(userId) {
  const [state, setState] = useState(() =>
    cache.userId === userId && cache.value
      ? { pending: cache.value, checked: true }
      : { pending: NONE, checked: false },
  );

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    load(userId).then((value) => {
      if (!cancelled) setState({ pending: value ?? NONE, checked: true });
    });
    return () => { cancelled = true; };
  }, [userId]);

  // Signed out, or a different user than the answer in state belongs to: the
  // answer is derived rather than cleared through another setState, so there is
  // no render where the previous user's result is still being reported.
  if (!userId || cache.userId !== userId) return { pending: NONE, checked: false };
  return state;
}
