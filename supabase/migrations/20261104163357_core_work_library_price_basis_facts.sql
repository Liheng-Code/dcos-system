-- Construction Work Library: price basis on the BOQ tab (2026-11-04).
--
-- An item can have a net rate and still be priced from weak data. Two counts per item, over its build-up lines at
-- the current price (dwl_v_current_prices):
--   estimate_price_lines  the current price is an estimate (source_type 'estimate': legacy flat rates migrated from
--                         the company rate library, or a % of a base rate), not a quotation or market survey
--   expired_price_lines   the current price is a quotation past its quote_valid_until
-- Informational only: they do not count as compliance gaps. Columns are appended, so existing readers are unchanged.
create or replace view public.wl_v_work_item_facts
with (security_invoker = true) as
select
  w.id, w.code, w.name, w.description, w.unit, w.boq_section, w.csi_division_code, w.csi_section_code, w.is_active,
  r.net_direct_rate as net_rate,
  coalesce(b.n, 0)::int as buildup_lines,
  coalesce(a.n, 0)::int as activity_links,
  (coalesce(q.n, 0) + coalesce(t.n, 0))::int as boq_uses,
  coalesce(p.estimate, 0)::int as estimate_price_lines,
  coalesce(p.expired, 0)::int as expired_price_lines
from public.dwl_work_items w
left join public.dwl_v_work_item_rates r on r.work_item_id = w.id
left join lateral (select count(*) n from public.dwl_work_item_resources x where x.work_item_id = w.id) b on true
left join lateral (
  select count(*) n from public.plan_act_master_work_items l
  join public.plan_act_masters m on m.id = l.master_id and m.status not in ('superseded', 'archived')
  where l.work_item_id = w.id) a on true
left join lateral (select count(*) n from public.qs_boq_items x where x.dwl_work_item_id = w.id) q on true
left join lateral (select count(*) n from public.tender_boq_items x where x.dwl_work_item_id = w.id) t on true
left join lateral (
  select count(*) filter (where cp.source_type = 'estimate') estimate,
         count(*) filter (where cp.is_expired) expired
  from public.dwl_work_item_resources x
  join public.dwl_v_current_prices cp on cp.resource_id = x.resource_id
  where x.work_item_id = w.id) p on true;

comment on view public.wl_v_work_item_facts is
  'Construction Work Library BOQ tab: cost items with net rate, build-up line count, current activity links, BOQ uses and price basis (estimate / expired quote lines) (security_invoker).';
grant select on public.wl_v_work_item_facts to authenticated;
