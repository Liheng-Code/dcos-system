-- Migration: 20260910000044_dwl_assembly_costing_tuned_overrides.sql
-- Purpose: Cost Item Library — Installed Cost Calculator tab's "Apply to
--          Cost Item" button. Today it only shows a toast saying the tuned
--          Material/Waste/Labor/Equipment slider values are session-only —
--          there was no way to actually persist a tuning session. This adds
--          4 nullable override columns on dwl_assembly_costing so "Apply"
--          can write the tuned values back as the new stored norms for this
--          item's per-unit cost build-up, without touching the underlying
--          BOQ material lines, crew day-rates, or equipment day-rates
--          (those stay real and keep feeding the Bill of Quantities/Labour
--          tabs unchanged — only the Calculator's own roll-up is overridden).
--
-- Depends on: 20260910000036 (dwl_assembly_costing, dwl_v_assembly_costing_
--   summary), 20260910000043 (manual_direct_cost_per_unit / vat_pct).
--
-- Additive only: every new column is nullable; when all 4 are null (every
--   existing assembly, today) the view's coalesce falls through to exactly
--   the same bottom-up computation as before — no existing Tender Cost
--   figure changes until a user explicitly clicks "Apply to Cost Item".
--
-- Idempotent: add column if not exists, drop+create view (leaf, no
--   dependents).

alter table public.dwl_assembly_costing
  add column if not exists material_base_cost_override numeric(14,4),
  add column if not exists material_waste_pct_override numeric(6,4),
  add column if not exists labor_cost_override_per_unit numeric(14,4),
  add column if not exists equipment_cost_override_per_unit numeric(14,4),
  add column if not exists tuned_at timestamptz;

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
),
base as (
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
    ac.vat_pct,
    ac.guardrail_note,
    ac.version_label,
    ac.status,
    ac.discipline,
    ac.work_item_type,
    ac.category_id,
    ac.scope_of_works,
    ac.manual_direct_cost_per_unit,
    ac.tuned_at,
    (ac.material_base_cost_override is not null
      or ac.material_waste_pct_override is not null
      or ac.labor_cost_override_per_unit is not null
      or ac.equipment_cost_override_per_unit is not null) as is_tuned,
    ac.created_by,
    p.full_name as created_by_name,
    ac.updated_at,
    coalesce(mat.material_base_cost, 0) as computed_material_base_cost,
    coalesce(mat.waste_cost, 0)         as computed_waste_cost,
    coalesce(crew.crew_cost_per_day, 0)  as crew_cost_per_day,
    coalesce(equip.equipment_cost_per_day, 0) as equipment_cost_per_day,
    -- Tuned overrides win whenever the user has explicitly set them via
    -- "Apply to Cost Item"; otherwise fall back to the real bottom-up sum.
    coalesce(ac.material_base_cost_override, mat.material_base_cost, 0) as material_base_cost,
    coalesce(
      ac.material_waste_pct_override,
      case when coalesce(mat.material_base_cost, 0) > 0
        then mat.waste_cost / mat.material_base_cost else 0.05 end
    ) as effective_waste_pct,
    coalesce(
      ac.labor_cost_override_per_unit,
      case when ac.daily_output is not null and ac.daily_output > 0
        then coalesce(crew.crew_cost_per_day, 0) / ac.daily_output else 0 end
    ) as labor_cost_per_unit,
    coalesce(
      ac.equipment_cost_override_per_unit,
      case when ac.daily_output is not null and ac.daily_output > 0
        then coalesce(equip.equipment_cost_per_day, 0) / ac.daily_output else 0 end
    ) as equipment_cost_per_unit
  from public.dwl_assemblies a
  left join public.dwl_assembly_costing ac on ac.assembly_id = a.id
  left join public.profiles p on p.id = ac.created_by
  left join mat   on mat.assembly_id = a.id
  left join crew  on crew.assembly_id = a.id
  left join equip on equip.assembly_id = a.id
  where a.is_active
)
select
  assembly_id, code, element_group, description, unit, daily_output,
  overhead_pct, risk_pct, profit_pct, vat_pct, guardrail_note, version_label,
  status, discipline, work_item_type, category_id, scope_of_works,
  manual_direct_cost_per_unit, tuned_at, is_tuned, created_by,
  created_by_name, updated_at,
  material_base_cost,
  material_base_cost * effective_waste_pct as waste_cost,
  material_base_cost * (1 + effective_waste_pct) as material_total_cost,
  crew_cost_per_day,
  equipment_cost_per_day,
  labor_cost_per_unit,
  equipment_cost_per_unit,
  -- Standalone items (no linked work item, no crew/equipment, no tuning)
  -- can carry a manually-entered direct cost instead — coalesce prefers
  -- the real/tuned sum whenever there IS one, and only falls back to the
  -- manual figure when that sum is genuinely zero (nothing set at all).
  coalesce(
    nullif(
      material_base_cost * (1 + effective_waste_pct) + labor_cost_per_unit + equipment_cost_per_unit,
      0
    ),
    manual_direct_cost_per_unit,
    0
  ) as direct_installed_cost,
  -- Overhead, risk, profit and VAT are compounded in sequence (each applied
  -- to the running total, not flat-summed) — matches standard QS rate
  -- build-up practice and the existing Calculator/Cost Summary tabs.
  round(
    coalesce(
      nullif(
        material_base_cost * (1 + effective_waste_pct) + labor_cost_per_unit + equipment_cost_per_unit,
        0
      ),
      manual_direct_cost_per_unit,
      0
    )
    * (1 + coalesce(overhead_pct, 0))
    * (1 + coalesce(risk_pct, 0))
    * (1 + coalesce(profit_pct, 0))
    * (1 + coalesce(vat_pct, 0)),
    4
  ) as target_tender_rate
from base;

comment on view public.dwl_v_assembly_costing_summary is
  'Cost Item Library — one row per assembly: Direct/Installed cost build-up '
  '(material + labor/day-rate/output + equipment/day-rate/output, each '
  'optionally overridden by a manually-tuned "Apply to Cost Item" value, or '
  'a manual override for standalone rate-card items with no BOQ at all), '
  'the overhead+risk+profit+VAT Target Tender Selling Rate, and General '
  'Info tab fields.';
