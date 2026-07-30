// GET /api/competition/leaderboard?competitionId=<id>
// Ranked list of every participant with full holdings + trade history —
// the leaderboard is intentionally transparent (not hidden until contest end).
import { NextResponse } from "next/server";
import { supabaseForRequest } from "../../../../lib/supabaseServer";
import { computeLeaderboard } from "../../../../lib/competitionLeaderboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const client = supabaseForRequest(req);
  const { searchParams } = new URL(req.url);
  const competitionId = searchParams.get("competitionId");
  if (!competitionId) return NextResponse.json({ error: "missing competitionId" }, { status: 400 });

  try {
    const ranked = await computeLeaderboard(client, competitionId);
    return NextResponse.json({ ranked });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
