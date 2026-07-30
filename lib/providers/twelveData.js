// Twelve Data — free-tier fallback for US daily candles. Finnhub's own
// /stock/candle endpoint is paid-tier-only (403 on the free 60/min plan),
// and Yahoo (the other fallback) is the most rate-limit-fragile link in
// this stack, so this exists as a dedicated, more reliable chart source.
// Free tier: 800 calls/day, 8/min, no credit card — https://twelvedata.com
const BASE = "https://api.twelvedata.com";

export function twelveDataConfigured() {
  return Boolean(process.env.TWELVEDATA_API_KEY);
}

// Daily candles don't change intraday — cache generously so a symbol
// viewed repeatedly across the club in one day costs one real call, well
// inside the free quota.
const cache = new Map();
const TTL = 60 * 60 * 1000;

export async function getTwelveDataCandles(symbol) {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.t < TTL) return hit.d;

  const url = new URL(`${BASE}/time_series`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", "1day");
  url.searchParams.set("outputsize", "150");
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

  cache.set(symbol, { t: Date.now(), d: closes });
  return closes;
}
