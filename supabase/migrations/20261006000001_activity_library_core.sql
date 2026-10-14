-- Activity Library (Planning) — hierarchy, Activity Masters, lifecycle governance.
-- Company-wide master data (same model as other Master Libraries): everyone authenticated
-- can read, can_manage_master_libraries() can write.
-- Plan: docs/04-Business-Modules/06-Planning-Scheduling/18-Activity-Library-and-Schedule-Generation-Plan.md
-- Project Activity = existing wbs_tasks (extended in a later migration); nothing here is project-specific.

-- 1. Hierarchy: domain > category > family
create table if not exists public.plan_act_domains (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_act_categories (
  id uuid primary key default gen_random_uuid(),
  domain_id uuid not null references public.plan_act_domains(id) on delete restrict,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain_id, code)
);
create index if not exists idx_plan_act_categories_domain on public.plan_act_categories(domain_id);

create table if not exists public.plan_act_families (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.plan_act_categories(id) on delete restrict,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, code)
);
create index if not exists idx_plan_act_families_category on public.plan_act_families(category_id);

-- 2. Activity Master (one row per code+version; approved rows are immutable)
create table if not exists public.plan_act_masters (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  domain_id uuid not null references public.plan_act_domains(id) on delete restrict,
  category_id uuid not null references public.plan_act_categories(id) on delete restrict,
  family_id uuid not null references public.plan_act_families(id) on delete restrict,
  discipline text,
  work_type text,
  default_unit text,
  status text not null default 'draft'
    check (status in ('draft','under_review','approved','active','superseded','archived')),
  version integer not null default 1 check (version >= 1),
  revision integer not null default 0,
  supersedes_id uuid references public.plan_act_masters(id) on delete set null,
  owner text,
  source text,
  applicable_project_types text[] not null default '{}',
  effective_date date,
  superseded_date date,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, version)
);
create index if not exists idx_plan_act_masters_code on public.plan_act_masters(code);
create index if not exists idx_plan_act_masters_status on public.plan_act_masters(status);
create index if not exists idx_plan_act_masters_domain on public.plan_act_masters(domain_id);
create index if not exists idx_plan_act_masters_category on public.plan_act_masters(category_id);
create index if not exists idx_plan_act_masters_family on public.plan_act_masters(family_id);
create index if not exists idx_plan_act_masters_discipline on public.plan_act_masters(discipline);
-- only one live (active) version per code
create unique index if not exists uq_plan_act_masters_one_active
  on public.plan_act_masters(code) where status = 'active';

-- 3. Append-only change history, written by trigger
create table if not exists public.plan_act_change_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  from_status text,
  to_status text,
  reason text,
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index if not exists idx_plan_act_change_history_entity
  on public.plan_act_change_history(entity_type, entity_id, changed_at desc);

-- 4. Lifecycle guard: legal transitions, immutability of approved content, history.
-- SECURITY DEFINER so history is written regardless of the caller's table rights.
create or replace function public.plan_act_master_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ok boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.plan_act_change_history(entity_type, entity_id, action, to_status)
    values ('master', new.id, 'create', new.status);
    return new;
  end if;

  if new.status is distinct from old.status then
    ok := (old.status, new.status) in (
      ('draft','under_review'), ('under_review','draft'), ('under_review','approved'),
      ('approved','active'), ('approved','draft'),
      ('active','superseded'), ('active','archived'),
      ('superseded','archived'), ('draft','archived'), ('archived','draft')
    );
    if not ok then
      raise exception 'Illegal Activity Master status change % -> %', old.status, new.status;
    end if;
    if new.status = 'approved' then
      new.approved_by := coalesce(new.approved_by, auth.uid());
      new.approved_at := coalesce(new.approved_at, now());
    end if;
    if new.status = 'superseded' then
      new.superseded_date := coalesce(new.superseded_date, current_date);
    end if;
    insert into public.plan_act_change_history(entity_type, entity_id, action, from_status, to_status)
    values ('master', new.id, 'status', old.status, new.status);
  elsif old.status in ('approved','active','superseded','archived')
    and (new.code, new.name, new.description, new.domain_id, new.category_id, new.family_id,
         new.discipline, new.work_type, new.default_unit, new.version)
        is distinct from
        (old.code, old.name, old.description, old.domain_id, old.category_id, old.family_id,
         old.discipline, old.work_type, old.default_unit, old.version) then
    raise exception 'Activity Master % v% is % and immutable; create a new version', old.code, old.version, old.status;
  end if;
  return new;
end $$;

drop trigger if exists trg_plan_act_master_guard on public.plan_act_masters;
create trigger trg_plan_act_master_guard
  before insert or update on public.plan_act_masters
  for each row execute function public.plan_act_master_guard();

-- 5. updated_at triggers + RLS (view all, manage via master-libraries permission)
do $$
declare t text;
begin
  foreach t in array array['plan_act_domains','plan_act_categories','plan_act_families','plan_act_masters'] loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$I', t);
    execute format('create trigger set_%1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', t);

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s authenticated view" on public.%I', t, t);
    execute format('drop policy if exists "%s privileged manage" on public.%I', t, t);
    execute format('create policy "%s authenticated view" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "%s privileged manage" on public.%I for all to authenticated using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries())', t, t);
  end loop;
end $$;

-- history: readable by all, never writable by clients (trigger is SECURITY DEFINER)
alter table public.plan_act_change_history enable row level security;
drop policy if exists "plan_act_change_history authenticated view" on public.plan_act_change_history;
create policy "plan_act_change_history authenticated view"
  on public.plan_act_change_history for select to authenticated using (true);

comment on table public.plan_act_masters is
  'Reusable company Activity Master (WHAT). One row per code+version; approved/active rows are immutable - edits create a new version row (supersedes_id). Never holds project data.';
