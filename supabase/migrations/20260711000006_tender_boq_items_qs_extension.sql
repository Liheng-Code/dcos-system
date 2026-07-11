-- Extend tender_boq_items with Raw Data classification + labor/material rate build-up snapshot.
-- Additive/nullable-or-defaulted only — existing rows and the existing unique(tender_id, item_code)
-- constraint are unaffected.

alter table public.tender_boq_items
  add column if not exists discipline          text,
  add column if not exists budget_code_id       uuid references public.budget_codes(id) on delete set null,
  add column if not exists building_code        text not null default 'BA',
  add column if not exists level                text not null default 'All',
  add column if not exists sub_section          text,
  add column if not exists sub_element          text,
  add column if not exists material_type        text,
  add column if not exists element_group        text,
  add column if not exists element_id           text,
  add column if not exists brand                text,
  add column if not exists supplier             text,
  add column if not exists package_name         text,
  add column if not exists actual_quantity       numeric(15,2),
  add column if not exists labor_net_cost       numeric(15,2),
  add column if not exists labor_margin_pct     numeric(5,2),
  add column if not exists material_net_cost    numeric(15,2),
  add column if not exists material_margin_pct  numeric(5,2),
  add column if not exists price_list_item_id   uuid references public.tender_price_list(id) on delete set null,
  add column if not exists rate_source          text not null default 'manual' check (rate_source in ('manual', 'price_list')),
  add column if not exists notes                text;

create index if not exists idx_tbi_budget_code on public.tender_boq_items(budget_code_id);
create index if not exists idx_tbi_level on public.tender_boq_items(tender_id, level);
create index if not exists idx_tbi_price_list_item on public.tender_boq_items(price_list_item_id);
