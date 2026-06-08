-- Procurement Module Tables — Phase 1 (MVP)

-- 1. Suppliers
create table if not exists public.procurement_suppliers (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid,
  supplier_code     text not null,
  supplier_name     text not null,
  supplier_type     text,
  contact_person    text,
  email             text,
  phone             text,
  address           text,
  tax_id            text,
  bank_name         text,
  bank_account      text,
  currency          text not null default 'USD',
  payment_terms     text,
  categories        jsonb,
  status            text not null default 'active' check (status in ('active', 'inactive', 'blacklisted', 'suspended')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 2. Purchase Requisitions
create table if not exists public.procurement_prs (
  id                  uuid primary key default gen_random_uuid(),
  pr_number           text not null,
  project_id          uuid references public.projects(id) on delete set null,
  wbs_node_id         uuid references public.wbs_nodes(id) on delete set null,
  task_id             uuid references public.wbs_tasks(id) on delete set null,
  requested_by        uuid references public.profiles(id) on delete set null,
  required_date       date,
  delivery_location   text,
  priority            text default 'normal' check (priority in ('normal', 'high', 'urgent', 'emergency')),
  budget_code         text,
  budget_checked      boolean default false,
  budget_checked_by   uuid references public.profiles(id) on delete set null,
  budget_check_notes  text,
  approval_status     text not null default 'draft' check (approval_status in ('draft', 'submitted', 'under_budget_review', 'approved', 'returned', 'rejected', 'closed', 'cancelled')),
  approved_by         uuid references public.profiles(id) on delete set null,
  approved_at         timestamptz,
  total_estimated_cost numeric,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 3. PR Items
create table if not exists public.procurement_pr_items (
  id                  uuid primary key default gen_random_uuid(),
  pr_id               uuid not null references public.procurement_prs(id) on delete cascade,
  line_no             integer not null,
  item_code           text,
  item_description    text not null,
  unit                text not null,
  quantity            numeric not null check (quantity > 0),
  estimated_unit_price numeric,
  estimated_total     numeric,
  budget_code         text,
  specification_ref   text,
  notes               text,
  created_at          timestamptz not null default now()
);

-- 4. Purchase Orders
create table if not exists public.procurement_pos (
  id                      uuid primary key default gen_random_uuid(),
  po_number               text not null,
  project_id              uuid references public.projects(id) on delete set null,
  wbs_node_id             uuid references public.wbs_nodes(id) on delete set null,
  pr_id                   uuid references public.procurement_prs(id) on delete set null,
  supplier_id             uuid not null references public.procurement_suppliers(id) on delete restrict,
  issued_date             date,
  delivery_date_expected  date,
  delivery_address        text,
  currency                text not null default 'USD',
  total_amount            numeric,
  tax_amount              numeric,
  grand_total             numeric,
  payment_terms           text,
  delivery_terms          text,
  status                  text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'issued', 'partially_delivered', 'delivered', 'closed', 'on_hold', 'cancelled')),
  approved_by             uuid references public.profiles(id) on delete set null,
  approved_at             timestamptz,
  issued_by               uuid references public.profiles(id) on delete set null,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- 5. PO Items
create table if not exists public.procurement_po_items (
  id                  uuid primary key default gen_random_uuid(),
  po_id               uuid not null references public.procurement_pos(id) on delete cascade,
  pr_item_id          uuid references public.procurement_pr_items(id) on delete set null,
  line_no             integer not null,
  item_code           text,
  item_description    text not null,
  unit                text not null,
  quantity_ordered    numeric not null check (quantity_ordered > 0),
  quantity_delivered  numeric not null default 0,
  quantity_accepted   numeric not null default 0,
  unit_price          numeric not null,
  total_price         numeric not null,
  delivery_date_expected date,
  notes               text,
  created_at          timestamptz not null default now()
);

-- 6. Delivery Notes
create table if not exists public.procurement_delivery_notes (
  id                  uuid primary key default gen_random_uuid(),
  po_id               uuid not null references public.procurement_pos(id) on delete cascade,
  supplier_id         uuid not null references public.procurement_suppliers(id) on delete restrict,
  delivery_note_ref   text,
  delivery_date       date not null,
  received_by         uuid references public.profiles(id) on delete set null,
  status              text not null default 'pending' check (status in ('pending', 'in_transit', 'delivered', 'partially_delivered', 'accepted', 'rejected')),
  remarks             text,
  attachment          text,
  created_at          timestamptz not null default now()
);

-- 7. Goods Receipts
create table if not exists public.procurement_goods_receipts (
  id                  uuid primary key default gen_random_uuid(),
  delivery_note_id    uuid not null references public.procurement_delivery_notes(id) on delete cascade,
  po_item_id          uuid not null references public.procurement_po_items(id) on delete cascade,
  quantity_received   numeric not null,
  quantity_accepted   numeric not null,
  quantity_rejected   numeric not null default 0,
  rejection_reason    text,
  inspection_result   text check (inspection_result in ('passed', 'failed', 'conditional')),
  inspected_by        uuid references public.profiles(id) on delete set null,
  inspected_at        timestamptz,
  warehouse_location  text,
  batch_lot_no        text,
  notes               text,
  created_at          timestamptz not null default now()
);

-- Enable RLS
alter table public.procurement_suppliers enable row level security;
alter table public.procurement_prs enable row level security;
alter table public.procurement_pr_items enable row level security;
alter table public.procurement_pos enable row level security;
alter table public.procurement_po_items enable row level security;
alter table public.procurement_delivery_notes enable row level security;
alter table public.procurement_goods_receipts enable row level security;

-- RLS Policies — all authenticated users can read/write (MVP; tighten later)
create policy "Authenticated users can view suppliers"
  on public.procurement_suppliers for select to authenticated using (true);
create policy "Authenticated users can insert suppliers"
  on public.procurement_suppliers for insert to authenticated with check (true);
create policy "Authenticated users can update suppliers"
  on public.procurement_suppliers for update to authenticated using (true);
create policy "Authenticated users can delete suppliers"
  on public.procurement_suppliers for delete to authenticated using (true);

create policy "Authenticated users can view PRs"
  on public.procurement_prs for select to authenticated using (true);
create policy "Authenticated users can insert PRs"
  on public.procurement_prs for insert to authenticated with check (true);
create policy "Authenticated users can update PRs"
  on public.procurement_prs for update to authenticated using (true);
create policy "Authenticated users can delete PRs"
  on public.procurement_prs for delete to authenticated using (true);

create policy "Authenticated users can view PR items"
  on public.procurement_pr_items for select to authenticated using (true);
create policy "Authenticated users can insert PR items"
  on public.procurement_pr_items for insert to authenticated with check (true);
create policy "Authenticated users can update PR items"
  on public.procurement_pr_items for update to authenticated using (true);
create policy "Authenticated users can delete PR items"
  on public.procurement_pr_items for delete to authenticated using (true);

create policy "Authenticated users can view POs"
  on public.procurement_pos for select to authenticated using (true);
create policy "Authenticated users can insert POs"
  on public.procurement_pos for insert to authenticated with check (true);
create policy "Authenticated users can update POs"
  on public.procurement_pos for update to authenticated using (true);
create policy "Authenticated users can delete POs"
  on public.procurement_pos for delete to authenticated using (true);

create policy "Authenticated users can view PO items"
  on public.procurement_po_items for select to authenticated using (true);
create policy "Authenticated users can insert PO items"
  on public.procurement_po_items for insert to authenticated with check (true);
create policy "Authenticated users can update PO items"
  on public.procurement_po_items for update to authenticated using (true);
create policy "Authenticated users can delete PO items"
  on public.procurement_po_items for delete to authenticated using (true);

create policy "Authenticated users can view delivery notes"
  on public.procurement_delivery_notes for select to authenticated using (true);
create policy "Authenticated users can insert delivery notes"
  on public.procurement_delivery_notes for insert to authenticated with check (true);
create policy "Authenticated users can update delivery notes"
  on public.procurement_delivery_notes for update to authenticated using (true);
create policy "Authenticated users can delete delivery notes"
  on public.procurement_delivery_notes for delete to authenticated using (true);

create policy "Authenticated users can view goods receipts"
  on public.procurement_goods_receipts for select to authenticated using (true);
create policy "Authenticated users can insert goods receipts"
  on public.procurement_goods_receipts for insert to authenticated with check (true);
create policy "Authenticated users can update goods receipts"
  on public.procurement_goods_receipts for update to authenticated using (true);
create policy "Authenticated users can delete goods receipts"
  on public.procurement_goods_receipts for delete to authenticated using (true);
