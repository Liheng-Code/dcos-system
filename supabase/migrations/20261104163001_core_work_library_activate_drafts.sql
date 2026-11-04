-- Construction Work Library: activate the 117 reviewed draft activities (2026-11-04).
--
-- User-approved review (draft-activity-review.xlsx): all 117 drafts activated as suggested. They are new codes
-- (none supersedes an existing version), each has a CSI section, and every quantity-based one has a library norm
-- (draft, mostly ASSUMPTION; norms are approved separately once calibrated).
-- BOQ links are frozen once a master is active, so the 3 approved links are added first, while still draft.
-- Status follows the guard's path draft -> under_review -> approved -> active, with the reviewer recorded as
-- approver (null where that user does not exist). Rows are matched by code AND status 'draft', so a re-run or a
-- database where an activity was already handled changes nothing.

create temp table _activate (code text primary key) on commit drop;
insert into _activate (code) values
    ('ARC-DW-006'), ('ARC-DW-007'), ('ARC-DW-008'), ('ARC-DW-009'), ('ARC-DW-010'), ('ARC-DW-011'),
    ('ARC-FIN-WAL-007'), ('ARC-FUR-001'), ('ARC-FUR-002'), ('ARC-FUR-003'), ('ARC-FUR-004'), ('ARC-FUR-005'),
    ('ARC-FUR-006'), ('ARC-FUR-007'), ('ARC-FUR-008'), ('ARC-FUR-009'), ('ARC-JNR-005'), ('ARC-JNR-006'),
    ('ARC-JNR-007'), ('ARC-JNR-008'), ('ARC-JNR-009'), ('ARC-JNR-010'), ('ARC-MAS-BLK-001'), ('ARC-MAS-BLK-002'),
    ('ARC-MAS-BLK-003'), ('ARC-MAS-BLK-004'), ('ARC-MAS-BLK-005'), ('ARC-MAS-BLK-006'), ('ARC-SPC-001'), ('ARC-SPC-002'),
    ('ARC-SPC-003'), ('ARC-SPC-004'), ('ARC-SPC-005'), ('ARC-SPC-006'), ('ARC-SPC-007'), ('ARC-SPC-008'),
    ('ARC-SPC-009'), ('ARC-SPC-010'), ('ARC-SPC-011'), ('MEP-BMS-001'), ('MEP-BMS-002'), ('MEP-BMS-003'),
    ('MEP-BMS-004'), ('MEP-COM-001'), ('MEP-COM-002'), ('MEP-COM-003'), ('MEP-COM-004'), ('MEP-ELE-010'),
    ('MEP-ELE-011'), ('MEP-ELE-012'), ('MEP-ELE-013'), ('MEP-ELE-014'), ('MEP-FP-007'), ('MEP-FP-008'),
    ('MEP-FP-009'), ('MEP-FP-010'), ('MEP-HVAC-008'), ('MEP-HVAC-009'), ('MEP-HVAC-010'), ('MEP-HVAC-011'),
    ('MEP-HVAC-012'), ('MEP-HVAC-013'), ('MEP-HVAC-014'), ('MEP-LFT-001'), ('MEP-LFT-002'), ('MEP-LFT-003'),
    ('MEP-LFT-004'), ('MEP-LFT-005'), ('MEP-LFT-006'), ('MEP-PLB-007'), ('MEP-PLB-008'), ('MEP-PLB-009'),
    ('MEP-PLB-010'), ('MEP-PLB-011'), ('MEP-SEC-001'), ('MEP-SEC-002'), ('MEP-SEC-003'), ('MEP-SEC-004'),
    ('MEP-SEC-005'), ('PRE-ACC-001'), ('PRE-ACC-002'), ('PRE-ACC-003'), ('PRE-ACC-004'), ('PRE-CLS-001'),
    ('PRE-CLS-002'), ('PRE-CLS-003'), ('PRE-CLS-004'), ('PRE-DEM-001'), ('PRE-DEM-002'), ('PRE-DEM-003'),
    ('PRE-DEM-004'), ('PRE-DEM-005'), ('PRE-DEM-006'), ('PRE-SVY-001'), ('PRE-SVY-002'), ('PRE-SVY-003'),
    ('PRE-TMP-001'), ('PRE-TMP-002'), ('PRE-TMP-003'), ('PRE-TMP-004'), ('PRE-TMP-005'), ('PRE-TMP-006'),
    ('STR-MET-001'), ('STR-MET-002'), ('STR-MET-003'), ('STR-MET-004'), ('STR-MET-005'), ('STR-MET-006'),
    ('STR-RC-BEAM-001'), ('STR-RC-BEAM-002'), ('STR-RC-BEAM-003'), ('STR-RC-FDN-001'), ('STR-RC-FDN-002'), ('STR-RC-FDN-003'),
    ('STR-RC-STAIR-001'), ('STR-RC-STAIR-002'), ('STR-RC-STAIR-003')
;

-- ── BOQ links (while draft) ───────────────────────────────────────────────
insert into public.plan_act_master_work_items (master_id, work_item_id, share_pct, sort_order, source)
select m.id, w.id, 100,
       10 + 10 * (select count(*) from public.plan_act_master_work_items x where x.master_id = m.id),
       'manual'
from (values
  ('05 50 14', 'STR-MET-002'),   -- D05-014 Steel Handrails & Balustrades  <- Mild Steel Handrail (m)
  ('22 10 16', 'MEP-PLB-009'),   -- D22-014 Rainwater / Storm Drainage Pipework <- UPVC Drainage Pipe 150mm (m)
  ('05 10 13', 'STR-MET-006')    -- D05-010 Steel Canopy Structure <- Structural Steel (tonne)
) v(item_code, master_code)
join public.dwl_work_items w on w.code = v.item_code and w.is_active
join public.plan_act_masters m on m.code = v.master_code and m.status = 'draft'
where not exists (select 1 from public.plan_act_master_work_items x where x.master_id = m.id and x.work_item_id = w.id);

-- ── Activate ──────────────────────────────────────────────────────────────
update public.plan_act_masters m set status = 'under_review'
 where m.status = 'draft' and m.code in (select code from _activate);

update public.plan_act_masters m
   set status = 'approved',
       approved_by = (select u.id from auth.users u where u.id = '73c2d06c-6af7-414d-97a9-2658fe74243e'),
       approved_at = now()
 where m.status = 'under_review' and m.code in (select code from _activate);

update public.plan_act_masters m set status = 'active', effective_date = coalesce(m.effective_date, current_date)
 where m.status = 'approved' and m.code in (select code from _activate)
   and not exists (select 1 from public.plan_act_masters o where o.code = m.code and o.id <> m.id and o.status = 'active');
