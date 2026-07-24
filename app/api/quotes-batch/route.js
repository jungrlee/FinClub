// GET /api/quotes-batch?symbols=AAPL,005930.KS,NVDA
// Lightweight endpoint used by the realtime poller. Returns only what the
// watchlist rail and P&L need, so it stays fast enough to hit every 15s.
import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

yahooFinance.suppressNotices(["yahooSurvey"]);
export const dynamic = "force-dynamic";

const cache = new Map();
const TTL = 10 * 1000; // 10s — poller runs at 15s, this just absorbs bursts

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("symbols") || "";
  const symbols = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 60);
  if (!symbols.length) return NextResponse.json({ quotes: {} });

  const key = symbols.slice().sort().join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return NextResponse.json(hit.d);

  try {
    const res = await yahooFinance.quote(symbols);
    const arr = Array.isArray(res) ? res : [res];
    const quotes = {};
    for (const q of arr) {
      if (!q || !q.symbol) continue;
      quotes[q.symbol] = {
        symbol: q.symbol,
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePct: q.regularMarketChangePercent ?? null,
        prevClose: q.regularMarketPreviousClose ?? null,
        dayLow: q.regularMarketDayLow ?? null,
        dayHigh: q.regularMarketDayHigh ?? null,
        volume: q.regularMarketVolume ?? null,
        currency: q.currency ?? null,
        marketState: q.marketState ?? null, // PRE / REGULAR / POST / CLOSED
        time: q.regularMarketTime ?? null,
      };
    }
    const payload = { quotes, ts: Date.now() };
    cache.set(key, { t: Date.now(), d: payload });
    return NextResponse.json(payload);
  } catch (e) {
    console.error("batch quote error:", e.message);
    return NextResponse.json({ quotes: {}, error: "batch failed" }, { status: 502 });
  }
}
