import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireSubscription } from '../middleware/subscription.js';
import { isSubscriptionActive } from '../lib/subscription.js';
import supabase from '../lib/supabase.js';

const TRIAL_GROUP_LIMIT = 5;

const router = Router();

// GET /api/groups
router.get('/', requireAuth, requireSubscription, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/groups
router.post('/', requireAuth, requireSubscription, async (req, res, next) => {
  try {
    const { facebook_group_url, group_name } = req.body;

    if (!facebook_group_url || typeof facebook_group_url !== 'string' || !facebook_group_url.trim()) {
      return res.status(400).json({ error: 'facebook_group_url is required' });
    }

    let url;
    try {
      url = new URL(facebook_group_url.trim());
    } catch {
      return res.status(400).json({ error: 'facebook_group_url must be a valid URL' });
    }

    if (!url.hostname.includes('facebook.com')) {
      return res.status(400).json({ error: 'URL must be a facebook.com URL' });
    }

    // Check trial group limit. req.subscription is already set by requireSubscription,
    // so we don't need a second Supabase query for the subscription row.
    const { reason } = isSubscriptionActive(req.subscription);
    if (reason === 'trial') {
      const { count } = await supabase
        .from('groups')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id);

      if (count >= TRIAL_GROUP_LIMIT) {
        return res.status(403).json({
          error: `Trial plan is limited to ${TRIAL_GROUP_LIMIT} groups. Upgrade to add more.`,
          code: 'TRIAL_LIMIT',
        });
      }
    }

    const { data, error } = await supabase
      .from('groups')
      .insert({
        user_id: req.user.id,
        facebook_group_url: url.toString(),
        group_name: group_name?.trim() || null,
      })
      .select()
      .single();

    // DB-level trigger will reject inserts that exceed the trial cap,
    // surfacing as a Postgres error with code P0001.
    if (error) {
      if (error.code === 'P0001') {
        return res.status(403).json({
          error: 'Trial plan is limited to 5 groups. Upgrade to add more.',
          code: 'TRIAL_LIMIT',
        });
      }
      throw error;
    }

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/groups/:id — no subscription check, cleanup should always be allowed
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user.id);

    if (error) throw error;

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
