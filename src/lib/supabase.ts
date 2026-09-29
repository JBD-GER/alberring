import { Capacitor } from "@capacitor/core";
import { authStorage } from "../services/platform/storage";
import { fetchWithTimeout } from "../services/platform/network";
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const isSupabaseConfigured = Boolean(url && key);
export const supabase = createClient(
  url ?? "http://127.0.0.1:54321",
  key ?? "local-anon-key-not-configured",
  {
    global: { fetch: fetchWithTimeout },
    auth: {
      storage: authStorage,
      flowType: Capacitor.isNativePlatform() ? "pkce" : "implicit",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: !Capacitor.isNativePlatform(),
    },
  },
);
