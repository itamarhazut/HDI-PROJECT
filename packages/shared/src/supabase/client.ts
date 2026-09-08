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
    },
  });
}

export type { SupabaseClient };
