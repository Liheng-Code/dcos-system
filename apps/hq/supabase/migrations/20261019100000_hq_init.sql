-- DCOS HQ control plane, Phase 2 MVP. Design:
-- docs/01-DCOS-Foundation/DCOS-Licensing-Control-Plane-Design.md section 3.
--
-- This is HQ's own database (Supabase project "dcos-hq"), never a tenant database.
-- All tables are reached only through the HQ server (service role) after it has
-- checked the caller's hq_role, so RLS is on with no client policies.
--
-- MVP simplifications against design 3.1 (recorded in the design doc):
--   * a license revision stores its frozen entitlement set in columns
--     (modules, features, limit_*) instead of license_entitlements rows;
--     plans likewise (plans.modules, ...) instead of plan_entitlements;
--   * support and maintenance dates sit on the license revision;
--   * no approvals, usage, heartbeats, releases or notifications yet (Phase 3).

create extension if not exists pgcrypto;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create table public.hq_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null,
  hq_role text not null check (hq_role in ('owner', 'license_admin', 'account_manager', 'support', 'ops', 'viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Customers and their deployments
-- ---------------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{1,19}$'),
  legal_name text not null,
  display_name text not null,
  country text,
  billing_email text,
  tax_id text,
  status text not null default 'prospect' check (status in ('prospect', 'trial', 'customer', 'suspended', 'churned')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tenant_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text not null default 'technical' check (role in ('billing', 'technical', 'license_admin', 'executive')),
  receives_license_notices boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tenant_contacts (tenant_id);

-- One running DCOS instance. deployment_code is the token's aud and the tenant's
-- DCOS_DEPLOYMENT_ID.
create table public.tenant_deployments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  deployment_code text not null unique check (deployment_code ~ '^dep_[a-z0-9_]{3,40}$'),
  environment text not null default 'production' check (environment in ('production', 'staging', 'demo')),
  topology text not null default 'saas_dedicated' check (topology in ('saas_dedicated', 'on_prem')),
  base_url text,
  supabase_project_ref text,
  region text,
  app_version text,
  last_heartbeat_at timestamptz,
  status text not null default 'provisioning' check (status in ('provisioning', 'healthy', 'degraded', 'unreachable', 'decommissioned')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tenant_deployments (tenant_id);

-- ---------------------------------------------------------------------------
-- Catalogue (global, no tenant_id: decision 17)
-- ---------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_]{2,20}$'),
  display_name text not null,
  license_type_default text not null default 'subscription' check (license_type_default in ('trial', 'subscription', 'enterprise')),
  default_duration_months integer not null default 12 check (default_duration_months between 1 and 60),
  modules text[] not null default '{}',
  features text[] not null default '{}',
  limit_users integer check (limit_users >= 0),
  limit_viewers integer check (limit_viewers >= 0),
  limit_projects integer check (limit_projects >= 0),
  grace_days integer not null default 14 check (grace_days between 0 and 180),
  readonly_days integer not null default 30 check (readonly_days between 0 and 180),
  support_tier text not null default 'standard' check (support_tier in ('standard', 'premium')),
  list_price numeric(18,2),
  price_period text check (price_period in ('monthly', 'annual', 'one_time')),
  currency char(3) not null default 'USD',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.signing_keys (
  id uuid primary key default gen_random_uuid(),
  kid text not null unique,
  public_key text not null, -- Ed25519, base64url (JWK x)
  algorithm text not null default 'EdDSA' check (algorithm = 'EdDSA'),
  status text not null default 'active' check (status in ('active', 'retiring', 'retired', 'compromised')),
  dev_only boolean not null default false,
  activated_at timestamptz not null default now(),
  retire_after timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Commercial contract and the technical grant
-- ---------------------------------------------------------------------------
create sequence public.subscription_number_seq;
create sequence public.license_number_seq;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  number text not null unique default ('SUB-' || lpad(nextval('public.subscription_number_seq')::text, 6, '0')),
  plan_id uuid references public.plans(id),
  type text not null check (type in ('trial', 'subscription', 'enterprise')),
  status text not null default 'active' check (status in ('draft', 'active', 'past_due', 'cancelled', 'ended')),
  start_date date not null,
  current_period_end date not null,
  auto_renew boolean not null default false,
  net_amount numeric(18,2),
  currency char(3) not null default 'USD',
  po_reference text,
  external_billing_ref text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.subscriptions (tenant_id);

-- One row per revision. `number` is stable across revisions of the same license;
-- a new revision supersedes the previous one and nothing is edited in place once
-- issued (design 3.3).
create table public.licenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  deployment_id uuid not null references public.tenant_deployments(id),
  subscription_id uuid references public.subscriptions(id),
  number text not null,
  revision integer not null check (revision >= 1),
  type text not null check (type in ('trial', 'subscription', 'enterprise')),
  plan_id uuid references public.plans(id),
  status text not null default 'draft' check (status in ('draft', 'active', 'suspended', 'revoked', 'superseded', 'terminated', 'discarded')),
  hq_state text not null default 'active' check (hq_state in ('active', 'suspended', 'revoked', 'terminated')),
  valid_from date not null,
  valid_until date not null,
  grace_days integer not null check (grace_days between 0 and 180),
  readonly_days integer not null check (readonly_days between 0 and 180),
  modules text[] not null default '{}',
  features text[] not null default '{}',
  limit_users integer check (limit_users >= 0),
  limit_viewers integer check (limit_viewers >= 0),
  limit_projects integer check (limit_projects >= 0),
  support_tier text not null default 'standard' check (support_tier in ('standard', 'premium')),
  support_until date,
  maintenance_until date,
  suspend_mode text check (suspend_mode in ('readonly', 'locked')),
  notice text,
  change_reason text, -- why this revision exists (issue, renewal, plan change, suspension ...)
  supersedes_license_id uuid references public.licenses(id),
  issued_at timestamptz,
  issued_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (number, revision),
  check (valid_until >= valid_from)
);
create index on public.licenses (tenant_id);
create index on public.licenses (deployment_id, status);
create index on public.licenses (valid_until);
-- At most one live (active or suspended) revision per deployment.
create unique index licenses_one_live_per_deployment
  on public.licenses (deployment_id) where status in ('active', 'suspended');

create table public.license_tokens (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id),
  tenant_id uuid not null references public.tenants(id),
  jti text not null unique,
  kid text not null references public.signing_keys(kid),
  profile text not null check (profile in ('online', 'offline')),
  token text not null,
  claims jsonb not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text,
  delivered_at timestamptz,
  created_by uuid references auth.users(id)
);
create index on public.license_tokens (license_id);
create index on public.license_tokens (tenant_id);

-- ---------------------------------------------------------------------------
-- Append-only history
-- ---------------------------------------------------------------------------
create table public.license_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  license_id uuid references public.licenses(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id),
  occurred_at timestamptz not null default now()
);
create index on public.license_events (tenant_id, occurred_at desc);
create index on public.license_events (license_id);

create table public.hq_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  tenant_id uuid references public.tenants(id),
  before jsonb,
  after jsonb,
  occurred_at timestamptz not null default now()
);
create index on public.hq_audit_log (occurred_at desc);
create index on public.hq_audit_log (tenant_id);

create or replace function public.reject_change() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger license_events_append_only before update or delete on public.license_events
  for each row execute function public.reject_change();
create trigger hq_audit_log_append_only before update or delete on public.hq_audit_log
  for each row execute function public.reject_change();

-- An issued revision is frozen: only its lifecycle columns may change afterwards.
create or replace function public.licenses_freeze_issued() returns trigger
language plpgsql as $$
begin
  if old.status <> 'draft' and (
       new.modules is distinct from old.modules or new.features is distinct from old.features
       or new.limit_users is distinct from old.limit_users or new.limit_viewers is distinct from old.limit_viewers
       or new.limit_projects is distinct from old.limit_projects or new.valid_from is distinct from old.valid_from
       or new.valid_until is distinct from old.valid_until or new.grace_days is distinct from old.grace_days
       or new.readonly_days is distinct from old.readonly_days or new.hq_state is distinct from old.hq_state
       or new.number is distinct from old.number or new.revision is distinct from old.revision
       or new.deployment_id is distinct from old.deployment_id) then
    raise exception 'License % revision % is issued and cannot be edited; create a new revision', old.number, old.revision;
  end if;
  return new;
end;
$$;
create trigger licenses_freeze_issued before update on public.licenses
  for each row execute function public.licenses_freeze_issued();

-- updated_at
create trigger hq_users_updated_at before update on public.hq_users for each row execute function public.set_updated_at();
create trigger tenants_updated_at before update on public.tenants for each row execute function public.set_updated_at();
create trigger tenant_contacts_updated_at before update on public.tenant_contacts for each row execute function public.set_updated_at();
create trigger tenant_deployments_updated_at before update on public.tenant_deployments for each row execute function public.set_updated_at();
create trigger plans_updated_at before update on public.plans for each row execute function public.set_updated_at();
create trigger signing_keys_updated_at before update on public.signing_keys for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger licenses_updated_at before update on public.licenses for each row execute function public.set_updated_at();

-- License numbers: DCOS-L-000001, shared by all revisions of one license.
create or replace function public.next_license_number() returns text
language sql as $$
  select 'DCOS-L-' || lpad(nextval('public.license_number_seq')::text, 6, '0');
$$;

-- RLS on, no client policies: only the HQ server (service role) reads and writes.
alter table public.hq_users enable row level security;
alter table public.tenants enable row level security;
alter table public.tenant_contacts enable row level security;
alter table public.tenant_deployments enable row level security;
alter table public.plans enable row level security;
alter table public.signing_keys enable row level security;
alter table public.subscriptions enable row level security;
alter table public.licenses enable row level security;
alter table public.license_tokens enable row level security;
alter table public.license_events enable row level security;
alter table public.hq_audit_log enable row level security;
