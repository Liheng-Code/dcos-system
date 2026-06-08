-- Procurement Module Tables — Phase 2 (RFQ / Quotations)

-- 8. RFQs
create table if not exists public.procurement_rfqs (
  id                  uuid primary key default gen_random_uuid(),
  pr_id               uuid references public.procurement_prs(id) on delete set null,
  rfq_number          text not null,
  issue_date          date,
  response_deadline   date,
  evaluation_method   text check (evaluation_method in ('lowest_price', 'weighted', 'technical_commercial')),
  status              text not null default 'draft' check (status in ('draft', 'issued', 'quotations_received', 'under_evaluation', 'awarded', 'rejected_all', 'cancelled')),
  awarded_supplier_id uuid references public.procurement_suppliers(id) on delete set null,
  award_reason        text,
  awarded_at          timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 9. RFQ Suppliers
create table if not exists public.procurement_rfq_suppliers (
  id           uuid primary key default gen_random_uuid(),
  rfq_id       uuid not null references public.procurement_rfqs(id) on delete cascade,
  supplier_id  uuid not null references public.procurement_suppliers(id) on delete cascade,
  invited_at   timestamptz not null default now(),
  responded    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique(rfq_id, supplier_id)
);

-- 10. Quotations
create table if not exists public.procurement_quotations (
  id                uuid primary key default gen_random_uuid(),
  rfq_id            uuid not null references public.procurement_rfqs(id) on delete cascade,
  supplier_id       uuid not null references public.procurement_suppliers(id) on delete cascade,
  quotation_ref     text,
  received_at       timestamptz,
  currency          text not null default 'USD',
  valid_until       date,
  payment_terms     text,
  delivery_lead_time integer,
  total_amount      numeric not null,
  technical_score   numeric,
  commercial_score  numeric,
  combined_score    numeric,
  evaluation_notes  text,
  is_awarded        boolean not null default false,
  status            text not null default 'pending' check (status in ('pending', 'evaluated', 'awarded', 'rejected')),
  attachment        text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 11. Quotation Items
create table if not exists public.procurement_quotation_items (
  id             uuid primary key default gen_random_uuid(),
  quotation_id   uuid not null references public.procurement_quotations(id) on delete cascade,
  pr_item_id     uuid references public.procurement_pr_items(id) on delete set null,
  line_no        integer not null,
  item_code      text,
  item_description text not null,
  unit           text not null,
  quantity       numeric not null check (quantity > 0),
  unit_price     numeric not null,
  total          numeric not null,
  delivery_date  date,
  created_at     timestamptz not null default now()
);

-- Add rfq_id and quotation_id to purchase_orders
alter table public.procurement_pos
  add column if not exists rfq_id uuid references public.procurement_rfqs(id) on delete set null,
  add column if not exists quotation_id uuid references public.procurement_quotations(id) on delete set null;

-- Enable RLS
alter table public.procurement_rfqs enable row level security;
alter table public.procurement_rfq_suppliers enable row level security;
alter table public.procurement_quotations enable row level security;
alter table public.procurement_quotation_items enable row level security;

-- RLS Policies
create policy "Authenticated users can view RFQs"
  on public.procurement_rfqs for select to authenticated using (true);
create policy "Authenticated users can insert RFQs"
  on public.procurement_rfqs for insert to authenticated with check (true);
create policy "Authenticated users can update RFQs"
  on public.procurement_rfqs for update to authenticated using (true);
create policy "Authenticated users can delete RFQs"
  on public.procurement_rfqs for delete to authenticated using (true);

create policy "Authenticated users can view RFQ suppliers"
  on public.procurement_rfq_suppliers for select to authenticated using (true);
create policy "Authenticated users can insert RFQ suppliers"
  on public.procurement_rfq_suppliers for insert to authenticated with check (true);
create policy "Authenticated users can update RFQ suppliers"
  on public.procurement_rfq_suppliers for update to authenticated using (true);
create policy "Authenticated users can delete RFQ suppliers"
  on public.procurement_rfq_suppliers for delete to authenticated using (true);

create policy "Authenticated users can view quotations"
  on public.procurement_quotations for select to authenticated using (true);
create policy "Authenticated users can insert quotations"
  on public.procurement_quotations for insert to authenticated with check (true);
create policy "Authenticated users can update quotations"
  on public.procurement_quotations for update to authenticated using (true);
create policy "Authenticated users can delete quotations"
  on public.procurement_quotations for delete to authenticated using (true);

create policy "Authenticated users can view quotation items"
  on public.procurement_quotation_items for select to authenticated using (true);
create policy "Authenticated users can insert quotation items"
  on public.procurement_quotation_items for insert to authenticated with check (true);
create policy "Authenticated users can update quotation items"
  on public.procurement_quotation_items for update to authenticated using (true);
create policy "Authenticated users can delete quotation items"
  on public.procurement_quotation_items for delete to authenticated using (true);
