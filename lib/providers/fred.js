// FRED (Federal Reserve Economic Data) — the only free source for a macro
// economic calendar (Finnhub's is paid-tier, Twelve Data has none, Trading
// Economics' free guest access is discontinued). US-only, and unlike the
// existing earnings calendar there's no analyst consensus here — just
// actual released values and known release dates.
// Free signup, no card: https://fred.stlouisfed.org/docs/api/api_key.html
//
// NOTE: built without a live key to test against — the release_id/series_id
// pairs below are FRED's documented, stable IDs for these major releases,
// but should be spot-checked against https://fred.stlouisfed.org/releases/calendar
// once a real FRED_API_KEY exists (see the plan's Verification step).
const BASE = "https://api.stlouisfed.org/fred";

export function fredConfigured() {
  return Boolean(process.env.FRED_API_KEY);
}

const RELEASES = [
  { name: "Consumer Price Index (CPI)", releaseId: 10, seriesId: "CPIAUCSL" },
  { name: "Employment Situation (Nonfarm Payrolls)", releaseId: 50, seriesId: "PAYEMS" },
  { name: "Gross Domestic Product (GDP)", releaseId: 53, seriesId: "GDP" },
  { name: "Producer Price Index (PPI)", releaseId: 46, seriesId: "PPIACO" },
  { name: "Personal Income & Outlays (PCE Price Index)", releaseId: 54, seriesId: "PCEPI" },
  { name: "Retail Sales", releaseId: 13, seriesId: "RSAFS" },
  { name: "Housing Starts", releaseId: 17, seriesId: "HOUST" },
  { name: "Initial Jobless Claims", releaseId: 15, seriesId: "ICSA" },
];

async function fred(path, params) {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("api_key", process.env.FRED_API_KEY);
  url.searchParams.set("file_type", "json");

  const res = await fetch(url);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`FRED ${path} returned non-JSON: ${text.slice(0, 120)}`);
  }
  if (data.error_message) throw new Error(`FRED ${path}: ${data.error_message}`);
  return data;
}

const cache = new Map();
const TTL = 12 * 60 * 60 * 1000; // macro releases are infrequent

async function releaseEvents(release, windowStart, windowEnd) {
  const key = `${release.releaseId}:${windowStart}:${windowEnd}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL) return hit.d;

  const dateData = await fred("/release/dates", {
    release_id: release.releaseId,
    realtime_start: windowStart,
    realtime_end: windowEnd,
    include_release_dates_with_no_data: "true",
  });
  const dates = (dateData.release_dates || [])
    .map((d) => d.date)
    .filter((d) => d >= windowStart && d <= windowEnd)
    .sort();

  const today = new Date().toISOString().slice(0, 10);
  const latestPastDate = dates.filter((d) => d <= today).slice(-1)[0];

  // Only the single most recent past release gets an actual value attached
  // (one extra call per release, not per-date) — pairing every historical
  // date to its own point-in-time value needs FRED's vintage/real-time
  // querying, which wasn't verifiable without a live key; this is the
  // simpler, safer claim: "here's the latest known reading."
  let latestValue = null;
  if (latestPastDate) {
    try {
      const obs = await fred("/series/observations", {
        series_id: release.seriesId,
        sort_order: "desc",
        limit: "1",
      });
      const v = obs.observations?.[0]?.value;
      latestValue = v && v !== "." ? parseFloat(v) : null;
    } catch (e) {
      console.warn(`[fred] ${release.name} observation fetch failed: ${e.message}`);
    }
  }

  const events = dates.map((date) => ({
    name: release.name,
    date,
    upcoming: date > today,
    actual: date === latestPastDate ? latestValue : null,
  }));

  cache.set(key, { t: Date.now(), d: events });
  return events;
}

export async function getEconomicCalendar() {
  const today = new Date();
  const start = new Date(today.getTime() - 1000 * 60 * 60 * 24 * 90);
  const end = new Date(today.getTime() + 1000 * 60 * 60 * 24 * 90);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const results = await Promise.all(
    RELEASES.map((r) =>
      releaseEvents(r, fmt(start), fmt(end)).catch((e) => {
        console.warn(`[fred] ${r.name} failed: ${e.message}`);
        return [];
      })
    )
  );

  return results.flat().sort((a, b) => new Date(a.date) - new Date(b.date));
}
