// POST /api/portfolio/fundamentals
// { positions: [{symbol, market}] } -> { perSymbol: {...}, missingSectors: [...] }
//
// Kept separate from /api/portfolio/risk since it's cheaper and changes
// less often (fundamentals/dividends, not daily price history) — fetched
// on the same symbol-set-change cadence, not per price tick.
import { NextResponse } from "next/server";
import { getQuote, getDividends } from "../../../../lib/providers";
import { missingSectors } from "../../../../lib/providers/sectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  const { positions } = await req.json();
  if (!Array.isArray(positions) || positions.length === 0) {
    return NextResponse.json({ error: "no positions" }, { status: 400 });
  }

  const oneYearAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365).toISOString().slice(0, 10);

  const perSymbol = {};
  await Promise.all(positions.map(async (p) => {
    try {
      const [quote, dividends] = await Promise.all([
        getQuote(p.symbol, p.market),
        getDividends(p.symbol, p.market).catch(() => []),
      ]);
      const annualDividendPerShare = dividends
        .filter((d) => d.date >= oneYearAgo)
        .reduce((s, d) => s + d.amount, 0);
      perSymbol[p.symbol] = {
        per: quote.per ?? null,
        divYieldPct: quote.divYieldPct ?? null,
        sector: quote.sector ?? null,
        annualDividendPerShare: annualDividendPerShare || null,
      };
    } catch (e) {
      console.warn(`[portfolio fundamentals] ${p.symbol}: ${e.message}`);
      perSymbol[p.symbol] = { per: null, divYieldPct: null, sector: null, annualDividendPerShare: null };
    }
  }));

  const heldSectors = Object.values(perSymbol).map((f) => f.sector).filter(Boolean);

  return NextResponse.json({ perSymbol, missingSectors: missingSectors(heldSectors) });
}
