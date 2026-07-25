-- Migration: 20260720000015_dwl_phase6_migrate_tender_unit_rates.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 6 DATA
--          MIGRATION ONLY (SOP §12.1 step 6, migrated last since this
--          trio is structurally the richest source — real recipes, not
--          %-splits): tender_unit_rates (9) / tender_unit_rate_lines (34)
--          / tender_price_list_items (29) -> dwl_work_items /
--          dwl_work_item_resources / dwl_resources + dwl_resource_prices.
-- Depends on: 20260720000003_dwl_phase1_resources.sql,
--             20260720000006_dwl_phase2_work_items.sql,
--             20260720000012_dwl_phase6_migrate_rate_libraries.sql (must
--             run first — see collision note below)
--
-- SCOPE GUARD: purely additive. tender_unit_rates, tender_unit_rate_lines,
-- tender_price_list_items, and tender_boq_items are all left fully
-- writable and untouched by any FK/column change here (the
-- tender_boq_items shadow-column backfill is a separate migration file).
--
-- Live inspection 2026-07-20: all 9 tender_unit_rates rows have real lines
-- (34 lines cover exactly all 9 headers, 0 flat-only fallback needed —
-- this source has no "no recipe" case, unlike the other four).
--
-- Code collisions (verified live before writing this file):
--  - tender_unit_rates.code collides with unit_rate_library.code on 6
--    values (UR-BLK-001, UR-CON-001, UR-FWK-001, UR-PLA-001, UR-REB-001,
--    UR-TIL-001) — unit_rate_library migrated first (20260720000011), so
--    those get disambiguated here with a '-TUR' suffix.
--  - tender_price_list_items.code collides with rate_libraries.code on
--    26/29 values, but description/unit/price comparison (done before
--    writing this file) confirms these are DIFFERENT real-world items
--    that coincidentally reuse the same "PL-xxx" code pattern (e.g.
--    PL-LAB-03 = "Steel fixer, day rate $18" in rate_libraries vs
--    "Concrete crew, hour rate $22" in tender_price_list_items) — NOT the
--    same resource re-quoted. No cross-source matching/reuse is attempted
--    for this reason; colliding codes are disambiguated here with a
--    '-TPL' suffix rather than merged.
--
-- Idempotent: dwl_resources guarded by an exact spec_reference marker
-- (tender_price_list_items.id, immutable); dwl_work_items guarded by
-- method_note provenance-marker prefix (tender_unit_rates.code).

do $$
declare
  v_tenant_id    uuid;
  r              record;
  ln             record;
  v_code         text;
  v_unit         text;
  v_category     text;
  v_resource_id  uuid;
  v_work_item_id uuid;
  v_provenance   text;
  v_marker       text;
  v_sort         int;
begin
  select id into v_tenant_id from public.companies where code = 'MCC';
  if v_tenant_id is null then
    raise exception 'dwl phase6 migration: no company with code = MCC found';
  end if;

  -- ═══════════════════════════════════════════════════════════════════
  -- PART A — tender_price_list_items -> dwl_resources + dwl_resource_prices
  -- ═══════════════════════════════════════════════════════════════════
  for r in select * from public.tender_price_list_items order by code loop
    v_marker := 'Migrated from tender_price_list_items.id=''' || r.id || '''';

    if exists (select 1 from public.dwl_resources where spec_reference = v_marker) then
      continue;
    end if;

    v_unit := case lower(r.unit)
      when 'ea'   then 'no'
      when 'hour' then 'hr'
      when 'pc'   then 'pcs'
      when 'l'    then 'l'
      else lower(r.unit)
    end;
    v_category := case r.category when 'plant' then 'equipment' else r.category end;

    v_code := r.code;
    if exists (select 1 from public.dwl_resources where code = v_code) then
      v_code := v_code || '-TPL';
    end if;

    insert into public.dwl_resources (tenant_id, code, category, description, unit, spec_reference)
    values (v_tenant_id, v_code, v_category, r.description, v_unit, v_marker)
    returning id into v_resource_id;

    insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, quote_valid_until, source_type, notes)
    values (
      v_tenant_id, v_resource_id, r.unit_price, coalesce(r.currency, 'USD'),
      coalesce(r.quote_date, r.created_at::date, current_date), r.valid_until, 'quotation',
      'Migrated from tender_price_list_items.code=''' || r.code || ''' (row id=' || r.id || ').'
        || case when r.supplier_name is not null then ' Supplier: ' || r.supplier_name || '.' else '' end
        || case when r.quote_ref is not null then ' Quote ref: ' || r.quote_ref || '.' else '' end
        || case when r.notes is not null and r.notes <> '' then ' Original notes: ' || r.notes else '' end
    );
  end loop;

  -- ═══════════════════════════════════════════════════════════════════
  -- PART B — tender_unit_rates -> dwl_work_items,
  --          tender_unit_rate_lines -> dwl_work_item_resources
  -- ═══════════════════════════════════════════════════════════════════
  for r in select * from public.tender_unit_rates order by code loop
    v_provenance := 'Migrated from tender_unit_rates.code=''' || r.code || '''';

    if exists (
      select 1 from public.dwl_work_items
      where left(method_note, length(v_provenance)) = v_provenance
    ) then
      continue;
    end if;

    v_unit := case lower(r.unit) when 'ea' then 'no' else lower(r.unit) end;

    v_code := r.code;
    if exists (select 1 from public.dwl_work_items where code = v_code) then
      v_code := v_code || '-TUR';
    end if;

    insert into public.dwl_work_items (tenant_id, code, boq_section, description, unit, method_note, is_active)
    values (
      v_tenant_id, v_code, 'LEGACY', r.description, v_unit,
      v_provenance || ' — real recipe (tender_unit_rate_lines), migrated as-is. '
        || 'boq_section not classified during migration; flagged for QS Manager review. Original net_rate=' || r.net_rate,
      r.is_active
    )
    returning id into v_work_item_id;

    v_sort := 1;
    for ln in
      select turl.qty_per_unit, turl.wastage_pct, turl.price_list_item_id
      from public.tender_unit_rate_lines turl
      where turl.unit_rate_id = r.id
      order by turl.sort_order
    loop
      select id into v_resource_id from public.dwl_resources
        where spec_reference = 'Migrated from tender_price_list_items.id=''' || ln.price_list_item_id || '''';

      insert into public.dwl_work_item_resources (tenant_id, work_item_id, resource_id, consumption, waste_pct, basis_note, sort_order)
      values (
        v_tenant_id, v_work_item_id, v_resource_id, ln.qty_per_unit, ln.wastage_pct / 100.0,
        v_provenance || ' — real recipe line from tender_unit_rate_lines, price_list_item_id=' || ln.price_list_item_id
          || ', qty_per_unit=' || ln.qty_per_unit || ', original wastage_pct=' || ln.wastage_pct || '%.',
        v_sort
      )
      on conflict (work_item_id, resource_id) do nothing;
      v_sort := v_sort + 1;
    end loop;
  end loop;
end $$;
