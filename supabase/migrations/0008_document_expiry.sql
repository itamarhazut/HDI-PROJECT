-- A document's own expiry date (license, insurance policy, safety
-- certificate...) — separate from due_date, which is the deadline to
-- finish the paperwork task itself. Optional: most document types (a
-- one-off permit, a submitted form) never expire at all.
alter table public.documents
  add column expiry_date date;

-- Supports "documents expiring soon" queries (the admin page's own filter,
-- and any future dashboard/reminder card) without a full table scan.
create index documents_expiry_idx on public.documents (expiry_date) where expiry_date is not null;
