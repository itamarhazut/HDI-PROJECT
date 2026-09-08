import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, InventoryReason } from "../types/database";

// Small typed wrappers around our custom Postgres RPCs (see
// supabase/migrations/0001_init.sql), called through supabase-js's
// low-level `.rpc()` (cast internally — see note below) instead of letting
// every call site spell out the function name as a raw string.
//
// Note: supabase-js's generic `.rpc<FnName>()` typing does not currently
// resolve correctly against a hand-written `Database` type in this
// combination of supabase-js/TypeScript versions (the Schema type param
// collapses to `never` even though `Database["public"]` structurally
// satisfies its own `GenericSchema` constraint when checked directly).
// Isolating the `any` cast here, behind a fully-typed function signature,
// keeps every call site type-safe without chasing that library issue.
// Worth re-checking after a supabase-js upgrade or once real generated
// types (`supabase gen types`) replace database.ts.

export async function linkOrCreateCustomerForCurrentUser(
  client: SupabaseClient<Database>,
  args: { phone: string | null; fullName: string | null }
): Promise<string> {
  const { data, error } = await (client as any).rpc("link_or_create_customer_for_current_user", {
    p_phone: args.phone,
    p_full_name: args.fullName,
  });
  if (error) throw error;
  return data as string;
}

export async function recordInventoryTransaction(
  client: SupabaseClient<Database>,
  args: { inventoryItemId: string; jobId: string | null; quantityDelta: number; reason: InventoryReason }
): Promise<string> {
  const { data, error } = await (client as any).rpc("record_inventory_transaction", {
    p_inventory_item_id: args.inventoryItemId,
    p_job_id: args.jobId,
    p_quantity_delta: args.quantityDelta,
    p_reason: args.reason,
  });
  if (error) throw error;
  return data as string;
}
