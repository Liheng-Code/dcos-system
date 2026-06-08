-- Tender Cost Estimation — Module #08
-- Tender BOQ, unit rate library, sub-quotes, risk items, bid summary

-- ── UNIT RATE LIBRARY ──
create table if not exists public.unit_rate_library (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  description     text not null,
  category        text not null check (category in ('labour','material','plant','subcontract','preliminaries','overhead','profit','other')),
  trade           text,
  unit            text not null default 'ea',
  base_rate       numeric(15,2) not null default 0,
  wastage_pct     numeric(5,2) default 0,
  productivity_factor numeric(5,2) default 1.00,
  region          text,
  project_type    text,
  effective_from  date,
  effective_to    date,
  source_project  uuid references public.projects(id) on delete set null,
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_url_category on public.unit_rate_library(category);
create index if not exists idx_url_trade on public.unit_rate_library(trade);
alter table public.unit_rate_library enable row level security;
create policy "Auth users can view unit rates"
  on public.unit_rate_library for select to authenticated using (true);
create policy "Auth users can manage unit rates"
  on public.unit_rate_library for insert to authenticated with check (true);
create policy "Auth users can update unit rates"
  on public.unit_rate_library for update to authenticated using (true) with check (true);

-- ── TENDER BOQ ──
create table if not exists public.tender_boq_items (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  section         text not null,
  item_code       text not null,
  description     text not null,
  unit            text not null default 'ea',
  quantity        numeric(15,2) not null default 0,
  unit_rate       numeric(15,2) default 0,
  total_amount    numeric(15,2) generated always as (quantity * coalesce(unit_rate, 0)) stored,
  rate_build_up   jsonb,
  wbs_node_id     uuid references public.wbs_nodes(id) on delete set null,
  sort_order      integer default 0,
  created_at      timestamptz not null default now(),
  unique(tender_id, item_code)
);

create index if not exists idx_tbi_tender on public.tender_boq_items(tender_id);
alter table public.tender_boq_items enable row level security;
create policy "Auth users can view tender BOQ"
  on public.tender_boq_items for select to authenticated using (true);
create policy "Auth users can manage tender BOQ"
  on public.tender_boq_items for insert to authenticated with check (true);
create policy "Auth users can update tender BOQ"
  on public.tender_boq_items for update to authenticated using (true) with check (true);

-- ── TENDER SUBCONTRACTOR QUOTES ──
create table if not exists public.tender_sub_quotes (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  supplier_id     uuid references public.procurement_suppliers(id) on delete set null,
  company_name    text not null,
  trade           text not null,
  quote_amount    numeric(15,2) not null default 0,
  currency        text not null default 'USD',
  scope_of_work   text,
  received_date   date not null default current_date,
  valid_until     date,
  is_preferred    boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_tsq_tender on public.tender_sub_quotes(tender_id);
alter table public.tender_sub_quotes enable row level security;
create policy "Auth users can view sub quotes"
  on public.tender_sub_quotes for select to authenticated using (true);
create policy "Auth users can manage sub quotes"
  on public.tender_sub_quotes for insert to authenticated with check (true);
create policy "Auth users can update sub quotes"
  on public.tender_sub_quotes for update to authenticated using (true) with check (true);

-- ── TENDER RISK ITEMS ──
create table if not exists public.tender_risk_items (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  risk_no         text not null,
  description     text not null,
  category        text not null check (category in ('technical','commercial','schedule','geotechnical','market','regulatory','environmental','other')),
  likelihood      text not null check (likelihood in ('very_low','low','medium','high','very_high')),
  impact          text not null check (impact in ('very_low','low','medium','high','very_high')),
  risk_score      text generated always as (
    case
      when likelihood in ('very_high','high') and impact in ('very_high','high') then 'critical'
      when likelihood in ('very_high','high') or impact in ('very_high','high') then 'high'
      when likelihood = 'medium' and impact = 'medium' then 'medium'
      else 'low'
    end
  ) stored,
  priced_amount   numeric(15,2) default 0,
  mitigation      text,
  owner           text,
  created_at      timestamptz not null default now(),
  unique(tender_id, risk_no)
);

create index if not exists idx_tri_tender on public.tender_risk_items(tender_id);
alter table public.tender_risk_items enable row level security;
create policy "Auth users can view risk items"
  on public.tender_risk_items for select to authenticated using (true);
create policy "Auth users can manage risk items"
  on public.tender_risk_items for insert to authenticated with check (true);
create policy "Auth users can update risk items"
  on public.tender_risk_items for update to authenticated using (true) with check (true);

-- ── TENDER BID SUMMARY ──
create table if not exists public.tender_bid_summaries (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  revision_no     integer not null default 1,
  direct_cost     numeric(15,2) not null default 0,
  preliminaries   numeric(15,2) default 0,
  subcontract_cost numeric(15,2) default 0,
  overhead_pct    numeric(5,2) default 10.00,
  overhead_amount numeric(15,2) generated always as (direct_cost * overhead_pct / 100) stored,
  profit_pct      numeric(5,2) default 5.00,
  profit_amount   numeric(15,2) generated always as (direct_cost * profit_pct / 100) stored,
  contingency     numeric(15,2) default 0,
  risk_allowance  numeric(15,2) default 0,
  total_bid_price numeric(15,2) generated always as (
    direct_cost + preliminaries + subcontract_cost +
    (direct_cost * overhead_pct / 100) +
    (direct_cost * profit_pct / 100) +
    contingency + risk_allowance
  ) stored,
  status          text not null default 'draft' check (status in ('draft','review','final','submitted')),
  notes           text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(tender_id, revision_no)
);

create index if not exists idx_tbs_tender on public.tender_bid_summaries(tender_id);
alter table public.tender_bid_summaries enable row level security;
create policy "Auth users can view bid summaries"
  on public.tender_bid_summaries for select to authenticated using (true);
create policy "Auth users can manage bid summaries"
  on public.tender_bid_summaries for insert to authenticated with check (true);
create policy "Auth users can update bid summaries"
  on public.tender_bid_summaries for update to authenticated using (true) with check (true);
