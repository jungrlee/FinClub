// Provider router. Routes are thin: they call these functions and never
// know which upstream answered. `source` on the payload tells the UI.
//
//   US  → Finnhub (requires FINNHUB_API_KEY)
//   KR  → KIS OpenAPI if configured, else Yahoo fallback
import { resolveUS, getUSQuote, getUSBatch, getUSCalendar } from "./finnhub";
import { kisConfigured, isKrCode, getKRQuote, getKRBatch } from "./kis";
import { resolveKRYahoo, nameToCode, getKRQuoteYahoo, getKRBatchYahoo } from "./yahooKR";

export async function resolve(q, market) {
  if (market === "KR") {
    if (kisConfigured()) {
      // KIS speaks 6-digit codes only; resolve names via Yahoo search.
      if (isKrCode(q)) return q.trim();
      try {
        return await nameToCode(q);
      } catch (e) {
        throw new Error(
          `Could not map "${q}" to a KRX code. Try the 6-digit code (e.g. 005930). Cause: ${e.message}`
        );
      }
    }
    return resolveKRYahoo(q);
  }
  return resolveUS(q);
}

export async function getQuote(symbol, market) {
  if (market === "KR") {
    if (kisConfigured()) {
      try {
        return await getKRQuote(symbol);
      } catch (e) {
        console.warn(`[router] KIS failed for ${symbol}, falling back to Yahoo: ${e.message}`);
        const ySym = /^\d{6}$/.test(symbol) ? await resolveKRYahoo(symbol) : symbol;
        return getKRQuoteYahoo(ySym);
      }
    }
    return getKRQuoteYahoo(symbol);
  }
  return getUSQuote(symbol);
}

export async function getBatch(symbols) {
  // Korean symbols are either 6-digit codes (KIS) or *.KS/*.KQ (Yahoo).
  const kr = symbols.filter((s) => /^\d{6}$/.test(s) || /\.(KS|KQ)$/.test(s));
  const us = symbols.filter((s) => !kr.includes(s));

  const [usQ, krQ] = await Promise.all([
    us.length ? getUSBatch(us).catch((e) => { console.warn(`[batch US] ${e.message}`); return {}; }) : {},
    kr.length
      ? (kisConfigured() && kr.every((s) => /^\d{6}$/.test(s))
          ? getKRBatch(kr)
          : getKRBatchYahoo(kr)
        ).catch((e) => { console.warn(`[batch KR] ${e.message}`); return {}; })
      : {},
  ]);
  return { ...usQ, ...krQ };
}

export async function getCalendar(symbol, market) {
  if (market === "KR" || /^\d{6}$/.test(symbol) || /\.(KS|KQ)$/.test(symbol)) {
    // Korean earnings dates are not exposed by KIS; try Yahoo, tolerate failure.
    try {
      const ySym = /^\d{6}$/.test(symbol) ? await resolveKRYahoo(symbol) : symbol;
      const d = await getKRQuoteYahoo(ySym);
      return {
        symbol, name: d.name, currency: d.currency, price: d.price, changePct: d.changePct,
        date: d.nextEarnings, dateEstimated: false, hour: null,
        consensusEPS: d.consensusEPS, consensusEPSLow: d.consensusEPSLow,
        consensusEPSHigh: d.consensusEPSHigh, consensusRev: d.consensusRev,
        analysts: d.numberOfAnalysts, exDividend: null, history: [],
      };
    } catch (e) {
      console.warn(`[calendar KR] ${symbol}: ${e.message}`);
      return { symbol, error: true };
    }
  }
  return getUSCalendar(symbol);
}

export function providerStatus() {
  return {
    us: process.env.FINNHUB_API_KEY ? "finnhub" : "unconfigured",
    kr: kisConfigured() ? "kis" : "yahoo-fallback",
  };
}
