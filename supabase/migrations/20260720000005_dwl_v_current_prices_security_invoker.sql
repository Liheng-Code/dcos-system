-- Migration: 20260720000005_dwl_v_current_prices_security_invoker.sql
-- Purpose: Correction to 20260720000003_dwl_phase1_resources.sql — the
--          dwl_v_current_prices view was created without
--          `security_invoker = true`, so Postgres defaulted it to running
--          with the view owner's privileges rather than the querying
--          user's (Supabase security advisor: security_definer_view,
--          ERROR level, flagged immediately after 20260720000003/000004
--          were applied to main). That default silently undermines the
--          tenant-isolation RLS just built for dwl_resources and
--          dwl_resource_prices — a user querying this view could see rows
--          outside their own tenant, defeating the entire purpose of
--          SOP §7 Step 1.1a. Fixing it here rather than editing the
--          already-applied 20260720000003 migration file, per the
--          forward-only rule.
-- Depends on: 20260720000003_dwl_phase1_resources.sql
-- Same view body as Step 1.2 / 20260720000003, only the WITH clause added.

create or replace view public.dwl_v_current_prices
with (security_invoker = true)
as
select distinct on (rp.resource_id)
  rp.resource_id,
  r.code,
  r.description,
  r.unit,
  rp.unit_price,
  rp.currency,
  rp.valid_from,
  rp.quote_valid_until,
  rp.source_type,
  s.name as supplier_name,
  (rp.quote_valid_until is not null
   and rp.quote_valid_until < current_date) as is_expired
from public.dwl_resource_prices rp
join public.dwl_resources r on r.id = rp.resource_id
left join public.dwl_suppliers s on s.id = rp.supplier_id
where r.is_active
order by rp.resource_id, rp.valid_from desc, rp.created_at desc;
