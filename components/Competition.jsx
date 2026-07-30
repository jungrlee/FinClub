"use client";
import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { supabase } from "../lib/supabaseClient";
import { C, Label, Val, btn, inputS, Panel } from "./ui";
import { px, signed, bigNum, daysUntil } from "../lib/format";

export default function Competition({ user, session, t, liveQuotes, onSymbolsChange }) {
  const token = session?.access_token;

  const [loading, setLoading] = useState(true);
  const [competition, setCompetition] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [rows, setRows] = useState([]); // my competition_positions
  const [ranked, setRanked] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [err, setErr] = useState(null);

  // ---- ticket state ----
  const [market, setMarket] = useState("US");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState(null);
  const [side, setSide] = useState("buy");
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [orderMsg, setOrderMsg] = useState(null);

  const authFetch = useCallback(
    (url, opts = {}) =>
      fetch(url, {
        ...opts,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
      }),
    [token]
  );

  const loadCompetition = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authFetch("/api/competition");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "failed to load competition");
      setCompetition(d.competition);
      setParticipant(d.participant);
    } catch (e) {
      setErr(String(e.message || e));
    }
    setLoading(false);
  }, [authFetch]);

  useEffect(() => { loadCompetition(); }, [loadCompetition]);

  // ---- my holdings ----
  const loadHoldings = useCallback(async () => {
    if (!participant) return;
    const { data } = await supabase.from("competition_positions").select("*").eq("participant_id", participant.id);
    setRows(data || []);
  }, [participant]);

  useEffect(() => { loadHoldings(); }, [loadHoldings]);

  useEffect(() => {
    onSymbolsChange(rows.map((r) => r.symbol));
  }, [rows, onSymbolsChange]);

  // ---- leaderboard ----
  const loadLeaderboard = useCallback(async () => {
    if (!competition) return;
    try {
      const r = await authFetch(`/api/competition/leaderboard?competitionId=${competition.id}`);
      const d = await r.json();
      if (r.ok) setRanked(d.ranked || []);
    } catch (_) {}
  }, [authFetch, competition]);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  const join = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await authFetch("/api/competition", { method: "POST", body: JSON.stringify({ competitionId: competition.id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "join failed");
      setParticipant(d.participant);
    } catch (e) {
      setErr(String(e.message || e));
    }
    setBusy(false);
  };

  const resolveSymbol = async () => {
    const query = q.trim();
    if (!query) return;
    setOrderMsg(null);
    try {
      const r = await fetch(`/api/quote?q=${encodeURIComponent(query)}&market=${market}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "not found");
      setPreview(d);
    } catch (e) {
      setPreview(null);
      setOrderMsg({ ok: false, text: String(e.message || e) });
    }
  };

  const submitOrder = async () => {
    if (!preview || !(parseFloat(qty) > 0)) return;
    setBusy(true); setOrderMsg(null);
    try {
      const r = await authFetch("/api/competition/trade", {
        method: "POST",
        body: JSON.stringify({ competitionId: competition.id, symbol: preview.symbol, market: preview.market || market, side, qty }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t("orderErr"));
      setOrderMsg({ ok: true, text: `${t("orderOk")} ${side.toUpperCase()} ${qty} ${preview.symbol} @ ${px(d.price, preview.currency)}` });
      setQty("");
      await Promise.all([loadCompetition(), loadHoldings(), loadLeaderboard()]);
    } catch (e) {
      setOrderMsg({ ok: false, text: String(e.message || e) });
    }
    setBusy(false);
  };

  const myHoldings = useMemo(() => {
    return rows.map((r) => {
      const live = liveQuotes[r.symbol];
      const price = live?.price ?? r.avg_cost;
      const mktValue = r.shares * price;
      const costBasis = r.avg_cost * r.shares;
      const pnl = mktValue - costBasis;
      return { ...r, price, mktValue, pnl };
    });
  }, [rows, liveQuotes]);

  const equity = participant ? participant.cash + myHoldings.reduce((s, h) => s + h.mktValue, 0) : null;
  const returnPct = participant && equity !== null ? ((equity - participant.starting_cash) / participant.starting_cash) * 100 : null;

  if (loading) {
    return <Panel title={t("competitionTitle")}><Val color={C.dim} size={11}>...</Val></Panel>;
  }

  if (!competition) {
    return (
      <div style={{ flex: 1, padding: 6 }}>
        <Panel title={t("competitionTitle")}>
          <Val color={C.dim} size={11}>{t("noCompetition")}</Val>
        </Panel>
      </div>
    );
  }

  const daysLeft = daysUntil(competition.end_date);

  if (!participant) {
    return (
      <div style={{ flex: 1, padding: 6 }}>
        <Panel title={competition.name}>
          <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
            <div><Label>{t("startingCash")}</Label><br /><Val size={18} color={C.cyan}>{bigNum(competition.starting_cash, "USD")}</Val></div>
            <div><Label>{t("endsIn")}</Label><br /><Val size={18}>{daysLeft >= 0 ? `${daysLeft} ${t("daysLeft")}` : t("ended")}</Val></div>
          </div>
          <button style={btn(true)} onClick={join} disabled={busy}>{busy ? "..." : t("joinCompetition")}</button>
          {err && <div style={{ color: C.red, fontSize: 11, marginTop: 8 }}>{err}</div>}
          <div style={{ color: C.dim, fontSize: 9, marginTop: 10 }}>{t("joinNote")}</div>
        </Panel>
      </div>
    );
  }

  const th = { color: C.dim, fontSize: 9, letterSpacing: 1, textAlign: "right", padding: "3px 6px", fontWeight: 400, whiteSpace: "nowrap" };
  const td = { fontSize: 11, textAlign: "right", padding: "5px 6px", whiteSpace: "nowrap" };
  const pc = returnPct !== null && returnPct >= 0 ? C.green : C.red;

  return (
    <div style={{ flex: 1, padding: 6, overflow: "auto", display: "grid", gap: 6, alignContent: "start" }}>
      <Panel title={`${competition.name} · ${daysLeft >= 0 ? `${daysLeft} ${t("daysLeft")}` : t("ended")}`}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          <div><Label>{t("cashBal")}</Label><br /><Val size={18}>{px(participant.cash, "USD")}</Val></div>
          <div><Label>{t("equity")}</Label><br /><Val size={18} color={C.cyan}>{px(equity, "USD")}</Val></div>
          <div>
            <Label>{t("returnPct")}</Label><br />
            <Val size={18} color={pc}>{returnPct !== null ? `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%` : "—"}</Val>
          </div>
        </div>
      </Panel>

      <Panel title={t("placeOrder")}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", alignItems: "end" }}>
          <div>
            <Label>MARKET</Label>
            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
              {["US", "KR"].map((m) => (
                <button key={m} onClick={() => setMarket(m)} style={{ ...btn(market === m), flex: 1, padding: "6px 0" }}>
                  {m === "US" ? "🇺🇸 US" : "🇰🇷 KRX"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>{t("symbol")}</Label>
            <input style={inputS} value={q} onChange={(e) => { setQ(e.target.value); setPreview(null); }}
              onKeyDown={(e) => e.key === "Enter" && resolveSymbol()}
              placeholder={market === "US" ? "AAPL" : "005930"} />
          </div>
          <div>
            <button style={btn(false)} onClick={resolveSymbol}>{t("refresh")}</button>
          </div>
          <div>
            <Label>{t("side")}</Label>
            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
              <button onClick={() => setSide("buy")} style={{ ...btn(side === "buy"), flex: 1, padding: "6px 0" }}>{t("buy")}</button>
              <button onClick={() => setSide("sell")} style={{ ...btn(side === "sell"), flex: 1, padding: "6px 0" }}>{t("sell")}/{t("short")}</button>
            </div>
          </div>
          <div>
            <Label>{t("qty")}</Label>
            <input style={inputS} type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="10" />
          </div>
          <div>
            <button style={btn(true)} onClick={submitOrder} disabled={busy || !preview || !(parseFloat(qty) > 0)}>
              {busy ? "..." : t("submitOrder")}
            </button>
          </div>
        </div>
        {preview && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.white }}>
            {preview.name} ({preview.symbol}) — <Val color={C.amber}>{px(preview.price, preview.currency)}</Val>
          </div>
        )}
        {orderMsg && <div style={{ color: orderMsg.ok ? C.green : C.red, fontSize: 11, marginTop: 8 }}>{orderMsg.text}</div>}
      </Panel>

      <Panel title={t("myHoldings")}>
        {myHoldings.length === 0 ? (
          <Val color={C.dim} size={11}>{t("noHoldings")}</Val>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ ...th, textAlign: "left" }}>{t("symbol")}</th>
                  <th style={th}>{t("shares")}</th>
                  <th style={th}>{t("avgCost")}</th>
                  <th style={th}>PRICE</th>
                  <th style={th}>{t("mktValue")}</th>
                  <th style={th}>{t("pnl")}</th>
                </tr>
              </thead>
              <tbody>
                {myHoldings.map((h) => {
                  const c = h.pnl >= 0 ? C.green : C.red;
                  return (
                    <tr key={h.id} style={{ borderBottom: "1px solid #100C06" }}>
                      <td style={{ ...td, textAlign: "left", color: h.shares < 0 ? C.red : C.amber }}>
                        {h.market === "KR" ? "🇰🇷 " : "🇺🇸 "}{h.symbol.replace(/\.(KS|KQ)$/, "")}{h.shares < 0 ? ` (${t("short")})` : ""}
                      </td>
                      <td style={{ ...td, color: C.white }}>{h.shares.toLocaleString()}</td>
                      <td style={{ ...td, color: C.white }}>{px(h.avg_cost, h.currency)}</td>
                      <td style={{ ...td, color: C.white }}>{px(h.price, h.currency)}</td>
                      <td style={{ ...td, color: C.cyan }}>{px(h.mktValue, h.currency)}</td>
                      <td style={{ ...td, color: c }}>{signed(h.pnl, h.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title={t("leaderboard")} right={<button style={{ ...btn(false), padding: "2px 8px" }} onClick={loadLeaderboard}>{t("refresh")}</button>}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th style={{ ...th, textAlign: "left" }}>{t("rank")}</th>
                <th style={{ ...th, textAlign: "left" }}>{t("trader")}</th>
                <th style={th}>{t("equity")}</th>
                <th style={th}>{t("returnPct")}</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r, i) => {
                const mine = r.userId === user.id;
                const rc = r.returnPct >= 0 ? C.green : C.red;
                const isOpen = !!expanded[r.participantId];
                return (
                  <Fragment key={r.participantId}>
                    <tr style={{ borderBottom: "1px solid #100C06", background: mine ? "#1A1204" : "transparent" }}>
                      <td style={{ ...td, textAlign: "left", color: C.amber }}>#{i + 1}</td>
                      <td style={{ ...td, textAlign: "left", color: C.white }}>{r.displayName}{mine ? " (you)" : ""}</td>
                      <td style={{ ...td, color: C.cyan }}>{px(r.equity, "USD")}</td>
                      <td style={{ ...td, color: rc }}>{r.returnPct >= 0 ? "+" : ""}{r.returnPct.toFixed(2)}%</td>
                      <td style={td}>
                        <button onClick={() => setExpanded((x) => ({ ...x, [r.participantId]: !isOpen }))}
                          style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 11 }}>
                          {isOpen ? t("hideDetail") : t("viewDetail")}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} style={{ padding: "6px 10px", background: "#0A0700" }}>
                          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                            <div>
                              <Label>{t("holdings")}</Label>
                              {r.holdings.length === 0 ? (
                                <div style={{ color: C.dim, fontSize: 10, marginTop: 4 }}>{t("noHoldings")}</div>
                              ) : (
                                r.holdings.map((h) => (
                                  <div key={h.id} style={{ fontSize: 10, color: h.shares < 0 ? C.red : C.white, padding: "2px 0" }}>
                                    {h.symbol.replace(/\.(KS|KQ)$/, "")} · {h.shares.toLocaleString()} @ {px(h.avg_cost, h.currency)}
                                  </div>
                                ))
                              )}
                            </div>
                            <div>
                              <Label>{t("tradeHistory")}</Label>
                              {r.trades.slice(0, 8).map((tr) => (
                                <div key={tr.id} style={{ fontSize: 10, color: tr.qty >= 0 ? C.green : C.red, padding: "2px 0" }}>
                                  {tr.qty >= 0 ? "BUY" : "SELL"} {Math.abs(tr.qty)} {tr.symbol} @ {px(tr.price, tr.currency)}
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
