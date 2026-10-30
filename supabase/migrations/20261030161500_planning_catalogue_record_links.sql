-- Migration: 20261030161500_planning_catalogue_record_links.sql
-- Purpose: Link project records to the Planning requirement catalogues, so "what an activity needs" (Activity
--          Database: shop drawing types, method statements, T&C items) can be checked against "what was done":
--            submittal_packages.shop_drawing_type_id  -> plan_act_shop_drawing_types  (Document Control submittal)
--            submittal_packages.method_statement_id   -> plan_act_method_statements   (method statement submittal)
--            itp_items.tc_item_id                     -> plan_act_tc_items            (QA/QC ITP line)
-- Depends on: submittal_packages, itp_items, plan_act_shop_drawing_types, plan_act_method_statements,
--             plan_act_tc_items (all exist)
-- Additive only: nullable columns + indexes. RLS of the record tables is unchanged; the catalogues are readable by
-- every authenticated user (20261023125542).

alter table public.submittal_packages
  add column if not exists shop_drawing_type_id uuid references public.plan_act_shop_drawing_types(id) on delete set null,
  add column if not exists method_statement_id uuid references public.plan_act_method_statements(id) on delete set null;

alter table public.itp_items
  add column if not exists tc_item_id uuid references public.plan_act_tc_items(id) on delete set null;

create index if not exists submittal_packages_shop_drawing_type_id_idx on public.submittal_packages (shop_drawing_type_id);
create index if not exists submittal_packages_method_statement_id_idx on public.submittal_packages (method_statement_id);
create index if not exists itp_items_tc_item_id_idx on public.itp_items (tc_item_id);

comment on column public.submittal_packages.shop_drawing_type_id is
  'Planning shop drawing type this submittal fulfils (plan_act_shop_drawing_types); set for submittal_type shop_drawing.';
comment on column public.submittal_packages.method_statement_id is
  'Planning method statement this submittal fulfils (plan_act_method_statements); set for submittal_type method_statement.';
comment on column public.itp_items.tc_item_id is
  'Planning testing & commissioning item this ITP line comes from (plan_act_tc_items).';
