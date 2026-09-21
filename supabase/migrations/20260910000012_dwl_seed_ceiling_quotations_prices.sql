-- Migration: 20260910000012_dwl_seed_ceiling_quotations_prices.sql
-- Purpose: 5 quotations (+ 9 items), 33 approved price rows, 2 in-workflow submissions (PRC-0007, PRC-0025).
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

  -- ── dwl_quotations ────────────────────────────────────────────────
  insert into public.dwl_quotations
    (tenant_id, quote_no, supplier_id, project_code, rfq_ref, quote_date, valid_until, currency,
     payment_terms, delivery_terms, contact_person, source_document, status, notes)
  select v_tenant, 'QT-2026-001', sup.id, 'PRJ-2026-001', 'RFQ-2026-015',
     '2026-01-10', '2026-02-10', 'USD',
     '30 days', 'Delivered site Phnom Penh', 'Sokha Chen',
     'QT-2026-001.pdf', 'approved', 'Gypsum package'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Cambodia Building Materials Co., Ltd.'
  on conflict (tenant_id, quote_no) do nothing;
  insert into public.dwl_quotations
    (tenant_id, quote_no, supplier_id, project_code, rfq_ref, quote_date, valid_until, currency,
     payment_terms, delivery_terms, contact_person, source_document, status, notes)
  select v_tenant, 'QT-2026-002', sup.id, 'PRJ-2026-001', 'RFQ-2026-016',
     '2026-02-20', '2026-03-20', 'USD',
     '30 days', 'Delivered site', 'Nguyen Van A',
     'QT-2026-002.pdf', 'approved', 'Metal ceilings'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
  on conflict (tenant_id, quote_no) do nothing;
  insert into public.dwl_quotations
    (tenant_id, quote_no, supplier_id, project_code, rfq_ref, quote_date, valid_until, currency,
     payment_terms, delivery_terms, contact_person, source_document, status, notes)
  select v_tenant, 'QT-2026-003', sup.id, 'PRJ-2026-002', 'RFQ-2026-020',
     '2026-03-15', '2026-04-15', 'USD',
     '45 days', 'CIF Phnom Penh', 'Li Wei',
     'QT-2026-003.pdf', 'approved', 'Acoustic package'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Asia Acoustic Solutions Pte Ltd'
  on conflict (tenant_id, quote_no) do nothing;
  insert into public.dwl_quotations
    (tenant_id, quote_no, supplier_id, project_code, rfq_ref, quote_date, valid_until, currency,
     payment_terms, delivery_terms, contact_person, source_document, status, notes)
  select v_tenant, 'QT-2026-004', sup.id, 'PRJ-2026-001', 'RFQ-2026-016',
     '2026-04-05', '2026-05-05', 'USD',
     '30 days', 'DDP', 'James Tan',
     'QT-2026-004.pdf', 'under_review', 'Alternative metal offer'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Global Ceiling Systems Asia'
  on conflict (tenant_id, quote_no) do nothing;
  insert into public.dwl_quotations
    (tenant_id, quote_no, supplier_id, project_code, rfq_ref, quote_date, valid_until, currency,
     payment_terms, delivery_terms, contact_person, source_document, status, notes)
  select v_tenant, 'QT-2026-005', sup.id, 'PRJ-2026-003', 'RFQ-2026-025',
     '2026-04-12', '2026-05-12', 'USD',
     '15 days', 'Delivered', 'Srey Pich',
     'QT-2026-005.pdf', 'approved', 'PVC + Stretch'
  from public.dwl_suppliers sup where sup.tenant_id = v_tenant and sup.name = 'Premium Interior Finishes (Cambodia)'
  on conflict (tenant_id, quote_no) do nothing;

  -- ── dwl_quotation_items ───────────────────────────────────────────
  insert into public.dwl_quotation_items
    (tenant_id, quotation_id, line_no, resource_id, supplier_product_code, description, spec_ref,
     quantity, unit, unit_price, discount, delivery, tax, lead_time_days, remarks)
  select v_tenant, qh.id, 1, r.id, 'CBM-GYP-SUS-12.5',
     'Standard gypsum suspended system complete', 'SPEC-CL-001-R01', 1200, 'm2',
     9.8, 0, 1, 0.98,
     7, 'Including hangers & perimeter'
  from public.dwl_quotations qh, public.dwl_resources r
  where qh.tenant_id = v_tenant and qh.quote_no = 'QT-2026-001'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-001'
  on conflict (quotation_id, line_no) do nothing;
  insert into public.dwl_quotation_items
    (tenant_id, quotation_id, line_no, resource_id, supplier_product_code, description, spec_ref,
     quantity, unit, unit_price, discount, delivery, tax, lead_time_days, remarks)
  select v_tenant, qh.id, 2, r.id, 'CBM-GYP-MR-12.5',
     'MR gypsum for wet areas', 'SPEC-CL-003-R01', 180, 'm2',
     11.2, 0, 1.1, 1.12,
     7, 'Toilets & pantry'
  from public.dwl_quotations qh, public.dwl_resources r
  where qh.tenant_id = v_tenant and qh.quote_no = 'QT-2026-001'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-003'
  on conflict (quotation_id, line_no) do nothing;
  insert into public.dwl_quotation_items
    (tenant_id, quotation_id, line_no, resource_id, supplier_product_code, description, spec_ref,
     quantity, unit, unit_price, discount, delivery, tax, lead_time_days, remarks)
  select v_tenant, qh.id, 1, r.id, 'IMCS-LAY-600',
     'Metal lay-in 600x600 powder coated', 'SPEC-CL-007-R01', 700, 'm2',
     25, 0, 1.8, 2.5,
     14, null
  from public.dwl_quotations qh, public.dwl_resources r
  where qh.tenant_id = v_tenant and qh.quote_no = 'QT-2026-002'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-007'
  on conflict (quotation_id, line_no) do nothing;
  insert into public.dwl_quotation_items
    (tenant_id, quotation_id, line_no, resource_id, supplier_product_code, description, spec_ref,
     quantity, unit, unit_price, discount, delivery, tax, lead_time_days, remarks)
  select v_tenant, qh.id, 2, r.id, 'IMCS-LIN-100',
     'Aluminium linear 100mm', 'SPEC-CL-010-R01', 450, 'm2',
     32, 0, 2.5, 3.2,
     14, 'Lobby areas'
  from public.dwl_quotations qh, public.dwl_resources r
  where qh.tenant_id = v_tenant and qh.quote_no = 'QT-2026-002'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-010'
  on conflict (quotation_id, line_no) do nothing;
  insert into public.dwl_quotation_items
    (tenant_id, quotation_id, line_no, resource_id, supplier_product_code, description, spec_ref,
     quantity, unit, unit_price, discount, delivery, tax, lead_time_days, remarks)
  select v_tenant, qh.id, 1, r.id, 'AAS-ARM-FINE',
     'Armstrong Fine Fissured', 'SPEC-CL-006-R01', 300, 'm2',
     20.8, 0, 3, 0,
     21, 'Import'
  from public.dwl_quotations qh, public.dwl_resources r
  where qh.tenant_id = v_tenant and qh.quote_no = 'QT-2026-003'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-006'
  on conflict (quotation_id, line_no) do nothing;
  insert into public.dwl_quotation_items
    (tenant_id, quotation_id, line_no, resource_id, supplier_product_code, description, spec_ref,
     quantity, unit, unit_price, discount, delivery, tax, lead_time_days, remarks)
  select v_tenant, qh.id, 2, r.id, 'AAS-CLOUD',
     'Acoustic cloud panels', null, 80, 'no',
     185, 0, 15, 0,
     30, 'Custom shapes'
  from public.dwl_quotations qh, public.dwl_resources r
  where qh.tenant_id = v_tenant and qh.quote_no = 'QT-2026-003'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-023'
  on conflict (quotation_id, line_no) do nothing;
  insert into public.dwl_quotation_items
    (tenant_id, quotation_id, line_no, resource_id, supplier_product_code, description, spec_ref,
     quantity, unit, unit_price, discount, delivery, tax, lead_time_days, remarks)
  select v_tenant, qh.id, 1, r.id, 'GCS-METAL-L',
     'Global Metal Lay-In alternative', 'SPEC-CL-007-R01', 700, 'm2',
     28, 1, 2.5, 0,
     18, 'Under review'
  from public.dwl_quotations qh, public.dwl_resources r
  where qh.tenant_id = v_tenant and qh.quote_no = 'QT-2026-004'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-007'
  on conflict (quotation_id, line_no) do nothing;
  insert into public.dwl_quotation_items
    (tenant_id, quotation_id, line_no, resource_id, supplier_product_code, description, spec_ref,
     quantity, unit, unit_price, discount, delivery, tax, lead_time_days, remarks)
  select v_tenant, qh.id, 1, r.id, 'PIF-PVC-250',
     'PVC interlocking 250mm', null, 600, 'm2',
     7, 0, 0.5, 0.7,
     5, null
  from public.dwl_quotations qh, public.dwl_resources r
  where qh.tenant_id = v_tenant and qh.quote_no = 'QT-2026-005'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-016'
  on conflict (quotation_id, line_no) do nothing;
  insert into public.dwl_quotation_items
    (tenant_id, quotation_id, line_no, resource_id, supplier_product_code, description, spec_ref,
     quantity, unit, unit_price, discount, delivery, tax, lead_time_days, remarks)
  select v_tenant, qh.id, 2, r.id, 'PIF-STRETCH',
     'Stretch membrane system', 'SPEC-CL-021-R01', 200, 'm2',
     48, 0, 3.5, 4.8,
     10, 'Lobby feature'
  from public.dwl_quotations qh, public.dwl_resources r
  where qh.tenant_id = v_tenant and qh.quote_no = 'QT-2026-005'
    and r.tenant_id = v_tenant and r.code = 'M-CLG-021'
  on conflict (quotation_id, line_no) do nothing;

  -- ── dwl_resource_prices (approved) + dwl_price_submissions (in workflow) ──
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 8.5, 'USD', '2024-03-15', null, 'quotation', 'Phnom Penh', 800, 0, 0.8, 0, 0, 0.85, '30 days', 'Delivered site', 7, 'QT-2024-001', null, '2024-03-15', 'Seed PRC-0001 — Basis: fictional demo quotation QT-2024-001 (2024-03-15); ceiling template import.', 'approved', '2024-03-15'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Cambodia Building Materials Co., Ltd.'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-001'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0001 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 8.2, 'USD', '2024-04-02', null, 'quotation', 'Phnom Penh', 600, 0, 0.6, 0, 0, 0.82, '30 days', 'Delivered site', 7, 'QT-2024-002', null, '2024-04-02', 'Seed PRC-0002 — Basis: fictional demo quotation QT-2024-002 (2024-04-02); ceiling template import.', 'approved', '2024-04-02'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Khmer Gypsum & Board Supply'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-001'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0002 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 9.1, 'USD', '2025-02-20', null, 'quotation', 'Phnom Penh', 1000, 0, 0.9, 0, 0, 0.91, '30 days', 'Delivered site', 7, 'QT-2025-003', null, '2025-02-20', 'Seed PRC-0003 — Basis: fictional demo quotation QT-2025-003 (2025-02-20); ceiling template import.', 'approved', '2025-02-20'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Cambodia Building Materials Co., Ltd.'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-001'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0003 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 8.8, 'USD', '2025-03-10', null, 'quotation', 'Phnom Penh', 750, 0, 0.7, 0, 0, 0.88, '30 days', 'Delivered site', 7, 'QT-2025-004', null, '2025-03-10', 'Seed PRC-0004 — Basis: fictional demo quotation QT-2025-004 (2025-03-10); ceiling template import.', 'approved', '2025-03-10'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Khmer Gypsum & Board Supply'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-001'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0004 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 9.8, 'USD', '2026-01-15', null, 'quotation', 'Phnom Penh', 1200, 0, 1, 0, 0, 0.98, '30 days', 'Delivered site', 7, 'QT-2026-005', null, '2026-01-15', 'Seed PRC-0005 — Basis: fictional demo quotation QT-2026-005 (2026-01-15); ceiling template import.', 'approved', '2026-01-15'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Cambodia Building Materials Co., Ltd.'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-001'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0005 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 9.4, 'USD', '2026-02-05', null, 'quotation', 'Phnom Penh', 900, 0, 0.8, 0, 0, 0.94, '30 days', 'Delivered site', 7, 'QT-2026-006', null, '2026-02-05', 'Seed PRC-0006 — Basis: fictional demo quotation QT-2026-006 (2026-02-05); ceiling template import.', 'approved', '2026-02-05'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Khmer Gypsum & Board Supply'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-001'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0006 %');
  insert into public.dwl_price_submissions
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, status, submitted_at, verified_at)
  select v_tenant, r.id, sup.id, 9.2, 'USD', '2026-06-12', null, 'quotation', 'Phnom Penh', 400, 0, 0.5, 0, 0, 0.92, '30 days', 'Delivered site', 7, 'QT-2026-007', null, '2026-06-12', 'Seed PRC-0007 — Basis: fictional demo quotation QT-2026-007 (2026-06-12); ceiling template import.', 'verified', now(), now()
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Local Fit-Out Materials Trading'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-001'
    and not exists (select 1 from public.dwl_price_submissions s
                    where s.tenant_id = v_tenant and s.resource_id = r.id and s.notes like 'Seed PRC-0007 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 12.5, 'USD', '2024-05-10', null, 'quotation', 'Phnom Penh', 600, 0, 1.2, 0, 0, 1.25, '30 days', 'Delivered site', 7, 'QT-2024-008', null, '2024-05-10', 'Seed PRC-0008 — Basis: fictional demo quotation QT-2024-008 (2024-05-10); ceiling template import.', 'approved', '2024-05-10'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Cambodia Building Materials Co., Ltd.'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-006'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0008 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 18, 'USD', '2024-06-18', null, 'quotation', 'Phnom Penh', 400, 0, 2.5, 0, 0, 0, '30 days', 'Delivered site', 7, 'QT-2024-009', null, '2024-06-18', 'Seed PRC-0009 — Basis: fictional demo quotation QT-2024-009 (2024-06-18); ceiling template import.', 'approved', '2024-06-18'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Asia Acoustic Solutions Pte Ltd'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-006'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0009 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 13.2, 'USD', '2025-04-22', null, 'quotation', 'Phnom Penh', 700, 0, 1.3, 0, 0, 1.32, '30 days', 'Delivered site', 7, 'QT-2025-010', null, '2025-04-22', 'Seed PRC-0010 — Basis: fictional demo quotation QT-2025-010 (2025-04-22); ceiling template import.', 'approved', '2025-04-22'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Cambodia Building Materials Co., Ltd.'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-006'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0010 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 19.5, 'USD', '2025-05-30', null, 'quotation', 'Phnom Penh', 350, 0, 2.8, 0, 0, 0, '30 days', 'Delivered site', 7, 'QT-2025-011', null, '2025-05-30', 'Seed PRC-0011 — Basis: fictional demo quotation QT-2025-011 (2025-05-30); ceiling template import.', 'approved', '2025-05-30'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Asia Acoustic Solutions Pte Ltd'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-006'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0011 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 14, 'USD', '2026-03-08', null, 'quotation', 'Phnom Penh', 800, 0, 1.4, 0, 0, 1.4, '30 days', 'Delivered site', 7, 'QT-2026-012', null, '2026-03-08', 'Seed PRC-0012 — Basis: fictional demo quotation QT-2026-012 (2026-03-08); ceiling template import.', 'approved', '2026-03-08'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Cambodia Building Materials Co., Ltd.'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-006'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0012 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 20.8, 'USD', '2026-04-15', null, 'quotation', 'Phnom Penh', 300, 0, 3, 0, 0, 0, '30 days', 'Delivered site', 7, 'QT-2026-013', null, '2026-04-15', 'Seed PRC-0013 — Basis: fictional demo quotation QT-2026-013 (2026-04-15); ceiling template import.', 'approved', '2026-04-15'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Asia Acoustic Solutions Pte Ltd'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-006'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0013 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 22, 'USD', '2024-07-12', null, 'quotation', 'Phnom Penh', 500, 0, 1.5, 0, 0, 2.2, '30 days', 'Delivered site', 7, 'QT-2024-014', null, '2024-07-12', 'Seed PRC-0014 — Basis: fictional demo quotation QT-2024-014 (2024-07-12); ceiling template import.', 'approved', '2024-07-12'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-007'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0014 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 25.5, 'USD', '2024-08-20', null, 'quotation', 'Phnom Penh', 400, 0, 2, 0, 0, 0, '30 days', 'Delivered site', 7, 'QT-2024-015', null, '2024-08-20', 'Seed PRC-0015 — Basis: fictional demo quotation QT-2024-015 (2024-08-20); ceiling template import.', 'approved', '2024-08-20'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Global Ceiling Systems Asia'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-007'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0015 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 23.5, 'USD', '2025-06-05', null, 'quotation', 'Phnom Penh', 600, 0, 1.6, 0, 0, 2.35, '30 days', 'Delivered site', 7, 'QT-2025-016', null, '2025-06-05', 'Seed PRC-0016 — Basis: fictional demo quotation QT-2025-016 (2025-06-05); ceiling template import.', 'approved', '2025-06-05'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-007'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0016 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 26.8, 'USD', '2025-07-18', null, 'quotation', 'Phnom Penh', 450, 0, 2.2, 0, 0, 0, '30 days', 'Delivered site', 7, 'QT-2025-017', null, '2025-07-18', 'Seed PRC-0017 — Basis: fictional demo quotation QT-2025-017 (2025-07-18); ceiling template import.', 'approved', '2025-07-18'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Global Ceiling Systems Asia'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-007'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0017 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 25, 'USD', '2026-02-28', null, 'quotation', 'Phnom Penh', 700, 0, 1.8, 0, 0, 2.5, '30 days', 'Delivered site', 7, 'QT-2026-018', null, '2026-02-28', 'Seed PRC-0018 — Basis: fictional demo quotation QT-2026-018 (2026-02-28); ceiling template import.', 'approved', '2026-02-28'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-007'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0018 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 28, 'USD', '2026-05-10', null, 'quotation', 'Phnom Penh', 500, 0, 2.5, 0, 0, 0, '30 days', 'Delivered site', 7, 'QT-2026-019', null, '2026-05-10', 'Seed PRC-0019 — Basis: fictional demo quotation QT-2026-019 (2026-05-10); ceiling template import.', 'approved', '2026-05-10'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Global Ceiling Systems Asia'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-007'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0019 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 28, 'USD', '2024-09-05', null, 'quotation', 'Phnom Penh', 300, 0, 2, 0, 0, 2.8, '30 days', 'Delivered site', 7, 'QT-2024-020', null, '2024-09-05', 'Seed PRC-0020 — Basis: fictional demo quotation QT-2024-020 (2024-09-05); ceiling template import.', 'approved', '2024-09-05'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-010'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0020 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 42, 'USD', '2024-10-15', null, 'quotation', 'Phnom Penh', 250, 0, 4.5, 0, 0, 0, '30 days', 'Delivered site', 7, 'QT-2024-021', null, '2024-10-15', 'Seed PRC-0021 — Basis: fictional demo quotation QT-2024-021 (2024-10-15); ceiling template import.', 'approved', '2024-10-15'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'EuroCeil International'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-010'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0021 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 30.5, 'USD', '2025-08-12', null, 'quotation', 'Phnom Penh', 400, 0, 2.2, 0, 0, 3.05, '30 days', 'Delivered site', 7, 'QT-2025-022', null, '2025-08-12', 'Seed PRC-0022 — Basis: fictional demo quotation QT-2025-022 (2025-08-12); ceiling template import.', 'approved', '2025-08-12'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-010'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0022 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 45, 'USD', '2025-09-20', null, 'quotation', 'Phnom Penh', 200, 0, 5, 0, 0, 0, '30 days', 'Delivered site', 7, 'QT-2025-023', null, '2025-09-20', 'Seed PRC-0023 — Basis: fictional demo quotation QT-2025-023 (2025-09-20); ceiling template import.', 'approved', '2025-09-20'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'EuroCeil International'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-010'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0023 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 32, 'USD', '2026-04-02', null, 'quotation', 'Phnom Penh', 450, 0, 2.5, 0, 0, 3.2, '30 days', 'Delivered site', 7, 'QT-2026-024', null, '2026-04-02', 'Seed PRC-0024 — Basis: fictional demo quotation QT-2026-024 (2026-04-02); ceiling template import.', 'approved', '2026-04-02'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-010'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0024 %');
  insert into public.dwl_price_submissions
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, status, submitted_at, verified_at)
  select v_tenant, r.id, sup.id, 48, 'USD', '2026-06-25', null, 'quotation', 'Phnom Penh', 180, 0, 5.5, 0, 0, 0, '30 days', 'Delivered site', 7, 'QT-2026-025', null, '2026-06-25', 'Seed PRC-0025 — Basis: fictional demo quotation QT-2026-025 (2026-06-25); ceiling template import.', 'verified', now(), now()
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'EuroCeil International'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-010'
    and not exists (select 1 from public.dwl_price_submissions s
                    where s.tenant_id = v_tenant and s.resource_id = r.id and s.notes like 'Seed PRC-0025 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 35, 'USD', '2025-01-20', null, 'quotation', 'Phnom Penh', 250, 0, 2.8, 0, 0, 3.5, '30 days', 'Delivered site', 7, 'QT-2025-026', null, '2025-01-20', 'Seed PRC-0026 — Basis: fictional demo quotation QT-2025-026 (2025-01-20); ceiling template import.', 'approved', '2025-01-20'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-012'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0026 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 38.5, 'USD', '2025-03-15', null, 'quotation', 'Phnom Penh', 200, 0, 3.2, 0, 0, 0, '30 days', 'Delivered site', 7, 'QT-2025-027', null, '2025-03-15', 'Seed PRC-0027 — Basis: fictional demo quotation QT-2025-027 (2025-03-15); ceiling template import.', 'approved', '2025-03-15'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Global Ceiling Systems Asia'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-012'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0027 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 37.5, 'USD', '2026-01-10', null, 'quotation', 'Phnom Penh', 350, 0, 3, 0, 0, 3.75, '30 days', 'Delivered site', 7, 'QT-2026-028', null, '2026-01-10', 'Seed PRC-0028 — Basis: fictional demo quotation QT-2026-028 (2026-01-10); ceiling template import.', 'approved', '2026-01-10'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Indochina Metal Ceiling Systems'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-012'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0028 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 41, 'USD', '2026-03-22', null, 'quotation', 'Phnom Penh', 280, 0, 3.5, 0, 0, 0, '30 days', 'Delivered site', 7, 'QT-2026-029', null, '2026-03-22', 'Seed PRC-0029 — Basis: fictional demo quotation QT-2026-029 (2026-03-22); ceiling template import.', 'approved', '2026-03-22'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Global Ceiling Systems Asia'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-012'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0029 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 6.5, 'USD', '2024-11-08', null, 'quotation', 'Phnom Penh', 500, 0, 0.4, 0, 0, 0.65, '30 days', 'Delivered site', 7, 'QT-2024-030', null, '2024-11-08', 'Seed PRC-0030 — Basis: fictional demo quotation QT-2024-030 (2024-11-08); ceiling template import.', 'approved', '2024-11-08'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Premium Interior Finishes (Cambodia)'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-016'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0030 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 6.2, 'USD', '2025-02-14', null, 'quotation', 'Phnom Penh', 400, 0, 0.3, 0, 0, 0.62, '30 days', 'Delivered site', 7, 'QT-2025-031', null, '2025-02-14', 'Seed PRC-0031 — Basis: fictional demo quotation QT-2025-031 (2025-02-14); ceiling template import.', 'approved', '2025-02-14'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Local Fit-Out Materials Trading'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-016'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0031 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 7, 'USD', '2026-01-28', null, 'quotation', 'Phnom Penh', 600, 0, 0.5, 0, 0, 0.7, '30 days', 'Delivered site', 7, 'QT-2026-032', null, '2026-01-28', 'Seed PRC-0032 — Basis: fictional demo quotation QT-2026-032 (2026-01-28); ceiling template import.', 'approved', '2026-01-28'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Premium Interior Finishes (Cambodia)'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-016'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0032 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 45, 'USD', '2025-05-05', null, 'quotation', 'Phnom Penh', 150, 0, 3, 0, 0, 4.5, '30 days', 'Delivered site', 7, 'QT-2025-033', null, '2025-05-05', 'Seed PRC-0033 — Basis: fictional demo quotation QT-2025-033 (2025-05-05); ceiling template import.', 'approved', '2025-05-05'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Premium Interior Finishes (Cambodia)'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-021'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0033 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 68, 'USD', '2025-07-30', null, 'quotation', 'Phnom Penh', 100, 0, 6, 0, 0, 0, '30 days', 'Delivered site', 7, 'QT-2025-034', null, '2025-07-30', 'Seed PRC-0034 — Basis: fictional demo quotation QT-2025-034 (2025-07-30); ceiling template import.', 'approved', '2025-07-30'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'EuroCeil International'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-021'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0034 %');
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until,
     source_type, location, quantity, discount, delivery_cost, handling_cost, other_charges,
     tax_amount, payment_terms, delivery_terms, lead_time_days, source_document, quotation_ref,
     quotation_date, notes, price_status, approved_at)
  select v_tenant, r.id, sup.id, 48, 'USD', '2026-04-18', null, 'quotation', 'Phnom Penh', 200, 0, 3.5, 0, 0, 4.8, '30 days', 'Delivered site', 7, 'QT-2026-035', null, '2026-04-18', 'Seed PRC-0035 — Basis: fictional demo quotation QT-2026-035 (2026-04-18); ceiling template import.', 'approved', '2026-04-18'::timestamptz
  from public.dwl_resources r
  left join public.dwl_suppliers sup on sup.tenant_id = v_tenant and sup.name = 'Premium Interior Finishes (Cambodia)'
  where r.tenant_id = v_tenant and r.code = 'M-CLG-021'
    and not exists (select 1 from public.dwl_resource_prices p
                    where p.tenant_id = v_tenant and p.resource_id = r.id and p.notes like 'Seed PRC-0035 %');
end $$;
