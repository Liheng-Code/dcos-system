-- PRODUCTION SNIPPET: run by the project owner in the Supabase SQL editor. Claude does not run this.
--
-- Creates the roles for two test logins: admin@dcos.local (admin, L0) and viewer@dcos.local (viewer, L6).
--
-- Step A (dashboard, not SQL): Authentication > Users > Add user > Create new user
--   - email admin@dcos.local,  password of your choice, tick "Auto Confirm User"
--   - email viewer@dcos.local, password of your choice, tick "Auto Confirm User"
--   Creating users in the dashboard sets up their login identity correctly. Do not insert
--   into auth.users by hand. The profiles row is created by the signup trigger.
--   Use a STRONG password for the admin: this is the live system. Delete or disable the
--   test accounts when you finish testing.
--
-- Step B: run this file. It only sets roles; it changes no passwords.

-- 1. Both roles must exist in this database (read-only check: expect two rows, L0 and L6).
select code, name from public.roles where code in ('L0', 'L6') order by code;

-- 2. Both profiles must exist (expect two rows). If empty, do Step A first.
select id, email, role from public.profiles where email in ('admin@dcos.local', 'viewer@dcos.local');

-- 3. Set the roles.
update public.profiles set role = 'admin',  job_title = 'Test Admin',  status = 'active' where email = 'admin@dcos.local';
update public.profiles set role = 'viewer', job_title = 'Test Viewer', status = 'active' where email = 'viewer@dcos.local';

insert into public.user_roles (user_id, role_code)
select id, 'L0' from public.profiles where email = 'admin@dcos.local'
on conflict do nothing;

insert into public.user_roles (user_id, role_code)
select id, 'L6' from public.profiles where email = 'viewer@dcos.local'
on conflict do nothing;

-- 4. Check (expect admin / L0 and viewer / L6).
select p.email, p.role, p.status, string_agg(ur.role_code, ',') as rbac
from public.profiles p
left join public.user_roles ur on ur.user_id = p.id
where p.email in ('admin@dcos.local', 'viewer@dcos.local')
group by 1, 2, 3;

-- 5. When testing is done, remove them: delete the two users in Authentication > Users.
--    Their profiles and user_roles rows are removed with them.
