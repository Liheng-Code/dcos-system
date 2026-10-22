-- Migration: 20261022101055_qs_boq_item_alternates.sql
-- Purpose: Alternate rate build-ups per tender BOQ item (memo only) and an atomic
--          "promote alternate" RPC that swaps an alternate with the base item.
-- Depends on: tender_register, tender_boq_items, dwl_work_items, dwl_assemblies,
--             tender_price_list, tender_cost_database_items, qs_audit_log,
--             public.tender_is_locked(), public.tender_lock_guard()
--             (20260928000002_tender_gates.sql), public.qs_audit_trigger_fn()
-- Additive only: new table, functions, triggers, policies. Idempotent.

create table if not exists public.tender_boq_item_alternates (
  id                     uuid primary key default gen_random_uuid(),
  tender_id              uuid not null references public.tender_register(id) on delete cascade,
  boq_item_id            uuid not null references public.tender_boq_items(id) on delete cascade,
  alt_no                 integer not null default 1,
  description            text not null,
  notes                  text,
  labor_net_cost         numeric(15,2) not null default 0,
  labor_margin_pct       numeric(5,2)  not null default 0,
  material_net_cost      numeric(15,2) not null default 0,
  material_margin_pct    numeric(5,2)  not null default 0,
  unit_rate              numeric(15,2) not null default 0,
  is_manual_rate         boolean not null default false,
  rate_source            text not null default 'manual',
  dwl_work_item_id       uuid references public.dwl_work_items(id),
  dwl_assembly_id        uuid references public.dwl_assemblies(id),
  price_list_item_id     uuid references public.tender_price_list(id) on delete set null,
  source_cost_db_item_id uuid references public.tender_cost_database_items(id) on delete set null,
  rate_build_up          jsonb,
  brand                  text,
  supplier               text,
  material_type          text,
  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint tender_boq_item_alternates_alt_no_chk check (alt_no >= 1),
  constraint tender_boq_item_alternates_item_alt_key unique (boq_item_id, alt_no),
  constraint tender_boq_item_alternates_rate_source_check
    check (rate_source = any (array['manual','price_list','dwl_work_item','dwl_assembly'])),
  constraint tender_boq_item_alternates_one_library_source_chk
    check (dwl_work_item_id is null or dwl_assembly_id is null)
);

create index if not exists idx_tbia_tender   on public.tender_boq_item_alternates(tender_id);
create index if not exists idx_tbia_boq_item on public.tender_boq_item_alternates(boq_item_id);

comment on table public.tender_boq_item_alternates is
  'Alternate rate build-ups for a tender BOQ item. MEMO ONLY: alternates are never part of Direct Works or the tender total until promoted (swapped) into the base item via tender_boq_promote_alternate().';
comment on column public.tender_boq_item_alternates.unit_rate is
  'Memo rate, never counted in Direct Works or any tender total. Recomputed by trigger as round(labor_net*(1+labor_margin/100)+material_net*(1+material_margin/100),2) unless is_manual_rate is true (then kept verbatim).';
comment on column public.tender_boq_item_alternates.is_manual_rate is
  'When true the trigger keeps unit_rate as given (mirror of tender_boq_items.is_manual_rate).';
comment on column public.tender_boq_item_alternates.tender_id is
  'Always forced to the parent BOQ item tender_id by trigger.';

-- BEFORE INSERT/UPDATE: tender_id from parent, rate computation, updated_at.
-- Trigger name sorts before tender_lock_guard, which reads NEW.tender_id.
create or replace function public.tender_boq_item_alternates_prepare()
returns trigger
language plpgsql
as $$
declare
  v_tender uuid;
begin
  select tender_id into v_tender from public.tender_boq_items where id = new.boq_item_id;
  if v_tender is null then
    raise exception 'BOQ item % not found', new.boq_item_id using errcode = 'foreign_key_violation';
  end if;
  new.tender_id := v_tender;

  if not new.is_manual_rate then
    new.unit_rate := round(
      new.labor_net_cost    * (1 + new.labor_margin_pct    / 100) +
      new.material_net_cost * (1 + new.material_margin_pct / 100), 2);
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists tender_boq_item_alternates_prepare on public.tender_boq_item_alternates;
create trigger tender_boq_item_alternates_prepare
  before insert or update on public.tender_boq_item_alternates
  for each row execute function public.tender_boq_item_alternates_prepare();

drop trigger if exists tender_lock_guard on public.tender_boq_item_alternates;
create trigger tender_lock_guard
  before insert or update or delete on public.tender_boq_item_alternates
  for each row execute function public.tender_lock_guard();

drop trigger if exists qs_audit_tender_boq_item_alternates on public.tender_boq_item_alternates;
create trigger qs_audit_tender_boq_item_alternates
  after insert or update or delete on public.tender_boq_item_alternates
  for each row execute function public.qs_audit_trigger_fn();

-- RLS: same as tender_boq_items (permissive for authenticated).
alter table public.tender_boq_item_alternates enable row level security;

drop policy if exists "Auth users can view tender BOQ alternates"   on public.tender_boq_item_alternates;
drop policy if exists "Auth users can insert tender BOQ alternates" on public.tender_boq_item_alternates;
drop policy if exists "Auth users can update tender BOQ alternates" on public.tender_boq_item_alternates;
drop policy if exists "Auth users can delete tender BOQ alternates" on public.tender_boq_item_alternates;
create policy "Auth users can view tender BOQ alternates"   on public.tender_boq_item_alternates for select to authenticated using (true);
create policy "Auth users can insert tender BOQ alternates" on public.tender_boq_item_alternates for insert to authenticated with check (true);
create policy "Auth users can update tender BOQ alternates" on public.tender_boq_item_alternates for update to authenticated using (true) with check (true);
create policy "Auth users can delete tender BOQ alternates" on public.tender_boq_item_alternates for delete to authenticated using (true);

grant select, insert, update, delete on public.tender_boq_item_alternates to authenticated;

-- Promote: swap alternate <-> base BOQ item pricing fields verbatim (no recomputation).
-- Base keeps item_code, section, unit, quantity, wbs etc. Audit rows are written by the
-- existing qs_audit triggers on both tables (old/new JSON of the swap).
-- unit_rate_id mirrors dwl_work_item_id (repoint migration 20260721000001) so it follows it.
-- net_cost is not maintained by the app (default 0, not written by createBoqItem): untouched.
create or replace function public.tender_boq_promote_alternate(p_alternate_id uuid)
returns uuid
language plpgsql
security invoker
as $$
declare
  a public.tender_boq_item_alternates%rowtype;
  b public.tender_boq_items%rowtype;
begin
  select * into a from public.tender_boq_item_alternates where id = p_alternate_id for update;
  if not found then
    raise exception 'Alternate % not found', p_alternate_id using errcode = 'no_data_found';
  end if;
  select * into b from public.tender_boq_items where id = a.boq_item_id for update;
  if not found then
    raise exception 'BOQ item % not found', a.boq_item_id using errcode = 'no_data_found';
  end if;
  if public.tender_is_locked(b.tender_id) then
    raise exception 'Tender pricing is locked (internal review, approval or submitted). Return the bid to Tendering or record an addendum to change it.'
      using errcode = 'check_violation';
  end if;

  update public.tender_boq_items set
    description            = a.description,
    notes                  = a.notes,
    labor_net_cost         = a.labor_net_cost,
    labor_margin_pct       = a.labor_margin_pct,
    material_net_cost      = a.material_net_cost,
    material_margin_pct    = a.material_margin_pct,
    unit_rate              = a.unit_rate,
    rate_source            = a.rate_source,
    dwl_work_item_id       = a.dwl_work_item_id,
    dwl_assembly_id        = a.dwl_assembly_id,
    unit_rate_id           = a.dwl_work_item_id,
    price_list_item_id     = a.price_list_item_id,
    source_cost_db_item_id = a.source_cost_db_item_id,
    rate_build_up          = a.rate_build_up,
    brand                  = a.brand,
    supplier               = a.supplier,
    material_type          = a.material_type,
    is_manual_rate         = a.is_manual_rate
  where id = b.id;

  update public.tender_boq_item_alternates set
    description            = b.description,
    notes                  = b.notes,
    labor_net_cost         = coalesce(b.labor_net_cost, 0),
    labor_margin_pct       = coalesce(b.labor_margin_pct, 0),
    material_net_cost      = coalesce(b.material_net_cost, 0),
    material_margin_pct    = coalesce(b.material_margin_pct, 0),
    unit_rate              = coalesce(b.unit_rate, 0),
    is_manual_rate         = true,
    rate_source            = b.rate_source,
    dwl_work_item_id       = b.dwl_work_item_id,
    dwl_assembly_id        = b.dwl_assembly_id,
    price_list_item_id     = b.price_list_item_id,
    source_cost_db_item_id = b.source_cost_db_item_id,
    rate_build_up          = b.rate_build_up,
    brand                  = b.brand,
    supplier               = b.supplier,
    material_type          = b.material_type
  where id = a.id;

  return b.id;
end;
$$;

comment on function public.tender_boq_promote_alternate(uuid) is
  'Atomically swaps an alternate pricing fields with its base tender_boq_items row (verbatim). The displaced base build-up becomes the alternate. Alternates stay memo only. Fails if the tender is price-locked.';

revoke all on function public.tender_boq_promote_alternate(uuid) from public;
grant execute on function public.tender_boq_promote_alternate(uuid) to authenticated;
