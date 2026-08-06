// GET /api/market/ranking?region=KR&index=KOSPI&count=100
//     /api/market/ranking?region=US&count=100
// -> { stocks: [{symbol, name, price, changePct, up, marketCapKrw|marketCapUsd, ...}] }
// Serves both the TOP-10 table (first 10) and the heatmap (the rest) from
// one fetch.
import { NextResponse } from "next/server";
import { getMarketRanking } from "../../../../lib/providers/naverMarket";
import { getUSRanking } from "../../../../lib/providers/finnhub";
import { US_TICKERS } from "../../../../lib/providers/usTickers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region") === "US" ? "US" : "KR";
  const count = Math.min(parseInt(searchParams.get("count"), 10) || 100, 150);

  if (region === "US") {
    const stocks = await getUSRanking(US_TICKERS.slice(0, count));
    return NextResponse.json({ region, stocks });
  }

  const index = searchParams.get("index") === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  const stocks = await getMarketRanking(index, count);
  return NextResponse.json({ region, index, stocks });
}
