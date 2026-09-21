-- Migration: 20260910000036_dwl_cost_item_library_schema.sql
-- Purpose: Cost Item Library (plan
--          inside-module-quantity-surveying-delegated-valley.md) — a
--          richer browse+detail view over the EXISTING Direct Works
--          Assemblies/Work-Items system (dwl_assemblies, dwl_assembly_items,
--          dwl_work_items, dwl_work_item_resources — all untouched here).
--          Adds the handful of things that system doesn't have yet: an
--          item-level rate build-up (overhead/risk/profit), crew and plant
--          composition, a cross-section layer diagram, and a free-form
--          spec table — plus two views that roll existing + new data up to
--          the shapes the detail tabs need.
--
-- Depends on: 20260720000006_dwl_phase2_work_items.sql,
--   20260720000008_dwl_phase3_assemblies.sql, 20260910000004_dwl_resource_
--   prices_effective_cost.sql (dwl_v_current_prices' current column set).
--
-- Additive only: dwl_assemblies/dwl_assembly_items/dwl_work_items/
--   dwl_work_item_resources keep their existing shape and meaning
--   unchanged. Every table here is a new 1:many or 1:1 companion to
--   dwl_assemblies or dwl_resources. Same tenant-scoped RLS pattern as
--   dwl_material_attributes/dwl_subcon_attributes (this session's other
--   companion tables) — NOT the older auth.jwt() pattern still visible on
--   dwl_assemblies itself (that predates 20260720000017's fix and is out
--   of scope to touch here).
--
-- Idempotent: create table/index if not exists, guarded policy creation,
--   drop+create views (leaf, no dependents).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. dwl_assembly_costing — 1:1 companion. The item-level rate build-up
--    (overhead/risk/profit) that only exists today at the whole-tender
--    level (tender_bid_summaries) — this is the per-cost-item equivalent.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_assembly_costing (
  assembly_id    uuid primary key
                   references public.dwl_assemblies(id) on delete cascade,
  tenant_id      uuid not null,
  daily_output   numeric(14,4),          -- units of the assembly one crew completes per day
  overhead_pct   numeric(6,4) not null default 0.10,
  risk_pct       numeric(6,4) not null default 0.05,
  profit_pct     numeric(6,4) not null default 0.10,
  guardrail_note text,                   -- e.g. "Excludes decorative painting..."
  version_label  text default 'v1.0',
  status         text not null default 'active' check (status in ('active','draft','archived')),
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_dwl_assembly_costing_tenant on public.dwl_assembly_costing(tenant_id);

drop trigger if exists set_dwl_assembly_costing_updated_at on public.dwl_assembly_costing;
create trigger set_dwl_assembly_costing_updated_at
  before update on public.dwl_assembly_costing
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- 2/3. dwl_assembly_crew / dwl_assembly_equipment — the assembly's labor
--    gang and plant list. Reuses dwl_resources (category='labor'/
--    'equipment') + dwl_resource_prices for day rates instead of a
--    parallel wage table — cost/day = quantity x that resource's current
--    price.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_assembly_crew (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  assembly_id  uuid not null references public.dwl_assemblies(id) on delete cascade,
  resource_id  uuid not null references public.dwl_resources(id),  -- category='labor'
  role_label   text not null,           -- e.g. "Skilled Mason"
  quantity     numeric(8,2) not null default 1 check (quantity > 0),
  sort_order   int not null default 0
);
create index if not exists idx_dwl_assembly_crew_tenant on public.dwl_assembly_crew(tenant_id);
create index if not exists idx_dwl_assembly_crew_assembly on public.dwl_assembly_crew(assembly_id);

create table if not exists public.dwl_assembly_equipment (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  assembly_id  uuid not null references public.dwl_assemblies(id) on delete cascade,
  resource_id  uuid not null references public.dwl_resources(id),  -- category='equipment'
  role_label   text not null,           -- e.g. "Mobile Scaffold Tower"
  quantity     numeric(8,2) not null default 1 check (quantity > 0),
  sort_order   int not null default 0
);
create index if not exists idx_dwl_assembly_equipment_tenant on public.dwl_assembly_equipment(tenant_id);
create index if not exists idx_dwl_assembly_equipment_assembly on public.dwl_assembly_equipment(assembly_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. dwl_assembly_layers — drives the Specifications tab's cross-section
--    diagram: an ordered, generic proportional stacked-layer diagram (not
--    a hand-illustrated drawing), so it generalises across assembly types.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_assembly_layers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  assembly_id    uuid not null references public.dwl_assemblies(id) on delete cascade,
  sort_order     int not null default 0,
  layer_name     text not null,          -- e.g. "Outer"
  material_label text,                   -- e.g. "12.5mm Gypsum Plasterboard"
  thickness_mm   numeric(8,2) not null check (thickness_mm > 0),
  color_hex      text not null default '#94a3b8'
);
create index if not exists idx_dwl_assembly_layers_tenant on public.dwl_assembly_layers(tenant_id);
create index if not exists idx_dwl_assembly_layers_assembly on public.dwl_assembly_layers(assembly_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. dwl_assembly_specs — free-form key/value rows for the "Engineering
--    Specifications & Technical Conformance" table (Fire Rating, Acoustic
--    Rating, Applicable Standards, Installation Method, ...) — deliberately
--    unstructured since these vary by assembly type. Also doubles as the
--    home for BOQ-tab storage/protocol notes and Labour-tab benchmark text
--    (distinguished by `section`).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.dwl_assembly_specs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  assembly_id uuid not null references public.dwl_assemblies(id) on delete cascade,
  section     text not null default 'specification'
                check (section in ('specification','storage_protocol','productivity_benchmark')),
  sort_order  int not null default 0,
  spec_label  text not null,             -- e.g. "Fire Rating"
  spec_value  text not null              -- e.g. "Class 0 flame spread (BS 476 Part 6 & 7)"
);
create index if not exists idx_dwl_assembly_specs_tenant on public.dwl_assembly_specs(tenant_id);
create index if not exists idx_dwl_assembly_specs_assembly on public.dwl_assembly_specs(assembly_id, section);

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — tenant-scoped, normal CRUD, current pattern (post-20260720000017).
-- ─────────────────────────────────────────────────────────────────────────
alter table public.dwl_assembly_costing   enable row level security;
alter table public.dwl_assembly_crew      enable row level security;
alter table public.dwl_assembly_equipment enable row level security;
alter table public.dwl_assembly_layers    enable row level security;
alter table public.dwl_assembly_specs     enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['dwl_assembly_costing','dwl_assembly_crew','dwl_assembly_equipment','dwl_assembly_layers','dwl_assembly_specs']
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
-- 6. dwl_v_assembly_material_explosion — assembly-level material BOQ.
--    effective_qty compounds the assembly's design ratio with the work
--    item's own consumption+waste, filtered to materials only (labor/
--    equipment recipe lines, if any, are excluded here — they're costed
--    separately via dwl_assembly_crew/dwl_assembly_equipment above).
-- ─────────────────────────────────────────────────────────────────────────
drop view if exists public.dwl_v_assembly_material_explosion;

create view public.dwl_v_assembly_material_explosion
with (security_invoker = true)
as
select
  a.id as assembly_id,
  a.code as assembly_code,
  r.id as resource_id,
  r.code as material_code,
  coalesce(ma.material_name, r.description) as material_description,
  r.unit,
  ai.qty_per_unit * wir.consumption as consumption,
  wir.waste_pct,
  round(ai.qty_per_unit * wir.consumption * (1 + wir.waste_pct), 6) as effective_qty,
  cp.unit_price,
  cp.currency,
  round(ai.qty_per_unit * wir.consumption * coalesce(cp.unit_price, 0), 4) as base_cost_contribution,
  round(ai.qty_per_unit * wir.consumption * wir.waste_pct * coalesce(cp.unit_price, 0), 4) as waste_cost_contribution,
  round(ai.qty_per_unit * wir.consumption * (1 + wir.waste_pct) * coalesce(cp.unit_price, 0), 4) as cost_contribution,
  cp.is_expired,
  wir.basis_note,
  wir.sort_order
from public.dwl_assemblies a
join public.dwl_assembly_items ai on ai.assembly_id = a.id
join public.dwl_work_item_resources wir on wir.work_item_id = ai.work_item_id
join public.dwl_resources r on r.id = wir.resource_id and r.category = 'material'
left join public.dwl_material_attributes ma on ma.resource_id = r.id
left join public.dwl_v_current_prices cp on cp.resource_id = r.id
where a.is_active
order by a.code, wir.sort_order;

comment on view public.dwl_v_assembly_material_explosion is
  'Cost Item Library — assembly-level Bill of Quantities (material '
  'components only). One row per material recipe line, compounding the '
  'assembly qty_per_unit with the work item''s consumption+waste_pct.';

-- ─────────────────────────────────────────────────────────────────────────
-- 7. dwl_v_assembly_costing_summary — rolls material + crew + equipment +
--    overhead/risk/profit up to Direct/Installed/Tender rates. Feeds
--    General Info, the Installed Cost Calculator's starting values, and
--    Cost Summary.
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
left join mat   on mat.assembly_id = a.id
left join crew  on crew.assembly_id = a.id
left join equip on equip.assembly_id = a.id
where a.is_active;

comment on view public.dwl_v_assembly_costing_summary is
  'Cost Item Library — one row per assembly: Direct/Installed cost build-up '
  '(material + labor/day-rate/output + equipment/day-rate/output) and the '
  'overhead+risk+profit Target Tender Selling Rate.';
