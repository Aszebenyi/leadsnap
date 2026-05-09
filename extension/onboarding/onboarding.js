// LeadSnap onboarding wizard — 7-step flow (ES module)

const MAX_GROUPS   = 25;
const TOTAL_STEPS  = 7;
const FB_TAB_TIMEOUT_MS = 8_000;

// ── State ─────────────────────────────────────────────────────────────────────
let currentStep            = 1;
let allDiscoveredGroups    = []; // [{ url, name, lastVisited }]
let selectedGroupUrls      = new Set();
let keywords               = []; // string[]
let extractedDescription   = ''; // pre-fill for Step 5 from website extraction
let extractedWebsiteUrl    = ''; // URL entered in Step 4 (carried to Step 7)
let suggestedKeywordStates = {}; // { kw: boolean } — true = selected

// ── DOM refs ──────────────────────────────────────────────────────────────────
const dots   = Array.from({ length: TOTAL_STEPS }, (_, i) =>
  document.getElementById(`dot-${i + 1}`)
);
const panels = Array.from({ length: TOTAL_STEPS }, (_, i) =>
  document.getElementById(`step-${i + 1}`)
);

// Step 1
const btnConnectFb     = document.getElementById('btn-connect-fb');
const fbStatus         = document.getElementById('fb-status');
const step1ActionRow   = document.getElementById('step1-action-row');

// Step 2
const groupsCounter    = document.getElementById('groups-counter');
const groupsMsg        = document.getElementById('groups-msg');
const groupsList       = document.getElementById('groups-list');
const btnReloadGroups  = document.getElementById('btn-reload-groups');

// Step 3
const keywordInput     = document.getElementById('keyword-input');
const btnAddKw         = document.getElementById('btn-add-kw');
const keywordChips     = document.getElementById('keyword-chips');

// Step 4
const websiteInput     = document.getElementById('website-input');
const btnExtract       = document.getElementById('btn-extract');
const extractStatus    = document.getElementById('extract-status');
const extractedCard    = document.getElementById('extracted-card');
const extractedName    = document.getElementById('extracted-name');
const extractedLoc     = document.getElementById('extracted-location');
const extractedDesc    = document.getElementById('extracted-desc');
const suggestedChips   = document.getElementById('suggested-chips');

// Step 5
const aiTextarea       = document.getElementById('ai-description');

// Step 6
const phoneInput       = document.getElementById('phone-input');

// Step 7
const includeToggle    = document.getElementById('include-website-toggle');
const finalWebsiteUrl  = document.getElementById('final-website-url');
const finishLoading    = document.getElementById('finish-loading');
const step7ActionRow   = document.getElementById('step7-action-row');

// ── Navigation ────────────────────────────────────────────────────────────────

function goTo(step) {
  panels.forEach((p, i) => p.classList.toggle('visible', i + 1 === step));
  dots.forEach((d, i) => {
    d.classList.remove('active', 'complete');
    if (i + 1 < step)  d.classList.add('complete');
    if (i + 1 === step) d.classList.add('active');
  });
  currentStep = step;

  // Pre-fill Step 5 textarea if we have an extracted description
  if (step === 5 && extractedDescription && !aiTextarea.value) {
    aiTextarea.value = extractedDescription;
  }
  // Pre-fill Step 7 website URL from Step 4 entry
  if (step === 7 && extractedWebsiteUrl && !finalWebsiteUrl.value) {
    finalWebsiteUrl.value = extractedWebsiteUrl;
  }
}

// ── Step 1: Connect Facebook ──────────────────────────────────────────────────

btnConnectFb.addEventListener('click', connectFacebook);

async function connectFacebook() {
  setFbStatus('loading', 'Opening Facebook…');
  btnConnectFb.disabled = true;

  let fbTabId = null;

  try {
    // Open the Facebook groups feed
    const tab = await chrome.tabs.create({ url: 'https://www.facebook.com/groups/feed', active: true });
    fbTabId = tab.id;

    // Wait for the tab to finish loading (with timeout)
    await waitForTabComplete(fbTabId, FB_TAB_TIMEOUT_MS);

    setFbStatus('loading', 'Loading your groups…');

    // Ask the content script to scrape the groups
    let response;
    try {
      response = await chrome.tabs.sendMessage(fbTabId, { type: 'LEADSNAP_GET_GROUPS' });
    } catch {
      throw new Error('Could not reach Facebook tab. Make sure you\'re logged in.');
    }

    const fetched = response?.groups ?? [];
    if (!fetched.length) {
      throw new Error('No groups found. Make sure you\'re a member of at least one group.');
    }

    // Merge into allDiscoveredGroups
    const knownUrls = new Set(allDiscoveredGroups.map((g) => g.url));
    for (const g of fetched) {
      if (!knownUrls.has(g.url)) {
        allDiscoveredGroups.push(g);
        knownUrls.add(g.url);
      }
    }

    const count = allDiscoveredGroups.length;
    setFbStatus('success', `✓ ${count} group${count !== 1 ? 's' : ''} found`);
    step1ActionRow.style.display = 'flex';

    // Auto-advance after a short pause
    setTimeout(() => goTo(2), 800);

  } catch (err) {
    setFbStatus('error', err.message || 'Something went wrong. Try again.');
    btnConnectFb.disabled = false;
  }
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(); // Timeout — proceed anyway; tab may already be loaded
    }, timeoutMs);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        // Small grace period for JS to render
        setTimeout(resolve, 600);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function setFbStatus(type, text) {
  fbStatus.className = `fb-status ${type}`;
  if (type === 'loading') {
    fbStatus.innerHTML = `<div class="spinner"></div>${escHtml(text)}`;
  } else {
    fbStatus.textContent = text;
  }
}

document.getElementById('btn-step1-next').addEventListener('click', () => goTo(2));
document.getElementById('skip-1').addEventListener('click', () => goTo(2));

// ── Step 2: Select Groups ─────────────────────────────────────────────────────

btnReloadGroups.addEventListener('click', reloadGroups);

async function reloadGroups() {
  btnReloadGroups.disabled = true;
  btnReloadGroups.textContent = 'Loading…';
  setGroupsMsg('');

  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.facebook.com/*' });

    if (!tabs.length) {
      setGroupsMsg('Open Facebook in Chrome first, then click "Reload groups".', true);
      return;
    }

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
    btnReloadGroups.disabled = false;
    btnReloadGroups.textContent = 'Reload groups';
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

// Also render on page load if groups were already discovered in Step 1
function initStep2() {
  if (allDiscoveredGroups.length) renderGroupsList();
}

function setGroupsMsg(msg, isError = false) {
  groupsMsg.textContent = msg;
  groupsMsg.classList.toggle('error', isError);
}

document.getElementById('btn-step2-back').addEventListener('click', () => goTo(1));
document.getElementById('btn-step2-next').addEventListener('click', () => { initStep2(); goTo(3); });

// ── Step 3: Keywords ──────────────────────────────────────────────────────────

btnAddKw.addEventListener('click', addKeyword);
keywordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addKeyword(); });

function addKeyword(kw) {
  const val = typeof kw === 'string' ? kw : keywordInput.value.trim().toLowerCase();
  if (!val || keywords.includes(val)) {
    if (typeof kw !== 'string') keywordInput.value = '';
    return;
  }
  keywords.push(val);
  if (typeof kw !== 'string') keywordInput.value = '';
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

document.getElementById('btn-step3-back').addEventListener('click', () => goTo(2));
document.getElementById('btn-step3-next').addEventListener('click', () => goTo(4));
document.getElementById('skip-3').addEventListener('click', () => goTo(4));

// ── Step 4: Website Extractor ─────────────────────────────────────────────────

btnExtract.addEventListener('click', extractWebsite);
websiteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') extractWebsite(); });

async function extractWebsite() {
  const url = websiteInput.value.trim();
  if (!url) {
    setExtractStatus('error', 'Please enter a website URL.');
    return;
  }

  // Basic URL validation
  let parsedUrl;
  try {
    parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    websiteInput.value = parsedUrl.href;
  } catch {
    setExtractStatus('error', 'That doesn\'t look like a valid URL.');
    return;
  }

  btnExtract.disabled = true;
  extractedCard.classList.remove('visible');
  setExtractStatus('loading', 'Extracting info from your website…');

  try {
    const token = await getAuthToken();
    if (!token) throw new Error('Not signed in. Please close and sign in first.');

    const result = await callExtractWebsite(token, parsedUrl.href);

    // Store the URL for use in Step 7
    extractedWebsiteUrl = parsedUrl.href;

    // Populate the extracted card
    extractedName.textContent     = result.business_name || '';
    extractedName.style.display   = result.business_name ? 'block' : 'none';
    extractedLoc.textContent      = result.location || '';
    extractedLoc.style.display    = result.location ? 'block' : 'none';
    extractedDesc.value           = result.service_description || '';

    // Store for pre-fill of Step 5
    extractedDescription = result.service_description || '';

    // Render suggested keyword chips
    const suggested = result.suggested_keywords || [];
    suggestedKeywordStates = {};
    suggested.forEach((kw) => { suggestedKeywordStates[kw] = false; });
    renderSuggestedChips(suggested);

    extractedCard.classList.add('visible');
    setExtractStatus('', '');

  } catch (err) {
    setExtractStatus('error', err.message || 'Extraction failed. You can skip this step.');
  } finally {
    btnExtract.disabled = false;
  }
}

function renderSuggestedChips(suggested) {
  if (!suggested.length) {
    suggestedChips.innerHTML = '<span style="color:#9ca3af;font-size:11px">No suggestions</span>';
    return;
  }
  suggestedChips.innerHTML = suggested.map((kw) => `
    <span class="chip-suggestion${suggestedKeywordStates[kw] ? ' selected' : ''}" data-kw="${escHtml(kw)}">
      ${escHtml(kw)}
    </span>
  `).join('');
  suggestedChips.querySelectorAll('.chip-suggestion').forEach((chip) => {
    chip.addEventListener('click', () => {
      const kw = chip.dataset.kw;
      suggestedKeywordStates[kw] = !suggestedKeywordStates[kw];
      chip.classList.toggle('selected', suggestedKeywordStates[kw]);
    });
  });
}

function setExtractStatus(type, text) {
  if (!type && !text) {
    extractStatus.textContent = '';
    extractStatus.className = 'extract-status';
    return;
  }
  extractStatus.className = `extract-status${type === 'error' ? ' error' : ''}`;
  if (type === 'loading') {
    extractStatus.innerHTML = `<div class="spinner"></div>${escHtml(text)}`;
  } else {
    extractStatus.textContent = text;
  }
}

document.getElementById('btn-step4-back').addEventListener('click', () => goTo(3));
document.getElementById('btn-step4-next').addEventListener('click', () => {
  // Merge selected suggested keywords into keywords list
  Object.entries(suggestedKeywordStates).forEach(([kw, selected]) => {
    if (selected && !keywords.includes(kw)) keywords.push(kw);
  });
  // Update extractedDescription from textarea in case user edited it
  if (extractedDesc.value.trim()) extractedDescription = extractedDesc.value.trim();
  renderKeywordChips();
  goTo(5);
});
document.getElementById('skip-4').addEventListener('click', () => goTo(5));

// ── Step 5: AI Description ────────────────────────────────────────────────────

document.getElementById('btn-step5-back').addEventListener('click', () => goTo(4));
document.getElementById('btn-step5-next').addEventListener('click', () => goTo(6));
document.getElementById('skip-5').addEventListener('click', () => goTo(6));

// ── Step 6: Phone Number ──────────────────────────────────────────────────────

document.getElementById('btn-step6-back').addEventListener('click', () => goTo(5));
document.getElementById('btn-step6-next').addEventListener('click', () => goTo(7));
document.getElementById('skip-6').addEventListener('click', () => goTo(7));

// ── Step 7: Finish ────────────────────────────────────────────────────────────

document.getElementById('btn-step7-back').addEventListener('click', () => goTo(6));
document.getElementById('btn-start-monitoring').addEventListener('click', finishOnboarding);

async function finishOnboarding() {
  // Show loading state
  finishLoading.classList.add('visible');
  step7ActionRow.style.display = 'none';

  try {
    const selectedGroups   = allDiscoveredGroups.filter((g) => selectedGroupUrls.has(g.url));
    const aiDescription    = aiTextarea.value.trim();
    const phoneNumber      = phoneInput.value.trim();
    const websiteUrl       = finalWebsiteUrl.value.trim() || extractedWebsiteUrl || '';
    const includeWebsite   = includeToggle.checked;

    // ── 1. Save all settings to chrome.storage.sync atomically ──────────────
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set(
        {
          selected_groups:              selectedGroups,
          keywords:                     keywords,
          ai_description:               aiDescription,
          phone_number:                 phoneNumber,
          website_url:                  websiteUrl,
          include_website_in_replies:   includeWebsite,
          onboarding_complete:          true,
        },
        () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        }
      );
    });

    // ── 2. Save profile to backend if phone number or description provided ───
    if (phoneNumber || aiDescription) {
      try {
        const token = await getAuthToken();
        if (token) {
          const updates = {};
          if (phoneNumber) updates.phone_number = phoneNumber;
          if (aiDescription) updates.service_description = aiDescription;
          await callUpdateProfile(token, updates);
        }
      } catch (err) {
        // Non-fatal — storage already saved; profile sync can retry
        console.warn('[LeadSnap] Profile save failed:', err.message);
      }
    }

    // ── 3. Trigger a silent first scan in the background ────────────────────
    try {
      chrome.runtime.sendMessage({ type: 'LEADSNAP_MANUAL_SCAN' });
    } catch {
      // Extension background may not be ready yet — that's fine
    }

    // ── 4. Close this tab ────────────────────────────────────────────────────
    window.close();

  } catch (err) {
    finishLoading.classList.remove('visible');
    step7ActionRow.style.display = 'flex';
    alert('Failed to save settings: ' + err.message);
  }
}

// ── API helpers (inline so we don't need ES module imports from extension utils) ──

async function getAuthToken() {
  return new Promise((resolve) =>
    chrome.storage.sync.get('auth_token', (d) => resolve(d.auth_token ?? null))
  );
}

async function callExtractWebsite(token, url) {
  const res = await fetch('https://leadsnap-backend-production.up.railway.app/api/profile/extract-website', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }
  return res.json();
}

async function callUpdateProfile(token, updates) {
  const res = await fetch('https://leadsnap-backend-production.up.railway.app/api/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }
  return res.json();
}

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
