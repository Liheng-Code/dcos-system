-- Migration: 20261022170000_mdm_material_adapter.sql
-- Purpose: Add an atomic MDM apply adapter for approved MAT create requests.
-- Depends on: 20261022160000_mdm_governance_foundation.sql,
--             dwl_resources/material attributes/category tables,
--             dwl_material_fingerprint(), dwl_next_material_code().
--
-- This adapter uses the existing DWL material spine and code allocator. It
-- does not rewrite existing UUIDs/codes, alter direct DWL create flows, or
-- enable MAT request intake. CAT-001 ownership and COD-001 code decisions
-- remain drafts; request intake remains disabled until an admin enables it.
-- Direct calls to dwl_create_material() and existing direct table-write RLS
-- remain alternate, ungated creation paths; this migration deliberately does
-- not break those callers.

begin;

-- Application records the applied outcome as an immutable workflow event.
alter table public.mdm_request_events
  drop constraint if exists mdm_request_events_event_type_check;
alter table public.mdm_request_events
  add constraint mdm_request_events_event_type_check
  check (event_type in (
    'created', 'edited', 'submitted', 'review_started', 'returned', 'approved',
    'rejected', 'cancelled', 'apply_failed', 'apply_retry_authorized', 'applied'
  ));

-- The adapter implementation is installed, but incoming MAT requests stay
-- disabled. This does not promote the draft source-of-record/coding decisions.
update public.mdm_entity_registry
set adapter_status = 'ready'
where entity_code = 'MAT' and adapter_status = 'not_ready';

create or replace function public.mdm_apply_material_create(
  p_request_id uuid,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_tenant uuid;
  v_request public.mdm_change_requests%rowtype;
  v_registry public.mdm_entity_registry%rowtype;
  v_payload jsonb;
  v_category_id uuid;
  v_budget_code_id uuid;
  v_effective_date date;
  v_unit text;
  v_description text;
  v_lifecycle text;
  v_tags text[] := '{}';
  v_code text;
  v_resource_id uuid;
  v_fingerprint text;
  v_new_version integer;
  v_error_code text;
  v_key text;
begin
  select actor_id, tenant_id into v_actor, v_tenant
  from public.mdm_assert_actor_tenant();

  if p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'A positive expected request version is required';
  end if;
  if not public.has_permission('mdm', 'decision', 'approve') then
    raise exception using errcode = '42501', message = 'MDM material apply permission required';
  end if;

  select * into v_request
  from public.mdm_change_requests r
  where r.id = p_request_id and r.tenant_id = v_tenant
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'MDM request not found';
  end if;
  if v_request.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'MDM request version is stale';
  end if;
  if v_request.status <> 'approved'
     or v_request.entity_code <> 'MAT'
     or v_request.request_type <> 'create'
     or v_request.target_record_id is not null
     or v_request.project_id is not null then
    raise exception using errcode = '55000', message = 'Only approved tenant-scoped MAT create requests can be applied';
  end if;
  if v_request.requested_by is null
     or v_request.decided_by is null
     or v_request.decided_at is null
     or v_request.requested_by = v_request.decided_by
     or v_actor = v_request.requested_by then
    raise exception using errcode = '42501', message = 'MDM maker-checker separation is required';
  end if;

  select * into v_registry
  from public.mdm_entity_registry e
  where e.tenant_id = v_tenant and e.id = v_request.entity_registry_id
    and e.entity_code = 'MAT'
  for share;
  if not found or v_registry.adapter_status <> 'ready' then
    raise exception using errcode = '0A000', message = 'MAT domain adapter is not ready';
  end if;
  if v_registry.entity_scope <> 'resource'
     or v_request.schema_version <> v_registry.schema_version then
    raise exception using errcode = '22023', message = 'MAT request scope or schema version is stale';
  end if;

  v_payload := v_request.proposed_values;
  if v_payload is null or jsonb_typeof(v_payload) <> 'object'
     or pg_column_size(v_payload) > 65536 then
    raise exception using errcode = '22023', message = 'MAT payload must be a JSON object no larger than 64 KB';
  end if;

  if exists (
    select 1 from jsonb_object_keys(v_payload) as k(key)
    where k.key <> all (array[
      'category_id','description','unit','spec_reference','material_name','subcategory',
      'discipline','material_type','tech_spec_summary','standard','grade','brand','model',
      'manufacturer','package_size','dimension','thickness','weight','color_finish',
      'application_element','lifecycle_status','tags','legacy_code','notes','budget_code_id',
      'application_scope','density','compressive_strength','effective_date'
    ]::text[])
  ) then
    raise exception using errcode = '22023', message = 'MAT payload contains unsupported fields';
  end if;
  if exists (
    select 1 from jsonb_each(v_payload) as e(key, value)
    where e.key <> 'tags' and jsonb_typeof(e.value) not in ('string', 'null')
  ) then
    raise exception using errcode = '22023', message = 'MAT fields must be strings or null; tags must be a string array';
  end if;
  if v_payload ? 'tags' and jsonb_typeof(v_payload -> 'tags') <> 'array' then
    raise exception using errcode = '22023', message = 'MAT tags must be an array of strings';
  end if;
  if v_payload ? 'tags' and (
    jsonb_array_length(v_payload -> 'tags') > 64
    or exists (
      select 1 from jsonb_array_elements(v_payload -> 'tags') as t(value)
      where jsonb_typeof(t.value) <> 'string' or length(t.value #>> '{}') > 80
    )
  ) then
    raise exception using errcode = '22023', message = 'MAT tags must contain at most 64 strings of at most 80 characters';
  end if;
  if public.mdm_payload_has_forbidden_keys(v_payload) then
    raise exception using errcode = '22023', message = 'MAT payload contains system-managed or restricted fields';
  end if;

  v_description := nullif(btrim(v_payload ->> 'description'), '');
  v_unit := nullif(btrim(v_payload ->> 'unit'), '');
  if v_description is null or length(v_description) > 2000 then
    raise exception using errcode = '22023', message = 'Material description is required and must not exceed 2000 characters';
  end if;
  if v_unit is null or length(v_unit) > 80 then
    raise exception using errcode = '22023', message = 'Material unit is required and must not exceed 80 characters';
  end if;
  if v_payload ->> 'category_id' is null or btrim(v_payload ->> 'category_id') = '' then
    raise exception using errcode = '22023', message = 'Material category is required';
  end if;
  begin
    v_category_id := (v_payload ->> 'category_id')::uuid;
    if nullif(v_payload ->> 'budget_code_id', '') is not null then
      v_budget_code_id := (v_payload ->> 'budget_code_id')::uuid;
    end if;
    if nullif(v_payload ->> 'effective_date', '') is not null then
      v_effective_date := (v_payload ->> 'effective_date')::date;
    end if;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'MAT category, budget code, or effective date is invalid';
  end;

  if not exists (
    select 1 from public.dwl_material_categories c
    where c.id = v_category_id and c.is_active
  ) then
    raise exception using errcode = '22023', message = 'Material category is unavailable';
  end if;
  if v_budget_code_id is not null and not exists (
    select 1 from public.budget_codes b where b.id = v_budget_code_id
  ) then
    raise exception using errcode = '22023', message = 'Budget code is unavailable';
  end if;

  v_lifecycle := coalesce(nullif(v_payload ->> 'lifecycle_status', ''), 'active');
  if v_lifecycle not in ('draft', 'active', 'superseded', 'archived', 'obsolete') then
    raise exception using errcode = '22023', message = 'MAT lifecycle status is invalid';
  end if;
  if v_payload ? 'tags' then
    select coalesce(array_agg(t.value #>> '{}' order by t.ordinality), '{}')
      into v_tags
    from jsonb_array_elements(v_payload -> 'tags') with ordinality as t(value, ordinality);
  end if;

  -- Match DWL's exact fingerprint definition, but constrain duplicate search
  -- to the authenticated tenant. Lock identical fingerprints to serialize
  -- MDM applies; the legacy direct create RPC does not take this lock.
  v_fingerprint := public.dwl_material_fingerprint(
    v_category_id,
    nullif(v_payload ->> 'material_type', ''),
    nullif(v_payload ->> 'dimension', ''),
    nullif(v_payload ->> 'thickness', ''),
    nullif(v_payload ->> 'grade', ''),
    nullif(v_payload ->> 'compressive_strength', ''),
    nullif(v_payload ->> 'standard', ''),
    v_unit,
    coalesce(nullif(v_payload ->> 'material_name', ''), v_description)
  );
  perform pg_advisory_xact_lock(hashtextextended(v_tenant::text || '|' || v_fingerprint, 0));

  begin
    if exists (
      select 1
      from public.dwl_resources r
      left join public.dwl_material_attributes a on a.resource_id = r.id
      where r.tenant_id = v_tenant
        and r.category = 'material'
        and r.is_active
        and public.dwl_material_fingerprint(
          a.category_id, a.material_type, a.dimension, a.thickness, a.grade,
          a.compressive_strength, a.standard, r.unit,
          coalesce(a.material_name, r.description)
        ) = v_fingerprint
    ) then
      v_error_code := 'DUPLICATE_MATERIAL';
      raise exception using errcode = '23505', message = 'Exact material already exists for this tenant';
    end if;

    -- Keep the established MAT-<GROUP>-NNN code allocator and its global
    -- sequence semantics. Existing UUIDs and codes are never rewritten.
    v_code := public.dwl_next_material_code(v_category_id, nullif(v_payload ->> 'discipline', ''));
    insert into public.dwl_resources
      (tenant_id, code, category, description, unit, spec_reference, is_active, created_by)
    values
      (v_tenant, v_code, 'material', v_description, v_unit,
       nullif(v_payload ->> 'spec_reference', ''), v_lifecycle = 'active', v_actor)
    returning id into v_resource_id;

    insert into public.dwl_material_attributes (
      resource_id, tenant_id, material_name, category_id, application_element,
      discipline, standard, grade, budget_code_id, lifecycle_status,
      tech_spec_summary, application_scope, material_type, brand, manufacturer,
      dimension, thickness, density, compressive_strength, color_finish,
      effective_date, subcategory, model, package_size, weight, legacy_code,
      tags, notes, created_by, updated_by
    ) values (
      v_resource_id, v_tenant, nullif(v_payload ->> 'material_name', ''), v_category_id,
      nullif(v_payload ->> 'application_element', ''), nullif(v_payload ->> 'discipline', ''),
      nullif(v_payload ->> 'standard', ''), nullif(v_payload ->> 'grade', ''), v_budget_code_id,
      v_lifecycle, nullif(v_payload ->> 'tech_spec_summary', ''),
      nullif(v_payload ->> 'application_scope', ''), nullif(v_payload ->> 'material_type', ''),
      nullif(v_payload ->> 'brand', ''), nullif(v_payload ->> 'manufacturer', ''),
      nullif(v_payload ->> 'dimension', ''), nullif(v_payload ->> 'thickness', ''),
      nullif(v_payload ->> 'density', ''), nullif(v_payload ->> 'compressive_strength', ''),
      nullif(v_payload ->> 'color_finish', ''), v_effective_date,
      nullif(v_payload ->> 'subcategory', ''), nullif(v_payload ->> 'model', ''),
      nullif(v_payload ->> 'package_size', ''), nullif(v_payload ->> 'weight', ''),
      nullif(v_payload ->> 'legacy_code', ''), v_tags, nullif(v_payload ->> 'notes', ''),
      v_actor, v_actor
    );
  exception when others then
    if v_error_code is null then
      v_error_code := 'MDM_MAT_APPLY_FAILED';
    end if;
    update public.mdm_change_requests r
    set status = 'apply_failed',
        version = r.version + 1,
        apply_result = jsonb_build_object('error_code', v_error_code, 'retryable', v_error_code <> 'DUPLICATE_MATERIAL')
    where r.id = v_request.id
    returning r.version into v_new_version;
    insert into public.mdm_request_events
      (tenant_id, request_id, actor_id, event_type, from_status, to_status, reason, event_payload)
    values (v_tenant, v_request.id, v_actor, 'apply_failed', 'approved', 'apply_failed',
            'MAT adapter apply failed',
            jsonb_build_object('error_code', v_error_code, 'retryable', v_error_code <> 'DUPLICATE_MATERIAL'));
    return jsonb_build_object(
      'request_id', v_request.id, 'status', 'apply_failed',
      'error_code', v_error_code, 'retryable', v_error_code <> 'DUPLICATE_MATERIAL',
      'version', v_new_version
    );
  end;

  update public.mdm_change_requests r
  set status = 'applied',
      applied_by = v_actor,
      applied_at = now(),
      apply_result = jsonb_build_object('resource_id', v_resource_id, 'code', v_code),
      version = r.version + 1
  where r.id = v_request.id
  returning r.version into v_new_version;
  insert into public.mdm_request_events
    (tenant_id, request_id, actor_id, event_type, from_status, to_status, reason, event_payload)
  values (v_tenant, v_request.id, v_actor, 'applied', 'approved', 'applied', null,
          jsonb_build_object('resource_id', v_resource_id, 'code', v_code, 'adapter', 'dwl_material_v1'));

  return jsonb_build_object(
    'request_id', v_request.id, 'resource_id', v_resource_id, 'code', v_code,
    'status', 'applied', 'version', v_new_version
  );
end;
$$;

comment on function public.mdm_apply_material_create(uuid, integer) is
  'Applies an already-approved MAT create request atomically to dwl_resources '
  'and dwl_material_attributes using the existing DWL code allocator. MAT '
  'request intake is separately controlled and remains disabled by default.';

create or replace function public.mdm_retry_material_apply(
  p_request_id uuid,
  p_expected_version integer,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_tenant uuid;
  v_request public.mdm_change_requests%rowtype;
  v_new_version integer;
begin
  select actor_id, tenant_id into v_actor, v_tenant
  from public.mdm_assert_actor_tenant();
  if p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'A positive expected request version is required';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 2000 then
    raise exception using errcode = '22023', message = 'A retry reason is required';
  end if;
  if not public.has_permission('mdm', 'decision', 'approve') then
    raise exception using errcode = '42501', message = 'MDM material apply permission required';
  end if;
  select * into v_request
  from public.mdm_change_requests r
  where r.id = p_request_id and r.tenant_id = v_tenant
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'MDM request not found'; end if;
  if v_request.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'MDM request version is stale';
  end if;
  if v_request.status <> 'apply_failed'
     or v_request.entity_code <> 'MAT'
     or v_request.request_type <> 'create'
     or v_request.requested_by is null
     or v_request.decided_by is null
     or v_request.requested_by = v_request.decided_by
     or v_actor = v_request.requested_by then
    raise exception using errcode = '55000', message = 'Only a failed MAT create with maker-checker separation can be retried';
  end if;
  update public.mdm_change_requests r
  set status = 'approved',
      version = r.version + 1,
      apply_result = null
  where r.id = v_request.id
  returning r.version into v_new_version;
  insert into public.mdm_request_events
    (tenant_id, request_id, actor_id, event_type, from_status, to_status, reason, event_payload)
  values (v_tenant, v_request.id, v_actor, 'apply_retry_authorized', 'apply_failed', 'approved',
          btrim(p_reason), jsonb_build_object('version', v_new_version));
  return v_new_version;
end;
$$;

revoke all on function public.mdm_apply_material_create(uuid, integer) from public, anon;
revoke all on function public.mdm_retry_material_apply(uuid, integer, text) from public, anon;
grant execute on function public.mdm_apply_material_create(uuid, integer) to authenticated;
grant execute on function public.mdm_retry_material_apply(uuid, integer, text) to authenticated;

commit;
