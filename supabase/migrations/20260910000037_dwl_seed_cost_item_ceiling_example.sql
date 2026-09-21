-- Migration: 20260910000037_dwl_seed_cost_item_ceiling_example.sql
-- Purpose: Cost Item Library — seeds ONE fully-worked example end to end
--          (the mockup's own "Standard Suspended Gypsum Board Ceiling"),
--          since dwl_assemblies/dwl_work_items are currently empty (Phase
--          3/4 were built structurally in July but never seeded).
--
-- Numbers below are reconciled against the mockup's own displayed figures
-- where the mockup was internally consistent (material line items sum to
-- its $8.81 material total / $8.38 base / $0.42 waste; crew cost $36/day
-- over 13.5 m2/day gives its $2.67/m2 labour rate). Where the mockup's OWN
-- screenshots disagreed with each other (e.g. General Info showed Labor:
-- $1.60 while the Labour & Productivity tab's own worked arithmetic gives
-- $2.67 for the identical crew), the tab with supporting arithmetic was
-- used rather than guessing which figure was the stale one. The BOQ tab's
-- supplier/storage-protocol content in one mockup screenshot referenced
-- concrete-block suppliers and masonry storage notes — that's a different
-- (masonry) example's placeholder content bleeding into the screenshot,
-- not ceiling-specific, so it is NOT copied here; ceiling-appropriate
-- content is used instead (including a real supplier link to
-- "Saint-Gobain Gyproc & Knauf Cambodia", SUP-GYP-001, already in Supplier
-- Master from this session's earlier bulk import).
--
-- Depends on: 20260910000036_dwl_cost_item_library_schema.sql,
--   20260910000030 (material code standardization — this migration relies
--   on the CAT-CEIL group already occupying MAT-CEIL-001..030, making
--   MAT-CEIL-031..039 the next free codes), 20260910000033 (Supplier
--   Master bulk import — SUP-GYP-001).
--
-- Idempotent: every insert is guarded by "not exists" on a natural key
-- (resource code, work item code, assembly code).

do $$
declare
  v_tenant       uuid := (select id from public.companies where code = 'MCC');
  v_cat_ceil     uuid := (select id from public.dwl_material_categories where code = 'CAT-CEIL');
  v_work_item_id uuid;
  v_assembly_id  uuid;
  v_mason_id     uuid;
  v_helper_id    uuid;
  v_scaffold_id  uuid;
  v_gyproc_sup   uuid := (select s.id from public.dwl_suppliers s
                            join public.dwl_supplier_profiles p on p.supplier_id = s.id
                            where p.supplier_code = 'SUP-GYP-001');
begin

-- ── 1. Nine new raw sub-component materials (Material Master) ───────────
drop table if exists tmp_ceiling_materials;
create temp table tmp_ceiling_materials (
  code text, name text, unit text, unit_price numeric(14,4)
);
insert into tmp_ceiling_materials (code, name, unit, unit_price) values
  ('MAT-CEIL-031', '12.5mm Standard Gypsum Plasterboard (1200x2400x12.5mm tapered edge)', 'm2', 5.5048),
  ('MAT-CEIL-032', 'GI Main Runner Channel (38x12x0.5mm)',                                'm',  0.7955),
  ('MAT-CEIL-033', 'GI Furring / Cross Channel (35x22x0.45mm)',                           'm',  0.5524),
  ('MAT-CEIL-034', 'Adjustable Hanger Rod Set & Bracket',                                 'set',0.3514),
  ('MAT-CEIL-035', 'GI Wall Perimeter Angle (25x25x0.4mm)',                               'm',  0.5238),
  ('MAT-CEIL-036', 'Self-Drilling Drywall Screws (25mm)',                                 'pcs',0.0152),
  ('MAT-CEIL-037', 'Perforated Paper Joint Tape',                                         'm',  0.0794),
  ('MAT-CEIL-038', 'All-Purpose Jointing Compound',                                       'kg', 0.7027),
  ('MAT-CEIL-039', 'Miscellaneous Fixing Accessories & Clips',                            'ls', 0.2000);

insert into public.dwl_resources (tenant_id, code, category, description, unit)
select v_tenant, t.code, 'material', t.name, t.unit
from tmp_ceiling_materials t
where not exists (select 1 from public.dwl_resources r where r.code = t.code);

insert into public.dwl_material_attributes (resource_id, tenant_id, material_name, discipline, category_id, lifecycle_status)
select r.id, v_tenant, t.name, 'Architectural', v_cat_ceil, 'active'
from tmp_ceiling_materials t
join public.dwl_resources r on r.code = t.code
where not exists (select 1 from public.dwl_material_attributes a where a.resource_id = r.id);

insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, source_type, notes)
select v_tenant, r.id, t.unit_price, 'USD', current_date, 'market_survey',
  'Seeded for Cost Item Library worked example — Standard Suspended Gypsum Board Ceiling.'
from tmp_ceiling_materials t
join public.dwl_resources r on r.code = t.code
where not exists (select 1 from public.dwl_resource_prices p where p.resource_id = r.id);

-- ── 2. Labor crew + equipment resources ──────────────────────────────────
insert into public.dwl_resources (tenant_id, code, category, description, unit)
select v_tenant, 'L-MAS-001', 'labor', 'Skilled Mason (Thmar) — ceiling/drywall installer', 'day'
where not exists (select 1 from public.dwl_resources where code = 'L-MAS-001');
insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, source_type, notes)
select v_tenant, id, 22.00, 'USD', current_date, 'market_survey', 'Phnom Penh skilled trade day rate.'
from public.dwl_resources where code = 'L-MAS-001'
  and not exists (select 1 from public.dwl_resource_prices where resource_id = dwl_resources.id);

insert into public.dwl_resources (tenant_id, code, category, description, unit)
select v_tenant, 'L-HLP-001', 'labor', 'General Helper (Kon-Keng)', 'day'
where not exists (select 1 from public.dwl_resources where code = 'L-HLP-001');
insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, source_type, notes)
select v_tenant, id, 14.00, 'USD', current_date, 'market_survey', 'Phnom Penh general labor day rate.'
from public.dwl_resources where code = 'L-HLP-001'
  and not exists (select 1 from public.dwl_resource_prices where resource_id = dwl_resources.id);

insert into public.dwl_resources (tenant_id, code, category, description, unit)
select v_tenant, 'E-SCF-001', 'equipment', 'Mobile Stepladder & Baker Scaffold — 2.0m rolling staging', 'day'
where not exists (select 1 from public.dwl_resources where code = 'E-SCF-001');
insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, source_type, notes)
select v_tenant, id, 5.40, 'USD', current_date, 'market_survey', 'Daily rental/allocation rate.'
from public.dwl_resources where code = 'E-SCF-001'
  and not exists (select 1 from public.dwl_resource_prices where resource_id = dwl_resources.id);

select id into v_mason_id    from public.dwl_resources where code = 'L-MAS-001';
select id into v_helper_id   from public.dwl_resources where code = 'L-HLP-001';
select id into v_scaffold_id from public.dwl_resources where code = 'E-SCF-001';

-- ── 3. Work item (install recipe) + its 9 material lines ─────────────────
insert into public.dwl_work_items (tenant_id, code, boq_section, description, unit, method_note)
select v_tenant, '09.51.010', '09',
  'Install standard suspended gypsum board ceiling on concealed GI metal framing, including suspension system, fixing accessories and joint treatment ready for painting.',
  'm2', 'Concealed grid suspended ceiling, standard height <= 4.0m'
where not exists (select 1 from public.dwl_work_items where code = '09.51.010');

select id into v_work_item_id from public.dwl_work_items where code = '09.51.010';

drop table if exists tmp_ceiling_recipe;
create temp table tmp_ceiling_recipe (
  material_code text, consumption numeric(14,6), waste_pct numeric(6,4), basis_note text, sort_order int
);
insert into tmp_ceiling_recipe (material_code, consumption, waste_pct, basis_note, sort_order) values
  ('MAT-CEIL-031', 1.00,  0.05, 'Effective vs Tabulated Reference — 1 sheet layer per m2', 1),
  ('MAT-CEIL-032', 0.84,  0.05, 'Main runners spaced at 1200mm c/c',                        2),
  ('MAT-CEIL-033', 2.00,  0.05, 'Furring/cross channels spaced at 400mm c/c',               3),
  ('MAT-CEIL-034', 0.70,  0.05, 'Includes expansion anchor & spring clip',                  4),
  ('MAT-CEIL-035', 0.20,  0.05, 'Perimeter anchoring around room perimeter',                5),
  ('MAT-CEIL-036', 15.00, 0.05, 'Fixed at 200mm centers',                                   6),
  ('MAT-CEIL-037', 1.20,  0.05, 'Reinforced paper tape for recessed joints',                7),
  ('MAT-CEIL-038', 0.35,  0.05, '3-coat application system',                                8),
  ('MAT-CEIL-039', 1.00,  0.00, 'Connecting clips, channel joiners, plugs',                 9);

insert into public.dwl_work_item_resources (tenant_id, work_item_id, resource_id, consumption, waste_pct, basis_note, sort_order)
select v_tenant, v_work_item_id, r.id, t.consumption, t.waste_pct, t.basis_note, t.sort_order
from tmp_ceiling_recipe t
join public.dwl_resources r on r.code = t.material_code
where not exists (
  select 1 from public.dwl_work_item_resources wir
  where wir.work_item_id = v_work_item_id and wir.resource_id = r.id
);

-- ── 4. Assembly + costing + crew + equipment + layers + specs ────────────
insert into public.dwl_assemblies (tenant_id, code, element_group, description, unit, measurement_rule)
select v_tenant, 'ASM-CEIL-GYP-001', 'Ceiling',
  'Standard Suspended Gypsum Board Ceiling — supply and install standard suspended gypsum ceiling on concealed GI metal framing, including galvanized steel metal framing, suspension system, fixing accessories, joint treatment, and normal finishing preparation ready for painting.',
  'm2', 'Net ceiling area, no deduction for openings <= 0.5 m2'
where not exists (select 1 from public.dwl_assemblies where code = 'ASM-CEIL-GYP-001');

select id into v_assembly_id from public.dwl_assemblies where code = 'ASM-CEIL-GYP-001';

insert into public.dwl_assembly_items (tenant_id, assembly_id, work_item_id, qty_per_unit, basis_note, sort_order)
select v_tenant, v_assembly_id, v_work_item_id, 1.0, 'Direct 1:1 — single work item forms the whole assembly', 0
where not exists (
  select 1 from public.dwl_assembly_items where assembly_id = v_assembly_id and work_item_id = v_work_item_id
);

insert into public.dwl_assembly_costing (assembly_id, tenant_id, daily_output, overhead_pct, risk_pct, profit_pct, guardrail_note, version_label, status)
select v_assembly_id, v_tenant, 13.5, 0.10, 0.02, 0.10,
  'Excludes decorative painting and plenum insulation. Verify whether the BOQ description requires insulation before locking the tender rate. Standard height limit is 4.0m.',
  'v1.0', 'active'
where not exists (select 1 from public.dwl_assembly_costing where assembly_id = v_assembly_id);

insert into public.dwl_assembly_crew (tenant_id, assembly_id, resource_id, role_label, quantity, sort_order)
select v_tenant, v_assembly_id, v_mason_id, 'Skilled Mason (Thmar)', 1, 0
where not exists (select 1 from public.dwl_assembly_crew where assembly_id = v_assembly_id and resource_id = v_mason_id)
union all
select v_tenant, v_assembly_id, v_helper_id, 'General Helper (Kon-Keng)', 1, 1
where not exists (select 1 from public.dwl_assembly_crew where assembly_id = v_assembly_id and resource_id = v_helper_id);

insert into public.dwl_assembly_equipment (tenant_id, assembly_id, resource_id, role_label, quantity, sort_order)
select v_tenant, v_assembly_id, v_scaffold_id, 'Mobile Stepladder & Baker Scaffold', 1, 0
where not exists (select 1 from public.dwl_assembly_equipment where assembly_id = v_assembly_id and resource_id = v_scaffold_id);

insert into public.dwl_assembly_layers (tenant_id, assembly_id, sort_order, layer_name, material_label, thickness_mm, color_hex)
select v_tenant, v_assembly_id, x.sort_order, x.layer_name, x.material_label, x.thickness_mm, x.color_hex
from (values
  (1, 'Joint',       'Paper Joint Tape + 2-Coat Jointing Compound & Primer',        1.0,  '#f59e0b'),
  (2, 'Outer',       '12.5mm Standard Gypsum Plasterboard',                        12.5, '#60a5fa'),
  (3, 'Galvanized',  'GI Main Runner + Furring Channel Grid (concealed cavity)',   75.0,  '#cbd5e1'),
  (4, 'Inner',       '12.5mm Standard Gypsum Plasterboard (opposite face)',       12.5,  '#60a5fa')
) as x(sort_order, layer_name, material_label, thickness_mm, color_hex)
where not exists (select 1 from public.dwl_assembly_layers where assembly_id = v_assembly_id);

insert into public.dwl_assembly_specs (tenant_id, assembly_id, section, sort_order, spec_label, spec_value)
select v_tenant, v_assembly_id, x.section, x.sort_order, x.spec_label, x.spec_value
from (values
  ('specification', 1, 'Thickness / Section',            '101.0 mm total build-up (12.5mm + 76mm cavity + 12.5mm)'),
  ('specification', 2, 'Material / Core Type',            'Standard core paper-faced gypsum plasterboard'),
  ('specification', 3, 'Manufacturer / Brand Reference',  'Saint-Gobain Gyproc / Knauf Gips KG'),
  ('specification', 4, 'Performance Requirements',        'Deflection limit L/360 under total dead load; Level 4 drywall finish'),
  ('specification', 5, 'Fire Rating',                     'Class 0 flame spread (BS 476 Part 6 & 7) / Class A (ASTM E84)'),
  ('specification', 6, 'Acoustic Rating',                 'CAC 32 dB with unfaced mineral wool infill'),
  ('specification', 7, 'Applicable Standards',            'ASTM C1396 / ASTM C635 / BS EN 520 / ASTM C840'),
  ('specification', 8, 'Installation Method',             'Concealed main runners hung at 1200mm c/c with adjustable spring hangers, furring channels clipped at 400mm c/c'),
  ('storage_protocol', 1, 'Board Storage',                'Store gypsum boards flat and fully supported on a level platform, minimum 100mm off the ground; keep wrapped and dry during monsoon season.'),
  ('storage_protocol', 2, 'Framing Component Storage',    'Store GI channels, angles and hangers under cover to prevent surface rust before installation.'),
  ('productivity_benchmark', 1, 'Cambodia Site Benchmark — Standard Ceiling',       '10 - 14 m2 / gang-day (single layer, standard grid, <=3.5m height)'),
  ('productivity_benchmark', 2, 'Cambodia Site Benchmark — Fire-Rated/Acoustic',    '7 - 10 m2 / gang-day (double layer or acoustic infill)'),
  ('productivity_benchmark', 3, 'In-House vs Subcontract',                          'In-house crew rate is approximately $2.67/m2 labor-only. Specialist ceiling subcontractors in Phnom Penh typically charge $4.50-$5.50/m2 for labor-only, or $8-$10/m2 for complete supply & install with warranty.')
) as x(section, sort_order, spec_label, spec_value)
where not exists (select 1 from public.dwl_assembly_specs where assembly_id = v_assembly_id);

-- ── 5. Approved supplier link (Bill of Quantities tab) — real supplier
--      already in Supplier Master (SUP-GYP-001), linked to the primary
--      gypsum board material.
insert into public.dwl_supplier_materials (tenant_id, supplier_id, resource_id, is_active, notes)
select v_tenant, v_gyproc_sup, r.id, true, 'Primary approved supplier — Phnom Penh.'
from public.dwl_resources r
where r.code = 'MAT-CEIL-031'
  and v_gyproc_sup is not null
  and not exists (
    select 1 from public.dwl_supplier_materials sm
    where sm.supplier_id = v_gyproc_sup and sm.resource_id = r.id
  );

drop table tmp_ceiling_recipe;
drop table tmp_ceiling_materials;

end $$;
