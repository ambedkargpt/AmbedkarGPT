import client from './client';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// GET /admin/me — { is_admin, tracking_enabled } for the signed-in user.
export async function getAdminStatus() {
  const { data } = await client.get('/admin/me');
  return data;
}

// GET /admin/errors — { summary, overview, errors }. `hours` is 24 or 168.
export async function getErrors({ status, source, hours = 24 } = {}) {
  const params = { hours };
  if (status) params.status = status;
  if (source) params.source = source;
  const { data } = await client.get('/admin/errors', { params });
  return data;
}

// GET /admin/errors/:id — one issue in depth: insight, timeline, occurrences.
export async function getError(id, hours = 168) {
  const { data } = await client.get(`/admin/errors/${id}`, { params: { hours } });
  return data;
}

// POST /admin/errors/:id/status — 'open' or 'resolved'.
export async function setErrorStatus(id, status) {
  const { data } = await client.post(`/admin/errors/${id}/status`, { status });
  return data;
}

/**
 * POST /errors/report — send one browser error to the backend.
 *
 * Plain fetch instead of the axios client on purpose: the client's 401
 * handling can redirect to /login, and a report must never move the user
 * anywhere. `keepalive` lets the request finish even if the page is closing.
 * Failures are ignored; reporting an error must not cause another one.
 */
export function sendErrorReport(report) {
  return fetch(`${BASE_URL}/errors/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    keepalive: true,
  }).catch(() => {});
}
