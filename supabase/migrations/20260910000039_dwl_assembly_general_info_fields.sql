-- Migration: 20260910000039_dwl_assembly_general_info_fields.sql
-- Purpose: Cost Item Library — General Info tab redesign (plan
--          inside-module-quantity-surveying-delegated-valley.md). Adds the
--          fields the mockup's "Core System Scope & Definition" and
--          "Estimating Boundary & Exclusions" / "Key Estimating
--          Assumptions" / "Field Lessons & Estimator Memory" cards need,
--          none of which existed before:
--            - dwl_assembly_costing.discipline / work_item_type (new cols)
--            - three new dwl_assembly_specs sections for the three
--              free-text bullet/note lists (reuses the existing
--              deliberately-unstructured spec_label/spec_value table
--              instead of three new tables)
--          "Registered By" / "Last Review Date" reuse the existing
--          created_by / updated_at columns (already on
--          dwl_assembly_costing since 20260910000036) — no new columns
--          for those, per the plan's confirmed scope.
--
-- Depends on: 20260910000036_dwl_cost_item_library_schema.sql.
-- Additive only: dwl_assemblies/dwl_assembly_items/dwl_work_items/
--   dwl_work_item_resources untouched. dwl_assembly_costing gains two
--   nullable columns; dwl_assembly_specs' section check constraint widens
--   (existing values unaffected).
--
-- Idempotent: add column if not exists, drop+re-add check constraint
--   (safe to re-run), drop+create view (leaf, no dependents), guarded
--   seed inserts (where not exists).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. dwl_assembly_costing — Discipline (reuses the existing DWL_DISCIPLINES
--    taxonomy already used for Material Master, dwl-material-form-dialog.
--    tsx — not re-declared as a DB check constraint here, same as how
--    dwl_material_attributes.discipline is left as plain text) and Work
--    Item Type (free text).
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_assembly_costing add column if not exists discipline text;
alter table public.dwl_assembly_costing add column if not exists work_item_type text;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. dwl_assembly_specs — widen section to add the three new free-text
--    list sections. spec_label is stored as '' for ordinary bullet/note
--    rows in these sections (no label:value structure needed) except one
--    reserved row per assembly in 'estimating_assumption' with
--    spec_label = '__intro__' for the italic intro sentence.
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_assembly_specs drop constraint if exists dwl_assembly_specs_section_check;
alter table public.dwl_assembly_specs add constraint dwl_assembly_specs_section_check
  check (section in (
    'specification', 'storage_protocol', 'productivity_benchmark',
    'boundary_exclusion', 'estimating_assumption', 'field_lesson'
  ));

-- ─────────────────────────────────────────────────────────────────────────
-- 3. dwl_v_assembly_costing_summary — add discipline, work_item_type,
--    created_by/updated_at (for "Registered By" / "Last Review Date"), and
--    a joined created_by_name.
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists public.dwl_v_assembly_costing_summary;

create view public.dwl_v_assembly_costing_summary
with (security_invoker = true)
as
with mat as (
  select assembly_id,
    sum(base_cost_contribution)  as material_base_cost,
    sum(waste_cost_contribution) as waste_cost,
    sum(cost_contribution)       as material_total_cost
  from public.dwl_v_assembly_material_explosion
  group by assembly_id
),
crew as (
  select c.assembly_id, sum(c.quantity * coalesce(cp.unit_price, 0)) as crew_cost_per_day
  from public.dwl_assembly_crew c
  left join public.dwl_v_current_prices cp on cp.resource_id = c.resource_id
  group by c.assembly_id
),
equip as (
  select e.assembly_id, sum(e.quantity * coalesce(cp.unit_price, 0)) as equipment_cost_per_day
  from public.dwl_assembly_equipment e
  left join public.dwl_v_current_prices cp on cp.resource_id = e.resource_id
  group by e.assembly_id
)
select
  a.id as assembly_id,
  a.code,
  a.element_group,
  a.description,
  a.unit,
  ac.daily_output,
  ac.overhead_pct,
  ac.risk_pct,
  ac.profit_pct,
  ac.guardrail_note,
  ac.version_label,
  ac.status,
  ac.discipline,
  ac.work_item_type,
  ac.created_by,
  p.full_name as created_by_name,
  ac.updated_at,
  coalesce(mat.material_base_cost, 0) as material_base_cost,
  coalesce(mat.waste_cost, 0)         as waste_cost,
  coalesce(mat.material_total_cost, 0) as material_total_cost,
  coalesce(crew.crew_cost_per_day, 0)  as crew_cost_per_day,
  coalesce(equip.equipment_cost_per_day, 0) as equipment_cost_per_day,
  case when ac.daily_output is not null and ac.daily_output > 0
    then coalesce(crew.crew_cost_per_day, 0) / ac.daily_output else 0 end as labor_cost_per_unit,
  case when ac.daily_output is not null and ac.daily_output > 0
    then coalesce(equip.equipment_cost_per_day, 0) / ac.daily_output else 0 end as equipment_cost_per_unit,
  coalesce(mat.material_total_cost, 0)
    + case when ac.daily_output is not null and ac.daily_output > 0
        then coalesce(crew.crew_cost_per_day, 0) / ac.daily_output else 0 end
    + case when ac.daily_output is not null and ac.daily_output > 0
        then coalesce(equip.equipment_cost_per_day, 0) / ac.daily_output else 0 end
    as direct_installed_cost,
  -- Overhead, risk and profit are compounded in sequence (each applied to
  -- the running total, not flat-summed) — matches standard QS rate
  -- build-up practice and the mockup's own worked figures.
  round(
    (coalesce(mat.material_total_cost, 0)
      + case when ac.daily_output is not null and ac.daily_output > 0
          then coalesce(crew.crew_cost_per_day, 0) / ac.daily_output else 0 end
      + case when ac.daily_output is not null and ac.daily_output > 0
          then coalesce(equip.equipment_cost_per_day, 0) / ac.daily_output else 0 end)
    * (1 + coalesce(ac.overhead_pct, 0))
    * (1 + coalesce(ac.risk_pct, 0))
    * (1 + coalesce(ac.profit_pct, 0)),
    4
  ) as target_tender_rate
from public.dwl_assemblies a
left join public.dwl_assembly_costing ac on ac.assembly_id = a.id
left join public.profiles p on p.id = ac.created_by
left join mat   on mat.assembly_id = a.id
left join crew  on crew.assembly_id = a.id
left join equip on equip.assembly_id = a.id
where a.is_active;

comment on view public.dwl_v_assembly_costing_summary is
  'Cost Item Library — one row per assembly: Direct/Installed cost build-up '
  '(material + labor/day-rate/output + equipment/day-rate/output), the '
  'overhead+risk+profit Target Tender Selling Rate, and General Info tab '
  'fields (discipline, work_item_type, created_by_name, updated_at).';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Seed touch-up — backfill the ceiling example so General Info isn't
--    empty on first load. Guarded: only fires if the assembly exists and
--    doesn't already have these rows.
-- ─────────────────────────────────────────────────────────────────────────
do $$
declare
  v_assembly_id uuid;
begin
  select id into v_assembly_id from public.dwl_assemblies where code = 'ASM-CEIL-GYP-001';
  if v_assembly_id is null then
    return;
  end if;

  update public.dwl_assembly_costing
  set discipline = 'Architectural',
      work_item_type = 'Interior Ceiling Fitout'
  where assembly_id = v_assembly_id
    and discipline is null;

  if not exists (
    select 1 from public.dwl_assembly_specs
    where assembly_id = v_assembly_id and section = 'boundary_exclusion'
  ) then
    insert into public.dwl_assembly_specs (tenant_id, assembly_id, section, sort_order, spec_label, spec_value)
    select tenant_id, v_assembly_id, 'boundary_exclusion', s.ord, '', s.txt
    from public.dwl_assembly_costing, lateral (values
      (1, 'Painting or decorative sealers (quoted separately under Painting package)'),
      (2, 'Mineral wool or fiberglass acoustic plenum insulation blankets'),
      (3, 'Fire-stopping barriers or smoke baffles in ceiling plenum'),
      (4, 'Supply and installation of ceiling access panels / hatches (quoted per unit)'),
      (5, 'Heavy MEP equipment independent support unistrut hangers (>5 kg)'),
      (6, 'Work above 4.0 meters requiring powered aerial lifts or MEWPs'),
      (7, 'Night shift work premiums or overtime allowances')
    ) as s(ord, txt)
    where assembly_id = v_assembly_id;
  end if;

  if not exists (
    select 1 from public.dwl_assembly_specs
    where assembly_id = v_assembly_id and section = 'estimating_assumption'
  ) then
    insert into public.dwl_assembly_specs (tenant_id, assembly_id, section, sort_order, spec_label, spec_value)
    select tenant_id, v_assembly_id, 'estimating_assumption', s.ord, s.label, s.txt
    from public.dwl_assembly_costing, lateral (values
      (0, '__intro__', 'Baseline assumptions derived from Cambodia construction site conditions.'),
      (1, '', 'Normal indoor construction environment with completed external envelope (weather-tight).'),
      (2, '', 'Finished floor to soffit height does not exceed 4.0 meters.'),
      (3, '', 'Permanent or temporary lighting and 220V power points available within 25m of work zone.'),
      (4, '', 'Main MEP trunking and primary ductwork completed before grid suspension commencement.')
    ) as s(ord, label, txt)
    where assembly_id = v_assembly_id;
  end if;

  if not exists (
    select 1 from public.dwl_assembly_specs
    where assembly_id = v_assembly_id and section = 'field_lesson'
  ) then
    insert into public.dwl_assembly_specs (tenant_id, assembly_id, section, sort_order, spec_label, spec_value)
    select tenant_id, v_assembly_id, 'field_lesson', s.ord, '', s.txt
    from public.dwl_assembly_costing, lateral (values
      (1, 'Actual ceiling productivity on Skyline Tower was 21 m²/day (lower than estimated 25 m²/day) because MEP ducting and sprinkler pipes were being modified simultaneously.'),
      (2, 'Waste on perimeter angles increased by 6% on curved perimeter walls; recommend 10% waste on irregular room geometries.'),
      (3, 'Always verify plenum duct pressure testing is completed before closing ceiling boards.')
    ) as s(ord, txt)
    where assembly_id = v_assembly_id;
  end if;
end $$;
