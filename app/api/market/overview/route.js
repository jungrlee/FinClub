// GET /api/market/overview?region=KR|US
// KR -> { KOSPI: {index, chart, pulse}, KOSDAQ: {index, chart, pulse} }
// US -> { SPY: {index, chart}, QQQ: {...}, DIA: {...}, breadth: {up, down, flat} }
// (US has no free per-index breadth/trading-value/investor-flow source —
// breadth is a single market-wide figure derived from the curated ranking
// constituents, not one number per ETF proxy, hence the different shape.)
import { NextResponse } from "next/server";
import { getMarketIndex, getMarketChart, getMarketPulse } from "../../../../lib/providers/naverMarket";
import { getUSIndices, getUSRanking, US_INDEX_PROXIES } from "../../../../lib/providers/finnhub";
import { getChart } from "../../../../lib/providers";
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
  const symbols = Object.keys(US_INDEX_PROXIES);
  const [quotes, ranking, ...charts] = await Promise.all([
    getUSIndices(),
    getUSRanking(US_TICKERS),
    ...symbols.map((s) => getChart(s, "US", "6M")),
  ]);
  const out = {};
  symbols.forEach((s, i) => {
    const q = quotes[s];
    out[s] = {
      index: q ? { price: q.price, change: q.change, changePct: q.changePct, up: (q.changePct ?? 0) >= 0 } : null,
      chart: (charts[i] || []).map((c) => ({ date: c.d, close: c.c })),
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
