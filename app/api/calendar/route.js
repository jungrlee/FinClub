// GET /api/calendar?symbols=AAPL,005930.KS
// Aggregates upcoming earnings dates + consensus for every symbol in the
// watchlist so the Calendar tab can show one sorted timeline.
import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

yahooFinance.suppressNotices(["yahooSurvey"]);
export const dynamic = "force-dynamic";

const cache = new Map();
const TTL = 30 * 60 * 1000; // earnings dates move slowly — 30 min cache

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

async function one(symbol) {
  try {
    const [q, s] = await Promise.all([
      yahooFinance.quote(symbol),
      yahooFinance
        .quoteSummary(symbol, { modules: ["calendarEvents", "earningsTrend", "earningsHistory"] })
        .catch(() => ({})),
    ]);
    const cal = s.calendarEvents || {};
    const dates = cal.earnings?.earningsDate || [];
    const trend = (s.earningsTrend?.trend || []).find((t) => t.period === "0q") || {};
    const hist = (s.earningsHistory?.history || []).slice(-4).reverse();

    return {
      symbol,
      name: q.longName || q.shortName || symbol,
      currency: q.currency,
      price: num(q.regularMarketPrice),
      changePct: num(q.regularMarketChangePercent),
      date: dates.length ? dates[0] : null,
      dateEstimated: dates.length > 1, // Yahoo gives a range when unconfirmed
      dateEnd: dates.length > 1 ? dates[1] : null,
      hour: cal.earnings?.earningsCallTime || null,
      consensusEPS: num(trend.earningsEstimate?.avg),
      consensusEPSLow: num(trend.earningsEstimate?.low),
      consensusEPSHigh: num(trend.earningsEstimate?.high),
      consensusRev: num(trend.revenueEstimate?.avg),
      analysts: num(trend.earningsEstimate?.numberOfAnalysts),
      exDividend: cal.exDividendDate || null,
      dividendDate: cal.dividendDate || null,
      // surprise history: did they beat or miss?
      history: hist.map((h) => ({
        q: h.quarter,
        actual: num(h.epsActual),
        est: num(h.epsEstimate),
        surprisePct: num(h.surprisePercent) !== null ? h.surprisePercent * 100 : null,
      })),
    };
  } catch (e) {
    return { symbol, error: true };
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") || "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40);
  if (!symbols.length) return NextResponse.json({ events: [] });

  const key = symbols.slice().sort().join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return NextResponse.json(hit.d);

  const results = await Promise.all(symbols.map(one));
  const events = results
    .filter((r) => !r.error)
    .sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });

  const payload = { events, ts: Date.now() };
  cache.set(key, { t: Date.now(), d: payload });
  return NextResponse.json(payload);
}
