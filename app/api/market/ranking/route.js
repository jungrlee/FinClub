// GET /api/market/ranking?index=KOSPI&count=100
// -> [{symbol, name, price, changePct, up, marketCapKrw, tradingValueKrw}]
// Serves both the TOP-10 table (first 10) and the heatmap (the rest) from
// one fetch.
import { NextResponse } from "next/server";
import { getMarketRanking } from "../../../../lib/providers/naverMarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const index = searchParams.get("index") === "KOSDAQ" ? "KOSDAQ" : "KOSPI";
  const count = Math.min(parseInt(searchParams.get("count"), 10) || 100, 150);
  const stocks = await getMarketRanking(index, count);
  return NextResponse.json({ index, stocks });
}
