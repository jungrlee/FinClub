// Provider router. Routes are thin: they call these functions and never
// know which upstream answered. `source` on the payload tells the UI.
//
//   US  → Finnhub (requires FINNHUB_API_KEY)
//   KR  → KIS OpenAPI if configured, else Yahoo fallback
import { resolveUS, getUSQuote, getUSBatch, getUSCalendar, searchSymbols } from "./finnhub";
import { kisConfigured, isKrCode, getKRQuote, getKRBatch } from "./kis";
import { resolveKRYahoo, nameToCode, getKRQuoteYahoo, getKRBatchYahoo, searchKRSymbols } from "./yahooKR";
import { getYahooEnrichment } from "./yahooEnrich";
import { twelveDataConfigured, getTwelveDataCandles } from "./twelveData";

// Autocomplete suggestions for a partial ticker/company name — best-effort,
// must never block typing (especially given Yahoo's own rate-limiting).
export async function search(q, market) {
  if (!q || !q.trim()) return [];
  try {
    return market === "KR" ? await searchKRSymbols(q) : await searchSymbols(q);
  } catch (e) {
    console.warn(`[search ${market}] ${e.message}`);
    return [];
  }
}

// Fills null/empty fields on the primary quote (Finnhub for US, KIS for KR)
// with Yahoo's equivalent data — never overwrites a field the primary
// source already answered, so price/name/exchange stay authoritative.
function fillGaps(primary, extra) {
  const isEmpty = (v) => v === null || v === undefined || (Array.isArray(v) && v.length === 0);
  const out = { ...primary };
  for (const [k, v] of Object.entries(extra || {})) {
    if (isEmpty(out[k]) && !isEmpty(v)) out[k] = v;
  }
  return out;
}

// Tried before Yahoo for US charts specifically — Twelve Data's free tier
// (800/day, 8/min) is a much sturdier chart source than Yahoo's unofficial,
// heavily rate-limited endpoint. Best-effort: never blocks the quote.
async function backfillUSCloses(quote) {
  if ((quote.closes || []).length > 0 || !twelveDataConfigured()) return quote;
  try {
    const closes = await getTwelveDataCandles(quote.symbol);
    return closes.length ? { ...quote, closes } : quote;
  } catch (e) {
    console.warn(`[twelvedata] chart backfill failed for ${quote.symbol}: ${e.message}`);
    return quote;
  }
}

// Best-effort enrichment — a Yahoo failure here (e.g. its own rate limit)
// should never break the primary quote, so this always resolves.
async function enrichWithYahoo(quote, yahooSymbol) {
  try {
    const extra = await getYahooEnrichment(yahooSymbol);
    return fillGaps(quote, extra);
  } catch (e) {
    console.warn(`[enrich] Yahoo backfill failed for ${yahooSymbol}: ${e.message}`);
    return quote;
  }
}

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
        const q = await getKRQuote(symbol);
        // KIS's basic quote API has no analyst estimates, targets, margins,
        // or news — Yahoo fills those gaps. Resolving the .KS/.KQ suffix
        // itself depends on Yahoo too, so a failure here just skips
        // enrichment rather than failing the whole quote.
        const ySym = await resolveKRYahoo(symbol).catch(() => null);
        return ySym ? await enrichWithYahoo(q, ySym) : q;
      } catch (e) {
        console.warn(`[router] KIS failed for ${symbol}, falling back to Yahoo: ${e.message}`);
        try {
          const ySym = /^\d{6}$/.test(symbol) ? await resolveKRYahoo(symbol) : symbol;
          return await getKRQuoteYahoo(ySym);
        } catch (e2) {
          // Surface BOTH causes — otherwise a KIS failure gets silently
          // replaced by whatever the Yahoo fallback says, hiding the real
          // problem (e.g. an invalid/expired KIS token) behind an unrelated
          // "Too Many Requests" message.
          throw new Error(`KIS failed (${e.message}); Yahoo fallback also failed (${e2.message})`);
        }
      }
    }
    return getKRQuoteYahoo(symbol); // already Yahoo-sourced end to end, nothing to enrich
  }
  // Finnhub's free tier 403s on price-target/eps-estimate/revenue-estimate/
  // candle. Twelve Data backfills the chart specifically (sturdier than
  // Yahoo for that); Yahoo then fills whatever's still missing (targets,
  // estimates, margins, and the chart too if Twelve Data isn't configured).
  const q0 = await getUSQuote(symbol);
  const q1 = await backfillUSCloses(q0);
  return enrichWithYahoo(q1, symbol);
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
