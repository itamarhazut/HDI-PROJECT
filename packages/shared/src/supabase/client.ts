import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

export interface SupabaseEnv {
  url: string;
  anonKey: string;
}

/**
 * Single factory used by every app (web, desktop, mobile) so the client is
 * configured identically everywhere. Each app passes in its own env values
 * (Vite uses import.meta.env, Expo uses process.env / expo-constants, etc.)
 * — this package stays framework-agnostic.
 */
export function createSupabaseClient(env: SupabaseEnv): SupabaseClient<Database> {
  if (!env.url || !env.anonKey) {
    throw new Error(
      "Supabase env vars missing. Set the project URL and anon key (see .env.example)."
    );
  }
  return createClient<Database>(env.url, env.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Explicit, not the library default: PKCE puts the recovery/verification
      // token in a real "?code=..." query string, which survives sitting
      // after this app's hash-router fragment (e.g. "/#/reset-password?code=..."
      // — react-router-dom's hash router parses that trailing "?code=..." as
      // its own in-app search params, same as it would on a normal path).
      // The older "implicit" flow instead appends "#access_token=...&type=
      // recovery" as a second, competing hash fragment, which collides with
      // the router's own hash-based routing — see ResetPasswordPage.tsx.
      flowType: "pkce",
    },
  });
}

export type { SupabaseClient };
