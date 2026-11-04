# 01 — Business Requirement Document
## DCOS Stakeholder Management Module

| Field | Value |
|---|---|
| Document Code | DCOS-STK-BRD-001 |
| Module | Stakeholder Management (Module 04 — Foundation) |
| Version | R1.0 |
| Status | Issued for Review |
| Author Role | Construction Operations Consultant |
| Date | 2026-08-08 |
| Related Documents | DCOS-ARCH-001 (R0 Architecture), DCOS-ARCH-GAP-001 (R1 Gap Analysis), standards/stakeholder-module-standard.md |

---

## 1. Purpose and Business Objective

The Stakeholder Management module is the **responsibility control panel** of the Digital Construction Operating System. It is the authoritative record of every organisation and person involved in a project, what they are permitted to do, what they are accountable for, and how they have performed.

Every workflow in DCOS — task assignment, drawing review, RFI response, inspection sign-off, purchase order issue, payment certification — must resolve an actor before it can move. That resolution happens here. If the stakeholder record is wrong, the workflow routes to the wrong person, stalls silently, or is approved by somebody with no authority to approve it.

The module exists to answer four questions on every record in the platform:

1. **Who is responsible** for this scope of work?
2. **Who approves** this document, task, RFI, inspection, or purchase?
3. **Who executes** the work?
4. **Who is accountable** when it fails?

### 1.1 What This Module Is Not

| It is not | Reason |
|---|---|
| A contact list | A contact list stores names. This module stores authority, scope, and accountability. |
| A CRM | There is no sales pipeline, no lead scoring, no opportunity management. |
| A supplier prequalification system | Prequalification is Module 17. This module consumes the PQ result, it does not run the PQ process. |
| A subcontract management system | Subcontract commercials, sub-BOQ, sub-IPC, and back-charges are Module 19. |
| An HR system | Employee records, payroll, and attendance are Module 41. Internal departments appear here as stakeholders; internal people do not. |

---

## 2. Business Context

A mid-size Cambodian contractor running four concurrent projects typically deals with, per project: one client, one project management consultant, three to five design consultants, one to three regulatory authorities, two to four utility authorities, eight to twenty subcontractors, and thirty to eighty suppliers. That is 50–110 organisations and 150–400 named individuals per project, changing continuously over a 24–36 month programme.

Today that information lives in a project directory spreadsheet maintained by whichever engineer last updated it, a set of Telegram groups created ad hoc, a contact list in the Project Manager's phone, and the memory of the Document Controller. None of these are connected to the workflows that depend on them.

The consequence is not administrative untidiness. It is commercial loss: approvals given by people without authority, drawings issued to the wrong consultant, RFIs sent to a person who left the consultant's firm four months ago, subcontractor claims with no record of what scope was assigned to whom, and time-barred entitlements missed because nobody could prove when a notice was served and to whom.

---

## 3. Problem Statement

### 3.1 Named Pain Points

| # | Pain Point | What Actually Happens | Construction Consequence | Typical Impact |
|---|---|---|---|---|
| P-01 | No authoritative record of who may approve what | A junior consultant engineer signs a structural shop drawing approval. The consultant's firm later disowns it. | Rework of executed structural work; dispute over liability | 2–6 weeks delay, USD 15k–80k rework |
| P-02 | Contact information lives outside the system | RFI sent to a consultant reviewer who resigned three months ago; no bounce, no response | RFI ages past contractual response period; design decision blocked | 10–25 days per occurrence on critical path items |
| P-03 | Approval chains defined verbally at kick-off, never recorded | Six months in, nobody agrees who the second reviewer for MEP submittals was supposed to be | Submittal backlog, procurement cannot release long-lead items | Procurement slip of 3–8 weeks |
| P-04 | No access control on external parties | Client's representative receives an internal cost-loaded drawing package by email transmittal | Commercial exposure during variation negotiation | Direct margin loss, unquantifiable |
| P-05 | Subcontractor scope not recorded against WBS | Two subcontractors both claim they were assigned Level 5 blockwork; both invoice | Duplicate payment or disputed deduction | USD 5k–40k per event |
| P-06 | No record of assignment start and end dates | Terminated subcontractor's site staff still hold access badges and system logins for weeks | Security and safety exposure; unauthorised site presence | Regulatory and insurance risk |
| P-07 | No supplier compliance tracking | Supplier's public liability insurance lapsed; discovered only after an incident on site | Uninsured loss; client contra-charge | USD 20k+ and reputational damage |
| P-08 | No performance history | The same consultant that took 45 days to answer RFIs on the last project is re-engaged at the same fee | Repeated programme damage with no institutional learning | Recurring 15–30% RFI cycle-time overrun |
| P-09 | No traceability for audit or claim | Client auditor asks who approved a concrete pour inspection 18 months ago; answer requires three days of searching emails | Weak claim position; failed ISO 9001 surveillance audit | Certification risk; claim value written down |
| P-10 | Duplicate organisation records | "ABC Trading", "ABC Trading Co Ltd", and "A.B.C. Trading" exist as three suppliers | Split spend data; blacklisted firm re-enters through a name variant | Procurement control failure |

### 3.2 Root Cause

All ten pain points share one root cause: **responsibility is communicated but not recorded, and the systems that consume responsibility have no authoritative source to query.**

---

## 4. Business Goals and Measurable Objectives

| ID | Goal | Measurable Objective | Baseline | Target |
|---|---|---|---|---|
| G-01 | Establish a single authoritative responsibility register | % of platform workflow approvals traceable to an assigned stakeholder with a recorded authority level | 0% | 100% |
| G-02 | Eliminate unauthorised approvals | Count of approvals executed by a party without recorded `APPROVE` or `FINAL_APPROVE` authority | Unknown | 0 |
| G-03 | Reduce workflow routing failures | RFIs and submittals routed to an inactive or departed recipient | ~12% of items | < 1% |
| G-04 | Control external party exposure | External parties with access beyond their contractual scope | Unmeasured | 0, verified quarterly |
| G-05 | Enforce compliance currency | Active stakeholders with an expired mandatory compliance document | Unknown | 0, with 30-day advance alerting |
| G-06 | Build institutional performance memory | % of consultants and subcontractors with a 12-month rolling reliability score at re-engagement decision | 0% | 100% after 12 months of operation |
| G-07 | Reduce mobilisation setup time | Time to complete full stakeholder and approval matrix setup for a new project | 3–4 weeks, incomplete | 5 working days, complete |
| G-08 | Support claim and audit response | Time to produce a full responsibility and authority audit trail for any historical approval | 2–3 days | Under 5 minutes |
| G-09 | Eliminate duplicate master data | Duplicate organisation records in the tenant register | Estimated 8–15% | < 1% |
| G-10 | Guarantee tenant isolation | Cross-tenant stakeholder data exposure incidents | N/A | 0, verified by automated CI test |

---

## 5. Scope

### 5.1 In Scope

| Area | Included Capability |
|---|---|
| Stakeholder register | Organisation profile, classification by type, status lifecycle, de-duplication |
| Contact management | Multiple contacts per organisation, primary contact, role, communication and language preference |
| Compliance documents | Trade licence, tax certificate, insurance, ISO certificates, PQ certificate — with expiry tracking |
| Project assignment | Assign an organisation to a project with role, discipline, and engagement dates |
| Approval authority | Approval level per assignment, optionally per module and per value threshold |
| Access control | Access level, module scope, WBS-node restriction, document confidentiality tier |
| Workflow responsibility | Participation toggles for task execution, document review, RFI response, inspection approval, procurement, payment certification, safety oversight, design coordination |
| External user provisioning | Link a stakeholder contact to a restricted platform login, with revocation |
| Performance tracking | Response time, approval delay, task completion rate, document turnaround, composite reliability score |
| Status governance | Draft, pending approval, active, suspended, inactive, blacklisted — with mandatory reason and audit |
| Responsibility resolution service | The platform-wide service that answers "who approves this?" and "may this user see this?" |

### 5.2 Out of Scope

| Excluded Capability | Owning Module | Interface Held Here |
|---|---|---|
| Supplier prequalification process | Module 17 | `pq_status`, `pq_expiry_date` mirrored read-only |
| Subcontract commercials, sub-IPC, back-charges, retention | Module 19 | Counterparty reference by `stakeholder_id` |
| Head contract administration, employer's instructions, notices, time bars | Module 35 | Client stakeholder is the notice recipient |
| Supplier and subcontractor payment, AP/AR | Module 42 | Payee master reference |
| Document transmittal generation and external issue | Module 37 | This module defines *who may receive*; transmittal executes the issue |
| Platform identity, password, MFA, session management | Module 02 | Contact-to-user link only |
| Employee master, payroll, attendance | Module 41 | Internal departments only, not internal individuals |

---

## 6. Stakeholder Analysis of the Module

| Party | Interest | Interaction |
|---|---|---|
| Company Admin | Owns the master register and tenant-wide governance | Approves registrations, blacklists, sets performance weights |
| Project Director | Portfolio-level responsibility assurance | Reviews performance, approves blacklists, receives escalations |
| Project Manager | Needs the right approvers assigned before work starts | Creates and terminates project assignments, sets authority |
| Document Controller | Daily operator of the register | Maintains records, uploads compliance documents, runs expiry reviews |
| Discipline Manager | Needs correct reviewers for their discipline | Configures discipline-scoped responsibility |
| Procurement Officer | Needs eligible, non-blacklisted, PQ-current suppliers | Checks eligibility before RFQ |
| QS Engineer | Needs payment certification authority defined | Consumes authority resolution at IPC certification |
| Site Supervisor | Needs to know who to call on site | Reads the mobile directory |
| External Consultant / Client | Must review and approve within a defined scope | Logs in with restricted access |
| Subcontractor / Supplier | Must see only their own scope | Logs in with WBS-restricted or record-restricted access |
| Internal Auditor / Client Auditor | Needs traceability | Consumes audit trail and historical authority snapshots |

---

## 7. Business Requirements

Priority: **M** = Must have (MVP), **S** = Should have (Phase 2), **C** = Could have (Phase 3).

| ID | Requirement | Priority | Rationale | Acceptance Measure |
|---|---|---|---|---|
| BR-STK-001 | The system shall maintain a single tenant-wide register of stakeholder organisations, classified by stakeholder type. | M | P-10 — fragmented records split spend and defeat blacklisting | One record per legal entity per tenant; duplicate rate below 1% at quarterly audit |
| BR-STK-002 | The system shall prevent creation of a duplicate stakeholder organisation within a tenant using normalised name and registration number matching. | M | P-10 | Duplicate creation attempt is blocked and the existing record is offered |
| BR-STK-003 | The system shall support multiple contact persons per stakeholder organisation, with exactly one designated primary contact. | M | P-02 — single-contact records fail when a person leaves | Every active stakeholder has at least one contact; exactly one is primary |
| BR-STK-004 | The system shall record a stakeholder's engagement to a project as a distinct, dated assignment, separate from the organisation record. | M | P-06 — the same firm may be engaged on several projects with different roles | Assignment holds project, role, discipline, start date, end date, status |
| BR-STK-005 | The system shall require an explicit approval authority level on every active project assignment. | M | P-01 — verbal authority cannot be enforced | No assignment can reach `ACTIVE` with a null approval level |
| BR-STK-006 | The system shall prevent any approval action by a party that does not hold `APPROVE` or `FINAL_APPROVE` authority on that project for that workflow. | M | P-01, G-02 | Zero unauthorised approvals recorded |
| BR-STK-007 | The system shall restrict every external stakeholder to limited or read-only access; external parties shall never hold full access. | M | P-04 — internal commercial data exposure | No external assignment can be saved with full access |
| BR-STK-008 | The system shall support restricting a stakeholder's access to named WBS nodes, with inheritance to descendant nodes. | M | P-05 — subcontractor scope must be bounded by location | A subcontractor scoped to Building B01 / L01–L05 cannot open records on L06 |
| BR-STK-009 | The system shall record which workflow responsibilities each assignment participates in. | M | P-03 — undefined participation causes routing failure | Each active assignment has at least one responsibility toggle enabled |
| BR-STK-010 | The system shall provide a resolution service that returns the correct approver, reviewer, or notification recipient for any project, WBS node, module, and workflow step. | M | G-01 — consuming modules must not guess | All consuming modules resolve through the service; no direct table queries |
| BR-STK-011 | The system shall raise a critical alert when a workflow resolution returns no eligible approver, and shall never silently pass the step. | M | P-03 — silent stalls are the most damaging failure mode | Zero-approver condition produces a critical notification within 3 seconds |
| BR-STK-012 | The system shall register compliance documents against a stakeholder with an expiry date and shall alert responsible users in advance of expiry. | M | P-07 — lapsed insurance is discovered after the incident | Alert at 60, 30, and 7 days before expiry; suspension at expiry for mandatory documents |
| BR-STK-013 | The system shall support suspending a stakeholder, with a mandatory reason, blocking new assignments while preserving history. | M | P-07, P-06 | Suspended stakeholder cannot be newly assigned; existing assignments freeze |
| BR-STK-014 | The system shall support blacklisting a stakeholder tenant-wide, with a mandatory reason and two-step confirmation, blocking assignment on all projects. | M | P-10 — a defaulting firm must not reappear elsewhere | Assignment attempt is blocked on every project with the blacklist reason displayed |
| BR-STK-015 | The system shall block registration of a new organisation whose normalised identity matches an existing blacklisted record. | S | P-10 — name variants defeat blacklists | Name-variant registration attempt is blocked and flagged for admin review |
| BR-STK-016 | The system shall provision restricted platform logins for external stakeholder contacts and shall revoke them when the assignment terminates. | M | P-06 — access outliving engagement | Access revoked within 1 hour of assignment termination |
| BR-STK-017 | The system shall record objective performance events and compute a rolling reliability score per stakeholder. | S | P-08 — re-engagement decisions need evidence | Score available for every stakeholder with 90 days of activity |
| BR-STK-018 | The system shall warn when a stakeholder's reliability score falls below 80% and escalate below 60% for two consecutive months. | S | P-08 | Notification issued to Project Manager and Project Director respectively |
| BR-STK-019 | The system shall preserve a point-in-time snapshot of the acting party's role and authority level on every workflow action. | M | P-09 — authority changes over time; audit needs the state at the time of action | Historical audit query returns the authority held on the action date, not today's |
| BR-STK-020 | The system shall require a documented handover of open responsibilities before an assignment can be terminated. | M | P-06 — terminated parties leave orphaned open items | Termination is blocked until open items are reassigned or explicitly accepted as orphaned by the PM |
| BR-STK-021 | The system shall enforce tenant isolation such that no user can read, infer, or reference stakeholder data belonging to another tenant. | M | G-10 — multi-tenant commercial liability | Automated cross-tenant leak tests pass in every CI run |
| BR-STK-022 | The system shall log every create, change, status transition, authority change, access change, and export action to the audit trail. | M | P-09, G-08 | 100% of state changes produce an audit entry with before and after values |
| BR-STK-023 | The system shall support bulk import of stakeholders from spreadsheet with dry-run validation and a reconciliation report. | S | Mobilisation and legacy migration | 500-row import validated and reported before commit |
| BR-STK-024 | The system shall provide a project stakeholder matrix view showing all parties, roles, authorities, and responsibilities on one project. | M | P-03, G-07 | Matrix printable and exportable for the project kick-off record |
| BR-STK-025 | The system shall provide a read-only stakeholder directory on mobile, available offline. | S | Site teams need contacts without connectivity | Directory cached and searchable with no network |

---

## 8. Business Rules

| ID | Rule | Enforcement Point |
|---|---|---|
| BRL-STK-001 | A stakeholder organisation must exist and be `ACTIVE` before it can be assigned to a project. | Assignment creation |
| BRL-STK-002 | A stakeholder must have an active project assignment before it can participate in any workflow on that project. | Workflow resolution |
| BRL-STK-003 | An approval step cannot proceed without at least one assigned party holding `APPROVE` or `FINAL_APPROVE` for that project, module, and step. | Approval Workflow Engine |
| BRL-STK-004 | Approval authority must never be null on an assignment in `ACTIVE` status. | Assignment activation |
| BRL-STK-005 | No duplicate stakeholder assignment may exist for the same organisation on the same project. | Assignment creation |
| BRL-STK-006 | External stakeholders may hold only `LIMITED_ACCESS` or `READ_ONLY`; `FULL_ACCESS` is reserved for internal parties. | Access scope save |
| BRL-STK-007 | A WBS scope grant applies to the named node and all its descendants, and never to ancestors or siblings. | Access check |
| BRL-STK-008 | A blacklisted stakeholder cannot be assigned to any project in the tenant, regardless of the acting user's role. | Assignment creation |
| BRL-STK-009 | Blacklisting and un-blacklisting require a recorded reason and a two-step confirmation by Company Admin or Project Director. | Status transition |
| BRL-STK-010 | Suspension freezes existing assignments but does not delete them; in-flight approvals held by the suspended party escalate to the defined fallback approver. | Status transition |
| BRL-STK-011 | An assignment cannot be terminated while it holds open approval, review, or response obligations, unless those are reassigned or explicitly orphaned by the Project Manager with a reason. | Assignment termination |
| BRL-STK-012 | External platform logins are valid only while the linked assignment is `ACTIVE`; termination revokes access. | Assignment termination, nightly reconciliation |
| BRL-STK-013 | A mandatory compliance document past its expiry date automatically moves the stakeholder to `SUSPENDED` unless overridden by Company Admin with a reason. | Daily expiry scan |
| BRL-STK-014 | Stakeholder records are never hard-deleted; they are archived to `INACTIVE` and retained per the platform retention policy. | Delete action |
| BRL-STK-015 | The creator of a stakeholder registration may not approve that same registration. | Registration approval |
| BRL-STK-016 | Every stakeholder record, assignment, and related row carries `tenant_id` and is filtered by row-level security on every read. | Database layer |
| BRL-STK-017 | Performance scores are computed from recorded system events only; they may not be manually edited. Weights may be configured by Company Admin only. | Scoring job |
| BRL-STK-018 | Organisation names are stored as entered and matched on a normalised form (case-folded, punctuation-stripped, legal-suffix-stripped) for duplicate detection. | Create and import |

---

## 9. Assumptions and Dependencies

### 9.1 Assumptions

| ID | Assumption | Risk if False |
|---|---|---|
| A-01 | Authentication & RBAC (Module 02) is delivered before this module. | External user provisioning cannot be built |
| A-02 | Project Setup (Module 05) and WBS Management (Module 06) are delivered before or with this module. | Assignment and WBS scoping have no parent context |
| A-03 | The Approval Workflow, Notification, and Audit engines expose the integration contracts described in R0 §24. | Resolution service has no consumer |
| A-04 | Each tenant operates as a single legal entity for blacklisting purposes. | Group-company blacklisting logic would be required |
| A-05 | External parties have email access and basic smartphone or browser capability. | External provisioning model must change |
| A-06 | Compliance document types are configurable per tenant, not hard-coded per jurisdiction. | Cambodia-only build would not scale regionally |

### 9.2 Dependencies

| Depends On | For |
|---|---|
| Module 02 — Authentication & RBAC | Identity, JWT tenant claim, external user accounts |
| Module 05 — Project Setup | Project context for assignments |
| Module 06 — WBS Management | WBS nodes for scope restriction |
| Module 03 — Admin Configuration | Stakeholder types, compliance document types, performance weights |
| Approval Workflow Engine | Consumer of approver resolution |
| Notification Engine | Consumer of recipient resolution |
| Audit Trail Engine | Recipient of all module events |
| Module 17 — Supplier Prequalification | Source of `pq_status` mirror (Phase 3) |

---

## 10. Constraints

| Type | Constraint |
|---|---|
| Regulatory | Cambodian construction permits require named, licensed responsible parties; the register must hold licence numbers and expiry for design and specialist contractors |
| Contractual | Under FIDIC-style contracts, notices and instructions are only valid when served on the contractually named representative — the register must be the source of that name |
| Commercial | Internal cost data must never be visible to client or consultant users; access model must fail closed |
| Data protection | Contact personal data is retained only for the contractual retention period, then minimised |
| Technical | Multi-tenant PostgreSQL with row-level security; no application-layer-only isolation |
| Operational | Register maintenance must be achievable by a Document Controller without IT support |
| Linguistic | Organisation and contact names must support Khmer and Latin script; system UI bilingual-ready |
| Performance | Register search must feel instant to a user typing — sub-300 ms on a 5,000-record register |

---

## 11. Risks and Mitigations

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-01 | Register is created at mobilisation then never maintained, degrading to a stale directory | High | High | Monthly compliance review SOP; expiry-driven automatic suspension; quarterly audit report |
| R-02 | Project Managers bypass authority configuration to avoid setup effort, leaving workflows unroutable | High | Critical | Block document issue-for-construction until the project approval matrix is complete |
| R-03 | External users granted excessive access under time pressure during mobilisation | Medium | Critical | External parties technically incapable of full access; quarterly access review report |
| R-04 | Cross-tenant data leak in a shared deployment | Low | Critical | Row-level security on all 15 tables; automated leak tests as a CI gate; no service-role key on client |
| R-05 | Resolution service becomes a platform-wide single point of failure | Medium | Critical | Caching with event-driven invalidation; degraded mode that blocks approvals rather than approving blind |
| R-06 | Duplicate organisations accumulate through bulk import | Medium | Medium | Dry-run validation with duplicate report before commit; merge tool |
| R-07 | Performance scoring is perceived as unfair and rejected by consultants | Medium | Low | Scores computed from objective system events only; event ledger visible; no manual editing |
| R-08 | Blacklisting is used to settle commercial disputes rather than governance failures | Low | Medium | Two-step confirmation, mandatory reason, restricted to Company Admin and Project Director, full audit |

---

## 12. Success Criteria and KPIs

| KPI | Definition | Target | Measured |
|---|---|---|---|
| Authority traceability | Approvals traceable to a recorded authority level at time of action | 100% | Monthly, from audit log |
| Unauthorised approval count | Approvals by parties without recorded authority | 0 | Continuous |
| Routing failure rate | Workflow items routed to inactive or departed parties | < 1% | Monthly |
| Zero-approver events | Workflow steps with no eligible approver | < 5 per month, all resolved within 24h | Continuous |
| Compliance currency | Active stakeholders with an expired mandatory document | 0 | Daily scan |
| Mobilisation completeness | Projects reaching construction start with a complete approval matrix | 100% | Per project gate |
| Register hygiene | Duplicate organisation rate | < 1% | Quarterly audit |
| Audit response time | Time to produce full authority trail for a historical approval | < 5 minutes | Per request |
| External access correctness | External users with access beyond contractual scope | 0 | Quarterly review |
| Cross-tenant leaks | Confirmed incidents | 0 | Continuous, CI-gated |
| User adoption | % of project stakeholders maintained in the system versus known actual parties | > 95% by month 3 | Per project |

---

## 13. MVP Boundary

| In MVP (Phase 1) | Deferred |
|---|---|
| Stakeholder register with type classification and status | Performance scoring and reliability index |
| Duplicate detection on create | Bulk import and merge tooling |
| Contacts with primary designation | Compliance document auto-suspension |
| Project assignment with role and discipline | Mobile offline directory |
| Approval authority level per assignment | Value-threshold-based approval authority |
| Access level and WBS scope restriction | PQ status mirror from Module 17 |
| Workflow responsibility toggles | Delegation during leave |
| External user provisioning and revocation | Group-company blacklist propagation |
| Status lifecycle including suspend and blacklist | Performance-driven automatic suspension |
| Resolution service for approvers and recipients | |
| Full audit emission and tenant isolation | |

Per the module standard: **do not overbuild early.** The MVP is the register, assignment, role and permission, and basic approval logic.

---

## 14. Open Questions

| ID | Question | Owner | Needed By |
|---|---|---|---|
| Q-01 | Does approval authority need a monetary threshold dimension in MVP, or is workflow-step authority sufficient? | QS Manager | Before FS sign-off |
| Q-02 | Should blacklisting propagate across group companies sharing a parent entity? | Company Admin | Phase 2 |
| Q-03 | Which compliance document types are mandatory versus optional per stakeholder type in Cambodia? | Legal / Compliance | Before schema freeze |
| Q-04 | Is a formal delegation-during-leave mechanism required in MVP, or is authority reassignment sufficient? | Project Director | Before FS sign-off |
| Q-05 | Retention period for external contact personal data after project close-out? | Legal | Before deployment |

---

## 15. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1.0 | 2026-08-08 | Initial issue | Construction Operations Consultant |

---

**End of Document**
