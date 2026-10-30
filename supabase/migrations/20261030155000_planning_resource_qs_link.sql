-- Migration: 20261030155000_planning_resource_qs_link.sql
-- Purpose: Link a project resource (plan_resources) to its QS cost-library resource (dwl_resources), so Planning
--          takes the rate from QS (dwl_v_resource_costing_rates.costing_rate) instead of a second hand-typed rate.
--          plan_resources.cost_per_unit stays as an optional override of the QS rate.
-- Depends on: plan_resources, dwl_resources (both exist)
-- Additive only: one nullable column and an index. RLS on plan_resources is unchanged; the QS rate is read through
-- dwl_resources / dwl_v_resource_costing_rates under their own tenant policies.

alter table public.plan_resources
  add column if not exists dwl_resource_id uuid references public.dwl_resources(id) on delete set null;

create index if not exists plan_resources_dwl_resource_id_idx on public.plan_resources (dwl_resource_id);

comment on column public.plan_resources.dwl_resource_id is
  'QS cost-library resource this project resource is costed from (dwl_resources). Its rate is dwl_v_resource_costing_rates.costing_rate.';
comment on column public.plan_resources.cost_per_unit is
  'Optional override rate per unit_label. When null and dwl_resource_id is set, the QS costing rate applies.';
