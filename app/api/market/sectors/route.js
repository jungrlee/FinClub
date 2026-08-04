// GET /api/market/sectors -> [{name, changePct, total, up, flat, down}]
import { NextResponse } from "next/server";
import { getSectorPerformance } from "../../../../lib/providers/naverMarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sectors = await getSectorPerformance();
  return NextResponse.json({ sectors });
}
