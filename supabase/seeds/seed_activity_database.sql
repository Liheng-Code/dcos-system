-- Seed: backfill the Activity Database catalogue on existing plan_act_masters (idempotent).
-- Run after 20261023091500_planning_activity_database.sql. Runs as postgres.
-- The master guard freezes activity_type on non-draft masters, so it is disabled for this
-- transaction only (division/trade/visible_code do not need that).
begin;

alter table public.plan_act_masters disable trigger trg_plan_act_master_guard;

-- 1. division_id from domain/category/work_type (only where still null)
with m as (
  select pm.id,
         d.code as dom, c.code as cat, coalesce(pm.work_type, '') as wt,
         lower(pm.name) as nm
    from public.plan_act_masters pm
    join public.plan_act_domains d on d.id = pm.domain_id
    join public.plan_act_categories c on c.id = pm.category_id
   where pm.division_id is null
), mapped as (
  select id,
    case
      when nm ~ '(setting.?out|mobili[sz]ation|site (establishment|office)|temporary|preliminar|hoarding)' then '01'
      when wt in ('Survey','Temporary Works') then '01'
      when dom = 'STR' and cat = 'RC' then '03'
      when dom = 'STR' and cat = 'SUB' and wt in ('Earthworks','Sub-base','Piling','Treatment') then '02'
      when dom = 'STR' and cat = 'SUB' and wt = 'Waterproofing' then '07'
      when dom = 'STR' and cat = 'SUB' then '03'
      when dom = 'STR' and wt = 'Steel' then '05'
      when dom = 'STR' and wt = 'Waterproofing' then '07'
      when dom = 'STR' then '03'
      when dom = 'IND' and cat = 'STL' then '05'
      when dom = 'IND' and cat = 'ENV' then '07'
      when dom = 'IND' and cat in ('FND','FLR') then '03'
      when dom = 'IND' then '13'
      when dom = 'ARC' and cat = 'MAS' then '04'
      when dom = 'ARC' and cat = 'OPN' then '08'
      when dom = 'ARC' and cat = 'RF' then '07'
      when dom = 'ARC' and cat = 'FIN' and wt = 'Waterproofing' then '07'
      when dom = 'ARC' and cat = 'FIN' then '09'
      when dom = 'ARC' and cat = 'JNR' then '06'
      when dom = 'ARC' then '09'
      when dom = 'MEP' and cat = 'ELE' then '16'
      when dom = 'MEP' and cat in ('MECH','PLB','FP') then '15'
      when dom = 'MEP' then '15'
      when dom = 'INS' and cat = 'ELV' then '16'
      when dom = 'INS' then '13'
      when dom = 'CIV' then '02'
      when dom = 'EXT' and wt in ('Electrical') then '16'
      when dom = 'EXT' and wt in ('Masonry') then '04'
      when dom = 'EXT' and wt in ('Pool','Sports') then '13'
      when dom = 'EXT' then '02'
      else null
    end as dcode
  from m
)
update public.plan_act_masters pm
   set division_id = dv.id
  from mapped mp
  join public.plan_act_divisions dv on dv.code = mp.dcode
 where pm.id = mp.id;

-- 2. visible_code: dedicated pass in code order so numbering is stable (roots first, then versions inherit)
do $$
declare r record;
begin
  for r in
    select id from public.plan_act_masters
     where visible_code is null and division_id is not null
     order by code, version
  loop
    update public.plan_act_masters set visible_code = null, division_id = division_id where id = r.id;
  end loop;
end $$;

-- 3. trade from discipline
update public.plan_act_masters
   set trade = case discipline
                 when 'STR' then 'Structure'
                 when 'ARC' then 'Architecture'
                 when 'MEP' then 'MEP'
                 when 'CIV' then 'Civil'
                 when 'EXT' then 'External Works'
                 else discipline end
 where trade is null and discipline is not null;

-- 4. activity_type default + obvious work_type mapping
update public.plan_act_masters
   set activity_type = case
         when work_type in ('Testing','Inspection','Commissioning') then 'testing'
         else 'construction' end
 where activity_type is null;

-- 5. master <-> work item links from norms that carry both
insert into public.plan_act_master_work_items (master_id, work_item_id, sort_order)
select n.activity_master_id, n.dwl_work_item_id,
       (row_number() over (partition by n.activity_master_id order by n.code))::int
  from public.plan_productivity_norms n
 where n.activity_master_id is not null and n.dwl_work_item_id is not null
on conflict (master_id, work_item_id) do nothing;

alter table public.plan_act_masters enable trigger trg_plan_act_master_guard;

commit;
