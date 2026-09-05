-- Migration: 20260824035735_usr_account_status_column.sql
-- Purpose: Add profiles.account_status (login/access lifecycle) for the System Admin
--          Account Lifecycle feature (module 02-USR), independent of the existing
--          profiles.status column (HR employment lifecycle, untouched by this module).
--          Backfills all 15 profiles_status_check values per the verbatim mapping in
--          00-Master.md §3 / 04-Database-Schema.md §2. Also fixes handle_new_user()
--          so self-serve signups (which already have credentials) are not mislabeled
--          INVITED (see §3 below).
-- Depends on: public.profiles (20260526_0001_create_profiles.sql),
--             profiles_status_check (20260618000001_employee_master_r21_foundation.sql — NOT modified)

-- ─── 1. New column ──────────────────────────────────────────────────────────
-- NOT NULL DEFAULT 'INVITED' backfills every existing row to 'INVITED' as part of
-- the ADD COLUMN itself; step 2 below re-derives the correct value per row from the
-- existing `status` column.
alter table public.profiles
  add column if not exists account_status text not null default 'INVITED';

alter table public.profiles
  drop constraint if exists profiles_account_status_check;

alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('INVITED', 'ACTIVE', 'LOCKED', 'SUSPENDED', 'DISABLED'));

create index if not exists idx_profiles_account_status on public.profiles(account_status);

comment on column public.profiles.account_status is
  'Login/access lifecycle (System Admin-owned). Independent of profiles.status (HR '
  'employment lifecycle, HR-owned). Values: INVITED | ACTIVE | LOCKED | SUSPENDED | '
  'DISABLED. See docs/04-Business-Modules/02-USR-User-Management/00-Master.md §3.';

-- ─── 2. Backfill — verbatim mapping, 00-Master.md §3 / 04-Database-Schema.md §2 ────
-- All 15 values of profiles_status_check are covered. Re-run-safe: deterministic,
-- produces the same result every time it is applied.
update public.profiles set account_status = case status
  when 'active'            then 'ACTIVE'
  when 'suspended'         then 'SUSPENDED'
  when 'resigned'          then 'DISABLED'
  when 'terminated'        then 'DISABLED'
  when 'retired'           then 'DISABLED'
  when 'deceased'          then 'DISABLED'
  when 'archived'          then 'DISABLED'
  when 'draft'             then 'INVITED'
  when 'pending'           then 'INVITED'
  when 'pending_approval'  then 'INVITED'
  when 'approved'          then 'INVITED'
  when 'probation'         then 'INVITED'
  when 'disabled'          then 'DISABLED'
  when 'long_leave'        then 'SUSPENDED'
  when 'inactive'          then 'SUSPENDED'
  else 'INVITED'
end;

-- ─── 3. handle_new_user() — do not mislabel self-serve signups as INVITED ──────
-- A live self-serve signup path exists today (apps/web/components/landing/auth-form.tsx
-- -> useSupabaseAuth().signUp() -> supabase.auth.signUp()), which sets a password at
-- signup time. That is a different situation from the Phase 3 admin-invite flow
-- (auth.admin.inviteUserByEmail()), where the account has NO password until the
-- invitee accepts the link. Defaulting every new profiles row to 'INVITED' (the
-- column default above) is correct for the invite path but would be actively wrong
-- for self-serve signups — they already have working credentials, so 'INVITED'
-- would incorrectly suggest they cannot yet log in.
--
-- Supabase sets auth.users.invited_at only for rows created via
-- inviteUserByEmail(); self-serve signUp() leaves it null. Use that signal to pick
-- the correct initial account_status at insert time. For the invite path this sets
-- 'INVITED', matching (and redundant with, harmlessly) the explicit follow-up
-- update the Phase 3 invite endpoint performs after the auth.users row exists.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, account_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    case when new.invited_at is not null then 'INVITED' else 'ACTIVE' end
  );
  return new;
end;
$$;
