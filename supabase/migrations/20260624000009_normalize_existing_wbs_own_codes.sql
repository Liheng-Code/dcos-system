-- Normalize existing WBS nodes created by earlier Master Library generation.
-- wbs_code should store only the node's own code (for example BLD-001 or
-- LVL-GF). full_path remains the combined hierarchy display.

alter table public.wbs_nodes
  drop constraint if exists wbs_nodes_project_id_wbs_code_key;

create unique index if not exists wbs_nodes_sibling_unique
  on public.wbs_nodes (project_id, parent_id, wbs_code) nulls not distinct;

create or replace function public.update_wbs_full_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  with recursive ancestors as (
    select new.wbs_code as wbs_code, new.parent_id as parent_id, 1 as depth
    union all
    select n.wbs_code, n.parent_id, a.depth + 1
      from public.wbs_nodes n
      join ancestors a on n.id = a.parent_id
  )
  select string_agg(wbs_code, ' / ' order by depth desc)
    into new.full_path
    from ancestors;

  return new;
end;
$$;

drop table if exists _wbs_own_code_candidates;
create temp table _wbs_own_code_candidates (
  id uuid primary key,
  own_code text not null
) on commit drop;

insert into _wbs_own_code_candidates (id, own_code)
select distinct on (n.id) n.id, upper(c.own_code)
from public.wbs_nodes n
join lateral (
  select phase_code as own_code, phase_name as own_name
    from public.phase_master
   where n.node_type = 'phase'
  union all
  select building_code, building_name
    from public.building_master
   where n.node_type = 'building'
  union all
  select level_code, level_name
    from public.level_master
   where n.node_type = 'level'
  union all
  select zone_code, zone_name
    from public.zone_master
   where n.node_type = 'zone'
  union all
  select room_code, room_name
    from public.room_master
   where n.node_type = 'room'
  union all
  select element_code, element_name
    from public.element_master
   where n.node_type = 'element'
  union all
  select discipline_code, discipline_name
    from public.discipline_master
   where n.node_type = 'discipline'
  union all
  select task_group_code, task_group_name
    from public.task_group_master
   where n.node_type = 'task_group'
) c on (
  n.wbs_code = upper(c.own_code)
  or n.wbs_code like '%-' || upper(c.own_code)
)
where n.wbs_name = c.own_name
order by n.id, length(c.own_code) desc;

insert into _wbs_own_code_candidates (id, own_code)
select id, own_code
from (
  select id,
         case node_type
           when 'phase' then substring(wbs_code from '(PH-[A-Z0-9][A-Z0-9-]*)$')
           when 'building' then substring(wbs_code from '(BLD-[A-Z0-9][A-Z0-9-]*)$')
           when 'level' then substring(wbs_code from '(LVL-[A-Z0-9][A-Z0-9-]*)$')
           when 'zone' then substring(wbs_code from '(ZN-[A-Z0-9][A-Z0-9-]*)$')
           when 'room' then substring(wbs_code from '(RM-[A-Z0-9][A-Z0-9-]*)$')
           when 'element' then substring(wbs_code from '(EL-[A-Z0-9][A-Z0-9-]*)$')
           when 'task_group' then substring(wbs_code from '(TG-[A-Z0-9][A-Z0-9-]*)$')
         end as own_code
    from public.wbs_nodes
   where node_type in ('phase', 'building', 'level', 'zone', 'room', 'element', 'task_group')
     and wbs_code like '%-%-%'
) fallback
where own_code is not null
on conflict (id) do nothing;

update public.wbs_nodes n
   set wbs_code = c.own_code,
       updated_at = now()
  from _wbs_own_code_candidates c
 where n.id = c.id
   and n.wbs_code <> c.own_code
   and not exists (
     select 1
       from public.wbs_nodes sibling
      where sibling.project_id = n.project_id
        and sibling.parent_id is not distinct from n.parent_id
        and sibling.id <> n.id
        and sibling.wbs_code = c.own_code
   )
   and not exists (
     select 1
       from _wbs_own_code_candidates sibling_candidate
       join public.wbs_nodes sibling on sibling.id = sibling_candidate.id
      where sibling.project_id = n.project_id
        and sibling.parent_id is not distinct from n.parent_id
        and sibling.id <> n.id
        and sibling_candidate.own_code = c.own_code
   );

with recursive paths as (
  select id, parent_id, wbs_code, wbs_code::text as full_path
    from public.wbs_nodes
   where parent_id is null
  union all
  select child.id,
         child.parent_id,
         child.wbs_code,
         paths.full_path || ' / ' || child.wbs_code
    from public.wbs_nodes child
    join paths on paths.id = child.parent_id
)
update public.wbs_nodes n
   set full_path = paths.full_path
  from paths
 where n.id = paths.id
   and n.full_path is distinct from paths.full_path;
