-- Optional local/dev seed data. Safe to run after 0001_init.sql on a fresh project.
-- Note: creating the first ADMIN user must be done via Supabase Auth (sign up
-- normally through the app, or via the Supabase dashboard), then promote it:
--
--   update public.profiles set role = 'admin' where email = 'you@example.com';
--
-- Sample price list items to make the app feel alive during development:
insert into public.price_list_items (code, name, category, unit, unit_price) values
  ('PL-001', 'התקנת שקע חשמל רגיל', 'התקנות', 'יח׳', 150),
  ('PL-002', 'התקנת גוף תאורה', 'התקנות', 'יח׳', 200),
  ('PL-003', 'בדיקת לוח חשמל', 'בדיקות', 'לוח', 350),
  ('PL-004', 'מפסק פחת (חדש)', 'ציוד', 'יח׳', 180)
on conflict (code) do nothing;
