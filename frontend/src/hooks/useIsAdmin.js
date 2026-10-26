import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getAdminStatus } from '../api/monitoring';

// The answer is kept for the whole browser tab (sessionStorage), so a normal
// user's browser asks the API once per tab, not on every page load. In
// memory as well, because the sidebar is drawn twice (desktop rail and phone
// drawer) and both copies would otherwise ask at the same moment.
const STORAGE_KEY = 'ambedkargpt_is_admin';
let cachedUserId = null;
let cachedRequest = null;

function readStored(userId) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (stored && stored.userId === userId) return stored.isAdmin;
  } catch { /* storage blocked or broken: just ask the API */ }
  return null;
}

function writeStored(userId, isAdmin) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, isAdmin }));
  } catch { /* storage blocked: we will ask again next time */ }
}

function askOnce(userId) {
  if (cachedUserId !== userId) {
    cachedUserId = userId;
    const stored = readStored(userId);
    cachedRequest = stored !== null
      ? Promise.resolve(stored)
      : getAdminStatus()
        .then((data) => {
          const isAdmin = Boolean(data?.is_admin);
          writeStored(userId, isAdmin);
          return isAdmin;
        })
        // Not remembered on failure, so the next page load tries again.
        .catch(() => false);
  }
  return cachedRequest;
}

/**
 * True when the signed-in user is an admin, false otherwise (and while we do
 * not know yet). Only decides whether admin links are shown; the API checks
 * again on every admin request, so this is not what keeps the pages safe.
 */
export function useIsAdmin() {
  const { currentUser } = useAuth();
  const userId = currentUser?.id ?? null;
  const [result, setResult] = useState({ userId: null, isAdmin: false });

  useEffect(() => {
    if (!userId) return undefined;
    let ignore = false;
    askOnce(userId).then((isAdmin) => {
      if (!ignore) setResult({ userId, isAdmin });
    });
    return () => { ignore = true; };
  }, [userId]);

  // A result for a different user (someone signed out and another signed in)
  // does not count.
  return result.userId === userId && result.isAdmin;
}
