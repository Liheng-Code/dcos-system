-- Migration: 20261023172400_boq_programme_phase1.sql
-- Purpose: BOQ-Driven Programme Plan, Phase 1 (DB parts, doc 24):
--          contract BOQ keeps the BOQ-item mapping + location fields, tender mapping review fields,
--          crew data on Activity Masters, provenance on master/work-item links.
-- Depends on: qs_boq_items, tender_boq_items, dwl_work_items, plan_act_masters,
--             plan_act_master_work_items, plan_act_master_catalogue_audit()
-- Additive only.
-- Notes:
--   qs_boq_items.dwl_work_item_id, its index idx_qs_boq_items_dwl_work_item and
--   source_tender_boq_item_id (FK -> tender_boq_items ON DELETE SET NULL) already exist.
--   The existing dwl_work_item_id FK is NO ACTION (blocks deleting a used work item); left unchanged.
--   plan_act_master_guard freezes only identity columns, so crew_size / hours_per_day stay editable
--   on active masters.

-- 1. qs_boq_items ------------------------------------------------------------
alter table public.qs_boq_items add column if not exists dwl_work_item_id uuid references public.dwl_work_items(id);
alter table public.qs_boq_items add column if not exists building_code text;
alter table public.qs_boq_items add column if not exists level text;
alter table public.qs_boq_items add column if not exists discipline text;
alter table public.qs_boq_items add column if not exists section text;
alter table public.qs_boq_items add column if not exists sub_section text;
alter table public.qs_boq_items add column if not exists sub_element text;
create index if not exists idx_qs_boq_items_dwl_work_item on public.qs_boq_items(dwl_work_item_id);

-- One-off backfill from the source tender line; only fills null fields (idempotent).
update public.qs_boq_items q
   set dwl_work_item_id = coalesce(q.dwl_work_item_id, t.dwl_work_item_id),
       building_code    = coalesce(q.building_code, t.building_code),
       level            = coalesce(q.level, t.level),
       discipline       = coalesce(q.discipline, t.discipline),
       section          = coalesce(q.section, t.section),
       sub_section      = coalesce(q.sub_section, t.sub_section),
       sub_element      = coalesce(q.sub_element, t.sub_element)
  from public.tender_boq_items t
 where q.source_tender_boq_item_id = t.id
   and (q.dwl_work_item_id is null or q.building_code is null or q.level is null or q.discipline is null
        or q.section is null or q.sub_section is null or q.sub_element is null);

-- 2. tender_boq_items: mapping review fields ------------------------------------
create index if not exists idx_tender_boq_items_dwl_work_item on public.tender_boq_items(dwl_work_item_id);
alter table public.tender_boq_items add column if not exists dwl_match_status text;
alter table public.tender_boq_items add column if not exists dwl_match_score numeric;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tender_boq_items_dwl_match_status_chk') then
    alter table public.tender_boq_items add constraint tender_boq_items_dwl_match_status_chk
      check (dwl_match_status is null or dwl_match_status in ('auto', 'confirmed', 'rejected'));
  end if;
end $$;

-- 3. plan_act_masters: crew data --------------------------------------------------
alter table public.plan_act_masters add column if not exists crew_size integer;
alter table public.plan_act_masters add column if not exists hours_per_day numeric default 8;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plan_act_masters_crew_size_chk') then
    alter table public.plan_act_masters add constraint plan_act_masters_crew_size_chk
      check (crew_size is null or crew_size > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plan_act_masters_hours_per_day_chk') then
    alter table public.plan_act_masters add constraint plan_act_masters_hours_per_day_chk
      check (hours_per_day is null or (hours_per_day > 0 and hours_per_day <= 24));
  end if;
end $$;

-- Catalogue audit: include the new fields.
create or replace function public.plan_act_master_catalogue_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_diff text := '';
begin
  if new.csi_division_code is distinct from old.csi_division_code then
    v_diff := v_diff || 'csi_division_code: ' || coalesce(old.csi_division_code, '-') || ' -> ' || coalesce(new.csi_division_code, '-') || '; ';
  end if;
  if new.csi_section_code is distinct from old.csi_section_code then
    v_diff := v_diff || 'csi_section_code: ' || coalesce(old.csi_section_code, '-') || ' -> ' || coalesce(new.csi_section_code, '-') || '; ';
  end if;
  if new.division_id is distinct from old.division_id then
    v_diff := v_diff || 'division_id: ' || coalesce(old.division_id::text, '-') || ' -> ' || coalesce(new.division_id::text, '-') || '; ';
  end if;
  if new.visible_code is distinct from old.visible_code then
    v_diff := v_diff || 'visible_code: ' || coalesce(old.visible_code, '-') || ' -> ' || coalesce(new.visible_code, '-') || '; ';
  end if;
  if new.trade is distinct from old.trade then
    v_diff := v_diff || 'trade: ' || coalesce(old.trade, '-') || ' -> ' || coalesce(new.trade, '-') || '; ';
  end if;
  if new.image_path is distinct from old.image_path then
    v_diff := v_diff || 'image_path: ' || coalesce(old.image_path, '-') || ' -> ' || coalesce(new.image_path, '-') || '; ';
  end if;
  if new.crew_size is distinct from old.crew_size then
    v_diff := v_diff || 'crew_size: ' || coalesce(old.crew_size::text, '-') || ' -> ' || coalesce(new.crew_size::text, '-') || '; ';
  end if;
  if new.hours_per_day is distinct from old.hours_per_day then
    v_diff := v_diff || 'hours_per_day: ' || coalesce(old.hours_per_day::text, '-') || ' -> ' || coalesce(new.hours_per_day::text, '-') || '; ';
  end if;
  if v_diff <> '' then
    insert into public.plan_act_change_history(entity_type, entity_id, action, reason)
    values ('master', new.id, 'catalogue', rtrim(v_diff, '; '));
  end if;
  return null;
end $$;

drop trigger if exists trg_plan_act_master_catalogue_audit on public.plan_act_masters;
create trigger trg_plan_act_master_catalogue_audit
  after update of csi_division_code, csi_section_code, division_id, visible_code, trade, image_path,
                  crew_size, hours_per_day
  on public.plan_act_masters
  for each row execute function public.plan_act_master_catalogue_audit();

-- 4. plan_act_master_work_items: link provenance --------------------------------------
alter table public.plan_act_master_work_items add column if not exists source text default 'manual';
alter table public.plan_act_master_work_items add column if not exists match_score numeric;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plan_act_master_work_items_source_chk') then
    alter table public.plan_act_master_work_items add constraint plan_act_master_work_items_source_chk
      check (source is null or source in ('manual', 'suggested', 'import'));
  end if;
end $$;
