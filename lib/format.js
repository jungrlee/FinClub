"use client";
import { useEffect, useRef, useState, useCallback } from "react";

// ---------------------------------------------------------------- format
export const bigNum = (n, currency) => {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  if (currency === "KRW") {
    if (Math.abs(n) >= 1e12) return `₩${(n / 1e12).toFixed(1)}조`;
    if (Math.abs(n) >= 1e8) return `₩${(n / 1e8).toFixed(0)}억`;
    return `₩${Math.round(n).toLocaleString()}`;
  }
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
};

export const px = (n, currency) => {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  const kr = currency === "KRW";
  return (
    (kr ? "₩" : "$") +
    n.toLocaleString("en-US", {
      maximumFractionDigits: kr ? 0 : 2,
      minimumFractionDigits: kr ? 0 : 2,
    })
  );
};

export const pctStr = (n, d = 1) =>
  typeof n === "number" && isFinite(n) ? `${n >= 0 ? "" : ""}${n.toFixed(d)}%` : "—";

export const signed = (n, currency) => {
  if (typeof n !== "number" || !isFinite(n)) return "—";
  return (n >= 0 ? "+" : "−") + px(Math.abs(n), currency);
};

export const ago = (ts) => {
  if (!ts) return "";
  const t = typeof ts === "number" ? ts * 1000 : new Date(ts).getTime();
  const h = Math.floor((Date.now() - t) / 3600000);
  if (h < 1) return "now";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
};

export const daysUntil = (d) => {
  if (!d) return null;
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((t - now) / 86400000);
};

// ---------------------------------------------------------------- realtime
// Polls /api/quotes-batch on an interval. Pauses when the tab is hidden
// (saves the Yahoo endpoint and the user's battery) and slows down when
// every tracked market is closed.
export function useRealtimeQuotes(symbols, enabled) {
  const [quotes, setQuotes] = useState({});
  const [lastTick, setLastTick] = useState(null);
  const [flash, setFlash] = useState({}); // symbol -> 'up' | 'down'
  const prev = useRef({});
  const timer = useRef(null);
  const key = symbols.slice().sort().join(",");

  const poll = useCallback(async () => {
    if (!key) return;
    try {
      const r = await fetch(`/api/quotes-batch?symbols=${encodeURIComponent(key)}`);
      if (!r.ok) return;
      const { quotes: q } = await r.json();
      const f = {};
      for (const s of Object.keys(q)) {
        const before = prev.current[s]?.price;
        const after = q[s].price;
        if (typeof before === "number" && typeof after === "number" && before !== after) {
          f[s] = after > before ? "up" : "down";
        }
      }
      prev.current = q;
      setQuotes(q);
      setLastTick(Date.now());
      if (Object.keys(f).length) {
        setFlash(f);
        setTimeout(() => setFlash({}), 900);
      }
    } catch (_) {}
  }, [key]);

  useEffect(() => {
    if (!enabled || !key) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    poll();
    const schedule = () => {
      if (timer.current) clearInterval(timer.current);
      const anyOpen = Object.values(prev.current).some(
        (q) => q.marketState === "REGULAR" || q.marketState === "PRE" || q.marketState === "POST"
      );
      const ms = document.hidden ? 120000 : anyOpen ? 15000 : 60000;
      timer.current = setInterval(poll, ms);
    };
    schedule();
    const onVis = () => schedule();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, key, poll]);

  return { quotes, lastTick, flash, refetch: poll };
}
