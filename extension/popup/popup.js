// LeadSnap popup — ES module (popup.html loads this with type="module")
import {
  getKeywords as apiGetKeywords,
  addKeyword  as apiAddKeyword,
  deleteKeyword as apiDeleteKeyword,
} from '../utils/api.js';
import {
  getAuthToken,
  clearSession,
  setScanningEnabled,
  getSubscriptionStatus,
  getLastScanAt,
  getSelectedGroups,
  setSelectedGroups,
  isOnboardingComplete,
} from '../utils/storage.js';

const DASHBOARD_URL = 'https://leadsnap-weld.vercel.app';
const MAX_GROUPS    = 25;

// ── DOM refs ──────────────────────────────────────────────────────────────────

const viewLoading   = document.getElementById('view-loading');
const viewLoggedOut = document.getElementById('view-logged-out');
const viewLoggedIn  = document.getElementById('view-logged-in');

const statusDot      = document.getElementById('status-dot');
const statKeywords   = document.getElementById('stat-keywords');
const statGroups     = document.getElementById('stat-groups');
const statLastScan   = document.getElementById('stat-last-scan');
const toggleScanning = document.getElementById('toggle-scanning');
const subBanner      = document.getElementById('sub-banner');

const keywordInput = document.getElementById('keyword-input');
const keywordList  = document.getElementById('keyword-list');
const keywordError = document.getElementById('keyword-error');

const groupsCounter = document.getElementById('groups-counter');
const groupsMsg     = document.getElementById('groups-msg');
const groupsList    = document.getElementById('groups-list');
const groupsSaveRow = document.getElementById('groups-save-row');

// ── State ─────────────────────────────────────────────────────────────────────

let token    = null;
let keywords = [];

// Groups state — lives only in popup memory; persisted on Save
let allDiscoveredGroups = []; // [{ url, name }] — full discovered + saved list
let selectedGroupUrls   = new Set(); // urls of currently checked groups

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  showView('loading');
  token = await getAuthToken();
  if (!token) { showView('logged-out'); return; }

  // If onboarding hasn't been completed yet, redirect there
  const onboarded = await isOnboardingComplete();
  if (!onboarded) {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
    window.close();
    return;
  }

  showView('logged-in');
  await Promise.all([loadStatus(), loadKeywords(), initGroupsTab()]);
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
  });
});

// ── Status tab ────────────────────────────────────────────────────────────────

async function loadStatus() {
  const [scanningEnabled, lastScanAt, { status: subStatus }, savedGroups] = await Promise.all([
    new Promise((r) => chrome.storage.sync.get('scanning_enabled', (d) => r(d.scanning_enabled !== false))),
    getLastScanAt(),
    getSubscriptionStatus(),
    getSelectedGroups(),
  ]);

  toggleScanning.checked   = scanningEnabled;
  statKeywords.textContent = keywords.length || '—';
  statGroups.textContent   = savedGroups.length || '—';
  statLastScan.textContent = formatLastScan(lastScanAt);

  if (subStatus === 'inactive') {
    statusDot.className = 'dot dot-error';
    subBanner.classList.remove('hidden');
  } else {
    statusDot.className = `dot ${scanningEnabled ? 'dot-active' : 'dot-inactive'}`;
  }
}

function formatLastScan(ts) {
  if (!ts) return 'Never';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

// ── Keywords tab ──────────────────────────────────────────────────────────────

function syncKeywordsToStorage() {
  return chrome.storage.sync.set({ keywords: keywords.map((k) => k.keyword) });
}

async function loadKeywords() {
  try {
    keywords = await apiGetKeywords(token);
    await syncKeywordsToStorage();
  } catch {
    const cached = await new Promise((r) => chrome.storage.sync.get('keywords', (d) => r(d.keywords || [])));
    keywords = cached.map((k) => ({ keyword: k }));
  }
  renderKeywords();
  statKeywords.textContent = keywords.length;
}

function renderKeywords() {
  if (!keywords.length) {
    keywordList.innerHTML = '<li class="empty-msg">No keywords yet. Add one above.</li>';
    return;
  }
  keywordList.innerHTML = keywords.map((k) => `
    <li>
      <span class="item-text">${escHtml(k.keyword)}</span>
      ${k.id ? `<button class="btn-remove" data-id="${k.id}" title="Remove">×</button>` : ''}
    </li>
  `).join('');
  keywordList.querySelectorAll('.btn-remove').forEach((btn) =>
    btn.addEventListener('click', () => removeKeyword(btn.dataset.id))
  );
}

async function addKeyword() {
  const kw = keywordInput.value.trim().toLowerCase();
  if (!kw) return;

  setInlineError(keywordError, null);
  const btn = document.getElementById('btn-add-keyword');
  btn.disabled = true;
  try {
    const created = await apiAddKeyword(token, kw);
    keywords.push(created);
    keywordInput.value = '';
    renderKeywords();
    statKeywords.textContent = keywords.length;
    await syncKeywordsToStorage();
  } catch (err) {
    setInlineError(keywordError, err.message);
  } finally {
    btn.disabled = false;
  }
}

async function removeKeyword(id) {
  try {
    await apiDeleteKeyword(token, id);
    keywords = keywords.filter((k) => k.id !== id);
    renderKeywords();
    statKeywords.textContent = keywords.length;
    await syncKeywordsToStorage();
  } catch (err) {
    setInlineError(keywordError, err.message);
  }
}

// ── Groups tab ────────────────────────────────────────────────────────────────

async function initGroupsTab() {
  // Seed the list with whatever was previously saved
  const saved = await getSelectedGroups();
  allDiscoveredGroups = [...saved];
  selectedGroupUrls   = new Set(saved.map((g) => g.url));
  statGroups.textContent = saved.length || '—';
  renderGroupsList();

  // Auto-scan silently — enrich the list if a Facebook tab is open
  await scanForGroups({ silent: true });
}

async function scanForGroups({ silent = false } = {}) {
  const btn = document.getElementById('btn-scan-groups');
  btn.disabled = true;
  btn.textContent = 'Scanning…';
  if (!silent) setGroupsMsg('');

  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.facebook.com/*' });

    if (!tabs.length) {
      setGroupsMsg(
        silent
          ? 'Open Facebook in Chrome to auto-discover your groups.'
          : 'No Facebook tab found. Open facebook.com/groups/feed and try again.'
      );
      return;
    }

    // Prefer a groups page; any FB tab will work because the sidebar is universal
    const tab = tabs.find((t) => t.url.includes('/groups')) || tabs[0];

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'LEADSNAP_GET_GROUPS' });
    } catch {
      setGroupsMsg('Could not reach the Facebook tab. Reload the page and try again.');
      return;
    }

    const fetched = response?.groups ?? [];
    if (!fetched.length) {
      if (!silent) setGroupsMsg('No groups found on that page. Try opening facebook.com/groups/feed.');
      return;
    }

    // Merge — preserve existing entries, append newly discovered ones
    const knownUrls = new Set(allDiscoveredGroups.map((g) => g.url));
    let added = 0;
    for (const g of fetched) {
      if (!knownUrls.has(g.url)) {
        allDiscoveredGroups.push(g);
        knownUrls.add(g.url);
        added++;
      }
    }

    setGroupsMsg(
      `${allDiscoveredGroups.length} group${allDiscoveredGroups.length !== 1 ? 's' : ''} found` +
      (added ? ` · ${added} new` : '')
    );
    renderGroupsList();
  } finally {
    btn.textContent = 'Scan Facebook';
    btn.disabled = false;
  }
}

function renderGroupsList() {
  // Update counter
  groupsCounter.textContent = `${selectedGroupUrls.size}/${MAX_GROUPS} selected`;

  // Show/hide Save button
  groupsSaveRow.classList.toggle('hidden', allDiscoveredGroups.length === 0);

  if (!allDiscoveredGroups.length) {
    groupsList.innerHTML = '<div class="group-item"><div class="group-item-text"><div class="group-item-name" style="color:#9ca3af">No groups discovered yet — click Scan Facebook above.</div></div></div>';
    return;
  }

  const atMax = selectedGroupUrls.size >= MAX_GROUPS;

  groupsList.innerHTML = allDiscoveredGroups.map((g, i) => {
    const checked  = selectedGroupUrls.has(g.url);
    const dimmed   = !checked && atMax;
    return `
      <label class="group-item${dimmed ? ' dimmed' : ''}">
        <input type="checkbox" class="group-checkbox" data-idx="${i}"
          ${checked ? 'checked' : ''} ${dimmed ? 'disabled' : ''} />
        <div class="group-item-text">
          <div class="group-item-name">${escHtml(g.name)}</div>
          <div class="group-item-url">${escHtml(shortUrl(g.url))}</div>
          ${g.lastVisited ? `<div class="group-item-visited">${escHtml(g.lastVisited)}</div>` : ''}
        </div>
      </label>
    `;
  }).join('');

  groupsList.querySelectorAll('.group-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      const g = allDiscoveredGroups[parseInt(cb.dataset.idx, 10)];
      if (cb.checked) {
        if (selectedGroupUrls.size >= MAX_GROUPS) { cb.checked = false; return; }
        selectedGroupUrls.add(g.url);
      } else {
        selectedGroupUrls.delete(g.url);
      }
      renderGroupsList(); // re-render to update counter + disabled states
    });
  });
}

async function saveGroups() {
  const btn = document.getElementById('btn-save-groups');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const toSave = allDiscoveredGroups.filter((g) => selectedGroupUrls.has(g.url));
    await setSelectedGroups(toSave);
    statGroups.textContent = toSave.length || '—';
    setGroupsMsg('Saved!');
    setTimeout(() => setGroupsMsg(''), 2000);
  } catch (err) {
    setGroupsMsg('Save failed: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save selections';
  }
}

function setGroupsMsg(msg, isError = false) {
  groupsMsg.textContent = msg;
  groupsMsg.classList.toggle('error', isError);
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function setInlineError(el, msg) {
  if (msg) { el.textContent = msg; el.classList.remove('hidden'); }
  else      { el.classList.add('hidden'); }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shortUrl(url) {
  try { return new URL(url).pathname.replace(/\/$/, ''); }
  catch { return url; }
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('btn-sign-in').addEventListener('click', () =>
  chrome.tabs.create({ url: chrome.runtime.getURL('auth/auth.html') })
);
document.getElementById('btn-view-leads').addEventListener('click', () =>
  chrome.tabs.create({ url: DASHBOARD_URL })
);
document.getElementById('btn-logout').addEventListener('click', async () => {
  await clearSession();
  showView('logged-out');
});
document.getElementById('btn-upgrade').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: `${DASHBOARD_URL}/billing` });
});

document.getElementById('btn-add-keyword').addEventListener('click', addKeyword);
keywordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addKeyword(); });

document.getElementById('btn-scan-groups').addEventListener('click', () => scanForGroups());
document.getElementById('btn-scan-now').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'LEADSNAP_MANUAL_SCAN' });
  window.close(); // monitor window takes over
});
document.getElementById('btn-save-groups').addEventListener('click', saveGroups);

toggleScanning.addEventListener('change', (e) => {
  setScanningEnabled(e.target.checked);
  statusDot.className = `dot ${e.target.checked ? 'dot-active' : 'dot-inactive'}`;
});

// ── Go ────────────────────────────────────────────────────────────────────────

init();
