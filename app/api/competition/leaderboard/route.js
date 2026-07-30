// GET /api/competition/leaderboard?competitionId=<id>
// Ranked list of every participant with full holdings + trade history —
// the leaderboard is intentionally transparent (not hidden until contest end).
import { NextResponse } from "next/server";
import { supabaseForRequest } from "../../../../lib/supabaseServer";
import { getBatch } from "../../../../lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const client = supabaseForRequest(req);
  const { searchParams } = new URL(req.url);
  const competitionId = searchParams.get("competitionId");
  if (!competitionId) return NextResponse.json({ error: "missing competitionId" }, { status: 400 });

  const { data: participants, error } = await client
    .from("competition_participants")
    .select("*, competition_positions(*)")
    .eq("competition_id", competitionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = participants.map((p) => p.id);
  const { data: trades } = ids.length
    ? await client
        .from("competition_trades")
        .select("*")
        .in("participant_id", ids)
        .order("executed_at", { ascending: false })
    : { data: [] };

  const symbols = [...new Set(participants.flatMap((p) => p.competition_positions.map((x) => x.symbol)))];
  const quotes = symbols.length ? await getBatch(symbols) : {};

  const ranked = participants
    .map((p) => {
      const holdings = p.competition_positions.map((pos) => {
        const price = quotes[pos.symbol]?.price ?? pos.avg_cost;
        return { ...pos, price, mktValue: pos.shares * price };
      });
      const equity = p.cash + holdings.reduce((s, h) => s + h.mktValue, 0);
      return {
        participantId: p.id,
        userId: p.user_id,
        displayName: p.display_name,
        cash: p.cash,
        startingCash: p.starting_cash,
        equity,
        returnPct: ((equity - p.starting_cash) / p.starting_cash) * 100,
        holdings,
        trades: (trades || []).filter((t) => t.participant_id === p.id),
      };
    })
    .sort((a, b) => b.equity - a.equity);

  return NextResponse.json({ ranked });
}
