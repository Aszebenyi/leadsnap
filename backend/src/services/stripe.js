import Stripe from 'stripe';

// Initialized lazily so missing key doesn't crash the server on startup
let _client;
function getClient() {
  if (!_client) _client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _client;
}

/**
 * Create a Stripe Checkout session for the Pro plan.
 * Looks up or creates a Stripe customer tied to the Supabase user ID.
 * @returns {{ url: string }}
 */
export async function createCheckoutSession({ userId, email, stripeCustomerId, successUrl, cancelUrl }) {
  const stripe = getClient();

  // Reuse existing customer or let Stripe create one from the email.
  // We pass client_reference_id so the webhook can link the session back to our user.
  const sessionParams = {
    mode:                 'subscription',
    line_items:           [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url:          successUrl,
    cancel_url:           cancelUrl,
    client_reference_id:  userId,
    subscription_data: {
      trial_period_days: 7,
      metadata: { user_id: userId },
    },
    metadata: { user_id: userId },
  };

  if (stripeCustomerId) {
    sessionParams.customer = stripeCustomerId;
  } else {
    sessionParams.customer_email = email;
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return { url: session.url };
}

/**
 * Create a Stripe Customer Portal session so the user can manage their billing.
 * @returns {{ url: string }}
 */
export async function createPortalSession({ stripeCustomerId, returnUrl }) {
  const session = await getClient().billingPortal.sessions.create({
    customer:   stripeCustomerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

/**
 * Validate and parse an incoming Stripe webhook event.
 * Throws if the signature is invalid.
 * @returns {Stripe.Event}
 */
export function constructWebhookEvent(rawBody, signature) {
  return getClient().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}
