-- Migration: 20260910000041_dwl_assembly_layer_materials_specs.sql
-- Purpose: Cost Item Library — Specifications tab "Interactive Assembly
--          Cross-Section" redesign (plan
--          inside-module-quantity-surveying-delegated-valley.md). Links
--          each dwl_assembly_layers row to the REAL BOQ material(s) that
--          make it up (so the layer inspector panel shows genuine
--          cost/consumption, not a fabricated figure), and adds a per-layer
--          free-text technical-spec table (Surface Level, Grid Spacing,
--          etc — same "deliberately unstructured" pattern already used for
--          assembly-level specs, just scoped one level down).
--
-- Depends on: 20260910000036_dwl_cost_item_library_schema.sql
--   (dwl_assembly_layers, dwl_v_assembly_material_explosion).
--
-- Additive only: dwl_assembly_layers/dwl_resources/dwl_work_item_resources
--   untouched. Two new 1:many companion tables to dwl_assembly_layers.
--
-- Idempotent: create table/index if not exists, guarded policy creation,
--   drop+create view, guarded seed inserts (where not exists).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. dwl_assembly_layer_materials — many-to-many: a layer can be made of
--    several BOQ materials (e.g. Joint = tape + compound), and the same
--    material can legitimately appear on more than one layer (e.g. a
--    single-recipe-line gypsum board covering both the Outer and Inner
--    layer labels in a suspended-ceiling BOQ that only budgets one board
--    pass).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_assembly_layer_materials (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  layer_id    uuid not null references public.dwl_assembly_layers(id) on delete cascade,
  resource_id uuid not null references public.dwl_resources(id),
  sort_order  int not null default 0,
  constraint dwl_assembly_layer_materials_layer_resource_key unique (layer_id, resource_id)
);
create index if not exists idx_dwl_assembly_layer_materials_tenant on public.dwl_assembly_layer_materials(tenant_id);
create index if not exists idx_dwl_assembly_layer_materials_layer on public.dwl_assembly_layer_materials(layer_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. dwl_assembly_layer_specs — per-layer free-form key/value technical
--    spec rows (Surface Level, Sanding Dust, Grid Spacing, ...).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_assembly_layer_specs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  layer_id    uuid not null references public.dwl_assembly_layers(id) on delete cascade,
  sort_order  int not null default 0,
  spec_label  text not null,
  spec_value  text not null
);
create index if not exists idx_dwl_assembly_layer_specs_tenant on public.dwl_assembly_layer_specs(tenant_id);
create index if not exists idx_dwl_assembly_layer_specs_layer on public.dwl_assembly_layer_specs(layer_id);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — tenant-scoped, full CRUD, same idiom as 20260910000036.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_assembly_layer_materials enable row level security;
alter table public.dwl_assembly_layer_specs     enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['dwl_assembly_layer_materials', 'dwl_assembly_layer_specs']
  loop
    begin
      execute format(
        'create policy %I_tenant_select on public.%I for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));',
        t, t);
    exception when duplicate_object then null; end;
    begin
      execute format(
        'create policy %I_tenant_insert on public.%I for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));',
        t, t);
    exception when duplicate_object then null; end;
    begin
      execute format(
        'create policy %I_tenant_update on public.%I for update using (tenant_id = (select company_id from public.profiles where id = auth.uid())) with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));',
        t, t);
    exception when duplicate_object then null; end;
    begin
      execute format(
        'create policy %I_tenant_delete on public.%I for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));',
        t, t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. dwl_v_assembly_layer_materials — real cost per layer. Sums
--    cost_contribution (always $, safe to add) but deliberately does NOT
--    sum effective_qty into one "consumption" figure, since a layer's
--    linked materials can have different units (m vs kg) — the UI lists
--    each linked material's own qty+unit+cost individually instead.
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists public.dwl_v_assembly_layer_materials;

create view public.dwl_v_assembly_layer_materials
with (security_invoker = true)
as
select
  lm.layer_id,
  al.assembly_id,
  string_agg(distinct me.material_code, ' + ' order by me.material_code)        as material_codes,
  string_agg(distinct me.material_description, ' + ' order by me.material_description) as material_names,
  sum(me.cost_contribution) as total_cost_contribution
from public.dwl_assembly_layer_materials lm
join public.dwl_assembly_layers al on al.id = lm.layer_id
join public.dwl_v_assembly_material_explosion me
  on me.assembly_id = al.assembly_id and me.resource_id = lm.resource_id
group by lm.layer_id, al.assembly_id;

comment on view public.dwl_v_assembly_layer_materials is
  'Cost Item Library — Specifications tab layer inspector. Real cost per '
  'layer from its linked BOQ material(s). Consumption is NOT summed here '
  '(mixed units) — the UI reads per-material qty/unit from '
  'dwl_v_assembly_material_explosion directly.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Seed touch-up — link the real ceiling layers to their real BOQ
--    materials, and add real per-layer spec rows (consistent with the
--    assembly's own already-seeded spec data, not the mockup's numbers).
--    Guarded: only fires if the assembly/layers exist and have no links yet.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_assembly_id uuid;
  v_tenant      uuid;
  v_joint_id    uuid;
  v_outer_id    uuid;
  v_galv_id     uuid;
  v_inner_id    uuid;
begin
  select id, tenant_id into v_assembly_id, v_tenant from public.dwl_assemblies where code = 'ASM-CEIL-GYP-001';
  if v_assembly_id is null then
    return;
  end if;

  select id into v_joint_id  from public.dwl_assembly_layers where assembly_id = v_assembly_id and layer_name = 'Joint';
  select id into v_outer_id  from public.dwl_assembly_layers where assembly_id = v_assembly_id and layer_name = 'Outer';
  select id into v_galv_id   from public.dwl_assembly_layers where assembly_id = v_assembly_id and layer_name = 'Galvanized';
  select id into v_inner_id  from public.dwl_assembly_layers where assembly_id = v_assembly_id and layer_name = 'Inner';

  if v_joint_id is not null and not exists (select 1 from public.dwl_assembly_layer_materials where layer_id = v_joint_id) then
    insert into public.dwl_assembly_layer_materials (tenant_id, layer_id, resource_id, sort_order)
    select v_tenant, v_joint_id, r.id, x.ord
    from public.dwl_resources r
    join (values ('MAT-CEIL-037', 1), ('MAT-CEIL-038', 2)) as x(code, ord) on x.code = r.code;
  end if;

  if v_outer_id is not null and not exists (select 1 from public.dwl_assembly_layer_materials where layer_id = v_outer_id) then
    insert into public.dwl_assembly_layer_materials (tenant_id, layer_id, resource_id, sort_order)
    select v_tenant, v_outer_id, r.id, 1 from public.dwl_resources r where r.code = 'MAT-CEIL-031';
  end if;

  if v_galv_id is not null and not exists (select 1 from public.dwl_assembly_layer_materials where layer_id = v_galv_id) then
    insert into public.dwl_assembly_layer_materials (tenant_id, layer_id, resource_id, sort_order)
    select v_tenant, v_galv_id, r.id, x.ord
    from public.dwl_resources r
    join (values ('MAT-CEIL-032', 1), ('MAT-CEIL-033', 2), ('MAT-CEIL-034', 3), ('MAT-CEIL-035', 4)) as x(code, ord) on x.code = r.code;
  end if;

  if v_inner_id is not null and not exists (select 1 from public.dwl_assembly_layer_materials where layer_id = v_inner_id) then
    insert into public.dwl_assembly_layer_materials (tenant_id, layer_id, resource_id, sort_order)
    select v_tenant, v_inner_id, r.id, 1 from public.dwl_resources r where r.code = 'MAT-CEIL-031';
  end if;

  if v_joint_id is not null and not exists (select 1 from public.dwl_assembly_layer_specs where layer_id = v_joint_id) then
    insert into public.dwl_assembly_layer_specs (tenant_id, layer_id, sort_order, spec_label, spec_value) values
      (v_tenant, v_joint_id, 1, 'Surface Level', 'Level 4 Drywall Finish'),
      (v_tenant, v_joint_id, 2, 'Sanding Dust', 'Standard joint compound — light dust, ventilate work area'),
      (v_tenant, v_joint_id, 3, 'Paint Readiness', '24 hours cure before priming');
  end if;

  if v_outer_id is not null and not exists (select 1 from public.dwl_assembly_layer_specs where layer_id = v_outer_id) then
    insert into public.dwl_assembly_layer_specs (tenant_id, layer_id, sort_order, spec_label, spec_value) values
      (v_tenant, v_outer_id, 1, 'Board Orientation', 'Long edge perpendicular to furring channels'),
      (v_tenant, v_outer_id, 2, 'Edge Treatment', 'Tapered edge for flush joint finishing');
  end if;

  if v_galv_id is not null and not exists (select 1 from public.dwl_assembly_layer_specs where layer_id = v_galv_id) then
    insert into public.dwl_assembly_layer_specs (tenant_id, layer_id, sort_order, spec_label, spec_value) values
      (v_tenant, v_galv_id, 1, 'Grid Spacing', 'Main runners 1200mm c/c, furring channels 400mm c/c'),
      (v_tenant, v_galv_id, 2, 'Corrosion Protection', 'Hot-dip galvanized steel, Z275 coating');
  end if;

  if v_inner_id is not null and not exists (select 1 from public.dwl_assembly_layer_specs where layer_id = v_inner_id) then
    insert into public.dwl_assembly_layer_specs (tenant_id, layer_id, sort_order, spec_label, spec_value) values
      (v_tenant, v_inner_id, 1, 'Board Orientation', 'Long edge perpendicular to furring channels'),
      (v_tenant, v_inner_id, 2, 'Edge Treatment', 'Tapered edge for flush joint finishing');
  end if;
end $$;
