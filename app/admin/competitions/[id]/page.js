import Link from "next/link";
import { requireAdmin } from "../../../../lib/requireAdmin";
import { supabaseAdmin } from "../../../../lib/adminSupabase";
import { adminSupabaseServerClient } from "../../../../lib/adminSupabaseServerClient";
import { computeLeaderboard } from "../../../../lib/competitionLeaderboard";
import { adjustCash } from "../../actions";

const panel = { background: "var(--panel)", border: "1px solid var(--border)", marginBottom: 16 };
const panelHead = { background: "#1A1204", borderBottom: "1px solid var(--border)", padding: "6px 10px", color: "var(--amber)", fontSize: 11, letterSpacing: 2 };
const panelBody = { padding: 14 };
const inputS = { background: "#0D0800", border: "1px solid var(--border)", outline: "none", color: "var(--amber)", fontSize: 12, padding: "6px 8px", width: 100 };
const btn = { background: "var(--amber)", color: "#000", border: "1px solid var(--amber)", fontSize: 11, letterSpacing: 1, padding: "6px 10px", cursor: "pointer" };

async function fetchLeaderboard(competitionId) {
  const supabase = adminSupabaseServerClient();
  try {
    return await computeLeaderboard(supabase, competitionId);
  } catch (e) {
    console.warn(`[admin] leaderboard fetch failed: ${e.message}`);
    return [];
  }
}

export default async function CompetitionDetailPage({ params }) {
  await requireAdmin();
  const { id } = params;

  const { data: competition } = await supabaseAdmin.from("competitions").select("*").eq("id", id).maybeSingle();
  if (!competition) {
    return <div style={{ padding: 20, color: "var(--red)" }}>Competition not found. <Link href="/">Back</Link></div>;
  }

  const ranked = await fetchLeaderboard(id);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: 20 }}>
      <div style={{ marginBottom: 10 }}><Link href="/">← all competitions</Link></div>
      <div style={{ color: "var(--amber)", fontWeight: 700, fontSize: 14, marginBottom: 16 }}>{competition.name}</div>

      <div style={panel}>
        <div style={panelHead}>LEADERBOARD ({ranked.length} participants)</div>
        <div style={{ ...panelBody, overflowX: "auto" }}>
          {ranked.length === 0 && <div style={{ color: "var(--amber-dim)", fontSize: 11 }}>No participants yet.</div>}
          {ranked.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--amber-dim)" }}>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>#</th>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>TRADER</th>
                  <th style={{ textAlign: "right", padding: "4px 6px" }}>CASH</th>
                  <th style={{ textAlign: "right", padding: "4px 6px" }}>EQUITY</th>
                  <th style={{ textAlign: "right", padding: "4px 6px" }}>RETURN</th>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>HOLDINGS</th>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>ADJUST CASH</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((r, i) => (
                  <tr key={r.participantId} style={{ borderBottom: "1px solid #100C06" }}>
                    <td style={{ padding: "6px", color: "var(--amber)" }}>#{i + 1}</td>
                    <td style={{ padding: "6px", color: "var(--white)" }}>{r.displayName}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: "var(--white)" }}>${Number(r.cash).toLocaleString()}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: "var(--cyan)" }}>${Number(r.equity).toFixed(0)}</td>
                    <td style={{ padding: "6px", textAlign: "right", color: r.returnPct >= 0 ? "var(--green)" : "var(--red)" }}>
                      {r.returnPct >= 0 ? "+" : ""}{r.returnPct.toFixed(2)}%
                    </td>
                    <td style={{ padding: "6px", color: "var(--amber-dim)" }}>
                      {r.holdings.length === 0 ? "—" : r.holdings.map((h) => `${h.symbol} ${h.shares}`).join(", ")}
                    </td>
                    <td style={{ padding: "6px" }}>
                      <form action={adjustCash} style={{ display: "flex", gap: 4 }}>
                        <input type="hidden" name="participant_id" value={r.participantId} />
                        <input type="hidden" name="competition_id" value={competition.id} />
                        <input style={inputS} name="delta" type="number" placeholder="+/- amount" step="any" />
                        <button style={btn} type="submit">APPLY</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
