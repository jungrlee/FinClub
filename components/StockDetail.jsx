"use client";
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid,
} from "recharts";
import { C, Label, Val, btn, Panel, ProbBar } from "./ui";
import { px, bigNum, pctStr, ago } from "../lib/format";

export default function StockDetail({ data, live, pred, predErr, loading, onRefresh, t, lang }) {
  if (loading && !data)
    return <div style={{ padding: 24, color: C.amber }}><span className="blink">█</span> {loading}</div>;
  if (!data)
    return (
      <div style={{ padding: 24, color: C.dim, fontSize: 12, lineHeight: 1.7 }}>
        {t("emptyHint")}<br />
        US: AAPL · NVDA · SPCX &nbsp;|&nbsp; KR: 005930 · 삼성전자 · 카카오
      </div>
    );

  // live quote overrides the snapshot from /api/quote when polling is on
  const price = live?.price ?? data.price;
  const change = live?.change ?? data.change;
  const changePct = live?.changePct ?? data.changePct;
  const up = (change ?? 0) >= 0;
  const pxColor = up ? C.green : C.red;
  const cur = data.currency;
  const locale = lang === "ko" ? "ko-KR" : "en-US";

  const chart = (data.closes || []).map((c) => ({
    d: new Date(c.d).toLocaleDateString(locale, { month: "short", day: "numeric" }),
    px: c.c,
  }));
  const range52 =
    data.week52High && data.week52Low
      ? ((price - data.week52Low) / (data.week52High - data.week52Low)) * 100
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, alignItems: "baseline" }}>
        <span style={{ color: C.amber, fontSize: 14, fontWeight: 700 }}>
          {data.symbol} <span style={{ color: C.white, fontWeight: 400 }}>{data.name}</span>
          <span style={{ color: C.dim, fontSize: 10 }}> · {data.exchange}</span>
        </span>
        <span style={{ fontSize: 24, color: pxColor, fontWeight: 700 }}>{px(price, cur)}</span>
        <span style={{ color: pxColor, fontSize: 13 }}>
          {up ? "▲" : "▼"} {typeof change === "number" ? Math.abs(change).toLocaleString() : "—"} ({pctStr(Math.abs(changePct ?? 0), 2)})
        </span>
        {live?.marketState && (
          <span style={{
            border: `1px solid ${live.marketState === "REGULAR" ? C.green : C.dim}`,
            color: live.marketState === "REGULAR" ? C.green : C.dim,
            fontSize: 9, padding: "1px 5px",
          }}>{live.marketState}</span>
        )}
        <span><Label>{t("day")} </Label><Val>{px(data.dayLow, cur)}–{px(data.dayHigh, cur)}</Val></span>
        <span><Label>{t("mcap")} </Label><Val color={C.cyan}>{bigNum(data.marketCap, cur)}</Val></span>
        <span><Label>{t("vol")} </Label><Val>{typeof (live?.volume ?? data.volume) === "number" ? ((live?.volume ?? data.volume) / 1e6).toFixed(1) + "M" : "—"}</Val></span>
        <button onClick={onRefresh} style={{ ...btn(false), padding: "2px 10px", marginLeft: "auto" }}>{t("refresh")}</button>
      </div>

      <div style={{ flex: 1, display: "grid", gap: 6, padding: 6, minHeight: 0, gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", overflow: "auto", alignContent: "start" }}>
        <Panel title={t("pnlChart")} style={{ gridColumn: "1 / -1", minHeight: 240 }}>
          <ResponsiveContainer width="100%" height={210}>
            <ComposedChart data={chart}>
              <CartesianGrid stroke="#181206" vertical={false} />
              <XAxis dataKey="d" tick={{ fill: C.dim, fontSize: 9 }} axisLine={{ stroke: C.border }} minTickGap={40} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: C.dim, fontSize: 9 }} axisLine={{ stroke: C.border }}
                width={70} tickFormatter={(v) => v.toLocaleString()} />
              <Tooltip
                contentStyle={{ background: "#0D0800", border: `1px solid var(--amber-dim)`, fontSize: 11 }}
                labelStyle={{ color: C.dim }} itemStyle={{ color: C.amber }}
                formatter={(v) => [px(v, cur), "Close"]} />
              {typeof data.targetMean === "number" && (
                <ReferenceLine y={data.targetMean} stroke={C.cyan} strokeDasharray="4 4"
                  label={{ value: "STREET TGT", fill: C.cyan, fontSize: 9, position: "insideTopRight" }} />
              )}
              <ReferenceLine y={price} stroke={pxColor} strokeDasharray="2 3" strokeOpacity={0.6} />
              <Area type="monotone" dataKey="px" stroke="none" fill={up ? C.green : C.red} fillOpacity={0.07} />
              <Line type="monotone" dataKey="px" stroke={C.amber} dot={false} strokeWidth={1.6} />
            </ComposedChart>
          </ResponsiveContainer>
          {range52 !== null && (
            <div style={{ marginTop: 4 }}>
              <Label>{t("pos52")}</Label>
              <div style={{ background: "#141008", height: 6, position: "relative", marginTop: 3 }}>
                <div style={{ position: "absolute", left: `${Math.min(Math.max(range52, 0), 100)}%`, top: -2, width: 2, height: 10, background: C.amber }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                <Val color={C.red} size={10}>{px(data.week52Low, cur)}</Val>
                <Val color={C.dim} size={10}>{range52.toFixed(0)}% {t("ofRange")}</Val>
                <Val color={C.green} size={10}>{px(data.week52High, cur)}</Val>
              </div>
            </div>
          )}
        </Panel>

        <Panel title={t("anr")}>
          <div style={{ display: "grid", gap: 5, fontSize: 11 }}>
            <div><Label>{t("ratings")} </Label>
              <Val color={C.green}>{data.analystBuy ?? "—"} {t("buy")}</Val>{" / "}
              <Val color={C.amber}>{data.analystHold ?? "—"} {t("hold")}</Val>{" / "}
              <Val color={C.red}>{data.analystSell ?? "—"} {t("sell")}</Val>
              {data.recommendationKey && <Val color={C.cyan} size={10}>  [{data.recommendationKey.toUpperCase()}]</Val>}
            </div>
            <div><Label>{t("targetMean")} </Label>
              <Val color={C.cyan}>{px(data.targetMean, cur)}</Val>
              {typeof data.targetMean === "number" && typeof price === "number" && (
                <Val color={data.targetMean > price ? C.green : C.red} size={10}>
                  {"  "}({pctStr(((data.targetMean - price) / price) * 100)} {t("implied")})
                </Val>
              )}
            </div>
            <div><Label>{t("targetRange")} </Label>
              <Val color={C.red}>{px(data.targetLow, cur)}</Val> – <Val color={C.green}>{px(data.targetHigh, cur)}</Val>
              <Val color={C.dim} size={10}>  ({data.numberOfAnalysts ?? "—"} {t("analysts")})</Val>
            </div>
            <div><Label>{t("nextEarnings")} </Label>
              <Val color={C.amber}>{data.nextEarnings ? new Date(data.nextEarnings).toLocaleDateString(locale) : "—"}</Val>
            </div>
            <div><Label>{t("consEPS")} </Label>
              <Val color={typeof data.consensusEPS === "number" && data.consensusEPS < 0 ? C.red : C.white}>
                {typeof data.consensusEPS === "number" ? data.consensusEPS.toLocaleString() : "—"}
              </Val>
              {typeof data.consensusEPSLow === "number" && (
                <Val color={C.dim} size={10}>  [{data.consensusEPSLow.toLocaleString()} … {data.consensusEPSHigh?.toLocaleString()}]</Val>
              )}
            </div>
            <div><Label>{t("consRev")} </Label><Val>{bigNum(data.consensusRev, cur)}</Val></div>
            <div><Label>{t("epsGrowth")} </Label>
              <Val color={typeof data.epsGrowthPct === "number" && data.epsGrowthPct < 0 ? C.red : C.green}>{pctStr(data.epsGrowthPct)}</Val>
            </div>
          </div>
        </Panel>

        <Panel title={t("fa")}>
          <div style={{ display: "grid", gap: 5, fontSize: 11 }}>
            <div><Label>{t("peLabel")} </Label><Val>{data.per?.toFixed(1) ?? "—"} / {data.forwardPE?.toFixed(1) ?? "—"}</Val></div>
            <div><Label>{t("pbBeta")} </Label><Val>{data.pbr?.toFixed(2) ?? "—"} · {data.beta?.toFixed(2) ?? "—"}</Val></div>
            <div><Label>{t("epsTTM")} </Label><Val>{typeof data.eps === "number" ? data.eps.toLocaleString() : "—"}</Val></div>
            <div><Label>{t("divYield")} </Label><Val>{pctStr(data.divYieldPct, 2)}</Val></div>
            <div><Label>{t("revTTM")} </Label><Val>{bigNum(data.revenueTTM, cur)}</Val>
              <Val color={typeof data.revenueGrowthPct === "number" && data.revenueGrowthPct < 0 ? C.red : C.green} size={10}>
                {"  "}{pctStr(data.revenueGrowthPct)} {t("yoy")}
              </Val>
            </div>
            <div><Label>{t("margins")} </Label>
              <Val>{pctStr(data.grossMarginPct, 0)} / {pctStr(data.operMarginPct, 0)} / {pctStr(data.profitMarginPct, 0)}</Val>
            </div>
            <div><Label>{t("roe")} </Label><Val color={typeof data.roePct === "number" && data.roePct < 0 ? C.red : C.green}>{pctStr(data.roePct)}</Val></div>
            <div><Label>{t("de")} </Label><Val>{data.debtToEquity?.toFixed(0) ?? "—"}</Val></div>
            <div><Label>{t("fcfCash")} </Label><Val>{bigNum(data.freeCashflow, cur)} · {bigNum(data.totalCash, cur)}</Val></div>
            <div><Label>{t("shortFloat")} </Label><Val color={C.red}>{pctStr(data.shortPctFloat)}</Val></div>
          </div>
        </Panel>

        <Panel title={t("ai")}>
          {pred ? (
            <div>
              <div style={{ marginBottom: 8 }}>
                <Label>{t("signal")} </Label>
                <Val size={15} color={pred.direction === "UP" ? C.green : pred.direction === "DOWN" ? C.red : C.amber}>
                  {pred.direction === "UP" ? "▲ " : pred.direction === "DOWN" ? "▼ " : "◆ "}{pred.direction}
                </Val>
                <Label>  {t("conviction")} </Label><Val color={C.cyan}>{pred.conviction}</Val>
              </div>
              <ProbBar label={t("pUp")} pct={pred.probUp} color={C.green} />
              <ProbBar label={t("pDown")} pct={pred.probDown} color={C.red} />
              <ProbBar label={t("pFlat")} pct={pred.probFlat} color={C.amber} />
              <div style={{ display: "flex", gap: 14, margin: "8px 0" }}>
                <span><Label>{t("bear")} </Label><Val color={C.red}>{px(pred.targetLow, cur)}</Val></span>
                <span><Label>{t("base")} </Label><Val color={C.amber}>{px(pred.targetBase, cur)}</Val></span>
                <span><Label>{t("bull")} </Label><Val color={C.green}>{px(pred.targetHigh, cur)}</Val></span>
              </div>
              {(pred.bull || []).filter(Boolean).map((b, i) => (
                <div key={"u" + i} style={{ color: C.green, fontSize: 10.5, margin: "2px 0" }}>+ {b}</div>
              ))}
              {(pred.bear || []).filter(Boolean).map((b, i) => (
                <div key={"d" + i} style={{ color: C.red, fontSize: 10.5, margin: "2px 0" }}>− {b}</div>
              ))}
              {(pred.risks || []).filter(Boolean).map((r, i) => (
                <div key={"r" + i} style={{ color: C.cyan, fontSize: 10.5, margin: "2px 0" }}>! {r}</div>
              ))}
              <div style={{ fontSize: 10.5, lineHeight: 1.55, color: C.white, marginTop: 6 }}>{pred.summary}</div>
              <div style={{ marginTop: 6, fontSize: 9, color: C.dim }}>{t("aiNote")}</div>
            </div>
          ) : predErr ? (
            <Val color={C.red} size={11}>{predErr}</Val>
          ) : (
            <Val color={C.dim}><span className="blink">█</span> {t("aiRunning")}</Val>
          )}
        </Panel>

        <Panel title={t("news")} style={{ gridColumn: "1 / -1" }}>
          {(data.news || []).length === 0 && <Val color={C.dim} size={11}>{t("noNews")}</Val>}
          {(data.news || []).map((n, i) => (
            <div key={i} style={{ display: "flex", gap: 8, padding: "4px 0", borderBottom: "1px solid #14100A", fontSize: 11 }}>
              <span style={{ color: C.dim, minWidth: 34 }}>{ago(n.t)}</span>
              <span style={{ color: C.cyan, minWidth: 90, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.s}</span>
              <a href={n.u} target="_blank" rel="noreferrer" style={{ color: C.white }}>{n.h}</a>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
