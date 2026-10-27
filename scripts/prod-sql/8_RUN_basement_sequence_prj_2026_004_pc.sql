-- PRJ-2026-004-PC: basement (B1) sequence - bored piles first, then excavation (Supabase SQL Editor, production).
-- WRITES DATA. Run the 7_DRY_RUN file first and check its report.
-- Sequence: Site Preparation -> Pile Setting Out -> Bored Pile Installation (BOQ) -> Excavation Support -> Dewatering
--   -> Excavation + Bulk Excavation (BOQ, 2 days into dewatering) -> Earth Disposal -> Formation Level (after Bulk Excavation) -> Soil Compaction
--   -> Pile Head Breaking -> pile caps -> ground beams (existing links) -> B1 Columns -> Shear Walls -> Retaining Walls
--   -> Beams -> Slab -> Staircase (existing links). Foundation Waterproofing after the ground beams; Blockwork and
--   Electrical First Fix after the B1 slab.
-- Each new BOQ activity (no baseline) is linked to start with its original twin (start-to-start), or after it where
-- the work must follow (Blinding after Pile Cap Excavation, Backfill after Waterproofing Protection).
-- For every activity listed below, its links are replaced by the one link shown and its fixed start date is removed.
-- Afterwards, run Schedule for the project (start 2026-11-01).
begin;
create temp table bs_proj on commit drop as select id from projects where project_code = 'PRJ-2026-004-PC';
do $$ begin
  if (select count(*) from bs_proj) <> 1 then
    raise exception 'Project PRJ-2026-004-PC not found (or found more than once). Nothing was changed.';
  end if;
end $$;

-- basement activities: everything under the B1 floor group; "new" = added by Generate from BOQ (no baseline)
create temp table bs_tasks on commit drop as
  with recursive b1 as (
    select n.id from wbs_nodes n
     where n.project_id = (select id from bs_proj) and n.node_type = 'task_group' and n.wbs_name like 'B1%'
    union all
    select n.id from wbs_nodes n join b1 on n.parent_id = b1.id
  )
  select t.id, t.task_name, (t.baseline_start_date is null) as is_new
  from wbs_tasks t where t.wbs_node_id in (select id from b1);

-- the logic: activity (new?) <- predecessor (new?), link type, lag in working days
create temp table bs_logic(ord int, task_name text, task_new boolean, pred_name text, pred_new boolean, link text, lag numeric) on commit drop;
insert into bs_logic values
  -- original programme
  ( 1, 'Pile Setting Out',              false, 'Site Preparation',        false, 'fs', 0),
  ( 2, 'Excavation Support',            false, 'Bored Pile Installation', true,  'fs', 0),
  ( 3, 'Dewatering',                    false, 'Excavation Support',      false, 'fs', 0),
  ( 4, 'Excavation',                    false, 'Dewatering',              false, 'ss', 2),
  ( 5, 'Earth Disposal',                false, 'Excavation',              false, 'ss', 1),
  ( 6, 'Formation Level',               false, 'Bulk Excavation to Basement Level', true, 'fs', 0),
  ( 7, 'Pile Head Breaking',            false, 'Soil Compaction',         false, 'fs', 0),
  ( 8, 'B1 Columns',                    false, 'Ground Beam Concrete',    false, 'fs', 0),
  ( 9, 'Foundation Waterproofing',      false, 'Ground Beam Concrete',    false, 'fs', 0),
  (10, 'Blockwork',                     false, 'B1 Slab',                 false, 'fs', 0),
  (11, 'Electrical First Fix',          false, 'B1 Slab',                 false, 'fs', 0),
  -- new BOQ activities follow their original twin
  (20, 'Clearing & Grubbing',           true,  'Site Preparation',        false, 'ss', 0),
  (21, 'Bored Pile Installation',       true,  'Pile Installation',       false, 'ss', 0),
  (22, 'Pile Integrity & Load Tests',   true,  'Bored Pile Installation', true,  'fs', 0),
  (23, 'Shoring / Excavation Support',  true,  'Excavation Support',      false, 'ss', 0),
  (24, 'Dewatering',                    true,  'Dewatering',              false, 'ss', 0),
  (25, 'Bulk Excavation to Basement Level', true, 'Excavation',           false, 'ss', 0),
  (26, 'Blinding Concrete',             true,  'Pile Cap Excavation',     false, 'fs', 0),
  (27, 'Pile Cap Reinforcement',        true,  'Pile Cap Reinforcement',  false, 'ss', 0),
  (28, 'Pile Cap Formwork',             true,  'Pile Cap Formwork',       false, 'ss', 0),
  (29, 'Pile Cap Concrete Casting',     true,  'Pile Cap Concrete',       false, 'ss', 0),
  (30, 'Ground Beam Reinforcement',     true,  'Ground Beam Reinforcement', false, 'ss', 0),
  (31, 'Ground Beam Formwork',          true,  'Ground Beam Formwork',    false, 'ss', 0),
  (32, 'Ground Beam Concrete Casting',  true,  'Ground Beam Concrete',    false, 'ss', 0),
  (33, 'Column Reinforcement',          true,  'B1 Columns',              false, 'ss', 0),
  (34, 'Column Formwork Installation',  true,  'B1 Columns',              false, 'ss', 0),
  (35, 'Column Concrete Casting',       true,  'B1 Columns',              false, 'ss', 0),
  (36, 'Shear Wall Reinforcement',      true,  'B1 Shear Walls',          false, 'ss', 0),
  (37, 'Shear Wall Concrete Casting',   true,  'B1 Shear Walls',          false, 'ss', 0),
  (38, 'Retaining Wall Reinforcement',  true,  'B1 Retaining Walls',      false, 'ss', 0),
  (39, 'Retaining Wall Formwork',       true,  'B1 Retaining Walls',      false, 'ss', 0),
  (40, 'Retaining Wall Concrete Casting', true, 'B1 Retaining Walls',     false, 'ss', 0),
  (41, 'Beam Reinforcement',            true,  'B1 Beams',                false, 'ss', 0),
  (42, 'Beam Formwork Installation',    true,  'B1 Beams',                false, 'ss', 0),
  (43, 'Beam Concrete Casting',         true,  'B1 Beams',                false, 'ss', 0),
  (44, 'Slab Bottom Reinforcement',     true,  'B1 Slab',                 false, 'ss', 0),
  (45, 'Slab on Grade Concrete Casting', true, 'B1 Slab',                 false, 'ss', 0),
  (46, 'Stair Reinforcement',           true,  'B1 Staircase',            false, 'ss', 0),
  (47, 'Stair Formwork Installation',   true,  'B1 Staircase',            false, 'ss', 0),
  (48, 'Stair Concrete Casting',        true,  'B1 Staircase',            false, 'ss', 0),
  (49, 'Basement Waterproofing Membrane', true, 'Foundation Waterproofing', false, 'ss', 0),
  (50, 'Backfill & Compaction',         true,  'Waterproofing Protection', false, 'fs', 0),
  (51, 'Pump & Motor Installation',     true,  'Fire Fighting',           false, 'ss', 0),
  (52, 'DB / Switchboard Installation', true,  'Electrical First Fix',    false, 'ss', 0),
  (53, 'Epoxy / PU Floor Coating',      true,  'Flooring',                false, 'ss', 0);

-- resolve names to activities (each must be found exactly once; anything else is reported and skipped)
create temp table bs_plan on commit drop as
  select l.*,
         (select count(*) from bs_tasks t where t.task_name = l.task_name and t.is_new = l.task_new) as task_hits,
         (select count(*) from bs_tasks t where t.task_name = l.pred_name and t.is_new = l.pred_new) as pred_hits,
         (select t.id from bs_tasks t where t.task_name = l.task_name and t.is_new = l.task_new limit 1) as task_id,
         (select t.id from bs_tasks t where t.task_name = l.pred_name and t.is_new = l.pred_new limit 1) as pred_id
  from bs_logic l;

update wbs_tasks w
   set dependency_task_ids = array[p.pred_id], dependency_types = array[p.link], dependency_lag_days = array[p.lag],
       constraint_type = null, constraint_date = null
  from bs_plan p
 where w.id = p.task_id and p.task_hits = 1 and p.pred_hits = 1;

-- report (the SQL Editor shows this table)
select * from (
  select 1 as n, 'Project' as check_item, (select project_code || ' - ' || project_name from projects where id = (select id from bs_proj)) as result
  union all select 2, 'Basement activities found', (select count(*) || ' (' || count(*) filter (where is_new) || ' new from BOQ)' from bs_tasks)
  union all select 3, 'Links set', (select count(*) || ' of ' || (select count(*) from bs_logic) from bs_plan where task_hits = 1 and pred_hits = 1)
  union all select 4, 'Skipped (activity not found once)', coalesce((select string_agg(task_name || case when task_new then ' [new]' else '' end || ' x' || task_hits, '; ') from bs_plan where task_hits <> 1), 'none')
  union all select 5, 'Skipped (predecessor not found once)', coalesce((select string_agg(pred_name || ' x' || pred_hits, '; ') from bs_plan where task_hits = 1 and pred_hits <> 1), 'none')
  union all select 6, 'Run', 'Saved. Now run Schedule for the project (start 2026-11-01).'
) r order by n;
commit;
