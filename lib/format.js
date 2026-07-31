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
// `marketState` (REGULAR/PRE/POST) is only ever populated by Yahoo's batch
// path — Finnhub and KIS batches never set it — so relying on it alone to
// decide "is any tracked market open" meant the poller was stuck on the
// slow 60s cadence almost all the time, even during real trading hours.
// This wall-clock fallback (rough, DST-approximate) covers that gap.
function isLikelyMarketHours() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun .. 6=Sat
  if (day === 0 || day === 6) return false;
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;
  const usOpen = h >= 13.5 && h < 20; // ~9:30-16:00 ET
  const krOpen = h >= 0 && h < 6.5; // ~09:00-15:30 KST
  return usOpen || krOpen;
}

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
      if (timer.current) clearTimeout(timer.current);
      return;
    }
    let cancelled = false;

    // Recursive setTimeout (not setInterval) so the cadence re-evaluates
    // after every single poll — an open/closed transition mid-session gets
    // picked up immediately, not just on the next visibilitychange.
    const cadence = () => {
      const anyOpen =
        Object.values(prev.current).some(
          (q) => q.marketState === "REGULAR" || q.marketState === "PRE" || q.marketState === "POST"
        ) || isLikelyMarketHours();
      return document.hidden ? 120000 : anyOpen ? 15000 : 60000;
    };
    const loop = async () => {
      await poll();
      if (cancelled) return;
      timer.current = setTimeout(loop, cadence());
    };
    loop();

    const onVis = () => {
      if (!document.hidden) {
        if (timer.current) clearTimeout(timer.current);
        loop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, key, poll]);

  return { quotes, lastTick, flash, refetch: poll };
}
