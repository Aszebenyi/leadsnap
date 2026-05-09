/**
 * Determines whether a subscription row represents an active subscription.
 * Used by requireSubscription middleware and the groups route trial-limit check.
 *
 * @param {object} sub - Row from the subscriptions table
 * @returns {{ active: boolean, reason: string }}
 */
export function isSubscriptionActive(sub) {
  if (!sub) return { active: false, reason: 'no_subscription' };

  const now = new Date();

  if (sub.status === 'trial') {
    const active = !!sub.trial_ends_at && new Date(sub.trial_ends_at) > now;
    return { active, reason: active ? 'trial' : 'trial_expired' };
  }

  if (sub.status === 'active') {
    // current_period_end must be set and in the future for a paid sub to be valid
    const active = !!sub.current_period_end && new Date(sub.current_period_end) > now;
    return { active, reason: active ? 'paid' : 'period_ended' };
  }

  return { active: false, reason: sub.status ?? 'unknown' };
}
