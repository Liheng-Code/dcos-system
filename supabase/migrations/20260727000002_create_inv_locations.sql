-- Migration: 20260727000002_create_inv_locations.sql
-- Purpose: CWIMS Stage 1+2 gap-closure — bin/rack/zone location hierarchy within a store
-- Depends on: inv_stores (20260621000001_create_inv_module_tables.sql)

create table if not exists public.inv_locations (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null,
  store_id       uuid        not null references public.inv_stores(id) on delete cascade,
  parent_id      uuid        references public.inv_locations(id) on delete cascade,
  code           text        not null,
  location_type  text        not null
                   constraint inv_locations_type_check
                   check (location_type in ('zone','aisle','rack','bin')),
  is_dg_allowed  boolean     not null default false,
  capacity_qty   numeric(18,4),
  status         text        not null default 'active'
                   constraint inv_locations_status_check
                   check (status in ('active','inactive')),
  created_by     uuid        references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint inv_locations_store_code_uniq unique (store_id, code)
);

create index if not exists inv_locations_tenant_idx  on public.inv_locations(tenant_id);
create index if not exists inv_locations_store_idx   on public.inv_locations(tenant_id, store_id);
create index if not exists inv_locations_parent_idx  on public.inv_locations(tenant_id, parent_id);

create trigger inv_locations_set_updated_at
  before update on public.inv_locations
  for each row execute function public.inv_set_updated_at();

alter table public.inv_locations enable row level security;

create policy "inv_locations_tenant_isolation" on public.inv_locations
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
