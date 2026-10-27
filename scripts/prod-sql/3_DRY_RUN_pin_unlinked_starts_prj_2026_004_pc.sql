-- PRJ-2026-004-PC: stop the programme bunching at the start (run by hand in the Supabase SQL Editor, production).
-- DRY RUN: everything is rolled back at the end; the result table shows what WOULD change.
-- Why: activities with no predecessor are placed on the project start by the scheduler. Their original dates were
-- typed in, not driven by links, so after "Schedule" the work piles up in the first months.
-- What it does: gives each activity that has no predecessor and no date constraint a "Start no earlier than" date:
--   * an original activity: its baseline start date (baseline of 8 Sep 2026);
--   * a new activity from Generate from BOQ (no baseline): the earliest baseline start on its floor / WBS group.
-- Nothing else changes. Afterwards, run Schedule for the project (start 2026-11-01) so the dates are recalculated.
begin;
create temp table pin_proj on commit drop as
  select id, start_date from projects where project_code = 'PRJ-2026-004-PC';
do $$ begin
  if (select count(*) from pin_proj) <> 1 then
    raise exception 'Project PRJ-2026-004-PC not found (or found more than once). Nothing was changed.';
  end if;
end $$;

-- project start used as the floor: projects.start_date, else the earliest baseline start
create temp table pin_ctx on commit drop as
  select p.id as project_id,
         coalesce(p.start_date, (select min(baseline_start_date) from wbs_tasks where project_id = p.id)) as project_start
  from pin_proj p;

-- candidates: no predecessor, no constraint yet
create temp table pin_roots on commit drop as
  select t.id, t.wbs_node_id, t.baseline_start_date
  from wbs_tasks t, pin_ctx c
  where t.project_id = c.project_id
    and coalesce(array_length(t.dependency_task_ids, 1), 0) = 0
    and t.constraint_type is null;

-- earliest baseline start per WBS node, counting every activity below the node
create temp table pin_groups on commit drop as
  with recursive anc as (
    select t.baseline_start_date as d, t.wbs_node_id as node
      from wbs_tasks t, pin_ctx c
     where t.project_id = c.project_id and t.baseline_start_date is not null
    union all
    select a.d, n.parent_id from anc a join wbs_nodes n on n.id = a.node where n.parent_id is not null
  )
  select node, min(d) as d from anc group by node;

create temp table pin_plan on commit drop as
  select r.id,
         case when r.baseline_start_date is not null then 'original activity' else 'new activity (BOQ)' end as kind,
         coalesce(r.baseline_start_date, g.d) as pin_date
  from pin_roots r left join pin_groups g on g.node = r.wbs_node_id, pin_ctx c
  where coalesce(r.baseline_start_date, g.d) > c.project_start;

update wbs_tasks t
   set constraint_type = 'start_no_earlier_than', constraint_date = p.pin_date
  from pin_plan p
 where t.id = p.id;

-- report (the SQL Editor shows this table)
select * from (
  select 1 as n, 'Project' as check_item, (select project_code || ' - ' || project_name from projects where id = (select project_id from pin_ctx)) as result
  union all select 2, 'Project start used', (select project_start::text from pin_ctx)
  union all select 3, 'Activities with no predecessor', (select count(*)::text from pin_roots)
  union all select 4, 'Pinned: original activities', (select count(*)::text from pin_plan where kind = 'original activity')
  union all select 5, 'Pinned: new activities (BOQ)', (select count(*)::text from pin_plan where kind = 'new activity (BOQ)')
  union all select 6, 'Left at project start (start is already right)', (select (count(*) - (select count(*) from pin_plan))::text from pin_roots)
  union all select 7, 'Pinned dates range', (select coalesce(min(pin_date)::text || ' to ' || max(pin_date)::text, 'none') from pin_plan)
  union all select 8, 'Run', 'DRY RUN - rolled back, nothing saved'
) r order by n;
rollback;
