-- Migration: 20260910000043_dwl_cost_item_create_form_fields.sql
-- Purpose: Cost Item Library — "Create New Cost Item" registration form
--          (plan inside-module-quantity-surveying-delegated-valley.md).
--          Adds the handful of fields that form needs and don't exist yet:
--            - a manual direct-cost override, so a QS can register a
--              standalone rate-card item with no Bill of Quantities at all
--              (today direct_installed_cost is ALWAYS computed bottom-up
--              from a linked work item's BOQ/crew/equipment)
--            - vat_pct (Applicable Tax/VAT %), missing from the existing
--              overhead/risk/profit markup set
--            - category_id, linking to the SAME dwl_material_categories
--              table Material Master already uses (no new taxonomy)
--            - scope_of_works, for the "Detailed Scope of Works & Work
--              Method" field (distinct from dwl_work_items.method_note,
--              which may not exist for a standalone item)
--          Also widens dwl_assembly_specs.section to add 'inclusion' — the
--          form's green "Inclusions in Unit Rate" list, a genuinely new
--          concept (Exclusions already exists as 'boundary_exclusion').
--
-- Depends on: 20260910000036 (dwl_assembly_costing, dwl_v_assembly_costing_
--   summary), 20260910000039/41 (section check constraint history),
--   20260910000021/26 (dwl_material_categories).
--
-- Additive only: every new column is nullable or has a safe default;
--   direct_installed_cost's computed branch is unchanged for every
--   existing assembly (coalesce only kicks in when the new override column
--   is actually set, which is null for all rows created before this).
--
-- Idempotent: add column if not exists, drop+re-add check constraint,
--   drop+create view (leaf, no dependents).

-- vat_pct defaults to 0, not the form's own 10% suggestion, so every
-- already-seeded assembly's Target Tender Selling Rate (already shown to
-- the user) is unaffected until someone deliberately sets a VAT rate on
-- that item — the "Create New Cost Item" form applies its own 10%
-- starting value client-side for NEW items only.
alter table public.dwl_assembly_costing
  add column if not exists manual_direct_cost_per_unit numeric(14,4),
  add column if not exists vat_pct numeric(6,4) not null default 0,
  add column if not exists category_id uuid references public.dwl_material_categories(id),
  add column if not exists scope_of_works text;

alter table public.dwl_assembly_specs drop constraint if exists dwl_assembly_specs_section_check;
alter table public.dwl_assembly_specs add constraint dwl_assembly_specs_section_check
  check (section in (
    'specification', 'storage_protocol', 'productivity_benchmark',
    'boundary_exclusion', 'estimating_assumption', 'field_lesson', 'inclusion'
  ));

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
  ac.vat_pct,
  ac.guardrail_note,
  ac.version_label,
  ac.status,
  ac.discipline,
  ac.work_item_type,
  ac.category_id,
  ac.scope_of_works,
  ac.manual_direct_cost_per_unit,
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
  -- Standalone items (no linked work item, no crew/equipment) can carry a
  -- manually-entered direct cost instead — coalesce prefers the real
  -- computed sum whenever there IS one, and only falls back to the manual
  -- figure when the computed sum is genuinely zero (nothing linked yet).
  coalesce(
    nullif(
      coalesce(mat.material_total_cost, 0)
        + case when ac.daily_output is not null and ac.daily_output > 0
            then coalesce(crew.crew_cost_per_day, 0) / ac.daily_output else 0 end
        + case when ac.daily_output is not null and ac.daily_output > 0
            then coalesce(equip.equipment_cost_per_day, 0) / ac.daily_output else 0 end,
      0
    ),
    ac.manual_direct_cost_per_unit,
    0
  ) as direct_installed_cost,
  -- Overhead, risk, profit and VAT are compounded in sequence (each applied
  -- to the running total, not flat-summed) — matches standard QS rate
  -- build-up practice and the existing Calculator/Cost Summary tabs.
  round(
    coalesce(
      nullif(
        coalesce(mat.material_total_cost, 0)
          + case when ac.daily_output is not null and ac.daily_output > 0
              then coalesce(crew.crew_cost_per_day, 0) / ac.daily_output else 0 end
          + case when ac.daily_output is not null and ac.daily_output > 0
              then coalesce(equip.equipment_cost_per_day, 0) / ac.daily_output else 0 end,
        0
      ),
      ac.manual_direct_cost_per_unit,
      0
    )
    * (1 + coalesce(ac.overhead_pct, 0))
    * (1 + coalesce(ac.risk_pct, 0))
    * (1 + coalesce(ac.profit_pct, 0))
    * (1 + coalesce(ac.vat_pct, 0)),
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
  '(material + labor/day-rate/output + equipment/day-rate/output, or a '
  'manual override for standalone rate-card items with no BOQ), the '
  'overhead+risk+profit+VAT Target Tender Selling Rate, and General Info '
  'tab fields.';
