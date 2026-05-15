import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// ── Startup env validation ────────────────────────────────────────────────────
// Fail fast if required environment variables are missing.
// Hard failures in production are preferable to silent misbehaviour.
const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`[LeadSnap] Missing required environment variable(s): ${missingEnv.join(', ')}`);
  process.exit(1);
}

process.on('uncaughtException', (err) => {
  console.error('[CRASH] Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH] Unhandled rejection:', reason);
  process.exit(1);
});

import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import keywordsRoutes from './routes/keywords.js';
import groupsRoutes from './routes/groups.js';
import profileRoutes from './routes/profile.js';
import billingRoutes from './routes/billing.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Rate limiters ─────────────────────────────────────────────────────────────

// General: 100 requests per 15 minutes per IP.
// Skip the Stripe webhook — it's called by Stripe servers, not users.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/api/billing/webhook'),
  message: { error: 'Too many requests, please try again later.' },
});

// Lead ingest: 60 requests per hour per IP.
const ingestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many lead submissions, please try again later.' },
});

// Billing checkout: 10 requests per hour per IP.
const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many checkout requests, please try again later.' },
});

// Auth (google-exchange): 20 requests per 15 minutes per IP.
// Tight limit — legitimate users rarely call this more than once per session.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  // Chrome extension popups send requests with a chrome-extension:// origin.
  // We can't match the exact extension ID here (it changes per install in dev),
  // so we accept any chrome-extension:// origin and rely on JWT auth for security.
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. server-to-server, curl)
    if (!origin) return callback(null, true);
    // Allow the frontend URL
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Allow any Chrome extension origin
    if (origin.startsWith('chrome-extension://')) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// Apply general rate limiter to all routes
app.use(generalLimiter);

// Apply tighter limiters to specific high-value endpoints
app.use('/api/leads/ingest',      ingestLimiter);
app.use('/api/billing/checkout',  checkoutLimiter);
app.use('/api/auth',              authLimiter);

// Stripe webhook needs raw body before JSON parser
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/keywords', keywordsRoutes);
app.use('/api/groups', groupsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/billing', billingRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`LeadSnap API running on port ${PORT}`);
});
