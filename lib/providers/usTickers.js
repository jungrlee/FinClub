// Curated large-cap US tickers, used as the constituent universe for the
// Market tab's US heatmap/ranking/sector-breadth panels. There's no free
// "rank the whole market by cap" API for US equities anywhere in this
// stack (unlike KR, where Naver's marketValue endpoint does exactly that),
// so this stands in for it — live price/market-cap/sector are fetched per
// symbol (lib/providers/finnhub.js's getUSRanking), this list just decides
// which ~70 symbols are in scope. Not the literal top-N by cap (that shifts
// over time); a broad, sector-spread set of well-known large caps, same
// spirit as krCompanies.js.
export const US_TICKERS = [
  // technology
  "AAPL", "MSFT", "NVDA", "GOOGL", "META", "AVGO", "ORCL", "CRM", "ADBE", "AMD",
  "CSCO", "INTC", "IBM", "QCOM", "TXN", "NOW", "INTU", "AMAT", "MU", "PANW",
  // consumer / retail
  "AMZN", "TSLA", "HD", "MCD", "NKE", "SBUX", "TGT", "LOW", "BKNG", "TJX",
  // financials
  "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP", "SCHW", "BLK",
  // healthcare
  "UNH", "JNJ", "LLY", "ABBV", "MRK", "PFE", "TMO", "ABT", "DHR", "BMY",
  // industrials / energy
  "XOM", "CVX", "CAT", "BA", "HON", "UPS", "GE", "RTX", "UNP", "DE",
  // consumer staples
  "PG", "KO", "PEP", "WMT", "COST", "PM", "MDLZ", "CL",
  // communication / media
  "DIS", "NFLX", "CMCSA", "T", "VZ",
  // materials / real estate / utilities
  "LIN", "SHW", "PLD", "AMT", "NEE", "DUK",
];
