# 🐋 WhalesMarket

Bloomberg-style terminal for **US and Korean equities** — live quotes, real analyst consensus estimates, fundamentals, news, and Claude-powered AI forecasts. Built with Next.js 14 (App Router), Supabase auth + Postgres, Yahoo Finance data, and the Anthropic API. Deploys on Vercel.

## Architecture

```
Browser ── Supabase JS ──► Supabase (auth + watchlist table, RLS)
   │
   ├──► /api/quote     (server) ──► Yahoo Finance  (quotes, estimates, chart, news — free, no key)
   └──► /api/forecast  (server) ──► Anthropic API  (key stays server-side)
```

Korean stocks work via Yahoo's `.KS` (KOSPI) / `.KQ` (KOSDAQ) suffixes. You can type `005930`, `삼성전자`, or `카카오` — the API resolves it.

## Setup

### 1. Supabase
1. Create a project at supabase.com.
2. SQL Editor → paste and run `supabase/schema.sql` (creates `watchlist` with RLS).
3. Authentication → Providers → Email: enabled by default. For a smoother demo, turn **off** "Confirm email" (Authentication → Sign In / Up), or keep it on for production.
4. Project Settings → API: copy the **Project URL** and **anon public key**.

### 2. Environment variables
Copy `.env.example` → `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6   # optional; change if needed
```

Get an Anthropic key at console.anthropic.com. It is only read in `/api/forecast` (server-side) — never expose it with a `NEXT_PUBLIC_` prefix.

### 3. Run locally
```bash
npm install
npm run dev
```

### 4. Deploy to Vercel
1. Push to GitHub, import the repo in Vercel (framework auto-detected: Next.js).
2. Add the four env vars in Vercel → Project → Settings → Environment Variables.
3. Deploy. API routes run as serverless functions; `yahoo-finance2` works on the Node runtime out of the box.

## Notes & limits
- **Yahoo data**: free and unofficial; quotes can be delayed (esp. KRX ~20 min) and the API can occasionally rate-limit — the route has a 60s in-memory cache. For production-grade data later, swap `/api/quote` internals for KIS OpenAPI (한국투자증권, real-time KRX) or Finnhub/Polygon (US) without touching the UI.
- **Forecast cost**: each forecast is one Claude call, cached 10 min per symbol server-side. Consider adding per-user rate limiting (e.g., Vercel KV) before opening signups widely.
- **Disclaimer**: AI outputs are scenario analysis, not investment advice. Keep the footer disclaimer if you publish — sensible for a public finance tool.

## Roadmap ideas
- Realtime watchlist quotes via polling or websockets
- Portfolio tab (buy price, P&L) — one more Supabase table
- Earnings calendar view across the watchlist
- Korean-language toggle (ko/en) for UI labels

## v1.1 features

**Realtime quotes.** `lib/format.js` exports `useRealtimeQuotes`, which polls `/api/quotes-batch` for every symbol in your watchlist *and* portfolio in one request. It runs every 15s while any tracked market is open (PRE/REGULAR/POST), slows to 60s when all closed, drops to 2 min when the browser tab is hidden, and price ticks flash green/red in the sidebar. The `● LIVE / ○ PAUSED` toggle in the header persists per user. Polling was chosen over websockets deliberately: Vercel serverless functions can't hold socket connections open, and Yahoo has no public WS feed — if you later buy real-time data (e.g. KIS OpenAPI supports websockets for KRX), swap the hook's internals.

**Portfolio tab.** Backed by the new `positions` table (see `supabase/schema.sql` — re-run it, it's idempotent). Add positions with market, symbol, share count, average cost, and optional trade date. The tab computes market value, cost basis, unrealized P&L (absolute and %), day P&L from live quotes, and portfolio weight with mini allocation bars. USD and KRW positions are grouped into separate tables with their own totals — no fake FX conversion.

**Earnings calendar.** The Calendar tab hits `/api/calendar`, which aggregates `calendarEvents` + `earningsTrend` + `earningsHistory` for the whole watchlist and returns one sorted timeline: date with weekday and D-day countdown (highlighted inside 7 days), consensus EPS with range, consensus revenue, analyst count, ex-dividend date, and each stock's last-4-quarter beat/miss badges. Unconfirmed dates are marked "est." — Yahoo returns a range until the company confirms.

**Korean UI (한국어).** `lib/i18n.js` holds a full en/ko dictionary. The 🇰🇷/🇺🇸 toggle appears on both the auth screen and the header; the choice is saved to the new `preferences` table so it follows the user across devices. Financial terms use Korean market conventions (PER/PBR, 목표주가, 평가손익, 공매도 비중), while universal abbreviations (EPS, ROE, FCF) stay in English as Korean practitioners use them.

### Migration from v1.0
Just re-run `supabase/schema.sql` in the SQL editor — it now also creates `positions` and `preferences`, and all statements are safe to re-run.
