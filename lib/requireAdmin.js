import { redirect } from "next/navigation";
import { adminSupabaseServerClient } from "./adminSupabaseServerClient";

// Gate for every protected admin page: confirms a logged-in Supabase user
// AND their presence in `admins` BEFORE any service-role call is allowed to
// fire. Membership is checked under the admin's own RLS (self-select-only
// policy), never via the service-role client. Redirect targets are clean
// paths ("/login", not "/admin/login") — middleware.js rewrites them based
// on hostname, keeping admin.finclub.app's URL bar free of the /admin prefix.
export async function requireAdmin() {
  const supabase = adminSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: adminRow } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!adminRow) redirect("/login?error=not_authorized");

  return user;
}
