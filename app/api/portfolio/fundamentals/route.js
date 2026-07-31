// POST /api/portfolio/fundamentals
// { positions: [{symbol, market}] } -> { perSymbol: {...}, missingSectors: [...] }
//
// Kept separate from /api/portfolio/risk since it's cheaper and changes
// less often (fundamentals/dividends, not daily price history) — fetched
// on the same symbol-set-change cadence, not per price tick.
import { NextResponse } from "next/server";
import { getQuote } from "../../../../lib/providers";
import { missingSectors } from "../../../../lib/providers/sectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { positions } = await req.json();
  if (!Array.isArray(positions) || positions.length === 0) {
    return NextResponse.json({ error: "no positions" }, { status: 400 });
  }

  const perSymbol = {};
  await Promise.all(positions.map(async (p) => {
    try {
      const quote = await getQuote(p.symbol, p.market);
      // Dividend-history endpoints (Twelve Data) 403 for nearly every free-tier
      // symbol, so approximate trailing annual dividend from yield × price
      // (both reliably populated via Finnhub's /stock/metric) rather than a
      // precise trailing-12-month sum.
      const annualDividendPerShare =
        quote.divYieldPct && quote.price ? (quote.divYieldPct / 100) * quote.price : null;
      perSymbol[p.symbol] = {
        per: quote.per ?? null,
        divYieldPct: quote.divYieldPct ?? null,
        sector: quote.sector ?? null,
        annualDividendPerShare,
      };
    } catch (e) {
      console.warn(`[portfolio fundamentals] ${p.symbol}: ${e.message}`);
      perSymbol[p.symbol] = { per: null, divYieldPct: null, sector: null, annualDividendPerShare: null };
    }
  }));

  const heldSectors = Object.values(perSymbol).map((f) => f.sector).filter(Boolean);

  return NextResponse.json({ perSymbol, missingSectors: missingSectors(heldSectors) });
}
