// GET /api/search?q=app&market=US -> { results: [{symbol, name}, ...] }
// Autocomplete suggestions, distinct from /api/quote (which resolves to a
// single confirmed symbol). Best-effort — always resolves, never 4xx/5xx,
// so a flaky upstream (esp. Yahoo for KR) never blocks typing.
import { NextResponse } from "next/server";
import { search } from "../../../lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const market = searchParams.get("market") === "KR" ? "KR" : "US";
  const results = await search(q, market);
  return NextResponse.json({ results });
}
