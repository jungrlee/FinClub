"use client";
import { useState, useEffect, useRef } from "react";
import { C, inputS } from "./ui";

// Debounced ticker/company-name autocomplete. Controlled like a plain
// input (value/onChange) so parents keep their existing state wiring;
// picking a suggestion also fires onSelect(candidate) for any extra
// side effect a parent wants (e.g. immediately resolving a quote).
export default function TickerInput({ value, onChange, market, placeholder, onSelect, onEnter }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (!q) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&market=${market}`);
        const d = await r.json();
        const results = d.results || [];
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch (_) {
        // best-effort — never blocks typing
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [value, market]);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const pick = (cand) => {
    onChange(cand.symbol);
    setOpen(false);
    onSelect?.(cand);
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        style={inputS}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setOpen(false); onEnter?.(); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 60,
          background: "#0D0800", border: `1px solid ${C.border}`, maxHeight: 220, overflowY: "auto",
        }}>
          {suggestions.map((s) => (
            <div key={s.symbol} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)}
              style={{ padding: "6px 8px", cursor: "pointer", fontSize: 11, borderBottom: "1px solid #100C06" }}>
              <span style={{ color: C.amber }}>{s.symbol}</span>{" "}
              <span style={{ color: C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
