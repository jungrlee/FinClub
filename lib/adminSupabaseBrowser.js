"use client";
import { createBrowserClient } from "@supabase/ssr";

// Cookie-based client for the admin login form only — distinct from the
// member-facing lib/supabaseClient.js (which stores its session in
// localStorage), so admin.finclub.app's session never mixes with a
// member's session on the main site.
export function adminSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
