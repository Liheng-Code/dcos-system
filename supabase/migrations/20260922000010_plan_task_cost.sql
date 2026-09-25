-- Migration: 20260922000010_plan_task_cost.sql
-- Purpose: Productivity & Resource-Costing Plan, Phase 4 — cost loading and WBS roll-up.
--
--   plan_task_work.planned_cost   finally populated (reserved NULL since 20260922000006 / Phase 1)
--   plan_task_cost_lines          one computed row per task per LABOUR crew role: hours split normal/OT,
--                                 the resolved daily rate, and the line's cost. Rebuilt from scratch on
--                                 every plan_task_work write, same lifecycle as the work columns — a
--                                 read-only ledger, never edited directly (no insert/update/delete policy).
--   plan_wbs_cost_rollup(project) bottom-up planned cost per WBS node (a task's cost rolls into its node and
--                                 every ancestor), plus the BOQ value of its Phase 2-mapped tasks and the
--                                 variance between them. A FUNCTION, not a view (as the plan doc's working
--                                 name `v_wbs_cost_rollup` suggested) — a recursive rollup as a plain view
--                                 would recurse over every project's nodes on every query; scoping it to one
--                                 project up front is what makes this cheap.
--
-- Rate resolution: a norm's labour crew line carries an optional dwl_resource_id (set when the norm was
-- imported from the DWL, or picked by hand in the norm editor). Its cost rate comes ONLY from
-- dwl_v_labor_rates (a real, sourced number) — never invented, never averaged across roles. A crew line
-- with no dwl_resource_id, or one the rate view has nothing for, costs as NULL and is reported, not guessed.
-- OT premium: plan_task_work.ot_pct (0-100, default 0) is the share of every role's hours treated as
-- overtime, at the multiplier for plan_task_work.ot_type from the existing HR overtime_rates table.
--
-- Depends on: 20260922000006 (plan_task_work), 20260922000005 (norms), dwl_v_labor_rates, overtime_rates,
-- 20260922000007 (BOQ link columns, for the rollup's variance).
-- Safe to re-run.

-- ── 1. task-level OT inputs + cost status (planned_cost already exists) ─────
alter table public.plan_task_work
  add column if not exists ot_pct         numeric not null default 0 check (ot_pct >= 0 and ot_pct <= 100),
  add column if not exists ot_type        text not null default 'weekday'
                             check (ot_type in ('weekday', 'weekend', 'public_holiday', 'night_shift', 'emergency', 'project_critical')),
  add column if not exists cost_calc_status  text,
  add column if not exists cost_calc_message text,
  add column if not exists cost_calc_at      timestamptz;

comment on column public.plan_task_work.ot_pct is 'Share (0-100) of this task''s crew hours treated as overtime, at ot_type''s multiplier. 0 = no overtime (the default).';
comment on column public.plan_task_work.planned_cost is 'Sum of this task''s plan_task_cost_lines.line_cost (labour only, resolvable rates only). NULL until a norm + a resolvable rate exist - never a guess.';

-- ── 2. cost lines (rebuilt by the trigger below; never written to directly) ─
create table if not exists public.plan_task_cost_lines (
  id                uuid primary key default gen_random_uuid(),
  task_id           uuid not null references public.wbs_tasks(id) on delete cascade,
  project_id        uuid not null references public.projects(id) on delete cascade,
  role_label        text not null,
  dwl_resource_id   uuid references public.dwl_resources(id) on delete set null,
  rate_source       text not null check (rate_source in ('dwl', 'none')),
  workers_per_crew  numeric not null,
  hours_per_day     numeric not null,
  daily_rate        numeric,          -- NULL when no rate could be resolved
  hourly_rate       numeric,
  ot_pct            numeric not null, -- snapshot of plan_task_work.ot_pct at compute time
  ot_type           text not null,
  ot_multiplier     numeric not null,
  normal_hours      numeric not null,
  ot_hours          numeric not null,
  normal_cost       numeric,
  ot_cost           numeric,
  line_cost         numeric,
  currency          text,
  calc_at           timestamptz not null default now()
);

create index if not exists idx_plan_task_cost_lines_task on public.plan_task_cost_lines (task_id);
create index if not exists idx_plan_task_cost_lines_project on public.plan_task_cost_lines (project_id);

comment on table public.plan_task_cost_lines is 'Computed labour cost breakdown, one row per task per norm crew role. Rebuilt (delete+insert) by plan_task_work_compute() on every plan_task_work write. Read-only ledger: no direct insert/update/delete policy.';

alter table public.plan_task_cost_lines enable row level security;

drop policy if exists plan_task_cost_lines_select on public.plan_task_cost_lines;
create policy plan_task_cost_lines_select on public.plan_task_cost_lines for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'task_work', 'view'));

-- ── 3. rate / OT resolution helpers ──────────────────────────────────────────
create or replace function public.plan_resolve_labor_rate(p_dwl_resource_id uuid)
returns table (daily_rate numeric, currency text)
language sql
stable
as $$
  select r.daily_basic_rate, r.currency
  from public.dwl_v_labor_rates r
  where r.resource_id = p_dwl_resource_id and r.daily_basic_rate is not null
  order by r.valid_from desc nulls last
  limit 1
$$;

create or replace function public.plan_resolve_ot_multiplier(p_ot_type text)
returns numeric
language sql
stable
as $$
  select coalesce(
    (select o.multiplier from public.overtime_rates o
      where o.ot_type = p_ot_type and o.is_active and o.effective_date <= current_date
      order by o.effective_date desc limit 1),
    1.0
  )
$$;

-- ── 4. extend the compute trigger with cost lines ────────────────────────────
-- Re-declares plan_task_work_compute() from 20260922000007 with the same SECURITY DEFINER rationale, plus:
-- rebuild this task's plan_task_cost_lines from its (now current) work_hours, norm crew and OT inputs.
create or replace function public.plan_task_work_compute()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t_project  uuid;
  t_start    date;
  t_end      date;
  t_mile     boolean;
  v_cal      uuid;
  v_hours    numeric;
  v_dur      integer;
  n_lc       numeric;
  n_eff      numeric;
  n_unit     text;
  n_project  uuid;
  v_crew     numeric;
  r          record;
  inputs_changed boolean;
  c_line     record;
  c_total    numeric;
  c_any_rate boolean;
  c_all_rate boolean;
  c_ot_mult  numeric;
begin
  select w.project_id, w.start_date, w.end_date, coalesce(w.is_milestone, false)
    into t_project, t_start, t_end, t_mile
  from public.wbs_tasks w where w.id = new.task_id;
  if not found then
    raise exception 'Task % not found', new.task_id using errcode = '23503';
  end if;
  new.project_id := t_project;

  if new.tender_boq_item_id is not null then
    if not exists (
      select 1 from public.tender_boq_items tbi
      join public.tender_register tr on tr.id = tbi.tender_id
      where tbi.id = new.tender_boq_item_id and tr.project_id = t_project
    ) then
      raise exception 'That tender BOQ item does not belong to this task''s project' using errcode = '42501';
    end if;
  end if;
  if new.qs_boq_item_id is not null then
    if not exists (select 1 from public.qs_boq_items qbi where qbi.id = new.qs_boq_item_id and qbi.project_id = t_project) then
      raise exception 'That BOQ item does not belong to this task''s project' using errcode = '42501';
    end if;
  end if;

  v_cal   := public.plan_project_calendar(t_project);
  v_hours := coalesce((select c.hours_per_day from public.plan_calendars c where c.id = v_cal), 8);
  v_dur   := case
               when t_start is null or t_end is null or t_mile then null
               else public.plan_working_days(v_cal, t_start, t_end)
             end;

  if new.norm_id is not null then
    select n.labour_constant_hr_per_unit, n.efficiency_pct, n.unit, n.project_id
      into n_lc, n_eff, n_unit, n_project
    from public.plan_productivity_norms n where n.id = new.norm_id;
    if not found then
      raise exception 'Productivity norm % not found', new.norm_id using errcode = '23503';
    end if;
    -- a norm is either company-wide (project_id null) or belongs to THIS task's project
    if n_project is not null and n_project is distinct from t_project then
      raise exception 'That productivity norm belongs to a different project' using errcode = '42501';
    end if;
    select coalesce(sum(nr.workers_per_crew), 0) into v_crew
    from public.plan_productivity_norm_resources nr
    where nr.norm_id = new.norm_id and nr.kind = 'labor';
  end if;

  select * into r
  from public.plan_compute_work(new.quantity, new.quantity_unit, n_unit, n_lc, n_eff,
                                new.productivity_adjust_pct, v_crew, new.crews, v_hours, v_dur);

  new.work_hours          := r.work_hours;
  new.productivity_factor := r.productivity_factor;
  new.crew_workers_std    := case when new.norm_id is not null then v_crew end;
  new.crew_required       := r.crew_required;
  new.crews_required      := r.crews_required;
  new.duration_wd_current := v_dur;
  new.duration_wd_derived := r.duration_wd_derived;
  new.hours_per_day_used  := v_hours;
  new.calc_status         := r.calc_status;
  new.calc_message        := r.calc_message;
  new.calc_at             := now();

  -- ── cost lines: rebuilt from scratch every time, from THIS row's just-computed work_hours ──
  delete from public.plan_task_cost_lines where task_id = new.task_id;

  if new.calc_status = 'ok' and new.norm_id is not null and new.work_hours is not null and v_crew > 0 then
    c_total := 0; c_any_rate := false; c_all_rate := true;
    c_ot_mult := public.plan_resolve_ot_multiplier(new.ot_type);
    for c_line in
      select nr.role_label, nr.dwl_resource_id, nr.workers_per_crew
      from public.plan_productivity_norm_resources nr
      where nr.norm_id = new.norm_id and nr.kind = 'labor'
      order by nr.sort_order
    loop
      declare
        v_role_hours  numeric := new.work_hours * c_line.workers_per_crew / v_crew;
        v_ot_hours    numeric := v_role_hours * new.ot_pct / 100.0;
        v_norm_hours  numeric := v_role_hours - v_ot_hours;
        v_rate        record;
        v_hourly      numeric;
        v_normal_cost numeric;
        v_ot_cost     numeric;
      begin
        select * into v_rate from public.plan_resolve_labor_rate(c_line.dwl_resource_id);
        if v_rate.daily_rate is not null and v_hours > 0 then
          v_hourly      := v_rate.daily_rate / v_hours;
          v_normal_cost := round(v_norm_hours * v_hourly, 2);
          v_ot_cost     := round(v_ot_hours * v_hourly * c_ot_mult, 2);
          c_any_rate := true;
        else
          v_hourly := null; v_normal_cost := null; v_ot_cost := null;
          c_all_rate := false;
        end if;

        insert into public.plan_task_cost_lines (
          task_id, project_id, role_label, dwl_resource_id, rate_source, workers_per_crew, hours_per_day,
          daily_rate, hourly_rate, ot_pct, ot_type, ot_multiplier, normal_hours, ot_hours,
          normal_cost, ot_cost, line_cost, currency
        ) values (
          new.task_id, t_project, c_line.role_label, c_line.dwl_resource_id,
          case when v_rate.daily_rate is not null then 'dwl' else 'none' end,
          c_line.workers_per_crew, v_hours,
          v_rate.daily_rate, v_hourly, new.ot_pct, new.ot_type, c_ot_mult, v_norm_hours, v_ot_hours,
          v_normal_cost, v_ot_cost, case when v_normal_cost is not null then v_normal_cost + v_ot_cost end,
          v_rate.currency
        );
        if v_normal_cost is not null then c_total := c_total + v_normal_cost + v_ot_cost; end if;
      end;
    end loop;

    if not c_any_rate then
      new.planned_cost := null;
      new.cost_calc_status := 'no_rate';
      new.cost_calc_message := 'None of this task''s crew roles have a resolvable rate (link a crew role to a DWL labour resource with a rate).';
    elsif not c_all_rate then
      new.planned_cost := c_total;
      new.cost_calc_status := 'partial_rate';
      new.cost_calc_message := 'Some crew roles have no resolvable rate - planned_cost is a partial sum, not the full crew.';
    else
      new.planned_cost := c_total;
      new.cost_calc_status := 'ok';
      new.cost_calc_message := null;
    end if;
  else
    new.planned_cost := null;
    new.cost_calc_status := new.calc_status;
    new.cost_calc_message := 'No valid work calculation to cost (see Status).';
  end if;
  new.cost_calc_at := now();

  inputs_changed := tg_op = 'INSERT' or (
       new.quantity is distinct from old.quantity
    or new.quantity_unit is distinct from old.quantity_unit
    or new.norm_id is distinct from old.norm_id
    or new.crews is distinct from old.crews
    or new.productivity_adjust_pct is distinct from old.productivity_adjust_pct
    or new.duration_mode is distinct from old.duration_mode
    or new.quantity_source is distinct from old.quantity_source
    or new.tender_boq_item_id is distinct from old.tender_boq_item_id
    or new.qs_boq_item_id is distinct from old.qs_boq_item_id
    or new.ot_pct is distinct from old.ot_pct
    or new.ot_type is distinct from old.ot_type);
  if inputs_changed then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

-- plan_task_cost_lines rows must be deleted when their plan_task_work row is (the trigger only rebuilds on
-- INSERT/UPDATE); cost lines have no FK back to plan_task_work, so this is not automatic otherwise.
create or replace function public.plan_task_work_delete_cost_lines()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.plan_task_cost_lines where task_id = old.task_id;
  return old;
end $$;

drop trigger if exists trg_plan_task_work_delete_cost_lines on public.plan_task_work;
create trigger trg_plan_task_work_delete_cost_lines
  after delete on public.plan_task_work
  for each row execute function public.plan_task_work_delete_cost_lines();

-- ── 5. WBS cost rollup + BOQ variance (a task's cost/BOQ value rolls into its node and every ancestor) ──
create or replace function public.plan_wbs_cost_rollup(p_project_id uuid)
returns table (
  wbs_node_id  uuid,
  planned_cost numeric,
  priced_tasks integer,
  total_tasks  integer,
  boq_value    numeric,
  mapped_tasks integer,
  variance     numeric
)
language sql
stable
security invoker
as $$
  with recursive descendants as (
    select id as ancestor_id, id as node_id from public.wbs_nodes where project_id = p_project_id
    union all
    select d.ancestor_id, n.id
    from public.wbs_nodes n
    join descendants d on n.parent_id = d.node_id
    where n.project_id = p_project_id
  ),
  task_cost as (
    select
      t.wbs_node_id as node_id,
      w.planned_cost,
      case
        when w.tender_boq_item_id is not null then (select tbi.quantity * tbi.unit_rate from public.tender_boq_items tbi where tbi.id = w.tender_boq_item_id)
        when w.qs_boq_item_id is not null then (select qbi.quantity * qbi.unit_rate from public.qs_boq_items qbi where qbi.id = w.qs_boq_item_id)
      end as boq_value
    from public.wbs_tasks t
    left join public.plan_task_work w on w.task_id = t.id
    where t.project_id = p_project_id
  )
  select
    d.ancestor_id as wbs_node_id,
    coalesce(sum(tc.planned_cost), 0) as planned_cost,
    count(tc.planned_cost)::int as priced_tasks,
    count(*)::int as total_tasks,
    coalesce(sum(tc.boq_value), 0) as boq_value,
    count(tc.boq_value)::int as mapped_tasks,
    coalesce(sum(tc.planned_cost), 0) - coalesce(sum(tc.boq_value), 0) as variance
  from descendants d
  left join task_cost tc on tc.node_id = d.node_id
  group by d.ancestor_id
$$;

comment on function public.plan_wbs_cost_rollup(uuid) is 'Bottom-up plan_task_work.planned_cost per WBS node (own tasks + every descendant node''s), plus the BOQ value of its Phase 2-mapped tasks and the variance. SECURITY INVOKER: the caller''s own RLS on wbs_nodes/wbs_tasks/plan_task_work/*_boq_items governs what it can see.';

grant execute on function public.plan_wbs_cost_rollup(uuid) to authenticated;
