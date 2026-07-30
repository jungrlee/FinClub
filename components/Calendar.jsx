"use client";
import { useState, useEffect } from "react";
import { C, Label, Val, Panel } from "./ui";
import { px, bigNum, daysUntil } from "../lib/format";

export default function Calendar({ symbols, t, lang }) {
  const [events, setEvents] = useState(null);
  const [err, setErr] = useState(null);
  const [econEvents, setEconEvents] = useState(null);
  const [econErr, setEconErr] = useState(null);
  const [econConfigured, setEconConfigured] = useState(true);

  useEffect(() => {
    if (!symbols.length) { setEvents([]); return; }
    (async () => {
      try {
        const r = await fetch(`/api/calendar?symbols=${encodeURIComponent(symbols.join(","))}`);
        const d = await r.json();
        setEvents(d.events || []);
      } catch (e) {
        setErr("Calendar feed error");
      }
    })();
  }, [symbols.join(",")]);

  // Part 1: general macro calendar (not tied to the watchlist) — fetched
  // once regardless of what's in symbols.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/calendar/economic");
        const d = await r.json();
        setEconEvents(d.events || []);
        setEconConfigured(d.configured !== false);
        if (d.error) setEconErr(d.error);
      } catch (e) {
        setEconErr(String(e.message || e));
      }
    })();
  }, []);

  if (events === null)
    return <div style={{ padding: 24, color: C.amber }}><span className="blink">█</span> LOADING CALENDAR...</div>;

  const dated = events.filter((e) => e.date);
  const undated = events.filter((e) => !e.date);

  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const dayLabel = (n) => {
    if (n === 0) return t("today");
    if (n === 1) return t("tomorrow");
    if (n < 0) return `${Math.abs(n)}${t("days")} ago`;
    return `${n}${t("days")}`;
  };

  return (
    <div style={{ flex: 1, padding: 6, overflow: "auto", display: "grid", gap: 6, alignContent: "start" }}>
      {/* Part 1: general macro calendar — not tied to the watchlist */}
      <Panel title={t("econCalendarTitle")}>
        {!econConfigured && <Val color={C.dim} size={11}>{t("econNotConfigured")}</Val>}
        {econConfigured && econErr && <div style={{ color: C.red, fontSize: 11 }}>{econErr}</div>}
        {econConfigured && econEvents === null && (
          <Val color={C.dim} size={11}><span className="blink">█</span> {t("loadingCalendar")}</Val>
        )}
        {econConfigured && econEvents && econEvents.length === 0 && !econErr && (
          <Val color={C.dim} size={11}>{t("noEconEvents")}</Val>
        )}
        {econConfigured && econEvents && econEvents.length > 0 && (
          <div style={{ display: "grid", gap: 2 }}>
            {econEvents.map((e, i) => {
              const n = daysUntil(e.date);
              const urgent = n !== null && n >= 0 && n <= 7;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "5px 8px",
                  borderBottom: "1px solid #100C06", background: urgent ? "#120C02" : "transparent",
                }}>
                  <span style={{ color: urgent ? C.amber : C.white, fontSize: 11, minWidth: 78 }}>
                    {new Date(e.date).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                  </span>
                  <span style={{ color: C.white, fontSize: 11, flex: 1 }}>{e.name}</span>
                  {e.upcoming ? (
                    <span style={{ color: C.dim, fontSize: 9, border: `1px solid ${C.border}`, padding: "1px 6px" }}>{t("upcoming")}</span>
                  ) : typeof e.actual === "number" ? (
                    <span style={{ color: C.cyan, fontSize: 11 }}>{e.actual.toLocaleString()}</span>
                  ) : (
                    <span style={{ color: C.dim, fontSize: 11 }}>—</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ color: C.dim, fontSize: 9, marginTop: 8 }}>{t("econNote")}</div>
      </Panel>

      {/* Part 2: per-stock earnings calendar (unchanged) */}
      <Panel title={t("calendarTitle")}>
        {err && <div style={{ color: C.red, fontSize: 11 }}>{err}</div>}
        {dated.length === 0 && undated.length === 0 && (
          <Val color={C.dim} size={11}>{t("noCalendar")}</Val>
        )}

        <div style={{ display: "grid", gap: 6 }}>
          {dated.map((e) => {
            const n = daysUntil(e.date);
            const urgent = n !== null && n >= 0 && n <= 7;
            const past = n !== null && n < 0;
            return (
              <div key={e.symbol}
                style={{
                  border: `1px solid ${urgent ? "var(--amber-dim)" : C.border}`,
                  background: urgent ? "#120C02" : "transparent",
                  padding: 8, opacity: past ? 0.5 : 1,
                  display: "grid", gap: 8,
                  gridTemplateColumns: "84px 1fr",
                }}>
                {/* date block */}
                <div style={{ textAlign: "center", borderRight: `1px solid ${C.border}`, paddingRight: 8 }}>
                  <div style={{ color: urgent ? C.amber : C.white, fontSize: 15, fontWeight: 700 }}>
                    {new Date(e.date).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                  </div>
                  <div style={{ color: C.dim, fontSize: 9 }}>
                    {new Date(e.date).toLocaleDateString(locale, { weekday: "short" })}
                  </div>
                  <div style={{ color: urgent ? C.amber : C.dim, fontSize: 10, marginTop: 2 }}>
                    {dayLabel(n)}
                  </div>
                  {e.dateEstimated && (
                    <div style={{ color: C.dim, fontSize: 8, marginTop: 1 }}>({t("estimated")})</div>
                  )}
                </div>

                {/* details */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
                    <span style={{ color: C.amber, fontSize: 12, fontWeight: 700 }}>
                      {e.symbol.replace(/\.(KS|KQ)$/, "")}
                    </span>
                    <span style={{ color: C.white, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                      {e.name}
                    </span>
                    <span style={{ color: (e.changePct ?? 0) >= 0 ? C.green : C.red, fontSize: 11 }}>
                      {px(e.price, e.currency)} {(e.changePct ?? 0) >= 0 ? "▲" : "▼"}
                      {Math.abs(e.changePct ?? 0).toFixed(1)}%
                    </span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 5 }}>
                    <span>
                      <Label>{t("consEPS")} </Label>
                      <Val color={typeof e.consensusEPS === "number" && e.consensusEPS < 0 ? C.red : C.white} size={11}>
                        {typeof e.consensusEPS === "number" ? e.consensusEPS.toLocaleString() : "—"}
                      </Val>
                      {typeof e.consensusEPSLow === "number" && (
                        <Val color={C.dim} size={9}>
                          {" "}[{e.consensusEPSLow.toLocaleString()}…{e.consensusEPSHigh?.toLocaleString()}]
                        </Val>
                      )}
                    </span>
                    <span>
                      <Label>{t("consRev")} </Label>
                      <Val size={11}>{bigNum(e.consensusRev, e.currency)}</Val>
                    </span>
                    {e.analysts && (
                      <span><Label>{t("analysts")} </Label><Val size={11}>{e.analysts}</Val></span>
                    )}
                    {e.exDividend && (
                      <span>
                        <Label>{t("exDiv")} </Label>
                        <Val color={C.cyan} size={11}>
                          {new Date(e.exDividend).toLocaleDateString(locale, { month: "short", day: "numeric" })}
                        </Val>
                      </span>
                    )}
                  </div>

                  {/* surprise history */}
                  {e.history?.length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Label>{t("surpriseHist")}</Label>
                      {e.history.map((h, i) => {
                        const beat = (h.surprisePct ?? 0) >= 0;
                        return (
                          <span key={i}
                            style={{
                              border: `1px solid ${beat ? C.green : C.red}`,
                              color: beat ? C.green : C.red,
                              fontSize: 9, padding: "1px 5px",
                            }}>
                            {beat ? "▲" : "▼"}{" "}
                            {h.surprisePct !== null ? `${h.surprisePct >= 0 ? "+" : ""}${h.surprisePct.toFixed(0)}%` : "—"}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {undated.length > 0 && (
            <div style={{ marginTop: 4 }}>
              <Label>{t("noDate")}</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {undated.map((e) => (
                  <span key={e.symbol} style={{ border: `1px solid ${C.border}`, color: C.dim, fontSize: 10, padding: "3px 8px" }}>
                    {e.symbol.replace(/\.(KS|KQ)$/, "")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
