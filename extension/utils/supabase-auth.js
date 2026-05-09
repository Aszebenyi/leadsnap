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
 * Sign in with Google via Supabase OAuth using PKCE + chrome.identity.
 *
 * Prerequisites (one-time setup):
 *   • Supabase dashboard → Auth → URL Configuration → Redirect URLs →
 *     add the URL returned by chrome.identity.getRedirectURL()
 *   • Google Cloud Console → OAuth 2.0 → Authorized redirect URIs →
 *     add the same URL (Supabase may handle this automatically)
 *
 * Returns { access_token, refresh_token, user }
 */
export async function signInWithGoogle() {
  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const redirectUri   = chrome.identity.getRedirectURL();

  const authUrl = `${AUTH_URL}/authorize?` + new URLSearchParams({
    provider:              'google',
    redirect_to:           redirectUri,
    code_challenge:        codeChallenge,
    code_challenge_method: 's256',
    scopes:                'email profile',
  }).toString();

  // Open the Google sign-in popup via Chrome's identity API
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

  // Extract the one-time auth code from the redirect URL
  const code = new URL(callbackUrl).searchParams.get('code');
  if (!code) throw new Error('No auth code returned — please try again.');

  // Exchange the code + verifier for Supabase session tokens
  const res = await fetch(`${AUTH_URL}/token?grant_type=pkce`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'OAuth token exchange failed.');
  return data; // { access_token, refresh_token, user }
}
