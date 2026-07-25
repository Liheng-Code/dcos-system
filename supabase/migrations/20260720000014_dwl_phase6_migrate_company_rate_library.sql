-- Migration: 20260720000014_dwl_phase6_migrate_company_rate_library.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 6 DATA
--          MIGRATION ONLY (SOP §12.1 step 5, after schema-drift
--          reconciliation done in 20260720000002):
--          company_rate_library (257 rows) / company_rate_library_lines
--          (34 rows) -> dwl_work_items / dwl_work_item_resources.
-- Depends on: 20260720000003_dwl_phase1_resources.sql,
--             20260720000006_dwl_phase2_work_items.sql
--
-- SCOPE GUARD: purely additive. company_rate_library / _lines are left
-- fully writable; no FK or column change on them here.
--
-- Live inspection 2026-07-20: mode='buildup' (9 rows) exactly matches the
-- 9 headers that have real company_rate_library_lines rows (34 lines
-- total); mode='flat' (248 rows) have NO lines. So:
--   - 9 buildup headers -> dwl_work_items with REAL multi-line recipes,
--     exploded from company_rate_library_lines.
--   - 248 flat headers -> dwl_work_items with a single synthetic
--     placeholder resource (same reconstruction pattern used for
--     unit_rate_library in 20260720000011 — see that file's header
--     comment for why a dedicated, non-shared resource per item is
--     required for correct long-term reconstruction).
--
-- company_rate_library_lines has NO unit column (schema-verified) and
-- price_list_item_code is NULL on all 34 rows (schema-verified) — so
-- resources are deduplicated by exact price_list_item_desc text (verified
-- live: every repeated description across the 34 lines carries the SAME
-- unit_price, so this is a safe, non-lossy dedup key WITHIN this source
-- only — no cross-source matching is attempted, see report). Units for
-- the 29 distinct line descriptions are hand-assigned below from reading
-- each description directly (e.g. "Cement, bag 50kg" -> bag), NOT
-- guessed algorithmically — every distinct description in the live table
-- was inspected before writing this mapping.
--
-- Idempotent: guarded by dwl_work_items provenance-marker prefix check
-- (flat + buildup headers) and by dwl_resources description-marker check
-- (deduped line resources).

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
  v_line_marker  text;
  v_sort         int;
  v_line_unit    text;
  v_cat_prefix   text;
  v_next_seq     int;
begin
  select id into v_tenant_id from public.companies where code = 'MCC';
  if v_tenant_id is null then
    raise exception 'dwl phase6 migration: no company with code = MCC found';
  end if;

  -- ═══════════════════════════════════════════════════════════════════
  -- PART A — deduplicated resources for the 9 buildup headers' 34 lines
  -- (hand-verified description -> unit mapping; category from source,
  -- 'plant' normalized to 'equipment')
  -- ═══════════════════════════════════════════════════════════════════
  for ln in
    select distinct crll.category, crll.price_list_item_desc, crll.unit_price
    from public.company_rate_library_lines crll
  loop
    v_line_marker := 'Migrated from company_rate_library_lines, desc=''' || ln.price_list_item_desc || '''';

    if exists (select 1 from public.dwl_resources where left(description, length(v_line_marker)) = v_line_marker) then
      continue;
    end if;

    v_line_unit := case ln.price_list_item_desc
      when 'Concrete block 150mm'    then 'pcs'
      when 'Cement, bag 50kg'        then 'bag'
      when 'Sand, river washed'      then 'm3'
      when 'Mason crew'              then 'hr'
      when 'Aggregate 20mm'          then 'm3'
      when 'Concrete crew'           then 'hr'
      when 'Mixer 350L'              then 'hr'
      when 'Plywood 18mm formply'    then 'sheet'
      when 'Timber support 50x100'   then 'm'
      when 'Nails and form ties'     then 'kg'
      when 'Carpenter crew'          then 'hr'
      when 'PVC conduit 20mm'        then 'm'
      when 'Cable 2.5mm2 Cu'         then 'm'
      when 'Back box, galvanised'    then 'no'
      when 'Switch, 1-gang'          then 'no'
      when 'Electrician'             then 'hr'
      when 'PPR pipe 25mm PN20'      then 'm'
      when 'PPR fittings, average'   then 'no'
      when 'Plumber'                 then 'hr'
      when 'Cable tray 200mm galv.'  then 'm'
      when 'Tray support set'        then 'set'
      when 'Plasterer crew'          then 'hr'
      when 'Rebar HD deformed'       then 'kg'
      when 'Binding wire'            then 'kg'
      when 'Steel fixer crew'        then 'hr'
      when 'Porcelain tile 600x600'  then 'm2'
      when 'Tile adhesive, bag 20kg' then 'bag'
      when 'Tile grout'              then 'kg'
      when 'Tiler crew'              then 'hr'
      else 'no' -- should not occur; all 29 live descriptions enumerated above
    end;

    v_category := case ln.category when 'plant' then 'equipment' else ln.category end;
    v_cat_prefix := case v_category when 'material' then 'MAT' when 'labor' then 'LAB' when 'equipment' then 'EQP' when 'subcon' then 'SUB' else 'GEN' end;

    select coalesce(max(
      (regexp_match(code, '^CRL-' || v_cat_prefix || '-(\d+)$'))[1]::int
    ), 0) + 1
    into v_next_seq
    from public.dwl_resources
    where code like 'CRL-' || v_cat_prefix || '-%';

    insert into public.dwl_resources (tenant_id, code, category, description, unit)
    values (
      v_tenant_id,
      'CRL-' || v_cat_prefix || '-' || lpad(v_next_seq::text, 3, '0'),
      v_category,
      v_line_marker,
      v_line_unit
    )
    returning id into v_resource_id;

    insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, source_type, notes)
    values (
      v_tenant_id, v_resource_id, ln.unit_price, 'USD', current_date, 'estimate',
      'Basis: ' || v_line_marker || '. Deduplicated across ' ||
        (select count(*) from public.company_rate_library_lines c2 where c2.price_list_item_desc = ln.price_list_item_desc)
        || ' recipe line(s) in company_rate_library_lines sharing this description (verified consistent unit_price before dedup).'
    );
  end loop;

  -- ═══════════════════════════════════════════════════════════════════
  -- PART B — the 9 buildup headers, real recipes
  -- ═══════════════════════════════════════════════════════════════════
  for r in select * from public.company_rate_library where mode = 'buildup' order by code loop
    v_provenance := 'Migrated from company_rate_library.code=''' || r.code || '''';

    if exists (
      select 1 from public.dwl_work_items
      where left(method_note, length(v_provenance)) = v_provenance
    ) then
      continue;
    end if;

    v_unit := lower(r.unit);
    v_code := r.code;
    if exists (select 1 from public.dwl_work_items where code = v_code) then
      v_code := v_code || '-CRL';
    end if;

    insert into public.dwl_work_items (tenant_id, code, boq_section, description, unit, method_note, is_active)
    values (
      v_tenant_id, v_code, 'LEGACY', r.description, v_unit,
      v_provenance || ' — buildup-mode header with a real recipe (company_rate_library_lines), migrated as-is. '
        || 'boq_section not classified during migration; flagged for QS Manager review. Original net_rate=' || r.net_rate,
      r.is_active
    )
    returning id into v_work_item_id;

    v_sort := 1;
    for ln in
      select crll.category, crll.price_list_item_desc, crll.unit_price, crll.qty_per_unit, crll.wastage_pct
      from public.company_rate_library_lines crll
      where crll.library_rate_id = r.id
      order by crll.sort_order
    loop
      v_line_marker := 'Migrated from company_rate_library_lines, desc=''' || ln.price_list_item_desc || '''';
      select id into v_resource_id from public.dwl_resources
        where left(description, length(v_line_marker)) = v_line_marker
        limit 1;

      insert into public.dwl_work_item_resources (tenant_id, work_item_id, resource_id, consumption, waste_pct, basis_note, sort_order)
      values (
        v_tenant_id, v_work_item_id, v_resource_id, ln.qty_per_unit, ln.wastage_pct / 100.0,
        v_provenance || ' — real recipe line, price_list_item_desc=''' || ln.price_list_item_desc || ''', qty_per_unit=' || ln.qty_per_unit
          || ', original wastage_pct=' || ln.wastage_pct || '%.',
        v_sort
      )
      on conflict (work_item_id, resource_id) do nothing;
      v_sort := v_sort + 1;
    end loop;
  end loop;

  -- ═══════════════════════════════════════════════════════════════════
  -- PART C — the 248 flat headers, synthetic single-resource reconstruction
  -- ═══════════════════════════════════════════════════════════════════
  for r in select * from public.company_rate_library where mode = 'flat' order by code loop
    v_provenance := 'Migrated from company_rate_library.code=''' || r.code || '''';

    if exists (
      select 1 from public.dwl_work_items
      where left(method_note, length(v_provenance)) = v_provenance
    ) then
      continue;
    end if;

    v_unit := case lower(r.unit)
      when 'ea'    then 'no'
      when 'hour'  then 'hr'
      when 't'     then 'tonne'
      when 'pc'    then 'pcs'
      when 'l'     then 'l'
      else lower(r.unit)
    end;

    v_category := case
      when r.trade = 'Labor' then 'labor'
      when r.trade = 'Plant' then 'equipment'
      else 'material'
    end;

    v_code := r.code;
    if exists (select 1 from public.dwl_work_items where code = v_code) then
      v_code := v_code || '-CRL';
    end if;

    insert into public.dwl_work_items (tenant_id, code, boq_section, description, unit, method_note, is_active)
    values (
      v_tenant_id, v_code, 'LEGACY', r.description, v_unit,
      v_provenance || ' — flat rate, no recipe breakdown available. '
        || 'boq_section not classified during migration; flagged for QS Manager review. '
        || 'Original trade=''' || coalesce(r.trade,'') || ''', discipline=''' || coalesce(r.discipline,'') || ''', '
        || 'base_rate=' || coalesce(r.base_rate::text,'NULL') || ', wastage_pct=' || coalesce(r.wastage_pct::text,'0')
        || ', productivity_factor=' || coalesce(r.productivity_factor::text,'1') || ' (recorded for reference only, not compounded).',
      r.is_active
    )
    returning id into v_work_item_id;

    insert into public.dwl_resources (tenant_id, code, category, description, unit)
    values (
      v_tenant_id, v_code || '-RATE', v_category,
      'Migrated flat-rate placeholder for ' || r.description || ' (source: company_rate_library.code=''' || r.code || '''). '
        || 'Category (' || v_category || ') heuristically inferred from trade=''' || coalesce(r.trade,'') || ''' — flagged for QS Manager review.',
      v_unit
    )
    returning id into v_resource_id;

    insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, source_type, notes)
    values (
      v_tenant_id, v_resource_id, r.net_rate, 'USD', current_date, 'estimate',
      'Basis: migrated legacy flat rate, company_rate_library.code=''' || r.code || '''. Value = original net_rate. '
        || 'base_rate=' || coalesce(r.base_rate::text,'NULL') || ', wastage_pct=' || coalesce(r.wastage_pct::text,'0')
        || '%, productivity_factor=' || coalesce(r.productivity_factor::text,'1') || ' not separately compounded (net_rate already reflects them per source schema).'
    );

    insert into public.dwl_work_item_resources (tenant_id, work_item_id, resource_id, consumption, waste_pct, basis_note, sort_order)
    values (
      v_tenant_id, v_work_item_id, v_resource_id, 1, 0,
      v_provenance || ' — flat rate, no real recipe breakdown; represented as a single placeholder resource. NOT a real consumption-based recipe.',
      1
    );
  end loop;
end $$;
