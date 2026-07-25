-- Migration: 20260720000011_dwl_phase6_migrate_unit_rate_library.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 6 DATA
--          MIGRATION ONLY (SOP §12.1 step 1): unit_rate_library (7 rows)
--          -> dwl_work_items.
-- Depends on: 20260720000003_dwl_phase1_resources.sql,
--             20260720000006_dwl_phase2_work_items.sql
--
-- SCOPE GUARD: this migration does NOT touch tender_boq_items.unit_rate_id,
-- qs_boq_items.cost_item_id, or any existing FK constraint. It does NOT
-- freeze or revoke access on unit_rate_library. It is purely additive:
-- new dwl_work_items/dwl_resources/dwl_resource_prices rows only.
--
-- unit_rate_library has no line-level breakdown table — every row is a
-- flat composite rate (e.g. "C25/30 concrete in slab, incl. place &
-- vibrate" at one base_rate). There is no real recipe to reconstruct, so
-- each row becomes:
--   1 dwl_work_items row (boq_section = 'LEGACY' — not classified into the
--     01-08 BOQ scheme during migration; flagged for QS Manager review)
--   1 dwl_resources row: a dedicated, uniquely-coded placeholder resource
--     representing "this legacy rate as a single bulk line" — NOT shared
--     across items, so each item's price remains independently
--     reconstructible via dwl_v_current_prices (a shared/generic resource
--     would only be able to hold ONE current price, corrupting all but the
--     most-recently-migrated item's rate — see report).
--   1 dwl_resource_prices row: unit_price = base_rate literally (wastage_pct
--     and productivity_factor are recorded in notes but NOT compounded into
--     the price, since the original app's exact compounding formula is not
--     known and should not be guessed).
--   1 dwl_work_item_resources row: consumption=1, waste_pct=0, so
--     dwl_v_work_item_rates.net_direct_rate reconstructs to exactly
--     base_rate.
--
-- Code collisions: unit_rate_library.code and tender_unit_rates.code share
-- 6 identical values (UR-BLK-001, UR-CON-001, UR-FWK-001, UR-PLA-001,
-- UR-REB-001, UR-TIL-001) verified live 2026-07-20. This file runs FIRST
-- (SOP §12.1 repoint order step 1), so it always gets the plain code;
-- tender_unit_rates (migrated later) gets the disambiguated suffix. No
-- collision is possible here on a fresh run since dwl_work_items currently
-- contains only '03.02.010'.
--
-- Idempotent: each source row is guarded by checking whether a
-- dwl_work_items row already carries this row's exact provenance marker
-- (method_note prefix) before inserting — re-running this file is a safe
-- no-op.

do $$
declare
  v_tenant_id   uuid;
  r             record;
  v_code        text;
  v_unit        text;
  v_category    text;
  v_resource_id uuid;
  v_work_item_id uuid;
  v_provenance  text;
begin
  select id into v_tenant_id from public.companies where code = 'MCC';
  if v_tenant_id is null then
    raise exception 'dwl phase6 migration: no company with code = MCC found';
  end if;

  for r in select * from public.unit_rate_library order by code loop
    v_provenance := 'Migrated from unit_rate_library.code=''' || r.code || '''';

    -- idempotency guard: skip if this exact source row was already migrated
    if exists (
      select 1 from public.dwl_work_items
      where left(method_note, length(v_provenance)) = v_provenance
    ) then
      continue;
    end if;

    -- unit normalization towards SOP §6 D3 locked dictionary
    v_unit := case lower(r.unit)
      when 'ea'   then 'no'
      when 'hour' then 'hr'
      when 'ton'  then 'tonne'
      when 'pc'   then 'pcs'
      when 'l'    then 'l'
      else lower(r.unit)
    end;

    -- category normalization (British spelling / legacy synonyms)
    v_category := case lower(r.category)
      when 'labour' then 'labor'
      when 'plant'  then 'equipment'
      else lower(r.category)
    end;

    -- code disambiguation (none expected on this first-mover source, but
    -- guard anyway for safety / re-run correctness)
    v_code := r.code;
    if exists (select 1 from public.dwl_work_items where code = v_code) then
      v_code := v_code || '-URL';
    end if;

    insert into public.dwl_work_items (tenant_id, code, boq_section, description, unit, method_note)
    values (
      v_tenant_id, v_code, 'LEGACY', r.description, v_unit,
      v_provenance || ' — flat rate, no recipe breakdown available. '
        || 'boq_section not classified during migration; flagged for QS Manager review. '
        || 'Original trade=''' || coalesce(r.trade, '') || ''', '
        || 'wastage_pct=' || coalesce(r.wastage_pct::text, '0') || ', '
        || 'productivity_factor=' || coalesce(r.productivity_factor::text, '1')
        || ' (recorded for reference only, not compounded into the migrated price).'
    )
    returning id into v_work_item_id;

    insert into public.dwl_resources (tenant_id, code, category, description, unit)
    values (
      v_tenant_id, v_code || '-RATE', v_category,
      'Migrated flat-rate placeholder for ' || r.description || ' (source: unit_rate_library.code=''' || r.code || ''')',
      v_unit
    )
    returning id into v_resource_id;

    insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, source_type, notes)
    values (
      v_tenant_id, v_resource_id, r.base_rate, 'USD', current_date, 'estimate',
      'Basis: migrated legacy flat rate, unit_rate_library.code=''' || r.code || '''. '
        || 'Original wastage_pct=' || coalesce(r.wastage_pct::text, '0') || '%, '
        || 'productivity_factor=' || coalesce(r.productivity_factor::text, '1')
        || ' — not compounded into this price (original formula unknown); refer to unit_rate_library for full detail.'
    );

    insert into public.dwl_work_item_resources (tenant_id, work_item_id, resource_id, consumption, waste_pct, basis_note, sort_order)
    values (
      v_tenant_id, v_work_item_id, v_resource_id, 1, 0,
      v_provenance || ' — flat rate, no real recipe breakdown; represented as a single placeholder resource. NOT a real consumption-based recipe.',
      1
    );
  end loop;
end $$;
