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
  // ── Discover groups (instant, no scroll) ─────────────────────────────────
  if (message.type === 'LEADSNAP_GET_GROUPS') {
    sendResponse({ groups: extractGroupsFromDOM() });
    return; // synchronous
  }

  // ── Discover groups by expanding the left-sidebar group list ─────────────
  // facebook.com/groups/ has a left sidebar with "Groups you manage" and
  // "Groups you've joined". We click every "See more" / "See all" button in
  // the nav area to expand both lists, then extract links from there only
  // (ignoring the main feed which contains notifications, not group entries).
  // Incremental scrape during each scroll step so virtualised rows that get
  // unmounted mid-scroll are still captured (Facebook removes DOM nodes that
  // scroll out of the viewport when the list is long).
  // Groups are stored in a Map keyed by URL so duplicates are ignored.
  if (message.type === 'LEADSNAP_SCROLL_EXTRACT_GROUPS') {
    (async () => {
      const groupMap = new Map(); // url → group object

      function mergeVisible() {
        let added = 0;
        for (const g of extractGroupsFromDOM()) {
          if (!groupMap.has(g.url)) { groupMap.set(g.url, g); added++; }
        }
        return added;
      }

      // ── 1. Page loaded ────────────────────────────────────────────────────
      console.log('[LeadSnap] Current URL:', window.location.href);

      // Facebook lays out the groups grid inside [role="main"] which has its
      // own overflow:auto scroll container. The outer document.body has a fixed
      // height equal to the viewport, so window.scrollBy does nothing and
      // document.body.scrollHeight never changes. We must scroll the inner
      // container directly so Facebook's IntersectionObserver fires and
      // lazy-loads more groups.
      const root      = document.querySelector('[role="main"]') || document.scrollingElement || document.documentElement;
      const scrollEl  = (root === document) ? document.documentElement : root;

      // ── 2. Initial link count ─────────────────────────────────────────────
      const initialLinks = root.querySelectorAll('a[href*="/groups/"]');
      console.log('[LeadSnap] Initial /groups/ links found:', initialLinks.length);

      mergeVisible();
      console.log(`[LeadSnap] Scroll 0: found ${groupMap.size} unique groups`);

      const MAX_PASSES      = 120;
      const SCROLL_DELAY_MS = 1200; // give FB time to lazy-load each batch
      const STOP_AFTER_SAME = 6;    // stop after 6 passes with no new groups

      let sameCountRuns = 0;
      let lastLinkCount = root.querySelectorAll('a[href*="/groups/"]').length;

      for (let i = 0; i < MAX_PASSES; i++) {
        // Scroll the actual container (not window) so FB's IntersectionObserver fires
        scrollEl.scrollTop += scrollEl.clientHeight || window.innerHeight;

        await new Promise((r) => setTimeout(r, SCROLL_DELAY_MS));

        mergeVisible();

        // ── 3. Per-scroll log ───────────────────────────────────────────────
        console.log(`[LeadSnap] Scroll ${i + 1}: found ${groupMap.size} unique groups`);

        // Detect new content by counting raw links, not scrollHeight
        // (body scrollHeight stays constant when content is in an inner container)
        const newLinkCount = root.querySelectorAll('a[href*="/groups/"]').length;
        if (newLinkCount === lastLinkCount) {
          sameCountRuns++;
          if (sameCountRuns >= STOP_AFTER_SAME) break;
        } else {
          sameCountRuns = 0;
          lastLinkCount = newLinkCount;
        }
      }

      const results = [...groupMap.values()];

      // ── 4. Final count ────────────────────────────────────────────────────
      console.log('[LeadSnap] Final unique groups found:', results.length);

      // ── 5. First 10 results ───────────────────────────────────────────────
      console.log('[LeadSnap] First 10 groups:');
      results.slice(0, 10).forEach((g) => {
        console.log(`  ${g.name} — ${g.url}`);
      });

      // ── 6. DOM dump if count is suspiciously low ──────────────────────────
      if (results.length < 10) {
        console.warn('[LeadSnap] Under 10 groups — raw DOM dump:');
        [...root.querySelectorAll('a[href*="/groups/"]')].slice(0, 20).forEach((a, i) => {
          console.log(`  [${i}] href="${a.href}" | text="${a.innerText.trim().slice(0, 80)}" | aria-label="${a.getAttribute('aria-label') || ''}"`);
        });
      }

      sendResponse({ groups: results });
    })();
    return true;
  }

  if (message.type !== 'LEADSNAP_SCAN') return;

  const { keywords, groups, silent = false } = message;

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

  scrapeAndSubmit(keywords, groups, silent)
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

const EXCLUDED_PATHS = /^\/groups\/(feed|discover|create|category|search|notifications|requests|invite)/;

// Matches time-relative strings Facebook uses for "last visited" labels
const LAST_VISITED_RE = /\d+\s*(minute|hour|day|week|month|year)s?\s*ago|yesterday|today|just now/i;

function extractGroupsFromDOM() {
  const seen = new Set();
  const groups = [];

  // On /groups/joins/ the group grid is inside [role="main"]. Searching only
  // there avoids the left-sidebar notification links which also contain
  // /groups/<id> URLs but whose text is "X mentioned you in…" noise.
  // Fall back to document if [role="main"] isn't present (other FB pages).
  const root = document.querySelector('[role="main"]') || document;

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
  let name = link.getAttribute('aria-label')?.trim().split('\n')[0].trim();
  if (isValidGroupName(name)) return name;

  // 2. Inner text of the link (empty for cover-photo / icon links)
  name = link.innerText?.trim().split('\n')[0].trim();
  if (isValidGroupName(name)) return name;

  // 3. No ancestor walk — return null so cover-photo links are skipped and
  //    don't block the real group-name link from being processed.
  return null;
}

function isValidGroupName(name) {
  if (!name || name.length < 2 || name.length > 80) return false;
  if (FB_UI_RE.test(name))    return false;
  if (FB_NOTIF_RE.test(name)) return false;
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

// ── Main scrape + submit flow ─────────────────────────────────────────────────

async function scrapeAndSubmit(keywords, groups, silent = false) {
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
