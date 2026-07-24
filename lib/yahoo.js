// Single place where yahoo-finance2 is imported and normalized.
// Newer builds of the package ship a nested default export, and some ship
// without `suppressNotices`. Both variations crash at module-load time if you
// import naively, which surfaces later as a generic "could not resolve" error
// on every route. Normalizing here means the routes stay clean.
import yf from "yahoo-finance2";

const yahooFinance = yf?.default ?? yf;

// Optional API in some versions — guard rather than assume.
if (typeof yahooFinance.suppressNotices === "function") {
  yahooFinance.suppressNotices(["yahooSurvey"]);
}

// Fail loudly at import time if the shape is wrong, so the server log shows
// the real problem instead of a 404 from each route.
if (typeof yahooFinance.quote !== "function") {
  throw new Error(
    "yahoo-finance2 did not expose .quote() — unexpected module shape. " +
      "Pin the dependency to 2.13.3 and reinstall."
  );
}

export default yahooFinance;
