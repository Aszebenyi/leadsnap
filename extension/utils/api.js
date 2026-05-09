// All fetch calls to the LeadSnap backend API

const API_URL = 'https://leadsnap-backend-production.up.railway.app';

async function request(path, options = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`);
    err.statusCode = res.status;
    err.code = body.code || null;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export function checkHealth() {
  return request('/health');
}

// ── Profile ──────────────────────────────────────────────────────────────────

export function getProfile(token) {
  return request('/api/profile', {}, token);
}

export function updateProfile(token, updates) {
  return request('/api/profile', { method: 'PUT', body: JSON.stringify(updates) }, token);
}

// ── Keywords ─────────────────────────────────────────────────────────────────

export function getKeywords(token) {
  return request('/api/keywords', {}, token);
}

export function addKeyword(token, keyword) {
  return request('/api/keywords', { method: 'POST', body: JSON.stringify({ keyword }) }, token);
}

export function deleteKeyword(token, id) {
  return request(`/api/keywords/${id}`, { method: 'DELETE' }, token);
}

// ── Groups ───────────────────────────────────────────────────────────────────

export function getGroups(token) {
  return request('/api/groups', {}, token);
}

export function addGroup(token, facebook_group_url, group_name) {
  return request('/api/groups', { method: 'POST', body: JSON.stringify({ facebook_group_url, group_name }) }, token);
}

export function deleteGroup(token, id) {
  return request(`/api/groups/${id}`, { method: 'DELETE' }, token);
}

// ── Leads ────────────────────────────────────────────────────────────────────

export function ingestLead(token, payload) {
  return request('/api/leads/ingest', { method: 'POST', body: JSON.stringify(payload) }, token);
}

export function getLeads(token, { status, limit = 20, offset = 0 } = {}) {
  const params = new URLSearchParams({ limit, offset });
  if (status) params.set('status', status);
  return request(`/api/leads?${params}`, {}, token);
}

export function updateLeadStatus(token, id, status) {
  return request(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }, token);
}

// ── Billing ──────────────────────────────────────────────────────────────────

export function createCheckout(token) {
  return request('/api/billing/checkout', { method: 'POST' }, token);
}

export function createPortal(token) {
  return request('/api/billing/portal', { method: 'POST' }, token);
}
