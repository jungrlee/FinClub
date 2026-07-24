// GET /api/quote?q=AAPL&market=US   or   ?q=005930&market=KR   or ?q=삼성전자&market=KR
// Real market data via Yahoo Finance (free, no API key). Korean stocks use .KS/.KQ suffixes.
import { NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

yahooFinance.suppressNotices(["yahooSurvey"]);

export const dynamic = "force-dynamic";

// simple in-memory cache (per serverless instance) to be kind to Yahoo
const cache = new Map();
const TTL = 60 * 1000;

async function resolveSymbol(q, market) {
  const raw = q.trim();
  if (market === "KR") {
    if (/^\d{6}$/.test(raw)) {
      // KOSPI first, then KOSDAQ
      for (const suf of [".KS", ".KQ"]) {
        try {
          const r = await yahooFinance.quote(raw + suf);
          if (r && r.regularMarketPrice != null) return raw + suf;
        } catch (_) {}
      }
    }
    const s = await yahooFinance.search(raw, { quotesCount: 6, newsCount: 0 });
    const hit = (s.quotes || []).find(
      (x) => x.symbol && (x.symbol.endsWith(".KS") || x.symbol.endsWith(".KQ"))
    );
    if (hit) return hit.symbol;
    throw new Error("Korean symbol not found");
  }
  // US
  const sym = raw.toUpperCase();
  try {
    const r = await yahooFinance.quote(sym);
    if (r && r.regularMarketPrice != null) return sym;
  } catch (_) {}
  const s = await yahooFinance.search(raw, { quotesCount: 6, newsCount: 0 });
  const hit = (s.quotes || []).find(
    (x) => x.symbol && !x.symbol.includes(".") && x.quoteType === "EQUITY"
  );
  if (hit) return hit.symbol;
  throw new Error("US symbol not found");
}

function num(v) {
  return typeof v === "number" && isFinite(v) ? v : null;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const market = searchParams.get("market") === "KR" ? "KR" : "US";
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });

  const ck = `${market}:${q.toLowerCase()}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < TTL) return NextResponse.json(hit.d);

  try {
    const symbol = await resolveSymbol(q, market);

    const [quote, summary, chart, news] = await Promise.all([
      yahooFinance.quote(symbol),
      yahooFinance
        .quoteSummary(symbol, {
          modules: [
            "summaryDetail",
            "financialData",
            "defaultKeyStatistics",
            "recommendationTrend",
            "calendarEvents",
            "earningsTrend",
          ],
        })
        .catch(() => ({})),
      yahooFinance.chart(symbol, {
        period1: new Date(Date.now() - 1000 * 60 * 60 * 24 * 100),
        interval: "1d",
      }),
      yahooFinance
        .search(symbol.replace(/\.(KS|KQ)$/, ""), { quotesCount: 0, newsCount: 6 })
        .catch(() => ({ news: [] })),
    ]);

    const fd = summary.financialData || {};
    const sd = summary.summaryDetail || {};
    const ks = summary.defaultKeyStatistics || {};
    const rec = (summary.recommendationTrend?.trend || [])[0] || {};
    const cal = summary.calendarEvents || {};
    const et = (summary.earningsTrend?.trend || []).find((t) => t.period === "0q") || {};

    const closes = (chart.quotes || [])
      .filter((c) => num(c.close) !== null)
      .map((c) => ({ d: c.date, c: c.close }));

    const earnDates = cal.earnings?.earningsDate || [];

    const data = {
      symbol,
      name: quote.longName || quote.shortName || symbol,
      exchange: quote.fullExchangeName || quote.exchange,
      currency: quote.currency || (market === "KR" ? "KRW" : "USD"),
      market,
      price: num(quote.regularMarketPrice),
      change: num(quote.regularMarketChange),
      changePct: num(quote.regularMarketChangePercent),
      prevClose: num(quote.regularMarketPreviousClose),
      dayLow: num(quote.regularMarketDayLow),
      dayHigh: num(quote.regularMarketDayHigh),
      week52Low: num(quote.fiftyTwoWeekLow),
      week52High: num(quote.fiftyTwoWeekHigh),
      marketCap: num(quote.marketCap),
      volume: num(quote.regularMarketVolume),
      avgVolume: num(quote.averageDailyVolume3Month),
      per: num(quote.trailingPE),
      forwardPE: num(quote.forwardPE),
      pbr: num(ks.priceToBook),
      eps: num(quote.epsTrailingTwelveMonths),
      divYieldPct: num(sd.dividendYield) !== null ? sd.dividendYield * 100 : null,
      beta: num(sd.beta),
      shortPctFloat: num(ks.shortPercentOfFloat) !== null ? ks.shortPercentOfFloat * 100 : null,
      // ---- street estimates (real analyst data) ----
      analystBuy: (rec.strongBuy || 0) + (rec.buy || 0) || null,
      analystHold: rec.hold ?? null,
      analystSell: (rec.sell || 0) + (rec.strongSell || 0) || null,
      recommendationKey: fd.recommendationKey || null,
      targetMean: num(fd.targetMeanPrice),
      targetHigh: num(fd.targetHighPrice),
      targetLow: num(fd.targetLowPrice),
      numberOfAnalysts: num(fd.numberOfAnalystOpinions),
      consensusEPS: num(et.earningsEstimate?.avg),
      consensusEPSLow: num(et.earningsEstimate?.low),
      consensusEPSHigh: num(et.earningsEstimate?.high),
      consensusRev: num(et.revenueEstimate?.avg),
      epsGrowthPct: num(et.growth) !== null ? et.growth * 100 : null,
      nextEarnings: earnDates.length ? earnDates[0] : null,
      // ---- financial health ----
      revenueTTM: num(fd.totalRevenue),
      revenueGrowthPct: num(fd.revenueGrowth) !== null ? fd.revenueGrowth * 100 : null,
      grossMarginPct: num(fd.grossMargins) !== null ? fd.grossMargins * 100 : null,
      operMarginPct: num(fd.operatingMargins) !== null ? fd.operatingMargins * 100 : null,
      profitMarginPct: num(fd.profitMargins) !== null ? fd.profitMargins * 100 : null,
      roePct: num(fd.returnOnEquity) !== null ? fd.returnOnEquity * 100 : null,
      debtToEquity: num(fd.debtToEquity),
      freeCashflow: num(fd.freeCashflow),
      totalCash: num(fd.totalCash),
      closes,
      news: (news.news || []).map((n) => ({
        t: n.providerPublishTime,
        s: n.publisher,
        h: n.title,
        u: n.link,
      })),
    };

    cache.set(ck, { t: Date.now(), d: data });
    return NextResponse.json(data);
  } catch (e) {
    console.error("quote error:", e.message);
    return NextResponse.json(
      { error: `Could not resolve "${q}" (${market}). Try a ticker like AAPL or 005930.` },
      { status: 404 }
    );
  }
}
