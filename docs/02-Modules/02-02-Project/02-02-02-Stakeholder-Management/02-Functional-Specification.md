# 02 — Functional Specification
## DCOS Stakeholder Management Module

| Field | Value |
|---|---|
| Document Code | DCOS-STK-FS-001 |
| Module | Stakeholder Management (Module 04 — Foundation) |
| Version | R1.0 |
| Status | Issued for Review |
| Author Role | Senior System Architect |
| Date | 2026-08-08 |
| Related Documents | DCOS-STK-BRD-001, DCOS-STK-DB-001, DCOS-STK-RBAC-001, DCOS-STK-INT-001 |

---

## 1. Module Overview

Stakeholder Management is a Foundation-phase module in the DCOS Application Layer. It owns the stakeholder master data domain and publishes the **Stakeholder Resolution Service**, the platform-wide authority that answers three questions for every other module:

```
resolveApprovers(project, wbs_node, module, entity_type, step) → ordered approver list
resolveNotificationRecipients(event_code, context)             → recipient list
checkAccess(user, project, wbs_node, module, action)           → allow | deny + reason
```

No module queries stakeholder tables directly. All access is through the service or a published read view.

### 1.1 Position in the Layer Model

```
User Interface Layer
└── Admin Configuration → Stakeholder Management (SCR-STK-001..015)
    └── Contextual entry: Project Detail → Stakeholders tab

Application Layer
├── Stakeholder Domain Service        ← this module
├── Stakeholder Resolution Service    ← published by this module
├── Approval Workflow Engine          → consumer
├── Notification Engine               → consumer
├── Audit Trail Engine                → sink
└── RBAC Engine                       → collaborator

Data Layer
└── 15 stakeholder_* and project_stakeholders tables, all tenant-scoped with RLS
```

---

## 2. Screen Inventory

| Screen ID | Name | Primary Actor |
|---|---|---|
| SCR-STK-001 | Stakeholder Register | Document Controller |
| SCR-STK-002 | Add Stakeholder (multi-step drawer) | Document Controller |
| SCR-STK-003 | Stakeholder Detail Panel | All internal roles |
| SCR-STK-004 | Project Assignment Drawer | Project Manager |
| SCR-STK-005 | Approval Authority Configuration | Project Manager |
| SCR-STK-006 | Access Control & WBS Scope Picker | Project Manager |
| SCR-STK-007 | Workflow Responsibility Toggles | Discipline Manager |
| SCR-STK-008 | Contact Management | Document Controller |
| SCR-STK-009 | Compliance Document Register | Document Controller |
| SCR-STK-010 | Performance Tracking Panel | Project Director |
| SCR-STK-011 | Status Change / Blacklist Dialog | Company Admin |
| SCR-STK-012 | External User Provisioning | Company Admin |
| SCR-STK-013 | Bulk Import & Validation Report | Company Admin |
| SCR-STK-014 | Project Stakeholder Matrix | Project Manager |
| SCR-STK-015 | Mobile Stakeholder Directory | Site Supervisor |

---

## 3. Functional Requirements

Legend — **Phase**: `M` = MVP, `2` = Phase 2, `3` = Phase 3.

### 3.1 Stakeholder Register (SCR-STK-001)

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-001 | Display a paginated register of stakeholder organisations for the current tenant, columns: Organisation Name, Stakeholder Type, Contact Person, Project Role, Approval Level, Status. | Tenant context + filters → RLS-scoped query with cursor pagination → row set + total count | Empty tenant → empty state, not error. Query timeout → retry banner. | `STK.VIEW_LIST` | — | M |
| FR-STK-002 | Provide a left type-filter panel listing all stakeholder types with a live count per type and an "All Stakeholders" entry. | Tenant context → grouped count query (materialised view) → type list with counts | Counts refresh within 5s of a status change. Stale count is acceptable; wrong tenant count is not. | `STK.VIEW_LIST` | — | M |
| FR-STK-003 | Provide instant search across organisation name, contact person name, contact email, and project role, returning results without a page reload. | Search string (min 2 chars) → debounced 200 ms → trigram/full-text query → filtered rows | Under 2 chars, no query. No match → "no results" state with clear-filter action. | `STK.VIEW_LIST` | — | M |
| FR-STK-004 | Provide advanced filters: status, project, discipline, approval level, access level, compliance expiry within N days, reliability score band. | Filter set → composed predicate → filtered rows + active filter chips | Mutually exclusive filters resolved by AND. Invalid filter value ignored with a chip warning. | `STK.VIEW_LIST` | — | M |
| FR-STK-005 | Open the detail panel on row click and highlight the row on hover, without navigating away from the register. | Row id → detail fetch → right panel populated | Deleted/archived row selected → panel shows archived banner. | `STK.VIEW_DETAIL` | — | M |
| FR-STK-006 | Export the current filtered register to XLSX and CSV, respecting field-level masking for the acting role. | Filter set → async export job → signed download URL | Export over 10,000 rows → async with notification on completion. | `STK.EXPORT` | `STK.STAKEHOLDER.EXPORTED` | M |

### 3.2 Stakeholder Creation and Duplicate Detection (SCR-STK-002)

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-007 | Create a stakeholder organisation with type, legal name, trading name, registration number, tax ID, country, and default currency. | Form payload → normalise name → duplicate check → insert in `DRAFT` | Legal name required, 2–200 chars. Registration number unique per tenant when present. Type must be a canonical code. | `STK.CREATE` | `STK.STAKEHOLDER.CREATED` | M |
| FR-STK-008 | Run duplicate detection on create and on legal-name edit, matching on normalised name (case-folded, punctuation-stripped, legal-suffix-stripped) and registration number within the tenant. | Legal name + registration number → normalisation → exact and fuzzy match (trigram similarity ≥ 0.85) → candidate list | Exact match on registration number → hard block. Fuzzy match → soft block with "use existing / confirm distinct" choice requiring a reason. | `STK.CREATE` | `STK.STAKEHOLDER.DUPLICATE_BLOCKED` | M |
| FR-STK-009 | Block creation when the normalised identity matches a `BLACKLISTED` record, and flag the attempt for Company Admin review. | Normalised identity → blacklist index lookup → block + flag | Hard block with the blacklist reason shown only to roles holding `STK.VIEW_DETAIL`; other roles see a generic block message. | `STK.CREATE` | `STK.STAKEHOLDER.BLACKLIST_MATCH_BLOCKED` | 2 |
| FR-STK-010 | Submit a `DRAFT` stakeholder for verification, moving it to `PENDING_APPROVAL`. | Stakeholder id → completeness check → status transition | Requires at least one contact and all mandatory fields for the type. | `STK.CREATE` | `STK.STAKEHOLDER.SUBMITTED` | M |
| FR-STK-011 | Approve or reject a pending stakeholder registration. The creator may not approve their own submission. | Decision + comment → status transition to `ACTIVE` or back to `DRAFT` | Rejection requires a comment. Self-approval blocked (BRL-STK-015). | `STK.APPROVE_REGISTRATION` | `STK.STAKEHOLDER.APPROVED` | M |
| FR-STK-012 | Edit an existing stakeholder's profile with optimistic concurrency control. | Changed fields + version → version check → update | Version mismatch → 409 with a diff view. Legal name change re-runs duplicate detection. | `STK.EDIT` | `STK.STAKEHOLDER.UPDATED` | M |
| FR-STK-013 | Archive a stakeholder to `INACTIVE`. Hard deletion is not available in any environment. | Stakeholder id + reason → check for active assignments → soft archive | Blocked while any assignment is `ACTIVE`. Reason mandatory. | `STK.ARCHIVE` | `STK.STAKEHOLDER.ARCHIVED` | M |

### 3.3 Organisation Profile, Addresses, Contacts (SCR-STK-008)

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-014 | Maintain multiple addresses per stakeholder, typed as registered office, correspondence, site office, or warehouse, with exactly one primary. | Address payload → insert/update → primary re-assignment | Setting a new primary demotes the previous one atomically. | `STK.EDIT` | `STK.STAKEHOLDER.UPDATED` | M |
| FR-STK-015 | Maintain multiple contact persons with name (Latin and Khmer script supported), position, discipline, email, mobile, Telegram handle, preferred channel, and preferred language. | Contact payload → validate → insert | Email format validated. Email unique within the stakeholder. At least one contact required for `ACTIVE`. | `STK.EDIT` | `STK.CONTACT.CREATED` | M |
| FR-STK-016 | Designate exactly one primary contact per stakeholder, and one contractual representative per project assignment. | Contact id → flag update | Removing the primary contact is blocked until another is designated. | `STK.EDIT` | `STK.CONTACT.PRIMARY_CHANGED` | M |
| FR-STK-017 | Deactivate a contact person without deleting them, preserving historical references from workflow records. | Contact id + reason → soft deactivate | Blocked if the contact is the sole active approver on an in-flight workflow step; must reassign first. | `STK.EDIT` | `STK.CONTACT.DEACTIVATED` | M |

### 3.4 Compliance Documents (SCR-STK-009)

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-018 | Upload compliance documents against a stakeholder with document type, reference number, issue date, expiry date, issuing authority, and file. | File + metadata → virus scan → store at `tenant/{tenant_id}/stakeholders/{stakeholder_id}/` → index | Max 25 MB. Allowed: PDF, JPG, PNG. Infected file quarantined with admin alert. Expiry must be after issue date. | `STK.EDIT` | `STK.DOCUMENT.UPLOADED` | M |
| FR-STK-019 | Configure per stakeholder type which compliance document types are mandatory, in Admin Configuration. | Type + document type + mandatory flag → config store | A stakeholder cannot reach `ACTIVE` while a mandatory document for its type is absent or expired. | `STK.EDIT` (config: `ADMIN.CONFIGURE`) | `STK.CONFIG.CHANGED` | 2 |
| FR-STK-020 | Run a daily scan for compliance documents expiring in 60, 30, and 7 days and at expiry, issuing notifications to the Document Controller and Project Managers of affected projects. | Scheduled job (tenant-scoped) → expiry query → notification dispatch | Job failure raises an ops alert; it never silently skips a tenant. | System | `STK.DOCUMENT.EXPIRING` / `STK.DOCUMENT.EXPIRED` | M |
| FR-STK-021 | Automatically move a stakeholder to `SUSPENDED` when a mandatory compliance document passes expiry, unless a Company Admin records a time-boxed override with a reason. | Expiry event → status transition → notification | Override requires a reason and an expiry date not more than 90 days ahead. | System / `STK.EDIT` for override | `STK.STAKEHOLDER.SUSPENDED` | 2 |
| FR-STK-022 | Download a compliance document via a signed, expiring URL; never expose a direct storage path. | Document id → permission check → signed URL, 15-minute expiry | Cross-tenant document id returns 404, never 403. | `STK.VIEW_DETAIL` | `STK.DOCUMENT.DOWNLOADED` | M |

### 3.5 Project Assignment (SCR-STK-004)

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-023 | Assign an `ACTIVE` stakeholder to a project with project role, discipline, contractual representative, planned start and end dates, and contract reference. | Assignment payload → eligibility checks → insert in `DRAFT` | Blocked for `DRAFT`, `PENDING_APPROVAL`, `SUSPENDED`, `INACTIVE`, `BLACKLISTED` stakeholders, with the specific reason returned. | `STK.ASSIGN_PROJECT` | `STK.ASSIGNMENT.CREATED` | M |
| FR-STK-024 | Prevent a duplicate assignment of the same organisation to the same project while an existing assignment is not terminated. | Project + stakeholder → uniqueness check | Returns 409 with a link to the existing assignment. | `STK.ASSIGN_PROJECT` | — | M |
| FR-STK-025 | Activate an assignment only when approval authority, access level, and at least one workflow responsibility are configured. | Assignment id → completeness gate → status `ACTIVE` | Blocked with a checklist of what is missing. | `STK.EDIT_ASSIGNMENT` | `STK.ASSIGNMENT.ACTIVATED` | M |
| FR-STK-026 | Change the project role or discipline of an active assignment, preserving the prior value in assignment history. | Changed fields → history write → update → cache invalidation | Role change requires a reason when in-flight workflow items exist. | `STK.EDIT_ASSIGNMENT` | `STK.ASSIGNMENT.ROLE_CHANGED` | M |
| FR-STK-027 | Place an assignment `ON_HOLD` and resume it, freezing workflow participation while held. | Assignment id + reason → status transition → escalate in-flight items | In-flight approvals held by the party escalate to the fallback approver; they are never silently dropped. | `STK.EDIT_ASSIGNMENT` | `STK.ASSIGNMENT.ON_HOLD` | 2 |
| FR-STK-028 | Terminate an assignment, requiring that open obligations are reassigned or explicitly orphaned with a Project Manager reason. | Assignment id + reason + handover map → obligation scan → reassignment → status `TERMINATED` | Termination blocked while open obligations remain unhandled. Displays the full open-item list. | `STK.REMOVE_ASSIGNMENT` | `STK.ASSIGNMENT.TERMINATED` | M |
| FR-STK-029 | On termination, revoke all linked external user access for that assignment within one hour, and immediately on explicit revoke. | Termination event → user link revocation → session invalidation | Nightly reconciliation catches any missed revocation and alerts. | System | `STK.EXTERNAL_USER.REVOKED` | M |
| FR-STK-030 | Provide a Project Stakeholder Matrix (SCR-STK-014) showing every party on a project with role, discipline, authority, access, responsibilities, and status, exportable for the kick-off record. | Project id → assignment aggregate → matrix | Highlights incomplete assignments and unfilled mandatory project roles. | `STK.VIEW_LIST` | `STK.STAKEHOLDER.EXPORTED` on export | M |

### 3.6 Approval Authority (SCR-STK-005)

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-031 | Set an approval authority level (`NO_APPROVAL`, `REVIEW_ONLY`, `APPROVE`, `FINAL_APPROVE`) on an assignment, optionally scoped per module and per entity type. | Authority payload → validate → upsert → cache invalidation | Null level rejected on active assignments (BRL-STK-004). Overlapping scopes resolved by most-specific-wins. | `STK.SET_APPROVAL_AUTHORITY` | `STK.AUTHORITY.CHANGED` | M |
| FR-STK-032 | Set an optional monetary threshold on `APPROVE` authority for procurement and payment entities, in the project currency. | Threshold + currency → validate → store | Threshold only permitted on `APPROVE`, not on `REVIEW_ONLY`. Currency must match project currency. | `STK.SET_APPROVAL_AUTHORITY` | `STK.AUTHORITY.CHANGED` | 2 |
| FR-STK-033 | Define a fallback approver per authority record, used when the primary is suspended, on hold, or unavailable. | Fallback assignment id → validate → store | Fallback must hold equal or higher authority on the same project. Self-reference rejected. | `STK.SET_APPROVAL_AUTHORITY` | `STK.AUTHORITY.CHANGED` | M |
| FR-STK-034 | Warn at save time when an authority configuration produces a workflow step with no eligible approver for any project WBS branch. | Authority set → simulate resolution across workflow templates → gap report | Save permitted with acknowledgement; the gap is recorded and surfaced on the Project Stakeholder Matrix as a defect. | `STK.SET_APPROVAL_AUTHORITY` | `STK.AUTHORITY.GAP_DETECTED` | 2 |
| FR-STK-035 | Support time-boxed delegation of approval authority to another assignment on the same project, with automatic expiry. | Delegate to + start + end → validate → store | End date mandatory, maximum 90 days. Delegation cannot exceed the delegator's own level. | `STK.SET_APPROVAL_AUTHORITY` | `STK.AUTHORITY.DELEGATED` | 3 |

### 3.7 Access Control and WBS Scope (SCR-STK-006)

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-036 | Set an access level (`FULL_ACCESS`, `LIMITED_ACCESS`, `READ_ONLY`) on an assignment. | Access level → internal/external check → store | `FULL_ACCESS` rejected for any external stakeholder type (BRL-STK-006). | `STK.SET_ACCESS_SCOPE` | `STK.ACCESS.CHANGED` | M |
| FR-STK-037 | For `LIMITED_ACCESS`, select the specific modules the assignment may enter. | Module code list → validate against module registry → store | At least one module required. Unknown module code rejected. | `STK.SET_ACCESS_SCOPE` | `STK.ACCESS.CHANGED` | M |
| FR-STK-038 | Grant WBS-node scope restrictions, where a grant covers the named node and all descendants but never ancestors or siblings. | WBS node ids → validate same project → store | Node must belong to the assignment's project. Redundant descendant grants are collapsed with a notice. | `STK.SET_WBS_SCOPE` | `STK.WBS_SCOPE.CHANGED` | M |
| FR-STK-039 | Evaluate access at request time as the intersection of RBAC role, project assignment, module scope, WBS scope, access level, and tenant. Deny by default. | User + project + node + module + action → policy evaluation → allow/deny + reason code | Any missing dimension results in deny. Denials are logged with the failing dimension. | System | `STK.ACCESS.DENIED` | M |
| FR-STK-040 | Apply a document confidentiality tier so that internal-commercial documents are never resolvable to external parties regardless of module scope. | Document tier + stakeholder internal flag → filter | External party querying an internal-tier record receives 404, never a redacted record. | System | `STK.ACCESS.DENIED` | M |
| FR-STK-041 | Provide a quarterly external access review report listing every external assignment with its effective access, for sign-off. | Tenant + period → aggregate → report | Unreviewed report older than 100 days raises a governance notification. | `STK.VIEW_LIST` | `STK.STAKEHOLDER.EXPORTED` | 2 |

### 3.8 Workflow Responsibility (SCR-STK-007)

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-042 | Toggle workflow responsibilities per assignment from the canonical set of eight codes. | Responsibility code + on/off → store → cache invalidation | At least one responsibility required to activate an assignment. | `STK.SET_WORKFLOW_RESPONSIBILITY` | `STK.RESPONSIBILITY.CHANGED` | M |
| FR-STK-043 | Restrict `PAYMENT_CERTIFICATION` and `INSPECTION_APPROVAL` toggles to assignments holding at least `APPROVE` authority. | Toggle request → authority check → allow/reject | Rejected with an explanation directing the user to set authority first. | `STK.SET_WORKFLOW_RESPONSIBILITY` | — | M |
| FR-STK-044 | Turning off a responsibility that has in-flight items requires reassignment of those items first. | Toggle off → open-item scan → block or proceed | Displays the open items blocking the change. | `STK.SET_WORKFLOW_RESPONSIBILITY` | `STK.RESPONSIBILITY.CHANGED` | M |

### 3.9 External User Provisioning (SCR-STK-012)

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-045 | Provision a platform login for a stakeholder contact, assigning the matching external RBAC role (Client, Consultant, Subcontractor, Supplier). | Contact id + role → identity service call → link record → invitation email | Contact must have a valid email. Role must be an external role. Assignment must be `ACTIVE`. | `STK.PROVISION_EXTERNAL_USER` | `STK.EXTERNAL_USER.PROVISIONED` | M |
| FR-STK-046 | Send a time-limited invitation; on acceptance the user sets credentials and is bound to the tenant, project, and scope of the assignment. | Invitation token → acceptance → user activation | Token expires in 7 days and is single-use. Expired token offers re-invitation. | `STK.PROVISION_EXTERNAL_USER` | `STK.EXTERNAL_USER.PROVISIONED` | M |
| FR-STK-047 | Revoke an external user's access manually or automatically on assignment termination, invalidating active sessions. | Link id → revoke → session invalidation | Revocation is immediate and irreversible; re-access requires new provisioning. | `STK.PROVISION_EXTERNAL_USER` | `STK.EXTERNAL_USER.REVOKED` | M |
| FR-STK-048 | Run a nightly reconciliation that detects any active external login without a corresponding active assignment and revokes it with an alert. | Scheduled job (tenant-scoped) → orphan detection → revoke + alert | Every orphan produces a `HIGH` severity audit entry. | System | `STK.EXTERNAL_USER.REVOKED` | M |

### 3.10 Status Lifecycle (SCR-STK-011)

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-049 | Suspend an `ACTIVE` stakeholder with a mandatory reason code and free-text reason, blocking new assignments and freezing existing ones. | Stakeholder id + reason → transition → escalate in-flight approvals | Reason mandatory. In-flight items escalate to fallback approvers within 60 seconds. | `STK.EDIT` | `STK.STAKEHOLDER.SUSPENDED` | M |
| FR-STK-050 | Reinstate a suspended stakeholder, restoring frozen assignments to their prior state. | Stakeholder id + reason → transition → unfreeze | Blocked while the suspension cause (e.g. expired mandatory document) persists. | `STK.EDIT` | `STK.STAKEHOLDER.REINSTATED` | M |
| FR-STK-051 | Blacklist a stakeholder tenant-wide with a mandatory reason category, evidence reference, and two-step confirmation. | Stakeholder id + reason + confirmation → transition → terminate all assignments | Restricted to Company Admin and Project Director. Second confirmation requires re-typing the organisation name. | `STK.BLACKLIST` | `STK.STAKEHOLDER.BLACKLISTED` | M |
| FR-STK-052 | Remove a blacklist with a mandatory justification and two-step confirmation, returning the stakeholder to `INACTIVE`, not directly to `ACTIVE`. | Stakeholder id + justification → transition | Never transitions directly to `ACTIVE`; re-verification is required. | `STK.UNBLACKLIST` | `STK.STAKEHOLDER.REINSTATED` | M |
| FR-STK-053 | Maintain an append-only status history recording every transition with actor, reason, timestamp, and prior status. | Transition event → history insert | History rows are never updated or deleted, in any environment. | System | — | M |
| FR-STK-054 | Flag a stakeholder as `PREFERRED` — a badge on top of `ACTIVE`, not a separate status. | Stakeholder id + flag → update | Cannot be set on non-`ACTIVE` records. | `STK.EDIT` | `STK.STAKEHOLDER.UPDATED` | 2 |

### 3.11 Performance Tracking (SCR-STK-010)

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-055 | Record performance events emitted by other modules: response completed, approval decided, task completed, document reviewed — each with the elapsed time against its SLA. | Event payload → validate → append to event ledger | Events for unknown assignments are dead-lettered with an alert, never silently dropped. | System | — | 2 |
| FR-STK-056 | Compute a nightly rolling reliability score per stakeholder per project and tenant-wide, using configurable weights (default 30/30/25/15). | Scheduled job → 12-month rolling window → weighted composite → score row | Fewer than 10 events in the window → score shown as "insufficient data", not zero. | System | — | 2 |
| FR-STK-057 | Display response time, approval delay, task completion rate, document turnaround, and the composite score with a progress bar and an amber warning below 80%. | Score record → panel render | Missing score renders the insufficient-data state, not an error. | `STK.VIEW_PERFORMANCE` | — | 2 |
| FR-STK-058 | Notify the Project Manager when a score crosses below 80%, and the Project Director when below 60% for two consecutive months. | Score computation → threshold check → notification | One notification per crossing, not per computation run. | System | `STK.PERFORMANCE.THRESHOLD_BREACHED` | 2 |
| FR-STK-059 | Allow Company Admin to configure scoring weights; scores themselves are never manually editable. | Weight set → validate sums to 100 → store → trigger recompute | Any manual score edit attempt is rejected at the API layer. | `STK.EDIT_PERFORMANCE_WEIGHTS` | `STK.CONFIG.CHANGED` | 2 |

### 3.12 Resolution Service

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-060 | Resolve the ordered list of eligible approvers for a project, WBS node, module, entity type, and workflow step. | Context → assignment + authority + responsibility + WBS scope intersection → ordered list | Zero results is an error condition, not an empty success (FR-STK-062). | System (service auth) | — | M |
| FR-STK-061 | Resolve notification recipients for an event code using recipient strategies: assigned user, created by, current approver, project role, discipline role, department, stakeholder type, WBS responsible, escalation chain. | Event + context → strategy evaluation → deduplicated recipient list | Recipients with terminated assignments are excluded and the exclusion is logged. | System | — | M |
| FR-STK-062 | Return an explicit zero-approver error, raise a `CRITICAL` notification to the Project Manager and Project Director, and halt the workflow step when no eligible approver exists. | Resolution attempt → empty result → error + notification | The step must halt. Auto-approval or skip is prohibited in all circumstances. | System | `STK.RESOLUTION.NO_APPROVER` | M |
| FR-STK-063 | Cache resolution results per project and invalidate on authority, access, WBS scope, responsibility, assignment, and status change events. | Resolution result → cache write with tag → event-driven invalidation | Stale cache after an invalidation event is a defect; TTL ceiling of 15 minutes as a safety net. | System | — | M |
| FR-STK-064 | Evaluate an access check for a user, project, WBS node, module, and action, returning allow or deny with a reason code. | Context → policy evaluation → decision | Deny by default on any evaluation error. Never fail open. | System | `STK.ACCESS.DENIED` on deny | M |
| FR-STK-065 | Record a snapshot of the acting party's stakeholder name, project role, and authority level on every workflow action, so historical audits reflect the state at the time of action. | Action event → snapshot fields → persisted on the consuming record | Snapshot is written synchronously with the action; a failure to snapshot fails the action. | System | — | M |

### 3.13 Bulk Import and Mobile

| ID | Requirement | Inputs → Processing → Outputs | Validation & Errors | Permission | Audit Event | Phase |
|---|---|---|---|---|---|---|
| FR-STK-066 | Import stakeholders and contacts from XLSX/CSV in dry-run mode, producing a validation and duplicate report before any commit. | File → parse → row validation → duplicate scan → report | Dry run never writes. Malformed rows are reported with row number and reason. | `STK.CREATE` | — | 2 |
| FR-STK-067 | Commit a validated import, creating records in `DRAFT` status only, with a reconciliation report of created, skipped, and failed rows. | Validated batch → transactional insert → report | Imported records never enter `ACTIVE` directly; verification is required. | `STK.CREATE` | `STK.STAKEHOLDER.CREATED` per row | 2 |
| FR-STK-068 | Provide a read-only mobile stakeholder directory for the user's assigned projects, cached for offline use with name, role, discipline, phone, and Telegram handle. | Project scope → directory payload → local cache | Directory is read-only offline. Approval resolution is never performed offline. | `STK.VIEW_LIST` | — | 2 |
| FR-STK-069 | Refresh the mobile directory on each sync and display the cache age on screen. | Sync event → delta fetch → cache update | Cache older than 7 days displays a staleness warning. | `STK.VIEW_LIST` | — | 2 |

---

## 4. Workflow Specifications

### 4.1 Create Stakeholder

```
START
→ User selects Add Stakeholder
→ Step 1: Select stakeholder type
→ Step 2: Organisation info (legal name, registration no., tax ID, country, currency)
   → duplicate check runs on blur of legal name
   → EXACT registration match  → HARD BLOCK, offer existing record
   → FUZZY name match ≥ 0.85   → SOFT BLOCK, require "use existing" or reason to proceed
   → BLACKLIST identity match  → HARD BLOCK, flag for Company Admin
→ Step 3: Add at least one contact person, designate primary
→ Step 4: Upload mandatory compliance documents for this type (may be deferred)
→ Save as DRAFT
→ Submit for verification → PENDING_APPROVAL
→ Verifier (not the creator) reviews
   → APPROVE → ACTIVE
   → REJECT (comment mandatory) → DRAFT, notify creator
END
```

**Exception — verifier unavailable:** the record remains `PENDING_APPROVAL`. After 3 working days a reminder is issued; after 5 days it escalates to Company Admin.

### 4.2 Assign to Project

```
START
→ Select ACTIVE stakeholder
→ Select project
   → stakeholder not ACTIVE      → BLOCK with specific status reason
   → stakeholder BLACKLISTED     → BLOCK with blacklist reason
   → duplicate active assignment → BLOCK, link to existing
→ Define project role and discipline
→ Define contractual representative (a contact of this stakeholder)
→ Define approval authority level  [mandatory]
   → optionally per module / entity type
   → optionally monetary threshold (Phase 2)
   → define fallback approver [mandatory for APPROVE and FINAL_APPROVE]
→ Define access level
   → external stakeholder → FULL_ACCESS not offered
   → LIMITED_ACCESS → select modules
→ Assign WBS scope (optional; mandatory for SUBCONTRACTOR type)
→ Toggle workflow responsibilities [at least one]
→ Activate
   → completeness gate fails → show missing-item checklist, remain DRAFT
   → passes → ACTIVE, cache invalidated, notification to stakeholder rep and PM
END
```

**Exception — mid-project authority change with items in flight:** the change is permitted with a mandatory reason. In-flight items already routed retain their original approver; newly created items use the new authority. Both states are visible on the item's audit timeline.

### 4.3 Suspend / Blacklist / Reinstate

```
SUSPEND
→ Actor selects Suspend, chooses reason code, enters reason text
→ Confirm
→ Status ACTIVE → SUSPENDED
→ All assignments freeze (workflow participation disabled, records retained)
→ In-flight approvals held by this party escalate to fallback approver within 60s
   → no fallback defined → CRITICAL notification to PM and Project Director,
     workflow step HALTS (never auto-approves)
→ External logins remain provisioned but access checks now deny
→ Notification to PM of every affected project

REINSTATE
→ Blocked while the suspension cause persists (e.g. document still expired)
→ Reason mandatory → SUSPENDED → ACTIVE → assignments unfreeze → cache invalidated

BLACKLIST
→ Restricted to Company Admin / Project Director
→ Reason category + free text + evidence reference mandatory
→ Two-step confirmation: re-type the organisation legal name
→ Status → BLACKLISTED
→ ALL assignments across ALL projects → TERMINATED
→ Open obligations surfaced to each project's PM for reassignment
→ All external logins revoked immediately
→ Normalised identity added to the blacklist index
→ CRITICAL audit entry; notification to Company Admin and all affected PMs
```

### 4.4 External User Provisioning

```
START
→ Assignment is ACTIVE
→ Select contact → select external role → Provision
→ Identity service creates user, bound to tenant + external role
→ Link record created (contact_id → user_id)
→ Invitation email sent, token valid 7 days, single use
→ User accepts → sets password → optional MFA → first login
→ Every request evaluated: RBAC role ∩ assignment ∩ module scope ∩ WBS scope
  ∩ access level ∩ tenant
→ Access outside scope → 404 (existence not leaked), logged as STK.ACCESS.DENIED
END

REVOCATION PATHS
→ Manual revoke by Company Admin              → immediate
→ Assignment TERMINATED                        → within 1 hour
→ Stakeholder SUSPENDED                        → access checks deny; link retained
→ Stakeholder BLACKLISTED                      → immediate revoke
→ Nightly orphan reconciliation                → revoke + HIGH severity alert
```

### 4.5 Assignment Termination and Handover

```
START
→ Actor requests termination, enters reason and effective date
→ System scans open obligations:
     open approvals awaiting this party
     open document reviews assigned
     open RFIs awaiting response
     open inspection sign-offs
     open tasks assigned to their users
→ Any open obligations → termination BLOCKED, open-item list displayed
→ Actor reassigns each item to another assignment holding sufficient authority
   → OR Project Manager explicitly marks items orphaned with a reason (audited)
→ All obligations handled → status TERMINATED
→ External logins revoked
→ Cache invalidated
→ Notification to the stakeholder's contractual representative and the PM
END
```

---

## 5. Validation Rules

| Field / Condition | Rule | Error Message |
|---|---|---|
| `legal_name` | Required, 2–200 chars, trimmed | "Organisation legal name is required." |
| `stakeholder_type` | Must be one of the 12 canonical codes | "Select a valid stakeholder type." |
| `registration_number` | Optional; unique per tenant when present | "This registration number is already registered to {org}." |
| Normalised identity | No exact match within tenant | "A stakeholder with this identity already exists." |
| Normalised identity | No match against blacklist index | "This organisation cannot be registered. Contact your Company Admin." |
| `contact.email` | RFC-5322 format; unique within stakeholder | "Enter a valid email address." |
| Primary contact | Exactly one per stakeholder | "Designate a primary contact before saving." |
| Activation | ≥ 1 active contact and all mandatory documents current | "Cannot activate: {missing items}." |
| `document.expiry_date` | Must be after `issue_date` | "Expiry date must be after the issue date." |
| Document file | ≤ 25 MB; PDF, JPG, PNG only; virus scan clean | "File exceeds 25 MB." / "File type not permitted." |
| Assignment | Stakeholder status must be `ACTIVE` | "Cannot assign a {status} stakeholder." |
| Assignment | No existing non-terminated assignment for this project | "This stakeholder is already assigned to this project." |
| Assignment activation | `approval_level` not null | "Set an approval authority level before activating." |
| Assignment activation | ≥ 1 workflow responsibility enabled | "Enable at least one workflow responsibility." |
| `access_level` | `FULL_ACCESS` prohibited for external types | "External stakeholders cannot be granted full access." |
| `LIMITED_ACCESS` | ≥ 1 module selected | "Select at least one module." |
| WBS scope node | Must belong to the assignment's project | "Selected WBS node does not belong to this project." |
| Fallback approver | Equal or higher authority, same project, not self | "Fallback approver must hold equal or higher authority." |
| Monetary threshold | Only on `APPROVE`; currency = project currency | "Thresholds apply only to Approve authority." |
| Delegation | End date required, ≤ 90 days, level ≤ delegator's | "Delegation cannot exceed 90 days." |
| Suspend / blacklist | Reason mandatory | "A reason is required." |
| Blacklist confirmation | Typed name must match legal name exactly | "Typed name does not match." |
| Registration approval | Approver ≠ creator | "You cannot approve a registration you created." |
| Archive | No `ACTIVE` assignments | "Terminate active assignments before archiving." |
| Termination | No unhandled open obligations | "{n} open items must be reassigned first." |
| Scoring weights | Must sum to 100 | "Weights must total 100%." |
| Any write | Version matches current | "This record was changed by {user}. Review the differences." |
| Any read/write | `tenant_id` matches JWT claim | 404 — existence is never disclosed |

---

## 6. Business Rule Enforcement Map

| Business Rule | Enforced By |
|---|---|
| BRL-STK-001 | FR-STK-023 |
| BRL-STK-002 | FR-STK-060, FR-STK-064 |
| BRL-STK-003 | FR-STK-060, FR-STK-062 |
| BRL-STK-004 | FR-STK-025, FR-STK-031 |
| BRL-STK-005 | FR-STK-024 |
| BRL-STK-006 | FR-STK-036 |
| BRL-STK-007 | FR-STK-038, FR-STK-039 |
| BRL-STK-008 | FR-STK-023 |
| BRL-STK-009 | FR-STK-051, FR-STK-052 |
| BRL-STK-010 | FR-STK-049 |
| BRL-STK-011 | FR-STK-028 |
| BRL-STK-012 | FR-STK-029, FR-STK-047, FR-STK-048 |
| BRL-STK-013 | FR-STK-020, FR-STK-021 |
| BRL-STK-014 | FR-STK-013 |
| BRL-STK-015 | FR-STK-011 |
| BRL-STK-016 | FR-STK-001, FR-STK-039, all data access |
| BRL-STK-017 | FR-STK-056, FR-STK-059 |
| BRL-STK-018 | FR-STK-008 |

---

## 7. State Machines

### 7.1 Stakeholder Status

```
                ┌──────────────────────────────┐
                ▼                              │
DRAFT ──submit──► PENDING_APPROVAL ──approve──► ACTIVE ──suspend──► SUSPENDED
  ▲                     │                        │  ▲                   │
  └──────reject─────────┘                        │  └──────reinstate────┘
                                                 │
                                    archive ─────┼─────► INACTIVE
                                                 │           ▲
                                  blacklist ─────┴───► BLACKLISTED
                                                             │
                                                unblacklist ─┘  (→ INACTIVE, never ACTIVE)

PREFERRED = boolean flag on ACTIVE, not a state.
```

### 7.2 Project Assignment Status

```
DRAFT ──complete config──► PENDING ──activate──► ACTIVE ──hold──► ON_HOLD
                                                   │   ▲              │
                                                   │   └───resume─────┘
                                                   │
                                    complete ──────┼──► COMPLETED
                                    terminate ─────┴──► TERMINATED
```
Terminal states: `COMPLETED`, `TERMINATED`. No transition out.

### 7.3 External User Link Status

```
INVITED ──accept──► ACTIVE ──revoke──► REVOKED
   │                   │
   └──expire(7d)──► EXPIRED ──re-invite──► INVITED
                       
ACTIVE ──stakeholder SUSPENDED──► ACTIVE but access denied at check time
ACTIVE ──assignment TERMINATED──► REVOKED (within 1 hour)
```

---

## 8. Notification Triggers

| Event Code | Recipients | Priority | Channels | Timing |
|---|---|---|---|---|
| `STK.STAKEHOLDER.CREATED` | Registration verifier | Normal | In-app | Immediate |
| `STK.STAKEHOLDER.APPROVED` | Creator, Document Controller | Normal | In-app | Immediate |
| `STK.STAKEHOLDER.SUSPENDED` | PMs of all affected projects, Document Controller | High | In-app, Email | Immediate |
| `STK.STAKEHOLDER.BLACKLISTED` | Company Admin, Project Director, all affected PMs, Procurement Manager | Critical | In-app, Email, Telegram | Immediate |
| `STK.STAKEHOLDER.REINSTATED` | Document Controller, affected PMs | Normal | In-app | Immediate |
| `STK.ASSIGNMENT.CREATED` | Project Manager | Normal | In-app | Immediate |
| `STK.ASSIGNMENT.ACTIVATED` | Contractual representative, Project Manager | Normal | In-app, Email | Immediate |
| `STK.ASSIGNMENT.ROLE_CHANGED` | Project Manager, Discipline Manager | Normal | In-app | Immediate |
| `STK.ASSIGNMENT.TERMINATED` | Contractual representative, PM, Document Controller | High | In-app, Email | Immediate |
| `STK.AUTHORITY.CHANGED` | Project Manager, Discipline Manager | High | In-app | Immediate |
| `STK.AUTHORITY.GAP_DETECTED` | Project Manager | High | In-app | Immediate |
| `STK.ACCESS.CHANGED` | Project Manager, Company Admin if external | High | In-app | Immediate |
| `STK.WBS_SCOPE.CHANGED` | Project Manager | Normal | In-app | Immediate |
| `STK.EXTERNAL_USER.PROVISIONED` | Invited contact, Company Admin | Normal | Email, In-app | Immediate |
| `STK.EXTERNAL_USER.REVOKED` | Company Admin, Project Manager | High | In-app, Email | Immediate |
| `STK.DOCUMENT.EXPIRING` | Document Controller, affected PMs | Normal → High at 7 days | In-app, Email | 60 / 30 / 7 days before |
| `STK.DOCUMENT.EXPIRED` | Document Controller, affected PMs, Procurement Officer | Critical | In-app, Email, Telegram | On expiry |
| `STK.PERFORMANCE.THRESHOLD_BREACHED` | PM (<80%), Project Director (<60% ×2 months) | High | In-app, Email | On crossing |
| `STK.RESOLUTION.NO_APPROVER` | Project Manager, Project Director | Critical | In-app, Email, Telegram | Immediate |
| `STK.ACCESS.DENIED` (external, repeated) | Company Admin | Critical after 5 in 10 min | In-app, Email | Threshold-based |

Anti-spam: expiry notifications are grouped into a daily digest per recipient. Critical events bypass digest.

---

## 9. Audit Requirements

| Action | Audit Event | Severity | Captured Fields |
|---|---|---|---|
| Create stakeholder | `STK.STAKEHOLDER.CREATED` | Medium | New values, actor, source channel |
| Duplicate blocked | `STK.STAKEHOLDER.DUPLICATE_BLOCKED` | Medium | Attempted identity, matched record id |
| Blacklist match blocked | `STK.STAKEHOLDER.BLACKLIST_MATCH_BLOCKED` | Critical | Attempted identity, matched blacklist record |
| Approve registration | `STK.STAKEHOLDER.APPROVED` | High | Decision, comment, prior status |
| Update profile | `STK.STAKEHOLDER.UPDATED` | Medium | Changed fields with before/after |
| Suspend | `STK.STAKEHOLDER.SUSPENDED` | High | Reason code, reason text, affected assignments |
| Blacklist | `STK.STAKEHOLDER.BLACKLISTED` | Critical | Reason, evidence ref, confirming actor, terminated assignments |
| Unblacklist | `STK.STAKEHOLDER.REINSTATED` | Critical | Justification, confirming actor |
| Create / activate / terminate assignment | `STK.ASSIGNMENT.*` | High | Project, role, discipline, dates, handover map |
| Change authority | `STK.AUTHORITY.CHANGED` | High | Before/after level, scope, fallback, reason |
| Change access or WBS scope | `STK.ACCESS.CHANGED` / `STK.WBS_SCOPE.CHANGED` | High | Before/after scope sets |
| Change responsibility | `STK.RESPONSIBILITY.CHANGED` | Medium | Before/after toggle set |
| Provision / revoke external user | `STK.EXTERNAL_USER.*` | Critical | Contact, role, user id, revocation trigger |
| Upload / download document | `STK.DOCUMENT.UPLOADED` / `DOWNLOADED` | Medium / High | Document type, ref, file hash |
| Export | `STK.STAKEHOLDER.EXPORTED` | High | Filter set, row count, format |
| Access denied | `STK.ACCESS.DENIED` | High (Critical if cross-tenant) | User, resource, failing dimension |
| Zero approver | `STK.RESOLUTION.NO_APPROVER` | Critical | Project, WBS node, module, step |

Every audit entry carries `user_name_snapshot`, `user_role_snapshot`, `department_snapshot`, `ip_address`, `source_channel`, and `correlation_id`, per R0 §24.4.5.

---

## 10. Non-Functional Requirements

| ID | Requirement | Target |
|---|---|---|
| NFR-STK-01 | Register list load, 5,000 records, first page | < 1.5 s p95 |
| NFR-STK-02 | Instant search response | < 300 ms p95 |
| NFR-STK-03 | Type-filter count refresh | < 5 s after a status change |
| NFR-STK-04 | Approver resolution (cached) | < 50 ms p95 |
| NFR-STK-05 | Approver resolution (cold) | < 200 ms p95 |
| NFR-STK-06 | Access check evaluation | < 30 ms p95 |
| NFR-STK-07 | Detail panel open | < 800 ms p95 |
| NFR-STK-08 | Concurrent users per tenant | 500 sustained |
| NFR-STK-09 | Stakeholders per tenant | 50,000 without degradation |
| NFR-STK-10 | Assignments per project | 500 |
| NFR-STK-11 | WBS scope grants per assignment | 200 |
| NFR-STK-12 | Tenant isolation | Enforced at the database row level; verified by automated CI tests each build |
| NFR-STK-13 | Availability | 99.5%, RTO 4 h, RPO 1 h |
| NFR-STK-14 | Resolution service degradation | Fails closed — halts workflow steps; never auto-approves |
| NFR-STK-15 | Audit completeness | 100% of state-changing actions produce an entry; a failed audit write fails the action |
| NFR-STK-16 | Mobile directory sync | < 10 s for 500 contacts |

---

## 11. MVP Scope Summary

| Phase | Functional Requirements |
|---|---|
| MVP (Phase 1) | FR-STK-001 to 008, 010 to 018, 020, 022 to 031, 033, 036 to 040, 042 to 049, 050 to 053, 060 to 065 |
| Phase 2 | FR-STK-009, 019, 021, 027, 032, 034, 041, 054 to 059, 066 to 069 |
| Phase 3 | FR-STK-035 |

---

## 12. Open Questions

| ID | Question | Blocking |
|---|---|---|
| Q-06 | Should the fuzzy duplicate threshold (0.85) be tenant-configurable? | Schema — needs a config field if yes |
| Q-07 | Does the resolution service need synchronous or event-sourced cache invalidation at 500-user scale? | Integration spec |
| Q-08 | Is a formal merge tool for duplicate stakeholders required in Phase 2, or is manual archive acceptable? | Phase 2 scope |
| Q-09 | Should `STK.ACCESS.DENIED` for internal users be `HIGH` or `MEDIUM` severity, given expected volume? | Audit tuning |

---

## 13. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1.0 | 2026-08-08 | Initial issue — 69 functional requirements | Senior System Architect |

---

**End of Document**
