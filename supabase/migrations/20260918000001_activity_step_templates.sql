-- Migration: 20260918000001_activity_step_templates.sql
-- Purpose: "Activity Step Templates" — replicates Primavera P6's Activity Steps
--          feature for the Planning/WBS module.
--            1. activity_step_template_master / activity_step_template_item —
--               a company-wide, admin-managed library of reusable step
--               templates (grouped by discipline), each an ordered list of
--               weighted steps. Mirrors task_template_master's shape and RLS.
--            2. wbs_task_steps — the steps actually assigned to one schedule
--               activity (a wbs_tasks row). A site engineer assigns a
--               template to a task, which COPIES the template's items into
--               this table as that task's own, independently-editable step
--               list (source_template_id is kept only as provenance — later
--               edits to the master template do not propagate).
--            3. A trigger on wbs_task_steps rolls wbs_tasks.progress up to
--               the weighted average of its steps' progress, by issuing a
--               plain UPDATE — see the function comment below for why that
--               is intentional.
-- Depends on: wbs_tasks (already exists; has a "progress" column watched by
--             trg_task_collect_dirty / trg_task_flush_dirty — see
--             20260905000002_fix_wbs_progress_status_exclusion_and_reparent_trigger.sql),
--             public.can_manage_master_libraries() (20260624000001_master_libraries.sql),
--             public.set_updated_at() (established repo-wide updated_at trigger function).

-- ────────────────────────────────────────────────────────────────────────
-- 1. activity_step_template_master — one row per reusable template
-- ────────────────────────────────────────────────────────────────────────
create table if not exists public.activity_step_template_master (
  id uuid primary key default gen_random_uuid(),
  group_name text not null,
  template_name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_name, template_name)
);

comment on table public.activity_step_template_master is
  'Company-wide library of reusable Activity Step templates (Primavera P6 "Activity Steps" equivalent), grouped by discipline (group_name, e.g. "Architectural Finishes", "MEP First Fix"). Admin-managed; browsable by all authenticated users so a site engineer can assign a template to a wbs_tasks row. Assigning a template COPIES its activity_step_template_item rows into wbs_task_steps for that task — it does not link them, so later edits here never retroactively change tasks that already used the template.';
comment on column public.activity_step_template_master.group_name is
  'Discipline / grouping label used to organize the template picker, e.g. "Architectural Finishes", "MEP First Fix".';
comment on column public.activity_step_template_master.template_name is
  'Display name of the template within its group, e.g. "Standard Plastering Sequence".';
comment on column public.activity_step_template_master.is_active is
  'Soft-disable flag — inactive templates are hidden from the assignment picker but preserved for audit history of tasks that already used them.';

create index if not exists idx_activity_step_template_master_group
  on public.activity_step_template_master(group_name);

alter table public.activity_step_template_master enable row level security;

drop policy if exists "activity_step_template_master authenticated view" on public.activity_step_template_master;
drop policy if exists "activity_step_template_master privileged manage" on public.activity_step_template_master;

create policy "activity_step_template_master authenticated view"
  on public.activity_step_template_master for select to authenticated
  using (true);

create policy "activity_step_template_master privileged manage"
  on public.activity_step_template_master for all to authenticated
  using (public.can_manage_master_libraries())
  with check (public.can_manage_master_libraries());

create trigger set_activity_step_template_master_updated_at
  before update on public.activity_step_template_master
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────
-- 2. activity_step_template_item — ordered, weighted steps within a template
-- ────────────────────────────────────────────────────────────────────────
create table if not exists public.activity_step_template_item (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.activity_step_template_master(id) on delete cascade,
  step_no integer not null,
  step_name text not null,
  weight numeric not null default 0 check (weight >= 0),
  notes text,
  unique (template_id, step_no)
);

comment on table public.activity_step_template_item is
  'Ordered, weighted steps belonging to one activity_step_template_master row. Weights are expected to sum to ~100 across a template''s items (not DB-enforced, matching Primavera P6 behavior where the UI warns but does not block on totals != 100) so a task''s weighted-average progress roll-up behaves as a percentage. Assigning the parent template to a wbs_tasks row copies these rows into wbs_task_steps.';
comment on column public.activity_step_template_item.step_no is
  'Display / execution order of the step within its template (1-based). Unique per template.';
comment on column public.activity_step_template_item.weight is
  'Relative weight of this step toward the template''s overall progress (0-100 scale by convention; template weights should sum to ~100).';

create index if not exists idx_activity_step_template_item_template_id
  on public.activity_step_template_item(template_id);

alter table public.activity_step_template_item enable row level security;

drop policy if exists "activity_step_template_item authenticated view" on public.activity_step_template_item;
drop policy if exists "activity_step_template_item privileged manage" on public.activity_step_template_item;

create policy "activity_step_template_item authenticated view"
  on public.activity_step_template_item for select to authenticated
  using (true);

create policy "activity_step_template_item privileged manage"
  on public.activity_step_template_item for all to authenticated
  using (public.can_manage_master_libraries())
  with check (public.can_manage_master_libraries());

-- ────────────────────────────────────────────────────────────────────────
-- 3. wbs_task_steps — steps actually assigned to one schedule activity,
--    independently editable once copied from a template
-- ────────────────────────────────────────────────────────────────────────
create table if not exists public.wbs_task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.wbs_tasks(id) on delete cascade,
  source_template_id uuid references public.activity_step_template_master(id) on delete set null,
  step_no integer not null,
  step_name text not null,
  weight numeric not null default 0 check (weight >= 0),
  progress numeric not null default 0 check (progress >= 0 and progress <= 100),
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id, step_no)
);

comment on table public.wbs_task_steps is
  'The actual, independently-editable Activity Steps assigned to one wbs_tasks row (schedule activity). Populated by copying activity_step_template_item rows when a site engineer assigns a template to the task — after the copy, these rows are the task''s own step list and are edited freely without affecting the source template or any other task. The parent task''s progress column is kept as a weighted average of these steps'' progress by trg_wbs_task_steps_recalc (see function comment below).';
comment on column public.wbs_task_steps.task_id is
  'The schedule activity (wbs_tasks row) these steps belong to.';
comment on column public.wbs_task_steps.source_template_id is
  'Provenance only — which activity_step_template_master this step was originally copied from, if any (steps may also be added/edited manually). Set null on template deletion; never re-synced from the template after the copy.';
comment on column public.wbs_task_steps.step_no is
  'Display / execution order of the step within the task (1-based). Unique per task.';
comment on column public.wbs_task_steps.weight is
  'Relative weight of this step toward the parent task''s overall progress (0-100 scale by convention; a task''s step weights should sum to ~100).';
comment on column public.wbs_task_steps.progress is
  'Percent complete (0-100) of this individual step, entered directly by the site engineer executing the task.';

create index if not exists idx_wbs_task_steps_task_id on public.wbs_task_steps(task_id);

alter table public.wbs_task_steps enable row level security;

drop policy if exists "wbs_task_steps authenticated all" on public.wbs_task_steps;
create policy "wbs_task_steps authenticated all"
  on public.wbs_task_steps for all to authenticated
  using (true)
  with check (true);

create trigger set_wbs_task_steps_updated_at
  before update on public.wbs_task_steps
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────
-- 4. Roll-up trigger: keep wbs_tasks.progress in sync with the weighted
--    average of its wbs_task_steps
-- ────────────────────────────────────────────────────────────────────────
create or replace function public.recalc_task_progress_from_steps()
returns trigger
language plpgsql
as $$
declare
  v_task_id uuid := coalesce(new.task_id, old.task_id);
  v_weighted numeric;
  v_total_weight numeric;
begin
  select sum(progress * weight), sum(weight)
    into v_weighted, v_total_weight
  from public.wbs_task_steps
  where task_id = v_task_id;

  if v_total_weight is not null and v_total_weight > 0 then
    -- Deliberately a plain UPDATE (not a direct write bypassing triggers):
    -- wbs_tasks already has trg_task_collect_dirty / trg_task_flush_dirty
    -- firing "after insert or update of progress, budget_cost, status,
    -- wbs_node_id or delete" (see
    -- 20260905000002_fix_wbs_progress_status_exclusion_and_reparent_trigger.sql),
    -- which feeds public.recalculate_wbs_progress and cascades the roll-up
    -- up through wbs_nodes and into projects.progress_percentage. Writing
    -- progress here via UPDATE lets that existing chain pick the change up
    -- and cascade automatically — this migration must not duplicate or
    -- reimplement any part of that WBS/project roll-up logic.
    update public.wbs_tasks
    set progress = round(v_weighted / v_total_weight, 2)
    where id = v_task_id;
  end if;

  return coalesce(new, old);
end;
$$;

comment on function public.recalc_task_progress_from_steps() is
  'Recomputes the weighted-average progress of a task''s Activity Steps (wbs_task_steps) and writes it into wbs_tasks.progress via a plain UPDATE whenever a step is inserted/updated/deleted. This is a deliberate design choice, not a gap: wbs_tasks already carries trg_task_collect_dirty / trg_task_flush_dirty triggers watching "update of progress" (among other columns) that feed public.recalculate_wbs_progress and cascade the roll-up up through wbs_nodes and projects. By updating wbs_tasks.progress with a normal UPDATE statement, that existing chain fires naturally — this function must never write to wbs_nodes/projects directly or otherwise duplicate that logic.';

drop trigger if exists trg_wbs_task_steps_recalc on public.wbs_task_steps;
create trigger trg_wbs_task_steps_recalc
  after insert or update of progress, weight or delete
  on public.wbs_task_steps
  for each row
  execute function public.recalc_task_progress_from_steps();
