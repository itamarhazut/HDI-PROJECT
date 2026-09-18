-- Replaces the whole-quote "hide_line_prices" toggle (0010) with a
-- per-LINE toggle instead: the business owner clarified that hiding a
-- price should mask just that one line's own unit-price/total numbers
-- (shown as "****"), not remove the unit-price/total *columns* from the
-- whole document — and it needs to be choosable per line item, not one
-- flag for the entire quote (some lines' prices are fine to show, others
-- aren't, on the same quote).
--
-- quotes.hide_line_prices (from 0010) is left in place rather than
-- dropped — the app no longer reads or writes it, but there's no reason
-- to risk a destructive column drop for a column that's simply unused
-- going forward.
alter table public.quote_line_items
  add column hide_price boolean not null default false;
