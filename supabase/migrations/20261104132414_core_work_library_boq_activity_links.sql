-- Construction Work Library: link the 63 active BOQ cost items that had no Master Activity (2026-11-04).
--
-- The Work Library BOQ tab's "No activity" gap. Each pair below was reviewed and approved by the user
-- (scratchpad boq-activity-matches-corrected.xlsx): 80 links, 63 items, 41 activities.
--   A. New DRAFT activity ARC-FIN-WAL-007 Gypsum Drywall Partition (09 21 16): no drywall activity existed.
--   B. The links (plan_act_master_work_items, source 'manual', share 100%).
-- Links go onto the CURRENT version of each activity, active ones included, instead of a new version: every one of
-- the 32 active activities has productivity norms and template lines that point at its id, and a superseded version
-- would drop out of Generate and the BOQ-driven programme. The migration role passes the children freeze guard;
-- the work-item audit trigger records each link.
-- Idempotent and additive: skips pairs that already exist, items or activities missing in this database.

-- ── A. Drywall partition activity ─────────────────────────────────────────
insert into public.csi_sections (code, division_code, parent_code, level, name, sort_order)
values ('09 21 00', '09', null, 2, 'Plaster and Gypsum Board Assemblies', 100)
on conflict (code) do nothing;
insert into public.csi_sections (code, division_code, parent_code, level, name, sort_order)
values ('09 21 16', '09', '09 21 00', 3, 'Gypsum Board Assemblies', 100)
on conflict (code) do nothing;

insert into public.plan_act_masters (code, name, domain_id, category_id, family_id, discipline, work_type, default_unit,
    status, version, owner, source, effective_date, duration_basis, csi_division_code, csi_section_code, trade, activity_type)
select 'ARC-FIN-WAL-007', 'Gypsum Drywall Partition', d.id, c.id, f.id, 'ARC', c.name, 'm²',
       'draft', 1, 'Planning Standards', 'Company Standard (BOQ link review 2026-11)', date '2026-11-04', 'quantity',
       '09', '09 21 16', 'Architecture', 'construction'
from public.plan_act_domains d
join public.plan_act_categories c on c.domain_id = d.id and c.code = 'FIN'
join public.plan_act_families f on f.category_id = c.id and f.code = 'WAL'
where d.code = 'ARC'
on conflict (code, version) do nothing;

insert into public.plan_act_master_method_statements (master_id, method_statement_id, sort_order)
select m.id, s.id, 10
from public.plan_act_masters m join public.plan_act_method_statements s on s.code = 'MS-09-04'
where m.code = 'ARC-FIN-WAL-007' and m.version = 1
on conflict do nothing;

-- ── B. BOQ item → activity links ──────────────────────────────────────────
-- activity = visible code (current draft / active version), or the new master's code
insert into public.plan_act_master_work_items (master_id, work_item_id, share_pct, sort_order, source)
select m.id, w.id, 100,
       10 + 10 * (select count(*) from public.plan_act_master_work_items x where x.master_id = m.id)
         + 10 * (row_number() over (partition by m.id order by w.code) - 1),
       'manual'
from (values
  ('03.02.010', 'D03-025'),   ('ASM-PNT-001', 'D09-014'),   ('ASM-PNT-002', 'D09-005'),   ('ASM-PNT-003', 'D09-014'),
  ('ASM-PNT-004', 'D09-014'),   ('ASM-PNT-005', 'D09-014'),   ('ASM-TIL-002', 'D09-007'),   ('31 20 17', 'D31-019'),
  ('ASM-MAS-001', 'D04-008'),   ('UR-MEP-002', 'D22-006'),   ('03 20 13', 'D03-020'),   ('03 20 13', 'D03-023'),
  ('03 20 13', 'D03-034'),   ('03 20 13', 'D03-035'),   ('03 20 13', 'D03-044'),   ('03 20 14', 'D03-020'),
  ('03 20 14', 'D03-023'),   ('03 20 14', 'D03-034'),   ('03 20 14', 'D03-035'),   ('03 20 14', 'D03-044'),
  ('03 30 17', 'D03-037'),   ('04 20 13', 'D04-008'),   ('04 20 14', 'D04-008'),   ('04 20 15', 'D04-007'),
  ('04 20 16', 'D04-001'),   ('05 10 13', 'D05-006'),   ('05 10 13', 'D05-007'),   ('05 10 14', 'D05-013'),
  ('07 10 13', 'D07-006'),   ('07 10 13', 'D07-017'),   ('07 10 14', 'D07-002'),   ('07 10 15', 'D07-006'),
  ('07 20 13', 'D07-013'),   ('08 10 13', 'D08-012'),   ('08 10 16', 'D08-008'),   ('08 50 14', 'D08-003'),
  ('08 50 14', 'D08-004'),   ('09 20 13', 'D09-012'),   ('09 20 14', 'ARC-FIN-WAL-007'),   ('09 20 15', 'D09-001'),
  ('09 20 15', 'D09-003'),   ('09 30 13', 'D09-007'),   ('09 30 14', 'D09-007'),   ('09 30 15', 'D09-013'),
  ('09 90 13', 'D09-014'),   ('09 90 14', 'D09-014'),   ('09 90 16', 'D09-014'),   ('22 10 13', 'D22-006'),
  ('22 10 14', 'D22-006'),   ('22 40 15', 'D22-009'),   ('22 40 16', 'D22-009'),   ('26 20 15', 'D26-008'),
  ('26 20 16', 'D26-008'),   ('26 20 17', 'D26-010'),   ('26 50 15', 'D26-018'),   ('26 50 16', 'D26-004'),
  ('31 20 14', 'D31-006'),   ('31 20 14', 'D31-013'),   ('ASM-TIL-005', 'D09-010'),   ('ASM-PLS-001', 'D09-012'),
  ('ASM-PLS-002', 'D09-012'),   ('ASM-SCR-001', 'D03-001'),   ('ASM-MAS-003', 'D04-008'),   ('ASM-MAS-004', 'D04-007'),
  ('ASM-WPF-001', 'D07-002'),   ('ASM-DRY-001', 'ARC-FIN-WAL-007'),   ('UR-CON-001-TUR', 'D03-037'),   ('UR-MEP-001', 'D26-010'),
  ('LIB-CON-001', 'D03-037'),   ('UR-TIL-001-TUR', 'D09-007'),   ('LIB-TIL-001', 'D09-007'),   ('UR-FWK-001-TUR', 'D03-032'),
  ('UR-BLK-001-TUR', 'D04-001'),   ('UR-MEP-003', 'D26-008'),   ('UR-PLA-001-TUR', 'D09-012'),   ('UR-REB-001-TUR', 'D03-020'),
  ('UR-REB-001-TUR', 'D03-023'),   ('UR-REB-001-TUR', 'D03-034'),   ('UR-REB-001-TUR', 'D03-035'),   ('UR-REB-001-TUR', 'D03-044')
) as v(item_code, activity)
join public.dwl_work_items w on w.code = v.item_code and w.is_active
join public.plan_act_masters m on (m.visible_code = v.activity or m.code = v.activity) and m.status in ('draft', 'active')
where not exists (select 1 from public.plan_act_master_work_items x where x.master_id = m.id and x.work_item_id = w.id);
