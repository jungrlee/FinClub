// Per-request Supabase client for API routes — acts AS the calling user by
// forwarding their access token, so auth.uid() / RLS work exactly like the
// anon client does in the browser. No service-role key involved.
import { createClient } from "@supabase/supabase-js";

export function supabaseForRequest(req) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
