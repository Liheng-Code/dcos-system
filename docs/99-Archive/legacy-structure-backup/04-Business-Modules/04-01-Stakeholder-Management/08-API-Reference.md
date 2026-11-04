# 08 — API Reference
## DCOS Stakeholder Management Module

| Field | Value |
|---|---|
| Document Code | DCOS-STK-API-001 |
| Module | Stakeholder Management (Module 04 — Foundation) |
| Version | R1.0 |
| Status | Issued for Review |
| Author Role | Senior System Architect / Backend Engineer |
| Date | 2026-08-08 |
| Base URL | `https://api.dcos.app/api/v1` |
| Related Documents | DCOS-STK-FS-001, DCOS-STK-DB-001, DCOS-STK-INT-001, DCOS-STK-RBAC-001 |

---

## 1. API Conventions

| Aspect | Convention |
|---|---|
| Base path | `/api/v1` |
| Versioning | URI path. Breaking changes bump to `/api/v2`. Additive changes do not bump. |
| Content type | `application/json; charset=utf-8` on request and response |
| Dates | ISO 8601 UTC with `Z` suffix: `2026-08-08T02:14:00Z`. Date-only fields: `2026-08-08`. |
| IDs | UUID v4 as strings |
| Casing | `snake_case` in payloads, matching the database |
| Pagination | Cursor-based. `?limit=50&cursor=<opaque>`. Maximum `limit` 200. |
| Sorting | `?sort=legal_name` or `?sort=-created_at` for descending. Multiple: comma-separated. |
| Filtering | `?status=ACTIVE&stakeholder_type=SUPPLIER_VENDOR,SUBCONTRACTOR`. Comma means OR within a field, AND across fields. |
| Field selection | `?fields=id,legal_name,status` to reduce payload. Masked fields are omitted regardless of request. |
| Idempotency | `Idempotency-Key` header required on all POST and PATCH. Keys retained 24 hours. |
| Concurrency | `If-Match: <version>` on PATCH and DELETE. Mismatch returns 409 with a diff. |
| Correlation | `X-Correlation-Id` accepted; generated if absent; echoed in the response and written to every audit entry. |

### 1.1 Standard Response Envelopes

```json
// Collection
{
  "data": [ /* … */ ],
  "pagination": {
    "limit": 50,
    "next_cursor": "eyJpZCI6IjlhMmMifQ",
    "prev_cursor": null,
    "total_count": 412
  },
  "meta": { "correlation_id": "corr-7f2e", "resolved_at": "2026-08-08T02:14:00Z" }
}

// Single resource
{
  "data": { /* … */ },
  "meta": { "correlation_id": "corr-7f2e" }
}
```

---

## 2. Authentication and Authorisation

Bearer JWT in the `Authorization` header. Required claims:

```json
{
  "sub": "u9f3a...",
  "tenant_id": "b3f1c...",
  "role": "PROJECT_MANAGER",
  "discipline": "STR",
  "is_external": false,
  "project_scope": ["9a2c...", "7b1d..."],
  "exp": 1786151514
}
```

**Tenant is read from the `tenant_id` claim only.** A `tenant_id` present in a request body, query string, or custom header that conflicts with the claim causes a `400 TENANT_MISMATCH` and a `CRITICAL` audit entry. It is never used, even when it matches.

Service-to-service calls to the resolution endpoints use mutual TLS plus a service JWT with `sub` of the form `svc:document-control`. These endpoints are not reachable from the public edge.

---

## 3. Error Model

```json
{
  "error": {
    "code": "STAKEHOLDER_BLACKLISTED",
    "message": "This stakeholder is blacklisted and cannot be assigned to a project.",
    "details": {
      "stakeholder_id": "s77a...",
      "reason_category": "CONTRACT_DEFAULT",
      "blacklisted_at": "2026-02-12T04:20:00Z"
    },
    "field_errors": [],
    "correlation_id": "corr-7f2e",
    "documentation_url": "https://docs.dcos.app/errors/STAKEHOLDER_BLACKLISTED"
  }
}
```

`details` is redacted for roles without `STK.VIEW_DETAIL` — the code and a generic message remain.

### 3.1 Error Code Catalogue

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | One or more fields failed validation; see `field_errors` |
| `TENANT_MISMATCH` | 400 | Body or query tenant conflicts with the JWT claim |
| `UNAUTHENTICATED` | 401 | Missing, malformed, or expired token |
| `INSUFFICIENT_PERMISSION` | 403 | Resource is in scope; the permission code is not held |
| `INSUFFICIENT_AUTHORITY` | 403 | Action requires `APPROVE` or `FINAL_APPROVE`; the party holds less |
| `NOT_FOUND` | 404 | Does not exist, or exists outside the caller's scope — deliberately indistinguishable |
| `DUPLICATE_ASSIGNMENT` | 409 | A live assignment already exists for this stakeholder and project |
| `VERSION_CONFLICT` | 409 | `If-Match` version is stale; response includes the current record and a field diff |
| `DUPLICATE_IDENTITY` | 422 | Exact registration or normalised identity match |
| `FUZZY_DUPLICATE` | 422 | Similarity above threshold; requires `confirm_distinct` with a reason |
| `BLACKLIST_IDENTITY_MATCH` | 422 | Normalised identity matches a blacklisted record |
| `STAKEHOLDER_NOT_ACTIVE` | 422 | Assignment attempted against a non-`ACTIVE` stakeholder |
| `STAKEHOLDER_BLACKLISTED` | 422 | Assignment attempted against a blacklisted stakeholder |
| `SELF_APPROVAL_FORBIDDEN` | 422 | Creator attempted to approve their own registration |
| `ASSIGNMENT_NO_AUTHORITY` | 422 | Activation attempted without approval authority |
| `ASSIGNMENT_NO_ACCESS` | 422 | Activation attempted without an access scope |
| `ASSIGNMENT_NO_RESPONSIBILITY` | 422 | Activation attempted without any responsibility enabled |
| `EXTERNAL_FULL_ACCESS_FORBIDDEN` | 422 | `FULL_ACCESS` attempted for an external stakeholder |
| `INVALID_FALLBACK_APPROVER` | 422 | Fallback is self, on another project, or holds lower authority |
| `DELEGATION_TOO_LONG` | 422 | Delegation exceeds 90 days |
| `OPEN_OBLIGATIONS_EXIST` | 422 | Termination blocked; `details.open_items[]` lists them |
| `MANDATORY_DOCUMENT_MISSING` | 422 | Activation blocked by a missing or expired mandatory document |
| `CONFIRMATION_MISMATCH` | 422 | Typed legal name does not match exactly |
| `NO_ELIGIBLE_APPROVER` | 422 | Resolution returned zero approvers — an error, never an empty success |
| `FILE_TOO_LARGE` | 413 | Upload exceeds 25 MB |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Not PDF, JPG, or PNG |
| `VIRUS_DETECTED` | 422 | Upload quarantined |
| `RATE_LIMITED` | 429 | Tenant rate limit exceeded |
| `RESOLUTION_UNAVAILABLE` | 503 | Resolution service down; caller must fail closed and queue |
| `INTERNAL_ERROR` | 500 | Unhandled; correlation ID is the support reference |

---

## 4. Rate Limiting

200 requests per minute per tenant on standard endpoints; 2,000 per minute on resolution endpoints, which are service-to-service and high volume.

```
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 147
X-RateLimit-Reset: 1786151574
Retry-After: 23          (on 429 only)
```

Exports and bulk imports consume a separate budget of 10 per hour per tenant.

---

## 5. Endpoint Reference

---

### 5.1 Stakeholder CRUD and Search

#### `GET /stakeholders`

List and search the register.
**Permission:** `STK.VIEW_LIST`

| Parameter | In | Type | Notes |
|---|---|---|---|
| `q` | query | string | Free text over organisation name, contact name, contact email, project role. Minimum 2 characters. |
| `stakeholder_type` | query | csv enum | Filter by type |
| `status` | query | csv enum | Filter by lifecycle status |
| `project_id` | query | uuid | Restrict to stakeholders assigned to this project |
| `discipline_code` | query | csv | |
| `approval_level` | query | csv enum | Requires `project_id` |
| `access_level` | query | csv enum | Requires `project_id` |
| `compliance_expiring_within_days` | query | integer | 1–365 |
| `reliability_min` / `reliability_max` | query | integer | 0–100 |
| `limit`, `cursor`, `sort`, `fields` | query | — | Standard |

```json
// 200
{
  "data": [
    {
      "id": "s44a1c22-0e91-4c5b-9a10-77ff2b3d8e01",
      "stakeholder_code": "STK-0142",
      "stakeholder_type": "CONSULTANT",
      "legal_name": "Angkor Structural Consultants Ltd",
      "trading_name": "Angkor Structural",
      "registration_number": "00012345",
      "country_code": "KH",
      "is_internal": false,
      "status": "ACTIVE",
      "is_preferred": true,
      "primary_contact": { "id": "c88b...", "full_name": "Sok Dara",
                           "position_title": "Structural Review Lead" },
      "project_context": { "project_id": "9a2c...", "project_role_code": "STR_CONSULTANT",
                           "discipline_code": "STR", "approval_level": "APPROVE" },
      "reliability_score": 74.2,
      "compliance_status": "CURRENT",
      "version": 7,
      "created_at": "2026-03-14T02:11:00Z"
    }
  ],
  "pagination": { "limit": 50, "next_cursor": "eyJpZCI6…", "total_count": 412 }
}
```

`project_context` appears only when `project_id` is supplied. `reliability_score` is omitted for roles without `STK.VIEW_PERFORMANCE`.

**Errors:** 401, 403, 429.
**Audit:** none. **Notifications:** none.

---

#### `GET /stakeholders/{stakeholder_id}`

**Permission:** `STK.VIEW_DETAIL`

Returns the full record with contacts, addresses, compliance documents, and assignment summaries. Fields are masked per DCOS-STK-RBAC-001 §8 — masked fields are **omitted**, not nulled.

**Errors:** 401, 403, 404 (including cross-tenant).
**Audit:** none for read; `STK.ACCESS.DENIED` at `HIGH` (or `CRITICAL` if cross-tenant) on a denied attempt.

---

#### `POST /stakeholders`

Create a stakeholder in `DRAFT`.
**Permission:** `STK.CREATE`
**Headers:** `Idempotency-Key` required.

```json
// Request
{
  "stakeholder_type": "CONSULTANT",
  "legal_name": "Angkor Structural Consultants Ltd",
  "trading_name": "Angkor Structural",
  "registration_number": "00012345",
  "tax_id": "K001-901234567",
  "country_code": "KH",
  "default_currency": "USD",
  "website": "https://angkor-structural.com",
  "addresses": [
    { "address_type": "REGISTERED_OFFICE", "address_line1": "No. 42, Street 310",
      "city": "Phnom Penh", "province": "Phnom Penh", "country_code": "KH",
      "is_primary": true }
  ],
  "contacts": [
    { "full_name": "Sok Dara", "full_name_local": "សុខ ដារា",
      "position_title": "Structural Review Lead", "discipline_code": "STR",
      "email": "sok.dara@angkor-structural.com", "mobile": "+855 12 345 678",
      "telegram_handle": "@sokdara", "preferred_channel": "EMAIL",
      "preferred_language": "en", "is_primary": true }
  ],
  "confirm_distinct": false,
  "confirm_distinct_reason": null
}
```

```json
// 201
{ "data": { "id": "s44a…", "status": "DRAFT", "version": 1,
            "duplicate_check": { "result": "CLEAR", "candidates": [] } } }
```

```json
// 422 FUZZY_DUPLICATE
{
  "error": {
    "code": "FUZZY_DUPLICATE",
    "message": "A similar organisation already exists. Use the existing record, or confirm this is a different organisation.",
    "details": {
      "candidates": [
        { "id": "s10b…", "legal_name": "Angkor Structural Consultants Co., Ltd.",
          "similarity": 0.94, "status": "ACTIVE", "stakeholder_type": "CONSULTANT",
          "registration_number": "00098765", "active_project_count": 2 }
      ],
      "override": "Resubmit with confirm_distinct=true and confirm_distinct_reason."
    }
  }
}
```

**Errors:** 400 `VALIDATION_FAILED`, 403, 422 `DUPLICATE_IDENTITY` / `FUZZY_DUPLICATE` / `BLACKLIST_IDENTITY_MATCH`.
**Audit:** `STK.STAKEHOLDER.CREATED` (Medium); `STK.STAKEHOLDER.DUPLICATE_BLOCKED` (Medium); `STK.STAKEHOLDER.BLACKLIST_MATCH_BLOCKED` (**Critical**).
**Notifications:** `STK.STAKEHOLDER.CREATED` → registration verifier.

---

#### `POST /stakeholders/duplicate-check`

Pre-flight check called on blur of the legal-name field, before any record exists.
**Permission:** `STK.CREATE`

```json
// Request
{ "legal_name": "A.B.C. Trading", "registration_number": null }

// 200
{
  "data": {
    "result": "FUZZY_MATCH",
    "normalised_name": "abctrading",
    "candidates": [
      { "id": "s21c…", "legal_name": "ABC Trading Co., Ltd.", "similarity": 0.94,
        "status": "ACTIVE", "stakeholder_type": "SUPPLIER_VENDOR" }
    ],
    "blacklist_match": false
  }
}
```

`result` is one of `CLEAR`, `FUZZY_MATCH`, `EXACT_MATCH`, `BLACKLIST_MATCH`. When `blacklist_match` is true, `candidates` is empty for roles without `STK.VIEW_DETAIL`.

---

#### `PATCH /stakeholders/{stakeholder_id}`

**Permission:** `STK.EDIT` · **Headers:** `If-Match`, `Idempotency-Key`

Partial update. Changing `legal_name` re-runs duplicate detection.

```json
// 409 VERSION_CONFLICT
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "This record was changed by Chan Sopheak. Review the differences.",
    "details": {
      "your_version": 7, "current_version": 9,
      "changed_by": "Chan Sopheak", "changed_at": "2026-08-08T01:58:00Z",
      "conflicting_fields": [
        { "field": "trading_name", "your_value": "Angkor Structural",
          "current_value": "Angkor Structural Consultants" }
      ]
    }
  }
}
```

**Audit:** `STK.STAKEHOLDER.UPDATED` (Medium) with `changed_fields`, `old_values`, `new_values`.

---

#### `POST /stakeholders/{stakeholder_id}/submit`

`DRAFT` → `PENDING_APPROVAL`.
**Permission:** `STK.CREATE`
**Errors:** 422 `VALIDATION_FAILED` (no contact), `MANDATORY_DOCUMENT_MISSING`.
**Audit:** `STK.STAKEHOLDER.SUBMITTED` (Medium). **Notification:** verifier.

---

#### `POST /stakeholders/{stakeholder_id}/approve-registration`

**Permission:** `STK.APPROVE_REGISTRATION`

```json
// Request
{ "decision": "APPROVE", "comment": "Licence and PI certificate verified." }
```

`decision` is `APPROVE` or `REJECT`; `comment` is mandatory on reject.
**Errors:** 422 `SELF_APPROVAL_FORBIDDEN`, 422 if not in `PENDING_APPROVAL`.
**Audit:** `STK.STAKEHOLDER.APPROVED` (High).

---

#### `POST /stakeholders/{stakeholder_id}/archive`

**Permission:** `STK.ARCHIVE`
**Errors:** 422 if any assignment is `ACTIVE`.
**Audit:** `STK.STAKEHOLDER.ARCHIVED` (High).

---

### 5.2 Contacts

#### `GET /stakeholders/{stakeholder_id}/contacts` — `STK.VIEW_DETAIL`
#### `POST /stakeholders/{stakeholder_id}/contacts` — `STK.EDIT`

```json
{ "full_name": "Chea Ratana", "full_name_local": "ជា រតនា",
  "position_title": "Principal Engineer", "discipline_code": "STR",
  "email": "chea.ratana@angkor-structural.com", "mobile": "+855 77 888 999",
  "telegram_handle": "@chearatana", "preferred_channel": "TELEGRAM",
  "preferred_language": "km", "is_primary": false }
```

**Errors:** 400 invalid email, 409 email already exists on this stakeholder.
**Audit:** `STK.CONTACT.CREATED` (Medium).

#### `PATCH /contacts/{contact_id}` — `STK.EDIT` · `If-Match`
#### `POST /contacts/{contact_id}/set-primary` — `STK.EDIT`

Atomic swap; the previous primary is demoted in the same transaction.
**Audit:** `STK.CONTACT.PRIMARY_CHANGED` (Medium).

#### `POST /contacts/{contact_id}/deactivate` — `STK.EDIT`

```json
// Request
{ "reason": "Left the organisation" }

// 422 OPEN_OBLIGATIONS_EXIST
{
  "error": {
    "code": "OPEN_OBLIGATIONS_EXIST",
    "message": "This contact is the only approver on 2 open items.",
    "details": {
      "open_items": [
        { "module": "DOC", "entity_type": "submittal", "entity_id": "d902…",
          "reference": "SUB-2026-0113", "age_days": 4 },
        { "module": "QAQC", "entity_type": "inspection_request", "entity_id": "i447…",
          "reference": "IR-2026-0498", "age_days": 1 }
      ]
    }
  }
}
```

**Audit:** `STK.CONTACT.DEACTIVATED` (Medium); cascades `STK.EXTERNAL_USER.REVOKED` (**Critical**) if a login exists.

---

### 5.3 Compliance Documents

#### `POST /stakeholders/{stakeholder_id}/documents` — `STK.EDIT`

`multipart/form-data`: `file` plus a `metadata` JSON part.

```json
{ "document_type_code": "PROFESSIONAL_INDEMNITY",
  "reference_number": "PI-2026-004411",
  "issuing_authority": "Forte Insurance (Cambodia) Plc",
  "issue_date": "2026-04-01", "expiry_date": "2027-03-31",
  "supersedes_document_id": "d331…" }
```

Processing: size check → MIME check → virus scan → storage write → metadata insert. The record is not created until the scan returns clean.

**Errors:** 413 `FILE_TOO_LARGE`, 415 `UNSUPPORTED_MEDIA_TYPE`, 422 `VIRUS_DETECTED`, 422 expiry before issue date.
**Audit:** `STK.DOCUMENT.UPLOADED` (Medium) with `file_hash_sha256`.

#### `GET /stakeholders/{stakeholder_id}/documents` — `STK.VIEW_DETAIL`

Returns metadata with `days_to_expiry` and `expiry_state` (`CURRENT` / `EXPIRING_60` / `EXPIRING_30` / `EXPIRING_7` / `EXPIRED`). Superseded documents are excluded unless `?include_superseded=true`.

#### `GET /documents/{document_id}/download-url` — `STK.VIEW_DETAIL`

```json
{ "data": { "download_url": "https://cdn.dcos.app/signed/…",
            "expires_at": "2026-08-08T02:29:00Z", "file_name": "PI-Certificate-2026.pdf" } }
```

Signed URL, 15-minute expiry, CDN delivery. Direct storage paths are never returned.
**Errors:** 404 for cross-tenant or out-of-scope — never 403.
**Audit:** `STK.DOCUMENT.DOWNLOADED` (High).

---

### 5.4 Project Assignments

#### `GET /projects/{project_id}/stakeholders` — `STK.VIEW_LIST`

The project matrix payload. Supports `?include=defects` to return unroutable-step diagnostics.

```json
{
  "data": [
    { "assignment_id": "aa11…", "stakeholder_id": "s44…",
      "legal_name": "Angkor Structural Consultants Ltd", "is_external": true,
      "project_role_code": "STR_CONSULTANT", "discipline_code": "STR",
      "status": "ACTIVE",
      "authority_summary": { "highest_level": "APPROVE", "scoped_rules": 2,
                             "fallback_configured": true },
      "access_summary": { "access_level": "LIMITED_ACCESS", "module_count": 3,
                          "wbs_restricted": false, "max_confidentiality_tier": 2 },
      "responsibility_count": 2,
      "contractual_representative": { "id": "c88…", "full_name": "Sok Dara" } }
  ],
  "meta": {
    "defects": [
      { "type": "NO_ELIGIBLE_APPROVER", "severity": "HIGH",
        "detail": "Fit-out material approval has no eligible approver on B01/L18–L22",
        "module_code": "PROC", "entity_type": "MATERIAL_APPROVAL",
        "wbs_path": "P001.B01.L18" },
      { "type": "NO_CONTRACTUAL_REPRESENTATIVE", "severity": "MEDIUM",
        "assignment_id": "aa77…", "detail": "Fire Authority has no representative assigned" }
    ],
    "matrix_complete": false
  }
}
```

#### `POST /stakeholders/{stakeholder_id}/project-assignments` — `STK.ASSIGN_PROJECT`

```json
{ "project_id": "9a2c…", "project_role_code": "STR_CONSULTANT",
  "discipline_code": "STR", "contractual_representative_id": "c88…",
  "contract_reference": "TA-CON-004",
  "planned_start_date": "2026-08-15", "planned_end_date": "2028-06-30" }
```

**Errors:** 422 `STAKEHOLDER_NOT_ACTIVE`, 422 `STAKEHOLDER_BLACKLISTED`, 409 `DUPLICATE_ASSIGNMENT`.
**Audit:** `STK.ASSIGNMENT.CREATED` (High).

#### `PATCH /stakeholder-assignments/{assignment_id}` — `STK.EDIT_ASSIGNMENT` · `If-Match`

Role or discipline change with in-flight items requires `change_reason`.
**Audit:** `STK.ASSIGNMENT.ROLE_CHANGED` (High).

#### `POST /stakeholder-assignments/{assignment_id}/activate` — `STK.EDIT_ASSIGNMENT`

```json
// 422 ASSIGNMENT_NO_AUTHORITY
{
  "error": {
    "code": "ASSIGNMENT_NO_AUTHORITY",
    "message": "Set an approval authority level before activating.",
    "details": {
      "readiness": {
        "role_and_discipline": true,
        "approval_authority": false,
        "access_scope": true,
        "workflow_responsibility": false
      }
    }
  }
}
```

The `readiness` object drives the UI checklist in SCR-STK-004 — the same structure returned on failure and on a pre-flight `GET`.
**Audit:** `STK.ASSIGNMENT.ACTIVATED` (High). **Notification:** contractual representative and Project Manager. **Cache:** invalidates `project:{id}`.

#### `POST /stakeholder-assignments/{assignment_id}/hold` — `STK.EDIT_ASSIGNMENT`

Body `{ "reason": "…" }`. In-flight approvals escalate to fallback within 60 seconds.

#### `GET /stakeholder-assignments/{assignment_id}/open-obligations` — `STK.VIEW_DETAIL`

Pre-flight for termination. Returns every open item across all consuming modules with the authority level required to accept a transfer.

#### `POST /stakeholder-assignments/{assignment_id}/terminate` — `STK.REMOVE_ASSIGNMENT`

```json
// Request
{
  "reason": "Design phase appointment complete; construction-phase consultant appointed.",
  "effective_date": "2026-08-31",
  "handover": [
    { "entity_type": "submittal", "entity_id": "d902…",
      "transfer_to_assignment_id": "aa55…" },
    { "entity_type": "rfi", "entity_id": "r118…", "orphan": true,
      "orphan_reason": "Superseded by RFI-2026-0221" }
  ]
}
```

```json
// 422 OPEN_OBLIGATIONS_EXIST — handover incomplete
{
  "error": {
    "code": "OPEN_OBLIGATIONS_EXIST",
    "message": "6 open items must be reassigned or explicitly orphaned.",
    "details": { "unhandled_count": 4, "open_items": [ /* … */ ] }
  }
}
```

**Errors:** also 422 `INSUFFICIENT_AUTHORITY` when a transferee lacks the level required for an item type.
**Audit:** `STK.ASSIGNMENT.TERMINATED` (High) with the handover map and orphan list; cascades `STK.EXTERNAL_USER.REVOKED` (**Critical**) per link.

---

### 5.5 Approval Authority

#### `GET /stakeholder-assignments/{assignment_id}/approval-authority` — `STK.VIEW_DETAIL`
#### `PUT /stakeholder-assignments/{assignment_id}/approval-authority` — `STK.SET_APPROVAL_AUTHORITY` · `If-Match`

```json
{
  "rules": [
    { "module_code": "DOC", "entity_type": "STR_SHOP_DRAWING",
      "workflow_step_code": "EXTERNAL_REVIEW", "approval_level": "APPROVE",
      "fallback_assignment_id": "aa55…" },
    { "module_code": "PROC", "entity_type": "PURCHASE_ORDER",
      "workflow_step_code": "ALL", "approval_level": "APPROVE",
      "threshold_amount": 50000, "threshold_currency": "USD",
      "fallback_assignment_id": "aa55…" }
  ],
  "change_reason": "Client instruction dated 2026-08-05",
  "in_flight_action": "REROUTE"
}
```

`in_flight_action` is `KEEP` or `REROUTE`, and is mandatory when in-flight items exist.

```json
// 200 with a gap warning
{
  "data": { "rules_saved": 2, "version": 4 },
  "meta": {
    "warnings": [
      { "code": "AUTHORITY_GAP",
        "message": "1 workflow step has no eligible approver after this change.",
        "gaps": [ { "module_code": "PROC", "entity_type": "MATERIAL_APPROVAL",
                    "wbs_path": "P001.B01.L18" } ] }
    ],
    "in_flight_rerouted": 4
  }
}
```

The gap is a warning, not a rejection — a Project Manager may legitimately configure authority in stages during mobilisation. The gap persists on the project matrix until resolved.

**Errors:** 422 `INVALID_FALLBACK_APPROVER`, `DELEGATION_TOO_LONG`, `VALIDATION_FAILED` (threshold on a non-`APPROVE` level).
**Audit:** `STK.AUTHORITY.CHANGED` (High); `STK.AUTHORITY.GAP_DETECTED` (High) when gaps are returned.
**Cache:** invalidates `project:{id}` and `assignment:{id}`.

---

### 5.6 Access Scope and WBS Scope

#### `PUT /stakeholder-assignments/{assignment_id}/access-scope` — `STK.SET_ACCESS_SCOPE` · `If-Match`

```json
{ "access_level": "LIMITED_ACCESS",
  "allowed_module_codes": ["DOC", "RFI", "DESIGN"],
  "max_confidentiality_tier": 2,
  "change_reason": "Design review scope per appointment" }
```

```json
// 422
{ "error": { "code": "EXTERNAL_FULL_ACCESS_FORBIDDEN",
             "message": "External stakeholders cannot be granted full access.",
             "details": { "stakeholder_type": "CONSULTANT", "is_external": true } } }
```

**Audit:** `STK.ACCESS.CHANGED` (High). **Cache:** invalidates `assignment:{id}`.

#### `PUT /stakeholder-assignments/{assignment_id}/wbs-scope` — `STK.SET_WBS_SCOPE` · `If-Match`

```json
{ "grants": [
    { "wbs_node_id": "w101…", "grant_type": "INCLUDE" },
    { "wbs_node_id": "w102…", "grant_type": "INCLUDE" },
    { "wbs_node_id": "w155…", "grant_type": "EXCLUDE" }
  ],
  "confirm_project_root": false }
```

```json
// 200
{ "data": { "grants_saved": 3, "redundant_collapsed": 4, "nodes_covered": 47,
            "version": 3 } }
```

`redundant_collapsed` reports descendant grants removed because an ancestor already covers them — the API normalises rather than storing duplicates.

**Errors:** 422 node belongs to another project; 422 requires `confirm_project_root` when a root grant is requested.
**Audit:** `STK.WBS_SCOPE.CHANGED` (High) with added and removed node lists.

---

### 5.7 Workflow Responsibilities

#### `PUT /stakeholder-assignments/{assignment_id}/workflow-responsibilities` — `STK.SET_WORKFLOW_RESPONSIBILITY`

```json
{ "responsibilities": [
    { "responsibility": "DOCUMENT_REVIEW", "is_enabled": true },
    { "responsibility": "RFI_RESPONSE", "is_enabled": true },
    { "responsibility": "INSPECTION_APPROVAL", "is_enabled": false }
  ] }
```

**Errors:** 422 when enabling `INSPECTION_APPROVAL` or `PAYMENT_CERTIFICATION` without `APPROVE` authority; 422 `OPEN_OBLIGATIONS_EXIST` when disabling with in-flight items.
**Audit:** `STK.RESPONSIBILITY.CHANGED` (Medium).

---

### 5.8 External User Provisioning

#### `POST /stakeholder-assignments/{assignment_id}/external-users` — `STK.PROVISION_EXTERNAL_USER`

```json
// Request
{ "contact_id": "c88…", "external_role_code": "CONSULTANT",
  "invitation_ttl_hours": 168 }

// 201
{
  "data": {
    "link_id": "l77…", "status": "INVITED",
    "invitation_expires_at": "2026-08-15T02:14:00Z",
    "effective_access_preview": {
      "project_name": "Tower A",
      "modules": ["Documents", "RFI", "Design Review"],
      "discipline": "STR",
      "wbs_scope": "Entire project",
      "authority": "REVIEW_ONLY",
      "max_confidentiality_tier": 2,
      "excluded": ["Cost data", "Other disciplines", "Internal documents",
                   "All other projects"]
    }
  }
}
```

`effective_access_preview` is computed by the same resolution logic that enforces access at runtime — not hand-written summary text. Somebody granting external access sees exactly what they are granting.

**Errors:** 422 assignment not `ACTIVE`; 422 contact has no email; 422 role is not external; 409 live link already exists.
**Audit:** `STK.EXTERNAL_USER.PROVISIONED` (**Critical**).

#### `POST /external-users/{link_id}/resend-invitation` — `STK.PROVISION_EXTERNAL_USER`

Issues a new single-use token; the previous token is invalidated immediately.

#### `DELETE /external-users/{link_id}` — `STK.PROVISION_EXTERNAL_USER`

Body `{ "reason": "…" }`. Idempotent — repeated calls against an already-revoked link return 200 with no side effects, so the nightly reconciliation job can run safely against unknown state.
**Audit:** `STK.EXTERNAL_USER.REVOKED` (**Critical**) with `revocation_trigger`.

---

### 5.9 Status Transitions

#### `POST /stakeholders/{stakeholder_id}/suspend` — `STK.EDIT`

```json
{ "reason_category": "COMPLIANCE_LAPSE",
  "reason_text": "Professional indemnity certificate expired 2026-07-30." }
```

```json
// 200
{ "data": { "status": "SUSPENDED", "frozen_assignments": 3,
            "escalated_approvals": 2,
            "halted_approvals": [
              { "assignment_id": "aa19…", "reason": "No fallback approver configured",
                "module_code": "QAQC", "entity_id": "i447…" }
            ] } }
```

`halted_approvals` is deliberately surfaced in the success response. The suspension succeeded; two items escalated cleanly and one has nowhere to go. That third item is now somebody's problem, and the response says so rather than leaving it to be discovered later.

**Audit:** `STK.STAKEHOLDER.SUSPENDED` (High). **Notification:** affected PMs, Document Controller. **Cache:** invalidated.

#### `POST /stakeholders/{stakeholder_id}/reinstate` — `STK.EDIT`

**Errors:** 422 when the suspension cause persists, with `details.blocking_causes[]`.

#### `POST /stakeholders/{stakeholder_id}/blacklist` — `STK.BLACKLIST`

```json
{ "reason_category": "CONTRACT_DEFAULT",
  "reason_text": "Abandoned site at 62% completion; termination notice served 2026-02-08.",
  "evidence_reference": "DOC-2026-0442",
  "confirm_legal_name": "Mekong Interior Solutions Co., Ltd." }
```

**Errors:** 422 `CONFIRMATION_MISMATCH`; 422 `VALIDATION_FAILED` when `reason_text` is under 20 characters.

```json
// 200
{ "data": { "status": "BLACKLISTED", "terminated_assignments": 2,
            "revoked_logins": 4, "projects_affected": ["Tower A", "Riverside Fit-out"],
            "open_items_requiring_reassignment": 14,
            "identity_indexed": "mekonginteriorsolutions" } }
```

**Audit:** `STK.STAKEHOLDER.BLACKLISTED` (**Critical**). **Notification:** Company Admin, Project Director, all affected PMs, Procurement Manager — in-app, email, Telegram.

#### `POST /stakeholders/{stakeholder_id}/unblacklist` — `STK.UNBLACKLIST`

Requires `justification` and `confirm_legal_name`. Transitions to `INACTIVE`, never directly to `ACTIVE`.

---

### 5.10 Performance

#### `GET /stakeholders/{stakeholder_id}/performance` — `STK.VIEW_PERFORMANCE`

```json
{
  "data": {
    "tenant_wide": {
      "reliability_score": 74.2, "is_sufficient_data": true, "event_count": 47,
      "avg_response_days": 18.4, "avg_approval_delay_days": 4.2,
      "task_completion_rate": 88.0, "doc_turnaround_compliance": 71.0,
      "warning_threshold": 80, "critical_threshold": 60,
      "state": "WARNING", "computed_at": "2026-08-08T02:00:00Z"
    },
    "by_project": [
      { "project_id": "9a2c…", "project_name": "Tower A",
        "reliability_score": 68.1, "event_count": 31, "state": "WARNING" }
    ]
  }
}
```

Fewer than 10 events returns `is_sufficient_data: false` and a null score — never zero.

#### `GET /stakeholders/{stakeholder_id}/performance/events` — `STK.VIEW_PERFORMANCE`

Paginated event ledger with filters for project, module, date range, and SLA compliance.

#### `POST /performance/events` — service auth only

Ingestion endpoint. Idempotent on `(source_module, source_entity_type, source_entity_id, event_type)`. A duplicate returns 200 with `"duplicate": true` rather than 409 — the emitting module should not need to track whether it has already sent an event.

There is no endpoint to write or modify a score. None exists for any role (BRL-STK-017).

---

### 5.11 Resolution Service

Service-to-service only. Not reachable from the public edge.

#### `POST /stakeholder-resolution/approvers`

Full request and response schemas in DCOS-STK-INT-001 §5.1.
**Auth:** service JWT. **SLA:** < 50 ms cached, < 200 ms cold, p95.
**Caching:** result cached with tags `project:{id}`, `assignment:{id}`. Zero-approver results are **never** cached — a halted workflow must recover the moment the gap is fixed.

```json
// 422 NO_ELIGIBLE_APPROVER — the calling module must halt, never auto-approve
{
  "resolved": false,
  "error_code": "NO_ELIGIBLE_APPROVER",
  "diagnostics": {
    "assignments_on_project": 47, "with_required_responsibility": 12,
    "matching_discipline": 3, "covering_wbs_node": 0,
    "with_sufficient_authority": 0, "failing_dimension": "wbs_scope"
  },
  "notification_raised": true
}
```

**Audit:** `STK.RESOLUTION.NO_APPROVER` (**Critical**) on the failure path.

#### `POST /stakeholder-resolution/notification-recipients`
#### `POST /stakeholder-resolution/access-check`
#### `POST /stakeholder-resolution/bulk-access-check`

Up to 500 resources per call; returns an allow/deny decision per resource ID. Used to filter list responses for external users in one round trip rather than N.

#### `POST /stakeholder-resolution/supplier-eligibility`

```json
// Request
{ "stakeholder_id": "s77…", "project_id": "9a2c…", "amount": 48200, "currency": "USD" }

// 200 — blocked
{ "eligible": false,
  "reasons": [ { "code": "COMPLIANCE_EXPIRED",
                 "detail": "Public Liability Insurance expired 2026-07-30" } ],
  "assignment_id": "aa42…" }
```

#### `POST /stakeholder-resolution/wbs-scope-check`

Deletion guard for WBS Management. Blocking when `has_active_scopes` is true.

#### `GET /stakeholder-resolution/project-matrix-completeness/{project_id}`

Gate for issue-for-construction. Returns `matrix_complete` plus the defect list.

---

### 5.12 Bulk Import, Export, Audit

#### `POST /stakeholders/import/validate` — `STK.CREATE`

`multipart/form-data` with the file and a column mapping. Dry run only — no writes.

```json
{ "data": { "import_session_id": "imp-77a…", "total_rows": 480,
            "ready": 402, "matches_existing": 61, "internal_duplicates": 12,
            "invalid": 5,
            "rows": [
              { "row_number": 31, "legal_name": "Mekong Interiors (Cambodia) Ltd",
                "issue_code": "BLACKLIST_IDENTITY_MATCH",
                "issue_detail": "Matches a blacklisted organisation",
                "actions_available": [] }
            ] } }
```

`actions_available` is empty for a blacklist match. There is no merge, skip, or override — the row cannot be imported by any means.

#### `POST /stakeholders/import/commit` — `STK.CREATE`

Body: `{ "import_session_id": "imp-77a…", "row_actions": [ … ] }`. Transactional; a mid-batch failure rolls the entire batch back. All created records land in `DRAFT` — imported records can never enter `ACTIVE` directly.

#### `POST /stakeholders/export` — `STK.EXPORT`

Body carries the filter set and `format` (`XLSX` or `CSV`). Under 10,000 rows returns a signed URL synchronously; above that, returns a job ID and notifies on completion.
**Audit:** `STK.STAKEHOLDER.EXPORTED` (High) with filter set, row count, and format.

#### `GET /stakeholders/{stakeholder_id}/audit` — `STK.VIEW_AUDIT`

Returns the combined status history and audit trail for the record, filtered by the caller's audit scope (Document Controller sees document and contact events only, per RBAC condition ⁷).

---

## 6. Webhooks

Consumers register an HTTPS endpoint and receive the 17 event codes from DCOS-STK-INT-001 §6.2.

```
POST <consumer endpoint>
X-DCOS-Event: STK.AUTHORITY.CHANGED
X-DCOS-Event-Id: evt-01J7X…
X-DCOS-Signature: sha256=<hmac>
X-DCOS-Delivery-Attempt: 1
```

Signature is HMAC-SHA256 over the raw body using a per-consumer secret. Consumers must verify before processing and must be idempotent on `event_id` — delivery is at-least-once. Retry schedule: 1s, 5s, 30s, 2m, 10m; five attempts then dead-letter with an ops alert. Replay is available for 90 days.

---

## 7. Realtime Channels

| Channel | Payload | Subscribers |
|---|---|---|
| `tenant:{tenant_id}:stakeholders` | Register row changes for live list updates | Register screen |
| `tenant:{tenant_id}:stakeholder-counts` | Type-filter count deltas | Type filter panel |
| `project:{project_id}:stakeholders` | Assignment changes and matrix defect changes | Project matrix screen |
| `stakeholder:{stakeholder_id}` | Detail-level changes | Open detail panel |

Channel subscriptions are authorised through the same access check as the REST endpoints. A subscription that would deliver out-of-scope rows is rejected at subscribe time, not filtered at delivery.

---

## 8. Versioning and Deprecation

| Change | Treatment |
|---|---|
| New optional field, new endpoint, new enum value in a response | Additive; no version bump |
| Removing a field, renaming, changing a type, changing default behaviour | Breaking; requires `/api/v2` |
| Deprecation | `Deprecation` and `Sunset` headers on affected endpoints, minimum 180 days notice |
| Enum expansion | Consumers must tolerate unknown enum values rather than failing |

---

## 9. OpenAPI Fragment

```yaml
openapi: 3.1.0
info:
  title: DCOS Stakeholder Management API
  version: "1.0.0"
servers:
  - url: https://api.dcos.app/api/v1
security:
  - bearerAuth: []
paths:
  /stakeholders:
    get:
      operationId: listStakeholders
      summary: List and search the stakeholder register
      parameters:
        - { name: q, in: query, schema: { type: string, minLength: 2 } }
        - { name: stakeholder_type, in: query, schema: { type: string } }
        - { name: status, in: query, schema: { type: string } }
        - { name: project_id, in: query, schema: { type: string, format: uuid } }
        - { name: limit, in: query, schema: { type: integer, default: 50, maximum: 200 } }
        - { name: cursor, in: query, schema: { type: string } }
      responses:
        "200":
          description: Stakeholder collection
          content:
            application/json:
              schema: { $ref: "#/components/schemas/StakeholderCollection" }
        "401": { $ref: "#/components/responses/Unauthenticated" }
        "403": { $ref: "#/components/responses/Forbidden" }
        "429": { $ref: "#/components/responses/RateLimited" }
    post:
      operationId: createStakeholder
      parameters:
        - { name: Idempotency-Key, in: header, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/StakeholderCreate" }
      responses:
        "201":
          description: Created in DRAFT
          content:
            application/json:
              schema: { $ref: "#/components/schemas/Stakeholder" }
        "422": { $ref: "#/components/responses/UnprocessableEntity" }

  /stakeholders/{stakeholder_id}/project-assignments:
    post:
      operationId: createAssignment
      parameters:
        - { name: stakeholder_id, in: path, required: true,
            schema: { type: string, format: uuid } }
        - { name: Idempotency-Key, in: header, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/AssignmentCreate" }
      responses:
        "201": { description: Assignment created in DRAFT }
        "409": { description: DUPLICATE_ASSIGNMENT }
        "422": { description: STAKEHOLDER_NOT_ACTIVE or STAKEHOLDER_BLACKLISTED }

  /stakeholder-resolution/approvers:
    post:
      operationId: resolveApprovers
      security: [ { serviceAuth: [] } ]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/ResolveApproversRequest" }
      responses:
        "200": { description: Ordered approver list }
        "422": { description: NO_ELIGIBLE_APPROVER — caller must halt the workflow step }
        "503": { description: RESOLUTION_UNAVAILABLE — caller must fail closed }

components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT }
    serviceAuth: { type: http, scheme: bearer, bearerFormat: JWT }
  schemas:
    Stakeholder:
      type: object
      required: [id, stakeholder_type, legal_name, status, version]
      properties:
        id: { type: string, format: uuid }
        stakeholder_code: { type: string, nullable: true }
        stakeholder_type:
          type: string
          enum: [CLIENT_OWNER, CONSULTANT, ARCHITECT_DESIGNER, MAIN_CONTRACTOR,
                 SUBCONTRACTOR, SUPPLIER_VENDOR, AUTHORITY, TESTING_AGENCY,
                 UTILITY_AUTHORITY, INSURANCE_BONDING, INTERNAL_DEPARTMENT, JV_PARTNER]
        legal_name: { type: string, minLength: 2, maxLength: 200 }
        trading_name: { type: string, nullable: true }
        registration_number: { type: string, nullable: true }
        country_code: { type: string, minLength: 2, maxLength: 2 }
        default_currency: { type: string, minLength: 3, maxLength: 3 }
        is_internal: { type: boolean }
        status:
          type: string
          enum: [DRAFT, PENDING_APPROVAL, ACTIVE, SUSPENDED, INACTIVE, BLACKLISTED]
        is_preferred: { type: boolean }
        reliability_score: { type: number, nullable: true, minimum: 0, maximum: 100 }
        version: { type: integer }
    StakeholderCreate:
      type: object
      required: [stakeholder_type, legal_name]
      properties:
        stakeholder_type: { $ref: "#/components/schemas/Stakeholder/properties/stakeholder_type" }
        legal_name: { type: string, minLength: 2, maxLength: 200 }
        registration_number: { type: string }
        confirm_distinct: { type: boolean, default: false }
        confirm_distinct_reason: { type: string, nullable: true }
    AssignmentCreate:
      type: object
      required: [project_id, project_role_code]
      properties:
        project_id: { type: string, format: uuid }
        project_role_code: { type: string }
        discipline_code: { type: string, default: "ALL" }
        contractual_representative_id: { type: string, format: uuid, nullable: true }
        planned_start_date: { type: string, format: date }
        planned_end_date: { type: string, format: date }
    ResolveApproversRequest:
      type: object
      required: [project_id, module_code, entity_type]
      properties:
        project_id: { type: string, format: uuid }
        wbs_node_id: { type: string, format: uuid, nullable: true }
        discipline_code: { type: string, nullable: true }
        module_code: { type: string }
        entity_type: { type: string }
        workflow_step_code: { type: string, default: "ALL" }
        amount: { type: number, nullable: true }
        currency: { type: string, nullable: true }
    StakeholderCollection:
      type: object
      properties:
        data: { type: array, items: { $ref: "#/components/schemas/Stakeholder" } }
        pagination: { $ref: "#/components/schemas/Pagination" }
    Pagination:
      type: object
      properties:
        limit: { type: integer }
        next_cursor: { type: string, nullable: true }
        total_count: { type: integer }
    Error:
      type: object
      properties:
        error:
          type: object
          properties:
            code: { type: string }
            message: { type: string }
            details: { type: object }
            correlation_id: { type: string }
  responses:
    Unauthenticated:
      description: Missing or invalid token
      content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } }
    Forbidden:
      description: Permission not held, or authority insufficient
      content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } }
    UnprocessableEntity:
      description: Business rule violation
      content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } }
    RateLimited:
      description: Tenant rate limit exceeded
      content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } }
```

---

## 10. Endpoint Index

| # | Method | Path | Permission |
|---|---|---|---|
| 1 | GET | `/stakeholders` | `STK.VIEW_LIST` |
| 2 | GET | `/stakeholders/{id}` | `STK.VIEW_DETAIL` |
| 3 | POST | `/stakeholders` | `STK.CREATE` |
| 4 | POST | `/stakeholders/duplicate-check` | `STK.CREATE` |
| 5 | PATCH | `/stakeholders/{id}` | `STK.EDIT` |
| 6 | POST | `/stakeholders/{id}/submit` | `STK.CREATE` |
| 7 | POST | `/stakeholders/{id}/approve-registration` | `STK.APPROVE_REGISTRATION` |
| 8 | POST | `/stakeholders/{id}/archive` | `STK.ARCHIVE` |
| 9 | GET | `/stakeholders/{id}/contacts` | `STK.VIEW_DETAIL` |
| 10 | POST | `/stakeholders/{id}/contacts` | `STK.EDIT` |
| 11 | PATCH | `/contacts/{id}` | `STK.EDIT` |
| 12 | POST | `/contacts/{id}/set-primary` | `STK.EDIT` |
| 13 | POST | `/contacts/{id}/deactivate` | `STK.EDIT` |
| 14 | POST | `/stakeholders/{id}/documents` | `STK.EDIT` |
| 15 | GET | `/stakeholders/{id}/documents` | `STK.VIEW_DETAIL` |
| 16 | GET | `/documents/{id}/download-url` | `STK.VIEW_DETAIL` |
| 17 | GET | `/projects/{id}/stakeholders` | `STK.VIEW_LIST` |
| 18 | POST | `/stakeholders/{id}/project-assignments` | `STK.ASSIGN_PROJECT` |
| 19 | PATCH | `/stakeholder-assignments/{id}` | `STK.EDIT_ASSIGNMENT` |
| 20 | POST | `/stakeholder-assignments/{id}/activate` | `STK.EDIT_ASSIGNMENT` |
| 21 | POST | `/stakeholder-assignments/{id}/hold` | `STK.EDIT_ASSIGNMENT` |
| 22 | GET | `/stakeholder-assignments/{id}/open-obligations` | `STK.VIEW_DETAIL` |
| 23 | POST | `/stakeholder-assignments/{id}/terminate` | `STK.REMOVE_ASSIGNMENT` |
| 24 | GET | `/stakeholder-assignments/{id}/approval-authority` | `STK.VIEW_DETAIL` |
| 25 | PUT | `/stakeholder-assignments/{id}/approval-authority` | `STK.SET_APPROVAL_AUTHORITY` |
| 26 | PUT | `/stakeholder-assignments/{id}/access-scope` | `STK.SET_ACCESS_SCOPE` |
| 27 | PUT | `/stakeholder-assignments/{id}/wbs-scope` | `STK.SET_WBS_SCOPE` |
| 28 | PUT | `/stakeholder-assignments/{id}/workflow-responsibilities` | `STK.SET_WORKFLOW_RESPONSIBILITY` |
| 29 | POST | `/stakeholder-assignments/{id}/external-users` | `STK.PROVISION_EXTERNAL_USER` |
| 30 | POST | `/external-users/{id}/resend-invitation` | `STK.PROVISION_EXTERNAL_USER` |
| 31 | DELETE | `/external-users/{id}` | `STK.PROVISION_EXTERNAL_USER` |
| 32 | POST | `/stakeholders/{id}/suspend` | `STK.EDIT` |
| 33 | POST | `/stakeholders/{id}/reinstate` | `STK.EDIT` |
| 34 | POST | `/stakeholders/{id}/blacklist` | `STK.BLACKLIST` |
| 35 | POST | `/stakeholders/{id}/unblacklist` | `STK.UNBLACKLIST` |
| 36 | GET | `/stakeholders/{id}/performance` | `STK.VIEW_PERFORMANCE` |
| 37 | GET | `/stakeholders/{id}/performance/events` | `STK.VIEW_PERFORMANCE` |
| 38 | POST | `/performance/events` | service auth |
| 39 | POST | `/stakeholder-resolution/approvers` | service auth |
| 40 | POST | `/stakeholder-resolution/notification-recipients` | service auth |
| 41 | POST | `/stakeholder-resolution/access-check` | service auth |
| 42 | POST | `/stakeholder-resolution/bulk-access-check` | service auth |
| 43 | POST | `/stakeholder-resolution/supplier-eligibility` | service auth |
| 44 | POST | `/stakeholder-resolution/wbs-scope-check` | service auth |
| 45 | GET | `/stakeholder-resolution/project-matrix-completeness/{id}` | service auth |
| 46 | POST | `/stakeholders/import/validate` | `STK.CREATE` |
| 47 | POST | `/stakeholders/import/commit` | `STK.CREATE` |
| 48 | POST | `/stakeholders/export` | `STK.EXPORT` |
| 49 | GET | `/stakeholders/{id}/audit` | `STK.VIEW_AUDIT` |

---

## 11. Open Questions

| ID | Question | Impact |
|---|---|---|
| Q-29 | Should `PUT /approval-authority` be `PUT` (full replace) or `PATCH` (rule-level)? Full replace is safer against partial-update races but requires the client to send all rules. | Client complexity vs safety |
| Q-30 | Should `bulk-access-check` cap below 500 to protect p95 latency? (Q-20 from Integration) | API contract |
| Q-31 | Should `total_count` be omitted on large result sets to avoid an expensive count query on every list call? | List performance |
| Q-32 | Should webhook replay be self-service for consumers, or operator-initiated only? | Operational surface |

---

## 12. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1.0 | 2026-08-08 | Initial issue — 49 endpoints, error catalogue, webhook and realtime contracts, OpenAPI fragment | Senior System Architect |

---

**End of Document**
