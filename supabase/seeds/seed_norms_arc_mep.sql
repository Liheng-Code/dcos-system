-- Company productivity norms for Architectural and MEP work (draft standards).
--
-- Fills the ARC / MEP activity masters that had no norm (so Generate can turn their quantities into
-- durations), plus common items that have no activity master yet (library-only, for Task Work).
-- Activities with a fixed duration (earthing, testing & commissioning, clean-agent suppression,
-- BMS points, TAB, pressure tests) take no norm.
--
-- Rates are INDICATIVE, for a labour-intensive South-East Asian site (8 h day, skilled + helper crews).
-- Cross-checked where a public figure was found:
--   * wiring device ≈ 0.18 h (NECA labour unit, device only) → 0.53 mh incl. box, termination and plate here;
--   * WC / basin 6.4–9.6 mh incl. rough-in → 4 mh for setting the fixture only (rough-in is in the pipework);
--   * self-adhesive membrane ≈ 30 m² per person-day (field study) → 20 m² per person-day for wet areas with upturns.
-- Everything else is from usual estimating ranges. All are status 'draft': calibrate on the first floors
-- (Norm Library › calibrate from site logs) before approving.
--
-- labour_constant_hr_per_unit = (skilled + helpers) × 8 h / output per crew-day.
-- Idempotent: skips a code that already exists in the company library.

insert into public.plan_productivity_norms (code, name, trade, discipline, activity_key, unit, labour_constant_hr_per_unit,
  hours_per_day_basis, efficiency_pct, source, basis_note, status, version, output_per_day, activity_master_id)
select v.code, v.name, v.trade, coalesce(m.discipline, v.disc), m.code, coalesce(m.default_unit, v.unit),
  round((v.skilled + v.helpers) * 8.0 / v.output, 4),
  8, 100, 'manual',
  'ASSUMPTION: indicative rate ' || v.output || ' ' || coalesce(m.default_unit, v.unit) || '/crew-day, crew '
    || v.skilled || ' ' || v.skilled_role || coalesce(' + ' || nullif(v.helpers, 0) || ' ' || v.helper_role, '')
    || '. ' || v.note || ' Calibrate after the first 1-2 floors.',
  'draft', 1, v.output, m.id
from (values
  -- code, master, name, discipline, trade, unit (used when no master), output/crew-day, skilled, skilled role, helpers, helper role, note
  -- ── Architectural: doors & windows
  ('NRM-ARC-DW-001', 'ARC-DW-001', 'Door frame installation (timber / steel)', 'ARC', 'Doors & Windows', 'nos', 6,  2, 'Carpenter', 1, 'General Worker', 'Set, plumb and fix frame, grout or anchor.'),
  ('NRM-ARC-DW-002', 'ARC-DW-002', 'Door leaf hanging & ironmongery',          'ARC', 'Doors & Windows', 'nos', 4,  1, 'Carpenter', 1, 'General Worker', 'Hang leaf, fit hinges, lockset, closer and stopper.'),
  ('NRM-ARC-DW-003', 'ARC-DW-003', 'Aluminium window frame installation',      'ARC', 'Doors & Windows', 'nos', 5,  2, 'Aluminium Installer', 1, 'General Worker', 'Average window 2-3 m², fix and pack frame.'),
  ('NRM-ARC-DW-004', 'ARC-DW-004', 'Glazing installation',                     'ARC', 'Doors & Windows', 'm²',  20, 2, 'Glazier', 1, 'General Worker', 'Clear / tinted glass into prepared frames.'),
  ('NRM-ARC-DW-005', 'ARC-DW-005', 'Door / window sealant & finishing',        'ARC', 'Doors & Windows', 'nos', 15, 1, 'Sealant Applicator', 1, 'General Worker', 'Perimeter sealant, cleaning and adjustment.'),
  -- ── Architectural: ceilings
  ('NRM-ARC-CLG-001', 'ARC-FIN-CLG-001', 'Ceiling suspension / framing system',  'ARC', 'Ceilings', 'm²',  45, 2, 'Ceiling Fixer', 1, 'General Worker', 'Hangers, main and cross runners, levelled.'),
  ('NRM-ARC-CLG-002', 'ARC-FIN-CLG-002', 'Acoustic lay-in ceiling tiles',        'ARC', 'Ceilings', 'm²',  80, 2, 'Ceiling Fixer', 1, 'General Worker', 'Tiles into exposed grid, incl. cutting at edges.'),
  ('NRM-ARC-CLG-003', 'ARC-FIN-CLG-003', 'Gypsum board ceiling (fix, joint & skim)', 'ARC', 'Ceilings', 'm²', 35, 2, 'Ceiling Fixer', 1, 'General Worker', 'Single layer 9-12 mm board, taped and skimmed.'),
  ('NRM-ARC-CLG-004', 'ARC-FIN-CLG-004', 'Ceiling access panel',                 'ARC', 'Ceilings', 'nos', 8,  1, 'Ceiling Fixer', 1, 'General Worker', 'Cut opening, trim and fit panel.'),
  ('NRM-ARC-CLG-005', 'ARC-FIN-CLG-005', 'Ceiling painting (primer + 2 coats)',  'ARC', 'Painting', 'm²',  55, 3, 'Painter', 1, 'General Worker', 'Overhead work, slower than walls.'),
  -- ── Architectural: floors
  ('NRM-ARC-FLR-001', 'ARC-FIN-FLR-001', 'Floor substrate preparation',          'ARC', 'Finishes', 'm²', 120, 1, 'Mason', 2, 'General Worker', 'Scabble / grind high spots, clean, prime.'),
  ('NRM-ARC-FLR-003', 'ARC-FIN-FLR-003', 'Waterproofing membrane, wet areas',    'ARC', 'Waterproofing', 'm²', 60, 2, 'Waterproofing Applicator', 1, 'General Worker', 'Liquid or sheet membrane incl. 150-300 mm upturns and corners.'),
  ('NRM-ARC-FLR-005', 'ARC-FIN-FLR-005', 'Vinyl / LVT flooring',                 'ARC', 'Finishes', 'm²',  60, 2, 'Floor Layer', 1, 'General Worker', 'Adhesive or click, on prepared screed.'),
  ('NRM-ARC-FLR-006', 'ARC-FIN-FLR-006', 'Timber / engineered flooring',         'ARC', 'Finishes', 'm²',  30, 2, 'Carpenter', 1, 'General Worker', 'Underlay and boards, floating or glued.'),
  ('NRM-ARC-FLR-007', 'ARC-FIN-FLR-007', 'Floor skirting',                       'ARC', 'Finishes', 'm',   40, 1, 'Tiler', 1, 'General Worker', 'Tile, timber or vinyl skirting incl. corners.'),
  ('NRM-ARC-FLR-008', 'ARC-FIN-FLR-008', 'Floor protection & final cleaning',    'ARC', 'Finishes', 'm²', 300, 3, 'General Worker', 0, 'General Worker', 'Protection board / sheet and builder''s clean.'),
  -- ── Architectural: walls
  ('NRM-ARC-WAL-001', 'ARC-FIN-WAL-001', 'Wall substrate preparation',           'ARC', 'Finishes', 'm²', 150, 1, 'Mason', 2, 'General Worker', 'Hack, patch, fill and clean before finishes.'),
  ('NRM-ARC-WAL-005', 'ARC-FIN-WAL-005', 'Wallpaper / feature wall',             'ARC', 'Finishes', 'm²',  40, 2, 'Decorator', 1, 'General Worker', 'Size, hang and trim wallcovering.'),
  ('NRM-ARC-WAL-006', 'ARC-FIN-WAL-006', 'Wall protection & touch-up',           'ARC', 'Painting', 'm²', 150, 1, 'Painter', 1, 'General Worker', 'Corner guards, final touch-up before handover.'),
  -- ── Architectural: library-only (no activity master yet)
  ('NRM-ARC-PRT-001', null, 'Gypsum board partition, stud + 1 layer each side', 'ARC', 'Partitions', 'm²', 25, 2, 'Drywall Fixer', 1, 'General Worker', 'Track, studs, board both sides, taped (wall face area).'),
  ('NRM-ARC-WAL-007', null, 'Skim coat to walls',                                'ARC', 'Plastering', 'm²', 60, 2, 'Plasterer', 1, 'General Worker', 'Two thin coats over plaster or board.'),
  ('NRM-ARC-RF-001',  null, 'Roof waterproofing, torch-on membrane',             'ARC', 'Waterproofing', 'm²', 80, 2, 'Waterproofing Applicator', 2, 'General Worker', 'Primer + 1 layer torch-on, laps and upstands.'),
  ('NRM-ARC-EXT-001', null, 'External wall painting (from scaffold / gondola)', 'ARC', 'Painting', 'm²', 60, 4, 'Painter', 1, 'General Worker', 'Sealer + 2 coats, access already in place.'),
  ('NRM-ARC-CLD-001', null, 'Stone / granite wall cladding',                     'ARC', 'Cladding', 'm²', 10, 2, 'Stone Mason', 1, 'General Worker', 'Dry-fix with anchors or wet-fix, incl. cutting.'),
  ('NRM-ARC-MET-001', null, 'Railing / balustrade installation',                 'ARC', 'Metalwork', 'm', 10, 2, 'Steel Fabricator', 1, 'General Worker', 'Fix prefabricated sections, posts and handrail.'),
  -- ── MEP: electrical
  ('NRM-MEP-ELE-003', 'MEP-ELE-003', 'Lighting & small power wiring (per point)', 'MEP', 'Electrical', 'point', 20, 2, 'Electrician', 1, 'Electrical Helper', 'Final circuit wiring from DB to point incl. drops.'),
  ('NRM-MEP-ELE-004', 'MEP-ELE-004', 'Sub-distribution board installation',      'MEP', 'Electrical', 'nos', 2,  2, 'Electrician', 1, 'Electrical Helper', 'Mount DB, dress and terminate incoming and outgoing circuits.'),
  ('NRM-MEP-ELE-006', 'MEP-ELE-006', 'Socket & switch installation',             'MEP', 'Electrical', 'nos', 30, 1, 'Electrician', 1, 'Electrical Helper', 'Device, terminations and plate on an existing box (NECA ≈ 0.18 h device only).'),
  ('NRM-MEP-ELE-009', null, 'Cable tray / ladder installation (≤ 300 mm)',       'MEP', 'Electrical', 'm', 30, 2, 'Electrician', 1, 'Electrical Helper', 'Supports, tray, bends and earth continuity.'),
  ('NRM-MEP-ELE-010', null, 'Main switchboard (MSB / MDB) installation',         'MEP', 'Electrical', 'nos', 0.5, 3, 'Electrician', 2, 'Electrical Helper', 'Position, level, join sections, terminate mains.'),
  -- ── MEP: plumbing
  ('NRM-MEP-PLB-002', 'MEP-PLB-002', 'Hot water pipework (PPR / copper)',        'MEP', 'Plumbing', 'm', 35, 2, 'Plumber', 1, 'Plumbing Helper', 'Average 20-32 mm incl. fittings and supports.'),
  ('NRM-MEP-PLB-003', 'MEP-PLB-003', 'Soil & waste pipework (uPVC)',             'MEP', 'Plumbing', 'm', 25, 2, 'Plumber', 1, 'Plumbing Helper', 'Average 50-110 mm incl. fittings, falls and supports.'),
  ('NRM-MEP-PLB-004', 'MEP-PLB-004', 'Sanitary fixture installation',            'MEP', 'Plumbing', 'nos', 4, 1, 'Plumber', 1, 'Plumbing Helper', 'Set and connect WC / basin / sink; rough-in is in the pipework (6.4-9.6 mh incl. rough-in).'),
  ('NRM-MEP-PLB-005', 'MEP-PLB-005', 'Water heater / calorifier installation',   'MEP', 'Plumbing', 'nos', 3, 1, 'Plumber', 1, 'Plumbing Helper', 'Domestic storage / instant heater, mount and connect.'),
  ('NRM-MEP-PLB-007', null, 'Water pump set installation',                      'MEP', 'Plumbing', 'nos', 1, 2, 'Plumber', 2, 'Plumbing Helper', 'Booster / transfer pump on plinth, valves and connections.'),
  -- ── MEP: fire protection
  ('NRM-MEP-FP-002', 'MEP-FP-002', 'Sprinkler head installation (incl. drop)',   'MEP', 'Fire Protection', 'nos', 30, 2, 'Pipe Fitter', 1, 'General Worker', 'Drop or flexible hose from branch line, head and escutcheon.'),
  ('NRM-MEP-FP-003', 'MEP-FP-003', 'Fire hose reel / hydrant installation',     'MEP', 'Fire Protection', 'nos', 3, 2, 'Pipe Fitter', 1, 'General Worker', 'Cabinet, reel / landing valve and connection.'),
  ('NRM-MEP-FP-004', 'MEP-FP-004', 'Fire alarm cabling & devices (per point)',   'MEP', 'Fire Protection', 'point', 15, 2, 'Electrician', 1, 'Electrical Helper', 'Cable to detector / call point / sounder and fit device.'),
  -- ── MEP: HVAC
  ('NRM-MEP-HVAC-002', 'MEP-HVAC-002', 'FCU / AHU installation',                 'MEP', 'HVAC', 'nos', 4, 2, 'HVAC Technician', 2, 'General Worker', 'Mostly FCUs: hang, connect pipes, drain and power; large AHUs take longer.'),
  ('NRM-MEP-HVAC-003', 'MEP-HVAC-003', 'Chilled water pipework (steel, avg 50 mm)', 'MEP', 'HVAC', 'm', 20, 3, 'Pipe Fitter / Welder', 1, 'General Worker', 'Welded / grooved incl. fittings and supports, excl. insulation.'),
  ('NRM-MEP-HVAC-004', 'MEP-HVAC-004', 'Diffuser / grille installation',         'MEP', 'HVAC', 'nos', 16, 1, 'HVAC Technician', 1, 'General Worker', 'Fix terminal and flexible connection to ductwork.'),
  ('NRM-MEP-HVAC-005', 'MEP-HVAC-005', 'Duct & pipe insulation',                 'MEP', 'HVAC', 'm²', 30, 2, 'Insulator', 1, 'General Worker', 'Elastomeric / fibreglass with vapour barrier, surface area.'),
  ('NRM-MEP-HVAC-008', null, 'Split-type air conditioner (indoor + outdoor)',   'MEP', 'HVAC', 'nos', 2, 2, 'HVAC Technician', 1, 'General Worker', 'Both units, up to 5 m refrigerant pipe, drain, vacuum and test.'),
  ('NRM-MEP-HVAC-009', null, 'Refrigerant copper piping (insulated pair)',      'MEP', 'HVAC', 'm', 25, 2, 'HVAC Technician', 1, 'General Worker', 'Liquid + suction pair with insulation and supports.')
) as v(code, master_code, name, disc, trade, unit, output, skilled, skilled_role, helpers, helper_role, note)
left join public.plan_act_masters m on m.code = v.master_code and m.status in ('draft', 'active')
where (v.master_code is null or m.id is not null)
  and not exists (
    select 1 from public.plan_productivity_norms n where n.project_id is null and lower(n.code) = lower(v.code)
  );

-- Crew lines: the skilled trade and its helpers, per crew. Matched by code so it only touches these norms.
insert into public.plan_productivity_norm_resources (norm_id, kind, role_label, workers_per_crew, allocation_rule, is_optional, sort_order)
select n.id, 'labor', c.role, c.workers, 'per_crew', false, c.ord
from public.plan_productivity_norms n
join (values
  ('NRM-ARC-DW-001', 'Carpenter', 2, 1), ('NRM-ARC-DW-001', 'General Worker', 1, 2),
  ('NRM-ARC-DW-002', 'Carpenter', 1, 1), ('NRM-ARC-DW-002', 'General Worker', 1, 2),
  ('NRM-ARC-DW-003', 'Aluminium Installer', 2, 1), ('NRM-ARC-DW-003', 'General Worker', 1, 2),
  ('NRM-ARC-DW-004', 'Glazier', 2, 1), ('NRM-ARC-DW-004', 'General Worker', 1, 2),
  ('NRM-ARC-DW-005', 'Sealant Applicator', 1, 1), ('NRM-ARC-DW-005', 'General Worker', 1, 2),
  ('NRM-ARC-CLG-001', 'Ceiling Fixer', 2, 1), ('NRM-ARC-CLG-001', 'General Worker', 1, 2),
  ('NRM-ARC-CLG-002', 'Ceiling Fixer', 2, 1), ('NRM-ARC-CLG-002', 'General Worker', 1, 2),
  ('NRM-ARC-CLG-003', 'Ceiling Fixer', 2, 1), ('NRM-ARC-CLG-003', 'General Worker', 1, 2),
  ('NRM-ARC-CLG-004', 'Ceiling Fixer', 1, 1), ('NRM-ARC-CLG-004', 'General Worker', 1, 2),
  ('NRM-ARC-CLG-005', 'Painter', 3, 1), ('NRM-ARC-CLG-005', 'General Worker', 1, 2),
  ('NRM-ARC-FLR-001', 'Mason', 1, 1), ('NRM-ARC-FLR-001', 'General Worker', 2, 2),
  ('NRM-ARC-FLR-003', 'Waterproofing Applicator', 2, 1), ('NRM-ARC-FLR-003', 'General Worker', 1, 2),
  ('NRM-ARC-FLR-005', 'Floor Layer', 2, 1), ('NRM-ARC-FLR-005', 'General Worker', 1, 2),
  ('NRM-ARC-FLR-006', 'Carpenter', 2, 1), ('NRM-ARC-FLR-006', 'General Worker', 1, 2),
  ('NRM-ARC-FLR-007', 'Tiler', 1, 1), ('NRM-ARC-FLR-007', 'General Worker', 1, 2),
  ('NRM-ARC-FLR-008', 'General Worker', 3, 1),
  ('NRM-ARC-WAL-001', 'Mason', 1, 1), ('NRM-ARC-WAL-001', 'General Worker', 2, 2),
  ('NRM-ARC-WAL-005', 'Decorator', 2, 1), ('NRM-ARC-WAL-005', 'General Worker', 1, 2),
  ('NRM-ARC-WAL-006', 'Painter', 1, 1), ('NRM-ARC-WAL-006', 'General Worker', 1, 2),
  ('NRM-ARC-PRT-001', 'Drywall Fixer', 2, 1), ('NRM-ARC-PRT-001', 'General Worker', 1, 2),
  ('NRM-ARC-WAL-007', 'Plasterer', 2, 1), ('NRM-ARC-WAL-007', 'General Worker', 1, 2),
  ('NRM-ARC-RF-001', 'Waterproofing Applicator', 2, 1), ('NRM-ARC-RF-001', 'General Worker', 2, 2),
  ('NRM-ARC-EXT-001', 'Painter', 4, 1), ('NRM-ARC-EXT-001', 'General Worker', 1, 2),
  ('NRM-ARC-CLD-001', 'Stone Mason', 2, 1), ('NRM-ARC-CLD-001', 'General Worker', 1, 2),
  ('NRM-ARC-MET-001', 'Steel Fabricator', 2, 1), ('NRM-ARC-MET-001', 'General Worker', 1, 2),
  ('NRM-MEP-ELE-003', 'Electrician', 2, 1), ('NRM-MEP-ELE-003', 'Electrical Helper', 1, 2),
  ('NRM-MEP-ELE-004', 'Electrician', 2, 1), ('NRM-MEP-ELE-004', 'Electrical Helper', 1, 2),
  ('NRM-MEP-ELE-006', 'Electrician', 1, 1), ('NRM-MEP-ELE-006', 'Electrical Helper', 1, 2),
  ('NRM-MEP-ELE-009', 'Electrician', 2, 1), ('NRM-MEP-ELE-009', 'Electrical Helper', 1, 2),
  ('NRM-MEP-ELE-010', 'Electrician', 3, 1), ('NRM-MEP-ELE-010', 'Electrical Helper', 2, 2),
  ('NRM-MEP-PLB-002', 'Plumber', 2, 1), ('NRM-MEP-PLB-002', 'Plumbing Helper', 1, 2),
  ('NRM-MEP-PLB-003', 'Plumber', 2, 1), ('NRM-MEP-PLB-003', 'Plumbing Helper', 1, 2),
  ('NRM-MEP-PLB-004', 'Plumber', 1, 1), ('NRM-MEP-PLB-004', 'Plumbing Helper', 1, 2),
  ('NRM-MEP-PLB-005', 'Plumber', 1, 1), ('NRM-MEP-PLB-005', 'Plumbing Helper', 1, 2),
  ('NRM-MEP-PLB-007', 'Plumber', 2, 1), ('NRM-MEP-PLB-007', 'Plumbing Helper', 2, 2),
  ('NRM-MEP-FP-002', 'Pipe Fitter', 2, 1), ('NRM-MEP-FP-002', 'General Worker', 1, 2),
  ('NRM-MEP-FP-003', 'Pipe Fitter', 2, 1), ('NRM-MEP-FP-003', 'General Worker', 1, 2),
  ('NRM-MEP-FP-004', 'Electrician', 2, 1), ('NRM-MEP-FP-004', 'Electrical Helper', 1, 2),
  ('NRM-MEP-HVAC-002', 'HVAC Technician', 2, 1), ('NRM-MEP-HVAC-002', 'General Worker', 2, 2),
  ('NRM-MEP-HVAC-003', 'Pipe Fitter / Welder', 3, 1), ('NRM-MEP-HVAC-003', 'General Worker', 1, 2),
  ('NRM-MEP-HVAC-004', 'HVAC Technician', 1, 1), ('NRM-MEP-HVAC-004', 'General Worker', 1, 2),
  ('NRM-MEP-HVAC-005', 'Insulator', 2, 1), ('NRM-MEP-HVAC-005', 'General Worker', 1, 2),
  ('NRM-MEP-HVAC-008', 'HVAC Technician', 2, 1), ('NRM-MEP-HVAC-008', 'General Worker', 1, 2),
  ('NRM-MEP-HVAC-009', 'HVAC Technician', 2, 1), ('NRM-MEP-HVAC-009', 'General Worker', 1, 2)
) as c(code, role, workers, ord) on c.code = n.code
where n.project_id is null
  and not exists (select 1 from public.plan_productivity_norm_resources r where r.norm_id = n.id);
