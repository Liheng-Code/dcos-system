-- Migration: 20260910000011_dwl_seed_ceiling_specs_suppliers.sql
-- Purpose: 8 specifications (+ R01 revisions), 10 suppliers (+ profiles), 20 supplier-material links.
--          Cost & Rate Library — Ceiling seed (DCOS-DS-12-012 Phase C-H,
--          QS-SOP-004). Source: docs/DCOS_Cost_Rate_Library_Material_Spec_Price_Template.xlsx.
--
-- DEMO DATA — all suppliers, prices and quotations below are FICTIONAL,
-- for training / illustration only. They are NOT real market data and must
-- be superseded by real quotations before use in live tendering
-- (master-prompt §57, QS-SOP-004 §10).
--
-- Coding: template MAT-CL-* codes are remapped to the locked DWL standard
-- {M/L/E/S}-{GRP3}-{NNN} (QS-SOP-002 §6 D2): M-CLG-* systems, M-CLF-* frame,
-- M-CLA-* accessories. The original template code is kept in
-- dwl_material_attributes.legacy_code.
--
-- Depends on: 20260910000001..06 (dwl_material_attributes, dwl_material_specs,
--   dwl_supplier_profiles, dwl_supplier_materials, dwl_resource_prices
--   breakdown cols, dwl_price_submissions, dwl_quotations), public.companies.
-- Idempotent: tenant resolved from companies.code='MCC'; every insert guarded
--   (on conflict / where not exists).

do $$
declare
  v_tenant uuid;
begin
  select id into v_tenant from public.companies where code = 'MCC';
  if v_tenant is null then
    raise exception 'ceiling seed: no company with code = MCC — cannot determine tenant_id';
  end if;

  -- ── dwl_material_specs + first revision ─────────────────────────────
  insert into public.dwl_material_specs (tenant_id, spec_code, resource_id, spec_name, discipline)
  select v_tenant, 'SPEC-CLG-001', r.id, 'Standard Gypsum Suspended System', 'Architectural'
  from public.dwl_resources r where r.code = 'M-CLG-001' and r.tenant_id = v_tenant
  on conflict (tenant_id, spec_code) do nothing;
  insert into public.dwl_material_spec_revisions
    (tenant_id, spec_id, revision_no, standard, grade, strength_performance, dimension,
     thickness, density, unit, manufacturer, brand, technical_req, installation_req,
     testing_req, approval_req, effective_date, status)
  select v_tenant, s.id, 'R01', 'EN 520 / BS EN 13964', 'Standard',
     'Fire: EI 30 optional', 'Board size 1200x2400', '12.5 mm',
     '≈700 kg/m³', 'm2', 'Various', 'Various',
     'GI main & cross runners, hangers, perimeter channel', 'Level to ±3mm, joints taped & filled',
     'Fire test where required', 'Architect / Consultant approval',
     '2025-01-01', 'active'
  from public.dwl_material_specs s where s.spec_code = 'SPEC-CLG-001' and s.tenant_id = v_tenant
  on conflict (spec_id, revision_no) do nothing;
  insert into public.dwl_material_specs (tenant_id, spec_code, resource_id, spec_name, discipline)
  select v_tenant, 'SPEC-CLG-003', r.id, 'MR Gypsum Wet Area System', 'Architectural'
  from public.dwl_resources r where r.code = 'M-CLG-003' and r.tenant_id = v_tenant
  on conflict (tenant_id, spec_code) do nothing;
  insert into public.dwl_material_spec_revisions
    (tenant_id, spec_id, revision_no, standard, grade, strength_performance, dimension,
     thickness, density, unit, manufacturer, brand, technical_req, installation_req,
     testing_req, approval_req, effective_date, status)
  select v_tenant, s.id, 'R01', 'EN 520 Type H1/H2', 'MR',
     'Moisture resistance', '1200x2400', '12.5 mm',
     '≈700 kg/m³', 'm2', 'Various', 'Various',
     'MR board, corrosion-resistant framing', 'Sealed joints, proper ventilation',
     'Moisture resistance test', 'Wet area approval',
     '2025-01-01', 'active'
  from public.dwl_material_specs s where s.spec_code = 'SPEC-CLG-003' and s.tenant_id = v_tenant
  on conflict (spec_id, revision_no) do nothing;
  insert into public.dwl_material_specs (tenant_id, spec_code, resource_id, spec_name, discipline)
  select v_tenant, 'SPEC-CLG-004', r.id, 'Fire Rated Ceiling System', 'Architectural'
  from public.dwl_resources r where r.code = 'M-CLG-004' and r.tenant_id = v_tenant
  on conflict (tenant_id, spec_code) do nothing;
  insert into public.dwl_material_spec_revisions
    (tenant_id, spec_id, revision_no, standard, grade, strength_performance, dimension,
     thickness, density, unit, manufacturer, brand, technical_req, installation_req,
     testing_req, approval_req, effective_date, status)
  select v_tenant, s.id, 'R01', 'EN 520 + Fire Test Report', 'FR',
     'EI 60 / EI 90 as specified', '1200x2400', '15–18 mm',
     '≈800 kg/m³', 'm2', 'Various', 'Various',
     'Fire-rated board + tested suspension system', 'Follow manufacturer fire test assembly',
     'Full scale fire test certificate', 'Fire authority / Consultant',
     '2025-01-01', 'active'
  from public.dwl_material_specs s where s.spec_code = 'SPEC-CLG-004' and s.tenant_id = v_tenant
  on conflict (spec_id, revision_no) do nothing;
  insert into public.dwl_material_specs (tenant_id, spec_code, resource_id, spec_name, discipline)
  select v_tenant, 'SPEC-CLG-006', r.id, 'Mineral Fiber Acoustic Tile on T-Grid', 'Architectural'
  from public.dwl_resources r where r.code = 'M-CLG-006' and r.tenant_id = v_tenant
  on conflict (tenant_id, spec_code) do nothing;
  insert into public.dwl_material_spec_revisions
    (tenant_id, spec_id, revision_no, standard, grade, strength_performance, dimension,
     thickness, density, unit, manufacturer, brand, technical_req, installation_req,
     testing_req, approval_req, effective_date, status)
  select v_tenant, s.id, 'R01', 'ASTM C635 / C636 / Local', 'Acoustic NRC 0.55–0.70',
     'NRC ≥ 0.55, CAC ≥ 30', '600x600 mm', '15–19 mm',
     '≈300–400 kg/m³', 'm2', 'Armstrong / Local', 'Armstrong / Equivalent',
     'Exposed or tegular edge, T24/T15 grid', 'Level grid, edge trim, hold-down clips if required',
     'Acoustic test report, fire rating', 'Architect approval of sample',
     '2025-01-01', 'active'
  from public.dwl_material_specs s where s.spec_code = 'SPEC-CLG-006' and s.tenant_id = v_tenant
  on conflict (spec_id, revision_no) do nothing;
  insert into public.dwl_material_specs (tenant_id, spec_code, resource_id, spec_name, discipline)
  select v_tenant, 'SPEC-CLG-007', r.id, 'Metal Lay-In Tile System', 'Architectural'
  from public.dwl_resources r where r.code = 'M-CLG-007' and r.tenant_id = v_tenant
  on conflict (tenant_id, spec_code) do nothing;
  insert into public.dwl_material_spec_revisions
    (tenant_id, spec_id, revision_no, standard, grade, strength_performance, dimension,
     thickness, density, unit, manufacturer, brand, technical_req, installation_req,
     testing_req, approval_req, effective_date, status)
  select v_tenant, s.id, 'R01', 'Local / Manufacturer std', 'Standard',
     'Load class as per grid', '600x600 / 600x1200', '0.5–0.7 mm',
     'Steel / Al', 'm2', 'Various', 'Various',
     'Powder coated or anodised finish, perforation optional', 'T-grid or proprietary carrier',
     'Finish sample, load test if required', 'Architect / Consultant',
     '2025-01-01', 'active'
  from public.dwl_material_specs s where s.spec_code = 'SPEC-CLG-007' and s.tenant_id = v_tenant
  on conflict (spec_id, revision_no) do nothing;
  insert into public.dwl_material_specs (tenant_id, spec_code, resource_id, spec_name, discipline)
  select v_tenant, 'SPEC-CLG-010', r.id, 'Aluminium Linear Strip Ceiling', 'Architectural'
  from public.dwl_resources r where r.code = 'M-CLG-010' and r.tenant_id = v_tenant
  on conflict (tenant_id, spec_code) do nothing;
  insert into public.dwl_material_spec_revisions
    (tenant_id, spec_id, revision_no, standard, grade, strength_performance, dimension,
     thickness, density, unit, manufacturer, brand, technical_req, installation_req,
     testing_req, approval_req, effective_date, status)
  select v_tenant, s.id, 'R01', 'Local / Manufacturer', 'Standard',
     'Deflection L/300', 'Various strip widths', '0.5–0.7 mm',
     'Aluminium', 'm2', 'Various', 'Various',
     'Anodised or powder coated, carrier system', 'Carrier spacing per manufacturer',
     'Finish sample', 'Architect approval',
     '2025-01-01', 'active'
  from public.dwl_material_specs s where s.spec_code = 'SPEC-CLG-010' and s.tenant_id = v_tenant
  on conflict (spec_id, revision_no) do nothing;
  insert into public.dwl_material_specs (tenant_id, spec_code, resource_id, spec_name, discipline)
  select v_tenant, 'SPEC-CLG-012', r.id, 'Aluminium Baffle / Vertical Fin Ceiling', 'Architectural'
  from public.dwl_resources r where r.code = 'M-CLG-012' and r.tenant_id = v_tenant
  on conflict (tenant_id, spec_code) do nothing;
  insert into public.dwl_material_spec_revisions
    (tenant_id, spec_id, revision_no, standard, grade, strength_performance, dimension,
     thickness, density, unit, manufacturer, brand, technical_req, installation_req,
     testing_req, approval_req, effective_date, status)
  select v_tenant, s.id, 'R01', 'Local / Manufacturer', 'Standard',
     'Acoustic optional', 'Various heights & spacing', '0.6–1.0 mm',
     'Aluminium', 'm2', 'Various', 'Various',
     'Vertical or horizontal baffles, independent suspension', 'Independent hangers, alignment critical',
     'Sample panel, acoustic data if required', 'Architect / Acoustic consultant',
     '2025-01-01', 'active'
  from public.dwl_material_specs s where s.spec_code = 'SPEC-CLG-012' and s.tenant_id = v_tenant
  on conflict (spec_id, revision_no) do nothing;
  insert into public.dwl_material_specs (tenant_id, spec_code, resource_id, spec_name, discipline)
  select v_tenant, 'SPEC-CLG-021', r.id, 'PVC / Fabric Stretch Membrane Ceiling', 'Architectural'
  from public.dwl_resources r where r.code = 'M-CLG-021' and r.tenant_id = v_tenant
  on conflict (tenant_id, spec_code) do nothing;
  insert into public.dwl_material_spec_revisions
    (tenant_id, spec_id, revision_no, standard, grade, strength_performance, dimension,
     thickness, density, unit, manufacturer, brand, technical_req, installation_req,
     testing_req, approval_req, effective_date, status)
  select v_tenant, s.id, 'R01', 'Manufacturer standard', 'Standard / Printed',
     'Light weight, seamless', 'Custom size', 'Membrane',
     'N/A', 'm2', 'Barrisol / Local', 'Barrisol / Equivalent',
     'Perimeter track, membrane tensioned', 'Trained installer only, temperature controlled',
     'Fire rating certificate, VOC', 'Architect / Client sample approval',
     '2025-01-01', 'active'
  from public.dwl_material_specs s where s.spec_code = 'SPEC-CLG-021' and s.tenant_id = v_tenant
  on conflict (spec_id, revision_no) do nothing;

  -- ── dwl_suppliers + dwl_supplier_profiles ──────────────────────────
  insert into public.dwl_suppliers (tenant_id, name, contact, rating, is_active)
  select v_tenant, 'Cambodia Building Materials Co., Ltd.', 'Sokha Chen', 'B', true
  where not exists (select 1 from public.dwl_suppliers where tenant_id = v_tenant and name = 'Cambodia Building Materials Co., Ltd.');
  insert into public.dwl_supplier_profiles
    (supplier_id, tenant_id, supplier_code, trading_name, supplier_type, contact_person, position,
     phone, email, address, country, province_city, website, payment_terms, delivery_terms,
     credit_terms, lead_time_days, reliability_rating, quality_rating, price_competitiveness,
     lifecycle_status, notes)
  select sup.id, v_tenant, 'SUP-001', 'CBM', 'Distributor',
     'Sokha Chen', 'Sales Manager', '+855 12 345 678', 'sokha@cbm.demo',
     'Phnom Penh Industrial Zone', 'Cambodia', 'Phnom Penh', 'www.cbm.demo',
     '30 days', 'FOB / Delivered', '30 days',
     7, '4', '4.3',
     '4.1', 'active', 'Main gypsum & metal ceiling supplier'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Cambodia Building Materials Co., Ltd.'
  on conflict (supplier_id) do nothing;
  insert into public.dwl_suppliers (tenant_id, name, contact, rating, is_active)
  select v_tenant, 'Asia Acoustic Solutions Pte Ltd', 'Li Wei', 'A', true
  where not exists (select 1 from public.dwl_suppliers where tenant_id = v_tenant and name = 'Asia Acoustic Solutions Pte Ltd');
  insert into public.dwl_supplier_profiles
    (supplier_id, tenant_id, supplier_code, trading_name, supplier_type, contact_person, position,
     phone, email, address, country, province_city, website, payment_terms, delivery_terms,
     credit_terms, lead_time_days, reliability_rating, quality_rating, price_competitiveness,
     lifecycle_status, notes)
  select sup.id, v_tenant, 'SUP-002', 'AAS', 'Specialist Supplier',
     'Li Wei', 'Regional Manager', '+65 6123 4567', 'liwei@aas.demo',
     'Singapore', 'Singapore', 'Singapore', 'www.aas.demo',
     '45 days', 'CIF Phnom Penh', '45 days',
     21, '4.4', '4.6',
     '3.8', 'active', 'Premium acoustic specialist'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Asia Acoustic Solutions Pte Ltd'
  on conflict (supplier_id) do nothing;
  insert into public.dwl_suppliers (tenant_id, name, contact, rating, is_active)
  select v_tenant, 'Indochina Metal Ceiling Systems', 'Nguyen Van A', 'B', true
  where not exists (select 1 from public.dwl_suppliers where tenant_id = v_tenant and name = 'Indochina Metal Ceiling Systems');
  insert into public.dwl_supplier_profiles
    (supplier_id, tenant_id, supplier_code, trading_name, supplier_type, contact_person, position,
     phone, email, address, country, province_city, website, payment_terms, delivery_terms,
     credit_terms, lead_time_days, reliability_rating, quality_rating, price_competitiveness,
     lifecycle_status, notes)
  select sup.id, v_tenant, 'SUP-003', 'IMCS', 'Manufacturer / Distributor',
     'Nguyen Van A', 'Commercial Director', '+84 28 1234 5678', 'nguyen@imcs.demo',
     'Ho Chi Minh City', 'Vietnam', 'HCMC', 'www.imcs.demo',
     '30 days', 'Delivered site', '30 days',
     14, '3.9', '4.1',
     '4.3', 'active', 'Competitive metal ceiling systems'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
  on conflict (supplier_id) do nothing;
  insert into public.dwl_suppliers (tenant_id, name, contact, rating, is_active)
  select v_tenant, 'Premium Interior Finishes (Cambodia)', 'Srey Pich', 'B', true
  where not exists (select 1 from public.dwl_suppliers where tenant_id = v_tenant and name = 'Premium Interior Finishes (Cambodia)');
  insert into public.dwl_supplier_profiles
    (supplier_id, tenant_id, supplier_code, trading_name, supplier_type, contact_person, position,
     phone, email, address, country, province_city, website, payment_terms, delivery_terms,
     credit_terms, lead_time_days, reliability_rating, quality_rating, price_competitiveness,
     lifecycle_status, notes)
  select sup.id, v_tenant, 'SUP-004', 'PIF', 'Local Supplier',
     'Srey Pich', 'Owner', '+855 98 765 432', 'pich@pif.demo',
     'Siem Reap / Phnom Penh', 'Cambodia', 'Phnom Penh', null,
     '15 days', 'Delivered', 'COD / 15 days',
     5, '3.7', '3.9',
     '4.2', 'active', 'Local specialist for specialty ceilings'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Premium Interior Finishes (Cambodia)'
  on conflict (supplier_id) do nothing;
  insert into public.dwl_suppliers (tenant_id, name, contact, rating, is_active)
  select v_tenant, 'Global Ceiling Systems Asia', 'James Tan', 'B', true
  where not exists (select 1 from public.dwl_suppliers where tenant_id = v_tenant and name = 'Global Ceiling Systems Asia');
  insert into public.dwl_supplier_profiles
    (supplier_id, tenant_id, supplier_code, trading_name, supplier_type, contact_person, position,
     phone, email, address, country, province_city, website, payment_terms, delivery_terms,
     credit_terms, lead_time_days, reliability_rating, quality_rating, price_competitiveness,
     lifecycle_status, notes)
  select sup.id, v_tenant, 'SUP-005', 'GCS', 'Importer / Distributor',
     'James Tan', 'Sales Director', '+66 2 123 4567', 'james@gcs.demo',
     'Bangkok', 'Thailand', 'Bangkok', 'www.gcs.demo',
     '30–45 days', 'CIF / DDP', '30 days',
     18, '4.2', '4.4',
     '3.9', 'active', 'Broad range international brands'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Global Ceiling Systems Asia'
  on conflict (supplier_id) do nothing;
  insert into public.dwl_suppliers (tenant_id, name, contact, rating, is_active)
  select v_tenant, 'Khmer Gypsum & Board Supply', 'Vannak Meas', 'B', true
  where not exists (select 1 from public.dwl_suppliers where tenant_id = v_tenant and name = 'Khmer Gypsum & Board Supply');
  insert into public.dwl_supplier_profiles
    (supplier_id, tenant_id, supplier_code, trading_name, supplier_type, contact_person, position,
     phone, email, address, country, province_city, website, payment_terms, delivery_terms,
     credit_terms, lead_time_days, reliability_rating, quality_rating, price_competitiveness,
     lifecycle_status, notes)
  select sup.id, v_tenant, 'SUP-006', 'KGBS', 'Local Supplier',
     'Vannak Meas', 'Manager', '+855 16 111 222', 'vannak@kgbs.demo',
     'Phnom Penh', 'Cambodia', 'Phnom Penh', null,
     '7–14 days', 'Delivered', '14 days',
     3, '4', '3.8',
     '4.4', 'active', 'Competitive local gypsum supply'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Khmer Gypsum & Board Supply'
  on conflict (supplier_id) do nothing;
  insert into public.dwl_suppliers (tenant_id, name, contact, rating, is_active)
  select v_tenant, 'Acoustic Design & Supply Co.', 'Maria Santos', 'B', true
  where not exists (select 1 from public.dwl_suppliers where tenant_id = v_tenant and name = 'Acoustic Design & Supply Co.');
  insert into public.dwl_supplier_profiles
    (supplier_id, tenant_id, supplier_code, trading_name, supplier_type, contact_person, position,
     phone, email, address, country, province_city, website, payment_terms, delivery_terms,
     credit_terms, lead_time_days, reliability_rating, quality_rating, price_competitiveness,
     lifecycle_status, notes)
  select sup.id, v_tenant, 'SUP-007', 'ADS', 'Specialist Supplier',
     'Maria Santos', 'Technical Sales', '+63 2 8123 4567', 'maria@ads.demo',
     'Manila', 'Philippines', 'Manila', 'www.ads.demo',
     '45 days', 'CIF', '45 days',
     25, '4.3', '4.5',
     '3.7', 'active', 'High-end acoustic solutions'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Acoustic Design & Supply Co.'
  on conflict (supplier_id) do nothing;
  insert into public.dwl_suppliers (tenant_id, name, contact, rating, is_active)
  select v_tenant, 'Steel & Aluminium Fabricators Cambodia', 'Rithy Sok', 'B', true
  where not exists (select 1 from public.dwl_suppliers where tenant_id = v_tenant and name = 'Steel & Aluminium Fabricators Cambodia');
  insert into public.dwl_supplier_profiles
    (supplier_id, tenant_id, supplier_code, trading_name, supplier_type, contact_person, position,
     phone, email, address, country, province_city, website, payment_terms, delivery_terms,
     credit_terms, lead_time_days, reliability_rating, quality_rating, price_competitiveness,
     lifecycle_status, notes)
  select sup.id, v_tenant, 'SUP-008', 'SAFC', 'Manufacturer',
     'Rithy Sok', 'Production Manager', '+855 12 999 888', 'rithy@safc.demo',
     'Phnom Penh outskirts', 'Cambodia', 'Kandal', null,
     '21 days', 'Ex-works / Delivered', '30 days',
     10, '3.6', '3.8',
     '4.5', 'active', 'Local fabrication capability'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Steel & Aluminium Fabricators Cambodia'
  on conflict (supplier_id) do nothing;
  insert into public.dwl_suppliers (tenant_id, name, contact, rating, is_active)
  select v_tenant, 'EuroCeil International', 'Hans Mueller', 'A', true
  where not exists (select 1 from public.dwl_suppliers where tenant_id = v_tenant and name = 'EuroCeil International');
  insert into public.dwl_supplier_profiles
    (supplier_id, tenant_id, supplier_code, trading_name, supplier_type, contact_person, position,
     phone, email, address, country, province_city, website, payment_terms, delivery_terms,
     credit_terms, lead_time_days, reliability_rating, quality_rating, price_competitiveness,
     lifecycle_status, notes)
  select sup.id, v_tenant, 'SUP-009', 'EuroCeil', 'Importer',
     'Hans Mueller', 'Asia Manager', '+49 30 123456', 'hans@euroceil.demo',
     'Germany / Singapore hub', 'Germany', 'Berlin / SG', 'www.euroceil.demo',
     '60 days', 'CIF', '60 days',
     35, '4.5', '4.7',
     '3.5', 'active', 'European premium systems'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'EuroCeil International'
  on conflict (supplier_id) do nothing;
  insert into public.dwl_suppliers (tenant_id, name, contact, rating, is_active)
  select v_tenant, 'Local Fit-Out Materials Trading', 'Dara Kim', 'B', true
  where not exists (select 1 from public.dwl_suppliers where tenant_id = v_tenant and name = 'Local Fit-Out Materials Trading');
  insert into public.dwl_supplier_profiles
    (supplier_id, tenant_id, supplier_code, trading_name, supplier_type, contact_person, position,
     phone, email, address, country, province_city, website, payment_terms, delivery_terms,
     credit_terms, lead_time_days, reliability_rating, quality_rating, price_competitiveness,
     lifecycle_status, notes)
  select sup.id, v_tenant, 'SUP-010', 'LFMT', 'General Supplier',
     'Dara Kim', 'Sales', '+855 77 333 444', 'dara@lfmt.demo',
     'Phnom Penh', 'Cambodia', 'Phnom Penh', null,
     'COD / 7 days', 'Pickup / Delivered', 'COD',
     2, '3.4', '3.5',
     '4.6', 'active', 'Fast local supply for small quantities'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Local Fit-Out Materials Trading'
  on conflict (supplier_id) do nothing;

  -- ── dwl_supplier_materials ─────────────────────────────────────────
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'CBM-GYP-SUS-12.5', 'Standard Gypsum Suspended System',
     'CBM', 'Local / Import', 'SPEC-CL-001-R01',
     'Sheet / m²', 200, 7,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Cambodia Building Materials Co., Ltd.'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-001'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'CBM-GYP-MR-12.5', 'MR Gypsum Ceiling System',
     'CBM', 'Local / Import', 'SPEC-CL-003-R01',
     'Sheet / m²', 150, 7,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Cambodia Building Materials Co., Ltd.'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-003'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'CBM-MF-600', 'Mineral Fiber 600x600',
     'Local brand', 'Local', 'SPEC-CL-006-R01',
     'Carton 10 pcs', 100, 5,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Cambodia Building Materials Co., Ltd.'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-006'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'AAS-ARM-FINE', 'Armstrong Fine Fissured',
     'Armstrong', 'Armstrong', 'SPEC-CL-006-R01',
     'Carton', 1, 21,
     true, 'Premium line'
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Asia Acoustic Solutions Pte Ltd'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-006'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'AAS-WOOD-AC', 'Acoustic Wood Panel System',
     'AAS', 'AAS', null,
     'Panel', null, 28,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Asia Acoustic Solutions Pte Ltd'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-019'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'AAS-CLOUD', 'Acoustic Cloud Panels',
     'AAS', 'AAS', null,
     'No. / m²', null, 30,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Asia Acoustic Solutions Pte Ltd'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-023'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'IMCS-LAY-600', 'Metal Lay-In 600x600',
     'IMCS', 'IMCS', 'SPEC-CL-007-R01',
     'm²', 300, 14,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-007'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'IMCS-CLIP', 'Clip-In Metal Panel',
     'IMCS', 'IMCS', null,
     'm²', 400, 14,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-008'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'IMCS-LIN-100', 'Aluminium Linear 100mm',
     'IMCS', 'IMCS', 'SPEC-CL-010-R01',
     'm²', 250, 14,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-010'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'IMCS-BAF-150', 'Aluminium Baffle 150H',
     'IMCS', 'IMCS', 'SPEC-CL-012-R01',
     'm²', 200, 18,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-012'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'PIF-PVC-250', 'PVC Interlocking Panel 250mm',
     'PIF', 'Local', null,
     'm²', 100, 5,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Premium Interior Finishes (Cambodia)'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-016'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'PIF-STRETCH', 'Stretch Ceiling Membrane',
     'Local / Import', 'Various', 'SPEC-CL-021-R01',
     'm²', null, 10,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Premium Interior Finishes (Cambodia)'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-021'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'GCS-METAL-L', 'Global Metal Lay-In',
     'GCS brand', 'Various', 'SPEC-CL-007-R01',
     'm²', 500, 18,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Global Ceiling Systems Asia'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-007'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'GCS-BAFFLE', 'Global Baffle System',
     'GCS', 'Various', 'SPEC-CL-012-R01',
     'm²', 300, 21,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Global Ceiling Systems Asia'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-012'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'KGBS-GYP-STD', 'Standard Gypsum Board System',
     'KGBS', 'Local import', 'SPEC-CL-001-R01',
     'm²', 100, 3,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Khmer Gypsum & Board Supply'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-001'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'KGBS-CEM-8', 'Cement Board 8mm Ceiling',
     'KGBS', 'Local', null,
     'm²', 80, 4,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Khmer Gypsum & Board Supply'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-005'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'SAFC-OPEN-50', 'Open Cell 50x50',
     'SAFC', 'SAFC', null,
     'm²', null, 12,
     true, 'Custom fabrication'
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Steel & Aluminium Fabricators Cambodia'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-014'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'SAFC-EXP', 'Expanded Metal Panel',
     'SAFC', 'SAFC', null,
     'm²', null, 10,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'Steel & Aluminium Fabricators Cambodia'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-015'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'EC-LINEAR-PREM', 'EuroCeil Premium Linear',
     'EuroCeil', 'EuroCeil', 'SPEC-CL-010-R01',
     'm²', 1, 35,
     true, 'Premium'
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'EuroCeil International'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-010'
  on conflict (supplier_id, resource_id) do nothing;
  insert into public.dwl_supplier_materials
    (tenant_id, supplier_id, resource_id, supplier_product_code, supplier_product_name,
     brand, manufacturer, specification, package_size, moq, lead_time_days, is_active, notes)
  select v_tenant, sup.id, r.id, 'EC-STRETCH', 'EuroCeil Stretch System',
     'EuroCeil', 'EuroCeil', 'SPEC-CL-021-R01',
     'm²', null, 40,
     true, null
  from public.dwl_suppliers sup, public.dwl_resources r
  where sup.tenant_id = v_tenant and sup.name = 'EuroCeil International'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-021'
  on conflict (supplier_id, resource_id) do nothing;
end $$;
