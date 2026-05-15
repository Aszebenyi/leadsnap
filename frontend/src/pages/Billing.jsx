import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { getBillingStatus, createCheckoutSession, createPortalSession } from '../lib/api';

const STATUS_LABEL = {
  trial:     { label: 'Free trial', color: 'bg-orange-100 text-orange-700' },
  active:    { label: 'Active',     color: 'bg-green-100 text-green-700'   },
  past_due:  { label: 'Past due',   color: 'bg-yellow-100 text-yellow-700' },
  cancelled: { label: 'Cancelled',  color: 'bg-red-100 text-red-600'       },
};

const FEATURES = [
  'Unlimited Facebook groups',
  'Unlimited keywords',
  'Instant SMS & WhatsApp alerts',
  'AI-generated replies',
  '90-day lead history',
];

export default function Billing() {
  const [subscription,   setSubscription]   = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [actionLoading,  setActionLoading]  = useState(false);
  const [error,          setError]          = useState('');

  useEffect(() => {
    getBillingStatus()
      .then(setSubscription)
      .catch((err) => setError(err.message || 'Could not load billing status.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe() {
    setError('');
    setActionLoading(true);
    try {
      const origin = window.location.origin;
      const { url } = await createCheckoutSession(
        `${origin}/billing?success=1`,
        `${origin}/billing?cancelled=1`
      );
      window.location.href = url;
    } catch (err) {
      setError(err.message || 'Could not start checkout. Please try again.');
      setActionLoading(false);
    }
  }

  async function handleManage() {
    setError('');
    setActionLoading(true);
    try {
      const { url } = await createPortalSession(window.location.href);
      window.location.href = url;
    } catch (err) {
      setError(err.message || 'Could not open billing portal. Please try again.');
      setActionLoading(false);
    }
  }

  const status    = subscription?.status;
  const badge     = STATUS_LABEL[status] ?? { label: 'No subscription', color: 'bg-gray-100 text-gray-600' };
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const trialEnd  = subscription?.trial_ends_at
    ? new Date(subscription.trial_ends_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const trialDaysLeft = subscription?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(subscription.trial_ends_at) - Date.now()) / 86_400_000))
    : null;

  const showUpgrade = !subscription || status === 'cancelled' || status === 'trial';
  const showManage  = subscription?.stripe_customer_id && (status === 'active' || status === 'past_due');

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing</h1>

        {/* Stripe redirect success banner */}
        {new URLSearchParams(window.location.search).get('success') && (
          <div className="mb-6 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg border border-green-200">
            🎉 You're subscribed! Your Pro plan is now active.
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4 animate-pulse">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <div className="h-3 w-24 bg-gray-200 rounded" />
                <div className="h-6 w-36 bg-gray-200 rounded" />
                <div className="h-3 w-20 bg-gray-200 rounded" />
              </div>
              <div className="h-6 w-20 bg-gray-200 rounded-full" />
            </div>
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-4 bg-gray-100 rounded" />)}
            </div>
            <div className="h-11 bg-gray-200 rounded-lg" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">

            {/* Plan header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-1">Current plan</p>
                <p className="text-xl font-bold text-gray-900">LeadSnap Pro</p>
                <p className="text-gray-500 text-sm mt-0.5">$29 / month</p>
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full shrink-0 ${badge.color}`}>
                {badge.label}
              </span>
            </div>

            {/* Status-specific info */}
            {status === 'trial' && trialEnd && (
              <div className="text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                {trialDaysLeft !== null && trialDaysLeft > 0
                  ? <><strong>{trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''}</strong> left in your free trial — trial ends on {trialEnd}.</>
                  : <>Your free trial ended on {trialEnd}.</>
                } Subscribe to keep access.
              </div>
            )}
            {status === 'active' && periodEnd && (
              <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                Next billing date: <strong>{periodEnd}</strong>
              </p>
            )}
            {status === 'past_due' && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                ⚠️ Your payment is past due. Update your payment method to restore full access.
              </div>
            )}
            {status === 'cancelled' && (
              <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                Your subscription has been cancelled. Subscribe again to restore access.
              </div>
            )}

            {/* Features */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">What's included</p>
              <ul className="space-y-2">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="text-green-500 font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* CTAs */}
            <div className="space-y-2 pt-2">
              {showUpgrade && (
                <button
                  onClick={handleSubscribe}
                  disabled={actionLoading}
                  className="w-full bg-orange-500 text-white py-3 rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Redirecting…' : status === 'trial' ? 'Upgrade now — $29/month' : 'Subscribe — $29/month'}
                </button>
              )}

              {showManage && (
                <>
                  <button
                    onClick={handleManage}
                    disabled={actionLoading}
                    className="w-full border border-gray-300 text-gray-700 py-3 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {actionLoading ? 'Redirecting…' : 'Manage billing'}
                  </button>
                  <p className="text-xs text-gray-400 text-center">
                    To cancel your subscription, click "Manage billing" and cancel from the Stripe portal.
                  </p>
                </>
              )}

              {/* Trial: show manage billing if customer exists (can update card) */}
              {status === 'trial' && subscription?.stripe_customer_id && (
                <button
                  onClick={handleManage}
                  disabled={actionLoading}
                  className="w-full border border-gray-300 text-gray-600 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Redirecting…' : 'Manage billing'}
                </button>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
