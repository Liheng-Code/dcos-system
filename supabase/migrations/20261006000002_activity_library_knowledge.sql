-- Activity Library — knowledge attached to an Activity Master:
-- methods (HOW), productivity factors, quantity rules, logic rules, applicability, QA/QC, HSE, documents.
-- Productivity Standard = existing plan_productivity_norms (company-level when project_id is null);
-- Resource Standard = existing plan_productivity_norm_resources. Both are extended, not duplicated.
-- Depends on 20261006000001_activity_library_core.sql

-- 1. Methods (HOW). Same master, different method => different norm/crew/equipment.
create table if not exists public.plan_act_methods (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.plan_act_masters(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  constraints_note text,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (master_id, code)
);
create index if not exists idx_plan_act_methods_master on public.plan_act_methods(master_id);
create unique index if not exists uq_plan_act_methods_one_default
  on public.plan_act_methods(master_id) where is_default;

-- 2. Extend existing norms into Productivity Standards
alter table public.plan_productivity_norms
  add column if not exists activity_master_id uuid references public.plan_act_masters(id) on delete set null,
  add column if not exists method_id uuid references public.plan_act_methods(id) on delete set null,
  add column if not exists output_per_day numeric check (output_per_day is null or output_per_day > 0),
  add column if not exists version integer not null default 1 check (version >= 1);
comment on column public.plan_productivity_norms.output_per_day is
  'Direct crew output in norm unit per working day (e.g. 60 m3/day for a pump crew). When null the engine derives it from labour_constant_hr_per_unit and the crew rows.';
create index if not exists idx_plan_norms_activity_master on public.plan_productivity_norms(activity_master_id);
create index if not exists idx_plan_norms_method on public.plan_productivity_norms(method_id);

-- 3. Extend norm resources: equipment/material/subcontract/crew, allocation rule, optional
alter table public.plan_productivity_norm_resources
  drop constraint if exists plan_productivity_norm_resources_kind_check;
alter table public.plan_productivity_norm_resources
  add constraint plan_productivity_norm_resources_kind_check
  check (kind in ('labor','equipment','material','subcontract','crew'));
alter table public.plan_productivity_norm_resources
  add column if not exists allocation_rule text not null default 'per_crew'
    check (allocation_rule in ('per_crew','per_activity','per_pour','quantity_driven','fixed')),
  add column if not exists is_optional boolean not null default false;

-- 4. Productivity adjustment factors (Adjusted = base x factors)
create table if not exists public.plan_act_productivity_factors (
  id uuid primary key default gen_random_uuid(),
  norm_id uuid not null references public.plan_productivity_norms(id) on delete cascade,
  factor_type text not null
    check (factor_type in ('height','access','crew','method','weather','working_hour','site_condition','other')),
  label text,
  value numeric not null check (value > 0 and value <= 5),
  condition_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (norm_id, factor_type, label)
);
create index if not exists idx_plan_act_factors_norm on public.plan_act_productivity_factors(norm_id);

-- 5. Quantity rules: metric + provider priority + deductions/additions (no formula strings)
create table if not exists public.plan_act_quantity_rules (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.plan_act_masters(id) on delete cascade,
  name text not null,
  metric_code text not null,                 -- matches wbs_node_quantities.metric_code
  unit text,
  provider_priority text[] not null default array['bim','boq','manual']
    check (provider_priority <@ array['bim','boq','manual','calculated','module']),
  deduction_metrics text[] not null default '{}',
  addition_metrics text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (master_id, name)
);
create index if not exists idx_plan_act_qrules_master on public.plan_act_quantity_rules(master_id);

-- 6. Standard logic between masters (recommendation only)
create table if not exists public.plan_act_logic_rules (
  id uuid primary key default gen_random_uuid(),
  predecessor_master_id uuid not null references public.plan_act_masters(id) on delete cascade,
  successor_master_id uuid not null references public.plan_act_masters(id) on delete cascade,
  relation text not null default 'fs' check (relation in ('fs','ss','ff','sf')),
  lag_days numeric not null default 0,
  is_optional boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  check (predecessor_master_id <> successor_master_id),
  unique (predecessor_master_id, successor_master_id)
);
create index if not exists idx_plan_act_logic_succ on public.plan_act_logic_rules(successor_master_id);

-- 7. Applicability rules for a master or a template (evaluated by a pure function)
create table if not exists public.plan_act_applicability (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('master','template')),
  target_id uuid not null,
  attribute text not null,                   -- e.g. project_type, structure_type, formwork_type, building_component
  operator text not null default 'in' check (operator in ('eq','neq','in','not_in')),
  values text[] not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_plan_act_applicability_target on public.plan_act_applicability(target_type, target_id);

-- 8. Requirements (simple lists; links to QA/QC, HSE and Document Control modules stay optional text codes)
create table if not exists public.plan_act_requirements (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.plan_act_masters(id) on delete cascade,
  kind text not null check (kind in ('qaqc','hse','document','hold_point','milestone')),
  title text not null,
  is_mandatory boolean not null default true,
  reference_code text,                       -- e.g. ITP / MS / form code in the owning module
  doc_type text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_plan_act_requirements_master on public.plan_act_requirements(master_id, kind);

-- 9. Triggers + RLS: view all, manage via master-libraries permission
do $$
declare t text;
begin
  foreach t in array array['plan_act_methods','plan_act_quantity_rules'] loop
    execute format('drop trigger if exists set_%1$s_updated_at on public.%1$I', t);
    execute format('create trigger set_%1$s_updated_at before update on public.%1$I for each row execute function public.set_updated_at()', t);
  end loop;

  foreach t in array array['plan_act_methods','plan_act_productivity_factors','plan_act_quantity_rules',
                           'plan_act_logic_rules','plan_act_applicability','plan_act_requirements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s authenticated view" on public.%I', t, t);
    execute format('drop policy if exists "%s privileged manage" on public.%I', t, t);
    execute format('create policy "%s authenticated view" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "%s privileged manage" on public.%I for all to authenticated using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries())', t, t);
  end loop;
end $$;
