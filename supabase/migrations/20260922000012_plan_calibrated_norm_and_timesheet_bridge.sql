-- Migration: 20260922000012_plan_calibrated_norm_and_timesheet_bridge.sql
-- Purpose: Productivity & Resource-Costing Plan, Phase 5 (part A) — closing the actuals loop.
--
--   timesheet_entries.task_id                new, nullable FK — "timesheet entries carry a task".
--   plan_productivity_log_from_timesheet()   bridge trigger: whenever a timesheet entry carries a task, it
--                                             keeps one matching plan_productivity_logs row in sync (headcount 1,
--                                             the entry's own hours; no quantity — a timesheet has none, so the
--                                             bridged row reads pi_status = 'no_quantity' until someone adds one
--                                             via Site Records). Removed if the task link is cleared or the
--                                             entry is deleted. SECURITY DEFINER: an HR employee filling in their
--                                             own timesheet should not need a Planning-module permission for this
--                                             to work, same rationale as the compute triggers elsewhere in this
--                                             plan — RLS on plan_productivity_logs itself is untouched.
--   plan_propose_calibrated_norm(norm, project, min_logs)   averages real logged performance for an APPROVED
--                                             norm into a new project-scoped DRAFT norm (source = 'calibrated',
--                                             source_norm_id = the original) — never overwrites the approved
--                                             norm; goes through the same draft -> approve workflow as any other
--                                             norm. SECURITY INVOKER: runs with the caller's own norms/create
--                                             right, same as creating a norm by hand.
--
-- Depends on: 20260922000011 (plan_productivity_logs), 20260922000005 (norms), 20260527000037 (timesheet_entries).
-- Safe to re-run.

-- ── 1. timesheet entries carry a task ────────────────────────────────────────
alter table public.timesheet_entries
  add column if not exists task_id uuid references public.wbs_tasks(id) on delete set null;

create index if not exists idx_timesheet_entries_task on public.timesheet_entries (task_id) where task_id is not null;

comment on column public.timesheet_entries.task_id is 'Optional WBS task this entry''s hours were worked against. When set, plan_productivity_log_from_timesheet() mirrors the entry into plan_productivity_logs (source = timesheet).';

-- ── 2. bridge trigger ─────────────────────────────────────────────────────────
create or replace function public.plan_productivity_log_from_timesheet()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project  uuid;
  v_norm_id  uuid;
  v_trade    text;
begin
  if tg_op = 'DELETE' then
    delete from public.plan_productivity_logs where timesheet_entry_id = old.id;
    return old;
  end if;

  if new.task_id is null then
    -- the task link was cleared (or never set): drop whatever this entry previously bridged
    delete from public.plan_productivity_logs where timesheet_entry_id = new.id;
    return new;
  end if;

  select t.project_id into v_project from public.wbs_tasks t where t.id = new.task_id;
  if not found then
    raise exception 'Task % not found', new.task_id using errcode = '23503';
  end if;
  if new.project_id is not null and new.project_id is distinct from v_project then
    raise exception 'That task does not belong to this timesheet entry''s project' using errcode = '42501';
  end if;

  select w.norm_id into v_norm_id from public.plan_task_work w where w.task_id = new.task_id;
  v_trade := coalesce(public.plan_norm_trade(v_norm_id), 'General');

  insert into public.plan_productivity_logs (
    project_id, task_id, trade_code, log_date, headcount, hours_normal, hours_ot,
    quantity_done, unit, source, timesheet_entry_id
  ) values (
    v_project, new.task_id, v_trade, new.entry_date, 1,
    greatest(coalesce(new.hours_worked, 0) - coalesce(new.ot_hours, 0), 0), coalesce(new.ot_hours, 0),
    null, null, 'timesheet', new.id
  )
  on conflict (timesheet_entry_id) where timesheet_entry_id is not null
  do update set
    project_id   = excluded.project_id,
    task_id      = excluded.task_id,
    trade_code   = excluded.trade_code,
    log_date     = excluded.log_date,
    headcount    = excluded.headcount,
    hours_normal = excluded.hours_normal,
    hours_ot     = excluded.hours_ot;

  return new;
end $$;

drop trigger if exists trg_plan_productivity_log_from_timesheet on public.timesheet_entries;
create trigger trg_plan_productivity_log_from_timesheet
  after insert or update or delete on public.timesheet_entries
  for each row execute function public.plan_productivity_log_from_timesheet();

-- ── 3. propose a calibrated norm from logged actuals ─────────────────────────
create or replace function public.plan_propose_calibrated_norm(
  p_norm_id    uuid,
  p_project_id uuid,
  p_min_logs   integer default 3
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_norm       public.plan_productivity_norms%rowtype;
  v_sample     integer;
  v_actual_sum numeric;
  v_qty_sum    numeric;
  v_new_lc     numeric;
  v_new_id     uuid;
  v_from       date;
  v_to         date;
begin
  select * into v_norm from public.plan_productivity_norms n where n.id = p_norm_id;
  if not found then
    raise exception 'Norm % not found', p_norm_id;
  end if;
  if v_norm.status <> 'approved' then
    raise exception 'Only an approved norm can be calibrated from logs (this one is %)', v_norm.status;
  end if;

  select count(*), sum(l.actual_hours), sum(l.quantity_done), min(l.log_date), max(l.log_date)
    into v_sample, v_actual_sum, v_qty_sum, v_from, v_to
  from public.plan_productivity_logs l
  join public.plan_task_work w on w.task_id = l.task_id
  where w.norm_id = p_norm_id
    and l.project_id = p_project_id
    and l.pi_status = 'ok';

  if coalesce(v_sample, 0) < p_min_logs then
    raise exception 'Only % usable log(s) for this norm on this project - need at least %', coalesce(v_sample, 0), p_min_logs;
  end if;
  if coalesce(v_qty_sum, 0) <= 0 then
    raise exception 'Logged quantity sums to zero - cannot calibrate';
  end if;

  v_new_lc := v_actual_sum / v_qty_sum;

  insert into public.plan_productivity_norms (
    project_id, code, name, trade, discipline, activity_key, unit,
    labour_constant_hr_per_unit, hours_per_day_basis, efficiency_pct,
    source, dwl_work_item_id, dwl_assembly_id, basis_note, status, source_norm_id
  ) values (
    p_project_id,
    v_norm.code || '-CAL-' || to_char(now(), 'YYYYMMDD'),
    v_norm.name || ' (calibrated)',
    v_norm.trade, v_norm.discipline, v_norm.activity_key, v_norm.unit,
    round(v_new_lc, 4), v_norm.hours_per_day_basis, 100,
    'calibrated', null, null,
    format('Calibrated from %s site log(s) between %s and %s: observed %s man-hours/%s vs %s man-hours/%s on the approved norm %s.',
           v_sample, v_from, v_to, round(v_new_lc, 4), v_norm.unit, round(v_norm.labour_constant_hr_per_unit, 4), v_norm.unit, v_norm.code),
    'draft', p_norm_id
  )
  returning id into v_new_id;

  insert into public.plan_productivity_norm_resources (norm_id, kind, trade_code, dwl_resource_id, role_label, workers_per_crew, hours_per_day, sort_order)
  select v_new_id, kind, trade_code, dwl_resource_id, role_label, workers_per_crew, hours_per_day, sort_order
  from public.plan_productivity_norm_resources
  where norm_id = p_norm_id;

  return v_new_id;
end $$;

grant execute on function public.plan_propose_calibrated_norm(uuid, uuid, integer) to authenticated;

comment on function public.plan_propose_calibrated_norm(uuid, uuid, integer) is 'Phase 5: proposes a new DRAFT, project-scoped norm (source=calibrated) whose labour constant is observed total actual hours / observed total quantity from plan_productivity_logs (pi_status=ok) against the given APPROVED norm. Never updates the approved norm itself.';
