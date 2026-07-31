// Reconstructs each competition participant's equity over time by replaying
// their trade ledger (competition_trades — append-only, cash_after already
// captures the post-trade balance) against historical daily closes. Nothing
// snapshots equity over time; this rebuilds it on demand from data that
// already exists, reusing the same getChart() the stock-detail chart uses.
import { getChart } from "./providers";

// closes: [{d, c}] sorted oldest-first. Returns a stepper that, called with
// non-decreasing dates, returns the most recent close at-or-before that
// date — carries forward across gaps (holidays, symbol not traded that
// day) instead of dropping the holding's contribution to equity.
function priceStepper(closes) {
  let idx = 0;
  let last = null;
  return (date) => {
    while (idx < closes.length && closes[idx].d <= date) {
      last = closes[idx].c;
      idx++;
    }
    return last;
  };
}

function replay(trades, startingCash, dates, closesBySymbol) {
  let cash = startingCash;
  const shares = {};
  let tradeIdx = 0;
  const steppers = {};
  for (const sym of Object.keys(closesBySymbol)) steppers[sym] = priceStepper(closesBySymbol[sym]);

  return dates.map((d) => {
    while (tradeIdx < trades.length && trades[tradeIdx].executed_at.slice(0, 10) <= d) {
      const tr = trades[tradeIdx];
      shares[tr.symbol] = (shares[tr.symbol] || 0) + Number(tr.qty);
      cash = Number(tr.cash_after);
      tradeIdx++;
    }
    let equity = cash;
    for (const [sym, qty] of Object.entries(shares)) {
      if (!qty) continue;
      const price = steppers[sym]?.(d);
      if (typeof price === "number") equity += qty * price;
    }
    return { d, v: equity };
  });
}

function weekdaysBetween(startISO, endISO) {
  const dates = [];
  const d = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  while (d <= end) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

export async function computeEquityHistory(client, competitionId) {
  const { data: competition, error: cErr } = await client
    .from("competitions").select("*").eq("id", competitionId).maybeSingle();
  if (cErr) throw new Error(cErr.message);
  if (!competition) throw new Error("competition not found");

  const { data: participants, error: pErr } = await client
    .from("competition_participants").select("*").eq("competition_id", competitionId);
  if (pErr) throw new Error(pErr.message);
  if (!participants || participants.length === 0) return { dates: [], series: [] };

  const ids = participants.map((p) => p.id);
  const { data: trades, error: tErr } = await client
    .from("competition_trades").select("*").in("participant_id", ids).order("executed_at", { ascending: true });
  if (tErr) throw new Error(tErr.message);

  // Distinct {symbol, market} actually traded — the trades themselves carry
  // market, no extra lookup needed.
  const symbolMarket = new Map();
  for (const t of trades || []) if (!symbolMarket.has(t.symbol)) symbolMarket.set(t.symbol, t.market);
  const symbols = [...symbolMarket.keys()];

  const closesArr = await Promise.all(
    symbols.map((s) => getChart(s, symbolMarket.get(s), "1Y").catch(() => []))
  );
  const closesBySymbol = {};
  symbols.forEach((s, i) => { closesBySymbol[s] = closesArr[i]; });

  const today = new Date().toISOString().slice(0, 10);
  const endBound = competition.end_date < today ? competition.end_date : today;
  const dates = weekdaysBetween(competition.start_date, endBound);

  const series = participants.map((p) => ({
    participantId: p.id,
    userId: p.user_id,
    displayName: p.display_name,
    curve: replay(
      (trades || []).filter((t) => t.participant_id === p.id),
      Number(p.starting_cash),
      dates,
      closesBySymbol
    ),
  }));

  return { dates, series };
}
