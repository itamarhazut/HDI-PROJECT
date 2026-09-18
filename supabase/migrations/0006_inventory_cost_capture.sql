-- ============================================================================
-- 0006_inventory_cost_capture.sql
--
-- Records what a part cost at the moment it was used, so job costing stays
-- honest as prices move.
--
-- Run in the Supabase dashboard's SQL Editor. Safe to run twice.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- The cost of the stock at the time of the movement.
--
-- Without this, "what did this job cost me in materials" would be computed
-- from inventory_items.unit_cost as it stands *today*. Copper moves; a job
-- from eight months ago would silently be re-priced at today's figure every
-- time the report was opened, and last year's profit would change by itself.
-- Captured inside the RPC below rather than passed in by the caller, so it
-- can't be forgotten at a call site.
-- ----------------------------------------------------------------------------
alter table public.inventory_transactions add column if not exists unit_cost numeric;

comment on column public.inventory_transactions.unit_cost is
  'The item''s unit_cost when this movement was recorded. Historical — never back-filled from the item''s current cost.';


create or replace function public.record_inventory_transaction(
  p_inventory_item_id uuid,
  p_job_id uuid,
  p_quantity_delta numeric,
  p_reason public.inventory_reason
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_transaction_id uuid;
  v_unit_cost numeric;
begin
  if not public.is_admin() then
    raise exception 'only admins can record inventory transactions';
  end if;

  select unit_cost into v_unit_cost from public.inventory_items where id = p_inventory_item_id;

  insert into public.inventory_transactions
    (inventory_item_id, job_id, quantity_delta, reason, unit_cost, created_by)
  values
    (p_inventory_item_id, p_job_id, p_quantity_delta, p_reason, v_unit_cost, auth.uid())
  returning id into v_transaction_id;

  update public.inventory_items
     set quantity_on_hand = quantity_on_hand + p_quantity_delta
   where id = p_inventory_item_id;

  return v_transaction_id;
end;
$$;
