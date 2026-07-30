// GET /api/calendar/economic -> { events: [{name, date, upcoming, actual}], configured }
// US macro events (CPI, jobs, GDP, etc.) via FRED — past + upcoming release
// dates, no analyst consensus (unlike the per-stock earnings calendar).
import { NextResponse } from "next/server";
import { fredConfigured, getEconomicCalendar } from "../../../../lib/providers/fred";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!fredConfigured()) {
    return NextResponse.json({ events: [], configured: false });
  }
  try {
    const events = await getEconomicCalendar();
    return NextResponse.json({ events, configured: true });
  } catch (e) {
    return NextResponse.json({ events: [], configured: true, error: e?.message ?? String(e) }, { status: 502 });
  }
}
