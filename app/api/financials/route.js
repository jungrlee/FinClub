// GET /api/financials?q=AAPL&market=US
// -> { incomeStatement, balanceSheet, cashFlow } each {annual:[...], quarterly:[...]}
// Fetched lazily by the UI (only when the Financials sub-tab is opened) to
// avoid spending Twelve Data's shared quota on users who never look at it.
import { NextResponse } from "next/server";
import { resolve, getFinancials } from "../../../lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";
  const market = searchParams.get("market") === "KR" ? "KR" : "US";
  if (!q) return NextResponse.json({ error: "missing q" }, { status: 400 });

  try {
    const symbol = await resolve(q, market);
    const data = await getFinancials(symbol, market);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `Could not load financials for "${q}"`, detail: e?.message ?? String(e) }, { status: 404 });
  }
}
