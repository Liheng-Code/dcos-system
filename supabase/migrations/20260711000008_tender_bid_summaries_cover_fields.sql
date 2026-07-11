-- Add VAT + contingency/risk percentage-basis convenience fields to tender_bid_summaries,
-- and extend the commercial build-up chain through VAT to match the Cover sheet:
-- Direct Works + Prelims + Subcontract + OH% + Profit% + Contingency + Risk = pre-VAT subtotal
-- + VAT% = Tender Price.
--
-- total_bid_price must be dropped and re-added (not ALTERed in place) because Postgres has no
-- ALTER COLUMN ... SET EXPRESSION for generated columns. contingency/risk_allowance stay the
-- authoritative flat-$ figures (per the Excel's own treatment as QS judgment, not pure formula);
-- the _pct columns are UI-convenience inputs only, not generated from the $ columns or vice versa.

alter table public.tender_bid_summaries
  add column if not exists vat_pct           numeric(5,2) not null default 0,
  add column if not exists contingency_pct   numeric(5,2),
  add column if not exists risk_pct          numeric(5,2);

alter table public.tender_bid_summaries drop column if exists total_bid_price;

alter table public.tender_bid_summaries
  add column vat_amount numeric(15,2) generated always as (
    (
      direct_cost + coalesce(preliminaries, 0) + coalesce(subcontract_cost, 0) +
      (direct_cost * overhead_pct / 100) +
      (direct_cost * profit_pct / 100) +
      coalesce(contingency, 0) + coalesce(risk_allowance, 0)
    ) * vat_pct / 100
  ) stored;

alter table public.tender_bid_summaries
  add column total_bid_price numeric(15,2) generated always as (
    (
      direct_cost + coalesce(preliminaries, 0) + coalesce(subcontract_cost, 0) +
      (direct_cost * overhead_pct / 100) +
      (direct_cost * profit_pct / 100) +
      coalesce(contingency, 0) + coalesce(risk_allowance, 0)
    ) + (
      (
        direct_cost + coalesce(preliminaries, 0) + coalesce(subcontract_cost, 0) +
        (direct_cost * overhead_pct / 100) +
        (direct_cost * profit_pct / 100) +
        coalesce(contingency, 0) + coalesce(risk_allowance, 0)
      ) * vat_pct / 100
    )
  ) stored;
