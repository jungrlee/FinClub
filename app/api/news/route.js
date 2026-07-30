// GET /api/news -> { news: [{t,s,h,u,img,category}, ...] }
// General market headlines, not tied to any one stock.
import { NextResponse } from "next/server";
import { getGeneralNews } from "../../../lib/providers/finnhub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const news = await getGeneralNews();
    return NextResponse.json({ news });
  } catch (e) {
    return NextResponse.json({ news: [], error: e?.message ?? String(e) }, { status: 502 });
  }
}
