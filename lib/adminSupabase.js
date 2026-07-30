import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS entirely. Server-only, used ONLY after
// requireAdmin() has confirmed the caller is in the `admins` table. This key
// must never carry a NEXT_PUBLIC_ prefix.
//
// Falls back to placeholder values when env vars are unset so `next build`
// doesn't crash while collecting page data (e.g. before Vercel env is
// configured).
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const isConfigured = Boolean(url && serviceKey);

export const supabaseAdmin = createClient(
  isConfigured ? url : "https://placeholder.supabase.co",
  isConfigured ? serviceKey : "placeholder-service-role-key",
  { auth: { persistSession: false } }
);
