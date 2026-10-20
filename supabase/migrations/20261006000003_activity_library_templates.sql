-- Activity Library — Activity Templates (construction recipes): header, ordered items, dependencies.
-- Same lifecycle as masters. Items pin a specific master row (version) so existing templates never
-- change silently when a master is superseded.
-- Depends on 20261006000001/2.

create table if not exists public.plan_act_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  domain_id uuid references public.plan_act_domains(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft','under_review','approved','active','superseded','archived')),
  version integer not null default 1 check (version >= 1),
  supersedes_id uuid references public.plan_act_templates(id) on delete set null,
  applies_to_level_types text[] not null default '{}',   -- wbs_nodes.level_type values the recipe stamps onto
  owner text,
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, version)
);
create index if not exists idx_plan_act_templates_code on public.plan_act_templates(code);
create index if not exists idx_plan_act_templates_status on public.plan_act_templates(status);
create unique index if not exists uq_plan_act_templates_one_active
  on public.plan_act_templates(code) where status = 'active';

create table if not exists public.plan_act_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.plan_act_templates(id) on delete cascade,
  seq integer not null,
  master_id uuid not null references public.plan_act_masters(id) on delete restrict,
  scope text not null default 'floor' check (scope in ('floor','element','zone')),
  method_id uuid references public.plan_act_methods(id) on delete set null,
  norm_id uuid references public.plan_productivity_norms(id) on delete set null,
  duration_days_override numeric check (duration_days_override is null or duration_days_override >= 0),
  is_milestone boolean not null default false,
  note text,
  unique (template_id, seq)
);
create index if not exists idx_plan_act_template_items_master on public.plan_act_template_items(master_id);

create table if not exists public.plan_act_template_dependencies (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.plan_act_templates(id) on delete cascade,
  predecessor_item_id uuid not null references public.plan_act_template_items(id) on delete cascade,
  successor_item_id uuid not null references public.plan_act_template_items(id) on delete cascade,
  relation text not null default 'fs' check (relation in ('fs','ss','ff','sf')),
  lag_days numeric not null default 0,
  is_optional boolean not null default false,
  check (predecessor_item_id <> successor_item_id),
  unique (predecessor_item_id, successor_item_id)
);
create index if not exists idx_plan_act_template_deps_template on public.plan_act_template_dependencies(template_id);

-- lifecycle guard for templates (same transitions as masters; approved content frozen via items trigger)
create or replace function public.plan_act_template_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.plan_act_change_history(entity_type, entity_id, action, to_status)
    values ('template', new.id, 'create', new.status);
    return new;
  end if;
  if new.status is distinct from old.status then
    if (old.status, new.status) not in (
      ('draft','under_review'), ('under_review','draft'), ('under_review','approved'),
      ('approved','active'), ('approved','draft'),
      ('active','superseded'), ('active','archived'),
      ('superseded','archived'), ('draft','archived'), ('archived','draft')
    ) then
      raise exception 'Illegal Activity Template status change % -> %', old.status, new.status;
    end if;
    if new.status = 'approved' then
      new.approved_by := coalesce(new.approved_by, auth.uid());
      new.approved_at := coalesce(new.approved_at, now());
    end if;
    insert into public.plan_act_change_history(entity_type, entity_id, action, from_status, to_status)
    values ('template', new.id, 'status', old.status, new.status);
  end if;
  return new;
end $$;

drop trigger if exists trg_plan_act_template_guard on public.plan_act_templates;
create trigger trg_plan_act_template_guard
  before insert or update on public.plan_act_templates
  for each row execute function public.plan_act_template_guard();

-- items/dependencies of a non-draft template are frozen
create or replace function public.plan_act_template_children_guard()
returns trigger language plpgsql as $$
declare tid uuid; st text;
begin
  tid := coalesce(new.template_id, old.template_id);
  select status into st from public.plan_act_templates where id = tid;
  if st is not null and st <> 'draft' then
    raise exception 'Template is % and frozen; create a new version to change its items', st;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_plan_act_template_items_frozen on public.plan_act_template_items;
create trigger trg_plan_act_template_items_frozen
  before insert or update or delete on public.plan_act_template_items
  for each row execute function public.plan_act_template_children_guard();
drop trigger if exists trg_plan_act_template_deps_frozen on public.plan_act_template_dependencies;
create trigger trg_plan_act_template_deps_frozen
  before insert or update or delete on public.plan_act_template_dependencies
  for each row execute function public.plan_act_template_children_guard();

drop trigger if exists set_plan_act_templates_updated_at on public.plan_act_templates;
create trigger set_plan_act_templates_updated_at before update on public.plan_act_templates
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['plan_act_templates','plan_act_template_items','plan_act_template_dependencies'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s authenticated view" on public.%I', t, t);
    execute format('drop policy if exists "%s privileged manage" on public.%I', t, t);
    execute format('create policy "%s authenticated view" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "%s privileged manage" on public.%I for all to authenticated using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries())', t, t);
  end loop;
end $$;
