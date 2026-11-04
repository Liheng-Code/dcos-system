-- Construction Work Library: productivity norms for the quantity-based activities that had none (2026-11-04).
--
-- Generate and the BOQ bridge use a norm only when an activity's duration_basis is 'quantity' (fixed / programme
-- activities take their duration from the step template), so these 7 were the real norm gaps. User-approved review:
--   - 4 library norms already existed but were never linked to their activity; link them (only while unlinked).
--   - 3 new ASSUMPTION norms, draft, to be calibrated before approval.
-- Matched by meaning, not by code: NRM-ARC-RF-001 is roof waterproofing, not ARC-RF-001 roof truss, and
-- NRM-MEP-ELE-010 is an LV main switchboard, not MEP-ELE-010 MV switchgear; both stay as they are.

-- ── Link existing norms ───────────────────────────────────────────────────
update public.plan_productivity_norms n
   set activity_master_id = m.id,
       activity_key = m.code
  from (values
    ('NRM-MEP-HVAC-009', 'MEP-HVAC-009'),     -- D23-013 Refrigerant Piping (VRF)
    ('NRM-MEP-HVAC-008', 'MEP-HVAC-008'),     -- D23-014 Split / VRF Air-Conditioning Units
    ('NRM-MEP-PLB-007',  'MEP-PLB-007'),      -- D22-016 Domestic Water Booster Pump Set
    ('NRM-ARC-PRT-001',  'ARC-FIN-WAL-007')   -- D09-020 Gypsum Drywall Partition
  ) v(norm_code, master_code)
  join public.plan_act_masters m on m.code = v.master_code and m.status in ('draft', 'active')
 where n.code = v.norm_code
   and n.project_id is null
   and n.activity_master_id is null
   and n.status <> 'approved';

-- ── New ASSUMPTION norms ──────────────────────────────────────────────────
-- labour_constant_hr_per_unit = crew x hours / output per day.
insert into public.plan_productivity_norms
  (code, name, trade, discipline, activity_key, unit, output_per_day, labour_constant_hr_per_unit,
   hours_per_day_basis, source, basis_note, status, activity_master_id)
select v.code, v.name, v.trade, v.discipline, m.code, v.unit, v.output_per_day, v.labour_constant,
       8, 'manual', v.basis_note, 'draft', m.id
  from (values
    ('NRM-STR-RC-FDN-002', 'Pile cap formwork', 'Formwork', 'STR', 'STR-RC-FDN-002', 'm²', 25::numeric, 0.9600::numeric,
     'ASSUMPTION: indicative rate 25 m²/crew-day, crew 2 Carpenter + 1 General Worker, as pad footing formwork. Timber / plywood side forms to pile caps. Calibrate on the first caps before approving.'),
    ('NRM-ARC-RF-TRS-001', 'Roof truss fabrication & erection', 'Steel Structure', 'ARC', 'ARC-RF-001', 'm²', 40, 1.2000,
     'ASSUMPTION: indicative rate 40 m² roof plan area/crew-day, crew 4 Steel Erector + 2 General Worker. Light steel trusses and purlins incl. lifting. Calibrate on the first bays before approving.'),
    ('NRM-MEP-ELE-MV-001', 'MV switchgear & transformer installation', 'Electrical', 'MEP', 'MEP-ELE-010', 'nos', 0.25, 160.0000,
     'ASSUMPTION: indicative rate 0.25 nos/crew-day (4 days per unit), crew 3 Electrician + 2 General Worker, crane by others. Placing, cabling terminations and pre-commissioning checks. Calibrate before approving.')
  ) v(code, name, trade, discipline, master_code, unit, output_per_day, labour_constant, basis_note)
  join public.plan_act_masters m on m.code = v.master_code and m.status in ('draft', 'active')
 where not exists (select 1 from public.plan_productivity_norms x where x.project_id is null and lower(x.code) = lower(v.code))
   and not exists (select 1 from public.plan_productivity_norms x where x.activity_master_id = m.id);
