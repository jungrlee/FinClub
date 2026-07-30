// GET /api/quote?q=AAPL&market=US  |  ?q=005930&market=KR  |  ?q=삼성전자&market=KR
// Data comes from lib/providers (Finnhub for US, KIS or Yahoo for KR).
import { NextResponse } from "next/server";
import { resolve, getQuote, providerStatus } from "../../../lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map();
const TTL = 60 * 1000;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const marketParam = searchParams.get("market");
  const market = marketParam === "KR" || marketParam === "FX" ? marketParam : "US";
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });

  const ck = `${market}:${q.toLowerCase()}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.t < TTL) return NextResponse.json(hit.d);

  try {
    const symbol = await resolve(q, market);
    const data = await getQuote(symbol, market);
    cache.set(ck, { t: Date.now(), d: data });
    return NextResponse.json(data);
  } catch (e) {
    console.error(`quote error for "${q}" (${market}):`, e);
    return NextResponse.json(
      {
        error: `Could not resolve "${q}" (${market}).`,
        detail: e?.message ?? String(e),
        providers: providerStatus(),
      },
      { status: 404 }
    );
  }
}
