# 03 — Use Cases
## DCOS Stakeholder Management Module

| Field | Value |
|---|---|
| Document Code | DCOS-STK-UC-001 |
| Module | Stakeholder Management (Module 04 — Foundation) |
| Version | R1.0 |
| Status | Issued for Review |
| Author Role | Construction Operations Consultant / Business Analyst |
| Date | 2026-08-08 |
| Related Documents | DCOS-STK-BRD-001, DCOS-STK-FS-001 |

---

## 1. Actor Catalogue

| Actor | Type | Goal in This Module | Typical Frequency |
|---|---|---|---|
| Company Admin | Internal, primary | Govern the tenant register, approve registrations, blacklist, provision external access | Weekly |
| Project Director | Internal, primary | Assure portfolio responsibility coverage, approve blacklists, act on escalations | Monthly |
| Project Manager | Internal, primary | Assign parties, set authority and access, terminate assignments | Weekly at steady state, daily at mobilisation |
| Document Controller | Internal, primary | Maintain the register day to day, manage compliance documents | Daily |
| Discipline Manager | Internal, secondary | Configure discipline-scoped reviewers and responsibilities | Monthly |
| Procurement Officer | Internal, secondary | Verify supplier eligibility before RFQ and PO | Daily |
| QS Engineer | Internal, secondary | Confirm payment certification authority | Monthly at IPC cycle |
| Site Supervisor | Internal, secondary | Look up contacts from site | Daily |
| External Consultant User | External | Review and approve within scope | Daily |
| External Client User | External | Approve and view progress within scope | Weekly |
| External Subcontractor User | External | See and act on own scope only | Daily |
| External Supplier User | External | See own POs and deliveries only | Weekly |
| Auditor (internal or client) | External, read | Obtain traceability evidence | Quarterly / on demand |
| **System** (scheduler) | Non-human | Expiry scan, score computation, orphan reconciliation | Nightly |
| **Consuming Module** | Non-human | Resolve approvers, recipients, access decisions | Continuous |

---

## 2. Use Case Index

| ID | Use Case | Primary Actor | Priority | Related FRs |
|---|---|---|---|---|
| UC-STK-001 | Register a new consultant organisation | Document Controller | Must | FR-STK-007, 008, 010, 011, 015, 018 |
| UC-STK-002 | Detect and resolve a duplicate supplier entry | Document Controller | Must | FR-STK-008, 012, 013 |
| UC-STK-003 | Assign a client with FINAL_APPROVE authority | Project Manager | Must | FR-STK-023, 025, 031, 033, 036 |
| UC-STK-004 | Assign a subcontractor restricted to B01 / L01–L05 | Project Manager | Must | FR-STK-023, 036, 037, 038, 042 |
| UC-STK-005 | Provision an external consultant login and verify scope | Company Admin | Must | FR-STK-045, 046, 039, 064 |
| UC-STK-006 | Change approval authority with items in flight | Project Manager | Must | FR-STK-031, 026, 063, 065 |
| UC-STK-007 | Suspend a supplier on insurance expiry | System / Document Controller | Must | FR-STK-020, 021, 049 |
| UC-STK-008 | Blacklist a subcontractor after contract default | Project Director | Must | FR-STK-051, 028, 029 |
| UC-STK-009 | Attempt to assign a blacklisted stakeholder | Project Manager | Must | FR-STK-023 |
| UC-STK-010 | Terminate an assignment with responsibility handover | Project Manager | Must | FR-STK-028, 029, 044 |
| UC-STK-011 | Resolve the approver for a structural shop drawing | Document Control module | Must | FR-STK-060, 062, 063 |
| UC-STK-012 | Resolve RFI responder and escalation chain | RFI module | Must | FR-STK-061, 062 |
| UC-STK-013 | Review reliability score before re-engagement | Project Director | Should | FR-STK-056, 057 |
| UC-STK-014 | Act on a performance threshold breach | Project Manager | Should | FR-STK-058 |
| UC-STK-015 | Filter and export an approved stakeholder list | Procurement Officer | Must | FR-STK-002, 004, 006 |
| UC-STK-016 | Add a contact and change the primary designation | Document Controller | Must | FR-STK-015, 016, 017 |
| UC-STK-017 | Upload and track compliance document expiry | Document Controller | Must | FR-STK-018, 020, 022 |
| UC-STK-018 | Client user attempts to open an internal cost document | External Client User | Must | FR-STK-039, 040, 064 |
| UC-STK-019 | Cross-tenant access attempt is blocked | Malicious / misconfigured user | Must | FR-STK-039, 064 |
| UC-STK-020 | Bulk import stakeholders with validation report | Company Admin | Should | FR-STK-066, 067 |

### 2.1 Use Case Diagram

```
                        ┌───────────────────────────────────┐
                        │  Stakeholder Management Module    │
   Document Controller ─┤  UC-001 Register                  │
                        │  UC-002 Resolve duplicate         │
                        │  UC-016 Manage contacts           ├─ Audit Trail Engine
                        │  UC-017 Compliance documents      │
                        │                                   │
   Project Manager ─────┤  UC-003 Assign client             ├─ Notification Engine
                        │  UC-004 Assign subcontractor      │
                        │  UC-006 Change authority          │
                        │  UC-010 Terminate assignment      │
                        │  UC-014 Act on breach             │
                        │                                   │
   Company Admin ───────┤  UC-005 Provision external user   ├─ RBAC / Identity
                        │  UC-020 Bulk import               │
                        │                                   │
   Project Director ────┤  UC-008 Blacklist                 │
                        │  UC-013 Review performance        │
                        │                                   │
   Procurement Officer ─┤  UC-015 Filter and export         │
                        │                                   │
   Consuming Modules ───┤  UC-011 Resolve approver          │
                        │  UC-012 Resolve RFI chain         │
                        │                                   │
   External Users ──────┤  UC-018 Access denied (in scope)  │
                        │  UC-019 Cross-tenant blocked      │
                        │                                   │
   System (scheduler) ──┤  UC-007 Expiry suspension         │
                        └───────────────────────────────────┘
```

---

## 3. Detailed Use Cases

---

### UC-STK-001 — Register a New Consultant Organisation

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Document Controller |
| **Secondary Actors** | Company Admin (verifier), Audit Engine, Notification Engine |
| **Stakeholders & Interests** | PM needs the consultant available for assignment before design review starts. Company Admin needs verified, non-duplicate, compliant master data. |
| **Preconditions** | User authenticated with `STK.CREATE`. Tenant context established. Consultant's trade licence and professional indemnity certificate available as PDF. |
| **Trigger** | A design consultant has been appointed on Tower A and must be set up before the first drawing submission. |
| **Frequency** | 40–110 per project at mobilisation; 2–5 per week at steady state |
| **Performance** | Full registration in under 4 minutes including document upload |

**Main Success Scenario**

1. Actor opens `Admin → Stakeholder Management` (SCR-STK-001).
2. System displays the register with the type-filter panel and live counts.
3. Actor selects **Add Stakeholder**.
4. System opens the multi-step drawer (SCR-STK-002) at Step 1.
5. Actor selects stakeholder type `CONSULTANT`.
6. Actor enters legal name, trading name, registration number, tax ID, country `KH`, default currency `USD`.
7. On blur of legal name, system normalises the name and runs duplicate detection.
8. System returns no match and confirms the identity is clear.
9. Actor advances to Step 3 and adds a contact person: name (Latin and Khmer), position "Structural Review Lead", discipline `STR`, email, mobile, Telegram handle, preferred channel Email, preferred language English.
10. Actor designates this contact as primary.
11. Actor advances to Step 4 and uploads the trade licence and professional indemnity certificate with issue and expiry dates.
12. System virus-scans each file, stores it under the tenant-partitioned path, and indexes the expiry dates.
13. Actor saves. System creates the record in `DRAFT` and emits `STK.STAKEHOLDER.CREATED`.
14. Actor selects **Submit for verification**. System validates completeness and moves the record to `PENDING_APPROVAL`.
15. System notifies the Company Admin.
16. Company Admin opens the record, reviews the documents, and selects **Approve**.
17. System checks that the approver is not the creator, moves the record to `ACTIVE`, emits `STK.STAKEHOLDER.APPROVED`, and notifies the Document Controller.

**Alternate Flows**

- **A1 — Mandatory document not yet available.** At step 11 the actor skips upload. Record saves as `DRAFT` but cannot be submitted; system lists the missing mandatory documents for type `CONSULTANT`.
- **A2 — Registration number not known.** Field left blank. Duplicate detection falls back to fuzzy name matching only; system flags the record for later completion.
- **A3 — Actor holds both `STK.CREATE` and `STK.APPROVE_REGISTRATION`.** At step 16 the system blocks self-approval (BRL-STK-015) and routes to another eligible verifier.

**Exception Flows**

- **E1 — Fuzzy duplicate detected.** System soft-blocks at step 8, displays the candidate record with similarity score, and requires the actor either to open the existing record or to record a reason for proceeding as a distinct entity. Emits `STK.STAKEHOLDER.DUPLICATE_BLOCKED`.
- **E2 — Blacklist identity match.** System hard-blocks, displays a generic block message, flags the attempt to Company Admin, and emits `STK.STAKEHOLDER.BLACKLIST_MATCH_BLOCKED` at `CRITICAL`.
- **E3 — Infected file upload.** System quarantines the file, aborts that upload only, and alerts the Company Admin. Other entered data is preserved.
- **E4 — Verifier does not act within 3 working days.** System issues a reminder; after 5 days it escalates to Company Admin. The record remains `PENDING_APPROVAL` and cannot be assigned.

| **Postconditions** | Stakeholder exists in `ACTIVE` with ≥ 1 contact, current mandatory documents, and full audit history. Eligible for project assignment. |
|---|---|
| **Business Rules** | BRL-STK-014, BRL-STK-015, BRL-STK-016, BRL-STK-018 |
| **Data Touched** | `stakeholders`, `stakeholder_contacts`, `stakeholder_addresses`, `stakeholder_documents`, `stakeholder_status_history` |
| **Audit Events** | `STK.STAKEHOLDER.CREATED`, `STK.DOCUMENT.UPLOADED`, `STK.STAKEHOLDER.SUBMITTED`, `STK.STAKEHOLDER.APPROVED` |

---

### UC-STK-002 — Detect and Resolve a Duplicate Supplier Entry

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Document Controller |
| **Preconditions** | "ABC Trading Co., Ltd." exists as `ACTIVE`. Actor holds `STK.CREATE` and `STK.EDIT`. |
| **Trigger** | A site engineer requests a new supplier "A.B.C. Trading" for a cement order. |
| **Frequency** | 3–8 per month |
| **Performance** | Duplicate check returns in under 400 ms |

**Main Success Scenario**

1. Actor begins creating a stakeholder of type `SUPPLIER_VENDOR` named "A.B.C. Trading".
2. System normalises the name to `abctrading`, strips the legal suffix, and runs trigram matching within the tenant.
3. System finds "ABC Trading Co., Ltd." at similarity 0.94, above the 0.85 threshold, and soft-blocks the save.
4. System displays the candidate with its type, status, registration number, and existing project assignments.
5. Actor recognises the same entity and selects **Use existing record**.
6. System discards the draft and opens the existing stakeholder in the detail panel.
7. Actor adds the new site engineer's contact person to the existing record instead.
8. System emits `STK.CONTACT.CREATED` and `STK.STAKEHOLDER.DUPLICATE_BLOCKED` (as a prevented-duplicate record).

**Alternate Flows**

- **A1 — Genuinely distinct entities.** At step 5 the actor selects **Confirm distinct**, enters a reason ("different legal entity, registration 00087654 vs 00012345"), and the record is created. The reason is stored and auditable.
- **A2 — Exact registration number match.** System hard-blocks with no override path and directs the actor to the existing record.

**Exception Flows**

- **E1 — Existing record is `BLACKLISTED`.** System hard-blocks and does not reveal the blacklist reason to roles without `STK.VIEW_DETAIL`. The attempt is flagged for Company Admin at `CRITICAL`.
- **E2 — Existing record is `SUSPENDED`.** System soft-blocks and shows the suspension reason. Actor is directed to resolve the suspension rather than create a parallel record.

| **Postconditions** | No duplicate created. Either the existing record is enriched, or a justified distinct record exists with a recorded reason. |
|---|---|
| **Business Rules** | BRL-STK-008, BRL-STK-018 |
| **Data Touched** | `stakeholders`, `stakeholder_contacts` |
| **Audit Events** | `STK.STAKEHOLDER.DUPLICATE_BLOCKED`, `STK.CONTACT.CREATED` |

---

### UC-STK-003 — Assign a Client with FINAL_APPROVE Authority

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Project Manager |
| **Preconditions** | Client stakeholder is `ACTIVE`. Project "Tower A" exists with a WBS tree. Actor holds `STK.ASSIGN_PROJECT`, `STK.SET_APPROVAL_AUTHORITY`, `STK.SET_ACCESS_SCOPE`. |
| **Trigger** | Project mobilisation; the approval matrix must exist before the first drawing is issued. |
| **Frequency** | Once per project |

**Main Success Scenario**

1. Actor opens the project's Stakeholders tab and selects **Assign Stakeholder**.
2. Actor selects the client organisation. System confirms `ACTIVE` status and no existing assignment.
3. Actor sets project role "Employer", discipline "All", contractual representative (the client's Project Director contact), start date, end date, and contract reference.
4. Actor sets approval authority `FINAL_APPROVE`, scoped to modules Document Control, Variation Order, and Progress Claim.
5. System requires a fallback approver for `FINAL_APPROVE`. Actor selects the client's Deputy PD contact assignment.
6. Actor sets access level. System offers only `LIMITED_ACCESS` and `READ_ONLY` because `CLIENT_OWNER` is an external type.
7. Actor selects `LIMITED_ACCESS` and chooses modules: Documents, Progress Reports, RFI, Variation Order, Progress Claim.
8. Actor leaves WBS scope unrestricted (client sees the whole project).
9. Actor enables responsibilities: `DOCUMENT_REVIEW`, `RFI_RESPONSE`, `PAYMENT_CERTIFICATION`.
10. System validates that `PAYMENT_CERTIFICATION` is permitted because authority is at least `APPROVE`.
11. Actor selects **Activate**. System runs the completeness gate, sets status `ACTIVE`, invalidates the resolution cache, and emits `STK.ASSIGNMENT.ACTIVATED` and `STK.AUTHORITY.CHANGED`.
12. System notifies the contractual representative and the Project Manager.

**Alternate Flows**

- **A1 — Authority scoped per entity type.** Actor sets `FINAL_APPROVE` for Variation Orders but `REVIEW_ONLY` for shop drawings. System stores both; resolution applies most-specific-wins.

**Exception Flows**

- **E1 — Actor attempts `FULL_ACCESS`.** Option is not rendered for external types; direct API attempt returns a validation error citing BRL-STK-006.
- **E2 — No fallback approver available.** System blocks activation and explains that `FINAL_APPROVE` requires a fallback to avoid a single point of workflow failure.
- **E3 — Gap simulation finds unroutable steps.** System warns that the "Client certification" step on the Fit-Out WBS branch has no eligible approver and records `STK.AUTHORITY.GAP_DETECTED`. Actor may proceed with acknowledgement; the gap appears as a defect on the Project Stakeholder Matrix.

| **Postconditions** | Client assignment is `ACTIVE` with recorded authority, scope, responsibilities, and fallback. Resolution service returns the client for the correct steps. |
|---|---|
| **Business Rules** | BRL-STK-001, BRL-STK-004, BRL-STK-005, BRL-STK-006 |
| **Data Touched** | `project_stakeholders`, `stakeholder_project_roles`, `stakeholder_approval_authorities`, `stakeholder_access_scopes`, `stakeholder_workflow_responsibilities` |
| **Audit Events** | `STK.ASSIGNMENT.CREATED`, `STK.AUTHORITY.CHANGED`, `STK.ACCESS.CHANGED`, `STK.ASSIGNMENT.ACTIVATED` |

---

### UC-STK-004 — Assign a Subcontractor Restricted to Building B01, Levels L01–L05

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Project Manager |
| **Preconditions** | Blockwork subcontractor is `ACTIVE` with current insurance. Project WBS contains B01 with levels L01–L20. |
| **Trigger** | Blockwork subcontract awarded for the podium levels only. |
| **Frequency** | 8–20 per project |

**Main Success Scenario**

1. Actor creates the assignment with role "Blockwork Subcontractor", discipline `ARC`, contract reference `TA-SC-011`.
2. Actor sets approval authority `NO_APPROVAL` — the subcontractor executes and submits but does not approve.
3. Actor sets access level `LIMITED_ACCESS` with modules: Tasks, Documents (issued only), Inspection Requests, Daily Reports.
4. Actor opens the WBS scope picker (SCR-STK-006), which renders the project WBS tree.
5. Actor selects node `B01` then deselects levels L06–L20, leaving L01–L05 checked.
6. System shows inherited descendant grants explicitly: each selected level's zones, rooms, and elements are highlighted as covered by inheritance.
7. Actor saves the scope. System collapses redundant descendant selections and stores five node grants.
8. Actor enables responsibilities `TASK_EXECUTION` and `PROCUREMENT_INVOLVEMENT`.
9. Actor activates. System emits `STK.WBS_SCOPE.CHANGED` and `STK.ASSIGNMENT.ACTIVATED`.
10. Later, a subcontractor user attempts to open a task on `B01-L07`. Access check evaluates WBS scope, finds no covering grant, and returns 404 with `STK.ACCESS.DENIED` logged.

**Alternate Flows**

- **A1 — Scope spans two buildings.** Actor adds `B02-L01` as an additional grant; the two grants are independent and neither implies the other.
- **A2 — Scope extended mid-project.** Actor adds L06–L08. System records before and after grant sets and invalidates the resolution cache.

**Exception Flows**

- **E1 — Node selected from a different project.** System rejects the grant with a validation error.
- **E2 — Ancestor selected by mistake.** Actor selects `Project` root, which would grant everything. System warns that this defeats the purpose of a subcontractor scope and requires explicit confirmation.
- **E3 — WBS node later deleted.** WBS Management queries this module before deletion, finds an active scope grant, and blocks the deletion.

| **Postconditions** | Subcontractor can see and act only within B01 L01–L05 and its descendants. |
|---|---|
| **Business Rules** | BRL-STK-006, BRL-STK-007 |
| **Data Touched** | `project_stakeholders`, `stakeholder_access_scopes`, `stakeholder_wbs_scopes`, `stakeholder_workflow_responsibilities` |
| **Audit Events** | `STK.ASSIGNMENT.CREATED`, `STK.ACCESS.CHANGED`, `STK.WBS_SCOPE.CHANGED`, `STK.ACCESS.DENIED` |

---

### UC-STK-005 — Provision an External Consultant Login and Verify Scope Enforcement

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Company Admin |
| **Secondary Actors** | Identity service, external consultant contact |
| **Preconditions** | Consultant assignment is `ACTIVE`. Contact has a valid email. Actor holds `STK.PROVISION_EXTERNAL_USER`. |
| **Trigger** | The consultant must begin reviewing structural submittals. |
| **Frequency** | 30–80 per project |

**Main Success Scenario**

1. Actor opens the assignment and selects **Provision external user** (SCR-STK-012).
2. Actor selects the contact and the external role `Consultant`.
3. System validates that the role is external and the assignment is `ACTIVE`.
4. System calls the identity service to create the user bound to the tenant, creates the link row, and emits `STK.EXTERNAL_USER.PROVISIONED`.
5. System sends a single-use invitation valid for 7 days.
6. Consultant accepts, sets a password, optionally enables MFA, and logs in.
7. On every request, the access check evaluates RBAC role ∩ assignment ∩ module scope ∩ WBS scope ∩ access level ∩ tenant.
8. Consultant sees only the Documents, RFI, and Design Review modules for Tower A, restricted to the STR discipline.
9. Consultant opens a structural submittal and records a review decision within their `REVIEW_ONLY` authority.

**Alternate Flows**

- **A1 — Contact already has a user on another project.** System reuses the identity and adds the new assignment scope rather than creating a second account.
- **A2 — Invitation expires.** Actor re-invites; a new single-use token is issued and the old one is dead.

**Exception Flows**

- **E1 — Consultant attempts to approve rather than review.** Authority is `REVIEW_ONLY`; the approve action is not rendered and a direct API call returns 403 with reason `INSUFFICIENT_AUTHORITY`.
- **E2 — Consultant attempts to open an ARC drawing.** Discipline scope excludes ARC; the record returns 404 and `STK.ACCESS.DENIED` is logged with failing dimension `discipline_scope`.
- **E3 — Consultant attempts to open a cost report.** Module scope excludes Account, and the document confidentiality tier is internal-commercial. Returns 404. Five such attempts within 10 minutes raise a `CRITICAL` notification to Company Admin.
- **E4 — Assignment terminated while the consultant is logged in.** Sessions are invalidated within one hour; the next request returns 401 and the link moves to `REVOKED`.

| **Postconditions** | Consultant has a working login constrained exactly to their contractual scope; every denial is logged. |
|---|---|
| **Business Rules** | BRL-STK-002, BRL-STK-006, BRL-STK-012, BRL-STK-016 |
| **Data Touched** | `stakeholder_user_links`, `stakeholder_access_scopes`, `project_stakeholders` |
| **Audit Events** | `STK.EXTERNAL_USER.PROVISIONED`, `STK.ACCESS.DENIED`, `STK.EXTERNAL_USER.REVOKED` |

---

### UC-STK-006 — Change Approval Authority With Items in Flight

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Project Manager |
| **Preconditions** | Consultant assignment holds `APPROVE` for Document Control. Four submittals are awaiting their decision. |
| **Trigger** | The client instructs that all structural submittals now require the consultant's Principal Engineer, not the review lead. |
| **Frequency** | 3–10 per project |

**Main Success Scenario**

1. Actor opens the assignment's Approval Authority screen (SCR-STK-005).
2. System displays the current authority and a warning that four items are in flight against it.
3. Actor changes the authority scope so that entity type `STR_SUBMITTAL` requires `FINAL_APPROVE` and reassigns it to the Principal Engineer's contact.
4. System requires a reason for the change while items are in flight. Actor enters it.
5. Actor saves. System writes the before and after authority to history, emits `STK.AUTHORITY.CHANGED`, and invalidates the resolution cache for the project.
6. Existing in-flight items retain their original routing so decisions already requested are not silently re-addressed.
7. Newly created submittals resolve to the Principal Engineer.
8. Both routings are visible on each item's audit timeline with the authority snapshot at the time of routing.

**Alternate Flows**

- **A1 — Actor also wants in-flight items re-routed.** Actor selects **Re-route in-flight items**; the system reassigns them, notifies both old and new approvers, and records the reassignment against each item.

**Exception Flows**

- **E1 — New authority produces a resolution gap on a WBS branch.** System runs the gap simulation, warns, and records `STK.AUTHORITY.GAP_DETECTED`.
- **E2 — Cache invalidation fails.** The 15-minute TTL ceiling bounds the exposure; the failure raises an ops alert and a `HIGH` severity audit entry.
- **E3 — Concurrent edit by the Discipline Manager.** Optimistic concurrency returns 409 with a field-level diff; the actor re-applies the change.

| **Postconditions** | Authority reflects the client's instruction; historical routing remains explainable. |
|---|---|
| **Business Rules** | BRL-STK-003, BRL-STK-004 |
| **Data Touched** | `stakeholder_approval_authorities`, assignment history |
| **Audit Events** | `STK.AUTHORITY.CHANGED`, `STK.AUTHORITY.GAP_DETECTED` |

---

### UC-STK-007 — Suspend a Supplier on Insurance Expiry

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | System (scheduled job) |
| **Secondary Actors** | Document Controller, Project Manager, Procurement Officer |
| **Preconditions** | Supplier is `ACTIVE` with a public liability insurance certificate expiring 2026-09-15. Insurance is mandatory for `SUPPLIER_VENDOR`. |
| **Trigger** | Nightly compliance expiry scan. |
| **Frequency** | Continuous; several per month per tenant |

**Main Success Scenario**

1. On 2026-07-17 (60 days out) the job flags the document and notifies the Document Controller at `Normal`.
2. On 2026-08-16 (30 days) it notifies again; on 2026-09-08 (7 days) the priority rises to `High` and the Procurement Officer is added.
3. Document Controller requests a renewed certificate from the supplier.
4. Supplier provides it on 2026-09-12; the Document Controller uploads it with new issue and expiry dates.
5. System supersedes the old certificate, re-indexes the expiry, and clears the alert.
6. No suspension occurs.

**Alternate Flows**

- **A1 — Renewal arrives after expiry.** The stakeholder is already `SUSPENDED`. On upload of a valid certificate the Document Controller may request reinstatement; the system verifies the suspension cause is cleared and allows the transition.

**Exception Flows**

- **E1 — No renewal by expiry.** At 2026-09-15 the job moves the stakeholder to `SUSPENDED`, emits `STK.STAKEHOLDER.SUSPENDED` and `STK.DOCUMENT.EXPIRED` at `Critical`, freezes all assignments, and notifies affected PMs and the Procurement Officer. New POs to this supplier are blocked.
- **E2 — Business-critical delivery in progress.** Company Admin records a time-boxed override with a reason and an expiry date not more than 90 days ahead. The override itself is audited and appears on the compliance report as an exception.
- **E3 — Job fails for a tenant.** The scheduler raises an ops alert. It never silently skips a tenant; the run is retried and the gap is reported.

| **Postconditions** | No `ACTIVE` stakeholder holds an expired mandatory document without a recorded, time-boxed override. |
|---|---|
| **Business Rules** | BRL-STK-010, BRL-STK-013 |
| **Data Touched** | `stakeholder_documents`, `stakeholders`, `stakeholder_status_history` |
| **Audit Events** | `STK.DOCUMENT.EXPIRING`, `STK.DOCUMENT.EXPIRED`, `STK.STAKEHOLDER.SUSPENDED` |

---

### UC-STK-008 — Blacklist a Subcontractor After Contract Default

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Project Director |
| **Preconditions** | Subcontractor abandoned site on Tower A. Termination notice served under the subcontract. Actor holds `STK.BLACKLIST`. |
| **Trigger** | Formal default determination by the commercial team. |
| **Frequency** | 1–4 per year per tenant |

**Main Success Scenario**

1. Actor opens the stakeholder and selects **Blacklist** (SCR-STK-011).
2. System requires a reason category (`CONTRACT_DEFAULT`), free-text reason, and an evidence reference (the termination notice document ID).
3. System requires a second confirmation: the actor re-types the organisation's legal name exactly.
4. Actor confirms. System sets status `BLACKLISTED`.
5. System terminates all assignments across all projects and lists open obligations per project for each PM to reassign.
6. System immediately revokes all external logins linked to this stakeholder.
7. System adds the normalised identity to the blacklist index.
8. System emits `STK.STAKEHOLDER.BLACKLISTED` at `CRITICAL` and notifies Company Admin, all affected PMs, and the Procurement Manager on in-app, email, and Telegram.
9. The register now shows the record with a red status chip and a blacklist banner in the detail panel.

**Alternate Flows**

- **A1 — Company Admin performs the action instead.** Identical flow; both roles hold the permission.
- **A2 — Blacklist later lifted.** With `STK.UNBLACKLIST`, justification, and two-step confirmation, the record moves to `INACTIVE`, never directly to `ACTIVE`. Re-verification through the registration approval flow is required before reuse.

**Exception Flows**

- **E1 — Typed name does not match.** Confirmation is rejected; no state change occurs.
- **E2 — Actor lacks the permission.** Action is not rendered; a direct API call returns 403 and logs a `HIGH` severity attempt.
- **E3 — Open IPC or payment in progress.** System warns that a payment is pending and requires the Project Director to acknowledge that blacklisting does not itself resolve outstanding commercial obligations, which remain with Account and Contract Administration.

| **Postconditions** | Stakeholder cannot be assigned anywhere in the tenant; open obligations are visible for reassignment; full critical audit trail exists. |
|---|---|
| **Business Rules** | BRL-STK-008, BRL-STK-009, BRL-STK-012, BRL-STK-014 |
| **Data Touched** | `stakeholders`, `stakeholder_blacklist_records`, `project_stakeholders`, `stakeholder_user_links`, `stakeholder_status_history` |
| **Audit Events** | `STK.STAKEHOLDER.BLACKLISTED`, `STK.ASSIGNMENT.TERMINATED` ×n, `STK.EXTERNAL_USER.REVOKED` ×n |

---

### UC-STK-009 — Attempt to Assign a Blacklisted Stakeholder

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Project Manager (different project) |
| **Preconditions** | The subcontractor from UC-STK-008 is `BLACKLISTED`. Actor is the PM of an unrelated project and holds `STK.ASSIGN_PROJECT`. |
| **Trigger** | The PM, unaware of the default, tries to award blockwork on Riverside Residences. |
| **Frequency** | Several times per year |

**Main Success Scenario**

1. Actor opens the project Stakeholders tab and searches for the subcontractor.
2. System returns the record with a red `BLACKLISTED` status chip.
3. Actor selects **Assign**. System blocks the action before any form is presented.
4. System displays the block reason and, because this actor holds `STK.VIEW_DETAIL`, the blacklist reason category and evidence reference.
5. System suggests contacting the Company Admin if the actor believes the blacklist is in error.
6. No assignment record is created. The attempt is audited.

**Alternate Flows**

- **A1 — Actor lacks `STK.VIEW_DETAIL`.** The block message is generic; the reason is withheld. The record is still blocked.
- **A2 — Actor attempts via bulk import.** The import validation report marks the row as rejected with reason `BLACKLISTED_STAKEHOLDER`; it is never committed.

**Exception Flows**

- **E1 — Actor attempts a direct API POST.** The API applies the same rule and returns 422 with error code `STAKEHOLDER_BLACKLISTED`. A `HIGH` severity audit entry records the attempt.
- **E2 — Actor registers the firm under a name variant.** Blacklist identity matching hard-blocks the registration and flags it to Company Admin at `CRITICAL` (see UC-STK-002 E1).

| **Postconditions** | No assignment exists. The attempt is traceable. |
|---|---|
| **Business Rules** | BRL-STK-008 |
| **Audit Events** | `STK.ASSIGNMENT.BLOCKED`, potentially `STK.STAKEHOLDER.BLACKLIST_MATCH_BLOCKED` |

---

### UC-STK-010 — Terminate an Assignment With Responsibility Handover

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Project Manager |
| **Preconditions** | MEP consultant assignment is `ACTIVE` and holds 3 open document reviews, 2 open RFIs, and 1 pending inspection sign-off. |
| **Trigger** | The consultant's appointment ends at design completion; a different consultant takes over for construction phase. |
| **Frequency** | 10–30 per project |

**Main Success Scenario**

1. Actor opens the assignment and selects **Terminate**, entering a reason and effective date.
2. System scans open obligations and blocks the termination, presenting all six items with type, reference, age, and due date.
3. Actor selects the incoming consultant's assignment as the transferee for all six items.
4. System validates that the transferee holds sufficient authority for each item type. The inspection sign-off requires `APPROVE`; the transferee holds it.
5. Actor confirms. System reassigns the items, notifies both parties, and records the handover map.
6. System sets the assignment to `TERMINATED`, revokes linked external logins within one hour, and invalidates the resolution cache.
7. System emits `STK.ASSIGNMENT.TERMINATED` and notifies the outgoing consultant's contractual representative.

**Alternate Flows**

- **A1 — Partial handover.** Actor transfers five items and, for one obsolete RFI, marks it orphaned with a reason. The orphan decision is audited and appears on the project exception report.
- **A2 — Assignment simply reaches its end date.** System notifies the PM 14 days ahead rather than auto-terminating; termination remains a deliberate act.

**Exception Flows**

- **E1 — Transferee lacks authority for one item type.** System rejects that transfer with an explanation and requires either a different transferee or an authority change first.
- **E2 — No suitable transferee exists on the project.** Termination is blocked. System recommends assigning the incoming consultant first, and raises `STK.RESOLUTION.NO_APPROVER` if the items would otherwise be unroutable.
- **E3 — External user remains active after one hour.** Nightly reconciliation revokes the orphaned login and raises a `HIGH` severity alert.

| **Postconditions** | No open obligation is left unowned. Access is revoked. History is intact. |
|---|---|
| **Business Rules** | BRL-STK-011, BRL-STK-012 |
| **Data Touched** | `project_stakeholders`, `stakeholder_user_links`, consuming module records |
| **Audit Events** | `STK.ASSIGNMENT.TERMINATED`, `STK.EXTERNAL_USER.REVOKED` |

---

### UC-STK-011 — Resolve the Approver for a Structural Shop Drawing

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Document Control module (system actor) |
| **Preconditions** | A shop drawing for `P001-B01-L05-Z03` is submitted for review. Resolution service is available. |
| **Trigger** | Document status moves to `Submitted`. |
| **Frequency** | Continuous — the highest-volume operation in the module |
| **Performance** | < 50 ms cached, < 200 ms cold, p95 |

**Main Success Scenario**

1. Document Control calls `resolveApprovers` with project, WBS node `B01-L05-Z03`, module `DOC`, entity type `STR_SHOP_DRAWING`, step `EXTERNAL_REVIEW`.
2. Service loads active assignments for the project.
3. Service filters to those with `DOCUMENT_REVIEW` responsibility enabled.
4. Service filters to those whose discipline scope includes `STR` or is unrestricted.
5. Service filters to those whose WBS scope covers `B01-L05-Z03` by direct grant or ancestor inheritance.
6. Service filters to those holding `APPROVE` or `FINAL_APPROVE` for module `DOC` and entity type `STR_SHOP_DRAWING`, applying most-specific-wins on overlapping scopes.
7. Service returns an ordered list: the structural consultant's review lead first, the client's representative as the `FINAL_APPROVE` step.
8. Document Control routes the drawing and stores the authority snapshot on the review record.
9. Service caches the result tagged by project and invalidation keys.

**Alternate Flows**

- **A1 — Cached result exists and no invalidating event has occurred.** The service returns from cache in under 50 ms.
- **A2 — Primary approver is `ON_HOLD`.** The service substitutes the defined fallback approver and marks the result as `via_fallback` so the audit timeline shows why.

**Exception Flows**

- **E1 — No eligible approver.** The service returns an explicit zero-approver error. The workflow step halts, `STK.RESOLUTION.NO_APPROVER` is emitted at `CRITICAL`, and the PM and Project Director are notified in-app, by email, and by Telegram. The document is **not** auto-approved and is **not** skipped.
- **E2 — Service unavailable.** Document Control fails closed: the submission is queued and the user is told the routing service is unavailable. No approval proceeds without resolution.
- **E3 — Stale cache after an authority change.** The invalidation event clears the tag. If invalidation fails, the 15-minute TTL bounds exposure and an ops alert is raised.

| **Postconditions** | The drawing is routed to a party with recorded authority, and the authority held at that moment is snapshotted on the record. |
|---|---|
| **Business Rules** | BRL-STK-002, BRL-STK-003, BRL-STK-007 |
| **Audit Events** | `STK.RESOLUTION.NO_APPROVER` on failure |

---

### UC-STK-012 — Resolve RFI Responder and Escalation Chain

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | RFI module (system actor) |
| **Preconditions** | An RFI is raised against `B01-L05` on an MEP sleeve coordination question. |
| **Trigger** | RFI created. |
| **Frequency** | 20–80 per project per month |

**Main Success Scenario**

1. RFI module calls `resolveNotificationRecipients` with event `RFI.CREATED` and context (project, WBS node, discipline `MEP`).
2. Service applies the recipient strategies in order: current approver, discipline role, project role, WBS responsible.
3. Service returns the MEP consultant's designated responder as primary, the Project Manager and Document Controller as informed parties.
4. Service also returns the escalation chain for the overdue path: responder → MEP Discipline Manager → Project Manager → Project Director.
5. RFI module issues the notification and schedules the escalation timers per the R0 notification matrix (same-day reminder, 1-day first escalation, 2-day final escalation).
6. Recipients with terminated assignments are excluded, and each exclusion is logged.

**Alternate Flows**

- **A1 — Multiple eligible responders.** All are returned; the RFI module assigns the first and copies the rest.
- **A2 — Responder is on approved delegation.** The delegate is returned in place of the delegator for the delegation period.

**Exception Flows**

- **E1 — No MEP responder assigned.** Zero-approver condition; the RFI cannot be routed. `STK.RESOLUTION.NO_APPROVER` is emitted at `CRITICAL` and the PM must assign an MEP consultant before the RFI can proceed.
- **E2 — Responder suspended mid-RFI.** In-flight escalation moves to the fallback; if none is defined, the chain escalates directly to the Project Manager with a critical notification.

| **Postconditions** | The RFI has a named responder with a defined escalation chain, all resolved from recorded assignments. |
|---|---|
| **Business Rules** | BRL-STK-002, BRL-STK-003 |
| **Audit Events** | `STK.RESOLUTION.NO_APPROVER` on failure |

---

### UC-STK-013 — Review Reliability Score Before Re-Engagement

| | |
|---|---|
| **Priority** | Should |
| **Primary Actor** | Project Director |
| **Preconditions** | The consultant has 14 months of recorded performance events. Actor holds `STK.VIEW_PERFORMANCE`. |
| **Trigger** | Tender stage for a new project; the estimating team proposes the same consultant. |
| **Frequency** | Per tender / per re-engagement decision |

**Main Success Scenario**

1. Actor opens the stakeholder detail panel and selects the Performance Tracking section (SCR-STK-010).
2. System displays average response time (18.4 days against a 14-day contractual SLA), approval delay, task completion rate, document turnaround compliance (71%), and a composite reliability score of 74%.
3. The score renders as a progress bar with an amber warning because it is below 80%.
4. Actor drills into the event ledger and sees that 62% of the delay is concentrated in a four-month window on one project.
5. Actor exports the performance summary for the tender review meeting.
6. The re-engagement decision is made with evidence, and the required response period is written into the new appointment.

**Alternate Flows**

- **A1 — Fewer than 10 events in the window.** The panel shows "insufficient data" rather than a misleading zero score.
- **A2 — Score above 80%.** The bar renders green with no warning.

**Exception Flows**

- **E1 — Actor attempts to edit the score.** Scores are computed, not editable; the API rejects any write attempt.
- **E2 — Nightly scoring job failed.** The panel shows the score with its computation timestamp and a staleness warning if older than 48 hours.

| **Postconditions** | The re-engagement decision is recorded against objective evidence. |
|---|---|
| **Business Rules** | BRL-STK-017 |
| **Data Touched** | `stakeholder_performance_scores`, `stakeholder_performance_events` |

---

### UC-STK-014 — Act on a Performance Threshold Breach

| | |
|---|---|
| **Priority** | Should |
| **Primary Actor** | Project Manager |
| **Preconditions** | A subcontractor's score crosses below 80% during the nightly computation. |
| **Trigger** | Threshold crossing. |
| **Frequency** | 2–6 per project per year |

**Main Success Scenario**

1. The scoring job detects the crossing and emits `STK.PERFORMANCE.THRESHOLD_BREACHED`.
2. System notifies the PM at `High` on in-app and email, once per crossing rather than per computation run.
3. PM opens the performance panel and reviews the contributing events.
4. PM issues a performance warning through the Subcontractor Management module, referencing the evidence.
5. The subcontractor improves; the score recovers above 80% and the warning state clears.

**Alternate Flows**

- **A1 — Score falls below 60% for two consecutive months.** The Project Director is notified and a suspension review is recommended, but suspension remains a human decision.

**Exception Flows**

- **E1 — Score is depressed by events outside the subcontractor's control (client-caused delay).** The PM records a note against the event ledger. Events are not deleted; the note provides context for review.

| **Postconditions** | Performance deterioration is acted on with evidence, not opinion. |
|---|---|
| **Audit Events** | `STK.PERFORMANCE.THRESHOLD_BREACHED` |

---

### UC-STK-015 — Filter and Export an Approved Stakeholder List

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Procurement Officer |
| **Preconditions** | Actor holds `STK.VIEW_LIST` and `STK.EXPORT`. |
| **Trigger** | Preparing an RFQ distribution list for structural steel. |
| **Frequency** | Weekly |

**Main Success Scenario**

1. Actor opens the register and selects type `SUPPLIER_VENDOR` from the left panel; the count shows 214.
2. Actor adds filters: status `ACTIVE`, compliance expiry not within 30 days, reliability score ≥ 80%.
3. System applies the filters and shows 47 results with active filter chips.
4. Actor searches "steel" against organisation name and approved trade categories; 9 results remain.
5. Actor exports to XLSX. Commercial-sensitive fields the role cannot see are excluded from the file, not blanked.
6. System generates the file, returns a signed URL, and emits `STK.STAKEHOLDER.EXPORTED` with the filter set and row count.

**Alternate Flows**

- **A1 — Export exceeds 10,000 rows.** The job runs asynchronously and notifies the actor on completion.

**Exception Flows**

- **E1 — No results.** The no-results state offers a one-click clear-filters action rather than showing a blank table.
- **E2 — Actor lacks `STK.EXPORT`.** The export control is not rendered; a direct API call returns 403 and is audited.

| **Postconditions** | A scoped, compliant supplier list exists, and the export itself is traceable. |
|---|---|
| **Audit Events** | `STK.STAKEHOLDER.EXPORTED` |

---

### UC-STK-016 — Add a Contact and Change the Primary Designation

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Document Controller |
| **Preconditions** | Stakeholder is `ACTIVE` with one primary contact. |
| **Trigger** | The consultant advises that their review lead has changed. |
| **Frequency** | 10–40 per project per month |

**Main Success Scenario**

1. Actor opens the stakeholder's Contact Management screen (SCR-STK-008).
2. Actor adds the new contact with name, position, discipline, email, mobile, Telegram, preferred channel, and language.
3. System validates the email format and its uniqueness within the stakeholder.
4. Actor designates the new contact as primary.
5. System atomically demotes the previous primary and promotes the new one.
6. Actor deactivates the departed contact.
7. System checks whether that contact is the sole active approver on any in-flight item.
8. No blocking items exist; the contact is soft-deactivated and historical workflow references remain intact.

**Alternate Flows**

- **A1 — Contact is also the contractual representative on an assignment.** System requires the representative to be reassigned on each affected assignment before deactivation.

**Exception Flows**

- **E1 — Contact is the sole active approver on two open submittals.** Deactivation is blocked; the open items are listed and must be reassigned first.
- **E2 — Actor attempts to remove the primary without designating a replacement.** Blocked with a clear message.
- **E3 — The contact has an active external login.** Deactivation triggers revocation of that login and emits `STK.EXTERNAL_USER.REVOKED`.

| **Postconditions** | Exactly one primary contact exists; no workflow history is lost; no orphaned access remains. |
|---|---|
| **Business Rules** | BRL-STK-012, BRL-STK-014 |
| **Audit Events** | `STK.CONTACT.CREATED`, `STK.CONTACT.PRIMARY_CHANGED`, `STK.CONTACT.DEACTIVATED` |

---

### UC-STK-017 — Upload and Track Compliance Document Expiry

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | Document Controller |
| **Preconditions** | Stakeholder exists. Actor holds `STK.EDIT`. |
| **Trigger** | Monthly compliance review, or a new document received. |
| **Frequency** | Daily |

**Main Success Scenario**

1. Actor opens the Compliance Document Register (SCR-STK-009).
2. System lists existing documents with type, reference, issue date, expiry date, and a colour-coded expiry indicator.
3. Actor uploads a renewed public liability insurance certificate with metadata.
4. System validates size, type, and that expiry is after issue date, then virus-scans the file.
5. System stores it at `tenant/{tenant_id}/stakeholders/{stakeholder_id}/` and marks the previous certificate as superseded.
6. System re-indexes the expiry and clears any active expiry alert.
7. Later, another user downloads the certificate via a 15-minute signed URL; the download is audited at `HIGH`.

**Alternate Flows**

- **A1 — Document has no expiry (e.g. company registration).** Expiry left blank; excluded from the expiry scan.

**Exception Flows**

- **E1 — File exceeds 25 MB.** Rejected with a clear message; other form data is preserved.
- **E2 — Virus detected.** File quarantined, upload aborted, Company Admin alerted at `CRITICAL`.
- **E3 — Storage unavailable.** Upload fails cleanly with a retry option; no partial record is created.
- **E4 — Cross-tenant document ID requested on download.** Returns 404, never 403, and logs a `CRITICAL` access-denied event.

| **Postconditions** | Current compliance documents are on file with tracked expiry, and access is auditable. |
|---|---|
| **Business Rules** | BRL-STK-013, BRL-STK-016 |
| **Audit Events** | `STK.DOCUMENT.UPLOADED`, `STK.DOCUMENT.DOWNLOADED` |

---

### UC-STK-018 — Client User Attempts to Open an Internal Cost Document

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | External Client User |
| **Preconditions** | Client assignment has `LIMITED_ACCESS` covering Documents, Progress Reports, RFI, VO, and Progress Claim, but not Account. |
| **Trigger** | The client user receives a document link from a colleague, referencing an internal cost-loaded BOQ. |
| **Frequency** | Several times per project |

**Main Success Scenario**

1. Client user opens the link.
2. The access check evaluates module scope (Account is not granted) and the document confidentiality tier (internal-commercial).
3. System returns 404 — existence is not disclosed — with a neutral "not found or not available to you" page.
4. System logs `STK.ACCESS.DENIED` at `HIGH` with failing dimension `module_scope` and `confidentiality_tier`.
5. No content, metadata, title, or file name is exposed.

**Alternate Flows**

- **A1 — Document is client-facing (an issued drawing).** Access is allowed; the client opens it normally.

**Exception Flows**

- **E1 — Five denials within 10 minutes from the same external user.** System raises a `CRITICAL` notification to Company Admin as a potential probing pattern.
- **E2 — Denial caused by misconfiguration rather than intent.** Company Admin reviews the access review report, corrects the module scope, and the correction is itself audited as `STK.ACCESS.CHANGED`.

| **Postconditions** | No commercial exposure. The denial is evidence, not a silent failure. |
|---|---|
| **Business Rules** | BRL-STK-006, BRL-STK-016 |
| **Audit Events** | `STK.ACCESS.DENIED` |

---

### UC-STK-019 — Cross-Tenant Access Attempt Is Blocked

| | |
|---|---|
| **Priority** | Must |
| **Primary Actor** | A user of Tenant A (deliberate or by misconfiguration) |
| **Preconditions** | Tenant A and Tenant B both operate on the platform. RLS is enabled on all 15 tables. |
| **Trigger** | A request carrying a Tenant B stakeholder ID with a Tenant A JWT. |
| **Frequency** | Should be zero; tested continuously |

**Main Success Scenario**

1. The user issues `GET /api/v1/stakeholders/{tenant_b_stakeholder_id}`.
2. The API extracts `tenant_id` from the JWT claim only, never from the request body or a header the client controls.
3. The database session sets `app.tenant_id` from that claim.
4. Row-level security filters the query; zero rows are returned.
5. The API returns 404, not 403, so the existence of the record is not confirmed.
6. System logs `STK.ACCESS.DENIED` at `CRITICAL` with the attempted resource, the acting tenant, and the correlation ID.
7. Company Admin and the security owner are notified.

**Alternate Flows**

- **A1 — Super Admin legitimate cross-tenant access.** Requires explicit impersonation, which creates a `CRITICAL` audit entry naming the target tenant and the reason. Silent cross-tenant reads are not possible.

**Exception Flows**

- **E1 — Tenant ID supplied in the request body.** It is ignored entirely. If it conflicts with the JWT claim, the request is rejected at `CRITICAL`.
- **E2 — A background job runs without tenant scope.** The job is rejected at start-up; jobs must be tenant-scoped by construction. This is verified by an automated test in the CI pipeline.
- **E3 — RLS accidentally disabled by a migration.** The deployment verification query fails and the release is blocked before traffic is admitted.

| **Postconditions** | No cross-tenant data is returned or inferred. The attempt is recorded at critical severity. |
|---|---|
| **Business Rules** | BRL-STK-016 |
| **Audit Events** | `STK.ACCESS.DENIED` (CRITICAL) |

---

### UC-STK-020 — Bulk Import Stakeholders With Validation Report

| | |
|---|---|
| **Priority** | Should |
| **Primary Actor** | Company Admin |
| **Preconditions** | A legacy project directory spreadsheet with 480 rows. Actor holds `STK.CREATE`. |
| **Trigger** | Migration from spreadsheets at go-live. |
| **Frequency** | Once per tenant onboarding; occasionally per project |

**Main Success Scenario**

1. Actor opens Bulk Import (SCR-STK-013) and downloads the template.
2. Actor maps the legacy columns to the template and uploads the file.
3. System parses the file and runs a **dry run** — no writes occur.
4. System validates every row: required fields, type codes, email format, date formats, and duplicate detection against both the tenant register and other rows in the file.
5. System produces a validation report: 402 valid, 61 duplicates of existing records, 12 internal duplicates within the file, 5 invalid rows with row numbers and reasons.
6. Actor corrects the source file and re-runs the dry run until only intended rows remain.
7. Actor commits. System creates all records in `DRAFT` status only, inside a transaction.
8. System produces a reconciliation report of created, skipped, and failed rows, and emits `STK.STAKEHOLDER.CREATED` per created row.
9. Records are verified individually through the normal registration approval flow before any becomes `ACTIVE`.

**Alternate Flows**

- **A1 — Actor accepts merging duplicates into existing records.** Contacts from duplicate rows are appended to the matched existing stakeholder instead of creating new organisations.

**Exception Flows**

- **E1 — File exceeds row or size limits.** Rejected before parsing with guidance to split the file.
- **E2 — A row matches a blacklisted identity.** Rejected with reason `BLACKLISTED_STAKEHOLDER`; never committed.
- **E3 — Transaction fails mid-commit.** The entire batch rolls back; nothing is partially created. The failure reason is reported per row.
- **E4 — Actor attempts to import directly to `ACTIVE`.** Not possible; imported records always land in `DRAFT`.

| **Postconditions** | Legacy data is in the system as unverified drafts, with a full reconciliation record. No unverified record is usable in a workflow. |
|---|---|
| **Business Rules** | BRL-STK-008, BRL-STK-018 |
| **Audit Events** | `STK.STAKEHOLDER.CREATED` ×n |

---

## 4. Real-World Scenario Walkthroughs

### 4.1 Tower A Mobilisation — Week One

Tower A is a 22-storey mixed-use development in Phnom Penh, awarded to the contractor on a lump-sum contract with a 26-month programme. Construction start is 14 working days after award.

**Day 1.** The Project Manager opens a new project in DCOS and generates the WBS to level depth: Project → B01 → L01–L22 → Zones → Rooms. The register is empty for this project.

**Day 2–3.** The Document Controller registers the client, the PMC, and four design consultants (ARC, STR, MEP, Civil). Two of the four already exist in the tenant register from a previous project and are reused rather than recreated — duplicate detection catches the third attempt where "Angkor Design Group" was about to be entered again as "Angkor Design Grp." Each new organisation requires a trade licence and professional indemnity certificate before it can leave `DRAFT`. One consultant's PI certificate expires in 40 days; the system flags it immediately, and the Document Controller requests the renewal in the same week rather than discovering it in month three.

**Day 4.** The Project Manager assigns each party. The client gets `FINAL_APPROVE` on variations and progress claims with the client's Deputy PD as fallback. The PMC gets `APPROVE` on drawings and inspections. The structural consultant gets `APPROVE` on structural submittals only — its authority is scoped by discipline so it cannot approve architectural finishes. Each assignment requires a fallback approver before it will activate; the PM discovers at this point that the MEP consultant has proposed only one named reviewer, and asks for a second.

**Day 5–7.** Six subcontractors and twenty-two suppliers are registered and assigned. The blockwork subcontractor is scoped to B01 L01–L05; the curtain wall subcontractor to B01 L06–L22. Neither can see the other's tasks, inspections, or documents.

**Day 8.** The PM opens the Project Stakeholder Matrix. Three defects appear: no approver is configured for the "Fit-out material approval" step on the L18–L22 branch; the fire authority has no assigned representative; and one supplier's insurance expires before the first delivery date. All three are resolved before construction start.

**Day 10.** External logins are provisioned for the client, PMC, and four consultants. Invitations expire in seven days; two are re-issued after the recipients miss them.

**Day 14.** The first structural drawing is issued for review. Document Control calls the resolution service. It returns the structural consultant's review lead, then the PMC, then the client. The drawing routes correctly on its first attempt. No email chain, no phone call, no guessing.

The difference from the previous project is measurable: mobilisation setup completed in eight working days rather than four weeks, and the approval matrix was complete before the first document moved rather than three months into construction.

---

### 4.2 The Consultant Approval Bottleneck

By month nine, the structural consultant's review lead is the only person configured with `APPROVE` on structural submittals. He takes four weeks' leave without notifying the contractor.

**Week 1.** Six submittals are routed to him. None move. The notification engine issues same-day reminders.

**Week 2.** Escalation timers fire. The MEP and structural discipline managers are notified. The RFI overdue chain escalates to the Project Manager. The submittal aging report on the project dashboard turns red.

The critical detail: the system did not auto-approve, did not skip the step, and did not silently route to somebody else. The items halted visibly, and the escalation chain made the halt somebody's problem within 24 hours.

**Week 2, Day 3.** The Project Manager opens the assignment and finds no fallback approver was ever configured — the activation gate had been satisfied because at the time of setup the authority was `APPROVE` and the gate had a warning rather than a hard block for fallbacks on non-final authority. The PM configures the consultant's Principal Engineer as fallback and re-routes the six in-flight items.

**Week 3.** The consultant's firm confirms the Principal Engineer as the standing deputy. The PM records a formal delegation with an end date.

**Month 14.** The contractor submits an extension-of-time claim. Nineteen days of critical-path delay are attributed to late structural submittal approval. The evidence is not a reconstruction from email: it is the audit trail showing, for each of the six submittals, the exact submission time, the routed approver, the authority level that party held at that moment, every reminder and escalation issued, and the eventual decision time. The consultant disputes two of the nineteen days; the audit record settles it in one meeting rather than three.

The lesson recorded in Lessons Learned: **fallback approvers must be a hard activation gate for all approval-bearing authorities, not just `FINAL_APPROVE`.** This becomes a change request against FR-STK-033.

---

### 4.3 Subcontractor Default and the Name-Variant Attempt

The finishing subcontractor on Tower A, "Mekong Interior Solutions Co., Ltd.", stops attending site in month 17 with 62% of its scope complete and two IPCs outstanding.

**Day 1.** The commercial team serves a termination notice under the subcontract. The Contract Administration module records the notice; the stakeholder record is referenced as the counterparty.

**Day 2.** The Project Manager terminates the assignment. The system blocks the termination and lists 14 open obligations: 8 tasks, 3 inspection requests, 2 material approval requests, and 1 open RFI response. The PM reassigns 11 items to the replacement subcontractor and to the internal finishing team, and marks 3 obsolete items as orphaned with a reason.

**Day 2, one hour later.** All four of the subcontractor's external logins are revoked. Their site engineer, who still had a laptop with an open session, is logged out on the next request.

**Day 5.** The Project Director blacklists the organisation with reason category `CONTRACT_DEFAULT` and the termination notice as the evidence reference. Two-step confirmation requires re-typing the legal name. All assignments across all projects — there was one other, on a small fit-out job — terminate automatically. The Procurement Manager receives a critical notification.

**Month 19.** A Project Manager on a different project receives a competitive quotation from "Mekong Interiors (Cambodia) Ltd." at an attractive rate. She attempts to register it. Normalised identity matching strips the legal suffix and the parenthetical, producing a 0.91 similarity against the blacklisted record. The registration is hard-blocked and flagged to Company Admin at critical severity.

Company Admin investigates and confirms the same directors and the same registered address. The firm is not registered.

Without the blacklist index and identity normalisation, this would have been a fresh supplier record, a new award, and a repeat of the same default — with the contractor having paid twice for the same lesson.

---

### 4.4 The Client Audit, Eighteen Months Later

Tower A reaches practical completion. During final account negotiation, the client's quantity surveyor challenges a concrete pour on B01-L07-Z02, alleging it was placed without a valid inspection approval and that the associated 4,200 m³ of concrete should be re-measured at a reduced rate.

Under the old process, the contractor's response would have taken three days: searching a shared drive for the inspection request PDF, an email thread to establish who signed it, and a phone call to a QA inspector who left the company a year ago.

**In DCOS the response takes four minutes.**

The QS opens the inspection record and its Activity tab. The audit timeline shows: the inspection request raised by the site engineer at 08:14; routed by the resolution service to the PMC's QA representative; the authority snapshot recorded at routing time showing that party held `APPROVE` for module `QAQC`, entity type `INSPECTION_REQUEST`, scoped to B01, on that date; the inspection result recorded as Passed at 11:32 with three photographs; and the approval decision with the approver's name, role, and department as they were on that date — not as they are today, since that individual has since changed role.

The QS also produces the stakeholder assignment record showing the PMC's engagement dates covering that period, and the compliance document register showing the PMC's professional indemnity certificate was current on the pour date.

The challenge is withdrawn in the same meeting. The evidence was not assembled after the fact; it was recorded as a by-product of the work being done correctly.

This is the entire commercial argument for the module in one paragraph: **the register is not administrative overhead, it is the contractor's evidence base.**

---

## 5. Traceability Matrix

| Use Case | Functional Requirements | Business Requirements | Business Rules |
|---|---|---|---|
| UC-STK-001 | FR-STK-007, 008, 010, 011, 015, 016, 018 | BR-STK-001, 003, 012 | BRL-STK-014, 015, 018 |
| UC-STK-002 | FR-STK-008, 012, 013 | BR-STK-002, 015 | BRL-STK-008, 018 |
| UC-STK-003 | FR-STK-023, 025, 031, 033, 036, 037, 042 | BR-STK-004, 005, 007 | BRL-STK-001, 004, 005, 006 |
| UC-STK-004 | FR-STK-023, 036, 037, 038, 039, 042 | BR-STK-008 | BRL-STK-006, 007 |
| UC-STK-005 | FR-STK-039, 045, 046, 047, 064 | BR-STK-016 | BRL-STK-002, 006, 012 |
| UC-STK-006 | FR-STK-026, 031, 034, 063, 065 | BR-STK-005, 019 | BRL-STK-003, 004 |
| UC-STK-007 | FR-STK-020, 021, 049, 050 | BR-STK-012, 013 | BRL-STK-010, 013 |
| UC-STK-008 | FR-STK-028, 029, 051, 052 | BR-STK-014 | BRL-STK-008, 009, 012 |
| UC-STK-009 | FR-STK-023 | BR-STK-014, 015 | BRL-STK-008 |
| UC-STK-010 | FR-STK-028, 029, 044 | BR-STK-020 | BRL-STK-011, 012 |
| UC-STK-011 | FR-STK-060, 062, 063, 065 | BR-STK-010, 011, 019 | BRL-STK-002, 003, 007 |
| UC-STK-012 | FR-STK-061, 062 | BR-STK-010, 011 | BRL-STK-002, 003 |
| UC-STK-013 | FR-STK-056, 057 | BR-STK-017 | BRL-STK-017 |
| UC-STK-014 | FR-STK-058 | BR-STK-018 | BRL-STK-017 |
| UC-STK-015 | FR-STK-002, 004, 006 | BR-STK-001 | BRL-STK-016 |
| UC-STK-016 | FR-STK-015, 016, 017 | BR-STK-003 | BRL-STK-012, 014 |
| UC-STK-017 | FR-STK-018, 020, 022 | BR-STK-012 | BRL-STK-013, 016 |
| UC-STK-018 | FR-STK-039, 040, 064 | BR-STK-007 | BRL-STK-006, 016 |
| UC-STK-019 | FR-STK-039, 064 | BR-STK-021 | BRL-STK-016 |
| UC-STK-020 | FR-STK-066, 067 | BR-STK-023 | BRL-STK-008, 018 |

---

## 6. Open Questions

| ID | Question | Raised By |
|---|---|---|
| Q-10 | Should fallback approvers be a hard gate for `APPROVE`, not only `FINAL_APPROVE`? (Scenario 4.2) | Project Manager |
| Q-11 | Should orphaned obligations at termination require Project Director sign-off rather than PM? | Project Director |
| Q-12 | What is the correct notification threshold for repeated external access denials — 5 in 10 minutes, or lower? | Company Admin |

---

## 7. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1.0 | 2026-08-08 | Initial issue — 20 use cases, 4 scenario walkthroughs | Business Analyst |

---

**End of Document**
