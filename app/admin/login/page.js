"use client";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminSupabaseBrowserClient } from "../../../lib/adminSupabaseBrowser";

const inputS = {
  background: "#0D0800", border: "1px solid var(--border)", outline: "none",
  color: "var(--amber)", fontSize: 13, padding: "10px 12px", width: "100%",
  caretColor: "var(--amber)", marginBottom: 10,
};
const btn = {
  background: "var(--amber)", color: "#000", border: "1px solid var(--amber)",
  fontSize: 12, letterSpacing: 1, padding: "10px 14px", cursor: "pointer", width: "100%",
};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const notAuthorized = params.get("error") === "not_authorized";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const signIn = async () => {
    setBusy(true); setErr(null);
    const supabase = adminSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    router.push("/");
    router.refresh();
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 320, background: "var(--panel)", border: "1px solid var(--border)", padding: 20 }}>
        <div style={{ color: "var(--amber)", fontWeight: 700, fontSize: 14, letterSpacing: 2, marginBottom: 4 }}>
          📈 FINCLUB <span style={{ color: "var(--white)" }}>ADMIN</span>
        </div>
        <div style={{ color: "var(--amber-dim)", fontSize: 10, marginBottom: 16 }}>
          Competition administration console
        </div>
        {notAuthorized && (
          <div style={{ color: "var(--red)", fontSize: 11, marginBottom: 10 }}>
            That account is not an admin. Ask an existing admin to add your user_id to the `admins` table.
          </div>
        )}
        <input style={inputS} type="email" placeholder="EMAIL" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input style={inputS} type="password" placeholder="PASSWORD" value={password}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()} />
        <button style={btn} onClick={signIn} disabled={busy}>{busy ? "..." : "LOG IN →"}</button>
        {err && <div style={{ color: "var(--red)", fontSize: 11, marginTop: 10 }}>{err}</div>}
      </div>
    </div>
  );
}
