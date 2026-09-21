-- Migration: 20260910000035_dwl_bulk_subcon_rates_xlsx_import.sql
-- Purpose: Cost & Rate Library — Subcontractor Trade Rates Library. Loads
--          the 14 real commercial rates from
--          docs/DCOS_Subcontractor_Rates_2026-09-15.xlsx (sheet
--          "Subcontractor_Rates") into dwl_suppliers (vendor_kind=
--          'subcontractor') + dwl_resources (category='subcon') +
--          dwl_subcon_attributes + dwl_resource_prices.
--
-- Depends on: 20260910000034_dwl_subcon_rates_schema.sql.
--
-- Shape: 4 subcontractors x 7 distinct trade items x (1-3 yearly rates
--   each) = 14 price rows. Resource codes are hand-assigned S-<TRD>-NNN,
--   reusing the same 3-letter trade group as each subcontractor's own
--   code (WTR/STL/PLT/ELE) — e.g. S-WTR-001, S-WTR-002. source_type is
--   'quotation' (these are tender-package commercial rates, per the
--   Excel's own framing); rate_type is 'Unit Rate' for every row (the only
--   value present in this dataset).
--
-- Idempotent: subcontractors guarded by "no existing profile with this
--   supplier_code"; items guarded by "no existing resource with this
--   code"; price rows guarded by "no existing price row with this
--   resource_id + valid_from" (a year is only ever priced once per item).

do $$
declare
  v_tenant uuid := (select id from public.companies where code = 'MCC');
begin

drop table if exists tmp_subcontractors;
create temp table tmp_subcontractors (
  supplier_code text,
  company_name  text
);
insert into tmp_subcontractors (supplier_code, company_name) values
  ('SUB-WTR-001', 'Apex Waterproofing Specialists Ltd'),
  ('SUB-STL-002', 'Mekong Steel Fabricators & Erectors'),
  ('SUB-PLT-003', 'Champa Plaster & Masonry Guild'),
  ('SUB-ELE-004', 'Siemens Volt Engineering Contractors');

drop table if exists tmp_subcon_items;
create temp table tmp_subcon_items (
  item_code       text,
  supplier_code   text,
  trade           text,
  item_description text,
  unit            text
);
insert into tmp_subcon_items (item_code, supplier_code, trade, item_description, unit) values
  ('S-WTR-001', 'SUB-WTR-001', 'Waterproofing & Joint Sealing', 'Torch-applied 4mm SBS bituminous roof membrane installation including primer, heat welding, and perimeter upstands', 'm2'),
  ('S-WTR-002', 'SUB-WTR-001', 'Waterproofing & Joint Sealing', '2-Coat Liquid Polyurethane waterproofing to wet rooms and balconies with fiberglass mesh reinforcement', 'm2'),
  ('S-STL-001', 'SUB-STL-002', 'Structural Steel Erection', 'Structural steel erection and bolt torque tightening up to 25m height', 'tonne'),
  ('S-PLT-001', 'SUB-PLT-003', 'Masonry & Internal Plastering', 'Laying 100mm AAC lightweight blocks with thin-bed adhesive', 'm2'),
  ('S-PLT-002', 'SUB-PLT-003', 'Masonry & Internal Plastering', 'Two-coat 15mm cement-sand internal wall plastering with corner beads', 'm2'),
  ('S-ELE-001', 'SUB-ELE-004', 'Electrical & Extra Low Voltage (ELV)', 'Cable tray and trunking installation including brackets and earthing links', 'm'),
  ('S-ELE-002', 'SUB-ELE-004', 'Electrical & Extra Low Voltage (ELV)', 'Cable pulling 4x16mm2 to 4x50mm2 armored cable in containment', 'm');

drop table if exists tmp_subcon_rates;
create temp table tmp_subcon_rates (
  item_code    text,
  rate_year    int,
  rate_type    text,
  rate         numeric(14,4),
  currency     text,
  scope_notes  text,
  effective_date date
);
insert into tmp_subcon_rates (item_code, rate_year, rate_type, rate, currency, scope_notes, effective_date) values
  ('S-WTR-001', 2024, 'Unit Rate', 8.5,  'USD', 'Includes material and labor', '2024-01-01'),
  ('S-WTR-001', 2025, 'Unit Rate', 9.2,  'USD', 'Includes material and labor', '2025-01-01'),
  ('S-WTR-001', 2026, 'Unit Rate', 10.0, 'USD', 'Includes material and labor with 10-year warranty', '2026-01-01'),
  ('S-WTR-002', 2026, 'Unit Rate', 7.5,  'USD', 'Excludes protective screed', '2026-01-01'),
  ('S-STL-001', 2024, 'Unit Rate', 220,  'USD', 'Labor, hoisting rigging and touch-up primer', '2024-01-01'),
  ('S-STL-001', 2025, 'Unit Rate', 235,  'USD', 'Labor, hoisting rigging and touch-up primer', '2025-01-01'),
  ('S-STL-001', 2026, 'Unit Rate', 250,  'USD', 'Includes safety net rigging and crane crews', '2026-01-01'),
  ('S-PLT-001', 2024, 'Unit Rate', 4.2,  'USD', 'Labor only; material by main contractor', '2024-01-01'),
  ('S-PLT-001', 2025, 'Unit Rate', 4.5,  'USD', 'Labor only; material by main contractor', '2025-01-01'),
  ('S-PLT-001', 2026, 'Unit Rate', 4.8,  'USD', 'Labor only including wall ties and scaffolding', '2026-01-01'),
  ('S-PLT-002', 2026, 'Unit Rate', 3.8,  'USD', 'Labor only', '2026-01-01'),
  ('S-ELE-001', 2025, 'Unit Rate', 12.5, 'USD', 'Labor and standard fixings', '2025-01-01'),
  ('S-ELE-001', 2026, 'Unit Rate', 13.8, 'USD', 'Labor and fixings', '2026-01-01'),
  ('S-ELE-002', 2026, 'Unit Rate', 3.2,  'USD', 'Labor only', '2026-01-01');

-- 1. Subcontractor companies
insert into public.dwl_suppliers (tenant_id, name, is_active)
select v_tenant, t.company_name, true
from tmp_subcontractors t
where not exists (
  select 1 from public.dwl_supplier_profiles p
  where p.tenant_id = v_tenant and p.supplier_code = t.supplier_code
)
and not exists (
  select 1 from public.dwl_suppliers x
  where x.tenant_id = v_tenant and x.name = t.company_name
);

insert into public.dwl_supplier_profiles (supplier_id, tenant_id, supplier_code, vendor_kind, lifecycle_status)
select s.id, v_tenant, t.supplier_code, 'subcontractor', 'active'
from tmp_subcontractors t
join public.dwl_suppliers s on s.tenant_id = v_tenant and s.name = t.company_name
where not exists (
  select 1 from public.dwl_supplier_profiles p
  where p.tenant_id = v_tenant and p.supplier_code = t.supplier_code
);

-- 2. Trade items (dwl_resources + dwl_subcon_attributes)
insert into public.dwl_resources (tenant_id, code, category, description, unit)
select v_tenant, i.item_code, 'subcon', i.item_description, i.unit
from tmp_subcon_items i
where not exists (
  select 1 from public.dwl_resources r where r.code = i.item_code
);

insert into public.dwl_subcon_attributes (resource_id, tenant_id, trade, lifecycle_status)
select r.id, v_tenant, i.trade, 'active'
from tmp_subcon_items i
join public.dwl_resources r on r.code = i.item_code
where not exists (
  select 1 from public.dwl_subcon_attributes a where a.resource_id = r.id
);

-- 3. Yearly commercial rates (append-only price history)
insert into public.dwl_resource_prices (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, source_type, rate_type, notes)
select
  v_tenant, r.id, s.id, tr.rate, tr.currency, tr.effective_date, 'quotation', tr.rate_type,
  'Imported from docs/DCOS_Subcontractor_Rates_2026-09-15.xlsx — ' || tr.scope_notes
from tmp_subcon_rates tr
join tmp_subcon_items i on i.item_code = tr.item_code
join public.dwl_resources r on r.code = i.item_code
join public.dwl_suppliers s on s.tenant_id = v_tenant and s.name = (
  select company_name from tmp_subcontractors where supplier_code = i.supplier_code
)
where not exists (
  select 1 from public.dwl_resource_prices p
  where p.resource_id = r.id and p.valid_from = tr.effective_date
);

drop table tmp_subcon_rates;
drop table tmp_subcon_items;
drop table tmp_subcontractors;

end $$;
