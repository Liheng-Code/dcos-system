-- Infrastructure by chainage (Phase E of the "Activity Library by Sector" plan).
--
-- Linear works (roads, pipelines, cables) are planned per chainage section instead of per floor:
--   * a route is any WBS node (e.g. "RD1 Main Road"); its chainage sections are child nodes of type
--     'segment' with chainage_from_m / chainage_to_m (metres from the route start);
--   * add_chainage_segments() creates them (WBS builder > Chainage sections);
--   * Generate treats a segment like a level: per-section activity templates (applies_to 'segment')
--     with the crew moving section to section (inter-level link);
--   * BOQ lines need no new field: a location label such as "CH 0+000 - 1+500" is read as a range and
--     the location map can share it over the sections it overlaps ('chainage'), or share a whole-route
--     line by section length ('length'). Pure logic: apps/web/lib/planning/chainage.ts.
--   * pipeline / cable lengths fall back to the section length ("calculated" provider).
--
-- Idempotent.

alter table public.wbs_nodes
  add column if not exists chainage_from_m numeric,
  add column if not exists chainage_to_m numeric;

do $c$
begin
  if not exists (select 1 from pg_constraint where conname = 'wbs_nodes_chainage_check') then
    alter table public.wbs_nodes add constraint wbs_nodes_chainage_check
      check ((chainage_from_m is null and chainage_to_m is null)
          or (chainage_from_m is not null and chainage_to_m is not null and chainage_from_m >= 0 and chainage_to_m > chainage_from_m));
  end if;
end $c$;

comment on column public.wbs_nodes.chainage_from_m is 'Chainage section start, metres from the route start (node_type segment).';
comment on column public.wbs_nodes.chainage_to_m is 'Chainage section end, metres from the route start (node_type segment).';

alter table public.plan_location_map drop constraint if exists plan_location_map_split_chk;
alter table public.plan_location_map drop constraint if exists plan_location_map_split_rule_check;
alter table public.plan_location_map add constraint plan_location_map_split_rule_check
  check (split_rule = any (array['none', 'equal', 'gfa', 'length', 'chainage']));

-- Creates chainage sections under a route node; codes already under the route are skipped.
create or replace function public.add_chainage_segments(p_route_id uuid, p_segments jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_project uuid;
  v_type    text;
  v_sort    bigint;
  v_seg     jsonb;
  v_code    text;
  v_from    numeric;
  v_to      numeric;
  v_created text[] := '{}';
  v_skipped text[] := '{}';
begin
  select project_id, node_type into v_project, v_type from public.wbs_nodes where id = p_route_id;
  if v_project is null then
    raise exception 'Route not found' using errcode = 'P0002';
  end if;
  if v_type in ('level', 'segment') then
    raise exception 'Chainage sections go under a route node, not under a level or another section' using errcode = '22023';
  end if;

  select coalesce(max(sort_order), 0) into v_sort from public.wbs_nodes where parent_id = p_route_id;

  for v_seg in select e from jsonb_array_elements(coalesce(p_segments, '[]'::jsonb)) e loop
    v_code := upper(btrim(v_seg->>'code'));
    v_from := (v_seg->>'from')::numeric;
    v_to   := (v_seg->>'to')::numeric;
    if coalesce(v_code, '') = '' or v_from is null or v_to is null or v_to <= v_from or v_from < 0 then
      raise exception 'Every section needs a code and a chainage range (start before end)' using errcode = '22023';
    end if;
    if exists (select 1 from public.wbs_nodes where parent_id = p_route_id and upper(wbs_code) = v_code) then
      v_skipped := v_skipped || v_code;
      continue;
    end if;
    v_sort := v_sort + 1;
    insert into public.wbs_nodes
      (project_id, parent_id, node_type, wbs_code, wbs_name, sort_order, status, area_label, chainage_from_m, chainage_to_m, schedule_level)
    values
      (v_project, p_route_id, 'segment', v_code, coalesce(nullif(btrim(v_seg->>'name'), ''), v_code), v_sort, 'active',
       v_code, v_from, v_to, 3);
    v_created := v_created || v_code;
  end loop;

  return jsonb_build_object('created', to_jsonb(v_created), 'skipped', to_jsonb(v_skipped));
end $function$;

grant execute on function public.add_chainage_segments(uuid, jsonb) to authenticated;

-- Length-type quantities of linear masters can fall back to the section length.
update public.plan_act_quantity_rules
   set provider_priority = provider_priority || array['calculated'],
       note = coalesce(note || ' ', '') || 'Calculated fallback = chainage section length.'
 where metric_code in ('trench_length', 'pipe_bedding_length', 'pipe_length', 'duct_bank_length', 'cable_length_mv_lv', 'fibre_length')
   and not ('calculated' = any(provider_priority));

-- Per-section activity templates (draft) -------------------------------------------------------------
insert into public.plan_act_templates (code, name, description, domain_id, status, version, applies_to_level_types, owner,
  sectors, building_types, inter_level_from_seq, inter_level_to_seq, inter_level_relation, inter_level_lag_days)
select v.code, v.name, v.descr, d.id, 'draft', 1, array['segment'], 'Planning Manager', array['infrastructure'], v.btypes,
       v.from_seq, v.to_seq, 'fs', v.lag
from (values
  ('TPL-INF-RD-SEG-001', 'Road – Chainage Section',
   'Clearing, earthworks, culverts and side drains, subgrade, pavement layers, kerbs and footpaths, barriers, marking and lighting for one chainage section. The next section''s clearing starts when this one''s is done.',
   array['road'], 1, 1, 0),
  ('TPL-INF-PL-SEG-001', 'Pipeline – Chainage Section',
   'Setting out, trench and shoring, bedding, pipe laying, chambers and valves, backfill, house connections, reinstatement and pressure test for one chainage section. The next section''s trench starts when this one''s trench is done.',
   array['water_supply', 'drainage', 'utility', 'other_infrastructure'], 2, 2, 0),
  ('TPL-INF-UT-SEG-001', 'Utility Duct Bank & Cable – Chainage Section',
   'Setting out, duct bank, reinstatement, MV / LV and fibre cable pulling, jointing for one chainage section. The next section''s duct bank starts when this one''s is done.',
   array['utility', 'road', 'water_supply'], 2, 2, 0)
) as v(code, name, descr, btypes, from_seq, to_seq, lag)
cross join public.plan_act_domains d
where d.code = 'CIV' and not exists (select 1 from public.plan_act_templates t where t.code = v.code);

insert into public.plan_act_template_items (template_id, seq, master_id, scope, duration_days_override, is_milestone, note, crews)
select t.id, v.seq, m.id, 'floor', v.fixed_days, false, v.note, v.crews
from (values
  ('TPL-INF-RD-SEG-001',  1, 'CIV-EW-001',  null::numeric, 1, 'Moves on to the next section when done'),
  ('TPL-INF-RD-SEG-001',  2, 'CIV-EW-002',  null, 1, null),
  ('TPL-INF-RD-SEG-001',  3, 'CIV-EW-003',  null, 1, null),
  ('TPL-INF-RD-SEG-001',  4, 'CIV-EW-004',  null, 1, null),
  ('TPL-INF-RD-SEG-001',  5, 'CIV-DRN-001', null, 1, 'Cross culverts before the subgrade'),
  ('TPL-INF-RD-SEG-001',  6, 'CIV-DRN-002', null, 1, null),
  ('TPL-INF-RD-SEG-001',  7, 'CIV-EW-007',  null, 1, null),
  ('TPL-INF-RD-SEG-001',  8, 'CIV-PAV-001', null, 1, null),
  ('TPL-INF-RD-SEG-001',  9, 'CIV-PAV-002', null, 1, null),
  ('TPL-INF-RD-SEG-001', 10, 'CIV-PAV-006', null, 1, null),
  ('TPL-INF-RD-SEG-001', 11, 'CIV-PAV-003', null, 1, null),
  ('TPL-INF-RD-SEG-001', 12, 'CIV-PAV-004', null, 1, null),
  ('TPL-INF-RD-SEG-001', 13, 'CIV-PAV-005', null, 1, null),
  ('TPL-INF-RD-SEG-001', 14, 'CIV-PAV-007', null, 1, null),
  ('TPL-INF-RD-SEG-001', 15, 'CIV-RFN-001', null, 1, null),
  ('TPL-INF-RD-SEG-001', 16, 'CIV-RFN-003', null, 1, null),
  ('TPL-INF-RD-SEG-001', 17, 'CIV-RFN-005', null, 1, null),
  ('TPL-INF-PL-SEG-001',  1, 'STR-RC-SLAB-001', 1, 1, 'Setting out & utility detection'),
  ('TPL-INF-PL-SEG-001',  2, 'CIV-PIP-001', null, 1, 'Moves on to the next section when done'),
  ('TPL-INF-PL-SEG-001',  3, 'CIV-PIP-002', null, 1, null),
  ('TPL-INF-PL-SEG-001',  4, 'CIV-PIP-003', null, 1, null),
  ('TPL-INF-PL-SEG-001',  5, 'CIV-PIP-004', null, 1, null),
  ('TPL-INF-PL-SEG-001',  6, 'CIV-PIP-005', null, 1, null),
  ('TPL-INF-PL-SEG-001',  7, 'STR-SUB-EXC-002', null, 1, 'Trench backfill & compaction'),
  ('TPL-INF-PL-SEG-001',  8, 'CIV-PIP-006', null, 1, null),
  ('TPL-INF-PL-SEG-001',  9, 'CIV-PIP-008', null, 1, null),
  ('TPL-INF-PL-SEG-001', 10, 'CIV-PIP-010', 2, 1, 'Section pressure test'),
  ('TPL-INF-UT-SEG-001',  1, 'STR-RC-SLAB-001', 1, 1, 'Setting out & utility detection'),
  ('TPL-INF-UT-SEG-001',  2, 'CIV-UTL-001', null, 1, 'Moves on to the next section when done'),
  ('TPL-INF-UT-SEG-001',  3, 'CIV-PIP-008', null, 1, null),
  ('TPL-INF-UT-SEG-001',  4, 'CIV-UTL-002', null, 1, null),
  ('TPL-INF-UT-SEG-001',  5, 'CIV-UTL-004', null, 1, null),
  ('TPL-INF-UT-SEG-001',  6, 'CIV-UTL-003', null, 1, null)
) as v(tcode, seq, master_code, fixed_days, crews, note)
join public.plan_act_templates t on t.code = v.tcode and t.version = 1 and t.status = 'draft'
join lateral (
  select mm.id from public.plan_act_masters mm
   where mm.code = v.master_code and mm.status in ('active', 'approved', 'under_review', 'draft')
   order by (mm.status = 'active') desc, mm.version desc limit 1
) m on true
where not exists (select 1 from public.plan_act_template_items i where i.template_id = t.id);

insert into public.plan_act_template_dependencies (template_id, predecessor_item_id, successor_item_id, relation, lag_days, is_optional)
select t.id, p.id, s.id, v.rel, v.lag, false
from (values
  ('TPL-INF-RD-SEG-001',  2,  1,'fs',0), ('TPL-INF-RD-SEG-001',  3,  2,'ss',2), ('TPL-INF-RD-SEG-001',  4,  3,'ss',2),
  ('TPL-INF-RD-SEG-001',  5,  3,'fs',0), ('TPL-INF-RD-SEG-001',  6,  4,'fs',0), ('TPL-INF-RD-SEG-001',  7,  4,'fs',0),
  ('TPL-INF-RD-SEG-001',  7,  5,'fs',0), ('TPL-INF-RD-SEG-001',  8,  7,'fs',0), ('TPL-INF-RD-SEG-001',  9,  8,'ss',2),
  ('TPL-INF-RD-SEG-001', 10,  9,'fs',0), ('TPL-INF-RD-SEG-001', 11,  9,'fs',0), ('TPL-INF-RD-SEG-001', 12, 11,'fs',1),
  ('TPL-INF-RD-SEG-001', 13, 12,'fs',1), ('TPL-INF-RD-SEG-001', 13, 10,'fs',0), ('TPL-INF-RD-SEG-001', 14, 10,'fs',0),
  ('TPL-INF-RD-SEG-001', 15, 13,'fs',0), ('TPL-INF-RD-SEG-001', 16, 13,'fs',2), ('TPL-INF-RD-SEG-001', 17,  6,'fs',0),
  ('TPL-INF-PL-SEG-001',  2,  1,'fs',0), ('TPL-INF-PL-SEG-001',  3,  2,'ss',1), ('TPL-INF-PL-SEG-001',  4,  3,'ss',1),
  ('TPL-INF-PL-SEG-001',  5,  4,'ss',2), ('TPL-INF-PL-SEG-001',  6,  5,'fs',0), ('TPL-INF-PL-SEG-001',  7,  4,'ss',1),
  ('TPL-INF-PL-SEG-001',  8,  7,'fs',0), ('TPL-INF-PL-SEG-001',  9,  7,'fs',0), ('TPL-INF-PL-SEG-001', 10,  6,'fs',0),
  ('TPL-INF-PL-SEG-001', 10,  7,'fs',0),
  ('TPL-INF-UT-SEG-001',  2,  1,'fs',0), ('TPL-INF-UT-SEG-001',  3,  2,'ss',2), ('TPL-INF-UT-SEG-001',  4,  2,'fs',0),
  ('TPL-INF-UT-SEG-001',  5,  2,'fs',0), ('TPL-INF-UT-SEG-001',  6,  4,'fs',0)
) as v(tcode, succ, pred, rel, lag)
join public.plan_act_templates t on t.code = v.tcode and t.version = 1 and t.status = 'draft'
join public.plan_act_template_items s on s.template_id = t.id and s.seq = v.succ
join public.plan_act_template_items p on p.template_id = t.id and p.seq = v.pred
where not exists (select 1 from public.plan_act_template_dependencies d where d.template_id = t.id and d.predecessor_item_id = p.id and d.successor_item_id = s.id);
