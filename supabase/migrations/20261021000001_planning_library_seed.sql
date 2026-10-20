-- Planning library data for environments built from migrations (production): the company Activity Library,
-- Planning <-> QS bridge standards, the typical floor template and the ARC/MEP productivity norms.
-- Same content as supabase/seeds/seed_activity_library.sql, seed_planning_qs_bridge.sql,
-- seed_typical_floor_template.sql and seed_norms_arc_mep.sql (2026-10-21), in dependency order.
-- Every part is idempotent: it adds what is missing and never deletes rows a user added or edited.
-- All masters, templates and norms are DRAFT company assumptions; review before commercial use.


-- ════════════════ from supabase/seeds/seed_activity_library.sql ════════════════
-- Activity Library seed (idempotent, re-runnable). Company-wide master data.
-- Structure > Reinforced Concrete (8 families, Slab fully detailed), Architectural, MEP.
-- Productivity figures are DRAFT-quality company assumptions (basis_note says so): review before commercial use.
do $seed$
declare
  r record;
  d_id uuid; c_id uuid; f_id uuid; m_id uuid;
begin
  -- hierarchy ------------------------------------------------------------
  create temp table _fam(dom text, dom_name text, cat text, cat_name text, fam text, fam_name text, so int) on commit drop;
  insert into _fam values
    ('STR','Structure','RC','Reinforced Concrete','COL','Column',1),
    ('STR','Structure','RC','Reinforced Concrete','WALL','Shear Wall',2),
    ('STR','Structure','RC','Reinforced Concrete','CORE','Core Wall',3),
    ('STR','Structure','RC','Reinforced Concrete','BEAM','Beam',4),
    ('STR','Structure','RC','Reinforced Concrete','SLAB','Slab',5),
    ('STR','Structure','RC','Reinforced Concrete','STAIR','Stair',6),
    ('STR','Structure','RC','Reinforced Concrete','RAMP','Ramp',7),
    ('STR','Structure','RC','Reinforced Concrete','FDN','Foundation',8),
    ('ARC','Architectural','FIN','Finishes','FLR','Floor Finishes',1),
    ('ARC','Architectural','FIN','Finishes','CLG','Ceiling',2),
    ('ARC','Architectural','FIN','Finishes','WAL','Wall Finishes',3),
    ('ARC','Architectural','OPN','Openings','DW','Doors & Windows',1),
    ('MEP','MEP','ELE','Electrical','ELE','Electrical',1),
    ('MEP','MEP','MECH','Mechanical','HVAC','HVAC',1),
    ('MEP','MEP','PLB','Plumbing & Drainage','PLB','Plumbing',1),
    ('MEP','MEP','FP','Fire Protection','FP','Fire Protection',1);

  for r in select * from _fam loop
    insert into plan_act_domains(code, name, sort_order)
      values (r.dom, r.dom_name, case r.dom when 'STR' then 1 when 'ARC' then 2 else 3 end)
      on conflict (code) do nothing;
    select id into d_id from plan_act_domains where code = r.dom;
    insert into plan_act_categories(domain_id, code, name) values (d_id, r.cat, r.cat_name)
      on conflict (domain_id, code) do nothing;
    select id into c_id from plan_act_categories where domain_id = d_id and code = r.cat;
    insert into plan_act_families(category_id, code, name, sort_order) values (c_id, r.fam, r.fam_name, r.so)
      on conflict (category_id, code) do nothing;
  end loop;

  -- activity masters --------------------------------------------------------
  create temp table _m(fam text, code text, name text, unit text, disc text, wtype text) on commit drop;
  insert into _m values
    -- Slab
    ('SLAB','STR-RC-SLAB-001','Survey / Setting Out','m²','STR','Survey'),
    ('SLAB','STR-RC-SLAB-002','Slab Formwork Installation','m²','STR','Formwork'),
    ('SLAB','STR-RC-SLAB-003','MEP Embedded Installation','lot','STR','Embedded Works'),
    ('SLAB','STR-RC-SLAB-004','Slab Bottom Reinforcement','ton','STR','Reinforcement'),
    ('SLAB','STR-RC-SLAB-005','Slab Top Reinforcement','ton','STR','Reinforcement'),
    ('SLAB','STR-RC-SLAB-006','Pre-Pour Inspection','lot','STR','Inspection'),
    ('SLAB','STR-RC-SLAB-007','Concrete Casting','m³','STR','Concrete Works'),
    ('SLAB','STR-RC-SLAB-008','Concrete Finishing','m²','STR','Concrete Works'),
    ('SLAB','STR-RC-SLAB-009','Concrete Curing','m²','STR','Concrete Works'),
    ('SLAB','STR-RC-SLAB-010','Formwork Stripping','m²','STR','Formwork'),
    -- Vertical elements (needed by the typical floor template steps 02-04)
    ('COL','STR-RC-COL-001','Column Reinforcement','ton','STR','Reinforcement'),
    ('COL','STR-RC-COL-002','Column Formwork Installation','m²','STR','Formwork'),
    ('COL','STR-RC-COL-003','Column Concrete Casting','m³','STR','Concrete Works'),
    ('WALL','STR-RC-WALL-001','Shear Wall Reinforcement','ton','STR','Reinforcement'),
    ('WALL','STR-RC-WALL-002','Shear Wall Formwork Installation','m²','STR','Formwork'),
    ('WALL','STR-RC-WALL-003','Shear Wall Concrete Casting','m³','STR','Concrete Works'),
    ('CORE','STR-RC-CORE-001','Core Wall Reinforcement','ton','STR','Reinforcement'),
    ('CORE','STR-RC-CORE-002','Core Wall Formwork Installation','m²','STR','Formwork'),
    ('CORE','STR-RC-CORE-003','Core Wall Concrete Casting','m³','STR','Concrete Works'),
    -- Architectural
    ('FLR','ARC-FIN-FLR-001','Floor Substrate Preparation','m²','ARC','Finishes'),
    ('FLR','ARC-FIN-FLR-002','Screed / Leveling Compound','m²','ARC','Finishes'),
    ('FLR','ARC-FIN-FLR-003','Waterproofing Membrane (Wet Areas)','m²','ARC','Waterproofing'),
    ('FLR','ARC-FIN-FLR-004','Tile / Stone Flooring Installation','m²','ARC','Finishes'),
    ('FLR','ARC-FIN-FLR-005','Vinyl / LVT Flooring Installation','m²','ARC','Finishes'),
    ('FLR','ARC-FIN-FLR-006','Timber / Engineered Flooring','m²','ARC','Finishes'),
    ('FLR','ARC-FIN-FLR-007','Floor Skirting / Base Installation','m','ARC','Finishes'),
    ('FLR','ARC-FIN-FLR-008','Floor Protection & Cleaning','m²','ARC','Finishes'),
    ('CLG','ARC-FIN-CLG-001','Ceiling Framing / Suspension System','m²','ARC','Finishes'),
    ('CLG','ARC-FIN-CLG-002','Acoustic Ceiling Tile Installation','m²','ARC','Finishes'),
    ('CLG','ARC-FIN-CLG-003','Gypsum Board Ceiling','m²','ARC','Finishes'),
    ('CLG','ARC-FIN-CLG-004','Ceiling Access Panel Installation','nos','ARC','Finishes'),
    ('CLG','ARC-FIN-CLG-005','Ceiling Painting / Finishing','m²','ARC','Painting'),
    ('WAL','ARC-FIN-WAL-001','Wall Substrate Preparation','m²','ARC','Finishes'),
    ('WAL','ARC-FIN-WAL-002','Plaster / Render Application','m²','ARC','Plastering'),
    ('WAL','ARC-FIN-WAL-003','Wall Tiling (Wet Areas)','m²','ARC','Finishes'),
    ('WAL','ARC-FIN-WAL-004','Paint / Coating Application','m²','ARC','Painting'),
    ('WAL','ARC-FIN-WAL-005','Wallpaper / Feature Wall','m²','ARC','Finishes'),
    ('WAL','ARC-FIN-WAL-006','Wall Protection & Touch-up','m²','ARC','Finishes'),
    ('DW','ARC-DW-001','Door Frame Installation','nos','ARC','Openings'),
    ('DW','ARC-DW-002','Door Leaf & Hardware Installation','nos','ARC','Openings'),
    ('DW','ARC-DW-003','Window Frame Installation','nos','ARC','Openings'),
    ('DW','ARC-DW-004','Glazing Installation','m²','ARC','Openings'),
    ('DW','ARC-DW-005','Door / Window Sealant & Finishing','nos','ARC','Openings'),
    -- MEP
    ('ELE','MEP-ELE-001','Cable Tray / Conduit Installation','m','MEP','Electrical'),
    ('ELE','MEP-ELE-002','Power Cabling (Main & Sub-mains)','m','MEP','Electrical'),
    ('ELE','MEP-ELE-003','Lighting & Small Power Wiring','point','MEP','Electrical'),
    ('ELE','MEP-ELE-004','DB / Switchboard Installation','nos','MEP','Electrical'),
    ('ELE','MEP-ELE-005','Lighting Fixture Installation','nos','MEP','Electrical'),
    ('ELE','MEP-ELE-006','Socket & Switch Installation','nos','MEP','Electrical'),
    ('ELE','MEP-ELE-007','Earthing & Bonding','lot','MEP','Electrical'),
    ('ELE','MEP-ELE-008','Electrical Testing & Commissioning','lot','MEP','Commissioning'),
    ('HVAC','MEP-HVAC-001','Ductwork Fabrication & Installation','m²','MEP','HVAC'),
    ('HVAC','MEP-HVAC-002','AHU / FCU Installation','nos','MEP','HVAC'),
    ('HVAC','MEP-HVAC-003','Chilled Water Pipework','m','MEP','HVAC'),
    ('HVAC','MEP-HVAC-004','Diffuser / Grille Installation','nos','MEP','HVAC'),
    ('HVAC','MEP-HVAC-005','Insulation (Duct & Pipe)','m²','MEP','HVAC'),
    ('HVAC','MEP-HVAC-006','HVAC Controls & BMS Points','point','MEP','HVAC'),
    ('HVAC','MEP-HVAC-007','HVAC Testing & Balancing (TAB)','lot','MEP','Commissioning'),
    ('PLB','MEP-PLB-001','Cold Water Pipework Installation','m','MEP','Plumbing'),
    ('PLB','MEP-PLB-002','Hot Water Pipework Installation','m','MEP','Plumbing'),
    ('PLB','MEP-PLB-003','Soil & Waste Pipework','m','MEP','Plumbing'),
    ('PLB','MEP-PLB-004','Sanitary Fixtures Installation','nos','MEP','Plumbing'),
    ('PLB','MEP-PLB-005','Water Heater / Calorifier Installation','nos','MEP','Plumbing'),
    ('PLB','MEP-PLB-006','Plumbing Pressure Test & Flushing','lot','MEP','Commissioning'),
    ('FP','MEP-FP-001','Fire Sprinkler Pipework','m','MEP','Fire Protection'),
    ('FP','MEP-FP-002','Sprinkler Head Installation','nos','MEP','Fire Protection'),
    ('FP','MEP-FP-003','Fire Hose Reel / Hydrant Installation','nos','MEP','Fire Protection'),
    ('FP','MEP-FP-004','Fire Alarm Cabling & Devices','point','MEP','Fire Protection'),
    ('FP','MEP-FP-005','Fire Suppression System (Clean Agent)','lot','MEP','Fire Protection'),
    ('FP','MEP-FP-006','Fire System Testing & Commissioning','lot','MEP','Commissioning');

  for r in select m.*, f.dom from _m m join _fam f on f.fam = m.fam loop
    select fa.id, fa.category_id, ca.domain_id into f_id, c_id, d_id
      from plan_act_families fa
      join plan_act_categories ca on ca.id = fa.category_id
      join plan_act_domains dm on dm.id = ca.domain_id
      join _fam x on x.fam = fa.code and x.cat = ca.code and x.dom = dm.code
      where fa.code = r.fam and dm.code = r.dom;
    insert into plan_act_masters(code, name, domain_id, category_id, family_id, discipline, work_type,
                                 default_unit, status, version, owner, source, effective_date, applicable_project_types)
    values (r.code, r.name, d_id, c_id, f_id, r.disc, r.wtype, r.unit, 'active', 1,
            'Planning Standards', 'Company Standard (initial seed)', date '2026-10-01',
            array['high_rise','building'])
    on conflict (code, version) do nothing;
  end loop;

  -- Slab concrete detail (methods, norms, factors, resources, quantity rule, requirements) ----------
  select id into m_id from plan_act_masters where code = 'STR-RC-SLAB-007' and version = 1;

  insert into plan_act_methods(master_id, code, name, description, constraints_note, is_default, sort_order) values
    (m_id,'PUMP','Pumped Concrete','Ready-mix delivered by concrete pump to the formwork.','Needs pump access and exclusion zone.',true,1),
    (m_id,'CRANE','Crane + Concrete Bucket','Bucket lifted by tower crane; suitable for lower volumes.','Competes for tower crane hook time.',false,2),
    (m_id,'DIRECT','Direct Truck Discharge','Truck chute discharges directly into formwork.','Ground level / ramp access only.',false,3)
  on conflict (master_id, code) do nothing;

  -- norms: crew-day rate given directly (output_per_day); labour constant derived = crew hours / output
  insert into plan_productivity_norms(project_id, code, name, trade, discipline, activity_key, unit,
      labour_constant_hr_per_unit, hours_per_day_basis, source, basis_note, status, activity_master_id, method_id, output_per_day)
  select null, 'ACT-STR-RC-SLAB-007-'||me.code, 'RC Slab Concrete Casting - '||me.name, 'Concrete', 'STR', 'STR-RC-SLAB-007', 'm³',
         round((12 * 10 / v.rate)::numeric, 3), 10, 'manual',
         'ASSUMPTION: company starting figure (12-person crew, 10 h day); calibrate from site productivity logs before commercial use.',
         'draft', m_id, me.id, v.rate
  from plan_act_methods me
  join (values ('PUMP',60::numeric),('CRANE',35),('DIRECT',80)) v(code, rate) on v.code = me.code
  where me.master_id = m_id
  on conflict do nothing;

  insert into plan_act_productivity_factors(norm_id, factor_type, label, value, condition_note, sort_order)
  select n.id, f.t, f.t, f.v, f.note, f.so
  from plan_productivity_norms n
  cross join (values
    ('height',0.95::numeric,'Above level 20',1),
    ('access',1.00,'Normal truck/pump access',2),
    ('crew',1.05,'Experienced crew',3),
    ('method',1.00,null,4),
    ('weather',1.00,null,5),
    ('site_condition',0.98,'Congested site',6)) f(t, v, note, so)
  where n.activity_master_id = m_id
  on conflict (norm_id, factor_type, label) do nothing;

  insert into plan_productivity_norm_resources(norm_id, kind, role_label, workers_per_crew, hours_per_day, sort_order, allocation_rule, is_optional)
  select n.id, x.kind, x.role, x.qty, 10, x.so, x.rule, x.opt
  from plan_productivity_norms n
  cross join (values
    ('labor','Site Engineer',1::numeric,1,'per_activity',false),
    ('labor','Foreman',1,2,'per_activity',false),
    ('labor','Concrete Worker',8,3,'per_crew',false),
    ('labor','General Worker',4,4,'per_crew',false),
    ('equipment','Concrete Vibrator',2,5,'per_crew',false),
    ('material','Ready-Mix Concrete',1,7,'quantity_driven',false)) x(kind, role, qty, so, rule, opt)
  where n.activity_master_id = m_id and not exists (
    select 1 from plan_productivity_norm_resources e where e.norm_id = n.id);
  insert into plan_productivity_norm_resources(norm_id, kind, role_label, workers_per_crew, sort_order, allocation_rule, is_optional)
  select n.id, 'equipment', 'Concrete Pump', 1, 6, 'per_pour', false
  from plan_productivity_norms n join plan_act_methods me on me.id = n.method_id
  where n.activity_master_id = m_id and me.code = 'PUMP'
    and not exists (select 1 from plan_productivity_norm_resources e where e.norm_id = n.id and e.role_label = 'Concrete Pump');
  insert into plan_productivity_norm_resources(norm_id, kind, role_label, workers_per_crew, sort_order, allocation_rule, is_optional)
  select n.id, 'equipment', 'Tower Crane', 1, 6, 'per_activity', true
  from plan_productivity_norms n join plan_act_methods me on me.id = n.method_id
  where n.activity_master_id = m_id and me.code = 'CRANE'
    and not exists (select 1 from plan_productivity_norm_resources e where e.norm_id = n.id and e.role_label = 'Tower Crane');

  insert into plan_act_quantity_rules(master_id, name, metric_code, unit, provider_priority, deduction_metrics, addition_metrics, note)
  values (m_id, 'RC Slab Volume', 'slab_volume', 'm³', array['bim','boq','manual'],
          array['slab_opening_volume'], array['approved_additional_volume'], 'Quantity = BIM slab volume - openings + approved additional volume')
  on conflict (master_id, name) do nothing;

  insert into plan_act_requirements(master_id, kind, title, is_mandatory, doc_type, sort_order)
  select m_id, x.kind, x.title, x.mand, x.dt, x.so
  from (values
    ('qaqc','Pre-pour inspection checklist completed and signed',true,null,1),
    ('qaqc','Concrete delivery ticket verified (slump, temperature, grade)',true,null,2),
    ('qaqc','Cube / cylinder samples taken as per specification',true,null,3),
    ('hold_point','Client / Consultant approval before pour',true,null,4),
    ('hse','Edge protection and fall prevention in place',true,null,1),
    ('hse','Concrete pump exclusion zone established',true,null,2),
    ('hse','Toolbox talk completed before pour starts',true,null,3),
    ('document','Method Statement - Concrete Works',true,'MS',1),
    ('document','ITP - Structural Concrete',true,'ITP',2),
    ('document','Concrete Pour Card',true,'Form',3)) x(kind, title, mand, dt, so)
  where not exists (select 1 from plan_act_requirements q where q.master_id = m_id);


  -- Area-driven slab steps: company DRAFT standards + quantity rule (slab area; the 'calculated' provider derives it
  -- from the level GFA, which is an approximation the rule note states). Crew sizes / outputs are starting assumptions.
  for r in select * from (values
      ('STR-RC-SLAB-002','Slab Formwork Installation',120::numeric,'Formwork Carpenter',8::numeric,'General Worker',2::numeric,'Aluminium/system formwork gang'),
      ('STR-RC-SLAB-008','Concrete Finishing',400::numeric,'Concrete Finisher',4::numeric,'General Worker',2::numeric,'Power-float finishing gang'),
      ('STR-RC-SLAB-009','Concrete Curing',1500::numeric,'General Worker',2::numeric,null,0::numeric,'Curing compound / wet curing'),
      ('STR-RC-SLAB-010','Formwork Stripping',250::numeric,'Formwork Carpenter',6::numeric,'General Worker',2::numeric,'Strip and clean gang')
    ) v(mcode, nm, rate, role1, q1, role2, q2, note)
  loop
    select id into m_id from plan_act_masters where code = r.mcode and version = 1;
    insert into plan_productivity_norms(project_id, code, name, trade, discipline, activity_key, unit,
        labour_constant_hr_per_unit, hours_per_day_basis, source, basis_note, status, activity_master_id, output_per_day)
    values (null, 'ACT-' || r.mcode, r.nm, 'Concrete', 'STR', r.mcode, 'm²',
        round(((r.q1 + r.q2) * 10 / r.rate)::numeric, 3), 10, 'manual',
        'ASSUMPTION: company starting figure (' || r.note || ', 10 h day); calibrate from site productivity logs before commercial use.',
        'draft', m_id, r.rate)
    on conflict do nothing;
    insert into plan_productivity_norm_resources(norm_id, kind, role_label, workers_per_crew, hours_per_day, sort_order, allocation_rule)
    select n.id, 'labor', x.role, x.qty, 10, x.so, 'per_crew'
    from plan_productivity_norms n
    cross join (values (r.role1, r.q1, 1), (r.role2, r.q2, 2)) x(role, qty, so)
    where n.project_id is null and n.code = 'ACT-' || r.mcode and x.role is not null
      and not exists (select 1 from plan_productivity_norm_resources e where e.norm_id = n.id);
    insert into plan_act_quantity_rules(master_id, name, metric_code, unit, provider_priority, note)
    values (m_id, 'Slab area', 'slab_area', 'm²', array['bim','boq','manual','calculated'],
            'Slab area. Calculated fallback = level GFA (approximation: ignores voids and balconies; replace with BIM/BOQ when available).')
    on conflict (master_id, name) do nothing;
  end loop;

  -- standard logic chain within Slab (recommendation) -------------------------------------------------
  insert into plan_act_logic_rules(predecessor_master_id, successor_master_id, relation, lag_days)
  select p.id, s.id, 'fs', 0
  from (values ('STR-RC-SLAB-001','STR-RC-SLAB-002'),('STR-RC-SLAB-002','STR-RC-SLAB-003'),
               ('STR-RC-SLAB-003','STR-RC-SLAB-004'),('STR-RC-SLAB-004','STR-RC-SLAB-005'),
               ('STR-RC-SLAB-005','STR-RC-SLAB-006'),('STR-RC-SLAB-006','STR-RC-SLAB-007'),
               ('STR-RC-SLAB-007','STR-RC-SLAB-008'),('STR-RC-SLAB-008','STR-RC-SLAB-009')) l(a, b)
  join plan_act_masters p on p.code = l.a and p.version = 1
  join plan_act_masters s on s.code = l.b and s.version = 1
  on conflict (predecessor_master_id, successor_master_id) do nothing;
  insert into plan_act_logic_rules(predecessor_master_id, successor_master_id, relation, lag_days, note)
  select p.id, s.id, 'fs', 3, 'Strip after minimum curing / strength gain (lag in days)'
  from plan_act_masters p, plan_act_masters s
  where p.code = 'STR-RC-SLAB-009' and s.code = 'STR-RC-SLAB-010' and p.version = 1 and s.version = 1
  on conflict (predecessor_master_id, successor_master_id) do nothing;
end
$seed$;

-- Template TPL-STR-HR-RC-FLOOR-001 (separate block so it is easy to re-run) -------------------------
do $tpl$
declare t_id uuid; st text;
begin
  select id, status into t_id, st from plan_act_templates where code = 'TPL-STR-HR-RC-FLOOR-001' and version = 1;
  if t_id is not null then return; end if;

  insert into plan_act_templates(code, name, description, domain_id, status, version, applies_to_level_types, owner)
  select 'TPL-STR-HR-RC-FLOOR-001', 'Typical High-Rise RC Floor Cycle',
         'Typical floor cycle for a high-rise reinforced concrete building with aluminium formwork: vertical elements, then slab.',
         id, 'draft', 1, array['typical'], 'Planning Standards'
  from plan_act_domains where code = 'STR'
  returning id into t_id;

  insert into plan_act_template_items(template_id, seq, master_id, scope, method_id, duration_days_override, note)
  select t_id, x.seq, m.id, x.scope,
         (select me.id from plan_act_methods me where me.master_id = m.id and me.is_default limit 1),
         x.dur, x.note
  from (values
    (1,'STR-RC-SLAB-001','floor','Survey / setting out for the floor',0.5),
    (2,'STR-RC-WALL-001','floor','Column / wall reinforcement (shear wall master used as proxy)',2),
    (3,'STR-RC-WALL-002','floor','Column / wall formwork',2),
    (4,'STR-RC-WALL-003','floor','Column / wall concrete',1),
    (5,'STR-RC-SLAB-002','floor',null,null::numeric),
    (6,'STR-RC-SLAB-003','floor',null,1),
    (7,'STR-RC-SLAB-004','floor',null,1),
    (8,'STR-RC-SLAB-005','floor',null,1),
    (9,'STR-RC-SLAB-006','floor',null,0.5),
    (10,'STR-RC-SLAB-007','floor',null,null::numeric),
    (11,'STR-RC-SLAB-008','floor',null,null::numeric),
    (12,'STR-RC-SLAB-009','floor',null,null::numeric),
    (13,'STR-RC-SLAB-010','floor',null,null::numeric)) x(seq, code, scope, note, dur)
  join plan_act_masters m on m.code = x.code and m.version = 1;

  -- Item durations are standard template rules (working days) except concrete casting, which is calculated from
  -- quantity / productivity. Starting figures: calibrate from site data.
  -- chain FS between consecutive items; strip after curing carries a 3-day lag
  insert into plan_act_template_dependencies(template_id, predecessor_item_id, successor_item_id, relation, lag_days)
  select t_id, a.id, b.id, 'fs', case when b.seq = 13 then 3 else 0 end
  from plan_act_template_items a
  join plan_act_template_items b on b.template_id = a.template_id and b.seq = a.seq + 1
  where a.template_id = t_id;

  insert into plan_act_applicability(target_type, target_id, attribute, operator, values) values
    ('template', t_id, 'project_type', 'in', array['high_rise']),
    ('template', t_id, 'structure_type', 'eq', array['reinforced_concrete']),
    ('template', t_id, 'formwork_type', 'in', array['aluminum','conventional']),
    ('template', t_id, 'building_component', 'in', array['typical_floor']);

  -- publish: draft -> under_review -> approved -> active (lifecycle guard writes the history)
  update plan_act_templates set status = 'under_review' where id = t_id;
  update plan_act_templates set status = 'approved' where id = t_id;
  update plan_act_templates set status = 'active' where id = t_id;
end
$tpl$;


-- ════════════════ from supabase/seeds/seed_planning_qs_bridge.sql ════════════════
-- Seed: Planning <-> QS bridge, Phase 1 standards (doc 21). Idempotent: re-running adds what is missing and
-- re-applies master attributes; it never deletes rows a user added or edited.
-- Source: docs/Standard_WBS_Planning_and_QS_Modules.xlsx (sheets 01, 03, 04) + the QS Element Library and the
-- PJR-2026-003 tender BOQ classification (checked 2026-10-20).
-- Everything numeric here is an ASSUMPTION / indicative company starting figure: masters are draft, norms are
-- draft, and every assumed split says so in its note.
-- Depends on: seed_activity_library.sql, migration 20261020000003_planning_qs_bridge.sql.

-- ── A. Category / family for masonry ───────────────────────────────────────
insert into public.plan_act_categories (domain_id, code, name, sort_order)
select d.id, 'MAS', 'Masonry & Partitions', 5 from public.plan_act_domains d where d.code = 'ARC'
on conflict (domain_id, code) do nothing;

insert into public.plan_act_families (category_id, code, name, sort_order)
select c.id, 'BLK', 'Blockwork', 1
from public.plan_act_categories c join public.plan_act_domains d on d.id = c.domain_id
where d.code = 'ARC' and c.code = 'MAS'
on conflict (category_id, code) do nothing;

-- ── B. Draft masters for elements the BOQ measures but the library lacked ─────
insert into public.plan_act_masters (code, name, description, domain_id, category_id, family_id, discipline, work_type, default_unit, status, version, owner, source)
select v.code, v.name, v.descr, d.id, c.id, f.id, v.discipline, v.work_type, v.unit, 'draft', 1, 'Planning Manager', 'Standard WBS workbook 2026-10-20'
from (values
  ('STR-RC-BEAM-001',  'Beam Reinforcement',          'Fix beam reinforcement',              'STR', 'RC',  'BEAM',  'STR', 'Reinforcement',  'ton'),
  ('STR-RC-BEAM-002',  'Beam Formwork Installation',  'Erect beam side and soffit formwork', 'STR', 'RC',  'BEAM',  'STR', 'Formwork',       'm²'),
  ('STR-RC-BEAM-003',  'Beam Concrete Casting',       'Cast beam concrete',                  'STR', 'RC',  'BEAM',  'STR', 'Concrete Works', 'm³'),
  ('STR-RC-STAIR-001', 'Stair Reinforcement',         'Fix staircase reinforcement',         'STR', 'RC',  'STAIR', 'STR', 'Reinforcement',  'ton'),
  ('STR-RC-STAIR-002', 'Stair Formwork Installation', 'Erect staircase formwork',            'STR', 'RC',  'STAIR', 'STR', 'Formwork',       'm²'),
  ('STR-RC-STAIR-003', 'Stair Concrete Casting',      'Cast staircase concrete',             'STR', 'RC',  'STAIR', 'STR', 'Concrete Works', 'm³'),
  ('STR-RC-FDN-001',   'Pile Cap Reinforcement',      'Fix pile cap / stump reinforcement',  'STR', 'RC',  'FDN',   'STR', 'Reinforcement',  'ton'),
  ('STR-RC-FDN-002',   'Pile Cap Formwork',           'Erect pile cap / stump formwork',     'STR', 'RC',  'FDN',   'STR', 'Formwork',       'm²'),
  ('STR-RC-FDN-003',   'Pile Cap Concrete Casting',   'Cast pile cap / stump concrete',      'STR', 'RC',  'FDN',   'STR', 'Concrete Works', 'm³'),
  ('ARC-MAS-BLK-001',  'Blockwork / Masonry Wall',    'Lay block / brick walls and partitions', 'ARC', 'MAS', 'BLK', 'ARC', 'Masonry',     'm²')
) as v(code, name, descr, dom, cat, fam, discipline, work_type, unit)
join public.plan_act_domains d on d.code = v.dom
join public.plan_act_categories c on c.domain_id = d.id and c.code = v.cat
join public.plan_act_families f on f.category_id = c.id and f.code = v.fam
where not exists (select 1 from public.plan_act_masters m where m.code = v.code);

-- ── C. Master planning attributes: work group, duration basis ────────────────
update public.plan_act_masters m
set default_work_group = case
      when m.code like 'STR-RC-FDN-%' then 'FD'
      when m.code like 'STR-%' then 'ST'
      when m.code like 'ARC-%' then 'AR'
      when m.code in ('MEP-ELE-008', 'MEP-FP-006', 'MEP-HVAC-007', 'MEP-PLB-006') then 'QA'
      when m.code in ('MEP-ELE-001', 'MEP-ELE-007', 'MEP-FP-001', 'MEP-HVAC-001', 'MEP-HVAC-003', 'MEP-HVAC-005',
                      'MEP-PLB-001', 'MEP-PLB-002', 'MEP-PLB-003') then 'M1'
      when m.code like 'MEP-%' then 'M2'
      else m.default_work_group
    end,
    duration_basis = case
      -- per-floor lot activities: standard days, not quantity (workbook "Duration Driver? = No")
      when m.code in ('STR-RC-SLAB-001', 'STR-RC-SLAB-003', 'STR-RC-SLAB-006', 'MEP-ELE-007', 'MEP-ELE-008',
                      'MEP-FP-005', 'MEP-FP-006', 'MEP-HVAC-006', 'MEP-HVAC-007', 'MEP-PLB-006') then 'fixed'
      else 'quantity'
    end
-- first run only: once a master has a work group, its attributes belong to the library managers
where m.default_work_group is null;

-- Default Activity Step Templates (finishes and MEP only: structural masters are already split into
-- rebar / formwork / concrete activities, so a whole-element step template would double count).
update public.plan_act_masters m
set default_step_template_id = t.id
from (values
  ('ARC-MAS-BLK-001', 'Blockwork / Masonry – Typical Floor'),
  ('ARC-FIN-WAL-002', 'Plastering (Internal) – Typical Floor'),
  ('ARC-FIN-WAL-003', 'Wall Tiling – Typical Floor'),
  ('ARC-FIN-WAL-004', 'Internal Painting – Typical Floor'),
  ('ARC-FIN-FLR-002', 'Screed – Typical Floor'),
  ('ARC-FIN-FLR-003', 'Waterproofing (Wet Areas) – Typical Floor'),
  ('ARC-FIN-FLR-004', 'Flooring – Typical Floor'),
  ('ARC-FIN-CLG-003', 'Ceiling – Typical Floor'),
  ('ARC-DW-001',      'Door Frames – Typical Floor'),
  ('ARC-DW-002',      'Doors (Leaf + Ironmongery) – Typical Floor'),
  ('ARC-DW-003',      'Windows / Glazing – Typical Floor'),
  ('MEP-ELE-001',     'Electrical Conduits – Typical Floor'),
  ('MEP-ELE-002',     'Cable Pulling – Typical Floor'),
  ('MEP-ELE-004',     'DB Installation – Typical Floor'),
  ('MEP-ELE-005',     'Lighting Installation – Typical Floor'),
  ('MEP-ELE-006',     'Switches & Sockets – Typical Floor'),
  ('MEP-FP-001',      'Fire Fighting Pipes – Typical Floor'),
  ('MEP-FP-002',      'Sprinkler Heads – Typical Floor'),
  ('MEP-HVAC-001',    'HVAC Ductwork – Typical Floor'),
  ('MEP-HVAC-002',    'HVAC Equipment – Typical Floor'),
  ('MEP-HVAC-003',    'HVAC Pipes – Typical Floor'),
  ('MEP-PLB-001',     'Plumbing Pipes – Typical Floor'),
  ('MEP-PLB-003',     'Drainage Pipes – Typical Floor'),
  ('MEP-PLB-004',     'Plumbing Fixtures – Typical Floor')
) as v(code, template_name)
join public.activity_step_template_master t on t.template_name = v.template_name
where m.code = v.code and m.default_step_template_id is null;

-- ── D. Quantity rules (metric each master measures) ─────────────────────────
-- Runs as the database owner, so the "frozen children" guard lets the seed add rules to active masters.
insert into public.plan_act_quantity_rules (master_id, name, metric_code, unit, provider_priority, deduction_metrics, addition_metrics, note)
select m.id, v.rule_name, v.metric, v.unit, array['bim','boq','manual'], '{}', '{}', v.note
from (values
  ('STR-RC-COL-001',   'Column rebar',          'column_rebar',       't',  'BOQ Structural Column > Rebar (kg x 0.001)'),
  ('STR-RC-COL-002',   'Column formwork',       'column_formwork',    'm²', 'BOQ Structural Column > Formwork'),
  ('STR-RC-COL-003',   'Column concrete',       'column_volume',      'm³', 'BOQ Structural Column > Concrete'),
  ('STR-RC-WALL-001',  'Shear wall rebar',      'wall_rebar',         't',  'BOQ Structural Wall > Rebar (kg x 0.001)'),
  ('STR-RC-WALL-002',  'Shear wall formwork',   'wall_area',          'm²', 'BOQ Structural Wall > Formwork'),
  ('STR-RC-WALL-003',  'Shear wall concrete',   'wall_volume',        'm³', 'BOQ Structural Wall > Concrete'),
  ('STR-RC-CORE-001',  'Core wall rebar',       'core_rebar',         't',  'BOQ Core Wall > Rebar (kg x 0.001)'),
  ('STR-RC-CORE-002',  'Core wall formwork',    'core_formwork',      'm²', 'BOQ Core Wall > Formwork'),
  ('STR-RC-CORE-003',  'Core wall concrete',    'core_volume',        'm³', 'BOQ Core Wall > Concrete'),
  ('STR-RC-SLAB-004',  'Slab bottom rebar',     'slab_rebar_bottom',  't',  'Half of BOQ Structural Slab > Rebar (assumed 50/50 bottom/top)'),
  ('STR-RC-SLAB-005',  'Slab top rebar',        'slab_rebar_top',     't',  'Half of BOQ Structural Slab > Rebar (assumed 50/50 bottom/top)'),
  ('STR-RC-BEAM-001',  'Beam rebar',            'beam_rebar',         't',  'BOQ Structural Beam > Rebar (kg x 0.001)'),
  ('STR-RC-BEAM-002',  'Beam formwork',         'beam_formwork',      'm²', 'BOQ Structural Beam > Formwork'),
  ('STR-RC-BEAM-003',  'Beam concrete',         'beam_volume',        'm³', 'BOQ Structural Beam > Concrete'),
  ('STR-RC-STAIR-001', 'Stair rebar',           'stair_rebar',        't',  'BOQ Structural Staircase > Rebar (kg x 0.001)'),
  ('STR-RC-STAIR-002', 'Stair formwork',        'stair_formwork',     'm²', 'BOQ Structural Staircase > Formwork'),
  ('STR-RC-STAIR-003', 'Stair concrete',        'stair_volume',       'm³', 'BOQ Structural Staircase > Concrete'),
  ('STR-RC-FDN-001',   'Pile cap rebar',        'pilecap_rebar',      't',  'BOQ Pile Cap & Stump > Rebar (kg x 0.001)'),
  ('STR-RC-FDN-002',   'Pile cap formwork',     'pilecap_formwork',   'm²', 'BOQ Pile Cap & Stump > Formwork'),
  ('STR-RC-FDN-003',   'Pile cap concrete',     'pilecap_volume',     'm³', 'BOQ Pile Cap & Stump > Concrete'),
  ('ARC-MAS-BLK-001',  'Blockwork area',        'blockwork_area',     'm²', 'BOQ Hollow clay brick (all thicknesses)'),
  ('ARC-FIN-WAL-002',  'Internal plaster area', 'wall_plaster_area',  'm²', 'BOQ Interior/Internal Wall Finishes > Plastering'),
  ('ARC-FIN-WAL-003',  'Wall tiling area',      'wall_tile_area',     'm²', 'BOQ Wall tiling / Toilet Wall tile'),
  ('ARC-FIN-WAL-004',  'Internal paint area',   'wall_paint_area',    'm²', 'BOQ Interior/Internal Wall Finishes > Painting'),
  ('ARC-FIN-FLR-002',  'Screed area',           'screed_area',        'm²', 'BOQ Screed'),
  ('ARC-FIN-FLR-003',  'Wet area waterproofing','waterproofing_area', 'm²', 'BOQ Waterproofing'),
  ('ARC-FIN-FLR-004',  'Floor tile / stone area','floor_tile_area',   'm²', 'BOQ floor tile and stone lines'),
  ('ARC-FIN-CLG-001',  'Ceiling area',          'ceiling_area',       'm²', 'BOQ Suspended ceiling'),
  ('ARC-FIN-CLG-003',  'Ceiling area',          'ceiling_area',       'm²', 'BOQ Suspended ceiling'),
  ('ARC-DW-001',       'Door count',            'door_count',         'nos','BOQ Interior Door (all types)'),
  ('ARC-DW-002',       'Door count',            'door_count',         'nos','BOQ Interior Door (all types)'),
  ('ARC-DW-003',       'Window count',          'window_count',       'nos','BOQ Glass Window'),
  ('MEP-ELE-001',      'Containment length',    'containment_length', 'm',  'BOQ Cable tray / trunking / ladder / conduit'),
  ('MEP-ELE-002',      'Cable length',          'cable_length',       'm',  'BOQ Power cable / control cable'),
  ('MEP-ELE-004',      'Distribution boards',   'db_count',           'nos','BOQ Sub-distribution board'),
  ('MEP-ELE-005',      'Light fittings',        'luminaire_count',    'nos','BOQ luminaires, emergency lights, exit signs'),
  ('MEP-ELE-006',      'Sockets & switches',    'accessory_points',   'nos','BOQ socket outlets, switches'),
  ('MEP-FP-001',       'Sprinkler pipe length', 'sprinkler_pipe_length','m','BOQ Sprinkler piping'),
  ('MEP-FP-002',       'Sprinkler heads',       'sprinkler_head_count','nos','BOQ Sprinkler head'),
  ('MEP-FP-004',       'Fire alarm devices',    'fire_alarm_points',  'point','BOQ detectors, call points, sounders'),
  ('MEP-HVAC-002',     'AHU / FCU units',       'ahu_fcu_count',      'nos','BOQ AHU, FCU, VRF indoor, split units'),
  ('MEP-HVAC-003',     'Chilled water pipe',    'chw_pipe_length',    'm',  'BOQ Chilled water piping'),
  ('MEP-HVAC-004',     'Air terminals',         'air_terminal_count', 'nos','BOQ diffusers, grilles, louvers'),
  ('MEP-PLB-001',      'Cold water pipe',       'cold_water_pipe_length','m','BOQ Cold water piping'),
  ('MEP-PLB-002',      'Hot water pipe',        'hot_water_pipe_length','m','BOQ Hot water piping'),
  ('MEP-PLB-003',      'Soil & waste pipe',     'drainage_pipe_length','m', 'BOQ soil, waste, vent pipes'),
  ('MEP-PLB-004',      'Sanitary fixtures',     'sanitary_count',     'nos','BOQ sanitary ware')
) as v(code, rule_name, metric, unit, note)
join public.plan_act_masters m on m.code = v.code and m.status in ('draft', 'active')
on conflict (master_id, name) do nothing;

-- ── E. Bridge rules: QS element -> metric ───────────────────────────────────
-- Matched on Sub Section / Sub Element (case-insensitive); Section only where it separates internal from external.
insert into public.plan_act_qs_bridge (role, metric_code, metric_unit, unit_factor, match_discipline, match_section, match_sub_section, match_sub_element, match_unit, note, sort_order)
select v.role, v.metric, v.metric_unit, v.factor, v.disc, v.section, v.sub_section, v.sub_element, v.unit, v.note, v.ord
from (values
  -- structure: element x work type
  ('driver', 'column_rebar',      't',  0.001, 'Civil and Structure', null, 'Structural Column', 'Rebar',    'kg', 'kg -> t', 100),
  ('driver', 'column_formwork',   'm²', 1,     'Civil and Structure', null, 'Structural Column', 'Formwork', 'm2', null, 101),
  ('driver', 'column_volume',     'm³', 1,     'Civil and Structure', null, 'Structural Column', 'Concrete', 'm3', null, 102),
  ('driver', 'wall_rebar',        't',  0.001, 'Civil and Structure', null, 'Structural Wall',   'Rebar',    'kg', 'kg -> t', 110),
  ('driver', 'wall_area',         'm²', 1,     'Civil and Structure', null, 'Structural Wall',   'Formwork', 'm2', null, 111),
  ('driver', 'wall_volume',       'm³', 1,     'Civil and Structure', null, 'Structural Wall',   'Concrete', 'm3', null, 112),
  ('driver', 'core_rebar',        't',  0.001, 'Civil and Structure', null, 'Core Wall',         'Rebar',    'kg', 'kg -> t', 115),
  ('driver', 'core_formwork',     'm²', 1,     'Civil and Structure', null, 'Core Wall',         'Formwork', 'm2', null, 116),
  ('driver', 'core_volume',       'm³', 1,     'Civil and Structure', null, 'Core Wall',         'Concrete', 'm3', null, 117),
  ('driver', 'slab_rebar_bottom', 't',  0.0005,'Civil and Structure', null, 'Structural Slab',   'Rebar',    'kg', 'kg -> t, ASSUMPTION: half of slab rebar is bottom mesh', 120),
  ('driver', 'slab_rebar_top',    't',  0.0005,'Civil and Structure', null, 'Structural Slab',   'Rebar',    'kg', 'kg -> t, ASSUMPTION: half of slab rebar is top mesh', 121),
  ('driver', 'slab_area',         'm²', 1,     'Civil and Structure', null, 'Structural Slab',   'Formwork', 'm2', 'Slab soffit formwork area', 122),
  ('driver', 'slab_volume',       'm³', 1,     'Civil and Structure', null, 'Structural Slab',   'Concrete', 'm3', null, 123),
  ('driver', 'beam_rebar',        't',  0.001, 'Civil and Structure', null, 'Structural Beam',   'Rebar',    'kg', 'kg -> t', 130),
  ('driver', 'beam_formwork',     'm²', 1,     'Civil and Structure', null, 'Structural Beam',   'Formwork', 'm2', null, 131),
  ('driver', 'beam_volume',       'm³', 1,     'Civil and Structure', null, 'Structural Beam',   'Concrete', 'm3', null, 132),
  ('driver', 'stair_rebar',       't',  0.001, 'Civil and Structure', null, 'Structural Staircase', 'Rebar',    'kg', 'kg -> t', 140),
  ('driver', 'stair_formwork',    'm²', 1,     'Civil and Structure', null, 'Structural Staircase', 'Formwork', 'm2', null, 141),
  ('driver', 'stair_volume',      'm³', 1,     'Civil and Structure', null, 'Structural Staircase', 'Concrete', 'm3', null, 142),
  ('driver', 'pilecap_rebar',     't',  0.001, 'Civil and Structure', null, 'Pile Cap & Stump',  'Rebar',    'kg', 'kg -> t', 150),
  ('driver', 'pilecap_formwork',  'm²', 1,     'Civil and Structure', null, 'Pile Cap & Stump',  'Formwork', 'm2', null, 151),
  ('driver', 'pilecap_volume',    'm³', 1,     'Civil and Structure', null, 'Pile Cap & Stump',  'Concrete', 'm3', null, 152),
  -- structure: lines that are materials or minor items, not duration drivers
  ('excluded', null, null, 1, null, null, null, 'Steel Tie Wire', null, 'Material within rebar fixing', 190),
  ('excluded', null, null, 1, null, null, null, 'Water Stop',     null, 'Fixed with formwork / concrete', 191),
  ('excluded', null, null, 1, null, null, null, 'Rebar Testing',  null, 'Test, not site work', 192),
  ('excluded', null, null, 1, null, null, null, 'Crush Stone',    null, 'Part of base preparation', 193),
  ('excluded', null, null, 1, null, null, null, 'Lean Concrete',  null, 'Blinding, part of base preparation', 194),
  -- architecture
  ('driver', 'blockwork_area',    'm²', 1, 'Architecture', null, 'Hollow clay brick', null, 'm2', 'All wall thicknesses', 200),
  ('driver', 'wall_plaster_area', 'm²', 1, 'Architecture', 'Internal Wall Finishes', 'Plastering', null, 'm2', null, 210),
  ('driver', 'wall_plaster_area', 'm²', 1, 'Architecture', 'Interior Wall Finishes', 'Plastering', null, 'm2', null, 211),
  ('driver', 'ext_plaster_area',  'm²', 1, 'Architecture', 'Exterior Wall Finishes', 'Plastering', null, 'm2', 'External render: no master yet', 212),
  ('driver', 'wall_paint_area',   'm²', 1, 'Architecture', 'Internal Wall Finishes', 'Painting', null, 'm2', null, 220),
  ('driver', 'wall_paint_area',   'm²', 1, 'Architecture', 'Interior Wall Finishes', 'Painting', null, 'm2', null, 221),
  ('driver', 'ext_paint_area',    'm²', 1, 'Architecture', 'Exterior Wall Finishes', 'Painting', null, 'm2', 'External painting: no master yet', 222),
  ('driver', 'wall_tile_area',    'm²', 1, 'Architecture', null, 'Wall tiling',       null, 'm2', null, 230),
  ('driver', 'wall_tile_area',    'm²', 1, 'Architecture', null, 'Toilet Wall tile',  null, 'm2', null, 231),
  ('driver', 'floor_tile_area',   'm²', 1, 'Architecture', null, 'Toilet Floor tile', null, 'm2', null, 240),
  ('driver', 'floor_tile_area',   'm²', 1, 'Architecture', null, 'Marble on staircase', null, 'm2', null, 241),
  ('driver', 'waterproofing_area','m²', 1, 'Architecture', null, 'Waterproofing',     null, 'm2', null, 245),
  ('driver', 'ceiling_area',      'm²', 1, 'Architecture', null, 'Suspended ceiling', null, 'm2', null, 250),
  ('driver', 'door_count',        'nos',1, 'Architecture', null, 'PVC door',   null, 'pcs', null, 260),
  ('driver', 'door_count',        'nos',1, 'Architecture', null, 'Steel Door', null, 'pcs', null, 261),
  ('driver', 'door_count',        'nos',1, 'Architecture', null, 'Wood door',  null, 'pcs', null, 262),
  ('driver', 'window_count',      'nos',1, 'Architecture', null, 'Glass Window', null, 'pcs', null, 270),
  ('excluded', null, null, 1, 'Architecture', null, 'Signage', null, null, 'Not a duration driver', 290),
  -- MEP (Element Library names; this BOQ has no classified MEP lines yet)
  ('driver', 'containment_length', 'm', 1, null, null, 'Cable & containment', 'Cable tray',     'm', null, 300),
  ('driver', 'containment_length', 'm', 1, null, null, 'Cable & containment', 'Cable trunking', 'm', null, 301),
  ('driver', 'containment_length', 'm', 1, null, null, 'Cable & containment', 'Cable ladder',   'm', null, 302),
  ('driver', 'containment_length', 'm', 1, null, null, 'Cable & containment', 'Conduit',        'm', null, 303),
  ('driver', 'cable_length',       'm', 1, null, null, 'Cable & containment', 'Power cable',    'm', null, 304),
  ('driver', 'cable_length',       'm', 1, null, null, 'Cable & containment', 'Control cable',  'm', null, 305),
  ('driver', 'db_count',         'nos', 1, null, null, 'Main distribution', 'Sub-distribution board (DB)', null, null, 310),
  ('driver', 'luminaire_count',  'nos', 1, null, null, 'Lighting', null, null, null, 320),
  ('driver', 'accessory_points', 'nos', 1, null, null, 'Power & wiring accessories', 'Socket outlet', null, null, 330),
  ('driver', 'accessory_points', 'nos', 1, null, null, 'Power & wiring accessories', 'Switch', null, null, 331),
  ('driver', 'sprinkler_pipe_length','m',1, null, null, 'Sprinkler system', 'Sprinkler piping', 'm', null, 340),
  ('driver', 'sprinkler_head_count','nos',1,null, null, 'Sprinkler system', 'Sprinkler head', null, null, 341),
  ('driver', 'fire_alarm_points','point',1,null, null, 'Fire alarm system', 'Smoke / heat detector', null, null, 350),
  ('driver', 'fire_alarm_points','point',1,null, null, 'Fire alarm system', 'Manual call point', null, null, 351),
  ('driver', 'fire_alarm_points','point',1,null, null, 'Fire alarm system', 'Alarm bell / sounder', null, null, 352),
  ('driver', 'ahu_fcu_count',    'nos', 1, null, null, 'Chilled water system', 'Air handling unit (AHU)', null, null, 360),
  ('driver', 'ahu_fcu_count',    'nos', 1, null, null, 'Chilled water system', 'Fan coil unit (FCU)', null, null, 361),
  ('driver', 'ahu_fcu_count',    'nos', 1, null, null, 'VRF / VRV system', 'VRF indoor unit', null, null, 362),
  ('driver', 'ahu_fcu_count',    'nos', 1, null, null, 'Split unit system', null, null, null, 363),
  ('driver', 'chw_pipe_length',    'm', 1, null, null, 'AC piping & accessories', 'Chilled water piping', 'm', null, 370),
  ('driver', 'air_terminal_count','nos',1, null, null, 'Air terminal', null, null, null, 380),
  ('driver', 'cold_water_pipe_length','m',1,null,null, 'Water supply', 'Cold water piping', 'm', null, 390),
  ('driver', 'hot_water_pipe_length','m',1,null, null, 'Water supply', 'Hot water piping', 'm', null, 391),
  ('driver', 'drainage_pipe_length','m',1, null, null, 'Drainage', 'Soil pipe',  'm', null, 392),
  ('driver', 'drainage_pipe_length','m',1, null, null, 'Drainage', 'Waste pipe', 'm', null, 393),
  ('driver', 'drainage_pipe_length','m',1, null, null, 'Drainage', 'Vent pipe',  'm', null, 394),
  ('driver', 'sanitary_count',   'nos', 1, null, null, 'Sanitary ware', null, null, null, 395),
  ('excluded', null, null, 1, null, null, 'Testing & Commissioning', null, null, 'Fixed-duration commissioning, not quantity', 398)
) as v(role, metric, metric_unit, factor, disc, section, sub_section, sub_element, unit, note, ord)
where not exists (
  select 1 from public.plan_act_qs_bridge b
  where b.role = v.role
    and coalesce(b.metric_code, '') = coalesce(v.metric, '')
    and lower(coalesce(b.match_discipline, '')) = lower(coalesce(v.disc, ''))
    and lower(coalesce(b.match_section, '')) = lower(coalesce(v.section, ''))
    and lower(coalesce(b.match_sub_section, '')) = lower(coalesce(v.sub_section, ''))
    and lower(coalesce(b.match_sub_element, '')) = lower(coalesce(v.sub_element, ''))
);

-- ── F. Workbook productivity rates (sheet 04) as draft company standards ─────
-- labour_constant_hr_per_unit = crew x 8 h / daily output. Crew ranges ("8-10 men") use the midpoint.
insert into public.plan_productivity_norms (code, name, trade, discipline, activity_key, unit, labour_constant_hr_per_unit,
  hours_per_day_basis, efficiency_pct, source, basis_note, status, version, output_per_day, activity_master_id)
select v.code, v.name, v.trade, m.discipline, m.code, m.default_unit, round(v.crew * 8.0 / v.output, 4),
  8, 100, 'manual',
  'ASSUMPTION: Standard_WBS_Planning_and_QS_Modules.xlsx sheet 04 ' || v.ref || ' indicative rate (' || v.output || ' ' || m.default_unit
    || '/day, crew ' || v.crew || '). Calibrate after the first 1-2 floors.',
  'draft', 1, v.output, m.id
from (values
  ('WB-P04-PILECAP-REBAR', 'P04', 'STR-RC-FDN-001',   'Pile cap rebar (workbook P04)',        'Reinforcement', 1.2, 9),
  ('WB-P03-PILECAP-CONC',  'P03', 'STR-RC-FDN-003',   'Pile cap concrete (workbook P03)',     'Concrete',      40,  8),
  ('WB-P05-COL-REBAR',     'P05', 'STR-RC-COL-001',   'Column rebar (workbook P05)',          'Reinforcement', 1.0, 8),
  ('WB-P06-BEAM-REBAR',    'P06', 'STR-RC-BEAM-001',  'Beam rebar (workbook P06)',            'Reinforcement', 1.2, 9),
  ('WB-P07-SLAB-REBAR-B',  'P07', 'STR-RC-SLAB-004',  'Slab bottom rebar (workbook P07)',     'Reinforcement', 2.5, 11),
  ('WB-P07-SLAB-REBAR-T',  'P07', 'STR-RC-SLAB-005',  'Slab top rebar (workbook P07)',        'Reinforcement', 2.5, 11),
  ('WB-P08-COL-FORM',      'P08', 'STR-RC-COL-002',   'Column formwork (workbook P08)',       'Formwork',      40,  6),
  ('WB-P09-BEAM-FORM',     'P09', 'STR-RC-BEAM-002',  'Beam formwork (workbook P09)',         'Formwork',      80,  11),
  ('WB-P10-COL-CONC',      'P10', 'STR-RC-COL-003',   'Column concrete (workbook P10)',       'Concrete',      80,  10),
  ('WB-P10-BEAM-CONC',     'P10', 'STR-RC-BEAM-003',  'Beam concrete (workbook P10)',         'Concrete',      80,  10),
  ('WB-P10-WALL-CONC',     'P10', 'STR-RC-WALL-003',  'Shear wall concrete (workbook P10)',   'Concrete',      80,  10),
  ('WB-P11-BLOCKWORK',     'P11', 'ARC-MAS-BLK-001',  'Blockwork 150-200mm (workbook P11)',   'Masonry',       30,  7),
  ('WB-P12-PLASTER',       'P12', 'ARC-FIN-WAL-002',  'Internal plaster (workbook P12)',      'Plastering',    50,  6),
  ('WB-P13-SCREED',        'P13', 'ARC-FIN-FLR-002',  'Floor screed (workbook P13)',          'Finishes',      80,  6),
  ('WB-P14-FLOOR-TILE',    'P14', 'ARC-FIN-FLR-004',  'Floor tiling (workbook P14)',          'Finishes',      35,  5),
  ('WB-P15-WALL-TILE',     'P15', 'ARC-FIN-WAL-003',  'Wall tiling (workbook P15)',           'Finishes',      25,  4),
  ('WB-P16-PAINT',         'P16', 'ARC-FIN-WAL-004',  'Internal painting 2 coats (workbook P16)', 'Painting',  80,  5),
  ('WB-P17-CONDUIT',       'P17', 'MEP-ELE-001',      'Electrical conduits 1st fix (workbook P17)', 'Electrical', 120, 5),
  ('WB-P19-PLUMB-PIPE',    'P19', 'MEP-PLB-001',      'Plumbing pipes 1st fix (workbook P19)', 'Plumbing',     60,  4),
  ('WB-P20-DUCTWORK',      'P20', 'MEP-HVAC-001',     'HVAC ductwork (workbook P20)',         'HVAC',          50,  5),
  ('WB-P21-FF-PIPE',       'P21', 'MEP-FP-001',       'Fire fighting pipes (workbook P21)',   'Fire Protection', 50, 4),
  ('WB-P22-CABLE-PULL',    'P22', 'MEP-ELE-002',      'Cable pulling (workbook P22)',         'Electrical',    200, 4),
  ('WB-P23-LIGHTING',      'P23', 'MEP-ELE-005',      'Lighting installation (workbook P23)', 'Electrical',    30,  4)
) as v(code, ref, master_code, name, trade, output, crew)
join public.plan_act_masters m on m.code = v.master_code and m.status in ('draft', 'active')
where not exists (
  select 1 from public.plan_productivity_norms n where n.project_id is null and lower(n.code) = lower(v.code)
);

-- One labour crew line per workbook norm (the workbook gives a crew size, not a trade split).
insert into public.plan_productivity_norm_resources (norm_id, kind, role_label, workers_per_crew, allocation_rule, is_optional, sort_order)
select n.id, 'labor', n.trade || ' crew (workbook)', round(n.labour_constant_hr_per_unit * n.output_per_day / 8.0), 'per_crew', false, 1
from public.plan_productivity_norms n
where n.project_id is null and n.code like 'WB-P%'
  and not exists (select 1 from public.plan_productivity_norm_resources r where r.norm_id = n.id);

-- Concrete pours: the pump is the limit (workbook P10 note), so it is an equipment line per pour.
insert into public.plan_productivity_norm_resources (norm_id, kind, role_label, workers_per_crew, allocation_rule, is_optional, sort_order)
select n.id, 'equipment', 'Concrete Pump', 1, 'per_pour', false, 2
from public.plan_productivity_norms n
where n.project_id is null and n.code like 'WB-P10-%'
  and not exists (select 1 from public.plan_productivity_norm_resources r where r.norm_id = n.id and r.kind = 'equipment');

-- ── G. Proxy rates for structural activities the workbook gives no figure for ──
-- Each is the closest workbook trade and says so; replace with a real rate or calibrate from site logs.
insert into public.plan_productivity_norms (code, name, trade, discipline, activity_key, unit, labour_constant_hr_per_unit,
  hours_per_day_basis, efficiency_pct, source, basis_note, status, version, output_per_day, activity_master_id)
select v.code, v.name, v.trade, m.discipline, m.code, m.default_unit, round(v.crew * 8.0 / v.output, 4), 8, 100, 'manual',
  'ASSUMPTION: PROXY of workbook ' || v.ref || ' (' || v.proxy_of || ', ' || v.output || ' ' || m.default_unit || '/day, crew ' || v.crew
    || '). No workbook figure for this activity; replace or calibrate after the first floors.',
  'draft', 1, v.output, m.id
from (values
  ('WB-PX-WALL-REBAR',  'P05', 'column rebar',     'STR-RC-WALL-001',  'Shear wall rebar (proxy P05)',     'Reinforcement', 1.0, 8),
  ('WB-PX-WALL-FORM',   'P08', 'column formwork',  'STR-RC-WALL-002',  'Shear wall formwork (proxy P08)',  'Formwork',      40,  6),
  ('WB-PX-CORE-REBAR',  'P05', 'column rebar',     'STR-RC-CORE-001',  'Core wall rebar (proxy P05)',      'Reinforcement', 1.0, 8),
  ('WB-PX-CORE-FORM',   'P08', 'column formwork',  'STR-RC-CORE-002',  'Core wall formwork (proxy P08)',   'Formwork',      40,  6),
  ('WB-PX-CORE-CONC',   'P10', 'structural pour',  'STR-RC-CORE-003',  'Core wall concrete (proxy P10)',   'Concrete',      80,  10),
  ('WB-PX-STAIR-REBAR', 'P06', 'beam rebar',       'STR-RC-STAIR-001', 'Stair rebar (proxy P06)',          'Reinforcement', 1.2, 9),
  ('WB-PX-STAIR-FORM',  'P08', 'column formwork',  'STR-RC-STAIR-002', 'Stair formwork (proxy P08)',       'Formwork',      40,  6),
  ('WB-PX-STAIR-CONC',  'P10', 'structural pour',  'STR-RC-STAIR-003', 'Stair concrete (proxy P10)',       'Concrete',      80,  10)
) as v(code, ref, proxy_of, master_code, name, trade, output, crew)
join public.plan_act_masters m on m.code = v.master_code and m.status in ('draft', 'active')
where not exists (select 1 from public.plan_productivity_norms n where n.project_id is null and lower(n.code) = lower(v.code));

insert into public.plan_productivity_norm_resources (norm_id, kind, role_label, workers_per_crew, allocation_rule, is_optional, sort_order)
select n.id, 'labor', n.trade || ' crew (proxy)', round(n.labour_constant_hr_per_unit * n.output_per_day / 8.0), 'per_crew', false, 1
from public.plan_productivity_norms n
where n.project_id is null and n.code like 'WB-PX-%'
  and not exists (select 1 from public.plan_productivity_norm_resources r where r.norm_id = n.id);

insert into public.plan_productivity_norm_resources (norm_id, kind, role_label, workers_per_crew, allocation_rule, is_optional, sort_order)
select n.id, 'equipment', 'Concrete Pump', 1, 'per_pour', false, 2
from public.plan_productivity_norms n
where n.project_id is null and n.code like 'WB-PX-%-CONC'
  and not exists (select 1 from public.plan_productivity_norm_resources r where r.norm_id = n.id and r.kind = 'equipment');

-- ── H. Template placeholders that the bridge now replaces ───────────────────
-- TPL-STR-HR-RC-FLOOR-001 was given fixed starting durations before quantities existed. A fixed duration wins over
-- the calculated one, so once an item's master is quantity-driven, has a quantity rule and a company productivity
-- standard, its placeholder is cleared (draft templates only; an active template is frozen and needs a new version).
update public.plan_act_template_items i
set duration_days_override = null
from public.plan_act_templates t, public.plan_act_masters m
where t.id = i.template_id and m.id = i.master_id
  and t.code = 'TPL-STR-HR-RC-FLOOR-001' and t.status = 'draft'
  and i.duration_days_override is not null
  and m.duration_basis = 'quantity'
  and exists (select 1 from public.plan_act_quantity_rules r where r.master_id = m.id)
  and exists (select 1 from public.plan_productivity_norms n where n.activity_master_id = m.id and n.project_id is null and n.status <> 'retired');



-- ════════════════ from supabase/seeds/seed_typical_floor_template.sql ════════════════
-- Seed: Activity Template TPL-BLD-TYP-FLOOR-001 "Typical Floor – Full Cycle" (doc 21, gap after Phase 3).
-- One recipe per typical floor: structure (columns, shear walls, beams, slab, stairs), MEP first fix, finishes,
-- MEP second fix, with the standard logic between them and a link from one floor's slab pour to the next floor's
-- setting out. Durations come from the QS Bridge quantities x productivity standards; only the three activities that
-- are fixed by nature (survey, MEP embedded items, pre-pour inspection) carry a fixed duration.
-- Draft: the Planning Manager reviews the logic and activates it in Activity Library > Templates.
-- Idempotent: creates the template once; items and links are only written while the template has none.
-- Depends on: seed_activity_library.sql, seed_planning_qs_bridge.sql.

insert into public.plan_act_templates (code, name, description, domain_id, status, version, applies_to_level_types, owner,
  inter_level_from_seq, inter_level_to_seq, inter_level_relation, inter_level_lag_days)
select 'TPL-BLD-TYP-FLOOR-001', 'Typical Floor – Full Cycle (Structure, MEP, Finishes)',
  'Columns, shear walls, beams, slab and stairs; MEP first fix; blockwork to painting; MEP second fix. Next floor setting out starts 1 day after this floor''s slab pour.',
  d.id, 'draft', 1, array['typical'], 'Planning Manager', 17, 1, 'fs', 1
from public.plan_act_domains d
where d.code = 'STR'
  and not exists (select 1 from public.plan_act_templates t where t.code = 'TPL-BLD-TYP-FLOOR-001');

-- Same applicability as the RC floor template: reinforced concrete, typical floor.
insert into public.plan_act_applicability (target_type, target_id, attribute, operator, values)
select 'template', t.id, v.attribute, v.operator, v.vals
from public.plan_act_templates t
cross join (values
  ('structure_type', 'eq', array['reinforced_concrete']),
  ('building_component', 'in', array['typical_floor'])
) as v(attribute, operator, vals)
where t.code = 'TPL-BLD-TYP-FLOOR-001' and t.status = 'draft'
  and not exists (select 1 from public.plan_act_applicability a where a.target_type = 'template' and a.target_id = t.id);

-- Items: seq, master, fixed duration (null = from quantity), note
insert into public.plan_act_template_items (template_id, seq, master_id, scope, duration_days_override, is_milestone, note)
select t.id, v.seq, m.id, 'floor', v.fixed_days, false, v.note
from public.plan_act_templates t
cross join (values
  -- structure
  ( 1, 'STR-RC-SLAB-001',  0.5::numeric, 'Setting out from the floor below'),
  ( 2, 'STR-RC-COL-001',   null, null),
  ( 3, 'STR-RC-WALL-001',  null, 'Starts with column rebar'),
  ( 4, 'STR-RC-COL-002',   null, null),
  ( 5, 'STR-RC-WALL-002',  null, null),
  ( 6, 'STR-RC-COL-003',   null, null),
  ( 7, 'STR-RC-WALL-003',  null, null),
  ( 8, 'STR-RC-SLAB-002',  null, 'After vertical elements are cast'),
  ( 9, 'STR-RC-BEAM-002',  null, 'With slab formwork'),
  (10, 'STR-RC-BEAM-001',  null, null),
  (11, 'STR-RC-SLAB-003',  1::numeric, 'Conduits / sleeves cast in the slab'),
  (12, 'STR-RC-SLAB-004',  null, null),
  (13, 'STR-RC-SLAB-005',  null, 'After embedded items'),
  (14, 'STR-RC-STAIR-002', null, 'After columns are cast'),
  (15, 'STR-RC-STAIR-001', null, null),
  (16, 'STR-RC-SLAB-006',  0.5::numeric, 'Hold point: slab, beam and stair reinforcement'),
  (17, 'STR-RC-SLAB-007',  null, 'Drives the next floor''s setting out'),
  (18, 'STR-RC-BEAM-003',  null, 'Cast with the slab'),
  (19, 'STR-RC-STAIR-003', null, 'Cast with the slab'),
  (20, 'STR-RC-SLAB-008',  null, null),
  (21, 'STR-RC-SLAB-009',  null, null),
  (22, 'STR-RC-SLAB-010',  null, '3 days after curing starts'),
  -- MEP first fix
  (23, 'MEP-ELE-001',      null, null),
  (24, 'MEP-PLB-001',      null, null),
  (25, 'MEP-PLB-003',      null, null),
  (26, 'MEP-FP-001',       null, null),
  (27, 'MEP-HVAC-003',     null, null),
  (28, 'MEP-HVAC-001',     null, null),
  -- finishes
  (29, 'ARC-MAS-BLK-001',  null, 'After formwork is stripped'),
  (30, 'ARC-FIN-WAL-002',  null, 'After blockwork and in-wall first fix'),
  (31, 'ARC-FIN-FLR-003',  null, 'Wet areas'),
  (32, 'ARC-FIN-FLR-002',  null, null),
  (33, 'ARC-FIN-WAL-003',  null, null),
  (34, 'ARC-FIN-FLR-004',  null, null),
  (35, 'ARC-FIN-CLG-001',  null, 'After ceiling-void services'),
  (36, 'ARC-FIN-CLG-003',  null, null),
  (37, 'ARC-DW-001',       null, null),
  (38, 'ARC-DW-003',       null, null),
  (39, 'ARC-FIN-WAL-004',  null, null),
  -- MEP second fix
  (40, 'MEP-ELE-002',      null, null),
  (41, 'MEP-ELE-006',      null, null),
  (42, 'MEP-ELE-005',      null, null),
  (43, 'MEP-FP-002',       null, null),
  (44, 'MEP-HVAC-002',     null, 'Units above the ceiling before boards'),
  (45, 'MEP-HVAC-004',     null, null),
  (46, 'MEP-PLB-004',      null, null),
  (47, 'ARC-DW-002',       null, 'Door leaves last, after painting and flooring')
) as v(seq, master_code, fixed_days, note)
join lateral (
  -- the active version of the master, else its newest version
  select mm.id from public.plan_act_masters mm
  where mm.code = v.master_code and mm.status in ('active', 'approved', 'under_review', 'draft')
  order by (mm.status = 'active') desc, mm.version desc limit 1
) m on true
where t.code = 'TPL-BLD-TYP-FLOOR-001' and t.status = 'draft'
  and not exists (select 1 from public.plan_act_template_items i where i.template_id = t.id);

-- Links: successor seq, predecessor seq, relation, lag (working days)
insert into public.plan_act_template_dependencies (template_id, predecessor_item_id, successor_item_id, relation, lag_days, is_optional)
select t.id, p.id, s.id, v.rel, v.lag, false
from public.plan_act_templates t
cross join (values
  ( 2,  1, 'fs', 0), ( 3,  2, 'ss', 0), ( 4,  2, 'fs', 0), ( 5,  3, 'fs', 0), ( 6,  4, 'fs', 0), ( 7,  5, 'fs', 0),
  ( 8,  6, 'fs', 0), ( 8,  7, 'fs', 0), ( 9,  8, 'ss', 0), (10,  9, 'fs', 0), (11,  8, 'fs', 0), (12,  8, 'fs', 0),
  (13, 12, 'fs', 0), (13, 11, 'fs', 0), (14,  6, 'fs', 0), (15, 14, 'fs', 0),
  (16, 13, 'fs', 0), (16, 10, 'fs', 0), (16, 15, 'fs', 0),
  (17, 16, 'fs', 0), (18, 17, 'ss', 0), (19, 17, 'ss', 0), (20, 17, 'fs', 0), (21, 20, 'fs', 0), (22, 21, 'fs', 3),
  (23, 22, 'fs', 0), (24, 22, 'fs', 0), (25, 22, 'fs', 0), (26, 22, 'fs', 0), (27, 22, 'fs', 0), (28, 22, 'fs', 0),
  (29, 22, 'fs', 0), (30, 29, 'fs', 0), (30, 23, 'fs', 0), (30, 24, 'fs', 0), (31, 30, 'fs', 0), (32, 31, 'fs', 0),
  (33, 31, 'fs', 0), (34, 32, 'fs', 0), (35, 26, 'fs', 0), (35, 27, 'fs', 0), (35, 28, 'fs', 0), (35, 30, 'fs', 0),
  (36, 35, 'fs', 0), (37, 29, 'fs', 0), (38, 29, 'fs', 0), (39, 36, 'fs', 0), (39, 33, 'fs', 0),
  (40, 23, 'fs', 0), (40, 30, 'fs', 0), (41, 39, 'fs', 0), (41, 40, 'fs', 0), (42, 36, 'fs', 0), (42, 40, 'fs', 0),
  (43, 36, 'fs', 0), (44, 35, 'fs', 0), (45, 36, 'fs', 0), (46, 33, 'fs', 0), (46, 34, 'fs', 0), (46, 25, 'fs', 0),
  (47, 39, 'fs', 0), (47, 34, 'fs', 0), (47, 37, 'fs', 0)
) as v(succ, pred, rel, lag)
join public.plan_act_template_items s on s.template_id = t.id and s.seq = v.succ
join public.plan_act_template_items p on p.template_id = t.id and p.seq = v.pred
where t.code = 'TPL-BLD-TYP-FLOOR-001' and t.status = 'draft'
  and not exists (select 1 from public.plan_act_template_dependencies d where d.template_id = t.id);

-- Default crews (starting figures, aimed at a ~2-week structural floor cycle; the Planning Manager tunes them).
-- Set only while an item is still at 1 crew, so a planner's own figure is never overwritten.
update public.plan_act_template_items i
set crews = v.crews
from public.plan_act_templates t, public.plan_act_masters m,
  (values
    ('STR-RC-COL-001', 4), ('STR-RC-COL-002', 2), ('STR-RC-WALL-002', 2),
    ('STR-RC-SLAB-002', 2), ('STR-RC-BEAM-002', 2), ('STR-RC-BEAM-001', 4),
    ('STR-RC-SLAB-004', 2), ('STR-RC-SLAB-005', 2), ('STR-RC-SLAB-010', 2),
    ('ARC-MAS-BLK-001', 4), ('ARC-FIN-WAL-002', 3), ('ARC-FIN-WAL-003', 2), ('ARC-FIN-FLR-004', 2),
    ('ARC-FIN-WAL-004', 2), ('ARC-FIN-CLG-001', 2), ('ARC-FIN-CLG-003', 2)
  ) as v(code, crews)
where t.id = i.template_id and m.id = i.master_id and m.code = v.code
  and t.code = 'TPL-BLD-TYP-FLOOR-001' and t.status = 'draft'
  and i.crews = 1;


-- ════════════════ from supabase/seeds/seed_norms_arc_mep.sql ════════════════
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

