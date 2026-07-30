// GET /api/chart?q=AAPL&market=US&range=1Y -> { closes: [{d, c}, ...] }
// Kept separate from /api/quote so switching timeframes only refetches the
// chart series, not the whole quote (analyst data, fundamentals, etc.).
import { NextResponse } from "next/server";
import { resolve, getChart } from "../../../lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const market = searchParams.get("market") === "KR" ? "KR" : "US";
  const range = searchParams.get("range") || "1Y";
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });

  try {
    const symbol = await resolve(q, market);
    const closes = await getChart(symbol, market, range);
    return NextResponse.json({ closes });
  } catch (e) {
    return NextResponse.json({ error: `Could not load chart for "${q}"`, detail: e?.message ?? String(e) }, { status: 404 });
  }
}
