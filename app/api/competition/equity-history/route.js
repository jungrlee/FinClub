// GET /api/competition/equity-history?competitionId=<id>
// -> { dates: [...], series: [{participantId, userId, displayName, curve}] }
// Reconstructed from trade history — fetched once when the competition
// loads / on manual refresh, not on the fast 15s leaderboard poll (it fans
// out to historical closes for every traded symbol, which is comparatively
// expensive).
import { NextResponse } from "next/server";
import { supabaseForRequest } from "../../../../lib/supabaseServer";
import { computeEquityHistory } from "../../../../lib/competitionEquityHistory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const client = supabaseForRequest(req);
  const { searchParams } = new URL(req.url);
  const competitionId = searchParams.get("competitionId");
  if (!competitionId) return NextResponse.json({ error: "missing competitionId" }, { status: 400 });

  try {
    const data = await computeEquityHistory(client, competitionId);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
