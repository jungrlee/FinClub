// Twelve Data — free-tier chart + financial-statement source for US
// symbols. Finnhub's own candle/financials endpoints are paid-tier-only,
// and Yahoo (the other fallback) is the most rate-limit-fragile link in
// this stack, so this exists as a dedicated, more reliable source for both.
// Free "basic" tier: 800 calls/day, 8/min, no credit card — confirmed to
// include intraday candles, income_statement, balance_sheet, and cash_flow
// (US symbols only — Korean symbols 404 on this plan, requiring a paid
// Pro/Venture upgrade). https://twelvedata.com
const BASE = "https://api.twelvedata.com";

export function twelveDataConfigured() {
  return Boolean(process.env.TWELVEDATA_API_KEY);
}

// Candles don't change once a period closes — cache generously so a symbol
// viewed repeatedly across the club in one day costs one real call, well
// inside the shared daily quota. Weekly/monthly ranges get a longer TTL
// since they change even less often than daily.
const chartCache = new Map();
const CHART_TTL = { "1min": 5 * 60 * 1000, "15min": 15 * 60 * 1000, "1day": 60 * 60 * 1000, "1week": 6 * 60 * 60 * 1000 };

export async function getTwelveDataCandles(symbol, { interval = "1day", outputsize = 150 } = {}) {
  const key = `${symbol}:${interval}:${outputsize}`;
  const ttl = CHART_TTL[interval] || 60 * 60 * 1000;
  const hit = chartCache.get(key);
  if (hit && Date.now() - hit.t < ttl) return hit.d;

  const url = new URL(`${BASE}/time_series`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(outputsize));
  url.searchParams.set("apikey", process.env.TWELVEDATA_API_KEY);

  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "error" || !Array.isArray(data.values)) {
    throw new Error(`Twelve Data error: ${data.message || JSON.stringify(data).slice(0, 120)}`);
  }

  const closes = data.values
    .map((v) => ({ d: v.datetime, c: parseFloat(v.close) }))
    .filter((c) => isFinite(c.c))
    .reverse(); // API returns newest-first; chart wants oldest-first

  chartCache.set(key, { t: Date.now(), d: closes });
  return closes;
}

// Financial statements only change quarterly, and share the same daily
// quota as chart requests — cache for a full day.
const finCache = new Map();
const FIN_TTL = 24 * 60 * 60 * 1000;

async function statement(kind, symbol, period) {
  const url = new URL(`${BASE}/${kind}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("period", period);
  url.searchParams.set("apikey", process.env.TWELVEDATA_API_KEY);
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "error") throw new Error(`Twelve Data ${kind} error: ${data.message || "unknown"}`);
  return data[kind] || [];
}

export async function getTwelveDataFinancials(symbol) {
  const hit = finCache.get(symbol);
  if (hit && Date.now() - hit.t < FIN_TTL) return hit.d;

  const [incAnnual, incQuarterly, balAnnual, balQuarterly, cfAnnual, cfQuarterly] = await Promise.all([
    statement("income_statement", symbol, "annual"),
    statement("income_statement", symbol, "quarterly"),
    statement("balance_sheet", symbol, "annual"),
    statement("balance_sheet", symbol, "quarterly"),
    statement("cash_flow", symbol, "annual"),
    statement("cash_flow", symbol, "quarterly"),
  ]);

  const result = {
    incomeStatement: { annual: incAnnual, quarterly: incQuarterly },
    balanceSheet: { annual: balAnnual, quarterly: balQuarterly },
    cashFlow: { annual: cfAnnual, quarterly: cfQuarterly },
  };

  finCache.set(symbol, { t: Date.now(), d: result });
  return result;
}

// FX quote (Twelve Data's free plan covers forex pairs, unlike Korean
// equities). pair like "USD/KRW" — quote currency is the part after the
// slash (e.g. KRW), matching how the rest of the app expects `currency`.
const num = (v) => {
  const x = parseFloat(v);
  return isFinite(x) ? x : null;
};

const fxQuoteCache = new Map();
const FX_QUOTE_TTL = 60 * 1000;

export async function getForexQuote(pair) {
  const hit = fxQuoteCache.get(pair);
  if (hit && Date.now() - hit.t < FX_QUOTE_TTL) return hit.d;

  const url = new URL(`${BASE}/quote`);
  url.searchParams.set("symbol", pair);
  url.searchParams.set("apikey", process.env.TWELVEDATA_API_KEY);
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "error" || !num(data.close)) {
    throw new Error(`Twelve Data FX quote error: ${data.message || "no price"}`);
  }

  const quoteCurrency = pair.split("/")[1] || "USD";
  const result = {
    symbol: pair,
    name: data.name || pair,
    exchange: "FX",
    currency: quoteCurrency,
    market: "FX",
    source: "twelvedata",
    price: num(data.close),
    change: num(data.change),
    changePct: num(data.percent_change),
    prevClose: num(data.previous_close),
    dayLow: num(data.low),
    dayHigh: num(data.high),
    week52Low: num(data.fifty_two_week?.low),
    week52High: num(data.fifty_two_week?.high),
    marketState: data.is_market_open ? "REGULAR" : null,
    closes: [],
  };

  fxQuoteCache.set(pair, { t: Date.now(), d: result });
  return result;
}
