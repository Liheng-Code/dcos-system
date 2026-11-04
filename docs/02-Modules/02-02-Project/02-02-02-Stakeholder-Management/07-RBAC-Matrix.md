# 07 — RBAC Matrix
## DCOS Stakeholder Management Module

| Field | Value |
|---|---|
| Document Code | DCOS-STK-RBAC-001 |
| Module | Stakeholder Management (Module 04 — Foundation) |
| Version | R1.0 |
| Status | Issued for Review |
| Author Role | Senior System Architect / Security Engineer |
| Date | 2026-08-08 |
| Related Documents | DCOS-STK-FS-001, DCOS-STK-DB-001, DCOS-STK-API-001, DCOS-STK-TEST-001 |

---

## 1. Access Control Model

Permission in DCOS is not a single check. It is the intersection of six independent dimensions, evaluated in order, failing closed at the first miss:

```
Effective permission =
      Tenant match                (JWT claim only — never request body)
  ∩   RBAC role permission        (does this role hold the permission code?)
  ∩   Project assignment          (is this user attached to this project?)
  ∩   Discipline scope            (does their discipline cover this record?)
  ∩   WBS scope                   (does a grant cover this node or an ancestor?)
  ∩   Access level                (FULL / LIMITED+modules / READ_ONLY)
  ∩   Confidentiality tier        (is the record's tier within their ceiling?)
```

Two properties matter more than the matrix itself:

- **Deny by default.** A dimension that cannot be evaluated returns deny, not allow. `current_setting('app.tenant_id', true)` returns NULL when unset, and NULL never equals a uuid — so a missing session context fails closed at the database layer, not just in application code.
- **Existence is not disclosed.** A denial caused by tenant mismatch or out-of-scope resource returns **404**, never 403. A 403 confirms the record exists, which is itself a leak in a multi-tenant system where competitors may share a deployment.

403 is reserved for the case where the resource is legitimately in scope but the action is not permitted — for example, a Consultant with `REVIEW_ONLY` attempting to approve.

---

## 2. Role Catalogue

| # | Role Code | Role | Responsibility in This Module |
|---|---|---|---|
| 1 | `SUPER_ADMIN` | Super Admin | Platform operator. Cross-tenant access only via audited impersonation. |
| 2 | `COMPANY_ADMIN` | Company Admin | Owns the tenant register. Approves registrations, blacklists, provisions external access, configures scoring weights. |
| 3 | `PROJECT_DIRECTOR` | Project Director | Portfolio assurance. Reviews performance, approves blacklists, receives escalations. |
| 4 | `PROJECT_MANAGER` | Project Manager | Assigns parties, sets authority and access, terminates assignments — on assigned projects only. |
| 5 | `DISCIPLINE_MANAGER` | Discipline Manager | Configures responsibility and reviewer scope within their discipline. |
| 6 | `ENGINEER` | Engineer | Reads the register to know who to contact and who approves. |
| 7 | `BIM_COORDINATOR` | BIM Coordinator | Reads design-discipline stakeholders for coordination routing. |
| 8 | `QAQC_INSPECTOR` | QA/QC Inspector | Reads inspection-approving parties and testing agencies. |
| 9 | `HSE_OFFICER` | HSE Officer | Reads safety-oversight parties; maintains subcontractor safety compliance documents. |
| 10 | `PROCUREMENT_OFFICER` | Procurement Officer | Checks supplier eligibility, maintains supplier records and compliance documents. |
| 11 | `QS_ENGINEER` | QS Engineer | Reads payment-certification authority for IPC preparation. |
| 12 | `SITE_SUPERVISOR` | Site Supervisor | Reads the directory. Mobile primary. |
| 13 | `DOCUMENT_CONTROLLER` | Document Controller | Day-to-day operator. Maintains records, contacts, compliance documents. |
| 14 | `HR_OFFICER` | HR Officer | Reads internal-department stakeholders only. |
| 15 | `ACCOUNTANT` | Accountant | Reads supplier and subcontractor payee master data. |
| 16 | `SUBCONTRACTOR` | Subcontractor (external) | Sees own record and own scope only. |
| 17 | `SUPPLIER` | Supplier (external) | Sees own record and own POs only. |
| 18 | `CLIENT` | Client (external) | Sees own record and the project party list. |
| 19 | `CONSULTANT` | Consultant (external) | Sees own record and the project party list within discipline. |
| 20 | `VIEWER` | Viewer | Read-only observer on assigned projects. |

---

## 3. Permission Catalogue

| Permission Code | Description | Risk | Audit Severity |
|---|---|---|---|
| `STK.VIEW_LIST` | View the stakeholder register and counts | Low | — |
| `STK.VIEW_DETAIL` | Open a stakeholder record, including internal notes and blacklist reasons | Low | — |
| `STK.CREATE` | Create a stakeholder in `DRAFT` and submit for verification | Medium | Medium |
| `STK.EDIT` | Edit profile, addresses, contacts, compliance documents; suspend and reinstate | Medium | Medium–High |
| `STK.ARCHIVE` | Archive a stakeholder to `INACTIVE` | Medium | High |
| `STK.APPROVE_REGISTRATION` | Approve or reject a pending registration | High | High |
| `STK.ASSIGN_PROJECT` | Create a project assignment | High | High |
| `STK.EDIT_ASSIGNMENT` | Edit or activate an assignment; place on hold | High | High |
| `STK.REMOVE_ASSIGNMENT` | Terminate an assignment | High | High |
| `STK.SET_APPROVAL_AUTHORITY` | Set authority level, threshold, fallback, delegation | **Critical** | High |
| `STK.SET_ACCESS_SCOPE` | Set access level, module scope, confidentiality tier | **Critical** | High |
| `STK.SET_WBS_SCOPE` | Grant or remove WBS node scope | **Critical** | High |
| `STK.SET_WORKFLOW_RESPONSIBILITY` | Toggle workflow responsibilities | High | Medium |
| `STK.PROVISION_EXTERNAL_USER` | Create or revoke an external platform login | **Critical** | Critical |
| `STK.VIEW_PERFORMANCE` | View reliability scores and the performance event ledger | Medium | — |
| `STK.EDIT_PERFORMANCE_WEIGHTS` | Configure scoring weights and thresholds | High | High |
| `STK.BLACKLIST` | Blacklist a stakeholder tenant-wide | **Critical** | Critical |
| `STK.UNBLACKLIST` | Lift a blacklist | **Critical** | Critical |
| `STK.EXPORT` | Export register or performance data | High | High |
| `STK.VIEW_AUDIT` | View the module's audit trail and status history | Medium | High |

**Why authority and scope permissions are Critical.** They do not grant access to data — they grant the ability to grant access to data, and to determine who may approve commitments of money and time. A user who can set approval authority can, in effect, authorise a purchase order by appointing themselves the approver. Separation of duties (§12) exists specifically to constrain this.

---

## 4. Master RBAC Matrix — Internal Roles

Legend: `✓` allowed · `✓*` allowed with condition (footnoted) · `—` denied

| Permission | Super Admin | Company Admin | Project Director | Project Manager | Discipline Manager | Document Controller | Procurement Officer | QS Engineer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `STK.VIEW_LIST` | ✓¹ | ✓ | ✓ | ✓² | ✓² | ✓ | ✓ | ✓² |
| `STK.VIEW_DETAIL` | ✓¹ | ✓ | ✓ | ✓² | ✓²ᐟ³ | ✓ | ✓⁴ | ✓²ᐟ⁴ |
| `STK.CREATE` | — | ✓ | ✓ | ✓ | — | ✓ | ✓⁴ | — |
| `STK.EDIT` | — | ✓ | ✓ | ✓² | — | ✓ | ✓⁴ | — |
| `STK.ARCHIVE` | — | ✓ | ✓ | — | — | — | — | — |
| `STK.APPROVE_REGISTRATION` | — | ✓⁵ | ✓⁵ | — | — | — | — | — |
| `STK.ASSIGN_PROJECT` | — | ✓ | ✓ | ✓² | — | — | — | — |
| `STK.EDIT_ASSIGNMENT` | — | ✓ | ✓ | ✓² | — | — | — | — |
| `STK.REMOVE_ASSIGNMENT` | — | ✓ | ✓ | ✓² | — | — | — | — |
| `STK.SET_APPROVAL_AUTHORITY` | — | ✓ | ✓ | ✓² | — | — | — | — |
| `STK.SET_ACCESS_SCOPE` | — | ✓ | ✓ | ✓² | — | — | — | — |
| `STK.SET_WBS_SCOPE` | — | ✓ | ✓ | ✓² | — | — | — | — |
| `STK.SET_WORKFLOW_RESPONSIBILITY` | — | ✓ | ✓ | ✓² | ✓²ᐟ³ | — | — | — |
| `STK.PROVISION_EXTERNAL_USER` | — | ✓ | ✓² | — | — | — | — | — |
| `STK.VIEW_PERFORMANCE` | ✓¹ | ✓ | ✓ | ✓² | ✓²ᐟ³ | — | ✓⁴ | ✓² |
| `STK.EDIT_PERFORMANCE_WEIGHTS` | — | ✓ | — | — | — | — | — | — |
| `STK.BLACKLIST` | — | ✓⁶ | ✓⁶ | — | — | — | — | — |
| `STK.UNBLACKLIST` | — | ✓⁶ | ✓⁶ | — | — | — | — | — |
| `STK.EXPORT` | — | ✓ | ✓ | ✓² | ✓²ᐟ³ | ✓ | ✓⁴ | ✓² |
| `STK.VIEW_AUDIT` | ✓¹ | ✓ | ✓ | ✓² | — | ✓⁷ | — | — |

| Permission | Engineer | BIM Coordinator | QA/QC Inspector | HSE Officer | Site Supervisor | HR Officer | Accountant | Viewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `STK.VIEW_LIST` | ✓² | ✓² | ✓² | ✓² | ✓² | ✓⁸ | ✓⁹ | ✓² |
| `STK.VIEW_DETAIL` | ✓²ᐟ¹⁰ | ✓²ᐟ¹⁰ | ✓²ᐟ¹⁰ | ✓²ᐟ¹⁰ | ✓²ᐟ¹⁰ | ✓⁸ | ✓⁹ | ✓²ᐟ¹⁰ |
| `STK.CREATE` | — | — | — | — | — | — | — | — |
| `STK.EDIT` | — | — | — | ✓¹¹ | — | — | — | — |
| `STK.ARCHIVE` | — | — | — | — | — | — | — | — |
| `STK.APPROVE_REGISTRATION` | — | — | — | — | — | — | — | — |
| `STK.ASSIGN_PROJECT` | — | — | — | — | — | — | — | — |
| `STK.EDIT_ASSIGNMENT` | — | — | — | — | — | — | — | — |
| `STK.REMOVE_ASSIGNMENT` | — | — | — | — | — | — | — | — |
| `STK.SET_APPROVAL_AUTHORITY` | — | — | — | — | — | — | — | — |
| `STK.SET_ACCESS_SCOPE` | — | — | — | — | — | — | — | — |
| `STK.SET_WBS_SCOPE` | — | — | — | — | — | — | — | — |
| `STK.SET_WORKFLOW_RESPONSIBILITY` | — | — | — | — | — | — | — | — |
| `STK.PROVISION_EXTERNAL_USER` | — | — | — | — | — | — | — | — |
| `STK.VIEW_PERFORMANCE` | — | — | — | — | — | — | — | — |
| `STK.EDIT_PERFORMANCE_WEIGHTS` | — | — | — | — | — | — | — | — |
| `STK.BLACKLIST` | — | — | — | — | — | — | — | — |
| `STK.UNBLACKLIST` | — | — | — | — | — | — | — | — |
| `STK.EXPORT` | — | — | — | — | — | — | ✓⁹ | — |
| `STK.VIEW_AUDIT` | — | — | — | — | — | — | — | — |

### 4.1 Conditions

| # | Condition |
|---|---|
| 1 | **Super Admin cross-tenant access requires explicit impersonation.** The session must be opened through the impersonation endpoint, which writes a `CRITICAL` audit entry naming the target tenant, the reason, and a time limit before any query executes. There is no ambient cross-tenant read. Super Admin holds no write permissions in this module — platform operators do not edit customer business data. |
| 2 | **Limited to projects where the user holds an active project team membership.** Evaluated against `project_team_members`, not against stakeholder assignments. A Project Manager sees only their own projects' stakeholders and only those stakeholders' assignments on those projects. |
| 3 | **Limited to the user's own discipline.** A Structural Discipline Manager may configure responsibility toggles only for assignments whose `discipline_code` is `STR` or `ALL`. |
| 4 | **Limited to stakeholder types `SUPPLIER_VENDOR` and `SUBCONTRACTOR`.** A Procurement Officer cannot create or edit a client, consultant, or authority record. |
| 5 | **May not approve a registration they created** (BRL-STK-015). Enforced server-side by comparing `created_by` to the acting user. |
| 6 | **Requires two-step confirmation, a reason category, free-text reason of at least 20 characters, and an evidence reference.** The confirming step requires re-typing the organisation's legal name exactly. |
| 7 | **Limited to document-related audit events** (`STK.DOCUMENT.*`, `STK.CONTACT.*`, `STK.STAKEHOLDER.UPDATED`). Authority, access, and blacklist events are excluded. |
| 8 | **Limited to stakeholder type `INTERNAL_DEPARTMENT`.** HR has no business need to see external commercial parties. |
| 9 | **Limited to stakeholder types `SUPPLIER_VENDOR` and `SUBCONTRACTOR`, and to payee-relevant fields only** (see field-level restrictions, §8). |
| 10 | **Detail view is reduced.** Contact details, project role, and authority level are visible; internal notes, performance data, blacklist reasons, and compliance document files are not. |
| 11 | **Limited to uploading and viewing HSE-category compliance documents** (`ISO_45001`, safety certifications) on `SUBCONTRACTOR` records. No other edit capability. |

---

## 5. External Stakeholder Access Model

External users are governed by a separate, far more restrictive model. They do not appear in the internal matrix because their access is not role-driven — it is assignment-driven.

| Capability | Client | Consultant | Subcontractor | Supplier |
|---|:--:|:--:|:--:|:--:|
| View own organisation record | ✓ | ✓ | ✓ | ✓ |
| Edit own organisation profile | — | — | — | — |
| View own contact list | ✓ | ✓ | ✓ | ✓ |
| Edit own contacts | — | — | — | — |
| Upload own compliance documents | — | — | ✓ᴬ | ✓ᴬ |
| View own compliance documents | ✓ | ✓ | ✓ | ✓ |
| View own project assignment | ✓ | ✓ | ✓ | ✓ |
| View own approval authority | ✓ | ✓ | ✓ | ✓ |
| View own access scope | ✓ | ✓ | ✓ | ✓ |
| View own WBS scope | ✓ | ✓ | ✓ | ✓ |
| View own performance score | — | — | — | — |
| View other parties on the project | ✓ᴮ | ✓ᶜ | — | — |
| View other parties' contact details | ✓ᴮ | ✓ᶜ | — | — |
| View the project stakeholder matrix | — | — | — | — |
| Any create, edit, assign, or authority action | — | — | — | — |
| Export | — | — | — | — |
| View audit trail | — | — | — | — |

| Note | Condition |
|---|---|
| ᴬ | Upload only, into a pending state. The document is not treated as valid until a Document Controller or Procurement Officer verifies it. An external party cannot self-certify compliance. |
| ᴮ | Client sees the project party list — organisation name, role, discipline, primary contact — because contractually they are entitled to know who is engaged on their project. No authority levels, no performance data, no other party's compliance documents. |
| ᶜ | Consultant sees only parties within their own discipline, plus the client and PMC. An MEP consultant has no need to see the list of blockwork subcontractors. |

**The hard rule.** No external role holds any `STK.*` write permission other than the pending compliance upload at note ᴬ. This is not a matrix cell that can be toggled by configuration — it is enforced by the database CHECK constraint `chk_access_external_not_full` and by the absence of these permission codes from any external role definition.

---

## 6. Data Scope Rules

Scope predicates must match the RLS policies in DCOS-STK-DB-001 §8 exactly. Where the application layer and the database layer disagree, the database wins and the discrepancy is a defect.

| Role | Visible Rows — SQL Predicate |
|---|---|
| `SUPER_ADMIN` | `tenant_id = current_setting('app.tenant_id')::uuid` — set only by an audited impersonation session |
| `COMPANY_ADMIN` | `tenant_id = current_setting('app.tenant_id')::uuid` |
| `PROJECT_DIRECTOR` | `tenant_id = current_setting('app.tenant_id')::uuid` |
| `PROJECT_MANAGER` | `tenant_id = …` AND `EXISTS (SELECT 1 FROM project_team_members m WHERE m.user_id = current_setting('app.user_id')::uuid AND m.project_id = <row>.project_id AND m.is_active)` |
| `DISCIPLINE_MANAGER` | PM predicate AND `(<row>.discipline_code = current_setting('app.discipline')  OR <row>.discipline_code = 'ALL')` |
| `DOCUMENT_CONTROLLER` | `tenant_id = …` (register-wide; the DC maintains master data across projects) |
| `PROCUREMENT_OFFICER` | `tenant_id = …` AND `stakeholder_type IN ('SUPPLIER_VENDOR','SUBCONTRACTOR')` |
| `QS_ENGINEER` | PM predicate (read-only) |
| `ACCOUNTANT` | `tenant_id = …` AND `stakeholder_type IN ('SUPPLIER_VENDOR','SUBCONTRACTOR')` |
| `HR_OFFICER` | `tenant_id = …` AND `stakeholder_type = 'INTERNAL_DEPARTMENT'` |
| `ENGINEER`, `BIM_COORDINATOR`, `QAQC_INSPECTOR`, `HSE_OFFICER`, `SITE_SUPERVISOR`, `VIEWER` | PM predicate (read-only, reduced fields) |
| External roles | `tenant_id = …` AND `EXISTS (SELECT 1 FROM stakeholder_user_links l WHERE l.user_id = current_setting('app.user_id')::uuid AND l.status = 'ACTIVE' AND l.assignment_id = <row>.id)` — plus the notes ᴮ / ᶜ widening for the project party list only |

---

## 7. Multi-Dimensional Evaluation Examples

Worked examples showing that holding a permission is not the same as being able to use it.

| Scenario | Role | Permission | Project | Discipline | WBS | Result |
|---|---|---|---|---|---|---|
| PM sets authority on their own project | `PROJECT_MANAGER` | ✓ | ✓ member | n/a | n/a | **Allow** |
| PM sets authority on another PM's project | `PROJECT_MANAGER` | ✓ | ✗ not a member | n/a | n/a | **404** — project not in scope |
| STR Discipline Manager toggles responsibility on an MEP assignment | `DISCIPLINE_MANAGER` | ✓ | ✓ | ✗ MEP ≠ STR | n/a | **403** — in scope, action not permitted |
| Procurement Officer edits a consultant record | `PROCUREMENT_OFFICER` | ✓ | n/a | n/a | n/a | **404** — type not in scope |
| Subcontractor user opens a task on B01-L07 | `SUBCONTRACTOR` | n/a | ✓ | ✓ | ✗ scope is L01–L05 | **404** — WBS not covered |
| Client user opens an internal cost document | `CLIENT` | n/a | ✓ | n/a | ✓ | **404** — module and tier not in scope |
| Consultant with `REVIEW_ONLY` presses Approve | `CONSULTANT` | n/a | ✓ | ✓ | ✓ | **403** — insufficient authority |
| Tenant A user requests a Tenant B stakeholder | any | any | n/a | n/a | n/a | **404** + `CRITICAL` audit |
| Document Controller attempts to blacklist | `DOCUMENT_CONTROLLER` | ✗ | n/a | n/a | n/a | **403** — permission not held |

---

## 8. Field-Level Restrictions

Some fields are masked even where the row itself is visible. Masked means **omitted from the payload**, not returned blank — a null in a response still confirms the field exists and can be inferred from.

| Field | Visible To | Masked From |
|---|---|---|
| `stakeholders.notes` (internal notes) | Company Admin, Project Director, Project Manager, Document Controller | All other roles, all external roles |
| `stakeholders.reliability_score` | Roles holding `STK.VIEW_PERFORMANCE` | Everyone else, including the stakeholder themselves |
| Performance event ledger | Roles holding `STK.VIEW_PERFORMANCE` | Everyone else |
| `stakeholder_blacklist_records.reason_text`, `evidence_reference` | Company Admin, Project Director, Project Manager, Document Controller | All others see only "Blacklisted" with no reason |
| `stakeholder_approval_authorities.threshold_amount` | Company Admin, Project Director, Project Manager, QS Engineer, Accountant | Engineers, supervisors, all external roles |
| `stakeholder_documents` file access (signed URL) | Company Admin, Project Director, Project Manager, Document Controller, Procurement Officer (supplier/sub only), HSE Officer (HSE docs only), the stakeholder themselves | All others — metadata may be visible, the file is not |
| `stakeholder_contacts.email`, `.mobile`, `.telegram_handle` | All internal roles on assigned projects | External roles, except for parties visible under notes ᴮ / ᶜ |
| `stakeholder_user_links.*` | Company Admin, Project Director | All others |
| `stk_performance_weights.*` | Company Admin | All others |
| Payee-relevant fields only (Accountant condition ⁹) | `legal_name`, `registration_number`, `tax_id`, `default_currency`, addresses, primary contact | Accountant sees nothing else on the record |

---

## 9. Action-Level Guards

Preconditions that apply **in addition** to holding the permission code.

| Action | Additional Guard |
|---|---|
| Approve registration | Actor ≠ creator (BRL-STK-015). Record must be in `PENDING_APPROVAL`. |
| Assign to project | Stakeholder must be `ACTIVE`. Not blacklisted. No live assignment on that project. |
| Activate assignment | Authority set, access scope set, ≥ 1 responsibility enabled — enforced by database trigger `trg_ps_activation_gate`, not only by the API. |
| Set `FULL_ACCESS` | Stakeholder must be internal. Enforced by CHECK constraint `chk_access_external_not_full`. |
| Set `INSPECTION_APPROVAL` / `PAYMENT_CERTIFICATION` responsibility | Assignment must hold at least `APPROVE` authority. |
| Set fallback approver | Must be another assignment on the same project with equal or higher authority. Self-reference rejected by CHECK constraint. |
| Set delegation | End date required, maximum 90 days, level ≤ delegator's. Enforced by CHECK constraint. |
| Change authority with items in flight | Reason mandatory. Explicit re-route choice required. |
| Terminate assignment | All open obligations reassigned, or explicitly orphaned by a Project Manager with a reason. |
| Suspend | Reason category and reason text mandatory. |
| Blacklist | Two-step confirmation with exact legal-name match. Reason category, reason text ≥ 20 characters, evidence reference. |
| Unblacklist | Two-step confirmation and justification. Transitions to `INACTIVE`, never directly to `ACTIVE`. |
| Archive | No `ACTIVE` assignments may exist. |
| Provision external user | Assignment must be `ACTIVE`. Contact must have a valid email. Role must be one of the four external roles. |
| Edit performance score | **Impossible for every role.** No permission code exists. The API rejects any write to `stakeholder_performance_scores` from the application role; only `dcos_scheduler` holds INSERT/UPDATE. |
| Export | Filter set, row count, and format are recorded in the audit entry. |
| Super Admin cross-tenant read | Requires an impersonation session with a `CRITICAL` audit entry written before any query. |

---

## 10. Permission Delegation

| Mechanism | Rule |
|---|---|
| Approval authority delegation | An assignment holding `APPROVE` or `FINAL_APPROVE` may delegate to another assignment on the same project. Maximum 90 days, hard end date, level cannot exceed the delegator's. Configured by a user holding `STK.SET_APPROVAL_AUTHORITY`. Phase 3. |
| Automatic expiry | Delegation lapses on the end date without action. There is no auto-renewal — an indefinite delegation is an authority transfer and should be recorded as one. |
| Fallback approver | Not delegation. A fallback activates only when the primary is suspended, on hold, or their assignment is terminated. It is a continuity mechanism, not a convenience. |
| RBAC role delegation | Not supported in this module. A user cannot lend their `STK.*` permissions to another user. Role changes go through Module 02 and are audited there. |
| Impersonation | Super Admin only, time-limited, `CRITICAL` audit entry naming target tenant and reason. Read-only. |

---

## 11. Tenant Isolation Enforcement

### 11.1 The Chain

```
1. Client sends request with JWT
2. API middleware extracts tenant_id from the JWT claim ONLY
3. Middleware rejects the request if the body or query contains a conflicting tenant_id
4. Connection checkout sets the transaction-local session variable:
       SELECT set_config('app.tenant_id', <claim>, true);
5. Every query is filtered by RLS: tenant_id = current_setting('app.tenant_id', true)::uuid
6. Zero rows returned → API returns 404, never 403
```

### 11.2 Forbidden Patterns

| Pattern | Why It Is Forbidden |
|---|---|
| Reading `tenant_id` from the request body, a query parameter, or a client-controlled header | The client controls all three. This is the single most common multi-tenant breach. |
| Using the Supabase service-role key anywhere reachable from client code | The service role bypasses RLS entirely. |
| Any query executed without `app.tenant_id` set | RLS would evaluate against NULL. It fails closed — but the code path should not exist. |
| Background jobs running without tenant scope | A job that iterates all tenants in one transaction can leak across them. Jobs must be scoped per tenant by construction and are rejected at start-up otherwise. |
| Returning 403 for a cross-tenant resource | Confirms the resource exists. |
| `ENABLE ROW LEVEL SECURITY` without `FORCE ROW LEVEL SECURITY` | The table owner would bypass the policy. |

### 11.3 Verification

Deployment is blocked unless this returns zero rows (see DCOS-STK-DEP-001 §17):

```sql
SELECT c.relname
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public'
  AND  c.relname LIKE 'stakeholder%' OR c.relname = 'project_stakeholders'
  AND  (c.relrowsecurity = false OR c.relforcerowsecurity = false);
```

---

## 12. Separation of Duties

| Constraint | Rationale |
|---|---|
| The creator of a stakeholder registration may not approve it | Prevents a single person introducing an unverified counterparty into the register (BRL-STK-015). |
| A user who sets approval authority should not be the sole approver in that chain | A Project Manager who appoints themselves the only approver of purchase orders has created an unchecked spending authority. Flagged as a governance warning on the Project Stakeholder Matrix; not hard-blocked, because on small projects it is sometimes unavoidable and must instead be visible. |
| Blacklisting requires Company Admin or Project Director — never a Project Manager | Blacklisting is a company-wide commercial decision. A project-level dispute must not be able to remove a supplier from every project. |
| Performance scores cannot be edited by anyone | Removes any argument that a score was adjusted to justify a decision (BRL-STK-017). |
| Scoring weights are Company Admin only | Prevents a project-level actor tuning the formula until a favoured supplier scores well. |
| External compliance uploads require internal verification | An external party cannot self-certify its own insurance. |
| Super Admin holds no write permissions | Platform operators do not edit customer business data, even to help. |

---

## 13. Audit Requirements for Permission Changes

| Event | Severity | Recorded |
|---|---|---|
| `STK.AUTHORITY.CHANGED` | High | Before and after level, scope triple, fallback, reason, in-flight item count, re-route decision |
| `STK.ACCESS.CHANGED` | High | Before and after access level, module set, confidentiality tier |
| `STK.WBS_SCOPE.CHANGED` | High | Added and removed node IDs with paths |
| `STK.RESPONSIBILITY.CHANGED` | Medium | Before and after toggle set |
| `STK.EXTERNAL_USER.PROVISIONED` | **Critical** | Contact, role, resulting scope summary, inviting user |
| `STK.EXTERNAL_USER.REVOKED` | **Critical** | Revocation trigger (manual / termination / blacklist / reconciliation), reason |
| `STK.STAKEHOLDER.BLACKLISTED` | **Critical** | Reason category, reason text, evidence reference, confirming actor, terminated assignments, revoked logins |
| `STK.ACCESS.DENIED` | High, **Critical** if cross-tenant | User, resource, failing dimension, source channel, correlation ID |
| Permission escalation attempt (403 on a `STK.*` write) | High | Attempted action, held permissions, source IP |
| Super Admin impersonation start | **Critical** | Target tenant, reason, time limit |

Every entry carries the R0 §24.4.5 envelope: `user_name_snapshot`, `user_role_snapshot`, `department_snapshot`, `ip_address`, `source_channel`, `correlation_id`.

---

## 14. Negative Permission Test List

These become the permission and security suite in DCOS-STK-TEST-001 §9. Each must return the specified result and produce the specified audit entry.

| ID | Test | Expected |
|---|---|---|
| NEG-01 | Tenant A user requests a Tenant B stakeholder by ID | 404 + `CRITICAL` audit |
| NEG-02 | Request with a `tenant_id` in the body conflicting with the JWT | 400, request rejected, `CRITICAL` audit |
| NEG-03 | Query executed with `app.tenant_id` unset | Zero rows (RLS fails closed) |
| NEG-04 | Table owner connection attempts to bypass RLS | Blocked by `FORCE ROW LEVEL SECURITY` |
| NEG-05 | Project Manager sets authority on a project they are not a member of | 404 |
| NEG-06 | Discipline Manager toggles responsibility outside their discipline | 403 |
| NEG-07 | Procurement Officer edits a `CONSULTANT` record | 404 |
| NEG-08 | HR Officer lists non-internal stakeholders | Empty result, not an error |
| NEG-09 | Accountant requests `notes` or performance fields | Fields absent from payload |
| NEG-10 | Document Controller calls the blacklist endpoint | 403 + audit |
| NEG-11 | Creator approves their own registration | 422 `SELF_APPROVAL_FORBIDDEN` |
| NEG-12 | Set `FULL_ACCESS` on an external stakeholder via direct API | 422, and CHECK constraint blocks it if the API layer is defective |
| NEG-13 | Activate an assignment with no approval authority | 422, database trigger raises `ASSIGNMENT_NO_AUTHORITY` |
| NEG-14 | Activate with no workflow responsibility | 422 `ASSIGNMENT_NO_RESPONSIBILITY` |
| NEG-15 | Set a fallback approver with lower authority | 422 |
| NEG-16 | Set a fallback approver to the assignment itself | 422, CHECK constraint |
| NEG-17 | Set a delegation of 120 days | 422, CHECK constraint |
| NEG-18 | Assign a blacklisted stakeholder | 422 `STAKEHOLDER_BLACKLISTED` + audit |
| NEG-19 | Register an organisation matching a blacklisted identity | 422 + `CRITICAL` audit |
| NEG-20 | Terminate an assignment with open obligations | 422 with the open-item list |
| NEG-21 | Blacklist without an exact typed name match | 422, no state change |
| NEG-22 | Blacklist with a reason under 20 characters | 422, CHECK constraint |
| NEG-23 | Any role writes to `stakeholder_performance_scores` | 403; grant does not exist for `dcos_app` |
| NEG-24 | Any role updates or deletes `stakeholder_status_history` | Permission denied at the database |
| NEG-25 | Any role deletes `stakeholder_performance_events` | Permission denied at the database |
| NEG-26 | External Subcontractor user reads another subcontractor's record | 404 |
| NEG-27 | External Subcontractor user reads a WBS node outside their grant | 404 + `STK.ACCESS.DENIED` |
| NEG-28 | External Client user reads a tier-4 document | 404 + `STK.ACCESS.DENIED` |
| NEG-29 | External Consultant with `REVIEW_ONLY` calls the approve endpoint | 403 `INSUFFICIENT_AUTHORITY` |
| NEG-30 | External user calls any `STK.*` write endpoint | 403 + audit |
| NEG-31 | External user's assignment terminated, then requests a resource | 401 after revocation; before revocation, 404 on scope evaluation |
| NEG-32 | Five external access denials within 10 minutes | `CRITICAL` notification to Company Admin |
| NEG-33 | Viewer attempts export | 403 |
| NEG-34 | Super Admin reads another tenant without an impersonation session | 404 |
| NEG-35 | Super Admin attempts any `STK.*` write | 403 |
| NEG-36 | Background job starts without a tenant scope | Job rejected at start-up |
| NEG-37 | Signed document URL used after 15-minute expiry | 403 from storage |
| NEG-38 | Cross-tenant document ID requested for download | 404, never 403 |
| NEG-39 | Concurrent authority edit with a stale version | 409 with field diff, no silent overwrite |
| NEG-40 | Bulk import row matching a blacklisted identity | Row rejected, never committed |

---

## 15. Open Questions

| ID | Question | Impact |
|---|---|---|
| Q-25 | Should the self-appointed-approver separation of duties be a hard block rather than a governance warning? Hard-blocking would break small projects with a two-person office. | Governance policy |
| Q-26 | Should Document Controller hold register-wide scope, or be limited to assigned projects? Register-wide is operationally necessary for master data hygiene but widens the blast radius. | Data scope |
| Q-27 | Should Project Director hold `STK.PROVISION_EXTERNAL_USER` unconditionally, or only on their own portfolio? | Condition ² applicability |
| Q-28 | Is a five-denial-in-ten-minutes threshold correct for external probing detection, or too noisy for legitimate misconfiguration? | Notification tuning (Q-12 from Use Cases) |

---

## 16. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1.0 | 2026-08-08 | Initial issue — 20 roles × 20 permissions, external model, scope predicates, 40 negative tests | Senior System Architect |

---

**End of Document**
