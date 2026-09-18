-- ============================================================================
-- 0007_customer_quote_response.sql
--
-- Lets a customer accept or reject a quote from their own portal, instead of
-- that being an admin-only action. There is no RLS UPDATE policy on quotes
-- for customers (quotes_select_own is select-only) and there should not be
-- one: an UPDATE policy would let a customer edit their own totals/notes, or
-- flip status back and forth outside the "sent" stage. Going through a
-- SECURITY DEFINER RPC instead means the only thing a customer can ever do
-- here is move their own quote from "sent" to "accepted"/"rejected" — and,
-- on acceptance, this mirrors exactly what the admin side already does when
-- it marks a quote accepted (QuoteDetailPage.tsx's changeStatus mutation):
-- create the job that starts the work, once, without ever granting the
-- customer their own INSERT policy on jobs.
--
-- Run in the Supabase dashboard's SQL Editor. Safe to run twice.
-- ============================================================================

create or replace function public.respond_to_quote(
  p_quote_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_quote public.quotes;
begin
  select * into v_quote
  from public.quotes
  where id = p_quote_id and customer_id = public.my_customer_id();

  if not found then
    raise exception 'הצעת המחיר לא נמצאה';
  end if;

  if v_quote.status <> 'sent' then
    raise exception 'ניתן להגיב רק להצעת מחיר שנשלחה לאישור';
  end if;

  update public.quotes
     set status = case when p_accept then 'accepted' else 'rejected' end
   where id = p_quote_id;

  -- Same one-time job creation the admin side does on acceptance — kept in
  -- sync with QuoteDetailPage.tsx's changeStatus mutation. Guarded by
  -- quote_id so re-running this (or an admin later toggling the status)
  -- never produces a second job for the same quote.
  if p_accept and not exists (select 1 from public.jobs where quote_id = p_quote_id) then
    insert into public.jobs (customer_id, quote_id, title, status)
    values (v_quote.customer_id, v_quote.id, 'עבודה עבור הצעת מחיר #' || v_quote.quote_number, 'new');
  end if;
end;
$$;

comment on function public.respond_to_quote is
  'Customer-facing: accept or reject one of their own "sent" quotes. Accepting creates the linked job, same as the admin action does.';
