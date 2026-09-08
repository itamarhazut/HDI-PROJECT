-- ============================================================================
-- 0001_init.sql
-- Initial schema for the electrician business management system.
-- Applies to a Supabase (Postgres) project. Run with:
--   supabase db push
-- or paste into the Supabase SQL editor for the first setup.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'customer', 'technician');
create type public.job_status as enum ('new', 'scheduled', 'in_progress', 'completed', 'cancelled');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'rejected', 'expired');
create type public.invoice_status as enum ('pending', 'marked_invoiced', 'paid', 'overdue', 'cancelled');
create type public.document_status as enum ('needed', 'in_progress', 'submitted', 'approved', 'rejected');
create type public.lead_status as enum ('new', 'contacted', 'converted', 'lost');
create type public.inventory_reason as enum ('job_usage', 'restock', 'adjustment');

-- ----------------------------------------------------------------------------
-- updated_at helper trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'customer',
  full_name text,
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'customer')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Role-check helpers (SECURITY DEFINER to avoid RLS recursion on profiles)
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.my_customer_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select id from public.customers where profile_id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- customers
-- ----------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  name text not null,
  phone text,
  email text,
  address text,
  notes text,
  -- true when this row was auto-created by a customer self-signup that
  -- couldn't be matched to an existing admin-entered record; admin should
  -- review and merge/confirm it.
  pending_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

create index customers_phone_idx on public.customers (phone);
create index customers_email_idx on public.customers (email);

-- RPC used right after a customer signs up: try to claim an existing
-- admin-entered customer record by phone/email, otherwise create a new
-- (pending_review) one and link it to the caller's profile.
create or replace function public.link_or_create_customer_for_current_user(
  p_phone text,
  p_full_name text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_customer_id uuid;
  v_email text;
begin
  select email into v_email from public.profiles where id = auth.uid();

  -- Try to claim an unclaimed customer row that matches by phone or email.
  select id into v_customer_id
  from public.customers
  where profile_id is null
    and (
      (p_phone is not null and phone = p_phone)
      or (v_email is not null and email = v_email)
    )
  limit 1;

  if v_customer_id is not null then
    update public.customers set profile_id = auth.uid()
    where id = v_customer_id;
    return v_customer_id;
  end if;

  insert into public.customers (profile_id, name, phone, email, pending_review, created_by)
  values (auth.uid(), coalesce(p_full_name, v_email, 'לקוח חדש'), p_phone, v_email, true, auth.uid())
  returning id into v_customer_id;

  return v_customer_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- jobs
-- ----------------------------------------------------------------------------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  quote_id uuid, -- FK added after quotes table exists (see below)
  title text not null,
  description text,
  status public.job_status not null default 'new',
  assigned_technician_id uuid references public.profiles(id),
  address text,
  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

create index jobs_customer_idx on public.jobs (customer_id);
create index jobs_technician_idx on public.jobs (assigned_technician_id);

-- ----------------------------------------------------------------------------
-- inventory_items + inventory_transactions
-- ----------------------------------------------------------------------------
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  category text,
  unit text not null default 'יח׳',
  quantity_on_hand numeric not null default 0,
  reorder_threshold numeric,
  unit_cost numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger inventory_items_set_updated_at
  before update on public.inventory_items
  for each row execute function public.set_updated_at();

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  quantity_delta numeric not null,
  reason public.inventory_reason not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create index inventory_transactions_item_idx on public.inventory_transactions (inventory_item_id);
create index inventory_transactions_job_idx on public.inventory_transactions (job_id);

-- Atomic stock adjustment: insert the transaction row and update the running
-- quantity_on_hand together, so app code never mutates quantity_on_hand directly.
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
begin
  if not public.is_admin() then
    raise exception 'only admins can record inventory transactions';
  end if;

  insert into public.inventory_transactions (inventory_item_id, job_id, quantity_delta, reason, created_by)
  values (p_inventory_item_id, p_job_id, p_quantity_delta, p_reason, auth.uid())
  returning id into v_transaction_id;

  update public.inventory_items
  set quantity_on_hand = quantity_on_hand + p_quantity_delta
  where id = p_inventory_item_id;

  return v_transaction_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- price_list_items (מחירון)
-- ----------------------------------------------------------------------------
create table public.price_list_items (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  category text,
  unit text not null default 'יח׳',
  unit_price numeric not null default 0,
  default_cost numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger price_list_items_set_updated_at
  before update on public.price_list_items
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- quotes + quote_line_items (הצעות מחיר)
-- ----------------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number integer generated always as identity,
  customer_id uuid not null references public.customers(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  status public.quote_status not null default 'draft',
  issued_date date not null default current_date,
  valid_until date,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  tax_rate numeric not null default 0.17,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

create index quotes_customer_idx on public.quotes (customer_id);

alter table public.jobs
  add constraint jobs_quote_id_fkey foreign key (quote_id) references public.quotes(id) on delete set null;

create table public.quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  price_list_item_id uuid references public.price_list_items(id),
  description text not null,
  quantity numeric not null default 1,
  unit_price numeric not null default 0,
  line_total numeric not null default 0,
  sort_order integer not null default 0
);

create index quote_line_items_quote_idx on public.quote_line_items (quote_id);

-- ----------------------------------------------------------------------------
-- invoices (internal tracking only — see plan for why)
-- ----------------------------------------------------------------------------
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number integer generated always as identity,
  customer_id uuid not null references public.customers(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  status public.invoice_status not null default 'pending',
  amount numeric not null default 0,
  issued_date date,
  paid_date date,
  external_provider text, -- e.g. 'yesh_heshbonit'
  external_reference text,
  external_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create index invoices_customer_idx on public.invoices (customer_id);

-- ----------------------------------------------------------------------------
-- documents (בירוקרטיה / compliance records)
-- ----------------------------------------------------------------------------
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  type text not null default 'other',
  title text not null,
  status public.document_status not null default 'needed',
  file_path text, -- Supabase Storage path, bucket "documents"
  due_date date,
  visible_to_customer boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

create index documents_customer_idx on public.documents (customer_id);
create index documents_job_idx on public.documents (job_id);

-- ----------------------------------------------------------------------------
-- leads (שיווק)
-- ----------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  source text,
  status public.lead_status not null default 'new',
  notes text,
  converted_customer_id uuid references public.customers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- app_settings (key/value — e.g. current VAT rate)
-- ----------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null
);

insert into public.app_settings (key, value) values
  ('vat_rate', '0.17'),
  ('quote_number_prefix', '"Q-"'),
  ('invoice_number_prefix', '"INV-"');

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.jobs enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.price_list_items enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_line_items enable row level security;
alter table public.invoices enable row level security;
alter table public.documents enable row level security;
alter table public.leads enable row level security;
alter table public.app_settings enable row level security;

-- profiles: everyone can read/update their own row; admins can read/update all.
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- customers: admin full access; customer can read only their own linked row.
create policy "customers_admin_all" on public.customers
  for all using (public.is_admin()) with check (public.is_admin());
create policy "customers_select_own" on public.customers
  for select using (profile_id = auth.uid());

-- jobs: admin full access; customer read-only on their own jobs.
create policy "jobs_admin_all" on public.jobs
  for all using (public.is_admin()) with check (public.is_admin());
create policy "jobs_select_own" on public.jobs
  for select using (customer_id = public.my_customer_id());

-- inventory_items / inventory_transactions: admin-only (no customer policy at all).
create policy "inventory_items_admin_all" on public.inventory_items
  for all using (public.is_admin()) with check (public.is_admin());
create policy "inventory_transactions_admin_all" on public.inventory_transactions
  for all using (public.is_admin()) with check (public.is_admin());

-- price_list_items: admin-only for now (no public storefront yet).
create policy "price_list_items_admin_all" on public.price_list_items
  for all using (public.is_admin()) with check (public.is_admin());

-- quotes / quote_line_items: admin full access; customer read-only on their own.
create policy "quotes_admin_all" on public.quotes
  for all using (public.is_admin()) with check (public.is_admin());
create policy "quotes_select_own" on public.quotes
  for select using (customer_id = public.my_customer_id());

create policy "quote_line_items_admin_all" on public.quote_line_items
  for all using (public.is_admin()) with check (public.is_admin());
create policy "quote_line_items_select_own" on public.quote_line_items
  for select using (
    quote_id in (select id from public.quotes where customer_id = public.my_customer_id())
  );

-- invoices: admin full access; customer read-only on their own.
create policy "invoices_admin_all" on public.invoices
  for all using (public.is_admin()) with check (public.is_admin());
create policy "invoices_select_own" on public.invoices
  for select using (customer_id = public.my_customer_id());

-- documents: admin full access; customer read-only, and only when explicitly
-- marked visible_to_customer.
create policy "documents_admin_all" on public.documents
  for all using (public.is_admin()) with check (public.is_admin());
create policy "documents_select_own_visible" on public.documents
  for select using (
    visible_to_customer = true
    and customer_id = public.my_customer_id()
  );

-- leads: admin-only.
create policy "leads_admin_all" on public.leads
  for all using (public.is_admin()) with check (public.is_admin());

-- app_settings: everyone (incl. anon-but-authenticated) can read; only admin writes.
create policy "app_settings_select_all" on public.app_settings
  for select using (true);
create policy "app_settings_admin_write" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
-- Storage bucket for documents
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Path convention: <customer_id>/<job_id-or-general>/<filename>
create policy "documents_bucket_admin_all" on storage.objects
  for all using (bucket_id = 'documents' and public.is_admin())
  with check (bucket_id = 'documents' and public.is_admin());

create policy "documents_bucket_customer_read" on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = public.my_customer_id()::text
  );
