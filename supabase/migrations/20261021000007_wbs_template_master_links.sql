-- WBS templates link their activities to Activity Masters (Phase D of the "Activity Library by
-- Sector" plan).
--
-- A WBS template activity may carry master_code (plan_act_masters.code; lib/project/wbs/
-- wbs-template.ts). apply_wbs_template now sets wbs_tasks.activity_master_id from it after the
-- import, so activities created from a template get their master straight away: norms, quantity x
-- rate durations (Task Work) and the default step template. Activities that already exist in the
-- project but have no master are linked too, so re-applying a template fills the links on a WBS
-- built earlier. A planner's own master on an activity is never changed.
--
-- Backfill: activities of the seeded WBS templates are linked by exact activity name (floor blocks,
-- and construction sections 03.*). Design / procurement lines with the same words are not linked,
-- and infrastructure templates wait for the civil masters (Phase B, later). Only activities with no
-- master_code are touched, so links a planner set in Master Libraries are kept.

create temp table _wbs_master_map (task_name text primary key, master_code text not null) on commit drop;
insert into _wbs_master_map (task_name, master_code) values
  ('Acoustic Ceiling', 'ARC-FIN-CLG-002'),
  ('AHU / FCU Installation', 'MEP-HVAC-002'),
  ('Aluminium Windows & Sliding Doors', 'ARC-DW-003'),
  ('Backfilling', 'STR-SUB-EXC-002'),
  ('Backfilling & Compaction', 'STR-SUB-EXC-002'),
  ('Balcony Railings', 'ARC-JNR-003'),
  ('Bathroom & Balcony Waterproofing', 'ARC-FIN-FLR-003'),
  ('Bathroom & Kitchen Wall Tiling', 'ARC-FIN-WAL-003'),
  ('Bathroom Wall Tiling', 'ARC-FIN-WAL-003'),
  ('Bathroom Waterproofing', 'ARC-FIN-FLR-003'),
  ('Beam & Slab Formwork', 'STR-RC-SLAB-002'),
  ('Beam & Slab Reinforcement', 'STR-RC-SLAB-004'),
  ('Beam Formwork', 'STR-RC-BEAM-002'),
  ('Beam Reinforcement', 'STR-RC-BEAM-001'),
  ('Blinding Concrete', 'STR-SUB-FTG-001'),
  ('Blockwork', 'ARC-MAS-BLK-001'),
  ('Blockwork (Plant & Service Rooms)', 'ARC-MAS-BLK-001'),
  ('Blockwork (Plant Rooms)', 'ARC-MAS-BLK-001'),
  ('Blockwork & Acoustic Partitions', 'ARC-MAS-BLK-001'),
  ('Blockwork & Partitions', 'ARC-MAS-BLK-001'),
  ('Blockwork & Unit Partitions', 'ARC-MAS-BLK-001'),
  ('Boundary Wall', 'EXT-FEN-001'),
  ('Boundary Wall & Gate', 'EXT-FEN-001'),
  ('Boundary Wall & Gatehouse', 'EXT-FEN-001'),
  ('Built-in Joinery', 'ARC-JNR-002'),
  ('Cable Pulling', 'MEP-ELE-002'),
  ('Ceiling', 'ARC-FIN-CLG-003'),
  ('Chilled Water Pipes', 'MEP-HVAC-003'),
  ('Column / Core Wall Concrete', 'STR-RC-COL-003'),
  ('Column / Core Wall Formwork', 'STR-RC-COL-002'),
  ('Column / Core Wall Reinforcement', 'STR-RC-COL-001'),
  ('Column Concrete', 'STR-RC-COL-003'),
  ('Column Footings', 'STR-SUB-FTG-004'),
  ('Column Formwork', 'STR-RC-COL-002'),
  ('Column Reinforcement', 'STR-RC-COL-001'),
  ('Composite Deck / Slab Formwork', 'STR-RC-SLAB-002'),
  ('Composite Deck / Slab Reinforcement', 'STR-RC-SLAB-004'),
  ('Concrete Curing', 'STR-RC-SLAB-009'),
  ('Concrete Pour', 'STR-RC-SLAB-007'),
  ('Core Plastering', 'ARC-FIN-WAL-002'),
  ('Curing & Formwork Stripping', 'STR-RC-SLAB-010'),
  ('DB Installation', 'MEP-ELE-004'),
  ('DBs', 'MEP-ELE-004'),
  ('Diffusers & Grilles', 'MEP-HVAC-004'),
  ('Distribution Board', 'MEP-ELE-004'),
  ('Door Frames', 'ARC-DW-001'),
  ('Doors', 'ARC-DW-002'),
  ('Drainage Pipes', 'MEP-PLB-003'),
  ('Driveway & Paving', 'EXT-PAV-001'),
  ('Driveways & Car Park', 'EXT-PAV-001'),
  ('Electrical Conduits', 'MEP-ELE-001'),
  ('Electrical Conduits & Boxes', 'MEP-ELE-001'),
  ('Electrical Conduits & Trunking', 'MEP-ELE-001'),
  ('Embedded Items', 'STR-RC-SLAB-003'),
  ('Embedded Items & Sleeves', 'STR-RC-SLAB-003'),
  ('External Drainage', 'EXT-DRN-001'),
  ('External Drainage & Manholes', 'EXT-DRN-001'),
  ('FCU Installation & Grilles', 'MEP-HVAC-002'),
  ('Floor Finishes', 'ARC-FIN-FLR-004'),
  ('Floor Finishes (Tile / Timber)', 'ARC-FIN-FLR-004'),
  ('Floor Tiling', 'ARC-FIN-FLR-004'),
  ('Floor Tiling / Stone', 'ARC-FIN-FLR-004'),
  ('Flooring', 'ARC-FIN-FLR-004'),
  ('Footing Excavation', 'STR-SUB-EXC-001'),
  ('Footings / Pile Caps', 'STR-SUB-FTG-004'),
  ('Formwork Removal', 'STR-RC-SLAB-010'),
  ('Garden & Landscaping', 'EXT-LND-001'),
  ('Glass Balustrades', 'ARC-JNR-003'),
  ('Ground Beam Concrete', 'STR-SUB-GB-003'),
  ('Ground Beam Formwork', 'STR-SUB-GB-002'),
  ('Ground Beam Reinforcement', 'STR-SUB-GB-001'),
  ('Ground Beams', 'STR-SUB-GB-003'),
  ('Ground Beams & Ground Slab', 'STR-SUB-SOG-003'),
  ('Gutters & Downpipes', 'ARC-RF-004'),
  ('Gypsum Ceiling', 'ARC-FIN-CLG-003'),
  ('Handrails & Stairs', 'ARC-JNR-003'),
  ('HVAC Ductwork', 'MEP-HVAC-001'),
  ('Internal Doors', 'ARC-DW-002'),
  ('Internal Painting', 'ARC-FIN-WAL-004'),
  ('Kitchen Cabinets', 'ARC-JNR-001'),
  ('Kitchen Cabinets & Wardrobes', 'ARC-JNR-001'),
  ('Landscaping', 'EXT-LND-001'),
  ('Landscaping & Garden', 'EXT-LND-001'),
  ('Landscaping & Playground', 'EXT-LND-001'),
  ('Landscaping & Tree Planting', 'EXT-LND-001'),
  ('MEP Embedded Items', 'STR-RC-SLAB-003'),
  ('MEP Embedded Items & Sleeves', 'STR-RC-SLAB-003'),
  ('Painting', 'ARC-FIN-WAL-004'),
  ('Perimeter Wall', 'EXT-FEN-001'),
  ('Plaster', 'ARC-FIN-WAL-002'),
  ('Plastering', 'ARC-FIN-WAL-002'),
  ('Plumbing Fixtures', 'MEP-PLB-004'),
  ('Plumbing Pipes', 'MEP-PLB-001'),
  ('Pool Finishes & Equipment', 'EXT-POOL-002'),
  ('Pool Tiling', 'EXT-POOL-002'),
  ('Post-Tensioning Tendons & MEP Embedded Items & Sleeves', 'STR-RC-SLAB-003'),
  ('Pre-pour Inspection', 'STR-RC-SLAB-006'),
  ('PT Slab & Band Beam Formwork', 'STR-RC-SLAB-002'),
  ('PT Slab & Band Beam Reinforcement', 'STR-RC-SLAB-004'),
  ('Roof Beam & Slab Formwork', 'STR-RC-SLAB-002'),
  ('Roof Beam & Slab Reinforcement', 'STR-RC-SLAB-004'),
  ('Roof Slab Formwork', 'STR-RC-SLAB-002'),
  ('Roof Slab Reinforcement', 'STR-RC-SLAB-004'),
  ('Roof Tiles / Sheeting', 'ARC-RF-003'),
  ('Roof Waterproofing', 'ARC-RF-005'),
  ('Roof Waterproofing / Underlay', 'ARC-RF-002'),
  ('Roof Waterproofing Membrane', 'ARC-RF-005'),
  ('Sanitary & Drainage Pipes', 'MEP-PLB-003'),
  ('Sanitary Fixtures', 'MEP-PLB-004'),
  ('Sanitary Fixtures & Fittings', 'MEP-PLB-004'),
  ('Screed', 'ARC-FIN-FLR-002'),
  ('Septic Tank / Sewer Connection', 'EXT-SEP-001'),
  ('Setting Out', 'STR-RC-SLAB-001'),
  ('Setting Out & Survey', 'STR-RC-SLAB-001'),
  ('Shear Wall Concrete', 'STR-RC-WALL-003'),
  ('Shear Wall Formwork', 'STR-RC-WALL-002'),
  ('Shear Wall Reinforcement', 'STR-RC-WALL-001'),
  ('Slab Concrete Pour', 'STR-RC-SLAB-007'),
  ('Slab Formwork', 'STR-RC-SLAB-002'),
  ('Slab Reinforcement', 'STR-RC-SLAB-004'),
  ('Sprinkler Heads', 'MEP-FP-002'),
  ('Sprinkler Pipes', 'MEP-FP-001'),
  ('Stressing, Curing & Formwork Stripping', 'STR-RC-SLAB-010'),
  ('Suspended Ceiling', 'ARC-FIN-CLG-003'),
  ('Swimming Pool', 'EXT-POOL-001'),
  ('Swimming Pool & Deck', 'EXT-POOL-001'),
  ('Swimming Pool Structure', 'EXT-POOL-001'),
  ('Switches & Sockets', 'MEP-ELE-006'),
  ('Switches, Sockets & Lighting', 'MEP-ELE-006'),
  ('Toilet Tiling', 'ARC-FIN-WAL-003'),
  ('Toilet Waterproofing', 'ARC-FIN-FLR-003'),
  ('Vinyl / Tile Flooring', 'ARC-FIN-FLR-004'),
  ('Wall Tiling', 'ARC-FIN-WAL-003'),
  ('Wardrobes & Joinery', 'ARC-JNR-002'),
  ('Water Heaters', 'MEP-PLB-005'),
  ('Water Supply Pipes', 'MEP-PLB-001'),
  ('Waterproofing (Wet Areas)', 'ARC-FIN-FLR-003'),
  ('Wet Area Waterproofing', 'ARC-FIN-FLR-003'),
  ('Windows', 'ARC-DW-003'),
  ('Windows & Balcony Doors', 'ARC-DW-003'),
  ('Windows & External Doors', 'ARC-DW-003');

create or replace function pg_temp.link_tasks(arr jsonb, construction_only boolean) returns jsonb
language sql stable as $f$
  select coalesce(jsonb_agg(
           case when coalesce(x->>'master_code', '') = '' and m.master_code is not null
                     and (not construction_only or (x->>'node_key') like '03%')
                then x || jsonb_build_object('master_code', m.master_code)
                else x end order by o), '[]'::jsonb)
  from jsonb_array_elements(coalesce(arr, '[]'::jsonb)) with ordinality e(x, o)
  left join _wbs_master_map m on lower(m.task_name) = lower(btrim(x->>'task_name'))
$f$;

update public.wbs_templates w
   set content = jsonb_set(
         jsonb_set(w.content, '{sections,tasks}', pg_temp.link_tasks(w.content->'sections'->'tasks', true)),
         '{floor_blocks}',
         coalesce((select jsonb_object_agg(b.key, b.value || jsonb_build_object('tasks', pg_temp.link_tasks(b.value->'tasks', false)))
                     from jsonb_each(coalesce(w.content->'floor_blocks', '{}'::jsonb)) b), '{}'::jsonb))
 where w.template_category is distinct from 'infrastructure'
   and jsonb_typeof(w.content->'sections') = 'object';

create or replace function public.apply_wbs_template(p_project_id uuid, p_template_id uuid, p_payload jsonb, p_levels jsonb default '[]'::jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_before  text[];
  v_result  jsonb;
  v_lvl     jsonb;
  v_node    uuid;
  v_type    text;
  v_gfa     numeric;
  v_ver     integer;
  v_updated integer := 0;
  v_linked  uuid[];
begin
  if p_project_id is null then
    raise exception 'Project is required' using errcode = '22023';
  end if;

  with recursive chain as (
    select id, wbs_code::text as k from public.wbs_nodes where project_id = p_project_id and parent_id is null
    union all
    select n.id, c.k || '.' || n.wbs_code from public.wbs_nodes n join chain c on n.parent_id = c.id
  )
  select coalesce(array_agg(k), '{}') into v_before from chain;

  v_result := public.import_master_wbs(p_project_id, p_payload, 'merge');

  for v_lvl in select e from jsonb_array_elements(coalesce(p_levels, '[]'::jsonb)) e loop
    continue when (v_lvl->>'key') = any(v_before);
    with recursive chain as (
      select id, wbs_code::text as k from public.wbs_nodes where project_id = p_project_id and parent_id is null
      union all
      select n.id, c.k || '.' || n.wbs_code from public.wbs_nodes n join chain c on n.parent_id = c.id
    )
    select id into v_node from chain where k = v_lvl->>'key' limit 1;
    continue when v_node is null;

    v_type := coalesce(nullif(v_lvl->>'level_type', ''), 'typical');
    v_ver := null;
    if nullif(v_lvl->>'source_level_template_id', '') is not null then
      select version into v_ver from public.level_naming_templates where id = (v_lvl->>'source_level_template_id')::uuid;
    end if;
    update public.wbs_nodes
       set level_type     = v_type,
           floor_height_m = nullif(v_lvl->>'floor_height_m', '')::numeric,
           is_basement    = v_type = 'basement',
           is_below_ground = v_type = 'basement' or is_below_ground,
           source_level_template_id      = case when v_ver is not null then (v_lvl->>'source_level_template_id')::uuid end,
           source_level_template_version = v_ver
     where id = v_node and node_type = 'level';

    v_gfa := nullif(v_lvl->>'typical_gfa_m2', '')::numeric;
    if v_gfa is not null and v_gfa > 0 then
      insert into public.wbs_node_quantities (wbs_node_id, project_id, metric_code, value, unit, source, created_by)
      values (v_node, p_project_id, 'GFA', v_gfa, 'm2', 'WBS template', auth.uid())
      on conflict (wbs_node_id, metric_code) do nothing;
    end if;
    v_updated := v_updated + 1;
  end loop;

  -- Activity masters from the template (task_code = the template key path, unique per project).
  -- The active version of each master, else its newest; an activity that already has a master keeps it.
  with wanted as (
    select distinct on (e->>'task_code') e->>'task_code' as task_code, btrim(e->>'master_code') as master_code
      from jsonb_array_elements(coalesce(p_payload->'tasks', '[]'::jsonb)) e
     where coalesce(btrim(e->>'master_code'), '') <> ''
  ), masters as (
    select distinct on (m.code) m.code, m.id
      from public.plan_act_masters m
     where m.code in (select master_code from wanted) and m.status in ('active', 'approved', 'under_review', 'draft')
     order by m.code, (m.status = 'active') desc, m.version desc
  ), upd as (
    update public.wbs_tasks t
       set activity_master_id = ms.id
      from wanted w join masters ms on ms.code = w.master_code
     where t.project_id = p_project_id and t.task_code = w.task_code and t.activity_master_id is null
    returning t.id
  )
  select coalesce(array_agg(id), '{}') into v_linked from upd;

  if p_template_id is not null then
    update public.projects set wbs_template_id = p_template_id where id = p_project_id;
  end if;

  return v_result || jsonb_build_object(
    'levels_updated', v_updated,
    'masters_linked', coalesce(array_length(v_linked, 1), 0),
    'linked_task_ids', to_jsonb(v_linked));
end $function$;
