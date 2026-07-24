"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import AuthScreen from "../components/AuthScreen";
import Terminal from "../components/Terminal";

export default function Home() {
  const [session, setSession] = useState(undefined); // undefined = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined)
    return (
      <div style={{ padding: 40, color: "var(--amber)" }}>
        <span className="blink">▮</span> BOOTING WHALESMARKET...
      </div>
    );

  if (!session) return <AuthScreen />;
  return <Terminal session={session} />;
}
