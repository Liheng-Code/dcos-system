# 04 — Database Schema
## DCOS Stakeholder Management Module

| Field | Value |
|---|---|
| Document Code | DCOS-STK-DB-001 |
| Module | Stakeholder Management (Module 04 — Foundation) |
| Version | R1.0 |
| Status | Issued for Review |
| Author Role | Senior System Architect / Database Engineer |
| Date | 2026-08-08 |
| Target Platform | PostgreSQL 15 on Supabase |
| Related Documents | DCOS-STK-FS-001, DCOS-STK-RBAC-001, DCOS-STK-API-001, DCOS-STK-DEP-001 |

---

## 1. Schema Design Principles

| Principle | Rule |
|---|---|
| Tenant isolation | Every table carries `tenant_id uuid NOT NULL` with an RLS policy. No exceptions. |
| Deny by default | RLS is `FORCE`d; the application role never bypasses it. Only the migration role may. |
| No hard deletes | Business records are soft-deleted via `deleted_at`. History tables are append-only. |
| Append-only history | `stakeholder_status_history` and `stakeholder_performance_events` have no UPDATE or DELETE grants. |
| Snapshots over joins | Workflow actions store the actor's name, role, and authority as they were at that moment. Joins reflect today; audits need then. |
| Normalised identity | Duplicate and blacklist matching runs against a generated normalised column, not the display name. |
| Optimistic concurrency | Every mutable table carries `version integer` incremented by trigger. |
| Timestamps | `timestamptz` throughout, stored UTC. |
| Identifiers | `uuid` primary keys, `gen_random_uuid()` default. |

### 1.1 Naming Conventions

`snake_case` plural tables, `snake_case` singular columns, `UPPER_SNAKE_CASE` enum values, index prefix `idx_`, unique index prefix `uq_`, constraint prefix `chk_`, foreign key prefix `fk_`.

---

## 2. Entity Relationship Diagram

```
                            ┌──────────────────┐
                            │   stakeholders   │
                            │  (organisation)  │
                            └────────┬─────────┘
             ┌──────────────┬────────┼─────────┬──────────────┬──────────────┐
             ▼              ▼        ▼         ▼              ▼              ▼
   stakeholder_       stakeholder_  stakeholder_  stakeholder_   stakeholder_  stakeholder_
    contacts          addresses     documents     status_history  blacklist_    performance_
        │                                                         records       scores
        │                                                                          ▲
        │                            ┌──────────────────────┐                      │
        └───────────────────────────►│ project_stakeholders │◄─────────────────────┘
                                     │     (assignment)     │
                                     └──────────┬───────────┘
        ┌───────────────┬─────────────┬─────────┼──────────────┬────────────────┐
        ▼               ▼             ▼         ▼              ▼                ▼
 stakeholder_    stakeholder_   stakeholder_  stakeholder_  stakeholder_   stakeholder_
 project_roles   approval_      access_       wbs_scopes    workflow_      performance_
                 authorities    scopes                      responsibilities  events
                       │
                       ▼
        ┌──────────────────────────┐
        │  stakeholder_user_links  │──► auth.users (Module 02)
        └──────────────────────────┘

External references (not owned by this module):
  tenants(id) · projects(id) · wbs_nodes(id) · disciplines(code) · auth.users(id)
```

---

## 3. Enum Definitions

Decision: **native PostgreSQL enums** are used for closed, slow-changing value sets (status, access level, approval level). **Reference tables** are used for sets that tenants may extend (compliance document types, project roles). Rationale: native enums give database-level integrity and better index behaviour, but require a migration to extend — acceptable for governance-critical sets, unacceptable for tenant-configurable ones.

```sql
CREATE TYPE stakeholder_type_enum AS ENUM (
  'CLIENT_OWNER', 'CONSULTANT', 'ARCHITECT_DESIGNER', 'MAIN_CONTRACTOR',
  'SUBCONTRACTOR', 'SUPPLIER_VENDOR', 'AUTHORITY', 'TESTING_AGENCY',
  'UTILITY_AUTHORITY', 'INSURANCE_BONDING', 'INTERNAL_DEPARTMENT', 'JV_PARTNER'
);

CREATE TYPE stakeholder_status_enum AS ENUM (
  'DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'BLACKLISTED'
);

CREATE TYPE assignment_status_enum AS ENUM (
  'DRAFT', 'PENDING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'TERMINATED'
);

CREATE TYPE approval_level_enum AS ENUM (
  'NO_APPROVAL', 'REVIEW_ONLY', 'APPROVE', 'FINAL_APPROVE'
);

CREATE TYPE access_level_enum AS ENUM (
  'FULL_ACCESS', 'LIMITED_ACCESS', 'READ_ONLY'
);

CREATE TYPE workflow_responsibility_enum AS ENUM (
  'TASK_EXECUTION', 'DOCUMENT_REVIEW', 'RFI_RESPONSE', 'INSPECTION_APPROVAL',
  'PROCUREMENT_INVOLVEMENT', 'PAYMENT_CERTIFICATION', 'SAFETY_OVERSIGHT',
  'DESIGN_COORDINATION'
);

CREATE TYPE external_user_link_status_enum AS ENUM (
  'INVITED', 'ACTIVE', 'EXPIRED', 'REVOKED'
);

CREATE TYPE address_type_enum AS ENUM (
  'REGISTERED_OFFICE', 'CORRESPONDENCE', 'SITE_OFFICE', 'WAREHOUSE'
);

CREATE TYPE blacklist_reason_enum AS ENUM (
  'CONTRACT_DEFAULT', 'FRAUD', 'REGULATORY_VIOLATION', 'SAFETY_VIOLATION',
  'QUALITY_FAILURE', 'FINANCIAL_FAILURE', 'OTHER'
);
```

### 3.1 Shared Normalisation Function

```sql
-- Used for duplicate detection and blacklist identity matching (BRL-STK-018).
CREATE OR REPLACE FUNCTION stk_normalise_name(p_name text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT regexp_replace(
           regexp_replace(
             lower(coalesce(p_name, '')),
             '\y(co|ltd|limited|inc|incorporated|llc|plc|pte|sdn|bhd|corp|corporation|company|group|holdings|enterprise|trading)\y',
             '', 'g'
           ),
           '[^a-z0-9]', '', 'g'
         );
$$;
```

---

## 4. Table Specifications

### 4.1 `stakeholders`

**Purpose.** The organisation master record. One row per legal entity per tenant. Owns identity, classification, and lifecycle status.

| Column | Type | Null | Default | Description |
|---|---|---|---|---|
| id | uuid | No | `gen_random_uuid()` | Primary key |
| tenant_id | uuid | No | — | Owning tenant |
| stakeholder_code | text | Yes | — | Human-readable code, unique per tenant |
| stakeholder_type | stakeholder_type_enum | No | — | Classification |
| legal_name | text | No | — | Registered legal name, as entered |
| trading_name | text | Yes | — | Trading or display name |
| normalised_name | text | No | generated | `stk_normalise_name(legal_name)` — matching key |
| registration_number | text | Yes | — | Company registration number |
| tax_id | text | Yes | — | Tax identification number |
| country_code | char(2) | No | `'KH'` | ISO 3166-1 alpha-2 |
| default_currency | char(3) | No | `'USD'` | ISO 4217 |
| website | text | Yes | — | Organisation website |
| is_internal | boolean | No | `false` | True only for `INTERNAL_DEPARTMENT` |
| status | stakeholder_status_enum | No | `'DRAFT'` | Lifecycle status |
| is_preferred | boolean | No | `false` | Preferred flag on top of `ACTIVE` |
| pq_status | text | Yes | — | Mirror from Module 17; read-only here |
| pq_expiry_date | date | Yes | — | Mirror from Module 17 |
| reliability_score | numeric(5,2) | Yes | — | Denormalised tenant-wide latest score |
| notes | text | Yes | — | Internal notes, masked from external roles |
| version | integer | No | `1` | Optimistic concurrency |
| created_by | uuid | No | — | Creator user |
| created_at | timestamptz | No | `now()` | |
| updated_by | uuid | Yes | — | |
| updated_at | timestamptz | No | `now()` | |
| deleted_at | timestamptz | Yes | — | Soft delete marker |

**Constraints:** PK `id`; `uq_stakeholders_identity` unique on `(tenant_id, normalised_name, coalesce(registration_number,''))` where `deleted_at IS NULL`; `uq_stakeholders_reg` unique on `(tenant_id, registration_number)` where `registration_number IS NOT NULL AND deleted_at IS NULL`; `chk_stakeholders_internal_type` ensures `is_internal` true only for `INTERNAL_DEPARTMENT`; `chk_stakeholders_preferred` ensures `is_preferred` false unless `status = 'ACTIVE'`.

```sql
CREATE TABLE stakeholders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  stakeholder_code    text,
  stakeholder_type    stakeholder_type_enum NOT NULL,
  legal_name          text NOT NULL,
  trading_name        text,
  normalised_name     text GENERATED ALWAYS AS (stk_normalise_name(legal_name)) STORED,
  registration_number text,
  tax_id              text,
  country_code        char(2) NOT NULL DEFAULT 'KH',
  default_currency    char(3) NOT NULL DEFAULT 'USD',
  website             text,
  is_internal         boolean NOT NULL DEFAULT false,
  status              stakeholder_status_enum NOT NULL DEFAULT 'DRAFT',
  is_preferred        boolean NOT NULL DEFAULT false,
  pq_status           text,
  pq_expiry_date      date,
  reliability_score   numeric(5,2),
  notes               text,
  version             integer NOT NULL DEFAULT 1,
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT chk_stakeholders_name_len   CHECK (char_length(legal_name) BETWEEN 2 AND 200),
  CONSTRAINT chk_stakeholders_internal   CHECK (is_internal = false OR stakeholder_type = 'INTERNAL_DEPARTMENT'),
  CONSTRAINT chk_stakeholders_preferred  CHECK (is_preferred = false OR status = 'ACTIVE'),
  CONSTRAINT chk_stakeholders_score      CHECK (reliability_score IS NULL OR reliability_score BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX uq_stakeholders_identity
  ON stakeholders (tenant_id, normalised_name, coalesce(registration_number, ''))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_stakeholders_reg
  ON stakeholders (tenant_id, registration_number)
  WHERE registration_number IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX uq_stakeholders_code
  ON stakeholders (tenant_id, stakeholder_code)
  WHERE stakeholder_code IS NOT NULL AND deleted_at IS NULL;

-- Register list: tenant + type filter + status, the default screen query (FR-STK-001/002)
CREATE INDEX idx_stakeholders_tenant_type_status
  ON stakeholders (tenant_id, stakeholder_type, status)
  WHERE deleted_at IS NULL;

-- Instant search on organisation name (FR-STK-003, NFR-STK-02)
CREATE INDEX idx_stakeholders_name_trgm
  ON stakeholders USING gin (legal_name gin_trgm_ops);

-- Fuzzy duplicate detection on the normalised key (FR-STK-008)
CREATE INDEX idx_stakeholders_norm_trgm
  ON stakeholders USING gin (normalised_name gin_trgm_ops);

-- Blacklist identity lookup on create (FR-STK-009)
CREATE INDEX idx_stakeholders_blacklisted
  ON stakeholders (tenant_id, normalised_name)
  WHERE status = 'BLACKLISTED';

ALTER TABLE stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholders FORCE ROW LEVEL SECURITY;
CREATE POLICY stakeholders_tenant_isolation ON stakeholders
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

### 4.2 `stakeholder_contacts`

**Purpose.** Named individuals within a stakeholder organisation. Supports Latin and Khmer script names, per FR-STK-015.

```sql
CREATE TABLE stakeholder_contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  stakeholder_id      uuid NOT NULL REFERENCES stakeholders(id) ON DELETE RESTRICT,
  full_name           text NOT NULL,
  full_name_local     text,                      -- Khmer or other local script
  position_title      text,
  discipline_code     text,                      -- ARC / STR / MEP / CIV / QS / ALL
  email               text,
  phone               text,
  mobile              text,
  telegram_handle     text,
  preferred_channel   text NOT NULL DEFAULT 'EMAIL',   -- EMAIL | TELEGRAM | PHONE | IN_APP
  preferred_language  char(2) NOT NULL DEFAULT 'en',
  is_primary          boolean NOT NULL DEFAULT false,
  is_active           boolean NOT NULL DEFAULT true,
  deactivated_reason  text,
  version             integer NOT NULL DEFAULT 1,
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT chk_contacts_email      CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT chk_contacts_channel    CHECK (preferred_channel IN ('EMAIL','TELEGRAM','PHONE','IN_APP')),
  CONSTRAINT chk_contacts_deact      CHECK (is_active = true OR deactivated_reason IS NOT NULL)
);

-- Exactly one primary contact per stakeholder (FR-STK-016)
CREATE UNIQUE INDEX uq_contacts_primary
  ON stakeholder_contacts (stakeholder_id)
  WHERE is_primary = true AND deleted_at IS NULL;

-- Email unique within the stakeholder
CREATE UNIQUE INDEX uq_contacts_email
  ON stakeholder_contacts (stakeholder_id, lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_contacts_stakeholder
  ON stakeholder_contacts (tenant_id, stakeholder_id)
  WHERE deleted_at IS NULL AND is_active = true;

-- Contact-name search feeds the register's instant search (FR-STK-003)
CREATE INDEX idx_contacts_name_trgm
  ON stakeholder_contacts USING gin (full_name gin_trgm_ops);

ALTER TABLE stakeholder_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY contacts_tenant_isolation ON stakeholder_contacts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

### 4.3 `stakeholder_addresses`

**Purpose.** Multiple typed addresses per organisation, exactly one primary (FR-STK-014).

```sql
CREATE TABLE stakeholder_addresses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  stakeholder_id  uuid NOT NULL REFERENCES stakeholders(id) ON DELETE RESTRICT,
  address_type    address_type_enum NOT NULL,
  address_line1   text NOT NULL,
  address_line2   text,
  city            text,
  province        text,
  postal_code     text,
  country_code    char(2) NOT NULL DEFAULT 'KH',
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  is_primary      boolean NOT NULL DEFAULT false,
  version         integer NOT NULL DEFAULT 1,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE UNIQUE INDEX uq_addresses_primary
  ON stakeholder_addresses (stakeholder_id)
  WHERE is_primary = true AND deleted_at IS NULL;

CREATE INDEX idx_addresses_stakeholder
  ON stakeholder_addresses (tenant_id, stakeholder_id) WHERE deleted_at IS NULL;

ALTER TABLE stakeholder_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_addresses FORCE ROW LEVEL SECURITY;
CREATE POLICY addresses_tenant_isolation ON stakeholder_addresses
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

### 4.4 `stakeholder_documents`

**Purpose.** Compliance document register with expiry tracking (FR-STK-018 to 022). Files live in object storage; this table holds metadata and the storage key only.

```sql
CREATE TABLE stakeholder_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  stakeholder_id      uuid NOT NULL REFERENCES stakeholders(id) ON DELETE RESTRICT,
  document_type_code  text NOT NULL,             -- FK to stk_document_types (reference table)
  reference_number    text,
  issuing_authority   text,
  issue_date          date,
  expiry_date         date,
  is_mandatory        boolean NOT NULL DEFAULT false,
  storage_key         text NOT NULL,             -- tenant/{tenant_id}/stakeholders/{id}/...
  file_name           text NOT NULL,
  file_size_bytes     bigint NOT NULL,
  mime_type           text NOT NULL,
  file_hash_sha256    text NOT NULL,
  virus_scan_status   text NOT NULL DEFAULT 'PENDING',  -- PENDING | CLEAN | INFECTED
  superseded_by_id    uuid REFERENCES stakeholder_documents(id),
  version             integer NOT NULL DEFAULT 1,
  created_by          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  CONSTRAINT chk_docs_dates   CHECK (expiry_date IS NULL OR issue_date IS NULL OR expiry_date > issue_date),
  CONSTRAINT chk_docs_size    CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400),
  CONSTRAINT chk_docs_mime    CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  CONSTRAINT chk_docs_scan    CHECK (virus_scan_status IN ('PENDING','CLEAN','INFECTED'))
);

-- Daily expiry scan (FR-STK-020): current, mandatory, dated, not superseded
CREATE INDEX idx_docs_expiry_scan
  ON stakeholder_documents (tenant_id, expiry_date)
  WHERE deleted_at IS NULL AND superseded_by_id IS NULL AND expiry_date IS NOT NULL;

CREATE INDEX idx_docs_stakeholder
  ON stakeholder_documents (tenant_id, stakeholder_id, document_type_code)
  WHERE deleted_at IS NULL;

ALTER TABLE stakeholder_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_tenant_isolation ON stakeholder_documents
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

### 4.5 `project_stakeholders`

**Purpose.** The assignment — the single most important table in the module. One row per organisation per project engagement. Everything about authority, access, and responsibility hangs off this row.

```sql
CREATE TABLE project_stakeholders (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id),
  project_id                  uuid NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
  stakeholder_id              uuid NOT NULL REFERENCES stakeholders(id) ON DELETE RESTRICT,
  project_role_code           text NOT NULL,     -- FK to stk_project_roles (reference table)
  discipline_code             text NOT NULL DEFAULT 'ALL',
  contractual_representative_id uuid REFERENCES stakeholder_contacts(id),
  contract_reference          text,
  planned_start_date          date,
  planned_end_date            date,
  actual_end_date             date,
  status                      assignment_status_enum NOT NULL DEFAULT 'DRAFT',
  status_reason               text,
  activated_at                timestamptz,
  terminated_at               timestamptz,
  termination_reason          text,
  version                     integer NOT NULL DEFAULT 1,
  created_by                  uuid NOT NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_by                  uuid,
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  deleted_at                  timestamptz,
  CONSTRAINT chk_ps_dates       CHECK (planned_end_date IS NULL OR planned_start_date IS NULL
                                       OR planned_end_date >= planned_start_date),
  CONSTRAINT chk_ps_terminated  CHECK (status <> 'TERMINATED' OR termination_reason IS NOT NULL),
  CONSTRAINT chk_ps_activated   CHECK (status <> 'ACTIVE' OR activated_at IS NOT NULL)
);

-- BRL-STK-005: no duplicate live assignment of an organisation to a project
CREATE UNIQUE INDEX uq_project_stakeholder_live
  ON project_stakeholders (project_id, stakeholder_id)
  WHERE deleted_at IS NULL AND status NOT IN ('TERMINATED','COMPLETED');

-- Hot query: all live assignments on a project (resolution service entry point)
CREATE INDEX idx_ps_project_active
  ON project_stakeholders (tenant_id, project_id, status)
  WHERE deleted_at IS NULL AND status = 'ACTIVE';

-- Reverse lookup: every project a stakeholder is on (used by suspend/blacklist cascade)
CREATE INDEX idx_ps_stakeholder
  ON project_stakeholders (tenant_id, stakeholder_id, status) WHERE deleted_at IS NULL;

-- Discipline-scoped resolution
CREATE INDEX idx_ps_project_discipline
  ON project_stakeholders (project_id, discipline_code)
  WHERE deleted_at IS NULL AND status = 'ACTIVE';

ALTER TABLE project_stakeholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_stakeholders FORCE ROW LEVEL SECURITY;
CREATE POLICY ps_tenant_isolation ON project_stakeholders
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

### 4.6 `stakeholder_project_roles`

**Purpose.** Reference table of project role codes, tenant-extensible (e.g. Employer, PMC, Lead Consultant, Blockwork Subcontractor).

```sql
CREATE TABLE stakeholder_project_roles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  role_code            text NOT NULL,
  role_name            text NOT NULL,
  applicable_types     stakeholder_type_enum[] NOT NULL,
  is_unique_per_project boolean NOT NULL DEFAULT false,  -- e.g. only one Employer
  is_system            boolean NOT NULL DEFAULT false,   -- seeded roles cannot be deleted
  sort_order           integer NOT NULL DEFAULT 0,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_project_roles_code ON stakeholder_project_roles (tenant_id, role_code);

ALTER TABLE stakeholder_project_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_project_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY roles_tenant_isolation ON stakeholder_project_roles
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

### 4.7 `stakeholder_approval_authorities`

**Purpose.** Authority granted to an assignment, optionally scoped by module and entity type, with a mandatory fallback for approval-bearing levels (FR-STK-031 to 035).

```sql
CREATE TABLE stakeholder_approval_authorities (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id),
  assignment_id          uuid NOT NULL REFERENCES project_stakeholders(id) ON DELETE CASCADE,
  module_code            text NOT NULL DEFAULT 'ALL',   -- DOC | QAQC | PROC | ACC | ALL
  entity_type            text NOT NULL DEFAULT 'ALL',
  workflow_step_code     text NOT NULL DEFAULT 'ALL',
  approval_level         approval_level_enum NOT NULL,
  threshold_amount       numeric(18,2),
  threshold_currency     char(3),
  fallback_assignment_id uuid REFERENCES project_stakeholders(id),
  delegated_to_assignment_id uuid REFERENCES project_stakeholders(id),
  delegation_start_date  date,
  delegation_end_date    date,
  change_reason          text,
  version                integer NOT NULL DEFAULT 1,
  created_by             uuid NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz,
  -- Thresholds only make sense on APPROVE (FR-STK-032)
  CONSTRAINT chk_auth_threshold  CHECK (threshold_amount IS NULL OR approval_level = 'APPROVE'),
  CONSTRAINT chk_auth_threshold_ccy CHECK ((threshold_amount IS NULL) = (threshold_currency IS NULL)),
  -- Fallback cannot be self (FR-STK-033)
  CONSTRAINT chk_auth_fallback   CHECK (fallback_assignment_id IS DISTINCT FROM assignment_id),
  -- Delegation is bounded (FR-STK-035)
  CONSTRAINT chk_auth_deleg      CHECK (delegated_to_assignment_id IS NULL
                                        OR (delegation_start_date IS NOT NULL
                                            AND delegation_end_date IS NOT NULL
                                            AND delegation_end_date > delegation_start_date
                                            AND delegation_end_date <= delegation_start_date + INTERVAL '90 days'))
);

-- One authority row per assignment per scope triple
CREATE UNIQUE INDEX uq_auth_scope
  ON stakeholder_approval_authorities (assignment_id, module_code, entity_type, workflow_step_code)
  WHERE deleted_at IS NULL;

-- The single hottest resolution query (FR-STK-060, NFR-STK-05)
CREATE INDEX idx_auth_resolution
  ON stakeholder_approval_authorities (assignment_id, module_code, entity_type, approval_level)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_auth_fallback
  ON stakeholder_approval_authorities (fallback_assignment_id) WHERE fallback_assignment_id IS NOT NULL;

ALTER TABLE stakeholder_approval_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_approval_authorities FORCE ROW LEVEL SECURITY;
CREATE POLICY auth_tenant_isolation ON stakeholder_approval_authorities
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

### 4.8 `stakeholder_access_scopes`

**Purpose.** Access level and module scope per assignment. Enforces BRL-STK-006 at the database level, not only in the application.

```sql
CREATE TABLE stakeholder_access_scopes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES tenants(id),
  assignment_id         uuid NOT NULL REFERENCES project_stakeholders(id) ON DELETE CASCADE,
  access_level          access_level_enum NOT NULL,
  allowed_module_codes  text[] NOT NULL DEFAULT '{}',
  max_confidentiality_tier smallint NOT NULL DEFAULT 1,  -- 1 public/issued .. 4 internal-commercial
  is_external           boolean NOT NULL,                -- denormalised from stakeholder for the CHECK
  change_reason         text,
  version               integer NOT NULL DEFAULT 1,
  created_by            uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz,
  -- BRL-STK-006: external stakeholders can never hold FULL_ACCESS
  CONSTRAINT chk_access_external_not_full
    CHECK (NOT (is_external = true AND access_level = 'FULL_ACCESS')),
  -- LIMITED_ACCESS requires at least one module (FR-STK-037)
  CONSTRAINT chk_access_limited_modules
    CHECK (access_level <> 'LIMITED_ACCESS' OR cardinality(allowed_module_codes) > 0),
  -- External parties can never reach the internal-commercial tier
  CONSTRAINT chk_access_tier
    CHECK (max_confidentiality_tier BETWEEN 1 AND 4
           AND (is_external = false OR max_confidentiality_tier <= 2))
);

CREATE UNIQUE INDEX uq_access_assignment
  ON stakeholder_access_scopes (assignment_id) WHERE deleted_at IS NULL;

CREATE INDEX idx_access_modules
  ON stakeholder_access_scopes USING gin (allowed_module_codes);

ALTER TABLE stakeholder_access_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_access_scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY access_tenant_isolation ON stakeholder_access_scopes
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

**Design note.** `is_external` is denormalised from `stakeholders.is_internal` because PostgreSQL CHECK constraints cannot reference another table. A trigger keeps it synchronised; the constraint then enforces BRL-STK-006 at the storage layer, so even a defective API release cannot grant an external party full access.

---

### 4.9 `stakeholder_wbs_scopes`

**Purpose.** WBS-node restrictions. A grant covers the node and all descendants, never ancestors or siblings (BRL-STK-007). Descendant coverage is evaluated using the WBS materialised path.

```sql
CREATE TABLE stakeholder_wbs_scopes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  assignment_id  uuid NOT NULL REFERENCES project_stakeholders(id) ON DELETE CASCADE,
  wbs_node_id    uuid NOT NULL REFERENCES wbs_nodes(id) ON DELETE RESTRICT,
  wbs_path       ltree NOT NULL,          -- materialised path snapshot for fast descendant checks
  grant_type     text NOT NULL DEFAULT 'INCLUDE',   -- INCLUDE | EXCLUDE
  created_by     uuid NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  CONSTRAINT chk_wbs_grant CHECK (grant_type IN ('INCLUDE','EXCLUDE'))
);

CREATE UNIQUE INDEX uq_wbs_scope
  ON stakeholder_wbs_scopes (assignment_id, wbs_node_id) WHERE deleted_at IS NULL;

-- Descendant containment check: is the requested node covered by any grant?
CREATE INDEX idx_wbs_scope_path
  ON stakeholder_wbs_scopes USING gist (wbs_path) WHERE deleted_at IS NULL;

CREATE INDEX idx_wbs_scope_assignment
  ON stakeholder_wbs_scopes (assignment_id) WHERE deleted_at IS NULL;

-- Blocks WBS node deletion while a scope grant exists (UC-STK-004 E3)
CREATE INDEX idx_wbs_scope_node
  ON stakeholder_wbs_scopes (wbs_node_id) WHERE deleted_at IS NULL;

ALTER TABLE stakeholder_wbs_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_wbs_scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY wbs_scope_tenant_isolation ON stakeholder_wbs_scopes
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

**Coverage predicate used by the access check (FR-STK-039):**

```sql
-- A node is in scope when a grant path is an ancestor-or-self of the node path,
-- and no EXCLUDE grant is closer.
SELECT EXISTS (
  SELECT 1 FROM stakeholder_wbs_scopes s
  WHERE s.assignment_id = $1
    AND s.deleted_at IS NULL
    AND s.grant_type = 'INCLUDE'
    AND $2::ltree <@ s.wbs_path
) AND NOT EXISTS (
  SELECT 1 FROM stakeholder_wbs_scopes x
  WHERE x.assignment_id = $1
    AND x.deleted_at IS NULL
    AND x.grant_type = 'EXCLUDE'
    AND $2::ltree <@ x.wbs_path
);
```

---

### 4.10 `stakeholder_workflow_responsibilities`

**Purpose.** Participation toggles per assignment (FR-STK-042 to 044).

```sql
CREATE TABLE stakeholder_workflow_responsibilities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id),
  assignment_id    uuid NOT NULL REFERENCES project_stakeholders(id) ON DELETE CASCADE,
  responsibility   workflow_responsibility_enum NOT NULL,
  is_enabled       boolean NOT NULL DEFAULT true,
  enabled_by       uuid NOT NULL,
  enabled_at       timestamptz NOT NULL DEFAULT now(),
  disabled_by      uuid,
  disabled_at      timestamptz,
  CONSTRAINT chk_resp_disabled CHECK (is_enabled = true OR disabled_at IS NOT NULL)
);

CREATE UNIQUE INDEX uq_responsibility
  ON stakeholder_workflow_responsibilities (assignment_id, responsibility);

-- Resolution filter: which assignments participate in document review on this project?
CREATE INDEX idx_resp_lookup
  ON stakeholder_workflow_responsibilities (assignment_id, responsibility)
  WHERE is_enabled = true;

ALTER TABLE stakeholder_workflow_responsibilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_workflow_responsibilities FORCE ROW LEVEL SECURITY;
CREATE POLICY resp_tenant_isolation ON stakeholder_workflow_responsibilities
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

### 4.11 `stakeholder_performance_events`

**Purpose.** Append-only ledger of objective performance events emitted by other modules (FR-STK-055). Never updated, never deleted.

```sql
CREATE TABLE stakeholder_performance_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  stakeholder_id    uuid NOT NULL REFERENCES stakeholders(id),
  assignment_id     uuid REFERENCES project_stakeholders(id),
  project_id        uuid REFERENCES projects(id),
  event_type        text NOT NULL,   -- RESPONSE_COMPLETED | APPROVAL_DECIDED | TASK_COMPLETED | DOC_REVIEWED
  source_module     text NOT NULL,
  source_entity_type text NOT NULL,
  source_entity_id  uuid NOT NULL,
  assigned_at       timestamptz NOT NULL,
  completed_at      timestamptz,
  sla_days          numeric(6,2),
  elapsed_days      numeric(8,2),
  is_within_sla     boolean,
  context_note      text,            -- e.g. "delay client-caused" (UC-STK-014 E1)
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_perf_elapsed CHECK (elapsed_days IS NULL OR elapsed_days >= 0)
);

-- Rolling 12-month window aggregation (FR-STK-056)
CREATE INDEX idx_perf_events_window
  ON stakeholder_performance_events (tenant_id, stakeholder_id, created_at DESC);

CREATE INDEX idx_perf_events_project
  ON stakeholder_performance_events (project_id, stakeholder_id, event_type);

-- Idempotency: one event per source entity per type
CREATE UNIQUE INDEX uq_perf_event_source
  ON stakeholder_performance_events (source_module, source_entity_type, source_entity_id, event_type);

ALTER TABLE stakeholder_performance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_performance_events FORCE ROW LEVEL SECURITY;
CREATE POLICY perf_events_tenant_isolation ON stakeholder_performance_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

REVOKE UPDATE, DELETE ON stakeholder_performance_events FROM dcos_app;
```

---

### 4.12 `stakeholder_performance_scores`

**Purpose.** Nightly computed rollup (FR-STK-056). Never manually editable (BRL-STK-017).

```sql
CREATE TABLE stakeholder_performance_scores (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  uuid NOT NULL REFERENCES tenants(id),
  stakeholder_id             uuid NOT NULL REFERENCES stakeholders(id),
  project_id                 uuid REFERENCES projects(id),   -- NULL = tenant-wide rollup
  period_start               date NOT NULL,
  period_end                 date NOT NULL,
  event_count                integer NOT NULL DEFAULT 0,
  avg_response_days          numeric(8,2),
  avg_approval_delay_days    numeric(8,2),
  task_completion_rate       numeric(5,2),
  doc_turnaround_compliance  numeric(5,2),
  reliability_score          numeric(5,2),
  is_sufficient_data         boolean NOT NULL DEFAULT false,  -- false when event_count < 10
  computed_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_score_range  CHECK (reliability_score IS NULL OR reliability_score BETWEEN 0 AND 100),
  CONSTRAINT chk_score_period CHECK (period_end > period_start)
);

CREATE UNIQUE INDEX uq_perf_score
  ON stakeholder_performance_scores (stakeholder_id, coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid), period_end);

-- Register filter by score band (FR-STK-004)
CREATE INDEX idx_perf_score_band
  ON stakeholder_performance_scores (tenant_id, reliability_score)
  WHERE project_id IS NULL AND is_sufficient_data = true;

ALTER TABLE stakeholder_performance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_performance_scores FORCE ROW LEVEL SECURITY;
CREATE POLICY perf_scores_tenant_isolation ON stakeholder_performance_scores
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

REVOKE INSERT, UPDATE, DELETE ON stakeholder_performance_scores FROM dcos_app;
GRANT  INSERT, UPDATE          ON stakeholder_performance_scores TO dcos_scheduler;
```

---

### 4.13 `stakeholder_status_history`

**Purpose.** Append-only record of every status transition on a stakeholder or an assignment (FR-STK-053). Survives deletion of the business record.

```sql
CREATE TABLE stakeholder_status_history (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  entity_type        text NOT NULL,        -- STAKEHOLDER | ASSIGNMENT
  entity_id          uuid NOT NULL,
  stakeholder_id     uuid,                 -- denormalised for fast filtering
  project_id         uuid,
  status_from        text,
  status_to          text NOT NULL,
  reason_code        text,
  reason_text        text,
  entity_snapshot    jsonb NOT NULL,       -- record state at transition (survives deletion)
  actor_user_id      uuid,
  actor_name_snapshot text NOT NULL,
  actor_role_snapshot text NOT NULL,
  correlation_id     text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_hist_entity CHECK (entity_type IN ('STAKEHOLDER','ASSIGNMENT'))
);

CREATE INDEX idx_status_hist_entity
  ON stakeholder_status_history (entity_type, entity_id, created_at DESC);

CREATE INDEX idx_status_hist_stakeholder
  ON stakeholder_status_history (tenant_id, stakeholder_id, created_at DESC);

CREATE INDEX idx_status_hist_project
  ON stakeholder_status_history (project_id, created_at DESC) WHERE project_id IS NOT NULL;

ALTER TABLE stakeholder_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_status_history FORCE ROW LEVEL SECURITY;
CREATE POLICY status_hist_tenant_isolation ON stakeholder_status_history
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

REVOKE UPDATE, DELETE ON stakeholder_status_history FROM dcos_app;
```

---

### 4.14 `stakeholder_blacklist_records`

**Purpose.** The blacklist index and its evidence. Retained permanently, including after a blacklist is lifted, so that the history of the decision survives (FR-STK-051, 052).

```sql
CREATE TABLE stakeholder_blacklist_records (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id),
  stakeholder_id          uuid NOT NULL REFERENCES stakeholders(id),
  normalised_name_snapshot text NOT NULL,     -- frozen at blacklist time for variant matching
  registration_number_snapshot text,
  reason_category         blacklist_reason_enum NOT NULL,
  reason_text             text NOT NULL,
  evidence_reference      text NOT NULL,      -- document id or contract notice reference
  blacklisted_by          uuid NOT NULL,
  blacklisted_at          timestamptz NOT NULL DEFAULT now(),
  confirmed_name_typed    text NOT NULL,      -- proof of two-step confirmation
  is_active               boolean NOT NULL DEFAULT true,
  lifted_by               uuid,
  lifted_at               timestamptz,
  lift_justification      text,
  CONSTRAINT chk_bl_lift CHECK (is_active = true
                                OR (lifted_by IS NOT NULL AND lift_justification IS NOT NULL)),
  CONSTRAINT chk_bl_reason_len CHECK (char_length(reason_text) >= 20)
);

-- Identity-variant lookup on registration attempts (FR-STK-009)
CREATE INDEX idx_blacklist_identity
  ON stakeholder_blacklist_records (tenant_id, normalised_name_snapshot) WHERE is_active = true;

CREATE INDEX idx_blacklist_identity_trgm
  ON stakeholder_blacklist_records USING gin (normalised_name_snapshot gin_trgm_ops);

CREATE UNIQUE INDEX uq_blacklist_active
  ON stakeholder_blacklist_records (stakeholder_id) WHERE is_active = true;

ALTER TABLE stakeholder_blacklist_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_blacklist_records FORCE ROW LEVEL SECURITY;
CREATE POLICY blacklist_tenant_isolation ON stakeholder_blacklist_records
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

REVOKE DELETE ON stakeholder_blacklist_records FROM dcos_app;
```

---

### 4.15 `stakeholder_user_links`

**Purpose.** Maps a stakeholder contact to a platform identity, scoped to one assignment. This is the only bridge between the stakeholder domain and the identity domain (FR-STK-045 to 048).

```sql
CREATE TABLE stakeholder_user_links (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenants(id),
  stakeholder_id     uuid NOT NULL REFERENCES stakeholders(id),
  contact_id         uuid NOT NULL REFERENCES stakeholder_contacts(id),
  assignment_id      uuid NOT NULL REFERENCES project_stakeholders(id) ON DELETE RESTRICT,
  user_id            uuid,                    -- auth.users(id), null until invitation accepted
  external_role_code text NOT NULL,           -- CLIENT | CONSULTANT | SUBCONTRACTOR | SUPPLIER
  status             external_user_link_status_enum NOT NULL DEFAULT 'INVITED',
  invitation_token_hash text,
  invited_at         timestamptz,
  invitation_expires_at timestamptz,
  accepted_at        timestamptz,
  revoked_at         timestamptz,
  revoked_by         uuid,
  revocation_reason  text,
  last_login_at      timestamptz,
  created_by         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_link_role   CHECK (external_role_code IN ('CLIENT','CONSULTANT','SUBCONTRACTOR','SUPPLIER')),
  CONSTRAINT chk_link_revoke CHECK (status <> 'REVOKED' OR (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)),
  CONSTRAINT chk_link_active CHECK (status <> 'ACTIVE'  OR (user_id IS NOT NULL AND accepted_at IS NOT NULL))
);

-- One live link per contact per assignment
CREATE UNIQUE INDEX uq_user_link_live
  ON stakeholder_user_links (contact_id, assignment_id)
  WHERE status IN ('INVITED','ACTIVE');

-- Access check entry point: given a user, what are they scoped to? (FR-STK-064)
CREATE INDEX idx_user_link_user
  ON stakeholder_user_links (user_id, status) WHERE status = 'ACTIVE';

-- Nightly orphan reconciliation (FR-STK-048)
CREATE INDEX idx_user_link_assignment
  ON stakeholder_user_links (assignment_id, status);

ALTER TABLE stakeholder_user_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE stakeholder_user_links FORCE ROW LEVEL SECURITY;
CREATE POLICY user_link_tenant_isolation ON stakeholder_user_links
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

---

## 5. Relationship Rules

| Parent | Child | Cardinality | On Parent Delete |
|---|---|---|---|
| tenants | all 15 tables | 1 : N | RESTRICT |
| stakeholders | stakeholder_contacts | 1 : N (≥1 to activate) | RESTRICT |
| stakeholders | stakeholder_addresses | 1 : N (0..*, one primary) | RESTRICT |
| stakeholders | stakeholder_documents | 1 : N | RESTRICT |
| stakeholders | project_stakeholders | 1 : N | RESTRICT |
| stakeholders | stakeholder_blacklist_records | 1 : N (one active) | RESTRICT |
| projects | project_stakeholders | 1 : N | RESTRICT |
| project_stakeholders | stakeholder_approval_authorities | 1 : N | CASCADE |
| project_stakeholders | stakeholder_access_scopes | 1 : 1 | CASCADE |
| project_stakeholders | stakeholder_wbs_scopes | 1 : N | CASCADE |
| project_stakeholders | stakeholder_workflow_responsibilities | 1 : N (≥1 to activate) | CASCADE |
| project_stakeholders | stakeholder_user_links | 1 : N | RESTRICT |
| stakeholder_contacts | stakeholder_user_links | 1 : N | RESTRICT |
| wbs_nodes | stakeholder_wbs_scopes | 1 : N | RESTRICT |

**Why CASCADE on the assignment children.** Authority, access, WBS scope, and responsibility have no meaning without their assignment. But assignments themselves are never hard-deleted — they are soft-deleted and terminated — so the cascade only fires in a genuine administrative purge, never in normal operation.

---

## 6. Deletion Policy

| Table | Hard Delete | Soft Delete | Notes |
|---|---|---|---|
| stakeholders | Never | `deleted_at` | Archive to `INACTIVE` instead (BRL-STK-014) |
| stakeholder_contacts | Never | `deleted_at` + `is_active` | Historical workflow references must resolve |
| stakeholder_addresses | Never | `deleted_at` | |
| stakeholder_documents | Never | `deleted_at` | Storage object retained per retention policy |
| project_stakeholders | Never | `deleted_at` + `TERMINATED` | |
| authorities / access / wbs / responsibilities | Never | `deleted_at` | Prior values retained for audit reconstruction |
| stakeholder_status_history | Never | Never | Append-only; UPDATE/DELETE revoked |
| stakeholder_performance_events | Never | Never | Append-only; UPDATE/DELETE revoked |
| stakeholder_blacklist_records | Never | `is_active = false` | Lifting a blacklist does not erase it |
| stakeholder_user_links | Never | `REVOKED` | Revocation is a state, not a deletion |

---

## 7. History and Snapshot Strategy

Live joins answer "who holds this authority today". Audits and claims need "who held it on 14 March last year". Three mechanisms provide that:

1. **`stakeholder_status_history.entity_snapshot`** — a JSONB copy of the record at each transition, so the history survives even if the business row is later purged in a jurisdictional erasure.
2. **Actor snapshots** — `actor_name_snapshot` and `actor_role_snapshot` are stored on every history row, matching the R0 audit engine convention (`user_name_snapshot`, `user_role_snapshot`, `department_snapshot`).
3. **Consumer-side authority snapshots** — when the resolution service routes an item, the consuming module stores the resolved party's name, role, and authority level on its own record (FR-STK-065). This is the mechanism that made UC-STK-020's four-minute audit response possible.

Snapshotting is synchronous. A failure to write the snapshot fails the action; there is no fire-and-forget path.

---

## 8. Row Level Security

### 8.1 Base Policy

Every table carries the same tenant policy shown in each DDL block above. Two additional properties matter:

- `FORCE ROW LEVEL SECURITY` — even the table owner is subject to the policy, so an accidental connection as the owner role does not bypass isolation.
- `current_setting('app.tenant_id', true)` — the second argument returns NULL rather than raising when the setting is missing, which makes the policy fail **closed** (NULL ≠ any uuid), not open.

### 8.2 Session Establishment

```sql
-- Executed by the API on every connection checkout, from the JWT claim only.
-- Never from a request body, header, or query parameter.
SELECT set_config('app.tenant_id', $1, true);   -- true = transaction-local
SELECT set_config('app.user_id',   $2, true);
SELECT set_config('app.role',      $3, true);
```

### 8.3 External User Sub-Policy

External users are additionally restricted to their own assignment scope. Applied as a second permissive-restrictive pair on the assignment table:

```sql
CREATE POLICY ps_external_own_scope ON project_stakeholders
  AS RESTRICTIVE
  FOR SELECT
  USING (
    current_setting('app.role', true) NOT IN ('CLIENT','CONSULTANT','SUBCONTRACTOR','SUPPLIER')
    OR EXISTS (
      SELECT 1 FROM stakeholder_user_links l
      WHERE l.user_id = current_setting('app.user_id', true)::uuid
        AND l.status = 'ACTIVE'
        AND l.assignment_id = project_stakeholders.id
    )
  );
```

### 8.4 Super Admin Impersonation

There is no cross-tenant read policy. Super Admin access to another tenant requires an explicit impersonation session that sets `app.tenant_id` to the target and writes a `CRITICAL` audit entry naming the target tenant and reason before any query runs. Silent cross-tenant reads are structurally impossible.

---

## 9. Query Performance Strategy

The five hot queries and their supporting indexes:

| # | Query | Frequency | Index | Target |
|---|---|---|---|---|
| 1 | Register list by tenant + type + status | Every screen load | `idx_stakeholders_tenant_type_status` | < 1.5 s @ 5,000 rows |
| 2 | Instant search on organisation and contact name | Every keystroke (debounced) | `idx_stakeholders_name_trgm`, `idx_contacts_name_trgm` | < 300 ms |
| 3 | Approver resolution for a project + WBS + module + entity | Continuous, highest volume | `idx_ps_project_active` → `idx_resp_lookup` → `idx_wbs_scope_path` → `idx_auth_resolution` | < 200 ms cold |
| 4 | Access check for a user + node + module | Every external request | `idx_user_link_user` → `idx_wbs_scope_path` | < 30 ms |
| 5 | Daily compliance expiry scan | Nightly per tenant | `idx_docs_expiry_scan` | < 30 s per tenant |

**Resolution query shape** (the one to optimise first):

```sql
SELECT ps.id, ps.stakeholder_id, aa.approval_level, aa.fallback_assignment_id
FROM   project_stakeholders ps
JOIN   stakeholder_workflow_responsibilities wr
       ON wr.assignment_id = ps.id AND wr.responsibility = $4 AND wr.is_enabled
JOIN   stakeholder_approval_authorities aa
       ON aa.assignment_id = ps.id AND aa.deleted_at IS NULL
      AND aa.module_code  IN ($5, 'ALL')
      AND aa.entity_type  IN ($6, 'ALL')
      AND aa.approval_level IN ('APPROVE','FINAL_APPROVE')
WHERE  ps.project_id = $1
  AND  ps.status = 'ACTIVE'
  AND  ps.deleted_at IS NULL
  AND  (ps.discipline_code = $3 OR ps.discipline_code = 'ALL')
  AND  (NOT EXISTS (SELECT 1 FROM stakeholder_wbs_scopes s
                    WHERE s.assignment_id = ps.id AND s.deleted_at IS NULL
                      AND s.grant_type = 'INCLUDE')
        OR EXISTS   (SELECT 1 FROM stakeholder_wbs_scopes s
                     WHERE s.assignment_id = ps.id AND s.deleted_at IS NULL
                       AND s.grant_type = 'INCLUDE' AND $2::ltree <@ s.wbs_path))
ORDER BY CASE aa.approval_level WHEN 'FINAL_APPROVE' THEN 2 ELSE 1 END,
         aa.module_code <> 'ALL' DESC,      -- most specific scope first
         aa.entity_type <> 'ALL' DESC;
```

Note the "no WBS grants means unrestricted" clause — an assignment with zero grants is project-wide, which is the correct default for clients and consultants.

---

## 10. Views and Materialised Views

```sql
-- Published read view for other modules. No module queries base tables directly.
CREATE VIEW v_active_project_stakeholders AS
SELECT ps.id                AS assignment_id,
       ps.tenant_id, ps.project_id, ps.stakeholder_id,
       s.legal_name, s.stakeholder_type, s.is_internal,
       ps.project_role_code, ps.discipline_code,
       ps.contractual_representative_id,
       acc.access_level, acc.allowed_module_codes, acc.max_confidentiality_tier,
       ps.planned_start_date, ps.planned_end_date
FROM   project_stakeholders ps
JOIN   stakeholders s               ON s.id = ps.stakeholder_id AND s.deleted_at IS NULL
LEFT   JOIN stakeholder_access_scopes acc
       ON acc.assignment_id = ps.id AND acc.deleted_at IS NULL
WHERE  ps.status = 'ACTIVE' AND ps.deleted_at IS NULL AND s.status = 'ACTIVE';

-- Performance summary for the detail panel (FR-STK-057)
CREATE VIEW v_stakeholder_performance_summary AS
SELECT sc.tenant_id, sc.stakeholder_id, sc.project_id,
       sc.reliability_score, sc.avg_response_days, sc.avg_approval_delay_days,
       sc.task_completion_rate, sc.doc_turnaround_compliance,
       sc.event_count, sc.is_sufficient_data, sc.computed_at,
       (sc.reliability_score < 80) AS is_warning,
       (sc.reliability_score < 60) AS is_critical
FROM   stakeholder_performance_scores sc
WHERE  sc.period_end = (SELECT max(period_end)
                        FROM stakeholder_performance_scores x
                        WHERE x.stakeholder_id = sc.stakeholder_id
                          AND x.project_id IS NOT DISTINCT FROM sc.project_id);

-- Left-panel type counts (FR-STK-002). Refreshed concurrently every 60 seconds.
CREATE MATERIALIZED VIEW mv_stakeholder_type_counts AS
SELECT tenant_id, stakeholder_type, status, count(*) AS stakeholder_count
FROM   stakeholders
WHERE  deleted_at IS NULL
GROUP  BY tenant_id, stakeholder_type, status;

CREATE UNIQUE INDEX uq_mv_type_counts
  ON mv_stakeholder_type_counts (tenant_id, stakeholder_type, status);

-- Compliance exposure report (SOP-STK-07)
CREATE VIEW v_stakeholder_compliance_exposure AS
SELECT d.tenant_id, d.stakeholder_id, s.legal_name, s.stakeholder_type, s.status,
       d.document_type_code, d.reference_number, d.expiry_date,
       (d.expiry_date - CURRENT_DATE) AS days_to_expiry,
       d.is_mandatory
FROM   stakeholder_documents d
JOIN   stakeholders s ON s.id = d.stakeholder_id
WHERE  d.deleted_at IS NULL AND d.superseded_by_id IS NULL
  AND  d.expiry_date IS NOT NULL
  AND  d.expiry_date <= CURRENT_DATE + INTERVAL '60 days';
```

---

## 11. Seed / Master Data

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Compliance document types (tenant-extensible reference table)
CREATE TABLE stk_document_types (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  type_code    text NOT NULL,
  type_name    text NOT NULL,
  has_expiry   boolean NOT NULL DEFAULT true,
  mandatory_for stakeholder_type_enum[] NOT NULL DEFAULT '{}',
  is_system    boolean NOT NULL DEFAULT false,
  is_active    boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX uq_doc_types ON stk_document_types (tenant_id, type_code);
ALTER TABLE stk_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE stk_document_types FORCE ROW LEVEL SECURITY;
CREATE POLICY doc_types_tenant_isolation ON stk_document_types
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

INSERT INTO stk_document_types (tenant_id, type_code, type_name, has_expiry, mandatory_for, is_system) VALUES
 ($tenant, 'COMPANY_REGISTRATION', 'Company Registration Certificate', false,
   '{CONSULTANT,SUBCONTRACTOR,SUPPLIER_VENDOR,ARCHITECT_DESIGNER,TESTING_AGENCY}', true),
 ($tenant, 'TRADE_LICENCE',        'Trade / Business Licence',          true,
   '{CONSULTANT,SUBCONTRACTOR,SUPPLIER_VENDOR,ARCHITECT_DESIGNER}', true),
 ($tenant, 'TAX_CERTIFICATE',      'Tax Registration Certificate',      true,
   '{SUBCONTRACTOR,SUPPLIER_VENDOR}', true),
 ($tenant, 'PUBLIC_LIABILITY_INS', 'Public Liability Insurance',        true,
   '{SUBCONTRACTOR,SUPPLIER_VENDOR}', true),
 ($tenant, 'EMPLOYER_LIABILITY_INS','Employer Liability Insurance',     true,
   '{SUBCONTRACTOR}', true),
 ($tenant, 'PROFESSIONAL_INDEMNITY','Professional Indemnity Insurance', true,
   '{CONSULTANT,ARCHITECT_DESIGNER}', true),
 ($tenant, 'ISO_9001',             'ISO 9001 Quality Certificate',      true, '{}', true),
 ($tenant, 'ISO_45001',            'ISO 45001 OH&S Certificate',        true, '{}', true),
 ($tenant, 'ISO_14001',            'ISO 14001 Environmental Certificate',true,'{}', true),
 ($tenant, 'PROFESSIONAL_LICENCE', 'Engineer / Architect Licence',      true,
   '{CONSULTANT,ARCHITECT_DESIGNER}', true),
 ($tenant, 'TESTING_ACCREDITATION','Laboratory Accreditation',          true,
   '{TESTING_AGENCY}', true),
 ($tenant, 'PQ_CERTIFICATE',       'Prequalification Certificate',      true, '{}', true);

-- Project roles
INSERT INTO stakeholder_project_roles
  (tenant_id, role_code, role_name, applicable_types, is_unique_per_project, is_system, sort_order) VALUES
 ($tenant,'EMPLOYER',        'Employer / Client',            '{CLIENT_OWNER}',                    true,  true, 10),
 ($tenant,'PMC',             'Project Management Consultant','{CONSULTANT}',                      true,  true, 20),
 ($tenant,'LEAD_CONSULTANT', 'Lead Design Consultant',       '{CONSULTANT,ARCHITECT_DESIGNER}',   false, true, 30),
 ($tenant,'ARC_CONSULTANT',  'Architectural Consultant',     '{ARCHITECT_DESIGNER,CONSULTANT}',   false, true, 40),
 ($tenant,'STR_CONSULTANT',  'Structural Consultant',        '{CONSULTANT}',                      false, true, 50),
 ($tenant,'MEP_CONSULTANT',  'MEP Consultant',               '{CONSULTANT}',                      false, true, 60),
 ($tenant,'CIV_CONSULTANT',  'Civil / Geotechnical Consultant','{CONSULTANT}',                    false, true, 70),
 ($tenant,'MAIN_CONTRACTOR', 'Main Contractor',              '{MAIN_CONTRACTOR}',                 true,  true, 80),
 ($tenant,'SUBCONTRACTOR',   'Subcontractor',                '{SUBCONTRACTOR}',                   false, true, 90),
 ($tenant,'SUPPLIER',        'Supplier',                     '{SUPPLIER_VENDOR}',                 false, true,100),
 ($tenant,'TESTING_AGENCY',  'Testing / Inspection Agency',  '{TESTING_AGENCY}',                  false, true,110),
 ($tenant,'AUTHORITY',       'Regulatory Authority',         '{AUTHORITY,UTILITY_AUTHORITY}',     false, true,120),
 ($tenant,'INSURER',         'Insurance / Bonding Party',    '{INSURANCE_BONDING}',               false, true,130),
 ($tenant,'JV_PARTNER',      'Joint Venture Partner',        '{JV_PARTNER}',                      false, true,140),
 ($tenant,'INTERNAL_DEPT',   'Internal Department',          '{INTERNAL_DEPARTMENT}',             false, true,150);

-- Performance scoring weights (Company Admin configurable, FR-STK-059)
CREATE TABLE stk_performance_weights (
  tenant_id                uuid PRIMARY KEY REFERENCES tenants(id),
  w_response_time          smallint NOT NULL DEFAULT 30,
  w_approval_delay         smallint NOT NULL DEFAULT 30,
  w_task_completion        smallint NOT NULL DEFAULT 25,
  w_doc_turnaround         smallint NOT NULL DEFAULT 15,
  min_events_for_score     smallint NOT NULL DEFAULT 10,
  warning_threshold        smallint NOT NULL DEFAULT 80,
  critical_threshold       smallint NOT NULL DEFAULT 60,
  updated_by               uuid,
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_weights_sum CHECK (w_response_time + w_approval_delay
                                    + w_task_completion + w_doc_turnaround = 100)
);
```

---

## 12. Triggers

```sql
-- Optimistic concurrency: bump version on every update
CREATE OR REPLACE FUNCTION stk_bump_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.version    := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_stakeholders_version BEFORE UPDATE ON stakeholders
  FOR EACH ROW EXECUTE FUNCTION stk_bump_version();
CREATE TRIGGER trg_ps_version BEFORE UPDATE ON project_stakeholders
  FOR EACH ROW EXECUTE FUNCTION stk_bump_version();
-- (repeat for contacts, addresses, documents, authorities, access_scopes)

-- Keep the denormalised is_external flag in sync so chk_access_external_not_full holds
CREATE OR REPLACE FUNCTION stk_sync_is_external() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  SELECT NOT s.is_internal INTO NEW.is_external
  FROM   stakeholders s
  JOIN   project_stakeholders ps ON ps.stakeholder_id = s.id
  WHERE  ps.id = NEW.assignment_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_access_is_external BEFORE INSERT OR UPDATE ON stakeholder_access_scopes
  FOR EACH ROW EXECUTE FUNCTION stk_sync_is_external();

-- Status transitions always write history (FR-STK-053)
CREATE OR REPLACE FUNCTION stk_record_status_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  INSERT INTO stakeholder_status_history (
    tenant_id, entity_type, entity_id, stakeholder_id, project_id,
    status_from, status_to, reason_code, reason_text, entity_snapshot,
    actor_user_id, actor_name_snapshot, actor_role_snapshot, correlation_id)
  VALUES (
    NEW.tenant_id,
    CASE TG_TABLE_NAME WHEN 'stakeholders' THEN 'STAKEHOLDER' ELSE 'ASSIGNMENT' END,
    NEW.id,
    CASE TG_TABLE_NAME WHEN 'stakeholders' THEN NEW.id ELSE NEW.stakeholder_id END,
    CASE TG_TABLE_NAME WHEN 'stakeholders' THEN NULL ELSE NEW.project_id END,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status::text ELSE NULL END,
    NEW.status::text,
    current_setting('app.reason_code', true),
    current_setting('app.reason_text', true),
    to_jsonb(NEW),
    nullif(current_setting('app.user_id',   true), '')::uuid,
    coalesce(nullif(current_setting('app.user_name', true), ''), 'SYSTEM'),
    coalesce(nullif(current_setting('app.role',      true), ''), 'SYSTEM'),
    nullif(current_setting('app.correlation_id', true), ''));
  RETURN NEW;
END $$;

CREATE TRIGGER trg_stakeholders_status AFTER INSERT OR UPDATE OF status ON stakeholders
  FOR EACH ROW EXECUTE FUNCTION stk_record_status_history();
CREATE TRIGGER trg_ps_status AFTER INSERT OR UPDATE OF status ON project_stakeholders
  FOR EACH ROW EXECUTE FUNCTION stk_record_status_history();

-- Activation gate: BRL-STK-004 and the responsibility requirement, enforced in the database
CREATE OR REPLACE FUNCTION stk_check_activation_gate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND (OLD.status IS DISTINCT FROM 'ACTIVE') THEN
    IF NOT EXISTS (SELECT 1 FROM stakeholder_approval_authorities a
                   WHERE a.assignment_id = NEW.id AND a.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'ASSIGNMENT_NO_AUTHORITY: approval authority must be set before activation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM stakeholder_access_scopes s
                   WHERE s.assignment_id = NEW.id AND s.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'ASSIGNMENT_NO_ACCESS: access scope must be set before activation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM stakeholder_workflow_responsibilities r
                   WHERE r.assignment_id = NEW.id AND r.is_enabled) THEN
      RAISE EXCEPTION 'ASSIGNMENT_NO_RESPONSIBILITY: at least one responsibility required';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_ps_activation_gate BEFORE UPDATE OF status ON project_stakeholders
  FOR EACH ROW EXECUTE FUNCTION stk_check_activation_gate();
```

---

## 13. Migration Order

| # | File | Contents |
|---|---|---|
| 001 | `001_stk_extensions.sql` | `pg_trgm`, `ltree`, `pgcrypto` |
| 002 | `002_stk_enums.sql` | All ten enum types |
| 003 | `003_stk_functions.sql` | `stk_normalise_name`, `stk_bump_version`, `stk_sync_is_external` |
| 004 | `004_stk_core_tables.sql` | `stakeholders`, `stakeholder_contacts`, `stakeholder_addresses`, `stakeholder_documents` |
| 005 | `005_stk_reference_tables.sql` | `stakeholder_project_roles`, `stk_document_types`, `stk_performance_weights` |
| 006 | `006_stk_assignment_tables.sql` | `project_stakeholders` |
| 007 | `007_stk_scope_tables.sql` | authorities, access scopes, WBS scopes, responsibilities |
| 008 | `008_stk_history_tables.sql` | status history, blacklist records |
| 009 | `009_stk_performance_tables.sql` | performance events, performance scores |
| 010 | `010_stk_user_links.sql` | `stakeholder_user_links` |
| 011 | `011_stk_indexes.sql` | All indexes (separated so they can run `CONCURRENTLY` on re-deploys) |
| 012 | `012_stk_rls.sql` | Enable, force, and create all RLS policies |
| 013 | `013_stk_triggers.sql` | Version, history, activation gate, is_external sync |
| 014 | `014_stk_views.sql` | Views and materialised view |
| 015 | `015_stk_grants.sql` | Role grants; revoke UPDATE/DELETE on append-only tables |
| 016 | `016_stk_seed.sql` | Document types, project roles, performance weights per tenant |

Rollback scripts mirror each file in reverse order. Migration 012 must never be rolled back independently of 004–010: dropping RLS while tables carry data is a security regression, not a schema change.

---

## 14. Data Volume Estimates

| Table | Per Tenant Year 1 | Year 5 | Growth Driver |
|---|---|---|---|
| stakeholders | 800 | 4,000 | Organisations across all projects |
| stakeholder_contacts | 2,400 | 14,000 | ~3 contacts per organisation |
| stakeholder_addresses | 1,000 | 5,000 | |
| stakeholder_documents | 4,000 | 24,000 | ~5 per organisation, renewed annually |
| project_stakeholders | 1,200 | 9,000 | ~80–110 per project × projects |
| approval authorities | 3,600 | 27,000 | ~3 scoped rows per assignment |
| access scopes | 1,200 | 9,000 | 1:1 with assignments |
| wbs scopes | 6,000 | 45,000 | Subcontractors average 5 grants |
| responsibilities | 4,800 | 36,000 | ~4 per assignment |
| performance events | 180,000 | 1,400,000 | The dominant growth table |
| performance scores | 10,000 | 60,000 | Nightly per stakeholder |
| status history | 15,000 | 110,000 | |
| user links | 600 | 4,500 | |

**Partitioning trigger.** `stakeholder_performance_events` is the only table on a trajectory to require partitioning. Range-partition by `created_at` month once it exceeds 5 million rows tenant-wide. Everything else stays comfortably within single-table performance at Year 5 volumes.

---

## 15. Open Questions

| ID | Question | Impact |
|---|---|---|
| Q-13 | Should `wbs_path` be a stored ltree snapshot, or resolved live from `wbs_nodes` on each check? A snapshot is fast but goes stale if the WBS is restructured. | Requires a WBS-move hook to re-materialise paths |
| Q-14 | Should the fuzzy duplicate threshold move to `stk_performance_weights`-style tenant config? (Q-06 from FS) | Adds a config column |
| Q-15 | Is `ltree` acceptable on the target Supabase plan, or should we fall back to a text materialised path with `LIKE 'prefix%'`? | Index strategy for WBS coverage |
| Q-16 | Do jurisdictional erasure requests require true row deletion for contact personal data, given the append-only history design? | May require a redaction mechanism on `entity_snapshot` |

---

## 16. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1.0 | 2026-08-08 | Initial issue — 15 canonical tables plus 3 reference tables, full DDL, RLS, triggers, views, seed | Senior System Architect |

---

**End of Document**
