// Finnhub provider — US equities.
// Free tier: 60 calls/min, real-time US quotes, fundamentals, analyst
// recommendations, price targets, EPS estimates, earnings calendar, news.
// Key: https://finnhub.io (no credit card). Set FINNHUB_API_KEY.

const BASE = "https://finnhub.io/api/v1";

function key() {
  const k = process.env.FINNHUB_API_KEY;
  if (!k) throw new Error("FINNHUB_API_KEY is not set in the environment");
  return k;
}

async function fh(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  url.searchParams.set("token", key());

  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const text = await res.text();

  if (res.status === 429) throw new Error("Finnhub rate limit (60/min) hit — try again shortly");
  if (res.status === 401 || res.status === 403)
    throw new Error("Finnhub rejected the API key (401/403) — check FINNHUB_API_KEY");
  if (!res.ok) throw new Error(`Finnhub ${path} returned ${res.status}: ${text.slice(0, 120)}`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Finnhub ${path} returned non-JSON: ${text.slice(0, 120)}`);
  }
}

const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
const ymd = (d) => d.toISOString().slice(0, 10);

// Resolve a user query ("apple", "AAPL") to a US ticker.
export async function resolveUS(q) {
  const raw = q.trim().toUpperCase();
  // Try it as a literal ticker first — cheapest path.
  try {
    const quote = await fh("/quote", { symbol: raw });
    if (num(quote.c)) return raw;
  } catch (e) {
    if (String(e.message).includes("rate limit")) throw e;
  }
  const s = await fh("/search", { q: q.trim() });
  const hit = (s.result || []).find(
    (r) => r.symbol && !r.symbol.includes(".") && r.type === "Common Stock"
  ) || (s.result || [])[0];
  if (hit?.symbol) return hit.symbol;
  throw new Error(`No US ticker matched "${q}"`);
}

export async function getUSQuote(symbol) {
  const from = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30);
  const to = new Date();

  // quote is required; the rest degrade gracefully so one 403 on a
  // premium-gated endpoint can't kill the whole row.
  const quote = await fh("/quote", { symbol });
  if (!num(quote.c)) throw new Error(`Finnhub returned no price for ${symbol}`);

  const soft = (p) => p.catch((e) => {
    console.warn(`[finnhub] ${symbol}: ${e.message}`);
    return null;
  });

  const [profile, metrics, rec, target, earnings, epsEst, revEst, news, candles] =
    await Promise.all([
      soft(fh("/stock/profile2", { symbol })),
      soft(fh("/stock/metric", { symbol, metric: "all" })),
      soft(fh("/stock/recommendation", { symbol })),
      soft(fh("/stock/price-target", { symbol })),
      soft(fh("/calendar/earnings", { symbol, from: ymd(to), to: ymd(new Date(Date.now() + 1000 * 60 * 60 * 24 * 120)) })),
      soft(fh("/stock/eps-estimate", { symbol, freq: "quarterly" })),
      soft(fh("/stock/revenue-estimate", { symbol, freq: "quarterly" })),
      soft(fh("/company-news", { symbol, from: ymd(from), to: ymd(to) })),
      soft(fh("/stock/candle", { symbol, resolution: "D", from: Math.floor((Date.now() - 1000 * 60 * 60 * 24 * 150) / 1000), to: Math.floor(Date.now() / 1000) })),
    ]);

  const m = metrics?.metric || {};
  const r = (rec || [])[0] || {};
  const nextEarn = (earnings?.earningsCalendar || [])[0] || {};
  const eps0 = (epsEst?.data || [])[0] || {};
  const rev0 = (revEst?.data || [])[0] || {};

  // Candle data is premium-gated on some accounts; fall back to an empty
  // series rather than failing — the UI handles a missing chart.
  const closes =
    candles && candles.s === "ok" && Array.isArray(candles.c)
      ? candles.c.map((c, i) => ({ d: new Date(candles.t[i] * 1000).toISOString(), c }))
      : [];

  return {
    symbol,
    name: profile?.name || symbol,
    exchange: profile?.exchange || "US",
    currency: profile?.currency || "USD",
    market: "US",
    source: "finnhub",
    price: num(quote.c),
    change: num(quote.d),
    changePct: num(quote.dp),
    prevClose: num(quote.pc),
    dayLow: num(quote.l),
    dayHigh: num(quote.h),
    week52Low: num(m["52WeekLow"]),
    week52High: num(m["52WeekHigh"]),
    marketCap: num(profile?.marketCapitalization) !== null ? profile.marketCapitalization * 1e6 : null,
    volume: num(m["10DayAverageTradingVolume"]) !== null ? m["10DayAverageTradingVolume"] * 1e6 : null,
    avgVolume: num(m["3MonthAverageTradingVolume"]) !== null ? m["3MonthAverageTradingVolume"] * 1e6 : null,
    per: num(m.peTTM) ?? num(m.peBasicExclExtraTTM),
    forwardPE: num(m.forwardPE),
    pbr: num(m.pbAnnual) ?? num(m.pbQuarterly),
    eps: num(m.epsTTM) ?? num(m.epsBasicExclExtraItemsTTM),
    divYieldPct: num(m.dividendYieldIndicatedAnnual),
    beta: num(m.beta),
    shortPctFloat: null, // not on the free tier
    // ---- street estimates ----
    analystBuy: (r.strongBuy || 0) + (r.buy || 0) || null,
    analystHold: num(r.hold),
    analystSell: (r.sell || 0) + (r.strongSell || 0) || null,
    recommendationKey: null,
    targetMean: num(target?.targetMean),
    targetHigh: num(target?.targetHigh),
    targetLow: num(target?.targetLow),
    numberOfAnalysts: num(eps0.numberAnalysts),
    consensusEPS: num(eps0.epsAvg),
    consensusEPSLow: num(eps0.epsLow),
    consensusEPSHigh: num(eps0.epsHigh),
    consensusRev: num(rev0.revenueAvg),
    epsGrowthPct: null,
    nextEarnings: nextEarn.date || null,
    // ---- fundamentals ----
    revenueTTM: num(m.revenuePerShareTTM) !== null && num(m.epsTTM) !== null ? null : null,
    revenueGrowthPct: num(m.revenueGrowthTTMYoy),
    grossMarginPct: num(m.grossMarginTTM),
    operMarginPct: num(m.operatingMarginTTM),
    profitMarginPct: num(m.netProfitMarginTTM),
    roePct: num(m.roeTTM),
    debtToEquity: num(m["totalDebt/totalEquityQuarterly"]),
    freeCashflow: null,
    totalCash: null,
    closes,
    news: (news || []).slice(0, 6).map((n) => ({
      t: n.datetime,
      s: n.source,
      h: n.headline,
      u: n.url,
    })),
  };
}

// Batch quotes for the realtime poller. Finnhub has no multi-symbol quote
// endpoint on the free tier, so this fans out — kept small and serialized
// enough to stay under 60/min.
export async function getUSBatch(symbols) {
  const out = {};
  for (const s of symbols) {
    try {
      const q = await fh("/quote", { symbol: s });
      if (num(q.c)) {
        out[s] = {
          symbol: s,
          price: num(q.c),
          change: num(q.d),
          changePct: num(q.dp),
          prevClose: num(q.pc),
          dayLow: num(q.l),
          dayHigh: num(q.h),
          volume: null,
          currency: "USD",
          marketState: null,
          time: num(q.t),
        };
      }
    } catch (e) {
      console.warn(`[finnhub batch] ${s}: ${e.message}`);
    }
  }
  return out;
}

export async function getUSCalendar(symbol) {
  const to = new Date(Date.now() + 1000 * 60 * 60 * 24 * 120);
  const [cal, epsEst, revEst, hist, quote, profile] = await Promise.all([
    fh("/calendar/earnings", { symbol, from: ymd(new Date()), to: ymd(to) }).catch(() => null),
    fh("/stock/eps-estimate", { symbol, freq: "quarterly" }).catch(() => null),
    fh("/stock/revenue-estimate", { symbol, freq: "quarterly" }).catch(() => null),
    fh("/stock/earnings", { symbol }).catch(() => null),
    fh("/quote", { symbol }).catch(() => ({})),
    fh("/stock/profile2", { symbol }).catch(() => ({})),
  ]);

  const next = (cal?.earningsCalendar || [])[0] || {};
  const eps0 = (epsEst?.data || [])[0] || {};
  const rev0 = (revEst?.data || [])[0] || {};

  return {
    symbol,
    name: profile?.name || symbol,
    currency: profile?.currency || "USD",
    price: num(quote.c),
    changePct: num(quote.dp),
    date: next.date || null,
    dateEstimated: false,
    hour: next.hour || null,
    consensusEPS: num(next.epsEstimate) ?? num(eps0.epsAvg),
    consensusEPSLow: num(eps0.epsLow),
    consensusEPSHigh: num(eps0.epsHigh),
    consensusRev: num(next.revenueEstimate) ?? num(rev0.revenueAvg),
    analysts: num(eps0.numberAnalysts),
    exDividend: null,
    history: (hist || []).slice(0, 4).map((h) => ({
      q: h.period,
      actual: num(h.actual),
      est: num(h.estimate),
      surprisePct: num(h.surprisePercent),
    })),
  };
}
