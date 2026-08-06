// Naver Finance — Korean market-wide data (index level, breadth, investor
// flows, trading value, market-cap ranking, sector performance). None of
// this is per-symbol, so it lives outside the KIS/Yahoo quote-provider
// pattern in kis.js/yahooKR.js — it feeds a market overview dashboard, not
// a single stock's quote.
//
// These are Naver's own unofficial mobile/legacy endpoints (no API key,
// no documented contract) — same class of dependency as yahoo-finance2
// elsewhere in this codebase. Every export here soft-fails (returns null/[]
// and logs) rather than throwing, per CLAUDE.md convention, since this is
// a supplementary dashboard, not core trading functionality.
const UA = { "User-Agent": "Mozilla/5.0", Accept: "application/json" };

async function get(url) {
  const res = await fetch(url, { headers: UA });
  const text = await res.text();
  if (!res.ok) throw new Error(`Naver ${url} returned ${res.status}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Naver ${url} returned non-JSON (likely rate-limited or blocked)`);
  }
}


const num = (v) => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isFinite(n) ? n : null;
};

function cached(ttlMs) {
  const store = new Map();
  return async (key, fn) => {
    const hit = store.get(key);
    if (hit && Date.now() - hit.t < ttlMs) return hit.d;
    const d = await fn();
    store.set(key, { t: Date.now(), d });
    return d;
  };
}
const cache60s = cached(60 * 1000);
const cache5min = cached(5 * 60 * 1000);

// ---------------------------------------------------------------- index
export async function getMarketIndex(index) {
  return cache60s(`idx:${index}`, async () => {
    try {
      const d = await get(`https://m.stock.naver.com/api/index/${index}/basic`);
      return {
        index,
        name: d.stockName,
        price: num(d.closePrice),
        change: num(d.compareToPreviousClosePrice),
        changePct: num(d.fluctuationsRatio),
        up: d.compareToPreviousPrice?.code === "2",
        marketStatus: d.marketStatus || null,
      };
    } catch (e) {
      console.warn(`[naverMarket] index ${index}: ${e.message}`);
      return null;
    }
  });
}

// Daily OHLC history — Naver returns most-recent-first; this normalizes to
// ascending (oldest -> newest) since that's what every chart in this app
// expects. EOD granularity only; no working intraday/minute endpoint was
// found for indices (only for individual stocks, via KIS).
//
// This endpoint caps pageSize at 60 (confirmed live — anything above 60
// 400s), so longer ranges are fetched as multiple pages in parallel and
// concatenated. Capped at 6 pages (~360 trading days, over a year) to bound
// how many requests one chart load makes against an unofficial endpoint.
const PAGE_SIZE = 60;
const MAX_PAGES = 6;

export async function getMarketChart(index, days = 260) {
  return cache60s(`chart:${index}:${days}`, async () => {
    try {
      const pages = Math.min(Math.ceil(days / PAGE_SIZE), MAX_PAGES);
      const results = await Promise.all(
        Array.from({ length: pages }, (_, i) =>
          get(`https://m.stock.naver.com/api/index/${index}/price?pageSize=${PAGE_SIZE}&page=${i + 1}`)
        )
      );
      return results
        .flat()
        .map((r) => ({
          date: r.localTradedAt,
          close: num(r.closePrice),
          open: num(r.openPrice),
          high: num(r.highPrice),
          low: num(r.lowPrice),
        }))
        .filter((r) => r.close !== null)
        .reverse();
    } catch (e) {
      console.warn(`[naverMarket] chart ${index}: ${e.message}`);
      return [];
    }
  });
}

// One call covering trading value/volume, investor net flows, and market
// breadth (advance/decline/flat counts) — Naver's "integration" endpoint
// bundles all three, which is why this app fetches it once instead of
// three separate calls.
export async function getMarketPulse(index) {
  return cache60s(`pulse:${index}`, async () => {
    try {
      const d = await get(`https://m.stock.naver.com/api/index/${index}/integration`);
      const info = Object.fromEntries((d.totalInfos || []).map((x) => [x.code, x.value]));
      const breadth = d.upDownStockInfo || {};
      const flows = d.dealTrendInfo || {};
      return {
        index,
        tradingVolume: num(info.accumulatedTradingVolume), // 천주 (thousand shares)
        // accumulatedTradingValue is denominated in 백만원 (millions of KRW).
        tradingValueKrw: num(info.accumulatedTradingValue) != null ? num(info.accumulatedTradingValue) * 1e6 : null,
        high52w: num(info.highPriceOf52Weeks),
        low52w: num(info.lowPriceOf52Weeks),
        breadth: {
          up: num(breadth.riseCount),
          down: num(breadth.fallCount),
          flat: num(breadth.steadyCount),
          upperLimit: num(breadth.upperCount),
          lowerLimit: num(breadth.lowerCount),
        },
        // dealTrendInfo values follow Naver's own investor-trend display
        // convention (억원 — hundreds of millions of KRW); not an explicitly
        // labeled unit in this response, so flagged here rather than assumed
        // silently — matches the magnitude Naver's own site shows for this
        // widget.
        investorFlows: {
          retailEok: num(flows.personalValue),
          foreignEok: num(flows.foreignValue),
          institutionalEok: num(flows.institutionalValue),
        },
      };
    } catch (e) {
      console.warn(`[naverMarket] pulse ${index}: ${e.message}`);
      return null;
    }
  });
}

// ---------------------------------------------------------------- ranking
// Market-cap ranked constituents — serves both the TOP-10 table (first 10)
// and the heatmap (first ~80-100) from a single fetch.
export async function getMarketRanking(index, count = 100) {
  return cache5min(`rank:${index}:${count}`, async () => {
    try {
      const d = await get(`https://m.stock.naver.com/api/stocks/marketValue/${index}?page=1&pageSize=${count}`);
      return (d.stocks || []).map((s) => ({
        symbol: s.itemCode,
        name: s.stockName,
        price: num(s.closePrice),
        changePct: num(s.fluctuationsRatio),
        up: s.compareToPreviousPrice?.code === "2",
        marketCapKrw: num(s.marketValue) != null ? num(s.marketValue) * 1e8 : null, // 억원 -> KRW
        tradingValueKrw: num(s.accumulatedTradingValue) != null ? num(s.accumulatedTradingValue) * 1e6 : null, // 백만원 -> KRW
      }));
    } catch (e) {
      console.warn(`[naverMarket] ranking ${index}: ${e.message}`);
      return [];
    }
  });
}

// ---------------------------------------------------------------- sectors
// finance.naver.com's legacy pages are EUC-KR encoded and HTML-only (no
// JSON API for this data) — this is a small targeted scrape of one fixed
// table, not a general-purpose HTML parser.
export async function getSectorPerformance() {
  return cache5min("sectors", async () => {
    try {
      const res = await fetch("https://finance.naver.com/sise/sise_group.naver?type=upjong", { headers: UA });
      const buf = await res.arrayBuffer();
      const html = new TextDecoder("euc-kr").decode(buf);
      const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
      const out = [];
      for (const row of rows) {
        if (!row.includes("sise_group_detail")) continue;
        const name = row.match(/<a[^>]*>([^<]+)<\/a>/)?.[1]?.trim();
        const pct = row.match(/([\-+]?[0-9.]+)%/)?.[1];
        const nums = [...row.matchAll(/<td[^>]*class="number"[^>]*>\s*([^<]+?)\s*<\/td>/g)].map((m) => num(m[1]));
        if (!name) continue;
        out.push({
          name,
          changePct: pct ? parseFloat(pct) : null,
          total: nums[0] ?? null,
          up: nums[1] ?? null,
          flat: nums[2] ?? null,
          down: nums[3] ?? null,
        });
      }
      return out;
    } catch (e) {
      console.warn(`[naverMarket] sectors: ${e.message}`);
      return [];
    }
  });
}
