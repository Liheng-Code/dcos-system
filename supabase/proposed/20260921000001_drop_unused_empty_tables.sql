-- PROPOSED migration - NOT applied. Lives in supabase/proposed/ (outside the CLI path) on purpose.
-- Move to supabase/migrations/ only after: (1) a DB backup, (2) a dry run on a Supabase branch.
--
-- Drops 24 tables that on 2026-09-21 were verified as:
--   * 0 rows (exact count, live project swyhplzjhdypvkhstpgp)
--   * no inbound foreign keys, no views, no RLS policies on other tables, no cron jobs
--   * not referenced by any public/auth/cron function body
--   * not referenced by apps/web, supabase/functions or scripts (database.types.ts ignored)
--
-- Deliberately NOT dropped (looked dead, but are wired in):
--   task_escalations        <- run_task_escalation() <- edge function escalation-check
--   dwl_price_status_events <- dwl_{submit,verify,approve,reject}_price_submission()
--   kpi_snapshots           <- capture_kpi_snapshot()
--   plan_revision_approvals <- transition_revision()  (revision approval workflow, 20260919)
--   snap_*  (4 tables)      <- create_bid_snapshot() (20260721000002 dwl_phase6_freeze_legacy_tables)
--
-- No CASCADE: if a hidden dependency exists, the statement fails loudly instead of dropping it.

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'account_payment_run_items', 'asset_maintenance', 'asset_returns', 'attendance_adjustments',
    'budget_running_numbers', 'competency_levels', 'currency_exposure_ledger', 'employee_kpis',
    'employee_wbs_assignments', 'fx_transactions', 'leave_capacity_exceptions', 'markup_annotations',
    'markup_assignments', 'mobile_sync_conflicts', 'offer_letters', 'payroll_adjustments',
    'performance_scores', 'redline_layers', 'resource_forecasts', 'review_history',
    'subcontract_ipc_items', 'tender_dayworks', 'tender_provisional_sums', 'wbs_running_numbers'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n > 0 then
        raise exception 'Refusing to drop public.%: it now has % rows', t, n;
      end if;
    end if;
  end loop;
end $$;

-- Finance / assets
drop table if exists public.account_payment_run_items;
drop table if exists public.asset_maintenance;
drop table if exists public.asset_returns;
drop table if exists public.currency_exposure_ledger;
drop table if exists public.fx_transactions;

-- HR
drop table if exists public.attendance_adjustments;
drop table if exists public.competency_levels;
drop table if exists public.employee_kpis;
drop table if exists public.employee_wbs_assignments;
drop table if exists public.leave_capacity_exceptions;
drop table if exists public.offer_letters;
drop table if exists public.payroll_adjustments;
drop table if exists public.performance_scores;
drop table if exists public.review_history;
drop table if exists public.resource_forecasts;

-- Numbering (superseded by generation functions / other counters)
drop table if exists public.budget_running_numbers;
drop table if exists public.wbs_running_numbers;

-- Drawing markup (4-table feature, drawing_markups is the one kept)
drop table if exists public.markup_annotations;
drop table if exists public.markup_assignments;
drop table if exists public.redline_layers;

-- Mobile / subcontract
drop table if exists public.mobile_sync_conflicts;
drop table if exists public.subcontract_ipc_items;

-- Tender: created directly on the live DB, never in a migration (schema drift).
-- Remove this block if Dayworks / Provisional Sums tabs are still planned.
drop table if exists public.tender_dayworks;
drop table if exists public.tender_provisional_sums;

/* ROLLBACK for the two tables that have no migration history (DDL captured from live DB):

create table public.tender_dayworks (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tender_register(id) on delete cascade,
  item_code text not null,
  description text not null,
  unit text not null default 'day',
  rate numeric not null default 0,
  estimated_qty numeric not null default 0,
  estimated_amount numeric,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tender_id, item_code)
);
create table public.tender_provisional_sums (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tender_register(id) on delete cascade,
  item_code text not null,
  description text not null,
  amount numeric not null default 0,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tender_id, item_code)
);
-- (RLS policies on these two tables were not captured; the other 22 tables' DDL is in supabase/migrations history.)
*/
