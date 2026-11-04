# 05 — Integration Specification
## DCOS Stakeholder Management Module

| Field | Value |
|---|---|
| Document Code | DCOS-STK-INT-001 |
| Module | Stakeholder Management (Module 04 — Foundation) |
| Version | R1.0 |
| Status | Issued for Review |
| Author Role | Senior System Architect |
| Date | 2026-08-08 |
| Related Documents | DCOS-STK-FS-001, DCOS-STK-DB-001, DCOS-STK-API-001 |

---

## 1. Integration Philosophy

Stakeholder Management is a **provider module**. It holds little workflow of its own and exists largely to answer questions asked by other modules. Its integration surface is therefore more important than its user interface.

Three rules govern every integration in this document:

| # | Rule | Reason |
|---|---|---|
| 1 | **No module queries stakeholder tables directly.** All access is via the Resolution Service or a published view (`v_active_project_stakeholders`). | Direct queries embed authority logic in twenty places. When the rule changes, nineteen of them are missed. |
| 2 | **Resolution failure halts the workflow.** A zero-approver result is an error, never an empty success. | An auto-approved step with no approver is the single most damaging failure this platform could produce. |
| 3 | **The module fails closed.** If the service is unavailable, dependent workflows queue and inform the user. They do not proceed unrouted. | An unavailable authority service must never become an implicit grant of authority. |

---

## 2. Integration Map

```
                        ┌──────────────────────────────────────┐
   INBOUND              │   STAKEHOLDER MANAGEMENT MODULE      │      OUTBOUND
                        │                                      │
 Project Setup ────────►│  Assignment context                  │
 WBS Management ───────►│  Node validation / deletion guard     │◄──── WBS Management
 Admin Config ─────────►│  Types, roles, doc types, weights     │
 Auth & RBAC ──────────►│  Identity, JWT claims                 ├────► Auth & RBAC (provision)
 Module 17 (PQ) ───────►│  pq_status mirror                     │
 All modules ──────────►│  Performance events                   │
                        │                                      │
                        │  ┌────────────────────────────────┐  │
                        │  │  STAKEHOLDER RESOLUTION SVC    │  │
                        │  │  resolveApprovers()            │──┼───► Approval Workflow Engine
                        │  │  resolveNotificationRecipients()│──┼───► Notification Engine
                        │  │  checkAccess()                 │──┼───► Every module
                        │  └────────────────────────────────┘  │
                        │                                      │
                        │  Event bus (17 event codes) ─────────┼───► Audit Trail Engine
                        │                                      ├───► Notification Engine
                        │                                      ├───► Cache invalidation
                        └──────────────────────────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              ▼                            ▼                            ▼
    Document Control · RFI          Procurement · Subcontract      QA/QC · HSE
    Task Management                 Account / Finance              Mobile Field App
```

---

## 3. Inbound Integrations

### 3.1 Project Setup → Stakeholder Management

| | |
|---|---|
| **Direction** | Inbound, event-driven |
| **Trigger** | `PROJECT.CREATED`, `PROJECT.STATUS_CHANGED`, `PROJECT.ARCHIVED` |
| **Purpose** | Establish the project context for assignments; prompt mobilisation setup; freeze assignments on project closure |
| **Idempotency** | Keyed on `project_id` + event sequence |
| **Failure** | Retry with exponential backoff, 5 attempts, then dead-letter with an ops alert |

```json
{
  "event_code": "PROJECT.CREATED",
  "tenant_id": "b3f1...",
  "project_id": "9a2c...",
  "project_code": "P001",
  "project_name": "Tower A",
  "project_currency": "USD",
  "client_stakeholder_id": null,
  "occurred_at": "2026-08-08T02:14:00Z",
  "correlation_id": "corr-7f2e..."
}
```

**Behaviour.** On `PROJECT.CREATED`, the module creates a mobilisation checklist entry and notifies the Project Manager that no stakeholders are yet assigned. On `PROJECT.ARCHIVED`, all `ACTIVE` assignments transition to `COMPLETED` and all linked external logins are revoked.

### 3.2 WBS Management ↔ Stakeholder Management

| | |
|---|---|
| **Direction** | Bidirectional, synchronous |
| **Trigger** | WBS node create, move, or delete |
| **Purpose** | Validate scope grants; prevent deletion of nodes under active scope; re-materialise `wbs_path` after a move |
| **SLA** | 100 ms synchronous response |

**Deletion guard (synchronous, blocking):**

```json
// Request  POST /internal/stakeholder-resolution/wbs-scope-check
{ "tenant_id": "b3f1...", "wbs_node_id": "4d7a...", "include_descendants": true }

// Response
{
  "has_active_scopes": true,
  "scope_count": 3,
  "blocking_assignments": [
    { "assignment_id": "aa11...", "stakeholder_name": "Mekong Blockwork Co Ltd",
      "project_role_code": "SUBCONTRACTOR" }
  ]
}
```

WBS Management must block the deletion when `has_active_scopes` is true. **Path re-materialisation:** on `WBS.NODE_MOVED`, this module updates `stakeholder_wbs_scopes.wbs_path` for every affected grant within the same transaction boundary, then invalidates the resolution cache for the project. A move that cannot be re-materialised fails the move; a stale path would silently widen or narrow a subcontractor's access.

### 3.3 Admin Configuration → Stakeholder Management

| | |
|---|---|
| **Direction** | Inbound, synchronous read |
| **Trigger** | Config read at form render; `CONFIG.CHANGED` event on update |
| **Purpose** | Supply compliance document types, project role codes, performance weights, notification rule overrides |
| **Failure** | Cached last-known-good config; a config service outage does not block stakeholder operations |

### 3.4 Authentication & RBAC ↔ Stakeholder Management

| | |
|---|---|
| **Direction** | Bidirectional, synchronous |
| **Trigger** | External user provisioning, revocation, session validation |
| **Purpose** | Create and revoke external identities; supply the assignment scope that RBAC evaluates alongside the role |

```json
// Outbound: provision request
POST /internal/identity/external-users
{
  "tenant_id": "b3f1...",
  "email": "sok.dara@angkor-design.com",
  "display_name": "Sok Dara",
  "external_role_code": "CONSULTANT",
  "source_module": "STK",
  "source_ref": { "contact_id": "c1...", "assignment_id": "aa11..." },
  "invitation_ttl_hours": 168
}

// Response
{ "user_id": "u9f3...", "invitation_sent": true,
  "invitation_expires_at": "2026-08-15T02:14:00Z" }
```

**Revocation is idempotent.** Repeated revoke calls for an already-revoked link return success without side effects, so the nightly reconciliation job (FR-STK-048) can run safely against an unknown state.

### 3.5 Supplier Prequalification (Module 17) → Stakeholder Management

| | |
|---|---|
| **Direction** | Inbound, event-driven |
| **Trigger** | `PQ.APPROVED`, `PQ.EXPIRED`, `PQ.REVOKED` |
| **Purpose** | Mirror `pq_status` and `pq_expiry_date` onto the stakeholder record for filtering and eligibility display |
| **Source of truth** | Module 17. This module never writes these fields from its own UI. |
| **Phase** | 3 |

### 3.6 All Modules → Performance Event Ingestion

| | |
|---|---|
| **Direction** | Inbound, event-driven, asynchronous |
| **Trigger** | Any SLA-bearing item completes or is decided |
| **Idempotency** | `uq_perf_event_source` on `(source_module, source_entity_type, source_entity_id, event_type)` |
| **Failure** | Events for unknown assignments are dead-lettered with an alert, never silently dropped (FR-STK-055) |

```json
{
  "event_type": "RESPONSE_COMPLETED",
  "tenant_id": "b3f1...",
  "project_id": "9a2c...",
  "assignment_id": "aa11...",
  "source_module": "RFI",
  "source_entity_type": "rfi",
  "source_entity_id": "r442...",
  "assigned_at": "2026-06-02T03:10:00Z",
  "completed_at": "2026-06-19T08:44:00Z",
  "sla_days": 14,
  "elapsed_days": 17.23,
  "is_within_sla": false
}
```

---

## 4. Outbound Integrations

### 4.1 Approval Workflow Engine

| | |
|---|---|
| **Direction** | Outbound (called by the engine), synchronous |
| **Trigger** | Any workflow step requiring an approver |
| **Contract** | `resolveApprovers()` — see §5.1 |
| **SLA** | < 50 ms cached, < 200 ms cold, p95 |
| **Idempotency** | Read-only; naturally idempotent |
| **Failure** | Fail closed — the engine halts the step and surfaces "routing unavailable" to the user |
| **Zero result** | Explicit error `NO_ELIGIBLE_APPROVER`; engine must halt, never auto-approve or skip |

The engine stores the returned party's `authority_snapshot` on its own step record (FR-STK-065). This is what makes the eighteen-month-later audit answerable.

### 4.2 Notification Engine

| | |
|---|---|
| **Direction** | Outbound (called by the engine), synchronous |
| **Trigger** | Any event needing recipient resolution |
| **Contract** | `resolveNotificationRecipients()` — see §5.2 |
| **SLA** | < 100 ms p95 |
| **Failure** | Degraded mode falls back to project-role recipients only (PM and Discipline Manager) and flags the notification as `PARTIAL_RESOLUTION` |
| **Exclusions** | Recipients on terminated or on-hold assignments are excluded, and each exclusion is logged |

### 4.3 Document Control

| Aspect | Detail |
|---|---|
| Reviewer / approver resolution | `resolveApprovers(module='DOC', entity_type='DRAWING'|'SUBMITTAL'|'SPEC', step)` |
| Transmittal recipient list | `resolveNotificationRecipients('DOC.ISSUED_FOR_CONSTRUCTION', context)` filtered to external parties with the document's discipline in scope |
| Confidentiality gate | Document Control passes `confidentiality_tier`; access check rejects any party whose `max_confidentiality_tier` is lower |
| Distribution matrix | Document Control renders the matrix from `v_active_project_stakeholders` joined to responsibility toggles |
| Issue-for-construction gate | Document Control calls `getProjectMatrixCompleteness(project_id)`; a project with unresolved authority gaps cannot issue for construction (SOP-STK-04) |
| Failure | Fail closed. An unroutable document stays in `Submitted`. |

### 4.4 RFI Module

| Aspect | Detail |
|---|---|
| Responder resolution | `resolveNotificationRecipients('RFI.CREATED', {discipline, wbs_node})` |
| Escalation chain | Returned as an ordered array: responder → Discipline Manager → PM → Project Director |
| Overdue escalation | RFI module owns the timers; this module supplies the chain membership |
| Delegation | An active delegation substitutes the delegate for the delegator transparently |
| Failure | Zero responder halts RFI issue and raises `STK.RESOLUTION.NO_APPROVER` at `CRITICAL` |

### 4.5 Task Management

| Aspect | Detail |
|---|---|
| Assignee eligibility | `checkAccess(user, project, wbs_node, 'TASK', 'EXECUTE')` before an assignment is offered |
| External assignee restriction | External users may only be assigned tasks within their WBS scope; the assignee picker is filtered server-side, not client-side |
| Responsibility filter | Only assignments with `TASK_EXECUTION` enabled appear as candidates |
| Reassignment on termination | Task module accepts a bulk reassignment payload from the termination handover (FR-STK-028) |

### 4.6 Procurement

| Aspect | Detail |
|---|---|
| Supplier eligibility | `checkSupplierEligibility(stakeholder_id, project_id)` before RFQ or PO |
| Eligibility criteria | `status = ACTIVE`, not blacklisted, no expired mandatory compliance document, PQ current where Module 17 is live |
| PO recipient | Supplier's contractual representative from the assignment |
| Approval thresholds | `resolveApprovers(module='PROC', entity_type='PURCHASE_ORDER', amount)` honours `threshold_amount` |
| Failure | An ineligible supplier is blocked with a specific reason; procurement never proceeds on an unresolved eligibility check |

```json
// Request
{ "stakeholder_id": "s77...", "project_id": "9a2c...", "amount": 48200, "currency": "USD" }

// Response — blocked
{
  "eligible": false,
  "reasons": [
    { "code": "COMPLIANCE_EXPIRED", "detail": "Public Liability Insurance expired 2026-07-30" }
  ],
  "assignment_id": "aa42...",
  "checked_at": "2026-08-08T02:14:00Z"
}
```

### 4.7 Subcontractor Management (Module 19)

| Aspect | Detail |
|---|---|
| Counterparty reference | Every subcontract references `stakeholder_id`; the subcontract cannot be created without an `ACTIVE` assignment on the project |
| Scope alignment | Subcontract scope should align to the assignment's WBS grants; a mismatch raises a warning, not a block |
| Performance notices | Module 19 emits performance events consumed by §3.6 |
| Termination coupling | A subcontract termination in Module 19 triggers an assignment termination prompt here; the two are not auto-coupled because commercial termination and system access removal have different timing |

### 4.8 QA/QC

| Aspect | Detail |
|---|---|
| Inspection approver | `resolveApprovers(module='QAQC', entity_type='INSPECTION_REQUEST', step)` — requires `INSPECTION_APPROVAL` responsibility and at least `APPROVE` |
| Witness party | Testing agencies resolved by stakeholder type and WBS scope |
| NCR responsible party | Resolved from the assignment holding the relevant scope |
| Snapshot | Authority snapshot stored on the inspection record — the evidence base for UC-STK-020 |

### 4.9 HSE

| Aspect | Detail |
|---|---|
| Safety oversight | Assignments with `SAFETY_OVERSIGHT` resolve as permit approvers and incident recipients |
| Incident notification | `resolveNotificationRecipients('HSE.INCIDENT_REPORTED')` returns HSE Officer, HSE Manager, PM, Project Director, and the subcontractor's contractual representative where the incident involves their scope |
| Priority | `CRITICAL`; bypasses digest and quiet hours |

### 4.10 Account / Finance

| Aspect | Detail |
|---|---|
| Payee master | Supplier and subcontractor stakeholders are the payee reference; Account never creates its own payee records |
| Payment certification authority | `resolveApprovers(module='ACC', entity_type='IPC'|'PAYMENT_REQUEST')` requires `PAYMENT_CERTIFICATION` responsibility |
| Blacklist coupling | Blacklisting does **not** cancel outstanding payment obligations; Account is notified but retains ownership of the commercial position (UC-STK-008 E3) |
| Currency | Assignment inherits project currency; supplier's `default_currency` informs FX handling in Module 43 |

### 4.11 Audit Trail Engine

| | |
|---|---|
| **Direction** | Outbound, synchronous within the transaction |
| **Trigger** | Every state-changing action |
| **Contract** | Standard R0 §24.4.5 audit envelope |
| **Failure** | A failed audit write **fails the action**. There is no fire-and-forget path (NFR-STK-15). |

```json
{
  "tenant_id": "b3f1...",
  "project_id": "9a2c...",
  "wbs_node_id": null,
  "module_code": "STK",
  "entity_type": "project_stakeholder",
  "entity_id": "aa11...",
  "action_type": "APPROVE",
  "action_label": "Approval authority changed",
  "user_id": "u33...",
  "user_name_snapshot": "Chan Sopheak",
  "user_role_snapshot": "Project Manager",
  "department_snapshot": "Operations",
  "old_values": { "approval_level": "APPROVE" },
  "new_values": { "approval_level": "FINAL_APPROVE" },
  "changed_fields": ["approval_level"],
  "status_from": null,
  "status_to": null,
  "comment": "Client instruction dated 2026-08-05",
  "severity": "HIGH",
  "source_channel": "WEB",
  "correlation_id": "corr-7f2e...",
  "created_at": "2026-08-08T02:14:00Z"
}
```

### 4.12 Mobile Field Application

| Aspect | Detail |
|---|---|
| Cached directory | Read-only stakeholder directory for assigned projects: name, role, discipline, phone, Telegram |
| Sync | Delta fetch on each sync; cache age displayed on screen; staleness warning after 7 days |
| **Offline rule** | Approval resolution and access checks are **never** performed offline. Cached scope may be stale; an authority decision made against stale scope is unrecoverable. |
| Offline capture | Field data captured offline is queued and resolved server-side on sync |
| Conflict rule | Server timestamp wins for approvals; device timestamp wins for field observations |

---

## 5. Stakeholder Resolution Service

The published contract. Version `v1`. Service-to-service authentication only; not exposed to the public API surface.

### 5.1 `resolveApprovers`

```
POST /api/v1/stakeholder-resolution/approvers
```

```json
// Request
{
  "tenant_id": "b3f1...",
  "project_id": "9a2c...",
  "wbs_node_id": "4d7a...",
  "discipline_code": "STR",
  "module_code": "DOC",
  "entity_type": "STR_SHOP_DRAWING",
  "workflow_step_code": "EXTERNAL_REVIEW",
  "amount": null,
  "currency": null,
  "include_fallbacks": true
}
```

```json
// Response 200 — resolved
{
  "resolved": true,
  "approvers": [
    {
      "sequence": 1,
      "assignment_id": "aa11...",
      "stakeholder_id": "s44...",
      "stakeholder_name": "Angkor Structural Consultants Ltd",
      "project_role_code": "STR_CONSULTANT",
      "contact_id": "c88...",
      "contact_name": "Sok Dara",
      "user_id": "u9f3...",
      "approval_level": "APPROVE",
      "matched_scope": { "module_code": "DOC", "entity_type": "STR_SHOP_DRAWING" },
      "via_fallback": false,
      "via_delegation": false,
      "authority_snapshot": {
        "approval_level": "APPROVE",
        "project_role_code": "STR_CONSULTANT",
        "resolved_at": "2026-08-08T02:14:00Z"
      }
    },
    {
      "sequence": 2,
      "assignment_id": "aa02...",
      "stakeholder_name": "Mekong Development Co Ltd",
      "project_role_code": "EMPLOYER",
      "approval_level": "FINAL_APPROVE",
      "via_fallback": false,
      "via_delegation": false,
      "authority_snapshot": { "approval_level": "FINAL_APPROVE",
                              "project_role_code": "EMPLOYER",
                              "resolved_at": "2026-08-08T02:14:00Z" }
    }
  ],
  "cache_hit": true,
  "resolved_at": "2026-08-08T02:14:00Z"
}
```

```json
// Response 422 — zero approver. This is an ERROR, not an empty list.
{
  "resolved": false,
  "error_code": "NO_ELIGIBLE_APPROVER",
  "message": "No assignment holds APPROVE or FINAL_APPROVE for DOC/STR_SHOP_DRAWING on this WBS branch.",
  "diagnostics": {
    "assignments_on_project": 47,
    "with_document_review_responsibility": 12,
    "matching_discipline": 3,
    "covering_wbs_node": 0,
    "with_sufficient_authority": 0,
    "failing_dimension": "wbs_scope"
  },
  "notification_raised": true,
  "notified_roles": ["PROJECT_MANAGER", "PROJECT_DIRECTOR"]
}
```

The `diagnostics` block is deliberate. When a workflow halts, the Project Manager needs to know *which filter emptied the list* — otherwise the halt is a mystery and the fix is guesswork.

**Ordering rules.** `REVIEW_ONLY` and `APPROVE` before `FINAL_APPROVE`. Within a level, most-specific scope first (`entity_type` match beats `module_code` match beats `ALL`). Fallbacks appear only when the primary is unavailable and are marked `via_fallback: true`.

### 5.2 `resolveNotificationRecipients`

```
POST /api/v1/stakeholder-resolution/notification-recipients
```

```json
// Request
{
  "tenant_id": "b3f1...",
  "project_id": "9a2c...",
  "event_code": "RFI.CREATED",
  "context": {
    "wbs_node_id": "4d7a...",
    "discipline_code": "MEP",
    "entity_type": "rfi",
    "entity_id": "r442...",
    "created_by_user_id": "u12...",
    "current_approver_assignment_id": null
  },
  "include_escalation_chain": true
}
```

```json
// Response 200
{
  "recipients": [
    { "user_id": "u55...", "assignment_id": "aa33...",
      "stakeholder_name": "Delta MEP Consultants",
      "contact_name": "Chea Ratana", "role": "MEP_CONSULTANT",
      "strategy": "DISCIPLINE_ROLE", "notification_role": "PRIMARY",
      "preferred_channel": "EMAIL", "preferred_language": "en" },
    { "user_id": "u21...", "role": "PROJECT_MANAGER",
      "strategy": "PROJECT_ROLE", "notification_role": "INFORMED",
      "preferred_channel": "IN_APP", "preferred_language": "km" }
  ],
  "escalation_chain": [
    { "level": 1, "after_hours": 24,  "user_id": "u55...", "role": "MEP_CONSULTANT" },
    { "level": 2, "after_hours": 48,  "user_id": "u60...", "role": "DISCIPLINE_MANAGER" },
    { "level": 3, "after_hours": 72,  "user_id": "u21...", "role": "PROJECT_MANAGER" },
    { "level": 4, "after_hours": 120, "user_id": "u07...", "role": "PROJECT_DIRECTOR" }
  ],
  "excluded": [
    { "assignment_id": "aa19...", "reason": "ASSIGNMENT_TERMINATED",
      "would_have_matched": "DISCIPLINE_ROLE" }
  ],
  "partial_resolution": false
}
```

**Supported recipient strategies:** `ASSIGNED_USER`, `CREATED_BY`, `CURRENT_APPROVER`, `PROJECT_ROLE`, `DISCIPLINE_ROLE`, `DEPARTMENT`, `STAKEHOLDER_TYPE`, `WBS_RESPONSIBLE`, `CUSTOM_USER`, `ESCALATION_CHAIN`.

### 5.3 `checkAccess`

```
POST /api/v1/stakeholder-resolution/access-check
```

```json
// Request
{
  "tenant_id": "b3f1...",
  "user_id": "u9f3...",
  "project_id": "9a2c...",
  "wbs_node_id": "4d7a...",
  "module_code": "ACC",
  "action": "VIEW",
  "confidentiality_tier": 4
}
```

```json
// Response 200 — denied
{
  "allowed": false,
  "reason_code": "MODULE_NOT_IN_SCOPE",
  "failing_dimension": "module_scope",
  "evaluated": {
    "tenant": "pass",
    "rbac_role": "pass",
    "project_assignment": "pass",
    "module_scope": "fail",
    "wbs_scope": "not_evaluated",
    "access_level": "not_evaluated",
    "confidentiality_tier": "not_evaluated"
  },
  "http_hint": 404
}
```

`http_hint: 404` is instructive: the calling module returns 404 rather than 403 so that the existence of the resource is not confirmed to an unauthorised party. Evaluation short-circuits at the first failing dimension, and the dimension is logged.

### 5.4 Supporting Endpoints

| Endpoint | Purpose | SLA |
|---|---|---|
| `POST /stakeholder-resolution/supplier-eligibility` | Procurement eligibility gate | < 100 ms |
| `POST /stakeholder-resolution/wbs-scope-check` | WBS deletion guard | < 100 ms |
| `GET /stakeholder-resolution/project-matrix-completeness/{project_id}` | Issue-for-construction gate | < 500 ms |
| `POST /stakeholder-resolution/bulk-access-check` | Filter a list of records for an external user in one call | < 300 ms for 500 items |

### 5.5 Caching

| Aspect | Rule |
|---|---|
| Key | `resolve:{tenant}:{project}:{module}:{entity_type}:{step}:{wbs_path_prefix}` |
| Tags | `project:{id}`, `assignment:{id}`, `stakeholder:{id}` |
| TTL ceiling | 15 minutes — a safety net, not the primary mechanism |
| Primary invalidation | Event-driven, on the eight events listed in §6.2 |
| Negative caching | Zero-approver results are **never** cached. A halted workflow must recover the instant the gap is fixed. |
| Cache miss cost | Full resolution query, < 200 ms p95 |
| Invalidation failure | Ops alert plus a `HIGH` severity audit entry; TTL bounds exposure to 15 minutes |

---

## 6. Event Bus Contract

### 6.1 Envelope

```json
{
  "event_id": "evt-01J...",
  "event_code": "STK.AUTHORITY.CHANGED",
  "event_version": 1,
  "tenant_id": "b3f1...",
  "project_id": "9a2c...",
  "occurred_at": "2026-08-08T02:14:00Z",
  "actor": { "user_id": "u33...", "name_snapshot": "Chan Sopheak",
             "role_snapshot": "Project Manager" },
  "correlation_id": "corr-7f2e...",
  "payload": { }
}
```

### 6.2 Event Catalogue

| Event Code | Payload Keys | Consumers | Invalidates Cache |
|---|---|---|---|
| `STK.STAKEHOLDER.CREATED` | `stakeholder_id`, `type`, `legal_name`, `status` | Audit, Notification | No |
| `STK.STAKEHOLDER.APPROVED` | `stakeholder_id`, `approved_by`, `comment` | Audit, Notification | No |
| `STK.STAKEHOLDER.SUSPENDED` | `stakeholder_id`, `reason_code`, `reason_text`, `affected_assignment_ids[]` | Audit, Notification, Procurement, Approval Engine | **Yes** |
| `STK.STAKEHOLDER.BLACKLISTED` | `stakeholder_id`, `reason_category`, `evidence_reference`, `terminated_assignment_ids[]` | Audit, Notification, Procurement, Account, Identity | **Yes** |
| `STK.STAKEHOLDER.REINSTATED` | `stakeholder_id`, `from_status`, `justification` | Audit, Notification | **Yes** |
| `STK.ASSIGNMENT.CREATED` | `assignment_id`, `stakeholder_id`, `project_id`, `role`, `discipline` | Audit | No |
| `STK.ASSIGNMENT.ACTIVATED` | `assignment_id`, `authority_summary`, `access_summary`, `responsibilities[]` | Audit, Notification, Task, Document Control | **Yes** |
| `STK.ASSIGNMENT.ROLE_CHANGED` | `assignment_id`, `old_role`, `new_role`, `reason` | Audit, Notification | **Yes** |
| `STK.ASSIGNMENT.TERMINATED` | `assignment_id`, `reason`, `handover_map[]`, `orphaned_items[]` | Audit, Notification, Identity, Task, Document Control, RFI | **Yes** |
| `STK.AUTHORITY.CHANGED` | `assignment_id`, `scope`, `old_level`, `new_level`, `fallback_assignment_id`, `reason` | Audit, Approval Engine | **Yes** |
| `STK.ACCESS.CHANGED` | `assignment_id`, `old_access`, `new_access`, `modules[]` | Audit, all modules | **Yes** |
| `STK.WBS_SCOPE.CHANGED` | `assignment_id`, `added_nodes[]`, `removed_nodes[]` | Audit, Task, Document Control | **Yes** |
| `STK.EXTERNAL_USER.PROVISIONED` | `link_id`, `contact_id`, `user_id`, `external_role_code` | Audit, Identity, Notification | No |
| `STK.EXTERNAL_USER.REVOKED` | `link_id`, `user_id`, `revocation_trigger`, `reason` | Audit, Identity, Notification | **Yes** |
| `STK.PERFORMANCE.THRESHOLD_BREACHED` | `stakeholder_id`, `project_id`, `score`, `threshold`, `consecutive_months` | Audit, Notification | No |
| `STK.DOCUMENT.EXPIRING` | `stakeholder_id`, `document_type_code`, `expiry_date`, `days_remaining` | Notification | No |
| `STK.DOCUMENT.EXPIRED` | `stakeholder_id`, `document_type_code`, `is_mandatory`, `auto_suspended` | Notification, Procurement | **Yes** if suspended |

### 6.3 Delivery Guarantees

| Property | Rule |
|---|---|
| Ordering | Per `correlation_id`, in order. Across correlations, no ordering guarantee. |
| Delivery | At-least-once. All consumers must be idempotent on `event_id`. |
| Retry | Exponential backoff: 1s, 5s, 30s, 2m, 10m. Five attempts, then dead-letter. |
| Dead letter | Ops alert plus a `HIGH` severity audit entry naming the consumer and event. |
| Signature | HMAC-SHA256 over the raw body using a per-consumer secret, in `X-DCOS-Signature`. |
| Replay window | 90 days from the event store, for consumer recovery. |

---

## 7. Failure and Degradation Behaviour

| Failure | Behaviour | Rationale |
|---|---|---|
| Resolution service unavailable | Dependent workflows **queue and inform**. No approval, issue, or certification proceeds. | An unavailable authority service must never become an implicit grant of authority |
| Zero approver returned | Workflow step halts. `CRITICAL` notification with diagnostics. Never cached. | The most damaging silent failure mode; must be loud |
| Cache invalidation fails | 15-minute TTL bounds exposure; ops alert plus `HIGH` audit entry | Bounded staleness beats unbounded |
| Stakeholder suspended mid-workflow | In-flight items escalate to fallback within 60s; no fallback → halt plus `CRITICAL` | Silent stall is worse than a loud halt |
| Assignment terminated with open items | Termination blocked until handover completes | BRL-STK-011 |
| Identity service unavailable during provisioning | Provisioning fails cleanly; no orphaned link row is created | A half-created link is an access-control hole |
| Audit write fails | The originating action fails and rolls back | NFR-STK-15 — an unaudited change is worse than a failed change |
| Performance event for unknown assignment | Dead-letter with alert | Silent drops corrupt the score without anyone knowing |
| WBS node moved, path re-materialisation fails | The move fails | A stale path silently widens or narrows access |
| Notification engine unavailable | Events queue; critical events retry aggressively; the originating action still completes | Notification is a side effect; the business action is not blocked by it |
| Storage unavailable during document upload | Upload fails cleanly; no partial metadata row | Metadata without a file is a false compliance record |

---

## 8. External System Integrations

| System | Purpose | Direction | Failure Handling |
|---|---|---|---|
| SMTP / transactional email | External user invitations, formal notifications | Outbound | Retry 3×; failure logged to notification delivery log and surfaced to Company Admin |
| Telegram Bot API | Operational alerts to site and external parties | Outbound | Retry 3×; falls back to email; delivery failure audited per R0 §24.5.15 |
| Virus scanning service | Compliance document upload scanning | Outbound, synchronous | Scan unavailable → upload rejected, not accepted unscanned |
| Object storage (Supabase / S3) | Compliance document files | Outbound | Signed URLs, 15-minute expiry, CDN delivery, never direct bucket paths |
| ERP supplier master (future) | Bidirectional supplier sync | Both | Phase 5. This module remains the source of truth for eligibility and status; ERP owns financial master data |

---

## 9. Data Consistency Rules

| Field | Source of Truth | Mirrored In | Refresh |
|---|---|---|---|
| Stakeholder identity, status | This module | Consuming module snapshots | Event-driven |
| Approval authority | This module | Approval Engine step records (as snapshot) | At routing time, immutable thereafter |
| Access scope | This module | Nothing — always resolved live | N/A |
| `pq_status`, `pq_expiry_date` | Module 17 | This module (read-only mirror) | Event-driven |
| Contact email, phone | This module | Notification Engine per-send lookup | Live |
| External user identity | Module 02 | `stakeholder_user_links.user_id` | Event-driven |
| Reliability score | This module (computed) | `stakeholders.reliability_score` denormalised | Nightly |
| Project currency | Project Setup | Assignment threshold currency | On assignment create |
| WBS path | WBS Management | `stakeholder_wbs_scopes.wbs_path` | Synchronous on node move |

**Snapshot immutability.** Once an authority snapshot is written to a consuming record, it is never refreshed. That is the entire point: it records what was true then, not what is true now.

---

## 10. Integration Test Points

| ID | Test Point | Expected |
|---|---|---|
| ITP-01 | Resolve approvers for a fully configured project | Ordered list with correct authority levels and snapshots |
| ITP-02 | Resolve with no eligible approver | 422 `NO_ELIGIBLE_APPROVER`, `CRITICAL` notification, diagnostics show the failing dimension |
| ITP-03 | Resolve after an authority change | Cache invalidated; new result within one request |
| ITP-04 | Access check for an out-of-scope WBS node | Denied, `http_hint` 404, failing dimension `wbs_scope` |
| ITP-05 | Access check for internal-tier document by an external user | Denied at `confidentiality_tier` |
| ITP-06 | Suspend a stakeholder with in-flight approvals | Items escalate to fallback within 60s |
| ITP-07 | Suspend with no fallback configured | Workflow halts; `CRITICAL` raised; nothing auto-approves |
| ITP-08 | Terminate an assignment with open items | Blocked until handover completes |
| ITP-09 | Terminate an assignment with external logins | Revoked within 1 hour; nightly job catches any miss |
| ITP-10 | Blacklist propagation | All assignments terminated across all projects; all logins revoked; identity indexed |
| ITP-11 | Procurement eligibility with an expired mandatory document | Blocked with `COMPLIANCE_EXPIRED` |
| ITP-12 | WBS node deletion under an active scope grant | Blocked with the blocking assignment listed |
| ITP-13 | WBS node move | Paths re-materialised; scope unchanged in effect; cache invalidated |
| ITP-14 | Duplicate performance event for the same source entity | Second event rejected by unique constraint; no double counting |
| ITP-15 | Audit write failure | Originating action rolls back |
| ITP-16 | Resolution service outage | Dependent workflow queues; user informed; nothing approved |
| ITP-17 | Cross-tenant resolution request | Zero rows via RLS; 404; `CRITICAL` audit entry |
| ITP-18 | Event replay of the same `event_id` | Consumer idempotent; no duplicate side effects |

---

## 11. Open Questions

| ID | Question | Impact |
|---|---|---|
| Q-17 | Should cache invalidation be synchronous within the mutating transaction, or event-driven with the TTL as backstop? Synchronous is safer but couples the write path to the cache's availability. | Latency vs staleness trade-off (Q-07 from FS) |
| Q-18 | Should subcontract termination in Module 19 auto-terminate the assignment, or continue to prompt? | Commercial and access timing differ |
| Q-19 | Is a 15-minute TTL ceiling acceptable for authority changes, or should approval-bearing changes force synchronous invalidation? | Security posture |
| Q-20 | Should `bulk-access-check` be capped below 500 items to protect p95 latency under load? | API contract |

---

## 12. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1.0 | 2026-08-08 | Initial issue — 15 module integrations, resolution service contract, 17 event schemas | Senior System Architect |

---

**End of Document**
