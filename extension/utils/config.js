// Public Supabase config — anon key is safe to include in client-side code.
// The service role key lives only on the backend.

export const SUPABASE_URL = 'https://dadprimojjfflcgigegm.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRhZHByaW1vampmZmxjZ2lnZWdtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNjE3NDUsImV4cCI6MjA5MzgzNzc0NX0.Ly9YdG4D2hSsDXRnC0jhQhApI2J_b3ZWsnwDKeVselI';
export const API_URL = 'https://leadsnap-backend-production.up.railway.app';
export const GOOGLE_CLIENT_ID = '678691984847-u1q0mv8f1heqeqraumps27iri16rlv39.apps.googleusercontent.com';

// Subscription status constants — use these instead of raw strings everywhere.
export const SUBSCRIPTION_STATUS = {
  TRIAL:    'trial',
  ACTIVE:   'active',
  INACTIVE: 'inactive',
};
