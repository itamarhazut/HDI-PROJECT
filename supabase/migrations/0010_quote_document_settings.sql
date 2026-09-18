-- Per-quote toggle: hide the per-line unit price/total columns on the
-- printed/PDF document, showing only the combined total at the bottom.
-- Lives on the quote itself (like discount_type/include_vat) rather than
-- as a print-time-only choice, so a saved quote always prints the same way
-- wherever it's opened from.
alter table public.quotes
  add column hide_line_prices boolean not null default false;

-- Restart quote numbering at 10000, per the business owner's request — new
-- quotes should read as "#10000" and up rather than continuing from
-- whatever number the identity sequence happened to reach already.
-- Guarded so it only ever moves the sequence FORWARD: if some quote
-- already has a number at or above 10000 by the time this runs, restarting
-- there would let the next insert collide with it, so we skip in that case
-- rather than risk a duplicate quote_number.
do $$
declare
  next_number integer := 10000;
begin
  if (select coalesce(max(quote_number), 0) from public.quotes) < next_number then
    execute format('alter table public.quotes alter column quote_number restart with %s', next_number);
  end if;
end $$;
