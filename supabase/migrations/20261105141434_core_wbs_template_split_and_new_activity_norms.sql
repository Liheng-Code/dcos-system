-- Construction Work Library / WBS Templates: make the 2026-11-05 review items fully usable (2026-11-05).
--
--   A. Productivity norms for the 12 quantity-based activities added by 20261105135240 (draft, ASSUMPTION rates to
--      calibrate; labour constant = crew x 8 h / output per day). The 8 fixed-duration ones take their duration from
--      the template / step template and need none.
--   B. Activate the 20 new activities (draft -> under_review -> approved -> active, reviewer as approver), so
--      Generate, the BOQ programme and the template editor treat them like any other current activity.
--   C. Split the 21 multi-trade summary tasks of the WBS templates (fit-out rooms, clubhouse, compressor house...)
--      into a finish-to-start chain of trade tasks, each linked to a Work Library activity:
--        - the first trade keeps the summary's key, sort position and predecessors; the others get the next free task
--          numbers of the same package and follow it FS;
--        - the summary's duration is shared over the trades (rounded, at least 1 day each, total kept);
--        - every task that depended on the summary now depends on the last trade (same scope).
--      A summary is only split while it is unchanged: same key and name, no master_code (else it is left alone).
-- Additive for other data: no node is touched, no other task is changed except the re-pointed predecessors.

-- ── A. Norms ──────────────────────────────────────────────────────────────
insert into public.plan_productivity_norms
  (code, name, trade, discipline, activity_key, unit, output_per_day, labour_constant_hr_per_unit,
   hours_per_day_basis, source, basis_note, status, activity_master_id)
select 'NRM-' || m.code, v.name, m.trade, m.discipline, m.code, m.default_unit, v.output, round(v.crew * 8 / v.output, 4),
       8, 'manual', 'ASSUMPTION: indicative rate ' || v.output || ' ' || m.default_unit || '/crew-day, crew ' || v.crew_text
         || '. Added with the WBS template review 2026-11. Calibrate on site before approving.', 'draft', m.id
  from (values
    ('WL-01-HAULROAD-001', 'Temporary access & haul roads', 300::numeric, 4::numeric, '1 Excavator Operator + 1 Roller Operator + 2 General Worker'),
    ('WL-03-WSTOP-001', 'Waterstops, cast-in items & embeds', 40, 3, '2 Carpenter / Steel Fixer + 1 General Worker'),
    ('WL-05-FALLARREST-001', 'Roof fall-arrest anchors & lifelines', 30, 2, '2 Steel Fixer / Installer'),
    ('WL-07-WPPROT-001', 'Waterproofing protection screed / board', 80, 4, '2 Mason + 2 General Worker'),
    ('WL-07-FIRESTOP-001', 'Firestopping & spandrel seals', 25, 2, '2 Firestop Installer'),
    ('WL-09-RAISEDFLOOR-001', 'Raised access floor', 40, 3, '2 Floor Installer + 1 General Worker'),
    ('WL-13-COLDROOM-001', 'Cold room installation', 10, 4, '3 Panel Installer + 1 General Worker'),
    ('WL-25-INSTR-001', 'Instrumentation & SCADA points', 6, 2, '2 Instrument Technician'),
    ('WL-31-MSEWALL-001', 'Reinforced earth (MSE) wall', 30, 5, '4 General Worker + 1 Plant Operator'),
    ('WL-31-DWALL-001', 'Diaphragm wall / secant piles', 40, 8, '6 Piling Crew + 2 Rig / Crane Operator'),
    ('WL-31-PILEHEAD-001', 'Pile head breaking & trimming', 6, 4, '2 Breaker Operator + 1 General Worker + 1 Excavator Operator'),
    ('WL-32-IRRIGATION-001', 'Landscape irrigation system', 150, 4, '2 Plumber + 2 General Worker')
  ) v(master_code, name, output, crew, crew_text)
  join public.plan_act_masters m on m.code = v.master_code and m.status not in ('superseded', 'archived')
 where not exists (select 1 from public.plan_productivity_norms x where x.project_id is null and lower(x.code) = lower('NRM-' || m.code))
   and not exists (select 1 from public.plan_productivity_norms x where x.activity_master_id = m.id and x.project_id is null);

-- ── B. Activate the 20 new activities ─────────────────────────────────────
create temp table _wl_new (code text primary key) on commit drop;
insert into _wl_new
select code from public.plan_act_masters where source = 'Company Standard (WBS template review 2026-11)' and status = 'draft';

update public.plan_act_masters m set status = 'under_review' where m.status = 'draft' and m.code in (select code from _wl_new);
update public.plan_act_masters m
   set status = 'approved', approved_by = (select u.id from auth.users u where u.id = '73c2d06c-6af7-414d-97a9-2658fe74243e'), approved_at = now()
 where m.status = 'under_review' and m.code in (select code from _wl_new);
update public.plan_act_masters m set status = 'active', effective_date = coalesce(m.effective_date, current_date)
 where m.status = 'approved' and m.code in (select code from _wl_new)
   and not exists (select 1 from public.plan_act_masters o where o.code = m.code and o.id <> m.id and o.status = 'active');

-- ── C. Split the summary tasks ────────────────────────────────────────────
-- (template, part = 'sections' or floor-block type, summary key, summary name, trade order, trade label, activity visible code, discipline or null to keep)
create temp table _wl_split (template_name text, part text, task_key text, task_name text, seq int, trade text, visible_code text, discipline text) on commit drop;
insert into _wl_split values
  ('7F Mixed-use (from PRJ-2026-004-PC)', 'ground', '02.17', 'Final Architectural Finishes', 1, 'Final Painting', 'D09-014', null),
  ('7F Mixed-use (from PRJ-2026-004-PC)', 'ground', '02.17', 'Final Architectural Finishes', 2, 'Touch-up & Wall Protection', 'D09-016', null),
  ('7F Mixed-use (from PRJ-2026-004-PC)', 'typical', '02.17', 'Final Architectural Finishes', 1, 'Final Painting', 'D09-014', null),
  ('7F Mixed-use (from PRJ-2026-004-PC)', 'typical', '02.17', 'Final Architectural Finishes', 2, 'Touch-up & Wall Protection', 'D09-016', null),
  ('7F Mixed-use (from PRJ-2026-004-PC)', 'sections', '03.02.02.07', 'External Structures', 1, 'Guardhouse', 'D13-001', null),
  ('7F Mixed-use (from PRJ-2026-004-PC)', 'sections', '03.02.02.07', 'External Structures', 2, 'Boundary Wall & Gate', 'D04-002', null),
  ('7F Mixed-use (from PRJ-2026-004-PC)', 'sections', '03.02.02.07', 'External Structures', 3, 'Entrance Canopy', 'D10-006', null),
  ('7F Mixed-use (from PRJ-2026-004-PC)', 'roof', '04.06', 'Other Roof Equipment', 1, 'Roof Exhaust & Ventilation Fans', 'D23-010', null),
  ('7F Mixed-use (from PRJ-2026-004-PC)', 'roof', '04.06', 'Other Roof Equipment', 2, 'Roof Water Tanks', 'D22-015', null),
  ('Commercial – Hotel & Hospitality', 'ground', '02.07', 'Restaurant & Bar Fit-out', 1, 'Feature Ceiling', 'D09-019', null),
  ('Commercial – Hotel & Hospitality', 'ground', '02.07', 'Restaurant & Bar Fit-out', 2, 'Stone / Tile Flooring', 'D09-007', null),
  ('Commercial – Hotel & Hospitality', 'ground', '02.07', 'Restaurant & Bar Fit-out', 3, 'Bar & Service Counters', 'D06-007', null),
  ('Commercial – Hotel & Hospitality', 'ground', '02.07', 'Restaurant & Bar Fit-out', 4, 'Kitchen & Bar Equipment', 'D11-004', 'Specialist'),
  ('Commercial – Hotel & Hospitality', 'ground', '02.07', 'Restaurant & Bar Fit-out', 5, 'Painting & Decoration', 'D09-014', null),
  ('Commercial – Hotel & Hospitality', 'typical', '02.12', 'Corridor Finishes', 1, 'Corridor Ceiling', 'D09-003', null),
  ('Commercial – Hotel & Hospitality', 'typical', '02.12', 'Corridor Finishes', 2, 'Corridor Carpet / Vinyl', 'D09-008', null),
  ('Commercial – Hotel & Hospitality', 'typical', '02.12', 'Corridor Finishes', 3, 'Corridor Painting', 'D09-014', null),
  ('Commercial – Hotel & Hospitality', 'roof', '03.03', 'Sky Bar Fit-out', 1, 'Feature Ceiling', 'D09-019', null),
  ('Commercial – Hotel & Hospitality', 'roof', '03.03', 'Sky Bar Fit-out', 2, 'Stone / Timber Flooring', 'D09-007', null),
  ('Commercial – Hotel & Hospitality', 'roof', '03.03', 'Sky Bar Fit-out', 3, 'Bar Counters', 'D06-007', null),
  ('Commercial – Hotel & Hospitality', 'roof', '03.03', 'Sky Bar Fit-out', 4, 'Bar Equipment', 'D11-004', 'Specialist'),
  ('Commercial – Hotel & Hospitality', 'roof', '03.03', 'Sky Bar Fit-out', 5, 'Painting & Decoration', 'D09-014', null),
  ('Commercial – Hotel & Hospitality', 'basement', '04.05', 'Staff Locker Rooms & Canteen Finishes', 1, 'Wall Tiling', 'D09-013', null),
  ('Commercial – Hotel & Hospitality', 'basement', '04.05', 'Staff Locker Rooms & Canteen Finishes', 2, 'Floor Tiling', 'D09-007', null),
  ('Commercial – Hotel & Hospitality', 'basement', '04.05', 'Staff Locker Rooms & Canteen Finishes', 3, 'Lockers', 'D10-007', null),
  ('Commercial – Hotel & Hospitality', 'basement', '04.05', 'Staff Locker Rooms & Canteen Finishes', 4, 'Canteen Kitchen Equipment', 'D11-004', 'Specialist'),
  ('Commercial – Office, Retail & Mixed-use', 'ground', '02.08', 'Toilet Fit-out', 1, 'Waterproofing', 'D07-002', null),
  ('Commercial – Office, Retail & Mixed-use', 'ground', '02.08', 'Toilet Fit-out', 2, 'Wall Tiling', 'D09-013', null),
  ('Commercial – Office, Retail & Mixed-use', 'ground', '02.08', 'Toilet Fit-out', 3, 'Floor Tiling', 'D09-007', null),
  ('Commercial – Office, Retail & Mixed-use', 'ground', '02.08', 'Toilet Fit-out', 4, 'Sanitary Fixtures', 'D22-009', 'MEP'),
  ('Commercial – Office, Retail & Mixed-use', 'ground', '02.08', 'Toilet Fit-out', 5, 'Toilet Cubicles', 'D10-012', null),
  ('Industrial – Factory & Manufacturing', 'sections', '03.03.03', 'Compressor House', 1, 'Slab', 'D03-060', 'Structural'),
  ('Industrial – Factory & Manufacturing', 'sections', '03.03.03', 'Compressor House', 2, 'Walls', 'D04-001', 'Architectural'),
  ('Industrial – Factory & Manufacturing', 'sections', '03.03.03', 'Compressor House', 3, 'Roof Sheeting', 'D07-014', 'Architectural'),
  ('Industrial – Factory & Manufacturing', 'sections', '03.03.03', 'Compressor House', 4, 'Compressed Air Piping', 'D22-001', 'MEP'),
  ('Industrial – Factory & Manufacturing', 'ground', '04.04', 'Toilet & Changing Room Finishes', 1, 'Waterproofing', 'D07-002', null),
  ('Industrial – Factory & Manufacturing', 'ground', '04.04', 'Toilet & Changing Room Finishes', 2, 'Wall Tiling', 'D09-013', null),
  ('Industrial – Factory & Manufacturing', 'ground', '04.04', 'Toilet & Changing Room Finishes', 3, 'Sanitary Fixtures', 'D22-009', 'MEP'),
  ('Industrial – Factory & Manufacturing', 'ground', '04.04', 'Toilet & Changing Room Finishes', 4, 'Lockers', 'D10-007', null),
  ('Industrial – Warehouse & Logistics', 'ground', '04.03', 'Toilet & Locker Room Finishes', 1, 'Waterproofing', 'D07-002', null),
  ('Industrial – Warehouse & Logistics', 'ground', '04.03', 'Toilet & Locker Room Finishes', 2, 'Wall Tiling', 'D09-013', null),
  ('Industrial – Warehouse & Logistics', 'ground', '04.03', 'Toilet & Locker Room Finishes', 3, 'Sanitary Fixtures', 'D22-009', 'MEP'),
  ('Industrial – Warehouse & Logistics', 'ground', '04.03', 'Toilet & Locker Room Finishes', 4, 'Lockers', 'D10-007', null),
  ('Infrastructure – Water Supply & Utility Networks', 'ground', '03.02', 'Process Equipment Installation', 1, 'Pumps & Motors', 'D33-016', null),
  ('Infrastructure – Water Supply & Utility Networks', 'ground', '03.02', 'Process Equipment Installation', 2, 'Treatment / Filtration Equipment', 'D22-013', null),
  ('Institutional – Government & Religious Building', 'ground', '02.06', 'Public / Prayer Hall Finishes', 1, 'Ornamental Ceiling', 'D09-019', null),
  ('Institutional – Government & Religious Building', 'ground', '02.06', 'Public / Prayer Hall Finishes', 2, 'Stone Flooring', 'D09-007', null),
  ('Institutional – Government & Religious Building', 'ground', '02.06', 'Public / Prayer Hall Finishes', 3, 'Painting', 'D09-014', null),
  ('Institutional – Government & Religious Building', 'ground', '02.08', 'Ablution / Toilet Fit-out', 1, 'Waterproofing', 'D07-002', null),
  ('Institutional – Government & Religious Building', 'ground', '02.08', 'Ablution / Toilet Fit-out', 2, 'Wall Tiling', 'D09-013', null),
  ('Institutional – Government & Religious Building', 'ground', '02.08', 'Ablution / Toilet Fit-out', 3, 'Floor Tiling', 'D09-007', null),
  ('Institutional – Government & Religious Building', 'ground', '02.08', 'Ablution / Toilet Fit-out', 4, 'Sanitary Fixtures', 'D22-009', 'MEP'),
  ('Institutional – Government & Religious Building', 'ground', '02.08', 'Ablution / Toilet Fit-out', 5, 'Toilet Cubicles', 'D10-012', null),
  ('Institutional – Hospital & Clinic', 'ground', '02.06', 'Emergency & Outpatient Fit-out', 1, 'Drywall Partitions', 'D09-020', null),
  ('Institutional – Hospital & Clinic', 'ground', '02.06', 'Emergency & Outpatient Fit-out', 2, 'Ceilings', 'D09-003', null),
  ('Institutional – Hospital & Clinic', 'ground', '02.06', 'Emergency & Outpatient Fit-out', 3, 'Vinyl Flooring', 'D09-008', null),
  ('Institutional – Hospital & Clinic', 'ground', '02.06', 'Emergency & Outpatient Fit-out', 4, 'Medical Gas Outlets & Bed-heads', 'D22-004', 'MEP'),
  ('Institutional – Hospital & Clinic', 'ground', '02.06', 'Emergency & Outpatient Fit-out', 5, 'Painting', 'D09-014', null),
  ('Institutional – School & University', 'ground', '02.05', 'Entrance & Admin Finishes', 1, 'Ceilings', 'D09-003', null),
  ('Institutional – School & University', 'ground', '02.05', 'Entrance & Admin Finishes', 2, 'Floor Tiling', 'D09-007', null),
  ('Institutional – School & University', 'ground', '02.05', 'Entrance & Admin Finishes', 3, 'Reception Counter', 'D06-007', null),
  ('Institutional – School & University', 'ground', '02.05', 'Entrance & Admin Finishes', 4, 'Painting', 'D09-014', null),
  ('Institutional – School & University', 'ground', '02.06', 'Multi-purpose Hall Finishes', 1, 'Acoustic Ceiling', 'D09-002', null),
  ('Institutional – School & University', 'ground', '02.06', 'Multi-purpose Hall Finishes', 2, 'Timber Sports Flooring', 'D09-009', null),
  ('Institutional – School & University', 'ground', '02.06', 'Multi-purpose Hall Finishes', 3, 'Painting', 'D09-014', null),
  ('Institutional – School & University', 'ground', '02.06', 'Multi-purpose Hall Finishes', 4, 'Hall Seating', 'D12-001', null),
  ('Institutional – School & University', 'ground', '02.07', 'Canteen & Kitchen Fit-out', 1, 'Wall Tiling', 'D09-013', null),
  ('Institutional – School & University', 'ground', '02.07', 'Canteen & Kitchen Fit-out', 2, 'Epoxy Floor', 'D09-017', null),
  ('Institutional – School & University', 'ground', '02.07', 'Canteen & Kitchen Fit-out', 3, 'Kitchen Equipment', 'D11-004', 'Specialist'),
  ('Institutional – School & University', 'ground', '02.07', 'Canteen & Kitchen Fit-out', 4, 'Kitchen Exhaust', 'D23-010', 'MEP'),
  ('Institutional – School & University', 'basement', '05.03', 'Plant Room', 1, 'Water Tanks', 'D22-015', null),
  ('Institutional – School & University', 'basement', '05.03', 'Plant Room', 2, 'Booster Pumps', 'D22-016', null),
  ('Institutional – School & University', 'basement', '05.03', 'Plant Room', 3, 'Plant Room DBs', 'D26-011', null),
  ('Residential – Housing Development / Estate', 'sections', '03.04.01', 'Clubhouse', 1, 'Footings', 'D03-055', 'Structural'),
  ('Residential – Housing Development / Estate', 'sections', '03.04.01', 'Clubhouse', 2, 'Columns', 'D03-025', 'Structural'),
  ('Residential – Housing Development / Estate', 'sections', '03.04.01', 'Clubhouse', 3, 'Blockwork', 'D04-001', 'Architectural'),
  ('Residential – Housing Development / Estate', 'sections', '03.04.01', 'Clubhouse', 4, 'Roofing', 'D07-004', 'Architectural'),
  ('Residential – Housing Development / Estate', 'sections', '03.04.01', 'Clubhouse', 5, 'Floor Finishes', 'D09-007', 'Architectural'),
  ('Residential – Housing Development / Estate', 'sections', '03.04.01', 'Clubhouse', 6, 'Painting', 'D09-014', 'Architectural');

do $$
declare
  s record;
  w record;
  path text[];
  tasks jsonb;
  orig jsonb;
  n int;
  i int;
  total int;
  share int;
  used int;
  v_node text;
  next_no int;
  keys text[];
  new_tasks jsonb;
  t jsonb;
  pred_scope text;
  v_code text;
  last_key text;
  out_tasks jsonb;
begin
  for s in select distinct template_name, part, task_key, task_name from _wl_split loop
    select id, content into w from public.wbs_templates where template_name = s.template_name;
    if w.id is null then continue; end if;
    path := case when s.part = 'sections' then array['sections', 'tasks'] else array['floor_blocks', s.part, 'tasks'] end;
    tasks := w.content #> path;
    if tasks is null then continue; end if;
    select e into orig from jsonb_array_elements(tasks) e
     where e->>'key' = s.task_key and e->>'task_name' = s.task_name and coalesce(e->>'master_code', '') = '';
    if orig is null then continue; end if;   -- changed since the review: leave it

    select count(*) into n from _wl_split x where x.template_name = s.template_name and x.part = s.part and x.task_key = s.task_key;
    total := greatest(coalesce((orig->>'duration_days')::numeric, n)::int, n);
    v_node := orig->>'node_key';
    pred_scope := case when s.part = 'sections' then 'sections' else 'same' end;
    -- next free task numbers in the same package (keys are <node_key>.NN)
    select coalesce(max((substr(e->>'key', length(v_node) + 2))::int), 0) into next_no
      from jsonb_array_elements(tasks) e
     where e->>'node_key' = v_node and substr(e->>'key', length(v_node) + 2) ~ '^[0-9]+$';
    keys := array[s.task_key];
    for i in 2..n loop
      next_no := next_no + 1;
      keys := keys || (case when v_node = '' then '' else v_node || '.' end || lpad(next_no::text, 2, '0'));
    end loop;

    new_tasks := '[]'::jsonb;
    used := 0;
    for i in 1..n loop
      share := case when i < n then greatest(round(total::numeric / n)::int, 1) else greatest(total - used, 1) end;
      used := used + share;
      select m.code into v_code from _wl_split x
        join public.plan_act_masters m on m.visible_code = x.visible_code and m.status not in ('superseded', 'archived')
       where x.template_name = s.template_name and x.part = s.part and x.task_key = s.task_key and x.seq = i
       order by m.version desc limit 1;
      t := orig
        || jsonb_build_object(
             'key', keys[i],
             'task_name', s.task_name || ' – ' || (select x.trade from _wl_split x where x.template_name = s.template_name and x.part = s.part and x.task_key = s.task_key and x.seq = i),
             'duration_days', share,
             'sort_order', (orig->>'sort_order')::int + i - 1,
             'master_code', v_code,
             'discipline', coalesce((select x.discipline from _wl_split x where x.template_name = s.template_name and x.part = s.part and x.task_key = s.task_key and x.seq = i), orig->>'discipline'));
      if i > 1 then
        t := t || jsonb_build_object('predecessors', jsonb_build_array(jsonb_build_object('key', keys[i - 1], 'scope', pred_scope, 'type', 'fs', 'lag', 0)));
      end if;
      new_tasks := new_tasks || jsonb_build_array(t);
    end loop;
    last_key := keys[n];

    -- replace the summary by the chain (in place), re-point dependents to the last trade
    select coalesce(jsonb_agg(x order by o, sub), '[]'::jsonb) into out_tasks from (
      select case when e->>'key' = s.task_key then c.t else
               jsonb_set(e, '{predecessors}', coalesce((
                 select jsonb_agg(case when p->>'key' = s.task_key and (p->>'scope' = pred_scope or (pred_scope = 'same' and p->>'scope' = 'prev_floor'))
                                       then jsonb_set(p, '{key}', to_jsonb(last_key)) else p end)
                   from jsonb_array_elements(coalesce(e->'predecessors', '[]'::jsonb)) p), '[]'::jsonb)) end x,
             o, coalesce(c.sub, 0) sub
        from jsonb_array_elements(tasks) with ordinality a(e, o)
        left join lateral (select ct t, cs sub from jsonb_array_elements(new_tasks) with ordinality q(ct, cs) where e->>'key' = s.task_key) c on true
    ) y;

    update public.wbs_templates set content = jsonb_set(content, path, out_tasks) where id = w.id;
  end loop;
end $$;
