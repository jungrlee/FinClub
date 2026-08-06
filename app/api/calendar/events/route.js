// GET /api/calendar/events -> { events: [{id, title, event_date, description}] }
// Admin-published club events (added at /admin), shown on the Calendar
// tab's month grid. Public read via RLS's select-all policy on club_events
// (supabase/club_events_schema.sql) — any logged-in app user, not just
// admins, same pattern as app/api/competition/route.js.
import { NextResponse } from "next/server";
import { supabaseForRequest } from "../../../../lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const client = supabaseForRequest(req);
  const { data, error } = await client
    .from("club_events")
    .select("*")
    .order("event_date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data || [] });
}
