import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set. Copy frontend/.env.example to frontend/.env.'
  );
}

// persistSession keeps the user signed in across reloads; autoRefreshToken
// renews the JWT before it expires so long sessions do not 401 mid-workout.
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});
