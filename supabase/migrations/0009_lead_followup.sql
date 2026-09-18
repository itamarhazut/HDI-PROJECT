-- When to reach out to a lead next — separate from created_at, which never
-- moves. Lets the leads page flag "due for follow-up today/overdue" and
-- sort/filter by it, instead of leads silently going cold.
alter table public.leads
  add column next_follow_up_date date;

create index leads_follow_up_idx on public.leads (next_follow_up_date) where next_follow_up_date is not null;
