// LeadSnap onboarding wizard — 6-step flow (ES module)
import { API_URL, FACEBOOK_APP_ID } from '../utils/config.js';
import {
  getKeywords  as apiGetKeywords,
  addKeyword   as apiAddKeyword,
  deleteKeyword as apiDeleteKeyword,
  getGroups    as apiGetGroups,
  addGroup     as apiAddGroup,
  deleteGroup  as apiDeleteGroup,
} from '../utils/api.js';

const MAX_GROUPS  = 25;
const TOTAL_STEPS = 7;

// ── Utilities (defined early so everything below can use them) ────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── State ─────────────────────────────────────────────────────────────────────
let currentStep            = 1;
let allDiscoveredGroups    = []; // [{ url, name }]
let selectedGroupUrls      = new Set();
let groupSearchQuery       = ''; // live filter for the Step 2 groups list
let keywords               = []; // string[]
let extractedDescription   = ''; // pre-fill for Step 5 from website extraction
let extractedWebsiteUrl    = ''; // URL entered in Step 4
let suggestedKeywordStates = {}; // { kw: boolean } — true = selected
let fbAccessToken          = null; // Facebook Graph API token, cached after OAuth
let alertChannel           = 'sms'; // 'sms' | 'whatsapp'

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
const groupsSearch     = document.getElementById('groups-search');
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
// Toggle lives in Step 3 now
const includeToggle    = document.getElementById('include-website-toggle');

// Step 5
const aiTextarea       = document.getElementById('ai-description');
const step5AiStatus    = document.getElementById('step5-ai-status');
const step5Error       = document.getElementById('step5-error');

// Step 6
const finishLoading    = document.getElementById('finish-loading');
const step6ActionRow   = document.getElementById('step6-action-row');

// ── Navigation ────────────────────────────────────────────────────────────────

const stepLines         = document.querySelectorAll('.step-line');
const stepProgressLabel = document.getElementById('step-progress-label');

function goTo(step) {
  panels.forEach((p, i) => p.classList.toggle('visible', i + 1 === step));
  dots.forEach((d, i) => {
    d.classList.remove('active', 'complete');
    if (i + 1 < step)  d.classList.add('complete');
    if (i + 1 === step) d.classList.add('active');
  });
  stepLines.forEach((l, i) => l.classList.toggle('complete', i + 1 < step));
  if (stepProgressLabel) stepProgressLabel.textContent = `Step ${step} of ${TOTAL_STEPS}`;
  currentStep = step;

  // Step 5: auto-generate ideal-lead description via Claude
  if (step === 5 && !aiTextarea.value.trim()) {
    autoSuggestDescription();
  }
}

// ── Step 1: Connect Facebook ──────────────────────────────────────────────────

// Redirect URI for Facebook OAuth — must match what's registered in the Facebook App.
const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;


btnConnectFb.addEventListener('click', connectFacebook);

// ── PKCE helpers ──────────────────────────────────────────────────────────────

async function generatePKCE() {
  // Random 32-byte code verifier, base64url-encoded (no padding)
  const raw         = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const codeVerifier = btoa(String.fromCharCode(...raw))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  // SHA-256 of verifier → base64url (the challenge)
  const digest       = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return { codeVerifier, codeChallenge };
}

async function connectFacebook() {
  setFbStatus('loading', 'Opening Facebook login…');
  btnConnectFb.disabled = true;

  try {
    // ── 1. Build PKCE auth URL (response_type=code — implicit flow deprecated) ─
    const { codeVerifier, codeChallenge } = await generatePKCE();

    const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    authUrl.searchParams.set('client_id',            FACEBOOK_APP_ID);
    authUrl.searchParams.set('redirect_uri',         redirectUri);
    authUrl.searchParams.set('response_type',        'code');
    authUrl.searchParams.set('code_challenge',       codeChallenge);
    authUrl.searchParams.set('code_challenge_method','S256');
    authUrl.searchParams.set('display',              'popup');
    // user_managed_groups → groups the user admins/moderates
    // groups_access_member_info requires App Review; omit until published
    authUrl.searchParams.set('scope', 'public_profile');

    let redirectUrl;
    try {
      redirectUrl = await chrome.identity.launchWebAuthFlow({
        url:         authUrl.toString(),
        interactive: true,
      });
    } catch {
      throw new Error('Facebook login was cancelled or blocked. Please try again.');
    }

    // ── 2. Extract auth code from redirect URL query params ────────────────────
    const code = new URL(redirectUrl).searchParams.get('code');
    if (!code) throw new Error('No authorisation code received. Please try again.');

    // ── 3. Exchange code for access token (PKCE — no client secret required) ──
    setFbStatus('loading', 'Getting access token…');
    const tokenRes = await fetch(
      'https://graph.facebook.com/v18.0/oauth/access_token?' +
      new URLSearchParams({ client_id: FACEBOOK_APP_ID, redirect_uri: redirectUri, code_verifier: codeVerifier, code })
    );
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error?.message ?? 'Token exchange failed. Please try again.');
    }
    const token = tokenData.access_token;
    fbAccessToken = token;

    // ── 4. Fetch groups from Graph API ─────────────────────────────────────────
    setFbStatus('loading', 'Fetching your groups…');
    const fetched = await fetchFacebookGroups(token);

    if (!fetched.length) {
      setFbStatus('success', '✓ Connected — no groups found (you can add them manually)');
      step1ActionRow.style.display = 'flex';
      setTimeout(() => goTo(2), 1200);
      return;
    }

    // ── 4. Merge into allDiscoveredGroups and advance ──────────────────────────
    const knownUrls = new Set(allDiscoveredGroups.map((g) => g.url));
    for (const g of fetched) {
      if (!knownUrls.has(g.url)) { allDiscoveredGroups.push(g); knownUrls.add(g.url); }
    }
    renderGroupsList();

    const count = allDiscoveredGroups.length;
    setFbStatus('success', `✓ ${count} group${count !== 1 ? 's' : ''} found`);
    step1ActionRow.style.display = 'flex';
    setTimeout(() => goTo(2), 800);

  } catch (err) {
    setFbStatus('error', err.message || 'Something went wrong. Try again.');
    btnConnectFb.disabled = false;
  }
}

/**
 * Fetch all Facebook groups via the Graph API with cursor pagination.
 * Returns [{ url, name }]. Soft-fails on permission errors.
 */
async function fetchFacebookGroups(token) {
  const groups  = [];
  const MAX     = 500;
  let   nextUrl = `https://graph.facebook.com/v18.0/me/groups?fields=id,name&limit=100&access_token=${encodeURIComponent(token)}`;

  while (nextUrl && groups.length < MAX) {
    const res  = await fetch(nextUrl);
    const body = await res.json();

    if (!res.ok) {
      const msg = body?.error?.message ?? `Graph API error ${res.status}`;
      // Insufficient permission → soft fail (user may still add groups manually)
      if (body?.error?.code === 200 || body?.error?.type === 'OAuthException') {
        console.warn('[LeadSnap] Facebook groups permission not granted:', msg);
        break;
      }
      throw new Error(msg);
    }

    for (const g of body.data ?? []) {
      groups.push({ url: `https://www.facebook.com/groups/${g.id}/`, name: g.name });
    }
    nextUrl = body.paging?.next ?? null;
  }

  return groups;
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

groupsSearch.addEventListener('input', (e) => {
  groupSearchQuery = e.target.value.trim().toLowerCase();
  renderGroupsList();
});

async function reloadGroups() {
  btnReloadGroups.disabled    = true;
  btnReloadGroups.textContent = 'Loading…';
  setGroupsMsg('');
  showGroupsProgress(true, 'Loading your groups…');

  let winId = null;
  let tabId = null;
  try {
    // Open Facebook in a tiny off-screen popup window.
    // focused:false means it won't steal keyboard focus or jump the user away.
    // left is pushed past the right edge of the screen so it's never visible.
    const screenWidth = window.screen?.availWidth ?? 1920;
    const win = await chrome.windows.create({
      url:     'https://www.facebook.com/groups/joins',
      type:    'popup',
      focused: false,
      width:   1024,
      height:  768,
      left:    screenWidth + 100,
      top:     0,
    });
    winId = win.id;
    tabId = win.tabs[0].id;

    showGroupsProgress(true, 'Waiting for Facebook to load…');
    await waitForTabComplete(tabId, 15000);
    await sleep(2000);

    showGroupsProgress(true, 'Scanning your groups list…');

    let fetched = [];
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type: 'LEADSNAP_SCROLL_EXTRACT_GROUPS' });
      fetched = res?.groups ?? [];
    } catch (err) {
      console.warn('[LeadSnap] Scroll-extract failed, falling back to instant extract:', err.message);
      try {
        const res = await chrome.tabs.sendMessage(tabId, { type: 'LEADSNAP_GET_GROUPS' });
        fetched = res?.groups ?? [];
      } catch { /* still not ready */ }
    }

    chrome.windows.remove(winId).catch(() => {});
    winId = null;
    tabId = null;

    showGroupsProgress(false);

    if (!fetched.length) {
      setGroupsMsg('No groups found — make sure you\'re logged into Facebook.', true);
      return;
    }

    const knownUrls = new Set(allDiscoveredGroups.map((g) => g.url));
    for (const g of fetched) {
      if (!knownUrls.has(g.url)) { allDiscoveredGroups.push(g); knownUrls.add(g.url); }
    }

    setGroupsMsg(`${allDiscoveredGroups.length} group${allDiscoveredGroups.length !== 1 ? 's' : ''} found — select up to ${MAX_GROUPS} to monitor.`);
    renderGroupsList();

  } catch (err) {
    showGroupsProgress(false);
    setGroupsMsg('Could not load groups: ' + err.message, true);
  } finally {
    if (winId) chrome.windows.remove(winId).catch(() => {});
    else if (tabId) chrome.tabs.remove(tabId).catch(() => {});
    btnReloadGroups.disabled    = false;
    btnReloadGroups.textContent = 'Load my groups';
  }
}

/** Waits for a tab to reach status=complete, with a timeout fallback. */
function waitForTabComplete(tabId, timeoutMs) {
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

function renderGroupsList() {
  groupsCounter.textContent = `${selectedGroupUrls.size}/${MAX_GROUPS} selected`;

  if (!allDiscoveredGroups.length) {
    groupsList.innerHTML = '<div class="empty-state">No groups loaded yet.</div>';
    groupsSearch.style.display = 'none';
    return;
  }

  // Show search bar once groups are loaded
  groupsSearch.style.display = 'block';

  // Apply search filter — allDiscoveredGroups is never mutated so selections survive
  const visible = groupSearchQuery
    ? allDiscoveredGroups.filter((g) => g.name.toLowerCase().includes(groupSearchQuery))
    : allDiscoveredGroups;

  const atMax = selectedGroupUrls.size >= MAX_GROUPS;

  if (!visible.length) {
    groupsList.innerHTML = '<div class="empty-state">No groups match your search.</div>';
    return;
  }

  // Use the original index into allDiscoveredGroups so checkbox handler resolves correctly
  groupsList.innerHTML = visible.map((g) => {
    const i       = allDiscoveredGroups.indexOf(g);
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

function showGroupsProgress(visible, label = '') {
  const wrap = document.getElementById('groups-progress-wrap');
  const lbl  = document.getElementById('groups-progress-label');
  if (!wrap) return;
  wrap.style.display = visible ? 'flex' : 'none';
  if (lbl && label) lbl.textContent = label;
}

document.getElementById('btn-step2-back').addEventListener('click', () => goTo(1));
document.getElementById('btn-step2-next').addEventListener('click', () => goTo(3));

// ── Step 3: Keywords ──────────────────────────────────────────────────────────

btnAddKw.addEventListener('click', addKeyword);
keywordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addKeyword(); });

function addKeyword(kwOverride) {
  const val = typeof kwOverride === 'string' ? kwOverride : keywordInput.value.trim().toLowerCase();
  if (!val || keywords.includes(val)) {
    if (typeof kwOverride !== 'string') keywordInput.value = '';
    return;
  }
  keywords.push(val);
  if (typeof kwOverride !== 'string') keywordInput.value = '';
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
document.getElementById('btn-step3-next').addEventListener('click', () => {
  // Merge selected suggested keywords into main keyword list
  Object.entries(suggestedKeywordStates).forEach(([kw, selected]) => {
    if (selected && !keywords.includes(kw)) keywords.push(kw);
  });
  // Capture any manual edits to the extracted description textarea
  if (extractedDesc.value.trim()) extractedDescription = extractedDesc.value.trim();
  // Store website URL from the extract input (user may have typed but not clicked Extract)
  if (!extractedWebsiteUrl && websiteInput.value.trim()) {
    extractedWebsiteUrl = websiteInput.value.trim();
  }
  renderKeywordChips();
  goTo(4);
});
document.getElementById('skip-3').addEventListener('click', () => goTo(4));

// ── Step 3: Website Extractor + Toggle ───────────────────────────────────────

btnExtract.addEventListener('click', extractWebsite);
websiteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') extractWebsite(); });

async function extractWebsite() {
  const url = websiteInput.value.trim();
  if (!url) {
    setExtractStatus('error', 'Please enter a website URL.');
    return;
  }

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

    extractedWebsiteUrl = parsedUrl.href;

    extractedName.textContent   = result.business_name || '';
    extractedName.style.display = result.business_name ? 'block' : 'none';
    extractedLoc.textContent    = result.location || '';
    extractedLoc.style.display  = result.location ? 'block' : 'none';
    extractedDesc.value         = result.service_description || '';
    extractedDescription        = result.service_description || '';

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
    extractStatus.className   = 'extract-status';
    return;
  }
  extractStatus.className = `extract-status${type === 'error' ? ' error' : ''}`;
  if (type === 'loading') {
    extractStatus.innerHTML = `<div class="spinner"></div>${escHtml(text)}`;
  } else {
    extractStatus.textContent = text;
  }
}

// ── Step 4: Keywords ─────────────────────────────────────────────────────────

document.getElementById('btn-step4-back').addEventListener('click', () => goTo(3));
document.getElementById('btn-step4-next').addEventListener('click', () => goTo(5));
document.getElementById('skip-4').addEventListener('click', () => goTo(5));

// ── Step 5: AI Description ────────────────────────────────────────────────────

document.getElementById('btn-step5-back').addEventListener('click', () => goTo(4));

document.getElementById('btn-step5-next').addEventListener('click', () => {
  step5Error.style.display = 'none';
  if (!aiTextarea.value.trim()) {
    step5Error.style.display = 'block';
    aiTextarea.focus();
    return;
  }
  goTo(6);
});

// Clear the validation error as soon as the user starts typing
aiTextarea.addEventListener('input', () => {
  if (aiTextarea.value.trim()) step5Error.style.display = 'none';
});

// ── Step 6: Phone + Finish ────────────────────────────────────────────────────

// Alert channel toggle (SMS / WhatsApp)
document.querySelectorAll('.alert-channel-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    alertChannel = btn.dataset.channel;
    document.querySelectorAll('.alert-channel-btn').forEach((b) =>
      b.classList.toggle('active', b.dataset.channel === alertChannel)
    );
  });
});

document.getElementById('btn-step6-back').addEventListener('click', () => goTo(5));
document.getElementById('btn-start-monitoring').addEventListener('click', () => goTo(7));
document.getElementById('skip-6').addEventListener('click', () => goTo(7));

async function finishOnboarding() {
  // Show loading state
  finishLoading.classList.add('visible');
  step6ActionRow.style.display  = 'none';
  const skipBtn = document.getElementById('skip-6');
  if (skipBtn) skipBtn.style.display = 'none';

  try {
    const selectedGroups = allDiscoveredGroups.filter((g) => selectedGroupUrls.has(g.url));
    const aiDescription  = aiTextarea.value.trim();
    const dialCode       = document.getElementById('phone-country').value;
    const rawNumber      = document.getElementById('phone-number').value.trim().replace(/\D/g, '');
    const phoneNumber    = rawNumber ? `${dialCode}${rawNumber}` : '';
    const websiteUrl     = extractedWebsiteUrl || websiteInput.value.trim() || '';
    const includeWebsite = includeToggle.checked;

    // ── 1. Save everything to chrome.storage.sync atomically ─────────────────
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set(
        {
          selected_groups:            selectedGroups,
          keywords:                   keywords,
          ai_description:             aiDescription,
          phone_number:               phoneNumber,
          alert_channel:              alertChannel,
          website_url:                websiteUrl,
          include_website_in_replies: includeWebsite,
          onboarding_complete:        true,
        },
        () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        }
      );
    });

    // ── 2. Save profile + sync keywords/groups to backend ────────────────────
    const token = await getAuthToken();
    if (token) {
      if (phoneNumber || aiDescription) {
        try {
          const updates = {};
          if (phoneNumber)   updates.phone_number        = phoneNumber;
          if (aiDescription) updates.service_description = aiDescription;
          await callUpdateProfile(token, updates);
        } catch (err) {
          console.warn('[LeadSnap] Profile save failed:', err.message);
        }
      }

      if (keywords.length) {
        try { await syncKeywordsToBackend(token, keywords); } catch { /* non-fatal */ }
      }
      if (selectedGroups.length) {
        try { await syncGroupsToBackend(token, selectedGroups); } catch { /* non-fatal */ }
      }
    }

    // Done — caller handles navigation (step 7 or window.close)

  } catch (err) {
    finishLoading.classList.remove('visible');
    step6ActionRow.style.display = 'flex';
    if (skipBtn) skipBtn.style.display = '';
    alert('Failed to save settings: ' + err.message);
    throw err; // re-throw so callers can detect failure
  }
}

// ── Backend sync helpers ──────────────────────────────────────────────────────

/**
 * Replace all backend keywords with the provided list.
 * Fetches existing keywords, deletes each, then POSTs the new ones.
 */
async function syncKeywordsToBackend(token, kwList) {
  const existing = await apiGetKeywords(token);
  await Promise.all(existing.map((kw) => apiDeleteKeyword(token, kw.id)));
  await Promise.all(kwList.map((kw)   => apiAddKeyword(token, kw)));
}

/**
 * Replace all backend groups with the provided list.
 * Fetches existing groups, deletes each, then POSTs the new ones.
 */
async function syncGroupsToBackend(token, groupList) {
  const existing = await apiGetGroups(token);
  await Promise.all(existing.map((g) => apiDeleteGroup(token, g.id)));
  await Promise.all(groupList.map((g) => apiAddGroup(token, g.url, g.name)));
}

// ── Step 5: Auto-suggest ideal-lead description ───────────────────────────────

async function autoSuggestDescription() {
  const hasDescription = extractedDescription.trim().length > 0;
  const hasKeywords    = keywords.length > 0;

  // Case C: nothing to work from → show a rich guided placeholder, no API call
  if (!hasDescription && !hasKeywords) {
    setStep5Status('');
    return;
  }

  // Cases A & B: call Claude via backend
  setStep5Status('loading', 'Generating a description based on your info…');

  try {
    const token = await getAuthToken();
    if (!token) throw new Error('Not signed in');

    const suggestion = await callSuggestDescription(
      token,
      hasDescription ? extractedDescription : '',
      keywords,
    );

    aiTextarea.value = suggestion;

    const source = hasDescription
      ? 'Pre-filled from your website + keywords — edit freely.'
      : 'Suggested from your keywords — edit freely.';

    setStep5Status('done', source);
  } catch (err) {
    // Soft-fail: don't block the user, just clear the status
    console.warn('[LeadSnap] suggest-description failed:', err.message);
    setStep5Status('');
  }
}

function setStep5Status(type, text = '') {
  if (!type || !text) {
    step5AiStatus.style.display = 'none';
    step5AiStatus.innerHTML     = '';
    return;
  }
  step5AiStatus.style.display = 'flex';
  if (type === 'loading') {
    step5AiStatus.innerHTML = `<div class="spinner spinner-sm" style="width:14px;height:14px;border-width:2px;"></div><span>${escHtml(text)}</span>`;
  } else {
    step5AiStatus.innerHTML = `<span class="step5-ai-note">✦ ${escHtml(text)}</span>`;
  }
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function getAuthToken() {
  return new Promise((resolve) =>
    chrome.storage.sync.get('auth_token', (d) => resolve(d.auth_token ?? null))
  );
}

async function callExtractWebsite(token, url) {
  const res = await fetch(`${API_URL}/api/profile/extract-website`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }
  return res.json();
}

async function callSuggestDescription(token, serviceDescription, kwList) {
  const res = await fetch(`${API_URL}/api/profile/suggest-description`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ service_description: serviceDescription, keywords: kwList }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server error ${res.status}`);
  }
  const { suggestion } = await res.json();
  return suggestion;
}

async function callUpdateProfile(token, updates) {
  const res = await fetch(`${API_URL}/api/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

// ── Step 7: First Scan ────────────────────────────────────────────────────────

let onbScanHours       = 72; // default: 3 days
let onbScanPollTimer   = null;
let onbFinishPromise   = null; // tracks finishOnboarding() result

// Time pill selection
document.querySelectorAll('.scan-time-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.scan-time-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    onbScanHours = Number(pill.dataset.hours);
  });
});

// "Scan Now" button in step 7
document.getElementById('btn-scan-now-onboarding').addEventListener('click', async () => {
  document.getElementById('scan-choice-card').style.display    = 'none';
  document.getElementById('btn-skip-scan').style.display       = 'none';
  document.getElementById('onboarding-scan-progress').style.display = 'block';
  document.getElementById('onb-progress-label').textContent    = 'Saving settings…';

  try {
    // Save all data first (finishOnboarding shows its own loader in step 6;
    // here we've already moved to step 7 so we call it silently)
    await finishOnboarding();
  } catch {
    // finishOnboarding already showed an alert; restore choice view
    document.getElementById('scan-choice-card').style.display    = 'block';
    document.getElementById('btn-skip-scan').style.display       = '';
    document.getElementById('onboarding-scan-progress').style.display = 'none';
    return;
  }

  document.getElementById('onb-progress-label').textContent = 'Starting scan…';

  // Trigger manual scan
  try {
    chrome.runtime.sendMessage({ type: 'LEADSNAP_MANUAL_SCAN', maxAgeHours: onbScanHours });
  } catch { /* SW not ready — scan will still pick up on alarm */ }

  // Poll scan_state every 800ms
  onbScanPollTimer = setInterval(checkOnboardingScanState, 800);
});

async function checkOnboardingScanState() {
  let state;
  try {
    state = await new Promise((resolve) =>
      chrome.storage.local.get('scan_state', (d) => resolve(d.scan_state ?? { status: 'idle' }))
    );
  } catch { return; }

  const progressEl = document.getElementById('onb-progress-fill');
  const labelEl    = document.getElementById('onb-progress-label');
  if (!progressEl || !labelEl) return;

  if (state.status === 'scanning') {
    const prog = state.progress;
    const pct  = prog && prog.total > 0 ? Math.round((prog.current / prog.total) * 100) : 5;
    progressEl.style.width    = `${pct}%`;
    labelEl.textContent       = prog
      ? `Scanning group ${prog.current} of ${prog.total}…`
      : 'Scanning…';
    return;
  }

  if (state.status === 'opening-facebook') {
    progressEl.style.width = '5%';
    labelEl.textContent    = 'Opening Facebook…';
    return;
  }

  // Terminal states
  clearInterval(onbScanPollTimer);
  onbScanPollTimer = null;
  progressEl.style.width = '100%';

  document.getElementById('onboarding-scan-progress').style.display = 'none';
  document.getElementById('onboarding-scan-complete').style.display = 'block';

  const completeMsg = document.getElementById('onb-complete-msg');
  if (state.status === 'complete' && state.result) {
    const r = state.result;
    completeMsg.textContent = `Scan complete! ${r.found ?? 0} lead${(r.found ?? 0) !== 1 ? 's' : ''} found across ${r.groups_scanned ?? 0} group${(r.groups_scanned ?? 0) !== 1 ? 's' : ''} (${r.posts_checked ?? 0} posts checked).`;
  } else if (state.status === 'blocked') {
    completeMsg.textContent = state.blocked_message || 'Scan could not start. Check your settings.';
  } else {
    completeMsg.textContent = 'Monitoring is now active!';
  }
}

// "Skip scan" button
document.getElementById('btn-skip-scan').addEventListener('click', async () => {
  try { await finishOnboarding(); } catch { return; }
  window.close();
});

// "Open Dashboard" button
document.getElementById('btn-onb-view-dashboard').addEventListener('click', async () => {
  const token = await getAuthToken();
  const refreshToken = await new Promise((r) =>
    chrome.storage.local.get('refresh_token', (d) => r(d.refresh_token ?? null))
  );
  const DASHBOARD_URL = 'https://leadsnap-weld.vercel.app';
  if (token && refreshToken) {
    const hash = `#access_token=${token}&refresh_token=${encodeURIComponent(refreshToken)}&token_type=bearer`;
    chrome.tabs.create({ url: `${DASHBOARD_URL}/auth/callback${hash}` });
  } else {
    chrome.tabs.create({ url: `${DASHBOARD_URL}/dashboard` });
  }
  window.close();
});

// "Close" button
document.getElementById('btn-onb-done').addEventListener('click', () => {
  window.close();
});
