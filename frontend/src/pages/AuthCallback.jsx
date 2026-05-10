import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../lib/supabase';

/**
 * /auth/callback — used by the Chrome extension to hand off a Supabase session.
 *
 * The extension opens:
 *   https://leadsnap.app/auth/callback#access_token=...&refresh_token=...&token_type=bearer
 *
 * This page reads the tokens, calls setSession() explicitly (avoids the race
 * condition between detectSessionInUrl and PrivateRoute), then redirects to
 * /dashboard once the session is established.
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params      = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) {
      navigate('/login', { replace: true });
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          console.error('[LeadSnap] setSession error:', error.message);
          navigate('/login', { replace: true });
        } else {
          navigate('/dashboard', { replace: true });
        }
      });
  }, [navigate]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', fontFamily: 'system-ui, sans-serif', color: '#6b7280',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 32, height: 32, border: '3px solid #f3f4f6',
          borderTopColor: '#f97316', borderRadius: '50%',
          animation: 'spin 0.65s linear infinite', margin: '0 auto 12px',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <p style={{ fontSize: 14 }}>Signing in…</p>
      </div>
    </div>
  );
}
