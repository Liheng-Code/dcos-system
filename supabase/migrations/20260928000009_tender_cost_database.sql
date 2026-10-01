-- Migration: 20260928000009_tender_cost_database.sql
-- Purpose: QS â†’ Cost & Estimation â†’ Cost Database. A finished Tender BOQ can be saved (any time, as many
--          named versions as needed) as a frozen snapshot, reviewed later, and copied back â€” whole or
--          selected lines â€” into any tender's BOQ.
--            * tender_cost_databases       one saved BOQ version + the tender/project details at save time
--            * tender_cost_database_items  frozen copy of every tender_boq_items line
--            * save_tender_cost_database() copies a tender's BOQ in one transaction (no half-saved versions)
--            * tender_boq_items.source_cost_db_item_id  provenance of lines assigned back from the database
--            * RBAC: qs / qs_cost_database (view, can_create = save, delete)
-- Depends on: tender_register, tender_boq_items, projects, project_precontract_details, budget_codes,
--             profiles, role_permissions + roles, user_roles.
-- Idempotent: safe to replay.

create table if not exists public.tender_cost_databases (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  notes             text,
  source_tender_id  uuid references public.tender_register(id) on delete set null,
  source_project_id uuid references public.projects(id) on delete set null,
  -- Snapshot of the source so the record still reads correctly if the tender/project changes or goes.
  project_code      text,
  project_name      text,
  tender_no         text,
  tender_title      text,
  tender_stage      text,
  item_count        integer not null default 0,
  total_amount      numeric(18,2) not null default 0,
  created_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now()
);

create index if not exists idx_tender_cost_db_tender on public.tender_cost_databases(source_tender_id);
create index if not exists idx_tender_cost_db_created on public.tender_cost_databases(created_at desc);

create table if not exists public.tender_cost_database_items (
  id                  uuid primary key default gen_random_uuid(),
  database_id         uuid not null references public.tender_cost_databases(id) on delete cascade,
  sort_order          integer not null default 0,
  item_code           text not null,
  description         text not null,
  unit                text not null default 'ea',
  quantity            numeric(15,2) not null default 0,
  unit_rate           numeric(15,2) not null default 0,
  total_amount        numeric(15,2) generated always as (quantity * unit_rate) stored,
  labor_net_cost      numeric(15,2),
  labor_margin_pct    numeric(5,2),
  material_net_cost   numeric(15,2),
  material_margin_pct numeric(5,2),
  section             text not null,
  sub_section         text,
  sub_element         text,
  discipline          text,
  element_group       text,
  budget_code_id      uuid references public.budget_codes(id) on delete set null,
  budget_code         text,
  level               text not null default 'All',
  building_code       text not null default 'BA',
  sourcing            text not null default 'self',
  rate_source         text not null default 'manual',
  dwl_assembly_id     uuid,
  dwl_work_item_id    uuid,
  rate_build_up       jsonb,
  notes               text
);

create index if not exists idx_tender_cost_db_items_db on public.tender_cost_database_items(database_id, sort_order);

alter table public.tender_boq_items
  add column if not exists source_cost_db_item_id uuid references public.tender_cost_database_items(id) on delete set null;

-- â”€â”€â”€ RLS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.can_delete_cost_database(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_code = ur.role_code
    where ur.user_id = p_uid and rp.module = 'qs' and rp.action = 'qs_cost_database' and rp.delete
  );
$$;

grant execute on function public.can_delete_cost_database(uuid) to authenticated;

alter table public.tender_cost_databases enable row level security;
alter table public.tender_cost_database_items enable row level security;

drop policy if exists "Auth users can view cost databases" on public.tender_cost_databases;
create policy "Auth users can view cost databases"
  on public.tender_cost_databases for select to authenticated using (true);

drop policy if exists "Auth users can save cost databases" on public.tender_cost_databases;
create policy "Auth users can save cost databases"
  on public.tender_cost_databases for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "Owners can rename cost databases" on public.tender_cost_databases;
create policy "Owners can rename cost databases"
  on public.tender_cost_databases for update to authenticated
  using (created_by = auth.uid() or public.can_delete_cost_database(auth.uid()))
  with check (true);

drop policy if exists "Owners or managers can delete cost databases" on public.tender_cost_databases;
create policy "Owners or managers can delete cost databases"
  on public.tender_cost_databases for delete to authenticated
  using (created_by = auth.uid() or public.can_delete_cost_database(auth.uid()));

drop policy if exists "Auth users can view cost database items" on public.tender_cost_database_items;
create policy "Auth users can view cost database items"
  on public.tender_cost_database_items for select to authenticated using (true);

-- Lines are only written by save_tender_cost_database(), into a version the caller owns; they are frozen after.
drop policy if exists "Owners can add cost database items" on public.tender_cost_database_items;
create policy "Owners can add cost database items"
  on public.tender_cost_database_items for insert to authenticated
  with check (exists (select 1 from public.tender_cost_databases d where d.id = database_id and d.created_by = auth.uid()));

-- â”€â”€â”€ Save a tender's BOQ as a new version â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
create or replace function public.save_tender_cost_database(p_tender_id uuid, p_name text, p_notes text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' then
    raise exception 'A name is required to save the BOQ to the Cost Database';
  end if;
  if not exists (select 1 from public.tender_boq_items where tender_id = p_tender_id) then
    raise exception 'This tender has no BOQ items to save';
  end if;

  insert into public.tender_cost_databases
    (name, notes, source_tender_id, source_project_id, project_code, project_name, tender_no, tender_title, tender_stage, created_by)
  select trim(p_name), nullif(trim(coalesce(p_notes, '')), ''), t.id, t.project_id, p.project_code, p.project_name,
         t.tender_no, t.title, pd.tender_stage, auth.uid()
  from public.tender_register t
  left join public.projects p on p.id = t.project_id
  left join public.project_precontract_details pd on pd.project_id = t.project_id
  where t.id = p_tender_id
  returning id into v_id;

  if v_id is null then
    raise exception 'Tender not found';
  end if;

  insert into public.tender_cost_database_items
    (database_id, sort_order, item_code, description, unit, quantity, unit_rate, labor_net_cost, labor_margin_pct,
     material_net_cost, material_margin_pct, section, sub_section, sub_element, discipline, element_group,
     budget_code_id, budget_code, level, building_code, sourcing, rate_source, dwl_assembly_id, dwl_work_item_id,
     rate_build_up, notes)
  select v_id,
         row_number() over (order by bc.code nulls last, b.section, b.sub_section nulls first, b.sort_order, b.item_code)::int,
         b.item_code, b.description, b.unit, b.quantity, coalesce(b.unit_rate, 0), b.labor_net_cost, b.labor_margin_pct,
         b.material_net_cost, b.material_margin_pct, b.section, b.sub_section, b.sub_element, b.discipline, b.element_group,
         b.budget_code_id, bc.code, b.level, b.building_code, b.sourcing, b.rate_source, b.dwl_assembly_id,
         b.dwl_work_item_id, b.rate_build_up, b.notes
  from public.tender_boq_items b
  left join public.budget_codes bc on bc.id = b.budget_code_id
  where b.tender_id = p_tender_id;

  update public.tender_cost_databases d
     set item_count = s.n, total_amount = s.total
    from (select count(*)::int n, coalesce(sum(total_amount), 0) total
            from public.tender_cost_database_items where database_id = v_id) s
   where d.id = v_id;

  return v_id;
end;
$$;

grant execute on function public.save_tender_cost_database(uuid, text, text) to authenticated;

-- The item_count/total update above runs as the caller; it is the creator, so the update policy allows it.

-- â”€â”€â”€ RBAC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, delete, submit, approve, reject, export, transmit, configure, reassign, scope)
select r.role_code, 'qs', 'qs_cost_database', r.view, r.can_create, r.can_create, r.del, false, false, false, r.view, false, false, false, r.scope
from (values
  ('L0',      true,  true,  true,  'company'),
  ('L1',      true,  true,  true,  'company'),
  ('L2',      true,  true,  true,  'company'),
  ('L3',      true,  true,  false, 'company'),
  ('L4',      true,  true,  false, 'company'),
  ('L5',      true,  true,  false, 'company'),
  ('QS',      true,  true,  true,  'company'),
  ('BIM',     true,  false, false, 'company'),
  ('PE',      true,  false, false, 'company'),
  ('HSE',     false, false, false, null),
  ('QA',      false, false, false, null),
  ('AC',      true,  false, false, 'company'),
  ('PO',      true,  true,  false, 'company'),
  ('L6',      false, false, false, null),
  ('EXT-CLT', false, false, false, null),
  ('EXT-CON', false, false, false, null),
  ('EXT-SUB', false, false, false, null)
) as r(role_code, view, can_create, del, scope)
where exists (select 1 from public.roles where code = r.role_code)
on conflict (role_code, module, action) do nothing;
