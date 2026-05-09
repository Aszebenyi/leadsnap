import supabase from '../lib/supabase.js';
import { isSubscriptionActive } from '../lib/subscription.js';

export async function requireSubscription(req, res, next) {
  const { data: sub, error } = await supabase
    .from('subscriptions')
    .select('status, trial_ends_at, current_period_end')
    .eq('user_id', req.user.id)
    .maybeSingle();

  if (error) {
    console.error('Subscription lookup error:', error);
    return res.status(500).json({ error: 'Failed to verify subscription' });
  }

  if (!sub) {
    return res.status(403).json({ error: 'No subscription found', code: 'NO_SUBSCRIPTION' });
  }

  const { active } = isSubscriptionActive(sub);
  if (!active) {
    return res.status(403).json({ error: 'Subscription required', code: 'SUBSCRIPTION_REQUIRED' });
  }

  req.subscription = sub;
  next();
}
