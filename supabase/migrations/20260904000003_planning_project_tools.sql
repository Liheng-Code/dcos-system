-- Migration: 20260904000003_planning_project_tools.sql
-- Purpose: MS-Project "Project" tab tools for Planning ▸ Gantt Chart —
--          WBS Code mask, numbered baselines, Move Project.
-- Depends on: plan_calendars (20260531000045), wbs_baselines (20260527000016),
--             wbs_tasks / wbs_nodes, projects, public.is_wbs_manager()
--             + the lock triggers (20260904000001 / 20260904000002).

-- ── 1. WBS code mask (one row per project) ────────────────────────────────
create table if not exists public.plan_wbs_code_mask (
  project_id       uuid primary key references public.projects(id) on delete cascade,
  code_prefix      text not null default '',
  -- [{ sequence: 'numbers'|'upper'|'lower'|'chars', length: int|null, separator: text }]
  levels           jsonb not null default '[{"sequence":"numbers","length":2,"separator":"."}]'::jsonb,
  generate_for_new boolean not null default true,
  verify_unique    boolean not null default true,
  updated_at       timestamptz not null default now()
);

alter table public.plan_wbs_code_mask enable row level security;
drop policy if exists "auth_plan_wbs_code_mask" on public.plan_wbs_code_mask;
create policy "auth_plan_wbs_code_mask" on public.plan_wbs_code_mask
  for all to authenticated using (true) with check (true);

-- ── 2. Persisted / hand-editable WBS outline code ─────────────────────────
alter table public.wbs_nodes add column if not exists wbs_outline_code text;
alter table public.wbs_tasks add column if not exists wbs_outline_code text;

comment on column public.wbs_tasks.wbs_outline_code is
  'MS-Project WBS code. Null = use the value computed live from the outline '
  'position + plan_wbs_code_mask; non-null = a persisted / hand-edited override.';

-- ── 3. Numbered baselines ────────────────────────────────────────────────
alter table public.wbs_baselines
  add column if not exists baseline_number int not null default 0,
  add column if not exists set_by uuid references auth.users(id);

-- Renumber any pre-existing rows per project (newest = 0 = "Baseline").
with r as (
  select id, row_number() over (partition by project_id order by created_at desc) - 1 as n
  from public.wbs_baselines
)
update public.wbs_baselines b set baseline_number = r.n
from r where r.id = b.id and b.baseline_number is distinct from r.n;

create unique index if not exists wbs_baselines_project_number_key
  on public.wbs_baselines(project_id, baseline_number);

comment on column public.wbs_baselines.baseline_number is
  '0 = "Baseline", 1..10 = "Baseline N". snapshot_data = '
  '{ set_at, tasks: [{ id, start_date, end_date }] }.';

-- ── 4. RPCs (security invoker — tenant RLS + lock triggers still apply) ───

-- 4a. Bulk-write WBS outline codes. p_rows = [{ id, kind:'node'|'task', code }]
create or replace function public.apply_wbs_codes(p_project_id uuid, p_rows jsonb)
returns integer
language plpgsql
security invoker
as $$
declare
  n_nodes int := 0;
  n_tasks int := 0;
begin
  update public.wbs_nodes t
     set wbs_outline_code = r.code
    from jsonb_to_recordset(p_rows) as r(id uuid, kind text, code text)
   where r.kind = 'node' and t.id = r.id and t.project_id = p_project_id
     and t.wbs_outline_code is distinct from r.code;
  get diagnostics n_nodes = row_count;

  update public.wbs_tasks t
     set wbs_outline_code = r.code
    from jsonb_to_recordset(p_rows) as r(id uuid, kind text, code text)
   where r.kind = 'task' and t.id = r.id and t.project_id = p_project_id
     and t.wbs_outline_code is distinct from r.code;
  get diagnostics n_tasks = row_count;

  return n_nodes + n_tasks;
end
$$;
grant execute on function public.apply_wbs_codes(uuid, jsonb) to authenticated;

-- 4b. Set a numbered baseline. p_task_ids null/empty = entire project.
create or replace function public.set_baseline(p_project_id uuid, p_number int, p_task_ids uuid[])
returns void
language plpgsql
security invoker
as $$
declare
  v_whole boolean := (p_task_ids is null or array_length(p_task_ids, 1) is null);
  v_new   jsonb;
  v_kept  jsonb := '[]'::jsonb;
begin
  select coalesce(
           jsonb_agg(jsonb_build_object('id', id, 'start_date', start_date, 'end_date', end_date)
                     order by id),
           '[]'::jsonb)
    into v_new
    from public.wbs_tasks
   where project_id = p_project_id
     and start_date is not null and end_date is not null
     and (v_whole or id = any (p_task_ids));

  if not v_whole then
    select coalesce(jsonb_agg(e), '[]'::jsonb)
      into v_kept
      from public.wbs_baselines b,
           lateral jsonb_array_elements(coalesce(b.snapshot_data -> 'tasks', '[]'::jsonb)) e
     where b.project_id = p_project_id
       and b.baseline_number = p_number
       and not ((e ->> 'id')::uuid = any (p_task_ids));
  end if;

  insert into public.wbs_baselines
    (project_id, baseline_number, baseline_name, baseline_type, baseline_date,
     snapshot_data, is_active, set_by, created_by)
  values
    (p_project_id, p_number,
     case when p_number = 0 then 'Baseline' else 'Baseline ' || p_number end,
     'current', current_date,
     jsonb_build_object('set_at', now(), 'tasks', v_kept || v_new),
     v_whole, auth.uid(), auth.uid())
  on conflict (project_id, baseline_number) do update set
     snapshot_data = jsonb_build_object('set_at', now(), 'tasks', v_kept || v_new),
     baseline_date = current_date,
     set_by        = auth.uid(),
     is_active     = case when v_whole then true else public.wbs_baselines.is_active end;

  if v_whole then
    update public.wbs_baselines set is_active = false
     where project_id = p_project_id and baseline_number <> p_number;
  end if;

  update public.wbs_tasks t set
     baseline_start_date  = (e ->> 'start_date')::date,
     baseline_finish_date = (e ->> 'end_date')::date,
     baseline_set_at      = now(),
     baseline_set_by      = auth.uid()
    from jsonb_array_elements(v_new) e
   where t.id = (e ->> 'id')::uuid and t.project_id = p_project_id;
end
$$;
grant execute on function public.set_baseline(uuid, int, uuid[]) to authenticated;

-- 4c. Clear a numbered baseline (whole project, or just p_task_ids).
create or replace function public.clear_baseline(p_project_id uuid, p_number int, p_task_ids uuid[])
returns void
language plpgsql
security invoker
as $$
declare
  v_whole      boolean := (p_task_ids is null or array_length(p_task_ids, 1) is null);
  v_was_active boolean;
begin
  select is_active into v_was_active
    from public.wbs_baselines
   where project_id = p_project_id and baseline_number = p_number;

  if v_whole then
    delete from public.wbs_baselines
     where project_id = p_project_id and baseline_number = p_number;
  else
    update public.wbs_baselines set snapshot_data = jsonb_build_object(
             'set_at', now(),
             'tasks', coalesce(
               (select jsonb_agg(e)
                  from jsonb_array_elements(coalesce(snapshot_data -> 'tasks', '[]'::jsonb)) e
                 where not ((e ->> 'id')::uuid = any (p_task_ids))),
               '[]'::jsonb))
     where project_id = p_project_id and baseline_number = p_number;
  end if;

  if coalesce(v_was_active, false) then
    update public.wbs_tasks set
       baseline_start_date = null, baseline_finish_date = null,
       baseline_set_at = null, baseline_set_by = null
     where project_id = p_project_id and (v_whole or id = any (p_task_ids));
  end if;
end
$$;
grant execute on function public.clear_baseline(uuid, int, uuid[]) to authenticated;

-- 4d. Make a numbered baseline the active (displayed) one.
create or replace function public.activate_baseline(p_project_id uuid, p_number int)
returns void
language plpgsql
security invoker
as $$
begin
  update public.wbs_baselines set is_active = (baseline_number = p_number)
   where project_id = p_project_id;

  update public.wbs_tasks set
     baseline_start_date = null, baseline_finish_date = null
   where project_id = p_project_id;

  update public.wbs_tasks t set
     baseline_start_date  = (e ->> 'start_date')::date,
     baseline_finish_date = (e ->> 'end_date')::date,
     baseline_set_at      = now(),
     baseline_set_by      = auth.uid()
    from public.wbs_baselines b,
         lateral jsonb_array_elements(coalesce(b.snapshot_data -> 'tasks', '[]'::jsonb)) e
   where b.project_id = p_project_id and b.baseline_number = p_number
     and t.id = (e ->> 'id')::uuid and t.project_id = p_project_id;
end
$$;
grant execute on function public.activate_baseline(uuid, int) to authenticated;

-- 4e. Move the whole project by a calendar-day delta.
create or replace function public.move_project(
  p_project_id uuid,
  p_delta_days int,
  p_shift_constraints boolean,
  p_shift_baseline boolean)
returns integer
language plpgsql
security invoker
as $$
declare
  n int;
begin
  update public.wbs_tasks set
     start_date = start_date + p_delta_days,
     end_date   = end_date + p_delta_days,
     constraint_date = case
       when p_shift_constraints and constraint_date is not null
         then constraint_date + p_delta_days else constraint_date end,
     baseline_start_date = case
       when p_shift_baseline and baseline_start_date is not null
         then baseline_start_date + p_delta_days else baseline_start_date end,
     baseline_finish_date = case
       when p_shift_baseline and baseline_finish_date is not null
         then baseline_finish_date + p_delta_days else baseline_finish_date end
   where project_id = p_project_id and start_date is not null and end_date is not null;
  get diagnostics n = row_count;

  update public.projects set
     start_date = case when start_date is not null then start_date + p_delta_days else start_date end,
     data_date  = case when data_date  is not null then data_date  + p_delta_days else data_date  end
   where id = p_project_id;

  return n;
end
$$;
grant execute on function public.move_project(uuid, int, boolean, boolean) to authenticated;
