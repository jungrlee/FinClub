// GET /api/calendar?symbols=AAPL,005930
// Aggregates upcoming earnings across the watchlist into one sorted timeline.
import { NextResponse } from "next/server";
import { getCalendar } from "../../../lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cache = new Map();
const TTL = 30 * 60 * 1000;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const symbols = (searchParams.get("symbols") || "")
    .split(",").map((s) => s.trim()).filter(Boolean).slice(0, 25);
  if (!symbols.length) return NextResponse.json({ events: [] });

  const key = symbols.slice().sort().join(",");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return NextResponse.json(hit.d);

  const results = await Promise.all(
    symbols.map((s) =>
      getCalendar(s, /^\d{6}$/.test(s) || /\.(KS|KQ)$/.test(s) ? "KR" : "US")
        .catch((e) => { console.warn(`[calendar] ${s}: ${e.message}`); return { symbol: s, error: true }; })
    )
  );

  const events = results
    .filter((r) => !r.error)
    .sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });

  const payload = { events, ts: Date.now() };
  cache.set(key, { t: Date.now(), d: payload });
  return NextResponse.json(payload);
}
