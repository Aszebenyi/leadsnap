// LeadSnap background service worker (MV3)
import {
  getAuthToken, getRefreshToken, setSession, clearSession,
  getSelectedGroups, getKeywords, getScanningEnabled,
  getSubscriptionStatus, setSubscriptionStatus, setLastScanAt,
  getAiDescription, getWebsiteUrl, getIncludeWebsite,
} from './utils/storage.js';
import { ingestLead } from './utils/api.js';
import { refreshToken, getUser } from './utils/supabase-auth.js';
import { API_URL, SUBSCRIPTION_STATUS } from './utils/config.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALARM_SCAN          = 'leadsnap-scan';
const ALARM_TOKEN_REFRESH = 'leadsnap-token-refresh';

const SCAN_INTERVAL_MINUTES          = 10;
const TOKEN_REFRESH_INTERVAL_MINUTES = 55;  // Supabase tokens expire at 60 min
const SUBSCRIPTION_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// Only message tabs on actual group feed pages — post pages and other FB pages
// will be skipped by the content script anyway, so filter them early.
const FACEBOOK_GROUP_URL_PATTERN = 'https://www.facebook.com/groups/*';

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
 * @param {object} opts
 * @param {boolean} opts.silent       - true → skip SMS + Chrome notifications (manual/initial scan)
 * @param {number|null} opts.monitorTabId - tab ID of the monitor window to send progress to
 */
async function runScanCycle({ silent = false, monitorTabId = null } = {}) {
  console.log('[LeadSnap] Scan cycle started', silent ? '(silent)' : '');

  // ── Pre-flight checks ────────────────────────────────────────────────────────

  const token = await getAuthToken();
  if (!token) {
    console.log('[LeadSnap] No auth token — skipping scan');
    sendToMonitor(monitorTabId, { type: 'SCAN_COMPLETE', found: 0 });
    return;
  }

  const enabled = await getScanningEnabled();
  if (!enabled) {
    console.log('[LeadSnap] Scanning disabled — skipping scan');
    sendToMonitor(monitorTabId, { type: 'SCAN_COMPLETE', found: 0 });
    return;
  }

  // Subscription: use cache unless stale (older than 1 hour)
  let { status, checkedAt } = await getSubscriptionStatus();
  if (!checkedAt || Date.now() - checkedAt > SUBSCRIPTION_CHECK_INTERVAL_MS) {
    await probeSubscription();
    ({ status } = await getSubscriptionStatus());
  }
  if (!isSubscriptionAllowed(status)) {
    console.log('[LeadSnap] Subscription inactive — skipping scan');
    sendToMonitor(monitorTabId, { type: 'SCAN_COMPLETE', found: 0 });
    return;
  }

  const [groups, keywords] = await Promise.all([getSelectedGroups(), getKeywords()]);
  if (!groups.length) {
    console.log('[LeadSnap] No groups selected — skipping scan');
    sendToMonitor(monitorTabId, { type: 'SCAN_COMPLETE', found: 0 });
    return;
  }
  if (!keywords.length) {
    console.log('[LeadSnap] No keywords configured — skipping scan');
    sendToMonitor(monitorTabId, { type: 'SCAN_COMPLETE', found: 0 });
    return;
  }

  // ── Message group-page tabs ──────────────────────────────────────────────────

  const tabs = await chrome.tabs.query({ url: FACEBOOK_GROUP_URL_PATTERN });
  if (!tabs.length) {
    console.log('[LeadSnap] No Facebook group tabs open — skipping scan');
    sendToMonitor(monitorTabId, { type: 'SCAN_NO_TABS' });
    return;
  }

  let totalFound = 0;
  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];

    // Send progress update to monitor window (best-effort)
    sendToMonitor(monitorTabId, {
      type:      'SCAN_PROGRESS',
      groupName: tab.title || tab.url,
      current:   i + 1,
      total:     tabs.length,
    });

    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'LEADSNAP_SCAN',
        keywords,
        groups,
        silent,
      });
      if (response?.found) totalFound += response.found;
    } catch (err) {
      // Tab may not have content script ready (e.g. tab just opened)
      console.warn(`[LeadSnap] Could not message tab ${tab.id}:`, err.message);
    }
  }

  await setLastScanAt(Date.now());
  console.log(`[LeadSnap] Scan cycle complete — ${totalFound} new lead(s) submitted`);

  sendToMonitor(monitorTabId, { type: 'SCAN_COMPLETE', found: totalFound });
}

/** Send a message to the monitor window tab, ignoring any errors */
function sendToMonitor(tabId, message) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    // Monitor window may have been closed — ignore
  });
}

// ── Manual scan (triggered from popup) ───────────────────────────────────────

let manualScanCancelled = false;

async function runManualScan() {
  manualScanCancelled = false;

  // Open the monitor window
  const monitorUrl = chrome.runtime.getURL('monitor/monitor.html');
  let monitorTabId = null;

  try {
    const win = await chrome.windows.create({
      url:    monitorUrl,
      type:   'popup',
      width:  420,
      height: 320,
      focused: true,
    });
    // The new window has exactly one tab
    monitorTabId = win.tabs?.[0]?.id ?? null;
  } catch (err) {
    console.error('[LeadSnap] Could not open monitor window:', err.message);
    // Fall through — scan will still run, just without the progress window
  }

  // Small delay so the monitor page can load and register its message listener
  await sleep(400);

  await runScanCycle({ silent: true, monitorTabId });
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
  chrome.action.setBadgeBackgroundColor({ color: '#3b82f6' });
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

  if (message.type === 'LEADSNAP_MANUAL_SCAN') {
    runManualScan()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.type === 'SCAN_CANCEL') {
    manualScanCancelled = true;
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'LEADSNAP_GET_STATUS') {
    getStatus().then(sendResponse);
    return true;
  }
});

async function handleLeadFound(payload) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  // Read user preferences and attach to every ingest call
  const [aiDescription, websiteUrl, includeWebsite] = await Promise.all([
    getAiDescription(),
    getWebsiteUrl(),
    getIncludeWebsite(),
  ]);

  const lead = await ingestLead(token, {
    ...payload,
    ai_description: aiDescription || undefined,
    website_url:    includeWebsite && websiteUrl ? websiteUrl : undefined,
    skip_sms:       payload.silent === true,
  });

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
