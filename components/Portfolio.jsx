"use client";
import { useState, useEffect, useMemo, Fragment } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ReferenceLine, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "../lib/supabaseClient";
import { C, Label, Val, btn, inputS, Panel } from "./ui";
import { px, pctStr, signed, bigNum } from "../lib/format";

export default function Portfolio({ user, t, liveQuotes, onSymbolsChange }) {
  const [rows, setRows] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ q: "", market: "US", shares: "", cost: "", date: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [riskByCurrency, setRiskByCurrency] = useState({});
  const [riskLoading, setRiskLoading] = useState({});
  const [riskErr, setRiskErr] = useState({});
  const [fundByCurrency, setFundByCurrency] = useState({});

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("positions").select("*").order("created_at");
      if (data) setRows(data);
    })();
  }, []);

  useEffect(() => {
    onSymbolsChange(rows.map((r) => r.symbol));
  }, [rows, onSymbolsChange]);

  const save = async () => {
    const shares = parseFloat(form.shares);
    const cost = parseFloat(form.cost);
    if (!form.q.trim() || !(shares > 0) || !(cost >= 0)) {
      setErr("Enter a symbol, share count above zero, and an average cost.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/quote?q=${encodeURIComponent(form.q.trim())}&market=${form.market}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Symbol not found");
      const { data, error } = await supabase
        .from("positions")
        .insert({
          user_id: user.id, symbol: d.symbol, display: form.q.trim(), market: form.market,
          currency: d.currency || (form.market === "KR" ? "KRW" : "USD"),
          shares, avg_cost: cost, trade_date: form.date || null,
        })
        .select();
      if (error) throw error;
      setRows((x) => [...x, data[0]]);
      setForm({ q: "", market: form.market, shares: "", cost: "", date: "" });
      setAdding(false);
    } catch (e) {
      setErr(String(e.message || e));
    }
    setBusy(false);
  };

  const remove = async (id) => {
    await supabase.from("positions").delete().eq("id", id);
    setRows((x) => x.filter((r) => r.id !== id));
  };

  // ---- compute P&L, grouped by currency ----
  const groups = useMemo(() => {
    const g = {};
    for (const r of rows) {
      const q = liveQuotes[r.symbol];
      const price = q?.price ?? null;
      const cur = r.currency || (q?.currency ?? "USD");
      const mktValue = price !== null ? price * r.shares : null;
      const costBasis = r.avg_cost * r.shares;
      const pnl = mktValue !== null ? mktValue - costBasis : null;
      const pnlPct = pnl !== null && costBasis > 0 ? (pnl / costBasis) * 100 : null;
      const dayPnl =
        q && typeof q.change === "number" ? q.change * r.shares : null;
      if (!g[cur]) g[cur] = { cur, items: [], value: 0, cost: 0, day: 0 };
      g[cur].items.push({ ...r, price, mktValue, costBasis, pnl, pnlPct, dayPnl, changePct: q?.changePct });
      g[cur].value += mktValue ?? 0;
      g[cur].cost += costBasis;
      g[cur].day += dayPnl ?? 0;
    }
    for (const k of Object.keys(g)) {
      for (const it of g[k].items) {
        it.weight = g[k].value > 0 && it.mktValue !== null ? (it.mktValue / g[k].value) * 100 : null;
      }
      g[k].items.sort((a, b) => (b.mktValue ?? 0) - (a.mktValue ?? 0));
    }
    return Object.values(g);
  }, [rows, liveQuotes]);

  // Stable value (not reference) that only changes when symbols/shares
  // actually change — used to avoid re-fetching risk analytics on every
  // price tick, since `groups` gets a new object reference each time.
  const posSignature = useMemo(
    () => groups.map((g) => `${g.cur}:${g.items.map((it) => `${it.symbol}:${it.shares}`).sort().join(",")}`).join("|"),
    [groups]
  );

  useEffect(() => {
    groups.forEach((g) => {
      if (g.items.length === 0) return;
      setRiskLoading((x) => ({ ...x, [g.cur]: true }));
      setRiskErr((x) => ({ ...x, [g.cur]: null }));
      fetch("/api/portfolio/risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          positions: g.items.map((it) => ({ symbol: it.symbol, market: it.market, shares: it.shares, weight: it.weight || 0 })),
          portfolioValue: g.value,
          currency: g.cur,
        }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.error) throw new Error(d.error);
          setRiskByCurrency((x) => ({ ...x, [g.cur]: d }));
        })
        .catch((e) => setRiskErr((x) => ({ ...x, [g.cur]: String(e.message || e) })))
        .finally(() => setRiskLoading((x) => ({ ...x, [g.cur]: false })));

      fetch("/api/portfolio/fundamentals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: g.items.map((it) => ({ symbol: it.symbol, market: it.market })) }),
      })
        .then((r) => r.json())
        .then((d) => { if (!d.error) setFundByCurrency((x) => ({ ...x, [g.cur]: d })); })
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posSignature]);

  const th = { color: C.dim, fontSize: 9, letterSpacing: 1, textAlign: "right", padding: "3px 6px", fontWeight: 400, whiteSpace: "nowrap" };
  const td = { fontSize: 11, textAlign: "right", padding: "5px 6px", whiteSpace: "nowrap" };

  return (
    <div style={{ flex: 1, padding: 6, overflow: "auto", display: "grid", gap: 6, alignContent: "start" }}>
      {groups.map((g) => {
        const pnl = g.value - g.cost;
        const pnlPct = g.cost > 0 ? (pnl / g.cost) * 100 : 0;
        const pc = pnl >= 0 ? C.green : C.red;
        const dc = g.day >= 0 ? C.green : C.red;
        const risk = riskByCurrency[g.cur];
        const rLoading = riskLoading[g.cur];
        const rErr = riskErr[g.cur];
        const fund = fundByCurrency[g.cur]?.perSymbol || {};
        const missingSecs = fundByCurrency[g.cur]?.missingSectors || [];
        const sectorAlloc = (() => {
          const bySector = {};
          for (const it of g.items) {
            const sector = fund[it.symbol]?.sector || t("unknownSector");
            bySector[sector] = (bySector[sector] || 0) + (it.weight || 0);
          }
          return Object.entries(bySector).sort((a, b) => b[1] - a[1]);
        })();
        const dividendIncome = (() => {
          let annual = 0, costForYield = 0;
          for (const it of g.items) {
            const perShare = fund[it.symbol]?.annualDividendPerShare;
            if (typeof perShare === "number") {
              annual += perShare * it.shares;
              costForYield += it.costBasis;
            }
          }
          return { annual, yieldOnCost: costForYield > 0 ? (annual / costForYield) * 100 : null };
        })();
        return (
        <Fragment key={g.cur}>
          <Panel title={`${t("portfolioTitle")} · ${g.cur}`}>
            {/* summary strip */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, padding: "2px 2px 10px", borderBottom: `1px solid ${C.border}`, marginBottom: 6 }}>
              <div>
                <Label>{t("totalValue")}</Label><br />
                <Val size={18} color={C.cyan}>{px(g.value, g.cur)}</Val>
              </div>
              <div>
                <Label>{t("totalCost")}</Label><br />
                <Val size={18}>{px(g.cost, g.cur)}</Val>
              </div>
              <div>
                <Label>{t("unrealized")}</Label><br />
                <Val size={18} color={pc}>{signed(pnl, g.cur)}</Val>{" "}
                <Val size={12} color={pc}>({pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)</Val>
              </div>
              <div>
                <Label>{t("dayPnl")}</Label><br />
                <Val size={18} color={dc}>{signed(g.day, g.cur)}</Val>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th style={{ ...th, textAlign: "left" }}>{t("symbol")}</th>
                    <th style={th}>{t("shares")}</th>
                    <th style={th}>{t("avgCost")}</th>
                    <th style={th}>PRICE</th>
                    <th style={th}>{t("mktValue")}</th>
                    <th style={th}>{t("costBasis")}</th>
                    <th style={th}>{t("pnl")}</th>
                    <th style={th}>%</th>
                    <th style={th}>{t("dayPnl")}</th>
                    <th style={th}>{t("weight")}</th>
                    <th style={th}>P/E</th>
                    <th style={th}>{t("divYield")}</th>
                    <th style={{ ...th, textAlign: "left" }}>{t("sector")}</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it) => {
                    const c = (it.pnl ?? 0) >= 0 ? C.green : C.red;
                    const dcc = (it.dayPnl ?? 0) >= 0 ? C.green : C.red;
                    const f = fund[it.symbol];
                    return (
                      <tr key={it.id} style={{ borderBottom: "1px solid #100C06" }}>
                        <td style={{ ...td, textAlign: "left", color: C.amber }}>
                          {it.market === "KR" ? "🇰🇷 " : "🇺🇸 "}
                          {it.symbol.replace(/\.(KS|KQ)$/, "")}
                        </td>
                        <td style={{ ...td, color: C.white }}>{it.shares.toLocaleString()}</td>
                        <td style={{ ...td, color: C.white }}>{px(it.avg_cost, g.cur)}</td>
                        <td style={{ ...td, color: C.white }}>{px(it.price, g.cur)}</td>
                        <td style={{ ...td, color: C.cyan }}>{px(it.mktValue, g.cur)}</td>
                        <td style={{ ...td, color: C.dim }}>{px(it.costBasis, g.cur)}</td>
                        <td style={{ ...td, color: c }}>{signed(it.pnl, g.cur)}</td>
                        <td style={{ ...td, color: c }}>{it.pnlPct !== null ? `${it.pnlPct >= 0 ? "+" : ""}${it.pnlPct.toFixed(1)}%` : "—"}</td>
                        <td style={{ ...td, color: dcc }}>{signed(it.dayPnl, g.cur)}</td>
                        <td style={{ ...td, color: C.dim }}>
                          {it.weight !== null ? `${it.weight.toFixed(1)}%` : "—"}
                          <div style={{ background: "#141008", height: 3, marginTop: 2, width: 44, marginLeft: "auto" }}>
                            <div style={{ width: `${it.weight ?? 0}%`, height: "100%", background: C.amber }} />
                          </div>
                        </td>
                        <td style={{ ...td, color: C.white }}>{typeof f?.per === "number" ? f.per.toFixed(1) : "—"}</td>
                        <td style={{ ...td, color: C.white }}>{typeof f?.divYieldPct === "number" ? `${f.divYieldPct.toFixed(2)}%` : "—"}</td>
                        <td style={{ ...td, textAlign: "left", color: C.dim, whiteSpace: "nowrap" }}>{f?.sector || "—"}</td>
                        <td style={td}>
                          <button onClick={() => remove(it.id)}
                            style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title={`${t("riskTitle")} · ${g.cur}`}>
            {rLoading && !risk && <Val color={C.dim} size={11}><span className="blink">█</span> {t("loadingRisk")}</Val>}
            {rErr && <Val color={C.red} size={11}>{rErr}</Val>}
            {risk?.insufficientHistory && <Val color={C.dim} size={11}>{t("insufficientHistory")}</Val>}
            {risk && !risk.insufficientHistory && (
              <>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 12 }}>
                  <div>
                    <Label>{t("volatility")}</Label><br />
                    <Val size={16}>{typeof risk.portfolio.volatility === "number" ? `${(risk.portfolio.volatility * 100).toFixed(1)}%` : "—"}</Val>
                  </div>
                  <div>
                    <Label>{t("betaLabel")} ({risk.benchmark})</Label><br />
                    <Val size={16}>{typeof risk.portfolio.beta === "number" ? risk.portfolio.beta.toFixed(2) : "—"}</Val>
                  </div>
                  <div>
                    <Label>{t("sharpeLabel")}</Label><br />
                    <Val size={16} color={(risk.portfolio.sharpe ?? 0) >= 0 ? C.green : C.red}>
                      {typeof risk.portfolio.sharpe === "number" ? risk.portfolio.sharpe.toFixed(2) : "—"}
                    </Val>
                  </div>
                  <div>
                    <Label>{t("varLabel")}</Label><br />
                    <Val size={16} color={C.red}>{typeof risk.portfolio.var95_1d === "number" ? px(risk.portfolio.var95_1d, g.cur) : "—"}</Val>
                  </div>
                  <div>
                    <Label>{t("maxDrawdown")}</Label><br />
                    <Val size={16} color={C.red}>
                      {typeof risk.portfolio.maxDrawdown?.pct === "number" ? `${(risk.portfolio.maxDrawdown.pct * 100).toFixed(1)}%` : "—"}
                    </Val>
                  </div>
                </div>

                <Label>{t("equityVsBenchmark")} ({risk.benchmark})</Label>
                <div style={{ marginTop: 4, marginBottom: 14 }}>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={risk.portfolio.equityCurve.map((pt, i) => ({
                      d: pt.d, portfolio: pt.v, benchmark: risk.portfolio.benchmarkEquityCurve?.[i]?.v ?? null,
                    }))}>
                      <CartesianGrid stroke="#181206" vertical={false} />
                      <XAxis dataKey="d" tick={{ fill: C.dim, fontSize: 9 }} axisLine={{ stroke: C.border }} minTickGap={50} />
                      <YAxis domain={["auto", "auto"]} tick={{ fill: C.dim, fontSize: 9 }} axisLine={{ stroke: C.border }}
                        width={60} tickFormatter={(v) => v.toLocaleString()} />
                      <Tooltip
                        contentStyle={{ background: "#0D0800", border: "1px solid var(--amber-dim)", fontSize: 11 }}
                        labelStyle={{ color: C.dim }}
                        formatter={(v, name) => [px(v, g.cur), name]} />
                      <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => <span style={{ color: C.white }}>{v}</span>} />
                      <Line type="monotone" dataKey="portfolio" name={t("portfolioTitle")} stroke={C.amber} dot={false} strokeWidth={1.6} />
                      <Line type="monotone" dataKey="benchmark" name={risk.benchmark} stroke={C.cyan} dot={false} strokeWidth={1.4} strokeDasharray="4 3" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <Label>{t("rollingSharpeTitle")}</Label>
                <div style={{ marginTop: 4, marginBottom: 14 }}>
                  <ResponsiveContainer width="100%" height={110}>
                    <LineChart data={risk.portfolio.rollingSharpe}>
                      <CartesianGrid stroke="#181206" vertical={false} />
                      <XAxis dataKey="d" tick={{ fill: C.dim, fontSize: 9 }} axisLine={{ stroke: C.border }} minTickGap={50} />
                      <YAxis domain={["auto", "auto"]} tick={{ fill: C.dim, fontSize: 9 }} axisLine={{ stroke: C.border }} width={40} />
                      <Tooltip
                        contentStyle={{ background: "#0D0800", border: "1px solid var(--amber-dim)", fontSize: 11 }}
                        labelStyle={{ color: C.dim }} itemStyle={{ color: C.amber }}
                        formatter={(v) => [typeof v === "number" ? v.toFixed(2) : "—", t("sharpeLabel")]} />
                      <ReferenceLine y={0} stroke={C.border} />
                      <Line type="monotone" dataKey="sharpe" stroke={C.amber} dot={false} strokeWidth={1.4} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <Label>{t("correlationMatrix")}</Label>
                <div style={{ overflowX: "auto", marginTop: 4 }}>
                  <table style={{ borderCollapse: "collapse", fontSize: 10 }}>
                    <thead>
                      <tr>
                        <th></th>
                        {g.items.map((it) => (
                          <th key={it.symbol} style={{ padding: "3px 6px", color: C.dim, fontWeight: 400 }}>
                            {it.symbol.replace(/\.(KS|KQ)$/, "")}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.items.map((row) => (
                        <tr key={row.symbol}>
                          <td style={{ padding: "3px 6px", color: C.white, whiteSpace: "nowrap" }}>{row.symbol.replace(/\.(KS|KQ)$/, "")}</td>
                          {g.items.map((col) => {
                            const v = risk.correlationMatrix?.[row.symbol]?.[col.symbol];
                            const ok = typeof v === "number";
                            const abs = ok ? Math.min(Math.abs(v), 1) : 0;
                            const alpha = 0.15 + abs * 0.55;
                            const bg = !ok ? "transparent" : v >= 0 ? `rgba(43,217,79,${alpha})` : `rgba(255,59,59,${alpha})`;
                            return (
                              <td key={col.symbol} style={{ padding: "3px 6px", textAlign: "center", background: bg, color: C.white }}>
                                {ok ? v.toFixed(2) : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ color: C.dim, fontSize: 9, marginTop: 10 }}>{t("riskNote")}</div>
              </>
            )}
          </Panel>

          <Panel title={`${t("sectorTitle")} · ${g.cur}`}>
            <div style={{ display: "flex", gap: 30, flexWrap: "wrap", marginBottom: 14 }}>
              <div>
                <Label>{t("estAnnualDividend")}</Label><br />
                <Val size={16} color={C.green}>{dividendIncome.annual > 0 ? px(dividendIncome.annual, g.cur) : "—"}</Val>
              </div>
              <div>
                <Label>{t("yieldOnCost")}</Label><br />
                <Val size={16}>{dividendIncome.yieldOnCost !== null ? `${dividendIncome.yieldOnCost.toFixed(2)}%` : "—"}</Val>
              </div>
            </div>
            {g.cur === "KRW" && <div style={{ color: C.dim, fontSize: 9, marginBottom: 10 }}>{t("krFundamentalsNote")}</div>}

            <Label>{t("sectorAllocation")}</Label>
            <div style={{ display: "grid", gap: 6, marginTop: 6, marginBottom: 14 }}>
              {sectorAlloc.map(([sector, weight]) => (
                <div key={sector}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                    <span style={{ color: C.white }}>{sector}</span>
                    <span style={{ color: C.dim }}>{weight.toFixed(1)}%</span>
                  </div>
                  <div style={{ background: "#141008", height: 6 }}>
                    <div style={{ width: `${Math.min(weight, 100)}%`, height: "100%", background: C.amber }} />
                  </div>
                </div>
              ))}
            </div>

            {missingSecs.length > 0 && (
              <div>
                <Label>{t("diversificationIdeas")}</Label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {missingSecs.map((s) => (
                    <span key={s.sector} style={{ border: `1px solid ${C.border}`, color: C.dim, fontSize: 10, padding: "3px 8px" }}>
                      {s.sector}: <span style={{ color: C.amber }}>{s.tickers.join(", ")}</span>
                    </span>
                  ))}
                </div>
                <div style={{ color: C.dim, fontSize: 9, marginTop: 6 }}>{t("diversificationNote")}</div>
              </div>
            )}
          </Panel>

          {risk?.optimization && (
            <Panel title={`${t("optimizationTitle")} · ${g.cur}`}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <th style={{ ...th, textAlign: "left" }}>{t("symbol")}</th>
                      <th style={th}>{t("currentWeight")}</th>
                      <th style={th}>{t("maxSharpeWeight")}</th>
                      <th style={th}>{t("minVarWeight")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((it) => (
                      <tr key={it.symbol} style={{ borderBottom: "1px solid #100C06" }}>
                        <td style={{ ...td, textAlign: "left", color: C.amber }}>{it.symbol.replace(/\.(KS|KQ)$/, "")}</td>
                        <td style={{ ...td, color: C.white }}>{it.weight !== null ? `${it.weight.toFixed(1)}%` : "—"}</td>
                        <td style={{ ...td, color: C.green }}>
                          {typeof risk.optimization.maxSharpe?.weights?.[it.symbol] === "number" ? `${(risk.optimization.maxSharpe.weights[it.symbol] * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td style={{ ...td, color: C.cyan }}>
                          {typeof risk.optimization.minVariance?.weights?.[it.symbol] === "number" ? `${(risk.optimization.minVariance.weights[it.symbol] * 100).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
                <span><Label>{t("maxSharpeResult")} </Label><Val color={C.green}>{typeof risk.optimization.maxSharpe?.sharpe === "number" ? risk.optimization.maxSharpe.sharpe.toFixed(2) : "—"}</Val></span>
                <span><Label>{t("minVarResult")} </Label><Val color={C.cyan}>{typeof risk.optimization.minVariance?.vol === "number" ? `${(risk.optimization.minVariance.vol * 100).toFixed(1)}%` : "—"}</Val></span>
              </div>
              <div style={{ color: C.dim, fontSize: 9, marginTop: 10 }}>{t("optimizationNote")}</div>
            </Panel>
          )}
        </Fragment>
        );
      })}

      {rows.length === 0 && !adding && (
        <Panel title={t("portfolioTitle")}>
          <Val color={C.dim} size={11}>{t("noPositions")}</Val>
        </Panel>
      )}

      {/* add form */}
      <Panel title={t("addPosition")}>
        {!adding ? (
          <button style={btn(true)} onClick={() => setAdding(true)}>+ {t("addPosition")}</button>
        ) : (
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", alignItems: "end" }}>
            <div>
              <Label>MARKET</Label>
              <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
                {["US", "KR"].map((m) => (
                  <button key={m} onClick={() => setForm({ ...form, market: m })}
                    style={{ ...btn(form.market === m), flex: 1, padding: "6px 0" }}>
                    {m === "US" ? "🇺🇸 US" : "🇰🇷 KRX"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>{t("symbol")}</Label>
              <input style={inputS} value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })}
                placeholder={form.market === "US" ? "AAPL" : "005930"} />
            </div>
            <div>
              <Label>{t("shares")}</Label>
              <input style={inputS} type="number" value={form.shares}
                onChange={(e) => setForm({ ...form, shares: e.target.value })} placeholder="10" />
            </div>
            <div>
              <Label>{t("avgCost")}</Label>
              <input style={inputS} type="number" value={form.cost}
                onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="150.00" />
            </div>
            <div>
              <Label>{t("tradeDate")}</Label>
              <input style={inputS} type="date" value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button style={btn(true)} onClick={save} disabled={busy}>{busy ? "..." : t("save")}</button>
              <button style={btn(false)} onClick={() => { setAdding(false); setErr(null); }}>{t("cancel")}</button>
            </div>
          </div>
        )}
        {err && <div style={{ color: C.red, fontSize: 11, marginTop: 8 }}>{err}</div>}
        <div style={{ color: C.dim, fontSize: 9, marginTop: 10 }}>{t("portfolioNote")}</div>
      </Panel>
    </div>
  );
}
