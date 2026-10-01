-- =============================================================================
-- Cost & Rate Library: clean up the 54 "-RATE" placeholder resources
-- =============================================================================
-- The old company_rate_library / unit_rate_library migration created, for each
-- legacy rate, a resource "<CODE>-RATE" ("Migrated flat-rate placeholder for
-- ...") wrapped in its own 1-line dwl_work_items row with code <CODE>. Most of
-- them duplicate a real resource with the same base code, so Labour Rates and
-- the Resource Master show every trade twice. But the two legacy libraries
-- reused some codes for different things (e.g. PL-LAB-23 = Duct/sheet-metal
-- worker, PL-LAB-23-RATE = Fire protection fitter), so the rows are handled one
-- by one:
--
--   * 42 true duplicates are deleted — same resource as <CODE> (37 exact, 3
--     trade-name variants: electrician / plumber / HVAC technician), or the same
--     resource as a neighbouring code (PL-LAB-23-RATE = PL-LAB-24,
--     PL-PLT-30-RATE = PL-PLT-31). The real resource keeps its own price
--     (quotation-sourced in every conflicting case).
--   * 12 distinct resources are kept and renamed to a proper code, with the
--     "Migrated flat-rate placeholder for ..." / "(source: ...)" text removed.
--   * The 54 wrapper work items are deleted.
--
-- Guarded and idempotent: a work item or resource is only deleted while
-- nothing else references it, and a rename only happens if the old code still
-- exists and the new code is free. Replays cleanly on an empty database.
-- =============================================================================

-- 1. Wrapper work items: 1-line work items whose only resource is a -RATE row,
--    not used by any assembly, BOQ line or productivity norm.
DELETE FROM public.dwl_work_items wi
WHERE EXISTS (
        SELECT 1 FROM public.dwl_work_item_resources x
        JOIN public.dwl_resources r ON r.id = x.resource_id
        WHERE x.work_item_id = wi.id AND r.code LIKE '%-RATE')
  AND NOT EXISTS (
        SELECT 1 FROM public.dwl_work_item_resources x
        JOIN public.dwl_resources r ON r.id = x.resource_id
        WHERE x.work_item_id = wi.id AND r.code NOT LIKE '%-RATE')
  AND NOT EXISTS (SELECT 1 FROM public.dwl_assembly_items a WHERE a.work_item_id = wi.id)
  AND NOT EXISTS (SELECT 1 FROM public.tender_boq_items t WHERE t.dwl_work_item_id = wi.id OR t.unit_rate_id = wi.id)
  AND NOT EXISTS (SELECT 1 FROM public.qs_boq_items q WHERE q.dwl_work_item_id = wi.id)
  AND NOT EXISTS (SELECT 1 FROM public.plan_productivity_norms n WHERE n.dwl_work_item_id = wi.id);

-- 2. Delete the true duplicates (only while unreferenced).
WITH dup(code) AS (VALUES
  ('PL-FUE-01-RATE'),
  ('PL-LAB-01-RATE'),('PL-LAB-02-RATE'),('PL-LAB-03-RATE'),('PL-LAB-04-RATE'),('PL-LAB-05-RATE'),
  ('PL-LAB-06-RATE'),('PL-LAB-07-RATE'),('PL-LAB-10-RATE'),('PL-LAB-11-RATE'),('PL-LAB-12-RATE'),
  ('PL-LAB-13-RATE'),('PL-LAB-14-RATE'),('PL-LAB-15-RATE'),
  ('PL-LAB-20-RATE'),('PL-LAB-21-RATE'),('PL-LAB-22-RATE'),   -- licensed vs skilled / HVAC vs AC technician
  ('PL-LAB-23-RATE'),                                         -- = PL-LAB-24 Fire protection fitter
  ('PL-LOS-01-RATE'),('PL-LOS-02-RATE'),('PL-LOS-03-RATE'),('PL-LOS-10-RATE'),('PL-LOS-11-RATE'),
  ('PL-LOS-12-RATE'),('PL-LOS-13-RATE'),('PL-LOS-14-RATE'),
  ('PL-PLT-01-RATE'),('PL-PLT-02-RATE'),('PL-PLT-03-RATE'),('PL-PLT-04-RATE'),('PL-PLT-05-RATE'),
  ('PL-PLT-06-RATE'),('PL-PLT-07-RATE'),('PL-PLT-08-RATE'),('PL-PLT-09-RATE'),('PL-PLT-10-RATE'),
  ('PL-PLT-11-RATE'),('PL-PLT-12-RATE'),('PL-PLT-20-RATE'),('PL-PLT-21-RATE'),('PL-PLT-22-RATE'),
  ('PL-PLT-30-RATE')                                          -- = PL-PLT-31 Pipe threading machine
)
DELETE FROM public.dwl_resources r
USING dup
WHERE r.code = dup.code
  AND NOT EXISTS (SELECT 1 FROM public.dwl_work_item_resources x WHERE x.resource_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM public.dwl_assembly_crew x WHERE x.resource_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM public.dwl_assembly_equipment x WHERE x.resource_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM public.dwl_assembly_layer_materials x WHERE x.resource_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM public.dwl_material_attributes x WHERE x.resource_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM public.dwl_labor_rate_attributes x WHERE x.resource_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM public.dwl_subcon_attributes x WHERE x.resource_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM public.dwl_supplier_materials x WHERE x.resource_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM public.dwl_quotation_items x WHERE x.resource_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM public.dwl_price_submissions x WHERE x.resource_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM public.plan_productivity_norm_resources x WHERE x.dwl_resource_id = r.id)
  AND NOT EXISTS (SELECT 1 FROM public.plan_task_cost_lines x WHERE x.dwl_resource_id = r.id);

-- 3. Keep the distinct resources under a proper code and a clean description.
WITH ren(old_code, new_code, new_description) AS (VALUES
  ('PL-LAB-24-RATE',  'PL-LAB-25',  'BMS / commissioning technician'),
  ('PL-LOS-20-RATE',  'PL-LOS-25',  'Labor-only: electrical conduit + wiring'),
  ('PL-LOS-21-RATE',  'PL-LOS-26',  'Labor-only: plumbing waste / water'),
  ('PL-LOS-22-RATE',  'PL-LOS-27',  'Labor-only: HVAC duct + install'),
  ('PL-LOS-23-RATE',  'PL-LOS-28',  'Labor-only: fire sprinkler fitting'),
  ('PL-PLT-31-RATE',  'PL-PLT-35',  'Hydraulic crimping tool, rental'),
  ('PL-PLT-32-RATE',  'PL-PLT-36',  'Pipe bender (manual), rental'),
  ('PL-PLT-33-RATE',  'PL-PLT-37',  'Pressure test pump (electric), rental'),
  ('PL-PLT-34-RATE',  'PL-PLT-34',  'Duct leakage tester, rental'),
  ('UR-EXC-001-RATE', 'UR-EXC-001', 'Excavation in ordinary soil, by machine'),
  ('UR-FWK-001-RATE', 'UR-FWK-001', 'Formwork to slab soffit, ply, 4 reuses'),
  ('UR-PLA-001-RATE', 'UR-PLA-001', 'Cement plaster 15mm, internal walls')
)
UPDATE public.dwl_resources r
SET code = ren.new_code,
    description = ren.new_description,
    updated_at = now()
FROM ren
WHERE r.code = ren.old_code
  AND NOT EXISTS (SELECT 1 FROM public.dwl_resources x WHERE x.code = ren.new_code);
