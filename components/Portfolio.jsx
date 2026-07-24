"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { C, Label, Val, btn, inputS, Panel } from "./ui";
import { px, pctStr, signed, bigNum } from "../lib/format";

export default function Portfolio({ user, t, liveQuotes, onSymbolsChange }) {
  const [rows, setRows] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ q: "", market: "US", shares: "", cost: "", date: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

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

  const th = { color: C.dim, fontSize: 9, letterSpacing: 1, textAlign: "right", padding: "3px 6px", fontWeight: 400, whiteSpace: "nowrap" };
  const td = { fontSize: 11, textAlign: "right", padding: "5px 6px", whiteSpace: "nowrap" };

  return (
    <div style={{ flex: 1, padding: 6, overflow: "auto", display: "grid", gap: 6, alignContent: "start" }}>
      {groups.map((g) => {
        const pnl = g.value - g.cost;
        const pnlPct = g.cost > 0 ? (pnl / g.cost) * 100 : 0;
        const pc = pnl >= 0 ? C.green : C.red;
        const dc = g.day >= 0 ? C.green : C.red;
        return (
          <Panel key={g.cur} title={`${t("portfolioTitle")} · ${g.cur}`}>
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
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it) => {
                    const c = (it.pnl ?? 0) >= 0 ? C.green : C.red;
                    const dcc = (it.dayPnl ?? 0) >= 0 ? C.green : C.red;
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
