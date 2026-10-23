-- Migration: 20261023094500_planning_activity_division_counts_by_code.sql
-- Purpose: Activity Database lists one row per activity code (highest current version). Count and search
--          by code, not by master id.
-- Depends on: 20261023091500_planning_activity_database.sql

create or replace function public.plan_act_bank_search(q text, p_division uuid default null)
returns jsonb
language sql stable security invoker
set search_path to 'public'
as $$
  select jsonb_build_object(
    'activities', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.visible_code nulls last, a.code) from (
        select * from (
          select distinct on (m.code) m.id, m.visible_code, m.code, m.name, m.default_unit, m.division_id
            from public.plan_act_masters m
           where m.status not in ('superseded','archived')
             and (p_division is null or m.division_id = p_division)
             and (coalesce(btrim(q), '') = ''
                  or m.name ilike '%' || btrim(q) || '%'
                  or m.code ilike '%' || btrim(q) || '%'
                  or m.visible_code ilike '%' || btrim(q) || '%')
           order by m.code, m.version desc) latest
         order by latest.visible_code nulls last, latest.code
         limit 200) a), '[]'::jsonb),
    'work_items', coalesce((
      select jsonb_agg(to_jsonb(w)) from (
        select i.id, i.code, i.description, i.unit
          from public.dwl_work_items i
         where i.is_active
           and (p_division is null or exists (
                 select 1 from public.plan_act_master_work_items l
                   join public.plan_act_masters m on m.id = l.master_id
                  where l.work_item_id = i.id and m.division_id = p_division
                    and m.status not in ('superseded','archived')))
           and (coalesce(btrim(q), '') = ''
                or i.description ilike '%' || btrim(q) || '%'
                or i.code ilike '%' || btrim(q) || '%')
         order by i.code
         limit 200) w), '[]'::jsonb)
  );
$$;
grant execute on function public.plan_act_bank_search(text, uuid) to authenticated;

create or replace function public.plan_act_division_counts()
returns table (division_id uuid, activity_count bigint, work_item_count bigint)
language sql stable security invoker
set search_path to 'public'
as $$
  select d.id,
         count(distinct m.code),
         count(distinct l.work_item_id)
    from public.plan_act_divisions d
    left join public.plan_act_masters m
           on m.division_id = d.id and m.status not in ('superseded','archived')
    left join public.plan_act_master_work_items l on l.master_id = m.id
   group by d.id
   order by d.id;
$$;
grant execute on function public.plan_act_division_counts() to authenticated;
