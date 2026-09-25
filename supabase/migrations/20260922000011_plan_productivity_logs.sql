-- Migration: 20260922000011_plan_productivity_logs.sql
-- Purpose: Productivity & Resource-Costing Plan, Phase 5 (part A) — the ACTUAL record (site logs) that
--          measures reality against the planned norm.
--
--   plan_productivity_logs        one row per task/trade per day: headcount, hours, quantity done.
--   plan_productivity_log_compute()  resolves the task's norm (via plan_task_work.norm_id), computes
--                                  actual_hours, earned_hours (= quantity_done x norm labour constant) and
--                                  productivity_index (= earned_hours / actual_hours — the standard
--                                  "Performance Factor": >1 faster than the norm, <1 slower), or reports why
--                                  it could not (pi_status), on every write. Same SECURITY DEFINER rationale
--                                  as plan_task_work_compute(): the index must not depend on what the
--                                  logging user is separately allowed to read (a site engineer can log
--                                  output without a view right on the norm library).
--
-- Depends on: 20260922000006 (plan_task_work, plan_norm_unit), 20260922000005 (norms), public.wbs_tasks.
-- Safe to re-run.

create table if not exists public.plan_productivity_logs (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  task_id             uuid references public.wbs_tasks(id) on delete set null,
  trade_code          text not null check (btrim(trade_code) <> ''),
  log_date            date not null,
  headcount           integer not null check (headcount > 0),
  hours_normal        numeric not null default 0 check (hours_normal >= 0),
  hours_ot            numeric not null default 0 check (hours_ot >= 0),
  quantity_done       numeric check (quantity_done is null or quantity_done >= 0),
  unit                text,
  condition_note      text,
  source              text not null default 'manual' check (source in ('site_diary', 'timesheet', 'manual')),
  site_manpower_id    uuid references public.site_manpower(id) on delete set null,
  timesheet_entry_id  uuid references public.timesheet_entries(id) on delete set null,
  -- computed by trigger, from THIS row's task's norm at the moment it was saved
  norm_id             uuid references public.plan_productivity_norms(id) on delete set null,
  actual_hours        numeric,
  earned_hours        numeric,
  productivity_index  numeric,
  pi_status           text not null default 'no_task',
  pi_message          text,
  created_by          uuid references auth.users(id) default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (hours_normal + hours_ot > 0)
);

create index if not exists idx_plan_productivity_logs_project on public.plan_productivity_logs (project_id, log_date);
create index if not exists idx_plan_productivity_logs_task    on public.plan_productivity_logs (task_id) where task_id is not null;
create index if not exists idx_plan_productivity_logs_trade   on public.plan_productivity_logs (project_id, trade_code);
create unique index if not exists ux_plan_productivity_logs_timesheet
  on public.plan_productivity_logs (timesheet_entry_id) where timesheet_entry_id is not null;

comment on table public.plan_productivity_logs is 'Actual site output: headcount/hours/quantity per task or trade per day. Drives productivity_index (earned hours / actual hours) and norm calibration. See 16-Productivity-and-Resource-Costing-Plan.md, Phase 5.';
comment on column public.plan_productivity_logs.productivity_index is 'Earned hours (quantity_done x the task''s norm labour constant) divided by actual_hours. 1.0 = matches the norm; above 1 = faster; below 1 = slower. NULL unless pi_status = ok.';

-- ── compute trigger ──────────────────────────────────────────────────────────
create or replace function public.plan_productivity_log_compute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t_project  uuid;
  w_norm_id  uuid;
  n_lc       numeric;
  n_unit     text;
  v_actual   numeric;
begin
  if new.task_id is not null then
    select t.project_id into t_project from public.wbs_tasks t where t.id = new.task_id;
    if not found then
      raise exception 'Task % not found', new.task_id using errcode = '23503';
    end if;
    new.project_id := t_project;
  elsif new.project_id is null then
    raise exception 'A productivity log needs a task or a project' using errcode = '23502';
  end if;

  v_actual := coalesce(new.headcount, 0) * (coalesce(new.hours_normal, 0) + coalesce(new.hours_ot, 0));
  new.actual_hours := v_actual;
  new.norm_id := null;
  new.earned_hours := null;
  new.productivity_index := null;

  if new.task_id is null then
    new.pi_status := 'no_task';
    new.pi_message := 'No task selected - actual hours are recorded, but there is no norm to compare against.';
  elsif v_actual <= 0 then
    new.pi_status := 'no_hours';
    new.pi_message := 'No hours logged.';
  else
    select w.norm_id into w_norm_id from public.plan_task_work w where w.task_id = new.task_id;
    if w_norm_id is null then
      new.pi_status := 'no_norm';
      new.pi_message := 'This task has no productivity norm assigned yet (set one on Task Work).';
    else
      select n.labour_constant_hr_per_unit, n.unit into n_lc, n_unit
      from public.plan_productivity_norms n where n.id = w_norm_id;
      new.norm_id := w_norm_id;
      if new.quantity_done is null then
        new.pi_status := 'no_quantity';
        new.pi_message := 'No quantity done entered yet.';
      elsif new.unit is null or btrim(new.unit) = '' then
        new.pi_status := 'no_quantity';
        new.pi_message := 'Enter the unit the quantity was measured in.';
      elsif public.plan_norm_unit(new.unit) is distinct from public.plan_norm_unit(n_unit) then
        new.pi_status := 'unit_mismatch';
        new.pi_message := format('Logged in %s but the norm is per %s', new.unit, n_unit);
      else
        new.earned_hours := round(new.quantity_done * n_lc, 4);
        new.productivity_index := round(new.earned_hours / v_actual, 4);
        new.pi_status := 'ok';
        new.pi_message := null;
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_plan_productivity_log_compute on public.plan_productivity_logs;
create trigger trg_plan_productivity_log_compute
  before insert or update on public.plan_productivity_logs
  for each row execute function public.plan_productivity_log_compute();

-- ── RLS (project membership + planning/productivity permissions, seeded in 20260922000004) ─────
alter table public.plan_productivity_logs enable row level security;

drop policy if exists plan_productivity_logs_select on public.plan_productivity_logs;
create policy plan_productivity_logs_select on public.plan_productivity_logs for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'productivity', 'view'));

drop policy if exists plan_productivity_logs_insert on public.plan_productivity_logs;
create policy plan_productivity_logs_insert on public.plan_productivity_logs for insert to authenticated
  with check (is_project_member(project_id) and has_permission('planning', 'productivity', 'can_create'));

drop policy if exists plan_productivity_logs_update on public.plan_productivity_logs;
create policy plan_productivity_logs_update on public.plan_productivity_logs for update to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'productivity', 'edit'))
  with check (is_project_member(project_id) and has_permission('planning', 'productivity', 'edit'));

drop policy if exists plan_productivity_logs_delete on public.plan_productivity_logs;
create policy plan_productivity_logs_delete on public.plan_productivity_logs for delete to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'productivity', 'delete'));
