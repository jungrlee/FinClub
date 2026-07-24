"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { useT } from "../lib/i18n";
import { useRealtimeQuotes, px } from "../lib/format";
import { C, Label, Val, btn, inputS } from "./ui";
import StockDetail from "./StockDetail";
import Portfolio from "./Portfolio";
import Calendar from "./Calendar";

export default function Terminal({ session }) {
  const user = session.user;
  const [lang, setLang] = useState("en");
  const [realtime, setRealtime] = useState(true);
  const t = useT(lang);

  const [tab, setTab] = useState("terminal");
  const [watchlist, setWatchlist] = useState([]);
  const [portfolioSymbols, setPortfolioSymbols] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [market, setMarket] = useState("US");
  const [cache, setCache] = useState({});
  const [preds, setPreds] = useState({});
  const [predErrs, setPredErrs] = useState({});
  const [stage, setStage] = useState(null);
  const [err, setErr] = useState(null);
  const [clock, setClock] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---------------- preferences ----------------
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("preferences").select("*").eq("user_id", user.id).maybeSingle();
      if (data) { setLang(data.lang); setRealtime(data.realtime); }
      else await supabase.from("preferences").insert({ user_id: user.id, lang: "en", realtime: true });
    })();
  }, [user.id]);

  const savePrefs = async (patch) => {
    await supabase.from("preferences").upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() });
  };
  const toggleLang = () => {
    const next = lang === "en" ? "ko" : "en";
    setLang(next); savePrefs({ lang: next, realtime });
  };
  const toggleRealtime = () => {
    const next = !realtime;
    setRealtime(next); savePrefs({ lang, realtime: next });
  };

  // ---------------- realtime polling ----------------
  const allSymbols = useMemo(() => {
    const s = new Set();
    watchlist.forEach((w) => w.symbol && s.add(w.symbol));
    portfolioSymbols.forEach((x) => x && s.add(x));
    return [...s];
  }, [watchlist, portfolioSymbols]);

  const { quotes: liveQuotes, lastTick, flash } = useRealtimeQuotes(allSymbols, realtime);

  // ---------------- data loading ----------------
  const loadForecast = useCallback(async (symbol, stock) => {
    try {
      const r = await fetch("/api/forecast", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock }),
      });
      if (!r.ok) throw new Error("forecast failed");
      const p = await r.json();
      setPreds((x) => ({ ...x, [symbol]: p }));
    } catch {
      setPredErrs((x) => ({ ...x, [symbol]: "FORECAST UNAVAILABLE — check ANTHROPIC_API_KEY" }));
    }
  }, []);

  const fetchStock = useCallback(async (row, force) => {
    setErr(null);
    const key = row.symbol || `${row.market}:${row.display}`;
    if (!force && cache[key]) return;
    setStage(`FETCHING ${row.display.toUpperCase()} ...`);
    try {
      const r = await fetch(`/api/quote?q=${encodeURIComponent(row.symbol || row.display)}&market=${row.market}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "quote failed");
      setCache((c) => ({ ...c, [key]: d, [d.symbol]: d }));
      setStage(null);
      if (!row.symbol && d.symbol) {
        await supabase.from("watchlist").update({ symbol: d.symbol }).eq("id", row.id);
        setWatchlist((wl) => wl.map((w) => (w.id === row.id ? { ...w, symbol: d.symbol } : w)));
      }
      loadForecast(d.symbol, d);
    } catch (e) {
      setErr(String(e.message || e));
      setStage(null);
    }
  }, [cache, loadForecast]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("watchlist").select("*").order("created_at");
      if (data) {
        setWatchlist(data);
        if (data.length) { setSelected(data[0]); fetchStock(data[0], false); }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectRow = (row) => { setSelected(row); setTab("terminal"); fetchStock(row, false); };

  const addStock = async () => {
    const q = query.trim();
    if (!q) return;
    setStage(`RESOLVING ${q.toUpperCase()} ...`);
    setErr(null);
    try {
      const r = await fetch(`/api/quote?q=${encodeURIComponent(q)}&market=${market}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "not found");
      if (watchlist.some((w) => w.symbol === d.symbol)) { setQuery(""); setStage(null); return; }
      const { data: rows, error } = await supabase
        .from("watchlist")
        .insert({ user_id: user.id, symbol: d.symbol, display: q, market })
        .select();
      if (error) throw error;
      const row = rows[0];
      setCache((c) => ({ ...c, [row.symbol]: d }));
      setWatchlist((wl) => [...wl, row]);
      setSelected(row); setQuery(""); setStage(null); setTab("terminal");
      loadForecast(d.symbol, d);
    } catch (e) {
      setErr(String(e.message || e)); setStage(null);
    }
  };

  const removeStock = async (row, e) => {
    e.stopPropagation();
    await supabase.from("watchlist").delete().eq("id", row.id);
    const wl = watchlist.filter((w) => w.id !== row.id);
    setWatchlist(wl);
    if (selected && selected.id === row.id) {
      setSelected(wl[0] || null);
      if (wl[0]) fetchStock(wl[0], false);
    }
  };

  const selKey = selected ? selected.symbol || `${selected.market}:${selected.display}` : null;
  const selData = selKey ? cache[selKey] : null;
  const selPred = selData ? preds[selData.symbol] : null;
  const selPredErr = selData ? predErrs[selData.symbol] : null;
  const selLive = selData ? liveQuotes[selData.symbol] : null;

  const TABS = [
    { id: "terminal", label: t("tabTerminal") },
    { id: "portfolio", label: t("tabPortfolio") },
    { id: "calendar", label: t("tabCalendar") },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: "2px solid var(--amber-dim)", background: "#0D0800", flexWrap: "wrap" }}>
        <span style={{ color: C.amber, fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>
          🐋 WHALES<span style={{ color: C.white }}>MARKET</span>
        </span>
        <div style={{ display: "flex", gap: 2 }}>
          {TABS.map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)}
              style={{
                ...btn(tab === x.id), padding: "4px 12px",
                borderColor: tab === x.id ? "var(--amber)" : "transparent",
              }}>
              {x.label}
            </button>
          ))}
        </div>
        <span style={{ color: C.dim, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
          {user.email}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={toggleRealtime} style={{ ...btn(false), padding: "2px 8px", color: realtime ? "var(--green)" : "var(--amber-dim)", borderColor: realtime ? "var(--green)" : "var(--amber-dim)" }}>
            {realtime ? `● ${t("live")}` : `○ ${t("paused")}`}
          </button>
          <button onClick={toggleLang} style={{ ...btn(false), padding: "2px 8px" }}>
            {lang === "en" ? "🇰🇷 한국어" : "🇺🇸 EN"}
          </button>
          <span style={{ color: C.dim, fontSize: 11 }}>{clock.toLocaleTimeString(lang === "ko" ? "ko-KR" : "en-US", { hour12: false })}</span>
          <button style={{ ...btn(false), padding: "2px 10px" }} onClick={() => supabase.auth.signOut()}>{t("logout")}</button>
        </div>
      </div>

      {err && <div style={{ padding: "3px 10px", color: C.red, fontSize: 11, borderBottom: `1px solid ${C.border}` }}>{err}</div>}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* sidebar */}
        <div style={{ width: 235, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", background: "#050400" }}>
          <div style={{ padding: 8, borderBottom: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              {["US", "KR"].map((m) => (
                <button key={m} onClick={() => setMarket(m)} style={{ ...btn(market === m), flex: 1, padding: "4px 0" }}>
                  {m === "US" ? "🇺🇸 US" : "🇰🇷 KRX"}
                </button>
              ))}
            </div>
            <input style={inputS}
              placeholder={market === "US" ? t("searchUS") : t("searchKR")}
              value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addStock()} />
            <button style={{ ...btn(true), width: "100%", marginTop: 6 }} onClick={addStock}>{t("addBtn")}</button>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            <div style={{ padding: "4px 8px" }}><Label>{t("watchlist")} ({watchlist.length})</Label></div>
            {watchlist.map((w) => {
              const snap = cache[w.symbol || `${w.market}:${w.display}`];
              const q = liveQuotes[w.symbol];
              const price = q?.price ?? snap?.price;
              const chPct = q?.changePct ?? snap?.changePct;
              const currency = q?.currency ?? snap?.currency;
              const isSel = selected && selected.id === w.id;
              const fl = flash[w.symbol];
              const chColor = (chPct ?? 0) >= 0 ? C.green : C.red;
              return (
                <div key={w.id} onClick={() => selectRow(w)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", cursor: "pointer",
                    borderBottom: "1px solid #100C06",
                    background: fl === "up" ? "#0C2010" : fl === "down" ? "#200C0C" : isSel ? "#1A1204" : "transparent",
                    borderLeft: `3px solid ${isSel ? "var(--amber)" : "transparent"}`,
                    transition: "background .5s",
                  }}>
                  <span style={{ fontSize: 9 }}>{w.market === "KR" ? "🇰🇷" : "🇺🇸"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: isSel ? C.amber : C.white, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {(w.symbol || w.display).replace(/\.(KS|KQ)$/, "")}
                    </div>
                    <div style={{ color: chColor, fontSize: 10 }}>
                      {typeof price === "number"
                        ? `${px(price, currency)} ${(chPct ?? 0) >= 0 ? "▲" : "▼"}${Math.abs(chPct ?? 0).toFixed(1)}%`
                        : "—"}
                    </div>
                  </div>
                  <button onClick={(e) => removeStock(w, e)}
                    style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
              );
            })}
          </div>
        </div>

        {/* main area */}
        {tab === "terminal" && (
          <StockDetail data={selData} live={selLive} pred={selPred} predErr={selPredErr}
            loading={stage} onRefresh={() => selected && fetchStock(selected, true)} t={t} lang={lang} />
        )}
        {tab === "portfolio" && (
          <Portfolio user={user} t={t} liveQuotes={liveQuotes} onSymbolsChange={setPortfolioSymbols} />
        )}
        {tab === "calendar" && (
          <Calendar symbols={watchlist.map((w) => w.symbol).filter(Boolean)} t={t} lang={lang} />
        )}
      </div>

      {/* status bar */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 10px", borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.dim, background: "#050400", gap: 10 }}>
        <span>
          {t("feed")}: {stage
            ? <span style={{ color: C.amber }}><span className="blink">●</span> {stage}</span>
            : realtime
              ? <span style={{ color: C.green }}>● {t("live")} · Yahoo Finance{lastTick ? ` · ${new Date(lastTick).toLocaleTimeString(lang === "ko" ? "ko-KR" : "en-US", { hour12: false })}` : ""}</span>
              : <span style={{ color: C.dim }}>○ {t("paused")}</span>}
        </span>
        <span style={{ textAlign: "right" }}>{t("disclaimer")}</span>
      </div>
    </div>
  );
}
