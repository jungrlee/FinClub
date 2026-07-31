// Provider router. Routes are thin: they call these functions and never
// know which upstream answered. `source` on the payload tells the UI.
//
//   US  → Finnhub (requires FINNHUB_API_KEY)
//   KR  → KIS OpenAPI if configured, else Yahoo fallback
import { resolveUS, getUSQuote, getUSBatch, getUSCalendar, searchSymbols } from "./finnhub";
import { kisConfigured, isKrCode, getKRQuote, getKRBatch, getKRCandles, getKRIntraday } from "./kis";
import { resolveKRYahoo, nameToCode, getKRQuoteYahoo, getKRBatchYahoo, searchKRSymbols } from "./yahooKR";
import { getYahooEnrichment, getYahooFinancials } from "./yahooEnrich";
import { twelveDataConfigured, getTwelveDataCandles, getTwelveDataFinancials, getForexQuote, getDividends as getTwelveDataDividends } from "./twelveData";
import { searchKRStatic } from "./krCompanies";

const n = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const daysSinceJan1 = () => {
  const now = new Date();
  return Math.max(1, Math.ceil((now - new Date(now.getFullYear(), 0, 1)) / 86400000));
};

// Autocomplete suggestions for a partial ticker/company name — best-effort,
// must never block typing (especially given Yahoo's own rate-limiting).
export async function search(q, market) {
  if (!q || !q.trim()) return [];
  if (market === "KR") {
    // Curated list first — covers common searches without touching Yahoo
    // at all, since Yahoo is the only (and heavily rate-limited) source
    // with KR name search otherwise.
    const staticHits = searchKRStatic(q);
    if (staticHits.length) return staticHits;
    try {
      return await searchKRSymbols(q);
    } catch (e) {
      console.warn(`[search KR] ${e.message}`);
      return [];
    }
  }
  try {
    return await searchSymbols(q);
  } catch (e) {
    console.warn(`[search US] ${e.message}`);
    return [];
  }
}

// Fills null/empty fields on the primary quote (Finnhub for US, KIS for KR)
// with Yahoo's equivalent data — never overwrites a field the primary
// source already answered, so price/name/exchange stay authoritative.
function fillGaps(primary, extra) {
  const isEmpty = (v) => v === null || v === undefined || (Array.isArray(v) && v.length === 0);
  const out = { ...primary };
  for (const [k, v] of Object.entries(extra || {})) {
    if (isEmpty(out[k]) && !isEmpty(v)) out[k] = v;
  }
  return out;
}

// Tried before Yahoo for US charts specifically — Twelve Data's free tier
// (800/day, 8/min) is a much sturdier chart source than Yahoo's unofficial,
// heavily rate-limited endpoint. Best-effort: never blocks the quote.
async function backfillUSCloses(quote) {
  if ((quote.closes || []).length > 0 || !twelveDataConfigured()) return quote;
  try {
    const closes = await getTwelveDataCandles(quote.symbol);
    return closes.length ? { ...quote, closes } : quote;
  } catch (e) {
    console.warn(`[twelvedata] chart backfill failed for ${quote.symbol}: ${e.message}`);
    return quote;
  }
}

// Best-effort enrichment — a Yahoo failure here (e.g. its own rate limit)
// should never break the primary quote, so this always resolves.
async function enrichWithYahoo(quote, yahooSymbol) {
  try {
    const extra = await getYahooEnrichment(yahooSymbol);
    return fillGaps(quote, extra);
  } catch (e) {
    console.warn(`[enrich] Yahoo backfill failed for ${yahooSymbol}: ${e.message}`);
    return quote;
  }
}

export async function resolve(q, market) {
  if (market === "FX") {
    // FX pairs are exact tickers already ("USD/KRW") — no fuzzy search.
    return q.trim().toUpperCase();
  }
  if (market === "KR") {
    if (kisConfigured()) {
      // KIS speaks 6-digit codes only; resolve names via the curated list
      // first (works without Yahoo), falling back to Yahoo search.
      if (isKrCode(q)) return q.trim();
      const staticHit = searchKRStatic(q)[0];
      if (staticHit) return staticHit.symbol;
      try {
        return await nameToCode(q);
      } catch (e) {
        throw new Error(
          `Could not map "${q}" to a KRX code. Try the 6-digit code (e.g. 005930). Cause: ${e.message}`
        );
      }
    }
    return resolveKRYahoo(q);
  }
  return resolveUS(q);
}

export async function getQuote(symbol, market) {
  if (market === "FX") {
    return getForexQuote(symbol);
  }
  if (market === "KR") {
    if (kisConfigured()) {
      try {
        const q = await getKRQuote(symbol);
        // KIS's basic quote API has no analyst estimates, targets, margins,
        // or news — Yahoo fills those gaps. Resolving the .KS/.KQ suffix
        // itself depends on Yahoo too, so a failure here just skips
        // enrichment rather than failing the whole quote.
        const ySym = await resolveKRYahoo(symbol).catch(() => null);
        return ySym ? await enrichWithYahoo(q, ySym) : q;
      } catch (e) {
        console.warn(`[router] KIS failed for ${symbol}, falling back to Yahoo: ${e.message}`);
        try {
          const ySym = /^\d{6}$/.test(symbol) ? await resolveKRYahoo(symbol) : symbol;
          return await getKRQuoteYahoo(ySym);
        } catch (e2) {
          // Surface BOTH causes — otherwise a KIS failure gets silently
          // replaced by whatever the Yahoo fallback says, hiding the real
          // problem (e.g. an invalid/expired KIS token) behind an unrelated
          // "Too Many Requests" message.
          throw new Error(`KIS failed (${e.message}); Yahoo fallback also failed (${e2.message})`);
        }
      }
    }
    return getKRQuoteYahoo(symbol); // already Yahoo-sourced end to end, nothing to enrich
  }
  // Finnhub's free tier 403s on price-target/eps-estimate/revenue-estimate/
  // candle. Twelve Data backfills the chart specifically (sturdier than
  // Yahoo for that); Yahoo then fills whatever's still missing (targets,
  // estimates, margins, and the chart too if Twelve Data isn't configured).
  const q0 = await getUSQuote(symbol);
  const q1 = await backfillUSCloses(q0);
  return enrichWithYahoo(q1, symbol);
}

// Chart timeframe selector — 1D/5D use intraday, 1M-1Y use daily, 5Y uses
// weekly. Always resolves (empty array on failure), never blocks the page.
export async function getChart(symbol, market, range) {
  const r = (range || "1Y").toUpperCase();

  if (market === "FX" || market === "US") {
    if (!twelveDataConfigured()) return [];
    const RANGE_MAP = {
      "1D": { interval: "1min", outputsize: 400 },
      "5D": { interval: "15min", outputsize: 150 },
      "1M": { interval: "1day", outputsize: 30 },
      "6M": { interval: "1day", outputsize: 130 },
      YTD: { interval: "1day", outputsize: daysSinceJan1() },
      "1Y": { interval: "1day", outputsize: 260 },
      "5Y": { interval: "1week", outputsize: 260 },
    };
    const cfg = RANGE_MAP[r] || RANGE_MAP["1Y"];
    try { return await getTwelveDataCandles(symbol, cfg); }
    catch (e) { console.warn(`[chart ${market}] ${symbol}: ${e.message}`); return []; }
  }

  if (market === "KR") {
    if (r === "1D" || r === "5D") {
      // KIS's intraday endpoint is a single best-effort call (a recent
      // window, not a paginated full day) — same result for both ranges.
      try { return await getKRIntraday(symbol); }
      catch (e) { console.warn(`[chart KR intraday] ${symbol}: ${e.message}`); return []; }
    }
    const days = r === "1M" ? 30 : r === "6M" ? 180 : r === "YTD" ? daysSinceJan1() : r === "5Y" ? 365 * 5 : 365;
    const period = r === "5Y" ? "W" : "D";
    try { return await getKRCandles(symbol, { period, days }); }
    catch (e) { console.warn(`[chart KR] ${symbol}: ${e.message}`); return []; }
  }

  return [];
}

// ---------------------------------------------------------------- financials
// Twelve Data (US) and Yahoo (KR — the only free option, since KIS has no
// fundamentals and Twelve Data's free plan doesn't cover Korean symbols)
// use completely different shapes; normalized here into one common format
// so the UI never needs to know which source answered.
function normalizeTDIncome(rows) {
  return (rows || []).map((r) => ({
    period: r.fiscal_date,
    revenue: n(r.sales),
    costOfRevenue: n(r.cost_of_goods),
    grossProfit: n(r.gross_profit),
    operatingExpense: n((r.operating_expense?.research_and_development || 0) + (r.operating_expense?.selling_general_and_administrative || 0)) || null,
    operatingIncome: n(r.operating_income),
    pretaxIncome: n(r.pretax_income),
    incomeTax: n(r.income_tax),
    netIncome: n(r.net_income),
    eps: n(r.eps_diluted ?? r.eps_basic),
    ebitda: n(r.ebitda),
  }));
}
function normalizeTDBalance(rows) {
  return (rows || []).map((r) => ({
    period: r.fiscal_date,
    cash: n(r.assets?.current_assets?.cash_and_cash_equivalents),
    totalCurrentAssets: n(r.assets?.current_assets?.total_current_assets),
    totalNonCurrentAssets: n(r.assets?.non_current_assets?.total_non_current_assets),
    totalAssets: n(r.assets?.total_assets),
    totalCurrentLiabilities: n(r.liabilities?.current_liabilities?.total_current_liabilities),
    totalNonCurrentLiabilities: n(r.liabilities?.non_current_liabilities?.total_non_current_liabilities),
    totalLiabilities: n(r.liabilities?.total_liabilities),
    totalEquity: n(r.shareholders_equity?.total_shareholders_equity),
  }));
}
function normalizeTDCashFlow(rows) {
  return (rows || []).map((r) => ({
    period: r.fiscal_date,
    operatingCashFlow: n(r.operating_activities?.operating_cash_flow),
    capex: n(r.investing_activities?.capital_expenditures),
    investingCashFlow: n(r.investing_activities?.investing_cash_flow),
    financingCashFlow: n(r.financing_activities?.financing_cash_flow),
    dividendsPaid: n(r.financing_activities?.common_dividends),
    stockRepurchase: n(r.financing_activities?.common_stock_repurchase),
    freeCashFlow: n(r.free_cash_flow),
  }));
}
function normalizeYahooIncome(rows) {
  return (rows || []).map((r) => ({
    period: r.endDate ? new Date(r.endDate).toISOString().slice(0, 10) : null,
    revenue: n(r.totalRevenue),
    costOfRevenue: n(r.costOfRevenue),
    grossProfit: n(r.grossProfit),
    operatingExpense: n(r.totalOperatingExpenses),
    operatingIncome: n(r.operatingIncome),
    pretaxIncome: n(r.incomeBeforeTax),
    incomeTax: n(r.incomeTaxExpense),
    netIncome: n(r.netIncome),
    eps: null,
    ebitda: n(r.ebit),
  }));
}
function normalizeYahooBalance(rows) {
  return (rows || []).map((r) => {
    const totalAssets = n(r.totalAssets), curAssets = n(r.totalCurrentAssets);
    const totalLiab = n(r.totalLiab), curLiab = n(r.totalCurrentLiabilities);
    return {
      period: r.endDate ? new Date(r.endDate).toISOString().slice(0, 10) : null,
      cash: n(r.cash),
      totalCurrentAssets: curAssets,
      totalNonCurrentAssets: totalAssets !== null && curAssets !== null ? totalAssets - curAssets : null,
      totalAssets,
      totalCurrentLiabilities: curLiab,
      totalNonCurrentLiabilities: totalLiab !== null && curLiab !== null ? totalLiab - curLiab : null,
      totalLiabilities: totalLiab,
      totalEquity: n(r.totalStockholderEquity),
    };
  });
}
function normalizeYahooCashFlow(rows) {
  return (rows || []).map((r) => {
    const ocf = n(r.totalCashFromOperatingActivities), capex = n(r.capitalExpenditures);
    return {
      period: r.endDate ? new Date(r.endDate).toISOString().slice(0, 10) : null,
      operatingCashFlow: ocf,
      capex,
      investingCashFlow: n(r.totalCashflowsFromInvestingActivities),
      financingCashFlow: n(r.totalCashFromFinancingActivities),
      dividendsPaid: n(r.dividendsPaid),
      stockRepurchase: n(r.repurchaseOfStock),
      freeCashFlow: ocf !== null && capex !== null ? ocf + capex : null,
    };
  });
}
const EMPTY_FINANCIALS = {
  incomeStatement: { annual: [], quarterly: [] },
  balanceSheet: { annual: [], quarterly: [] },
  cashFlow: { annual: [], quarterly: [] },
};

export async function getFinancials(symbol, market) {
  if (market === "KR") {
    try {
      const ySym = /^\d{6}$/.test(symbol) ? await resolveKRYahoo(symbol) : symbol;
      const raw = await getYahooFinancials(ySym);
      return {
        incomeStatement: { annual: normalizeYahooIncome(raw.incomeStatement.annual), quarterly: normalizeYahooIncome(raw.incomeStatement.quarterly) },
        balanceSheet: { annual: normalizeYahooBalance(raw.balanceSheet.annual), quarterly: normalizeYahooBalance(raw.balanceSheet.quarterly) },
        cashFlow: { annual: normalizeYahooCashFlow(raw.cashFlow.annual), quarterly: normalizeYahooCashFlow(raw.cashFlow.quarterly) },
      };
    } catch (e) {
      console.warn(`[financials KR] ${symbol}: ${e.message}`);
      return EMPTY_FINANCIALS;
    }
  }

  if (!twelveDataConfigured()) return EMPTY_FINANCIALS;
  try {
    const raw = await getTwelveDataFinancials(symbol);
    return {
      incomeStatement: { annual: normalizeTDIncome(raw.incomeStatement.annual), quarterly: normalizeTDIncome(raw.incomeStatement.quarterly) },
      balanceSheet: { annual: normalizeTDBalance(raw.balanceSheet.annual), quarterly: normalizeTDBalance(raw.balanceSheet.quarterly) },
      cashFlow: { annual: normalizeTDCashFlow(raw.cashFlow.annual), quarterly: normalizeTDCashFlow(raw.cashFlow.quarterly) },
    };
  } catch (e) {
    console.warn(`[financials US] ${symbol}: ${e.message}`);
    return EMPTY_FINANCIALS;
  }
}

// Dividend history — US via Twelve Data (confirmed free); no working KR
// source (KIS doesn't have it, Yahoo would be the only option and stays
// unreliable) — returns empty rather than guessing, UI shows "not available".
export async function getDividends(symbol, market) {
  if (market !== "US" || !twelveDataConfigured()) return [];
  try {
    return await getTwelveDataDividends(symbol);
  } catch (e) {
    console.warn(`[dividends] ${symbol}: ${e.message}`);
    return [];
  }
}

export async function getBatch(symbols) {
  // Korean symbols are either 6-digit codes (KIS) or *.KS/*.KQ (Yahoo).
  const kr = symbols.filter((s) => /^\d{6}$/.test(s) || /\.(KS|KQ)$/.test(s));
  const us = symbols.filter((s) => !kr.includes(s));

  const [usQ, krQ] = await Promise.all([
    us.length ? getUSBatch(us).catch((e) => { console.warn(`[batch US] ${e.message}`); return {}; }) : {},
    kr.length
      ? (kisConfigured() && kr.every((s) => /^\d{6}$/.test(s))
          ? getKRBatch(kr)
          : getKRBatchYahoo(kr)
        ).catch((e) => { console.warn(`[batch KR] ${e.message}`); return {}; })
      : {},
  ]);
  return { ...usQ, ...krQ };
}

export async function getCalendar(symbol, market) {
  if (market === "KR" || /^\d{6}$/.test(symbol) || /\.(KS|KQ)$/.test(symbol)) {
    // Korean earnings dates are not exposed by KIS; try Yahoo, tolerate failure.
    try {
      const ySym = /^\d{6}$/.test(symbol) ? await resolveKRYahoo(symbol) : symbol;
      const d = await getKRQuoteYahoo(ySym);
      return {
        symbol, name: d.name, currency: d.currency, price: d.price, changePct: d.changePct,
        date: d.nextEarnings, dateEstimated: false, hour: null,
        consensusEPS: d.consensusEPS, consensusEPSLow: d.consensusEPSLow,
        consensusEPSHigh: d.consensusEPSHigh, consensusRev: d.consensusRev,
        analysts: d.numberOfAnalysts, exDividend: null, history: [],
      };
    } catch (e) {
      console.warn(`[calendar KR] ${symbol}: ${e.message}`);
      return { symbol, error: true };
    }
  }
  return getUSCalendar(symbol);
}

export function providerStatus() {
  return {
    us: process.env.FINNHUB_API_KEY ? "finnhub" : "unconfigured",
    kr: kisConfigured() ? "kis" : "yahoo-fallback",
  };
}
