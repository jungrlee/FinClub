// GET /api/market/overview?region=KR|US
// KR -> { KOSPI: {index, chart, pulse}, KOSDAQ: {index, chart, pulse} }
// US -> { SPY: {index, chart}, QQQ: {...}, DIA: {...}, breadth: {up, down, flat} }
// (US has no free per-index breadth/trading-value/investor-flow source —
// breadth is a single market-wide figure derived from the curated ranking
// constituents, not one number per ETF proxy, hence the different shape.)
//
// US index/chart values come from Yahoo (^GSPC/^IXIC/^DJI), not the SPY/
// QQQ/DIA ETF quotes — an ETF trades at roughly 1/10th the real index level
// (SPY ~$770 vs S&P 500 ~7,700), so showing the ETF price as "S&P 500"
// was wrong, not just approximate. The SPY/QQQ/DIA *keys* are kept (they
// label which index each card is) but the numbers are the real index.
import { NextResponse } from "next/server";
import { getMarketIndex, getMarketChart, getMarketPulse } from "../../../../lib/providers/naverMarket";
import { getUSRanking } from "../../../../lib/providers/finnhub";
import { getUSIndexQuotes, getUSIndexChart } from "../../../../lib/providers/yahooEnrich";
import { US_TICKERS } from "../../../../lib/providers/usTickers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadOneKR(idx) {
  const [index, chart, pulse] = await Promise.all([
    getMarketIndex(idx),
    getMarketChart(idx),
    getMarketPulse(idx),
  ]);
  return { index, chart, pulse };
}

async function loadKR() {
  const [KOSPI, KOSDAQ] = await Promise.all([loadOneKR("KOSPI"), loadOneKR("KOSDAQ")]);
  return { KOSPI, KOSDAQ };
}

async function loadUS() {
  const symbols = ["SPY", "QQQ", "DIA"];
  const [quotes, ranking, ...charts] = await Promise.all([
    getUSIndexQuotes(),
    getUSRanking(US_TICKERS),
    ...symbols.map((s) => getUSIndexChart(s, 300)),
  ]);
  const out = {};
  symbols.forEach((s, i) => {
    out[s] = {
      index: quotes[s] || null,
      chart: (charts[i] || []).map((c) => ({ date: c.date, close: c.close })),
    };
  });
  const up = ranking.filter((r) => (r.changePct ?? 0) > 0).length;
  const down = ranking.filter((r) => (r.changePct ?? 0) < 0).length;
  const flat = ranking.length - up - down;
  out.breadth = { up, down, flat };
  return out;
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region") === "US" ? "US" : "KR";
  const data = region === "US" ? await loadUS() : await loadKR();
  return NextResponse.json(data);
}
