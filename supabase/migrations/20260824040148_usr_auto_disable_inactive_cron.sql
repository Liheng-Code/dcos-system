-- Migration: 20260824040148_usr_auto_disable_inactive_cron.sql
-- Purpose: 90-day inactivity auto-disable job per 00-Master.md §8.3 /
--          04-Database-Schema.md §8 (SOP §21). Daily job: any profiles row with
--          account_status = 'ACTIVE' and last_login_at older than 90 days is set
--          to account_status = 'DISABLED', with a user_audit_logs row
--          (event_type = 'account_auto_disabled_inactivity', actor_id = NULL —
--          system-initiated, render as "System" in any UI/report consumer).
--          Reactivation is exclusively a System Admin action; this job never
--          re-enables an account it disabled.
-- Depends on: public.profiles.account_status (20260824035735),
--             public.user_audit_logs (20260606000002_user_management_gaps.sql),
--             fn_guard_profiles_protected_columns() fix (20260824040047 — this
--             job's UPDATE of account_status runs with no JWT context, so it
--             depends on the fixed trigger, not the original buggy one)
--
-- pg_cron availability — VERIFIED ENABLED AND SCHEDULED on this project:
--   `pg_cron` (default_version 1.6.4) was present in the extension catalog but
--   had installed_version NULL before this migration (confirmed via the Supabase
--   MCP list_extensions tool) — i.e. available but never enabled. `create
--   extension if not exists pg_cron;` below enabled it, and a post-apply check
--   (select * from cron.job where jobname = 'usr_auto_disable_inactive_accounts')
--   confirmed the job registered with active = true and the expected schedule/
--   command. What is NOT yet verified: whether the job actually FIRES at 02:00 —
--   that requires waiting for a real run and checking
--   `select * from cron.job_run_details order by start_time desc limit 5;` a day
--   or more after this migration lands. This is the verification item
--   00-Master.md §8.3 itself flags as outstanding.

create extension if not exists pg_cron;

create or replace function public.fn_auto_disable_inactive_accounts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  -- Scoping is load-bearing: account_status = 'ACTIVE' only. Must never widen to
  -- INVITED (never-logged-in accounts — already excluded by last_login_at is not
  -- null), LOCKED, SUSPENDED, or already-DISABLED accounts. See
  -- 04-Database-Schema.md §8 / 02-Functional-Specification.md §F8, BR8.02.
  for r in
    select id from public.profiles
    where account_status = 'ACTIVE'
      and last_login_at is not null
      and last_login_at < now() - interval '90 days'
  loop
    update public.profiles
      set account_status = 'DISABLED'
      where id = r.id;

    insert into public.user_audit_logs (user_id, actor_id, event_type, old_value, new_value, note)
      values (
        r.id,
        null,
        'account_auto_disabled_inactivity',
        jsonb_build_object('account_status', 'ACTIVE'),
        jsonb_build_object('account_status', 'DISABLED'),
        'Automatically disabled after 90 days of inactivity (SOP §21).'
      );
  end loop;
end;
$$;

comment on function public.fn_auto_disable_inactive_accounts() is
  'Daily pg_cron target (job: usr_auto_disable_inactive_accounts). Disables ACTIVE '
  'profiles idle >90 days per SOP §21 / 00-Master.md §8.3. Never re-enables an '
  'account; reactivation is System Admin-only.';

-- Idempotent (re)schedule, guarded so this migration does not hard-fail if the
-- pg_cron background worker is unavailable on this project's plan tier — the
-- extension/function above still get created either way, and the risk is flagged
-- in the header comment for the human to confirm.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'usr_auto_disable_inactive_accounts';

    perform cron.schedule(
      'usr_auto_disable_inactive_accounts',
      '0 2 * * *',
      $cron$ select public.fn_auto_disable_inactive_accounts(); $cron$
    );
  end if;
exception when others then
  raise warning 'pg_cron scheduling failed (extension may not be fully available on this plan tier): %', sqlerrm;
end;
$$;
