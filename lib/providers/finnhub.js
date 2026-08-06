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

// Autocomplete candidates for a partial ticker/company name — unlike
// resolveUS, keeps the whole list instead of just the first hit.
export async function searchSymbols(q) {
  const s = await fh("/search", { q: q.trim() });
  const seen = new Set();
  const out = [];
  for (const r of s.result || []) {
    if (!r.symbol || r.symbol.includes(".") || r.type !== "Common Stock" || seen.has(r.symbol)) continue;
    seen.add(r.symbol);
    out.push({ symbol: r.symbol, name: r.description });
    if (out.length >= 8) break;
  }
  return out;
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
    sector: profile?.finnhubIndustry || null,
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

// ------------------------------------------------------------ US: market overview
// Feeds the Market tab's US side (ranking/heatmap/sectors). Real index
// levels/charts (S&P 500 etc.) come from Yahoo instead of Finnhub — see
// lib/providers/yahooEnrich.js's getUSIndexQuotes/getUSIndexChart: Finnhub's
// free tier 403s raw index symbols ("Market data subscription required for
// CFD indices"), confirmed live, and SPY/QQQ/DIA ETF quotes trade at
// roughly 1/10th the real index level — not an equivalent substitute.

// Market cap doesn't move intraday the way price does, so it's cached far
// longer (24h) than a quote — keeps a ~70-symbol ranking fetch from
// re-spending the free tier's 60/min budget on every page load.
const capCache = new Map();
const CAP_TTL = 24 * 60 * 60 * 1000;

async function getCachedProfile(symbol) {
  const hit = capCache.get(symbol);
  if (hit && Date.now() - hit.t < CAP_TTL) return hit.d;
  const d = await fh("/stock/profile2", { symbol });
  capCache.set(symbol, { t: Date.now(), d });
  return d;
}

// No free "rank the whole US market by cap" API exists (unlike KR's Naver
// endpoint), so this ranks a curated constituent list (lib/providers/
// usTickers.js) by live-fetched market cap instead — sequential, one quote
// + one (mostly cached) profile call per symbol, matching getUSBatch's
// rate-limit-conscious pattern. A ~70-symbol sequential fetch is slow
// enough (and both the overview and ranking routes need it) that the
// result itself is cached briefly too, not just the per-symbol profiles.
const rankingCache = new Map();
// Matches naverMarket.js's ranking cache (5min) — a ~70-symbol sequential
// fetch (~20s cold, to stay within Finnhub's free-tier 60/min limit) is too
// expensive to redo every poll; this is metadata (rank/cap), not a live tick.
const RANKING_TTL = 5 * 60 * 1000;

export async function getUSRanking(symbols) {
  const key = symbols.join(",");
  const hit = rankingCache.get(key);
  if (hit && Date.now() - hit.t < RANKING_TTL) return hit.d;

  const out = [];
  for (const s of symbols) {
    try {
      const [quote, profile] = await Promise.all([
        fh("/quote", { symbol: s }),
        getCachedProfile(s).catch(() => null),
      ]);
      if (!num(quote.c)) continue;
      out.push({
        symbol: s,
        name: profile?.name || s,
        price: num(quote.c),
        changePct: num(quote.dp),
        up: (quote.dp ?? 0) >= 0,
        marketCapUsd: num(profile?.marketCapitalization) != null ? profile.marketCapitalization * 1e6 : null,
        sector: profile?.finnhubIndustry || null,
      });
    } catch (e) {
      console.warn(`[finnhub ranking] ${s}: ${e.message}`);
    }
  }
  const sorted = out.sort((a, b) => (b.marketCapUsd || 0) - (a.marketCapUsd || 0));
  rankingCache.set(key, { t: Date.now(), d: sorted });
  return sorted;
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

// General market news (not tied to any one stock) — distinct from the
// per-stock company-news already used in getUSQuote. Headlines refresh
// often but not per-second, so a short cache is enough to be considerate.
const newsCache = { t: 0, d: [] };
const NEWS_TTL = 5 * 60 * 1000;

export async function getGeneralNews() {
  if (Date.now() - newsCache.t < NEWS_TTL && newsCache.d.length) return newsCache.d;

  const items = await fh("/news", { category: "general" });
  const news = (items || []).slice(0, 60).map((n) => ({
    t: n.datetime,
    s: n.source,
    h: n.headline,
    u: n.url,
    img: n.image || null,
    category: n.category || null,
  }));

  newsCache.t = Date.now();
  newsCache.d = news;
  return news;
}

// ---------------------------------------------------------------- financials
// Twelve Data's income_statement/balance_sheet/cash_flow endpoints turned
// out to be free-tier-accessible for AAPL only (confirmed live — every
// other symbol tested 403'd with "available exclusively with pro/ultra/
// venture/enterprise plans") — effectively a demo-symbol exception, not a
// real free tier. /stock/financials-reported (raw SEC-filing XBRL data) is
// NOT similarly restricted (confirmed 200 for NVDA/MSFT/TSLA), so this
// parses that instead. XBRL concept tags aren't perfectly standardized
// across filers, so this tries a few common variants per line item and
// simply returns null for anything a given company tags differently —
// best-effort, not guaranteed complete for every ticker.
const CONCEPTS = {
  revenue: ["us-gaap_Revenues", "us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax", "us-gaap_RevenueFromContractWithCustomerIncludingAssessedTax", "us-gaap_SalesRevenueNet"],
  costOfRevenue: ["us-gaap_CostOfRevenue", "us-gaap_CostOfGoodsAndServicesSold", "us-gaap_CostOfServices"],
  grossProfit: ["us-gaap_GrossProfit"],
  operatingExpense: ["us-gaap_OperatingExpenses", "us-gaap_CostsAndExpenses"],
  operatingIncome: ["us-gaap_OperatingIncomeLoss"],
  pretaxIncome: [
    "us-gaap_IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
    "us-gaap_IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments",
  ],
  incomeTax: ["us-gaap_IncomeTaxExpenseBenefit"],
  netIncome: ["us-gaap_NetIncomeLoss", "us-gaap_ProfitLoss"],
  eps: ["us-gaap_EarningsPerShareDiluted", "us-gaap_EarningsPerShareBasicAndDiluted"],
  cash: ["us-gaap_CashAndCashEquivalentsAtCarryingValue", "us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
  totalCurrentAssets: ["us-gaap_AssetsCurrent"],
  totalAssets: ["us-gaap_Assets"],
  totalCurrentLiabilities: ["us-gaap_LiabilitiesCurrent"],
  totalLiabilities: ["us-gaap_Liabilities"],
  totalEquity: ["us-gaap_StockholdersEquity", "us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
  operatingCashFlow: ["us-gaap_NetCashProvidedByUsedInOperatingActivities"],
  capex: ["us-gaap_PaymentsToAcquirePropertyPlantAndEquipment", "us-gaap_PaymentsToAcquireProductiveAssets"],
  investingCashFlow: ["us-gaap_NetCashProvidedByUsedInInvestingActivities"],
  financingCashFlow: ["us-gaap_NetCashProvidedByUsedInFinancingActivities"],
  dividendsPaid: ["us-gaap_PaymentsOfDividends", "us-gaap_PaymentsOfDividendsCommonStock"],
  stockRepurchase: ["us-gaap_PaymentsForRepurchaseOfCommonStock"],
};

function pick(items, key) {
  const hit = (items || []).find((it) => CONCEPTS[key].includes(it.concept));
  return hit ? num(hit.value) : null;
}
const neg = (v) => (v === null ? null : -Math.abs(v));

async function reportedFilings(symbol, freq) {
  const data = await fh("/stock/financials-reported", { symbol, freq });
  const wantForm = freq === "annual" ? "10-K" : "10-Q";
  return (data.data || []).filter((f) => f.form === wantForm);
}

function buildIncome(f) {
  const ic = f.report?.ic || [];
  return {
    period: f.endDate,
    revenue: pick(ic, "revenue"),
    costOfRevenue: pick(ic, "costOfRevenue"),
    grossProfit: pick(ic, "grossProfit"),
    operatingExpense: pick(ic, "operatingExpense"),
    operatingIncome: pick(ic, "operatingIncome"),
    pretaxIncome: pick(ic, "pretaxIncome"),
    incomeTax: pick(ic, "incomeTax"),
    netIncome: pick(ic, "netIncome"),
    eps: pick(ic, "eps"),
    ebitda: null,
  };
}
function buildBalance(f) {
  const bs = f.report?.bs || [];
  const totalAssets = pick(bs, "totalAssets");
  const curAssets = pick(bs, "totalCurrentAssets");
  const totalLiab = pick(bs, "totalLiabilities");
  const curLiab = pick(bs, "totalCurrentLiabilities");
  return {
    period: f.endDate,
    cash: pick(bs, "cash"),
    totalCurrentAssets: curAssets,
    totalNonCurrentAssets: totalAssets !== null && curAssets !== null ? totalAssets - curAssets : null,
    totalAssets,
    totalCurrentLiabilities: curLiab,
    totalNonCurrentLiabilities: totalLiab !== null && curLiab !== null ? totalLiab - curLiab : null,
    totalLiabilities: totalLiab,
    totalEquity: pick(bs, "totalEquity"),
  };
}
function buildCashFlow(f) {
  const cf = f.report?.cf || [];
  const ocf = pick(cf, "operatingCashFlow");
  const capex = neg(pick(cf, "capex"));
  return {
    period: f.endDate,
    operatingCashFlow: ocf,
    capex,
    investingCashFlow: pick(cf, "investingCashFlow"),
    financingCashFlow: pick(cf, "financingCashFlow"),
    dividendsPaid: neg(pick(cf, "dividendsPaid")),
    stockRepurchase: neg(pick(cf, "stockRepurchase")),
    freeCashFlow: ocf !== null && capex !== null ? ocf + capex : null,
  };
}

const finCache = new Map();
const FIN_TTL = 24 * 60 * 60 * 1000;

export async function getFinnhubFinancials(symbol) {
  const hit = finCache.get(symbol);
  if (hit && Date.now() - hit.t < FIN_TTL) return hit.d;

  const [annualRaw, quarterlyRaw] = await Promise.all([
    reportedFilings(symbol, "annual"),
    reportedFilings(symbol, "quarterly"),
  ]);

  const result = {
    incomeStatement: { annual: annualRaw.map(buildIncome), quarterly: quarterlyRaw.map(buildIncome) },
    balanceSheet: { annual: annualRaw.map(buildBalance), quarterly: quarterlyRaw.map(buildBalance) },
    cashFlow: { annual: annualRaw.map(buildCashFlow), quarterly: quarterlyRaw.map(buildCashFlow) },
  };

  finCache.set(symbol, { t: Date.now(), d: result });
  return result;
}
