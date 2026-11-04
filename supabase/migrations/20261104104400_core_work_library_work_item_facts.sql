-- Construction Work Library: per-item facts for the BOQ tab (rate, build-up, activity links, BOQ use), so the tab can
-- filter and count gaps server-side ("no division", "no build-up", "no activity", "not used").
-- Read-only view over QS cost-library tables; security_invoker, so each count only covers rows the viewer can read
-- (project BOQ lines follow their project-member RLS). Additive.
create or replace view public.wl_v_work_item_facts
with (security_invoker = true) as
select
  w.id, w.code, w.name, w.description, w.unit, w.boq_section, w.csi_division_code, w.csi_section_code, w.is_active,
  r.net_direct_rate as net_rate,
  coalesce(b.n, 0)::int as buildup_lines,
  coalesce(a.n, 0)::int as activity_links,
  (coalesce(q.n, 0) + coalesce(t.n, 0))::int as boq_uses
from public.dwl_work_items w
left join public.dwl_v_work_item_rates r on r.work_item_id = w.id
left join lateral (select count(*) n from public.dwl_work_item_resources x where x.work_item_id = w.id) b on true
left join lateral (
  select count(*) n from public.plan_act_master_work_items l
  join public.plan_act_masters m on m.id = l.master_id and m.status not in ('superseded', 'archived')
  where l.work_item_id = w.id) a on true
left join lateral (select count(*) n from public.qs_boq_items x where x.dwl_work_item_id = w.id) q on true
left join lateral (select count(*) n from public.tender_boq_items x where x.dwl_work_item_id = w.id) t on true;

comment on view public.wl_v_work_item_facts is
  'Construction Work Library BOQ tab: cost items with net rate, build-up line count, current activity links and BOQ uses (security_invoker).';
grant select on public.wl_v_work_item_facts to authenticated;
