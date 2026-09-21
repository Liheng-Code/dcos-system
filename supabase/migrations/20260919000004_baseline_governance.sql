-- Migration: 20260919000004_baseline_governance.sql
-- Purpose: Planning & Scheduling Completion Plan, Phase 1, item 1.3 —
--          baseline governance: lock/contract-type protection, a required
--          reason for revised baselines, and client acceptance tracking.
-- Depends on:
--   public.wbs_baselines  (20260527000016_create_wbs_enterprise_tables.sql,
--                           baseline_number/set_by added in
--                           20260904000003_planning_project_tools.sql)
--   public.set_baseline / clear_baseline / activate_baseline / get_schedule_variance
--                          (current definitions as of
--                           20260905000003_add_baseline_cost_variance.sql —
--                           read in full before writing this migration)
--   public.is_admin(uuid) (20260824035808_usr_rbac_helper_functions.sql)
--
-- Schema verification notes:
--   - wbs_baselines' current columns (after 20260904000003 and
--     20260905000003) are: id, project_id, baseline_name, baseline_type
--     (contract|revised|current), baseline_date, snapshot_data, is_active,
--     created_by, created_at, baseline_number, set_by. No mismatches versus
--     the plan's assumptions — the new columns below are purely additive.
--   - set_baseline(p_project_id uuid, p_number int, p_task_ids uuid[])
--     RETURNS void, LANGUAGE plpgsql, SECURITY INVOKER — confirmed as the
--     exact current signature from 20260905000003_add_baseline_cost_variance.sql
--     (the version that also snapshots budget_cost -> baseline_cost). The
--     function body below is that exact function with only the two guard
--     checks added at the top and baseline_name/baseline_type/reason/locked
--     added to the insert/on-conflict-update — every existing branch (whole
--     vs partial task_ids, is_active handling, the baseline_cost snapshot
--     logic) is unchanged.
--   - IMPORTANT: `create or replace function` cannot change a function's
--     parameter list in place — adding p_name/p_type/p_reason at the end
--     would otherwise create a second, overloaded set_baseline() alongside
--     the existing 3-argument one, which makes any 3-argument call ambiguous
--     ("function set_baseline(uuid, int, uuid[]) is not unique"). The
--     existing 3-arg function is therefore dropped first, then the 6-arg
--     version (with the same first three parameters, so old 3-arg callers
--     keep working unchanged via the new defaults) is created in its place.
--     This mirrors the exact drop-then-recreate precedent already used in
--     this codebase for get_schedule_variance() in
--     20260905000003_add_baseline_cost_variance.sql for the same reason
--     (Postgres cannot alter a function's OUT/IN column list via replace).

-- ── 1. New governance columns ──────────────────────────────────────────────
alter table public.wbs_baselines
  add column if not exists reason text,
  add column if not exists locked boolean not null default false,
  add column if not exists client_accepted boolean not null default false,
  add column if not exists client_accepted_at timestamptz,
  add column if not exists client_accepted_by uuid references public.profiles(id);

-- ── 2. set_baseline(): add lock/contract guard + revised-reason guard ──────
drop function if exists public.set_baseline(uuid, int, uuid[]);

create or replace function public.set_baseline(
  p_project_id uuid,
  p_number int,
  p_task_ids uuid[],
  p_name text default null,
  p_type text default 'current',
  p_reason text default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_whole boolean := (p_task_ids is null or array_length(p_task_ids, 1) is null);
  v_new   jsonb;
  v_kept  jsonb := '[]'::jsonb;
  v_existing_locked boolean;
  v_existing_type   text;
begin
  select locked, baseline_type
    into v_existing_locked, v_existing_type
    from public.wbs_baselines
   where project_id = p_project_id and baseline_number = p_number;

  if coalesce(v_existing_locked, false) or v_existing_type = 'contract' then
    raise exception 'Baseline slot % is locked — create a revised baseline instead', p_number;
  end if;

  if p_type = 'revised' and (p_reason is null or length(trim(p_reason)) < 10) then
    raise exception 'A reason is required to create a revised baseline';
  end if;

  select coalesce(
           jsonb_agg(jsonb_build_object(
             'id', id, 'start_date', start_date, 'end_date', end_date,
             'budget_cost', budget_cost)
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
     snapshot_data, is_active, set_by, created_by, reason, locked)
  values
    (p_project_id, p_number,
     coalesce(p_name, case when p_number = 0 then 'Baseline' else 'Baseline ' || p_number end),
     p_type, current_date,
     jsonb_build_object('set_at', now(), 'tasks', v_kept || v_new),
     v_whole, auth.uid(), auth.uid(), p_reason,
     (p_type = 'contract'))
  on conflict (project_id, baseline_number) do update set
     snapshot_data = jsonb_build_object('set_at', now(), 'tasks', v_kept || v_new),
     baseline_date = current_date,
     set_by        = auth.uid(),
     baseline_name = coalesce(p_name, public.wbs_baselines.baseline_name),
     baseline_type = p_type,
     reason        = p_reason,
     locked        = case when p_type = 'contract' then true else public.wbs_baselines.locked end,
     is_active     = case when v_whole then true else public.wbs_baselines.is_active end;

  if v_whole then
    update public.wbs_baselines set is_active = false
     where project_id = p_project_id and baseline_number <> p_number;
  end if;

  update public.wbs_tasks t set
     baseline_start_date  = (e ->> 'start_date')::date,
     baseline_finish_date = (e ->> 'end_date')::date,
     baseline_cost         = (e ->> 'budget_cost')::numeric,
     baseline_set_at      = now(),
     baseline_set_by      = auth.uid()
    from jsonb_array_elements(v_new) e
   where t.id = (e ->> 'id')::uuid and t.project_id = p_project_id;
end
$$;

grant execute on function public.set_baseline(uuid, int, uuid[], text, text, text) to authenticated;

-- ── 3. Lock enforcement trigger ─────────────────────────────────────────────
-- Blocks UPDATE/DELETE on a locked baseline for non-admins, except the one
-- legitimate case: accept_baseline_by_client() only touches
-- client_accepted/client_accepted_at/client_accepted_by, which must remain
-- writable on a locked (e.g. contract) baseline.
create or replace function public.prevent_locked_baseline_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.locked and not public.is_admin(auth.uid()) then
      raise exception 'This baseline is locked and cannot be modified';
    end if;
    return old;
  end if;

  if old.locked and not public.is_admin(auth.uid()) then
    if new.reason is distinct from old.reason
       or new.baseline_name is distinct from old.baseline_name
       or new.baseline_type is distinct from old.baseline_type
       or new.snapshot_data is distinct from old.snapshot_data then
      raise exception 'This baseline is locked and cannot be modified';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_locked_baseline_mutation on public.wbs_baselines;
create trigger trg_prevent_locked_baseline_mutation
  before update or delete on public.wbs_baselines
  for each row execute function public.prevent_locked_baseline_mutation();

-- ── 4. Client acceptance RPC ────────────────────────────────────────────────
-- Permission-gating deferred to Phase 2 — any authenticated user may call
-- this for now, per the plan's phased approach.
create or replace function public.accept_baseline_by_client(p_baseline_id uuid)
returns void
language plpgsql
security invoker
as $$
begin
  update public.wbs_baselines
  set client_accepted = true,
      client_accepted_at = now(),
      client_accepted_by = auth.uid()
  where id = p_baseline_id;
end;
$$;

grant execute on function public.accept_baseline_by_client(uuid) to authenticated;
