# DCOS — Module 01 Company / Tenant Setup
## Document 05 — API Specification

**Digital Construction Operating System — Foundation Layer**

| Field | Value |
|---|---|
| Document Code | DCOS-CMP-05-API |
| Module | 01 — Company / Tenant Setup (`CMP`) |
| Version | R1 — Initial Issue |
| API Version | `v1` |
| Base URL | `https://api.dcos.app/v1` |
| Transport | HTTPS only, TLS 1.2+ |
| Auth | DCOS Session Token (Bearer JWT) — issued by 03-01 Authentication |
| Source | Auto — generated from OpenAPI 3.1, reconciled to this specification |
| Parent Documents | DCOS-CMP-01-BR · DCOS-CMP-03-WF · DCOS-CMP-04-DB |
| Classification | Internal — Strategic Architecture |
| Status | For Development |

---

## 1. Conventions

### 1.1 Authentication and Tenant Resolution

Every endpoint except `/health` requires:

```http
Authorization: Bearer <DCOS access token>
```

**The tenant is resolved exclusively from the `tid` claim in the verified token.** No endpoint in this module accepts `company_id` as a path parameter, query parameter, or body field for tenant scoping. A request body containing `company_id` is rejected with `400 IMMUTABLE_FIELD`.

Platform-admin endpoints under `/platform/*` require a Super Admin token with the `platform:admin` scope and are the only endpoints permitted to reference another tenant's `company_id`.

### 1.2 Standard Headers

| Header | Direction | Purpose |
|---|---|---|
| `Authorization` | Request | Bearer token |
| `X-Request-Id` | Request / Response | Client-supplied trace id; echoed and written to `audit_log.correlation_id` |
| `Idempotency-Key` | Request | Required on all POST that create resources; 24 h replay window |
| `X-Step-Up-Assertion` | Request | AAL 3 assertion id, required by flagged endpoints |
| `If-Match` | Request | ETag for optimistic concurrency on PATCH |
| `X-DCOS-Tenant` | Response | Echo of resolved tenant code, for client-side sanity checks |
| `X-RateLimit-Remaining` | Response | Remaining calls in window |

### 1.3 Pagination, Filtering, Sorting

```http
GET /companies/legal-entities?page=1&page_size=25&sort=-created_at
    &filter[status]=active&filter[entity_type]=operating&q=construction
```

```json
{
  "data": [ /* … */ ],
  "meta": {
    "page": 1,
    "page_size": 25,
    "total_items": 7,
    "total_pages": 1
  },
  "links": { "self": "…", "next": null, "prev": null }
}
```

Defaults: `page_size=25`, maximum `100`. Sort prefix `-` = descending.

### 1.4 Error Envelope

```json
{
  "error": {
    "code": "CMP_ENTITY_HAS_ACTIVE_PROJECTS",
    "message": "Legal entity cannot be deactivated while active projects exist.",
    "http_status": 409,
    "details": {
      "blocking_records": [
        { "type": "project", "id": "prj_01HZX...", "code": "P001", "name": "Tower A" },
        { "type": "purchase_order", "id": "po_01HZY...", "code": "ACCM-PO-26-0142" }
      ]
    },
    "request_id": "req_01HZX8K2M4",
    "documentation_url": "https://docs.dcos.app/errors/CMP_ENTITY_HAS_ACTIVE_PROJECTS"
  }
}
```

**Rule:** a blocking error must always name the blocking records. "Cannot delete — record in use" wastes an hour of somebody's afternoon.

### 1.5 Rate Limits

| Scope | Limit |
|---|---|
| Standard read | 600 req/min/tenant |
| Standard write | 120 req/min/tenant |
| Data export | 2 req/day/tenant |
| Branding upload | 20 req/hour/tenant |
| Platform admin | 300 req/min/admin |
| Per-tenant API ceiling | Plan-defined (`api_calls_month`) |

Exceeded → `429 RATE_LIMIT_EXCEEDED` with `Retry-After`.

### 1.6 Entitlement Gate

Every request passes through an entitlement middleware **before** the permission check:

```text
1. Verify token signature and expiry              → 401 UNAUTHENTICATED
2. Resolve tenant, check company.status            → 403 TENANT_SUSPENDED
3. Check module entitlement for target module      → 403 MODULE_NOT_ENTITLED
4. Check RBAC permission                           → 403 PERMISSION_DENIED
5. Check quota for create operations               → 402 QUOTA_EXCEEDED
6. Execute
```

`MODULE_NOT_ENTITLED` and `PERMISSION_DENIED` are deliberately distinct. "You don't have permission" when the real answer is "your company didn't buy this" generates support tickets and makes admins hunt for a role that does not exist.

---

## 2. Endpoint Index

| Group | Endpoints |
|---|---|
| Company Profile | 4 |
| Legal Entities | 9 |
| Joint Ventures | 4 |
| Signatories | 4 |
| Branches | 5 |
| Departments | 5 |
| Disciplines | 5 |
| Calendars & Holidays | 10 |
| Numbering | 6 |
| Branding & Bank Accounts | 7 |
| Subscription & Entitlement | 6 |
| Quota | 2 |
| Onboarding | 3 |
| Data Export | 3 |
| Platform Admin | 9 |
| **Total** | **82** |

---

## 3. Company Profile

### `GET /company`
Returns the current tenant's profile and resolved defaults.

**Permission:** `company:read`

```json
{
  "data": {
    "company_id": "cmp_01HZX8K2M4",
    "company_code": "ACC",
    "trading_name": "ACC Construction Group",
    "legal_name": "ACC Construction Group Co., Ltd",
    "status": "active",
    "country_code": "KH",
    "data_residency": "ap_southeast",
    "default_timezone": "Asia/Phnom_Penh",
    "default_language": "en",
    "date_format": "DD-MMM-YYYY",
    "unit_system": "metric",
    "base_currency": "USD",
    "base_currency_locked": true,
    "reporting_currency": "KHR",
    "fiscal_year_start_month": 1,
    "primary_entity": {
      "legal_entity_id": "ent_01HZX8K3P1",
      "entity_code": "ACCM",
      "legal_name": "ACC Construction Co., Ltd"
    },
    "default_calendar_id": "cal_01HZX8K4R7",
    "logo_url": "https://cdn.dcos.app/tenant/cmp_01HZX8K2M4/branding/logo.png",
    "onboarding_completed": true,
    "created_at": "2026-02-14T03:12:00Z",
    "updated_at": "2026-08-01T09:44:21Z"
  }
}
```

### `PATCH /company`
Updates mutable profile fields.

**Permission:** `company:update` · **ETag required**

```json
{
  "trading_name": "ACC Construction Group",
  "default_timezone": "Asia/Phnom_Penh",
  "default_language": "km",
  "primary_contact_email": "admin@accgroup.com.kh"
}
```

| Field | Mutable | Error if attempted |
|---|---|---|
| `company_code` | Never | `CMP_IMMUTABLE_COMPANY_CODE` |
| `base_currency` | Only while `base_currency_locked = false` | `CMP_BASE_CURRENCY_LOCKED` |
| `data_residency` | Never (formal migration only) | `CMP_RESIDENCY_MIGRATION_REQUIRED` |
| `status` | Platform admin only | `PERMISSION_DENIED` |

### `GET /company/settings`
Consolidated settings payload used by the client on session start — profile defaults, calendar id, entitled modules, discipline list, department list. Cached client-side for 5 minutes.

### `GET /company/status`
Lightweight status probe for the client banner (suspension, quota, past-due). No permission required beyond a valid session.

```json
{
  "data": {
    "status": "active",
    "read_only": false,
    "banners": [
      { "type": "quota", "severity": "warning",
        "message": "Storage at 84% of 500 GB.", "metric": "storage_gb" }
    ]
  }
}
```

---

## 4. Legal Entities

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/companies/legal-entities` | `entity:read` | Restricted fields masked unless `entity:read_restricted` |
| GET | `/companies/legal-entities/{id}` | `entity:read` | |
| POST | `/companies/legal-entities` | `entity:create` | Creates in `draft` |
| PATCH | `/companies/legal-entities/{id}` | `entity:update` | Creates a new version row |
| POST | `/companies/legal-entities/{id}/submit` | `entity:create` | `draft` → `pending_approval` |
| POST | `/companies/legal-entities/{id}/approve` | `entity:approve` | Director; step-up required |
| POST | `/companies/legal-entities/{id}/reject` | `entity:approve` | Reason mandatory |
| POST | `/companies/legal-entities/{id}/deactivate` | `entity:deactivate` | Dependency-checked |
| GET | `/companies/legal-entities/{id}/versions` | `entity:read` | Point-in-time history |

### `POST /companies/legal-entities`

**Permission:** `entity:create` · **Idempotency-Key required**

```json
{
  "entity_code": "ACCM",
  "legal_name": "ACC Construction Co., Ltd",
  "legal_name_local": "ក្រុមហ៊ុន អេស៊ីស៊ី ខនស្ត្រាក់សិន",
  "entity_type": "operating",
  "registration_number": "00012345",
  "tax_identification_no": "K001-901234567",
  "vat_registration_no": "L001-2200098765",
  "incorporation_date": "2014-06-02",
  "country_of_registration": "KH",
  "registered_address": {
    "line1": "No. 128, Street 271",
    "line2": "Sangkat Toul Tumpoung",
    "city": "Phnom Penh",
    "postal_code": "12308",
    "country": "KH"
  },
  "parent_entity_id": "ent_01HZX8K3P0",
  "ownership_percent": 100.0000,
  "contact_email": "info@accgroup.com.kh",
  "contact_phone": "+855 23 123 456"
}
```

**Response `201`**

```json
{
  "data": {
    "legal_entity_id": "ent_01HZX8K3P1",
    "entity_code": "ACCM",
    "status": "draft",
    "is_primary": false,
    "next_action": "submit_for_approval",
    "created_at": "2026-08-12T02:11:07Z"
  }
}
```

**Errors**

| Code | HTTP | Cause |
|---|---|---|
| `CMP_ENTITY_CODE_DUPLICATE` | 409 | Code already used in tenant |
| `CMP_REGISTRATION_NO_DUPLICATE` | 409 | Registration number already registered |
| `CMP_INVALID_PARENT` | 422 | Parent is self, or creates a cycle |
| `CMP_OWNERSHIP_OUT_OF_RANGE` | 422 | Not between 0 and 100 |

### `GET /companies/legal-entities/{id}?as_of=2026-03-15`

Returns the entity **as it was** on the given date, using `fn_entity_as_of`. Used by every PDF generator so a 2026 transmittal renders 2026 details forever.

### `POST /companies/legal-entities/{id}/deactivate`

**Permission:** `entity:deactivate` · **Step-up required**

```json
{
  "new_status": "dormant",
  "effective_date": "2026-09-30",
  "reason": "Trading transferred to ACC Infrastructure Co., Ltd"
}
```

**`409` when blocked:**

```json
{
  "error": {
    "code": "CMP_ENTITY_HAS_ACTIVE_PROJECTS",
    "message": "Entity has 2 active projects, 1 open subcontract and 3 unpaid IPCs.",
    "http_status": 409,
    "details": {
      "active_projects": 2,
      "open_subcontracts": 1,
      "unpaid_ipcs": 3,
      "blocking_records": [
        { "type": "project", "code": "P001", "name": "Tower A" },
        { "type": "project", "code": "P007", "name": "Riverside Villas" },
        { "type": "subcontract", "code": "P001-SC-004", "party": "Mekong MEP Co." }
      ]
    }
  }
}
```

### Field Masking

Without `entity:read_restricted`:

```json
{
  "registration_number": "•••••345",
  "tax_identification_no": "•••••••••567",
  "vat_registration_no": "•••••••8765",
  "_restricted": ["registration_number", "tax_identification_no", "vat_registration_no"]
}
```

Unmasking uses `GET /companies/legal-entities/{id}?unmask=true`, requires `entity:read_restricted`, and emits `CMP.RESTRICTED_FIELD_UNMASKED` (severity High).

---

## 5. Joint Ventures

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/companies/legal-entities/{id}/jv-participants` | `entity:read` |
| POST | `/companies/legal-entities/{id}/jv-participants` | `entity:update` |
| PATCH | `/companies/jv-participants/{participant_id}` | `entity:update` |
| DELETE | `/companies/jv-participants/{participant_id}` | `entity:update` |

### `POST /companies/legal-entities/{id}/jv-participants`

Participants are validated as a set on commit — the total must be exactly 100.0000%. Send the complete participant list in one request.

```json
{
  "participants": [
    {
      "internal_entity_id": "ent_01HZX8K3P1",
      "participant_name": "ACC Construction Co., Ltd",
      "participating_interest": 60.0000,
      "is_lead": true,
      "role_in_jv": "Lead contractor, civil and structural works"
    },
    {
      "external_stakeholder_id": "stk_01HZY2M9Q4",
      "participant_name": "Mekong Infrastructure PLC",
      "participating_interest": 40.0000,
      "is_lead": false,
      "role_in_jv": "MEP and specialist works"
    }
  ]
}
```

**Errors**

| Code | HTTP | Cause |
|---|---|---|
| `CMP_JV_INTEREST_NOT_100` | 422 | Total ≠ 100.0000 (actual returned in `details.total`) |
| `CMP_JV_NO_LEAD` | 422 | No participant flagged lead |
| `CMP_JV_MULTIPLE_LEADS` | 422 | More than one lead |
| `CMP_JV_SELF_PARTICIPATION` | 422 | JV listed as its own participant |
| `CMP_ENTITY_NOT_JV` | 422 | Target entity type is not `joint_venture` |

---

## 6. Signatories

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/companies/legal-entities/{id}/signatories` | `signatory:read` | Signature image URL omitted unless permitted |
| POST | `/companies/legal-entities/{id}/signatories` | `signatory:create` | Requires Director approval to activate |
| PATCH | `/companies/signatories/{id}` | `signatory:update` | Step-up required |
| POST | `/companies/signatories/{id}/approve` | `signatory:approve` | Director only, step-up required |

```json
{
  "full_name": "Chan Sokha",
  "position_title": "Managing Director",
  "user_id": "usr_01HZX8K5T2",
  "authority_scope": ["PO", "SUBCONTRACT", "IPC", "TRANSMITTAL"],
  "value_limit": 500000.0000,
  "value_limit_currency": "USD",
  "valid_from": "2026-01-01",
  "valid_to": "2027-12-31"
}
```

> `value_limit` is documentary — the limit that prints on the contract. Enforcement of approval thresholds is owned by the RBAC Delegation of Authority matrix (Module 03-02).

---

## 7. Branches, Departments, Disciplines

### Branches

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/companies/branches` | `branch:read` |
| GET | `/companies/branches/{id}` | `branch:read` |
| POST | `/companies/branches` | `branch:create` |
| PATCH | `/companies/branches/{id}` | `branch:update` |
| POST | `/companies/branches/{id}/deactivate` | `branch:deactivate` |

```json
{
  "branch_code": "SITE-TWRA",
  "branch_name": "Tower A Site Office",
  "branch_type": "site_office",
  "legal_entity_id": "ent_01HZX8K3P1",
  "project_id": "prj_01HZX9A1B2",
  "address": { "line1": "Plot 42, Chroy Changvar", "city": "Phnom Penh", "country": "KH" },
  "latitude": 11.5849,
  "longitude": 104.9298,
  "branch_manager_id": "usr_01HZX8K6V3",
  "cost_centre_code": "CC-P001-SITE"
}
```

### Departments

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/companies/departments` | `department:read` |
| GET | `/companies/departments/tree` | `department:read` |
| POST | `/companies/departments` | `department:create` |
| PATCH | `/companies/departments/{id}` | `department:update` |
| POST | `/companies/departments/{id}/deactivate` | `department:deactivate` |

`GET /companies/departments/tree` returns the nested hierarchy for org-chart rendering.

Deactivation with linked users returns:

```json
{
  "error": {
    "code": "CMP_DEPARTMENT_HAS_ACTIVE_USERS",
    "message": "14 active users are assigned to this department.",
    "http_status": 409,
    "details": {
      "active_user_count": 14,
      "reassignment_endpoint": "/admin/users/bulk-reassign-department"
    }
  }
}
```

### Disciplines

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/companies/disciplines` | `discipline:read` |
| POST | `/companies/disciplines` | `discipline:create` |
| PATCH | `/companies/disciplines/{id}` | `discipline:update` |
| POST | `/companies/disciplines/{id}/deactivate` | `discipline:deactivate` |
| GET | `/companies/disciplines/{id}/usage` | `discipline:read` |

`GET .../usage` returns reference counts before an admin attempts an edit:

```json
{
  "data": {
    "discipline_code": "STR",
    "is_referenced": true,
    "code_locked": true,
    "references": {
      "wbs_nodes": 1284, "documents": 3910, "tasks": 2077,
      "drawings": 1640, "users_scoped": 22
    }
  }
}
```

Attempting to change a locked code:

```json
{
  "error": {
    "code": "CMP_DISCIPLINE_CODE_LOCKED",
    "message": "Discipline code STR is referenced by 8,933 records and cannot be changed. The display name can be edited.",
    "http_status": 409
  }
}
```

---

## 8. Calendars and Holidays

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/companies/calendars` | `calendar:read` |
| GET | `/companies/calendars/{id}` | `calendar:read` |
| POST | `/companies/calendars` | `calendar:create` |
| PATCH | `/companies/calendars/{id}` | `calendar:update` |
| PUT | `/companies/calendars/{id}/working-pattern` | `calendar:update` |
| POST | `/companies/calendars/{id}/publish` | `calendar:publish` |
| GET | `/companies/calendars/{id}/holidays` | `calendar:read` |
| POST | `/companies/calendars/{id}/holidays` | `calendar:update` |
| DELETE | `/companies/holidays/{id}` | `calendar:update` |
| POST | `/companies/calendars/{id}/holidays/import-template` | `calendar:update` |

### `PUT /companies/calendars/{id}/working-pattern`

Replaces the full 7-day pattern atomically.

```json
{
  "pattern": [
    { "day_of_week": 0, "is_working_day": false },
    { "day_of_week": 1, "is_working_day": true, "start_time": "07:00", "finish_time": "17:00", "working_hours": 9.0 },
    { "day_of_week": 2, "is_working_day": true, "start_time": "07:00", "finish_time": "17:00", "working_hours": 9.0 },
    { "day_of_week": 3, "is_working_day": true, "start_time": "07:00", "finish_time": "17:00", "working_hours": 9.0 },
    { "day_of_week": 4, "is_working_day": true, "start_time": "07:00", "finish_time": "17:00", "working_hours": 9.0 },
    { "day_of_week": 5, "is_working_day": true, "start_time": "07:00", "finish_time": "17:00", "working_hours": 9.0 },
    { "day_of_week": 6, "is_working_day": true, "start_time": "07:00", "finish_time": "12:00", "working_hours": 5.0 }
  ]
}
```

### `POST /companies/calendars/{id}/publish`

```json
{ "effective_from": "2027-01-01", "reason": "2027 public holiday sub-decree published" }
```

**Response `202` — asynchronous, because downstream recalculation is heavy.**

```json
{
  "data": {
    "publish_id": "pub_01HZXB4N7K",
    "status": "processing",
    "effective_from": "2027-01-01",
    "impact_preview": {
      "open_schedules_affected": 12,
      "tasks_to_recalculate": 3480,
      "open_timesheet_periods": 2
    },
    "poll_url": "/companies/calendar-publishes/pub_01HZXB4N7K"
  }
}
```

**Blocked when the effective date falls inside a closed period:**

```json
{
  "error": {
    "code": "CMP_CALENDAR_PERIOD_CLOSED",
    "message": "Effective date 2026-07-01 falls within a closed timesheet period. Calendar changes apply forward only.",
    "http_status": 409,
    "details": { "earliest_permitted_date": "2026-09-01" }
  }
}
```

### `POST /companies/calendars/{id}/holidays/import-template`

```json
{ "country_code": "KH", "year": 2027, "overwrite_existing": false }
```

```json
{
  "data": {
    "imported": 22,
    "skipped_existing": 0,
    "requires_confirmation": [
      { "holiday_name": "Khmer New Year", "provisional_dates": ["2027-04-14","2027-04-15","2027-04-16"], "basis": "lunar" },
      { "holiday_name": "Pchum Ben", "provisional_dates": ["2027-09-29","2027-09-30","2027-10-01"], "basis": "lunar" },
      { "holiday_name": "Water Festival", "provisional_dates": ["2027-11-12","2027-11-13","2027-11-14"], "basis": "lunar" }
    ],
    "warning": "Lunar holidays are provisional until the annual sub-decree is published. Confirm before publishing schedules that cross these dates."
  }
}
```

### Calendar Query Endpoints (consumed by other modules)

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/companies/calendars/{id}/is-working-day?date=2027-04-15` | Boolean check |
| GET | `/companies/calendars/{id}/add-working-days?start=2026-08-12&days=15` | Forward date calculation |
| GET | `/companies/calendars/{id}/working-days-between?from=…&to=…` | Duration in working days |

These are the **only** sanctioned date-arithmetic endpoints in DCOS. Planning, Task, Timesheet, Leave, SLA, and EOT modules all call them (BR-CMP-044).

---

## 9. Numbering

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/companies/numbering-rules` | `numbering:read` |
| GET | `/companies/numbering-rules/{id}` | `numbering:read` |
| POST | `/companies/numbering-rules` | `numbering:create` |
| PATCH | `/companies/numbering-rules/{id}` | `numbering:update` (blocked once locked) |
| POST | `/companies/numbering-rules/preview` | `numbering:read` |
| GET | `/companies/numbering-sequences` | `numbering:read` |

### `POST /companies/numbering-rules/preview`

Mandatory before saving a pattern (BR-CMP-054). Does not allocate anything.

```json
{
  "record_type": "DRAWING",
  "pattern": "{PROJECT}-{DISCIPLINE}-DWG-{BUILDING}-{LEVEL}-{SEQ:3}-R{REV:2}",
  "separator": "-",
  "sequence_width": 3,
  "scope": "per_project_discipline",
  "sample_tokens": {
    "PROJECT": "P001", "DISCIPLINE": "STR",
    "BUILDING": "B01", "LEVEL": "L05", "REV": "02"
  }
}
```

```json
{
  "data": {
    "samples": [
      "P001-STR-DWG-B01-L05-001-R02",
      "P001-STR-DWG-B01-L05-002-R02",
      "P001-STR-DWG-B01-L05-003-R02"
    ],
    "warnings": [
      "Scope per_project_discipline means the sequence restarts for each discipline within a project. STR-001 and ARC-001 will both exist."
    ],
    "valid": true
  }
}
```

### Locked Rule Error

```json
{
  "error": {
    "code": "CMP_NUMBERING_RULE_LOCKED",
    "message": "This rule has issued 1,847 numbers and cannot be modified. Create a new rule with a future effective_from date.",
    "http_status": 409,
    "details": {
      "locked_at": "2026-03-01T04:20:11Z",
      "numbers_issued": 1847,
      "last_issued": "P001-STR-DWG-B01-L05-214-R01"
    }
  }
}
```

---

## 10. Branding and Bank Accounts

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| GET | `/companies/legal-entities/{id}/branding` | `branding:read` | |
| PUT | `/companies/legal-entities/{id}/branding` | `branding:update` | Metadata and colours |
| POST | `/companies/legal-entities/{id}/branding/assets` | `branding:update` | Multipart upload |
| GET | `/companies/legal-entities/{id}/branding/preview` | `branding:read` | Renders a sample transmittal PDF |
| GET | `/companies/bank-accounts` | `bank_account:read` | Account number masked |
| POST | `/companies/bank-accounts` | `bank_account:create` | Step-up required |
| PATCH | `/companies/bank-accounts/{id}` | `bank_account:update` | Step-up required |

### `POST /companies/legal-entities/{id}/branding/assets`

```http
POST /companies/legal-entities/ent_01HZX8K3P1/branding/assets
Content-Type: multipart/form-data

asset_type: logo | logo_mono | letterhead_header | letterhead_footer | seal
file: <binary>
```

**Validation:** PNG/JPG/SVG only · logo ≤ 2 MB, min 400×400 px · letterhead ≤ 5 MB, A4 aspect at 300 dpi · seal PNG with transparency ≤ 1 MB. All files malware-scanned before storage; infected uploads are quarantined and reported to Company Admin and IT.

```json
{
  "data": {
    "asset_type": "logo",
    "url": "https://cdn.dcos.app/tenant/cmp_01HZX8K2M4/branding/ent_01HZX8K3P1/logo.png",
    "dimensions": { "width": 1200, "height": 400 },
    "size_bytes": 148320,
    "scan_result": "clean",
    "preview_url": "/companies/legal-entities/ent_01HZX8K3P1/branding/preview"
  }
}
```

---

## 11. Subscription, Entitlement, Quota

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/company/subscription` | `subscription:read` |
| GET | `/company/subscription/history` | `subscription:read` |
| POST | `/company/subscription/change-request` | `subscription:request` |
| GET | `/company/entitlements` | authenticated |
| GET | `/company/quota` | `subscription:read` |
| GET | `/company/quota/history?metric=storage_gb&months=12` | `subscription:read` |

### `GET /company/entitlements`

Called by the client shell on session start to build navigation. No special permission — a user must know which modules exist for them.

```json
{
  "data": {
    "plan_code": "ENTERPRISE",
    "modules": {
      "PROJECT_SETUP": true, "WBS": true, "TASK": true, "DOCUMENT_CONTROL": true,
      "PROCUREMENT": true, "INVENTORY": true, "QAQC": true, "HSE": true,
      "BOQ": true, "IPC": true, "RETENTION": true, "SUBCONTRACT": true,
      "PLANNING_CPM": true, "EQUIPMENT": false, "EVM": false,
      "CONTRACT_ADMIN": false, "MOBILE_FIELD": true, "BIM": false
    },
    "cache_ttl_seconds": 300
  }
}
```

### `GET /company/quota`

```json
{
  "data": {
    "as_of": "2026-08-12T00:15:00Z",
    "metrics": [
      { "metric": "full_seats",     "used": 47,    "quota": 50,   "percent": 94.00, "status": "warning" },
      { "metric": "field_seats",    "used": 213,   "quota": 400,  "percent": 53.25, "status": "ok" },
      { "metric": "external_seats", "used": 38,    "quota": 100,  "percent": 38.00, "status": "ok" },
      { "metric": "projects",       "used": 12,    "quota": null, "percent": null,  "status": "unlimited" },
      { "metric": "storage_gb",     "used": 421.7, "quota": 500,  "percent": 84.34, "status": "warning" },
      { "metric": "api_calls_month","used": 184203,"quota": 500000,"percent": 36.84,"status": "ok" }
    ],
    "enforcement_active": []
  }
}
```

### Quota Exceeded on Create

```json
{
  "error": {
    "code": "CMP_QUOTA_EXCEEDED",
    "message": "Full seat limit of 50 reached. Deactivate a user or request additional seats.",
    "http_status": 402,
    "details": {
      "metric": "full_seats", "used": 50, "quota": 50,
      "request_endpoint": "/company/subscription/change-request"
    }
  }
}
```

`402 Payment Required` is used deliberately — it is a commercial condition, not a permission failure.

---

## 12. Onboarding

| Method | Endpoint | Permission |
|---|---|---|
| GET | `/company/onboarding` | `company:update` |
| POST | `/company/onboarding/steps/{step}/complete` | `company:update` |
| POST | `/company/onboarding/finalise` | `company:update` |

### `GET /company/onboarding`

```json
{
  "data": {
    "current_step": 7,
    "completed_steps": [1,2,3,4,5,6],
    "steps": [
      { "step": 1, "key": "company_profile",   "status": "complete", "mandatory": true },
      { "step": 7, "key": "working_calendar",  "status": "in_progress", "mandatory": true },
      { "step": 9, "key": "numbering_scheme",  "status": "pending", "mandatory": true,
        "warning": "Numbering patterns lock permanently once the first number is issued." }
    ],
    "can_create_project": false,
    "blocking_steps": [7, 8, 9]
  }
}
```

### `POST /company/onboarding/finalise`

Requires typed confirmation of the company code, mirroring WF-02 §3.2.

```json
{
  "confirm_company_code": "ACC",
  "acknowledge_immutable": true
}
```

---

## 13. Data Export

| Method | Endpoint | Permission | Notes |
|---|---|---|---|
| POST | `/company/exports` | `company:export` | Step-up required, 2/day |
| GET | `/company/exports` | `company:export` | |
| GET | `/company/exports/{id}` | `company:export` | Signed download URL |

### `POST /company/exports`

```http
X-Step-Up-Assertion: stp_01HZXC9P4M
Idempotency-Key: exp-2026-08-12-001
```

```json
{ "scope": "full_tenant", "include_files": true, "format": "json" }
```

```json
{
  "data": {
    "export_id": "exp_01HZXC9R2T",
    "status": "generating",
    "estimated_completion": "2026-08-12T04:30:00Z",
    "poll_url": "/company/exports/exp_01HZXC9R2T"
  }
}
```

When ready:

```json
{
  "data": {
    "export_id": "exp_01HZXC9R2T",
    "status": "ready",
    "file_url": "https://cdn.dcos.app/exports/…?signature=…",
    "file_size_bytes": 18442310556,
    "checksum_sha256": "9f2c…",
    "record_count": 4820117,
    "expires_at": "2026-09-11T04:30:00Z",
    "manifest_url": "https://cdn.dcos.app/exports/…/manifest.json"
  }
}
```

Emits `CMP.DATA_EXPORT_REQUESTED` and `CMP.DATA_EXPORT_DOWNLOADED`, both Critical severity.

---

## 14. Platform Admin

All endpoints require the `platform:admin` scope. These are the only endpoints that reference another tenant's `company_id`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/platform/tenants` | List all tenants with status, plan, usage |
| GET | `/platform/tenants/{company_id}` | Tenant detail |
| POST | `/platform/tenants/provision-requests` | Raise provisioning request |
| POST | `/platform/tenants/provision-requests/{id}/approve` | Approve and create tenant |
| PATCH | `/platform/tenants/{company_id}/subscription` | Apply plan / seat change |
| PATCH | `/platform/tenants/{company_id}/entitlements` | Toggle modules |
| POST | `/platform/tenants/{company_id}/lifecycle` | Suspend / reactivate / terminate |
| POST | `/platform/tenants/{company_id}/impersonate` | Break-glass session |
| GET | `/platform/tenants/{company_id}/rls-selftest` | Run isolation self-test |

### `POST /platform/tenants/{company_id}/lifecycle`

```json
{
  "to_status": "suspended",
  "reason_category": "payment",
  "reason": "Invoice INV-2026-0418 overdue 45 days; grace period expired.",
  "effective_date": "2026-08-20",
  "notify_days_before": [7, 1]
}
```

Termination requires two additional fields and dual confirmation:

```json
{
  "to_status": "terminating",
  "reason_category": "customer_request",
  "reason": "Contract not renewed.",
  "effective_date": "2026-09-30",
  "retention_hold_days": 90,
  "confirm_company_code": "ACC",
  "second_approver_id": "usr_platform_owner_01"
}
```

### `POST /platform/tenants/{company_id}/impersonate`

```json
{
  "target_user_id": "usr_01HZX8K5T2",
  "reason": "Support ticket SUP-8842 — Company Admin cannot publish 2027 calendar.",
  "ticket_reference": "SUP-8842",
  "duration_minutes": 30,
  "write_access": false
}
```

```json
{
  "data": {
    "impersonation_session_id": "imp_01HZXD2K8N",
    "access_token": "eyJhbGc…",
    "expires_at": "2026-08-12T03:11:00Z",
    "write_access": false,
    "customer_notified": true,
    "banner_text": "DCOS Support session active — ticket SUP-8842 — read only"
  }
}
```

The customer's Company Admin receives an immediate Critical notification, and a full action summary when the session ends (WF-15).

---

## 15. Webhooks

Tenants may register endpoints to receive company events. Payloads are signed with HMAC-SHA256 in `X-DCOS-Signature`; retries use exponential backoff for 24 hours.

| Event | Trigger |
|---|---|
| `company.status_changed` | Any lifecycle transition |
| `company.entity_approved` | Legal entity approved |
| `company.calendar_published` | Calendar or holidays published |
| `company.subscription_changed` | Plan or seats changed |
| `company.entitlement_changed` | Module enabled or disabled |
| `company.quota_threshold` | 80 / 95 / 100% reached |
| `company.export_ready` | Data export available |

```json
{
  "event": "company.quota_threshold",
  "event_id": "evt_01HZXD5M1P",
  "occurred_at": "2026-08-12T00:15:00Z",
  "company_id": "cmp_01HZX8K2M4",
  "data": { "metric": "storage_gb", "used": 421.7, "quota": 500, "percent": 84.34, "threshold": 80 }
}
```

---

## 16. Error Code Reference

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing, invalid, or expired token |
| `PERMISSION_DENIED` | 403 | Role lacks the required permission |
| `MODULE_NOT_ENTITLED` | 403 | Tenant's plan does not include this module |
| `TENANT_SUSPENDED` | 403 | Tenant is suspended or terminating — writes blocked |
| `STEP_UP_REQUIRED` | 403 | AAL 3 assertion missing or expired |
| `QUOTA_EXCEEDED` | 402 | Seat, project, or storage limit reached |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `CMP_IMMUTABLE_COMPANY_CODE` | 409 | Attempt to change the company code |
| `CMP_BASE_CURRENCY_LOCKED` | 409 | Financial transactions exist |
| `CMP_RESIDENCY_MIGRATION_REQUIRED` | 409 | Data residency change attempted |
| `CMP_ENTITY_CODE_DUPLICATE` | 409 | Entity code already used |
| `CMP_REGISTRATION_NO_DUPLICATE` | 409 | Registration number already registered |
| `CMP_ENTITY_NOT_APPROVED` | 409 | Entity not yet approved for use |
| `CMP_ENTITY_HAS_ACTIVE_PROJECTS` | 409 | Deactivation blocked by dependencies |
| `CMP_PRIMARY_ENTITY_REQUIRED` | 409 | Cannot deactivate the only primary entity |
| `CMP_JV_INTEREST_NOT_100` | 422 | Participating interests ≠ 100.0000% |
| `CMP_JV_NO_LEAD` / `CMP_JV_MULTIPLE_LEADS` | 422 | Lead participant rule violated |
| `CMP_DEPARTMENT_HAS_ACTIVE_USERS` | 409 | Reassign users first |
| `CMP_BRANCH_HAS_ACTIVE_PROJECTS` | 409 | Reassign or close projects first |
| `CMP_DISCIPLINE_CODE_LOCKED` | 409 | Code referenced by existing records |
| `CMP_CALENDAR_PERIOD_CLOSED` | 409 | Effective date inside a closed period |
| `CMP_CALENDAR_NO_WORKING_DAYS` | 422 | Pattern has zero working days |
| `CMP_NUMBERING_RULE_LOCKED` | 409 | Numbers already issued under this rule |
| `CMP_NUMBERING_INVALID_TOKEN` | 422 | Unknown token in pattern |
| `CMP_ASSET_VALIDATION_FAILED` | 422 | Branding file type, size, or dimensions invalid |
| `CMP_ASSET_MALWARE_DETECTED` | 422 | Upload quarantined |
| `CMP_EXPORT_IN_PROGRESS` | 409 | An export is already running |
| `CMP_ONBOARDING_INCOMPLETE` | 409 | Mandatory onboarding steps outstanding |

---

## 17. Consumed By

| Module | Endpoints Used |
|---|---|
| 03-01 Authentication | `GET /company/status` (tenant gate at token exchange) |
| 03-02 RBAC | `GET /companies/departments`, `/disciplines` for scope resolution |
| Project Setup | `GET /companies/legal-entities`, `/branches`, `/calendars`; `POST` number allocation |
| WBS Management | `GET /companies/disciplines` |
| Document Control | Number allocation; `GET .../branding` for transmittal rendering |
| Planning & Scheduling | All three calendar query endpoints |
| Timesheet / Leave / HR | Calendar query endpoints; `GET /companies/departments` |
| Procurement | `GET /companies/legal-entities` (issuing entity), number allocation, branding |
| Account / Finance | `GET /companies/legal-entities` (tax data), `/bank-accounts`, `GET /company` (currencies) |
| IPC / Retention | Entity as-of resolution, signatories, branding |
| Notification Engine | `GET /company` for timezone and locale of each recipient |
| Reporting | `GET /company/quota`, `/subscription`, department and discipline masters |

---

*Digital Construction Operating System — Foundation — Module 01 Company / Tenant Setup — Document 05 API Specification — Internal Controlled Document*
