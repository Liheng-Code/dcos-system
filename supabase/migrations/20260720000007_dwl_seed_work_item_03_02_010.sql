-- Migration: 20260720000007_dwl_seed_work_item_03_02_010.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 2 Step 2.4,
--          seed the ONE reference/validation work item the SOP gives real
--          numbers for: 03.02.010 - Vibrated concrete C30 in columns, per m³.
-- Depends on: 20260720000006_dwl_phase2_work_items.sql,
--             20260720000004_dwl_seed_starter_catalogue.sql (M-CON-001,
--             E-PMP-001, L-GEN-001, L-MAS-001, E-VIB-001, M-CUR-001,
--             S-TST-001 must already exist as dwl_resources rows)
--
-- Scope note: this migration seeds ONLY 03.02.010. The SOP §8 Step 2.4
-- also calls for building "the remaining top-20 items ... from the
-- estimators' existing Excel build-ups (§5)" — that source data does not
-- exist anywhere in this repo (SOP §5 Prerequisite 4 requires real
-- Estimator rate build-up sheets as the source). Fabricating plausible
-- consumption/productivity numbers for those items would misrepresent
-- invented figures as real business data used for actual project costing,
-- so they are deliberately NOT built here. This is an explicit open
-- blocker, not an oversight — see the accompanying report.
--
-- Consumption/waste/basis_note values below are copied exactly from the
-- SOP §8 Step 2.4 table, unaltered.
--
-- Idempotent: work item inserted with `on conflict (code) do nothing`;
-- recipe lines inserted only if not already present for that work item
-- (unique (work_item_id, resource_id) also guards this), so re-running is
-- a safe no-op.

do $$
declare
  v_tenant_id uuid;
  v_work_item_id uuid;
begin
  select id into v_tenant_id from public.companies where code = 'MCC';

  if v_tenant_id is null then
    raise exception 'dwl seed: no company with code = MCC found — cannot determine tenant_id';
  end if;

  -- ── Work item ────────────────────────────────────────────────────────
  insert into public.dwl_work_items (tenant_id, code, boq_section, description, unit, method_note)
  values (
    v_tenant_id,
    '03.02.010',
    '03',
    'Vibrated concrete C30 in columns, per m3. Incl. supply and pump placement of ready-mix concrete, '
      || 'placing labor, mechanical vibration, curing compound, and standard cube testing. '
      || 'Excl. formwork and rebar - measured separately.',
    'm3',
    'Pump placement'
  )
  on conflict (code) do nothing;

  select id into v_work_item_id from public.dwl_work_items where code = '03.02.010';

  -- ── Recipe lines (SOP §8 Step 2.4 table, values unaltered) ─────────────
  insert into public.dwl_work_item_resources
    (tenant_id, work_item_id, resource_id, consumption, waste_pct, basis_note, sort_order)
  select v_tenant_id, v_work_item_id, r.id, v.consumption, v.waste_pct, v.basis_note, v.sort_order
  from (values
    ('M-CON-001', 1.00::numeric, 0.03::numeric, 'Spillage + column over-pour, site records', 1),
    ('E-PMP-001', 1.00,          0.00,           'Supplier rate incl. operator',              2),
    ('L-GEN-001', 0.20,          0.00,           'Gang of 6 places 30 m3/day',                 3),
    ('L-MAS-001', 0.03,          0.00,           '1 finisher per gang',                        4),
    ('E-VIB-001', 0.04,          0.00,           '1 vibrator per gang',                        5),
    ('M-CUR-001', 0.40,          0.00,           'Column surface area basis',                  6),
    ('S-TST-001', 0.02,          0.00,           '1 set per 50 m3 per spec',                   7)
  ) as v(code, consumption, waste_pct, basis_note, sort_order)
  join public.dwl_resources r on r.code = v.code and r.tenant_id = v_tenant_id
  where not exists (
    select 1 from public.dwl_work_item_resources wir
    where wir.work_item_id = v_work_item_id and wir.resource_id = r.id
  );
end $$;
