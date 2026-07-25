-- Migration: 20260720000012_dwl_phase6_migrate_rate_libraries.sql
-- Purpose: Direct Works Cost Library Module (QS-SOP-002) — Phase 6 DATA
--          MIGRATION ONLY (SOP §12.1 step 2): rate_libraries (244 rows)
--          -> dwl_resources + dwl_resource_prices (1 row each).
-- Depends on: 20260720000003_dwl_phase1_resources.sql
--
-- SCOPE GUARD: purely additive. No FK constraint, no existing table's RLS
-- or access is touched. rate_libraries itself is left fully writable.
--
-- rate_libraries.code is globally unique in the source (verified live
-- 2026-07-20: no internal duplicates, no collision with the 18 existing
-- dwl_resources seeded in Phase 1), so it is carried through verbatim as
-- dwl_resources.code — no disambiguation needed for THIS source. (A later
-- migration, tender_price_list_items, has 26/29 codes that collide with
-- rate_libraries codes on genuinely different real-world items — that
-- file disambiguates on its side since it runs after this one.)
--
-- dwl_resources has no `discipline` column (Phase 1 schema), so the
-- source's STR/MEP/ARC discipline is preserved in `spec_reference`
-- (repurposed for migration provenance + discipline tagging) rather than
-- dropped.
--
-- source_type: 'quotation' if valid_until is set, else 'market_survey',
-- per instruction. (Verified live: all 244 rows have valid_until set, so
-- all migrate as 'quotation'.)
--
-- Idempotent: guarded by `code` existence check (safe here because code is
-- copied verbatim and already globally unique in the source).

do $$
declare
  v_tenant_id   uuid;
  r             record;
  v_unit        text;
  v_category    text;
  v_resource_id uuid;
  v_source_type text;
begin
  select id into v_tenant_id from public.companies where code = 'MCC';
  if v_tenant_id is null then
    raise exception 'dwl phase6 migration: no company with code = MCC found';
  end if;

  for r in select * from public.rate_libraries order by discipline, code loop
    if exists (select 1 from public.dwl_resources where code = r.code) then
      continue;
    end if;

    v_unit := case lower(r.unit)
      when 'ea'   then 'no'
      when 'hour' then 'hr'
      when 't'    then 'tonne'
      when 'pc'   then 'pcs'
      when 'l'    then 'l'
      else lower(r.unit)
    end;

    v_category := case lower(r.category)
      when 'plant' then 'equipment'
      else lower(r.category)
    end;

    v_source_type := case when r.valid_until is not null then 'quotation' else 'market_survey' end;

    insert into public.dwl_resources (tenant_id, code, category, description, unit, spec_reference)
    values (
      v_tenant_id, r.code, v_category, r.description, v_unit,
      'Discipline: ' || r.discipline || '. Migrated from rate_libraries.code=''' || r.code || ''''
        || case when lower(r.unit) not in ('m','m2','m3','kg','tonne','pcs','no','set','day','hr','ls','month','l','bag','roll','sheet','trip')
                and v_unit not in ('m','m2','m3','kg','tonne','pcs','no','set','day','hr','ls','month','l','bag','roll','sheet','trip')
             then '. NOTE: unit ''' || r.unit || ''' is outside the SOP §6 D3 locked unit dictionary — flagged for QS Manager review.'
             else '' end
    )
    returning id into v_resource_id;

    insert into public.dwl_resource_prices (tenant_id, resource_id, unit_price, currency, valid_from, quote_valid_until, source_type, notes)
    values (
      v_tenant_id, v_resource_id, r.unit_price, coalesce(r.currency, 'USD'),
      coalesce(r.quote_date, r.created_at::date, current_date),
      r.valid_until, v_source_type,
      'Migrated from rate_libraries.code=''' || r.code || '''.'
        || case when r.supplier_name is not null then ' Supplier: ' || r.supplier_name || '.' else '' end
        || case when r.quote_ref is not null then ' Quote ref: ' || r.quote_ref || '.' else '' end
        || case when r.notes is not null and r.notes <> '' then ' Original notes: ' || r.notes else '' end
    );
  end loop;
end $$;
