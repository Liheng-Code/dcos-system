-- PRODUCTION SNIPPET: run by the project owner in the Supabase SQL editor. Claude does not run this.
--
-- Why: the login page used to offer "Quick Demo Access", which signed in as any seeded
-- @dcos.com staff account with one shared password that was in the app's JavaScript.
-- If those accounts exist in production, anyone who knows that password can still sign in
-- as them, even though the button is now hidden. Locking the accounts closes that.
--
-- Steps
--   1. Run STEP 1 (read-only) and look at the list. Make sure none of these are real
--      people who sign in with that password.
--   2. If the list is only demo accounts, run STEP 2. It gives each a random password nobody
--      knows (they can still use "Forgot password" if you want one back).
--   3. Pouth Liheng's admin account is not @dcos.com. Check it separately in STEP 3 and
--      change its password in Auth > Users if it still uses the demo password.

-- STEP 1: list the accounts that would be locked (read-only).
select u.id, u.email, p.role, u.last_sign_in_at
from auth.users u
left join public.profiles p on p.id = u.id
where u.email ilike '%@dcos.com'
order by p.role nulls last, u.email;

-- STEP 2: lock them. Uncomment to run.
-- update auth.users
--    set encrypted_password = crypt(gen_random_uuid()::text, gen_salt('bf')),
--        updated_at = now()
--  where email ilike '%@dcos.com';

-- STEP 3: every admin account (read-only). Check each one's password is not the demo one.
select u.id, u.email, p.role, u.last_sign_in_at
from auth.users u
join public.profiles p on p.id = u.id
where p.role = 'admin'
order by u.email;
