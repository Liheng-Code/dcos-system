-- Subcontractor Management — Critical Module #19
-- Subcontracts, sub-IPCs, back-charges, performance notices

-- ── SUBCONTRACTS ──
create table if not exists public.subcontracts (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references public.projects(id) on delete cascade,
  subcontract_no  text not null,
  vendor_id       uuid references public.procurement_suppliers(id) on delete set null,
  scope_of_work   text,
  contract_type   text not null default 'lump_sum' check (contract_type in ('lump_sum','remeasurement','cost_plus','target_price','schedule_of_rates')),
  contract_value  numeric(15,2) not null default 0,
  currency        text not null default 'USD',
  retention_pct   numeric(5,2) not null default 5.00 check (retention_pct >= 0 and retention_pct <= 20),
  retention_reduced_pct numeric(5,2) check (retention_reduced_pct >= 0 and retention_reduced_pct <= 20),
  retention_reduction_trigger text,
  advance_recovery numeric(15,2) default 0,
  performance_bond numeric(15,2) default 0,
  start_date      date,
  end_date        date,
  status          text not null default 'draft' check (status in ('draft','awarded','active','completed','terminated')),
  signed_date     date,
  completion_date date,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(project_id, subcontract_no)
);

create index if not exists idx_subcontracts_project on public.subcontracts(project_id);
create index if not exists idx_subcontracts_vendor on public.subcontracts(vendor_id);
alter table public.subcontracts enable row level security;
create policy "Authenticated users can view subcontracts"
  on public.subcontracts for select to authenticated using (true);
create policy "Authenticated users can insert subcontracts"
  on public.subcontracts for insert to authenticated with check (true);
create policy "Authenticated users can update subcontracts"
  on public.subcontracts for update to authenticated using (true) with check (true);

-- ── SUBCONTRACT ITEMS (Schedule of Rates / BOQ line items) ──
create table if not exists public.subcontract_items (
  id              uuid primary key default gen_random_uuid(),
  subcontract_id  uuid not null references public.subcontracts(id) on delete cascade,
  item_code       text not null,
  description     text,
  unit            text not null default 'ea',
  quantity        numeric(15,2) not null default 0,
  unit_rate       numeric(15,2) not null default 0,
  total_value     numeric(15,2) generated always as (quantity * unit_rate) stored,
  wbs_node_id     uuid references public.wbs_nodes(id) on delete set null,
  sort_order      integer default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_subcontract_items_sub on public.subcontract_items(subcontract_id);
alter table public.subcontract_items enable row level security;
create policy "Authenticated users can view subcontract items"
  on public.subcontract_items for select to authenticated using (true);
create policy "Authenticated users can manage subcontract items"
  on public.subcontract_items for insert to authenticated with check (true);
create policy "Authenticated users can update subcontract items"
  on public.subcontract_items for update to authenticated using (true) with check (true);

-- ── SUBCONTRACT IPCs (Interim Payment Certificates) ──
create table if not exists public.subcontract_ipcs (
  id              uuid primary key default gen_random_uuid(),
  subcontract_id  uuid not null references public.subcontracts(id) on delete cascade,
  ipc_no          text not null,
  period_start    date not null,
  period_end      date not null,
  claimed_amount  numeric(15,2) not null default 0,
  certified_amount numeric(15,2) default 0,
  retention_deducted numeric(15,2) default 0,
  advance_recovery_deducted numeric(15,2) default 0,
  back_charges_deducted numeric(15,2) default 0,
  net_payable     numeric(15,2) generated always as (
    (certified_amount - retention_deducted - advance_recovery_deducted - back_charges_deducted)
  ) stored,
  status          text not null default 'draft' check (status in ('draft','submitted','certified','paid','disputed')),
  certified_by    uuid references public.profiles(id) on delete set null,
  certified_date  date,
  paid_date       date,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(subcontract_id, ipc_no)
);

create index if not exists idx_sub_ipcs_sub on public.subcontract_ipcs(subcontract_id);
alter table public.subcontract_ipcs enable row level security;
create policy "Authenticated users can view sub-IPCs"
  on public.subcontract_ipcs for select to authenticated using (true);
create policy "Authenticated users can manage sub-IPCs"
  on public.subcontract_ipcs for insert to authenticated with check (true);
create policy "Authenticated users can update sub-IPCs"
  on public.subcontract_ipcs for update to authenticated using (true) with check (true);

-- ── SUBCONTRACT IPC MEASUREMENT ITEMS ──
create table if not exists public.subcontract_ipc_items (
  id                  uuid primary key default gen_random_uuid(),
  ipc_id              uuid not null references public.subcontract_ipcs(id) on delete cascade,
  subcontract_item_id uuid references public.subcontract_items(id) on delete set null,
  item_code           text not null,
  description         text,
  prev_quantity       numeric(15,2) not null default 0,
  current_quantity    numeric(15,2) not null default 0,
  cumulative_quantity numeric(15,2) not null default 0,
  unit_rate           numeric(15,2) not null default 0,
  current_amount      numeric(15,2) generated always as (current_quantity * unit_rate) stored,
  cumulative_amount   numeric(15,2) generated always as (cumulative_quantity * unit_rate) stored,
  created_at          timestamptz not null default now()
);

create index if not exists idx_sub_ipc_items_ipc on public.subcontract_ipc_items(ipc_id);
alter table public.subcontract_ipc_items enable row level security;
create policy "Authenticated users can view sub-IPC items"
  on public.subcontract_ipc_items for select to authenticated using (true);
create policy "Authenticated users can manage sub-IPC items"
  on public.subcontract_ipc_items for insert to authenticated with check (true);

-- ── SUBCONTRACT BACK CHARGES ──
create table if not exists public.subcontract_back_charges (
  id              uuid primary key default gen_random_uuid(),
  subcontract_id  uuid not null references public.subcontracts(id) on delete cascade,
  charge_no       text not null,
  description     text not null,
  amount          numeric(15,2) not null default 0,
  category        text not null check (category in ('defect_rectification','rework','damage','extra_service','penalty','other')),
  status          text not null default 'raised' check (status in ('raised','notified','accepted','disputed','deducted')),
  raised_date     date not null default current_date,
  accepted_date   date,
  deducted_from_ipc text,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(subcontract_id, charge_no)
);

create index if not exists idx_sub_bc_sub on public.subcontract_back_charges(subcontract_id);
alter table public.subcontract_back_charges enable row level security;
create policy "Authenticated users can view back charges"
  on public.subcontract_back_charges for select to authenticated using (true);
create policy "Authenticated users can manage back charges"
  on public.subcontract_back_charges for insert to authenticated with check (true);
create policy "Authenticated users can update back charges"
  on public.subcontract_back_charges for update to authenticated using (true) with check (true);

-- ── SUBCONTRACT PERFORMANCE NOTICES ──
create table if not exists public.subcontract_performance_notices (
  id              uuid primary key default gen_random_uuid(),
  subcontract_id  uuid not null references public.subcontracts(id) on delete cascade,
  notice_no       text not null,
  notice_type     text not null check (notice_type in ('warning','default','termination','non_conformance','improvement')),
  subject         text not null,
  description     text not null,
  issued_date     date not null default current_date,
  response_due_date date,
  response        text,
  status          text not null default 'issued' check (status in ('issued','acknowledged','resolved','escalated','closed')),
  issued_by       uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(subcontract_id, notice_no)
);

create index if not exists idx_sub_pn_sub on public.subcontract_performance_notices(subcontract_id);
alter table public.subcontract_performance_notices enable row level security;
create policy "Authenticated users can view performance notices"
  on public.subcontract_performance_notices for select to authenticated using (true);
create policy "Authenticated users can manage performance notices"
  on public.subcontract_performance_notices for insert to authenticated with check (true);
create policy "Authenticated users can update performance notices"
  on public.subcontract_performance_notices for update to authenticated using (true) with check (true);

-- ── SUBCONTRACT VARIATIONS ──
create table if not exists public.subcontract_variations (
  id              uuid primary key default gen_random_uuid(),
  subcontract_id  uuid not null references public.subcontracts(id) on delete cascade,
  variation_no    text not null,
  description     text not null,
  type            text not null check (type in ('addition','deduction','omission','change_of_method')),
  amount          numeric(15,2) not null default 0,
  status          text not null default 'draft' check (status in ('draft','submitted','approved','rejected','implemented')),
  approved_date   date,
  schedule_impact_days integer default 0,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(subcontract_id, variation_no)
);

create index if not exists idx_sub_var_sub on public.subcontract_variations(subcontract_id);
alter table public.subcontract_variations enable row level security;
create policy "Authenticated users can view subcontract variations"
  on public.subcontract_variations for select to authenticated using (true);
create policy "Authenticated users can manage subcontract variations"
  on public.subcontract_variations for insert to authenticated with check (true);
create policy "Authenticated users can update subcontract variations"
  on public.subcontract_variations for update to authenticated using (true) with check (true);
