import supabase from '../lib/supabase.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  const token = authHeader.slice(7);

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    console.error('[Auth] getUser failed:', error?.message, error?.status, error?.code);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  next();
}
