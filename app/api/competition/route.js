// GET  /api/competition             -> current active competition + caller's participant row
// POST /api/competition {competitionId} -> self-join the competition
import { NextResponse } from "next/server";
import { supabaseForRequest } from "../../../lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const client = supabaseForRequest(req);
  const today = new Date().toISOString().slice(0, 10);

  const { data: competition, error } = await client
    .from("competitions")
    .select("*")
    .lte("start_date", today)
    .gte("end_date", today)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!competition) return NextResponse.json({ competition: null, participant: null });

  const { data: { user } } = await client.auth.getUser();
  let participant = null;
  if (user) {
    const { data } = await client
      .from("competition_participants")
      .select("*")
      .eq("competition_id", competition.id)
      .eq("user_id", user.id)
      .maybeSingle();
    participant = data;
  }
  return NextResponse.json({ competition, participant });
}

export async function POST(req) {
  const client = supabaseForRequest(req);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { competitionId } = await req.json();
  const { data: competition } = await client
    .from("competitions")
    .select("*")
    .eq("id", competitionId)
    .maybeSingle();
  if (!competition) return NextResponse.json({ error: "competition not found" }, { status: 404 });

  const today = new Date().toISOString().slice(0, 10);
  if (today < competition.start_date || today > competition.end_date) {
    return NextResponse.json({ error: "competition not active" }, { status: 400 });
  }

  const { data, error } = await client
    .from("competition_participants")
    .insert({
      competition_id: competition.id,
      user_id: user.id,
      cash: competition.starting_cash,
      starting_cash: competition.starting_cash,
      display_name: user.email?.split("@")[0] || "trader",
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ participant: data });
}
