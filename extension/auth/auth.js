// LeadSnap extension auth — Google OAuth only
import { signInWithGoogle } from '../utils/supabase-auth.js';
import { GOOGLE_CLIENT_ID } from '../utils/config.js';

const btnGoogle  = document.getElementById('btn-google');
const errorMsg   = document.getElementById('error-msg');
const successMsg = document.getElementById('success-msg');

// ── Google sign-in ────────────────────────────────────────────────────────────

btnGoogle.addEventListener('click', async () => {
  setLoading(true);
  hideMessages();

  try {
    const session = await signInWithGoogle(GOOGLE_CLIENT_ID);
    await storeSession(session);

    const complete = await new Promise((r) =>
      chrome.storage.sync.get('onboarding_complete', (d) => r(!!d.onboarding_complete))
    );

    if (!complete) {
      showSuccess('Account ready! Starting setup…');
      setTimeout(() => {
        chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
        window.close();
      }, 800);
    } else {
      showSuccess('Signed in! You can close this tab.');
      setTimeout(() => window.close(), 1200);
    }
  } catch (err) {
    showError(err.message || 'Sign-in failed. Please try again.');
  } finally {
    setLoading(false);
  }
});

// ── Session storage ───────────────────────────────────────────────────────────

async function storeSession({ access_token, refresh_token, user }) {
  await chrome.storage.sync.set({
    auth_token: access_token,
    user_id:    user.id,
    user_email: user.email,
  });
  await chrome.storage.local.set({ refresh_token });
}

// ── UI helpers ────────────────────────────────────────────────────────────────

const GOOGLE_SVG = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
  <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332Z" fill="#FBBC05"/>
  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
</svg>`;

const SPINNER_HTML = `<div class="spinner"></div>`;

function setLoading(loading) {
  btnGoogle.disabled  = loading;
  btnGoogle.innerHTML = loading
    ? `${SPINNER_HTML} Signing in…`
    : `${GOOGLE_SVG} Continue with Google`;
}

function showError(msg) {
  errorMsg.textContent   = msg;
  errorMsg.style.display = 'block';
}

function showSuccess(msg) {
  successMsg.textContent   = msg;
  successMsg.style.display = 'block';
}

function hideMessages() {
  errorMsg.style.display   = 'none';
  successMsg.style.display = 'none';
}
