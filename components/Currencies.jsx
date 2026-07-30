"use client";
import { useState, useEffect, useCallback } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { C, Label, Val, btn, Panel } from "./ui";
import { px, pctStr } from "../lib/format";

const PAIRS = ["USD/KRW", "EUR/USD", "USD/JPY", "GBP/USD", "USD/CNY", "AUD/USD"];
const RANGES = ["1D", "5D", "1M", "6M", "YTD", "1Y", "5Y"];

export default function Currencies({ t }) {
  const [pair, setPair] = useState("USD/KRW");
  const [quote, setQuote] = useState(null);
  const [quoteErr, setQuoteErr] = useState(null);
  const [range, setRange] = useState("6M");
  const [closes, setCloses] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);

  const loadQuote = useCallback(async (p) => {
    try {
      const r = await fetch(`/api/quote?q=${encodeURIComponent(p)}&market=FX`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "quote failed");
      setQuote(d);
      setQuoteErr(null);
    } catch (e) {
      setQuoteErr(String(e.message || e));
    }
  }, []);

  const loadChart = useCallback(async (p, r) => {
    setChartLoading(true);
    try {
      const res = await fetch(`/api/chart?q=${encodeURIComponent(p)}&market=FX&range=${r}`);
      const d = await res.json();
      setCloses(d.closes || []);
    } catch (_) {
      // keep whatever was already showing
    }
    setChartLoading(false);
  }, []);

  useEffect(() => {
    setQuote(null); setQuoteErr(null); setRange("6M");
    loadQuote(pair);
    loadChart(pair, "6M");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair]);

  useEffect(() => { loadChart(pair, range); }, [range, pair, loadChart]);

  // Simple live-ish polling — FX trades ~24/5, separate from the
  // watchlist/portfolio poller since this is a tiny curated list, not the
  // shared allSymbols batch.
  useEffect(() => {
    let id = setInterval(() => loadQuote(pair), 20000);
    const onVis = () => {
      clearInterval(id);
      if (!document.hidden) id = setInterval(() => loadQuote(pair), 20000);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [pair, loadQuote]);

  const price = quote?.price;
  const change = quote?.change;
  const changePct = quote?.changePct;
  const up = (change ?? 0) >= 0;
  const pxColor = up ? C.green : C.red;
  const isIntraday = range === "1D" || range === "5D";

  const chart = closes.map((c) => ({
    d: isIntraday ? new Date(c.d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                  : new Date(c.d).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    px: c.c,
  }));

  return (
    <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
      <div style={{ width: 180, borderRight: `1px solid ${C.border}`, background: "#050400", overflow: "auto" }}>
        <div style={{ padding: "4px 8px" }}><Label>{t("currencyPairs")}</Label></div>
        {PAIRS.map((p) => {
          const isSel = p === pair;
          return (
            <div key={p} onClick={() => setPair(p)}
              style={{
                padding: "8px 10px", cursor: "pointer", fontSize: 12,
                color: isSel ? C.amber : C.white,
                background: isSel ? "#1A1204" : "transparent",
                borderLeft: `3px solid ${isSel ? "var(--amber)" : "transparent"}`,
                borderBottom: "1px solid #100C06",
              }}>
              {p}
            </div>
          );
        })}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {quoteErr && <div style={{ padding: "3px 10px", color: C.red, fontSize: 11 }}>{quoteErr}</div>}
        {quote && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, alignItems: "baseline" }}>
            <span style={{ color: C.amber, fontSize: 14, fontWeight: 700 }}>
              {quote.symbol} <span style={{ color: C.white, fontWeight: 400 }}>{quote.name}</span>
            </span>
            <span style={{ fontSize: 24, color: pxColor, fontWeight: 700 }}>{px(price, quote.currency)}</span>
            <span style={{ color: pxColor, fontSize: 13 }}>
              {up ? "▲" : "▼"} {typeof change === "number" ? Math.abs(change).toFixed(4) : "—"} ({pctStr(Math.abs(changePct ?? 0), 2)})
            </span>
            {quote.marketState && (
              <span style={{ border: `1px solid ${C.green}`, color: C.green, fontSize: 9, padding: "1px 5px" }}>{quote.marketState}</span>
            )}
            <span><Label>{t("day")} </Label><Val>{px(quote.dayLow, quote.currency)}–{px(quote.dayHigh, quote.currency)}</Val></span>
          </div>
        )}

        <div style={{ flex: 1, padding: 6, minHeight: 0, overflow: "auto" }}>
          <Panel title={t("pnlChart")} style={{ minHeight: 260 }}
            right={
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                {chartLoading && <span style={{ color: C.dim, fontSize: 9 }}>···</span>}
                {RANGES.map((r) => (
                  <button key={r} onClick={() => setRange(r)} style={{ ...btn(range === r), padding: "2px 7px", fontSize: 9 }}>{r}</button>
                ))}
              </div>
            }>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={chart}>
                <CartesianGrid stroke="#181206" vertical={false} />
                <XAxis dataKey="d" tick={{ fill: C.dim, fontSize: 9 }} axisLine={{ stroke: C.border }} minTickGap={40} />
                <YAxis domain={["auto", "auto"]} tick={{ fill: C.dim, fontSize: 9 }} axisLine={{ stroke: C.border }}
                  width={70} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip
                  contentStyle={{ background: "#0D0800", border: "1px solid var(--amber-dim)", fontSize: 11 }}
                  labelStyle={{ color: C.dim }} itemStyle={{ color: C.amber }}
                  formatter={(v) => [px(v, quote?.currency), "Rate"]} />
                <Area type="monotone" dataKey="px" stroke="none" fill={up ? C.green : C.red} fillOpacity={0.07} />
                <Line type="monotone" dataKey="px" stroke={C.amber} dot={false} strokeWidth={1.6} />
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>
    </div>
  );
}
