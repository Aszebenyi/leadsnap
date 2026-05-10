import { Router } from 'express';

const router = Router();

// Authentication is handled entirely client-side via Supabase Auth SDK.
// Exception: /google-exchange proxies the Google OAuth code exchange so the
// client_secret never has to leave the backend.

/**
 * POST /api/auth/google-exchange
 * Body: { code, code_verifier, redirect_uri }
 *
 * 1. Exchanges the Google auth code for tokens using the server-side client_secret.
 * 2. Passes the resulting id_token to Supabase to create/sign in the user.
 * 3. Returns the Supabase session { access_token, refresh_token, user }.
 */
router.post('/google-exchange', async (req, res, next) => {
  try {
    const { code, code_verifier, redirect_uri } = req.body;
    if (!code || !code_verifier || !redirect_uri) {
      return res.status(400).json({ error: 'code, code_verifier, and redirect_uri are required' });
    }

    // Step 1 — exchange the Google auth code for tokens
    const googleRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code_verifier,
        redirect_uri,
        grant_type:    'authorization_code',
      }).toString(),
    });
    const googleData = await googleRes.json();
    if (!googleRes.ok) {
      return res.status(400).json({ error: googleData.error_description || googleData.error || 'Google token exchange failed' });
    }

    const { id_token, access_token } = googleData;
    if (!id_token) {
      return res.status(400).json({ error: 'No id_token returned by Google' });
    }

    // Step 2 — sign in to Supabase using the Google id_token
    const supabaseRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=id_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ provider: 'google', id_token, access_token }),
    });
    const supabaseData = await supabaseRes.json();
    if (!supabaseRes.ok) {
      return res.status(400).json({ error: supabaseData.error_description || supabaseData.msg || 'Supabase sign-in failed' });
    }

    res.json(supabaseData); // { access_token, refresh_token, user }
  } catch (err) {
    next(err);
  }
});

export default router;
