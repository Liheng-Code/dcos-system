-- Migration: 20261023123820_core_csi_divisions_fixes.sql
-- Purpose: Review fixes for 20261023122000_core_csi_divisions.sql:
--   1. work item division is cleared only when a section that set it is cleared
--   2. the Activity Database remap to CSI 2016 now ships in a migration (idempotent; no-op where
--      plan_act_masters.csi_division_code is already set, e.g. the local DB)
--   3. a division change on a versioned master regenerates the code for the whole version chain
--   4. dwl_material_categories_default_division() reads csi_divisions
-- Depends on: 20261023122000_core_csi_divisions.sql
-- Cleanup note: dwl_material_categories.division_code still has the old FK to the frozen
-- dwl_material_divisions (25 codes). It cannot be relaxed additively; drop it in the cleanup migration.

-- 1. work item csi sync -------------------------------------------------------------
create or replace function public.dwl_work_item_csi_sync()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.csi_section_code is not null then
    new.csi_division_code := left(new.csi_section_code, 2);
  elsif tg_op = 'UPDATE' and old.csi_section_code is not null
        and new.csi_division_code is not distinct from old.csi_division_code then
    new.csi_division_code := null;  -- section cleared: the division it implied goes too
  end if;
  return new;
end $$;

-- 4. material category default division ------------------------------------------------
create or replace function public.dwl_material_categories_default_division()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.division_code is null and new.cost_code_prefix ~ '^[0-9]{2}' then
    select d.code into new.division_code
      from public.csi_divisions d
     where d.code = left(new.cost_code_prefix, 2);
  end if;
  return new;
end $$;

-- 3. visible code: division change regenerates, also on versioned masters ------------------
create or replace function public.plan_act_master_assign_visible_code()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_div text;
  v_next int;
  v_changed boolean := false;
begin
  v_div := new.csi_division_code;

  -- division changed and the code no longer fits: regenerate (the after-trigger syncs the other versions)
  if tg_op = 'UPDATE' and new.csi_division_code is distinct from old.csi_division_code
     and new.visible_code is not distinct from old.visible_code
     and (v_div is null or new.visible_code is null or new.visible_code !~ ('^D' || v_div || '-\d+$')) then
    new.visible_code := null;
    v_changed := true;
  end if;

  if new.visible_code is null then
    -- a new version keeps the code of its predecessor (unless the division just changed)
    if new.supersedes_id is not null and not v_changed then
      select visible_code into new.visible_code from public.plan_act_masters where id = new.supersedes_id;
      if new.visible_code is not null then
        return new;
      end if;
    end if;
    if v_div is null then
      return new;
    end if;
    insert into public.plan_act_division_counters (division_code, last_n) values (v_div, 0)
      on conflict (division_code) do nothing;
    select greatest(c.last_n,
             coalesce((select max(substring(visible_code from ('^D' || v_div || '-(\d+)$'))::int)
                         from public.plan_act_masters
                        where visible_code ~ ('^D' || v_div || '-\d+$')), 0)) + 1
      into v_next
      from public.plan_act_division_counters c where c.division_code = v_div
      for update;
    update public.plan_act_division_counters set last_n = v_next where division_code = v_div;
    new.visible_code := 'D' || v_div || '-' || lpad(v_next::text, 3, '0');
    return new;
  end if;

  if v_div is not null and new.visible_code !~ ('^D' || v_div || '-\d{3,}$') then
    raise exception 'visible_code % does not match division % (expected D%-###)', new.visible_code, v_div, v_div;
  end if;
  return new;
end $$;

-- 2. Activity remap (idempotent; touches only masters without a csi_division_code) -----------------
do $remap$
begin
  alter table public.plan_act_masters disable trigger trg_plan_act_master_catalogue_audit;
  alter table public.plan_act_masters disable trigger trg_plan_act_master_visible_code;
  alter table public.plan_act_masters disable trigger trg_plan_act_master_visible_code_after;

  create temp table _csi_remap (master_code text primary key, new_div text not null, section_code text) on commit drop;
  insert into _csi_remap (master_code, new_div, section_code) values
    ('STR-RC-SLAB-001','01','01 71 23'),
    ('STR-SUB-BSM-003','31','31 50 00'),
    ('CIV-BRG-001','31','31 63 00'),
    ('CIV-BRG-002','31','31 60 00'),
    ('CIV-BRG-004','03','03 21 00'),
    ('CIV-BRG-005','03','03 11 00'),
    ('CIV-BRG-006','03','03 30 00'),
    ('CIV-BRG-007','03','03 30 00'),
    ('CIV-BRG-008','05',null),
    ('CIV-BRG-009','03','03 41 00'),
    ('CIV-BRG-010','03','03 21 00'),
    ('CIV-BRG-011','03','03 11 00'),
    ('CIV-BRG-012','03','03 30 00'),
    ('CIV-BRG-013','07','07 95 00'),
    ('CIV-BRG-014','03','03 30 00'),
    ('CIV-BRG-015','07','07 10 00'),
    ('CIV-BRG-016','01','01 45 00'),
    ('CIV-DRN-001','33','33 41 00'),
    ('CIV-DRN-002','33','33 41 00'),
    ('CIV-DRN-003','33','33 49 00'),
    ('CIV-DRN-004','33','33 46 00'),
    ('CIV-DRN-005','31','31 37 00'),
    ('CIV-EW-001','31','31 10 00'),
    ('CIV-EW-002','31','31 14 13'),
    ('CIV-EW-003','31','31 23 16'),
    ('CIV-EW-004','31','31 23 23'),
    ('CIV-EW-005','31','31 31 00'),
    ('CIV-EW-006','31','31 32 00'),
    ('CIV-EW-007','31','31 22 00'),
    ('CIV-FAC-001','43','43 21 00'),
    ('CIV-PAV-001','32','32 11 16'),
    ('CIV-PAV-002','32','32 11 23'),
    ('CIV-PAV-003','32','32 12 13'),
    ('CIV-PAV-004','32','32 12 16'),
    ('CIV-PAV-005','32','32 12 16'),
    ('CIV-PAV-006','32','32 16 00'),
    ('CIV-PAV-007','32','32 12 00'),
    ('CIV-PIP-001','31','31 23 16'),
    ('CIV-PIP-002','33','33 05 00'),
    ('CIV-PIP-003','33','33 10 00'),
    ('CIV-PIP-004','33','33 05 16'),
    ('CIV-PIP-005','33','33 12 00'),
    ('CIV-PIP-006','33','33 10 00'),
    ('CIV-PIP-008','32','32 01 00'),
    ('CIV-PIP-009','33','33 05 23'),
    ('CIV-PIP-010','33','33 13 00'),
    ('CIV-RFN-001','34','34 71 13'),
    ('CIV-RFN-002','34','34 41 00'),
    ('CIV-RFN-003','32','32 17 23'),
    ('CIV-RFN-004','34','34 41 13'),
    ('CIV-RFN-005','26','26 56 00'),
    ('CIV-STR-001','03','03 21 00'),
    ('CIV-STR-002','03','03 11 00'),
    ('CIV-STR-003','03','03 30 00'),
    ('CIV-STR-004','03','03 30 00'),
    ('CIV-UTL-001','33','33 71 19'),
    ('CIV-UTL-002','26','26 05 19'),
    ('CIV-UTL-003','26','26 05 13'),
    ('CIV-UTL-004','27','27 13 23'),
    ('EXT-DRN-001','33','33 41 00'),
    ('EXT-FEN-002','32','32 31 00'),
    ('EXT-GH-001','13','13 34 00'),
    ('EXT-LND-001','32','32 90 00'),
    ('EXT-PAV-001','32','32 14 00'),
    ('EXT-PAV-002','32','32 12 16'),
    ('EXT-PAV-003','32','32 13 13'),
    ('EXT-SEP-001','33','33 36 00'),
    ('EXT-SGN-001','10','10 14 00'),
    ('EXT-UTL-001','33','33 10 00'),
    ('STR-SUB-BSM-001','31','31 23 16'),
    ('STR-SUB-BSM-002','31','31 23 19'),
    ('STR-SUB-EXC-001','31','31 23 16'),
    ('STR-SUB-EXC-002','31','31 23 23'),
    ('STR-SUB-EXC-003','31','31 31 16'),
    ('STR-SUB-SOG-001','31','31 23 23'),
    ('IND-FLR-001','31','31 23 23'),
    ('IND-FLR-002','03','03 22 00'),
    ('IND-FLR-003','03','03 30 00'),
    ('IND-FLR-004','03','03 35 00'),
    ('IND-FLR-005','09','09 67 00'),
    ('IND-FLR-006','09','09 91 00'),
    ('IND-FND-001','03','03 30 00'),
    ('IND-FND-002','03','03 30 00'),
    ('STR-RC-BEAM-001','03','03 21 00'),
    ('STR-RC-BEAM-002','03','03 11 00'),
    ('STR-RC-BEAM-003','03','03 30 00'),
    ('STR-RC-COL-001','03','03 21 00'),
    ('STR-RC-COL-002','03','03 11 00'),
    ('STR-RC-COL-003','03','03 30 00'),
    ('STR-RC-CORE-001','03','03 21 00'),
    ('STR-RC-CORE-002','03','03 11 00'),
    ('STR-RC-CORE-003','03','03 30 00'),
    ('STR-RC-FDN-001','03','03 21 00'),
    ('STR-RC-FDN-002','03','03 11 00'),
    ('STR-RC-FDN-003','03','03 30 00'),
    ('STR-RC-SLAB-002','03','03 11 00'),
    ('STR-RC-SLAB-003','03','03 15 00'),
    ('STR-RC-SLAB-004','03','03 21 00'),
    ('STR-RC-SLAB-005','03','03 21 00'),
    ('STR-RC-SLAB-006','03','03 01 00'),
    ('STR-RC-SLAB-007','03','03 30 00'),
    ('STR-RC-SLAB-008','03','03 35 00'),
    ('STR-RC-SLAB-009','03','03 39 00'),
    ('STR-RC-SLAB-010','03','03 11 00'),
    ('STR-RC-STAIR-001','03','03 21 00'),
    ('STR-RC-STAIR-002','03','03 11 00'),
    ('STR-RC-STAIR-003','03','03 30 00'),
    ('STR-RC-WALL-001','03','03 21 00'),
    ('STR-RC-WALL-002','03','03 11 00'),
    ('STR-RC-WALL-003','03','03 30 00'),
    ('STR-SUB-BSM-005','03','03 21 00'),
    ('STR-SUB-BSM-006','03','03 30 00'),
    ('STR-SUB-BSM-007','03','03 21 00'),
    ('STR-SUB-BSM-008','03','03 11 00'),
    ('STR-SUB-BSM-009','03','03 30 00'),
    ('STR-SUB-FTG-001','03','03 30 00'),
    ('STR-SUB-FTG-002','03','03 21 00'),
    ('STR-SUB-FTG-003','03','03 11 00'),
    ('STR-SUB-FTG-004','03','03 30 00'),
    ('STR-SUB-GB-001','03','03 21 00'),
    ('STR-SUB-GB-002','03','03 11 00'),
    ('STR-SUB-GB-003','03','03 30 00'),
    ('STR-SUB-SOG-002','03','03 22 00'),
    ('STR-SUB-SOG-003','03','03 30 00'),
    ('ARC-MAS-BLK-001','04','04 22 00'),
    ('EXT-FEN-001','04','04 22 00'),
    ('IND-STL-CRN-001','05','05 12 00'),
    ('IND-STL-CRN-002','14','14 60 00'),
    ('IND-STL-MEZ-001','05','05 31 00'),
    ('IND-STL-PEB-001','05','05 05 00'),
    ('IND-STL-PEB-002','05','05 12 00'),
    ('IND-STL-PEB-003','05','05 12 00'),
    ('IND-STL-PEB-004','05','05 41 00'),
    ('IND-STL-PEB-005','05','05 05 00'),
    ('ARC-JNR-001','06','06 41 00'),
    ('ARC-JNR-002','06','06 41 00'),
    ('ARC-JNR-003','05','05 52 00'),
    ('ARC-JNR-004','06','06 41 00'),
    ('ARC-FIN-FLR-003','07','07 10 00'),
    ('ARC-RF-001','06','06 17 00'),
    ('ARC-RF-002','07','07 31 00'),
    ('ARC-RF-003','07','07 32 00'),
    ('ARC-RF-004','07','07 71 00'),
    ('ARC-RF-005','07','07 50 00'),
    ('ARC-RF-006','07','07 22 00'),
    ('ARC-RF-007','07','07 71 00'),
    ('IND-ENV-CLD-001','07','07 42 00'),
    ('IND-ENV-CLD-002','07','07 62 00'),
    ('IND-ENV-DOR-001','08','08 33 00'),
    ('IND-ENV-DOR-002','11','11 13 00'),
    ('IND-ENV-RF-001','07','07 21 00'),
    ('IND-ENV-RF-002','07','07 41 13'),
    ('IND-ENV-RF-003','07','07 72 00'),
    ('IND-ENV-RF-004','07','07 72 00'),
    ('STR-SUB-BSM-004','07','07 10 00'),
    ('ARC-DW-001','08','08 10 00'),
    ('ARC-DW-002','08','08 71 00'),
    ('ARC-DW-003','08','08 50 00'),
    ('ARC-DW-004','08','08 80 00'),
    ('ARC-DW-005','07','07 92 00'),
    ('ARC-FAC-001','08','08 44 00'),
    ('ARC-FIN-CLG-001','09','09 22 26'),
    ('ARC-FIN-CLG-002','09','09 51 00'),
    ('ARC-FIN-CLG-003','09','09 29 00'),
    ('ARC-FIN-CLG-004','09','09 51 00'),
    ('ARC-FIN-CLG-005','09','09 91 00'),
    ('ARC-FIN-FLR-001','09','09 05 00'),
    ('ARC-FIN-FLR-002','03','03 53 00'),
    ('ARC-FIN-FLR-004','09','09 30 00'),
    ('ARC-FIN-FLR-005','09','09 65 00'),
    ('ARC-FIN-FLR-006','09','09 64 00'),
    ('ARC-FIN-FLR-007','09','09 65 13'),
    ('ARC-FIN-FLR-008','01','01 74 00'),
    ('ARC-FIN-WAL-001','09','09 05 00'),
    ('ARC-FIN-WAL-002','09','09 24 00'),
    ('ARC-FIN-WAL-003','09','09 30 00'),
    ('ARC-FIN-WAL-004','09','09 91 00'),
    ('ARC-FIN-WAL-005','09','09 72 00'),
    ('ARC-FIN-WAL-006','09','09 91 00'),
    ('EXT-POOL-001','13','13 11 00'),
    ('EXT-POOL-002','13','13 11 00'),
    ('EXT-SPT-001','32','32 18 00'),
    ('IND-MEP-001','26','26 51 00'),
    ('IND-MEP-002','21','21 13 00'),
    ('IND-MEP-003','22','22 15 00'),
    ('IND-MEP-004','23','23 34 00'),
    ('IND-MEP-005','26','26 05 00'),
    ('IND-MEP-006','26','26 31 00'),
    ('IND-OPS-001','10','10 56 00'),
    ('INS-CIV-001','13','13 34 00'),
    ('INS-CIV-002','09','09 51 00'),
    ('INS-CIV-003','04','04 43 00'),
    ('INS-EDU-001','10','10 11 00'),
    ('INS-EDU-002','12','12 60 00'),
    ('INS-LAB-001','12','12 35 53'),
    ('INS-LAB-002','22','22 63 00'),
    ('INS-MED-001','22','22 63 00'),
    ('INS-MED-002','22','22 63 00'),
    ('INS-MED-003','22','22 63 00'),
    ('INS-MED-004','13','13 21 00'),
    ('INS-MED-005','13','13 49 00'),
    ('INS-MED-006','27','27 52 23'),
    ('INS-MED-007','10','10 26 00'),
    ('MEP-FP-001','21','21 13 13'),
    ('MEP-FP-002','21','21 13 13'),
    ('MEP-FP-003','21','21 12 00'),
    ('MEP-FP-004','28','28 31 00'),
    ('MEP-FP-005','21','21 22 00'),
    ('MEP-FP-006','21','21 08 00'),
    ('MEP-HVAC-001','23','23 31 00'),
    ('MEP-HVAC-002','23','23 73 00'),
    ('MEP-HVAC-003','23','23 21 13'),
    ('MEP-HVAC-004','23','23 37 00'),
    ('MEP-HVAC-005','23','23 07 00'),
    ('MEP-HVAC-006','25','25 00 00'),
    ('MEP-HVAC-007','23','23 05 93'),
    ('MEP-PLB-001','22','22 11 16'),
    ('MEP-PLB-002','22','22 11 16'),
    ('MEP-PLB-003','22','22 13 16'),
    ('MEP-PLB-004','22','22 40 00'),
    ('MEP-PLB-005','22','22 33 00'),
    ('MEP-PLB-006','22','22 08 00'),
    ('EXT-LGT-001','26','26 56 00'),
    ('INS-ELV-001','27','27 51 00'),
    ('MEP-ELE-001','26','26 05 36'),
    ('MEP-ELE-002','26','26 05 19'),
    ('MEP-ELE-003','26','26 05 19'),
    ('MEP-ELE-004','26','26 24 16'),
    ('MEP-ELE-005','26','26 51 00'),
    ('MEP-ELE-006','26','26 27 26'),
    ('MEP-ELE-007','26','26 05 26'),
    ('MEP-ELE-008','26','26 08 00'),
    ('MEP-ELE-009','26','26 41 00')
;

  -- a) CSV mapping by master code (codes that do not exist simply match nothing)
  update public.plan_act_masters m
     set csi_division_code = r.new_div
    from _csi_remap r
   where m.code = r.master_code and m.csi_division_code is null;

  -- b) fallback for masters not in the list: old 16-division code -> CSI
  update public.plan_act_masters m
     set csi_division_code = case d.code
           when '01' then '01' when '02' then '31' when '15' then '22' when '16' then '26'
           when '03' then '03' when '04' then '04' when '05' then '05' when '06' then '06'
           when '07' then '07' when '08' then '08' when '09' then '09' when '10' then '10'
           when '11' then '11' when '12' then '12' when '13' then '13' when '14' then '14' end
    from public.plan_act_divisions d
   where m.csi_division_code is null and m.division_id = d.id;

  -- c) section from the mapping, only where it exists, fits the division and none is set yet
  update public.plan_act_masters m
     set csi_section_code = r.section_code
    from _csi_remap r
   where m.code = r.master_code and m.csi_section_code is null
     and r.section_code is not null and left(r.section_code, 2) = m.csi_division_code
     and exists (select 1 from public.csi_sections s where s.code = r.section_code);

  -- d) visible codes only where missing or not matching 'D'||division. Numbering continues above every
  --    existing number in that division (and the counter), in code order; versions of a code share a number.
  create temp table _csi_need on commit drop as
    select distinct m.code, m.csi_division_code as div
      from public.plan_act_masters m
     where m.csi_division_code is not null
       and (m.visible_code is null or m.visible_code !~ ('^D' || m.csi_division_code || '-\d{3,}$'));

  update public.plan_act_masters m set visible_code = null
    from _csi_need n where m.code = n.code;

  with base as (
    select n.div,
           greatest(coalesce((select c.last_n from public.plan_act_division_counters c where c.division_code = n.div), 0),
                    coalesce((select max(substring(x.visible_code from '-(\d+)$')::int)
                                from public.plan_act_masters x
                               where x.visible_code ~ ('^D' || n.div || '-\d+$')), 0)) as b
      from (select distinct div from _csi_need) n
  ), ranked as (
    select n.code, n.div, b.b + dense_rank() over (partition by n.div order by n.code) as num
      from _csi_need n join base b on b.div = n.div
  )
  update public.plan_act_masters m
     set visible_code = 'D' || r.div || '-' || lpad(r.num::text, 3, '0')
    from ranked r where m.code = r.code;

  -- e) counters never fall below the highest number in use
  insert into public.plan_act_division_counters (division_code, last_n)
  select csi_division_code, max(substring(visible_code from '-(\d+)$')::int)
    from public.plan_act_masters
   where csi_division_code is not null and visible_code ~ ('^D' || csi_division_code || '-\d+$')
   group by csi_division_code
  on conflict (division_code) do update
    set last_n = greatest(public.plan_act_division_counters.last_n, excluded.last_n);

  alter table public.plan_act_masters enable trigger trg_plan_act_master_visible_code_after;
  alter table public.plan_act_masters enable trigger trg_plan_act_master_visible_code;
  alter table public.plan_act_masters enable trigger trg_plan_act_master_catalogue_audit;
end
$remap$;
