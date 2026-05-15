// LeadSnap popup — ES module
import {
  getLeads,
  getProfile,
  updateProfile,
  getKeywords,
  addKeyword,
  deleteKeyword,
  getGroups,
  deleteGroup,
  getBillingStatus,
  createPortal,
  sendTestAlert,
  deleteProfile as apiDeleteProfile,
} from '../utils/api.js';
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
  getScanState,
  setScanState,
  getLeadsFoundToday,
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
const leadsList      = document.getElementById('leads-list');

// ── Auth state ────────────────────────────────────────────────────────────────

let authMode = 'signin'; // 'signin' | 'signup'

// ── State ─────────────────────────────────────────────────────────────────────

let token          = null;
let keywordsCount  = 0;
let groupsCount    = 0;
let leadsLoaded    = false; // load once on first tab switch
let countdownInterval = null;

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

  // Start listening for scan state changes
  startScanStateListener();

  // Read initial scan state; guard against stale 'scanning' (SW may have died)
  const initialState = await getScanState();
  if (initialState.status === 'scanning' && Date.now() - initialState.started_at > 5 * 60 * 1000) {
    await setScanState({ status: 'idle' });
    renderIdleState();
  } else {
    renderScanState(initialState);
  }
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
  const [scanningEnabled, { status: subStatus }, savedGroups, cachedKeywords] =
    await Promise.all([
      new Promise((r) => chrome.storage.sync.get('scanning_enabled', (d) => r(d.scanning_enabled !== false))),
      getSubscriptionStatus(),
      getSelectedGroups(),
      new Promise((r) => chrome.storage.sync.get('keywords', (d) => r(d.keywords || []))),
    ]);

  keywordsCount = cachedKeywords.length;
  groupsCount   = savedGroups.length;

  toggleScanning.checked = scanningEnabled;

  if (subStatus === 'inactive') {
    setStatusCard('error', 'Subscription expired', 'Scanning paused');
    subBanner.classList.remove('hidden');
  } else if (!scanningEnabled) {
    setStatusCard('inactive', 'Monitoring paused', 'Toggle to resume');
  } else {
    setStatusCard('active', 'Monitoring active', 'Scanning every 10 minutes');
  }
}

function setStatusCard(state, title, sub) {
  statusDot.className     = `status-dot ${state}`;
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

// ── Scan state ────────────────────────────────────────────────────────────────

function startScanStateListener() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.scan_state) {
      renderScanState(changes.scan_state.newValue);
    }
  });
}

function renderScanState(state) {
  if (!state) { renderIdleState(); return; }

  switch (state.status) {
    case 'idle':
      renderIdleState();
      break;

    case 'opening-facebook':
      renderScanStatusRoot(`
        <div class="scan-progress-card" style="margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px">
            <div class="scan-spinner"></div>
            <div>
              <div style="font-size:13px;font-weight:600;color:var(--ink)">Opening Facebook…</div>
              <div style="font-size:11px;color:var(--ink-4);margin-top:2px">Loading your group, one moment</div>
            </div>
          </div>
        </div>
      `);
      break;

    case 'scanning': {
      const prog  = state.progress;
      const pct   = prog && prog.total > 0 ? Math.round((prog.current / prog.total) * 100) : 0;
      const label = prog ? `Group ${prog.current} of ${prog.total}` : 'Starting…';
      const name  = prog?.group_name ? escHtml(prog.group_name) : '';
      renderScanStatusRoot(`
        <div class="scan-progress-card" style="margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div class="scan-spinner"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--ink)">Scanning…</div>
              <div style="font-size:11px;color:var(--ink-4);margin-top:1px">${label}</div>
            </div>
            <button class="btn-cancel-scan" id="btn-cancel-scan-inline">Cancel</button>
          </div>
          <div class="scan-progress-bar-wrap">
            <div class="scan-progress-bar-fill" style="width:${pct}%"></div>
          </div>
          ${name ? `<div class="stat-kw-group" style="margin-top:6px">${name}</div>` : ''}
        </div>
      `);
      document.getElementById('btn-cancel-scan-inline')?.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'SCAN_CANCEL' });
      });
      break;
    }

    case 'complete': {
      if (state.completed_at && Date.now() - state.completed_at > 8000) {
        renderIdleState();
        return;
      }
      const r = state.result || {};
      const found    = r.found ?? 0;
      const scanned  = r.groups_scanned ?? 0;
      const checked  = r.posts_checked ?? 0;
      renderScanStatusRoot(`
        <div class="scan-complete-card" style="margin-bottom:12px">
          <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:4px">
            ✓ Scan complete
          </div>
          <div style="font-size:12px;color:var(--ink-3)">
            ${found} lead${found !== 1 ? 's' : ''} found · ${checked} posts checked · ${scanned} group${scanned !== 1 ? 's' : ''}
          </div>
        </div>
      `);
      setTimeout(() => renderIdleState(), 8000);
      break;
    }

    case 'blocked': {
      const msg = escHtml(state.blocked_message || 'Scan could not start.');
      const isFbLogin = state.blocked_reason === 'not-logged-into-facebook';
      renderScanStatusRoot(`
        <div class="scan-blocked-card" style="margin-bottom:12px">
          <div style="font-size:13px;font-weight:600;color:var(--amber);margin-bottom:4px">
            ⚠ Scan blocked
          </div>
          <div style="font-size:12px;color:var(--ink-3);margin-bottom:8px">${msg}</div>
          ${isFbLogin
            ? `<button class="btn btn-primary" style="font-size:12px;padding:6px 14px" id="btn-open-fb">Open Facebook</button>`
            : `<button class="btn-cancel-scan" id="btn-dismiss-blocked">Dismiss</button>`
          }
        </div>
      `);
      document.getElementById('btn-open-fb')?.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://www.facebook.com' });
      });
      document.getElementById('btn-dismiss-blocked')?.addEventListener('click', async () => {
        await setScanState({ status: 'idle' });
        renderIdleState();
      });
      break;
    }

    default:
      renderIdleState();
  }
}

function renderScanStatusRoot(html) {
  const root = document.getElementById('scan-status-root');
  if (root) root.innerHTML = html;
}

async function renderIdleState() {
  const [lastScanAt, leadsToday] = await Promise.all([
    getLastScanAt(),
    getLeadsFoundToday(),
  ]);

  const todayStr   = new Date().toISOString().slice(0, 10);
  const leadsCount = leadsToday?.date === todayStr ? (leadsToday.count ?? 0) : 0;

  renderScanStatusRoot(`
    <div class="stat-row" style="margin-bottom:12px">
      <div class="stat">
        <div class="stat-value">${escHtml(formatLastScan(lastScanAt))}</div>
        <div class="stat-label">Last scan</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <div class="stat-value" id="stat-next-scan">—</div>
        <div class="stat-label">Next scan</div>
      </div>
      <div class="stat-divider"></div>
      <div class="stat">
        <div class="stat-value">${leadsCount}</div>
        <div class="stat-label">Leads today</div>
      </div>
    </div>
    <div class="stat-kw-group" style="margin-bottom:12px">
      Groups: ${groupsCount} · Keywords: ${keywordsCount}
    </div>
  `);

  startNextScanCountdown();
}

function startNextScanCountdown() {
  clearInterval(countdownInterval);
  function update() {
    const el = document.getElementById('stat-next-scan');
    if (!el) { clearInterval(countdownInterval); return; }
    chrome.alarms.get('leadsnap-scan', (alarm) => {
      if (!alarm) { el.textContent = '—'; return; }
      const ms = alarm.scheduledTime - Date.now();
      el.textContent = ms <= 0 ? 'soon' : `in ${Math.ceil(ms / 60000)}m`;
    });
  }
  update();
  countdownInterval = setInterval(update, 15000);
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

// State for inline managers
let kwManagerOpen  = false;
let loadedKeywords = [];
let groupsMgrOpen  = false;
let loadedGroups   = [];

async function loadSettings() {
  if (!token) return;
  try {
    const [profile, storedWebsite, storedInclude, storedChannel] = await Promise.all([
      getProfile(token),
      new Promise((r) => chrome.storage.sync.get('website_url', (d) => r(d.website_url || ''))),
      new Promise((r) => chrome.storage.sync.get('include_website_in_replies', (d) => r(!!d.include_website_in_replies))),
      new Promise((r) => chrome.storage.sync.get('alert_channel', (d) => r(d.alert_channel || 'sms'))),
    ]);

    // Business Profile
    document.getElementById('sfield-biz-name').value  = profile.business_name        || '';
    document.getElementById('sfield-desc').value      = profile.service_description  || '';
    document.getElementById('sfield-website').value   = storedWebsite;
    document.getElementById('sfield-include-website').checked = storedInclude;

    // Alerts
    document.getElementById('sfield-phone').value = profile.phone_number || '';
    document.querySelectorAll('#alert-channel-pills .channel-pill').forEach((p) => {
      p.classList.toggle('active', p.dataset.channel === storedChannel);
    });
  } catch (err) {
    console.warn('[LeadSnap] loadSettings profile error:', err);
  }

  // Counts (non-blocking)
  updateKeywordsCount();
  updateGroupsCount();

  // Account section (non-blocking)
  loadAccountSection();
}

async function updateKeywordsCount() {
  try {
    const data = await getKeywords(token);
    loadedKeywords = data?.keywords ?? (Array.isArray(data) ? data : []);
    document.getElementById('setting-keywords-val').textContent =
      loadedKeywords.length
        ? `${loadedKeywords.length} keyword${loadedKeywords.length !== 1 ? 's' : ''}`
        : 'None added';
  } catch { /* silent */ }
}

async function updateGroupsCount() {
  try {
    const data = await getGroups(token);
    loadedGroups = data?.groups ?? (Array.isArray(data) ? data : []);
    document.getElementById('setting-groups-val').textContent =
      loadedGroups.length
        ? `${loadedGroups.length} group${loadedGroups.length !== 1 ? 's' : ''} selected`
        : 'None selected';
  } catch { /* silent */ }
}

async function loadAccountSection() {
  const loadingEl = document.getElementById('account-loading');
  const contentEl = document.getElementById('account-content');
  try {
    const billing = await getBillingStatus(token);
    loadingEl.style.display = 'none';
    contentEl.classList.remove('hidden');

    const badge      = document.getElementById('sub-status-badge');
    const upgradeBtn = document.getElementById('btn-upgrade-settings');
    const portalBtn  = document.getElementById('btn-billing-portal');

    if (!billing || billing.status === 'trial') {
      const trialEnd  = billing?.trial_ends_at ? new Date(billing.trial_ends_at) : null;
      const daysLeft  = trialEnd ? Math.max(0, Math.ceil((trialEnd - Date.now()) / 86_400_000)) : 7;
      badge.textContent = `Trial · ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`;
      badge.className   = 'sub-badge sub-badge-trial';
      upgradeBtn.classList.remove('hidden');
      portalBtn.classList.add('hidden');
    } else if (billing.status === 'active') {
      badge.textContent = 'Pro · Active';
      badge.className   = 'sub-badge sub-badge-pro';
      upgradeBtn.classList.add('hidden');
      portalBtn.classList.remove('hidden');
    } else {
      badge.textContent = 'Subscription expired';
      badge.className   = 'sub-badge sub-badge-expired';
      upgradeBtn.classList.remove('hidden');
      portalBtn.classList.add('hidden');
    }
  } catch {
    if (loadingEl) loadingEl.style.display = 'none';
    if (contentEl) {
      contentEl.classList.remove('hidden');
      document.getElementById('sub-status-badge').textContent = 'Unable to load';
      document.getElementById('sub-status-badge').className   = 'sub-badge';
    }
  }
}

function showFeedback(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.className   = `sform-feedback sform-feedback-${type}`;
  el.classList.remove('hidden');
  if (type === 'success') setTimeout(() => el.classList.add('hidden'), 3000);
}

function friendlyError(err) {
  const msg = err?.message || '';
  if (/network|fetch|failed to fetch/i.test(msg))                    return 'Connection error. Check your internet.';
  if (/401|unauthorized/i.test(msg) || err?.statusCode === 401)       return 'Session expired. Please sign in again.';
  if (/403|forbidden/i.test(msg)    || err?.statusCode === 403)       return 'Access denied.';
  if (/subscription/i.test(msg))                                      return 'An active subscription is required.';
  if (msg.length > 0 && msg.length < 120)                             return msg;
  return 'Something went wrong. Please try again.';
}

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

// ── Settings event listeners ──────────────────────────────────────────────────

// Save Business Profile
document.getElementById('btn-save-profile').addEventListener('click', async () => {
  const fb         = document.getElementById('profile-feedback');
  const btn        = document.getElementById('btn-save-profile');
  const bizName    = document.getElementById('sfield-biz-name').value.trim();
  const desc       = document.getElementById('sfield-desc').value.trim();
  const website    = document.getElementById('sfield-website').value.trim();
  const includeWeb = document.getElementById('sfield-include-website').checked;

  btn.disabled = true;
  try {
    const updates = {};
    if (bizName !== undefined) updates.business_name        = bizName;
    if (desc    !== undefined) updates.service_description  = desc;
    if (Object.keys(updates).length) await updateProfile(token, updates);
    await chrome.storage.sync.set({ website_url: website, include_website_in_replies: includeWeb });
    if (desc) await chrome.storage.sync.set({ ai_description: desc });
    showFeedback(fb, '✓ Profile saved', 'success');
  } catch (err) {
    showFeedback(fb, friendlyError(err), 'error');
  } finally {
    btn.disabled = false;
  }
});

// Save Alerts
document.getElementById('btn-save-alerts').addEventListener('click', async () => {
  const fb      = document.getElementById('alerts-feedback');
  const btn     = document.getElementById('btn-save-alerts');
  const phone   = document.getElementById('sfield-phone').value.trim();
  const channel = document.querySelector('#alert-channel-pills .channel-pill.active')?.dataset.channel || 'sms';

  btn.disabled = true;
  try {
    await updateProfile(token, { phone_number: phone });
    await chrome.storage.sync.set({ alert_channel: channel, phone_number: phone });
    showFeedback(fb, '✓ Alerts saved', 'success');
  } catch (err) {
    showFeedback(fb, friendlyError(err), 'error');
  } finally {
    btn.disabled = false;
  }
});

// Send test alert
document.getElementById('btn-test-alert').addEventListener('click', async () => {
  const fb      = document.getElementById('alerts-feedback');
  const btn     = document.getElementById('btn-test-alert');
  const channel = document.querySelector('#alert-channel-pills .channel-pill.active')?.dataset.channel || 'sms';

  btn.disabled    = true;
  btn.textContent = 'Sending…';
  try {
    await sendTestAlert(token, channel);
    showFeedback(fb, '✓ Test alert sent! Check your phone.', 'success');
  } catch (err) {
    showFeedback(fb, friendlyError(err), 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Send test alert';
  }
});

// Alert channel pills
document.getElementById('alert-channel-pills').addEventListener('click', (e) => {
  const pill = e.target.closest('.channel-pill[data-channel]');
  if (!pill) return;
  document.querySelectorAll('#alert-channel-pills .channel-pill').forEach((p) =>
    p.classList.toggle('active', p === pill)
  );
});

// Keywords manager toggle
document.getElementById('btn-manage-kw').addEventListener('click', async () => {
  kwManagerOpen = !kwManagerOpen;
  document.getElementById('kw-manager').classList.toggle('hidden', !kwManagerOpen);
  document.getElementById('btn-manage-kw').textContent = kwManagerOpen ? 'Close ✕' : 'Manage →';
  if (kwManagerOpen) await renderKwChips();
});

async function renderKwChips() {
  if (!token) return;
  const chipsEl = document.getElementById('kw-chips');
  const fb      = document.getElementById('kw-feedback');
  fb.classList.add('hidden');
  try {
    const data     = await getKeywords(token);
    loadedKeywords = data?.keywords ?? (Array.isArray(data) ? data : []);

    if (!loadedKeywords.length) {
      chipsEl.innerHTML = '<div class="kw-empty">No keywords yet — add one above</div>';
    } else {
      chipsEl.innerHTML = loadedKeywords.map((kw) => `
        <div class="kw-chip">
          <span>${escHtml(kw.keyword)}</span>
          <button class="kw-chip-remove" data-id="${escHtml(kw.id)}" title="Remove">×</button>
        </div>`).join('');
      chipsEl.querySelectorAll('.kw-chip-remove').forEach((btn) => {
        btn.addEventListener('click', () => handleRemoveKeyword(btn.dataset.id));
      });
    }
    // Sync count label
    document.getElementById('setting-keywords-val').textContent =
      loadedKeywords.length
        ? `${loadedKeywords.length} keyword${loadedKeywords.length !== 1 ? 's' : ''}`
        : 'None added';
  } catch (err) {
    showFeedback(fb, friendlyError(err), 'error');
  }
}

document.getElementById('btn-kw-add').addEventListener('click', handleAddKeyword);
document.getElementById('kw-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleAddKeyword();
});

async function handleAddKeyword() {
  const input = document.getElementById('kw-input');
  const fb    = document.getElementById('kw-feedback');
  const kw    = input.value.trim();
  if (!kw) return;
  fb.classList.add('hidden');
  try {
    await addKeyword(token, kw);
    input.value = '';
    await renderKwChips();
  } catch (err) {
    showFeedback(fb, friendlyError(err), 'error');
  }
}

async function handleRemoveKeyword(id) {
  const fb = document.getElementById('kw-feedback');
  try {
    await deleteKeyword(token, id);
    await renderKwChips();
  } catch (err) {
    showFeedback(fb, friendlyError(err), 'error');
  }
}

// Groups manager toggle
document.getElementById('btn-manage-groups').addEventListener('click', async () => {
  groupsMgrOpen = !groupsMgrOpen;
  document.getElementById('groups-manager').classList.toggle('hidden', !groupsMgrOpen);
  document.getElementById('btn-manage-groups').textContent = groupsMgrOpen ? 'Close ✕' : 'Manage →';
  if (groupsMgrOpen) await renderGroupsList();
});

async function renderGroupsList() {
  if (!token) return;
  const listEl = document.getElementById('groups-list-inline');
  try {
    const data   = await getGroups(token);
    loadedGroups = data?.groups ?? (Array.isArray(data) ? data : []);

    if (!loadedGroups.length) {
      listEl.innerHTML = '<div class="inline-empty">No groups configured — use the setup wizard to add some.</div>';
      document.getElementById('setting-groups-val').textContent = 'None selected';
      return;
    }

    listEl.innerHTML = loadedGroups.map((g) => `
      <div class="inline-group-row">
        <span class="inline-group-name">${escHtml(g.group_name || g.facebook_group_url)}</span>
        <button class="inline-remove-btn" data-id="${escHtml(g.id)}" title="Remove">×</button>
      </div>`).join('');

    listEl.querySelectorAll('.inline-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => handleRemoveGroup(btn.dataset.id));
    });

    document.getElementById('setting-groups-val').textContent =
      `${loadedGroups.length} group${loadedGroups.length !== 1 ? 's' : ''} selected`;
  } catch (err) {
    listEl.innerHTML = `<div class="inline-empty" style="color:var(--red)">${escHtml(friendlyError(err))}</div>`;
  }
}

async function handleRemoveGroup(id) {
  try {
    await deleteGroup(token, id);
    await renderGroupsList();
  } catch (err) {
    const listEl = document.getElementById('groups-list-inline');
    listEl.insertAdjacentHTML('afterbegin',
      `<div class="inline-empty" style="color:var(--red);margin-bottom:6px">${escHtml(friendlyError(err))}</div>`);
  }
}

document.getElementById('btn-groups-wizard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  window.close();
});

// Account — upgrade + portal buttons
document.getElementById('btn-upgrade-settings').addEventListener('click', () =>
  openDashboardTab('/billing')
);
document.getElementById('btn-billing-portal').addEventListener('click', async () => {
  try {
    const { url } = await createPortal(token);
    chrome.tabs.create({ url });
  } catch {
    openDashboardTab('/billing');
  }
});

// Danger zone toggle
document.getElementById('btn-danger-toggle').addEventListener('click', () => {
  const zone    = document.getElementById('danger-zone');
  const chevron = document.getElementById('danger-chevron');
  const isOpen  = !zone.classList.contains('hidden');
  zone.classList.toggle('hidden', isOpen);
  chevron.textContent = isOpen ? '▾' : '▴';
});

// Sign out (danger zone)
document.getElementById('btn-signout-danger').addEventListener('click', async () => {
  await clearSession();
  showView('logged-out');
});

// Delete account
document.getElementById('btn-delete-account').addEventListener('click', async () => {
  const first = confirm('Are you sure you want to delete your account? This cannot be undone.');
  if (!first) return;
  const second = confirm('This will permanently delete all your leads, keywords, and settings. Continue?');
  if (!second) return;
  try {
    await apiDeleteProfile(token);
    await clearSession();
    showView('logged-out');
  } catch (err) {
    alert('Could not delete account: ' + friendlyError(err));
  }
});

toggleScanning.addEventListener('change', (e) => {
  setScanningEnabled(e.target.checked);
  if (e.target.checked) {
    setStatusCard('active', 'Monitoring active', 'Scanning every 10 minutes');
  } else {
    setStatusCard('inactive', 'Monitoring paused', 'Toggle to resume');
  }
});

// ── Go ────────────────────────────────────────────────────────────────────────
init();
