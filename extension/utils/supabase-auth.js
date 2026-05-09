// Lightweight Supabase Auth REST wrapper — no SDK needed.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const AUTH_URL = `${SUPABASE_URL}/auth/v1`;

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
};

async function authRequest(path, body) {
  const res = await fetch(`${AUTH_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || 'Auth request failed');
  }
  return data;
}

/**
 * Sign in with email + password.
 * Returns { access_token, refresh_token, user }
 */
export async function signIn(email, password) {
  return authRequest('/token?grant_type=password', { email, password });
}

/**
 * Sign up with email + password.
 * Returns { access_token, refresh_token, user }
 */
export async function signUp(email, password) {
  return authRequest('/signup', { email, password });
}

/**
 * Refresh an expired access token using the refresh token.
 * Returns { access_token, refresh_token, user }
 */
export async function refreshToken(tokenString) {
  return authRequest('/token?grant_type=refresh_token', { refresh_token: tokenString });
}

/**
 * Get the currently authenticated user from a valid access token.
 */
export async function getUser(access_token) {
  const res = await fetch(`${AUTH_URL}/user`, {
    headers: { ...headers, Authorization: `Bearer ${access_token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Failed to get user');
  return data;
}
