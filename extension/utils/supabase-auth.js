// Lightweight Supabase Auth REST wrapper — no SDK needed.
import { SUPABASE_URL, SUPABASE_ANON_KEY, API_URL } from './config.js';

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

// ── Google OAuth (PKCE) ───────────────────────────────────────────────────────

/** Generate a cryptographically random PKCE code verifier (base64url, 43-128 chars). */
function generateCodeVerifier() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Derive the PKCE code challenge (SHA-256 of verifier, base64url encoded). */
async function generateCodeChallenge(verifier) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier)
  );
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Sign in with Google via PKCE + chrome.identity, then exchange into a Supabase session.
 *
 * Why we bypass Supabase's /authorize proxy:
 *   Supabase's proxy sets redirect_uri to its own server-side callback URL. When a
 *   custom client_id is supplied, Google validates that callback URL against the URIs
 *   registered for that client — they don't match, causing redirect_uri_mismatch.
 *   Going directly to Google lets us use chrome.identity.getRedirectURL() as the
 *   redirect_uri, which IS registered for the Chrome extension OAuth client.
 *
 * Flow:
 *   1. Google PKCE auth code → chrome.identity.launchWebAuthFlow
 *   2. Exchange code + verifier with Google → { id_token, access_token }
 *   3. Exchange id_token with Supabase grant_type=id_token → Supabase session
 *
 * Prerequisites (one-time setup in Google Cloud Console):
 *   • OAuth client type: Web application (or Chrome App)
 *   • Authorized redirect URIs: add chrome.identity.getRedirectURL() value
 *     (logged to console on first sign-in attempt so you can copy it)
 *
 * Returns { access_token, refresh_token, user }
 */
export async function signInWithGoogle(clientId) {
  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const redirectUri   = chrome.identity.getRedirectURL();

  // Step 1 — build the Google OAuth URL directly, using the chromiumapp redirect URI
  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id:             clientId,
    redirect_uri:          redirectUri,
    response_type:         'code',
    scope:                 'openid email profile',
    code_challenge:        codeChallenge,
    code_challenge_method: 'S256',
    access_type:           'offline',
    prompt:                'select_account',
  }).toString();

  const callbackUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!responseUrl) {
        reject(new Error('Sign-in was cancelled.'));
      } else {
        resolve(responseUrl);
      }
    });
  });

  const code = new URL(callbackUrl).searchParams.get('code');
  if (!code) throw new Error('No auth code returned — please try again.');

  // Step 2 — send the code + PKCE verifier to our backend, which holds the
  // Google client_secret and completes the exchange server-side, then signs
  // the user into Supabase and returns the session.
  const res = await fetch(`${API_URL}/api/auth/google-exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Sign-in failed — please try again.');
  return data; // { access_token, refresh_token, user }
}
