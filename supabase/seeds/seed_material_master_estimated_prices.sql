-- =============================================================================
-- Seed: Material Master — estimated Effective Cost for materials with no price
-- =============================================================================
-- 46 active materials in Quantity Surveying ▸ Cost & Rate Library ▸ Material
-- Master had a blank Effective Cost (no row in dwl_resource_prices). This seed
-- gives each one a price from web research on 2026-09-25: Cambodian sources
-- where they exist, otherwise Vietnam / Thailand supplier prices, checked
-- against the library's own quotation prices for sister items. The `basis`
-- column says how each figure was reached; it is copied into the price notes.
--
-- Every price is inserted as source_type = 'estimate', price_status = 'draft',
-- valid_from = 2026-09-25, currency USD. Draft prices still show in the
-- Effective column (effective_unit_cost is generated from unit_price) but carry
-- a "draft" badge until a QS verifies and approves them. Confidence is lowest
-- for the access panels (MAT-ARC-024..032) and the specialty / custom ceilings
-- (MAT-CEIL-020, 022-025, 027-030): get supplier quotes for those first.
--
-- Re-running is safe: a price is added only when the material has NO price at
-- all, so real prices (quotations, market surveys) are never overridden and a
-- second run inserts nothing. Codes not found in the target database are
-- reported with a NOTICE and skipped. Remove the seeded prices:
--
--   DELETE FROM public.dwl_resource_prices
--   WHERE source_type = 'estimate' AND price_status = 'draft'
--     AND notes LIKE 'Web-research estimate 2026-09-25%';
--
-- Manual seed — NOT listed in supabase/config.toml [db.seed].sql_paths, and not
-- applied by `db push`. Run it against a database that already holds the
-- Material Master (from repo root):
--
--   supabase db query --local -f supabase/seeds/seed_material_master_estimated_prices.sql
-- =============================================================================

DO $$
DECLARE
  v_inserted int;
  v_missing  text;
BEGIN
  CREATE TEMP TABLE _est (code text PRIMARY KEY, price numeric, basis text) ON COMMIT DROP;
  INSERT INTO _est (code, price, basis) VALUES
    ('MAT-ARC-024', 25.00,  'Std 600x600 gypsum/alu-frame access panel; VN retail ~450-650k VND + import'),
    ('MAT-ARC-025', 95.00,  'Fire-rated access panel (steel/FR board), regional supply price'),
    ('MAT-ARC-026', 65.00,  'Acoustic-rated access panel, regional supply price'),
    ('MAT-ARC-027', 18.00,  'Metal lay-in access tile 600x600, vs metal lay-in ceiling 30.50/m2'),
    ('MAT-ARC-028', 45.00,  'Hinged lockable access door 600x600 steel/alu'),
    ('MAT-ARC-029', 15.00,  'Push-up / lift-out access panel 600x600'),
    ('MAT-ARC-030', 60.00,  'Circular / custom-shape access panel'),
    ('MAT-ARC-031', 70.00,  'Access panel with smoke seal / gasket'),
    ('MAT-ARC-032', 120.00, 'Large ceiling hatch / trap door ~900x900 with ladder-ready frame'),
    ('MAT-ARC-033', 3.50,   'Aluminium shadow-gap / feature trim profile per m'),
    ('MAT-ARC-034', 2.40,   'GI T-grid main runner + cross tee per m2; library T-grid complete 2.20 (quotation)'),
    ('MAT-ARC-035', 6.50,   'Concealed carrier / clip-in suspension per m2 (vs clip-in ceiling 48.70)'),
    ('MAT-ARC-036', 5.50,   'Linear / strip carrier system per m2'),
    ('MAT-ARC-037', 7.00,   'Baffle suspension system per m2'),
    ('MAT-ARC-038', 3.30,   'GI framing per m2 from library parts: runner 0.80/m x1.2 + furring 0.55/m x2.5 + hangers 0.35 x1.2 + clips; VN frame 80-100k VND/m2'),
    ('MAT-ARC-039', 1.90,   'Direct-fixed furring framing per m2: furring 0.55/m x2.5 + clips'),
    ('MAT-ARC-040', 0.55,   'GI wall angle per m; library MAT-CEIL-035 0.52'),
    ('MAT-ARC-041', 0.90,   'M8 threaded rod ~1m + anchor + hanger per no; library hanger set 0.35'),
    ('MAT-ARC-042', 4.50,   'Open-cell grid module suspension per m2'),
    ('MAT-ARC-043', 4.20,   'Aluminium stretch-ceiling perimeter track per m'),
    ('MAT-CEIL-007', 14.50, 'Direct-fixed gypsum ceiling; below suspended gypsum 17.45 (market survey)'),
    ('MAT-CEIL-009', 26.50, 'Fire-rated gypsum ceiling; above MR gypsum 21.08 (market survey)'),
    ('MAT-CEIL-010', 19.50, 'Fibre-cement board ceiling (SCG SmartBoard) with frame'),
    ('MAT-CEIL-014', 55.00, 'Metal hook-on ceiling; above clip-in 48.70 (market survey)'),
    ('MAT-CEIL-016', 46.00, 'Exterior PVDF aluminium strip ceiling; above interior linear 37.70 (quotation)'),
    ('MAT-CEIL-018', 50.00, 'Perforated acoustic metal baffle; above aluminium baffle 44.50 (quotation)'),
    ('MAT-CEIL-019', 24.00, 'Aluminium open-cell ceiling; VN supply 210-550k VND/m2 + import'),
    ('MAT-CEIL-020', 58.00, 'Expanded-metal mesh ceiling panels'),
    ('MAT-CEIL-022', 62.00, 'Wood-veneer ceiling panels'),
    ('MAT-CEIL-023', 70.00, 'Solid hardwood slat ceiling'),
    ('MAT-CEIL-024', 48.00, 'Grooved acoustic wood panel ceiling; VN factory from 246k VND/m2 (panel only), branded systems higher'),
    ('MAT-CEIL-025', 75.00, 'Acoustic fabric / stretched acoustic ceiling'),
    ('MAT-CEIL-027', 95.00, 'Custom GRG decorative feature ceiling (project-specific; verify per design)'),
    ('MAT-CEIL-028', 85.00, 'Suspended acoustic cloud panels per m2 of cloud'),
    ('MAT-CEIL-029', 12.00, 'Exposed-structure treatment (spray acoustic/thermal or architectural paint) per m2'),
    ('MAT-CEIL-030', 8.00,  'Exposed-MEP ceiling finish (painting of soffit + services) per m2'),
    ('MAT-CONC-001', 70.00, 'Ready-mix C16/20 delivered; library C10 64 / C21 75 (quotations); Cambodian suppliers $58-88/m3'),
    ('MAT-CONC-002', 84.00, 'Ready-mix C30/37 (~350ksc) delivered; library C35/30 84 (quotation)'),
    ('MAT-INS-001', 8.90,   'Rockwool slab 50mm 80kg/m3; library SnS Pro 60kg 50mm 6.93 (market survey)'),
    ('MAT-MASN-002', 0.075, 'Red clay 4-hole brick per pc; library local kiln brick 0.065-0.070 (quotation)'),
    ('MAT-METL-001', 720.00, 'Deformed rebar B500B delivered per tonne; library DB10/DB12 0.72/kg (quotation); Hoa Phat ex-works ~14,100 VND/kg'),
    ('MAT-METL-002', 980.00, 'UB S355 per tonne; library H/I-beam 0.95/kg (quotation) + S355 premium'),
    ('MAT-PLMB-001', 5.20,  'uPVC 110mm Class 8.5 per m; library PVC 114mm Class 8.5 5.20 (quotation)'),
    ('MAT-PLMB-002', 1.35,  'PPR PN20 25mm per m; library PPR 25mm PN20 1.20-1.35 (quotations)'),
    ('MAT-PNT-001', 6.20,   'Premium anti-bacterial interior acrylic per litre; library standard emulsion 3.80/l; Dulux EasyClean 18L regional retail'),
    ('MAT-WPRF-002', 8.00,  'PU / Sikalastic per kg; KIRI TOOLS Cambodia Sikalastic 20kg $158-163');

  SELECT string_agg(e.code, ', ' ORDER BY e.code) INTO v_missing
  FROM _est e
  WHERE NOT EXISTS (SELECT 1 FROM public.dwl_resources r WHERE r.code = e.code AND r.category = 'material');
  IF v_missing IS NOT NULL THEN
    RAISE NOTICE 'Material codes not found, skipped: %', v_missing;
  END IF;

  INSERT INTO public.dwl_resource_prices
    (tenant_id, resource_id, unit_price, currency, valid_from, source_type, price_status, notes)
  SELECT r.tenant_id, r.id, e.price, 'USD', DATE '2026-09-25', 'estimate', 'draft',
         'Web-research estimate 2026-09-25 (Cambodia / regional), pending QS verification. Basis: ' || e.basis
  FROM _est e
  JOIN public.dwl_resources r ON r.code = e.code AND r.category = 'material'
  WHERE NOT EXISTS (SELECT 1 FROM public.dwl_resource_prices p WHERE p.resource_id = r.id);
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RAISE NOTICE 'Estimated prices inserted: % of % (the rest already had a price)', v_inserted, (SELECT count(*) FROM _est);
END $$;