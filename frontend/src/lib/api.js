import supabase from './supabase';

const API_URL = import.meta.env.VITE_API_URL;

async function request(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(body.error || `Request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return body;
}

// ── Leads ─────────────────────────────────────────────────────────────────────

export function getLeads(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString();
  return request(`/api/leads${qs ? `?${qs}` : ''}`);
}

export function getLeadStats() {
  return request('/api/leads/stats');
}

export function updateLeadStatus(id, status) {
  return request(`/api/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ── Keywords ──────────────────────────────────────────────────────────────────

export function getKeywords() {
  return request('/api/keywords');
}

export function addKeyword(keyword) {
  return request('/api/keywords', {
    method: 'POST',
    body: JSON.stringify({ keyword }),
  });
}

export function deleteKeyword(id) {
  return request(`/api/keywords/${id}`, { method: 'DELETE' });
}

// ── Groups ────────────────────────────────────────────────────────────────────

export function getGroups() {
  return request('/api/groups');
}

export function addGroup(facebook_group_url, group_name) {
  return request('/api/groups', {
    method: 'POST',
    body: JSON.stringify({ facebook_group_url, group_name }),
  });
}

export function deleteGroup(id) {
  return request(`/api/groups/${id}`, { method: 'DELETE' });
}

// ── Profile ───────────────────────────────────────────────────────────────────

export function getProfile() {
  return request('/api/profile');
}

export function updateProfile(data) {
  return request('/api/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteAccount() {
  return request('/api/profile', { method: 'DELETE' });
}

export async function exportLeads() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${API_URL}/api/leads/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Export failed: ${res.status}`);
  }

  return res.blob();
}

// ── Billing ───────────────────────────────────────────────────────────────────

export function getBillingStatus() {
  return request('/api/billing/status');
}

export function createCheckoutSession(success_url, cancel_url) {
  return request('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ success_url, cancel_url }),
  });
}

export function createPortalSession(return_url) {
  return request('/api/billing/portal', {
    method: 'POST',
    body: JSON.stringify({ return_url }),
  });
}
