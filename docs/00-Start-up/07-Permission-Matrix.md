# DCOS — Module 01 Company / Tenant Setup
## Document 07 — Permission Matrix

**Digital Construction Operating System — Foundation Layer**

| Field | Value |
|---|---|
| Document Code | DCOS-CMP-07-PERM |
| Module | 01 — Company / Tenant Setup (`CMP`) |
| Version | R1 — Initial Issue |
| Source | Auto — generated from the RBAC seed migration, reconciled to this specification |
| Permission Namespace | `company:*`, `entity:*`, `branch:*`, `department:*`, `discipline:*`, `calendar:*`, `numbering:*`, `branding:*`, `bank_account:*`, `signatory:*`, `subscription:*`, `platform:*` |
| Parent Documents | DCOS-CMP-01-BR · DCOS-CMP-04-DB · DCOS-CMP-05-API |
| Owning Module for Role Definitions | 03-02 RBAC |
| Classification | Internal — Strategic Architecture |
| Status | For Development |

---

## 1. Principles

| # | Principle |
|---|---|
| P-01 | **Authentication proves identity; RBAC grants power; this matrix says what power means for company data.** Module 03-01 supplies the verified `user_id` and `tid`; 03-02 resolves the permission set; this document defines the permissions themselves. |
| P-02 | **Tenant boundary is absolute and is enforced below RBAC.** No permission in this matrix grants access to another tenant's data. Cross-tenant access exists only through the platform-admin role with explicit, audited impersonation. |
| P-03 | **Read is not free.** Legal, tax, banking, and commercial data are restricted by default and masked for roles without explicit clearance. |
| P-04 | **Irreversible actions require step-up.** Anything that permanently locks a value, touches money, applies a signature, or exports the tenant requires AAL 3 (Authentication R1 §6.2). |
| P-05 | **Approval is separated from execution.** A Company Admin can prepare a legal entity; only a Director approves it. The person who configures is not the person who authorises. |
| P-06 | **Deny by default.** A permission absent from a role's set is denied. There is no implicit inheritance between roles. |
| P-07 | **Entitlement is checked before permission.** A user with `equipment:read` in a tenant without the Equipment module gets `MODULE_NOT_ENTITLED`, not `PERMISSION_DENIED`. |

---

## 2. Roles in Scope

The platform roles from the DCOS role list, as they relate to this module. Roles not listed here (Engineer, BIM Coordinator, QA/QC Inspector, HSE Officer, Site Supervisor, Subcontractor, Supplier, Viewer) receive the **Baseline** permission set only.

| Code | Role | Relevance to Company / Tenant Setup |
|---|---|---|
| `PLATFORM_OWNER` | Platform Owner | Commercial authority over tenants; approves provisioning, plan change, termination |
| `SUPER_ADMIN` | Super Admin | Platform operator; provisions, suspends, impersonates |
| `COMPANY_ADMIN` | Company Admin | Primary owner of everything in this module |
| `DIRECTOR` | Project Director / CEO | Approves legal entities, JVs, signatories, numbering locks, restructures |
| `FINANCE_MGR` | Finance Manager | Reads tax and banking data; maintains bank accounts |
| `ACCOUNTANT` | Accountant | Reads entity tax data for posting; no configuration rights |
| `QS_MGR` | QS / Commercial Manager | Reads entity and signatory data for contracts and IPCs |
| `HR_OFFICER` | HR Officer | Reads and proposes calendar and holiday changes; reads departments |
| `PROJECT_MANAGER` | Project Manager | Reads entities, branches, calendars to set up projects |
| `DISCIPLINE_MGR` | Discipline Manager | Reads disciplines and departments |
| `DOC_CONTROLLER` | Document Controller | Proposes and reads numbering rules; reads branding |
| `IT_ADMIN` | IT / Security | Reads configuration and audit; manages nothing commercial |
| `CLIENT` / `CONSULTANT` | External reviewer | Baseline only — sees the tenant's public identity, nothing more |

---

## 3. Permission Catalogue

| Permission | Description | Step-Up | Restricted Data |
|---|---|---|---|
| `company:read` | View company profile and defaults | — | — |
| `company:update` | Edit mutable profile fields | — | — |
| `company:export` | Request a full tenant data export | **Yes** | Yes |
| `entity:read` | View legal entities (statutory fields masked) | — | — |
| `entity:read_restricted` | Unmask registration no., TIN, VAT | — | **Yes** |
| `entity:create` | Create and submit a legal entity | — | — |
| `entity:update` | Edit a legal entity | — | — |
| `entity:approve` | Approve or reject a legal entity or JV | **Yes** | — |
| `entity:deactivate` | Set dormant / dissolving | **Yes** | — |
| `signatory:read` | View authorised signatories | — | — |
| `signatory:create` | Add a signatory record | — | — |
| `signatory:update` | Edit a signatory record | **Yes** | — |
| `signatory:approve` | Authorise a signatory for use | **Yes** | — |
| `signatory:apply` | Apply a signature to a document | **Yes** | — |
| `branch:read` / `:create` / `:update` / `:deactivate` | Branch register | — | — |
| `department:read` / `:create` / `:update` / `:deactivate` | Department master | — | — |
| `discipline:read` / `:create` / `:update` / `:deactivate` | Discipline master | — | — |
| `calendar:read` | View calendars and holidays | — | — |
| `calendar:create` / `:update` | Draft calendar and holiday changes | — | — |
| `calendar:publish` | Publish a calendar — triggers recalculation | — | — |
| `numbering:read` | View numbering rules and sequences | — | — |
| `numbering:create` / `:update` | Define numbering patterns | — | — |
| `numbering:approve` | Approve a pattern (locks permanently on first use) | **Yes** | — |
| `numbering:void` | Void an issued number with reason | **Yes** | — |
| `branding:read` / `:update` | Branding assets | — | — |
| `bank_account:read` | View bank accounts (number masked) | — | — |
| `bank_account:read_restricted` | Unmask account numbers | — | **Yes** |
| `bank_account:create` / `:update` | Maintain bank accounts | **Yes** | **Yes** |
| `subscription:read` | View plan, seats, quota | — | Yes (commercials) |
| `subscription:request` | Request a plan or seat change | — | — |
| `platform:tenant_read` | List and view any tenant | — | Yes |
| `platform:tenant_provision` | Create a tenant | — | Yes |
| `platform:tenant_lifecycle` | Suspend / reactivate / terminate | **Yes** | Yes |
| `platform:subscription_manage` | Apply plan and entitlement changes | **Yes** | Yes |
| `platform:impersonate` | Break-glass session into a tenant | **Yes** | Yes |

---

## 4. Master Permission Matrix

**Legend:** ● Full · ◐ Restricted / masked · ○ Read-only · ▲ Request or propose only · **A** Approve · — No access

### 4.1 Company Profile and Settings

| Permission | PLATFORM_OWNER | SUPER_ADMIN | COMPANY_ADMIN | DIRECTOR | FINANCE_MGR | QS_MGR | HR_OFFICER | PROJECT_MANAGER | DOC_CONTROLLER | IT_ADMIN | Baseline |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `company:read` | ● | ● | ● | ● | ● | ● | ● | ● | ● | ● | ○ |
| `company:update` | — | ◐¹ | ● | — | — | — | — | — | — | — | — |
| `company:export` | — | — | ●² | **A** | — | — | — | — | — | — | — |
| View onboarding state | ● | ● | ● | ○ | — | — | — | — | — | ○ | — |
| Finalise onboarding | — | ◐¹ | ● | — | — | — | — | — | — | — | — |

¹ Super Admin edits tenant profile only during Provisioning, or through an audited impersonation session.
² Requires step-up and Director approval; limited to 2 requests per day.

**Baseline `company:read`** returns only: trading name, logo, timezone, default language, and current status banner. Statutory, financial, and commercial fields are excluded entirely — not masked, absent from the payload.

### 4.2 Legal Entities

| Permission | SUPER_ADMIN | COMPANY_ADMIN | DIRECTOR | FINANCE_MGR | ACCOUNTANT | QS_MGR | PROJECT_MANAGER | IT_ADMIN | Baseline |
|---|---|---|---|---|---|---|---|---|---|
| `entity:read` | ◐ | ● | ● | ● | ● | ● | ● | ○ | — |
| `entity:read_restricted` | — | ● | ● | ● | ● | — | — | — | — |
| `entity:create` | — | ● | ● | ▲ | — | — | — | — | — |
| `entity:update` | — | ● | ● | ▲ | — | — | — | — | — |
| `entity:approve` | — | — | **A** | — | — | — | — | — | — |
| `entity:deactivate` | — | ▲ | **A** | — | — | — | — | — | — |
| View entity versions | — | ● | ● | ● | ● | ● | ○ | ○ | — |

**The critical separation.** `entity:create` and `entity:approve` are never held by the same role. A Company Admin drafts the entity; a Director approves it. This is not bureaucracy — an unapproved entity can issue a purchase order in the name of a company that does not legally exist.

### 4.3 Joint Ventures and Signatories

| Permission | COMPANY_ADMIN | DIRECTOR | QS_MGR | FINANCE_MGR | PROJECT_MANAGER | Baseline |
|---|---|---|---|---|---|---|
| View JV participants | ● | ● | ● | ● | ○ | — |
| Create / edit JV participants | ● | ● | ▲ | — | — | — |
| Approve JV entity | — | **A** | — | — | — | — |
| `signatory:read` | ● | ● | ● | ● | ○ | — |
| `signatory:create` | ● | ● | ▲ | — | — | — |
| `signatory:update` | ● | ● | — | — | — | — |
| `signatory:approve` | — | **A** | — | — | — | — |
| `signatory:apply` | — | ● | ● | ● | ◐³ | — |

³ Project Manager may apply a signature only where the signatory record explicitly names them and the document type is within `authority_scope`. Every application requires step-up and records the assertion id on the output document — mirroring Authentication R1 §6.2, which is what makes the signature non-repudiable in a dispute.

### 4.4 Organisation Structure

| Permission | COMPANY_ADMIN | DIRECTOR | HR_OFFICER | PROJECT_MANAGER | DISCIPLINE_MGR | Baseline |
|---|---|---|---|---|---|---|
| `branch:read` | ● | ● | ● | ● | ● | ○ |
| `branch:create` / `:update` | ● | ● | ▲ | ▲⁴ | — | — |
| `branch:deactivate` | ● | ● | — | — | — | — |
| `department:read` | ● | ● | ● | ● | ● | ○ |
| `department:create` / `:update` | ● | ● | ● | — | — | — |
| `department:deactivate` | ● | ● | ▲ | — | — | — |
| `discipline:read` | ● | ● | ● | ● | ● | ○ |
| `discipline:create` / `:update` | ● | ● | — | — | ▲ | — |
| `discipline:deactivate` | ● | ● | — | — | — | — |

⁴ Project Manager may create a **site office or project office branch** for their own assigned projects only. All other branch types require Company Admin.

**Baseline read on branches, departments, and disciplines** is intentional: every user needs the department list to route a request and the discipline list to file a document. Withholding it just produces free-text guesses.

### 4.5 Calendar and Holidays

| Permission | COMPANY_ADMIN | DIRECTOR | HR_OFFICER | PROJECT_MANAGER | PLANNING (Discipline Mgr) | Baseline |
|---|---|---|---|---|---|---|
| `calendar:read` | ● | ● | ● | ● | ● | ○ |
| `calendar:create` | ● | ● | ● | — | ▲ | — |
| `calendar:update` | ● | ● | ● | — | ▲ | — |
| `calendar:publish` | ● | **A** | ▲ | — | — | — |
| Add / remove holidays | ● | ● | ● | — | — | — |
| Import country template | ● | — | ● | — | — | — |
| Project calendar override | ● | ● | — | ●⁵ | ● | — |

⁵ Project Manager may set a shutdown override on their own project only, and only forward-dated.

**Why HR co-owns the calendar.** The working calendar is simultaneously a scheduling artefact and an employment artefact. HR owns the holiday entitlement side; Planning owns the float side. Splitting ownership means the same calendar gets maintained twice and diverges. Giving both roles write access to one record, with Director sign-off to publish, keeps a single source of truth.

**Baseline `calendar:read`** is required by every user — a site engineer needs to know whether next Monday is a working day.

### 4.6 Numbering

| Permission | COMPANY_ADMIN | DIRECTOR | DOC_CONTROLLER | QS_MGR | PROJECT_MANAGER | Baseline |
|---|---|---|---|---|---|---|
| `numbering:read` | ● | ● | ● | ● | ● | ○ |
| Preview a pattern | ● | ● | ● | ○ | ○ | — |
| `numbering:create` / `:update` | ● | ● | ▲ | — | — | — |
| `numbering:approve` | — | **A** | — | — | — | — |
| `numbering:void` | ● | ● | ● | ● | ◐⁶ | — |
| View voided register | ● | ● | ● | ● | ● | — |

⁶ Project Manager may void numbers on their own projects only.

**Director approval on numbering is deliberate.** A numbering pattern locks permanently on first issue and is embedded in every document the company will ever produce for that project. A two-minute approval prevents a decade of `P001-STRDWG001` with no separators.

### 4.7 Branding and Bank Accounts

| Permission | COMPANY_ADMIN | DIRECTOR | FINANCE_MGR | ACCOUNTANT | DOC_CONTROLLER | QS_MGR | Baseline |
|---|---|---|---|---|---|---|---|
| `branding:read` | ● | ● | ● | ○ | ● | ● | ○ |
| `branding:update` | ● | ● | — | — | ▲ | — | — |
| `bank_account:read` (masked) | ● | ● | ● | ● | — | ○ | — |
| `bank_account:read_restricted` | — | ● | ● | ● | — | — | — |
| `bank_account:create` | — | **A** | ● | — | — | — | — |
| `bank_account:update` | — | **A** | ● | — | — | — | — |

**Company Admin cannot create bank accounts.** This is intentional and non-negotiable. The system administrator role must never be able to introduce a payment destination. Finance creates; a Director approves. This single separation removes the most common internal fraud vector in a construction ERP.

### 4.8 Subscription, Entitlement, and Quota

| Permission | PLATFORM_OWNER | SUPER_ADMIN | COMPANY_ADMIN | DIRECTOR | FINANCE_MGR | IT_ADMIN | Baseline |
|---|---|---|---|---|---|---|---|
| `subscription:read` | ● | ● | ● | ● | ● | ○ | — |
| View commercials (price) | ● | ● | ◐⁷ | ● | ● | — | — |
| `subscription:request` | — | — | ● | ● | ▲ | — | — |
| Apply subscription change | **A** | ● | — | — | — | — | — |
| Toggle module entitlement | **A** | ● | — | — | — | — | — |
| View entitlements | ● | ● | ● | ● | ● | ● | ● |
| View quota usage | ● | ● | ● | ● | ● | ● | — |

⁷ Company Admin sees seat and storage counts but not contract pricing unless also granted `subscription:read_commercials`.

**Everyone sees entitlements.** The client shell calls `GET /company/entitlements` on session start to build navigation. Withholding this would mean rendering menu items that return 403 — a support ticket generator.

### 4.9 Platform Administration

| Permission | PLATFORM_OWNER | SUPER_ADMIN | Everyone Else |
|---|---|---|---|
| `platform:tenant_read` | ● | ● | — |
| `platform:tenant_provision` | **A** | ● | — |
| `platform:tenant_lifecycle` — suspend | **A** | ● | — |
| `platform:tenant_lifecycle` — terminate | **A** + dual confirm | ▲ | — |
| `platform:subscription_manage` | **A** | ● | — |
| `platform:impersonate` — read-only | — | ● | — |
| `platform:impersonate` — write | **A** | ▲ | — |
| Run RLS self-test | ● | ● | — |
| View platform audit log | ● | ● | — |

**No platform role can read tenant business data directly.** `platform:tenant_read` returns metadata only: status, plan, seat counts, storage, last activity. To see a project, a drawing, or an invoice, the Super Admin must open an impersonation session with a stated reason, and the customer is notified immediately (WF-15).

---

## 5. Field-Level Restrictions

| Field | Table | Default | Unmask Permission | Audit on Unmask |
|---|---|---|---|---|
| `registration_number` | `legal_entity` | Masked — last 3 shown | `entity:read_restricted` | `CMP.RESTRICTED_FIELD_UNMASKED` (High) |
| `tax_identification_no` | `legal_entity` | Masked — last 3 shown | `entity:read_restricted` | High |
| `vat_registration_no` | `legal_entity` | Masked — last 4 shown | `entity:read_restricted` | High |
| `account_number` | `company_bank_account` | Masked — last 4 shown | `bank_account:read_restricted` | **Critical** |
| `iban`, `swift_code` | `company_bank_account` | Masked | `bank_account:read_restricted` | **Critical** |
| `signature_image_url` | `entity_signatory` | Omitted from payload | `signatory:read` + `signatory:apply` | High on use |
| `price_per_period` | `subscription_plan` | Omitted | `subscription:read_commercials` | Medium |
| `external_billing_ref` | `company_subscription` | Omitted | `platform:subscription_manage` | Medium |

**Masking is applied at the API serialisation layer, not the database.** The row is fetched intact and the response is redacted, so RLS remains the only tenant boundary and masking cannot be bypassed by a crafted query. Every response carries a `_restricted` array naming the redacted fields, so the UI can render an explicit "unmask" affordance rather than silently showing dots.

---

## 6. Step-Up Authentication Requirements (AAL 3)

Per Authentication R1 §6.2 — a fresh challenge within the last 5 minutes, bound to the session and the specific action reference.

| Action | Reason |
|---|---|
| Approve a legal entity | Creates a contracting party capable of binding the company |
| Approve a Joint Venture | Commits the company to joint liability |
| Deactivate or dissolve an entity | Structural change with tax and contractual consequence |
| Approve a signatory | Authorises someone to bind the company |
| Apply a signature to a document | Legal instrument, non-repudiation required |
| Create or update a bank account | Payment destination — primary fraud vector |
| Approve a numbering pattern | Permanent, irreversible lock on document identity |
| Void an issued number | Alters the integrity of a controlled register |
| Request a tenant data export | Bulk data exfiltration control |
| Suspend or terminate a tenant | Service-affecting, contractually consequential |
| Apply a subscription or entitlement change | Commercial and access-affecting |
| Start an impersonation session | Vendor access to customer data |

Actions **not** requiring step-up: profile edits, branch and department maintenance, discipline naming, calendar drafting, branding upload, reading anything.

---

## 7. Approval Chains

| Action | Prepared By | Approved By | Second Approval | Notified |
|---|---|---|---|---|
| Legal entity creation | Company Admin | Director | — | Finance, QS |
| JV formation | Commercial Manager | Director | — | Finance, Project Director |
| Entity deactivation | Company Admin | Director | — | Finance, all PMs of affected projects |
| Signatory authorisation | Company Admin | Director | — | Company Admin, IT |
| Bank account creation | Finance Manager | Director | — | Accountant, Company Admin |
| Numbering pattern | Document Controller | Company Admin | Director | All PMs |
| Calendar publish | HR Officer / Company Admin | Director | — | All users, Planning |
| Subscription change | Company Admin | Super Admin | Platform Owner | Director, Finance |
| Module entitlement change | Super Admin | Platform Owner | — | Company Admin, affected users |
| Tenant suspension | Super Admin | Platform Owner | — | Company Admin, Director |
| Tenant termination | Super Admin | Platform Owner | Company Admin typed confirmation | All admins |
| Data export | Company Admin | Director | — | Company Admin, IT |
| Impersonation (write) | Super Admin | Platform Owner | — | Target user, Company Admin, Director |

---

## 8. External Party Access

Client, Consultant, Subcontractor, and Supplier users hold **Baseline only** within this module, and their Baseline is narrower still.

| Data | External Visibility |
|---|---|
| Company trading name and logo | Visible — appears on transmittals and correspondence they receive |
| Contracting legal entity name and address for **their** contract | Visible |
| Contracting entity TIN / VAT for **their** contract | Visible on issued documents only, never through the API |
| All other legal entities | **Not visible** |
| Group structure, ownership, JV interests | **Not visible** |
| Branches, departments, disciplines | Discipline list only, for document filing |
| Working calendar | Visible — needed to interpret response deadlines |
| Bank accounts | **Never visible** |
| Subscription, quota, entitlements | **Never visible** |
| Signatories | Name and position on documents issued to them only |

A subcontractor must never be able to enumerate the group structure of the company they work for. That is commercially sensitive information with no operational purpose in their workflow.

---

## 9. Enforcement Layers

```text
Layer 1 — Network        TLS, rate limits, IP allowlist for admin roles (optional per tenant)
Layer 2 — Authentication Token signature, expiry, session status, device binding      → 401
Layer 3 — Tenant Gate    company.status check; suspended tenants are read-only        → 403
Layer 4 — Entitlement    module enabled for this tenant                               → 403 MODULE_NOT_ENTITLED
Layer 5 — RBAC           permission present in the resolved role set                  → 403 PERMISSION_DENIED
Layer 6 — Step-Up        AAL 3 assertion present, fresh, and bound to this action     → 403 STEP_UP_REQUIRED
Layer 7 — Row-Level      PostgreSQL RLS on company_id                                 → empty result set
Layer 8 — Field-Level    API serialisation masking of restricted fields               → masked payload
Layer 9 — Quota          seat / storage / project ceiling for create operations       → 402 QUOTA_EXCEEDED
Layer 10 — Audit         every allow AND every deny recorded
```

**Layer 7 is the one that matters.** Layers 2 through 6 are application logic and can be defeated by a bug. RLS is enforced by the database itself and holds even if the application layer is wrong. Gap Analysis R1 §5.2 is explicit on this: isolation must be at the row level, not just the application layer.

**Denied requests are logged.** A user repeatedly hitting `PERMISSION_DENIED` on `bank_account:read_restricted` is a signal worth surfacing, not silence worth discarding.

---

## 10. RLS Policy Mapping

| Table | Policy | Additional Restriction |
|---|---|---|
| `company` | `company_id = current_tenant()` | Update restricted to `company:update` at API layer |
| `legal_entity` | `company_id = current_tenant()` | Restricted fields masked without `entity:read_restricted` |
| `legal_entity_version` | `company_id = current_tenant()` | Read-only to all roles; written by trigger only |
| `jv_participant` | `company_id = current_tenant()` | — |
| `entity_signatory` | `company_id = current_tenant()` | `signature_image_url` omitted without `signatory:apply` |
| `company_branch` | `company_id = current_tenant()` | PM writes limited to own projects at API layer |
| `company_department` | `company_id = current_tenant()` | — |
| `company_discipline` | `company_id = current_tenant()` | — |
| `company_calendar`, `calendar_*` | `company_id = current_tenant()` | — |
| `numbering_rule`, `numbering_sequence` | `company_id = current_tenant()` | — |
| `voided_sequence` | `company_id = current_tenant()` | Insert-only; no update or delete policy |
| `entity_branding` | `company_id = current_tenant()` | — |
| `company_bank_account` | `company_id = current_tenant()` | Account number masked without `bank_account:read_restricted` |
| `company_subscription`, `subscription_history` | `company_id = current_tenant()` | Commercials omitted without clearance |
| `company_module_entitlement` | `company_id = current_tenant()` | Read for all authenticated; write platform-only |
| `company_quota_usage` | `company_id = current_tenant()` | — |
| `company_lifecycle_event` | `company_id = current_tenant()` | Insert-only; platform-written |
| `data_export_request` | `company_id = current_tenant()` | Own requests only unless `company:export` |
| `subscription_plan`, `plan_module_entitlement` | Platform-global | Read-only to tenants; prices omitted |
| `tenant_provisioning_request` | Platform-only | No tenant access |

`DELETE` policies are created on **no** table in this module. Deletion is not a supported operation (DB-05).

---

## 11. Audit Coverage

Every permission decision in this module is logged, per R0 §24.4 severity rules.

| Action Class | Severity | Logged |
|---|---|---|
| Read of non-restricted company data | Low | Not logged individually (volume) |
| Read of restricted field (unmask) | **High** | Always — actor, field, record, timestamp |
| Create / update of configuration | Medium | Always with old / new values |
| Approval or rejection | **High** | Always with step-up assertion id |
| Signature application | **Critical** | Always with document reference and assertion id |
| Bank account create / update | **Critical** | Always |
| Numbering pattern lock | **High** | Always |
| Entitlement or subscription change | **High** | Always |
| Tenant lifecycle transition | **Critical** | Always |
| Impersonation start / end | **Critical** | Always, with full action list |
| Data export request / download | **Critical** | Always |
| Permission denied | Medium | Always — 5+ denials on one permission within an hour escalates to Company Admin |
| Cross-tenant access attempt | **Critical** | Always — immediate alert to IT and Platform Owner |

---

## 12. Test Assertions

The following must pass in CI before this module is released.

| # | Assertion |
|---|---|
| T-01 | A Company A session returns zero rows from every `core.*` table filtered to Company B |
| T-02 | `company_id` supplied in a request body is rejected with `IMMUTABLE_FIELD`, never honoured |
| T-03 | A Company Admin cannot approve a legal entity they created |
| T-04 | A Company Admin cannot create a bank account under any role combination |
| T-05 | `entity:read` without `entity:read_restricted` returns masked TIN and a populated `_restricted` array |
| T-06 | Unmasking emits `CMP.RESTRICTED_FIELD_UNMASKED` before the response is returned |
| T-07 | Every step-up action rejects a request with an assertion older than 5 minutes |
| T-08 | A step-up assertion bound to action A is rejected when presented for action B |
| T-09 | A suspended tenant returns 403 on every write and 200 on Company Admin reads |
| T-10 | A disabled module returns `MODULE_NOT_ENTITLED`, never `PERMISSION_DENIED` |
| T-11 | An external (client/consultant) session cannot list legal entities |
| T-12 | A Project Manager can create a site-office branch on their own project and is denied on another project |
| T-13 | No table in `core` with a `company_id` column lacks an RLS policy |
| T-14 | No `DELETE` policy exists on any table in this module |
| T-15 | An impersonation session with `write_access: false` is denied on every mutating endpoint |
| T-16 | A denied request is present in the audit log within 5 seconds |

---

## 13. Open Items for R2

| # | Item |
|---|---|
| O-01 | Custom role builder — tenants defining their own roles from this permission catalogue (owned by 03-02 RBAC) |
| O-02 | Time-boxed elevation — temporary Director rights during leave, with automatic expiry |
| O-03 | Per-entity permission scoping — restricting a Finance Manager to one legal entity in a group |
| O-04 | Field-level encryption to replace masking for TIN, VAT, and bank account numbers |
| O-05 | Anomaly scoring on restricted-field access patterns (bulk unmasking detection) |

---

*Digital Construction Operating System — Foundation — Module 01 Company / Tenant Setup — Document 07 Permission Matrix — Internal Controlled Document*
