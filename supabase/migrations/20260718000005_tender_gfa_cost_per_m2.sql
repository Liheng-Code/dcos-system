-- Migration: 20260718000005_tender_gfa_cost_per_m2.sql
-- Purpose: Light-weight Cost/m2 support at the pre-contract (tender) phase, per
--          DCOS-QS-GDL-001 V1.1 (docs/03-Business-Modules/12-Quantity-Surveying/
--          04-GFA-Site-Area-Cost-per-m2-Design.md §9 "Rollout Phases", tender extension).
--
-- Deliberately lighter than the live-project version (wbs_node_quantities +
-- elemental_category): tender_boq_items.level is a free-text field, not a real
-- wbs_node_id (boq-tab.tsx has no WBS picker), so there is no per-level GFA
-- granularity to split against yet. This adds a single GFA figure per tender,
-- matching the tender's existing single "All" level BOQ structure.
--
-- Depends on: tender_register (20260531000054_tender_management.sql)

alter table public.tender_register
  add column if not exists gfa_total  numeric(14,2),
  add column if not exists gfa_source text;

comment on column public.tender_register.gfa_total is
  'Gross Floor Area for the tender, entered once (not per-level) per DCOS-QS-GDL-001 §3. Denominator for the blended tender $/m2 rate.';
comment on column public.tender_register.gfa_source is
  'Drawing/document reference the GFA figure was read from (e.g. "A-101 Rev B") — GFA is entered, never derived (§3 Non-Negotiable Rule 1).';
