-- Migration: 20261022160000_mdm_governance_foundation.sql
-- Purpose: Add tenant-scoped MDM request governance, audit events, and lifecycle RPCs.
-- Depends on: companies, profiles.company_id/custom_access_token_hook, projects,
--             role_permissions, roles, has_permission(text,text,text), set_updated_at().
--
-- Scope note: projects has no tenant/company column in the current schema. This
-- foundation therefore rejects project-scoped requests until project ownership
-- can be validated from a durable database relationship. No domain table is
-- read for snapshots or modified by this migration. No adapter is activated.

begin;

create table public.mdm_entity_registry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete restrict,
  entity_code text not null check (entity_code ~ '^[A-Z][A-Z0-9]{1,7}$'),
  display_name text not null check (length(btrim(display_name)) between 1 and 120),
  entity_scope text not null check (entity_scope in ('tenant', 'project', 'resource', 'platform_reference', 'transaction_reference')),
  owner_function text,
  consumer_modules text[] not null default '{}',
  request_enabled boolean not null default false,
  adapter_status text not null default 'not_ready' check (adapter_status in ('not_ready', 'ready')),
  schema_version integer not null default 1 check (schema_version > 0),
  config_version integer not null default 1 check (config_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, entity_code),
  unique (tenant_id, id)
);

create index mdm_entity_registry_tenant_idx on public.mdm_entity_registry(tenant_id);
create trigger mdm_entity_registry_set_updated_at
  before update on public.mdm_entity_registry
  for each row execute function public.set_updated_at();

-- CAT-001 draft metadata is visible to tenants, but every row starts disabled.
-- Ownership/scope values here mirror the draft catalogue; they are not an
-- owner ratification and do not activate a domain adapter.
create or replace function public.mdm_seed_registry_for_tenant(p_tenant_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.mdm_entity_registry
    (tenant_id, entity_code, display_name, entity_scope, owner_function, request_enabled, adapter_status)
  select p_tenant_id, x.entity_code, x.display_name, x.entity_scope, x.owner_function, false, 'not_ready'
  from (values
    ('ORG','Organization','tenant','Corporate Administration'),
    ('COM','Company / Tenant','tenant','Corporate Administration / IT'),
    ('BUS','Business Unit','tenant','Corporate Administration'),
    ('DEP','Department','tenant','HR / Corporate Administration'),
    ('TEAM','Team','tenant','HR'),
    ('POS','Position','tenant','HR'),
    ('PER','Person','tenant','HR / Data Governance'),
    ('USR','System User','tenant','IT / Security'),
    ('EMP','Employee','tenant','HR'),
    ('PRJ','Project','project','Project Controls'),
    ('PHA','Project Phase','project','Project Controls'),
    ('WBS','WBS Node','project','Project Controls'),
    ('TSK','Task Template','resource','Construction / Planning'),
    ('BLD','Building','project','Project Controls / Design'),
    ('LVL','Level','project','Project Controls / Design'),
    ('ZON','Zone','project','Project Controls / Design'),
    ('ROM','Room / Space','project','Design / Facility Management'),
    ('LOC','Location','project','Project Controls / Logistics'),
    ('RMT','Room Template','resource','Design / Facility Management'),
    ('ELM','Element Template','resource','Design / BIM / Engineering'),
    ('PAR','Business Party','tenant','Corporate / Finance'),
    ('SUP','Supplier Role','tenant','Procurement'),
    ('SUB','Subcontractor Role','tenant','Subcontract Management'),
    ('CUS','Customer / Client Role','tenant','Commercial / Business Development'),
    ('CON','Consultant / Contractor Role','tenant','Project / Procurement'),
    ('MAT','Material / Resource','resource','Engineering / QS / Procurement'),
    ('MATS','Material Specification','resource','Engineering / QA/QC'),
    ('EQT','Equipment Type','resource','Plant / Engineering'),
    ('AST','Equipment Asset','tenant','Plant / Asset Management'),
    ('LAB','Labor Resource Type','resource','HR / Planning / QS'),
    ('CST','Cost Code','tenant','Finance / QS'),
    ('BOQ','BOQ Classification','tenant','QS'),
    ('UOM','Unit of Measure','platform_reference','QS / Data Governance'),
    ('CUR','Currency','platform_reference','Finance'),
    ('TAX','Tax Category','tenant','Finance / Tax'),
    ('DIS','Discipline','platform_reference','Engineering / Data Governance'),
    ('DOC','Document Type','tenant','Document Control'),
    ('WHS','Warehouse / Store','project','Inventory / Logistics'),
    ('CTR','Contract Type','tenant','Commercial / Legal'),
    ('HSE','HSE Classification','tenant','HSE'),
    ('QAC','QA/QC Classification','tenant','Quality')
  ) as x(entity_code, display_name, entity_scope, owner_function)
  on conflict (tenant_id, entity_code) do nothing;
$$;

create or replace function public.mdm_seed_registry_on_company_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.mdm_seed_registry_for_tenant(new.id);
  return new;
end;
$$;

create trigger mdm_seed_registry_after_company_insert
  after insert on public.companies
  for each row execute function public.mdm_seed_registry_on_company_insert();

select public.mdm_seed_registry_for_tenant(c.id) from public.companies c;

create table public.mdm_registry_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete restrict,
  entity_code text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type = 'request_intake_toggled'),
  prior_enabled boolean not null,
  new_enabled boolean not null,
  config_version integer not null check (config_version > 0),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, entity_code)
    references public.mdm_entity_registry(tenant_id, entity_code) on delete restrict
);

create index mdm_registry_events_tenant_idx on public.mdm_registry_events(tenant_id);
create index mdm_registry_events_entity_idx on public.mdm_registry_events(tenant_id, entity_code, created_at desc);

create table public.mdm_change_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  entity_registry_id uuid not null,
  entity_code text not null,
  request_type text not null check (request_type in ('create', 'update', 'deactivate', 'merge')),
  target_record_id uuid,
  base_snapshot jsonb,
  proposed_values jsonb not null check (jsonb_typeof(proposed_values) = 'object'),
  schema_version integer not null check (schema_version > 0),
  reason text not null check (length(btrim(reason)) between 1 and 2000),
  effective_at date,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'under_review', 'returned', 'approved', 'apply_failed', 'rejected', 'applied', 'cancelled')),
  version integer not null default 1 check (version > 0),
  requested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  applied_by uuid references public.profiles(id) on delete set null,
  applied_at timestamptz,
  apply_result jsonb,
  constraint mdm_change_requests_registry_fk
    foreign key (tenant_id, entity_registry_id)
    references public.mdm_entity_registry(tenant_id, id) on delete restrict,
  constraint mdm_change_requests_registry_code_fk
    foreign key (tenant_id, entity_code)
    references public.mdm_entity_registry(tenant_id, entity_code) on delete restrict,
  constraint mdm_change_requests_tenant_id_unique unique (tenant_id, id),
  constraint mdm_change_requests_project_scope_deferred check (project_id is null),
  constraint mdm_change_requests_target_check check (
    (request_type = 'create' and target_record_id is null)
    or (request_type <> 'create' and target_record_id is not null)
  ),
  constraint mdm_change_requests_size_check check (
    pg_column_size(proposed_values) <= 65536
    and (base_snapshot is null or pg_column_size(base_snapshot) <= 65536)
  )
);

create index mdm_change_requests_tenant_idx on public.mdm_change_requests(tenant_id);
create index mdm_change_requests_project_idx on public.mdm_change_requests(project_id);
create index mdm_change_requests_queue_idx on public.mdm_change_requests(tenant_id, status, updated_at desc);
create index mdm_change_requests_requester_idx on public.mdm_change_requests(tenant_id, requested_by, created_at desc);
create index mdm_change_requests_entity_idx on public.mdm_change_requests(tenant_id, entity_code, status);
create trigger mdm_change_requests_set_updated_at
  before update on public.mdm_change_requests
  for each row execute function public.set_updated_at();

create table public.mdm_request_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.companies(id) on delete restrict,
  request_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type in ('created', 'edited', 'submitted', 'review_started', 'returned', 'approved', 'rejected', 'cancelled')),
  from_status text check (from_status is null or from_status in ('draft', 'submitted', 'under_review', 'returned', 'approved', 'apply_failed', 'rejected', 'applied', 'cancelled')),
  to_status text check (to_status is null or to_status in ('draft', 'submitted', 'under_review', 'returned', 'approved', 'apply_failed', 'rejected', 'applied', 'cancelled')),
  reason text check (reason is null or length(reason) <= 2000),
  event_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(event_payload) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, request_id)
    references public.mdm_change_requests(tenant_id, id) on delete restrict
);

create index mdm_request_events_tenant_idx on public.mdm_request_events(tenant_id);
create index mdm_request_events_request_idx on public.mdm_request_events(request_id, created_at, id);

create or replace function public.mdm_reject_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'MDM audit events are append-only';
end;
$$;

create trigger mdm_request_events_append_only
  before update or delete on public.mdm_request_events
  for each row execute function public.mdm_reject_event_mutation();

create trigger mdm_registry_events_append_only
  before update or delete on public.mdm_registry_events
  for each row execute function public.mdm_reject_event_mutation();

alter table public.mdm_entity_registry enable row level security;
alter table public.mdm_registry_events enable row level security;
alter table public.mdm_change_requests enable row level security;
alter table public.mdm_request_events enable row level security;

create policy mdm_entity_registry_tenant_select on public.mdm_entity_registry
  for select to authenticated
  using (tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid));

create policy mdm_registry_events_tenant_select on public.mdm_registry_events
  for select to authenticated
  using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    and (select public.has_permission('mdm', 'entity_registry', 'view'))
  );

create policy mdm_change_requests_tenant_select on public.mdm_change_requests
  for select to authenticated
  using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    and (
      requested_by = auth.uid()
      or (entity_code not in ('COM', 'PAR', 'SUP', 'PER', 'USR', 'EMP')
          and (select public.has_permission('mdm', 'change_request', 'view')))
    )
  );

create policy mdm_request_events_tenant_select on public.mdm_request_events
  for select to authenticated
  using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    and exists (
      select 1 from public.mdm_change_requests r
      where r.id = mdm_request_events.request_id
        and r.tenant_id = mdm_request_events.tenant_id
        and (
          r.requested_by = auth.uid()
          or (r.entity_code not in ('COM', 'PAR', 'SUP', 'PER', 'USR', 'EMP')
              and (select public.has_permission('mdm', 'change_request', 'view')))
        )
    )
  );

revoke all on public.mdm_entity_registry, public.mdm_registry_events, public.mdm_change_requests, public.mdm_request_events from public, anon, authenticated;
grant select on public.mdm_entity_registry, public.mdm_registry_events, public.mdm_change_requests, public.mdm_request_events to authenticated;

-- Actor and tenant are always derived from Supabase-authenticated context.
-- A stale/unregistered custom JWT hook fails closed by comparing the claim to
-- profiles.company_id. Caller-supplied actor/tenant values are not accepted.
create or replace function public.mdm_assert_actor_tenant()
returns table (actor_id uuid, tenant_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_claim_tenant uuid;
  v_profile_tenant uuid;
begin
  if v_actor is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  begin
    v_claim_tenant := nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '42501', message = 'A valid tenant claim is required';
  end;
  if v_claim_tenant is null then
    raise exception using errcode = '42501', message = 'A tenant claim is required';
  end if;
  select p.company_id into v_profile_tenant
  from public.profiles p where p.id = v_actor;
  if v_profile_tenant is null or v_profile_tenant is distinct from v_claim_tenant then
    raise exception using errcode = '42501', message = 'Tenant claim does not match the authenticated profile';
  end if;
  return query select v_actor, v_profile_tenant;
end;
$$;

-- Generic reviewers may see enabled request payloads. Until entity adapters
-- provide field-level redaction, reject system-managed and common sensitive
-- keys at every nesting level, including direct RPC callers.
create or replace function public.mdm_payload_has_forbidden_keys(p_payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_child jsonb;
begin
  if jsonb_typeof(p_payload) = 'object' then
    for v_key, v_child in select e.key, e.value from jsonb_each(p_payload) e loop
      if lower(v_key) = any (array[
        'id','tenant_id','company_id','project_id','code','status','workflow_status','archived_at','created_at','updated_at',
        'created_by','updated_by','requested_by','decided_by','applied_by','submitted_at','decided_at','applied_at',
        'bank_account','bank_accounts','bank_name','bank_details','banking_details','account_number','account_name',
        'routing_number','sort_code','iban','swift','swift_code','tax_id','tax_number','national_id',
        'social_security_number','passport_number','date_of_birth','birth_date','salary','pay_rate',
        'compensation','employee_number','personnel_number','employee_code'
      ]::text[]) then
        return true;
      end if;
      if public.mdm_payload_has_forbidden_keys(v_child) then return true; end if;
    end loop;
  elsif jsonb_typeof(p_payload) = 'array' then
    for v_child in select a.value from jsonb_array_elements(p_payload) a loop
      if public.mdm_payload_has_forbidden_keys(v_child) then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;

create or replace function public.mdm_create_request(
  p_entity_code text,
  p_request_type text,
  p_target_record_id uuid,
  p_proposed_values jsonb,
  p_schema_version integer,
  p_reason text,
  p_effective_at date default null,
  p_project_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_tenant uuid;
  v_registry public.mdm_entity_registry%rowtype;
  v_request_id uuid;
begin
  select actor_id, tenant_id into v_actor, v_tenant from public.mdm_assert_actor_tenant();
  if not public.has_permission('mdm', 'change_request', 'can_create') then
    raise exception using errcode = '42501', message = 'MDM request creation permission required';
  end if;
  if p_project_id is not null then
    raise exception using errcode = '0A000', message = 'Project-scoped MDM requests are unavailable until project tenant ownership is modeled';
  end if;
  if p_request_type is null or p_request_type not in ('create', 'update', 'deactivate', 'merge') then
    raise exception using errcode = '22023', message = 'Unsupported request type';
  end if;
  if p_request_type = 'merge' then
    raise exception using errcode = '0A000', message = 'Merge requests are not enabled in the generic MDM foundation';
  end if;
  if (p_request_type = 'create' and p_target_record_id is not null)
     or (p_request_type <> 'create' and p_target_record_id is null) then
    raise exception using errcode = '22023', message = 'Target record ID does not match request type';
  end if;
  if p_proposed_values is null or jsonb_typeof(p_proposed_values) <> 'object'
     or pg_column_size(p_proposed_values) > 65536 then
    raise exception using errcode = '22023', message = 'Proposed values must be a JSON object no larger than 64 KB';
  end if;
  if p_schema_version is null or p_schema_version < 1 then
    raise exception using errcode = '22023', message = 'A positive schema version is required';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 2000 then
    raise exception using errcode = '22023', message = 'A reason of 1 to 2000 characters is required';
  end if;
  if public.mdm_payload_has_forbidden_keys(p_proposed_values) then
    raise exception using errcode = '22023', message = 'System-managed or restricted personal/financial fields cannot be proposed through generic MDM intake';
  end if;
  select * into v_registry
  from public.mdm_entity_registry r
  where r.tenant_id = v_tenant and r.entity_code = p_entity_code
  for share;
  if not found or not v_registry.request_enabled then
    raise exception using errcode = '22023', message = 'MDM entity is unavailable for requests';
  end if;
  if v_registry.entity_scope in ('project', 'platform_reference', 'transaction_reference') then
    raise exception using errcode = '0A000', message = 'This MDM scope is not available for tenant request intake';
  end if;
  if v_registry.entity_code in ('COM', 'PAR', 'SUP', 'PER', 'USR', 'EMP') and v_registry.adapter_status <> 'ready' then
    raise exception using errcode = '0A000', message = 'Sensitive entity intake requires an approved privacy-aware domain adapter';
  end if;
  if p_schema_version <> v_registry.schema_version then
    raise exception using errcode = '22023', message = 'Request schema version is stale';
  end if;

  insert into public.mdm_change_requests
    (tenant_id, project_id, entity_registry_id, entity_code, request_type, target_record_id,
     base_snapshot, proposed_values, schema_version, reason, effective_at, requested_by)
  values
    (v_tenant, null, v_registry.id, v_registry.entity_code, p_request_type, p_target_record_id,
     null, p_proposed_values, p_schema_version, btrim(p_reason), p_effective_at, v_actor)
  returning id into v_request_id;

  insert into public.mdm_request_events
    (tenant_id, request_id, actor_id, event_type, from_status, to_status, reason)
  values (v_tenant, v_request_id, v_actor, 'created', null, 'draft', btrim(p_reason));
  return v_request_id;
end;
$$;

create or replace function public.mdm_update_draft(
  p_request_id uuid,
  p_expected_version integer,
  p_proposed_values jsonb,
  p_reason text,
  p_effective_at date default null
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
  select actor_id, tenant_id into v_actor, v_tenant from public.mdm_assert_actor_tenant();
  if not public.has_permission('mdm', 'change_request', 'edit') then
    raise exception using errcode = '42501', message = 'MDM request edit permission required';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'A positive expected request version is required';
  end if;
  if p_proposed_values is null or jsonb_typeof(p_proposed_values) <> 'object'
     or pg_column_size(p_proposed_values) > 65536 then
    raise exception using errcode = '22023', message = 'Proposed values must be a JSON object no larger than 64 KB';
  end if;
  if public.mdm_payload_has_forbidden_keys(p_proposed_values) then
    raise exception using errcode = '22023', message = 'System-managed or restricted personal/financial fields cannot be proposed through generic MDM intake';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 2000 then
    raise exception using errcode = '22023', message = 'A reason of 1 to 2000 characters is required';
  end if;
  select * into v_request from public.mdm_change_requests r
  where r.id = p_request_id and r.tenant_id = v_tenant for update;
  if not found then raise exception using errcode = 'P0002', message = 'MDM request not found'; end if;
  if v_request.requested_by is distinct from v_actor then
    raise exception using errcode = '42501', message = 'Only the requester may edit this request';
  end if;
  if v_request.status not in ('draft', 'returned') then
    raise exception using errcode = '55000', message = 'Only draft or returned requests may be edited';
  end if;
  if v_request.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'MDM request version is stale';
  end if;
  update public.mdm_change_requests r
  set proposed_values = p_proposed_values,
      reason = btrim(p_reason), effective_at = p_effective_at,
      version = r.version + 1
  where r.id = p_request_id
  returning r.version into v_new_version;
  insert into public.mdm_request_events
    (tenant_id, request_id, actor_id, event_type, from_status, to_status, reason, event_payload)
  values (v_tenant, p_request_id, v_actor, 'edited', v_request.status, v_request.status, btrim(p_reason),
          jsonb_build_object('version', v_new_version));
  return v_new_version;
end;
$$;

create or replace function public.mdm_transition_request(
  p_request_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_tenant uuid;
  v_request public.mdm_change_requests%rowtype;
  v_to_status text;
  v_event text;
  v_new_version integer;
begin
  select actor_id, tenant_id into v_actor, v_tenant from public.mdm_assert_actor_tenant();
  if p_expected_version is null or p_expected_version < 1 then
    raise exception using errcode = '22023', message = 'A positive expected request version is required';
  end if;
  if p_action is null or p_action not in ('submit', 'start_review', 'approve', 'reject', 'return', 'cancel') then
    raise exception using errcode = '22023', message = 'Unsupported MDM request action';
  end if;
  if p_action in ('reject', 'return', 'cancel') and (p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 2000) then
    raise exception using errcode = '22023', message = 'This action requires a reason of 1 to 2000 characters';
  end if;
  select * into v_request from public.mdm_change_requests r
  where r.id = p_request_id and r.tenant_id = v_tenant for update;
  if not found then raise exception using errcode = 'P0002', message = 'MDM request not found'; end if;
  if v_request.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'MDM request version is stale';
  end if;

  case p_action
    when 'submit' then
      if not public.has_permission('mdm', 'change_request', 'submit') then
        raise exception using errcode = '42501', message = 'MDM submit permission required';
      end if;
      if v_request.requested_by is distinct from v_actor or v_request.status not in ('draft', 'returned') then
        raise exception using errcode = '55000', message = 'Only the requester may submit a draft or returned request';
      end if;
      v_to_status := 'submitted'; v_event := 'submitted';
    when 'start_review' then
      if not public.has_permission('mdm', 'decision', 'edit') then
        raise exception using errcode = '42501', message = 'MDM review permission required';
      end if;
      if v_request.status <> 'submitted' then
        raise exception using errcode = '55000', message = 'Only submitted requests may enter review';
      end if;
      if v_request.requested_by is not distinct from v_actor then
        raise exception using errcode = '42501', message = 'Requester cannot review their own request';
      end if;
      v_to_status := 'under_review'; v_event := 'review_started';
    when 'approve' then
      if not public.has_permission('mdm', 'decision', 'approve') then
        raise exception using errcode = '42501', message = 'MDM approval permission required';
      end if;
      if v_request.status <> 'under_review' then
        raise exception using errcode = '55000', message = 'Only requests under review may be approved';
      end if;
      if v_request.requested_by is not distinct from v_actor then
        raise exception using errcode = '42501', message = 'Requester cannot approve their own request';
      end if;
      v_to_status := 'approved'; v_event := 'approved';
    when 'reject' then
      if not public.has_permission('mdm', 'decision', 'reject') then
        raise exception using errcode = '42501', message = 'MDM rejection permission required';
      end if;
      if v_request.status <> 'under_review' then
        raise exception using errcode = '55000', message = 'Only requests under review may be rejected';
      end if;
      if v_request.requested_by is not distinct from v_actor then
        raise exception using errcode = '42501', message = 'Requester cannot reject their own request';
      end if;
      v_to_status := 'rejected'; v_event := 'rejected';
    when 'return' then
      if not public.has_permission('mdm', 'decision', 'edit') then
        raise exception using errcode = '42501', message = 'MDM return permission required';
      end if;
      if v_request.status <> 'under_review' then
        raise exception using errcode = '55000', message = 'Only requests under review may be returned';
      end if;
      if v_request.requested_by is not distinct from v_actor then
        raise exception using errcode = '42501', message = 'Requester cannot return their own request';
      end if;
      v_to_status := 'returned'; v_event := 'returned';
    when 'cancel' then
      if not public.has_permission('mdm', 'change_request', 'edit') then
        raise exception using errcode = '42501', message = 'MDM cancellation permission required';
      end if;
      if v_request.status not in ('draft', 'submitted', 'returned') then
        raise exception using errcode = '55000', message = 'This request can no longer be cancelled';
      end if;
      if v_request.requested_by is distinct from v_actor
         and not public.has_permission('mdm', 'decision', 'edit') then
        raise exception using errcode = '42501', message = 'Only the requester or an MDM steward may cancel this request';
      end if;
      v_to_status := 'cancelled'; v_event := 'cancelled';
  end case;

  update public.mdm_change_requests r
  set status = v_to_status,
      version = r.version + 1,
      submitted_at = case when p_action = 'submit' then now() else r.submitted_at end,
      decided_by = case when p_action in ('approve', 'reject', 'return') then v_actor else r.decided_by end,
      decided_at = case when p_action in ('approve', 'reject', 'return') then now() else r.decided_at end
  where r.id = p_request_id
  returning r.version into v_new_version;
  insert into public.mdm_request_events
    (tenant_id, request_id, actor_id, event_type, from_status, to_status, reason, event_payload)
  values (v_tenant, p_request_id, v_actor, v_event, v_request.status, v_to_status,
          nullif(btrim(p_reason), ''), jsonb_build_object('version', v_new_version));
  return v_to_status;
end;
$$;

create or replace function public.mdm_set_entity_request_enabled(
  p_entity_code text,
  p_enabled boolean,
  p_expected_config_version integer,
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
  v_entity public.mdm_entity_registry%rowtype;
  v_new_version integer;
begin
  select actor_id, tenant_id into v_actor, v_tenant from public.mdm_assert_actor_tenant();
  if not public.is_admin(v_actor)
     and not public.has_permission('mdm', 'entity_registry', 'configure') then
    raise exception using errcode = '42501', message = 'MDM administrator permission required to configure request intake';
  end if;
  if p_enabled is null or p_reason is null or length(btrim(p_reason)) = 0 or length(p_reason) > 2000 then
    raise exception using errcode = '22023', message = 'Enabled flag and configuration reason are required';
  end if;
  if p_expected_config_version is null or p_expected_config_version < 1 then
    raise exception using errcode = '22023', message = 'A positive expected registry configuration version is required';
  end if;
  select * into v_entity from public.mdm_entity_registry r
  where r.tenant_id = v_tenant and r.entity_code = p_entity_code for update;
  if not found then raise exception using errcode = 'P0002', message = 'MDM entity not found'; end if;
  if v_entity.config_version <> p_expected_config_version then
    raise exception using errcode = '40001', message = 'MDM registry configuration is stale';
  end if;
  if p_enabled and v_entity.entity_scope in ('project', 'platform_reference', 'transaction_reference') then
    raise exception using errcode = '0A000', message = 'This MDM scope is not available for tenant request intake';
  end if;
  if p_enabled and v_entity.entity_code in ('COM', 'PAR', 'SUP', 'PER', 'USR', 'EMP') and v_entity.adapter_status <> 'ready' then
    raise exception using errcode = '0A000', message = 'Sensitive entity intake requires an approved privacy-aware domain adapter';
  end if;

  update public.mdm_entity_registry r
  set request_enabled = p_enabled, config_version = r.config_version + 1
  where r.id = v_entity.id
  returning r.config_version into v_new_version;
  insert into public.mdm_registry_events
    (tenant_id, entity_code, actor_id, event_type, prior_enabled, new_enabled, config_version)
  values (v_tenant, v_entity.entity_code, v_actor, 'request_intake_toggled', v_entity.request_enabled, p_enabled, v_new_version);
  return v_new_version;
end;
$$;

revoke all on function public.mdm_assert_actor_tenant() from public, anon;
revoke all on function public.mdm_create_request(text, text, uuid, jsonb, integer, text, date, uuid) from public, anon;
revoke all on function public.mdm_update_draft(uuid, integer, jsonb, text, date) from public, anon;
revoke all on function public.mdm_transition_request(uuid, integer, text, text) from public, anon;
revoke all on function public.mdm_set_entity_request_enabled(text, boolean, integer, text) from public, anon;
revoke all on function public.mdm_payload_has_forbidden_keys(jsonb) from public, anon, authenticated;
grant execute on function public.mdm_assert_actor_tenant() to authenticated;
grant execute on function public.mdm_create_request(text, text, uuid, jsonb, integer, text, date, uuid) to authenticated;
grant execute on function public.mdm_update_draft(uuid, integer, jsonb, text, date) to authenticated;
grant execute on function public.mdm_transition_request(uuid, integer, text, text) to authenticated;
grant execute on function public.mdm_set_entity_request_enabled(text, boolean, integer, text) to authenticated;
revoke all on function public.mdm_seed_registry_for_tenant(uuid) from public, anon, authenticated;
revoke all on function public.mdm_seed_registry_on_company_insert() from public, anon, authenticated;

-- This is a baseline permission seed only. Existing admin override remains in
-- has_permission(); every decision RPC separately enforces maker/checker.
insert into public.role_permissions
  (role_code, module, action, view, can_create, edit, submit, approve, reject, export, configure, scope)
select r.role_code, 'mdm', r.action, r.view, r.can_create, r.edit, r.submit,
       r.approve, r.reject, r.export, r.configure, 'company'
from (values
  ('L0', 'change_request', true, true, true, true, false, false, false, false),
  ('L1', 'change_request', true, true, true, true, false, false, false, false),
  ('L2', 'change_request', true, true, true, true, false, false, false, false),
  ('L3', 'change_request', true, true, true, true, false, false, false, false),
  ('L4', 'change_request', true, true, true, true, false, false, false, false),
  ('L5', 'change_request', false, true, true, true, false, false, false, false),
  ('L6', 'change_request', false, true, true, true, false, false, false, false),
  ('L0', 'decision', true, false, true, false, true, true, false, false),
  ('L1', 'decision', true, false, true, false, true, true, false, false),
  ('L2', 'decision', true, false, true, false, true, true, false, false),
  ('L3', 'decision', true, false, true, false, true, true, false, false),
  ('L4', 'decision', true, false, true, false, true, true, false, false),
  ('L0', 'entity_registry', true, false, false, false, false, false, false, true),
  ('L1', 'entity_registry', true, false, false, false, false, false, false, false),
  ('L2', 'entity_registry', true, false, false, false, false, false, false, false),
  ('L0', 'request_event', true, false, false, false, false, false, false, false),
  ('L1', 'request_event', true, false, false, false, false, false, false, false),
  ('L2', 'request_event', true, false, false, false, false, false, false, false),
  ('L3', 'request_event', true, false, false, false, false, false, false, false),
  ('L4', 'request_event', true, false, false, false, false, false, false, false)
) as r(role_code, action, view, can_create, edit, submit, approve, reject, export, configure)
on conflict (role_code, module, action) do update set
  view = excluded.view,
  can_create = excluded.can_create,
  edit = excluded.edit,
  submit = excluded.submit,
  approve = excluded.approve,
  reject = excluded.reject,
  export = excluded.export,
  configure = excluded.configure,
  scope = excluded.scope;

commit;
