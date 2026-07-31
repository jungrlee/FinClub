import Link from "next/link";
import { requireAdmin } from "../../lib/requireAdmin";
import { supabaseAdmin } from "../../lib/adminSupabase";
import { createCompetition } from "./actions";

const panel = { background: "var(--panel)", border: "1px solid var(--border)", marginBottom: 16 };
const panelHead = { background: "#1A1204", borderBottom: "1px solid var(--border)", padding: "6px 10px", color: "var(--amber)", fontSize: 11, letterSpacing: 2 };
const panelBody = { padding: 14 };
const inputS = { background: "#0D0800", border: "1px solid var(--border)", outline: "none", color: "var(--amber)", fontSize: 12, padding: "8px 10px", width: "100%" };
const label = { color: "var(--amber-dim)", fontSize: 10, letterSpacing: 1, display: "block", marginBottom: 4 };
const btn = { background: "var(--amber)", color: "#000", border: "1px solid var(--amber)", fontSize: 11, letterSpacing: 1, padding: "8px 14px", cursor: "pointer" };

function status(c) {
  const today = new Date().toISOString().slice(0, 10);
  if (today < c.start_date) return { label: "UPCOMING", color: "var(--amber-dim)" };
  if (today > c.end_date) return { label: "ENDED", color: "var(--red)" };
  return { label: "ACTIVE", color: "var(--green)" };
}

export default async function DashboardPage() {
  const user = await requireAdmin();

  const { data: competitions } = await supabaseAdmin
    .from("competitions")
    .select("*")
    .order("start_date", { ascending: false });

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div style={{ color: "var(--amber)", fontWeight: 700, fontSize: 14, letterSpacing: 2 }}>
          📈 FINCLUB <span style={{ color: "var(--white)" }}>ADMIN</span>
        </div>
        <div style={{ color: "var(--amber-dim)", fontSize: 11 }}>{user.email}</div>
      </div>

      <div style={panel}>
        <div style={panelHead}>COMPETITIONS</div>
        <div style={panelBody}>
          {(!competitions || competitions.length === 0) && (
            <div style={{ color: "var(--amber-dim)", fontSize: 11, marginBottom: 10 }}>No competitions yet.</div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <tbody>
              {(competitions || []).map((c) => {
                const s = status(c);
                return (
                  <tr key={c.id} style={{ borderBottom: "1px solid #100C06" }}>
                    <td style={{ padding: "8px 4px", color: "var(--white)" }}>
                      <Link href={`/competitions/${c.id}`}>{c.name}</Link>
                    </td>
                    <td style={{ padding: "8px 4px", color: "var(--amber-dim)" }}>{c.start_date} → {c.end_date}</td>
                    <td style={{ padding: "8px 4px", color: "var(--cyan)" }}>${Number(c.starting_cash).toLocaleString()}</td>
                    <td style={{ padding: "8px 4px", color: s.color }}>{s.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={panel}>
        <div style={panelHead}>CREATE COMPETITION</div>
        <form action={createCompetition} style={{ padding: 14, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
          <div>
            <label style={label}>NAME</label>
            <input style={inputS} name="name" placeholder="Fall 2026 Trading Challenge" required />
          </div>
          <div>
            <label style={label}>STARTING CASH (USD)</label>
            <input style={inputS} name="starting_cash" type="number" defaultValue={1000000} required />
          </div>
          <div>
            <label style={label}>START DATE</label>
            <input style={inputS} name="start_date" type="date" required />
          </div>
          <div>
            <label style={label}>END DATE</label>
            <input style={inputS} name="end_date" type="date" required />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" name="allow_short" defaultChecked id="allow_short" />
            <label htmlFor="allow_short" style={{ color: "var(--white)", fontSize: 11 }}>Allow short selling</label>
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button style={btn} type="submit">CREATE</button>
          </div>
        </form>
      </div>
    </div>
  );
}
