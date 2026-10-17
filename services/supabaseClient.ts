import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Supabase's "publishable" key replaces the old "anon" key; either name works here.
const supabaseKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// Every request carries the signed-in user's Clerk session token, so the database's
// row-level security can tell whose rows a request may touch.
export function createUserClient(getToken: () => Promise<string | null>) {
  return createClient(supabaseUrl as string, supabaseKey as string, {
    accessToken: getToken,
  });
}
