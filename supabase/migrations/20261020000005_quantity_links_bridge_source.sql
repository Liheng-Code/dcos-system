-- Migration: 20261020000005_quantity_links_bridge_source.sql
-- Purpose: Planning <-> QS bridge, Phase 3 (doc 21). The bridge writes its per-level quantities as ordinary
--          plan_act_quantity_links rows, so the existing BOQ provider, generation, drift check and Quantity
--          Links page use them unchanged. These columns tell bridge rows from planner-confirmed ones:
--   source         manual (planner, "Find in BOQ") | bridge_rule (Apply on QS Bridge; replaced on every apply)
--   bridge_rule_id the plan_act_qs_bridge rule that produced the row
--   metric_unit    unit of quantity x factor when the factor converts units (kg x 0.001 = t); null = BOQ unit
-- Depends on: 20261006000008_activity_boq_quantity_links.sql, 20261020000003_planning_qs_bridge.sql

alter table public.plan_act_quantity_links
  add column if not exists source text not null default 'manual',
  add column if not exists bridge_rule_id uuid references public.plan_act_qs_bridge(id) on delete set null,
  add column if not exists metric_unit text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plan_act_qlinks_source_chk') then
    alter table public.plan_act_quantity_links
      add constraint plan_act_qlinks_source_chk check (source in ('manual', 'bridge_rule'));
  end if;
end $$;

comment on column public.plan_act_quantity_links.source is
  'manual = confirmed by a planner (Find in BOQ); bridge_rule = written by QS Bridge > Apply from the bridge rules and the confirmed location map, replaced on every apply. A node/metric with manual links is never given bridge links.';
comment on column public.plan_act_quantity_links.metric_unit is
  'Unit of (BOQ quantity x factor) when the factor converts units, e.g. t for a kg rebar line x 0.001. Null = the BOQ unit.';

create index if not exists idx_plan_act_qlinks_source on public.plan_act_quantity_links(project_id, source);
