-- Work Library BOQ items: retire two exact duplicates (2026-11-04).
--
-- LIB-CON-001 "C25/30 concrete in slab, m3" and LIB-TIL-001 "Porcelain floor tile 600x600, m2" have the same name,
-- unit and purpose as UR-CON-001-TUR / UR-TIL-001-TUR, which project BOQs use. Nothing references the LIB items
-- except their own build-up and history and the activity links added by 20261104132414 (the UR twins carry the same
-- links), so they are retired like the PL items in 20261104105600: is_active = false (reversible, history kept).
-- The two activity links are removed so the activities list only the item in use; the migration role passes the
-- activity freeze guard and the audit trigger records the delete.

delete from public.plan_act_master_work_items l
using public.dwl_work_items w
where l.work_item_id = w.id and w.code in ('LIB-CON-001', 'LIB-TIL-001')
  and exists (select 1 from public.dwl_work_items twin
              join public.plan_act_master_work_items tl on tl.work_item_id = twin.id and tl.master_id = l.master_id
              where twin.code = case w.code when 'LIB-CON-001' then 'UR-CON-001-TUR' else 'UR-TIL-001-TUR' end);

update public.dwl_work_items set is_active = false
where code in ('LIB-CON-001', 'LIB-TIL-001') and is_active
  and not exists (select 1 from public.qs_boq_items b where b.dwl_work_item_id = dwl_work_items.id)
  and not exists (select 1 from public.tender_boq_items b where b.dwl_work_item_id = dwl_work_items.id);
