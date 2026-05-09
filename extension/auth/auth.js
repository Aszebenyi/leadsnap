import { signIn, signUp } from '../utils/supabase-auth.js';

const MODES = { SIGN_IN: 'signin', SIGN_UP: 'signup' };

let mode = MODES.SIGN_IN;

const form       = document.getElementById('auth-form');
const submitBtn  = document.getElementById('submit-btn');
const errorMsg   = document.getElementById('error-msg');
const successMsg = document.getElementById('success-msg');
const tabSignIn  = document.getElementById('tab-signin');
const tabSignUp  = document.getElementById('tab-signup');

// ── Tab switching ─────────────────────────────────────────────────────────────

tabSignIn.addEventListener('click', () => setMode(MODES.SIGN_IN));
tabSignUp.addEventListener('click', () => setMode(MODES.SIGN_UP));

function setMode(m) {
  mode = m;
  tabSignIn.classList.toggle('active', m === MODES.SIGN_IN);
  tabSignUp.classList.toggle('active', m === MODES.SIGN_UP);
  submitBtn.textContent = m === MODES.SIGN_IN ? 'Sign In' : 'Create Account';
  hideMessages();
}

// ── Form submission ───────────────────────────────────────────────────────────

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessages();

  const email    = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  setLoading(true);

  try {
    let result;

    if (mode === MODES.SIGN_IN) {
      result = await signIn(email, password);
    } else {
      result = await signUp(email, password);

      // Supabase returns no session if email confirmation is required
      if (!result.access_token) {
        showSuccess('Account created! Check your email to confirm before signing in.');
        setLoading(false);
        return;
      }
    }

    await storeSession(result);

    // If first time, open onboarding wizard; otherwise close
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
      setTimeout(() => window.close(), 1500);
    }

  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
  }
});

// ── Session storage ───────────────────────────────────────────────────────────

async function storeSession({ access_token, refresh_token, user }) {
  // access_token is short-lived (1h) — safe to sync across devices for convenience
  await chrome.storage.sync.set({
    auth_token: access_token,
    user_id:    user.id,
    user_email: user.email,
  });
  // refresh_token is long-lived — store device-local only to limit exposure
  await chrome.storage.local.set({ refresh_token });
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function setLoading(loading) {
  submitBtn.disabled = loading;
  submitBtn.textContent = loading
    ? 'Please wait…'
    : mode === MODES.SIGN_IN ? 'Sign In' : 'Create Account';
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

function showSuccess(msg) {
  successMsg.textContent = msg;
  successMsg.style.display = 'block';
}

function hideMessages() {
  errorMsg.style.display   = 'none';
  successMsg.style.display = 'none';
}
