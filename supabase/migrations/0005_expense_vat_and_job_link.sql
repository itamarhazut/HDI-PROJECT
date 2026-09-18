-- ============================================================================
-- 0005_expense_vat_and_job_link.sql
--
-- Turns the expense log into something the accountant can actually be
-- handed: input VAT (מע״מ תשומות) per expense, the supplier's tax ID, and
-- an optional link to the job the money was spent on.
--
-- Run in the Supabase dashboard's SQL Editor. Safe to run twice.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Input VAT.
--
-- vat_amount is the VAT actually shown on the receipt — normally derived
-- from the gross amount, but typed in directly when it differs (a supplier
-- who is עוסק פטור charges none at all, and some receipts round oddly).
--
-- vat_deductible_rate is the share of that VAT the business may claim, as a
-- fraction: 1 = all of it, 0 = none. It is a per-expense number rather than
-- a rule baked into the code because the rule genuinely varies — most
-- notably for vehicles, where input VAT on a private passenger car is not
-- deductible at all while a commercial vehicle generally is. That is a
-- question for the accountant, not for this schema, so the app stores the
-- decision instead of guessing it.
-- ----------------------------------------------------------------------------
alter table public.expenses add column if not exists vat_amount numeric not null default 0;
alter table public.expenses add column if not exists vat_deductible_rate numeric not null default 1;
alter table public.expenses add column if not exists supplier_tax_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_vat_deductible_rate_check') then
    alter table public.expenses
      add constraint expenses_vat_deductible_rate_check
      check (vat_deductible_rate >= 0 and vat_deductible_rate <= 1);
  end if;
end $$;


-- ----------------------------------------------------------------------------
-- 2. Which job the money was spent on.
--
-- Without this there is no way to ask what a job actually cost, so
-- "profit on this job" can't be answered at all. Optional, because plenty
-- of expenses (insurance, accountancy, fuel) belong to the business rather
-- than to any one job.
--
-- on delete set null: deleting a job must not take the expense — and its
-- VAT claim — with it.
-- ----------------------------------------------------------------------------
alter table public.expenses add column if not exists job_id uuid references public.jobs(id) on delete set null;
alter table public.expenses add column if not exists customer_id uuid references public.customers(id) on delete set null;

create index if not exists expenses_job_idx on public.expenses (job_id);
create index if not exists expenses_customer_idx on public.expenses (customer_id);
create index if not exists expenses_date_idx on public.expenses (expense_date desc);


-- ----------------------------------------------------------------------------
-- 3. The default deductible rate for vehicle and fuel expenses.
--
-- Stored as a setting so it is decided once, with the accountant, instead
-- of being re-decided from memory on every receipt. It seeds at 1 (fully
-- deductible, which is the commercial-vehicle case); an electrician driving
-- a private car should set it to 0 on the settings screen.
-- ----------------------------------------------------------------------------
insert into public.app_settings (key, value)
values ('vehicle_vat_deductible_rate', to_jsonb(1::numeric))
on conflict (key) do nothing;
