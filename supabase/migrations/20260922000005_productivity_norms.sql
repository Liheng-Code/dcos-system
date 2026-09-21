-- Migration: 20260922000005_productivity_norms.sql
-- Purpose: Productivity & Resource-Costing Plan (docs/04-Business-Modules/06-Planning-Scheduling/
--          16-Productivity-and-Resource-Costing-Plan.md), Phase 1 — the PRODUCTIVITY NORM library.
--
-- A norm answers: "how many man-hours does one unit of this work take, and what crew does it?"
--   canonical value  = labour_constant_hr_per_unit  (man-hours per unit, whole crew, before efficiency)
--   derived          = crew output per day = (sum of labour workers in the crew x hours/day) / labour constant
-- Storing man-hours per unit (plan decision #3) reconciles the two conventions already in DWL
-- (consumption per unit in `day/m3` vs `daily_output` per crew).
--
-- Scope (plan decision #2): project_id NULL = COMPANY library; project_id set = a project override /
-- calibrated copy of a company norm (source_norm_id points at the original).
--
-- Governance:
--   * every norm carries a mandatory basis_note (like DWL recipe lines) so its origin is never lost;
--   * status draft -> approved -> retired. Approving needs planning/norms/approve (QS + planning managers);
--   * an APPROVED norm is locked: to change it, retire it or save a copy as a new draft.
--   * company-library rows are written only with planning/norms/configure; project rows by project members.
--
-- Depends on: public.projects, public.dwl_work_items (20260720000006), public.dwl_assemblies (20260720000008),
--             public.dwl_resources (20260720000003), has_permission()/is_project_member() and the 'norms'
--             permission rows (20260922000004).
-- Safe to re-run.

-- ── 0. shared helper ────────────────────────────────────────────────────────
create or replace function public.plan_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── 1. norms ────────────────────────────────────────────────────────────────
create table if not exists public.plan_productivity_norms (
  id                          uuid primary key default gen_random_uuid(),
  project_id                  uuid references public.projects(id) on delete cascade,   -- NULL = company library
  code                        text not null,
  name                        text not null,
  trade                       text,
  discipline                  text,
  activity_key                text,                                                     -- keyword used to suggest a norm for a task
  unit                        text not null,                                            -- output unit: m3, m2, kg, no ...
  labour_constant_hr_per_unit numeric not null check (labour_constant_hr_per_unit > 0),
  hours_per_day_basis         numeric not null default 8  check (hours_per_day_basis > 0 and hours_per_day_basis <= 24),
  efficiency_pct              numeric not null default 100 check (efficiency_pct > 0 and efficiency_pct <= 200),
  source                      text not null default 'manual'
                                check (source in ('manual', 'dwl_work_item', 'dwl_assembly', 'calibrated')),
  dwl_work_item_id            uuid references public.dwl_work_items(id) on delete set null,
  dwl_assembly_id             uuid references public.dwl_assemblies(id) on delete set null,
  basis_note                  text not null check (length(btrim(basis_note)) > 0),
  status                      text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  approved_by                 uuid references auth.users(id),
  approved_at                 timestamptz,
  valid_from                  date,
  valid_to                    date,
  source_norm_id              uuid references public.plan_productivity_norms(id) on delete set null,
  created_by                  uuid references auth.users(id) default auth.uid(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from)
);

-- one code per scope (company library, or per project), case-insensitive
create unique index if not exists ux_plan_productivity_norms_code
  on public.plan_productivity_norms ((coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid)), lower(code));
create index if not exists idx_plan_productivity_norms_project on public.plan_productivity_norms (project_id);
create index if not exists idx_plan_productivity_norms_lookup  on public.plan_productivity_norms (status, lower(unit));

comment on table  public.plan_productivity_norms is 'Productivity norms (labour constants). project_id NULL = company library. See 16-Productivity-and-Resource-Costing-Plan.md.';
comment on column public.plan_productivity_norms.labour_constant_hr_per_unit is 'Canonical: man-hours of the WHOLE crew per unit of output, before the efficiency factor.';

-- ── 2. crew composition ─────────────────────────────────────────────────────
create table if not exists public.plan_productivity_norm_resources (
  id               uuid primary key default gen_random_uuid(),
  norm_id          uuid not null references public.plan_productivity_norms(id) on delete cascade,
  kind             text not null check (kind in ('labor', 'equipment')),
  role_label       text not null check (length(btrim(role_label)) > 0),
  trade_code       text,
  dwl_resource_id  uuid references public.dwl_resources(id) on delete set null,
  workers_per_crew numeric not null default 1 check (workers_per_crew > 0),   -- equipment: units per crew
  hours_per_day    numeric check (hours_per_day is null or (hours_per_day > 0 and hours_per_day <= 24)),
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists idx_plan_norm_resources_norm on public.plan_productivity_norm_resources (norm_id, sort_order);

comment on table public.plan_productivity_norm_resources is 'Crew of a norm: labour trades (workers per crew) and equipment (units per crew).';

-- ── 3. triggers ─────────────────────────────────────────────────────────────
drop trigger if exists trg_plan_productivity_norms_touch on public.plan_productivity_norms;
create trigger trg_plan_productivity_norms_touch
  before update on public.plan_productivity_norms
  for each row execute function public.plan_touch_updated_at();

-- Approval and immutability guard.
create or replace function public.plan_productivity_norms_guard()
returns trigger language plpgsql as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    if not public.has_permission('planning', 'norms', 'approve') then
      raise exception 'Approving a productivity norm requires the planning/norms approve permission'
        using errcode = '42501';
    end if;
    new.approved_by := auth.uid();
    new.approved_at := now();
  elsif new.status = 'draft' then
    new.approved_by := null;
    new.approved_at := null;
  end if;

  if tg_op = 'UPDATE' and old.status = 'approved' and new.status = 'approved' then
    if new.code                        is distinct from old.code
       or new.unit                     is distinct from old.unit
       or new.labour_constant_hr_per_unit is distinct from old.labour_constant_hr_per_unit
       or new.hours_per_day_basis      is distinct from old.hours_per_day_basis
       or new.efficiency_pct           is distinct from old.efficiency_pct
       or new.project_id               is distinct from old.project_id then
      raise exception 'An approved norm is locked. Retire it or save a copy as a new draft.'
        using errcode = '55000';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_plan_productivity_norms_guard on public.plan_productivity_norms;
create trigger trg_plan_productivity_norms_guard
  before insert or update on public.plan_productivity_norms
  for each row execute function public.plan_productivity_norms_guard();

-- Crew lines of an approved norm cannot change either. SECURITY DEFINER so the lock holds even for a user
-- who can write crew lines but has no read access to the norm row.
create or replace function public.plan_norm_resources_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm uuid := coalesce(new.norm_id, old.norm_id);
  v_status text;
begin
  select status into v_status from public.plan_productivity_norms where id = v_norm;
  if v_status = 'approved' then
    raise exception 'The crew of an approved norm is locked. Retire it or save a copy as a new draft.'
      using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_plan_norm_resources_guard on public.plan_productivity_norm_resources;
create trigger trg_plan_norm_resources_guard
  before insert or update or delete on public.plan_productivity_norm_resources
  for each row execute function public.plan_norm_resources_guard();

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
alter table public.plan_productivity_norms          enable row level security;
alter table public.plan_productivity_norm_resources enable row level security;

drop policy if exists plan_norms_select on public.plan_productivity_norms;
create policy plan_norms_select on public.plan_productivity_norms for select to authenticated
  using (
    has_permission('planning', 'norms', 'view')
    and (project_id is null or is_project_member(project_id))
  );

drop policy if exists plan_norms_insert on public.plan_productivity_norms;
create policy plan_norms_insert on public.plan_productivity_norms for insert to authenticated
  with check (
    has_permission('planning', 'norms', 'can_create')
    and (
      (project_id is null     and has_permission('planning', 'norms', 'configure'))
      or (project_id is not null and is_project_member(project_id))
    )
  );

drop policy if exists plan_norms_update on public.plan_productivity_norms;
create policy plan_norms_update on public.plan_productivity_norms for update to authenticated
  using (
    has_permission('planning', 'norms', 'edit')
    and (
      (project_id is null     and has_permission('planning', 'norms', 'configure'))
      or (project_id is not null and is_project_member(project_id))
    )
  )
  with check (
    has_permission('planning', 'norms', 'edit')
    and (
      (project_id is null     and has_permission('planning', 'norms', 'configure'))
      or (project_id is not null and is_project_member(project_id))
    )
  );

-- only draft / retired norms can be deleted; an approved norm must be retired
drop policy if exists plan_norms_delete on public.plan_productivity_norms;
create policy plan_norms_delete on public.plan_productivity_norms for delete to authenticated
  using (
    status <> 'approved'
    and has_permission('planning', 'norms', 'delete')
    and (
      (project_id is null     and has_permission('planning', 'norms', 'configure'))
      or (project_id is not null and is_project_member(project_id))
    )
  );

-- crew lines inherit the parent norm's visibility (the sub-select is itself subject to the norms policies)
drop policy if exists plan_norm_resources_select on public.plan_productivity_norm_resources;
create policy plan_norm_resources_select on public.plan_productivity_norm_resources for select to authenticated
  using (exists (select 1 from public.plan_productivity_norms n where n.id = norm_id));

-- Writing crew lines needs the SAME right as editing the parent norm (edit, plus configure for the
-- company library or project membership for a project norm) — not merely being able to see it.
create or replace function public.plan_can_edit_norm(p_norm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plan_productivity_norms n
    where n.id = p_norm_id
      and has_permission('planning', 'norms', 'edit')
      and (
        (n.project_id is null     and has_permission('planning', 'norms', 'configure'))
        or (n.project_id is not null and is_project_member(n.project_id))
      )
  );
$$;
grant execute on function public.plan_can_edit_norm(uuid) to authenticated;

drop policy if exists plan_norm_resources_write on public.plan_productivity_norm_resources;
create policy plan_norm_resources_write on public.plan_productivity_norm_resources for all to authenticated
  using (public.plan_can_edit_norm(norm_id))
  with check (public.plan_can_edit_norm(norm_id));
