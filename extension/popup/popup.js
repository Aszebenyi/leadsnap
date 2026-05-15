// LeadSnap popup — ES module
import { getLeads } from '../utils/api.js';
import {
  getAuthToken,
  clearSession,
  setScanningEnabled,
  getSubscriptionStatus,
  getLastScanAt,
  getSelectedGroups,
  isOnboardingComplete,
  getRefreshToken,
  setSession,
  getScanMaxAgeHours,
  setScanMaxAgeHours,
} from '../utils/storage.js';
import { signIn, signUp } from '../utils/supabase-auth.js';

const DASHBOARD_URL = 'https://leadsnap-weld.vercel.app';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const viewLoading   = document.getElementById('view-loading');
const viewLoggedOut = document.getElementById('view-logged-out');
const viewLoggedIn  = document.getElementById('view-logged-in');

const userEmailEl    = document.getElementById('user-email');
const subBanner      = document.getElementById('sub-banner');
const statusDot      = document.getElementById('status-dot');
const statusTitle    = document.getElementById('status-title');
const statusSub      = document.getElementById('status-sub');
const toggleScanning = document.getElementById('toggle-scanning');
const scanNowBtn     = document.getElementById('btn-scan-now');
const statKeywords   = document.getElementById('stat-keywords');
const statGroups     = document.getElementById('stat-groups');
const statLastScan   = document.getElementById('stat-last-scan');
const leadsList      = document.getElementById('leads-list');

// ── Auth state ────────────────────────────────────────────────────────────────

let authMode = 'signin'; // 'signin' | 'signup'

// ── State ─────────────────────────────────────────────────────────────────────

let token          = null;
let keywordsCount  = 0;
let groupsCount    = 0;
let leadsLoaded    = false; // load once on first tab switch

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  showView('loading');
  token = await getAuthToken();

  if (!token) { showView('logged-out'); return; }

  // Redirect to onboarding if not yet complete
  const onboarded = await isOnboardingComplete();
  if (!onboarded) {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
    window.close();
    return;
  }

  // Show email from storage
  chrome.storage.sync.get('user_email', (d) => {
    if (d.user_email) userEmailEl.textContent = d.user_email;
  });

  showView('logged-in');

  // Load status tab data (default tab)
  await loadStatus();
}

// ── Views ─────────────────────────────────────────────────────────────────────

function showView(name) {
  viewLoading.classList.toggle('hidden',   name !== 'loading');
  viewLoggedOut.classList.toggle('hidden', name !== 'logged-out');
  viewLoggedIn.classList.toggle('hidden',  name !== 'logged-in');
}

// ── Tab switching ─────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');

    // Lazy-load leads on first open
    if (btn.dataset.tab === 'leads' && !leadsLoaded) {
      leadsLoaded = true;
      loadLeads();
    }
    // Populate settings values on switch
    if (btn.dataset.tab === 'settings') {
      loadSettings();
    }
  });
});

// ── Status tab ────────────────────────────────────────────────────────────────

async function loadStatus() {
  const [scanningEnabled, lastScanAt, { status: subStatus }, savedGroups, cachedKeywords] =
    await Promise.all([
      new Promise((r) => chrome.storage.sync.get('scanning_enabled', (d) => r(d.scanning_enabled !== false))),
      getLastScanAt(),
      getSubscriptionStatus(),
      getSelectedGroups(),
      new Promise((r) => chrome.storage.sync.get('keywords', (d) => r(d.keywords || []))),
    ]);

  keywordsCount = cachedKeywords.length;
  groupsCount   = savedGroups.length;

  toggleScanning.checked     = scanningEnabled;
  statKeywords.textContent   = keywordsCount || '0';
  statGroups.textContent     = groupsCount   || '0';
  statLastScan.textContent   = formatLastScan(lastScanAt);

  if (subStatus === 'inactive') {
    setStatusCard('error', 'Subscription expired', 'Scanning paused');
    subBanner.classList.remove('hidden');
    scanNowBtn.disabled = true;
    scanNowBtn.title    = 'Active subscription required to scan';
  } else if (!scanningEnabled) {
    setStatusCard('inactive', 'Monitoring paused', 'Toggle to resume');
    scanNowBtn.disabled = true;
    scanNowBtn.title    = 'Enable monitoring to scan';
  } else {
    setStatusCard('active', 'Monitoring active', 'Scanning every 10 minutes');
    scanNowBtn.disabled = false;
    scanNowBtn.title    = '';
  }
}

function setStatusCard(state, title, sub) {
  statusDot.className  = `status-dot ${state}`;
  statusTitle.textContent = title;
  statusSub.textContent   = sub;
}

function formatLastScan(ts) {
  if (!ts) return 'Never';
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Leads tab ─────────────────────────────────────────────────────────────────

function renderLeadSkeletons(count = 3) {
  return Array.from({ length: count }).map(() => `
    <div class="lead-skeleton">
      <div class="lead-skeleton-top">
        <div class="skeleton-line" style="width:55%;height:10px"></div>
        <div class="skeleton-line" style="width:18%;height:10px"></div>
      </div>
      <div class="lead-skeleton-lines">
        <div class="skeleton-line" style="width:100%;height:11px;margin-bottom:5px"></div>
        <div class="skeleton-line" style="width:78%;height:11px"></div>
      </div>
      <div class="lead-skeleton-kws">
        <div class="skeleton-line" style="width:52px;height:17px;border-radius:4px"></div>
        <div class="skeleton-line" style="width:66px;height:17px;border-radius:4px"></div>
      </div>
    </div>`).join('');
}

async function loadLeads() {
  leadsList.innerHTML = renderLeadSkeletons(3);

  try {
    const data = await getLeads(token, { limit: 5 });
    const leads = data?.leads ?? [];

    if (!leads.length) {
      leadsList.innerHTML = `
        <div class="leads-empty">
          <div class="leads-empty-icon">📭</div>
          No leads detected yet.<br>
          Make sure scanning is on and you have Facebook open.
        </div>`;
      return;
    }

    leadsList.innerHTML = leads.map(renderLeadCard).join('');

  } catch (err) {
    leadsList.innerHTML = `
      <div class="leads-empty">
        <div class="leads-empty-icon">⚠️</div>
        Could not load leads.<br>
        <span style="font-size:11px;color:#9ca3af">${escHtml(err.message)}</span>
      </div>`;
  }
}

function renderLeadCard(lead) {
  const score    = lead.score ?? null;
  const badgeClass = score === null ? '' : score >= 8 ? 'high' : score >= 5 ? 'medium' : 'low';
  const badgeLabel = score !== null ? score : '—';
  const preview  = (lead.post_text ?? '').trim();
  const kws      = (lead.matched_keywords ?? []).slice(0, 3);
  const timeAgo  = relativeTime(lead.detected_at ?? lead.created_at);
  const groupName = lead.group_name || 'Facebook Group';
  const fbUrl    = safeUrl(lead.post_url || '');

  return `
    <div class="lead-card">
      <div class="lead-card-top">
        <span class="lead-group">${escHtml(groupName)}</span>
        <span class="lead-time">${timeAgo}</span>
      </div>
      <div style="display:flex;gap:8px;align-items:flex-start">
        <div class="score-badge ${badgeClass}">${badgeLabel}</div>
        <p class="lead-preview" style="flex:1;min-width:0">${escHtml(preview)}</p>
      </div>
      <div class="lead-card-bottom">
        <div class="lead-kws">
          ${kws.map((k) => `<span class="lead-kw">${escHtml(k)}</span>`).join('')}
        </div>
        ${fbUrl
          ? `<a class="lead-fb-link" href="${escHtml(fbUrl)}" target="_blank" rel="noreferrer">View on Facebook ↗</a>`
          : ''}
      </div>
    </div>`;
}

function relativeTime(iso) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Settings tab ──────────────────────────────────────────────────────────────

const SCAN_AGE_LABELS = { 24: 'Last 24 hours', 168: 'Last 7 days', 720: 'Last 30 days' };

async function loadSettings() {
  const [savedGroups, cachedKeywords, phoneNumber, websiteUrl, includeWebsite, alertChannel, scanMaxAgeHours] =
    await Promise.all([
      new Promise((r) => chrome.storage.sync.get('selected_groups', (d) => r(d.selected_groups || []))),
      new Promise((r) => chrome.storage.sync.get('keywords',        (d) => r(d.keywords        || []))),
      new Promise((r) => chrome.storage.sync.get('phone_number',    (d) => r(d.phone_number    || ''))),
      new Promise((r) => chrome.storage.sync.get('website_url',     (d) => r(d.website_url     || ''))),
      new Promise((r) => chrome.storage.sync.get('include_website_in_replies', (d) => r(!!d.include_website_in_replies))),
      new Promise((r) => chrome.storage.sync.get('alert_channel',  (d) => r(d.alert_channel   || 'sms'))),
      getScanMaxAgeHours(),
    ]);

  document.getElementById('setting-keywords-val').textContent =
    cachedKeywords.length ? `${cachedKeywords.length} keyword${cachedKeywords.length !== 1 ? 's' : ''}` : 'None added';

  document.getElementById('setting-groups-val').textContent =
    savedGroups.length ? `${savedGroups.length} group${savedGroups.length !== 1 ? 's' : ''} selected` : 'None selected';

  document.getElementById('setting-phone-val').textContent =
    phoneNumber || 'No phone number';

  document.getElementById('setting-website-val').textContent =
    includeWebsite && websiteUrl
      ? `On · ${websiteUrl.replace(/^https?:\/\//, '')}`
      : includeWebsite ? 'On · no URL set' : 'Off';

  // Alert channel pills
  const channelVal = document.getElementById('setting-channel-val');
  channelVal.textContent = alertChannel === 'whatsapp' ? 'WhatsApp' : 'SMS';
  document.querySelectorAll('.channel-pill[data-channel]').forEach((pill) => {
    pill.classList.toggle('active', pill.dataset.channel === alertChannel);
  });

  // Scan window pills
  const ageVal = document.getElementById('setting-scan-age-val');
  ageVal.textContent = SCAN_AGE_LABELS[scanMaxAgeHours] ?? 'Last 24 hours';
  document.querySelectorAll('.channel-pill[data-age]').forEach((pill) => {
    pill.classList.toggle('active', Number(pill.dataset.age) === scanMaxAgeHours);
  });
}

// Scan window pill clicks
document.getElementById('scan-age-toggle-row').addEventListener('click', async (e) => {
  const pill = e.target.closest('.channel-pill[data-age]');
  if (!pill) return;
  const hours = Number(pill.dataset.age);
  await setScanMaxAgeHours(hours);
  document.getElementById('setting-scan-age-val').textContent = SCAN_AGE_LABELS[hours];
  document.querySelectorAll('.channel-pill[data-age]').forEach((p) => {
    p.classList.toggle('active', p === pill);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Returns the URL only if it uses http or https — prevents javascript: href injection. */
function safeUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? url : null;
  } catch {
    return null;
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────

// ── Auth helpers ──────────────────────────────────────────────────────────────

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  document.getElementById('auth-success').classList.add('hidden');
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-success');
  el.textContent = msg;
  el.classList.remove('hidden');
  document.getElementById('auth-error').classList.add('hidden');
}

function clearAuthMessages() {
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-success').classList.add('hidden');
}

function setAuthLoading(loading) {
  document.getElementById('btn-google').disabled     = loading;
  document.getElementById('btn-email-auth').disabled = loading;
  document.getElementById('btn-mode-toggle').disabled = loading;
}

async function handleAuthSuccess(session) {
  await setSession({
    accessToken:  session.access_token,
    refreshToken: session.refresh_token,
    userId:       session.user.id,
    userEmail:    session.user.email,
  });
  const onboarded = await isOnboardingComplete();
  if (!onboarded) {
    showAuthSuccess('Account ready! Starting setup…');
    setTimeout(() => {
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
      window.close();
    }, 700);
  } else {
    token = session.access_token;
    if (session.user?.email) userEmailEl.textContent = session.user.email;
    showView('logged-in');
    await loadStatus();
  }
}

// Google sign-in — delegated to the background service worker so the OAuth
// flow survives the popup closing when the Google window takes focus.
document.getElementById('btn-google').addEventListener('click', () => {
  clearAuthMessages();
  setAuthLoading(true);
  // Show a status note; the popup may close when Google's window opens.
  // Background will call chrome.action.openPopup() after sign-in completes.
  showAuthSuccess('Opening Google sign-in…');
  chrome.runtime.sendMessage({ type: 'GOOGLE_SIGN_IN' }, (response) => {
    // This callback only fires if the popup is still open (rare).
    setAuthLoading(false);
    if (response?.error) showAuthError(response.error);
  });
});

// Email / password sign-in or sign-up
document.getElementById('btn-email-auth').addEventListener('click', async () => {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  if (!email || !password) {
    showAuthError('Please enter your email and password.');
    return;
  }

  clearAuthMessages();
  setAuthLoading(true);

  try {
    const session = authMode === 'signup'
      ? await signUp(email, password)
      : await signIn(email, password);
    await handleAuthSuccess(session);
  } catch (err) {
    showAuthError(err.message || 'Sign-in failed. Please try again.');
  } finally {
    setAuthLoading(false);
  }
});

// Sign in ↔ sign up toggle
document.getElementById('btn-mode-toggle').addEventListener('click', () => {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  const isSignup = authMode === 'signup';
  document.getElementById('btn-email-auth').textContent  = isSignup ? 'Create Account' : 'Sign In';
  document.getElementById('auth-switch-text').textContent = isSignup ? 'Already have an account?' : "Don't have an account?";
  document.getElementById('btn-mode-toggle').textContent  = isSignup ? 'Sign in' : 'Sign up free';
  document.getElementById('auth-password').autocomplete   = isSignup ? 'new-password' : 'current-password';
  clearAuthMessages();
});

// ── Dashboard opener — passes auth tokens so the web app is logged in ─────────

async function openDashboardTab(path = '/dashboard') {
  const storedRefreshToken = await getRefreshToken();
  const accessToken        = token; // already in module scope

  if (accessToken && storedRefreshToken) {
    // Route through /auth/callback which calls supabase.auth.setSession()
    // directly, avoiding the race condition between detectSessionInUrl and
    // PrivateRoute that would otherwise redirect the user to /login.
    const hash = `#access_token=${accessToken}&refresh_token=${encodeURIComponent(storedRefreshToken)}&token_type=bearer`;
    chrome.tabs.create({ url: `${DASHBOARD_URL}/auth/callback${hash}` });
  } else {
    chrome.tabs.create({ url: `${DASHBOARD_URL}${path}` });
  }
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  await clearSession();
  showView('logged-out');
});

document.getElementById('btn-upgrade').addEventListener('click', () =>
  openDashboardTab('/billing')
);

document.getElementById('btn-scan-now').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LEADSNAP_MANUAL_SCAN' });
  window.close(); // monitor window takes over
});

document.getElementById('btn-view-leads').addEventListener('click', () =>
  openDashboardTab('/dashboard')
);

document.getElementById('btn-all-leads').addEventListener('click', () =>
  openDashboardTab('/dashboard')
);

document.getElementById('btn-open-dashboard').addEventListener('click', () =>
  openDashboardTab('/dashboard')
);

document.getElementById('btn-rerun-setup').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  window.close();
});

// Settings → open dashboard (auth hash + settings path)
document.getElementById('btn-manage-kw').addEventListener('click', () =>
  openDashboardTab('/settings')
);
document.getElementById('btn-manage-groups').addEventListener('click', () =>
  openDashboardTab('/settings')
);
document.getElementById('btn-edit-phone').addEventListener('click', () =>
  openDashboardTab('/settings')
);

// Alert channel pills — toggle SMS ↔ WhatsApp and persist immediately
document.querySelectorAll('.channel-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    const ch = pill.dataset.channel;
    chrome.storage.sync.set({ alert_channel: ch });
    document.querySelectorAll('.channel-pill').forEach((p) =>
      p.classList.toggle('active', p.dataset.channel === ch)
    );
    document.getElementById('setting-channel-val').textContent =
      ch === 'whatsapp' ? 'WhatsApp' : 'SMS';
  });
});
document.getElementById('btn-edit-website').addEventListener('click', () =>
  openDashboardTab('/settings')
);

toggleScanning.addEventListener('change', (e) => {
  setScanningEnabled(e.target.checked);
  if (e.target.checked) {
    setStatusCard('active', 'Monitoring active', 'Scanning every 10 minutes');
    scanNowBtn.disabled = false;
    scanNowBtn.title    = '';
  } else {
    setStatusCard('inactive', 'Monitoring paused', 'Toggle to resume');
    scanNowBtn.disabled = true;
    scanNowBtn.title    = 'Enable monitoring to scan';
  }
});

// ── Go ────────────────────────────────────────────────────────────────────────
init();
