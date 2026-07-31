"use client";
import { useEffect, useState } from "react";
import { supabase, isConfigured } from "../lib/supabaseClient";
import AuthScreen from "../components/AuthScreen";
import Terminal from "../components/Terminal";
export const dynamic = "force-dynamic";

export default function Home() {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (!isConfigured)
    return (
      <div style={{ padding: 40, color: "var(--red)", fontSize: 13, lineHeight: 1.7 }}>
        Supabase is not configured.<br />
        Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your
        Vercel environment variables, then redeploy.
      </div>
    );
  if (session === undefined)
    return (
      <div style={{ padding: 40, color: "var(--amber)" }}>
        <span className="blink">▮</span> BOOTING FINCLUB...
      </div>
    );

  if (!session) return <AuthScreen />;
  return <Terminal session={session} />;
}
