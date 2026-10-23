-- Migration: 20261023091500_planning_activity_database.sql
-- Purpose: Activity Database (doc 23, section 1): CSI divisions, catalogue columns on plan_act_masters
--          (division, visible code, trade, type, duration %, image), master <-> work item links,
--          activity-images bucket, and bank search / division count RPCs.
-- Depends on: plan_act_masters, plan_act_master_guard(), plan_act_master_children_guard(),
--             dwl_work_items, can_manage_master_libraries(), set_updated_at() (all exist)
-- Additive only. Decisions:
--   * visible_code is shared by every version of a master (versions share `code` too). Uniqueness is
--     enforced on root masters only (supersedes_id is null); a new version inherits its predecessor's code.
--   * division_id, visible_code, trade, image_path are catalogue fields: editable on approved/active masters.
--     activity_type and min/max_duration_pct stay versioned (frozen once the master leaves draft).

-- 1. Divisions -------------------------------------------------------------
create table if not exists public.plan_act_divisions (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_act_divisions_code_chk check (code ~ '^[0-9]{2}$')
);

drop trigger if exists set_plan_act_divisions_updated_at on public.plan_act_divisions;
create trigger set_plan_act_divisions_updated_at
  before update on public.plan_act_divisions
  for each row execute function public.set_updated_at();

alter table public.plan_act_divisions enable row level security;
drop policy if exists "plan_act_divisions authenticated view" on public.plan_act_divisions;
create policy "plan_act_divisions authenticated view" on public.plan_act_divisions
  for select to authenticated using (true);
drop policy if exists "plan_act_divisions privileged manage" on public.plan_act_divisions;
create policy "plan_act_divisions privileged manage" on public.plan_act_divisions
  for all to authenticated
  using (public.can_manage_master_libraries())
  with check (public.can_manage_master_libraries());

insert into public.plan_act_divisions (code, name, sort_order) values
  ('01','General Requirements',1), ('02','Site Works',2), ('03','Concrete',3), ('04','Masonry',4),
  ('05','Metals',5), ('06','Wood And Plastic',6), ('07','Thermal And Moisture Protection',7),
  ('08','Doors And Windows',8), ('09','Finishes',9), ('10','Specialties',10), ('11','Equipment',11),
  ('12','Furnishings',12), ('13','Special Construction',13), ('14','Conveying System',14),
  ('15','Mechanical',15), ('16','Electrical',16)
on conflict (code) do nothing;

-- 2. Catalogue columns on plan_act_masters ----------------------------------
alter table public.plan_act_masters
  add column if not exists division_id      uuid references public.plan_act_divisions(id) on delete set null,
  add column if not exists visible_code     text,
  add column if not exists trade            text,
  add column if not exists activity_type    text,
  add column if not exists min_duration_pct numeric,
  add column if not exists max_duration_pct numeric,
  add column if not exists image_path       text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'plan_act_masters_activity_type_chk') then
    alter table public.plan_act_masters add constraint plan_act_masters_activity_type_chk
      check (activity_type is null or activity_type in
        ('construction','procurement','design','submittal','testing','milestone'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plan_act_masters_duration_pct_chk') then
    alter table public.plan_act_masters add constraint plan_act_masters_duration_pct_chk
      check ((min_duration_pct is null or (min_duration_pct >= 0 and min_duration_pct <= 100))
         and (max_duration_pct is null or (max_duration_pct >= 0 and max_duration_pct <= 100))
         and (min_duration_pct is null or max_duration_pct is null or min_duration_pct <= max_duration_pct));
  end if;
end $$;

create unique index if not exists uq_plan_act_masters_visible_code
  on public.plan_act_masters (visible_code) where visible_code is not null and supersedes_id is null;
create index if not exists idx_plan_act_masters_visible_code on public.plan_act_masters (visible_code);
create index if not exists idx_plan_act_masters_division on public.plan_act_masters (division_id);

-- 3. visible_code assignment --------------------------------------------------
create or replace function public.plan_act_master_assign_visible_code()
returns trigger language plpgsql set search_path to 'public' as $$
declare
  v_div text;
  v_next int;
begin
  if new.visible_code is not null then
    return new;
  end if;
  -- a new version keeps its predecessor's code
  if new.supersedes_id is not null then
    select visible_code into new.visible_code from public.plan_act_masters where id = new.supersedes_id;
    if new.visible_code is not null then return new; end if;
  end if;
  if new.division_id is null then
    return new;
  end if;
  select code into v_div from public.plan_act_divisions where id = new.division_id;
  perform pg_advisory_xact_lock(hashtext('plan_act_visible_code_' || v_div));
  select coalesce(max(substring(visible_code from ('^D' || v_div || '-(\d+)$'))::int), 0) + 1
    into v_next
    from public.plan_act_masters
   where visible_code ~ ('^D' || v_div || '-\d+$');
  new.visible_code := 'D' || v_div || '-' || lpad(v_next::text, 3, '0');
  return new;
end $$;

drop trigger if exists trg_plan_act_master_visible_code on public.plan_act_masters;
create trigger trg_plan_act_master_visible_code
  before insert or update of division_id, visible_code, supersedes_id on public.plan_act_masters
  for each row execute function public.plan_act_master_assign_visible_code();

-- 4. Master guard: catalogue fields stay editable on approved/active masters ----
create or replace function public.plan_act_master_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ok boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.plan_act_change_history(entity_type, entity_id, action, to_status)
    values ('master', new.id, 'create', new.status);
    return new;
  end if;

  if new.status is distinct from old.status then
    ok := (old.status, new.status) in (
      ('draft','under_review'), ('under_review','draft'), ('under_review','approved'),
      ('approved','active'), ('approved','draft'),
      ('active','superseded'), ('active','archived'),
      ('superseded','archived'), ('draft','archived'), ('archived','draft')
    );
    if not ok then
      raise exception 'Illegal Activity Master status change % -> %', old.status, new.status;
    end if;
    if new.status = 'approved' then
      new.approved_by := coalesce(new.approved_by, auth.uid());
      new.approved_at := coalesce(new.approved_at, now());
    end if;
    if new.status = 'superseded' then
      new.superseded_date := coalesce(new.superseded_date, current_date);
    end if;
    insert into public.plan_act_change_history(entity_type, entity_id, action, from_status, to_status)
    values ('master', new.id, 'status', old.status, new.status);
  elsif old.status in ('approved','active','superseded','archived')
    -- division_id, visible_code, trade and image_path are intentionally absent: editable without a new version
    and (new.code, new.name, new.description, new.category_id, new.domain_id, new.family_id,
         new.discipline, new.work_type, new.default_unit, new.version,
         new.activity_type, new.min_duration_pct, new.max_duration_pct)
        is distinct from
        (old.code, old.name, old.description, old.category_id, old.domain_id, old.family_id,
         old.discipline, old.work_type, old.default_unit, old.version,
         old.activity_type, old.min_duration_pct, old.max_duration_pct) then
    raise exception 'Activity Master % v% is % and immutable; create a new version', old.code, old.version, old.status;
  end if;
  return new;
end $function$;

-- 5. Master <-> work item links -------------------------------------------------
create table if not exists public.plan_act_master_work_items (
  id                     uuid primary key default gen_random_uuid(),
  master_id              uuid not null references public.plan_act_masters(id) on delete cascade,
  work_item_id           uuid not null references public.dwl_work_items(id) on delete cascade,
  duration_days_per_unit numeric check (duration_days_per_unit is null or duration_days_per_unit >= 0),
  share_pct              numeric not null default 100 check (share_pct > 0 and share_pct <= 100),
  sort_order             int not null default 0,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint plan_act_master_work_items_uniq unique (master_id, work_item_id)
);
create index if not exists idx_plan_act_mwi_master on public.plan_act_master_work_items (master_id);
create index if not exists idx_plan_act_mwi_work_item on public.plan_act_master_work_items (work_item_id);

drop trigger if exists set_plan_act_master_work_items_updated_at on public.plan_act_master_work_items;
create trigger set_plan_act_master_work_items_updated_at
  before update on public.plan_act_master_work_items
  for each row execute function public.set_updated_at();

drop trigger if exists trg_plan_act_master_work_items_frozen on public.plan_act_master_work_items;
create trigger trg_plan_act_master_work_items_frozen
  before insert or update or delete on public.plan_act_master_work_items
  for each row execute function public.plan_act_master_children_guard();

alter table public.plan_act_master_work_items enable row level security;
drop policy if exists "plan_act_master_work_items authenticated view" on public.plan_act_master_work_items;
create policy "plan_act_master_work_items authenticated view" on public.plan_act_master_work_items
  for select to authenticated using (true);
drop policy if exists "plan_act_master_work_items privileged manage" on public.plan_act_master_work_items;
create policy "plan_act_master_work_items privileged manage" on public.plan_act_master_work_items
  for all to authenticated
  using (public.can_manage_master_libraries())
  with check (public.can_manage_master_libraries());

-- 6. Storage bucket for activity images -------------------------------------------
insert into storage.buckets (id, name, public)
values ('activity-images', 'activity-images', false)
on conflict (id) do nothing;

drop policy if exists "activity-images authenticated read" on storage.objects;
create policy "activity-images authenticated read" on storage.objects
  for select to authenticated using (bucket_id = 'activity-images');
drop policy if exists "activity-images library insert" on storage.objects;
create policy "activity-images library insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'activity-images' and public.can_manage_master_libraries());
drop policy if exists "activity-images library update" on storage.objects;
create policy "activity-images library update" on storage.objects
  for update to authenticated
  using (bucket_id = 'activity-images' and public.can_manage_master_libraries())
  with check (bucket_id = 'activity-images' and public.can_manage_master_libraries());
drop policy if exists "activity-images library delete" on storage.objects;
create policy "activity-images library delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'activity-images' and public.can_manage_master_libraries());

-- 7. RPCs -------------------------------------------------------------------------
create or replace function public.plan_act_bank_search(q text, p_division uuid default null)
returns jsonb
language sql stable security invoker
set search_path to 'public'
as $$
  select jsonb_build_object(
    'activities', coalesce((
      select jsonb_agg(to_jsonb(a)) from (
        select m.id, m.visible_code, m.code, m.name, m.default_unit, m.division_id
          from public.plan_act_masters m
         where m.status not in ('superseded','archived')
           and (p_division is null or m.division_id = p_division)
           and (coalesce(btrim(q), '') = ''
                or m.name ilike '%' || btrim(q) || '%'
                or m.code ilike '%' || btrim(q) || '%'
                or m.visible_code ilike '%' || btrim(q) || '%')
         order by m.visible_code nulls last, m.code
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
         count(distinct m.id),
         count(distinct l.work_item_id)
    from public.plan_act_divisions d
    left join public.plan_act_masters m
           on m.division_id = d.id and m.status not in ('superseded','archived')
    left join public.plan_act_master_work_items l on l.master_id = m.id
   group by d.id
   order by d.id;
$$;
grant execute on function public.plan_act_division_counts() to authenticated;
