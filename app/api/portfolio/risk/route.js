// POST /api/portfolio/risk
// { positions: [{symbol, market, shares, weight}], portfolioValue, currency } -> risk analytics
//
// Called once per currency group (Portfolio.jsx already groups USD/KRW
// separately), so every position + the benchmark share the same market's
// trading calendar — no cross-market date-alignment gaps to worry about.
import { NextResponse } from "next/server";
import { getChart } from "../../../../lib/providers";
import {
  dailyReturns, alignReturns, mean, stddev, correlation, covariance,
  annualizeVol, annualizeReturn, portfolioDailyReturns, beta, sharpeRatio, valueAtRisk95,
  maxDrawdown, rollingSharpe, optimizePortfolio,
  MIN_HISTORY_DAYS,
} from "../../../../lib/risk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Static assumptions, not a live feed — stated plainly in the UI too.
const RISK_FREE = { USD: 0.04, KRW: 0.03 };
const BENCHMARK = { USD: { symbol: "SPY", market: "US" }, KRW: { symbol: "069500", market: "KR" } };
const ROLLING_WINDOW_DAYS = 30;

export async function POST(req) {
  const { positions, portfolioValue, currency } = await req.json();
  if (!Array.isArray(positions) || positions.length === 0) {
    return NextResponse.json({ error: "no positions" }, { status: 400 });
  }
  const cur = currency === "KRW" ? "KRW" : "USD";
  const bench = BENCHMARK[cur];
  const riskFree = RISK_FREE[cur];

  const [closesArr, benchCloses] = await Promise.all([
    Promise.all(positions.map((p) => getChart(p.symbol, p.market, "1Y").catch(() => []))),
    getChart(bench.symbol, bench.market, "1Y").catch(() => []),
  ]);

  const returnsMap = { __bench: dailyReturns(benchCloses) };
  positions.forEach((p, i) => { returnsMap[p.symbol] = dailyReturns(closesArr[i]); });

  const { dates, aligned } = alignReturns(returnsMap);
  if (dates.length < MIN_HISTORY_DAYS) {
    return NextResponse.json({ insufficientHistory: true, historyDays: dates.length });
  }

  const volatility = {};
  for (const p of positions) volatility[p.symbol] = annualizeVol(stddev(aligned[p.symbol]));

  const correlationMatrix = {};
  const covMatrix = {};
  for (const a of positions) {
    correlationMatrix[a.symbol] = {};
    covMatrix[a.symbol] = {};
    for (const b of positions) {
      correlationMatrix[a.symbol][b.symbol] = a.symbol === b.symbol ? 1 : correlation(aligned[a.symbol], aligned[b.symbol]);
      const c = covariance(aligned[a.symbol], aligned[b.symbol]);
      covMatrix[a.symbol][b.symbol] = c !== null ? c * 252 : null; // annualized
    }
  }

  const weights = Object.fromEntries(positions.map((p) => [p.symbol, (p.weight || 0) / 100]));
  const portReturns = portfolioDailyReturns(weights, aligned, dates);
  const portVol = annualizeVol(stddev(portReturns));
  const portAnnualReturn = annualizeReturn(mean(portReturns));
  const portBeta = beta(portReturns, aligned.__bench);
  const sharpe = sharpeRatio(portAnnualReturn, portVol, riskFree);
  const var95_1d = valueAtRisk95(portVol, portfolioValue);

  // Equity curve: sum(shares × close) per aligned day.
  const closesByDate = positions.map((p, i) => new Map(closesArr[i].map((c) => [c.d, c.c])));
  const equityCurve = dates.map((d) => {
    let v = 0;
    positions.forEach((p, i) => {
      const c = closesByDate[i].get(d);
      if (typeof c === "number") v += c * p.shares;
    });
    return { d, v };
  });

  // Benchmark rebased to the same starting value as the portfolio, so the
  // two lines are visually comparable on one chart.
  const benchByDate = new Map(benchCloses.map((c) => [c.d, c.c]));
  const benchStart = benchByDate.get(dates[0]);
  const portStart = equityCurve[0]?.v;
  const benchmarkEquityCurve = dates.map((d) => {
    const c = benchByDate.get(d);
    const v = typeof c === "number" && benchStart && portStart ? (c / benchStart) * portStart : null;
    return { d, v };
  });

  const drawdown = maxDrawdown(equityCurve);
  const rollingSharpeSeries = portReturns.length >= ROLLING_WINDOW_DAYS
    ? rollingSharpe(portReturns, dates, ROLLING_WINDOW_DAYS, riskFree)
    : [];

  const expectedReturns = {};
  for (const p of positions) expectedReturns[p.symbol] = annualizeReturn(mean(aligned[p.symbol]));
  const optimization = optimizePortfolio(positions.map((p) => p.symbol), covMatrix, expectedReturns, riskFree);

  return NextResponse.json({
    volatility,
    correlationMatrix,
    portfolio: {
      volatility: portVol, beta: portBeta, sharpe, var95_1d, equityCurve,
      benchmarkEquityCurve, maxDrawdown: drawdown, rollingSharpe: rollingSharpeSeries,
    },
    optimization,
    benchmark: bench.symbol,
    riskFreeRate: riskFree,
  });
}
