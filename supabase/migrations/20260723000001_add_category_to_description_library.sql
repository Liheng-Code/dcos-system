-- Migration: 20260723000001_add_category_to_description_library.sql
-- Purpose: Add 'category' column to qs_description_library so each description
--          can be classified as 'labor' or 'material'. This drives the split
--          in tender_price_list between labor_net_cost and material_net_cost.

alter table public.qs_description_library
  add column if not exists category text not null default 'material'
  check (category in ('labor', 'material'));

comment on column public.qs_description_library.category is
  'Classification: labour or material. Determines which rate column in tender_price_list receives the current_rate.';
