-- Migration: 20260720000004_dwl_seed_starter_catalogue.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 1 Step 1.3,
--          seed the 18-resource starter catalogue with one price row each.
-- Depends on: 20260720000003_dwl_phase1_resources.sql, public.companies
--
-- IMPORTANT: these are NOT real supplier quotations. Per the task brief
-- (no live quotations gathered yet for this environment), each price row
-- uses source_type 'market_survey' (materials/labor/equipment — casually
-- observable Phnom Penh market pricing) or 'estimate' (subcon rates, where
-- no subcontractor quote exists yet), with illustrative-but-reasonable USD
-- prices for the Phnom Penh, Cambodia construction market. Every row's
-- `notes` states this explicitly and records a Basis, per SOP §7 Step 1.4.5
-- and the Phase 1 acceptance test (§7 Step 1.5 #5: "each with >= 1 price
-- and a `basis` in notes"). These placeholders MUST be superseded by real
-- quotations/purchases entered per Step 1.4 before the library is used for
-- live tendering.
--
-- Tenant: seeded against the single tenant that exists in this environment
-- (companies.code = 'MCC') rather than a hardcoded UUID literal.
-- Idempotent: resources inserted with `on conflict (code) do nothing`;
-- price rows inserted only if the resource does not already have a price
-- row, so re-running this migration is a safe no-op.

do $$
declare
  v_tenant_id uuid;
begin
  select id into v_tenant_id from public.companies where code = 'MCC';

  if v_tenant_id is null then
    raise exception 'dwl seed: no company with code = MCC found — cannot determine tenant_id';
  end if;

  -- ── Resources ────────────────────────────────────────────────────────
  insert into public.dwl_resources (tenant_id, code, category, description, unit, spec_reference)
  values
    (v_tenant_id, 'M-CON-001', 'material',  'Ready-mix concrete C30, slump 10±2cm',              'm3',    'ASTM C94'),
    (v_tenant_id, 'M-CON-002', 'material',  'Ready-mix concrete C35, slump 10±2cm',              'm3',    'ASTM C94'),
    (v_tenant_id, 'M-STL-001', 'material',  'Rebar deformed SD40, dia 10-25mm',                  'tonne', 'JIS G3112 SD40'),
    (v_tenant_id, 'M-BLK-001', 'material',  'Concrete block 100mm, 390x190mm',                   'pcs',   null),
    (v_tenant_id, 'M-CEM-001', 'material',  'Portland cement, 50kg bag',                         'bag',   'ASTM C150 Type I'),
    (v_tenant_id, 'M-SND-001', 'material',  'Fine sand, delivered',                              'm3',    null),
    (v_tenant_id, 'M-TIL-014', 'material',  'Porcelain tile 600x600mm, standard grade',          'm2',    null),
    (v_tenant_id, 'M-PNT-001', 'material',  'Emulsion paint, interior grade',                    'l',     null),
    (v_tenant_id, 'M-CUR-001', 'material',  'Curing compound, membrane-forming',                 'kg',    null),
    (v_tenant_id, 'L-GEN-001', 'labor',     'General laborer',                                   'day',   null),
    (v_tenant_id, 'L-MAS-001', 'labor',     'Mason (skilled)',                                   'day',   null),
    (v_tenant_id, 'L-STL-001', 'labor',     'Steel fixer',                                       'day',   null),
    (v_tenant_id, 'L-CAR-001', 'labor',     'Carpenter (formwork)',                              'day',   null),
    (v_tenant_id, 'E-PMP-001', 'equipment', 'Concrete pump incl. operator',                      'm3',    null),
    (v_tenant_id, 'E-VIB-001', 'equipment', 'Poker vibrator',                                    'day',   null),
    (v_tenant_id, 'E-EXC-001', 'equipment', 'Excavator PC200 incl. operator + fuel',             'hr',    null),
    (v_tenant_id, 'S-TST-001', 'subcon',    'Concrete cube test, set of 3',                      'set',   null),
    (v_tenant_id, 'S-WPF-001', 'subcon',    'Waterproofing membrane, supply & apply',            'm2',    null)
  on conflict (code) do nothing;

  -- ── Price rows (one each, valid_from = today) ──────────────────────────
  insert into public.dwl_resource_prices
    (tenant_id, resource_id, unit_price, currency, valid_from, quote_valid_until, source_type, location, notes)
  select
    v_tenant_id, r.id, v.unit_price, 'USD', date '2026-07-20', null, v.source_type, 'Phnom Penh', v.notes
  from (values
    ('M-CON-001', 78.00::numeric,  'market_survey', 'Basis: placeholder starter price pending real quotation entry per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia ready-mix market rate as of 2026-07-20.'),
    ('M-CON-002', 85.00,           'market_survey', 'Basis: placeholder starter price pending real quotation entry per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia ready-mix market rate as of 2026-07-20.'),
    ('M-STL-001', 820.00,          'market_survey', 'Basis: placeholder starter price pending real quotation entry per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia rebar market rate as of 2026-07-20.'),
    ('M-BLK-001', 0.35,            'market_survey', 'Basis: placeholder starter price pending real quotation entry per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia block-plant market rate as of 2026-07-20.'),
    ('M-CEM-001', 6.20,            'market_survey', 'Basis: placeholder starter price pending real quotation entry per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia hardware-supplier market rate as of 2026-07-20.'),
    ('M-SND-001', 18.00,           'market_survey', 'Basis: placeholder starter price pending real quotation entry per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia delivered sand market rate as of 2026-07-20.'),
    ('M-TIL-014', 9.50,            'market_survey', 'Basis: placeholder starter price pending real quotation entry per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia tile-supplier market rate as of 2026-07-20.'),
    ('M-PNT-001', 3.80,            'market_survey', 'Basis: placeholder starter price pending real quotation entry per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia paint-supplier market rate as of 2026-07-20.'),
    ('M-CUR-001', 2.10,            'market_survey', 'Basis: placeholder starter price pending real quotation entry per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia hardware-supplier market rate as of 2026-07-20.'),
    ('L-GEN-001', 12.00,           'market_survey', 'Basis: placeholder starter day-rate pending real payroll/agency data per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia general labor day-rate as of 2026-07-20.'),
    ('L-MAS-001', 22.00,           'market_survey', 'Basis: placeholder starter day-rate pending real payroll/agency data per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia skilled mason day-rate as of 2026-07-20.'),
    ('L-STL-001', 20.00,           'market_survey', 'Basis: placeholder starter day-rate pending real payroll/agency data per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia steel fixer day-rate as of 2026-07-20.'),
    ('L-CAR-001', 18.00,           'market_survey', 'Basis: placeholder starter day-rate pending real payroll/agency data per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia formwork carpenter day-rate as of 2026-07-20.'),
    ('E-PMP-001', 14.00,           'market_survey', 'Basis: placeholder starter price pending real hire-rate quotation per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia concrete pump hire rate as of 2026-07-20.'),
    ('E-VIB-001', 15.00,           'market_survey', 'Basis: placeholder starter price pending real hire-rate quotation per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia plant-hire rate as of 2026-07-20.'),
    ('E-EXC-001', 35.00,           'market_survey', 'Basis: placeholder starter price pending real hire-rate quotation per SOP QS-SOP-002 §7 Step 1.4. Illustrative Phnom Penh, Cambodia excavator hire rate as of 2026-07-20.'),
    ('S-TST-001', 25.00,           'estimate',      'Basis: placeholder starter estimate pending a real subcontractor/lab quotation per SOP QS-SOP-002 §7 Step 1.4. No live testing-lab quote on file as of 2026-07-20.'),
    ('S-WPF-001', 8.50,            'estimate',      'Basis: placeholder starter estimate pending a real subcontractor quotation per SOP QS-SOP-002 §7 Step 1.4. No live waterproofing subcontractor quote on file as of 2026-07-20.')
  ) as v(code, unit_price, source_type, notes)
  join public.dwl_resources r on r.code = v.code and r.tenant_id = v_tenant_id
  where not exists (
    select 1 from public.dwl_resource_prices rp where rp.resource_id = r.id
  );
end $$;
