import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireSubscription } from '../middleware/subscription.js';
import supabase from '../lib/supabase.js';

const router = Router();

// GET /api/keywords
router.get('/', requireAuth, requireSubscription, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('keywords')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /api/keywords
router.post('/', requireAuth, requireSubscription, async (req, res, next) => {
  try {
    const { keyword } = req.body;

    if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
      return res.status(400).json({ error: 'keyword is required' });
    }

    const { data, error } = await supabase
      .from('keywords')
      .insert({ user_id: req.user.id, keyword: keyword.trim().toLowerCase() })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/keywords/:id — no subscription check, cleanup should always be allowed
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('keywords')
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
