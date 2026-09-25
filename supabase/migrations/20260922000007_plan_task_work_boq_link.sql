-- Migration: 20260922000007_plan_task_work_boq_link.sql
-- Purpose: Productivity & Resource-Costing Plan, Phase 2 — quantities linked to the WBS.
--
--   plan_task_work.tender_boq_item_id / qs_boq_item_id   which BOQ line a quantity came from (exactly one,
--                                                          only when quantity_source is 'tender_boq' / 'boq')
--   plan_task_work_quantity_history                       append-only log of every quantity/unit/source/link
--                                                          change, mirroring the wbs_node_quantities pattern
--                                                          (reason mandatory when REVISING an existing value)
--
-- Depends on: 20260922000006 (plan_task_work), public.tender_boq_items, public.qs_boq_items.
-- Safe to re-run.

-- ── 1. BOQ link columns ──────────────────────────────────────────────────────
alter table public.plan_task_work
  add column if not exists tender_boq_item_id uuid references public.tender_boq_items(id) on delete set null,
  add column if not exists qs_boq_item_id      uuid references public.qs_boq_items(id) on delete set null;

create index if not exists idx_plan_task_work_tender_boq_item on public.plan_task_work (tender_boq_item_id) where tender_boq_item_id is not null;
create index if not exists idx_plan_task_work_qs_boq_item     on public.plan_task_work (qs_boq_item_id) where qs_boq_item_id is not null;

-- A row sourced from a BOQ must carry exactly the matching link (traceability); any other source carries
-- neither. This is what "traceable to a BOQ line" means operationally.
alter table public.plan_task_work drop constraint if exists plan_task_work_boq_link_chk;
alter table public.plan_task_work add constraint plan_task_work_boq_link_chk check (
  (quantity_source = 'tender_boq' and tender_boq_item_id is not null and qs_boq_item_id is null)
  or (quantity_source = 'boq' and qs_boq_item_id is not null and tender_boq_item_id is null)
  or (quantity_source not in ('tender_boq', 'boq') and tender_boq_item_id is null and qs_boq_item_id is null)
);

comment on column public.plan_task_work.tender_boq_item_id is 'Set only when quantity_source = tender_boq. The tender BOQ line this quantity was copied from.';
comment on column public.plan_task_work.qs_boq_item_id is 'Set only when quantity_source = boq. The project''s own qs_boq_items line this quantity was copied from.';

-- ── 2. compute trigger: also reject a BOQ line from another project ──────────
-- Re-declares plan_task_work_compute() from 20260922000006 with the same SECURITY DEFINER rationale (the
-- calculation must not depend on the saver's read rights) plus two new checks: a linked BOQ item must belong
-- to this task's project. Everything else is unchanged from 20260922000006.
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

  inputs_changed := tg_op = 'INSERT' or (
       new.quantity is distinct from old.quantity
    or new.quantity_unit is distinct from old.quantity_unit
    or new.norm_id is distinct from old.norm_id
    or new.crews is distinct from old.crews
    or new.productivity_adjust_pct is distinct from old.productivity_adjust_pct
    or new.duration_mode is distinct from old.duration_mode
    or new.quantity_source is distinct from old.quantity_source
    or new.tender_boq_item_id is distinct from old.tender_boq_item_id
    or new.qs_boq_item_id is distinct from old.qs_boq_item_id);
  if inputs_changed then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

-- ── 3. quantity revision history ─────────────────────────────────────────────
create table if not exists public.plan_task_work_quantity_history (
  id                       uuid primary key default gen_random_uuid(),
  task_id                  uuid not null references public.wbs_tasks(id) on delete cascade,
  project_id               uuid not null references public.projects(id) on delete cascade,
  changed_at               timestamptz not null default now(),
  changed_by               uuid references auth.users(id) default auth.uid(),
  old_quantity             numeric,
  new_quantity             numeric,
  old_quantity_unit        text,
  new_quantity_unit        text,
  old_quantity_source      text,
  new_quantity_source      text,
  old_tender_boq_item_id   uuid,
  new_tender_boq_item_id   uuid,
  old_qs_boq_item_id       uuid,
  new_qs_boq_item_id       uuid,
  reason                   text
);

create index if not exists idx_ptw_qty_history_task on public.plan_task_work_quantity_history (task_id, changed_at desc);
create index if not exists idx_ptw_qty_history_project on public.plan_task_work_quantity_history (project_id);

comment on table public.plan_task_work_quantity_history is 'Append-only log of plan_task_work quantity/unit/source/BOQ-link changes. Written only by trg_plan_task_work_quantity_history (see plan_task_work_quantity_history_log()); never written to directly.';

alter table public.plan_task_work_quantity_history enable row level security;

drop policy if exists plan_task_work_quantity_history_select on public.plan_task_work_quantity_history;
create policy plan_task_work_quantity_history_select on public.plan_task_work_quantity_history for select to authenticated
  using (is_project_member(project_id) and has_permission('planning', 'task_work', 'view'));
-- No insert/update/delete policy: rows are written only by the SECURITY DEFINER trigger below.

-- AFTER trigger: logs every change to quantity/unit/source/link. A reason is mandatory only when REVISING an
-- already-recorded quantity (old.quantity is not null and something changed) — the first time a quantity is
-- entered needs no reason, exactly as wbs_node_quantities treats its first value vs. a revision.
create or replace function public.plan_task_work_quantity_history_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_changed := new.quantity is not null;
  else
    v_changed := new.quantity is distinct from old.quantity
              or new.quantity_unit is distinct from old.quantity_unit
              or new.quantity_source is distinct from old.quantity_source
              or new.tender_boq_item_id is distinct from old.tender_boq_item_id
              or new.qs_boq_item_id is distinct from old.qs_boq_item_id;
  end if;
  if not v_changed then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.quantity is not null
     and (new.quantity_reason is null or btrim(new.quantity_reason) = '') then
    raise exception 'A reason is required when changing an already-recorded quantity' using errcode = '23514';
  end if;

  insert into public.plan_task_work_quantity_history (
    task_id, project_id, changed_by,
    old_quantity, new_quantity, old_quantity_unit, new_quantity_unit,
    old_quantity_source, new_quantity_source,
    old_tender_boq_item_id, new_tender_boq_item_id, old_qs_boq_item_id, new_qs_boq_item_id,
    reason
  ) values (
    new.task_id, new.project_id, auth.uid(),
    case when tg_op = 'UPDATE' then old.quantity end, new.quantity,
    case when tg_op = 'UPDATE' then old.quantity_unit end, new.quantity_unit,
    case when tg_op = 'UPDATE' then old.quantity_source end, new.quantity_source,
    case when tg_op = 'UPDATE' then old.tender_boq_item_id end, new.tender_boq_item_id,
    case when tg_op = 'UPDATE' then old.qs_boq_item_id end, new.qs_boq_item_id,
    new.quantity_reason
  );
  return new;
end $$;

drop trigger if exists trg_plan_task_work_quantity_history on public.plan_task_work;
create trigger trg_plan_task_work_quantity_history
  after insert or update on public.plan_task_work
  for each row execute function public.plan_task_work_quantity_history_log();
