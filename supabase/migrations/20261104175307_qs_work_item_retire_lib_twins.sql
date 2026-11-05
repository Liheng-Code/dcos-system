-- Construction Work Library: retire the 6 LIB-* BOQ items that duplicate a UR-* item (2026-11-04, Wave 3 item 9).
--
-- User-approved review: same name and unit as the UR twin; keep UR (current turnkey rates), retire LIB, as
-- 20261104134314 did for LIB-CON-001 / LIB-TIL-001. Unlike those two, these are used by BOQ lines, so:
--   - existing qs_boq_items / tender_boq_items keep pointing at the LIB item (re-pointing would change project
--     prices: a QS decision), and the LIB item keeps its activity links so Generate from BOQ still schedules them;
--   - retiring (is_active = false) only hides it from pickers and the BOQ tab's default list.
-- The UR twin first gets any activity link the LIB item has and it lacks (rebar: D03-029, D03-041, D03-049, D03-056),
-- so new BOQ lines on the kept item map to the same activities. Matched by code, only while the twin is active.

-- ── Links: LIB -> UR twin, where missing ──────────────────────────────────
insert into public.plan_act_master_work_items (master_id, work_item_id, duration_days_per_unit, share_pct, sort_order, source)
select l.master_id, ur.id, l.duration_days_per_unit, l.share_pct,
       10 + 10 * (select count(*) from public.plan_act_master_work_items x where x.master_id = l.master_id), 'manual'
from (values
  ('LIB-REB-001', 'UR-REB-001-TUR'), ('LIB-FWK-001', 'UR-FWK-001-TUR'), ('LIB-BLK-001', 'UR-BLK-001-TUR'),
  ('LIB-PLA-001', 'UR-PLA-001-TUR'), ('LIB-MEP-002', 'UR-MEP-002'), ('LIB-MEP-003', 'UR-MEP-003')
) v(lib_code, ur_code)
join public.dwl_work_items lib on lib.code = v.lib_code
join public.dwl_work_items ur on ur.code = v.ur_code and ur.is_active
join public.plan_act_master_work_items l on l.work_item_id = lib.id
join public.plan_act_masters m on m.id = l.master_id and m.status not in ('superseded', 'archived')
where not exists (select 1 from public.plan_act_master_work_items x where x.master_id = l.master_id and x.work_item_id = ur.id);

-- ── Retire the LIB items ──────────────────────────────────────────────────
update public.dwl_work_items lib
   set is_active = false
  from (values
    ('LIB-REB-001', 'UR-REB-001-TUR'), ('LIB-FWK-001', 'UR-FWK-001-TUR'), ('LIB-BLK-001', 'UR-BLK-001-TUR'),
    ('LIB-PLA-001', 'UR-PLA-001-TUR'), ('LIB-MEP-002', 'UR-MEP-002'), ('LIB-MEP-003', 'UR-MEP-003')
  ) v(lib_code, ur_code)
  join public.dwl_work_items ur on ur.code = v.ur_code and ur.is_active
 where lib.code = v.lib_code and lib.is_active;
