import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import authRoutes from './routes/auth.js';
import leadsRoutes from './routes/leads.js';
import keywordsRoutes from './routes/keywords.js';
import groupsRoutes from './routes/groups.js';
import profileRoutes from './routes/profile.js';
import billingRoutes from './routes/billing.js';

const app = express();
const PORT = process.env.PORT;

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

app.listen(PORT, () => {
  console.log(`LeadSnap API running on port ${PORT}`);
});
