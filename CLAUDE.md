# LeadSnap — Project Context for Claude Code

## What This Product Does
LeadSnap is a Chrome Extension SaaS that monitors Facebook groups for job requests posted by people looking for local services (plumbers, lawn care, cleaners, dog boarding, etc). When a matching post is detected, the user receives an SMS alert with the post content and an AI-generated reply ready to send. The goal is to help local service businesses reply first and win more jobs.

## Core User Flow
1. User visits landing page → clicks "Add to Chrome" → installs extension
2. Extension auth page opens → user signs in with Google (OAuth via `chrome.identity`)
3. 6-step extension onboarding: connect Facebook → select groups → add keywords → extract from website → describe ideal lead → phone number
4. Extension runs in background while Chrome is open, scanning every 10 minutes
5. Extension content script scrapes Facebook group posts and matches against keywords
6. Matched post is sent to backend `/api/leads/ingest`
7. Backend scores the post using Claude API (1–10 buyer intent score)
8. Backend generates an AI reply using Claude API
9. Backend sends SMS via Twilio: post preview + group name + score + AI reply + link
10. Lead is stored in database; user views all leads in the web dashboard

---

## Brand

- **Primary colour:** `#f97316` (orange-500)
- **Deep accent:** `#ea6c0b`
- **Light tint:** `#fff7ed`
- **Text on orange:** white
- All blue (`#3b82f6`) has been replaced with orange throughout the extension and frontend.
- CSS custom properties used in Landing: `--accent`, `--accent-deep`, `--accent-glow`.

---

## Tech Stack

### Chrome Extension
- Manifest V3, vanilla JavaScript (ES modules where supported)
- **Auth:** Google OAuth only via `chrome.identity.launchWebAuthFlow` + Supabase PKCE flow. No email/password in the extension.
- Background service worker (`background.js`) — `chrome.alarms` scan loop every 10 min, token refresh alarm every 55 min, subscription cache with 1-hour TTL
- Content script (`content.js`) — Facebook DOM scraper using `role="article"` elements, three-strategy text extraction, keyword matching, deduplication, group discovery
- Popup UI — 3-tab design (Status / Leads / Settings), 380px wide, orange brand, lazy-loads last 5 leads
- 6-step onboarding wizard (see Extension Onboarding section below)
- Auth page — Google-only sign-in with bolt logo
- `chrome.storage.sync` — auth token, user ID, email, keywords, selected groups, AI description, phone, website URL, include-website toggle, onboarding_complete
- `chrome.storage.local` — refresh token, lead cache
- All backend calls go through `utils/api.js`; base URL is a single constant in `utils/config.js`

### Backend
- Node.js + Express, hosted on Railway
- JWT authentication (tokens issued by Supabase Auth, validated on every request)
- **Rate limiting** via `express-rate-limit`:
  - General: 100 req / 15 min per IP (all routes; Stripe webhook excluded)
  - `/api/leads/ingest`: 60 req / hour per IP
  - `/api/billing/checkout`: 10 req / hour per IP
- Subscription check middleware on lead ingest, keywords, and groups routes
- Daily SMS cap: 50 alerts per user per day (enforced in `routes/leads.js`)

### Database
- Supabase (PostgreSQL)
- Supabase Auth for user authentication (Google OAuth provider enabled)
- Row Level Security enabled on all tables
- Direct Supabase client used in backend (service role key)

### Frontend Dashboard + Landing Page
- React + Vite + Tailwind CSS v4
- React Router — public routes (`/`, `/login`, `/signup`, `/privacy`, `/terms`) + protected routes (`/dashboard`, `/settings`, `/billing`, `/onboarding`)
- Hosted on Vercel (`vercel.json` SPA rewrite in place)
- Auth: Supabase Auth SDK (`supabase.auth.signInWithOAuth` for Google, email+password also available)
- All data via backend API (`src/lib/api.js`)
- Fully responsive — mobile hamburger nav, scrollable tab rows, proper touch targets (min 44px)

### Third-Party Services
- **Stripe** — subscription billing ($29/month Pro plan, 7-day free trial, no card required for trial)
- **Twilio** — SMS alerts (any country, 50/day cap per user)
- **Anthropic Claude API** (`claude-3-5-haiku-latest`) — lead scoring, reply generation, website extraction, ideal-lead description suggestion
- **Supabase** — PostgreSQL database + auth
- **Google OAuth** — sign-in for both extension (PKCE via `chrome.identity`) and frontend (`signInWithOAuth`)

---

## Folder Structure

```
leadsnap/
├── CLAUDE.md                         ← this file
│
├── extension/                        ← Chrome Extension (MV3)
│   ├── manifest.json
│   ├── background.js                 ← service worker: scan loop, token refresh, notifications
│   ├── content.js                    ← Facebook DOM scraper + group discovery
│   ├── auth/
│   │   ├── auth.html                 ← Google-only sign-in page (bolt logo, orange)
│   │   └── auth.js                   ← handles signInWithGoogle(), storeSession(), onboarding redirect
│   ├── onboarding/
│   │   ├── onboarding.html           ← 6-step wizard HTML
│   │   ├── onboarding.js             ← wizard logic (ES module)
│   │   └── onboarding.css            ← wizard styles (orange brand)
│   ├── popup/
│   │   ├── popup.html                ← 3-tab popup (Status / Leads / Settings)
│   │   ├── popup.js                  ← popup logic
│   │   └── popup.css                 ← popup styles (380px, orange brand)
│   ├── monitor/
│   │   └── monitor.html              ← hidden window used during Facebook scan
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon32.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── utils/
│       ├── config.js                 ← API_URL + SUPABASE_URL/ANON_KEY + SUBSCRIPTION_STATUS constants
│       ├── api.js                    ← all fetch calls to backend (imports API_URL from config.js)
│       ├── storage.js                ← chrome.storage helpers (background/popup context)
│       ├── storage-content.js        ← chrome.storage helpers (content script context)
│       └── supabase-auth.js          ← Supabase REST auth wrapper + signInWithGoogle() PKCE
│
├── backend/                          ← Node.js + Express API
│   ├── src/
│   │   ├── index.js                  ← Express app: CORS, rate limiters, route mounts, error handler
│   │   ├── routes/
│   │   │   ├── auth.js               ← placeholder (auth is client-side via Supabase)
│   │   │   ├── leads.js              ← /api/leads/ingest, GET, PATCH; daily SMS cap logic
│   │   │   ├── keywords.js           ← /api/keywords CRUD
│   │   │   ├── groups.js             ← /api/groups CRUD
│   │   │   ├── profile.js            ← /api/profile GET/PUT + /extract-website + /suggest-description
│   │   │   └── billing.js            ← /api/billing/checkout, /portal, /webhook
│   │   ├── services/
│   │   │   ├── claude.js             ← scoreLead(), generateReply(), extractBusinessInfo(), suggestLeadDescription()
│   │   │   ├── twilio.js             ← SMS sending
│   │   │   └── stripe.js             ← Stripe operations
│   │   ├── middleware/
│   │   │   ├── auth.js               ← validate Supabase JWT
│   │   │   └── subscription.js       ← check active subscription
│   │   └── lib/
│   │       └── supabase.js           ← Supabase client (service role key)
│   ├── .env                          ← environment variables (never commit)
│   ├── .env.example
│   ├── package.json
│   └── railway.json                  ← Railway deployment config
│
└── frontend/                         ← React Dashboard + Landing Page
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx                   ← router: public + protected routes, PrivateRoute/PublicRoute wrappers
    │   ├── pages/
    │   │   ├── Landing.jsx           ← public landing page (sticky nav, hamburger on mobile, CWS CTA)
    │   │   ├── Landing.css           ← landing-only styles scoped under .ls-root
    │   │   ├── Login.jsx             ← Google OAuth + email/password sign-in
    │   │   ├── Signup.jsx            ← Google OAuth + email/password sign-up
    │   │   ├── Dashboard.jsx         ← lead feed with status filter tabs
    │   │   ├── Settings.jsx          ← profile, keywords, groups (all API-connected)
    │   │   ├── Billing.jsx           ← Stripe checkout + portal + subscription status
    │   │   ├── Onboarding.jsx        ← 4-step web onboarding (profile → keywords → groups → install)
    │   │   ├── Privacy.jsx           ← Privacy Policy page (/privacy)
    │   │   └── Terms.jsx             ← Terms of Service page (/terms)
    │   ├── components/
    │   │   ├── LeadCard.jsx          ← lead card with score badge, AI reply, status selector
    │   │   └── Navbar.jsx            ← responsive nav with hamburger menu on mobile
    │   ├── lib/
    │   │   ├── supabase.js           ← Supabase client (anon key)
    │   │   └── api.js                ← backend API calls
    │   └── hooks/
    │       ├── useAuth.js            ← session init + onAuthStateChange
    │       └── useLeads.js           ← load + paginate leads
    ├── index.html
    ├── vite.config.js
    └── package.json
```

---

## Extension Onboarding — 6-Step Wizard

| Step | Title | Key behaviour |
|------|-------|---------------|
| 1 | Connect Facebook | Opens `facebook.com/groups/feed` in a tab, polls content script for group list, auto-advances |
| 2 | Select Groups | Checkbox list, max 25 groups, sorted by last-visited, "Reload groups" button |
| 3 | Keywords | Chip input (Enter or Add button), remove chips, skip allowed |
| 4 | Website Extractor | URL input → `POST /api/profile/extract-website` → auto-fills name, location, description, suggested keywords; "Include website in AI replies" toggle + URL field on same step |
| 5 | Describe Ideal Lead | Auto-generates 2-sentence description via `POST /api/profile/suggest-description` using extracted description + keywords (or keywords only if no website); validates non-empty before Next |
| 6 | Phone Number | SMS alert number (any country); "Start Monitoring →" saves everything to `chrome.storage.sync` + backend profile + triggers first scan |

---

## Database Schema (Supabase / PostgreSQL)

### users (managed by Supabase Auth)
Auto-created. Do not create manually.

### profiles
```sql
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  business_name text,
  service_description text,
  phone_number text,
  timezone text default 'UTC',
  onboarded boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### subscriptions
```sql
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text default 'trial',  -- trial | active | cancelled | past_due
  plan text default 'pro',
  trial_ends_at timestamptz default (now() + interval '7 days'),
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### keywords
```sql
create table keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  keyword text not null,
  active boolean default true,
  created_at timestamptz default now()
);
```

### groups
```sql
create table groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  facebook_group_url text not null,
  group_name text,
  active boolean default true,
  last_scanned_at timestamptz,
  created_at timestamptz default now()
);
```

### leads
```sql
create table leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  post_text text not null,
  post_url text,
  author_name text,
  group_name text,
  group_url text,
  score integer,              -- 1-10 buyer intent score
  ai_reply text,              -- generated reply
  status text default 'new',  -- new | seen | replied | won | lost
  matched_keywords text[],    -- which keywords triggered this lead
  detected_at timestamptz default now(),
  notified_at timestamptz,
  created_at timestamptz default now()
);
```

### alerts
```sql
create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  lead_id uuid references leads(id) on delete cascade not null,
  channel text default 'sms',
  sent_at timestamptz default now(),
  delivered boolean default false,
  twilio_sid text
);
```

---

## API Routes

### Auth — handled entirely client-side via Supabase Auth SDK
Backend only validates the JWT on each request. `routes/auth.js` is a placeholder.

### POST /api/leads/ingest
- Called by extension when a matched post is found
- Body: `post_text, post_url, author_name, group_name, group_url, matched_keywords, website_url?`
- Scores lead with Claude, generates reply, saves to DB, sends SMS (if under daily cap), records alert
- Auth required: yes | Subscription required: yes | Rate limit: 60/hour

### GET /api/leads
- Paginated lead list for authenticated user
- Query params: `status`, `limit` (default 20), `offset`
- Auth required: yes

### PATCH /api/leads/:id
- Update lead status (`seen | replied | won | lost`)
- Auth required: yes

### GET/POST /api/keywords
### DELETE /api/keywords/:id
- Auth required: yes | Subscription required: yes

### GET/POST /api/groups
### DELETE /api/groups/:id
- Auth required: yes | Subscription required: yes

### GET /api/profile
### PUT /api/profile
- Fields: `business_name, service_description, phone_number, timezone`
- Auth required: yes

### POST /api/profile/extract-website
- Body: `{ url: string }`
- Fetches the URL (10s timeout), strips HTML, passes to Claude `extractBusinessInfo()`
- Returns: `{ business_name, service_description, location, suggested_keywords[] }`
- Auth required: yes

### POST /api/profile/suggest-description
- Body: `{ service_description?: string, keywords?: string[] }`
- Calls Claude `suggestLeadDescription()` — two modes: with website description or keywords-only
- Returns: `{ suggestion: string }` — 2-sentence ideal lead description
- Auth required: yes

### POST /api/billing/checkout
- Creates Stripe checkout session; Rate limit: 10/hour
- Auth required: yes

### POST /api/billing/portal
- Creates Stripe customer portal session
- Auth required: yes

### POST /api/billing/webhook
- Stripe signature-validated webhook (no auth)
- Handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Excluded from general rate limiter

---

## Claude API Functions (`backend/src/services/claude.js`)

All use `claude-3-5-haiku-latest`.

### `scoreLead(postText, serviceDescription, aiDescription?)`
Returns `{ score: 1–10, reason: string, urgent: boolean }`. Uses `aiDescription` (user's ideal lead description) to calibrate scoring beyond keyword matching. **TODO post-launch:** implement feedback loop where won/lost leads update scoring weights.

### `generateReply(postText, serviceDescription, websiteUrl?)`
Returns a 2-sentence natural reply. When `websiteUrl` is provided, naturally mentions the website if it flows. Returns plain text only.

### `extractBusinessInfo(pageText, url)`
Returns `{ business_name, service_description, location, suggested_keywords[] }`. Input is stripped webpage text capped at 5,000 chars.

### `suggestLeadDescription(serviceDescription, keywords[])`
Returns a 2-sentence ideal-lead description. Two modes:
- **With `serviceDescription`**: describes what buyer intent signals look like for this business
- **Keywords only**: describes what the business does + who their ideal customer is

---

## Environment Variables

### Backend (.env)
```
PORT=3000
NODE_ENV=development

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

ANTHROPIC_API_KEY=

FRONTEND_URL=https://leadsnap.app   # used for CORS
```

### Frontend (.env)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=https://leadsnap-backend-production.up.railway.app
```

### Extension (`utils/config.js`)
```js
export const SUPABASE_URL     = '...';   // Supabase project URL
export const SUPABASE_ANON_KEY = '...';  // anon key (safe in client)
export const API_URL           = 'https://leadsnap-backend-production.up.railway.app';
```
**Never hardcode the Railway URL anywhere other than `config.js`.** All other extension files import `API_URL` from there.

---

## Subscription Plans

### Free Trial
- 7 days, all features, no credit card required
- After trial expires, scanning stops until subscribed

### Pro — $29/month
- Unlimited groups and keywords
- Instant SMS alerts (any country)
- AI-generated replies
- 90-day lead history

---

## Key Business Rules

1. Free trial: 7 days full access, no card required
2. After trial, user must subscribe to continue — extension checks on startup and every hour
3. SMS alerts capped at 50 per day per user
4. Leads retained for 90 days (**note: automated cleanup not yet implemented — needs Supabase scheduled function or pg_cron**)
5. Extension only scans when Chrome is open and user is logged into Facebook
6. Users can only access their own data (Row Level Security enforced on all tables)
7. The `website_url` is only included in AI replies when the user enables the "Include website in replies" toggle (stored in `chrome.storage.sync` as `include_website_in_replies`)

---

## What's Still To Build / Known Gaps

- **90-day lead cleanup** — privacy policy promises this; needs a Supabase scheduled function
- **Dashboard pagination UI** — backend supports `limit`/`offset`, frontend doesn't expose it yet
- **Account deletion UI** — promised in privacy policy; currently email-only
- **Data export (CSV)** — promised in privacy policy; not yet built
- **Urgent badge on lead cards** — Claude returns `urgent: boolean` but the Dashboard never surfaces it
- **Chrome Web Store submission** — CWS URL is a placeholder (`https://chrome.google.com/webstore/detail/leadsnap`); update after publishing
- **No tests** — no unit or integration tests exist anywhere in the project

---

## Important Technical Notes

### Chrome Extension MV3
- No remote code execution
- Background script is a service worker (not persistent — state resets between events)
- Use `chrome.alarms` instead of `setInterval` for scheduling
- Content scripts cannot use ES modules — `storage-content.js` uses `importScripts`-compatible patterns
- All API keys must be on the backend, never in the extension

### Google OAuth in the Extension (PKCE Flow)
1. Generate code verifier (random 32 bytes, base64url)
2. Derive code challenge (SHA-256 of verifier, base64url)
3. Build Supabase OAuth URL with `provider=google`, `redirect_to=chrome.identity.getRedirectURL()`
4. Open via `chrome.identity.launchWebAuthFlow({ interactive: true })`
5. Extract `code` from the callback URL
6. POST to `/auth/v1/token?grant_type=pkce` with `{ auth_code, code_verifier }`
7. Store `access_token` in `chrome.storage.sync`, `refresh_token` in `chrome.storage.local`

**One-time setup required:** Add `chrome.identity.getRedirectURL()` value to Supabase Auth → URL Configuration → Redirect URLs.

### Facebook DOM Notes
- Facebook frequently changes class names — use `role="article"` and `data-testid` where possible
- Posts inside `role="article"` elements; three-strategy text extraction in `content.js`
- Group URLs detected from sidebar links; deduplication via Set of seen post URLs
- Expect to update selectors periodically — test on real groups after any Facebook UI change

### Rate Limiting (Backend)
- General limiter applied via `app.use(generalLimiter)` before all routes
- Route-specific limiters applied via `app.use('/api/leads/ingest', ingestLimiter)` before route mounts
- Stripe webhook is excluded from the general limiter (skip function checks `req.path`)

### Supabase RLS Policies
Every table must have RLS enabled:
- `SELECT`: `user_id = auth.uid()`
- `INSERT`: `user_id = auth.uid()`
- `UPDATE/DELETE`: `user_id = auth.uid()`

### Stripe Webhook
- Validate signature on every request (`stripe.webhooks.constructEvent`)
- Handle idempotency — webhooks can fire multiple times
- `checkout.session.completed` → upsert subscription record
- `customer.subscription.updated` → update status
- `customer.subscription.deleted` → set status to `cancelled`

### Landing Page CSS
- All landing styles are scoped under `.ls-root` to avoid Tailwind collisions
- CSS custom properties: `--accent` (#f97316), `--accent-deep` (#ea6c0b), `--accent-glow`, `--ink`, `--ink-2`, `--stroke`
- Two breakpoints: 1080px (demo stage collapses) and 680px (nav collapses, hamburger appears)
- Mobile hamburger controlled by React state in `Landing.jsx` (not CSS display toggling)
