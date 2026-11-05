-- WBS Templates: settle the last unlinked construction tasks (2026-11-05).
--
-- After 20261105135240 / 20261105141434 the editor still flagged 41 tasks. They are not missing work:
--   - tests, inspections and procedures filed under a work discipline get their real one, so the free-task rule
--     (template-activity-rules.ts FREE_DISCIPLINES) treats them as free:
--       MEP Testing -> Commissioning; Pre-sheeting / Structure Inspection, Pavement Testing -> QA/QC;
--       Live-site Safety Plan, Public Notification -> Documentation;
--   - four are real work and get an activity: Helipad -> D03-037 Concrete Casting, Helipad Finishes -> D09-017
--     Epoxy / PU Floor Coating, Navigation Safety Measures -> D26-022 Navigation Lights, Sales Gallery / Show House ->
--     D13-009 Prefabricated Modular Rooms.
-- Only tasks with exactly these names and no master_code change. Nothing is added or removed.

create temp table _wl_fix (task_name text, discipline text, visible_code text) on commit drop;
insert into _wl_fix values
  ('MEP Testing', 'Commissioning', null),
  ('Pre-sheeting Inspection', 'QA/QC', null),
  ('Structure Inspection & Sign-off', 'QA/QC', null),
  ('Pavement Testing (Density, Roughness)', 'QA/QC', null),
  ('Live-Site Safety & Segregation Plan', 'Documentation', null),
  ('Public Notification', 'Documentation', null),
  ('Helipad (if any)', null, 'D03-037'),
  ('Helipad Finishes (if any)', null, 'D09-017'),
  ('Navigation Safety Measures', null, 'D26-022'),
  ('Sales Gallery / Show House', null, 'D13-009');

create temp table _wl_fix_code as
select f.task_name, f.discipline,
       (select m.code from public.plan_act_masters m where m.visible_code = f.visible_code and m.status not in ('superseded', 'archived')
         order by m.version desc limit 1) master_code
  from _wl_fix f;

create or replace function pg_temp.wl_fix_tasks(tasks jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_agg(
           case when f.task_name is null or coalesce(e->>'master_code', '') <> '' then e
                when f.master_code is not null then e || jsonb_build_object('master_code', f.master_code)
                when f.discipline is not null then e || jsonb_build_object('discipline', f.discipline)
                else e end order by o), '[]'::jsonb)
    from jsonb_array_elements(coalesce(tasks, '[]'::jsonb)) with ordinality a(e, o)
    left join _wl_fix_code f on f.task_name = e->>'task_name'
$$;

update public.wbs_templates w
   set content = jsonb_set(w.content, '{sections,tasks}', pg_temp.wl_fix_tasks(w.content->'sections'->'tasks'))
 where jsonb_typeof(w.content->'sections'->'tasks') = 'array';

update public.wbs_templates w
   set content = jsonb_set(w.content, '{floor_blocks}', (
         select jsonb_object_agg(fb.k, case when jsonb_typeof(fb.v->'tasks') = 'array' then jsonb_set(fb.v, '{tasks}', pg_temp.wl_fix_tasks(fb.v->'tasks')) else fb.v end)
           from jsonb_each(w.content->'floor_blocks') fb(k, v)))
 where jsonb_typeof(w.content->'floor_blocks') = 'object' and w.content->'floor_blocks' <> '{}'::jsonb;
