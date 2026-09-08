import { createSupabaseClient, type SupabaseClient, type Database } from "@repo/shared";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Until a real Supabase project is connected (see SETUP.md at the repo
// root), env vars are missing. Rather than crash the whole app on load
// (which would make the Phase 0 skeleton unusable to preview), we fall back
// to a harmless placeholder client and let AuthProvider show a clear "not
// configured yet" banner instead.
export const supabase: SupabaseClient<Database> = createSupabaseClient({
  url: url ?? "https://placeholder.supabase.co",
  anonKey: anonKey ?? "placeholder-anon-key",
});
