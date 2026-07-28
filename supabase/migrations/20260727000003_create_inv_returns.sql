-- Migration: 20260727000003_create_inv_returns.sql
-- Purpose: CWIMS Stage 1+2 gap-closure — material returns from site back to store,
--          optionally referencing the original MR issue.
-- Depends on: projects, inv_stores, inv_material_requisitions, inv_items, profiles
--             (20260621000001_create_inv_module_tables.sql)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. inv_returns — Return Headers
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.inv_returns (
  id             uuid        primary key default gen_random_uuid(),
  tenant_id      uuid        not null,
  project_id     uuid        not null references public.projects(id) on delete cascade,
  store_id       uuid        not null references public.inv_stores(id) on delete restrict,
  return_number  text        not null,
  mr_id          uuid        references public.inv_material_requisitions(id) on delete set null,
  returned_by    uuid        not null references public.profiles(id) on delete restrict,
  return_date    date        not null,
  status         text        not null default 'draft'
                   constraint inv_returns_status_check
                   check (status in ('draft','submitted','inspected','posted','cancelled')),
  inspected_by   uuid        references public.profiles(id) on delete set null,
  inspected_at   timestamptz,
  created_by     uuid        references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint inv_returns_number_project_uniq unique (project_id, return_number)
);

create index if not exists inv_returns_tenant_idx         on public.inv_returns(tenant_id);
create index if not exists inv_returns_tenant_project_idx on public.inv_returns(tenant_id, project_id);
create index if not exists inv_returns_store_idx          on public.inv_returns(tenant_id, store_id);
create index if not exists inv_returns_mr_idx              on public.inv_returns(tenant_id, mr_id);
create index if not exists inv_returns_status_idx          on public.inv_returns(tenant_id, status);

create trigger inv_returns_set_updated_at
  before update on public.inv_returns
  for each row execute function public.inv_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. inv_return_lines — Return Line Items
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.inv_return_lines (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null,
  return_id         uuid        not null references public.inv_returns(id) on delete cascade,
  item_id           uuid        not null references public.inv_items(id) on delete restrict,
  quantity          numeric(18,4) not null check (quantity > 0),
  condition         text        not null
                      constraint inv_return_lines_condition_check
                      check (condition in ('good','damaged','scrap')),
  unit_cost         numeric(18,2),
  evidence_doc_ids  uuid[],
  remarks           text,
  created_at        timestamptz not null default now()
);

create index if not exists inv_return_lines_return_idx on public.inv_return_lines(tenant_id, return_id);
create index if not exists inv_return_lines_item_idx   on public.inv_return_lines(tenant_id, item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.inv_returns      enable row level security;
alter table public.inv_return_lines enable row level security;

create policy "inv_returns_tenant_isolation" on public.inv_returns
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "inv_return_lines_tenant_isolation" on public.inv_return_lines
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
