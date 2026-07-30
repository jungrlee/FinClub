"use client";
import { useState, useEffect, useCallback } from "react";
import { C, Label, Val, Panel } from "./ui";
import { ago } from "../lib/format";

export default function News({ t }) {
  const [news, setNews] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/news");
      const d = await r.json();
      setNews(d.news || []);
      if (!r.ok) setErr(d.error || "failed to load news");
      else setErr(null);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div style={{ flex: 1, padding: 6, overflow: "auto" }}>
      <Panel title={t("newsTitle")}>
        {err && <div style={{ color: C.red, fontSize: 11, marginBottom: 8 }}>{err}</div>}
        {news === null && <Val color={C.dim} size={11}><span className="blink">█</span> {t("loadingNews")}</Val>}
        {news && news.length === 0 && !err && <Val color={C.dim} size={11}>{t("noNews")}</Val>}
        <div style={{ display: "grid", gap: 8 }}>
          {(news || []).map((n, i) => (
            <a key={i} href={n.u} target="_blank" rel="noreferrer"
              style={{
                display: "flex", gap: 10, padding: "8px 6px", borderBottom: "1px solid #100C06",
                textDecoration: "none", color: "inherit",
              }}>
              {n.img && (
                <img src={n.img} alt="" style={{ width: 72, height: 48, objectFit: "cover", flexShrink: 0, background: "#141008" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 2 }}>
                  <span style={{ color: C.cyan, fontSize: 10, whiteSpace: "nowrap" }}>{n.s}</span>
                  <span style={{ color: C.dim, fontSize: 9 }}>{ago(n.t)}</span>
                  {n.category && <span style={{ color: C.dim, fontSize: 9, textTransform: "uppercase" }}>· {n.category}</span>}
                </div>
                <div style={{ color: C.white, fontSize: 12, lineHeight: 1.4 }}>{n.h}</div>
              </div>
            </a>
          ))}
        </div>
      </Panel>
    </div>
  );
}
