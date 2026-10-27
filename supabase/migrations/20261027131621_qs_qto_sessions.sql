-- Migration: 20261027131621_qs_qto_sessions.sql
-- Purpose: Quantity Take-off (module 04-20-01) P0 — take-off sessions and versions on top of
--          the existing qto_* schema (20260805000001): measurement rulesets, drawing
--          calibrations, item factors, append-only calculation runs, a QA issue register,
--          version reviews, immutable publications and idempotent transfers to the tender BOQ.
--          Workflow, publication and transfer rules are enforced here (RPCs + triggers), not
--          only in the UI. Additive only: new tables, new columns, new functions.
-- Spec: docs/04-Business-Modules/20-Quantity-Surveying/04-20-01-Quantity-Take-off/Master Plan.md

-- ──────────────────────────────────────────────────────────────────────────
-- 0. Helpers
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.qto_tenant_ok(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_tenant is null or p_tenant = public.dwl_current_tenant() or public.is_admin(auth.uid())
$$;

create or replace function public.qto_require_permission(p_action text, p_field text)
returns void language plpgsql stable set search_path = public as $$
begin
  if not public.has_permission('qto', p_action, p_field) then
    raise exception 'QTO_FORBIDDEN: you do not have % permission on %', p_field, p_action
      using errcode = 'P0001';
  end if;
end $$;

-- The tenant a write belongs to. Users without a company may not create take-off records,
-- because their rows would be visible to every tenant.
create or replace function public.qto_require_tenant()
returns uuid language plpgsql stable set search_path = public as $$
declare v uuid := public.dwl_current_tenant();
begin
  if v is null and not public.is_admin(auth.uid()) then
    raise exception 'QTO_NO_COMPANY: your profile has no company; ask an administrator to set it'
      using errcode = 'P0001';
  end if;
  return v;
end $$;

-- Rejects UPDATE/DELETE on append-only or frozen tables. Cascaded deletes (a tender being
-- deleted) are allowed; the admin escape hatch is `set local dcos.qto_unlock = 'on'`.
create or replace function public.qto_reject_mutation()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('dcos.qto_unlock', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'QTO_IMMUTABLE: % rows cannot be %d', tg_table_name, lower(tg_op)
    using errcode = 'P0001';
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Measurement rulesets (version-controlled company rules)
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.qto_measurement_rulesets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid default public.dwl_current_tenant(),
  code        text not null check (length(trim(code)) > 0),
  name        text not null check (length(trim(name)) > 0),
  description text,
  standard    text,                       -- e.g. 'Company', 'SMM7', 'CESMM4'
  is_active   boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists qto_rulesets_code_uq
  on public.qto_measurement_rulesets (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

-- definition jsonb: { rounding: {stage, dp, mode}, factors: [{name, min, max}],
--   rules: [{code, name, trade, unit, formula, inputs: [{name, unit}], deduction_policy,
--            allowed_factors: [..], validations: {..}}] }
create table if not exists public.qto_measurement_rule_versions (
  id           uuid primary key default gen_random_uuid(),
  ruleset_id   uuid not null references public.qto_measurement_rulesets(id) on delete cascade,
  version_no   integer not null check (version_no > 0),
  status       text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  definition   jsonb not null default '{}'::jsonb check (jsonb_typeof(definition) = 'object'),
  change_note  text,
  approved_by  uuid references public.profiles(id) on delete set null,
  approved_at  timestamptz,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (ruleset_id, version_no),
  check (status = 'draft' or (approved_at is not null))
);

-- An approved rule version is frozen: only draft → approved and approved → retired.
create or replace function public.qto_rule_version_guard()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('dcos.qto_unlock', true), '') = 'on' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    if old.status <> 'draft' and pg_trigger_depth() <= 1 then
      raise exception 'QTO_IMMUTABLE: an approved rule version cannot be deleted' using errcode = 'P0001';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'QTO_RULE_DRAFT_FIRST: a rule version starts as draft' using errcode = 'P0001';
    end if;
    return new;
  end if;
  if old.status = 'draft' and new.status = 'approved' then
    new.approved_by := auth.uid();
    new.approved_at := now();
    return new;
  end if;
  if old.status = 'draft' and new.status = 'draft' then return new; end if;
  if old.status = 'approved' and new.status = 'retired'
     and new.definition = old.definition and new.version_no = old.version_no then
    return new;
  end if;
  raise exception 'QTO_IMMUTABLE: rule version % is %, its content cannot change', old.version_no, old.status
    using errcode = 'P0001';
end $$;
drop trigger if exists qto_rule_version_guard on public.qto_measurement_rule_versions;
create trigger qto_rule_version_guard
  before insert or update or delete on public.qto_measurement_rule_versions
  for each row execute function public.qto_rule_version_guard();

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Sessions and versions
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.qto_sessions (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid default public.dwl_current_tenant(),
  tender_id          uuid not null references public.tender_register(id) on delete cascade,
  project_id         uuid references public.projects(id) on delete set null,
  session_code       text not null,
  name               text not null check (length(trim(name)) > 0),
  description        text,
  purpose            text not null default 'TENDER' check (purpose in ('TENDER', 'CONSTRUCTION')),
  trade              text,
  building           text,
  scope              text,
  responsible_qs     uuid references public.profiles(id) on delete set null,
  current_version_id uuid,
  is_deleted         boolean not null default false,
  created_by         uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tender_id, session_code)
);
create index if not exists qto_sessions_tender_idx on public.qto_sessions (tender_id);
create index if not exists qto_sessions_project_idx on public.qto_sessions (project_id);

create table if not exists public.qto_session_versions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid default public.dwl_current_tenant(),
  session_id           uuid not null references public.qto_sessions(id) on delete cascade,
  version_no           integer not null check (version_no > 0),
  parent_version_id    uuid references public.qto_session_versions(id) on delete set null,
  baseline_version_id  uuid references public.qto_session_versions(id) on delete set null,
  reason               text,
  drawing_revision_id  uuid references public.qto_drawing_revisions(id) on delete restrict,
  ruleset_version_id   uuid references public.qto_measurement_rule_versions(id) on delete restrict,
  engine_version       text,
  status               text not null default 'DRAFT' check (status in (
                         'DRAFT', 'IN_PROGRESS', 'SUBMITTED_FOR_REVIEW', 'CHANGES_REQUESTED',
                         'APPROVED', 'PUBLISHED', 'CANCELLED')),
  submitted_by         uuid references public.profiles(id) on delete set null,
  submitted_at         timestamptz,
  approved_by          uuid references public.profiles(id) on delete set null,
  approved_at          timestamptz,
  published_by         uuid references public.profiles(id) on delete set null,
  published_at         timestamptz,
  cancelled_by         uuid references public.profiles(id) on delete set null,
  cancelled_at         timestamptz,
  cancel_reason        text,
  created_by           uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (session_id, version_no)
);
create index if not exists qto_versions_session_idx on public.qto_session_versions (session_id);
create index if not exists qto_versions_status_idx on public.qto_session_versions (status);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qto_sessions_current_version_fk') then
    alter table public.qto_sessions add constraint qto_sessions_current_version_fk
      foreign key (current_version_id) references public.qto_session_versions(id) on delete set null;
  end if;
end $$;

-- Parent and baseline must belong to the same session.
create or replace function public.qto_version_lineage_check()
returns trigger language plpgsql as $$
begin
  if new.parent_version_id is not null and not exists (
       select 1 from public.qto_session_versions where id = new.parent_version_id and session_id = new.session_id) then
    raise exception 'QTO_BAD_PARENT: the parent version belongs to another session' using errcode = 'P0001';
  end if;
  if new.baseline_version_id is not null and not exists (
       select 1 from public.qto_session_versions where id = new.baseline_version_id and session_id = new.session_id) then
    raise exception 'QTO_BAD_BASELINE: the comparison baseline belongs to another session' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (new.session_id <> old.session_id or new.version_no <> old.version_no) then
    raise exception 'QTO_IMMUTABLE: a version cannot move to another session or be renumbered' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.status = 'PUBLISHED'
     and coalesce(current_setting('dcos.qto_unlock', true), '') <> 'on' then
    raise exception 'QTO_PUBLISHED: a published version cannot be changed; create a new version' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists qto_version_lineage_check on public.qto_session_versions;
create trigger qto_version_lineage_check
  before insert or update on public.qto_session_versions
  for each row execute function public.qto_version_lineage_check();

-- Append-only review history per version.
create table if not exists public.qto_version_reviews (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid default public.dwl_current_tenant(),
  version_id  uuid not null references public.qto_session_versions(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null default auth.uid(),
  from_status text,
  to_status   text not null,
  comment     text,
  created_at  timestamptz not null default now()
);
create index if not exists qto_version_reviews_version_idx on public.qto_version_reviews (version_id);
drop trigger if exists qto_version_reviews_append_only on public.qto_version_reviews;
create trigger qto_version_reviews_append_only
  before update or delete on public.qto_version_reviews
  for each row execute function public.qto_reject_mutation();

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Columns on existing tables
-- ──────────────────────────────────────────────────────────────────────────
alter table public.qto_items
  add column if not exists session_version_id     uuid references public.qto_session_versions(id) on delete cascade,
  add column if not exists tenant_id              uuid,
  add column if not exists quantity_status        text not null default 'FIRM',
  add column if not exists exclusion_reason       text,
  add column if not exists provisional_assumption text,
  add column if not exists wbs_node_id            uuid references public.wbs_nodes(id) on delete set null,
  add column if not exists budget_code_id         uuid references public.budget_codes(id) on delete set null,
  add column if not exists level                  text,
  add column if not exists zone                   text,
  add column if not exists rule_code              text,
  add column if not exists gross_qty              numeric(18,4),
  add column if not exists deduction_qty          numeric(18,4),
  add column if not exists factor_product         numeric(18,8),
  add column if not exists carried_from_item_id   uuid references public.qto_items(id) on delete set null,
  add column if not exists carry_status           text,
  add column if not exists is_deleted             boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'qto_items_quantity_status_check') then
    alter table public.qto_items add constraint qto_items_quantity_status_check
      check (quantity_status in ('FIRM', 'PROVISIONAL', 'EXCLUDED', 'PENDING_CLARIFICATION'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qto_items_carry_status_check') then
    alter table public.qto_items add constraint qto_items_carry_status_check
      check (carry_status is null or carry_status in ('REMEASURED', 'REVALIDATED', 'UNVERIFIED'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'qto_items_quantity_finite_check') then
    alter table public.qto_items add constraint qto_items_quantity_finite_check
      check (quantity >= 0 and quantity < 1e12);
  end if;
end $$;
create unique index if not exists qto_items_version_no_uq
  on public.qto_items (session_version_id, qto_no) where session_version_id is not null;
create index if not exists qto_items_version_idx on public.qto_items (session_version_id);

alter table public.qto_boq_links
  add column if not exists transfer_id uuid;

alter table public.qto_drawing_revisions
  add column if not exists document_revision_id uuid references public.document_revisions(id) on delete set null,
  add column if not exists tenant_id uuid;

alter table public.qto_drawing_register add column if not exists tenant_id uuid;
alter table public.qto_document_register add column if not exists tenant_id uuid;
alter table public.qto_measurements      add column if not exists tenant_id uuid;
alter table public.qto_calculations      add column if not exists tenant_id uuid;

-- ──────────────────────────────────────────────────────────────────────────
-- 4. Calibrations, factors, calculation runs, issues
-- ──────────────────────────────────────────────────────────────────────────
-- A calibration belongs to one drawing revision and page; a new revision needs a new one.
-- Points are in PDF page units (scale 1), so they do not depend on the viewer zoom.
create table if not exists public.qto_drawing_calibrations (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid default public.dwl_current_tenant(),
  drawing_revision_id uuid not null references public.qto_drawing_revisions(id) on delete cascade,
  page_no             integer not null default 1 check (page_no > 0),
  points              jsonb not null check (jsonb_typeof(points) = 'array' and jsonb_array_length(points) = 2),
  pixel_distance      numeric(18,6) not null check (pixel_distance > 0),
  known_distance      numeric(18,6) not null check (known_distance > 0),
  known_unit          text not null check (known_unit in ('mm', 'cm', 'm')),
  metres_per_unit     numeric(24,12) not null check (metres_per_unit > 0),
  is_active           boolean not null default true,
  created_by          uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now()
);
create unique index if not exists qto_calibrations_active_uq
  on public.qto_drawing_calibrations (drawing_revision_id, page_no) where is_active;

alter table public.qto_measurements
  add column if not exists calibration_id uuid references public.qto_drawing_calibrations(id) on delete set null;

create table if not exists public.qto_item_factors (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid default public.dwl_current_tenant(),
  item_id      uuid not null references public.qto_items(id) on delete cascade,
  factor_name  text not null check (length(trim(factor_name)) > 0),
  factor_value numeric(12,6) not null check (factor_value > 0 and factor_value < 1000),
  sequence     integer not null default 1,
  reason       text,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists qto_item_factors_item_idx on public.qto_item_factors (item_id);

-- Append-only: every calculation keeps its inputs, rule and engine version.
create table if not exists public.qto_calculation_runs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid default public.dwl_current_tenant(),
  item_id         uuid not null references public.qto_items(id) on delete cascade,
  version_id      uuid references public.qto_session_versions(id) on delete cascade,
  rule_version_id uuid references public.qto_measurement_rule_versions(id) on delete set null,
  rule_code       text,
  engine_version  text not null,
  expression      text,
  inputs          jsonb not null default '[]'::jsonb,
  gross           numeric(18,4) not null,
  deductions      numeric(18,4) not null default 0,
  net             numeric(18,4) not null,
  factor_product  numeric(18,8) not null default 1,
  result          numeric(18,4) not null check (result >= 0),
  unit            text not null,
  rounding        jsonb,
  valid           boolean not null default true,
  errors          jsonb not null default '[]'::jsonb,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  check (net = gross - deductions)
);
create index if not exists qto_calc_runs_item_idx on public.qto_calculation_runs (item_id, created_at desc);
drop trigger if exists qto_calc_runs_append_only on public.qto_calculation_runs;
create trigger qto_calc_runs_append_only
  before update or delete on public.qto_calculation_runs
  for each row execute function public.qto_reject_mutation();

create table if not exists public.qto_issues (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid default public.dwl_current_tenant(),
  version_id      uuid not null references public.qto_session_versions(id) on delete cascade,
  item_id         uuid references public.qto_items(id) on delete cascade,
  rule_code       text not null,
  severity        text not null check (severity in ('BLOCKING', 'WARNING')),
  message         text not null,
  evidence        jsonb,
  fingerprint     text not null,
  status          text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  justification   text,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolution      text,
  resolved_by     uuid references public.profiles(id) on delete set null,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status <> 'acknowledged' or (severity = 'WARNING' and length(trim(coalesce(justification, ''))) > 0))
);
-- Rerunning validation updates the open issue instead of adding a duplicate.
create unique index if not exists qto_issues_open_uq
  on public.qto_issues (version_id, fingerprint) where status <> 'resolved';
create index if not exists qto_issues_version_idx on public.qto_issues (version_id, status);

-- ──────────────────────────────────────────────────────────────────────────
-- 5. Publications and transfers
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.qto_publications (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid default public.dwl_current_tenant(),
  version_id    uuid not null unique references public.qto_session_versions(id) on delete cascade,
  session_id    uuid not null references public.qto_sessions(id) on delete cascade,
  snapshot      jsonb not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  item_count    integer not null,
  published_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  published_at  timestamptz not null default now()
);
create index if not exists qto_publications_session_idx on public.qto_publications (session_id);
drop trigger if exists qto_publications_immutable on public.qto_publications;
create trigger qto_publications_immutable
  before update or delete on public.qto_publications
  for each row execute function public.qto_reject_mutation();

create table if not exists public.qto_transfers (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid default public.dwl_current_tenant(),
  publication_id      uuid not null references public.qto_publications(id) on delete cascade,
  target              text not null default 'tender_boq' check (target in ('tender_boq')),
  target_tender_id    uuid not null references public.tender_register(id) on delete cascade,
  idempotency_key     text not null check (length(idempotency_key) between 8 and 200),
  include_provisional boolean not null default false,
  allow_overwrite     boolean not null default false,
  status              text not null check (status in ('succeeded', 'failed')),
  lines               jsonb not null default '[]'::jsonb,
  error               text,
  created_by          uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now()
);
-- A retry with the same key after success returns the first result; failed attempts may repeat.
create unique index if not exists qto_transfers_key_uq
  on public.qto_transfers (idempotency_key) where status = 'succeeded';
create index if not exists qto_transfers_publication_idx on public.qto_transfers (publication_id);
drop trigger if exists qto_transfers_append_only on public.qto_transfers;
create trigger qto_transfers_append_only
  before update or delete on public.qto_transfers
  for each row execute function public.qto_reject_mutation();

-- ──────────────────────────────────────────────────────────────────────────
-- 6. Edit guard: take-off content is editable only while its version is open
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.qto_version_is_editable(p_version_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_version_id is null or exists (
    select 1 from public.qto_session_versions
    where id = p_version_id and status in ('DRAFT', 'IN_PROGRESS', 'CHANGES_REQUESTED'))
$$;

create or replace function public.qto_item_version(p_item_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select session_version_id from public.qto_items where id = p_item_id
$$;

create or replace function public.qto_version_edit_guard()
returns trigger language plpgsql as $$
declare
  v_version uuid;
  v_row record := coalesce(new, old);
begin
  if coalesce(current_setting('dcos.qto_unlock', true), '') = 'on' then return coalesce(new, old); end if;
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;

  if tg_table_name = 'qto_items' then
    if tg_op = 'UPDATE' and old.session_version_id is not null
       and new.session_version_id is distinct from old.session_version_id then
      raise exception 'QTO_IMMUTABLE: an item cannot move to another version' using errcode = 'P0001';
    end if;
    v_version := coalesce(old.session_version_id, new.session_version_id);
    if tg_op = 'UPDATE' and old.session_version_id is null then v_version := new.session_version_id; end if;
  elsif tg_table_name = 'qto_calculation_lines' then
    select i.session_version_id into v_version
      from public.qto_calculations c join public.qto_items i on i.id = c.qto_item_id
     where c.id = v_row.calculation_id;
  elsif tg_table_name = 'qto_item_factors' then
    v_version := public.qto_item_version(v_row.item_id);
  else
    v_version := public.qto_item_version(v_row.qto_item_id);
  end if;

  if not public.qto_version_is_editable(v_version) then
    raise exception 'QTO_LOCKED: this take-off version is under review or published and cannot be edited'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['qto_items', 'qto_measurements', 'qto_calculations', 'qto_calculation_lines', 'qto_item_factors'] loop
    execute format('drop trigger if exists qto_version_edit_guard on public.%I', t);
    execute format('create trigger qto_version_edit_guard before insert or update or delete on public.%I
                    for each row execute function public.qto_version_edit_guard()', t);
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 7. updated_at + audit triggers
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['qto_sessions', 'qto_session_versions', 'qto_issues',
                           'qto_measurement_rulesets', 'qto_measurement_rule_versions'] loop
    execute format('drop trigger if exists qto_touch_updated_at on public.%I', t);
    execute format('create trigger qto_touch_updated_at before update on public.%I
                    for each row execute function public.qto_set_updated_at()', t);
  end loop;
  foreach t in array array['qto_sessions', 'qto_session_versions', 'qto_measurement_rulesets',
                           'qto_measurement_rule_versions', 'qto_drawing_calibrations', 'qto_item_factors',
                           'qto_issues', 'qto_publications', 'qto_transfers', 'qto_measurements',
                           'qto_calculations', 'qto_calculation_lines'] loop
    execute format('drop trigger if exists qto_audit_%s on public.%I', t, t);
    execute format('create trigger qto_audit_%s after insert or update or delete on public.%I
                    for each row execute function public.qto_audit_trigger_fn()', t, t);
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────────────────
-- 8. RLS on the new tables. Workflow tables are written only through the RPCs below.
-- ──────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['qto_sessions', 'qto_session_versions', 'qto_version_reviews', 'qto_drawing_calibrations',
                           'qto_item_factors', 'qto_calculation_runs', 'qto_issues', 'qto_publications',
                           'qto_transfers', 'qto_measurement_rulesets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists qto_tenant_read on public.%I', t);
    execute format('create policy qto_tenant_read on public.%I for select to authenticated
                    using (public.qto_tenant_ok(tenant_id) and public.has_permission(''qto'', ''qto_sessions'', ''view''))', t);
  end loop;
end $$;

-- Rule versions have no tenant column of their own; they follow their ruleset.
alter table public.qto_measurement_rule_versions enable row level security;
drop policy if exists qto_tenant_read on public.qto_measurement_rule_versions;
create policy qto_tenant_read on public.qto_measurement_rule_versions for select to authenticated
  using (exists (select 1 from public.qto_measurement_rulesets r
                 where r.id = ruleset_id and public.qto_tenant_ok(r.tenant_id))
         and public.has_permission('qto', 'qto_sessions', 'view'));

drop policy if exists qto_rules_write on public.qto_measurement_rulesets;
create policy qto_rules_write on public.qto_measurement_rulesets for all to authenticated
  using (tenant_id is not null and public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_rules', 'configure'))
  with check (tenant_id is not null and public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_rules', 'configure'));

drop policy if exists qto_rules_write on public.qto_measurement_rule_versions;
create policy qto_rules_write on public.qto_measurement_rule_versions for all to authenticated
  using (exists (select 1 from public.qto_measurement_rulesets r
                 where r.id = ruleset_id and r.tenant_id is not null and public.qto_tenant_ok(r.tenant_id))
         and public.has_permission('qto', 'qto_rules', 'configure'))
  with check (exists (select 1 from public.qto_measurement_rulesets r
                      where r.id = ruleset_id and r.tenant_id is not null and public.qto_tenant_ok(r.tenant_id))
              and public.has_permission('qto', 'qto_rules', 'configure'));

drop policy if exists qto_factors_write on public.qto_item_factors;
create policy qto_factors_write on public.qto_item_factors for all to authenticated
  using (public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_workspace', 'edit'))
  with check (tenant_id is not null and public.qto_tenant_ok(tenant_id) and public.has_permission('qto', 'qto_workspace', 'edit'));

-- ──────────────────────────────────────────────────────────────────────────
-- 9. RPCs
-- ──────────────────────────────────────────────────────────────────────────

-- 9.1 Create a session and its first version (DRAFT). The exact drawing revision is required.
create or replace function public.qto_create_session(
  p_tender_id           uuid,
  p_name                text,
  p_drawing_revision_id uuid,
  p_ruleset_version_id  uuid,
  p_trade               text default null,
  p_building            text default null,
  p_description         text default null,
  p_scope               text default null,
  p_responsible_qs      uuid default null,
  p_purpose             text default 'TENDER'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant  uuid;
  v_project uuid;
  v_session uuid;
  v_version uuid;
  v_n       int;
begin
  perform public.qto_require_permission('qto_sessions', 'can_create');
  v_tenant := public.qto_require_tenant();

  select project_id into v_project from public.tender_register where id = p_tender_id;
  if not found then
    raise exception 'QTO_NOT_FOUND: tender not found' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'QTO_VALIDATION: session name is required' using errcode = 'P0001';
  end if;
  if p_purpose not in ('TENDER', 'CONSTRUCTION') then
    raise exception 'QTO_VALIDATION: purpose must be TENDER or CONSTRUCTION' using errcode = 'P0001';
  end if;
  if p_drawing_revision_id is null then
    raise exception 'QTO_SOURCE_REQUIRED: select the exact drawing revision to measure' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.qto_drawing_revisions r join public.qto_drawing_register d on d.id = r.drawing_id
    where r.id = p_drawing_revision_id and d.tender_id = p_tender_id) then
    raise exception 'QTO_SOURCE_INVALID: the drawing revision does not belong to this tender' using errcode = 'P0001';
  end if;
  if p_ruleset_version_id is null or not exists (
    select 1 from public.qto_measurement_rule_versions v join public.qto_measurement_rulesets r on r.id = v.ruleset_id
    where v.id = p_ruleset_version_id and v.status = 'approved' and public.qto_tenant_ok(r.tenant_id)) then
    raise exception 'QTO_RULESET_INVALID: select an approved measurement ruleset version' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('qto_session:' || p_tender_id::text));
  select coalesce(max(nullif(regexp_replace(session_code, '\D', '', 'g'), '')::int), 0) + 1
    into v_n from public.qto_sessions where tender_id = p_tender_id;

  insert into public.qto_sessions (tenant_id, tender_id, project_id, session_code, name, description, purpose,
                                   trade, building, scope, responsible_qs)
  values (v_tenant, p_tender_id, v_project, 'QTS-' || lpad(v_n::text, 3, '0'), trim(p_name), p_description,
          p_purpose, p_trade, p_building, p_scope, coalesce(p_responsible_qs, auth.uid()))
  returning id into v_session;

  insert into public.qto_session_versions (tenant_id, session_id, version_no, reason, drawing_revision_id,
                                           ruleset_version_id, status)
  values (v_tenant, v_session, 1, 'Initial take-off', p_drawing_revision_id, p_ruleset_version_id, 'DRAFT')
  returning id into v_version;

  update public.qto_sessions set current_version_id = v_version where id = v_session;
  insert into public.qto_version_reviews (tenant_id, version_id, from_status, to_status, comment)
  values (v_tenant, v_version, null, 'DRAFT', 'Session created');
  return v_session;
end $$;

-- 9.2 Start a new version. Only one open version per session; the session row lock makes
-- version numbers safe under concurrent use. Carried items stay linked to their evidence.
create or replace function public.qto_create_version(
  p_session_id          uuid,
  p_reason              text,
  p_drawing_revision_id uuid,
  p_ruleset_version_id  uuid,
  p_carry_item_ids      uuid[] default '{}',
  p_baseline_version_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s          public.qto_sessions%rowtype;
  v_parent   public.qto_session_versions%rowtype;
  v_version  uuid;
  v_baseline uuid;
  v_no       int;
  v_bad      int;
begin
  perform public.qto_require_permission('qto_sessions', 'can_create');
  perform public.qto_require_tenant();

  select * into s from public.qto_sessions where id = p_session_id for update;
  if not found or not public.qto_tenant_ok(s.tenant_id) then
    raise exception 'QTO_NOT_FOUND: session not found' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'QTO_VALIDATION: give the reason for the new version' using errcode = 'P0001';
  end if;
  select * into v_parent from public.qto_session_versions where id = s.current_version_id;
  if v_parent.status not in ('APPROVED', 'PUBLISHED', 'CANCELLED') then
    raise exception 'QTO_VERSION_OPEN: version % is still %; finish or cancel it first', v_parent.version_no, v_parent.status
      using errcode = 'P0001';
  end if;
  if p_drawing_revision_id is null or not exists (
    select 1 from public.qto_drawing_revisions r join public.qto_drawing_register d on d.id = r.drawing_id
    where r.id = p_drawing_revision_id and d.tender_id = s.tender_id) then
    raise exception 'QTO_SOURCE_INVALID: select a drawing revision of this tender' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.qto_measurement_rule_versions where id = p_ruleset_version_id and status = 'approved') then
    raise exception 'QTO_RULESET_INVALID: select an approved measurement ruleset version' using errcode = 'P0001';
  end if;

  select count(*) into v_bad from unnest(coalesce(p_carry_item_ids, '{}')) x(id)
   where not exists (select 1 from public.qto_items i where i.id = x.id and i.session_version_id = v_parent.id and not i.is_deleted);
  if v_bad > 0 then
    raise exception 'QTO_VALIDATION: % carried item(s) do not belong to version %', v_bad, v_parent.version_no
      using errcode = 'P0001';
  end if;

  v_baseline := coalesce(p_baseline_version_id,
    (select version_id from public.qto_publications where session_id = s.id order by published_at desc limit 1),
    v_parent.id);
  select coalesce(max(version_no), 0) + 1 into v_no from public.qto_session_versions where session_id = s.id;

  insert into public.qto_session_versions (tenant_id, session_id, version_no, parent_version_id, baseline_version_id,
                                           reason, drawing_revision_id, ruleset_version_id, status)
  values (s.tenant_id, s.id, v_no, v_parent.id, v_baseline, trim(p_reason), p_drawing_revision_id,
          p_ruleset_version_id, 'DRAFT')
  returning id into v_version;

  -- Copy the chosen items with their factors, calculations, lines, measurements and BOQ links.
  create temp table if not exists qto_carry_map (old_id uuid primary key, new_id uuid not null) on commit drop;
  delete from qto_carry_map;
  insert into qto_carry_map (old_id, new_id)
  select x.id, gen_random_uuid() from unnest(coalesce(p_carry_item_ids, '{}')) x(id);

  insert into public.qto_items (id, tender_id, qto_no, building, discipline, work_section, element, item_code,
    description, unit, quantity, measurement_method, source_type, confidence, drawing_id, drawing_revision_id,
    page_no, grid_location, detail_ref, specification_ref, status, revision_no, is_locked, assumption,
    prepared_by, prepared_date, remarks, session_version_id, tenant_id, quantity_status, exclusion_reason,
    provisional_assumption, wbs_node_id, budget_code_id, level, zone, rule_code, gross_qty, deduction_qty,
    factor_product, carried_from_item_id, carry_status)
  select m.new_id, i.tender_id, i.qto_no, i.building, i.discipline, i.work_section, i.element, i.item_code,
    i.description, i.unit, i.quantity, i.measurement_method, i.source_type, i.confidence, i.drawing_id,
    i.drawing_revision_id, i.page_no, i.grid_location, i.detail_ref, i.specification_ref, 'DRAFT', i.revision_no,
    false, i.assumption, i.prepared_by, i.prepared_date, i.remarks, v_version, i.tenant_id, i.quantity_status,
    i.exclusion_reason, i.provisional_assumption, i.wbs_node_id, i.budget_code_id, i.level, i.zone, i.rule_code,
    i.gross_qty, i.deduction_qty, i.factor_product, i.id, 'UNVERIFIED'
  from public.qto_items i join qto_carry_map m on m.old_id = i.id;

  insert into public.qto_item_factors (tenant_id, item_id, factor_name, factor_value, sequence, reason, created_by)
  select f.tenant_id, m.new_id, f.factor_name, f.factor_value, f.sequence, f.reason, f.created_by
  from public.qto_item_factors f join qto_carry_map m on m.old_id = f.item_id;

  create temp table if not exists qto_carry_meas (old_id uuid primary key, new_id uuid not null) on commit drop;
  delete from qto_carry_meas;
  insert into qto_carry_meas (old_id, new_id)
  select ms.id, gen_random_uuid() from public.qto_measurements ms join qto_carry_map m on m.old_id = ms.qto_item_id;
  insert into public.qto_measurements (id, qto_item_id, drawing_revision_id, drawing_id, page_no, measure_type, points,
    length, area, count, unit, scale_calibration, label, created_by, tenant_id, calibration_id)
  select mm.new_id, m.new_id, ms.drawing_revision_id, ms.drawing_id, ms.page_no, ms.measure_type, ms.points,
    ms.length, ms.area, ms.count, ms.unit, ms.scale_calibration, ms.label, ms.created_by, ms.tenant_id, ms.calibration_id
  from public.qto_measurements ms join qto_carry_map m on m.old_id = ms.qto_item_id
  join qto_carry_meas mm on mm.old_id = ms.id;

  create temp table if not exists qto_carry_calc (old_id uuid primary key, new_id uuid not null) on commit drop;
  delete from qto_carry_calc;
  insert into qto_carry_calc (old_id, new_id)
  select c.id, gen_random_uuid() from public.qto_calculations c join qto_carry_map m on m.old_id = c.qto_item_id;
  insert into public.qto_calculations (id, qto_item_id, formula, display_text, result, method, created_by, tenant_id)
  select cc.new_id, m.new_id, c.formula, c.display_text, c.result, c.method, c.created_by, c.tenant_id
  from public.qto_calculations c join qto_carry_map m on m.old_id = c.qto_item_id
  join qto_carry_calc cc on cc.old_id = c.id;
  insert into public.qto_calculation_lines (calculation_id, seq, sign, description, amount, unit, measurement_id, source)
  select cc.new_id, l.seq, l.sign, l.description, l.amount, l.unit, mm.new_id, l.source
  from public.qto_calculation_lines l join qto_carry_calc cc on cc.old_id = l.calculation_id
  left join qto_carry_meas mm on mm.old_id = l.measurement_id;

  insert into public.qto_boq_links (qto_item_id, boq_item_id, quantity, created_by)
  select m.new_id, b.boq_item_id, b.quantity, auth.uid()
  from public.qto_boq_links b join qto_carry_map m on m.old_id = b.qto_item_id
  on conflict do nothing;

  update public.qto_sessions set current_version_id = v_version where id = s.id;
  insert into public.qto_version_reviews (tenant_id, version_id, from_status, to_status, comment)
  values (s.tenant_id, v_version, null, 'DRAFT',
          format('Version %s created from v%s (%s items carried forward): %s', v_no, v_parent.version_no,
                 coalesce(array_length(p_carry_item_ids, 1), 0), trim(p_reason)));
  return v_version;
end $$;

-- 9.3 Server-side blocking checks used before submission. Returns one row per problem.
create or replace function public.qto_version_blocking_problems(p_version_id uuid)
returns table (item_id uuid, code text, message text)
language sql stable security definer set search_path = public as $$
  select null::uuid, 'MISSING_SOURCE', 'The version has no source drawing revision'
    from public.qto_session_versions where id = p_version_id and drawing_revision_id is null
  union all
  select null::uuid, 'MISSING_RULESET', 'The version has no measurement ruleset'
    from public.qto_session_versions where id = p_version_id and ruleset_version_id is null
  union all
  select null::uuid, 'NO_ITEMS', 'The version has no take-off items'
    where not exists (select 1 from public.qto_items where session_version_id = p_version_id and not is_deleted)
  union all
  select i.id, 'ITEM_INCOMPLETE', i.qto_no || ': description, unit and work section are required'
    from public.qto_items i
   where i.session_version_id = p_version_id and not i.is_deleted
     and (length(trim(coalesce(i.description, ''))) = 0 or i.unit is null
          or length(trim(coalesce(i.work_section, ''))) = 0)
  union all
  select i.id, 'ITEM_NO_SOURCE', i.qto_no || ': no drawing revision recorded as evidence'
    from public.qto_items i
   where i.session_version_id = p_version_id and not i.is_deleted and i.drawing_revision_id is null
  union all
  select i.id, 'EXCLUDED_NO_REASON', i.qto_no || ': excluded items need an exclusion reason'
    from public.qto_items i
   where i.session_version_id = p_version_id and not i.is_deleted and i.quantity_status = 'EXCLUDED'
     and length(trim(coalesce(i.exclusion_reason, ''))) = 0
  union all
  select i.id, 'PROVISIONAL_NO_ASSUMPTION', i.qto_no || ': provisional items need a documented assumption'
    from public.qto_items i
   where i.session_version_id = p_version_id and not i.is_deleted and i.quantity_status = 'PROVISIONAL'
     and length(trim(coalesce(i.provisional_assumption, ''))) = 0
  union all
  select q.item_id, 'OPEN_BLOCKING_ISSUE', q.message
    from public.qto_issues q
   where q.version_id = p_version_id and q.severity = 'BLOCKING' and q.status = 'open'
$$;

-- 9.4 Workflow transitions. PUBLISHED goes through qto_publish_version.
create or replace function public.qto_version_transition(
  p_version_id uuid,
  p_to_status  text,
  p_comment    text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v       public.qto_session_versions%rowtype;
  v_ok    boolean;
  v_count int;
  v_first text;
begin
  select * into v from public.qto_session_versions where id = p_version_id for update;
  if not found or not public.qto_tenant_ok(v.tenant_id) then
    raise exception 'QTO_NOT_FOUND: version not found' using errcode = 'P0001';
  end if;

  v_ok := (v.status, p_to_status) in (
    ('DRAFT', 'IN_PROGRESS'), ('DRAFT', 'CANCELLED'),
    ('IN_PROGRESS', 'SUBMITTED_FOR_REVIEW'), ('IN_PROGRESS', 'CANCELLED'),
    ('SUBMITTED_FOR_REVIEW', 'APPROVED'), ('SUBMITTED_FOR_REVIEW', 'CHANGES_REQUESTED'),
    ('CHANGES_REQUESTED', 'IN_PROGRESS'), ('CHANGES_REQUESTED', 'CANCELLED'));
  if not v_ok then
    raise exception 'QTO_INVALID_TRANSITION: % → % is not allowed', v.status, p_to_status using errcode = 'P0001';
  end if;

  if p_to_status = 'IN_PROGRESS' then
    perform public.qto_require_permission('qto_sessions', 'edit');
  elsif p_to_status = 'SUBMITTED_FOR_REVIEW' then
    perform public.qto_require_permission('qto_sessions', 'submit');
    select count(*), min(message) into v_count, v_first from public.qto_version_blocking_problems(p_version_id);
    if v_count > 0 then
      raise exception 'QTO_BLOCKING_ISSUES: % blocking problem(s), e.g. %', v_count, v_first using errcode = 'P0001';
    end if;
    update public.qto_session_versions
       set submitted_by = auth.uid(), submitted_at = now(), engine_version = coalesce(engine_version,
           (select engine_version from public.qto_calculation_runs r join public.qto_items i on i.id = r.item_id
             where i.session_version_id = v.id order by r.created_at desc limit 1))
     where id = v.id;
  elsif p_to_status in ('APPROVED', 'CHANGES_REQUESTED') then
    perform public.qto_require_permission('qto_approval', 'approve');
    if v.submitted_by = auth.uid() then
      raise exception 'QTO_SELF_APPROVAL: you submitted this version, so another reviewer must decide'
        using errcode = 'P0001';
    end if;
    if p_to_status = 'CHANGES_REQUESTED' and length(trim(coalesce(p_comment, ''))) = 0 then
      raise exception 'QTO_VALIDATION: say which changes are needed' using errcode = 'P0001';
    end if;
    if p_to_status = 'APPROVED' then
      update public.qto_session_versions set approved_by = auth.uid(), approved_at = now() where id = v.id;
    end if;
  elsif p_to_status = 'CANCELLED' then
    perform public.qto_require_permission('qto_sessions', 'delete');
    if length(trim(coalesce(p_comment, ''))) = 0 then
      raise exception 'QTO_VALIDATION: give the reason for cancelling' using errcode = 'P0001';
    end if;
    update public.qto_session_versions
       set cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = trim(p_comment)
     where id = v.id;
  end if;

  update public.qto_session_versions set status = p_to_status where id = v.id;
  insert into public.qto_version_reviews (tenant_id, version_id, from_status, to_status, comment)
  values (v.tenant_id, v.id, v.status, p_to_status, nullif(trim(coalesce(p_comment, '')), ''));
  return p_to_status;
end $$;

-- 9.5 Canonical snapshot of a version (items ordered by qto_no, keys in jsonb order).
create or replace function public.qto_build_snapshot(p_version_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'schema', 'dcos.qto.snapshot/1',
    'session', jsonb_build_object('id', s.id, 'code', s.session_code, 'name', s.name, 'purpose', s.purpose,
                                  'tender_id', s.tender_id, 'project_id', s.project_id, 'trade', s.trade,
                                  'building', s.building),
    'version', jsonb_build_object('id', v.id, 'no', v.version_no, 'parent_version_id', v.parent_version_id,
                                  'baseline_version_id', v.baseline_version_id, 'reason', v.reason,
                                  'engine_version', v.engine_version, 'submitted_by', v.submitted_by,
                                  'approved_by', v.approved_by, 'approved_at', v.approved_at),
    'source', jsonb_build_object('drawing_revision_id', r.id, 'drawing_id', d.id, 'drawing_no', d.drawing_no,
                                 'revision', r.revision, 'document_revision_id', r.document_revision_id),
    'ruleset', jsonb_build_object('version_id', rv.id, 'ruleset_code', rs.code, 'version_no', rv.version_no),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'qto_no', i.qto_no, 'item_code', i.item_code, 'description', i.description,
        'unit', i.unit, 'quantity', i.quantity, 'gross_qty', i.gross_qty, 'deduction_qty', i.deduction_qty,
        'factor_product', i.factor_product, 'quantity_status', i.quantity_status,
        'exclusion_reason', i.exclusion_reason, 'provisional_assumption', i.provisional_assumption,
        'building', i.building, 'level', i.level, 'zone', i.zone, 'discipline', i.discipline,
        'work_section', i.work_section, 'element', i.element, 'wbs_node_id', i.wbs_node_id,
        'budget_code_id', i.budget_code_id, 'rule_code', i.rule_code,
        'drawing_revision_id', i.drawing_revision_id, 'page_no', i.page_no, 'grid_location', i.grid_location,
        'carried_from_item_id', i.carried_from_item_id, 'carry_status', i.carry_status,
        'prepared_by', i.prepared_by,
        'factors', coalesce((select jsonb_agg(jsonb_build_object('name', f.factor_name, 'value', f.factor_value)
                                              order by f.sequence, f.factor_name)
                             from public.qto_item_factors f where f.item_id = i.id), '[]'::jsonb),
        'calculation', (select jsonb_build_object('run_id', c.id, 'engine_version', c.engine_version,
                                                  'expression', c.expression, 'inputs', c.inputs, 'gross', c.gross,
                                                  'deductions', c.deductions, 'net', c.net,
                                                  'factor_product', c.factor_product, 'result', c.result,
                                                  'rounding', c.rounding)
                        from public.qto_calculation_runs c where c.item_id = i.id
                        order by c.created_at desc, c.id limit 1),
        'boq_item_ids', coalesce((select jsonb_agg(b.boq_item_id order by b.boq_item_id)
                                  from public.qto_boq_links b where b.qto_item_id = i.id), '[]'::jsonb)
      ) order by i.qto_no, i.id)
      from public.qto_items i where i.session_version_id = v.id and not i.is_deleted), '[]'::jsonb)
  )
  from public.qto_session_versions v
  join public.qto_sessions s on s.id = v.session_id
  left join public.qto_drawing_revisions r on r.id = v.drawing_revision_id
  left join public.qto_drawing_register d on d.id = r.drawing_id
  left join public.qto_measurement_rule_versions rv on rv.id = v.ruleset_version_id
  left join public.qto_measurement_rulesets rs on rs.id = rv.ruleset_id
  where v.id = p_version_id
$$;

create or replace function public.qto_snapshot_hash(p_snapshot jsonb)
returns text language sql immutable as $$
  select encode(sha256(convert_to(p_snapshot::text, 'UTF8')), 'hex')
$$;

-- 9.6 Publish an approved version as an immutable baseline.
create or replace function public.qto_publish_version(p_version_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v        public.qto_session_versions%rowtype;
  v_snap   jsonb;
  v_pub    uuid;
begin
  perform public.qto_require_permission('qto_publish', 'approve');
  select * into v from public.qto_session_versions where id = p_version_id for update;
  if not found or not public.qto_tenant_ok(v.tenant_id) then
    raise exception 'QTO_NOT_FOUND: version not found' using errcode = 'P0001';
  end if;
  if v.status <> 'APPROVED' then
    raise exception 'QTO_INVALID_TRANSITION: only an approved version can be published (it is %)', v.status
      using errcode = 'P0001';
  end if;

  v_snap := public.qto_build_snapshot(v.id);
  insert into public.qto_publications (tenant_id, version_id, session_id, snapshot, snapshot_hash, item_count)
  values (v.tenant_id, v.id, v.session_id, v_snap, public.qto_snapshot_hash(v_snap),
          jsonb_array_length(v_snap -> 'items'))
  returning id into v_pub;

  update public.qto_session_versions
     set status = 'PUBLISHED', published_by = auth.uid(), published_at = now()
   where id = v.id;
  insert into public.qto_version_reviews (tenant_id, version_id, from_status, to_status, comment)
  values (v.tenant_id, v.id, 'APPROVED', 'PUBLISHED', 'Published baseline ' || left(public.qto_snapshot_hash(v_snap), 12));
  return v_pub;
end $$;

-- 9.7 Transfer a publication's quantities into the tender BOQ. Idempotent by key; a failure is
-- recorded (status 'failed', error) and nothing in the BOQ changes.
create or replace function public.qto_transfer_to_tender_boq(
  p_publication_id      uuid,
  p_tender_id           uuid,
  p_idempotency_key     text,
  p_include_provisional boolean default false,
  p_allow_overwrite     boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p          public.qto_publications%rowtype;
  v_existing public.qto_transfers%rowtype;
  v_id       uuid := gen_random_uuid();
  v_lines    jsonb := '[]'::jsonb;
  v_conflict text;
  v_sort     int;
  g          record;
  v_line     uuid;
  v_prev     numeric;
  v_last     numeric;
begin
  perform public.qto_require_permission('qto_transfer', 'submit');
  select * into p from public.qto_publications where id = p_publication_id;
  if not found or not public.qto_tenant_ok(p.tenant_id) then
    raise exception 'QTO_NOT_FOUND: publication not found' using errcode = 'P0001';
  end if;

  select * into v_existing from public.qto_transfers
   where idempotency_key = p_idempotency_key and status = 'succeeded';
  if found then
    if v_existing.publication_id <> p_publication_id then
      raise exception 'QTO_IDEMPOTENCY_KEY_REUSED: this key belongs to another publication' using errcode = 'P0001';
    end if;
    return to_jsonb(v_existing) || jsonb_build_object('replayed', true);
  end if;

  begin
    if p_tender_id is distinct from (p.snapshot -> 'session' ->> 'tender_id')::uuid then
      raise exception 'QTO_TARGET_INVALID: P0 transfers only to the tender BOQ of the session''s own tender';
    end if;

    create temp table if not exists qto_xfer_items (
      item_id uuid, boq_item_id uuid, grp text, section text, item_code text, description text, unit text,
      quantity numeric, building text, level text, discipline text, wbs_node_id uuid, budget_code_id uuid
    ) on commit drop;
    delete from qto_xfer_items;

    insert into qto_xfer_items
    -- Target line: the BOQ line mapped before publication, else the line an earlier transfer created.
    select (it ->> 'id')::uuid,
           coalesce(
             (select b.id from public.tender_boq_items b
               where b.tender_id = p_tender_id
                 and b.id in (select (x #>> '{}')::uuid from jsonb_array_elements(it -> 'boq_item_ids') x)
               order by b.id limit 1),
             (select b.id from public.qto_boq_links l join public.tender_boq_items b on b.id = l.boq_item_id
               where l.qto_item_id = (it ->> 'id')::uuid and l.transfer_id is not null and b.tender_id = p_tender_id
               order by l.created_at, b.id limit 1)),
           null,
           coalesce(nullif(it ->> 'work_section', ''), 'Quantity Take-off'),
           coalesce(nullif(it ->> 'item_code', ''), it ->> 'qto_no'),
           it ->> 'description', it ->> 'unit', (it ->> 'quantity')::numeric,
           nullif(it ->> 'building', ''), nullif(it ->> 'level', ''), nullif(it ->> 'discipline', ''),
           (it ->> 'wbs_node_id')::uuid, (it ->> 'budget_code_id')::uuid
      from jsonb_array_elements(p.snapshot -> 'items') it
     where it ->> 'quantity_status' = 'FIRM'
        or (p_include_provisional and it ->> 'quantity_status' = 'PROVISIONAL');

    if not exists (select 1 from qto_xfer_items) then
      raise exception 'QTO_NOTHING_TO_TRANSFER: the publication has no eligible (firm%) items',
        case when p_include_provisional then ' or provisional' else '' end;
    end if;

    update qto_xfer_items set grp = case when boq_item_id is not null then 'L:' || boq_item_id::text
      else 'N:' || md5(section || '|' || item_code || '|' || coalesce(description, '') || '|' || unit) end;

    -- Overwrite protection for existing lines.
    for g in select boq_item_id, sum(quantity) as qty from qto_xfer_items where boq_item_id is not null group by 1 loop
      select quantity into v_prev from public.tender_boq_items where id = g.boq_item_id for update;
      select (l ->> 'new_qty')::numeric into v_last
        from public.qto_transfers t, jsonb_array_elements(t.lines) l
       where t.status = 'succeeded' and t.target_tender_id = p_tender_id and l ->> 'boq_item_id' = g.boq_item_id::text
       order by t.created_at desc limit 1;
      if not p_allow_overwrite and v_prev <> g.qty
         and ((v_last is not null and v_prev <> v_last) or (v_last is null and v_prev <> 0)) then
        v_conflict := concat_ws('; ', v_conflict, format('line %s holds %s, not set by a QTO transfer', g.boq_item_id, v_prev));
      end if;
    end loop;
    if v_conflict is not null then
      raise exception 'QTO_TRANSFER_CONFLICT: %. Re-run with overwrite allowed if this is intended', v_conflict;
    end if;

    for g in select boq_item_id, sum(quantity) as qty, array_agg(item_id) as items
               from qto_xfer_items where boq_item_id is not null group by 1 loop
      select quantity into v_prev from public.tender_boq_items where id = g.boq_item_id;
      update public.tender_boq_items set quantity = g.qty where id = g.boq_item_id;
      v_lines := v_lines || jsonb_build_object('boq_item_id', g.boq_item_id, 'action',
                   case when v_prev = g.qty then 'unchanged' else 'updated' end,
                   'previous_qty', v_prev, 'new_qty', g.qty, 'item_ids', to_jsonb(g.items));
    end loop;

    select coalesce(max(sort_order), 0) into v_sort from public.tender_boq_items where tender_id = p_tender_id;
    for g in select grp, min(section) as section, min(item_code) as item_code, min(description) as description,
                    min(unit) as unit, sum(quantity) as qty, min(building) as building, min(level) as level,
                    min(discipline) as discipline, (array_agg(wbs_node_id))[1] as wbs_node_id,
                    (array_agg(budget_code_id))[1] as budget_code_id, array_agg(item_id) as items
               from qto_xfer_items where boq_item_id is null group by grp order by min(item_code) loop
      v_sort := v_sort + 10;
      insert into public.tender_boq_items (tender_id, section, item_code, description, unit, quantity, discipline,
                                           building_code, level, wbs_node_id, budget_code_id, sort_order)
      values (p_tender_id, g.section, g.item_code, coalesce(g.description, g.item_code), g.unit, g.qty, g.discipline,
              coalesce(g.building, 'BA'), coalesce(g.level, 'All'), g.wbs_node_id, g.budget_code_id, v_sort)
      returning id into v_line;
      update qto_xfer_items set boq_item_id = v_line where grp = g.grp;
      v_lines := v_lines || jsonb_build_object('boq_item_id', v_line, 'action', 'created',
                   'previous_qty', null, 'new_qty', g.qty, 'item_ids', to_jsonb(g.items));
    end loop;

    insert into public.qto_boq_links (qto_item_id, boq_item_id, quantity, created_by, transfer_id)
    select item_id, boq_item_id, quantity, auth.uid(), v_id from qto_xfer_items
    on conflict (qto_item_id, boq_item_id) do update set quantity = excluded.quantity, transfer_id = excluded.transfer_id;

    insert into public.qto_transfers (id, tenant_id, publication_id, target, target_tender_id, idempotency_key,
                                      include_provisional, allow_overwrite, status, lines)
    values (v_id, p.tenant_id, p.id, 'tender_boq', p_tender_id, p_idempotency_key, p_include_provisional,
            p_allow_overwrite, 'succeeded', v_lines);
  exception when others then
    insert into public.qto_transfers (tenant_id, publication_id, target, target_tender_id, idempotency_key,
                                      include_provisional, allow_overwrite, status, error)
    values (p.tenant_id, p.id, 'tender_boq', coalesce(p_tender_id, (p.snapshot -> 'session' ->> 'tender_id')::uuid),
            p_idempotency_key, p_include_provisional, p_allow_overwrite, 'failed', sqlerrm)
    returning id into v_id;
  end;

  return (select to_jsonb(t) || jsonb_build_object('replayed', false) from public.qto_transfers t where t.id = v_id);
end $$;

-- 9.8 Save a calibration (deactivates the previous one for the same revision and page).
create or replace function public.qto_save_calibration(
  p_drawing_revision_id uuid,
  p_page_no             integer,
  p_points              jsonb,
  p_pixel_distance      numeric,
  p_known_distance      numeric,
  p_known_unit          text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_id     uuid;
  v_metres numeric;
begin
  perform public.qto_require_permission('qto_workspace', 'edit');
  v_tenant := public.qto_require_tenant();
  if p_known_unit not in ('mm', 'cm', 'm') then
    raise exception 'QTO_VALIDATION: calibration unit must be mm, cm or m' using errcode = 'P0001';
  end if;
  if coalesce(p_pixel_distance, 0) <= 0 or coalesce(p_known_distance, 0) <= 0 then
    raise exception 'QTO_VALIDATION: calibration distances must be greater than zero' using errcode = 'P0001';
  end if;
  v_metres := p_known_distance * case p_known_unit when 'mm' then 0.001 when 'cm' then 0.01 else 1 end;

  update public.qto_drawing_calibrations set is_active = false
   where drawing_revision_id = p_drawing_revision_id and page_no = coalesce(p_page_no, 1) and is_active;
  insert into public.qto_drawing_calibrations (tenant_id, drawing_revision_id, page_no, points, pixel_distance,
                                               known_distance, known_unit, metres_per_unit)
  values (v_tenant, p_drawing_revision_id, coalesce(p_page_no, 1), p_points, p_pixel_distance, p_known_distance,
          p_known_unit, v_metres / p_pixel_distance)
  returning id into v_id;
  return v_id;
end $$;

-- 9.9 Record a calculation run and set the item's quantities from it, atomically.
create or replace function public.qto_record_calculation(p_item_id uuid, p_run jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  i      public.qto_items%rowtype;
  v_id   uuid;
  v_ver  public.qto_session_versions%rowtype;
begin
  perform public.qto_require_permission('qto_workspace', 'edit');
  select * into i from public.qto_items where id = p_item_id for update;
  if not found or not public.qto_tenant_ok(i.tenant_id) then
    raise exception 'QTO_NOT_FOUND: item not found' using errcode = 'P0001';
  end if;
  if not public.qto_version_is_editable(i.session_version_id) then
    raise exception 'QTO_LOCKED: this take-off version is under review or published' using errcode = 'P0001';
  end if;
  if coalesce(p_run ->> 'valid', 'true') <> 'true' then
    raise exception 'QTO_INVALID_CALCULATION: % ', coalesce(p_run ->> 'errors', 'invalid') using errcode = 'P0001';
  end if;
  if (p_run ->> 'unit') is distinct from i.unit then
    raise exception 'QTO_UNIT_MISMATCH: the calculation is in % but the item is in %', p_run ->> 'unit', i.unit
      using errcode = 'P0001';
  end if;
  select * into v_ver from public.qto_session_versions where id = i.session_version_id;

  insert into public.qto_calculation_runs (tenant_id, item_id, version_id, rule_version_id, rule_code, engine_version,
    expression, inputs, gross, deductions, net, factor_product, result, unit, rounding, valid, errors)
  values (i.tenant_id, i.id, i.session_version_id, v_ver.ruleset_version_id, p_run ->> 'rule_code',
          p_run ->> 'engine_version', p_run ->> 'expression', coalesce(p_run -> 'inputs', '[]'::jsonb),
          (p_run ->> 'gross')::numeric, coalesce((p_run ->> 'deductions')::numeric, 0), (p_run ->> 'net')::numeric,
          coalesce((p_run ->> 'factor_product')::numeric, 1), (p_run ->> 'result')::numeric, p_run ->> 'unit',
          p_run -> 'rounding', true, '[]'::jsonb)
  returning id into v_id;

  update public.qto_items
     set gross_qty = (p_run ->> 'gross')::numeric,
         deduction_qty = coalesce((p_run ->> 'deductions')::numeric, 0),
         factor_product = coalesce((p_run ->> 'factor_product')::numeric, 1),
         quantity = (p_run ->> 'result')::numeric,
         rule_code = coalesce(p_run ->> 'rule_code', rule_code),
         carry_status = case when carry_status is not null then 'REMEASURED' else carry_status end
   where id = i.id;
  return v_id;
end $$;

-- 9.10 Store the result of a validation run. Open issues are updated in place (no duplicates);
-- issues that are no longer detected are resolved automatically.
create or replace function public.qto_sync_issues(p_version_id uuid, p_issues jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v        public.qto_session_versions%rowtype;
  v_open   int;
  v_closed int;
begin
  perform public.qto_require_permission('qto_workspace', 'edit');
  select * into v from public.qto_session_versions where id = p_version_id;
  if not found or not public.qto_tenant_ok(v.tenant_id) then
    raise exception 'QTO_NOT_FOUND: version not found' using errcode = 'P0001';
  end if;
  if not public.qto_version_is_editable(v.id) then
    raise exception 'QTO_LOCKED: validation results are frozen once a version is submitted' using errcode = 'P0001';
  end if;

  insert into public.qto_issues (tenant_id, version_id, item_id, rule_code, severity, message, evidence, fingerprint)
  select v.tenant_id, v.id, (x ->> 'item_id')::uuid, x ->> 'rule_code', x ->> 'severity', x ->> 'message',
         x -> 'evidence', x ->> 'fingerprint'
    from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb)) x
  on conflict (version_id, fingerprint) where status <> 'resolved'
  do update set message = excluded.message, severity = excluded.severity, evidence = excluded.evidence,
                item_id = excluded.item_id, rule_code = excluded.rule_code;

  update public.qto_issues q
     set status = 'resolved', resolution = 'No longer detected by validation', resolved_by = auth.uid(), resolved_at = now()
   where q.version_id = v.id and q.status <> 'resolved'
     and q.fingerprint not in (select x ->> 'fingerprint' from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb)) x);
  get diagnostics v_closed = row_count;

  select count(*) into v_open from public.qto_issues where version_id = v.id and status = 'open';
  return jsonb_build_object('open', v_open, 'resolved', v_closed);
end $$;

-- 9.11 Acknowledge a warning with a justification (blocking errors cannot be acknowledged).
create or replace function public.qto_acknowledge_issue(p_issue_id uuid, p_justification text)
returns void
language plpgsql security definer set search_path = public as $$
declare q public.qto_issues%rowtype;
begin
  perform public.qto_require_permission('qto_sessions', 'edit');
  select * into q from public.qto_issues where id = p_issue_id for update;
  if not found or not public.qto_tenant_ok(q.tenant_id) then
    raise exception 'QTO_NOT_FOUND: issue not found' using errcode = 'P0001';
  end if;
  if q.severity <> 'WARNING' then
    raise exception 'QTO_BLOCKING: a blocking error must be fixed, not acknowledged' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_justification, ''))) = 0 then
    raise exception 'QTO_VALIDATION: give a justification' using errcode = 'P0001';
  end if;
  if not public.qto_version_is_editable(q.version_id) then
    raise exception 'QTO_LOCKED: the version is not editable' using errcode = 'P0001';
  end if;
  update public.qto_issues
     set status = 'acknowledged', justification = trim(p_justification), acknowledged_by = auth.uid(), acknowledged_at = now()
   where id = q.id;
end $$;

-- Execute rights: signed-in users only (each function checks permissions itself).
do $$
declare f text;
begin
  foreach f in array array[
    'qto_create_session(uuid,text,uuid,uuid,text,text,text,text,uuid,text)',
    'qto_create_version(uuid,text,uuid,uuid,uuid[],uuid)',
    'qto_version_transition(uuid,text,text)',
    'qto_publish_version(uuid)',
    'qto_transfer_to_tender_boq(uuid,uuid,text,boolean,boolean)',
    'qto_save_calibration(uuid,integer,jsonb,numeric,numeric,text)',
    'qto_record_calculation(uuid,jsonb)',
    'qto_sync_issues(uuid,jsonb)',
    'qto_acknowledge_issue(uuid,text)',
    'qto_version_blocking_problems(uuid)',
    'qto_build_snapshot(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
