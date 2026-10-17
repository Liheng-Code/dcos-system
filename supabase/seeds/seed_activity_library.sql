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
