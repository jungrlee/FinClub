import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured =
  Boolean(url && anonKey) && !url.includes("xxxx");

// Use harmless placeholders when unconfigured so importing this module never
// throws — the build can prerender, and the UI surfaces the problem instead.
export const supabase = createClient(
  isConfigured ? url : "https://placeholder.supabase.co",
  isConfigured ? anonKey : "placeholder-anon-key"
);