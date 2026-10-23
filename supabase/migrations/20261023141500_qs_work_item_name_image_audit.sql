-- Migration: 20261023141500_qs_work_item_name_image_audit.sql
-- Purpose: Let the Planning Activity Database edit QS work items (dwl_work_items) and their
--          resource consumption (dwl_work_item_resources): add name + image_path, tenant-scoped
--          library-manager policies, and an audit history.
-- Depends on: dwl_work_items, dwl_work_item_resources, profiles, can_manage_master_libraries()
-- Additive only. Existing tenant_* policies are untouched.
--
-- Existing policies (dwl_work_items and dwl_work_item_resources, role public, 4 each):
--   *_tenant_select/insert/update/delete: allow the operation on rows whose tenant_id equals the
--   caller's profiles.company_id. So every tenant member can already read and write both tables;
--   the new policies below only make library-manager edit rights explicit (they are a subset).
-- Storage: bucket activity-images already has authenticated read and library-manager
--   insert/update/delete policies for every path (incl. 'work-items/'); no storage change needed.
-- Delete safety (not changed): see the FK list in the migration report.

-- 1. name + image_path -----------------------------------------------------
alter table public.dwl_work_items add column if not exists name text;
alter table public.dwl_work_items add column if not exists image_path text;

-- First line / first sentence of the description, max 80 chars cut at a word boundary,
-- no trailing punctuation.
create or replace function public.dwl_derive_work_item_name(p_description text)
returns text language plpgsql immutable set search_path = public as $$
declare s text;
begin
  s := btrim(coalesce(p_description, ''));
  if s = '' then return null; end if;
  s := btrim(split_part(s, E'\n', 1));
  s := btrim(regexp_replace(s, '\.\s.*$', ''));
  if length(s) > 80 then
    if substr(s, 81, 1) ~ '\s' then
      s := left(s, 80);
    else
      s := regexp_replace(left(s, 80), '\s+\S*$', '');
    end if;
  end if;
  s := btrim(regexp_replace(s, '[\s.,;:\-]+$', ''));
  return nullif(s, '');
end $$;

update public.dwl_work_items
   set name = public.dwl_derive_work_item_name(description)
 where name is null;

create or replace function public.dwl_work_item_fill_name()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.name is null or btrim(new.name) = '' then
    new.name := public.dwl_derive_work_item_name(new.description);
  end if;
  return new;
end $$;

drop trigger if exists trg_dwl_work_item_fill_name on public.dwl_work_items;
create trigger trg_dwl_work_item_fill_name before insert on public.dwl_work_items
  for each row execute function public.dwl_work_item_fill_name();

-- 2. Library-manager policies (tenant-scoped, additive) ----------------------
do $$
declare t text; cmd text;
begin
  foreach t in array array['dwl_work_items', 'dwl_work_item_resources'] loop
    execute format('drop policy if exists %I on public.%I', t || '_library_manager_insert', t);
    execute format($p$create policy %I on public.%I for insert to authenticated with check (
      public.can_manage_master_libraries()
      and tenant_id = (select company_id from public.profiles where id = auth.uid()))$p$,
      t || '_library_manager_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_library_manager_update', t);
    execute format($p$create policy %I on public.%I for update to authenticated using (
      public.can_manage_master_libraries()
      and tenant_id = (select company_id from public.profiles where id = auth.uid())
    ) with check (
      public.can_manage_master_libraries()
      and tenant_id = (select company_id from public.profiles where id = auth.uid()))$p$,
      t || '_library_manager_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_library_manager_delete', t);
    execute format($p$create policy %I on public.%I for delete to authenticated using (
      public.can_manage_master_libraries()
      and tenant_id = (select company_id from public.profiles where id = auth.uid()))$p$,
      t || '_library_manager_delete', t);
  end loop;
end $$;

-- 3. Audit history -----------------------------------------------------------
-- No cost-library audit table exists (qs_audit_log is QS-document oriented with a
-- permissive insert policy), so a dedicated table is created.
create table if not exists public.dwl_work_item_history (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  work_item_id uuid not null,                 -- no FK: history survives deletion
  action       text not null,
  detail       jsonb not null default '{}'::jsonb,
  changed_by   uuid default auth.uid(),
  changed_at   timestamptz not null default now(),
  constraint dwl_work_item_history_action_chk check (action in (
    'item_insert', 'item_update', 'item_delete',
    'resource_insert', 'resource_update', 'resource_delete'))
);
create index if not exists idx_dwl_wih_item on public.dwl_work_item_history(work_item_id, changed_at desc);
create index if not exists idx_dwl_wih_tenant on public.dwl_work_item_history(tenant_id);

alter table public.dwl_work_item_history enable row level security;
drop policy if exists "dwl_work_item_history read" on public.dwl_work_item_history;
create policy "dwl_work_item_history read" on public.dwl_work_item_history
  for select to authenticated using (
    (public.can_manage_master_libraries()
       and tenant_id = (select company_id from public.profiles where id = auth.uid()))
    or exists (select 1 from public.dwl_work_items w where w.id = work_item_id)   -- RLS-filtered
  );
-- No insert/update/delete policies: rows are written only by the SECURITY DEFINER triggers.

create or replace function public.dwl_work_item_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb; n jsonb; j jsonb; k text; d jsonb := '{}'::jsonb; v_action text;
  cols text[]; shown text[];
begin
  if tg_table_name = 'dwl_work_items' then
    cols := array['name','description','unit','csi_division_code','csi_section_code','image_path','is_active'];
  else
    cols := array['consumption','waste_pct'];
  end if;
  shown := cols || array['code','resource_id','basis_note'];
  v_action := case when tg_table_name = 'dwl_work_items' then 'item_' else 'resource_' end || lower(tg_op);

  if tg_op = 'INSERT' then
    j := to_jsonb(new);
    d := jsonb_build_object('new', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
           from jsonb_each(j) where key = any (shown)));
  elsif tg_op = 'DELETE' then
    j := to_jsonb(old);
    d := jsonb_build_object('old', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
           from jsonb_each(j) where key = any (shown)));
  else
    o := to_jsonb(old); n := to_jsonb(new); j := n;
    foreach k in array cols loop
      if o -> k is distinct from n -> k then
        d := d || jsonb_build_object(k, jsonb_build_object('old', o -> k, 'new', n -> k));
      end if;
    end loop;
    if d = '{}'::jsonb then return null; end if;
    if tg_table_name = 'dwl_work_item_resources' then
      d := d || jsonb_build_object('resource_id', n -> 'resource_id');
    end if;
  end if;

  insert into public.dwl_work_item_history(tenant_id, work_item_id, action, detail)
  values ((j ->> 'tenant_id')::uuid, coalesce(j ->> 'work_item_id', j ->> 'id')::uuid, v_action, d);
  return null;
end $$;

drop trigger if exists trg_dwl_work_items_audit on public.dwl_work_items;
create trigger trg_dwl_work_items_audit
  after insert or delete or update of name, description, unit, csi_division_code, csi_section_code, image_path, is_active
  on public.dwl_work_items
  for each row execute function public.dwl_work_item_audit();

drop trigger if exists trg_dwl_work_item_resources_audit on public.dwl_work_item_resources;
create trigger trg_dwl_work_item_resources_audit
  after insert or delete or update of consumption, waste_pct
  on public.dwl_work_item_resources
  for each row execute function public.dwl_work_item_audit();
