-- Rebase overhead_amount/profit_amount from direct_cost-only to (direct_cost + preliminaries).
-- Verified against a real contractor's tender Cover sheet: Overhead% and Profit% are applied to
-- Direct Works + Preliminaries combined, not Direct Works alone. subcontract_cost/contingency/
-- risk_allowance remain added to the pre-VAT subtotal after OH%/Profit%, not part of their base
-- (the source workbook has no subcontract line, so this is the conservative choice).
--
-- All four columns must be dropped and re-added (Postgres has no ALTER COLUMN ... SET EXPRESSION),
-- and each must fully inline the (direct_cost + preliminaries) base per the no-nested-generated-
-- column rule established in 20260711000008.

alter table public.tender_bid_summaries drop column if exists total_bid_price;
alter table public.tender_bid_summaries drop column if exists vat_amount;
alter table public.tender_bid_summaries drop column if exists overhead_amount;
alter table public.tender_bid_summaries drop column if exists profit_amount;

alter table public.tender_bid_summaries
  add column overhead_amount numeric(15,2) generated always as (
    (direct_cost + coalesce(preliminaries, 0)) * overhead_pct / 100
  ) stored;

alter table public.tender_bid_summaries
  add column profit_amount numeric(15,2) generated always as (
    (direct_cost + coalesce(preliminaries, 0)) * profit_pct / 100
  ) stored;

alter table public.tender_bid_summaries
  add column vat_amount numeric(15,2) generated always as (
    (
      (direct_cost + coalesce(preliminaries, 0)) + coalesce(subcontract_cost, 0) +
      ((direct_cost + coalesce(preliminaries, 0)) * overhead_pct / 100) +
      ((direct_cost + coalesce(preliminaries, 0)) * profit_pct / 100) +
      coalesce(contingency, 0) + coalesce(risk_allowance, 0)
    ) * vat_pct / 100
  ) stored;

alter table public.tender_bid_summaries
  add column total_bid_price numeric(15,2) generated always as (
    (
      (direct_cost + coalesce(preliminaries, 0)) + coalesce(subcontract_cost, 0) +
      ((direct_cost + coalesce(preliminaries, 0)) * overhead_pct / 100) +
      ((direct_cost + coalesce(preliminaries, 0)) * profit_pct / 100) +
      coalesce(contingency, 0) + coalesce(risk_allowance, 0)
    ) + (
      (
        (direct_cost + coalesce(preliminaries, 0)) + coalesce(subcontract_cost, 0) +
        ((direct_cost + coalesce(preliminaries, 0)) * overhead_pct / 100) +
        ((direct_cost + coalesce(preliminaries, 0)) * profit_pct / 100) +
        coalesce(contingency, 0) + coalesce(risk_allowance, 0)
      ) * vat_pct / 100
    )
  ) stored;
