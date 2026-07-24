// POST /api/forecast  { stock: <object from /api/quote> }
// Runs the Claude forecast server-side so ANTHROPIC_API_KEY never reaches the browser.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const cache = new Map();
const TTL = 10 * 60 * 1000; // forecasts cached 10 min per symbol

export async function POST(req) {
  const { stock } = await req.json();
  if (!stock || !stock.symbol)
    return NextResponse.json({ error: "missing stock" }, { status: 400 });

  const hit = cache.get(stock.symbol);
  if (hit && Date.now() - hit.t < TTL) return NextResponse.json(hit.d);

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key)
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not set on server" },
      { status: 500 }
    );

  const cur = stock.currency === "KRW" ? "KRW" : "USD";
  const prompt = `You are a rigorous sell-side equity analyst. Data for ${stock.name} (${stock.symbol}, ${stock.exchange}):
price ${stock.price} ${cur}, day ${stock.changePct?.toFixed(2)}%, 52wk ${stock.week52Low}-${stock.week52High},
P/E ${stock.per}, fwd P/E ${stock.forwardPE}, P/B ${stock.pbr}, beta ${stock.beta},
revenue growth ${stock.revenueGrowthPct?.toFixed(1)}% yoy, operating margin ${stock.operMarginPct?.toFixed(1)}%, ROE ${stock.roePct?.toFixed(1)}%,
analyst mean target ${stock.targetMean} (${stock.numberOfAnalysts} analysts, key: ${stock.recommendationKey}),
next-quarter consensus EPS ${stock.consensusEPS}, next earnings ${stock.nextEarnings},
short % of float ${stock.shortPctFloat}.

Give a probabilistic 1-month outlook. Respond with ONLY raw JSON, no markdown:
{
 "direction": "UP"|"DOWN"|"NEUTRAL",
 "probUp": <0-100>, "probDown": <0-100>, "probFlat": <0-100>,
 "conviction": "LOW"|"MODERATE"|"HIGH",
 "targetLow": <bear 1mo price>, "targetBase": <base>, "targetHigh": <bull>,
 "bull": ["<point ≤70 chars>","",""],
 "bear": ["<point ≤70 chars>","",""],
 "risks": ["<key risk ≤70 chars>",""],
 "summary": "<3-4 sentences, honest about uncertainty, mention valuation vs growth>"
}
Probabilities must sum to 100. Be analytical and balanced, never promotional.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .replace(/```json|```/g, "");
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    const parsed = JSON.parse(text.slice(a, b + 1));
    cache.set(stock.symbol, { t: Date.now(), d: parsed });
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("forecast error:", e.message);
    return NextResponse.json({ error: "forecast failed" }, { status: 502 });
  }
}
