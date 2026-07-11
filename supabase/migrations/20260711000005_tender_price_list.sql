-- Tender Price List — tender-scoped rate build-up (labor net-cost+margin, material net-cost+margin).
-- Distinct from unit_rate_library (enterprise-wide, single flat base_rate) — Price List rows are
-- tender-specific negotiated rates tied to that tender's own BOQ via a description|unit match key.

create table if not exists public.tender_price_list (
  id                  uuid primary key default gen_random_uuid(),
  tender_id           uuid not null references public.tender_register(id) on delete cascade,
  item_code           text not null,
  section             text,
  sub_section         text,
  sub_element         text,
  description         text not null,
  unit                text not null default 'ea',
  labor_net_cost      numeric(15,2) not null default 0,
  labor_margin_pct    numeric(5,2) not null default 0,
  labor_rate          numeric(15,2) generated always as (labor_net_cost * (1 + labor_margin_pct / 100)) stored,
  material_net_cost   numeric(15,2) not null default 0,
  material_margin_pct numeric(5,2) not null default 0,
  material_rate       numeric(15,2) generated always as (material_net_cost * (1 + material_margin_pct / 100)) stored,
  total_rate          numeric(15,2) generated always as (
                         (labor_net_cost * (1 + labor_margin_pct / 100)) +
                         (material_net_cost * (1 + material_margin_pct / 100))
                       ) stored,
  basis_source        text,
  match_key           text generated always as (description || '|' || unit) stored,
  budget_code_id       uuid references public.budget_codes(id) on delete set null,
  source_unit_rate_id uuid references public.unit_rate_library(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique(tender_id, item_code)
);

create index if not exists idx_tpl_tender on public.tender_price_list(tender_id);
create index if not exists idx_tpl_match_key on public.tender_price_list(tender_id, match_key);
create index if not exists idx_tpl_budget_code on public.tender_price_list(budget_code_id);

alter table public.tender_price_list enable row level security;
create policy "Auth users can view tender price list"
  on public.tender_price_list for select to authenticated using (true);
create policy "Auth users can manage tender price list"
  on public.tender_price_list for insert to authenticated with check (true);
create policy "Auth users can update tender price list"
  on public.tender_price_list for update to authenticated using (true) with check (true);
create policy "Auth users can delete tender price list"
  on public.tender_price_list for delete to authenticated using (true);
