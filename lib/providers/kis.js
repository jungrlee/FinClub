// KIS OpenAPI (한국투자증권) provider — KRX / KOSDAQ.
//
// Setup:
//  1. Open a KIS account, then apply at https://apiportal.koreainvestment.com
//  2. Create an app under "My App" → get APP KEY and APP SECRET
//  3. Set KIS_APP_KEY, KIS_APP_SECRET, and optionally KIS_MOCK=1 for 모의투자
//
// Approval takes a day or two. Until then the KR path falls back to Yahoo
// (see lib/providers/yahooKR.js) — Yahoo still works for KRX from Vercel
// often enough to be a usable stopgap, and it is only hit for Korean symbols.
import { supabase } from "../supabaseClient";

const REAL = "https://openapi.koreainvestment.com:9443";
const MOCK = "https://openapivts.koreainvestment.com:29443";

const base = () => (process.env.KIS_MOCK === "1" ? MOCK : REAL);

export function kisConfigured() {
  return Boolean(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET);
}

// Access tokens are valid 24h, but KIS rate-limits token issuance hard and
// appears to invalidate a previous token when a new one is issued. Caching
// in module scope alone isn't enough on Vercel: every cold serverless
// instance has its own empty cache, so concurrent instances would each
// request their own token and invalidate each other's — causing
// intermittent "invalid token" (EGW00121) failures under real traffic.
//
// So the token lives in a shared `kis_tokens` row (supabase/kis_token_cache.sql)
// that every instance reads/writes, with a short "claim" window so only one
// instance calls KIS at a time; `localCache` is just a same-instance fast
// path to skip the network round trip on back-to-back calls.
let localCache = { token: null, exp: 0 };

async function getToken() {
  if (localCache.token && Date.now() < localCache.exp - 60_000) return localCache.token;

  try {
    const { data: row, error: readErr } = await supabase.from("kis_tokens").select("*").eq("id", 1).maybeSingle();
    if (readErr) {
      // supabase-js resolves query errors instead of throwing them, so a
      // missing table (e.g. supabase/kis_token_cache.sql hasn't been run
      // yet) would otherwise fail silently instead of just falling back.
      throw new Error(readErr.message);
    }
    const rowExp = row?.expires_at ? new Date(row.expires_at).getTime() : 0;
    if (row?.access_token && Date.now() < rowExp - 60_000) {
      localCache = { token: row.access_token, exp: rowExp };
      return row.access_token;
    }

    // Shared token is missing/stale — try to claim the refresh so only one
    // instance actually calls KIS within this window.
    const claimCutoff = new Date(Date.now() - 10_000).toISOString();
    const { data: claimed } = await supabase
      .from("kis_tokens")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", 1)
      .lt("updated_at", claimCutoff)
      .select()
      .maybeSingle();

    if (!claimed) {
      // Another instance just claimed the refresh — wait briefly and reuse
      // whatever it wrote instead of also calling KIS.
      await new Promise((r) => setTimeout(r, 1500));
      const { data: retry } = await supabase.from("kis_tokens").select("*").eq("id", 1).maybeSingle();
      const retryExp = retry?.access_token ? new Date(retry.expires_at).getTime() : 0;
      if (retry?.access_token && Date.now() < retryExp) {
        localCache = { token: retry.access_token, exp: retryExp };
        return retry.access_token;
      }
      // The other instance's refresh doesn't look like it landed — fall
      // through and issue our own as a last resort.
    }
  } catch (e) {
    console.warn(`[kis] shared token cache unavailable, refreshing locally: ${e.message}`);
  }

  const res = await fetch(`${base()}/oauth2/tokenP`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
    }),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`KIS token endpoint returned non-JSON: ${text.slice(0, 120)}`);
  }
  if (!data.access_token) {
    throw new Error(`KIS token failed: ${data.error_description || data.msg1 || text.slice(0, 120)}`);
  }
  const exp = Date.now() + (data.expires_in ? data.expires_in * 1000 : 86_400_000);
  localCache = { token: data.access_token, exp };

  try {
    await supabase
      .from("kis_tokens")
      .update({
        access_token: data.access_token,
        expires_at: new Date(exp).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
  } catch (e) {
    console.warn(`[kis] failed to persist shared token: ${e.message}`);
  }

  return data.access_token;
}

async function kis(path, trId, params) {
  const token = await getToken();
  const url = new URL(base() + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_APP_KEY,
      appsecret: process.env.KIS_APP_SECRET,
      tr_id: trId,
      custtype: "P",
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`KIS ${trId} returned non-JSON: ${text.slice(0, 120)}`);
  }
  if (data.rt_cd && data.rt_cd !== "0") {
    throw new Error(`KIS ${trId} error ${data.msg_cd}: ${data.msg1}`);
  }
  return data;
}

const n = (v) => {
  const x = parseFloat(v);
  return isFinite(x) ? x : null;
};

// KIS works on 6-digit codes only. Names must be resolved elsewhere
// (the route falls back to Yahoo search for name → code).
export function isKrCode(q) {
  return /^\d{6}$/.test(q.trim());
}

export async function getKRQuote(code) {
  // FHKST01010100 = 주식현재가 시세
  const price = await kis(
    "/uapi/domestic-stock/v1/quotations/inquire-price",
    "FHKST01010100",
    { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: code }
  );
  const o = price.output || {};
  if (!n(o.stck_prpr)) throw new Error(`KIS returned no price for ${code}`);

  // FHKST03010100 = 국내주식 기간별 시세 (daily candles)
  const end = new Date();
  const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 150);
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
  let closes = [];
  try {
    const chart = await kis(
      "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
      "FHKST03010100",
      {
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: code,
        FID_INPUT_DATE_1: fmt(start),
        FID_INPUT_DATE_2: fmt(end),
        FID_PERIOD_DIV_CODE: "D",
        FID_ORG_ADJ_PRC: "0",
      }
    );
    closes = (chart.output2 || [])
      .filter((r) => n(r.stck_clpr))
      .map((r) => ({
        d: `${r.stck_bsop_date.slice(0, 4)}-${r.stck_bsop_date.slice(4, 6)}-${r.stck_bsop_date.slice(6, 8)}`,
        c: n(r.stck_clpr),
      }))
      .reverse();
  } catch (e) {
    console.warn(`[kis] chart failed for ${code}: ${e.message}`);
  }

  return {
    symbol: code,
    name: o.hts_kor_isnm || code,
    exchange: o.rprs_mrkt_kor_name || "KRX",
    currency: "KRW",
    market: "KR",
    source: "kis",
    price: n(o.stck_prpr),
    change: n(o.prdy_vrss),
    changePct: n(o.prdy_ctrt),
    prevClose: n(o.stck_sdpr),
    dayLow: n(o.stck_lwpr),
    dayHigh: n(o.stck_hgpr),
    week52Low: n(o.w52_lwpr),
    week52High: n(o.w52_hgpr),
    marketCap: n(o.hts_avls) !== null ? n(o.hts_avls) * 1e8 : null, // 억원 → 원
    volume: n(o.acml_vol),
    avgVolume: null,
    per: n(o.per),
    forwardPE: null,
    pbr: n(o.pbr),
    eps: n(o.eps),
    divYieldPct: null,
    beta: null,
    shortPctFloat: null,
    analystBuy: null,
    analystHold: null,
    analystSell: null,
    recommendationKey: null,
    targetMean: null,
    targetHigh: null,
    targetLow: null,
    numberOfAnalysts: null,
    consensusEPS: null,
    consensusEPSLow: null,
    consensusEPSHigh: null,
    consensusRev: null,
    epsGrowthPct: null,
    nextEarnings: null,
    revenueTTM: null,
    revenueGrowthPct: null,
    grossMarginPct: null,
    operMarginPct: null,
    profitMarginPct: null,
    roePct: null,
    debtToEquity: null,
    freeCashflow: null,
    totalCash: null,
    closes,
    news: [],
  };
}

export async function getKRBatch(codes) {
  const out = {};
  for (const c of codes) {
    try {
      const p = await kis(
        "/uapi/domestic-stock/v1/quotations/inquire-price",
        "FHKST01010100",
        { FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: c }
      );
      const o = p.output || {};
      if (n(o.stck_prpr)) {
        out[c] = {
          symbol: c,
          price: n(o.stck_prpr),
          change: n(o.prdy_vrss),
          changePct: n(o.prdy_ctrt),
          prevClose: n(o.stck_sdpr),
          dayLow: n(o.stck_lwpr),
          dayHigh: n(o.stck_hgpr),
          volume: n(o.acml_vol),
          currency: "KRW",
          marketState: null,
          time: Date.now() / 1000,
        };
      }
    } catch (e) {
      console.warn(`[kis batch] ${c}: ${e.message}`);
    }
  }
  return out;
}
