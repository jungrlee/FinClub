// POST /api/competition/trade {competitionId, symbol, market, side, qty}
// side: "buy" | "sell" (sell past zero holdings = short). Price is ALWAYS
// fetched server-side here — the client's displayed price is never trusted.
import { NextResponse } from "next/server";
import { supabaseForRequest } from "../../../../lib/supabaseServer";
import { getQuote, getBatch } from "../../../../lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const client = supabaseForRequest(req);
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { competitionId, symbol, market, side, qty } = await req.json();
  const shares = Math.abs(parseFloat(qty));
  if (!competitionId || !symbol || !(shares > 0) || (side !== "buy" && side !== "sell")) {
    return NextResponse.json({ error: "invalid order" }, { status: 400 });
  }
  const signedQty = side === "buy" ? shares : -shares;

  let quote;
  try {
    quote = await getQuote(symbol, market);
  } catch (e) {
    return NextResponse.json({ error: `quote failed: ${e.message}` }, { status: 502 });
  }

  const { data: participant } = await client
    .from("competition_participants")
    .select("id")
    .eq("competition_id", competitionId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!participant) return NextResponse.json({ error: "join the competition first" }, { status: 400 });

  // fresh prices for the participant's OTHER short positions, for the margin check
  const { data: shorts } = await client
    .from("competition_positions")
    .select("symbol")
    .eq("participant_id", participant.id)
    .lt("shares", 0)
    .neq("symbol", symbol);
  const otherSymbols = (shorts || []).map((s) => s.symbol);
  let priceMap = {};
  if (otherSymbols.length) {
    const batch = await getBatch(otherSymbols);
    priceMap = Object.fromEntries(Object.entries(batch).map(([s, q]) => [s, q.price]));
  }

  const { data, error } = await client.rpc("execute_trade", {
    p_competition_id: competitionId,
    p_symbol: symbol,
    p_market: market,
    p_currency: quote.currency,
    p_qty: signedQty,
    p_price: quote.price,
    p_price_map: priceMap,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ result: data, price: quote.price, symbol });
}
