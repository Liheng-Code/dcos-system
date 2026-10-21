-- Site / external works and the missing building parts (Generate plan G5).
--   A. Masters for site work the library lacked (security fence, guardhouse, car-park paving, heavy-duty yard,
--      external lighting, external utilities, sports courts, signage) and for flat roofs (screed & insulation,
--      plant plinths, lightning protection); each quantity master gets a DRAFT norm and a quantity rule.
--   B. Seven DRAFT templates: external works for residential, commercial / apartments, industrial and
--      institutional sites (part "site" = the project's External Works node, wbs_nodes.is_external_works);
--      a flat RC roof; a podium / lobby floor (typical floor + façade); a slab-on-grade substructure for
--      buildings without a basement.
--   C. Kits: a Site template on every building kit, and the podium / roof / ground gaps filled. Where a part
--      offers alternatives (pitched or flat roof, RC podium or steel shed), Generate keeps the templates whose
--      conditions match the planning choices (kit-plan.ts), so both sit on the part.
-- Idempotent: inserts skip what exists; templates get items / links only while they have none.
-- Depends on: 20261021000006 (EXT domain, villa templates), 20261021000022 (kits), 20261021000023 (roof_type).

-- ── A. Masters ─────────────────────────────────────────────────────────────
do $seed$
declare
  r record;
  c_id uuid;
begin
  -- new families under External Works (same category as the residential EXT families)
  select ca.id into c_id from public.plan_act_categories ca join public.plan_act_domains d on d.id = ca.domain_id
   where d.code = 'EXT' and ca.code = 'EXT';
  insert into public.plan_act_families(category_id, code, name, sort_order) values
    (c_id, 'CAR', 'Car Parks & Yards', 7), (c_id, 'LGT', 'External Lighting', 8), (c_id, 'UTL', 'External Utilities', 9),
    (c_id, 'SPT', 'Play & Sports', 10), (c_id, 'GH', 'Gatehouse & Security', 11), (c_id, 'SGN', 'Signage', 12)
  on conflict (category_id, code) do nothing;

  -- code, name, unit, discipline, work type, work group, duration basis, sectors, building types,
  -- reference master (domain / category / family copied from it), family override (same category)
  for r in select * from (values
    ('EXT-FEN-002', 'Security Fence & Gates (Palisade / Chain-link)', 'm', 'EXT', 'Fencing', 'EX', 'quantity', '{commercial,industrial,institutional}'::text[], '{}'::text[], 'EXT-FEN-001', null),
    ('EXT-GH-001',  'Guardhouse / Gatehouse',                        'lot', 'EXT', 'Building', 'EX', 'fixed', '{commercial,industrial,institutional}', '{}', 'EXT-FEN-001', 'GH'),
    ('EXT-PAV-002', 'Car Park Paving & Line Marking',                'm²', 'EXT', 'Paving', 'EX', 'quantity', '{residential,commercial,institutional}', '{}', 'EXT-PAV-001', 'CAR'),
    ('EXT-PAV-003', 'Heavy-duty Concrete Yard Pavement',             'm²', 'EXT', 'Paving', 'EX', 'quantity', '{industrial}', '{}', 'EXT-PAV-001', 'CAR'),
    ('EXT-LGT-001', 'External Lighting & Bollards',                  'nos', 'EXT', 'Electrical', 'EX', 'quantity', '{residential,commercial,industrial,institutional}', '{}', 'EXT-FEN-001', 'LGT'),
    ('EXT-UTL-001', 'External Utility Mains & Ducts (Water, Power, Telecom)', 'm', 'EXT', 'Utilities', 'EX', 'quantity', '{residential,commercial,industrial,institutional}', '{}', 'EXT-DRN-001', 'UTL'),
    ('EXT-SPT-001', 'Playground & Sports Courts',                    'm²', 'EXT', 'Sports', 'EX', 'quantity', '{institutional,residential}', '{school,university,residential_development}', 'EXT-LND-001', 'SPT'),
    ('EXT-SGN-001', 'External Signage & Wayfinding',                 'lot', 'EXT', 'Signage', 'EX', 'fixed', '{commercial,institutional}', '{}', 'EXT-FEN-001', 'SGN'),
    ('ARC-RF-006',  'Roof Screed to Falls & Insulation',             'm²', 'ARC', 'Roofing', 'RF', 'quantity', '{residential,commercial,industrial,institutional}', '{}', 'ARC-RF-005', null),
    ('ARC-RF-007',  'Roof Plant Plinths & Upstands',                 'nos', 'ARC', 'Roofing', 'RF', 'quantity', '{residential,commercial,industrial,institutional}', '{}', 'ARC-RF-005', null),
    ('MEP-ELE-009', 'Lightning Protection System',                   'lot', 'MEP', 'Electrical', null, 'fixed', '{residential,commercial,industrial,institutional}', '{}', 'MEP-ELE-008', null)
  ) v(code, name, unit, disc, wtype, wg, basis, sectors, btypes, ref, fam)
  loop
    insert into public.plan_act_masters(code, name, domain_id, category_id, family_id, discipline, work_type, default_unit,
        status, version, owner, source, effective_date, sectors, building_types, duration_basis, default_work_group)
    select r.code, r.name, ref.domain_id, ref.category_id,
           coalesce((select f.id from public.plan_act_families f where f.category_id = ref.category_id and f.code = r.fam), ref.family_id),
           r.disc, r.wtype, r.unit, 'active', 1, 'Planning Standards', 'Company Standard (site works seed 2026-10-21)', date '2026-10-21',
           r.sectors, r.btypes, r.basis, coalesce(r.wg, ref.default_work_group)
      from public.plan_act_masters ref
     where ref.code = r.ref and ref.version = 1
    on conflict (code, version) do nothing;
  end loop;
end
$seed$;

-- draft norms: labour constant = crew size × 8 h / output per crew-day
insert into public.plan_productivity_norms (code, name, trade, discipline, activity_key, unit, labour_constant_hr_per_unit,
  hours_per_day_basis, efficiency_pct, source, basis_note, status, version, output_per_day, activity_master_id)
select 'NRM-' || m.code, v.name, v.trade, m.discipline, m.code, m.default_unit,
  round((v.skilled + v.helpers) * 8.0 / v.output, 4), 8, 100, 'manual',
  'ASSUMPTION: indicative rate ' || v.output || ' ' || m.default_unit || '/crew-day, crew ' || v.skilled || ' ' || v.skilled_role
    || coalesce(' + ' || nullif(v.helpers, 0) || ' ' || v.helper_role, '') || '. ' || v.note || ' Calibrate on site before approving.',
  'draft', 1, v.output, m.id
from (values
  ('EXT-FEN-002', 'Security fence & gates',            'Fencing',     25, 2, 'Fencer', 2, 'General Worker', 'Posts in concrete, palisade / mesh panels; gates per opening.'),
  ('EXT-PAV-002', 'Car park paving & line marking',    'Paving',      60, 2, 'Paver', 3, 'General Worker', 'Interlocking pavers or asphalt on prepared base, bays marked.'),
  ('EXT-PAV-003', 'Heavy-duty concrete yard',          'Concrete',    60, 4, 'Concrete Worker', 2, 'General Worker', '200-250 mm slab with mesh, saw-cut joints.'),
  ('EXT-LGT-001', 'External lighting & bollards',      'Electrical',   4, 1, 'Electrician', 1, 'General Worker', 'Base, pole / bollard, cabling from the feeder pillar.'),
  ('EXT-UTL-001', 'External utility mains & ducts',    'Utilities',   25, 1, 'Plumber / Electrician', 3, 'General Worker', 'Shared trench, pipes and ducts, draw pits, backfill.'),
  ('EXT-SPT-001', 'Playground & sports courts',        'Sports',      50, 2, 'Paver', 2, 'General Worker', 'Base, surfacing (EPDM / acrylic), markings, equipment bases.'),
  ('ARC-RF-006',  'Roof screed to falls & insulation', 'Roofing',     60, 2, 'Mason', 2, 'General Worker', 'Insulation boards and screed laid to falls towards outlets.'),
  ('ARC-RF-007',  'Roof plant plinths & upstands',     'Concrete',     2, 2, 'Mason', 1, 'General Worker', 'Formed and cast plinths for chillers, tanks and fans.')
) as v(mcode, name, trade, output, skilled, skilled_role, helpers, helper_role, note)
join public.plan_act_masters m on m.code = v.mcode and m.version = 1
where not exists (select 1 from public.plan_productivity_norms n where n.project_id is null and n.code = 'NRM-' || m.code);

insert into public.plan_act_quantity_rules(master_id, name, metric_code, unit, provider_priority, note)
select m.id, v.rule_name, v.metric, m.default_unit, v.providers, null
from (values
  ('EXT-FEN-002', 'Fence length',        'security_fence_length', array['boq','manual']),
  ('EXT-PAV-002', 'Car park area',       'carpark_area',          array['boq','manual']),
  ('EXT-PAV-003', 'Yard area',           'yard_area',             array['boq','manual']),
  ('EXT-LGT-001', 'External lights',     'ext_light_count',       array['boq','manual']),
  ('EXT-UTL-001', 'Utility trench',      'ext_utility_length',    array['boq','manual']),
  ('EXT-SPT-001', 'Sports / play area',  'sports_area',           array['boq','manual']),
  ('ARC-RF-006',  'Roof screed area',    'roof_screed_area',      array['bim','boq','manual']),
  ('ARC-RF-007',  'Roof plinths',        'roof_plinth_count',     array['boq','manual'])
) as v(mcode, rule_name, metric, providers)
join public.plan_act_masters m on m.code = v.mcode and m.version = 1
on conflict (master_id, name) do nothing;

update public.plan_act_masters m
   set default_step_template_id = s.id
  from (values
    ('EXT-FEN-002', 'Permanent Fence / Boundary'),
    ('EXT-PAV-002', 'Asphalt Paving'),
    ('EXT-LGT-001', 'Street Lighting')
  ) as v(mcode, step_name)
  join public.activity_step_template_master s on s.template_name = v.step_name and s.is_active
 where m.code = v.mcode and m.default_step_template_id is null;

-- ── B. Templates ───────────────────────────────────────────────────────────
insert into public.plan_act_templates (code, name, description, domain_id, status, version, applies_to_level_types, owner,
  sectors, building_types, inter_level_from_seq, inter_level_to_seq, inter_level_relation, inter_level_lag_days)
select v.code, v.name, v.descr, d.id, 'draft', 1, v.levels, 'Planning Manager', v.sectors, v.btypes, null, null, 'fs', 0
from (values
  ('TPL-EXT-RES-001', 'Residential – External Works', 'EXT',
   'Drainage, septic / sewer connection, utility mains, boundary wall and gate, driveway paving, external lighting, landscaping. Add the pool from the library where the house has one.',
   array['site'], array['residential'], array['luxury_villa','mansion_estate','private_residence','standard_villa','townhouse','residential_development']),
  ('TPL-EXT-COM-001', 'External Works & Car Park (Commercial / Apartments)', 'EXT',
   'Drainage, utility mains, security fence, kerbs, car-park paving and marking, external lighting, signage, landscaping.',
   array['site'], array['commercial','residential'], array['office_building','mixed_use_building','hotel','shopping_mall','retail_building','showroom','restaurant','apartment','condominium','residential_tower']),
  ('TPL-EXT-IND-001', 'Industrial – Yard, Fence & Gatehouse', 'EXT',
   'Drainage, utility mains, security fence, gatehouse, kerbs, heavy-duty concrete yard, external lighting, landscaping strips.',
   array['site'], array['industrial'], '{}'::text[]),
  ('TPL-EXT-INS-001', 'Institutional – External Works, Car Park & Play Areas', 'EXT',
   'Drainage, utility mains, security fence, gatehouse, kerbs, car park and drop-off, playground / sports courts, external lighting, signage, landscaping.',
   array['site'], array['institutional'], '{}'::text[]),
  ('TPL-BLD-RF-FLAT-001', 'Flat RC Roof – Upstands, Waterproofing & Plant Deck', 'ARC',
   'Roof works on the cast roof slab: RC upstands / lift overrun, parapet, plinths, screed to falls with insulation, waterproofing, outlets and downpipes, lightning protection.',
   array['roof'], array['residential','commercial','institutional'], '{}'::text[]),
  ('TPL-BLD-PODIUM-001', 'Podium / Lobby Floor – Frame, Shopfront Façade, MEP, Finishes', 'STR',
   'The typical floor cycle plus a shopfront / curtain-wall façade and glazing: ground and podium floors of towers, offices, hotels and retail.',
   array['ground','podium','typical'], array['residential','commercial'], array['apartment','condominium','residential_tower','office_building','mixed_use_building','hotel','shopping_mall','retail_building','showroom','restaurant']),
  ('TPL-BLD-SUB-001', 'Substructure – Pad Footings, Ground Beams & Slab on Grade', 'STR',
   'For a ground floor without a basement: setting out, excavation, footings, ground beams, backfill, anti-termite, slab on grade. Used with the floor template of the same level.',
   array['ground'], array['residential','commercial','institutional'], '{}'::text[])
) as v(code, name, dom, descr, levels, sectors, btypes)
join public.plan_act_domains d on d.code = v.dom
where not exists (select 1 from public.plan_act_templates t where t.code = v.code);

-- items written out: template, seq, master, fixed days (null = from quantity), crews, note
insert into public.plan_act_template_items (template_id, seq, master_id, scope, duration_days_override, is_milestone, note, crews)
select t.id, v.seq, m.id, 'floor', v.fixed_days, false, v.note, v.crews
from (values
  ('TPL-EXT-RES-001',  1, 'STR-RC-SLAB-001', 0.5::numeric, 1, 'Setting out of drains, walls and paving'),
  ('TPL-EXT-RES-001',  2, 'EXT-DRN-001', null, 1, null),
  ('TPL-EXT-RES-001',  3, 'EXT-SEP-001', 5::numeric, 1, 'Septic tank or sewer connection'),
  ('TPL-EXT-RES-001',  4, 'EXT-UTL-001', null, 1, null),
  ('TPL-EXT-RES-001',  5, 'EXT-FEN-001', null, 1, null),
  ('TPL-EXT-RES-001',  6, 'EXT-PAV-001', null, 1, null),
  ('TPL-EXT-RES-001',  7, 'EXT-LGT-001', null, 1, null),
  ('TPL-EXT-RES-001',  8, 'EXT-LND-001', null, 1, 'Last, after hard works'),

  ('TPL-EXT-COM-001',  1, 'STR-RC-SLAB-001', 0.5::numeric, 1, null),
  ('TPL-EXT-COM-001',  2, 'EXT-DRN-001', null, 1, null),
  ('TPL-EXT-COM-001',  3, 'EXT-UTL-001', null, 1, null),
  ('TPL-EXT-COM-001',  4, 'EXT-FEN-002', null, 1, null),
  ('TPL-EXT-COM-001',  5, 'CIV-PAV-006', null, 1, 'Kerbs and edging of car park and drives'),
  ('TPL-EXT-COM-001',  6, 'EXT-PAV-002', null, 1, null),
  ('TPL-EXT-COM-001',  7, 'EXT-LGT-001', null, 1, null),
  ('TPL-EXT-COM-001',  8, 'EXT-SGN-001', 5::numeric, 1, null),
  ('TPL-EXT-COM-001',  9, 'EXT-LND-001', null, 1, null),

  ('TPL-EXT-IND-001',  1, 'STR-RC-SLAB-001', 0.5::numeric, 1, null),
  ('TPL-EXT-IND-001',  2, 'EXT-DRN-001', null, 1, 'Yard drainage, interceptors'),
  ('TPL-EXT-IND-001',  3, 'EXT-UTL-001', null, 1, null),
  ('TPL-EXT-IND-001',  4, 'EXT-FEN-002', null, 1, null),
  ('TPL-EXT-IND-001',  5, 'EXT-GH-001', 20::numeric, 1, null),
  ('TPL-EXT-IND-001',  6, 'CIV-PAV-006', null, 1, null),
  ('TPL-EXT-IND-001',  7, 'EXT-PAV-003', null, 1, null),
  ('TPL-EXT-IND-001',  8, 'EXT-LGT-001', null, 1, null),
  ('TPL-EXT-IND-001',  9, 'EXT-LND-001', null, 1, 'Landscape strips'),

  ('TPL-EXT-INS-001',  1, 'STR-RC-SLAB-001', 0.5::numeric, 1, null),
  ('TPL-EXT-INS-001',  2, 'EXT-DRN-001', null, 1, null),
  ('TPL-EXT-INS-001',  3, 'EXT-UTL-001', null, 1, null),
  ('TPL-EXT-INS-001',  4, 'EXT-FEN-002', null, 1, null),
  ('TPL-EXT-INS-001',  5, 'EXT-GH-001', 15::numeric, 1, null),
  ('TPL-EXT-INS-001',  6, 'CIV-PAV-006', null, 1, null),
  ('TPL-EXT-INS-001',  7, 'EXT-PAV-002', null, 1, 'Car park, drop-off, ambulance bay'),
  ('TPL-EXT-INS-001',  8, 'EXT-SPT-001', null, 1, 'Schools and universities'),
  ('TPL-EXT-INS-001',  9, 'EXT-LGT-001', null, 1, null),
  ('TPL-EXT-INS-001', 10, 'EXT-SGN-001', 5::numeric, 1, null),
  ('TPL-EXT-INS-001', 11, 'EXT-LND-001', null, 1, null),

  ('TPL-BLD-RF-FLAT-001',  1, 'STR-RC-SLAB-001', 0.5::numeric, 1, 'Roof slab cast with the floor below'),
  ('TPL-BLD-RF-FLAT-001',  2, 'STR-RC-WALL-001', null, 1, 'Upstands, lift overrun, stair head room'),
  ('TPL-BLD-RF-FLAT-001',  3, 'STR-RC-WALL-002', null, 1, null),
  ('TPL-BLD-RF-FLAT-001',  4, 'STR-RC-WALL-003', null, 1, null),
  ('TPL-BLD-RF-FLAT-001',  5, 'ARC-MAS-BLK-001', null, 1, 'Parapet walls'),
  ('TPL-BLD-RF-FLAT-001',  6, 'ARC-FIN-WAL-002', null, 1, null),
  ('TPL-BLD-RF-FLAT-001',  7, 'ARC-RF-007', null, 1, null),
  ('TPL-BLD-RF-FLAT-001',  8, 'ARC-RF-006', null, 1, null),
  ('TPL-BLD-RF-FLAT-001',  9, 'ARC-RF-005', null, 1, 'Turned up the parapets and plinths'),
  ('TPL-BLD-RF-FLAT-001', 10, 'ARC-RF-004', null, 1, 'Rainwater outlets and downpipes'),
  ('TPL-BLD-RF-FLAT-001', 11, 'MEP-ELE-009', 3::numeric, 1, null),
  ('TPL-BLD-RF-FLAT-001', 12, 'ARC-FIN-WAL-004', null, 1, null),

  ('TPL-BLD-PODIUM-001', 48, 'ARC-FAC-001', null, 1, 'Shopfront / curtain wall'),
  ('TPL-BLD-PODIUM-001', 49, 'ARC-DW-004', null, 1, null)
) as v(tcode, seq, master_code, fixed_days, crews, note)
join public.plan_act_templates t on t.code = v.tcode and t.version = 1 and t.status = 'draft'
join lateral (
  select mm.id from public.plan_act_masters mm
   where mm.code = v.master_code and mm.status in ('active', 'approved', 'under_review', 'draft')
   order by (mm.status = 'active') desc, mm.version desc limit 1
) m on true
where not exists (select 1 from public.plan_act_template_items i where i.template_id = t.id and i.seq = v.seq)
  and (v.tcode <> 'TPL-BLD-PODIUM-001' or not exists (select 1 from public.plan_act_template_items i where i.template_id = t.id and i.seq < 48));

-- copied recipes: the podium floor = the typical floor (seq 1-47) + façade; the substructure = the villa ground floor seq 1-14
insert into public.plan_act_template_items (template_id, seq, master_id, scope, duration_days_override, is_milestone, note, crews)
select t.id, s.seq, s.master_id, s.scope, s.duration_days_override, s.is_milestone, s.note, s.crews
from (values ('TPL-BLD-PODIUM-001', 'TPL-BLD-TYP-FLOOR-001', 1, 47), ('TPL-BLD-SUB-001', 'TPL-RES-VILLA-GF-001', 1, 14)) as v(tcode, src, lo, hi)
join public.plan_act_templates t on t.code = v.tcode and t.version = 1 and t.status = 'draft'
join lateral (select id from public.plan_act_templates where code = v.src order by (status = 'active') desc, (status = 'approved') desc, version desc limit 1) src on true
join public.plan_act_template_items s on s.template_id = src.id and s.seq between v.lo and v.hi
where not exists (select 1 from public.plan_act_template_items i where i.template_id = t.id and i.seq between v.lo and v.hi);

insert into public.plan_act_template_dependencies (template_id, predecessor_item_id, successor_item_id, relation, lag_days, is_optional)
select t.id, p2.id, s2.id, d.relation, d.lag_days, d.is_optional
from (values ('TPL-BLD-PODIUM-001', 'TPL-BLD-TYP-FLOOR-001', 47), ('TPL-BLD-SUB-001', 'TPL-RES-VILLA-GF-001', 14)) as v(tcode, src, hi)
join public.plan_act_templates t on t.code = v.tcode and t.version = 1 and t.status = 'draft'
join lateral (select id from public.plan_act_templates where code = v.src order by (status = 'active') desc, (status = 'approved') desc, version desc limit 1) src on true
join public.plan_act_template_dependencies d on d.template_id = src.id
join public.plan_act_template_items sp on sp.id = d.predecessor_item_id and sp.seq <= v.hi
join public.plan_act_template_items ss on ss.id = d.successor_item_id and ss.seq <= v.hi
join public.plan_act_template_items p2 on p2.template_id = t.id and p2.seq = sp.seq
join public.plan_act_template_items s2 on s2.template_id = t.id and s2.seq = ss.seq
where not exists (select 1 from public.plan_act_template_dependencies x where x.template_id = t.id and x.predecessor_item_id = p2.id and x.successor_item_id = s2.id);

-- the podium keeps the typical floor's level-to-level link
update public.plan_act_templates t
   set inter_level_from_seq = src.inter_level_from_seq, inter_level_to_seq = src.inter_level_to_seq,
       inter_level_relation = src.inter_level_relation, inter_level_lag_days = src.inter_level_lag_days
  from public.plan_act_templates src
 where t.code = 'TPL-BLD-PODIUM-001' and t.status = 'draft' and t.inter_level_from_seq is null
   and src.code = 'TPL-BLD-TYP-FLOOR-001' and src.version = 1;

-- written-out links: template, successor seq, predecessor seq, relation, lag
insert into public.plan_act_template_dependencies (template_id, predecessor_item_id, successor_item_id, relation, lag_days, is_optional)
select t.id, p.id, s.id, v.rel, v.lag, false
from (values
  ('TPL-EXT-RES-001', 2, 1,'fs',0), ('TPL-EXT-RES-001', 3, 1,'fs',0), ('TPL-EXT-RES-001', 4, 1,'fs',0), ('TPL-EXT-RES-001', 5, 1,'fs',0),
  ('TPL-EXT-RES-001', 6, 2,'fs',0), ('TPL-EXT-RES-001', 6, 4,'fs',0), ('TPL-EXT-RES-001', 7, 4,'fs',0),
  ('TPL-EXT-RES-001', 8, 6,'fs',0), ('TPL-EXT-RES-001', 8, 5,'fs',0), ('TPL-EXT-RES-001', 8, 7,'fs',0),

  ('TPL-EXT-COM-001', 2, 1,'fs',0), ('TPL-EXT-COM-001', 3, 1,'fs',0), ('TPL-EXT-COM-001', 4, 1,'fs',0),
  ('TPL-EXT-COM-001', 5, 2,'fs',0), ('TPL-EXT-COM-001', 5, 3,'fs',0), ('TPL-EXT-COM-001', 6, 5,'fs',0),
  ('TPL-EXT-COM-001', 7, 3,'fs',0), ('TPL-EXT-COM-001', 8, 6,'fs',0), ('TPL-EXT-COM-001', 9, 6,'fs',0), ('TPL-EXT-COM-001', 9, 4,'fs',0),

  ('TPL-EXT-IND-001', 2, 1,'fs',0), ('TPL-EXT-IND-001', 3, 1,'fs',0), ('TPL-EXT-IND-001', 4, 1,'fs',0), ('TPL-EXT-IND-001', 5, 1,'fs',0),
  ('TPL-EXT-IND-001', 6, 2,'fs',0), ('TPL-EXT-IND-001', 6, 3,'fs',0), ('TPL-EXT-IND-001', 7, 6,'fs',0),
  ('TPL-EXT-IND-001', 8, 3,'fs',0), ('TPL-EXT-IND-001', 9, 7,'fs',0), ('TPL-EXT-IND-001', 9, 4,'fs',0),

  ('TPL-EXT-INS-001', 2, 1,'fs',0), ('TPL-EXT-INS-001', 3, 1,'fs',0), ('TPL-EXT-INS-001', 4, 1,'fs',0), ('TPL-EXT-INS-001', 5, 1,'fs',0),
  ('TPL-EXT-INS-001', 6, 2,'fs',0), ('TPL-EXT-INS-001', 6, 3,'fs',0), ('TPL-EXT-INS-001', 7, 6,'fs',0), ('TPL-EXT-INS-001', 8, 2,'fs',0),
  ('TPL-EXT-INS-001', 9, 3,'fs',0), ('TPL-EXT-INS-001',10, 7,'fs',0), ('TPL-EXT-INS-001',11, 7,'fs',0), ('TPL-EXT-INS-001',11, 8,'fs',0),
  ('TPL-EXT-INS-001',11, 4,'fs',0),

  ('TPL-BLD-RF-FLAT-001', 2, 1,'fs',0), ('TPL-BLD-RF-FLAT-001', 3, 2,'fs',0), ('TPL-BLD-RF-FLAT-001', 4, 3,'fs',0),
  ('TPL-BLD-RF-FLAT-001', 5, 1,'fs',0), ('TPL-BLD-RF-FLAT-001', 6, 5,'fs',0), ('TPL-BLD-RF-FLAT-001', 7, 4,'fs',0),
  ('TPL-BLD-RF-FLAT-001', 8, 7,'fs',2), ('TPL-BLD-RF-FLAT-001', 8, 6,'fs',0), ('TPL-BLD-RF-FLAT-001', 9, 8,'fs',2),
  ('TPL-BLD-RF-FLAT-001',10, 9,'fs',0), ('TPL-BLD-RF-FLAT-001',11, 6,'fs',0), ('TPL-BLD-RF-FLAT-001',12, 6,'fs',0),
  ('TPL-BLD-RF-FLAT-001',12, 9,'fs',0),

  ('TPL-BLD-PODIUM-001', 48, 22,'fs',0), ('TPL-BLD-PODIUM-001', 49, 48,'fs',0)
) as v(tcode, succ, pred, rel, lag)
join public.plan_act_templates t on t.code = v.tcode and t.version = 1 and t.status = 'draft'
join public.plan_act_template_items s on s.template_id = t.id and s.seq = v.succ
join public.plan_act_template_items p on p.template_id = t.id and p.seq = v.pred
where not exists (
  select 1 from public.plan_act_template_dependencies d where d.template_id = t.id and d.predecessor_item_id = p.id and d.successor_item_id = s.id);

-- conditions: the flat roof only for flat roofs; the RC podium and the substructure not for steel frames
insert into public.plan_act_applicability (target_type, target_id, attribute, operator, values)
select 'template', t.id, v.attribute, v.op, v.vals
from (values
  ('TPL-BLD-RF-FLAT-001', 'roof_type', 'in', array['flat_rc']),
  ('TPL-BLD-PODIUM-001', 'structure_type', 'eq', array['reinforced_concrete']),
  ('TPL-BLD-SUB-001', 'structure_type', 'in', array['reinforced_concrete','precast','load_bearing_masonry'])
) as v(tcode, attribute, op, vals)
join public.plan_act_templates t on t.code = v.tcode and t.version = 1 and t.status = 'draft'
where not exists (select 1 from public.plan_act_applicability a where a.target_type = 'template' and a.target_id = t.id and a.attribute = v.attribute);

-- ── C. Kits ────────────────────────────────────────────────────────────────
insert into public.plan_act_kit_items(kit_id, part, template_code, building_types, sort_order)
select k.id, v.part, v.tcode, '{}'::text[],
       array_position(array['basement','ground','podium','mezzanine','typical','roof','segment','site'], v.part) * 10 + v.n
from (values
  ('KIT-RES-VILLA',     'roof',    'TPL-BLD-RF-FLAT-001', 1),
  ('KIT-RES-VILLA',     'site',    'TPL-EXT-RES-001', 0),
  ('KIT-RES-HIGHRISE',  'ground',  'TPL-BLD-PODIUM-001', 0),
  ('KIT-RES-HIGHRISE',  'podium',  'TPL-BLD-PODIUM-001', 0),
  ('KIT-RES-HIGHRISE',  'roof',    'TPL-BLD-RF-FLAT-001', 0),
  ('KIT-RES-HIGHRISE',  'site',    'TPL-EXT-COM-001', 0),
  ('KIT-COM-OFFICE',    'ground',  'TPL-BLD-PODIUM-001', 0),
  ('KIT-COM-OFFICE',    'podium',  'TPL-BLD-PODIUM-001', 0),
  ('KIT-COM-OFFICE',    'roof',    'TPL-BLD-RF-FLAT-001', 0),
  ('KIT-COM-OFFICE',    'site',    'TPL-EXT-COM-001', 0),
  ('KIT-COM-RETAIL',    'ground',  'TPL-BLD-SUB-001', 0),
  ('KIT-COM-RETAIL',    'ground',  'TPL-BLD-PODIUM-001', 1),
  ('KIT-COM-RETAIL',    'ground',  'TPL-IND-WH-GF-001', 2),
  ('KIT-COM-RETAIL',    'typical', 'TPL-BLD-PODIUM-001', 0),
  ('KIT-COM-RETAIL',    'roof',    'TPL-BLD-RF-FLAT-001', 0),
  ('KIT-COM-RETAIL',    'roof',    'TPL-IND-RF-001', 1),
  ('KIT-COM-RETAIL',    'site',    'TPL-EXT-COM-001', 0),
  ('KIT-IND-FACTORY',   'site',    'TPL-EXT-IND-001', 0),
  ('KIT-IND-WAREHOUSE', 'site',    'TPL-EXT-IND-001', 0),
  ('KIT-INS-EDU',       'roof',    'TPL-BLD-RF-FLAT-001', 0),
  ('KIT-INS-EDU',       'site',    'TPL-EXT-INS-001', 0),
  ('KIT-INS-HEALTH',    'roof',    'TPL-BLD-RF-FLAT-001', 0),
  ('KIT-INS-HEALTH',    'site',    'TPL-EXT-INS-001', 0),
  ('KIT-INS-CIVIC',     'roof',    'TPL-BLD-RF-FLAT-001', 1),
  ('KIT-INS-CIVIC',     'site',    'TPL-EXT-INS-001', 0)
) as v(kcode, part, tcode, n)
join public.plan_act_kits k on k.code = v.kcode and k.version = 1 and k.status = 'draft'
where not exists (select 1 from public.plan_act_kit_items i where i.kit_id = k.id and i.part = v.part and i.template_code = v.tcode);

update public.plan_act_kits set description = v.descr
from (values
  ('KIT-RES-HIGHRISE', 'Apartment and condominium towers: basement, podium / lobby floors, typical floors, flat roof, external works and car park.'),
  ('KIT-COM-OFFICE',   'Framed commercial tower: basement, podium / lobby floors, typical floors, flat roof, external works and car park.'),
  ('KIT-COM-RETAIL',   'Retail and showrooms: slab-on-grade substructure, RC podium floors or a steel shed (by structure type), flat or metal roof (by roof type), car park.')
) as v(code, descr)
where plan_act_kits.code = v.code and plan_act_kits.version = 1 and plan_act_kits.status = 'draft';
