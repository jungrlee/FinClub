// Shared by app/api/competition/leaderboard/route.js (member-facing, called
// with a request-scoped client acting as the caller) and app/admin's
// competition detail page (called with the admin's own cookie-scoped
// client) — both read paths are permitted by the same transparent RLS
// policy on competition_participants/positions/trades, so no service-role
// access is needed here, and there's no HTTP round-trip between the two.
import { getBatch } from "./providers";

export async function computeLeaderboard(client, competitionId) {
  const { data: participants, error } = await client
    .from("competition_participants")
    .select("*, competition_positions(*)")
    .eq("competition_id", competitionId);
  if (error) throw new Error(error.message);

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

  return participants
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
}
