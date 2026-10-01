-- =============================================================================
-- Cost & Rate Library: Equipment Rates + labour all-in day rate
-- =============================================================================
-- 1. dwl_equipment_attributes — 1:1 companion to dwl_resources
--    (category='equipment'), the equipment twin of dwl_labor_rate_attributes:
--    owned/hired, rate basis, operator / fuel included, fuel use, minimum hire,
--    mobilisation, capacity. Backfilled for existing equipment from unit and
--    description. Browse view dwl_v_equipment_rates.
-- 2. Labour all-in build-up on dwl_labor_rate_attributes: routine overtime %,
--    NSSF employer %, other statutory % (seniority / holidays), and per-day
--    meals, transport, accommodation, PPE & tools. all_in_enabled switches a
--    trade's costing from the basic day rate to the all-in day rate:
--      all-in = basic x (1 + OT% + NSSF% + other%) + per-day allowances
--    Only for day-rate trades (unit = 'day'). Skill levels are backfilled from
--    the trade description where missing.
-- 3. dwl_v_resource_costing_rates — the ONE rate every costing view uses:
--    costing_rate = all-in day rate (labour, enabled) else the current price.
--    dwl_v_assembly_costing_summary (crew + equipment), dwl_v_work_item_rates
--    and dwl_v_work_item_explosion now read it. With no build-up enabled every
--    rate is exactly what it was before this migration.
--
-- Planning (plan_resolve_labor_rate) keeps using the basic day rate.
-- Idempotent: if-not-exists / guarded policies / create-or-replace views with
-- unchanged column lists (new columns appended at the end only).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Equipment attributes
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_equipment_attributes (
  resource_id        uuid primary key references public.dwl_resources(id) on delete cascade,
  tenant_id          uuid not null,
  ownership          text check (ownership in ('owned','hired')),
  rate_basis         text check (rate_basis in ('hour','day','week','month','unit_output')),
  operator_included  boolean not null default false,
  fuel_included      boolean not null default false,
  fuel_l_per_day     numeric(10,2),
  min_hire_qty       numeric(10,2),          -- in rate_basis units (e.g. 1 month minimum)
  mobilisation_cost  numeric(12,2),          -- one-off per mobilisation, not in the unit rate
  capacity_model     text,                   -- e.g. "PC200, 0.8 m3 bucket"
  notes              text,
  updated_by         uuid references public.profiles(id),
  created_by         uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_dwl_equipment_attributes_tenant on public.dwl_equipment_attributes(tenant_id);

drop trigger if exists set_dwl_equipment_attributes_updated_at on public.dwl_equipment_attributes;
create trigger set_dwl_equipment_attributes_updated_at
  before update on public.dwl_equipment_attributes
  for each row execute function public.set_updated_at();

alter table public.dwl_equipment_attributes enable row level security;

do $$ begin
  create policy dwl_equipment_attributes_tenant_select on public.dwl_equipment_attributes
    for select using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_equipment_attributes_tenant_insert on public.dwl_equipment_attributes
    for insert with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_equipment_attributes_tenant_update on public.dwl_equipment_attributes
    for update using (tenant_id = (select company_id from public.profiles where id = auth.uid()))
    with check (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy dwl_equipment_attributes_tenant_delete on public.dwl_equipment_attributes
    for delete using (tenant_id = (select company_id from public.profiles where id = auth.uid()));
exception when duplicate_object then null; end $$;

-- Backfill: one row per existing equipment resource (never overwrites).
insert into public.dwl_equipment_attributes
  (resource_id, tenant_id, ownership, rate_basis, operator_included, fuel_included)
select r.id, r.tenant_id,
       case when r.description ~* '(rental|hire)' then 'hired' end,
       case lower(r.unit)
         when 'hr' then 'hour' when 'hour' then 'hour'
         when 'day' then 'day' when 'week' then 'week'
         when 'month' then 'month'
         else 'unit_output' end,
       r.description ~* 'operator',
       r.description ~* 'fuel'
from public.dwl_resources r
where r.category = 'equipment'
on conflict (resource_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Labour all-in build-up
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_labor_rate_attributes
  add column if not exists all_in_enabled        boolean not null default false,
  add column if not exists ot_allowance_pct      numeric(6,4),
  add column if not exists nssf_employer_pct     numeric(6,4),
  add column if not exists other_statutory_pct   numeric(6,4),
  add column if not exists meal_per_day          numeric(10,2),
  add column if not exists transport_per_day     numeric(10,2),
  add column if not exists accommodation_per_day numeric(10,2),
  add column if not exists ppe_tools_per_day     numeric(10,2);

comment on column public.dwl_labor_rate_attributes.all_in_enabled is
  'When true (and the trade is priced per day), cost items and work-item rate build-ups use the all-in day rate instead of the basic day rate.';

-- Skill level backfill (only where a labour row has no attributes yet).
insert into public.dwl_labor_rate_attributes (resource_id, tenant_id, skill_level)
select r.id, r.tenant_id,
       case
         when r.description ~* '(foreman|ganger|supervisor|chief)' then 'Foreman'
         when r.description ~* '(helper|kon-?keng|general labou?rer|unskilled)' then 'General Helper'
         when r.description ~* '(master|certified|licensed|technician|surveyor|operator)' then 'Master'
         when lower(r.unit) in ('day','hr','month') then 'Skilled'
       end
from public.dwl_resources r
where r.category = 'labor'
on conflict (resource_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. One costing rate per resource
-- ─────────────────────────────────────────────────────────────────────────
create or replace view public.dwl_v_resource_costing_rates
with (security_invoker = true)
as
select
  r.id        as resource_id,
  r.code,
  r.category,
  r.unit,
  cp.currency,
  coalesce(cp.effective_unit_cost, cp.unit_price) as basic_rate,
  x.all_in_rate,
  coalesce(x.all_in_rate, cp.effective_unit_cost, cp.unit_price) as costing_rate
from public.dwl_resources r
left join public.dwl_v_current_prices cp on cp.resource_id = r.id
left join public.dwl_labor_rate_attributes la on la.resource_id = r.id
cross join lateral (
  select case
    when r.category = 'labor' and lower(r.unit) = 'day' and la.all_in_enabled and cp.unit_price is not null
    then round(cp.unit_price * (1 + coalesce(la.ot_allowance_pct, 0) + coalesce(la.nssf_employer_pct, 0) + coalesce(la.other_statutory_pct, 0))
               + coalesce(la.meal_per_day, 0) + coalesce(la.transport_per_day, 0)
               + coalesce(la.accommodation_per_day, 0) + coalesce(la.ppe_tools_per_day, 0), 4)
  end as all_in_rate
) x;

comment on view public.dwl_v_resource_costing_rates is
  'Cost & Rate Library — the rate costing uses for each resource: the labour all-in day rate when enabled, otherwise the current price (effective cost).';

-- Labour browse view: build-up and all-in rate appended.
create or replace view public.dwl_v_labor_rates
with (security_invoker = true)
as
select
  r.id                    as resource_id,
  r.code,
  r.description,
  r.unit,
  r.spec_reference,
  r.is_active,
  r.created_at,
  r.updated_at,
  a.skill_level,
  a.standard_productivity_note,
  cp.unit_price            as daily_basic_rate,
  cp.overtime_rate_per_hr,
  cp.currency,
  cp.valid_from,
  cp.price_status,
  -- appended (all-in build-up, this migration):
  coalesce(a.all_in_enabled, false) as all_in_enabled,
  a.ot_allowance_pct,
  a.nssf_employer_pct,
  a.other_statutory_pct,
  a.meal_per_day,
  a.transport_per_day,
  a.accommodation_per_day,
  a.ppe_tools_per_day,
  cr.all_in_rate           as all_in_daily_rate,
  cr.costing_rate
from public.dwl_resources r
left join public.dwl_labor_rate_attributes a on a.resource_id = r.id
left join public.dwl_v_current_prices cp on cp.resource_id = r.id
left join public.dwl_v_resource_costing_rates cr on cr.resource_id = r.id
where r.category = 'labor';

-- Equipment browse view.
create or replace view public.dwl_v_equipment_rates
with (security_invoker = true)
as
select
  r.id           as resource_id,
  r.code,
  r.description,
  r.unit,
  r.spec_reference,
  r.is_active,
  r.created_at,
  r.updated_at,
  e.ownership,
  e.rate_basis,
  coalesce(e.operator_included, false) as operator_included,
  coalesce(e.fuel_included, false)     as fuel_included,
  e.fuel_l_per_day,
  e.min_hire_qty,
  e.mobilisation_cost,
  e.capacity_model,
  e.notes,
  coalesce(cp.effective_unit_cost, cp.unit_price) as rate,
  cp.currency,
  cp.valid_from,
  cp.quote_valid_until,
  cp.is_expired,
  cp.source_type,
  cp.supplier_name,
  cp.price_status
from public.dwl_resources r
left join public.dwl_equipment_attributes e on e.resource_id = r.id
left join public.dwl_v_current_prices cp on cp.resource_id = r.id
where r.category = 'equipment';

comment on view public.dwl_v_equipment_rates is
  'Cost & Rate Library — Equipment Rates browse view: dwl_resources (category=equipment) + dwl_equipment_attributes + current price.';

-- Cost item summary: crew and equipment day costs from the costing rate.
create or replace view public.dwl_v_assembly_costing_summary
with (security_invoker = true)
as
WITH mat AS (
         SELECT dwl_v_assembly_material_explosion.assembly_id,
            sum(dwl_v_assembly_material_explosion.base_cost_contribution) AS material_base_cost,
            sum(dwl_v_assembly_material_explosion.waste_cost_contribution) AS waste_cost,
            sum(dwl_v_assembly_material_explosion.cost_contribution) AS material_total_cost
           FROM dwl_v_assembly_material_explosion
          GROUP BY dwl_v_assembly_material_explosion.assembly_id
        ), crew AS (
         SELECT c.assembly_id,
            sum(c.quantity * COALESCE(cr.costing_rate, 0::numeric)) AS crew_cost_per_day
           FROM dwl_assembly_crew c
             LEFT JOIN dwl_v_resource_costing_rates cr ON cr.resource_id = c.resource_id
          GROUP BY c.assembly_id
        ), equip AS (
         SELECT e.assembly_id,
            sum(e.quantity * COALESCE(cr.costing_rate, 0::numeric)) AS equipment_cost_per_day
           FROM dwl_assembly_equipment e
             LEFT JOIN dwl_v_resource_costing_rates cr ON cr.resource_id = e.resource_id
          GROUP BY e.assembly_id
        ), base AS (
         SELECT a.id AS assembly_id,
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
            ac.material_base_cost_override IS NOT NULL OR ac.material_waste_pct_override IS NOT NULL OR ac.labor_cost_override_per_unit IS NOT NULL OR ac.equipment_cost_override_per_unit IS NOT NULL AS is_tuned,
            ac.created_by,
            p.full_name AS created_by_name,
            ac.updated_at,
            COALESCE(mat.material_base_cost, 0::numeric) AS computed_material_base_cost,
            COALESCE(mat.waste_cost, 0::numeric) AS computed_waste_cost,
            COALESCE(crew.crew_cost_per_day, 0::numeric) AS crew_cost_per_day,
            COALESCE(equip.equipment_cost_per_day, 0::numeric) AS equipment_cost_per_day,
            COALESCE(ac.material_base_cost_override, mat.material_base_cost, 0::numeric) AS material_base_cost,
            COALESCE(ac.material_waste_pct_override,
                CASE
                    WHEN COALESCE(mat.material_base_cost, 0::numeric) > 0::numeric THEN mat.waste_cost / mat.material_base_cost
                    ELSE 0.05
                END) AS effective_waste_pct,
            COALESCE(ac.labor_cost_override_per_unit,
                CASE
                    WHEN ac.daily_output IS NOT NULL AND ac.daily_output > 0::numeric THEN COALESCE(crew.crew_cost_per_day, 0::numeric) / ac.daily_output
                    ELSE 0::numeric
                END) AS labor_cost_per_unit,
            COALESCE(ac.equipment_cost_override_per_unit,
                CASE
                    WHEN ac.daily_output IS NOT NULL AND ac.daily_output > 0::numeric THEN COALESCE(equip.equipment_cost_per_day, 0::numeric) / ac.daily_output
                    ELSE 0::numeric
                END) AS equipment_cost_per_unit
           FROM dwl_assemblies a
             LEFT JOIN dwl_assembly_costing ac ON ac.assembly_id = a.id
             LEFT JOIN profiles p ON p.id = ac.created_by
             LEFT JOIN mat ON mat.assembly_id = a.id
             LEFT JOIN crew ON crew.assembly_id = a.id
             LEFT JOIN equip ON equip.assembly_id = a.id
          WHERE a.is_active
        )
 SELECT assembly_id,
    code,
    element_group,
    description,
    unit,
    daily_output,
    overhead_pct,
    risk_pct,
    profit_pct,
    vat_pct,
    guardrail_note,
    version_label,
    status,
    discipline,
    work_item_type,
    category_id,
    scope_of_works,
    manual_direct_cost_per_unit,
    tuned_at,
    is_tuned,
    created_by,
    created_by_name,
    updated_at,
    material_base_cost,
    material_base_cost * effective_waste_pct AS waste_cost,
    material_base_cost * (1::numeric + effective_waste_pct) AS material_total_cost,
    crew_cost_per_day,
    equipment_cost_per_day,
    labor_cost_per_unit,
    equipment_cost_per_unit,
    COALESCE(NULLIF(material_base_cost * (1::numeric + effective_waste_pct) + labor_cost_per_unit + equipment_cost_per_unit, 0::numeric), manual_direct_cost_per_unit, 0::numeric) AS direct_installed_cost,
    round(COALESCE(NULLIF(material_base_cost * (1::numeric + effective_waste_pct) + labor_cost_per_unit + equipment_cost_per_unit, 0::numeric), manual_direct_cost_per_unit, 0::numeric) * (1::numeric + COALESCE(overhead_pct, 0::numeric)) * (1::numeric + COALESCE(risk_pct, 0::numeric)) * (1::numeric + COALESCE(profit_pct, 0::numeric)) * (1::numeric + COALESCE(vat_pct, 0::numeric)), 4) AS target_tender_rate
   FROM base;

-- Work-item rate build-ups: labour / equipment lines priced at the costing rate.
create or replace view public.dwl_v_work_item_explosion
with (security_invoker = true)
as
SELECT wi.code AS work_item_code,
    wir.sort_order,
    r.code AS resource_code,
    r.description AS resource_desc,
    r.unit AS resource_unit,
    wir.consumption,
    wir.waste_pct,
    cr.costing_rate::numeric(14,4) AS unit_price,
    round(wir.consumption * (1::numeric + wir.waste_pct) * cr.costing_rate, 4) AS line_cost,
    cp.source_type,
    cp.is_expired,
    wir.basis_note,
    wi.id AS work_item_id,
    r.category AS resource_category
   FROM dwl_work_items wi
     JOIN dwl_work_item_resources wir ON wir.work_item_id = wi.id
     JOIN dwl_resources r ON r.id = wir.resource_id
     JOIN dwl_v_current_prices cp ON cp.resource_id = wir.resource_id
     JOIN dwl_v_resource_costing_rates cr ON cr.resource_id = wir.resource_id
  ORDER BY wi.code, wir.sort_order;

create or replace view public.dwl_v_work_item_rates
with (security_invoker = true)
as
SELECT wi.id AS work_item_id,
    wi.code,
    wi.boq_section,
    wi.description,
    wi.unit,
    sum(wir.consumption * (1::numeric + wir.waste_pct) * cr.costing_rate) AS net_direct_rate,
    bool_or(cp.is_expired) AS has_expired_price,
    count(*) AS recipe_lines
   FROM dwl_work_items wi
     JOIN dwl_work_item_resources wir ON wir.work_item_id = wi.id
     JOIN dwl_v_current_prices cp ON cp.resource_id = wir.resource_id
     JOIN dwl_v_resource_costing_rates cr ON cr.resource_id = wir.resource_id
  WHERE wi.is_active
  GROUP BY wi.id, wi.code, wi.boq_section, wi.description, wi.unit;
