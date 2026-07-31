// Curated sector → representative-ticker mapping for diversification
// suggestions, matching Finnhub's `finnhubIndustry` categories (the
// sector field surfaced in lib/providers/finnhub.js's getUSQuote). Same
// spirit as lib/providers/krCompanies.js — a small static list rather
// than a live "sector universe" API, which isn't free anywhere in this
// stack. Explicitly an idea/starting point, not investment advice.
export const SECTOR_SUGGESTIONS = [
  { sector: "Technology", tickers: ["AAPL", "MSFT"] },
  { sector: "Healthcare", tickers: ["JNJ", "UNH"] },
  { sector: "Financial Services", tickers: ["JPM", "V"] },
  { sector: "Consumer Cyclical", tickers: ["AMZN", "HD"] },
  { sector: "Consumer Defensive", tickers: ["PG", "KO"] },
  { sector: "Energy", tickers: ["XOM", "CVX"] },
  { sector: "Industrials", tickers: ["CAT", "UNP"] },
  { sector: "Basic Materials", tickers: ["LIN", "SHW"] },
  { sector: "Real Estate", tickers: ["PLD", "AMT"] },
  { sector: "Utilities", tickers: ["NEE", "DUK"] },
  { sector: "Communication Services", tickers: ["GOOGL", "META"] },
];

// Finnhub's actual `finnhubIndustry` values are far more granular than the
// 11 broad buckets above (e.g. "Semiconductors", not "Technology" — verified
// live: NVDA came back as "Semiconductors"). Comparing raw industry strings
// against the broad list directly would flag almost everything as "missing"
// even for a genuinely diversified portfolio. This keyword-based normalizer
// maps common granular industries to their broad bucket; it's best-effort,
// not an exhaustive mapping of Finnhub's full taxonomy — an industry that
// isn't recognized just won't count toward any bucket (undercounts rather
// than misclassifies).
const KEYWORD_TO_SECTOR = {
  semiconductor: "Technology", software: "Technology", internet: "Technology",
  technology: "Technology", hardware: "Technology", electronic: "Technology",
  biotechnology: "Healthcare", pharmaceutical: "Healthcare", healthcare: "Healthcare",
  "medical device": "Healthcare", "health care": "Healthcare", medical: "Healthcare",
  bank: "Financial Services", insurance: "Financial Services", "financial services": "Financial Services",
  "capital markets": "Financial Services", "asset management": "Financial Services", financial: "Financial Services",
  retail: "Consumer Cyclical", auto: "Consumer Cyclical", restaurant: "Consumer Cyclical",
  apparel: "Consumer Cyclical", leisure: "Consumer Cyclical", homebuilding: "Consumer Cyclical",
  beverage: "Consumer Defensive", food: "Consumer Defensive", "household product": "Consumer Defensive",
  grocery: "Consumer Defensive", tobacco: "Consumer Defensive",
  "oil & gas": "Energy", oil: "Energy", gas: "Energy", energy: "Energy",
  aerospace: "Industrials", defense: "Industrials", airline: "Industrials",
  industrial: "Industrials", machinery: "Industrials", transportation: "Industrials",
  chemical: "Basic Materials", metal: "Basic Materials", mining: "Basic Materials", steel: "Basic Materials",
  "real estate": "Real Estate", reit: "Real Estate",
  utilit: "Utilities", electric: "Utilities",
  telecom: "Communication Services", media: "Communication Services", entertainment: "Communication Services",
  "communication services": "Communication Services", broadcasting: "Communication Services",
};

function normalizeSector(raw) {
  const lower = raw.toLowerCase();
  for (const [keyword, bucket] of Object.entries(KEYWORD_TO_SECTOR)) {
    if (lower.includes(keyword)) return bucket;
  }
  return null; // unrecognized — doesn't count toward any curated bucket
}

export function missingSectors(heldSectors) {
  const held = new Set(
    (heldSectors || [])
      .filter(Boolean)
      .map(normalizeSector)
      .filter(Boolean)
  );
  return SECTOR_SUGGESTIONS.filter((s) => !held.has(s.sector));
}
