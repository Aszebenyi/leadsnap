// LeadSnap content script — Facebook DOM scraper
// Runs on all facebook.com pages. Activated by LEADSNAP_SCAN message from background.js.
//
// Facebook changes class names constantly. This scraper uses structural selectors
// (role="article", aria-*, data-testid) which are far more stable.

console.log('[LeadSnap] Content script loaded on', window.location.href);

// Minimum character count for a DOM element's text to be considered a post body.
// Filters out UI labels, reaction counts, and short button text.
const MIN_POST_TEXT_LENGTH = 20;

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // ── Discover groups from the current page's DOM ───────────────────────────
  if (message.type === 'LEADSNAP_GET_GROUPS') {
    sendResponse({ groups: extractGroupsFromDOM() });
    return; // synchronous
  }

  if (message.type !== 'LEADSNAP_SCAN') return;

  const { keywords, groups } = message;

  // Only scan if we're on a Facebook group page
  if (!isFacebookGroupPage()) {
    sendResponse({ status: 'skipped', reason: 'not a group page', found: 0 });
    return;
  }

  // Check if this group URL is in the user's monitored groups
  if (!isMonitoredGroup(groups)) {
    sendResponse({ status: 'skipped', reason: 'group not monitored', found: 0 });
    return;
  }

  scrapeAndSubmit(keywords, groups)
    .then((found) => sendResponse({ status: 'ok', found }))
    .catch((err) => {
      console.error('[LeadSnap] Scrape error:', err);
      sendResponse({ status: 'error', error: err.message, found: 0 });
    });

  return true; // keep message channel open for async response
});

// ── Page detection ────────────────────────────────────────────────────────────

function isFacebookGroupPage() {
  return /facebook\.com\/groups\//.test(window.location.href);
}

function normalizeGroupUrl(url) {
  try {
    // Strip trailing slash, query params, and hash; keep only the path
    return new URL(url).pathname.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

/** Find the group object matching the current page URL, or null if not monitored. */
function findCurrentGroup(groups) {
  if (!groups || !groups.length) return null;
  const current = normalizeGroupUrl(window.location.href);
  return groups.find((g) => {
    // Support both { url } (new format) and { facebook_group_url } (legacy)
    const url = typeof g === 'string' ? g : (g.url || g.facebook_group_url);
    return normalizeGroupUrl(url) === current;
  }) ?? null;
}

function isMonitoredGroup(groups) {
  return findCurrentGroup(groups) !== null;
}

function getGroupName(groups) {
  const match = findCurrentGroup(groups);
  // Support both { name } (new format) and { group_name } (legacy)
  if (match?.name || match?.group_name) return match.name || match.group_name;
  // Fall back to the page <title> which usually contains the group name
  return document.title.replace(/ \| Facebook$/, '').trim() || 'Unknown Group';
}

// ── Group discovery ───────────────────────────────────────────────────────────
// Called when the popup sends LEADSNAP_GET_GROUPS. Scrapes all group links
// visible on the current Facebook page (sidebar, feed, etc.).

const EXCLUDED_PATHS = /^\/groups\/(feed|discover|create|joins|category|search|notifications|requests|invite)/;

function extractGroupsFromDOM() {
  const seen = new Set();
  const groups = [];

  document.querySelectorAll('a[href*="/groups/"]').forEach((link) => {
    let parsed;
    try { parsed = new URL(link.href); } catch { return; }

    if (parsed.hostname !== 'www.facebook.com' && parsed.hostname !== 'facebook.com') return;

    // Only want /groups/<id-or-slug> — not /groups/<id>/posts/<id> etc.
    const path = parsed.pathname.replace(/\/$/, '');
    if (!/^\/groups\/[^/]+$/.test(path)) return;
    if (EXCLUDED_PATHS.test(path)) return;

    const url = `https://www.facebook.com${path}`;
    if (seen.has(url)) return;
    seen.add(url);

    // Best-effort name extraction: aria-label → first span text → link text
    const name = (
      link.getAttribute('aria-label') ||
      link.querySelector('span')?.innerText ||
      link.innerText
    ).trim().split('\n')[0].trim();

    if (!name || name.length < 2) return;

    groups.push({ url, name });
  });

  return groups;
}

// ── Main scrape + submit flow ─────────────────────────────────────────────────

async function scrapeAndSubmit(keywords, groups) {
  const seenIds = await getSeenPostIds();
  const posts = scrapePosts();

  console.log(`[LeadSnap] Found ${posts.length} posts on page`);

  let submitted = 0;

  for (const post of posts) {
    // Skip already-processed posts
    if (seenIds.includes(post.id)) continue;

    const matched = matchKeywords(post.text, keywords);
    if (!matched.length) continue;

    const groupName = getGroupName(groups);
    const groupUrl  = window.location.href.split('?')[0];

    console.log(`[LeadSnap] Match found — keywords: ${matched.join(', ')}`);
    console.log(`[LeadSnap] Post preview: ${post.text.slice(0, 80)}…`);

    // Send to background worker and wait for confirmation before marking seen.
    // This prevents losing leads if the ingest API call fails.
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'LEADSNAP_LEAD_FOUND',
          payload: {
            post_text:        post.text,
            post_url:         post.url,
            author_name:      post.author,
            group_name:       groupName,
            group_url:        groupUrl,
            matched_keywords: matched,
          },
        },
        (res) => resolve(res || {})
      );
    });

    if (response.error) {
      console.warn(`[LeadSnap] Ingest failed for post ${post.id} — will retry next scan:`, response.error);
      // Do NOT mark seen — the post will be retried on the next scan cycle
    } else {
      await markPostSeen(post.id);
      submitted++;
    }
  }

  return submitted;
}

// ── DOM scraping ──────────────────────────────────────────────────────────────

function scrapePosts() {
  // role="article" is the most stable selector for Facebook posts.
  // It wraps both feed posts and group posts across FB's A/B tests.
  const articles = document.querySelectorAll('[role="article"]');
  const posts = [];

  articles.forEach((article) => {
    try {
      const post = extractPost(article);
      if (post && post.text && post.text.length > MIN_POST_TEXT_LENGTH) {
        posts.push(post);
      }
    } catch (err) {
      // Individual post failures shouldn't abort the whole scrape
      console.warn('[LeadSnap] Failed to extract post:', err.message);
    }
  });

  return posts;
}

function extractPost(article) {
  // ── Post text ────────────────────────────────────────────────────────────────
  // Facebook nests post text in a div with data-ad-preview="message" or
  // inside a div[dir="auto"] inside the article. We try multiple strategies.
  const text = extractText(article);
  if (!text) return null;

  // ── Author name ──────────────────────────────────────────────────────────────
  const author = extractAuthor(article);

  // ── Post URL ─────────────────────────────────────────────────────────────────
  const url = extractPostUrl(article);

  // ── Stable ID ────────────────────────────────────────────────────────────────
  // Prefer URL-based ID (most stable). Fall back to a content hash.
  const id = url ? urlToId(url) : contentHash(author + text.slice(0, 120));

  return { id, text, author, url };
}

function extractText(article) {
  // Strategy 1: data-ad-preview="message" (sponsored + organic posts)
  const adPreview = article.querySelector('[data-ad-preview="message"]');
  if (adPreview) return adPreview.innerText.trim();

  // Strategy 2: the first substantive dir="auto" block that isn't a name/header
  // Facebook uses dir="auto" for user-generated text content
  const dirAutos = article.querySelectorAll('div[dir="auto"]');
  for (const el of dirAutos) {
    // Skip tiny elements (likely UI labels) and elements that contain other articles
    if (el.innerText.trim().length > 30 && !el.querySelector('[role="article"]')) {
      return el.innerText.trim();
    }
  }

  // Strategy 3: look for a block with substantial text inside a post body
  // data-testid="post_message" appears in some FB versions
  const postMsg = article.querySelector('[data-testid="post_message"]');
  if (postMsg) return postMsg.innerText.trim();

  return null;
}

function extractAuthor(article) {
  // Strategy 1: aria-label on the author's profile link (very stable)
  const profileLink = article.querySelector('a[aria-label]');
  if (profileLink) {
    const label = profileLink.getAttribute('aria-label');
    if (label && label.length < 80) return label;
  }

  // Strategy 2: strong tag inside the post header (common pattern)
  const strong = article.querySelector('strong');
  if (strong) return strong.innerText.trim();

  // Strategy 3: h2/h3 near the top of the article
  const heading = article.querySelector('h2, h3');
  if (heading) return heading.innerText.trim();

  return 'Unknown';
}

function extractPostUrl(article) {
  // Facebook post URLs appear in timestamp anchor tags.
  // They match patterns like /groups/123/posts/456 or /permalink/
  const links = article.querySelectorAll('a[href]');

  for (const link of links) {
    const href = link.href;
    if (
      href.includes('/posts/') ||
      href.includes('/permalink/') ||
      href.includes('story_fbid=')
    ) {
      // Clean tracking params but keep the core URL
      try {
        const u = new URL(href);
        u.search = ''; // strip query string
        return u.toString();
      } catch {
        return href.split('?')[0];
      }
    }
  }

  return null;
}

// ── Keyword matching ──────────────────────────────────────────────────────────

function matchKeywords(text, keywords) {
  if (!text || !keywords || !keywords.length) return [];
  const lower = text.toLowerCase();
  return keywords.filter((kw) => {
    const k = typeof kw === 'string' ? kw : kw.keyword;
    return lower.includes(k.toLowerCase());
  });
}

// Storage helpers are provided by utils/storage-content.js, loaded before
// this script via manifest.json content_scripts. Accessed via window.LeadSnapStorage.
const { getSeenPostIds, markPostSeen } = window.LeadSnapStorage;

// ── Utilities ─────────────────────────────────────────────────────────────────

function urlToId(url) {
  // Extract the most stable part of the URL as an ID
  const match = url.match(/\/posts\/(\d+)|story_fbid=(\d+)|\/permalink\/(\d+)/);
  if (match) return match[1] || match[2] || match[3];
  return url.split('/').filter(Boolean).pop() || url;
}

function contentHash(str) {
  // Simple deterministic hash for deduplication — not cryptographic
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}
