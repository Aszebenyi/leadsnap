import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import supabase from '../lib/supabase.js';
import { extractBusinessInfo, suggestLeadDescription } from '../services/claude.js';

const router = Router();

// GET /api/profile
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// PUT /api/profile
router.put('/', requireAuth, async (req, res, next) => {
  try {
    const { business_name, service_description, phone_number, timezone } = req.body;

    // Length guards — prevent oversized strings reaching Claude or the DB
    if (business_name     !== undefined && String(business_name).length     > 200)  return res.status(400).json({ error: 'business_name must be 200 characters or fewer' });
    if (service_description !== undefined && String(service_description).length > 2000) return res.status(400).json({ error: 'service_description must be 2000 characters or fewer' });
    if (phone_number      !== undefined && String(phone_number).length      > 30)   return res.status(400).json({ error: 'phone_number must be 30 characters or fewer' });
    if (timezone          !== undefined && String(timezone).length          > 60)   return res.status(400).json({ error: 'timezone must be 60 characters or fewer' });

    const updates = {};
    if (business_name !== undefined) updates.business_name = business_name;
    if (service_description !== undefined) updates.service_description = service_description;
    if (phone_number !== undefined) updates.phone_number = phone_number;
    if (timezone !== undefined) updates.timezone = timezone;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── SSRF protection helper ────────────────────────────────────────────────────

/**
 * Returns true if the hostname points to a private/loopback/link-local address.
 * Blocks cloud metadata endpoints (169.254.169.254), RFC 1918 private ranges,
 * loopback addresses, and other non-routable hosts.
 *
 * Note: this is hostname-level protection. DNS rebinding attacks are out of scope
 * for this threat model (users are authenticated and can only harm themselves).
 */
function isPrivateHost(hostname) {
  // Loopback and special names
  if (/^(localhost|ip6-localhost|ip6-loopback)$/i.test(hostname)) return true;

  // IPv4 loopback
  if (/^127\./.test(hostname)) return true;

  // Unspecified
  if (hostname === '0.0.0.0' || hostname === '::' || hostname === '::1') return true;

  // Link-local — includes AWS/GCP/Azure metadata (169.254.169.254)
  if (/^169\.254\./.test(hostname)) return true;

  // RFC 1918 private ranges
  if (/^10\./.test(hostname)) return true;
  if (/^192\.168\./.test(hostname)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true;

  return false;
}

// POST /api/profile/extract-website
router.post('/extract-website', requireAuth, async (req, res, next) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });

    // Validate URL format before fetching
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'URL must use http or https' });
    }

    // SSRF protection — block private/internal hosts
    if (isPrivateHost(parsedUrl.hostname)) {
      return res.status(400).json({ error: 'URL must be a publicly accessible website' });
    }

    // Fetch the page HTML (10s timeout, follow redirects)
    let html;
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadSnap/1.0; +https://leadsnap.app)' },
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
      });
      html = await r.text();
    } catch {
      return res.status(422).json({ error: 'Could not fetch that URL. Check it and try again.' });
    }

    // Strip tags, collapse whitespace, cap at 5 000 chars for Claude
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5_000);

    const result = await extractBusinessInfo(text, url);
    res.json(result);
  } catch (err) {
    const isAuthErr = /apiKey|authToken|authentication/i.test(err.message ?? '');
    const msg = isAuthErr
      ? 'AI service not configured — add ANTHROPIC_API_KEY to the server environment'
      : (err.message ?? 'Extraction failed');
    res.status(500).json({ error: msg });
  }
});

// POST /api/profile/heartbeat — called by extension after each scan cycle
router.post('/heartbeat', requireAuth, async (req, res, next) => {
  try {
    await supabase
      .from('profiles')
      .update({ last_scan_at: new Date().toISOString() })
      .eq('id', req.user.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// DELETE /api/profile — permanently deletes the user's account and all associated data
router.delete('/', requireAuth, async (req, res, next) => {
  try {
    const { error } = await supabase.auth.admin.deleteUser(req.user.id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /api/profile/suggest-description
// Generates a 2-sentence ideal-lead description using Claude.
// Body: { service_description?: string, keywords?: string[] }
router.post('/suggest-description', requireAuth, async (req, res, next) => {
  try {
    const { service_description = '', keywords = [] } = req.body;

    if (!service_description.trim() && !keywords.length) {
      return res.status(400).json({ error: 'Provide a service_description or at least one keyword' });
    }

    const suggestion = await suggestLeadDescription(service_description, keywords);
    res.json({ suggestion });
  } catch (err) {
    next(err);
  }
});

export default router;
