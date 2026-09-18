-- ============================================================================
-- 0003_correctness_fixes.sql
--
-- Fixes things that were quietly wrong rather than visibly broken: the VAT
-- rate, and the two timestamp columns the dashboard reads but nothing ever
-- wrote. Also adds the indexes the app's hottest queries were missing.
--
-- Run in the Supabase dashboard's SQL Editor. Safe to run twice.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. VAT is 18%, and has been since 1 January 2025.
--
-- The database was seeded at 0.17 while the app carried a DEFAULT_VAT_RATE
-- constant of 0.18. The save path used the database value and the on-screen
-- total, the preview and the PDF used the constant — so the customer was
-- shown 18% while 17% was stored against the quote.
--
-- The app now reads this row and nothing else (see useVatRate.ts), so this
-- is the single source of truth. Changing it here, or from the settings
-- screen, changes it everywhere.
-- ----------------------------------------------------------------------------
insert into public.app_settings (key, value)
values ('vat_rate', to_jsonb(0.18::numeric))
on conflict (key) do update set value = excluded.value;

-- New quotes that somehow save without an explicit rate land on 18 too.
alter table public.quotes alter column tax_rate set default 0.18;


-- ----------------------------------------------------------------------------
-- 2. jobs.completed_at actually gets written.
--
-- The dashboard's "עבודות שהושלמו החודש" filters on completed_at, but no
-- screen ever set it, so the number was permanently 0. Doing this in a
-- trigger rather than in the save button means it stays correct no matter
-- which screen (or future mobile app, or customer-portal action) moves a
-- job to completed.
--
-- Moving a job back out of "completed" clears the stamp, so the figure
-- can't count a job that was un-completed.
-- ----------------------------------------------------------------------------
create or replace function public.stamp_job_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists jobs_stamp_completed_at on public.jobs;
create trigger jobs_stamp_completed_at
  before insert or update on public.jobs
  for each row execute function public.stamp_job_completed_at();


-- ----------------------------------------------------------------------------
-- 3. invoices.paid_date actually gets written.
--
-- Same story: the dashboard's revenue chart groups paid invoices by
-- paid_date, which nothing ever set — so the chart was empty regardless of
-- how much had actually been collected.
-- ----------------------------------------------------------------------------
create or replace function public.stamp_invoice_paid_date()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'paid' then
    if tg_op = 'INSERT' or old.status is distinct from 'paid' then
      new.paid_date := coalesce(new.paid_date, current_date);
    end if;
  else
    new.paid_date := null;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_stamp_paid_date on public.invoices;
create trigger invoices_stamp_paid_date
  before insert or update on public.invoices
  for each row execute function public.stamp_invoice_paid_date();


-- ----------------------------------------------------------------------------
-- 4. Indexes for the queries the app runs constantly.
--
-- None of these hurt at today's data volume; they're here so they're
-- already in place as history builds up. scheduled_date in particular is
-- re-queried every time the dashboard calendar changes month.
-- ----------------------------------------------------------------------------
create index if not exists jobs_scheduled_date_idx on public.jobs (scheduled_date);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_completed_at_idx on public.jobs (completed_at);
create index if not exists jobs_created_at_idx on public.jobs (created_at desc);

create index if not exists quotes_status_idx on public.quotes (status);
create index if not exists quotes_created_at_idx on public.quotes (created_at desc);

create index if not exists invoices_status_idx on public.invoices (status);
create index if not exists invoices_paid_date_idx on public.invoices (paid_date);
create index if not exists invoices_created_at_idx on public.invoices (created_at desc);

create index if not exists customers_created_at_idx on public.customers (created_at desc);
create index if not exists customers_name_idx on public.customers (name);

create index if not exists documents_created_at_idx on public.documents (created_at desc);
create index if not exists leads_created_at_idx on public.leads (created_at desc);


-- ============================================================================
-- OPTIONAL — backfilling history.
--
-- Everything above only affects rows changed from now on. Jobs already
-- marked completed, and invoices already marked paid, still have no date on
-- them, so they won't appear in this month's figures or the revenue chart.
--
-- There is no record of when those actually happened. The closest stand-in
-- is updated_at — the last time the row was touched, which for most of them
-- IS the moment the status was changed. That makes it a good guess, not a
-- fact, which is why this is commented out: uncomment and run it only if
-- you would rather have approximate history than none.
-- ============================================================================

-- update public.jobs
--    set completed_at = updated_at
--  where status = 'completed' and completed_at is null;

-- update public.invoices
--    set paid_date = updated_at::date
--  where status = 'paid' and paid_date is null;
