-- Migration: 20261023093200_planning_activity_database_fixes.sql
-- Purpose: Review fixes for the Activity Database: audit trail for catalogue edits and work item links,
--          visible_code consistency (regenerate on division change, validate pattern, never reuse numbers),
--          and size/type limits on the activity-images bucket.
-- Depends on: 20261023091500_planning_activity_database.sql
-- Notes: library tables stay global (no tenant_id), matching the existing plan_act_* pattern.
--        Numbers are never reused: a per-division counter only ever moves forward.

-- 1. Per-division counter ------------------------------------------------------
create table if not exists public.plan_act_division_counters (
  division_code text primary key,
  last_n        int  not null default 0
);
alter table public.plan_act_division_counters enable row level security;
drop policy if exists "plan_act_division_counters authenticated view" on public.plan_act_division_counters;
create policy "plan_act_division_counters authenticated view" on public.plan_act_division_counters
  for select to authenticated using (true);

insert into public.plan_act_division_counters (division_code, last_n)
select d.code,
       coalesce(max(substring(m.visible_code from ('^D' || d.code || '-(\d+)$'))::int), 0)
  from public.plan_act_divisions d
  left join public.plan_act_masters m on m.visible_code ~ ('^D' || d.code || '-\d+$')
 group by d.code
on conflict (division_code) do update set last_n = greatest(public.plan_act_division_counters.last_n, excluded.last_n);

-- 2. visible_code assignment / validation (replaces the earlier function) ----------
create or replace function public.plan_act_master_assign_visible_code()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_div text;
  v_next int;
begin
  if new.division_id is not null then
    select code into v_div from public.plan_act_divisions where id = new.division_id;
  end if;

  -- division changed on a root master and the code no longer fits: regenerate
  if tg_op = 'UPDATE' and new.division_id is distinct from old.division_id
     and new.visible_code is not distinct from old.visible_code
     and new.supersedes_id is null
     and (v_div is null or new.visible_code is null or new.visible_code !~ ('^D' || v_div || '-\d+$')) then
    new.visible_code := null;
  end if;

  if new.visible_code is null then
    -- a new version keeps the code of its predecessor
    if new.supersedes_id is not null then
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

  -- explicit code must match its division
  if v_div is not null and new.visible_code !~ ('^D' || v_div || '-\d{3,}$') then
    raise exception 'visible_code % does not match division % (expected D%-###)', new.visible_code, v_div, v_div;
  end if;
  return new;
end $$;

-- keep the counter ahead of manually set codes and propagate to the other versions
create or replace function public.plan_act_master_visible_code_after()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_div text;
  v_n int;
begin
  if new.visible_code is null then return null; end if;
  v_div := substring(new.visible_code from '^D(\d{2})-\d+$');
  v_n := substring(new.visible_code from '^D\d{2}-(\d+)$')::int;
  if v_div is not null then
    insert into public.plan_act_division_counters (division_code, last_n) values (v_div, v_n)
      on conflict (division_code) do update set last_n = greatest(public.plan_act_division_counters.last_n, excluded.last_n);
  end if;
  update public.plan_act_masters
     set visible_code = new.visible_code, division_id = new.division_id
   where code = new.code and id <> new.id
     and (visible_code is distinct from new.visible_code or division_id is distinct from new.division_id);
  return null;
end $$;

drop trigger if exists trg_plan_act_master_visible_code_after on public.plan_act_masters;
create trigger trg_plan_act_master_visible_code_after
  after insert or update of division_id, visible_code on public.plan_act_masters
  for each row execute function public.plan_act_master_visible_code_after();

-- 3. Audit trail --------------------------------------------------------------
create or replace function public.plan_act_master_catalogue_audit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_diff text := '';
begin
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
  if v_diff <> '' then
    insert into public.plan_act_change_history(entity_type, entity_id, action, reason)
    values ('master', new.id, 'catalogue', rtrim(v_diff, '; '));
  end if;
  return null;
end $$;

drop trigger if exists trg_plan_act_master_catalogue_audit on public.plan_act_masters;
create trigger trg_plan_act_master_catalogue_audit
  after update of division_id, visible_code, trade, image_path on public.plan_act_masters
  for each row execute function public.plan_act_master_catalogue_audit();

create or replace function public.plan_act_master_work_items_audit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.plan_act_change_history(entity_type, entity_id, action, reason)
    values ('master', new.master_id, 'work_item_add', 'work_item_id: ' || new.work_item_id);
  elsif tg_op = 'UPDATE' then
    insert into public.plan_act_change_history(entity_type, entity_id, action, reason)
    values ('master', new.master_id, 'work_item_update',
            'work_item_id: ' || new.work_item_id || '; days/unit ' || coalesce(old.duration_days_per_unit::text, '-')
            || ' -> ' || coalesce(new.duration_days_per_unit::text, '-')
            || '; share_pct ' || old.share_pct || ' -> ' || new.share_pct);
  else
    insert into public.plan_act_change_history(entity_type, entity_id, action, reason)
    values ('master', old.master_id, 'work_item_remove', 'work_item_id: ' || old.work_item_id);
  end if;
  return null;
end $$;

drop trigger if exists trg_plan_act_master_work_items_audit on public.plan_act_master_work_items;
create trigger trg_plan_act_master_work_items_audit
  after insert or update or delete on public.plan_act_master_work_items
  for each row execute function public.plan_act_master_work_items_audit();

-- 4. Bucket limits ----------------------------------------------------------------
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif']
 where id = 'activity-images';
