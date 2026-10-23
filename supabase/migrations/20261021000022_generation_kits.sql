-- Generation kits (Activity Library › Kits, Generate plan G2/G3).
-- A kit is a reusable recipe for one building pattern: which activity template goes on each part of the
-- building (basement, ground, podium, mezzanine, typical, roof, chainage segment, site). Kits are tagged with
-- sectors / building types (lib/project-categories.ts) and versioned like activity templates. Kit items name a
-- template by CODE: Generate uses that template's active version, else approved, else the newest draft
-- (drafts are preview-only), so approving a template never needs a new kit version.
-- Generate can then build a whole building in one run: runs record the kit, items record their template.
--   1. plan_act_kits / plan_act_kit_items + lifecycle guard (same transitions as templates) + RLS
--   2. plan_act_generation_runs.kit_id / kit_version, template_id nullable; plan_act_generation_items.template_id
--   3. plan_act_commit_generation: kit fields and per-item template (body otherwise as in 20261020000006)
--   4. Seed: 14 draft kits, one per construction pattern (docs/04-Business-Modules/04-02-Project-Setup/Project Categories.md)
-- Depends on: 20261006000004 (activity generation), 20261020000006 (commit with crews),
--             20261021000005..10 (sector-tagged templates the seed names).

-- ── 1. Kits ────────────────────────────────────────────────────────────────
create table if not exists public.plan_act_kits (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft','under_review','approved','active','superseded','archived')),
  version integer not null default 1 check (version >= 1),
  supersedes_id uuid references public.plan_act_kits(id) on delete set null,
  sectors text[] not null default '{}',
  building_types text[] not null default '{}',
  approved_by uuid,
  approved_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code, version)
);
create unique index if not exists uq_plan_act_kits_one_active on public.plan_act_kits(code) where status = 'active';

comment on table public.plan_act_kits is
  'Generation kit: which activity template goes on each part of a building pattern. Generate (Activity Library) applies a kit to a whole building in one run.';

create table if not exists public.plan_act_kit_items (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.plan_act_kits(id) on delete cascade,
  part text not null check (part in ('basement','ground','podium','mezzanine','typical','roof','segment','site')),
  template_code text not null,
  -- empty = every building type of the kit; else only these (e.g. the basement only for villas and mansions)
  building_types text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_plan_act_kit_items_kit on public.plan_act_kit_items(kit_id, sort_order);

comment on column public.plan_act_kit_items.template_code is
  'plan_act_templates.code; Generate uses its active version, else approved, else the newest draft (preview only).';

drop trigger if exists set_plan_act_kits_updated_at on public.plan_act_kits;
create trigger set_plan_act_kits_updated_at before update on public.plan_act_kits
  for each row execute function public.set_updated_at();

create or replace function public.plan_act_kit_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if (old.status, new.status) not in (
      ('draft','under_review'), ('under_review','draft'), ('under_review','approved'),
      ('draft','approved'), ('approved','active'), ('approved','draft'),
      ('active','superseded'), ('active','archived'),
      ('superseded','archived'), ('draft','archived'), ('archived','draft')
    ) then
      raise exception 'Illegal kit status change % -> %', old.status, new.status;
    end if;
    if new.status = 'approved' then
      new.approved_by := coalesce(new.approved_by, auth.uid());
      new.approved_at := coalesce(new.approved_at, now());
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_plan_act_kit_guard on public.plan_act_kits;
create trigger trg_plan_act_kit_guard before update on public.plan_act_kits
  for each row execute function public.plan_act_kit_guard();

-- the recipe of a kit is frozen once it leaves draft (sectors / building types stay editable, like templates)
create or replace function public.plan_act_kit_items_guard()
returns trigger language plpgsql set search_path = public as $$
declare v_status text;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then return coalesce(new, old); end if;
  select status into v_status from public.plan_act_kits where id = coalesce(new.kit_id, old.kit_id);
  if v_status is not null and v_status <> 'draft' then
    raise exception 'Kit is % and frozen; create a new version to change it', v_status;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_plan_act_kit_items_guard on public.plan_act_kit_items;
create trigger trg_plan_act_kit_items_guard before insert or update or delete on public.plan_act_kit_items
  for each row execute function public.plan_act_kit_items_guard();

alter table public.plan_act_kits enable row level security;
alter table public.plan_act_kit_items enable row level security;

drop policy if exists "plan_act_kits authenticated view" on public.plan_act_kits;
create policy "plan_act_kits authenticated view" on public.plan_act_kits for select to authenticated using (true);
drop policy if exists "plan_act_kits privileged manage" on public.plan_act_kits;
create policy "plan_act_kits privileged manage" on public.plan_act_kits to authenticated
  using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());

drop policy if exists "plan_act_kit_items authenticated view" on public.plan_act_kit_items;
create policy "plan_act_kit_items authenticated view" on public.plan_act_kit_items for select to authenticated using (true);
drop policy if exists "plan_act_kit_items privileged manage" on public.plan_act_kit_items;
create policy "plan_act_kit_items privileged manage" on public.plan_act_kit_items to authenticated
  using (public.can_manage_master_libraries()) with check (public.can_manage_master_libraries());

grant select, insert, update, delete on public.plan_act_kits, public.plan_act_kit_items to authenticated;

-- ── 2. Runs record their kit, items their template ─────────────────────────
alter table public.plan_act_generation_runs
  add column if not exists kit_id uuid references public.plan_act_kits(id) on delete set null,
  add column if not exists kit_version integer;
alter table public.plan_act_generation_runs alter column template_id drop not null;
alter table public.plan_act_generation_runs alter column template_version drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_act_generation_runs_source_chk') then
    alter table public.plan_act_generation_runs
      add constraint plan_act_generation_runs_source_chk check (template_id is not null or kit_id is not null);
  end if;
end $$;
comment on column public.plan_act_generation_runs.kit_id is
  'Kit the run applied (one run per building); template_id is then null and each item records its template.';

alter table public.plan_act_generation_items
  add column if not exists template_id uuid references public.plan_act_templates(id) on delete set null;
-- runs from a single template: their items came from that template
update public.plan_act_generation_items i set template_id = r.template_id
from public.plan_act_generation_runs r
where r.id = i.run_id and i.template_id is null and r.template_id is not null;

-- ── 3. Commit with kit fields ──────────────────────────────────────────────
create or replace function public.plan_act_commit_generation(p_payload jsonb)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_run uuid;
  v_project uuid := (p_payload->>'project_id')::uuid;
begin
  if not public.has_permission('planning', 'schedule', 'edit') then
    raise exception 'Generating activities requires planning/schedule edit permission';
  end if;

  insert into plan_act_generation_runs(project_id, template_id, template_version, kit_id, kit_version, scope_node_ids, engine_version,
      quantity_priority, project_attributes, library_snapshot, total_count, high_count, review_count, low_count, warning_count)
  values (v_project, nullif(p_payload->>'template_id', '')::uuid, (p_payload->>'template_version')::int,
      nullif(p_payload->>'kit_id', '')::uuid, (p_payload->>'kit_version')::int,
      coalesce(array(select jsonb_array_elements_text(p_payload->'scope_node_ids'))::uuid[], '{}'),
      p_payload->>'engine_version',
      coalesce(array(select jsonb_array_elements_text(p_payload->'quantity_priority')), '{}'),
      coalesce(p_payload->'project_attributes', '{}'::jsonb), coalesce(p_payload->'library_snapshot', '{}'::jsonb),
      (p_payload->>'total_count')::int, (p_payload->>'high_count')::int, (p_payload->>'review_count')::int,
      (p_payload->>'low_count')::int, coalesce((p_payload->>'warning_count')::int, 0))
  returning id into v_run;

  insert into wbs_tasks(id, wbs_node_id, project_id, task_code, task_name, task_type, activity_type, is_milestone,
      discipline, duration_days, duration_unit, sort_order, schedule_level,
      dependency_task_ids, dependency_types, dependency_lag_days,
      activity_master_id, activity_method_id, generation_run_id, generation_confidence)
  select t.id, t.wbs_node_id, v_project, t.task_code, t.task_name, 'activity', 'normal', coalesce(t.is_milestone, false),
      t.discipline, t.duration_days, 'wd', coalesce(t.sort_order, 0), t.schedule_level,
      coalesce(array(select jsonb_array_elements_text(t.dependency_task_ids))::uuid[], '{}'),
      coalesce(array(select jsonb_array_elements_text(t.dependency_types)), '{}'),
      coalesce(array(select jsonb_array_elements_text(t.dependency_lag_days))::numeric[], '{}'),
      t.activity_master_id, t.activity_method_id, v_run, t.confidence
  from jsonb_to_recordset(p_payload->'tasks') as t(
      id uuid, wbs_node_id uuid, task_code text, task_name text, is_milestone boolean, discipline text,
      duration_days numeric, sort_order bigint, schedule_level int,
      dependency_task_ids jsonb, dependency_types jsonb, dependency_lag_days jsonb,
      activity_master_id uuid, activity_method_id uuid, confidence text);

  insert into plan_act_generation_items(run_id, project_id, task_id, node_id, template_item_id, master_id, method_id, norm_id,
      confidence, reasons, quantity, unit, quantity_source, quantity_ref, base_rate, adjusted_rate, raw_days, duration_days, crews,
      template_id)
  select v_run, v_project, i.task_id, i.node_id, i.template_item_id, i.master_id, i.method_id, i.norm_id,
      i.confidence, coalesce(array(select jsonb_array_elements_text(i.reasons)), '{}'),
      i.quantity, i.unit, i.quantity_source, i.quantity_ref, i.base_rate, i.adjusted_rate, i.raw_days, i.duration_days,
      coalesce(i.crews, 1), coalesce(i.template_id, nullif(p_payload->>'template_id', '')::uuid)
  from jsonb_to_recordset(p_payload->'items') as i(
      task_id uuid, node_id uuid, template_item_id uuid, master_id uuid, method_id uuid, norm_id uuid,
      confidence text, reasons jsonb, quantity numeric, unit text, quantity_source text, quantity_ref text,
      base_rate numeric, adjusted_rate numeric, raw_days numeric, duration_days numeric, crews numeric,
      template_id uuid);

  perform plan_act_link_run_work(v_run);

  return v_run;
end $$;

-- ── 4. Seed: 14 draft kits ─────────────────────────────────────────────────
do $$
declare
  v_kit uuid;
  k record;
  it record;
begin
  for k in
    select * from (values
      ('KIT-RES-VILLA', 'Villa', 'Low-rise house: optional basement, ground floor, upper floors, pitched roof.',
        array['residential'], array['luxury_villa','mansion_estate','private_residence','standard_villa','townhouse','residential_development']),
      ('KIT-RES-HIGHRISE', 'High-rise residential', 'Apartment and condominium towers: basement and typical floors (ground/podium and roof templates to follow).',
        array['residential'], array['apartment','condominium','residential_tower']),
      ('KIT-COM-OFFICE', 'Office, mixed-use, hotel', 'Framed commercial tower: basement and typical floors (podium and roof templates to follow).',
        array['commercial'], array['office_building','mixed_use_building','hotel']),
      ('KIT-COM-RETAIL', 'Retail and showroom', 'Long-span retail: basement for malls; floor and roof templates to follow.',
        array['commercial'], array['shopping_mall','retail_building','showroom','restaurant']),
      ('KIT-IND-FACTORY', 'Factory', 'Steel-frame production building: pits, ground slab and frame, mezzanine, metal roof.',
        array['industrial'], array['factory','manufacturing_facility','industrial_building']),
      ('KIT-IND-WAREHOUSE', 'Warehouse', 'Storage and logistics shed: pits, ground slab and frame, mezzanine, metal roof.',
        array['industrial'], array['warehouse','logistics_center']),
      ('KIT-INS-EDU', 'School and university', 'Classroom blocks: ground and typical floors; basement for universities.',
        array['institutional'], array['school','university']),
      ('KIT-INS-HEALTH', 'Hospital and clinic', 'Clinical podium and ward floors; basement for hospitals.',
        array['institutional'], array['hospital','clinic']),
      ('KIT-INS-CIVIC', 'Civic and religious', 'Hall building with dome or feature roof; basement for government buildings.',
        array['institutional'], array['government_building','religious_building']),
      ('KIT-INF-ROAD', 'Road', 'Road and utilities per chainage section; box culverts as structures.',
        array['infrastructure'], array['road']),
      ('KIT-INF-BRIDGE', 'Bridge', 'Foundations, substructure, spans and deck.',
        array['infrastructure'], array['bridge']),
      ('KIT-INF-DRAIN', 'Drainage', 'Drain pipes per chainage section; box culverts as structures.',
        array['infrastructure'], array['drainage']),
      ('KIT-INF-WATER', 'Water supply', 'Mains and utility ducts per chainage section; pump station.',
        array['infrastructure'], array['water_supply']),
      ('KIT-INF-UTILITY', 'Utility and other infrastructure', 'Duct banks and pipes per chainage section; pump station.',
        array['infrastructure'], array['utility','other_infrastructure'])
    ) as t(code, name, description, sectors, building_types)
  loop
    if exists (select 1 from public.plan_act_kits where code = k.code) then continue; end if;
    insert into public.plan_act_kits(code, name, description, sectors, building_types, created_by)
    values (k.code, k.name, k.description, k.sectors, k.building_types, null)
    returning id into v_kit;

    for it in
      select * from (values
        ('KIT-RES-VILLA', 'basement', 'TPL-BLD-BSM-001', array['luxury_villa','mansion_estate']),
        ('KIT-RES-VILLA', 'ground', 'TPL-RES-VILLA-GF-001', '{}'::text[]),
        ('KIT-RES-VILLA', 'typical', 'TPL-RES-VILLA-UF-001', '{}'::text[]),
        ('KIT-RES-VILLA', 'roof', 'TPL-RES-VILLA-RF-001', '{}'::text[]),
        ('KIT-RES-HIGHRISE', 'basement', 'TPL-BLD-BSM-001', '{}'::text[]),
        ('KIT-RES-HIGHRISE', 'typical', 'TPL-BLD-TYP-FLOOR-001', '{}'::text[]),
        ('KIT-COM-OFFICE', 'basement', 'TPL-BLD-BSM-001', '{}'::text[]),
        ('KIT-COM-OFFICE', 'typical', 'TPL-BLD-TYP-FLOOR-001', '{}'::text[]),
        ('KIT-COM-RETAIL', 'basement', 'TPL-BLD-BSM-001', array['shopping_mall']),
        ('KIT-IND-FACTORY', 'basement', 'TPL-IND-PIT-001', '{}'::text[]),
        ('KIT-IND-FACTORY', 'ground', 'TPL-IND-FAC-GF-001', '{}'::text[]),
        ('KIT-IND-FACTORY', 'mezzanine', 'TPL-IND-MEZ-001', '{}'::text[]),
        ('KIT-IND-FACTORY', 'typical', 'TPL-IND-MEZ-001', '{}'::text[]),
        ('KIT-IND-FACTORY', 'roof', 'TPL-IND-RF-001', '{}'::text[]),
        ('KIT-IND-WAREHOUSE', 'basement', 'TPL-IND-PIT-001', '{}'::text[]),
        ('KIT-IND-WAREHOUSE', 'ground', 'TPL-IND-WH-GF-001', '{}'::text[]),
        ('KIT-IND-WAREHOUSE', 'mezzanine', 'TPL-IND-MEZ-001', '{}'::text[]),
        ('KIT-IND-WAREHOUSE', 'typical', 'TPL-IND-MEZ-001', '{}'::text[]),
        ('KIT-IND-WAREHOUSE', 'roof', 'TPL-IND-RF-001', '{}'::text[]),
        ('KIT-INS-EDU', 'basement', 'TPL-BLD-BSM-001', array['university']),
        ('KIT-INS-EDU', 'ground', 'TPL-INS-EDU-CLS-001', '{}'::text[]),
        ('KIT-INS-EDU', 'typical', 'TPL-INS-EDU-CLS-001', '{}'::text[]),
        ('KIT-INS-HEALTH', 'basement', 'TPL-BLD-BSM-001', array['hospital']),
        ('KIT-INS-HEALTH', 'ground', 'TPL-INS-HOSP-CLIN-001', '{}'::text[]),
        ('KIT-INS-HEALTH', 'podium', 'TPL-INS-HOSP-CLIN-001', '{}'::text[]),
        ('KIT-INS-HEALTH', 'typical', 'TPL-INS-HOSP-WARD-001', '{}'::text[]),
        ('KIT-INS-CIVIC', 'basement', 'TPL-BLD-BSM-001', array['government_building']),
        ('KIT-INS-CIVIC', 'ground', 'TPL-INS-CIV-HALL-001', '{}'::text[]),
        ('KIT-INS-CIVIC', 'roof', 'TPL-INS-CIV-DOME-001', '{}'::text[]),
        ('KIT-INF-ROAD', 'segment', 'TPL-INF-RD-SEG-001', '{}'::text[]),
        ('KIT-INF-ROAD', 'segment', 'TPL-INF-UT-SEG-001', '{}'::text[]),
        ('KIT-INF-ROAD', 'basement', 'TPL-INF-CUL-BASE-001', '{}'::text[]),
        ('KIT-INF-ROAD', 'ground', 'TPL-INF-CUL-WALL-001', '{}'::text[]),
        ('KIT-INF-ROAD', 'typical', 'TPL-INF-CUL-TOP-001', '{}'::text[]),
        ('KIT-INF-ROAD', 'roof', 'TPL-INF-CUL-HW-001', '{}'::text[]),
        ('KIT-INF-BRIDGE', 'basement', 'TPL-INF-BR-FDN-001', '{}'::text[]),
        ('KIT-INF-BRIDGE', 'ground', 'TPL-INF-BR-SUB-001', '{}'::text[]),
        ('KIT-INF-BRIDGE', 'typical', 'TPL-INF-BR-SPAN-001', '{}'::text[]),
        ('KIT-INF-BRIDGE', 'roof', 'TPL-INF-BR-DECK-001', '{}'::text[]),
        ('KIT-INF-DRAIN', 'segment', 'TPL-INF-PL-SEG-001', '{}'::text[]),
        ('KIT-INF-DRAIN', 'basement', 'TPL-INF-CUL-BASE-001', '{}'::text[]),
        ('KIT-INF-DRAIN', 'ground', 'TPL-INF-CUL-WALL-001', '{}'::text[]),
        ('KIT-INF-DRAIN', 'typical', 'TPL-INF-CUL-TOP-001', '{}'::text[]),
        ('KIT-INF-DRAIN', 'roof', 'TPL-INF-CUL-HW-001', '{}'::text[]),
        ('KIT-INF-WATER', 'segment', 'TPL-INF-PL-SEG-001', '{}'::text[]),
        ('KIT-INF-WATER', 'segment', 'TPL-INF-UT-SEG-001', '{}'::text[]),
        ('KIT-INF-WATER', 'basement', 'TPL-INF-PS-WW-001', '{}'::text[]),
        ('KIT-INF-UTILITY', 'segment', 'TPL-INF-UT-SEG-001', '{}'::text[]),
        ('KIT-INF-UTILITY', 'segment', 'TPL-INF-PL-SEG-001', '{}'::text[]),
        ('KIT-INF-UTILITY', 'basement', 'TPL-INF-PS-WW-001', '{}'::text[])
      ) as x(kit_code, part, template_code, building_types)
      where x.kit_code = k.code
    loop
      insert into public.plan_act_kit_items(kit_id, part, template_code, building_types, sort_order)
      values (v_kit, it.part, it.template_code, it.building_types,
        array_position(array['basement','ground','podium','mezzanine','typical','roof','segment','site'], it.part) * 10
          + (select count(*) from public.plan_act_kit_items where kit_id = v_kit and part = it.part));
    end loop;
  end loop;
end $$;
