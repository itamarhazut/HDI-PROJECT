-- ============================================================================
-- 0004_invoice_totals_and_payments.sql
--
-- Two things at once, because both change the invoices table and doing them
-- separately would mean migrating it twice:
--
--   1. An invoice becomes a self-contained document with its own subtotal,
--      discount, VAT and total — the way a quote already is. This is what
--      actually fixes the bug where editing an invoice silently stripped
--      the VAT out of its amount.
--   2. Payment tracking: a due date, and a real ledger of payments so a
--      deposit followed by a balance is recordable, with the invoice's
--      status and outstanding balance derived from it automatically.
--
-- Run in the Supabase dashboard's SQL Editor. Safe to run twice.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Invoice totals.
--
-- `amount` keeps its meaning — the final total the customer owes — so
-- nothing that already reads it breaks. What's new is the breakdown behind
-- it, which is what was missing: an invoice created from a quote carried
-- the quote's VAT-inclusive total but line items that were pre-VAT and
-- pre-discount, so re-saving it recomputed the total from the rows and
-- quietly dropped the VAT.
-- ----------------------------------------------------------------------------
alter table public.invoices add column if not exists subtotal numeric not null default 0;
alter table public.invoices add column if not exists discount numeric not null default 0;
alter table public.invoices add column if not exists discount_type text not null default 'fixed';
alter table public.invoices add column if not exists include_vat boolean not null default false;
alter table public.invoices add column if not exists tax_rate numeric not null default 0.18;
alter table public.invoices add column if not exists tax_amount numeric not null default 0;
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists amount_paid numeric not null default 0;

-- The allocation number Israeli tax invoices need from the Tax Authority
-- (חשבוניות ישראל). The threshold for a B2B tax invoice dropped to ₪10,000
-- at the start of 2026 and to ₪5,000 from 1 June 2026, so a lot of ordinary
-- electrical jobs now need one. The number itself is issued by the external
-- invoicing system; this column is where it gets recorded against the
-- internal record.
alter table public.invoices add column if not exists allocation_number text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_discount_type_check'
  ) then
    alter table public.invoices
      add constraint invoices_discount_type_check
      check (discount_type in ('fixed', 'percent'));
  end if;
end $$;

-- Existing invoices: keep the total exactly as it is and describe it
-- honestly. We don't know how any of them split between net and VAT, so
-- they're recorded as a flat amount with no VAT breakdown rather than
-- having one invented for them. New invoices get a real breakdown.
update public.invoices
   set subtotal = amount
 where subtotal = 0 and amount <> 0;

-- Payment terms are immediate, so an invoice is due the day it's issued.
update public.invoices
   set due_date = issued_date
 where due_date is null and issued_date is not null;


-- ----------------------------------------------------------------------------
-- 2. The payment ledger.
--
-- One row per payment received, so a 40% deposit and the balance two weeks
-- later are two entries rather than one number that loses the history.
-- ----------------------------------------------------------------------------
create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  paid_at date not null default current_date,
  amount numeric not null check (amount > 0),
  method text,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index if not exists invoice_payments_invoice_idx on public.invoice_payments (invoice_id);
create index if not exists invoice_payments_paid_at_idx on public.invoice_payments (paid_at);

alter table public.invoice_payments enable row level security;

-- Admin-only, like every other purely operational table. Customers can see
-- their invoices but have no business reading or writing the payment
-- ledger, so they get no policy at all (default deny).
drop policy if exists "invoice_payments_admin_all" on public.invoice_payments;
create policy "invoice_payments_admin_all" on public.invoice_payments
  for all using (public.is_admin()) with check (public.is_admin());


-- ----------------------------------------------------------------------------
-- 3. The invoice keeps itself in sync with its payments.
--
-- Doing this in a trigger rather than in the save button means the balance
-- and the "paid" status are right no matter where a payment is entered
-- from — this app, a future mobile screen, or a correction made by hand in
-- the dashboard.
--
-- Rounding: money here is numeric, but a half-agora tolerance keeps a
-- ₪0.004 rounding residue from leaving an invoice permanently one fraction
-- short of paid.
-- ----------------------------------------------------------------------------
create or replace function public.recalc_invoice_payments()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_paid numeric;
  v_last date;
  v_amount numeric;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);

  select coalesce(sum(amount), 0), max(paid_at)
    into v_paid, v_last
    from public.invoice_payments
   where invoice_id = v_invoice_id;

  select amount into v_amount from public.invoices where id = v_invoice_id;

  update public.invoices
     set amount_paid = v_paid,
         paid_date = case
                       when v_amount > 0 and v_paid >= v_amount - 0.005 then v_last
                       else null
                     end,
         status = case
                    -- A cancelled invoice stays cancelled; recording a
                    -- payment against it shouldn't quietly revive it.
                    when status = 'cancelled' then status
                    when v_amount > 0 and v_paid >= v_amount - 0.005 then 'paid'::public.invoice_status
                    -- Fully paid and then a payment was removed/reduced:
                    -- it is no longer paid.
                    when status = 'paid' then 'pending'::public.invoice_status
                    else status
                  end
   where id = v_invoice_id;

  return null;
end;
$$;

drop trigger if exists invoice_payments_recalc on public.invoice_payments;
create trigger invoice_payments_recalc
  after insert or update or delete on public.invoice_payments
  for each row execute function public.recalc_invoice_payments();


-- ----------------------------------------------------------------------------
-- 4. Changing an invoice's amount re-evaluates whether it's now settled.
--
-- Without this, editing a ₪1,000 invoice down to ₪400 after ₪400 was paid
-- would leave it sitting as unpaid forever.
-- ----------------------------------------------------------------------------
create or replace function public.recalc_invoice_on_amount_change()
returns trigger
language plpgsql
as $$
begin
  if new.amount is distinct from old.amount then
    if new.status <> 'cancelled' then
      if new.amount > 0 and new.amount_paid >= new.amount - 0.005 then
        new.status := 'paid'::public.invoice_status;
      elsif new.status = 'paid' then
        new.status := 'pending'::public.invoice_status;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_recalc_on_amount_change on public.invoices;
create trigger invoices_recalc_on_amount_change
  before update on public.invoices
  for each row execute function public.recalc_invoice_on_amount_change();
