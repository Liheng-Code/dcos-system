-- Migration: 20260621000001_create_inv_module_tables.sql
-- Purpose: Create full Inventory/Stock module (Module 26 — INV) tables
-- Spec: docs/03-Business-Modules/26-INV-Inventory/04-Database-Schema.md
-- Depends on: projects, wbs_nodes, wbs_tasks, profiles,
--             procurement_pos, procurement_po_items, procurement_suppliers
-- Note: The old procurement_inventory stub table remains; these are the proper INV module tables.

-- ─────────────────────────────────────────────────────────────────────────────
-- Shared updated_at trigger function for INV module
-- ─────────���───────────────────────────��───────────────────────────────────────
create or replace function public.inv_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ���────────────────────────────────────────────────────────────────────────────
-- 1. inv_items — Item Master Catalogue (tenant-wide)
-- ──────────────────────────���──────────────────────────────────────────────────
create table if not exists public.inv_items (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null,
  item_code            text        not null,
  name                 text        not null,
  category             text        not null
                         constraint inv_items_category_check
                         check (category in ('structural','civil','mep','finishes','consumables','others')),
  sub_category         text,
  unit_of_measure      text        not null,
  default_cost_code    text,
  min_stock_level      numeric(18,4),
  max_stock_level      numeric(18,4),
  reorder_quantity     numeric(18,4),
  lead_time_days       integer,
  is_inspection_required boolean   not null default false,
  is_active            boolean     not null default true,
  created_by           uuid        references public.profiles(id) on delete set null,
  updated_by           uuid        references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint inv_items_code_tenant_uniq unique (tenant_id, item_code)
);

create index if not exists inv_items_tenant_idx          on public.inv_items(tenant_id);
create index if not exists inv_items_tenant_code_idx     on public.inv_items(tenant_id, item_code);
create index if not exists inv_items_tenant_category_idx on public.inv_items(tenant_id, category);

create trigger inv_items_set_updated_at
  before update on public.inv_items
  for each row execute function public.inv_set_updated_at();

-- ─��─────────────────────────────────────────────────���─────────────────────────
-- 2. inv_stores — Physical Stores per Project
-- ────────────────────────────────────────────────────────────────────��────────
create table if not exists public.inv_stores (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null,
  project_id           uuid        not null references public.projects(id) on delete cascade,
  store_code           text        not null,
  name                 text        not null,
  store_type           text        not null
                         constraint inv_stores_type_check
                         check (store_type in ('main','sub','temporary')),
  location_description text,
  responsible_user_id  uuid        references public.profiles(id) on delete set null,
  status               text        not null default 'active'
                         constraint inv_stores_status_check
                         check (status in ('active','closed')),
  created_by           uuid        references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint inv_stores_code_project_uniq unique (project_id, store_code)
);

create index if not exists inv_stores_tenant_idx         on public.inv_stores(tenant_id);
create index if not exists inv_stores_tenant_project_idx on public.inv_stores(tenant_id, project_id);

create trigger inv_stores_set_updated_at
  before update on public.inv_stores
  for each row execute function public.inv_set_updated_at();

-- ───────────────────────────────────────��─────────────────────────────��───────
-- 3. inv_stock — Running Balance per Item per Store
-- Updated exclusively via application service layer; never written directly.
-- ──────────���──────────────────���───────────────────────────────────────────────
create table if not exists public.inv_stock (
  id                         uuid        primary key default gen_random_uuid(),
  tenant_id                  uuid        not null,
  store_id                   uuid        not null references public.inv_stores(id) on delete cascade,
  item_id                    uuid        not null references public.inv_items(id) on delete restrict,
  project_id                 uuid        not null references public.projects(id) on delete cascade,
  quantity_available         numeric(18,4) not null default 0,
  quantity_reserved          numeric(18,4) not null default 0,
  quantity_under_inspection  numeric(18,4) not null default 0,
  quantity_quarantined       numeric(18,4) not null default 0,
  unit_cost_fifo             numeric(18,2),
  last_movement_at           timestamptz,
  updated_at                 timestamptz not null default now(),
  constraint inv_stock_store_item_uniq unique (store_id, item_id)
);

create index if not exists inv_stock_tenant_idx              on public.inv_stock(tenant_id);
create index if not exists inv_stock_tenant_project_idx      on public.inv_stock(tenant_id, project_id);
create index if not exists inv_stock_store_item_idx          on public.inv_stock(tenant_id, store_id, item_id);

create trigger inv_stock_set_updated_at
  before update on public.inv_stock
  for each row execute function public.inv_set_updated_at();

-- ────────���──────────────���────────────────────────────────���────────────────────
-- 4. inv_grns — Goods Received Note Headers
-- ─────────────────────────────────��──────────────────────────────��────────────
create table if not exists public.inv_grns (
  id                     uuid        primary key default gen_random_uuid(),
  tenant_id              uuid        not null,
  project_id             uuid        not null references public.projects(id) on delete cascade,
  store_id               uuid        not null references public.inv_stores(id) on delete restrict,
  grn_number             text        not null,
  po_id                  uuid        not null references public.procurement_pos(id) on delete restrict,
  po_number              text        not null,
  supplier_id            uuid        references public.procurement_suppliers(id) on delete set null,
  supplier_delivery_note text,
  vehicle_plate          text,
  driver_name            text,
  received_date          date        not null,
  received_time          time,
  received_by            uuid        not null references public.profiles(id) on delete restrict,
  status                 text        not null default 'draft'
                           constraint inv_grns_status_check
                           check (status in ('draft','confirmed','cancelled')),
  remarks                text,
  document_ids           uuid[],
  confirmed_at           timestamptz,
  confirmed_by           uuid        references public.profiles(id) on delete set null,
  created_by             uuid        references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint inv_grns_number_project_uniq unique (project_id, grn_number)
);

create index if not exists inv_grns_tenant_idx         on public.inv_grns(tenant_id);
create index if not exists inv_grns_tenant_project_idx on public.inv_grns(tenant_id, project_id);
create index if not exists inv_grns_tenant_po_idx      on public.inv_grns(tenant_id, po_id);
create index if not exists inv_grns_status_idx         on public.inv_grns(tenant_id, status);

create trigger inv_grns_set_updated_at
  before update on public.inv_grns
  for each row execute function public.inv_set_updated_at();

-- ────────────���───────────────────────────────────────────────���────────────────
-- 5. inv_grn_lines — GRN Line Items
-- ───��──────────────────���─────────────────────────────────���────────────────────
create table if not exists public.inv_grn_lines (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null,
  grn_id               uuid        not null references public.inv_grns(id) on delete cascade,
  item_id              uuid        not null references public.inv_items(id) on delete restrict,
  po_item_id           uuid        references public.procurement_po_items(id) on delete set null,
  quantity_ordered     numeric(18,4) not null,
  quantity_received    numeric(18,4) not null check (quantity_received >= 0),
  unit_cost            numeric(18,2) not null,
  total_cost           numeric(18,2) not null,
  batch_number         text,
  test_certificate_ref text,
  inspection_required  boolean     not null default false,
  inspection_status    text        not null default 'not_required'
                         constraint inv_grn_lines_inspection_check
                         check (inspection_status in ('not_required','pending','approved','rejected')),
  inspected_by         uuid        references public.profiles(id) on delete set null,
  inspected_at         timestamptz,
  inspection_notes     text,
  condition_notes      text,
  created_at           timestamptz not null default now()
);

create index if not exists inv_grn_lines_grn_idx  on public.inv_grn_lines(tenant_id, grn_id);
create index if not exists inv_grn_lines_item_idx on public.inv_grn_lines(tenant_id, item_id);

-- ──────────��───────────────────────────��──────────────────────────────��───────
-- 6. inv_material_requisitions — Material Requisition (Issue Request) Headers
-- ────────────��──────────────��──────────────────────────────────���──────────────
create table if not exists public.inv_material_requisitions (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null,
  project_id       uuid        not null references public.projects(id) on delete cascade,
  store_id         uuid        not null references public.inv_stores(id) on delete restrict,
  mr_number        text        not null,
  wbs_node_id      uuid        not null references public.wbs_nodes(id) on delete restrict,
  task_id          uuid        references public.wbs_tasks(id) on delete set null,
  cost_code        text        not null,
  required_date    date        not null,
  requested_by     uuid        not null references public.profiles(id) on delete restrict,
  status           text        not null default 'draft'
                     constraint inv_mr_status_check
                     check (status in ('draft','submitted','approved','issued','partially_issued','rejected','cancelled')),
  approved_by      uuid        references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  rejection_reason text,
  remarks          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint inv_mr_number_project_uniq unique (project_id, mr_number)
);

create index if not exists inv_mr_tenant_idx         on public.inv_material_requisitions(tenant_id);
create index if not exists inv_mr_tenant_project_idx on public.inv_material_requisitions(tenant_id, project_id);
create index if not exists inv_mr_wbs_idx            on public.inv_material_requisitions(tenant_id, wbs_node_id);
create index if not exists inv_mr_status_idx         on public.inv_material_requisitions(tenant_id, status);

create trigger inv_mr_set_updated_at
  before update on public.inv_material_requisitions
  for each row execute function public.inv_set_updated_at();

-- ─────────���────────────────────────────────��──────────────────────────────────
-- 7. inv_mr_lines — Material Requisition Line Items
-- ──────���─────────────────────���───────────────────────────���────────────────────
create table if not exists public.inv_mr_lines (
  id                   uuid        primary key default gen_random_uuid(),
  tenant_id            uuid        not null,
  mr_id                uuid        not null references public.inv_material_requisitions(id) on delete cascade,
  item_id              uuid        not null references public.inv_items(id) on delete restrict,
  quantity_requested   numeric(18,4) not null check (quantity_requested > 0),
  quantity_approved    numeric(18,4),
  quantity_issued      numeric(18,4) not null default 0,
  unit_cost_at_issue   numeric(18,2),
  remarks              text,
  created_at           timestamptz not null default now()
);

create index if not exists inv_mr_lines_mr_idx   on public.inv_mr_lines(tenant_id, mr_id);
create index if not exists inv_mr_lines_item_idx on public.inv_mr_lines(tenant_id, item_id);

-- ──────────────��────────────────────────��───────────────────────────────���─────
-- 8. inv_movements — Append-Only Stock Movement Ledger
-- This is the authoritative record of every stock change.
-- INSERT only — UPDATE and DELETE are blocked by RLS for all non-service roles.
-- ─────────────���──────────────��────────────────────────────────���───────────────
create table if not exists public.inv_movements (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null,
  project_id       uuid        not null references public.projects(id) on delete cascade,
  store_id         uuid        not null references public.inv_stores(id) on delete restrict,
  item_id          uuid        not null references public.inv_items(id) on delete restrict,
  movement_type    text        not null
                     constraint inv_movements_type_check
                     check (movement_type in (
                       'grn_receipt','mr_issue','return_to_store',
                       'transfer_out','transfer_in','return_to_supplier',
                       'adjustment','stocktake_adjustment','write_off'
                     )),
  reference_type   text        not null,
  reference_id     uuid        not null,
  reference_number text        not null,
  -- Positive = stock in; Negative = stock out
  quantity         numeric(18,4) not null,
  unit_cost        numeric(18,2) not null,
  total_cost       numeric(18,2) not null,
  wbs_node_id      uuid        references public.wbs_nodes(id) on delete set null,
  cost_code        text,
  balance_after    numeric(18,4) not null,
  movement_date    date        not null,
  created_by       uuid        not null references public.profiles(id) on delete restrict,
  created_at       timestamptz not null default now()
  -- No updated_at — this table is append-only; rows are never modified
);

create index if not exists inv_movements_tenant_idx        on public.inv_movements(tenant_id);
create index if not exists inv_movements_project_idx       on public.inv_movements(tenant_id, project_id);
create index if not exists inv_movements_store_item_idx    on public.inv_movements(tenant_id, store_id, item_id);
create index if not exists inv_movements_reference_idx     on public.inv_movements(tenant_id, reference_id);
create index if not exists inv_movements_date_idx          on public.inv_movements(tenant_id, movement_date);

-- ────────────────────────────────────────��──────────────────────────────���─────
-- 9. inv_transfers — Inter-Store / Inter-Project Transfer Headers
-- ──────────���───────────────────���─────────────────────────────���────────────────
create table if not exists public.inv_transfers (
  id                     uuid        primary key default gen_random_uuid(),
  tenant_id              uuid        not null,
  transfer_number        text        not null,
  transfer_type          text        not null
                           constraint inv_transfers_type_check
                           check (transfer_type in ('intra_project','inter_project')),
  source_project_id      uuid        not null references public.projects(id) on delete restrict,
  source_store_id        uuid        not null references public.inv_stores(id) on delete restrict,
  destination_project_id uuid        not null references public.projects(id) on delete restrict,
  destination_store_id   uuid        not null references public.inv_stores(id) on delete restrict,
  status                 text        not null default 'pending'
                           constraint inv_transfers_status_check
                           check (status in ('pending','approved','in_transit','received','discrepancy','resolved','rejected','cancelled')),
  transfer_reason        text        not null,
  requested_by           uuid        not null references public.profiles(id) on delete restrict,
  source_approved_by     uuid        references public.profiles(id) on delete set null,
  source_approved_at     timestamptz,
  dest_approved_by       uuid        references public.profiles(id) on delete set null,
  dest_approved_at       timestamptz,
  dispatched_by          uuid        references public.profiles(id) on delete set null,
  dispatched_at          timestamptz,
  received_by            uuid        references public.profiles(id) on delete set null,
  received_at            timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint inv_transfers_number_tenant_uniq unique (tenant_id, transfer_number)
);

create index if not exists inv_transfers_tenant_idx       on public.inv_transfers(tenant_id);
create index if not exists inv_transfers_source_idx       on public.inv_transfers(tenant_id, source_project_id);
create index if not exists inv_transfers_dest_idx         on public.inv_transfers(tenant_id, destination_project_id);
create index if not exists inv_transfers_status_idx       on public.inv_transfers(tenant_id, status);

create trigger inv_transfers_set_updated_at
  before update on public.inv_transfers
  for each row execute function public.inv_set_updated_at();

-- ─────────────────────────────────────���───────────────────────────────────────
-- 10. inv_transfer_lines — Transfer Line Items
-- ─��──────────────────��────────────────────────────────────────────────────────
create table if not exists public.inv_transfer_lines (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null,
  transfer_id         uuid        not null references public.inv_transfers(id) on delete cascade,
  item_id             uuid        not null references public.inv_items(id) on delete restrict,
  quantity_requested  numeric(18,4) not null check (quantity_requested > 0),
  quantity_dispatched numeric(18,4),
  quantity_received   numeric(18,4),
  unit_cost           numeric(18,2),
  created_at          timestamptz not null default now()
);

create index if not exists inv_transfer_lines_transfer_idx on public.inv_transfer_lines(tenant_id, transfer_id);
create index if not exists inv_transfer_lines_item_idx     on public.inv_transfer_lines(tenant_id, item_id);

-- ──────────────────────────────────────────────────────────���──────────────────
-- 11. inv_stocktakes — Physical Stock Take Session Headers
-- ─────────────────────────────────────────────────────────────────��───────────
create table if not exists public.inv_stocktakes (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null,
  project_id            uuid        not null references public.projects(id) on delete cascade,
  store_id              uuid        not null references public.inv_stores(id) on delete restrict,
  stocktake_number      text        not null,
  status                text        not null default 'open'
                          constraint inv_stocktakes_status_check
                          check (status in ('open','counting','pending_approval','completed','cancelled')),
  initiated_by          uuid        not null references public.profiles(id) on delete restrict,
  initiated_at          timestamptz not null default now(),
  completed_by          uuid        references public.profiles(id) on delete set null,
  completed_at          timestamptz,
  total_variance_value  numeric(18,2),
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint inv_stocktakes_number_tenant_uniq unique (tenant_id, stocktake_number)
);

create index if not exists inv_stocktakes_tenant_idx         on public.inv_stocktakes(tenant_id);
create index if not exists inv_stocktakes_project_store_idx  on public.inv_stocktakes(tenant_id, project_id, store_id);
create index if not exists inv_stocktakes_status_idx         on public.inv_stocktakes(tenant_id, status);

create trigger inv_stocktakes_set_updated_at
  before update on public.inv_stocktakes
  for each row execute function public.inv_set_updated_at();

-- ─────────────��────────────────────────────���────────────────────────────────��─
-- 12. inv_stocktake_lines — Per-Item Count Lines for a Stock Take
-- ───────��────────────────���────────────────────────────────────────────────────
create table if not exists public.inv_stocktake_lines (
  id               uuid        primary key default gen_random_uuid(),
  tenant_id        uuid        not null,
  stocktake_id     uuid        not null references public.inv_stocktakes(id) on delete cascade,
  item_id          uuid        not null references public.inv_items(id) on delete restrict,
  system_quantity  numeric(18,4) not null,
  counted_quantity numeric(18,4),
  variance         numeric(18,4),           -- computed by app: counted - system
  variance_percent numeric(10,4),           -- computed by app: variance / system * 100
  unit_cost        numeric(18,2),
  variance_value   numeric(18,2),           -- computed by app: variance * unit_cost
  is_approved      boolean     not null default false,
  approved_by      uuid        references public.profiles(id) on delete set null,
  approved_at      timestamptz,
  explanation      text,
  created_at       timestamptz not null default now()
);

create index if not exists inv_stocktake_lines_st_idx   on public.inv_stocktake_lines(tenant_id, stocktake_id);
create index if not exists inv_stocktake_lines_item_idx on public.inv_stocktake_lines(tenant_id, item_id);

-- ──────────────────────────────────���──────────────────────────────────────────
-- 13. inv_adjustments — Manual Stock Adjustment Headers
-- ─────────────��───────────────────────────────────���───────────────────────────
create table if not exists public.inv_adjustments (
  id                  uuid        primary key default gen_random_uuid(),
  tenant_id           uuid        not null,
  project_id          uuid        not null references public.projects(id) on delete cascade,
  store_id            uuid        not null references public.inv_stores(id) on delete restrict,
  adjustment_number   text        not null,
  reason_code         text        not null
                        constraint inv_adjustments_reason_check
                        check (reason_code in (
                          'damage','expiry','counting_error','theft_loss',
                          'correction','stocktake_reconciliation','write_off'
                        )),
  reason_description  text        not null,
  status              text        not null default 'pending_approval'
                        constraint inv_adjustments_status_check
                        check (status in ('pending_approval','approved','rejected')),
  requested_by        uuid        not null references public.profiles(id) on delete restrict,
  approved_by         uuid        references public.profiles(id) on delete set null,
  approved_at         timestamptz,
  rejection_reason    text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint inv_adjustments_number_project_uniq unique (project_id, adjustment_number)
);

create index if not exists inv_adjustments_tenant_idx   on public.inv_adjustments(tenant_id);
create index if not exists inv_adjustments_project_idx  on public.inv_adjustments(tenant_id, project_id);
create index if not exists inv_adjustments_status_idx   on public.inv_adjustments(tenant_id, status);

create trigger inv_adjustments_set_updated_at
  before update on public.inv_adjustments
  for each row execute function public.inv_set_updated_at();

-- ───────────────────────���─────────────────────────────────────────────────────
-- 14. inv_adjustment_lines — Adjustment Line Items
-- ───────────────────────────────────────────────���─────────────────────────────
create table if not exists public.inv_adjustment_lines (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null,
  adjustment_id     uuid        not null references public.inv_adjustments(id) on delete cascade,
  item_id           uuid        not null references public.inv_items(id) on delete restrict,
  quantity_before   numeric(18,4) not null,
  quantity_adjusted numeric(18,4) not null,   -- positive = increase, negative = decrease
  quantity_after    numeric(18,4) not null,
  unit_cost         numeric(18,2),
  cost_impact       numeric(18,2),             -- quantity_adjusted * unit_cost (signed)
  created_at        timestamptz not null default now()
);

create index if not exists inv_adjustment_lines_adj_idx  on public.inv_adjustment_lines(tenant_id, adjustment_id);
create index if not exists inv_adjustment_lines_item_idx on public.inv_adjustment_lines(tenant_id, item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY — Enable + Tenant Isolation on all INV tables
-- ─────���──────────────────────────���────────────────────────────���───────────────

alter table public.inv_items                  enable row level security;
alter table public.inv_stores                 enable row level security;
alter table public.inv_stock                  enable row level security;
alter table public.inv_grns                   enable row level security;
alter table public.inv_grn_lines              enable row level security;
alter table public.inv_material_requisitions  enable row level security;
alter table public.inv_mr_lines               enable row level security;
alter table public.inv_movements              enable row level security;
alter table public.inv_transfers              enable row level security;
alter table public.inv_transfer_lines         enable row level security;
alter table public.inv_stocktakes             enable row level security;
alter table public.inv_stocktake_lines        enable row level security;
alter table public.inv_adjustments            enable row level security;
alter table public.inv_adjustment_lines       enable row level security;

-- ── inv_items ────────────────────────────────────────────────────────────────
create policy "inv_items_tenant_isolation" on public.inv_items
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── inv_stores ─────────────���──────────────────────────────��──────────────────
create policy "inv_stores_tenant_isolation" on public.inv_stores
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── inv_stock ────────────���─────────────────────────────���─────────────────────
create policy "inv_stock_tenant_isolation" on public.inv_stock
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── inv_grns ─────────────────────────────────────────────────────────────────
create policy "inv_grns_tenant_isolation" on public.inv_grns
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── inv_grn_lines ──────────────���────────────────────────────��────────────────
create policy "inv_grn_lines_tenant_isolation" on public.inv_grn_lines
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── inv_material_requisitions ─────────���──────────────────────���───────────────
create policy "inv_mr_tenant_isolation" on public.inv_material_requisitions
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ��─ inv_mr_lines ───────────────────────────────────────────���─────────────────
create policy "inv_mr_lines_tenant_isolation" on public.inv_mr_lines
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── inv_movements: SELECT + INSERT only; UPDATE and DELETE blocked ────────────
-- The service layer is the only path to insert movements.
-- No authenticated user can UPDATE or DELETE movement records.
create policy "inv_movements_select" on public.inv_movements
  for select to authenticated
  using (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

create policy "inv_movements_insert" on public.inv_movements
  for insert to authenticated
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- UPDATE and DELETE are intentionally not granted — append-only ledger.

-- ── inv_transfers ────────────────────────────────────────────────────────────
create policy "inv_transfers_tenant_isolation" on public.inv_transfers
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── inv_transfer_lines ─────────────────────────────────────────────���─────────
create policy "inv_transfer_lines_tenant_isolation" on public.inv_transfer_lines
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── inv_stocktakes ─────────────��─────────────────────────────────────────────
create policy "inv_stocktakes_tenant_isolation" on public.inv_stocktakes
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── inv_stocktake_lines ────────────��─────────────────────────��───────────────
create policy "inv_stocktake_lines_tenant_isolation" on public.inv_stocktake_lines
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── inv_adjustments ─────────────���────────────────────────────────────────────
create policy "inv_adjustments_tenant_isolation" on public.inv_adjustments
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);

-- ── inv_adjustment_lines ──────────────────────────────────────────���──────────
create policy "inv_adjustment_lines_tenant_isolation" on public.inv_adjustment_lines
  for all to authenticated
  using  (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
