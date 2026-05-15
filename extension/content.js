// LeadSnap content script — Facebook DOM scraper
// Runs on all facebook.com pages. Activated by LEADSNAP_SCAN message from background.js.
//
// Facebook changes class names constantly. This scraper uses structural selectors
// (role="article", aria-*, data-testid) which are far more stable.

console.log('[LeadSnap] Content script loaded on', window.location.href);

// Minimum character count for a DOM element's text to be considered a post body.
// Filters out UI labels, reaction counts, and short button text.
const MIN_POST_TEXT_LENGTH = 20;

// Only process posts from the last N hours. Posts older than this are ignored.
// This prevents the first scan from picking up months-old posts on quiet groups.
const MAX_POST_AGE_HOURS = 24;

// Maximum number of posts to evaluate per scan. Facebook feeds show newest first,
// so this also acts as a recency cap.
const MAX_POSTS_PER_SCAN = 20;

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // ── Discover groups (instant, no scroll) ─────────────────────────────────
  if (message.type === 'LEADSNAP_GET_GROUPS') {
    sendResponse({ groups: extractGroupsFromDOM() });
    return; // synchronous
  }

  // ── Discover ALL joined groups by scrolling facebook.com/groups/joins ───────
  // Diagnostic confirmed: /groups/joins is the correct page. The scroll
  // container is <html> (overflow: auto scroll) — confirmed via:
  //   document.body.scrollHeight: 21469 vs innerHeight: 941
  //   html overflow: auto scroll
  //   [role=main] clientHeight === scrollHeight (fully expanded, can't scroll)
  // document.documentElement.scrollTop is the only target that moves the page.
  if (message.type === 'LEADSNAP_SCROLL_EXTRACT_GROUPS') {
    (async () => {
      const groupMap = new Map(); // url → { url, name }

      // Scrape all valid group links in the full document and merge into groupMap.
      // Called before each scroll step so nodes removed by virtualisation are
      // captured while they were still visible.
      function mergeVisible() {
        document.querySelectorAll('a[href*="/groups/"]').forEach((link) => {
          let parsed;
          try { parsed = new URL(link.href); } catch { return; }
          if (!parsed.hostname.includes('facebook.com')) return;

          const path = parsed.pathname.replace(/\/$/, '');
          if (!/^\/groups\/[^/]+$/.test(path)) return;
          if (EXCLUDED_PATHS.test(path)) return;

          const url = 'https://www.facebook.com' + path;
          if (groupMap.has(url)) return;

          const name = bestGroupName(link, path);
          if (!name) return;

          groupMap.set(url, { url, name });
        });
      }

      console.log('[LeadSnap] SCROLL_EXTRACT_GROUPS — URL:', window.location.href);
      console.log('[LeadSnap] Initial links:', document.querySelectorAll('a[href*="/groups/"]').length);

      mergeVisible();
      console.log(`[LeadSnap] Scroll 0: ${groupMap.size} groups`);

      const MAX_PASSES      = 100;
      const SCROLL_DELAY_MS = 2000;
      const STOP_AFTER_SAME = 6; // passes with no new height AND no new groups

      let sameRuns   = 0;
      let lastHeight = document.documentElement.scrollHeight;

      for (let i = 0; i < MAX_PASSES; i++) {
        const prevSize = groupMap.size;

        document.documentElement.scrollTop = document.documentElement.scrollHeight;

        await new Promise((r) => setTimeout(r, SCROLL_DELAY_MS));

        mergeVisible();

        const newHeight  = document.documentElement.scrollHeight;
        const newGroups  = groupMap.size - prevSize;
        const heightGrew = newHeight > lastHeight;
        lastHeight = newHeight;

        console.log(
          `[LeadSnap] Scroll ${i + 1}: height=${newHeight} (${heightGrew ? '+grew' : 'same'}) | +${newGroups} new → ${groupMap.size} total`
        );

        if (!heightGrew && newGroups === 0) {
          if (++sameRuns >= STOP_AFTER_SAME) {
            console.log(`[LeadSnap] No new content for ${STOP_AFTER_SAME} passes — done.`);
            break;
          }
        } else {
          sameRuns = 0;
        }
      }

      const results = [...groupMap.values()];
      console.log('[LeadSnap] Final unique groups found:', results.length);
      results.slice(0, 10).forEach((g) => console.log(`  ${g.name} — ${g.url}`));

      sendResponse({ groups: results });
    })();
    return true;
  }

  if (message.type !== 'LEADSNAP_SCAN') return;

  const { keywords, groups, silent = false, maxAgeHours = MAX_POST_AGE_HOURS } = message;

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

  scrollThenScrape(keywords, groups, silent, maxAgeHours)
    .then((found) => sendResponse({ status: 'ok', found }))
    .catch((err) => {
      console.error('[LeadSnap] Scrape error:', err);
      sendResponse({ status: 'error', error: err.message, found: 0 });
    });

  return true; // keep message channel open for async response
});

// ── Passive observer — runs without any tab-opening ──────────────────────────
// When the user is already browsing a Facebook group page, we watch for new
// posts appearing in the DOM and submit matches immediately. This catches leads
// in real time without the background scan needing to open any tabs.

(function initPassiveObserver() {
  if (!isFacebookGroupPage()) return;

  let passiveKeywords = [];
  let passiveGroups   = [];
  let passiveMaxAge   = MAX_POST_AGE_HOURS;
  let debounceTimer   = null;

  // Load config from storage once; re-read on storage change
  function loadConfig() {
    chrome.storage.sync.get(['keywords', 'selected_groups', 'scan_max_age_hours'], (d) => {
      passiveKeywords = d.keywords        || [];
      passiveGroups   = d.selected_groups || [];
      passiveMaxAge   = d.scan_max_age_hours ?? MAX_POST_AGE_HOURS;
    });
  }
  loadConfig();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && (changes.keywords || changes.selected_groups || changes.scan_max_age_hours)) {
      loadConfig();
    }
  });

  // Debounced scan — runs 2 s after DOM settles to let React finish rendering
  function schedulePassiveScan() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (!passiveKeywords.length) {
        console.log('[LeadSnap] Passive scan skipped — no keywords configured');
        return;
      }
      if (!passiveGroups.length) {
        console.log('[LeadSnap] Passive scan skipped — no groups selected');
        return;
      }
      if (!isFacebookGroupPage()) return;
      if (!isMonitoredGroup(passiveGroups)) {
        console.log('[LeadSnap] Passive scan skipped — this group is not in your monitored list:', window.location.href);
        return;
      }
      console.log('[LeadSnap] Passive scan running on', window.location.href);
      try {
        const found = await scrapeAndSubmit(passiveKeywords, passiveGroups, false, passiveMaxAge);
        console.log(`[LeadSnap] Passive scan complete — ${found} new lead(s) submitted`);
      } catch (err) {
        console.warn('[LeadSnap] Passive scan error:', err.message);
      }
    }, 2000);
  }

  // Watch for new articles being added (Facebook's infinite scroll / live updates)
  const observer = new MutationObserver((mutations) => {
    const hasNewArticle = mutations.some((m) =>
      [...m.addedNodes].some((n) =>
        n.nodeType === 1 && (
          n.getAttribute?.('role') === 'article' ||
          n.querySelector?.('[role="article"]')
        )
      )
    );
    if (hasNewArticle) schedulePassiveScan();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Also run once on page load in case posts are already in the DOM
  schedulePassiveScan();
})();

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
  const currentPath = normalizeGroupUrl(window.location.href); // e.g. /groups/medellinexpats
  const currentSlug = currentPath.split('/').pop();             // e.g. medellinexpats

  return groups.find((g) => {
    const url  = typeof g === 'string' ? g : (g.url || g.facebook_group_url);
    const path = normalizeGroupUrl(url);
    const slug = path.split('/').pop();
    // Exact path match OR same slug (handles numeric-ID ↔ vanity-name mismatch)
    return path === currentPath || slug === currentSlug;
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

const EXCLUDED_PATHS = /^\/groups\/(feed|discover|create|category|search|notifications|requests|invite)/;

// Matches time-relative strings Facebook uses for "last visited" labels
const LAST_VISITED_RE = /\d+\s*(minute|hour|day|week|month|year)s?\s*ago|yesterday|today|just now/i;

// rootEl — optional DOM element to search within. Defaults to [role="main"]
// (for backwards-compat with LEADSNAP_GET_GROUPS) or document as last fallback.
function extractGroupsFromDOM(rootEl) {
  const seen = new Set();
  const groups = [];

  const root = rootEl || document.querySelector('[role="main"]') || document;

  root.querySelectorAll('a[href*="/groups/"]').forEach((link) => {
    let parsed;
    try { parsed = new URL(link.href); } catch { return; }

    if (parsed.hostname !== 'www.facebook.com' && parsed.hostname !== 'facebook.com') return;

    const path = parsed.pathname.replace(/\/$/, '');
    if (!/^\/groups\/[^/]+$/.test(path)) return;
    if (EXCLUDED_PATHS.test(path)) return;

    const url = `https://www.facebook.com${path}`;
    if (seen.has(url)) return;

    // Resolve name BEFORE marking URL as seen. Each group card has 3 <a> tags
    // pointing to the same URL: (1) cover-photo link with no text, (2) group-name
    // link with the real name, (3) "View group" button. If we mark seen before
    // checking the name, the cover-photo link claims the slot and the name link
    // is rejected as a duplicate → 0 groups captured.
    const name = bestGroupName(link, path);
    if (!name) return; // cover-photo / icon link — skip without claiming URL slot

    seen.add(url); // only claim slot once we have a valid name
    groups.push({ url, name, lastVisited: extractLastVisited(link) });
  });

  return groups;
}

/**
 * Like extractGroupsFromDOM but restricted to the left nav/sidebar only.
 * This avoids picking up notification links from the main feed which share
 * the same /groups/<id> URL pattern but whose "names" are activity strings.
 */
function extractGroupsFromSidebar() {
  const seen   = new Set();
  const groups = [];

  // Find the nav/sidebar containers — Facebook uses role="navigation" for the
  // left sidebar. We also try the groups-specific nav pagelet.
  const navRoots = [
    ...document.querySelectorAll('[role="navigation"]'),
    document.querySelector('[data-pagelet="LeftRail"]'),
    document.querySelector('[data-pagelet="GroupsLeftRail"]'),
  ].filter(Boolean);

  // If we can't find a nav root, fall back to scanning everything but
  // excluding links that are inside a [role="article"] (feed posts/notifications)
  const searchRoots = navRoots.length ? navRoots : [document.body];
  const excludeArticles = navRoots.length === 0;

  searchRoots.forEach((root) => {
    root.querySelectorAll('a[href*="/groups/"]').forEach((link) => {
      if (excludeArticles && link.closest('[role="article"]')) return;
      if (excludeArticles && link.closest('[role="feed"]'))    return;

      let parsed;
      try { parsed = new URL(link.href); } catch { return; }
      if (parsed.hostname !== 'www.facebook.com' && parsed.hostname !== 'facebook.com') return;

      const path = parsed.pathname.replace(/\/$/, '');
      if (!/^\/groups\/[^/]+$/.test(path)) return;
      if (EXCLUDED_PATHS.test(path)) return;

      const url = `https://www.facebook.com${path}`;
      if (seen.has(url)) return;

      const name = bestGroupName(link, path);
      if (!name) return;

      seen.add(url);
      groups.push({ url, name, lastVisited: extractLastVisited(link) });
    });
  });

  return groups;
}

// Short Facebook UI strings that are never group names
const FB_UI_RE = /^(view group|see more|see all|show more|create( a)? (new )?group|your groups?|discover|joined|members?|\.\.\.)$/i;
// Notification-text patterns — long strings from activity sidebar
const FB_NOTIF_RE = /mentioned you|commented on|replied to|reacted to|posted in|wrote on|invited you|new post|new member/i;

/**
 * Strip Facebook's notification suffix from a group name candidate.
 * When a group has unread posts, Facebook renders the sidebar link's
 * aria-label as: 'Group Name: "Post preview text"6h'
 * We want only the part before the ': "'.
 */
function cleanGroupName(raw) {
  if (!raw) return raw;
  // Notification format always has ': "' (colon + space + opening quote)
  const notifIdx = raw.indexOf(': "');
  if (notifIdx > 0) return raw.slice(0, notifIdx).trim();
  return raw;
}

/** Extract the best available name for a group link element.
 *
 * We deliberately do NOT walk up to ancestor elements to find a name, because
 * on /groups/joins/ the page heading ("All groups you've joined (122)") is an
 * ancestor of every link on the page and poisons every result.
 *
 * Instead we rely only on text that belongs directly to this link:
 *  - aria-label attribute
 *  - innerText of the link itself
 *
 * Cover-photo <a> tags wrap an <img> with no text, so they return null here.
 * That means their URL is never added to `seen`, so the group-name <a> that
 * follows (with the actual group title as its text) gets processed correctly.
 */
function bestGroupName(link, path) {
  // 1. aria-label on the link itself
  let name = cleanGroupName(link.getAttribute('aria-label')?.trim().split('\n')[0].trim());
  if (isValidGroupName(name)) return name;

  // 2. Inner text of the link (empty for cover-photo / icon links)
  name = cleanGroupName(link.innerText?.trim().split('\n')[0].trim());
  if (isValidGroupName(name)) return name;

  // 3. No ancestor walk — return null so cover-photo links are skipped and
  //    don't block the real group-name link from being processed.
  return null;
}

function isValidGroupName(name) {
  if (!name || name.length < 2 || name.length > 80) return false;
  if (FB_UI_RE.test(name))    return false;
  if (FB_NOTIF_RE.test(name)) return false;
  if (/: "/.test(name))       return false; // notification text leaked in
  return true;
}

/**
 * Try to find a "last visited" label near a group link by walking up the DOM
 * up to 4 ancestors and scanning all descendant text nodes.
 */
function extractLastVisited(link) {
  let node = link;
  for (let i = 0; i < 4; i++) {
    node = node.parentElement;
    if (!node) break;
    // Scan all span/div children for a time-relative string
    const candidates = node.querySelectorAll('span, div');
    for (const el of candidates) {
      // Skip elements that contain the link itself (to avoid picking up group name)
      if (el.contains(link)) continue;
      const text = el.innerText?.trim();
      if (text && LAST_VISITED_RE.test(text) && text.length < 60) {
        return text;
      }
    }
  }
  return null;
}

// ── Post age detection ────────────────────────────────────────────────────────

/**
 * Returns the estimated age of a post in hours, or null if it can't be determined.
 * Facebook shows timestamps like "2 h", "Just now", "Yesterday", "Monday", etc.
 * We scan all text nodes inside the article for these patterns.
 */
function estimatePostAgeHours(article) {
  // Facebook timestamp links are <a> tags that:
  //  - link to the post permalink (/posts/, /permalink/, story_fbid=)
  //  - contain ONLY a short time string ("2 h", "Just now", "Monday", etc.)
  // We ONLY look at these links to avoid matching day/month names inside post body text.
  const timestampLinks = [...article.querySelectorAll('a[href]')].filter((a) => {
    const href = a.href || '';
    return (
      href.includes('/posts/') ||
      href.includes('/permalink/') ||
      href.includes('story_fbid=') ||
      href.includes('?v=')
    ) && (a.innerText?.trim().length ?? 0) < 30;
  });

  for (const a of timestampLinks) {
    const text = a.innerText?.trim().toLowerCase() ?? '';
    if (!text) continue;

    if (/just now|moments? ago/.test(text)) return 0;

    const mins = text.match(/^(\d+)\s*min/);
    if (mins) return parseInt(mins[1], 10) / 60;

    const hrs = text.match(/^(\d+)\s*h/);
    if (hrs) return parseInt(hrs[1], 10);

    if (text.startsWith('yesterday')) return 30;

    if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(text)) return 7 * 24;

    if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.test(text)) return 30 * 24;
  }

  return null; // unknown age — include the post to be safe
}

// ── Main scrape + submit flow ─────────────────────────────────────────────────

/**
 * Scroll the page to trigger Facebook's IntersectionObserver (which lazy-loads
 * feed posts), then scrape. Without this, the feed DOM is empty because posts
 * only render when they enter the viewport.
 */
async function scrollThenScrape(keywords, groups, silent = false, maxAgeHours = MAX_POST_AGE_HOURS) {
  const scrollEl = document.documentElement;

  // Scroll down in steps to trigger post loading
  scrollEl.scrollTop = 600;
  await new Promise((r) => setTimeout(r, 1500));
  scrollEl.scrollTop = 1200;
  await new Promise((r) => setTimeout(r, 1500));
  scrollEl.scrollTop = 0; // scroll back to top so we scrape from the beginning
  await new Promise((r) => setTimeout(r, 500));

  const posts = scrapePosts();
  console.log(`[LeadSnap] After scroll: ${posts.length} article(s) found`);

  // If nothing loaded yet, wait a bit longer and try once more
  if (!posts.length) {
    scrollEl.scrollTop = 400;
    await new Promise((r) => setTimeout(r, 3000));
    scrollEl.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 500));
  }

  return scrapeAndSubmit(keywords, groups, silent, maxAgeHours);
}

async function scrapeAndSubmit(keywords, groups, silent = false, maxAgeHours = MAX_POST_AGE_HOURS) {
  const seenIds = await getSeenPostIds();

  // Cap to the N most recent posts (Facebook shows newest first).
  // Age filtering is done per-article using the timestamp link found in each one.
  const allPosts = scrapePosts();
  console.log(`[LeadSnap] scrapeAndSubmit — ${allPosts.length} article(s) on page, keywords: [${keywords.join(', ')}]`);

  const posts = allPosts.slice(0, MAX_POSTS_PER_SCAN).filter((post) => {
    if (post.ageHours !== null && post.ageHours > maxAgeHours) {
      console.log(`[LeadSnap] Skipping post — ${post.ageHours.toFixed(0)}h old (limit ${maxAgeHours}h): "${post.text.slice(0, 40)}"`);
      return false;
    }
    return true;
  });

  console.log(`[LeadSnap] ${posts.length} post(s) within ${maxAgeHours}h window`);

  let submitted = 0;

  for (const post of posts) {
    if (seenIds.includes(post.id)) {
      console.log(`[LeadSnap] Skipping already-seen post: "${post.text.slice(0, 50)}"`);
      continue;
    }

    const matched = matchKeywords(post.text, keywords);
    if (!matched.length) {
      console.log(`[LeadSnap] No keyword match: "${post.text.slice(0, 60)}"`);
      continue;
    }

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
            silent,
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
  const text = extractText(article);
  if (!text) return null;

  // ── Author name ──────────────────────────────────────────────────────────────
  const author = extractAuthor(article);

  // ── Post URL ─────────────────────────────────────────────────────────────────
  const url = extractPostUrl(article);

  // ── Post age ──────────────────────────────────────────────────────────────────
  // Attached here so the filter in scrapeAndSubmit uses the correct article's age.
  const ageHours = estimatePostAgeHours(article);

  // ── Stable ID ────────────────────────────────────────────────────────────────
  const id = url ? urlToId(url) : contentHash(author + text.slice(0, 120));

  return { id, text, author, url, ageHours };
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
