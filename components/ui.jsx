"use client";

export const C = {
  amber: "var(--amber)", dim: "var(--amber-dim)", green: "var(--green)",
  red: "var(--red)", cyan: "var(--cyan)", white: "var(--white)",
  panel: "var(--panel)", border: "var(--border)",
};

export const Label = ({ children }) => (
  <span style={{ color: C.dim, fontSize: 10, letterSpacing: 1 }}>{children}</span>
);

export const Val = ({ children, color = C.white, size = 12 }) => (
  <span style={{ color, fontSize: size }}>{children}</span>
);

export const btn = (primary) => ({
  background: primary ? "var(--amber)" : "transparent",
  color: primary ? "#000" : "var(--amber)",
  border: `1px solid ${primary ? "var(--amber)" : "var(--amber-dim)"}`,
  fontSize: 11, letterSpacing: 1, padding: "5px 12px", cursor: "pointer",
});

export const inputS = {
  background: "#0D0800", border: "1px solid var(--border)", outline: "none",
  color: "var(--amber)", fontSize: 12, padding: "8px 10px", width: "100%",
  caretColor: "var(--amber)",
};

export function Panel({ title, right, children, style }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", minHeight: 0, ...style }}>
      <div style={{ background: "#1A1204", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "3px 8px" }}>
        <span style={{ color: C.amber, fontSize: 10, letterSpacing: 2 }}>{title}</span>
        {right && <span style={{ marginLeft: "auto" }}>{right}</span>}
      </div>
      <div style={{ padding: 8, overflow: "auto", flex: 1 }}>{children}</div>
    </div>
  );
}

export function ProbBar({ label, pct, color }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Label>{label}</Label>
        <Val color={color} size={11}>{pct}%</Val>
      </div>
      <div style={{ background: "#141008", height: 8, marginTop: 2 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 1s" }} />
      </div>
    </div>
  );
}
