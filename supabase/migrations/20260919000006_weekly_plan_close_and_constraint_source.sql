-- Migration: 20260919000006_weekly_plan_close_and_constraint_source.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 1, item 1.8 —
--          look-ahead constraint "source" plumbing and weekly plan closure
--          (freeze actual progress against target, compute Plan Completion
--          Rate at close time).
-- Depends on:
--   public.weekly_plans       (20260531000008_create_weekly_plans.sql,
--                               department_id added in
--                               20260824000004_team_weekly_planning.sql)
--   public.weekly_plan_tasks  (20260531000008_create_weekly_plans.sql,
--                               responsible_id added in
--                               20260824000004_team_weekly_planning.sql)
--   public.task_constraints   (20260611000001_task_constraints.sql)
--   public.wbs_tasks          (20260527000016_create_wbs_enterprise_tables.sql)
--
-- Schema verification notes:
--   - weekly_plans' current columns (confirmed against both files above):
--     id, project_id, week_start_date, title, status (draft|submitted|
--     approved), notes, created_by, created_at, updated_at, department_id.
--     The status CHECK already allows 'approved' exactly as close_weekly_plan()
--     needs — no CHECK constraint change required.
--   - weekly_plan_tasks' current columns: id, weekly_plan_id, wbs_task_id,
--     target_progress (int, 0-100), responsible_name, notes, created_at,
--     responsible_id. No mismatches versus the plan's assumptions.
--   - task_constraints' current columns (confirmed against
--     20260611000001_task_constraints.sql): id, task_id, constraint_type,
--     status, notes, updated_by, created_at, updated_at. No `source`/
--     `source_ref` yet — added below exactly as specified.
--   - wbs_tasks.progress is `numeric` (0-100), while weekly_plan_tasks.
--     actual_progress is specified as `integer` — close_weekly_plan() rounds
--     progress to the nearest whole percent when freezing it, since the two
--     columns have different types.

-- ── 1. Closure columns ─────────────────────────────────────────────────────
alter table public.weekly_plans
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by uuid references public.profiles(id),
  add column if not exists pcr numeric;

alter table public.weekly_plan_tasks
  add column if not exists actual_progress integer,
  add column if not exists met boolean;

-- ── 2. Constraint source plumbing (for Phase 3 procurement/document feeds) ─
alter table public.task_constraints
  add column if not exists source text not null default 'manual',
  add column if not exists source_ref uuid;

-- ── 3. close_weekly_plan() ──────────────────────────────────────────────────
create or replace function public.close_weekly_plan(p_plan_id uuid)
returns numeric
language plpgsql
security invoker
as $$
declare
  v_pcr numeric;
begin
  update public.weekly_plan_tasks wpt
  set actual_progress = round(wt.progress)::integer,
      met = (round(wt.progress)::integer >= wpt.target_progress)
  from public.wbs_tasks wt
  where wpt.weekly_plan_id = p_plan_id
    and wpt.wbs_task_id = wt.id;

  select round(100.0 * count(*) filter (where met) / nullif(count(*), 0), 2)
    into v_pcr
    from public.weekly_plan_tasks
   where weekly_plan_id = p_plan_id;

  update public.weekly_plans
  set status = 'approved',
      closed_at = now(),
      closed_by = auth.uid(),
      pcr = v_pcr
  where id = p_plan_id;

  return v_pcr;
end;
$$;

grant execute on function public.close_weekly_plan(uuid) to authenticated;
