// LeadSnap background service worker (MV3)
import {
  getAuthToken, getRefreshToken, setSession, clearSession,
  getSelectedGroups, getKeywords, getScanningEnabled,
  getSubscriptionStatus, setSubscriptionStatus, setLastScanAt, getLastScanAt,
  getAiDescription, getWebsiteUrl, getIncludeWebsite, getAlertChannel,
  isOnboardingComplete, getScanMaxAgeHours,
  getScanState, setScanState,
  getManualScanAgeHours,
  incrementLeadsFoundToday,
} from './utils/storage.js';
import { ingestLead, heartbeat } from './utils/api.js';
import { refreshToken, getUser, signInWithGoogle } from './utils/supabase-auth.js';
import { API_URL, SUBSCRIPTION_STATUS, GOOGLE_CLIENT_ID } from './utils/config.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALARM_SCAN          = 'leadsnap-scan';
const ALARM_TOKEN_REFRESH = 'leadsnap-token-refresh';

const SCAN_INTERVAL_MINUTES          = 10;
const TOKEN_REFRESH_INTERVAL_MINUTES = 55;  // Supabase tokens expire at 60 min
const SUBSCRIPTION_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour


// ── Lifecycle ─────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  console.log('[LeadSnap] Extension installed');
  scheduleAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[LeadSnap] Browser started');
  scheduleAlarms();
  // Validate session and subscription eagerly on browser start
  await validateAndRefreshToken();
  await probeSubscription();
});

// ── Alarms ────────────────────────────────────────────────────────────────────

function scheduleAlarms() {
  scheduleAlarm(ALARM_SCAN,          SCAN_INTERVAL_MINUTES);
  scheduleAlarm(ALARM_TOKEN_REFRESH, TOKEN_REFRESH_INTERVAL_MINUTES);
}

function scheduleAlarm(name, periodInMinutes) {
  chrome.alarms.get(name, (existing) => {
    if (!existing) {
      chrome.alarms.create(name, { periodInMinutes });
      console.log(`[LeadSnap] Alarm "${name}" set for every ${periodInMinutes} min`);
    }
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_SCAN)          await runScanCycle();
  if (alarm.name === ALARM_TOKEN_REFRESH) await validateAndRefreshToken();
});

// ── Scan cycle ────────────────────────────────────────────────────────────────

/**
 * Core scan loop.
 * @param {object}       opts
 * @param {boolean}      opts.silent       - true → skip SMS + Chrome notifications
 * @param {boolean}      opts.isManual     - true → write scan_state + animate icon
 * @param {number|null}  opts.maxAgeHours  - hours to look back; null = auto-select
 */
async function runScanCycle({ silent = false, isManual = false, maxAgeHours = null } = {}) {
  console.log('[LeadSnap] Scan cycle started', isManual ? '(manual)' : '(alarm)', `maxAgeHours=${maxAgeHours}`);

  // ── First-scan detection ─────────────────────────────────────────────────────
  const lastScanAt = await getLastScanAt();
  if (!lastScanAt) {
    console.log('[LeadSnap] First scan detected — using 7-day window');
    maxAgeHours = 168;
  } else if (maxAgeHours === null) {
    maxAgeHours = await getScanMaxAgeHours();
  }

  // ── Pre-flight checks ────────────────────────────────────────────────────────

  const token = await getAuthToken();
  if (!token) {
    console.log('[LeadSnap] No auth token — skipping scan');
    if (isManual) await setScanState({ status: 'blocked', blocked_reason: 'not-signed-in', blocked_message: 'You\'re not signed in. Please sign in and try again.' });
    stopScanAnimation();
    return;
  }

  const enabled = await getScanningEnabled();
  if (!enabled) {
    console.log('[LeadSnap] Scanning disabled — skipping scan');
    if (isManual) await setScanState({ status: 'blocked', blocked_reason: 'scanning-disabled', blocked_message: 'Scanning is turned off. Enable it in the Status tab.' });
    stopScanAnimation();
    return;
  }

  // ── Facebook session check ───────────────────────────────────────────────────
  if (chrome.cookies) {
    try {
      const fbCookie = await chrome.cookies.get({ url: 'https://www.facebook.com', name: 'c_user' });
      if (!fbCookie) {
        console.log('[LeadSnap] Facebook session cookie not found — user may not be logged into Facebook');
        if (isManual) {
          await setScanState({ status: 'blocked', blocked_reason: 'not-logged-into-facebook', blocked_message: 'Please log into Facebook first, then try again.' });
          stopScanAnimation();
          return;
        }
        // For alarm scans, skip silently — don't block if they're just not on Facebook yet
      }
    } catch (err) {
      console.warn('[LeadSnap] Could not check Facebook cookie:', err.message);
    }
  }

  // Subscription: use cache unless stale (older than 1 hour)
  let { status, checkedAt } = await getSubscriptionStatus();
  if (!checkedAt || Date.now() - checkedAt > SUBSCRIPTION_CHECK_INTERVAL_MS) {
    await probeSubscription();
    ({ status } = await getSubscriptionStatus());
  }
  if (!isSubscriptionAllowed(status)) {
    console.log('[LeadSnap] Subscription inactive — skipping scan');
    if (isManual) await setScanState({ status: 'blocked', blocked_reason: 'subscription-required', blocked_message: 'Your trial has ended. Subscribe to continue scanning.' });
    stopScanAnimation();
    return;
  }

  const [groups, keywords] = await Promise.all([getSelectedGroups(), getKeywords()]);
  if (!groups.length) {
    console.log('[LeadSnap] No groups selected — skipping scan');
    if (isManual) await setScanState({ status: 'blocked', blocked_reason: 'no-groups', blocked_message: 'No groups selected. Go to Settings → Groups to add some.' });
    stopScanAnimation();
    return;
  }
  if (!keywords.length) {
    console.log('[LeadSnap] No keywords configured — skipping scan');
    if (isManual) await setScanState({ status: 'blocked', blocked_reason: 'no-keywords', blocked_message: 'No keywords configured. Go to Settings → Keywords to add some.' });
    stopScanAnimation();
    return;
  }

  // ── Find open Facebook group tabs ────────────────────────────────────────────
  // For manual scans: if none are open, auto-open the first monitored group.
  // For alarm scans: skip silently — passive observer handles it.

  console.log(`[LeadSnap] Monitored groups (${groups.length}):`, groups.map((g) => g.url || g.facebook_group_url || g));
  console.log(`[LeadSnap] Keywords (${keywords.length}):`, keywords.map((k) => (typeof k === 'string' ? k : k.keyword)));

  let openGroupTabs = await chrome.tabs.query({ url: 'https://www.facebook.com/groups/*' });
  console.log(`[LeadSnap] Open Facebook group tabs: ${openGroupTabs.length}`, openGroupTabs.map((t) => t.url));

  if (!openGroupTabs.length && isManual) {
    // Auto-open the first monitored group
    const firstGroupRaw = groups[0];
    const firstGroupUrl = typeof firstGroupRaw === 'string'
      ? firstGroupRaw
      : (firstGroupRaw?.url || firstGroupRaw?.facebook_group_url);

    if (firstGroupUrl) {
      console.log('[LeadSnap] No FB tabs open — auto-opening:', firstGroupUrl);
      await setScanState({ status: 'opening-facebook', started_at: Date.now(), progress: null });

      try {
        const newTab = await chrome.tabs.create({ url: firstGroupUrl, active: true });
        await waitForTabComplete(newTab.id, 15000);
        await sleep(2500); // let content scripts initialise
        openGroupTabs = await chrome.tabs.query({ url: 'https://www.facebook.com/groups/*' });
        console.log(`[LeadSnap] After auto-open: ${openGroupTabs.length} group tab(s)`);
      } catch (err) {
        console.warn('[LeadSnap] Failed to auto-open Facebook group:', err.message);
      }
    }
  }

  if (!openGroupTabs.length) {
    console.log('[LeadSnap] No Facebook group tabs open — passive observer will catch leads when user visits groups');
    if (isManual) await setScanState({ status: 'blocked', blocked_reason: 'no-tabs', blocked_message: 'No Facebook group tabs could be opened. Please open one of your monitored groups manually.' });
    stopScanAnimation();
    return;
  }

  // ── Scan each open group tab ──────────────────────────────────────────────────

  let totalFound        = 0;
  let totalPostsChecked = 0;
  let skippedNotMonitored = 0;

  if (isManual) {
    await setScanState({ status: 'scanning',
      progress: { current: 0, total: openGroupTabs.length, group_name: '' } });
  }

  for (let i = 0; i < openGroupTabs.length; i++) {
    if (manualScanCancelled) break;

    const tab = openGroupTabs[i];

    if (isManual) {
      await setScanState({ status: 'scanning',
        progress: { current: i + 1, total: openGroupTabs.length, group_name: tab.title || tab.url } });
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'LEADSNAP_SCAN',
        keywords,
        groups,
        silent,
        maxAgeHours,
      });
      if (response?.found)         totalFound        += response.found;
      if (response?.posts_checked) totalPostsChecked += response.posts_checked;
      if (response?.status === 'skipped') {
        console.log(`[LeadSnap] Tab ${tab.id} skipped — ${response.reason} (${tab.url})`);
        if (response.reason === 'group not monitored') skippedNotMonitored++;
      }
    } catch (err) {
      console.warn(`[LeadSnap] Could not message tab ${tab.id}:`, err.message);
    }
  }

  await setLastScanAt(Date.now());
  // Notify backend so dashboard can show "extension connected" status
  if (token) heartbeat(token).catch(() => {});
  stopScanAnimation();

  console.log(`[LeadSnap] Scan cycle complete — ${totalFound} lead(s), ${totalPostsChecked} posts checked`);

  if (isManual) {
    await setScanState({
      status:       'complete',
      completed_at: Date.now(),
      progress:     null,
      result: {
        found:          totalFound,
        groups_scanned: openGroupTabs.length - skippedNotMonitored,
        posts_checked:  totalPostsChecked,
      },
    });
  }
}

// ── Manual scan (triggered from popup or onboarding) ─────────────────────────

let manualScanCancelled = false;

async function runManualScan({ maxAgeHours } = {}) {
  // Guard: don't start a second scan while one is already running
  const current = await getScanState();
  if (current.status === 'scanning') {
    console.log('[LeadSnap] Manual scan requested but a scan is already running');
    return;
  }

  manualScanCancelled = false;
  const age = maxAgeHours ?? (await getManualScanAgeHours());

  await setScanState({
    status: 'scanning', started_at: Date.now(),
    progress: null, result: null, blocked_reason: null,
  });
  startScanAnimation();

  await runScanCycle({ silent: true, isManual: true, maxAgeHours: age });
}

// ── Token validation + refresh ────────────────────────────────────────────────

async function validateAndRefreshToken() {
  const token = await getAuthToken();
  if (!token) return;

  try {
    await getUser(token);
    // Token is still valid — nothing to do
  } catch {
    console.log('[LeadSnap] Token invalid, attempting refresh…');
    const storedRefreshToken = await getRefreshToken();
    if (!storedRefreshToken) {
      console.warn('[LeadSnap] No refresh token — clearing session');
      await clearSession();
      return;
    }
    try {
      const result = await refreshToken(storedRefreshToken);
      await setSession({
        accessToken:  result.access_token,
        refreshToken: result.refresh_token,
        userId:       result.user.id,
      });
      console.log('[LeadSnap] Token refreshed successfully');
    } catch (refreshErr) {
      console.warn('[LeadSnap] Token refresh failed — clearing session:', refreshErr.message);
      await clearSession();
    }
  }
}

// ── Subscription probe ────────────────────────────────────────────────────────

async function probeSubscription() {
  const token = await getAuthToken();
  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/api/leads/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    if (res.status === 403) {
      const body = await res.json().catch(() => ({}));
      if (body.code === 'SUBSCRIPTION_REQUIRED') {
        await setSubscriptionStatus(SUBSCRIPTION_STATUS.INACTIVE);
        console.log('[LeadSnap] Subscription inactive');
        return;
      }
    }

    await setSubscriptionStatus(SUBSCRIPTION_STATUS.ACTIVE);
    console.log('[LeadSnap] Subscription active');
  } catch (err) {
    console.warn('[LeadSnap] Subscription probe network error:', err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSubscriptionAllowed(status) {
  return status === SUBSCRIPTION_STATUS.TRIAL || status === SUBSCRIPTION_STATUS.ACTIVE;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Waits for a tab to reach status 'complete', with a timeout fallback.
 */
function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, timeoutMs);

    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

// ── Toolbar icon animation ────────────────────────────────────────────────────

let scanAnimTimer = null;

async function startScanAnimation() {
  try {
    const response = await fetch(chrome.runtime.getURL('icons/icon48.png'));
    const blob     = await response.blob();
    const bitmap   = await createImageBitmap(blob);
    let frame = 0;

    function nextFrame() {
      const canvas = new OffscreenCanvas(48, 48);
      const ctx    = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);

      // Draw a spinning arc overlay in brand orange
      const angle = (frame * 36) % 360;
      ctx.beginPath();
      ctx.arc(24, 24, 18, ((angle - 90) * Math.PI) / 180, ((angle + 90) * Math.PI) / 180);
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth   = 4;
      ctx.lineCap     = 'round';
      ctx.stroke();

      chrome.action.setIcon({ imageData: { 48: ctx.getImageData(0, 0, 48, 48) } });
      frame++;
      scanAnimTimer = setTimeout(nextFrame, 80);
    }

    nextFrame();
  } catch (err) {
    console.warn('[LeadSnap] Icon animation failed:', err.message);
  }
}

function stopScanAnimation() {
  clearTimeout(scanAnimTimer);
  scanAnimTimer = null;
  // Reset to static icon
  chrome.action.setIcon({ path: { 48: 'icons/icon48.png' } });
}

// ── Notifications ─────────────────────────────────────────────────────────────

function showLeadNotification(lead) {
  const score = lead.score ? ` (score: ${lead.score}/10)` : '';
  const preview = lead.post_text?.slice(0, 100) ?? '';

  chrome.notifications.create(`lead-${lead.id}`, {
    type:    'basic',
    iconUrl: 'icons/icon48.png',
    title:   `New Lead${score} — ${lead.group_name ?? 'Facebook Group'}`,
    message: preview.length === 100 ? `${preview}…` : preview,
    priority: lead.score >= 8 ? 2 : 1,
  });
}

function updateBadge(count) {
  const label = count > 0 ? String(count > 99 ? '99+' : count) : '';
  chrome.action.setBadgeText({ text: label });
  chrome.action.setBadgeBackgroundColor({ color: '#f97316' });
}

// ── Messages from content script / popup ─────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'LEADSNAP_LEAD_FOUND') {
    handleLeadFound(message.payload)
      .then(sendResponse)
      .catch((err) => {
        console.error('[LeadSnap] Error handling lead:', err);
        sendResponse({ error: err.message });
      });
    return true; // keep channel open for async response
  }

  if (message.type === 'GOOGLE_SIGN_IN') {
    handleGoogleSignIn()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'LEADSNAP_MANUAL_SCAN') {
    runManualScan({ maxAgeHours: message.maxAgeHours ?? null })
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'SCAN_CANCEL') {
    manualScanCancelled = true;
    stopScanAnimation();
    setScanState({ status: 'idle' }).catch(() => {});
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'LEADSNAP_GET_STATUS') {
    getStatus().then(sendResponse);
    return true;
  }
});

// ── Google sign-in (proxied here so the flow survives the popup closing) ──────

async function handleGoogleSignIn() {
  // Log the redirect URI so it's easy to copy from the service worker console
  // and register in Google Cloud Console → Authorized redirect URIs
  console.log('[LeadSnap] Google redirect URI:', chrome.identity.getRedirectURL());

  let session;
  try {
    session = await signInWithGoogle(GOOGLE_CLIENT_ID);
  } catch (err) {
    console.error('[LeadSnap] Google sign-in failed:', err.message);
    chrome.notifications.create('leadsnap-signin-failed', {
      type:    'basic',
      iconUrl: 'icons/icon48.png',
      title:   'LeadSnap — Sign-in failed',
      message: err.message || 'Google sign-in failed. Please try again.',
    });
    throw err; // re-throw so the message handler can also report it
  }

  // Persist the Supabase session via the canonical storage abstraction
  await setSession({
    accessToken:  session.access_token,
    refreshToken: session.refresh_token,
    userId:       session.user.id,
    userEmail:    session.user.email,
  });

  const onboarded = await isOnboardingComplete();

  if (!onboarded) {
    // New user — go straight to onboarding (reliable, no popup needed)
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
    return;
  }

  // Returning user — wait for the Google window to fully close and Chrome
  // to regain focus before trying to reopen the popup.
  await sleep(400);
  try {
    await chrome.action.openPopup();
  } catch {
    // openPopup unavailable (Chrome < 127) or window not focused — show a
    // notification so the user knows sign-in worked.
    chrome.notifications.create('leadsnap-signed-in', {
      type:    'basic',
      iconUrl: 'icons/icon48.png',
      title:   'LeadSnap — Signed in!',
      message: 'Click the LeadSnap icon in your toolbar to continue.',
    });
  }
}

async function handleLeadFound(payload) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  // Read user preferences and attach to every ingest call
  const [aiDescription, websiteUrl, includeWebsite, alertChannel] = await Promise.all([
    getAiDescription(),
    getWebsiteUrl(),
    getIncludeWebsite(),
    getAlertChannel(),
  ]);

  const lead = await ingestLead(token, {
    ...payload,
    ai_description: aiDescription || undefined,
    website_url:    includeWebsite && websiteUrl ? websiteUrl : undefined,
    alert_channel:  alertChannel || 'sms',
    skip_sms:       payload.silent === true,
  });

  // Track leads found today (all scans, silent and non-silent)
  await incrementLeadsFoundToday();

  // Only notify user for background (non-silent) scans
  if (!payload.silent) {
    showLeadNotification(lead);
    incrementBadge();
  }

  return lead;
}

async function getStatus() {
  const [token, { status }, enabled] = await Promise.all([
    getAuthToken(),
    getSubscriptionStatus(),
    getScanningEnabled(),
  ]);
  return {
    authenticated:      !!token,
    subscriptionStatus: status,
    scanningEnabled:    enabled,
  };
}

// Badge count is stored in local storage so it persists across service worker restarts.
async function incrementBadge() {
  const current = await new Promise((r) =>
    chrome.storage.local.get('badge_count', (d) => r(d.badge_count || 0))
  );
  const next = current + 1;
  await chrome.storage.local.set({ badge_count: next });
  updateBadge(next);
}

// Reset badge when the popup is opened (user has seen the leads)
chrome.action.onClicked.addListener(async () => {
  await chrome.storage.local.set({ badge_count: 0 });
  updateBadge(0);
});

// Restore badge count on service worker startup (it gets reset when SW wakes)
chrome.storage.local.get('badge_count', (d) => {
  if (d.badge_count > 0) updateBadge(d.badge_count);
});
