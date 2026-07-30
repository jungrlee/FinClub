// Pure risk/statistics math — no I/O. Consumed by app/api/portfolio/risk/route.js.
// Standard formulas, annualized assuming 252 trading days/year.

export const MIN_HISTORY_DAYS = 20; // below this, stats are too noisy to be meaningful

// closes: [{d, c}] sorted oldest-first (as returned by lib/providers' getChart).
// Returns [{d, r}], one entry shorter since the first day has no prior close.
export function dailyReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1].c;
    const cur = closes[i].c;
    if (prev > 0) out.push({ d: closes[i].d, r: (cur - prev) / prev });
  }
  return out;
}

// Aligns multiple {symbol: [{d,r}]} return series to their common dates
// (inner join) so covariance/correlation always compare the same days.
export function alignReturns(seriesMap) {
  const symbols = Object.keys(seriesMap);
  if (symbols.length === 0) return { dates: [], aligned: {} };
  const dateSets = symbols.map((s) => new Set(seriesMap[s].map((r) => r.d)));
  const common = [...dateSets[0]].filter((d) => dateSets.every((set) => set.has(d))).sort();
  const aligned = {};
  for (const s of symbols) {
    const byDate = new Map(seriesMap[s].map((r) => [r.d, r.r]));
    aligned[s] = common.map((d) => byDate.get(d));
  }
  return { dates: common, aligned };
}

export function mean(arr) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
}

export function stddev(arr) {
  if (!arr || arr.length < 2) return null;
  const m = mean(arr);
  const variance = arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function covariance(a, b) {
  if (!a || !b || a.length !== b.length || a.length < 2) return null;
  const ma = mean(a), mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (a.length - 1);
}

export function correlation(a, b) {
  const cov = covariance(a, b);
  const sa = stddev(a), sb = stddev(b);
  if (cov === null || !sa || !sb) return null;
  return cov / (sa * sb);
}

export const annualizeVol = (dailyStd) => (dailyStd === null || dailyStd === undefined ? null : dailyStd * Math.sqrt(252));
export const annualizeReturn = (dailyMean) => (dailyMean === null || dailyMean === undefined ? null : dailyMean * 252);

// weights: {symbol: weight 0..1}; aligned/dates from alignReturns.
export function portfolioDailyReturns(weights, aligned, dates) {
  const symbols = Object.keys(weights);
  return dates.map((_, i) => symbols.reduce((sum, s) => sum + (weights[s] || 0) * (aligned[s]?.[i] ?? 0), 0));
}

export function beta(assetReturns, benchmarkReturns) {
  const cov = covariance(assetReturns, benchmarkReturns);
  const sBench = stddev(benchmarkReturns);
  if (cov === null || !sBench) return null;
  return cov / (sBench * sBench);
}

export function sharpeRatio(annualReturn, annualVol, riskFreeRate) {
  if (annualReturn === null || annualReturn === undefined || !annualVol) return null;
  return (annualReturn - riskFreeRate) / annualVol;
}

// Parametric (normal-distribution) 1-day 95% VaR — not historical simulation.
export function valueAtRisk95(annualVol, portfolioValue) {
  if (!annualVol || !portfolioValue) return null;
  const dailyVol = annualVol / Math.sqrt(252);
  return portfolioValue * dailyVol * 1.645;
}
