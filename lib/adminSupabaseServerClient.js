import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Reads the admin's own session from cookies (set by adminSupabaseBrowser's
// createBrowserClient) — runs as the admin under normal RLS, no service
// role involved. Used only to authenticate + check `admins` membership, and
// to read leaderboard data (which is readable by any authenticated user).
export function adminSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // called from a Server Component render — middleware would
            // normally refresh the cookie; harmless to ignore here.
          }
        },
        remove(name, options) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {}
        },
      },
    }
  );
}
