## Commands
- npm run dev — start dev server
- npm run build — production build (run before every push)

## Architecture
- Next.js 14 App Router, deployed on Vercel (region icn1)
- Supabase auth + Postgres (watchlist, positions, preferences tables)
- Data: Finnhub (US), KIS OpenAPI (KR) with Yahoo fallback — lib/providers/
- AI forecasts via Anthropic in /api/forecast

## Conventions
- Provider logic stays behind lib/providers/ — routes never call upstreams directly
- Every non-essential upstream call soft-fails and logs rather than throwing