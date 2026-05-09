// LeadSnap popup — ES module (popup.html loads this with type="module")
import {
  getKeywords as apiGetKeywords,
  addKeyword  as apiAddKeyword,
  deleteKeyword as apiDeleteKeyword,
  getGroups   as apiGetGroups,
  addGroup    as apiAddGroup,
  deleteGroup as apiDeleteGroup,
} from '../utils/api.js';
import {
  getAuthToken,
  clearSession,
  setScanningEnabled,
  getSubscriptionStatus,
  getLastScanAt,
} from '../utils/storage.js';

// Update this to your Vercel frontend URL once deployed in Step 18
const DASHBOARD_URL = 'https://leadsnap.vercel.app';
const API_URL = 'https://leadsnap-backend-production.up.railway.app';

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

const groupInput = document.getElementById('group-input');
const groupList  = document.getElementById('group-list');
const groupError = document.getElementById('group-error');
const trialNote  = document.getElementById('trial-note');

// ── State ─────────────────────────────────────────────────────────────────────

let token = null;
let keywords = [];
let groups = [];

// ── Boot ──────────────────────────────────────────────────────────────────────

async function init() {
  showView('loading');
  token = await getAuthToken();
  if (!token) { showView('logged-out'); return; }
  showView('logged-in');
  await Promise.all([loadStatus(), loadKeywords(), loadGroups()]);
}

// ── Storage sync helpers ──────────────────────────────────────────────────────

function syncKeywordsToStorage() {
  return chrome.storage.sync.set({ keywords: keywords.map((k) => k.keyword) });
}

function syncGroupsToStorage() {
  return chrome.storage.sync.set({ groups: groups.map((g) => g.facebook_group_url) });
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
  const [scanningEnabled, lastScanAt, { status: subStatus }] = await Promise.all([
    new Promise((r) => chrome.storage.sync.get('scanning_enabled', (d) => r(d.scanning_enabled !== false))),
    getLastScanAt(),
    getSubscriptionStatus(),
  ]);

  toggleScanning.checked   = scanningEnabled;
  statKeywords.textContent = keywords.length || '—';
  statGroups.textContent   = groups.length   || '—';
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

async function loadGroups() {
  try {
    groups = await apiGetGroups(token);
    await syncGroupsToStorage();
  } catch {
    const cached = await new Promise((r) => chrome.storage.sync.get('groups', (d) => r(d.groups || [])));
    groups = cached.map((url) => ({ facebook_group_url: url }));
  }
  renderGroups();
  statGroups.textContent = groups.length;

  const { status: subStatus } = await getSubscriptionStatus();
  if (subStatus === 'trial') trialNote.classList.remove('hidden');
}

function renderGroups() {
  if (!groups.length) {
    groupList.innerHTML = '<li class="empty-msg">No groups yet. Add one above.</li>';
    return;
  }
  groupList.innerHTML = groups.map((g) => `
    <li>
      <div class="item-text">
        <div>${escHtml(g.group_name || 'Unnamed group')}</div>
        <div class="item-sub">${escHtml(shortUrl(g.facebook_group_url))}</div>
      </div>
      ${g.id ? `<button class="btn-remove" data-id="${g.id}" title="Remove">×</button>` : ''}
    </li>
  `).join('');
  groupList.querySelectorAll('.btn-remove').forEach((btn) =>
    btn.addEventListener('click', () => removeGroup(btn.dataset.id))
  );
}

async function addGroup() {
  const url = groupInput.value.trim();
  if (!url) return;

  setInlineError(groupError, null);
  const btn = document.getElementById('btn-add-group');
  btn.disabled = true;
  try {
    const created = await apiAddGroup(token, url);
    groups.push(created);
    groupInput.value = '';
    renderGroups();
    statGroups.textContent = groups.length;
    await syncGroupsToStorage();
  } catch (err) {
    const msg = err.code === 'TRIAL_LIMIT'
      ? 'Trial plan is limited to 5 groups. Upgrade to add more.'
      : err.message;
    setInlineError(groupError, msg);
  } finally {
    btn.disabled = false;
  }
}

async function removeGroup(id) {
  try {
    await apiDeleteGroup(token, id);
    groups = groups.filter((g) => g.id !== id);
    renderGroups();
    statGroups.textContent = groups.length;
    await syncGroupsToStorage();
  } catch (err) {
    setInlineError(groupError, err.message);
  }
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

function setInlineError(el, msg) {
  if (msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
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

document.getElementById('btn-add-group').addEventListener('click', addGroup);
groupInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addGroup(); });

toggleScanning.addEventListener('change', (e) => {
  setScanningEnabled(e.target.checked);
  statusDot.className = `dot ${e.target.checked ? 'dot-active' : 'dot-inactive'}`;
});

// ── Go ────────────────────────────────────────────────────────────────────────

init();
