// GET /api/quotes-batch?symbols=AAPL,005930
// Lightweight endpoint for the realtime poller.
import { NextResponse } from "next/server";
import { getBatch } from "../../../lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map();
const TTL = 10 * 1000;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") || "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40);
  if (!symbols.length) return NextResponse.json({ quotes: {} });

  const key = symbols.slice().sort().join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return NextResponse.json(hit.d);

  try {
    const quotes = await getBatch(symbols);
    const payload = { quotes, ts: Date.now() };
    cache.set(key, { t: Date.now(), d: payload });
    return NextResponse.json(payload);
  } catch (e) {
    console.error("batch quote error:", e);
    return NextResponse.json(
      { quotes: {}, error: "batch failed", detail: e?.message ?? String(e) },
      { status: 502 }
    );
  }
}
