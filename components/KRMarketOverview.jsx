"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Treemap,
} from "recharts";
import { C, Label, Val, btn, Panel } from "./ui";
import { px, pctStr, bigNum } from "../lib/format";

// This tab intentionally breaks from the rest of FinClub's green=up/red=down
// palette: red=up/blue=down is the convention Korean market data (Naver
// Finance, KRX) is always shown in, and matches the spec this tab was built
// from. Portfolio/Competition/US quotes elsewhere are unaffected.
const KR_UP = "#ff3b3b";
const KR_DOWN = "#3b82f6";
const KR_FLAT = C.dim;

const RANGES = ["1W", "1M", "3M", "6M", "YTD", "1Y"];
const RANGE_DAYS = { "1W": 5, "1M": 22, "3M": 65, "6M": 130, "1Y": 300 };

function sliceRange(chart, range) {
  if (!chart?.length) return [];
  if (range === "YTD") {
    const jan1 = `${new Date().getFullYear()}-01-01`;
    const idx = chart.findIndex((c) => c.date >= jan1);
    return idx === -1 ? chart : chart.slice(idx);
  }
  const n = RANGE_DAYS[range] || chart.length;
  return chart.slice(-n);
}

function lerpChannel(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function mixHex(hex1, hex2, t) {
  const c1 = parseInt(hex1.slice(1), 16);
  const c2 = parseInt(hex2.slice(1), 16);
  const r = lerpChannel((c1 >> 16) & 255, (c2 >> 16) & 255, t);
  const g = lerpChannel((c1 >> 8) & 255, (c2 >> 8) & 255, t);
  const b = lerpChannel(c1 & 255, c2 & 255, t);
  return `rgb(${r},${g},${b})`;
}
const HEAT_NEUTRAL = "#4a4a48";
// Diverging scale around 0% — neutral gray midpoint, two hues (red/blue),
// saturating at +/-5% daily move (a large but not rare single-day swing).
function divergingColor(pct) {
  if (typeof pct !== "number") return HEAT_NEUTRAL;
  const clamped = Math.max(-5, Math.min(5, pct));
  const t = Math.abs(clamped) / 5;
  return mixHex(HEAT_NEUTRAL, clamped >= 0 ? KR_UP : KR_DOWN, t);
}

function HeatmapCell(props) {
  const { x, y, width, height, name, changePct, depth } = props;
  // Treemap renders its own synthetic root wrapper node (the whole chart
  // area, depth 0) through this same content renderer before any of the
  // actual data leaves — it has no name/changePct of its own, so it must
  // be skipped rather than drawn as a giant "N/A" tile.
  if (depth === 0) return null;
  const hasPct = typeof changePct === "number";
  const fill = divergingColor(hasPct ? changePct : null);
  const showLabel = width > 38 && height > 24;
  const showPct = showLabel && hasPct && height > 40;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill, stroke: "#0a0a08", strokeWidth: 2 }} />
      {showLabel && (
        <text x={x + width / 2} y={y + height / 2 - (showPct ? 5 : 0)} textAnchor="middle"
          fill="#fff" fontSize={Math.min(11, width / 6)} fontWeight={600}>
          {name}
        </text>
      )}
      {showPct && (
        <text x={x + width / 2} y={y + height / 2 + 11} textAnchor="middle" fill="#fff" fontSize={9} opacity={0.85}>
          {changePct >= 0 ? "+" : ""}{changePct.toFixed(1)}%
        </text>
      )}
    </g>
  );
}

function SectorBar({ name, pct, maxAbs }) {
  const width = maxAbs > 0 ? (Math.abs(pct) / maxAbs) * 100 : 0;
  const color = pct >= 0 ? KR_UP : KR_DOWN;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
        <span style={{ color: C.white }}>{name}</span>
        <Val color={color} size={10}>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</Val>
      </div>
      <div style={{ background: "#141008", height: 6, marginTop: 2 }}>
        <div style={{ width: `${width}%`, height: "100%", background: color, transition: "width .6s" }} />
      </div>
    </div>
  );
}

function IndexCard({ idx, data, active, onClick, t }) {
  const q = data?.index;
  const up = q?.up;
  const color = up ? KR_UP : KR_DOWN;
  return (
    <div onClick={onClick} style={{
      flex: 1, cursor: "pointer", padding: "10px 14px", background: active ? "#1A1204" : C.panel,
      border: `1px solid ${active ? "var(--amber)" : C.border}`, minWidth: 160,
    }}>
      <Label>{idx}</Label>
      {q ? (
        <>
          <div style={{ fontSize: 22, color, fontWeight: 700, marginTop: 2 }}>{q.price?.toLocaleString() ?? "—"}</div>
          <div style={{ color, fontSize: 12 }}>
            {up ? "▲" : "▼"} {Math.abs(q.change ?? 0).toLocaleString()} ({pctStr(Math.abs(q.changePct ?? 0), 2)})
          </div>
        </>
      ) : <div style={{ color: C.dim, fontSize: 11, marginTop: 4 }}>—</div>}
    </div>
  );
}

export default function KRMarketOverview({ t }) {
  const [overview, setOverview] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState("KOSPI");
  const [range, setRange] = useState("6M");

  const loadOverview = useCallback(async () => {
    try {
      const r = await fetch("/api/market/overview");
      const d = await r.json();
      setOverview(d);
    } catch (_) { /* keep whatever was already showing */ }
  }, []);

  const loadSectors = useCallback(async () => {
    try {
      const r = await fetch("/api/market/sectors");
      const d = await r.json();
      setSectors(d.sectors || []);
    } catch (_) {}
  }, []);

  const loadRanking = useCallback(async (idx) => {
    try {
      const r = await fetch(`/api/market/ranking?index=${idx}&count=100`);
      const d = await r.json();
      setRanking(d.stocks || []);
    } catch (_) {}
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadOverview(), loadSectors(), loadRanking(activeIndex)]);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadRanking(activeIndex); }, [activeIndex, loadRanking]);

  // 60s poll, matching the provider's own cache TTL — no benefit to polling
  // faster since the server would just return the same cached response.
  useEffect(() => {
    let id = setInterval(() => { loadOverview(); loadRanking(activeIndex); loadSectors(); }, 60000);
    const onVis = () => {
      clearInterval(id);
      if (!document.hidden) id = setInterval(() => { loadOverview(); loadRanking(activeIndex); loadSectors(); }, 60000);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [activeIndex, loadOverview, loadRanking, loadSectors]);

  const active = overview?.[activeIndex];
  const chartData = useMemo(() => {
    const sliced = sliceRange(active?.chart, range);
    return sliced.map((c) => ({
      d: new Date(c.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      close: c.close,
    }));
  }, [active, range]);

  const breadth = active?.pulse?.breadth;
  const breadthPie = breadth ? [
    { name: t("advancing"), value: breadth.up || 0, color: KR_UP },
    { name: t("unchanged"), value: breadth.flat || 0, color: KR_FLAT },
    { name: t("declining"), value: breadth.down || 0, color: KR_DOWN },
  ] : [];

  const flows = active?.pulse?.investorFlows;
  const flowBlocks = flows ? [
    { label: t("retail"), eok: flows.retailEok },
    { label: t("foreign"), eok: flows.foreignEok },
    { label: t("institutional"), eok: flows.institutionalEok },
  ] : [];

  const sortedSectors = useMemo(
    () => [...sectors].filter((s) => typeof s.changePct === "number").sort((a, b) => b.changePct - a.changePct),
    [sectors]
  );
  const topGainers = sortedSectors.slice(0, 5);
  const worstDecliners = sortedSectors.slice(-5).reverse();
  const sectorMaxAbs = Math.max(1, ...[...topGainers, ...worstDecliners].map((s) => Math.abs(s.changePct)));

  const top10 = ranking.slice(0, 10);
  const heatmapData = ranking
    .filter((s) => s.marketCapKrw)
    .slice(0, 80)
    .map((s) => ({ name: s.symbol, displayName: s.name, size: s.marketCapKrw, changePct: s.changePct ?? 0 }));

  if (loading) {
    return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.dim, fontSize: 12 }}>{t("loadingMarket")}</div>;
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
      {/* index cards */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {["KOSPI", "KOSDAQ"].map((idx) => (
          <IndexCard key={idx} idx={idx} data={overview?.[idx]} active={activeIndex === idx}
            onClick={() => setActiveIndex(idx)} t={t} />
        ))}
      </div>

      {/* index chart */}
      <Panel title={`${activeIndex} — ${t("pnlChart")}`} style={{ minHeight: 260, marginBottom: 8 }}
        right={
          <div style={{ display: "flex", gap: 3 }}>
            {RANGES.map((r) => (
              <button key={r} onClick={() => setRange(r)} style={{ ...btn(range === r), padding: "2px 7px", fontSize: 9 }}>{r}</button>
            ))}
          </div>
        }>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={chartData}>
            <CartesianGrid stroke="#181206" vertical={false} />
            <XAxis dataKey="d" tick={{ fill: C.dim, fontSize: 9 }} axisLine={{ stroke: C.border }} minTickGap={40} />
            <YAxis domain={["auto", "auto"]} tick={{ fill: C.dim, fontSize: 9 }} axisLine={{ stroke: C.border }}
              width={60} tickFormatter={(v) => v.toLocaleString()} />
            <Tooltip contentStyle={{ background: "#0D0800", border: "1px solid var(--amber-dim)", fontSize: 11 }}
              labelStyle={{ color: C.dim }} itemStyle={{ color: C.amber }}
              formatter={(v) => [v.toLocaleString(), activeIndex]} />
            <Area type="monotone" dataKey="close" stroke="none" fill={C.amber} fillOpacity={0.07} />
            <Line type="monotone" dataKey="close" stroke={C.amber} dot={false} strokeWidth={1.6} />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ color: C.dim, fontSize: 9, marginTop: 4 }}>{t("krChartNote")}</div>
      </Panel>

      {/* market pulse + sectors */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <Panel title={`${activeIndex} — ${t("marketPulseTitle")}`}>
          {breadth && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <ResponsiveContainer width={90} height={90}>
                <PieChart>
                  <Pie data={breadthPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={22} outerRadius={40} paddingAngle={1} stroke="none">
                    {breadthPie.map((it, i) => <Cell key={i} fill={it.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#0D0800", border: "1px solid var(--amber-dim)", fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "grid", gap: 3 }}>
                {breadthPie.map((it) => (
                  <div key={it.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color, display: "inline-block" }} />
                    <span style={{ color: C.white }}>{it.name}</span>
                    <span style={{ color: C.dim }}>{it.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div style={{ marginBottom: 8 }}>
            <Label>{t("tradingValueLabel")}</Label>
            <div style={{ color: C.amber, fontSize: 14 }}>{bigNum(active?.pulse?.tradingValueKrw, "KRW")}</div>
          </div>
          <Label>{t("investorFlowsTitle")}</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginTop: 4 }}>
            {flowBlocks.map((f) => {
              const color = (f.eok ?? 0) >= 0 ? KR_UP : KR_DOWN;
              return (
                <div key={f.label} style={{ textAlign: "center" }}>
                  <div style={{ color: C.dim, fontSize: 9 }}>{f.label}</div>
                  <div style={{ color, fontSize: 11 }}>
                    {typeof f.eok === "number" ? bigNum(f.eok * 1e8, "KRW") : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title={t("sectorPerfTitle")}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <Label>{t("topGainers")}</Label>
              <div style={{ marginTop: 6 }}>
                {topGainers.map((s) => <SectorBar key={s.name} name={s.name} pct={s.changePct} maxAbs={sectorMaxAbs} />)}
              </div>
            </div>
            <div>
              <Label>{t("worstDecliners")}</Label>
              <div style={{ marginTop: 6 }}>
                {worstDecliners.map((s) => <SectorBar key={s.name} name={s.name} pct={s.changePct} maxAbs={sectorMaxAbs} />)}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* top 10 */}
      <Panel title={`${activeIndex} — ${t("topByMarketCapTitle")}`} style={{ marginBottom: 8 }}
        right={
          <div style={{ display: "flex", gap: 3 }}>
            {["KOSPI", "KOSDAQ"].map((idx) => (
              <button key={idx} onClick={() => setActiveIndex(idx)} style={{ ...btn(activeIndex === idx), padding: "2px 7px", fontSize: 9 }}>{idx}</button>
            ))}
          </div>
        }>
        <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 90px 70px 100px", gap: 4, fontSize: 10, color: C.dim, padding: "2px 4px", borderBottom: `1px solid ${C.border}` }}>
          <span>#</span><span>{t("symbol")}</span><span style={{ textAlign: "right" }}>{t("day")}</span>
          <span style={{ textAlign: "right" }}>%</span><span style={{ textAlign: "right" }}>{t("marketCapLabel")}</span>
        </div>
        {top10.map((s, i) => (
          <div key={s.symbol} style={{ display: "grid", gridTemplateColumns: "24px 1fr 90px 70px 100px", gap: 4, fontSize: 11, padding: "4px 4px", borderBottom: "1px solid #100C06" }}>
            <span style={{ color: C.dim }}>{i + 1}</span>
            <span style={{ color: C.white, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
            <span style={{ textAlign: "right", color: C.white }}>{px(s.price, "KRW")}</span>
            <span style={{ textAlign: "right", color: s.up ? KR_UP : KR_DOWN }}>{s.changePct >= 0 ? "+" : ""}{s.changePct?.toFixed(2)}%</span>
            <span style={{ textAlign: "right", color: C.dim }}>{bigNum(s.marketCapKrw, "KRW")}</span>
          </div>
        ))}
      </Panel>

      {/* heatmap */}
      <Panel title={`${activeIndex} — ${t("heatmapTitle")}`} style={{ marginBottom: 8 }}>
        <ResponsiveContainer width="100%" height={420}>
          <Treemap data={heatmapData} dataKey="size" type="flat" stroke="#0a0a08" content={<HeatmapCell />} />
        </ResponsiveContainer>
      </Panel>

      <div style={{ color: C.dim, fontSize: 9, padding: "0 4px 8px" }}>{t("krDataNote")}</div>
    </div>
  );
}
