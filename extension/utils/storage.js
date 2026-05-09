// chrome.storage helpers

const SYNC_KEYS = {
  AUTH_TOKEN:           'auth_token',
  REFRESH_TOKEN_UNUSED: 'refresh_token', // kept for clearSession key reference only
  USER_ID:              'user_id',
  USER_EMAIL:           'user_email',
  KEYWORDS:             'keywords',
  GROUPS:               'groups',
  SELECTED_GROUPS:      'selected_groups',
  SCANNING_ENABLED:     'scanning_enabled',
  BUSINESS_DESCRIPTION: 'business_description',
  AI_DESCRIPTION:       'ai_description',
  ONBOARDING_COMPLETE:  'onboarding_complete',
  PHONE_NUMBER:         'phone_number',
  WEBSITE_URL:          'website_url',
  INCLUDE_WEBSITE:      'include_website_in_replies',
};

const LOCAL_KEYS = {
  REFRESH_TOKEN:          'refresh_token',
  SEEN_POST_IDS:          'seen_post_ids',
  LAST_SCAN_AT:           'last_scan_at',
  SUBSCRIPTION_STATUS:    'subscription_status',
  SUBSCRIPTION_CHECKED_AT:'subscription_checked_at',
};

// ── Internal helpers ─────────────────────────────────────────────────────────
// All public get* functions are one-liners built on these two.

function syncGet(key, defaultValue = null) {
  return new Promise((resolve) =>
    chrome.storage.sync.get(key, (d) => resolve(d[key] ?? defaultValue))
  );
}

function localGet(key, defaultValue = null) {
  return new Promise((resolve) =>
    chrome.storage.local.get(key, (d) => resolve(d[key] ?? defaultValue))
  );
}

// ── Sync storage (small, synced across devices) ──────────────────────────────

export const getAuthToken          = () => syncGet(SYNC_KEYS.AUTH_TOKEN);
export const setAuthToken          = (v) => chrome.storage.sync.set({ [SYNC_KEYS.AUTH_TOKEN]: v });
export const removeAuthToken       = ()  => chrome.storage.sync.remove(SYNC_KEYS.AUTH_TOKEN);

export const getUserId             = () => syncGet(SYNC_KEYS.USER_ID);
export const setUserId             = (v) => chrome.storage.sync.set({ [SYNC_KEYS.USER_ID]: v });

export const getKeywords           = () => syncGet(SYNC_KEYS.KEYWORDS, []);
export const setKeywords           = (v) => chrome.storage.sync.set({ [SYNC_KEYS.KEYWORDS]: v });

export const getGroups             = () => syncGet(SYNC_KEYS.GROUPS, []);
export const setGroups             = (v) => chrome.storage.sync.set({ [SYNC_KEYS.GROUPS]: v });

// Selected groups: array of { url, name } the user has chosen to monitor.
// Stored in sync so selections carry across devices.
export const getSelectedGroups     = () => syncGet(SYNC_KEYS.SELECTED_GROUPS, []);
export const setSelectedGroups     = (v) => new Promise((r) => chrome.storage.sync.set({ [SYNC_KEYS.SELECTED_GROUPS]: v }, r));

export const getScanningEnabled    = () => syncGet(SYNC_KEYS.SCANNING_ENABLED, true);
export const setScanningEnabled    = (v) => chrome.storage.sync.set({ [SYNC_KEYS.SCANNING_ENABLED]: v });

export const getBusinessDescription = () => syncGet(SYNC_KEYS.BUSINESS_DESCRIPTION, '');
export const setBusinessDescription = (v) => chrome.storage.sync.set({ [SYNC_KEYS.BUSINESS_DESCRIPTION]: v });

export const getAiDescription      = () => syncGet(SYNC_KEYS.AI_DESCRIPTION, '');
export const setAiDescription      = (v) => chrome.storage.sync.set({ [SYNC_KEYS.AI_DESCRIPTION]: v });

export const isOnboardingComplete  = () => syncGet(SYNC_KEYS.ONBOARDING_COMPLETE, false);
export const setOnboardingComplete = ()  => chrome.storage.sync.set({ [SYNC_KEYS.ONBOARDING_COMPLETE]: true });

export const getPhoneNumber      = () => syncGet(SYNC_KEYS.PHONE_NUMBER, '');
export const setPhoneNumber      = (v) => chrome.storage.sync.set({ [SYNC_KEYS.PHONE_NUMBER]: v });

export const getWebsiteUrl       = () => syncGet(SYNC_KEYS.WEBSITE_URL, '');
export const setWebsiteUrl       = (v) => chrome.storage.sync.set({ [SYNC_KEYS.WEBSITE_URL]: v });

export const getIncludeWebsite   = () => syncGet(SYNC_KEYS.INCLUDE_WEBSITE, false);
export const setIncludeWebsite   = (v) => chrome.storage.sync.set({ [SYNC_KEYS.INCLUDE_WEBSITE]: v });

// ── Local storage (larger, device-only) ──────────────────────────────────────

export const getRefreshToken  = () => localGet(LOCAL_KEYS.REFRESH_TOKEN);
export const setRefreshToken  = (v) => chrome.storage.local.set({ [LOCAL_KEYS.REFRESH_TOKEN]: v });

export const getLastScanAt    = () => localGet(LOCAL_KEYS.LAST_SCAN_AT);
export const setLastScanAt    = (v) => chrome.storage.local.set({ [LOCAL_KEYS.LAST_SCAN_AT]: v });

export function getSubscriptionStatus() {
  return new Promise((resolve) =>
    chrome.storage.local.get(
      [LOCAL_KEYS.SUBSCRIPTION_STATUS, LOCAL_KEYS.SUBSCRIPTION_CHECKED_AT],
      (d) => resolve({
        status:    d[LOCAL_KEYS.SUBSCRIPTION_STATUS]    ?? null,
        checkedAt: d[LOCAL_KEYS.SUBSCRIPTION_CHECKED_AT] ?? null,
      })
    )
  );
}

export const setSubscriptionStatus = (status) =>
  chrome.storage.local.set({
    [LOCAL_KEYS.SUBSCRIPTION_STATUS]:     status,
    [LOCAL_KEYS.SUBSCRIPTION_CHECKED_AT]: Date.now(),
  });

export function getSeenPostIds() {
  return localGet(LOCAL_KEYS.SEEN_POST_IDS, []);
}

export async function markPostSeen(postId) {
  const seen = await getSeenPostIds();
  // Cap at 500 entries to prevent unbounded growth
  const updated = [...new Set([...seen, postId])].slice(-500);
  return chrome.storage.local.set({ [LOCAL_KEYS.SEEN_POST_IDS]: updated });
}

// ── Session helpers ───────────────────────────────────────────────────────────

/** Store all auth tokens after a successful sign-in or token refresh. */
export async function setSession({ accessToken, refreshToken, userId, userEmail }) {
  await chrome.storage.sync.set({
    [SYNC_KEYS.AUTH_TOKEN]:  accessToken,
    [SYNC_KEYS.USER_ID]:     userId,
    ...(userEmail ? { [SYNC_KEYS.USER_EMAIL]: userEmail } : {}),
  });
  await chrome.storage.local.set({ [LOCAL_KEYS.REFRESH_TOKEN]: refreshToken });
}

/** Clear only auth-related keys — preserves keywords, groups, and scan history. */
export async function clearSession() {
  await chrome.storage.sync.remove([
    SYNC_KEYS.AUTH_TOKEN,
    SYNC_KEYS.USER_ID,
    SYNC_KEYS.USER_EMAIL,
  ]);
  await chrome.storage.local.remove([LOCAL_KEYS.REFRESH_TOKEN]);
}

/** Clear everything — used on explicit full reset only. */
export async function clearAll() {
  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
}
