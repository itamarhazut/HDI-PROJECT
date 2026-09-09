import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, InventoryReason } from "../types/database";

// Small typed wrappers around our custom Postgres RPCs (see
// supabase/migrations/0001_init.sql), called through supabase-js's
// `.rpc()` instead of letting every call site spell out the function name
// as a raw string.
//
// Earlier versions of this file cast `.rpc()` to `any` internally to work
// around what looked like a supabase-js generic-typing bug. The real cause
// turned out to be in database.ts: every Row/Insert/Update/Args type there
// was declared with `interface`, and TypeScript only infers the implicit
// string index signature that supabase-js's `GenericSchema` constraint
// needs for object type *literals*, not for `interface` declarations. Once
// database.ts switched those to `type` aliases, `SupabaseClient<Database>`
// resolves correctly end-to-end and this file no longer needs any cast.

export async function linkOrCreateCustomerForCurrentUser(
  client: SupabaseClient<Database>,
  args: { phone: string | null; fullName: string | null }
): Promise<string> {
  const { data, error } = await client.rpc("link_or_create_customer_for_current_user", {
    p_phone: args.phone,
    p_full_name: args.fullName,
  });
  if (error) throw error;
  return data;
}

export async function recordInventoryTransaction(
  client: SupabaseClient<Database>,
  args: { inventoryItemId: string; jobId: string | null; quantityDelta: number; reason: InventoryReason }
): Promise<string> {
  const { data, error } = await client.rpc("record_inventory_transaction", {
    p_inventory_item_id: args.inventoryItemId,
    p_job_id: args.jobId,
    p_quantity_delta: args.quantityDelta,
    p_reason: args.reason,
  });
  if (error) throw error;
  return data;
}
