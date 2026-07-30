import { redirect } from "next/navigation";
import { supabaseServerClient } from "./supabaseServerClient";

// Gate for every protected page: confirms a logged-in Supabase user AND
// their presence in `admins` BEFORE any service-role call is allowed to
// fire. Membership is checked under the admin's own RLS (self-select-only
// policy), never via the service-role client.
export async function requireAdmin() {
  const supabase = supabaseServerClient();
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
