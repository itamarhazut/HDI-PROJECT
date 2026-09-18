-- ============================================================================
-- 0002_security_hardening.sql
--
-- Closes five real holes found in the 2026-09 code review. Each one was
-- verified against 0001_init.sql before being written here.
--
-- Run this in the Supabase dashboard's SQL Editor (Dashboard -> SQL Editor
-- -> New query -> paste -> Run). It is also committed here so the fix lives
-- in version control rather than only in the dashboard.
--
-- Every statement is written to be safe to run twice.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. A signup can no longer choose its own role.
--
-- Before: the trigger read the role out of raw_user_meta_data, which the
-- browser controls completely — signing up with { role: "admin" } minted an
-- admin account. The signup screen politely sends "customer", but nothing
-- forced it.
--
-- After: every signup is a customer, full stop. Promoting someone to admin
-- is now a deliberate act done from the dashboard.
-- ----------------------------------------------------------------------------
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
    -- Deliberately NOT from raw_user_meta_data — that field is attacker
    -- controlled on the public /auth/v1/signup endpoint.
    'customer'
  );
  return new;
end;
$$;


-- ----------------------------------------------------------------------------
-- 2. Nobody can promote themselves to admin.
--
-- Before: "profiles_update_own_or_admin" had a USING clause and no WITH
-- CHECK. Postgres then reuses USING as the post-update check, and
-- `id = auth.uid()` is still true after you set your own role to 'admin' —
-- so any logged-in customer could grant themselves full access with one
-- update call.
--
-- After: you may still edit your own profile, but the role must come out
-- unchanged. Admins keep a separate policy that can change anything.
--
-- my_role() is SECURITY DEFINER for the same reason is_admin() and
-- my_customer_id() are: a policy on profiles that reads profiles would
-- recurse infinitely.
-- ----------------------------------------------------------------------------
create or replace function public.my_role()
returns public.user_role
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;

create policy "profiles_update_own" on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.my_role());

create policy "profiles_update_admin" on public.profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());


-- ----------------------------------------------------------------------------
-- 3. app_settings stops leaking the private calendar address.
--
-- Before: `for select using (true)` — readable by everyone. That was fine
-- when the table held a theme colour and a menu order, but it now also
-- holds google_calendar_ics_url: the secret feed address for Itamar's
-- personal Google Calendar. Any signed-in customer could read it and open
-- the whole calendar.
--
-- After: only theme_color stays public (AppShell needs it to paint the
-- portal in the right brand colour — verified that no other customer-facing
-- screen reads any other key). Everything else is admin-only.
-- ----------------------------------------------------------------------------
drop policy if exists "app_settings_select_all" on public.app_settings;
drop policy if exists "app_settings_select" on public.app_settings;

create policy "app_settings_select" on public.app_settings
  for select
  using (public.is_admin() or key = 'theme_color');


-- ----------------------------------------------------------------------------
-- 4. Storage honours visible_to_customer.
--
-- Before: the policy allowed a customer to read every object under their
-- own <customer_id>/ folder. The table policy correctly hides rows that
-- aren't marked visible_to_customer, but the storage policy never checked
-- the flag — and a SELECT policy on storage.objects also authorises list(),
-- so a customer could enumerate the folder and download files deliberately
-- kept internal.
--
-- After: access is granted per file, only when a documents row actually
-- points at it, belongs to that customer, and is marked visible.
-- ----------------------------------------------------------------------------
drop policy if exists "documents_bucket_customer_read" on storage.objects;

create policy "documents_bucket_customer_read" on storage.objects
  for select
  using (
    bucket_id = 'documents'
    and exists (
      select 1
      from public.documents d
      where d.file_path = storage.objects.name
        and d.customer_id = public.my_customer_id()
        and d.visible_to_customer = true
    )
  );


-- ----------------------------------------------------------------------------
-- 5. A customer record can no longer be claimed with a guessed phone number.
--
-- Before: the function matched an unclaimed customer row against the phone
-- number the signup form sent, with nothing proving the caller owns that
-- number. Typing a known customer's phone at signup handed you read access
-- to their jobs, quotes, invoices and documents.
--
-- After: matching happens only on the email Supabase itself verified at
-- signup, read from auth.users (NOT from profiles — a user can edit their
-- own profiles row, so profiles.email is not trustworthy for this).
-- A phone that doesn't match an email still creates a pending_review record
-- for the admin to merge by hand, which is what that flag is for.
-- ----------------------------------------------------------------------------
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
  select email into v_email from auth.users where id = auth.uid();

  if v_email is not null then
    select id into v_customer_id
    from public.customers
    where profile_id is null
      and email is not null
      and lower(email) = lower(v_email)
    limit 1;
  end if;

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
