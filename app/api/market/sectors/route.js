// GET /api/market/sectors?region=KR|US -> { sectors: [{name, changePct, total, up, flat, down}] }
// KR: scraped from finance.naver.com (whole-market industry breakdown).
// US: no free whole-market sector API — grouped from the same curated
// ranking constituents used by the heatmap/TOP10 (lib/providers/
// usTickers.js), via the broad-bucket normalizer already built for
// Portfolio's diversification suggestions (lib/providers/sectors.js).
// Fewer, coarser buckets than KR's real industry-level breakdown — flagged
// in the UI, not silently presented as equivalent.
import { NextResponse } from "next/server";
import { getSectorPerformance } from "../../../../lib/providers/naverMarket";
import { getUSRanking } from "../../../../lib/providers/finnhub";
import { US_TICKERS } from "../../../../lib/providers/usTickers";
import { normalizeSector } from "../../../../lib/providers/sectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function usSectors() {
  const ranking = await getUSRanking(US_TICKERS);
  const buckets = new Map();
  for (const s of ranking) {
    const bucket = s.sector ? normalizeSector(s.sector) : null;
    if (!bucket || typeof s.changePct !== "number") continue;
    if (!buckets.has(bucket)) buckets.set(bucket, { name: bucket, changes: [], up: 0, flat: 0, down: 0 });
    const b = buckets.get(bucket);
    b.changes.push(s.changePct);
    if (s.changePct > 0) b.up++; else if (s.changePct < 0) b.down++; else b.flat++;
  }
  return [...buckets.values()].map((b) => ({
    name: b.name,
    changePct: b.changes.reduce((a, c) => a + c, 0) / b.changes.length,
    total: b.changes.length, up: b.up, flat: b.flat, down: b.down,
  }));
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region") === "US" ? "US" : "KR";
  const sectors = region === "US" ? await usSectors() : await getSectorPerformance();
  return NextResponse.json({ region, sectors });
}
