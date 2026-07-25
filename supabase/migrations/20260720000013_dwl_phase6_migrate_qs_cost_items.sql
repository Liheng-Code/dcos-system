-- Migration: 20260720000013_dwl_phase6_migrate_qs_cost_items.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 6 DATA
--          MIGRATION ONLY (SOP §12.1 step 3): qs_cost_items (67 rows)
--          -> dwl_work_items, with labor_pct/material_pct/equipment_pct
--          exploded into dwl_work_item_resources lines against dedicated
--          synthetic dwl_resources.
-- Depends on: 20260720000003_dwl_phase1_resources.sql,
--             20260720000006_dwl_phase2_work_items.sql
--
-- SCOPE GUARD: purely additive. qs_boq_items.cost_item_id (FK to
-- qs_cost_items) is completely untouched by this file — no FK constraint
-- change, no column change on qs_cost_items or qs_boq_items here (the
-- qs_boq_items shadow column is a separate migration). qs_cost_items
-- itself is left fully writable.
--
-- Design deviation from the literal "one shared placeholder resource per
-- trade" phrasing: a %-split component (e.g. "35% labor of $320/m3") is a
-- DIFFERENT dollar value for every qs_cost_items row. dwl_v_current_prices
-- returns exactly one CURRENT price per resource_id — if many work items'
-- recipes shared one generic "Labor component (migrated)" resource, only
-- the most-recently-inserted price would remain current, silently
-- corrupting every other work item's reconstructed rate the next time any
-- one of them got a new price. To keep every migrated rate independently
-- and permanently reconstructible, each %-split component gets its OWN
-- dedicated resource (coded <work_item_code>-LAB / -MAT / -EQP), not a
-- shared one. This is flagged in the report as a known volume trade-off:
-- it can add up to ~180 synthetic resources, well past the SOP §6 D5
-- 150-300 target for REAL market resources — these are migration
-- artifacts, not real catalogue entries, and are named/noted accordingly
-- for a future consolidation pass once real Estimator recipes replace
-- them.
--
-- basis_note on every exploded line explicitly states this is a %-split
-- derivation, not a real recipe (SOP §12 Phase 6 acceptance test #2).
--
-- Idempotent: guarded by dwl_work_items provenance-marker prefix check.

do $$
declare
  v_tenant_id    uuid;
  r              record;
  v_code         text;
  v_unit         text;
  v_work_item_id uuid;
  v_resource_id  uuid;
  v_provenance   text;
  v_sort         int;
begin
  select id into v_tenant_id from public.companies where code = 'MCC';
  if v_tenant_id is null then
    raise exception 'dwl phase6 migration: no company with code = MCC found';
  end if;

  for r in select * from public.qs_cost_items order by code loop
    v_provenance := 'Migrated from qs_cost_items.code=''' || r.code || '''';

    if exists (
      select 1 from public.dwl_work_items
      where left(method_note, length(v_provenance)) = v_provenance
    ) then
      continue;
    end if;

    -- flag but do not silently skip: zero/null base_rate would make every
    -- component price $0 — still migrate the work item shell, but record
    -- the anomaly instead of fabricating a number.
    v_unit := case lower(r.unit)
      when 'ea' then 'no'
      when 'ls' then 'ls'
      when 'ton' then 'tonne'
      else lower(r.unit)
    end;

    v_code := r.code;
    if exists (select 1 from public.dwl_work_items where code = v_code) then
      v_code := v_code || '-QSC';
    end if;

    insert into public.dwl_work_items (tenant_id, code, boq_section, description, unit, method_note, is_active)
    values (
      v_tenant_id, v_code, 'LEGACY', r.description, v_unit,
      v_provenance || ' — CSI-style flat item with labor/material/equipment %-split, exploded into '
        || 'dwl_work_item_resources against dedicated per-item synthetic resources (see those lines'' basis_note). '
        || 'boq_section not classified during migration; flagged for QS Manager review. '
        || 'Original base_rate=' || coalesce(r.base_rate::text, 'NULL') || ', '
        || 'labor_pct=' || coalesce(r.labor_pct::text,'0') || ', material_pct=' || coalesce(r.material_pct::text,'0')
        || ', equipment_pct=' || coalesce(r.equipment_pct::text,'0')
        || case when coalesce(r.base_rate,0) = 0 then '. WARNING: source base_rate is null/zero — migrated components will price at $0, flagged for QS Manager correction.' else '' end,
      r.is_active
    )
    returning id into v_work_item_id;

    v_sort := 1;

    if coalesce(r.labor_pct, 0) > 0 then
      insert into public.dwl_resources (tenant_id, code, category, description, unit)
      values (v_tenant_id, v_code || '-LAB', 'labor',
        'Labor component (migrated) for ' || r.description || ' (source: qs_cost_items.code=''' || r.code || ''')', v_unit)
      returning id into v_resource_id;

      insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, source_type, notes)
      values (v_tenant_id, v_resource_id, round(coalesce(r.base_rate,0) * r.labor_pct / 100.0, 4), 'USD', current_date, 'estimate',
        'Basis: ' || r.labor_pct || '% of qs_cost_items.code=''' || r.code || ''' base_rate ' || coalesce(r.base_rate::text,'0')
        || ' — derived from a %-split, not a real market quotation.');

      insert into public.dwl_work_item_resources (tenant_id, work_item_id, resource_id, consumption, waste_pct, basis_note, sort_order)
      values (v_tenant_id, v_work_item_id, v_resource_id, 1, 0,
        v_provenance || ' — labor component derived from a ' || r.labor_pct || '% labor_pct split of base_rate, NOT a real recipe/consumption figure.',
        v_sort);
      v_sort := v_sort + 1;
    end if;

    if coalesce(r.material_pct, 0) > 0 then
      insert into public.dwl_resources (tenant_id, code, category, description, unit)
      values (v_tenant_id, v_code || '-MAT', 'material',
        'Material component (migrated) for ' || r.description || ' (source: qs_cost_items.code=''' || r.code || ''')', v_unit)
      returning id into v_resource_id;

      insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, source_type, notes)
      values (v_tenant_id, v_resource_id, round(coalesce(r.base_rate,0) * r.material_pct / 100.0, 4), 'USD', current_date, 'estimate',
        'Basis: ' || r.material_pct || '% of qs_cost_items.code=''' || r.code || ''' base_rate ' || coalesce(r.base_rate::text,'0')
        || ' — derived from a %-split, not a real market quotation.');

      insert into public.dwl_work_item_resources (tenant_id, work_item_id, resource_id, consumption, waste_pct, basis_note, sort_order)
      values (v_tenant_id, v_work_item_id, v_resource_id, 1, 0,
        v_provenance || ' — material component derived from a ' || r.material_pct || '% material_pct split of base_rate, NOT a real recipe/consumption figure.',
        v_sort);
      v_sort := v_sort + 1;
    end if;

    if coalesce(r.equipment_pct, 0) > 0 then
      insert into public.dwl_resources (tenant_id, code, category, description, unit)
      values (v_tenant_id, v_code || '-EQP', 'equipment',
        'Equipment component (migrated) for ' || r.description || ' (source: qs_cost_items.code=''' || r.code || ''')', v_unit)
      returning id into v_resource_id;

      insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, source_type, notes)
      values (v_tenant_id, v_resource_id, round(coalesce(r.base_rate,0) * r.equipment_pct / 100.0, 4), 'USD', current_date, 'estimate',
        'Basis: ' || r.equipment_pct || '% of qs_cost_items.code=''' || r.code || ''' base_rate ' || coalesce(r.base_rate::text,'0')
        || ' — derived from a %-split, not a real market quotation.');

      insert into public.dwl_work_item_resources (tenant_id, work_item_id, resource_id, consumption, waste_pct, basis_note, sort_order)
      values (v_tenant_id, v_work_item_id, v_resource_id, 1, 0,
        v_provenance || ' — equipment component derived from a ' || r.equipment_pct || '% equipment_pct split of base_rate, NOT a real recipe/consumption figure.',
        v_sort);
      v_sort := v_sort + 1;
    end if;
  end loop;
end $$;
