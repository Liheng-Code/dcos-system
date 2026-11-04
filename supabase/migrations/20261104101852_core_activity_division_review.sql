-- Construction Work Library: fixes approved from the activity division review (2026-11-04).
--   D05-002 Bearing Installation (CIV-BRG-008) had no CSI section -> 05 05 00 Common Work Results for Metals.
--   D43-001 Pump & Motor Installation (CIV-FAC-001) sat in Division 43, which is inactive -> 33 12 00 Water Utility
--   Distribution Equipment (Division 33 Utilities). The division change renews its visible code (D33-NNN).
-- Applies to the current (not superseded / archived) versions only; the master guard allows these fields on active masters.
update public.plan_act_masters set csi_section_code = '05 05 00'
 where code = 'CIV-BRG-008' and csi_section_code is null and status not in ('superseded', 'archived');

update public.plan_act_masters set csi_division_code = '33', csi_section_code = '33 12 00'
 where code = 'CIV-FAC-001' and csi_division_code = '43' and status not in ('superseded', 'archived');
