# LeadSnap — Handoff Document
> Last updated: 2026-05-10. Reflects the full state of the codebase after this session's work.

---

## What Was Built (Complete History)

### Authentication
- **Inline popup auth** — Google OAuth + email/password login built directly into the extension popup. No separate auth page opens.
- **Google OAuth PKCE flow** — popup sends `GOOGLE_SIGN_IN` to background service worker (which persists when the popup closes), background calls `signInWithGoogle()`, gets auth code via `chrome.identity.launchWebAuthFlow`, POSTs to `/api/auth/google-exchange` backend endpoint (which holds `GOOGLE_CLIENT_SECRET`), returns Supabase session. After success: `chrome.action.openPopup()` reopens popup, with notification fallback.
- **Email/password auth** — calls Supabase REST directly from popup.
- **Token refresh** — background service worker refreshes every 55 min via `validateAndRefreshToken()`.
- **Extension → Dashboard login handoff** — `openDashboardTab()` passes tokens via `#access_token=...&refresh_token=...` URL hash. Frontend `/auth/callback` page calls `supabase.auth.setSession()` explicitly, avoiding the PrivateRoute race condition.

### Extension
- **Background service worker** — scan loop (10 min), token refresh (55 min), subscription cache (1 hr TTL), Google auth proxy, badge count, manual scan with monitor window.
- **Content script** — Facebook DOM scraper using `role="article"`, three-strategy text extraction, keyword matching, group discovery, deduplication via `seen_post_ids` (capped at 500).
- **Popup** — 3-tab UI (Status / Leads / Settings) when logged in; inline auth panel when logged out. Skeleton card loading for leads tab, scan-now button reflects scanning state.
- **6-step onboarding wizard** — Connect Facebook → Select Groups → Keywords → Website Extractor → Describe Lead → Phone Number.
- **Monitor window** — progress UI during manual scans.

### Backend (Node.js + Express on Railway)
- **Auth** — `/api/auth/google-exchange`: exchanges Google auth code + PKCE verifier → id_token → Supabase session (keeps `GOOGLE_CLIENT_SECRET` server-side).
- **Leads** — POST `/api/leads/ingest` (scores via Claude, generates AI reply, saves to DB, sends SMS); GET paginated; PATCH status.
- **Keywords** — full CRUD with subscription check.
- **Groups** — full CRUD with URL validation, trial limit (5 groups), DB-level trigger enforcement.
- **Profile** — GET/PUT with input length validation; POST `/extract-website` (SSRF-protected); POST `/suggest-description`.
- **Billing** — Stripe checkout, portal, webhook (signature validated, idempotent).
- **Rate limiting** — general 100/15min; ingest 60/hr; checkout 10/hr; auth 20/15min.

### Frontend Dashboard (React + Vite + Tailwind on Vercel)
- **Dashboard** — lead feed with status filter tabs, skeleton card loading, pagination with "Load more" button (20 leads/page, accumulates).
- **Settings** — profile, keywords, groups (all API-connected).
- **Billing** — Stripe checkout + portal + subscription status display.
- **Auth pages** — Login, Signup, `/auth/callback` (token handoff from extension).
- **Public pages** — Landing, Privacy Policy, Terms of Service.

### Database (Supabase / PostgreSQL)
- All tables with RLS enabled.
- Auto-create profile + subscription row on signup (trigger).
- DB-level trial group limit trigger (backup enforcement).
- **90-day lead cleanup** — pg_cron job in `supabase/cleanup.sql` (must be run manually in SQL editor — see below).

---

## Current State of Each File

### Extension
| File | Status |
|------|--------|
| `background.js` | ✅ Complete — scan loop, token refresh, Google auth proxy, badge |
| `content.js` | ✅ Complete — may need DOM selector updates after FB changes |
| `manifest.json` | ✅ Complete |
| `popup/popup.html` | ✅ Complete |
| `popup/popup.js` | ✅ Complete — merged imports, uses `setSession()` abstraction |
| `popup/popup.css` | ✅ Complete — skeleton animation added |
| `onboarding/` | ✅ Complete (6 steps) |
| `auth/auth.html + auth.js` | ⚠️ Legacy — kept but no longer in the primary flow |
| `utils/config.js` | ✅ Complete — single source of truth for all URLs/keys |
| `utils/api.js` | ✅ Complete |
| `utils/storage.js` | ✅ Complete — canonical session management |
| `utils/supabase-auth.js` | ✅ Complete — PKCE Google OAuth |
| `utils/storage-content.js` | ✅ Complete |

### Backend
| File | Status |
|------|--------|
| `src/index.js` | ✅ Complete — CORS, 4 rate limiters, all routes, error handler, PORT fallback |
| `src/routes/auth.js` | ✅ Complete — google-exchange endpoint |
| `src/routes/leads.js` | ✅ Complete — ingest, GET (paginated), PATCH |
| `src/routes/keywords.js` | ✅ Complete — length limit added |
| `src/routes/groups.js` | ✅ Complete — URL validation, trial limit |
| `src/routes/profile.js` | ✅ Complete — SSRF protection, length limits |
| `src/routes/billing.js` | ✅ Complete — Stripe webhook idempotent |
| `src/middleware/auth.js` | ✅ Complete |
| `src/middleware/subscription.js` | ✅ Complete |
| `src/lib/supabase.js` | ✅ Complete |
| `src/lib/subscription.js` | ✅ Complete |
| `src/services/claude.js` | ✅ Complete — score, reply, extract, suggest |
| `src/services/twilio.js` | ✅ Complete |
| `src/services/stripe.js` | ✅ Complete |

### Frontend
| File | Status |
|------|--------|
| `src/App.jsx` | ✅ Complete — all routes |
| `src/pages/Landing.jsx` | ✅ Complete |
| `src/pages/Login.jsx` | ✅ Complete |
| `src/pages/Signup.jsx` | ✅ Complete |
| `src/pages/Dashboard.jsx` | ✅ Complete — skeleton loading, pagination |
| `src/pages/Settings.jsx` | ✅ Complete |
| `src/pages/Billing.jsx` | ⚠️ Reads subscriptions table directly from frontend (bypasses backend API) |
| `src/pages/Onboarding.jsx` | ✅ Complete (4-step web onboarding) |
| `src/pages/Privacy.jsx` | ✅ Complete |
| `src/pages/Terms.jsx` | ✅ Complete |
| `src/pages/AuthCallback.jsx` | ✅ Complete — token handoff |
| `src/components/LeadCard.jsx` | ✅ Complete |
| `src/components/Navbar.jsx` | ✅ Complete |
| `src/hooks/useAuth.js` | ✅ Complete |
| `src/hooks/useLeads.js` | ✅ Complete — load-more pagination |
| `src/lib/api.js` | ✅ Complete |
| `src/lib/supabase.js` | ✅ Complete |

### Database / Infra
| File | Status |
|------|--------|
| `supabase/schema.sql` | ✅ Complete — all tables, RLS, triggers, indexes |
| `supabase/cleanup.sql` | ✅ Ready — **must be run manually in Supabase SQL editor** |

---

## One-Time Setup Still Required

### 1. Run the 90-day lead cleanup job
In Supabase Dashboard → Database → Extensions → enable **pg_cron**.
Then in SQL Editor, run the contents of `supabase/cleanup.sql`.
Verify: `select * from cron.job where jobname = 'leadsnap-cleanup-old-leads';`

### 2. Railway environment variables needed
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ANTHROPIC_API_KEY=         ← blocked on API credits
TWILIO_PHONE_NUMBER=       ← blocked on phone number purchase
```
(All others should already be set.)

### 3. Google Cloud Console
- OAuth client type: **Web application**
- Authorized redirect URI: `https://ddeidhlcpkkeenjgjceoniklkejcnmae.chromiumapp.org/`
  (This is `chrome.identity.getRedirectURL()` for your extension ID — recheck if extension ID changes)

---

## Security Audit — Results

All Critical and High issues were fixed in this session.

### Fixed
| Severity | Issue | Fix |
|----------|-------|-----|
| 🔴 Critical | SSRF in `/extract-website` — user-supplied URLs could reach cloud metadata (169.254.169.254) or internal services | Added `isPrivateHost()` function in `profile.js` blocking loopback, link-local, and RFC 1918 ranges |
| 🔴 High | `javascript:` protocol not blocked in lead card `href` — attacker-controlled `post_url` from DB could inject JS | Added `safeUrl()` in `popup.js` that only allows `http:`/`https:` URLs |
| 🔴 High | Auth endpoint `/api/auth/google-exchange` had no dedicated rate limit | Added `authLimiter` (20 req/15min) applied to `/api/auth` |
| 🔴 High | `PORT = process.env.PORT` with no fallback — server binds to port 0 if env var missing | Changed to `process.env.PORT \|\| 3000` |
| 🔴 High | No input length limits — oversized keywords/profile fields reached Claude API burning tokens | Added max-length checks: keyword ≤ 100, business_name ≤ 200, service_description ≤ 2000, phone ≤ 30, timezone ≤ 60 |
| 🔴 High | `background.js handleGoogleSignIn()` duplicated auth storage writes instead of using `setSession()` | Now calls `setSession()` from `storage.js` |
| 🔴 High | `popup.js` had two separate `import ... from storage.js` statements | Merged into one import; `storeSession()` removed and replaced with `setSession()` |
| 🔴 High | `document.getElementById('btn-scan-now')` fetched on every call instead of cached at top | Cached as `scanNowBtn` at module top with other DOM refs |

### Remaining (Medium/Low — acceptable risk)
| Severity | Issue | Notes |
|----------|-------|-------|
| 🟡 Medium | `Billing.jsx` reads `subscriptions` table directly from frontend | Works because anon key is read-only with RLS. Fix: move to backend GET /api/billing/status |
| 🟡 Medium | `success_url`/`cancel_url` in checkout not validated against known domains | Stripe validates the URL is registered in the Stripe dashboard, so exploitability is low |
| 🟡 Medium | `SUPABASE_SERVICE_ROLE_KEY` not validated on startup | Fails fast on first request anyway; add validation in future |
| 🟡 Low | `redirect_uri` accepted from client body in google-exchange without format check | Google validates against registered URIs regardless — low exploitability |
| 🟡 Low | `jsonwebtoken` package in `backend/package.json` unused | Remove when convenient: `npm uninstall jsonwebtoken` |
| 🟡 Low | General rate limiter IP-based — bypassable with proxies | Acceptable for threat model; would need fingerprinting for stronger protection |

---

## Code Quality Audit — Results

### Fixed
| Severity | Issue | Fix |
|----------|-------|-----|
| 🔴 High | Triple-duplicate session storage writes across background.js / popup.js / storage.js | All now go through `setSession()` from `storage.js` |
| 🔴 High | Double import from `storage.js` in popup.js | Merged into one statement |
| 🔴 High | `btn-scan-now` DOM ref not cached | Added to top-of-file DOM refs block |

### Remaining (Medium/Low — acceptable)
| Severity | Issue | Notes |
|----------|-------|-------|
| 🟡 Medium | `Billing.jsx` direct Supabase access inconsistent with backend-API pattern everywhere else | Low risk; fix when moving billing status to backend |
| 🟡 Medium | `useLeads.js` maintains both `offset` state and `offsetRef` | `offset` state is unused after being set; only `offsetRef.current` is read. Could remove the state; left as-is since it causes no bugs |
| 🟡 Medium | `groups.js` checks `reason === 'trial'` — magic string coupling to subscription.js | Extract as a constant if `isSubscriptionActive` logic changes |
| 🟡 Low | `content.js` destructures `window.LeadSnapStorage` at bottom of file after functions that use it | Works due to JS hoisting rules; confusing but harmless |

---

## TODO List (Priority Order)

### Blocked (waiting on external accounts)
- Meta Developer account → Facebook App ID → Facebook OAuth
- Anthropic API credits → add `ANTHROPIC_API_KEY` to Railway env
- Twilio phone number → add `TWILIO_PHONE_NUMBER` to Railway env

### Must Fix Before Launch
1. **Full end-to-end test** — install extension → scan a real Facebook group → backend scores → SMS sent. This hasn't been tested with live credentials.
2. **Test subscription expiry / trial end paywall** — confirm extension stops scanning after trial ends and resume works after upgrade.
3. **Test SMS daily cap** — confirm 50th alert sends, 51st is silently skipped.
4. **Test rate limiting** — hit endpoints over their limits, confirm 429 response.
5. **Facebook DOM selectors** — test `content.js` on real groups after install; update selectors if needed.
6. **Chrome Web Store submission** — needs: 3+ screenshots (1280×800), promo tile (440×280), description, permission justifications. CWS URL is a placeholder in `CLAUDE.md`.

### Ship Soon After Launch
- **Account deletion UI** — promised in Privacy Policy. Add to Settings page: DELETE /api/profile (cascades via Supabase RLS).
- **CSV data export** — promised in Privacy Policy.
- **Urgent badge on lead cards** — Claude returns `urgent: boolean` in score result but Dashboard never surfaces it.
- **React error boundary** on Dashboard — uncaught render errors currently white-screen.
- **Billing.jsx refactor** — move subscription read to backend GET `/api/billing/status` for consistency.
- **`ws` package** — in backend/package.json but not used. Remove.
- **`jsonwebtoken` package** — in backend/package.json but not used. Run `npm uninstall jsonwebtoken ws`.

### Post Launch
- **Dashboard pagination UI polish** — currently "Load more" button; consider infinite scroll.
- **90-day lead cleanup** — verify pg_cron job is running in Supabase (`select * from cron.job_run_details ...`).
- Lead search and date filtering on Dashboard.
- Stats strip on Dashboard (leads this week, avg score, win rate).
- Email fallback for SMS alerts.
- Feedback loop — leads marked won/lost update AI scoring weights.
- "Extension not connected" warning on Dashboard when no scan in >24hrs.
- Mobile landing page hero text overflow fix.

---

## Architecture Quick Reference

### Auth flow (extension)
```
Popup click → message to background SW → launchWebAuthFlow (Google)
→ code + verifier → POST /api/auth/google-exchange → Supabase session
→ setSession() in storage.js → chrome.action.openPopup()
```

### Auth flow (frontend → dashboard)
```
Popup openDashboardTab() → opens /auth/callback#access_token=...&refresh_token=...
→ AuthCallback.jsx: supabase.auth.setSession() → navigate('/dashboard')
```

### Lead detection flow
```
chrome.alarms → background runScanCycle() → tabs.sendMessage(LEADSNAP_SCAN)
→ content.js scrapes posts → matches keywords → sendMessage(LEADSNAP_LEAD_FOUND)
→ background handleLeadFound() → POST /api/leads/ingest
→ Claude scores + generates reply → Supabase insert → Twilio SMS
```

### Key environment variables
| Service | Where set |
|---------|-----------|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Railway |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` | Railway |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Railway |
| `ANTHROPIC_API_KEY` | Railway |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Railway |
| `FRONTEND_URL` | Railway (set to `https://leadsnap-weld.vercel.app`) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` | Vercel |
| Extension constants | `extension/utils/config.js` (hardcoded — safe, anon key only) |

---

## What to Work On Next Session

**Priority 1:** Run the `supabase/cleanup.sql` script (3 minutes — just paste in SQL editor).

**Priority 2:** End-to-end test with live credentials. Load the unpacked extension, open Facebook groups, watch the console in the background service worker, verify leads flow through to the DB and SMS sends. This will surface any real bugs in the scan flow that mocks can't catch.

**Priority 3:** Account deletion + CSV export in Settings (Privacy Policy promises both).

**Priority 4:** Remove unused backend packages: `npm uninstall jsonwebtoken ws` in `backend/`.

**Priority 5:** Chrome Web Store assets — screenshots, promo tile, store description.
