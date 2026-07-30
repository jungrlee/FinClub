// Yahoo fallback — Korean stocks only.
//
// Used when KIS is not configured (or its call fails). Yahoo rate-limits
// datacenter IPs aggressively, so this is a stopgap, not a foundation:
// it may return "Too Many Requests" from Vercel. Errors are surfaced with
// that context so the cause is obvious rather than mysterious.
import yahooFinance from "../yahoo";

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

export async function resolveKRYahoo(q) {
  const raw = q.trim();
  if (/^\d{6}$/.test(raw)) {
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
  throw new Error(`No KRX symbol matched "${q}"`);
}

// Resolve a Korean company NAME to its 6-digit code, for use with KIS
// (which only accepts codes). Cheap single search call.
export async function nameToCode(q) {
  const sym = await resolveKRYahoo(q);
  return sym.replace(/\.(KS|KQ)$/, "");
}

// Autocomplete candidates for a partial ticker/company name — unlike
// resolveKRYahoo, keeps the whole list instead of just the first hit.
// Returns bare 6-digit codes (not the .KS/.KQ suffix) to match how KR
// symbols are typed/submitted everywhere else in the app.
export async function searchKRSymbols(q) {
  const s = await yahooFinance.search(q.trim(), { quotesCount: 8, newsCount: 0 });
  return (s.quotes || [])
    .filter((x) => x.symbol && (x.symbol.endsWith(".KS") || x.symbol.endsWith(".KQ")))
    .map((x) => ({
      symbol: x.symbol.replace(/\.(KS|KQ)$/, ""),
      name: x.shortname || x.longname || x.symbol,
    }));
}

export async function getKRQuoteYahoo(symbol) {
  const quote = await yahooFinance.quote(symbol);
  if (!num(quote.regularMarketPrice)) throw new Error(`Yahoo returned no price for ${symbol}`);

  const soft = (p) => p.catch((e) => {
    console.warn(`[yahooKR] ${symbol}: ${e.message}`);
    return {};
  });

  const [summary, chart] = await Promise.all([
    soft(yahooFinance.quoteSummary(symbol, {
      modules: ["summaryDetail", "financialData", "defaultKeyStatistics", "recommendationTrend", "calendarEvents", "earningsTrend"],
    })),
    soft(yahooFinance.chart(symbol, {
      period1: new Date(Date.now() - 1000 * 60 * 60 * 24 * 150),
      interval: "1d",
    })),
  ]);

  const fd = summary.financialData || {};
  const sd = summary.summaryDetail || {};
  const ks = summary.defaultKeyStatistics || {};
  const rec = (summary.recommendationTrend?.trend || [])[0] || {};
  const cal = summary.calendarEvents || {};
  const et = (summary.earningsTrend?.trend || []).find((t) => t.period === "0q") || {};
  const earnDates = cal.earnings?.earningsDate || [];

  return {
    symbol,
    name: quote.longName || quote.shortName || symbol,
    exchange: quote.fullExchangeName || "KRX",
    currency: quote.currency || "KRW",
    market: "KR",
    source: "yahoo",
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
    revenueTTM: num(fd.totalRevenue),
    revenueGrowthPct: num(fd.revenueGrowth) !== null ? fd.revenueGrowth * 100 : null,
    grossMarginPct: num(fd.grossMargins) !== null ? fd.grossMargins * 100 : null,
    operMarginPct: num(fd.operatingMargins) !== null ? fd.operatingMargins * 100 : null,
    profitMarginPct: num(fd.profitMargins) !== null ? fd.profitMargins * 100 : null,
    roePct: num(fd.returnOnEquity) !== null ? fd.returnOnEquity * 100 : null,
    debtToEquity: num(fd.debtToEquity),
    freeCashflow: num(fd.freeCashflow),
    totalCash: num(fd.totalCash),
    closes: (chart.quotes || []).filter((c) => num(c.close) !== null).map((c) => ({ d: c.date, c: c.close })),
    news: [],
  };
}

export async function getKRBatchYahoo(symbols) {
  const out = {};
  try {
    const res = await yahooFinance.quote(symbols);
    const arr = Array.isArray(res) ? res : [res];
    for (const q of arr) {
      if (!q?.symbol) continue;
      out[q.symbol] = {
        symbol: q.symbol,
        price: num(q.regularMarketPrice),
        change: num(q.regularMarketChange),
        changePct: num(q.regularMarketChangePercent),
        prevClose: num(q.regularMarketPreviousClose),
        dayLow: num(q.regularMarketDayLow),
        dayHigh: num(q.regularMarketDayHigh),
        volume: num(q.regularMarketVolume),
        currency: q.currency || "KRW",
        marketState: q.marketState || null,
        time: q.regularMarketTime || null,
      };
    }
  } catch (e) {
    console.warn(`[yahooKR batch] ${e.message}`);
  }
  return out;
}
