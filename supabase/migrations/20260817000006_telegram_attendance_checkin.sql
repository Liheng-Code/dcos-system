-- Migration: 20260817000006_telegram_attendance_checkin.sql
-- Purpose: Schema support for Telegram-bot-based selfie check-in/check-out in
--          the Attendance module. The bot is a stateless webhook (one HTTP
--          request per Telegram message), so it needs DB-backed state to walk
--          a user through "send location" -> "send selfie" across messages,
--          plus a way to link a DCOS employee to a Telegram user id, and a
--          one-time-code flow (generated in DCOS UI, redeemed via `/link
--          <code>` in the bot) to establish that link safely.
--
-- Depends on: public.attendance_logs (20260527000035_create_attendance_tables.sql,
--             method check widened in 20260609000072_attendance_storage_and_manual_method.sql),
--             public.profiles (20260526_0001_create_profiles.sql),
--             public.is_hr_admin() (20260601000051_fix_payroll_rls_policies.sql).
--
-- Security rationale for the profiles.telegram_user_id trigger guard:
--   supabase/migrations/20260602000057_enable_rls_core_tables.sql (line 25)
--   grants `profiles_authenticated_all`: FOR ALL TO authenticated USING (true)
--   WITH CHECK (true) -- i.e. ANY authenticated user can currently UPDATE ANY
--   row of public.profiles, including someone else's. Without a guard, any
--   logged-in user could set another employee's telegram_user_id to their own
--   (or a coworker's) Telegram id and hijack that employee's Telegram-initiated
--   attendance check-ins/check-outs (impersonation + falsified attendance
--   records). A BEFORE UPDATE trigger below blocks any change to
--   telegram_user_id unless the caller is service_role (server-side code using
--   createAdminClient(), which is how the /link flow actually writes this
--   column -- see apps/web/lib/supabase/server.ts) or passes is_hr_admin()
--   (support/manual correction). This mirrors the auth.role() = 'service_role'
--   / auth.role() = 'authenticated' checks already used elsewhere in this
--   codebase (e.g. 20260721000002_dwl_phase6_freeze_legacy_tables.sql,
--   20260730000001_fix_module_settings_rls.sql) and the is_hr_admin() helper
--   already used for HR-gated writes across the payroll migrations
--   (20260601000051, 20260602000058/59, 20260817000004/000005). Note that RLS
--   USING/WITH CHECK clauses are bypassed by service_role, but BEFORE UPDATE
--   triggers are NOT -- they fire unconditionally regardless of RLS bypass,
--   which is why the trigger itself must explicitly allow service_role through.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. attendance_logs.method: allow 'telegram' as a valid check-in method
-- ─────────────────────────────────────────────────────────────────────────
-- Mirrors the exact pattern used in 20260609000072_attendance_storage_and_manual_method.sql
-- to add 'manual': drop the named constraint and recreate it with the wider set.
alter table public.attendance_logs
  drop constraint if exists attendance_logs_method_check;

alter table public.attendance_logs
  add constraint attendance_logs_method_check
  check (method in ('web', 'biometric', 'rfid', 'gps', 'qr', 'mobile', 'manual', 'telegram'));

-- ─────────────────────────────────────────────────────────────────────────
-- 2. profiles.telegram_user_id: link a DCOS employee to their Telegram account
-- ─────────────────────────────────────────────────────────────────────────
-- Deliberately no inline `unique` column constraint: a plain unique constraint
-- would build a btree index over every row (most of which will be null). The
-- partial unique index below enforces the same uniqueness among non-null
-- values while keeping the index small, per the stated intent.
alter table public.profiles
  add column if not exists telegram_user_id bigint;

create unique index if not exists idx_profiles_telegram_user_id
  on public.profiles(telegram_user_id)
  where telegram_user_id is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Trigger: protect telegram_user_id from arbitrary overwrite
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.protect_telegram_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.telegram_user_id is distinct from old.telegram_user_id then
    if auth.role() = 'service_role' then
      return new;
    end if;
    if is_hr_admin() then
      return new;
    end if;
    raise exception 'Not authorized to change telegram_user_id'
      using errcode = '42501'; -- insufficient_privilege
  end if;
  return new;
end;
$$;

drop trigger if exists protect_telegram_user_id_trigger on public.profiles;

create trigger protect_telegram_user_id_trigger
  before update on public.profiles
  for each row execute function public.protect_telegram_user_id();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. telegram_link_codes: one-time codes to link a profile <-> Telegram account
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.telegram_link_codes (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles(id) on delete cascade,
  code         text not null, -- 6-digit numeric, generated by app code (not SQL)
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- Only one live (unused) code may exist for a given code value at a time.
create unique index if not exists idx_telegram_link_codes_code_active
  on public.telegram_link_codes(code)
  where used_at is null;

create index if not exists idx_telegram_link_codes_employee
  on public.telegram_link_codes(employee_id);

alter table public.telegram_link_codes enable row level security;

-- Deliberately no INSERT/UPDATE/DELETE policy for `authenticated` here --
-- default-deny is intentional. A link code is effectively a bearer credential
-- that binds a Telegram account to an employee profile: only server-side code
-- using the service-role client (createAdminClient(), which bypasses RLS
-- entirely) should ever generate or redeem one. The only client-facing access
-- granted is a read-only policy for HR admins, for support/audit visibility
-- (e.g. "why didn't my link code work").
create policy "telegram_link_codes_hr_read" on public.telegram_link_codes
  for select to authenticated
  using (is_hr_admin());

-- ─────────────────────────────────────────────────────────────────────────
-- 5. attendance_telegram_sessions: per-Telegram-user conversation state
-- ─────────────────────────────────────────────────────────────────────────
-- The bot's webhook is stateless per HTTP request; this table tracks
-- "waiting for location" -> "waiting for selfie" between messages from the
-- same Telegram user during a single check-in/check-out flow.
create table if not exists public.attendance_telegram_sessions (
  telegram_user_id bigint primary key,
  employee_id       uuid not null references public.profiles(id) on delete cascade,
  pending_action    text not null check (
    pending_action in (
      'checkin_awaiting_location',
      'checkin_awaiting_selfie',
      'checkout_awaiting_location',
      'checkout_awaiting_selfie'
    )
  ),
  lat               numeric,
  lng               numeric,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null
);

create index if not exists idx_attendance_telegram_sessions_employee
  on public.attendance_telegram_sessions(employee_id);

alter table public.attendance_telegram_sessions enable row level security;

-- No client-facing write policies -- this is bot-internal state touched only
-- by the webhook via the service-role client (bypasses RLS entirely). Only a
-- read-only policy for HR admins is added, for support/audit visibility.
create policy "attendance_telegram_sessions_hr_read" on public.attendance_telegram_sessions
  for select to authenticated
  using (is_hr_admin());
