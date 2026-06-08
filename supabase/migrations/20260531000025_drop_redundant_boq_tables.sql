-- Drop redundant boq_ tables in favour of qs_boq_ tables
-- The QS module (qs_boq_sections, qs_boq_items, qs_budget_revisions) is the single source of truth for BOQ data.

drop table if exists public.boq_revisions cascade;
drop table if exists public.boq_items cascade;
drop table if exists public.boq_sections cascade;
