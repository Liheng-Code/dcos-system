-- Structured Preliminaries & General line items (Z.* codes), tender-scoped.
-- tender_bid_summaries.preliminaries remains the authoritative flat total on the bid summary,
-- kept in sync from this table via an explicit "Recalculate" service-layer action (not a trigger).

create table if not exists public.tender_preliminaries_items (
  id              uuid primary key default gen_random_uuid(),
  tender_id       uuid not null references public.tender_register(id) on delete cascade,
  code            text not null,
  budget_code_id  uuid references public.budget_codes(id) on delete set null,
  description     text not null,
  unit            text not null default 'ea',
  quantity        numeric(15,2) not null default 0,
  rate            numeric(15,2) not null default 0,
  amount          numeric(15,2) generated always as (quantity * rate) stored,
  sort_order      integer not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique(tender_id, code)
);

create index if not exists idx_tpi_tender on public.tender_preliminaries_items(tender_id);
create index if not exists idx_tpi_budget_code on public.tender_preliminaries_items(budget_code_id);

alter table public.tender_preliminaries_items enable row level security;
create policy "Auth users can view tender preliminaries"
  on public.tender_preliminaries_items for select to authenticated using (true);
create policy "Auth users can manage tender preliminaries"
  on public.tender_preliminaries_items for insert to authenticated with check (true);
create policy "Auth users can update tender preliminaries"
  on public.tender_preliminaries_items for update to authenticated using (true) with check (true);
create policy "Auth users can delete tender preliminaries"
  on public.tender_preliminaries_items for delete to authenticated using (true);
