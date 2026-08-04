// GET /api/market/overview
// -> { KOSPI: {index, chart, pulse}, KOSDAQ: {index, chart, pulse} }
// One round trip for the KR Market tab's index cards, chart, breadth,
// trading value, and investor-flow panels.
import { NextResponse } from "next/server";
import { getMarketIndex, getMarketChart, getMarketPulse } from "../../../../lib/providers/naverMarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadOne(idx) {
  const [index, chart, pulse] = await Promise.all([
    getMarketIndex(idx),
    getMarketChart(idx),
    getMarketPulse(idx),
  ]);
  return { index, chart, pulse };
}

export async function GET() {
  const [KOSPI, KOSDAQ] = await Promise.all([loadOne("KOSPI"), loadOne("KOSDAQ")]);
  return NextResponse.json({ KOSPI, KOSDAQ });
}
