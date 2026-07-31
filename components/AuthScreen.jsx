"use client";
import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useT } from "../lib/i18n";

const input = {
  background: "#0D0800", border: "1px solid var(--border)", outline: "none",
  color: "var(--amber)", fontSize: 13, padding: "9px 10px", width: "100%",
  caretColor: "var(--amber)",
};
const btn = (primary) => ({
  background: primary ? "var(--amber)" : "transparent",
  color: primary ? "#000" : "var(--amber)",
  border: `1px solid ${primary ? "var(--amber)" : "var(--amber-dim)"}`,
  fontSize: 12, letterSpacing: 1, padding: "8px 18px", cursor: "pointer",
});

export default function AuthScreen() {
  const [lang, setLang] = useState("en");
  const t = useT(lang);
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password: pw });
        if (error) throw error;
        setMsg({ ok: true, t: t("signupOk") });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
      }
    } catch (e) {
      setMsg({ ok: false, t: e.message });
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: 400, maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div style={{ fontSize: 26, letterSpacing: 3, color: "var(--amber)", marginBottom: 2 }}>
            📈 FIN<span style={{ color: "var(--white)" }}>CLUB</span>
          </div>
          <button
            onClick={() => setLang(lang === "en" ? "ko" : "en")}
            style={{ ...btn(false), marginLeft: "auto", padding: "3px 10px" }}>
            {lang === "en" ? "🇰🇷 한국어" : "🇺🇸 EN"}
          </button>
        </div>
        <div style={{ color: "var(--amber-dim)", fontSize: 10, letterSpacing: 2, marginBottom: 22 }}>
          {t("tagline")} <span className="blink">▮</span>
        </div>

        <div style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
          <div style={{ background: "#1A1204", color: "var(--amber)", fontSize: 10, letterSpacing: 2, padding: "4px 10px", borderBottom: "1px solid var(--border)" }}>
            {mode === "login" ? t("login") : t("signup")}
          </div>
          <div style={{ display: "grid", gap: 12, padding: 14 }}>
            <div>
              <div style={{ color: "var(--amber-dim)", fontSize: 10, letterSpacing: 1, marginBottom: 3 }}>{t("email")}</div>
              <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </div>
            <div>
              <div style={{ color: "var(--amber-dim)", fontSize: 10, letterSpacing: 1, marginBottom: 3 }}>{t("password")}</div>
              <input style={input} type="password" value={pw}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                autoComplete={mode === "signup" ? "new-password" : "current-password"} />
            </div>
            {msg && (
              <div style={{ color: msg.ok ? "var(--green)" : "var(--red)", fontSize: 11, lineHeight: 1.5 }}>{msg.t}</div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button style={btn(true)} onClick={submit} disabled={busy}>
                {busy ? "..." : mode === "login" ? t("loginBtn") : t("signupBtn")}
              </button>
              <button style={btn(false)} onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(null); }}>
                {mode === "login" ? t("newUser") : t("haveAccount")}
              </button>
            </div>
          </div>
        </div>

        <div style={{ color: "var(--amber-dim)", fontSize: 9, marginTop: 14, lineHeight: 1.6 }}>
          {t("authFooter")}
        </div>
      </div>
    </div>
  );
}
