// LeadSnap onboarding wizard (ES module)

const MAX_GROUPS = 25;

// ── State ─────────────────────────────────────────────────────────────────────
let currentStep         = 1;
let allDiscoveredGroups = []; // [{ url, name, lastVisited }]
let selectedGroupUrls   = new Set();
let keywords            = [];  // string[]

// ── DOM refs ──────────────────────────────────────────────────────────────────
const dots          = [1, 2, 3].map((n) => document.getElementById(`dot-${n}`));
const panels        = [1, 2, 3].map((n) => document.getElementById(`step-${n}`));

const groupsCounter = document.getElementById('groups-counter');
const groupsMsg     = document.getElementById('groups-msg');
const groupsList    = document.getElementById('groups-list');
const btnLoadGroups = document.getElementById('btn-load-groups');

const keywordInput  = document.getElementById('keyword-input');
const btnAddKw      = document.getElementById('btn-add-kw');
const keywordChips  = document.getElementById('keyword-chips');

const aiTextarea    = document.getElementById('ai-description');

// ── Navigation ────────────────────────────────────────────────────────────────

function goTo(step) {
  // Update panels
  panels.forEach((p, i) => p.classList.toggle('visible', i + 1 === step));

  // Update dots
  dots.forEach((d, i) => {
    d.classList.remove('active', 'complete');
    if (i + 1 < step)  d.classList.add('complete');
    if (i + 1 === step) d.classList.add('active');
  });

  currentStep = step;
}

document.getElementById('btn-step1-next').addEventListener('click', () => goTo(2));
document.getElementById('btn-step2-back').addEventListener('click', () => goTo(1));
document.getElementById('btn-step2-next').addEventListener('click', () => goTo(3));
document.getElementById('btn-step3-back').addEventListener('click', () => goTo(2));
document.getElementById('skip-1').addEventListener('click', () => goTo(2));
document.getElementById('skip-2').addEventListener('click', () => goTo(3));

// ── Step 1: Groups ────────────────────────────────────────────────────────────

btnLoadGroups.addEventListener('click', scanForGroups);

async function scanForGroups() {
  btnLoadGroups.disabled   = true;
  btnLoadGroups.textContent = 'Loading…';
  setGroupsMsg('');

  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.facebook.com/*' });

    if (!tabs.length) {
      setGroupsMsg('Open Facebook in Chrome first, then click "Load my groups".', true);
      return;
    }

    // Prefer groups feed page; any FB tab works because sidebar is universal
    const tab = tabs.find((t) => t.url.includes('/groups')) || tabs[0];

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: 'LEADSNAP_GET_GROUPS' });
    } catch {
      setGroupsMsg('Could not reach the Facebook tab. Reload Facebook and try again.', true);
      return;
    }

    const fetched = response?.groups ?? [];
    if (!fetched.length) {
      setGroupsMsg('No groups found. Try opening facebook.com/groups/feed.', true);
      return;
    }

    // Merge — preserve existing, append new
    const knownUrls = new Set(allDiscoveredGroups.map((g) => g.url));
    for (const g of fetched) {
      if (!knownUrls.has(g.url)) {
        allDiscoveredGroups.push(g);
        knownUrls.add(g.url);
      }
    }

    setGroupsMsg(`${allDiscoveredGroups.length} group${allDiscoveredGroups.length !== 1 ? 's' : ''} found — select up to ${MAX_GROUPS} to monitor.`);
    renderGroupsList();
  } finally {
    btnLoadGroups.disabled   = false;
    btnLoadGroups.textContent = 'Load my groups';
  }
}

function renderGroupsList() {
  groupsCounter.textContent = `${selectedGroupUrls.size}/${MAX_GROUPS} selected`;

  if (!allDiscoveredGroups.length) {
    groupsList.innerHTML = '<div class="empty-state">No groups loaded yet.</div>';
    return;
  }

  const atMax = selectedGroupUrls.size >= MAX_GROUPS;

  groupsList.innerHTML = allDiscoveredGroups.map((g, i) => {
    const checked = selectedGroupUrls.has(g.url);
    const dimmed  = !checked && atMax;
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
      renderGroupsList();
    });
  });
}

function setGroupsMsg(msg, isError = false) {
  groupsMsg.textContent = msg;
  groupsMsg.classList.toggle('error', isError);
}

// ── Step 2: Keywords ──────────────────────────────────────────────────────────

btnAddKw.addEventListener('click', addKeyword);
keywordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addKeyword(); });

function addKeyword() {
  const kw = keywordInput.value.trim().toLowerCase();
  if (!kw || keywords.includes(kw)) return;
  keywords.push(kw);
  keywordInput.value = '';
  renderKeywordChips();
}

function removeKeyword(kw) {
  keywords = keywords.filter((k) => k !== kw);
  renderKeywordChips();
}

function renderKeywordChips() {
  if (!keywords.length) {
    keywordChips.innerHTML = '<span style="color:#9ca3af;font-size:12px">None yet</span>';
    return;
  }
  keywordChips.innerHTML = keywords.map((k) => `
    <span class="chip">
      ${escHtml(k)}
      <button class="chip-remove" data-kw="${escHtml(k)}" title="Remove">×</button>
    </span>
  `).join('');
  keywordChips.querySelectorAll('.chip-remove').forEach((btn) =>
    btn.addEventListener('click', () => removeKeyword(btn.dataset.kw))
  );
}

// ── Finish ────────────────────────────────────────────────────────────────────

document.getElementById('btn-finish').addEventListener('click', async () => {
  const btn = document.getElementById('btn-finish');
  btn.disabled   = true;
  btn.textContent = 'Saving…';

  try {
    const selectedGroups = allDiscoveredGroups.filter((g) => selectedGroupUrls.has(g.url));
    const aiDescription  = aiTextarea.value.trim();

    // Save everything to chrome.storage.sync atomically
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set(
        {
          selected_groups:     selectedGroups,
          keywords:            keywords,
          ai_description:      aiDescription,
          onboarding_complete: true,
        },
        () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        }
      );
    });

    // Done — close this tab; user opens the extension popup to start
    window.close();
  } catch (err) {
    btn.disabled   = false;
    btn.textContent = 'Finish Setup ✓';
    alert('Failed to save: ' + err.message);
  }
});

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shortUrl(url) {
  try { return new URL(url).pathname.replace(/\/$/, ''); }
  catch { return url; }
}
