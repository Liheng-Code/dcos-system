-- PRJ-2026-004-PC: start each new BOQ activity when its matching original activity started (Supabase SQL Editor, production).
-- WRITES DATA. Run the 5_DRY_RUN file first and check its report.
-- Why: Generate from BOQ added new activities (no baseline) next to original ones on the same floor. They have no
-- predecessor, so file 4 pinned them all to the start of their floor, and the basement work piled up in one month.
-- What it does: for each new activity with no predecessor, finds the original activity on the same floor with the most
-- similar building element, ignoring trade words such as Installation, Concrete, Reinforcement, Formwork (e.g.
-- "Column Formwork Installation" -> "B1 Columns", "Stair Concrete Casting" -> "B1 Staircase"), and sets "Start no
-- earlier than" to that activity's baseline start. No match: the date stays as it is.
-- Needs the pg_trgm extension (similarity); Supabase has it. Afterwards, run Schedule (start 2026-11-01).
begin;
create temp table al_proj on commit drop as select id from projects where project_code = 'PRJ-2026-004-PC';
do $$ begin
  if (select count(*) from al_proj) <> 1 then
    raise exception 'Project PRJ-2026-004-PC not found (or found more than once). Nothing was changed.';
  end if;
  if to_regprocedure('similarity(text,text)') is null then
    raise exception 'The pg_trgm extension is not enabled (Database > Extensions > pg_trgm). Nothing was changed.';
  end if;
end $$;

-- floor of every WBS node = the nearest node above it (or itself) that is in the location map
create temp table al_floor on commit drop as
  with recursive up as (
    select n.id as start_id, n.id as cur, n.parent_id, 0 as lvl from wbs_nodes n where n.project_id = (select id from al_proj)
    union all
    select u.start_id, p.id, p.parent_id, u.lvl + 1 from up u join wbs_nodes p on p.id = u.parent_id where u.lvl < 12
  )
  select distinct on (u.start_id) u.start_id as node_id, u.cur as floor_id
  from up u join plan_location_map m on m.wbs_node_id = u.cur and m.project_id = (select id from al_proj)
  order by u.start_id, u.lvl;

-- element words only: trade and filler words removed, so names compare by what is being built
create temp table al_tasks on commit drop as
  select t.id, t.task_name,
         nullif(trim(regexp_replace(regexp_replace(lower(t.task_name),
           '\m(installation|install|concrete|casting|cast|reinforcement|rebar|formwork|fixing|works?|b1|gf|rf|[0-9]+f|and|to|of|level|course|membrane|system|first|second|fix|supply)\M', ' ', 'g'),
           '[^a-z ]+', ' ', 'g')), '') as element, t.baseline_start_date as bs, f.floor_id, t.constraint_type, t.constraint_date,
         coalesce(array_length(t.dependency_task_ids, 1), 0) as deps
  from wbs_tasks t join al_floor f on f.node_id = t.wbs_node_id
  where t.project_id = (select id from al_proj);

-- best original match per new activity (no predecessor, no constraint or a start-no-earlier-than one)
create temp table al_plan on commit drop as
  select distinct on (n.id) n.id, n.task_name as new_name, o.task_name as matched_original, o.bs as new_date, n.constraint_date as old_date,
         round(similarity(n.element, o.element)::numeric, 2) as score
  from al_tasks n
  join al_tasks o on o.floor_id = n.floor_id and o.bs is not null
  where n.bs is null and n.deps = 0
    and (n.constraint_type is null or n.constraint_type = 'start_no_earlier_than')
    and n.element is not null and o.element is not null
    and similarity(n.element, o.element) >= 0.4
  order by n.id, similarity(n.element, o.element) desc, o.bs;

update wbs_tasks t
   set constraint_type = 'start_no_earlier_than', constraint_date = p.new_date
  from al_plan p
 where t.id = p.id and p.new_date is distinct from p.old_date;

-- report (the SQL Editor shows this table)
select * from (
  select 1 as n, 'Project' as check_item, (select project_code || ' - ' || project_name from projects where id = (select id from al_proj)) as result
  union all select 2, 'New activities with no predecessor', (select count(*)::text from al_tasks where bs is null and deps = 0)
  union all select 3, 'Matched to an original activity', (select count(*)::text from al_plan)
  union all select 4, 'Start date changed', (select count(*)::text from al_plan where new_date is distinct from old_date)
  union all select 5, 'Not matched (date unchanged)', (select (count(*) - (select count(*) from al_plan))::text from al_tasks where bs is null and deps = 0)
  union all select 6, 'New start dates range', (select coalesce(min(new_date)::text || ' to ' || max(new_date)::text, 'none') from al_plan)
  union all select 7, 'Example matches', (select string_agg(new_name || ' -> ' || matched_original || ' (' || new_date || ')', '; ') from (select * from al_plan order by new_date limit 5) x)
  union all select 8, 'Run', 'Saved. Now run Schedule for the project (start 2026-11-01).'
) r order by n;
commit;
