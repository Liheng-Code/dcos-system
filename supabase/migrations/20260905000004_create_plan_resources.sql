-- Migration: 20260905000004_create_plan_resources.sql
-- Purpose: Introduce a resource master (public.plan_resources) and a
--          task<->resource assignment table with allocation % (public.
--          plan_task_assignments), plus an over-allocation detection RPC
--          (get_resource_allocation). Phase 4 of the MS Project Gap
--          Remediation Plan, section 2 "Resource assignment + over-allocation
--          detection"
--          (docs/04-Business-Modules/06-Planning-Scheduling/13-MSProject-Gap-Remediation-Plan.md).
-- Depends on:
--   public.projects            (20260527000008_create_projects.sql)
--   public.wbs_tasks           (20260527000016_create_wbs_enterprise_tables.sql)
--   public.plan_calendars      (20260531000045_planning_scheduling.sql)
--
-- This is purely additive. wbs_tasks.owner_name is left untouched — it keeps
-- powering Look-ahead/print views for now; a future backfill script may turn
-- distinct owner_name values into plan_resources rows, but that is optional
-- cleanup out of scope for this migration.

-- ── 1. Resource master ──────────────────────────────────────────────────────
create table public.plan_resources (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  name            text not null,
  resource_type   text not null default 'labor'
                    check (resource_type in ('labor', 'equipment', 'material', 'subcontractor')),
  max_units       numeric not null default 100,   -- MS Project's "Max Units %"
  cost_per_unit   numeric,
  unit_label      text,                            -- e.g. "hr", "day", "m3"
  calendar_id     uuid references public.plan_calendars(id),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create index idx_plan_resources_project on public.plan_resources(project_id);

-- ── 2. Task <-> resource assignments ────────────────────────────────────────
create table public.plan_task_assignments (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid not null references public.wbs_tasks(id) on delete cascade,
  resource_id        uuid not null references public.plan_resources(id) on delete cascade,
  allocation_percent numeric not null default 100,
  created_at         timestamptz not null default now(),
  unique (task_id, resource_id)
);

create index idx_plan_task_assignments_task     on public.plan_task_assignments(task_id);
create index idx_plan_task_assignments_resource on public.plan_task_assignments(resource_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
-- This codebase does app-level project scoping via project_id filters in
-- queries, not DB-level per-tenant RLS. Mirror the exact permissive-
-- authenticated pattern already used for public.plan_calendars
-- (20260531000045_planning_scheduling.sql) rather than inventing a stricter
-- policy that would break the established convention.
alter table public.plan_resources        enable row level security;
alter table public.plan_task_assignments enable row level security;

create policy "auth_plan_resources"        on public.plan_resources        to authenticated using (true) with check (true);
create policy "auth_plan_task_assignments" on public.plan_task_assignments to authenticated using (true) with check (true);

-- ── 4. Over-allocation detection RPC ────────────────────────────────────────
-- Expands every assignment's task span (start_date..end_date, day-inclusive —
-- the same date-range convention used by get_schedule_variance /
-- get_critical_path_tasks in 20260531000004_create_schedule_rpcs.sql, where
-- duration is computed directly off start_date/end_date) into one row per
-- calendar day, and sums allocation_percent per resource per day. The
-- scheduler already works in whole days only (no per-resource working-
-- calendar exceptions modelled here — that is out of scope, per the
-- remediation plan).
create function public.get_resource_allocation(p_project_id uuid)
returns table (
  resource_id      uuid,
  resource_name    text,
  work_date        date,
  total_allocation numeric,
  max_units        numeric,
  is_overallocated boolean
)
language sql
security invoker
stable
as $$
  with expanded as (
    select
      a.resource_id,
      a.allocation_percent,
      gs.work_date::date as work_date
    from public.plan_task_assignments a
    join public.wbs_tasks      t on t.id = a.task_id
    join public.plan_resources r on r.id = a.resource_id
    cross join lateral generate_series(t.start_date, t.end_date, interval '1 day') as gs(work_date)
    where t.project_id = p_project_id
      and r.project_id = p_project_id
      and t.start_date is not null
      and t.end_date   is not null
  ),
  summed as (
    select resource_id, work_date, sum(allocation_percent) as total_allocation
    from expanded
    group by resource_id, work_date
  )
  select
    s.resource_id,
    r.name                            as resource_name,
    s.work_date,
    s.total_allocation,
    r.max_units,
    s.total_allocation > r.max_units  as is_overallocated
  from summed s
  join public.plan_resources r on r.id = s.resource_id
  order by r.name, s.work_date
$$;
grant execute on function public.get_resource_allocation(uuid) to authenticated;
