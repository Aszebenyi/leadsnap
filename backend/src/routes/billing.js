import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createCheckoutSession, createPortalSession, constructWebhookEvent } from '../services/stripe.js';
import supabase from '../lib/supabase.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch the subscription row for a user, or null if none exists. */
async function getSubscription(userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ── GET /api/billing/status ───────────────────────────────────────────────────

router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const sub = await getSubscription(req.user.id);
    res.json(sub ?? null);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/billing/checkout ────────────────────────────────────────────────
// Creates a Stripe Checkout session and returns the redirect URL.

router.post('/checkout', requireAuth, async (req, res, next) => {
  try {
    const { success_url, cancel_url } = req.body;

    if (!success_url || !cancel_url) {
      return res.status(400).json({ error: 'success_url and cancel_url are required' });
    }

    // Look up existing subscription to reuse the Stripe customer ID if present
    const sub = await getSubscription(req.user.id);

    const { url } = await createCheckoutSession({
      userId:           req.user.id,
      email:            req.user.email,
      stripeCustomerId: sub?.stripe_customer_id ?? null,
      successUrl:       success_url,
      cancelUrl:        cancel_url,
    });

    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/billing/portal ──────────────────────────────────────────────────
// Creates a Stripe Customer Portal session and returns the redirect URL.

router.post('/portal', requireAuth, async (req, res, next) => {
  try {
    const { return_url } = req.body;

    if (!return_url) {
      return res.status(400).json({ error: 'return_url is required' });
    }

    const sub = await getSubscription(req.user.id);
    if (!sub?.stripe_customer_id) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    const { url } = await createPortalSession({
      stripeCustomerId: sub.stripe_customer_id,
      returnUrl:        return_url,
    });

    res.json({ url });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/billing/webhook ─────────────────────────────────────────────────
// Stripe sends signed events here. Raw body is preserved by index.js middleware.

router.post('/webhook', async (req, res, next) => {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = constructWebhookEvent(req.body, signature);
  } catch (err) {
    console.error('[Stripe] Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    await handleWebhookEvent(event);
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

// ── Webhook event handlers ────────────────────────────────────────────────────

async function handleWebhookEvent(event) {
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;
    default:
      // Unhandled event types are fine — Stripe sends many event types
      console.log(`[Stripe] Unhandled event type: ${event.type}`);
  }
}

/**
 * checkout.session.completed
 * Fires when the user completes payment. Creates or updates the subscription row.
 */
async function handleCheckoutCompleted(session) {
  const userId           = session.client_reference_id;
  const stripeCustomerId = session.customer;
  const stripeSubId      = session.subscription;

  if (!userId) {
    console.error('[Stripe] checkout.session.completed missing client_reference_id');
    return;
  }

  // Upsert — idempotent if the webhook fires more than once
  const { error } = await supabase
    .from('subscriptions')
    .upsert(
      {
        user_id:                userId,
        stripe_customer_id:     stripeCustomerId,
        stripe_subscription_id: stripeSubId,
        status:                 'trial',   // Stripe trial → our trial status
        plan:                   'pro',
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error('[Stripe] Failed to upsert subscription on checkout:', error);
    throw error;
  }

  console.log(`[Stripe] Subscription created for user ${userId}`);
}

/**
 * customer.subscription.updated
 * Fires on plan changes, trial ending, payment failures, renewals, etc.
 * Maps Stripe status → our status and updates current_period_end.
 */
async function handleSubscriptionUpdated(subscription) {
  const stripeSubId = subscription.id;
  const status      = mapStripeStatus(subscription);
  const periodEnd   = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  const { error } = await supabase
    .from('subscriptions')
    .update({ status, current_period_end: periodEnd, updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', stripeSubId);

  if (error) {
    console.error('[Stripe] Failed to update subscription:', error);
    throw error;
  }

  console.log(`[Stripe] Subscription ${stripeSubId} updated → status: ${status}`);
}

/**
 * customer.subscription.deleted
 * Fires when a subscription is fully cancelled (not just paused or past_due).
 */
async function handleSubscriptionDeleted(subscription) {
  const stripeSubId = subscription.id;

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('stripe_subscription_id', stripeSubId);

  if (error) {
    console.error('[Stripe] Failed to mark subscription cancelled:', error);
    throw error;
  }

  console.log(`[Stripe] Subscription ${stripeSubId} cancelled`);
}

// ── Status mapping ────────────────────────────────────────────────────────────

/**
 * Map a Stripe subscription object to our internal status string.
 * Stripe statuses: trialing | active | past_due | unpaid | canceled | incomplete | incomplete_expired | paused
 */
function mapStripeStatus(subscription) {
  switch (subscription.status) {
    case 'trialing':            return 'trial';
    case 'active':              return 'active';
    case 'past_due':            return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':  return 'cancelled';
    default:                    return 'cancelled';
  }
}

export default router;
