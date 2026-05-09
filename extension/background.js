// LeadSnap background service worker (MV3)
import {
  getAuthToken, getRefreshToken, setSession, clearSession,
  getGroups, getKeywords, getScanningEnabled,
  getSubscriptionStatus, setSubscriptionStatus, setLastScanAt,
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

async function runScanCycle() {
  console.log('[LeadSnap] Scan cycle started');

  // ── Pre-flight checks ────────────────────────────────────────────────────────

  const token = await getAuthToken();
  if (!token) {
    console.log('[LeadSnap] No auth token — skipping scan');
    return;
  }

  const enabled = await getScanningEnabled();
  if (!enabled) {
    console.log('[LeadSnap] Scanning disabled — skipping scan');
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
    return;
  }

  const [groups, keywords] = await Promise.all([getGroups(), getKeywords()]);
  if (!groups.length) {
    console.log('[LeadSnap] No groups configured — skipping scan');
    return;
  }
  if (!keywords.length) {
    console.log('[LeadSnap] No keywords configured — skipping scan');
    return;
  }

  // ── Message group-page tabs ──────────────────────────────────────────────────
  // Pre-filter to Facebook group pages only. The content script also checks
  // this, but filtering here avoids unnecessary IPC to unrelated FB tabs.

  const tabs = await chrome.tabs.query({ url: FACEBOOK_GROUP_URL_PATTERN });
  if (!tabs.length) {
    console.log('[LeadSnap] No Facebook group tabs open — skipping scan');
    return;
  }

  let totalFound = 0;
  for (const tab of tabs) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'LEADSNAP_SCAN',
        keywords,
        groups,
      });
      if (response?.found) totalFound += response.found;
    } catch (err) {
      // Tab may not have content script ready (e.g. tab just opened)
      console.warn(`[LeadSnap] Could not message tab ${tab.id}:`, err.message);
    }
  }

  await setLastScanAt(Date.now());
  console.log(`[LeadSnap] Scan cycle complete — ${totalFound} new lead(s) submitted`);
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
// Hits the subscription-gated ingest endpoint as a lightweight status check.
// 400 or 501 → middleware passed → subscription is active.
// 403 SUBSCRIPTION_REQUIRED → subscription lapsed.

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
    // Network error — keep last known cached status, don't overwrite
    console.warn('[LeadSnap] Subscription probe network error:', err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isSubscriptionAllowed(status) {
  return status === SUBSCRIPTION_STATUS.TRIAL || status === SUBSCRIPTION_STATUS.ACTIVE;
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

  if (message.type === 'LEADSNAP_GET_STATUS') {
    getStatus().then(sendResponse);
    return true;
  }
});

async function handleLeadFound(payload) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  const lead = await ingestLead(token, payload);

  // Show a Chrome notification and increment the badge for each new lead
  showLeadNotification(lead);
  incrementBadge();

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
