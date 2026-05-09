# LeadSnap — Project Context for Claude Code

## What This Product Does
LeadSnap is a Chrome Extension SaaS that monitors Facebook groups for job requests posted by people looking for local services (plumbers, lawn care, cleaners, dog boarding, etc). When a matching post is detected, the user receives an SMS alert with the post content and an AI-generated reply ready to send. The goal is to help local service businesses reply first and win more jobs.

## Core User Flow
1. User signs up on the web dashboard
2. User installs the Chrome extension and logs in
3. User sets their keywords (e.g. "lawn mowing", "plumber needed") and business description
4. Extension runs in background while Chrome is open
5. Extension scans Facebook groups the user is a member of
6. When a post matches keywords, it is sent to the backend API
7. Backend scores the post using Claude API (1-10 buyer intent score)
8. Backend generates an AI reply using Claude API
9. Backend sends SMS via Twilio with: post preview + group name + score + AI reply + link
10. Lead is stored in database
11. User can view all leads in the dashboard

---

## Tech Stack

### Chrome Extension
- Manifest V3
- Vanilla JavaScript (no frameworks)
- Background service worker (background.js)
- Content script (content.js)
- Popup UI (popup.html + popup.js)
- chrome.storage.sync for user settings
- chrome.storage.local for lead cache
- chrome.alarms for scheduled scanning (every 10 minutes)
- Communicates with backend via fetch() calls to REST API
- Auth token stored in chrome.storage.sync

### Backend
- Node.js + Express
- Hosted on Railway
- REST API
- JWT authentication (tokens issued by Supabase Auth)
- All API routes protected by auth middleware
- Subscription check middleware on protected routes

### Database
- Supabase (PostgreSQL)
- Supabase Auth for user authentication
- Row Level Security enabled on all tables
- Direct Supabase client used in backend (service role key)

### Frontend Dashboard + Landing Page
- React + Vite
- React Router for navigation
- Tailwind CSS for styling
- Hosted on Vercel or Railway
- Uses Supabase Auth for login state
- Calls backend API for all data

### Third Party Services
- Stripe — subscription billing ($29/month Pro plan, 7-day free trial)
- Twilio — SMS alerts
- Anthropic Claude API — lead scoring + reply generation
- Supabase — database + auth

---

## Folder Structure

```
leadsnap/
├── CLAUDE.md                    ← this file
├── extension/                   ← Chrome Extension
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon32.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── utils/
│       ├── api.js               ← all fetch calls to backend
│       └── storage.js           ← chrome.storage helpers
│
├── backend/                     ← Node.js API Server
│   ├── src/
│   │   ├── index.js             ← Express app entry point
│   │   ├── routes/
│   │   │   ├── auth.js          ← /api/auth/*
│   │   │   ├── leads.js         ← /api/leads/*
│   │   │   ├── keywords.js      ← /api/keywords/*
│   │   │   ├── groups.js        ← /api/groups/*
│   │   │   ├── profile.js       ← /api/profile/*
│   │   │   └── billing.js       ← /api/billing/*
│   │   ├── services/
│   │   │   ├── claude.js        ← Anthropic API calls
│   │   │   ├── twilio.js        ← SMS sending
│   │   │   └── stripe.js        ← Stripe operations
│   │   ├── middleware/
│   │   │   ├── auth.js          ← validate Supabase JWT
│   │   │   └── subscription.js  ← check active subscription
│   │   └── lib/
│   │       └── supabase.js      ← Supabase client (service role)
│   ├── .env                     ← environment variables (never commit)
│   ├── .env.example             ← template for env vars
│   ├── package.json
│   └── railway.json             ← Railway deployment config
│
└── frontend/                    ← React Dashboard + Landing Page
    ├── src/
    │   ├── main.jsx
    │   ├── App.jsx
    │   ├── pages/
    │   │   ├── Landing.jsx      ← public landing page
    │   │   ├── Login.jsx        ← login page
    │   │   ├── Signup.jsx       ← signup page
    │   │   ├── Dashboard.jsx    ← lead feed
    │   │   ├── Settings.jsx     ← keywords, groups, phone, description
    │   │   ├── Billing.jsx      ← subscription management
    │   │   └── Onboarding.jsx   ← post-signup setup flow
    │   ├── components/
    │   │   ├── LeadCard.jsx
    │   │   ├── KeywordManager.jsx
    │   │   ├── GroupManager.jsx
    │   │   └── Navbar.jsx
    │   ├── lib/
    │   │   ├── supabase.js      ← Supabase client (anon key)
    │   │   └── api.js           ← backend API calls
    │   └── hooks/
    │       ├── useAuth.js
    │       └── useLeads.js
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    └── package.json
```

---

## Database Schema (Supabase / PostgreSQL)

### users (managed by Supabase Auth)
This table is auto-created by Supabase Auth. Do not create manually.

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

### Auth (handled by Supabase, not backend)
- Signup, login, password reset all done client-side via Supabase Auth SDK
- Backend only validates the JWT token on each request

### POST /api/leads/ingest
- Called by Chrome extension when a matched post is detected
- Receives: post_text, post_url, author_name, group_name, group_url, matched_keywords
- Scores lead with Claude API
- Generates reply with Claude API
- Saves lead to database
- Sends SMS via Twilio
- Returns: lead object with score and reply
- Auth required: yes
- Subscription required: yes

### GET /api/leads
- Returns paginated list of leads for authenticated user
- Query params: status, limit, offset
- Auth required: yes

### PATCH /api/leads/:id
- Update lead status (seen, replied, won, lost)
- Auth required: yes

### GET /api/keywords
- Returns all keywords for authenticated user
- Auth required: yes

### POST /api/keywords
- Add a keyword
- Auth required: yes

### DELETE /api/keywords/:id
- Delete a keyword
- Auth required: yes

### GET /api/groups
- Returns all groups for authenticated user
- Auth required: yes

### POST /api/groups
- Add a Facebook group URL
- Auth required: yes

### DELETE /api/groups/:id
- Remove a group
- Auth required: yes

### GET /api/profile
- Returns profile for authenticated user
- Auth required: yes

### PUT /api/profile
- Update profile (business_name, service_description, phone_number, timezone)
- Auth required: yes

### POST /api/billing/checkout
- Creates Stripe checkout session
- Returns: checkout URL
- Auth required: yes

### POST /api/billing/portal
- Creates Stripe customer portal session
- Returns: portal URL
- Auth required: yes

### POST /api/billing/webhook
- Stripe webhook endpoint (no auth, validated by Stripe signature)
- Handles: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted

---

## Environment Variables

### Backend (.env)
```
PORT=3000
NODE_ENV=development

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Anthropic
ANTHROPIC_API_KEY=

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173
```

### Frontend (.env)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=http://localhost:3000
```

---

## Claude API Prompts

### Lead Scoring
```
System: You are a lead scoring assistant for a local service business.
Score this Facebook post for buyer intent on a scale of 1-10.

Return JSON only:
{
  "score": <number 1-10>,
  "reason": "<one sentence>",
  "urgent": <boolean>
}

Score guidelines:
- 9-10: Clear request for a service, ready to hire now
- 7-8: Looking for a service, likely to hire soon
- 5-6: Possibly looking, but unclear
- 3-4: Asking for recommendation for someone else
- 1-2: Not a job request at all

User: The business is: {service_description}
Post: {post_text}
```

### Reply Generation
```
System: You are a reply assistant for a local service business.
Write a short, friendly reply to this Facebook post.

Rules:
- Maximum 2 sentences
- Sound natural, not like an ad
- Mention availability or willingness to help
- End with a soft call to action (DM me, send me a message, etc)
- Do not use hashtags
- Do not be pushy or salesy
- Sound like a real local person

Return the reply text only, no quotes, no explanation.

User: My business: {service_description}
Post: {post_text}
```

---

## Subscription Plans

### Free Trial
- 7 days
- Up to 5 groups
- All features included
- No credit card required

### Pro — $29/month
- Unlimited groups
- Unlimited keywords
- All features
- Priority support

---

## Key Business Rules

1. Users on free trial get full access for 7 days
2. After trial, they must subscribe to continue
3. Extension checks subscription status on startup and every hour
4. If subscription is cancelled or expired, extension stops scanning
5. Users can only access their own data (Row Level Security)
6. SMS alerts are capped at 50 per day per user to prevent abuse
7. Leads are retained for 90 days
8. Extension only scans when Chrome is open and user is logged into Facebook

---

## Build Order

Build in this exact order. Do not skip ahead.

1. Supabase project setup + run schema SQL
2. Backend scaffold (Express, folder structure, env config)
3. Backend auth middleware (validate Supabase JWT)
4. Backend profile routes
5. Backend keywords routes
6. Backend groups routes
7. Deploy backend to Railway
8. Chrome extension scaffold
9. Extension auth (login, token storage, validation)
10. Extension popup UI (keywords, groups, settings)
11. Extension content script (Facebook DOM scraper)
12. Extension background service worker (alarm, scan loop)
13. Extension sends posts to backend /api/leads/ingest
14. Backend Claude API integration (scoring + reply)
15. Backend Twilio SMS integration
16. Backend leads routes (GET, PATCH)
17. Backend Stripe integration (checkout, webhook, portal)
18. Frontend scaffold (React + Vite + Tailwind)
19. Frontend auth pages (login, signup)
20. Frontend onboarding flow
21. Frontend dashboard (lead feed)
22. Frontend settings page
23. Frontend billing page
24. Landing page
25. End to end testing
26. Chrome Web Store submission

---

## Important Technical Notes

### Chrome Extension MV3 Rules
- No remote code execution
- Background script is a service worker (not persistent)
- Use chrome.alarms instead of setInterval for scheduling
- Content scripts cannot use ES modules directly
- All API keys must be on the backend, never in the extension

### Facebook DOM Notes
- Facebook frequently changes class names
- Use data-testid attributes where possible as they are more stable
- Posts are inside role="article" elements
- Expect to update selectors periodically
- Test on real Facebook groups immediately after building

### Supabase RLS Policies
Every table must have RLS enabled with policies like:
- Users can only SELECT their own rows (user_id = auth.uid())
- Users can only INSERT rows with their own user_id
- Users can only UPDATE/DELETE their own rows

### Stripe Webhook
- Must validate webhook signature on every request
- Handle idempotency (webhooks can fire multiple times)
- checkout.session.completed → create subscription record
- customer.subscription.updated → update subscription status
- customer.subscription.deleted → set status to cancelled
