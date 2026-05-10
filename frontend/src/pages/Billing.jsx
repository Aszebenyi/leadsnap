import { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import { createCheckoutSession, createPortalSession } from '../lib/api';
import supabase from '../lib/supabase';

export default function Billing() {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => {
    async function loadSubscription() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data, error: dbErr } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (dbErr) throw dbErr;
        setSubscription(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadSubscription();
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
      setError(err.message);
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
      setError(err.message);
      setActionLoading(false);
    }
  }

  const status       = subscription?.status;
  const periodEnd    = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;
  const trialEnd     = subscription?.trial_ends_at
    ? new Date(subscription.trial_ends_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const STATUS_LABEL = {
    trial:     { label: 'Free trial',   color: 'bg-orange-100 text-orange-700'   },
    active:    { label: 'Active',       color: 'bg-green-100 text-green-700' },
    past_due:  { label: 'Past due',     color: 'bg-yellow-100 text-yellow-700' },
    cancelled: { label: 'Cancelled',   color: 'bg-red-100 text-red-600'     },
  };

  const badge = STATUS_LABEL[status] ?? { label: 'No subscription', color: 'bg-gray-100 text-gray-600' };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing</h1>

        {error && (
          <div className="mb-6 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">{error}</div>
        )}

        {new URLSearchParams(window.location.search).get('success') && (
          <div className="mb-6 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-lg border border-green-200">
            🎉 You're subscribed! Your Pro plan is now active.
          </div>
        )}

        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
            {/* Plan */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 mb-1">Current plan</p>
                <p className="text-xl font-bold text-gray-900">LeadSnap Pro</p>
                <p className="text-gray-500 text-sm">$29 / month</p>
              </div>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${badge.color}`}>
                {badge.label}
              </span>
            </div>

            {/* Dates */}
            {status === 'trial' && trialEnd && (
              <div className="text-sm text-gray-600 bg-orange-50 border border-orange-100 rounded-lg px-4 py-3">
                Your free trial ends on <strong>{trialEnd}</strong>. Subscribe to keep access after that.
              </div>
            )}
            {status === 'active' && periodEnd && (
              <div className="text-sm text-gray-600">
                Next billing date: <strong>{periodEnd}</strong>
              </div>
            )}
            {status === 'past_due' && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                Your payment is past due. Update your payment method to restore access.
              </div>
            )}

            {/* Features */}
            <ul className="space-y-2 text-sm text-gray-700">
              {['Unlimited Facebook groups', 'Unlimited keywords', 'Instant SMS alerts', 'AI-generated replies', 'Lead history'].map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="text-green-500">✓</span> {f}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div className="pt-2">
              {(!subscription || status === 'cancelled') && (
                <button
                  onClick={handleSubscribe}
                  disabled={actionLoading}
                  className="w-full bg-orange-500 text-white py-3 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Redirecting…' : 'Subscribe — $29/month'}
                </button>
              )}

              {(status === 'trial' || status === 'active' || status === 'past_due') && subscription?.stripe_customer_id && (
                <button
                  onClick={handleManage}
                  disabled={actionLoading}
                  className="w-full border border-gray-300 text-gray-700 py-3 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Redirecting…' : 'Manage billing'}
                </button>
              )}

              {status === 'trial' && (
                <button
                  onClick={handleSubscribe}
                  disabled={actionLoading}
                  className="mt-2 w-full bg-orange-500 text-white py-3 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
                >
                  {actionLoading ? 'Redirecting…' : 'Subscribe now — $29/month'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
