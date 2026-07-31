// Supplementary data source for whichever fields the primary provider
// doesn't cover: Finnhub's free tier 403s on price-target, eps-estimate,
// revenue-estimate, and candle (chart); KIS's basic quote API never had
// analyst estimates, fundamentals, targets, or news to begin with. Yahoo
// has all of this for both US and KR symbols, so lib/providers/index.js
// uses this to fill gaps in the primary quote rather than replace it.
//
// This is deliberately generic (not KR-specific like yahooKR.js) — it's
// called for plain US tickers too.
import yahooFinance from "../yahoo";

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);

// Fundamentals/estimates don't move intraday, so this can cache far longer
// than the 60s price cache — that also meaningfully cuts down on extra
// Yahoo calls, since Yahoo is the most rate-limit-fragile link here.
const cache = new Map();
const TTL = 15 * 60 * 1000;

// Per-symbol news, shared by both this file (US enrichment) and yahooKR.js
// (KR quotes) — yahoo-finance2's quote/quoteSummary calls carry no news
// field of their own; search() is the only endpoint that returns it
// (confirmed via the library's search.d.ts: news[].{uuid, title, publisher,
// link, providerPublishTime, type, thumbnail, relatedTickers}). Could not
// verify live this session — Yahoo was persistently rate-limited on this
// network — implemented strictly from the documented schema.
const newsCache = new Map();
const NEWS_TTL = 10 * 60 * 1000;

export async function getYahooNews(symbol, count = 6) {
  const hit = newsCache.get(symbol);
  if (hit && Date.now() - hit.t < NEWS_TTL) return hit.d;
  let items = [];
  try {
    const s = await yahooFinance.search(symbol, { newsCount: count, quotesCount: 0 });
    items = (s.news || []).map((n) => ({
      title: n.title,
      publisher: n.publisher || null,
      link: n.link,
      publishedAt: n.providerPublishTime ? new Date(n.providerPublishTime).toISOString() : null,
      thumbnail: n.thumbnail?.resolutions?.[0]?.url || null,
    }));
  } catch (e) {
    console.warn(`[yahoo news] ${symbol}: ${e.message}`);
  }
  newsCache.set(symbol, { t: Date.now(), d: items });
  return items;
}

export async function getYahooEnrichment(symbol) {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.t < TTL) return hit.d;

  const [summary, chart, news] = await Promise.all([
    yahooFinance.quoteSummary(symbol, {
      modules: ["summaryDetail", "financialData", "defaultKeyStatistics", "recommendationTrend", "calendarEvents", "earningsTrend"],
    }),
    yahooFinance.chart(symbol, {
      period1: new Date(Date.now() - 1000 * 60 * 60 * 24 * 150),
      interval: "1d",
    }),
    getYahooNews(symbol),
  ]);

  const fd = summary.financialData || {};
  const sd = summary.summaryDetail || {};
  const ks = summary.defaultKeyStatistics || {};
  const rec = (summary.recommendationTrend?.trend || [])[0] || {};
  const cal = summary.calendarEvents || {};
  const et = (summary.earningsTrend?.trend || []).find((t) => t.period === "0q") || {};
  const earnDates = cal.earnings?.earningsDate || [];

  const result = {
    forwardPE: num(sd.forwardPE),
    pbr: num(ks.priceToBook),
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
    news,
    closes: (chart.quotes || []).filter((c) => num(c.close) !== null).map((c) => ({ d: c.date, c: c.close })),
  };

  cache.set(symbol, { t: Date.now(), d: result });
  return result;
}

// KR's only free financial-statement source (KIS has none; Twelve Data's
// free plan doesn't cover Korean symbols). Returns raw yahoo-finance2
// arrays — lib/providers/index.js normalizes both this and Twelve Data's
// shape into one common format for the UI. Best-effort: throws on failure
// like everything else in this file, but the caller treats an empty
// result as "not available" rather than an error.
const finCache = new Map();
const FIN_TTL = 24 * 60 * 60 * 1000;

export async function getYahooFinancials(symbol) {
  const hit = finCache.get(symbol);
  if (hit && Date.now() - hit.t < FIN_TTL) return hit.d;

  const summary = await yahooFinance.quoteSummary(symbol, {
    modules: [
      "incomeStatementHistory", "incomeStatementHistoryQuarterly",
      "balanceSheetHistory", "balanceSheetHistoryQuarterly",
      "cashflowStatementHistory", "cashflowStatementHistoryQuarterly",
    ],
  });

  const result = {
    incomeStatement: {
      annual: summary.incomeStatementHistory?.incomeStatementHistory || [],
      quarterly: summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [],
    },
    balanceSheet: {
      annual: summary.balanceSheetHistory?.balanceSheetStatements || [],
      quarterly: summary.balanceSheetHistoryQuarterly?.balanceSheetStatements || [],
    },
    cashFlow: {
      annual: summary.cashflowStatementHistory?.cashflowStatements || [],
      quarterly: summary.cashflowStatementHistoryQuarterly?.cashflowStatements || [],
    },
  };

  finCache.set(symbol, { t: Date.now(), d: result });
  return result;
}
