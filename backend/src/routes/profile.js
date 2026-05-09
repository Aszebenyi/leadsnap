import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import supabase from '../lib/supabase.js';
import { extractBusinessInfo } from '../services/claude.js';

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
    next(err);
  }
});

export default router;
