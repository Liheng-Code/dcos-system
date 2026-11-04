# DCOS — Stakeholder Management Module
## Master Documentation Prompt (12-Document Set)

**Prompt Code:** DCOS-PROMPT-STK-001
**Version:** R1
**Module:** Stakeholder Management (Module 04 — Foundation Phase)
**Target Output:** 12 controlled documents per `Document_Content.md`
**Base References:** `DCOS_System_Architecture_Module_Design_R0.md`, `DCOS_Gap_Analysis_R1.docx`, `standards/stakeholder-module-standard.md`
**Output Format:** Markdown (`.md`), one file per document

---

## 0. How To Use This Prompt

This file is a **prompt pack**, not a specification. It contains:

| Part | Content |
|---|---|
| Part 1 | System context block — paste at the top of every session |
| Part 2 | Module scope, boundaries, and non-goals |
| Part 3 | Global writing rules that apply to all 12 documents |
| Part 4 | Canonical reference data — the single source of truth all 12 documents must obey |
| Part 5 | Twelve individual prompt blocks (01 → 12), each ready to copy and run |
| Part 6 | Cross-document consistency contract and quality gate |

**Recommended execution order:** 01 → 02 → 03 → 04 → 07 → 05 → 08 → 06 → 09 → 10 → 11 → 12.

Rationale: business requirement defines the *why*, functional spec defines the *what*, use cases define the *behaviour*, the schema and RBAC matrix freeze the *data and permission contract*, and every later document consumes those frozen artefacts. Never generate the API reference before the schema exists — it will invent field names.

**Rule:** Generate one document per session. Before generating document N, paste Part 1, Part 3, Part 4, and the already-approved content of any document N depends on.

---

# PART 1 — SYSTEM CONTEXT BLOCK

> Paste this block verbatim at the start of every generation session.

```
SYSTEM IDENTITY
Name: Digital Construction Operating System (DCOS)
Type: Enterprise-grade, multi-tenant construction management platform
Core Principle: WBS-driven multi-project construction operating system integrating all
disciplines, stakeholders, workflows, documents, cost, schedule, and field operations
into one centralized platform.
Industry: Construction / Engineering / BIM / EPC / Design & Build
Deployment: Cloud web application with mobile (offline-capable) field support

ARCHITECTURE PHILOSOPHY
- One unified platform, modular by discipline
- WBS is the spine — every record answers: which project / which WBS node /
  which discipline / which responsible party / what status
- Multi-tenant with row-level isolation (tenant_id on every table, PostgreSQL RLS)
- Modular monolith first, extract services only when a module becomes the bottleneck
- API-first, document-centric, audit-everything
- Role-based access control + project assignment + discipline scope

WBS HIERARCHY
Company → Project → Phase → Discipline → Building → Level → Zone → Room → Element → Task
(dynamic depth; parent-child; progress roll-up; WBS code unique within project)

TECH STACK
Frontend: Next.js 14 + React + TypeScript + Tailwind + shadcn/ui
Backend: Supabase (MVP) → Node.js + NestJS (scale)
Database: PostgreSQL (Supabase), Row Level Security enforced
Mobile: React Native, offline-first with sync queue
Storage: Supabase Storage / AWS S3, signed URLs, CDN delivery
Realtime: Supabase Realtime / Socket.io
Auth: JWT + RBAC, tenant_id claim in token (never from request body)
Deployment: Docker + Vercel + VPS/Kubernetes

AI ROLE — RESPOND AS
- Senior System Architect
- Construction ERP Specialist
- BIM Technology Expert
- Enterprise SaaS Designer
- Construction Operations Consultant

RESPONSE BEHAVIOUR
- Think enterprise-grade and scalable
- Use real construction terminology and real construction workflow
- Avoid generic software boilerplate ("the system shall be user-friendly")
- Prioritise practical implementation over theory
- Explain workflow logic explicitly, including rejection and exception paths
- Suggest industry-standard practices (FIDIC-style contract logic, ISO 9001
  document control, ISO 19650 information management where relevant)
- Consider future scalability and multi-tenant safety in every design decision
```

---

# PART 2 — MODULE SCOPE AND BOUNDARIES

## 2.1 Module Definition

The Stakeholder Management module is **a control panel for responsibility**, located at `Admin → Stakeholder Management`.

It is **not** a contact list. It is **not** a CRM. It is **not** a name store.

It exists to control four questions on every project:

1. **Who is responsible** for a scope of work?
2. **Who approves** a document, task, RFI, inspection, or purchase?
3. **Who executes** the work?
4. **Who is accountable** when it fails?

Every workflow action in DCOS — task assignment, document review, RFI response, inspection sign-off, PO issue, IPC certification — resolves its actor through a stakeholder record. If this module is weak, the system becomes chaos. If it is strong, the project becomes controlled.

## 2.2 In Scope

| Area | Included |
|---|---|
| Stakeholder register | Organisation profile, classification, status lifecycle |
| Contact management | Multiple contact persons per organisation, primary contact, role, channel preference |
| Project assignment | Assign organisation to project, define project role, discipline, engagement dates |
| Approval authority | Approval level per stakeholder per project (and optionally per module) |
| Access control | Access level, module scope, WBS-based restriction, document confidentiality tier |
| Workflow responsibility | Toggle participation in task execution, document review, RFI response, inspection approval, procurement |
| External user provisioning | Link stakeholder contacts to platform user accounts with restricted external role |
| Performance tracking | Response time, approval delay, task completion rate, reliability score |
| Status governance | Draft → Active → Suspended / Inactive / Blacklisted, with reason and audit |
| Duplicate control | Organisation-level de-duplication, one stakeholder record per organisation per project |
| Integration surface | Publish stakeholder resolution service to all consuming modules |

## 2.3 Out of Scope (Must Be Explicitly Declared and Cross-Referenced)

| Excluded Capability | Owning Module | Relationship |
|---|---|---|
| Supplier prequalification (PQ questionnaire, financial check, ISO certificates, PQ scoring) | Supplier Prequalification (Module 17) | Stakeholder holds `pq_status` and `pq_expiry_date` as a read-only mirror; PQ module owns the process |
| Subcontract commercial terms, sub-BOQ, sub-IPC, back-charges, retention | Subcontractor Management (Module 19) | Subcontract records reference `stakeholder_id` as the counterparty |
| Head contract administration, employer's instructions, notices, time bars | Contract Administration (Module 35) | Client stakeholder is the notice recipient |
| Supplier payment, AP/AR ledgers, invoices | Account / Finance (Module 42) | Supplier stakeholder is the payee master |
| Document transmittal generation and external issue gating | Document Control (Module 37) | Stakeholder defines *who may receive*; transmittal executes the issue |
| Platform user identity, password, MFA, session | Authentication & RBAC (Module 02) | Stakeholder contact links to `user_id` where a login is provisioned |
| Employee master, payroll, attendance | HR (Module 41) | Internal departments appear as stakeholder type `INTERNAL_DEPARTMENT`, but people records live in HR |

**Rule for all 12 documents:** never re-specify an out-of-scope capability. Reference it, define the interface, and stop.

## 2.4 Design Constraints Inherited From the Module Standard

These are non-negotiable and must appear consistently across all 12 documents:

- Layout: **Sidebar + Top Bar + Main Workspace + Detail Panel**
- Left panel: stakeholder type filter with live count per type, active-filter highlight, no reload delay
- Top bar: instant search (organisation / contact / role), filter button, always-visible **Add Stakeholder** button, no hidden actions
- Main workspace columns: Organisation Name, Stakeholder Type, Contact Person, Project Role, Approval Level, Status
- Status colour: Active → green, Pending → yellow, Inactive → grey (extend: Suspended → orange, Blacklisted → red)
- Right detail panel sections, in this order: Basic Information, Project Assignment, Approval Authority, Access Control, Workflow Responsibility, Performance Tracking
- Interaction: click row → open detail panel; hover → highlight row
- Performance visual: progress bar, warning state when reliability score < 80%
- UX character: **construction control room, not a marketing app.** No unnecessary animation, no decorative colour, no social-style UI
- MVP scope: stakeholder register, project assignment, role & permission, basic approval logic. Do not overbuild early

---

# PART 3 — GLOBAL WRITING RULES

Apply these to every one of the 12 documents.

## 3.1 Structure Rules

1. Every document opens with a control header table: Document Code, Module, Version, Status, Author Role, Date, Related Documents.
2. Every document has a numbered section hierarchy (1, 1.1, 1.1.1). Maximum depth: three levels.
3. Every document ends with: **Open Questions / Assumptions**, **Change Log**, **End of Document**.
4. Use tables for anything with more than two attributes. Use fenced code blocks for flows, schemas, payloads, and hierarchies.
5. Cross-reference by document code and section number, never by "see above".

## 3.2 Content Rules

1. **Construction reality first.** Every feature must be justified by a real site, design office, or commercial scenario. If a feature cannot be tied to a construction workflow, delete it.
2. **No generic filler.** Ban phrases such as "user-friendly interface", "robust and scalable", "seamless experience", "state-of-the-art". Replace with measurable statements.
3. **Every requirement is testable.** If a statement cannot become a test case in `09-Test-Plan.md`, rewrite it.
4. **Exceptions are mandatory.** Every workflow must document the rejection path, the timeout path, and the "responsible party leaves the project" path.
5. **Multi-tenant safety in every design.** Any query, endpoint, or screen must state how `tenant_id` is enforced.
6. **Audit everything.** Every state-changing action must name the audit event it emits.
7. **Assume Cambodia / Southeast Asia operating context** for locale examples: USD and KHR currencies, Khmer and English contact names, local authority types (Ministry of Land Management Urban Planning and Construction, Electricité du Cambodge, Phnom Penh Water Supply Authority, Fire Department), FIDIC-style consultant/client structures.

## 3.3 Naming and Casing Rules

| Artefact | Convention | Example |
|---|---|---|
| Table names | `snake_case`, plural | `project_stakeholders` |
| Column names | `snake_case`, singular | `approval_level` |
| Enum values | `UPPER_SNAKE_CASE` | `FINAL_APPROVE` |
| API paths | `kebab-case`, plural nouns | `/api/v1/stakeholders/{id}/project-assignments` |
| Permission codes | `MODULE.ACTION` | `STK.ASSIGN_PROJECT` |
| Event codes | `MODULE.ENTITY.ACTION` | `STK.ASSIGNMENT.ACTIVATED` |
| Document codes | `DCOS-STK-<TYPE>-<NNN>` | `DCOS-STK-BRD-001` |
| Test case IDs | `TC-STK-<AREA>-<NNN>` | `TC-STK-ACCESS-014` |
| UI screen IDs | `SCR-STK-<NNN>` | `SCR-STK-003` |

## 3.4 Depth Targets

| Document | Minimum Depth |
|---|---|
| 01 Business Requirement | 15+ numbered business requirements, 8+ pain points, 10+ measurable success criteria |
| 02 Functional Specification | 40+ functional requirements with IDs, all screens, all rules, all validations |
| 03 Use Cases | 20+ use cases in full template form, including 5+ exception-heavy cases |
| 04 Database Schema | 12+ tables with complete DDL, indexes, constraints, RLS policies, seed data |
| 05 Integration Specification | 10+ consuming modules, event contracts, payloads, failure handling |
| 06 UI/UX Design | Every screen, every state (empty, loading, error, no-permission), responsive and mobile behaviour |
| 07 RBAC Matrix | Full matrix: 20 roles × all permission codes, plus data-scope rules |
| 08 API Reference | 25+ endpoints with request, response, error codes, examples |
| 09 Test Plan | 80+ test cases across functional, permission, integration, performance, security |
| 10 Deployment Notes | Migration order, env vars, rollback, feature flags, smoke tests |
| 11 SOP | 12+ standard operating procedures with responsibility and frequency |
| 12 Training Guide | Role-based training paths, exercises, quick reference cards |

---

# PART 4 — CANONICAL REFERENCE DATA

> This is the frozen contract. All 12 documents must use these values exactly. Do not invent alternatives, do not rename, do not add without recording in the Change Log.

## 4.1 Stakeholder Types

| Code | Label | Internal/External | Typical Access Default |
|---|---|---|---|
| `CLIENT_OWNER` | Client / Project Owner | External | Limited — approval + progress view |
| `CONSULTANT` | Consultant / Engineer / PMC | External | Limited — review and approval |
| `ARCHITECT_DESIGNER` | Architect / Designer | External or Internal | Limited — design scope |
| `MAIN_CONTRACTOR` | Main Contractor | External | Limited — where DCOS tenant is not the main contractor |
| `SUBCONTRACTOR` | Subcontractor | External | Limited — own scope and WBS only |
| `SUPPLIER_VENDOR` | Supplier / Vendor | External | Read-only — own PO and delivery records |
| `AUTHORITY` | Regulatory Authority | External | No platform access by default |
| `TESTING_AGENCY` | Testing / Inspection Agency | External | Limited — inspection and test records |
| `UTILITY_AUTHORITY` | Utility Authority | External | No platform access by default |
| `INSURANCE_BONDING` | Insurance / Bonding Party | External | No platform access by default |
| `INTERNAL_DEPARTMENT` | Internal Company Department | Internal | Per RBAC role |
| `JV_PARTNER` | Joint Venture Partner | External | Limited — negotiated scope |

## 4.2 Stakeholder Status Lifecycle

```
DRAFT
→ PENDING_APPROVAL
→ ACTIVE
→ SUSPENDED → ACTIVE (reinstated)
→ INACTIVE
→ BLACKLISTED
```

| Status | Colour | Meaning | Can Be Assigned to Project? |
|---|---|---|---|
| `DRAFT` | Grey | Being created, incomplete data | No |
| `PENDING_APPROVAL` | Yellow | Awaiting Company Admin verification | No |
| `ACTIVE` | Green | Verified and usable | Yes |
| `SUSPENDED` | Orange | Temporarily blocked (expired insurance, PQ lapse, performance) | No new; existing frozen |
| `INACTIVE` | Grey | Engagement ended, retained for history | No |
| `BLACKLISTED` | Red | Blocked permanently — fraud, default, regulatory violation | No, on any project, tenant-wide |
| `PREFERRED` | Green + star badge | Flag on top of ACTIVE, not a separate state | Yes |

## 4.3 Project Assignment Status

```
DRAFT → PENDING → ACTIVE → ON_HOLD → COMPLETED → TERMINATED
```

## 4.4 Approval Authority Levels

| Code | Label | Meaning |
|---|---|---|
| `NO_APPROVAL` | No Approval | Participates but cannot approve anything |
| `REVIEW_ONLY` | Review Only | Can comment, mark reviewed, cannot approve or reject finally |
| `APPROVE` | Approve | Can approve within a defined threshold / workflow step |
| `FINAL_APPROVE` | Final Approval | Terminal approval — closes the workflow step chain |

Rules: approval level must never be null on an active assignment; approval level must map to at least one workflow step or the assignment is flagged as misconfigured.

## 4.5 Access Levels

| Code | Label | Meaning |
|---|---|---|
| `FULL_ACCESS` | Full Access | All modules within assigned project, subject to RBAC role |
| `LIMITED_ACCESS` | Limited Access | Named modules only, plus optional WBS restriction |
| `READ_ONLY` | Read-only | View and download only, no create/edit/approve |

Optional overlay: **WBS scope restriction** — e.g. Building B01 only; Building B01 / Level L05 only. External stakeholders default to `LIMITED_ACCESS` and can never be granted `FULL_ACCESS`.

## 4.6 Workflow Responsibility Toggles

| Code | Label |
|---|---|
| `TASK_EXECUTION` | Task execution |
| `DOCUMENT_REVIEW` | Document review |
| `RFI_RESPONSE` | RFI response |
| `INSPECTION_APPROVAL` | Inspection approval |
| `PROCUREMENT_INVOLVEMENT` | Procurement involvement |
| `PAYMENT_CERTIFICATION` | Payment certification |
| `SAFETY_OVERSIGHT` | Safety oversight |
| `DESIGN_COORDINATION` | Design coordination |

## 4.7 Canonical Table List

```
stakeholders
stakeholder_contacts
stakeholder_addresses
stakeholder_documents
project_stakeholders
stakeholder_project_roles
stakeholder_approval_authorities
stakeholder_access_scopes
stakeholder_wbs_scopes
stakeholder_workflow_responsibilities
stakeholder_performance_scores
stakeholder_performance_events
stakeholder_status_history
stakeholder_blacklist_records
stakeholder_user_links
```

## 4.8 Canonical API Root

```
/api/v1/stakeholders
/api/v1/stakeholders/{stakeholder_id}/contacts
/api/v1/stakeholders/{stakeholder_id}/project-assignments
/api/v1/projects/{project_id}/stakeholders
/api/v1/stakeholder-assignments/{assignment_id}/approval-authority
/api/v1/stakeholder-assignments/{assignment_id}/access-scope
/api/v1/stakeholder-assignments/{assignment_id}/workflow-responsibilities
/api/v1/stakeholders/{stakeholder_id}/performance
/api/v1/stakeholder-resolution/approvers
```

## 4.9 Permission Code Set

```
STK.VIEW_LIST
STK.VIEW_DETAIL
STK.CREATE
STK.EDIT
STK.ARCHIVE
STK.APPROVE_REGISTRATION
STK.ASSIGN_PROJECT
STK.EDIT_ASSIGNMENT
STK.REMOVE_ASSIGNMENT
STK.SET_APPROVAL_AUTHORITY
STK.SET_ACCESS_SCOPE
STK.SET_WBS_SCOPE
STK.SET_WORKFLOW_RESPONSIBILITY
STK.PROVISION_EXTERNAL_USER
STK.VIEW_PERFORMANCE
STK.EDIT_PERFORMANCE_WEIGHTS
STK.BLACKLIST
STK.UNBLACKLIST
STK.EXPORT
STK.VIEW_AUDIT
```

## 4.10 Event Code Set (emitted to Notification + Audit engines)

```
STK.STAKEHOLDER.CREATED
STK.STAKEHOLDER.APPROVED
STK.STAKEHOLDER.SUSPENDED
STK.STAKEHOLDER.BLACKLISTED
STK.STAKEHOLDER.REINSTATED
STK.ASSIGNMENT.CREATED
STK.ASSIGNMENT.ACTIVATED
STK.ASSIGNMENT.ROLE_CHANGED
STK.ASSIGNMENT.TERMINATED
STK.AUTHORITY.CHANGED
STK.ACCESS.CHANGED
STK.WBS_SCOPE.CHANGED
STK.EXTERNAL_USER.PROVISIONED
STK.EXTERNAL_USER.REVOKED
STK.PERFORMANCE.THRESHOLD_BREACHED
STK.DOCUMENT.EXPIRING
STK.DOCUMENT.EXPIRED
```

## 4.11 Performance Metric Definitions

| Metric | Formula | Source |
|---|---|---|
| Average response time | mean(first_response_at − assigned_at) across RFI/document review items | RFI, Document Control |
| Approval delay | mean(approved_at − submitted_at) − contractual_response_days | Approval Workflow Engine |
| Task completion rate | completed_on_time_tasks / total_assigned_tasks × 100 | Task Engine |
| Document turnaround compliance | reviews_within_SLA / total_reviews × 100 | Document Control |
| Reliability score | weighted composite, default weights 30/30/25/15 | Computed nightly |

Warning threshold: reliability score < 80% → amber warning on detail panel + notification to Project Manager.
Escalation threshold: < 60% for two consecutive months → notification to Project Director, suggest suspension review.

---

# PART 5 — THE TWELVE PROMPT BLOCKS

---

## 5.1 — `01-Business-Requirement.md`

**Document Code:** DCOS-STK-BRD-001
**Depends on:** Part 1, Part 2, Part 4
**Author persona:** Construction Operations Consultant

### Required Sections

1. Document Control Header
2. Purpose and Business Objective
3. Business Context — how stakeholder coordination actually fails today (WhatsApp groups, unrecorded approvals, wrong drawing sent to wrong consultant, approvals by people with no authority, subcontractor claims with no assignment record)
4. Problem Statement — minimum 8 named pain points, each with a real construction consequence and estimated cost/time impact
5. Business Goals and Measurable Objectives
6. Scope — In Scope / Out of Scope (use Part 2 tables)
7. Stakeholder Analysis of the Module Itself — who uses it, who owns it, who is affected
8. Business Requirements — minimum 15, each with ID `BR-STK-NNN`, priority (Must/Should/Could), rationale, and acceptance measure
9. Business Rules — minimum 12, each with ID `BRL-STK-NNN` (e.g. "an approval cannot proceed without an assigned approver holding APPROVE or FINAL_APPROVE on that project")
10. Assumptions and Dependencies
11. Constraints — regulatory, contractual, commercial, technical
12. Risks and Mitigations — table with likelihood and impact
13. Success Criteria and KPIs — measurable, e.g. "100% of workflow approvals traceable to an assigned stakeholder with recorded authority level"
14. MVP vs Full Scope boundary
15. Open Questions, Change Log

### Must Include

- The four control questions (responsible / approves / executes / accountable) as the framing of the entire document
- Explicit statement that this module is not a CRM and not a contact list
- Business case for external user provisioning with limited access
- Business case for performance tracking — why a contractor needs a reliability score on its consultants and subcontractors
- Data integrity requirement: no duplicate stakeholder in the same project

### Acceptance Criteria

- No requirement is untestable
- Every requirement traces to at least one pain point
- No technical implementation detail appears (no table names, no API paths)

### Copy-Paste Prompt

```
[PASTE PART 1 SYSTEM CONTEXT]
[PASTE PART 2 SCOPE]
[PASTE PART 4 CANONICAL DATA]
[PASTE PART 3 GLOBAL WRITING RULES]

TASK: Write 01-Business-Requirement.md for the DCOS Stakeholder Management module.
Document code DCOS-STK-BRD-001.

Follow exactly the section list, depth targets, must-include list, and acceptance
criteria in Section 5.1 of the master prompt. Write as a Construction Operations
Consultant addressing a construction company's executive team and system architect.

Constraints:
- Minimum 15 business requirements with IDs BR-STK-001 onward
- Minimum 12 business rules with IDs BRL-STK-001 onward
- Minimum 8 named pain points with real construction consequences
- No technical implementation detail — no tables, no APIs, no code
- Use Cambodia / Southeast Asia operating context for examples
- Output pure Markdown, no commentary before or after the document
```

---

## 5.2 — `02-Functional-Specification.md`

**Document Code:** DCOS-STK-FS-001
**Depends on:** 01
**Author persona:** Senior System Architect

### Required Sections

1. Document Control Header
2. Module Overview and Position in DCOS
3. Module Architecture — where it sits in the layer model, what it publishes to other modules
4. Screen Inventory — every screen with ID `SCR-STK-NNN`
5. Functional Requirements by Area, each with ID `FR-STK-NNN`, description, inputs, processing, outputs, validation, error handling, permission required, audit event emitted:
   - 5.1 Stakeholder Register (list, search, filter, count-per-type, sort, pagination)
   - 5.2 Stakeholder Creation and Duplicate Detection
   - 5.3 Organisation Profile and Multiple Addresses
   - 5.4 Contact Person Management (multiple contacts, primary flag, communication preference, language preference)
   - 5.5 Compliance Document Register (trade licence, tax certificate, insurance, ISO certificates, PQ certificate) with expiry tracking
   - 5.6 Project Assignment
   - 5.7 Project Role and Discipline Definition
   - 5.8 Approval Authority Configuration
   - 5.9 Access Control Configuration
   - 5.10 WBS Scope Restriction
   - 5.11 Workflow Responsibility Toggles
   - 5.12 External User Provisioning and Revocation
   - 5.13 Performance Tracking and Scoring
   - 5.14 Status Lifecycle Management (suspend, reinstate, blacklist, unblacklist)
   - 5.15 Detail Panel Behaviour
   - 5.16 Export and Reporting
   - 5.17 Stakeholder Resolution Service (how other modules query "who approves this?")
6. Workflow Specifications — full flows with rejection and exception paths:
   - Create stakeholder → select type → input organisation info → add contact → save
   - Assign to project → define role → define approval level → define access → assign WBS (optional) → activate
   - Suspend / blacklist / reinstate
   - External user provision → invite → accept → first login → scope enforcement
   - Assignment termination and responsibility handover
7. Validation Rules — complete table, field-level and cross-field
8. Business Rule Enforcement Map — BRL-STK-NNN → FR-STK-NNN
9. State Machines — stakeholder status, assignment status, external user status (as code-block diagrams)
10. Notification Triggers — event → recipient → priority → channel (aligned to Part 4.10 and the R0 notification matrix)
11. Audit Requirements — action → audit event → severity → captured before/after fields
12. Non-Functional Requirements — performance targets, concurrency, tenant isolation, data volume assumptions
13. MVP Scope Marking — every FR tagged MVP / Phase 2 / Phase 3
14. Open Questions, Change Log

### Must Include

- Duplicate detection algorithm description (normalised organisation name + registration number + tenant scope)
- Rule: stakeholder must exist before assignment; stakeholder must be assigned before workflow participation
- Rule: approval cannot proceed without an assigned approver
- Rule: external users can never be granted `FULL_ACCESS`
- Rule: blacklisting is tenant-wide and blocks all new assignments across all projects
- Behaviour when a stakeholder with open approvals is suspended (open items must escalate to a named fallback approver, not silently stall)
- Search performance requirement: instant search, results under 300 ms for a 5,000-record register

### Acceptance Criteria

- Every FR has a permission code from Part 4.9 and an audit event from Part 4.10
- Every workflow documents the rejection path and the timeout path
- No FR contradicts a BR from document 01

### Copy-Paste Prompt

```
[PASTE PART 1, PART 2, PART 3, PART 4]
[PASTE APPROVED 01-Business-Requirement.md]

TASK: Write 02-Functional-Specification.md for the DCOS Stakeholder Management module.
Document code DCOS-STK-FS-001.

Follow exactly the section list, depth targets, must-include list, and acceptance
criteria in Section 5.2 of the master prompt. Write as a Senior System Architect
producing a specification a development team can build from without asking questions.

Constraints:
- Minimum 40 functional requirements with IDs FR-STK-001 onward
- Every FR states: description, inputs, processing, outputs, validation, error handling,
  required permission code, emitted audit event, MVP phase tag
- Every workflow includes rejection path, timeout path, and responsible-party-departure path
- Use only the canonical enums, statuses, permission codes, and event codes from Part 4
- Output pure Markdown, no commentary before or after the document
```

---

## 5.3 — `03-Use-Cases.md`

**Document Code:** DCOS-STK-UC-001
**Depends on:** 01, 02
**Author persona:** Construction Operations Consultant + Business Analyst

### Required Sections

1. Document Control Header
2. Actor Catalogue — every actor with goals and system-interaction summary
3. Use Case Index — ID, name, actor, priority, related FRs
4. Use Case Diagram (text/Mermaid-style block)
5. Detailed Use Cases — minimum 20, each in this template:
   - ID `UC-STK-NNN`, Name, Priority, Actor(s), Stakeholders and Interests
   - Preconditions, Trigger
   - Main Success Scenario (numbered steps, actor and system alternating)
   - Alternate Flows (A1, A2…)
   - Exception Flows (E1, E2…)
   - Postconditions
   - Business Rules Applied, Related FRs, Data Touched, Audit Events Emitted
   - Frequency of Use, Performance Requirement
6. Real-World Scenario Walkthroughs — minimum 4 narrative end-to-end scenarios
7. Traceability Matrix — UC ↔ FR ↔ BR
8. Open Questions, Change Log

### Mandatory Use Cases

| ID | Use Case |
|---|---|
| UC-STK-001 | Register a new consultant organisation |
| UC-STK-002 | Detect and merge a duplicate supplier entry |
| UC-STK-003 | Assign a client to a project with FINAL_APPROVE authority |
| UC-STK-004 | Assign a subcontractor limited to Building B01, Levels L01–L05 |
| UC-STK-005 | Provision an external consultant login and verify scope enforcement |
| UC-STK-006 | Change approval authority mid-project with open approvals in flight |
| UC-STK-007 | Suspend a supplier whose insurance certificate expired |
| UC-STK-008 | Blacklist a subcontractor after contract default |
| UC-STK-009 | Attempt to assign a blacklisted stakeholder — system blocks with reason |
| UC-STK-010 | Terminate an assignment and hand over open responsibilities |
| UC-STK-011 | Resolve "who approves this structural shop drawing?" from Document Control |
| UC-STK-012 | Resolve RFI responder and escalation chain from the RFI module |
| UC-STK-013 | Review a consultant's reliability score before renewing engagement |
| UC-STK-014 | Receive and act on a performance threshold breach notification |
| UC-STK-015 | Filter register by type and export an approved stakeholder list |
| UC-STK-016 | Add a second contact person and change the primary contact |
| UC-STK-017 | Upload and track expiry of compliance documents |
| UC-STK-018 | Client attempts to view internal cost documents — access denied and logged |
| UC-STK-019 | Cross-tenant access attempt — blocked at RLS, logged as CRITICAL |
| UC-STK-020 | Bulk import stakeholders from a legacy spreadsheet with validation report |

### Real-World Scenario Walkthroughs (mandatory)

1. **Tower A mobilisation.** New project awarded; PM registers client, PMC consultant, three design consultants, six subcontractors, and twelve suppliers in one week; defines the approval chain for structural shop drawings before the first drawing is issued.
2. **Consultant approval bottleneck.** Structural consultant's reviewer is on leave; RFIs age past the contractual response period; escalation chain triggers; PM reassigns approval authority; audit trail proves the delay was employer-side for a later EOT claim.
3. **Subcontractor default.** Finishing subcontractor abandons site; assignment terminated; open tasks and inspections reassigned; stakeholder blacklisted; system blocks the same organisation being re-registered under a slightly different name on another project.
4. **Client audit.** Client auditor asks who approved a specific concrete pour inspection eighteen months ago; the system produces the stakeholder, their authority level at that time, their assignment record, and the audit entry with role snapshot.

### Copy-Paste Prompt

```
[PASTE PART 1, PART 2, PART 3, PART 4]
[PASTE APPROVED 01 and 02]

TASK: Write 03-Use-Cases.md for the DCOS Stakeholder Management module.
Document code DCOS-STK-UC-001.

Follow exactly Section 5.3 of the master prompt, including all 20 mandatory use cases
and all 4 mandatory real-world scenario walkthroughs.

Constraints:
- Full use case template for every case — no abbreviated entries
- Every use case has at least one alternate flow and at least one exception flow
- Every use case lists related FR IDs from document 02 and audit events from Part 4.10
- Scenarios must read like real construction situations, not software demos
- Output pure Markdown, no commentary before or after the document
```

---

## 5.4 — `04-Database-Schema.md`

**Document Code:** DCOS-STK-DB-001
**Depends on:** 02
**Author persona:** Senior System Architect / Database Engineer

### Required Sections

1. Document Control Header
2. Schema Overview and Design Principles (multi-tenant, append-only history, soft delete, snapshot fields)
3. ERD — text/Mermaid block showing all tables and relationships
4. Table Specifications — one subsection per table from Part 4.7, each containing:
   - Purpose
   - Column table: name, type, nullable, default, description, constraints
   - Primary key, foreign keys, unique constraints, check constraints
   - Indexes with justification
   - RLS policy in SQL
   - Full `CREATE TABLE` DDL
5. Enum and Lookup Definitions — as PostgreSQL enums or reference tables, with a stated decision and rationale
6. Relationship Rules — cardinality table
7. Referential Integrity and Deletion Policy — what may be hard-deleted (nothing in production), what is soft-deleted, what cascades
8. History and Snapshot Strategy — why `role_snapshot` and `authority_snapshot` are stored on approval actions rather than joined live
9. Row Level Security — complete policy set, tenant isolation, project-scope isolation, external-user isolation
10. Indexing and Query Performance Strategy — the five hot queries and their supporting indexes
11. Views and Materialised Views — `v_active_project_stakeholders`, `v_stakeholder_performance_summary`, `mv_stakeholder_type_counts`
12. Seed / Master Data — stakeholder types, approval levels, access levels, workflow responsibility codes
13. Migration Files and Order
14. Data Volume Estimates and Growth Plan
15. Open Questions, Change Log

### Must Include

- `tenant_id uuid NOT NULL` on every table, with RLS policy `USING (tenant_id = current_setting('app.tenant_id')::uuid)`
- Unique constraint enforcing no duplicate stakeholder per project: `UNIQUE (project_id, stakeholder_id) WHERE deleted_at IS NULL`
- Unique constraint on normalised organisation identity per tenant: `UNIQUE (tenant_id, normalised_name, registration_number)`
- Check constraint: active assignment must have non-null `approval_level`
- Check constraint: external stakeholder cannot have `access_level = 'FULL_ACCESS'`
- `stakeholder_wbs_scopes` supporting multiple WBS node grants per assignment, with inheritance to descendant nodes
- `stakeholder_status_history` as append-only with reason code and actor
- `stakeholder_performance_events` as the raw event ledger, `stakeholder_performance_scores` as the computed nightly rollup
- `stakeholder_user_links` mapping `contact_id` → `user_id` with revocation timestamp

### Acceptance Criteria

- Every column referenced anywhere in documents 02, 05, 06, 08 exists in this schema
- Every DDL block is valid PostgreSQL and runnable in order
- No table lacks an RLS policy

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 02-Functional-Specification.md]

TASK: Write 04-Database-Schema.md for the DCOS Stakeholder Management module.
Document code DCOS-STK-DB-001.

Follow exactly Section 5.4 of the master prompt.

Constraints:
- Use exactly the 15 canonical table names in Part 4.7 — add tables only if you also
  record them in the Change Log with justification
- Every table: purpose, full column table, constraints, indexes with justification,
  RLS policy, runnable CREATE TABLE DDL
- Target PostgreSQL 15 on Supabase
- Include all must-include constraints listed in Section 5.4
- Include seed data INSERT statements for all master data
- Output pure Markdown with fenced sql code blocks, no commentary
```

---

## 5.5 — `05-Integration-Specification.md`

**Document Code:** DCOS-STK-INT-001
**Depends on:** 02, 04
**Author persona:** Senior System Architect

### Required Sections

1. Document Control Header
2. Integration Philosophy — stakeholder as the responsibility resolution service for the whole platform
3. Integration Map — diagram plus table of every consuming and providing module
4. Inbound Integrations — what other modules write to or trigger in Stakeholder Management
5. Outbound Integrations — per consuming module, with contract detail:
   - Project Setup — project creation triggers stakeholder assignment prompt
   - WBS Management — WBS scope validation, node deletion checks
   - Task Management — assignee resolution, external assignee restriction
   - Document Control — reviewer/approver resolution, transmittal recipient list, distribution matrix
   - RFI — responder resolution, escalation chain
   - Procurement — supplier eligibility check, PQ status mirror, PO recipient
   - Subcontractor Management — counterparty reference, assignment prerequisite
   - QA/QC — inspection witness and approver resolution, testing agency link
   - HSE — safety oversight responsibility, incident notification list
   - Account / Finance — payee master reference, payment certification authority
   - Approval Workflow Engine — approver resolution contract, fallback and escalation
   - Notification Engine — recipient strategy resolution (role, project role, discipline role, stakeholder type, WBS responsible)
   - Audit Trail Engine — event emission contract with role snapshot
   - Authentication & RBAC — external user provisioning contract
   - Mobile Field Application — cached stakeholder directory, offline resolution rules
6. Contract Specifications — for each integration: direction, trigger, payload schema (JSON), synchronous or event-driven, idempotency, failure behaviour, retry policy, SLA
7. Stakeholder Resolution Service — the central API contract other modules call:
   - `resolveApprovers(project_id, wbs_node_id, module, entity_type, step)`
   - `resolveNotificationRecipients(event_code, context)`
   - `checkAccess(user_id, project_id, wbs_node_id, module, action)`
   - Response schemas, caching rules, cache invalidation events
8. Event Bus Contract — event codes from Part 4.10 with full payload schemas
9. Failure and Degradation Behaviour — what happens when resolution returns zero approvers, when the service is unavailable, when a stakeholder is suspended mid-workflow
10. External System Integrations — email/SMTP for external invites, Telegram bot for external notification, future ERP supplier master sync
11. Data Consistency Rules — source of truth per field, mirrored fields and their refresh policy
12. Integration Test Points
13. Open Questions, Change Log

### Must Include

- Explicit rule: no module may query stakeholder tables directly; all access goes through the resolution service or a published view
- Zero-approver condition is an error state that raises a CRITICAL notification, never a silent pass
- Cache invalidation on `STK.AUTHORITY.CHANGED`, `STK.ACCESS.CHANGED`, `STK.ASSIGNMENT.TERMINATED`
- Mobile offline rule: cached stakeholder directory is read-only, refreshed on sync, and approval resolution is never performed offline

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 02 and 04]

TASK: Write 05-Integration-Specification.md for the DCOS Stakeholder Management module.
Document code DCOS-STK-INT-001.

Follow exactly Section 5.5 of the master prompt. Cover all 15 consuming modules listed.

Constraints:
- Every integration: direction, trigger, JSON payload schema, sync/async, idempotency,
  failure behaviour, retry policy, SLA
- Full contract for the Stakeholder Resolution Service with request and response schemas
- Full payload schema for every event code in Part 4.10
- Include failure and degradation behaviour for every integration
- Output pure Markdown with fenced json code blocks, no commentary
```

---

## 5.6 — `06-UI-UX-Design.md`

**Document Code:** DCOS-STK-UX-001
**Depends on:** 02, 03, 07
**Author persona:** Enterprise SaaS Designer

### Required Sections

1. Document Control Header
2. Design Principles — construction control room, not a marketing app
3. Layout System — Sidebar + Top Bar + Main Workspace + Detail Panel, with column widths, breakpoints, and collapse behaviour
4. Navigation Placement — `Admin → Stakeholder Management`, plus contextual entry from Project detail
5. Design Tokens — colour, typography, spacing, elevation, border radius, status colour mapping (Active green / Pending yellow / Inactive grey / Suspended orange / Blacklisted red)
6. Screen Specifications — for every screen `SCR-STK-NNN`:
   - Purpose, entry points, layout wireframe (ASCII or structured description)
   - Every component with behaviour
   - Every state: default, loading, empty, error, no-results, no-permission, offline
   - Keyboard interaction, focus order
   - Responsive behaviour: desktop, tablet, mobile
7. Screens to specify:
   - SCR-STK-001 Stakeholder Register (list + type filter panel + detail panel)
   - SCR-STK-002 Add Stakeholder (modal / drawer, multi-step)
   - SCR-STK-003 Stakeholder Detail Panel (six sections per the standard)
   - SCR-STK-004 Project Assignment Drawer
   - SCR-STK-005 Approval Authority Configuration
   - SCR-STK-006 Access Control and WBS Scope Picker (WBS tree with checkbox inheritance)
   - SCR-STK-007 Workflow Responsibility Toggles
   - SCR-STK-008 Contact Management
   - SCR-STK-009 Compliance Document Register with expiry indicators
   - SCR-STK-010 Performance Tracking Panel
   - SCR-STK-011 Status Change / Blacklist Dialog with mandatory reason
   - SCR-STK-012 External User Provisioning
   - SCR-STK-013 Bulk Import and Validation Report
   - SCR-STK-014 Project Stakeholder Matrix (project view: who is who on this project)
   - SCR-STK-015 Mobile Stakeholder Directory (read-only)
8. Interaction Patterns — instant search behaviour and debounce, filter chips, row hover and selection, detail panel open/close, unsaved-change guard, optimistic vs pessimistic updates
9. Form Design Standards — field grouping, label position, inline validation timing, error message wording, required-field marking
10. Table Design Standards — density, column resize, sort, sticky header, pagination vs infinite scroll decision with rationale
11. Empty States and First-Run Experience
12. Error and Permission-Denied Presentation — never a blank screen; always state what is missing and who to contact
13. Accessibility — contrast ratios, focus indicators, screen reader labels, minimum touch target 44px
14. Dark / Light Mode Specification
15. Mobile and Field Considerations — what a site supervisor actually needs from this module on a phone
16. Microcopy Library — exact wording for buttons, confirmations, warnings, and errors
17. Open Questions, Change Log

### Must Include

- Reliability score presented as a progress bar with an amber warning below 80%
- Type filter panel showing live count per stakeholder type
- No unnecessary animation; state changes are instant and legible
- Confirmation dialog with mandatory reason text for suspend and blacklist actions
- Visual distinction between internal and external stakeholders at a glance
- WBS scope picker must make inherited grants visually explicit

### Copy-Paste Prompt

```
[PASTE PART 1, PART 2, PART 3, PART 4]
[PASTE APPROVED 02, 03, and 07]

TASK: Write 06-UI-UX-Design.md for the DCOS Stakeholder Management module.
Document code DCOS-STK-UX-001.

Follow exactly Section 5.6 of the master prompt, specifying all 15 screens.

Constraints:
- Every screen: purpose, entry points, wireframe, component behaviour, and all seven
  states (default, loading, empty, error, no-results, no-permission, offline)
- Every screen: desktop, tablet, and mobile behaviour
- Obey the module standard layout: Sidebar + Top Bar + Main Workspace + Detail Panel
- Design character: construction control room. No decorative colour, no animation,
  no social-style UI
- Include a microcopy library with exact button, warning, and error wording
- Output pure Markdown, no commentary before or after the document
```

---

## 5.7 — `07-RBAC-Matrix.md`

**Document Code:** DCOS-STK-RBAC-001
**Depends on:** 02, 04
**Author persona:** Senior System Architect / Security Engineer

### Required Sections

1. Document Control Header
2. Access Control Model — `Effective permission = Role permission ∩ Project assignment ∩ Discipline scope ∩ WBS scope ∩ Access level ∩ Tenant`
3. Role Catalogue — all 20 DCOS roles with a one-line responsibility statement
4. Permission Catalogue — every code from Part 4.9 with description, risk level, and audit severity
5. **Master RBAC Matrix** — 20 roles × 20 permission codes, values: `✓` allowed, `✓*` allowed with condition, `—` denied. Every `✓*` footnoted with the exact condition
6. Data Scope Rules per Role — which rows each role can see, expressed as SQL predicates
7. External Stakeholder Access Model — separate matrix for Client, Consultant, Subcontractor, Supplier users
8. Field-Level Restrictions — which fields are masked from which roles (internal notes, performance weights, commercial terms, blacklist reasons)
9. Action-Level Guards — preconditions beyond permission (e.g. blacklist requires Company Admin plus a recorded reason plus two-step confirmation)
10. Permission Escalation and Delegation — temporary approval delegation during leave, with expiry and audit
11. Tenant Isolation Enforcement — JWT claim handling, RLS policy mapping, forbidden patterns
12. Separation of Duties — who may not do both (creator cannot self-approve their own stakeholder registration; the person who sets approval authority should not be the sole approver)
13. Audit Requirements for Permission Changes
14. Permission Test Matrix — the negative tests that must exist in document 09
15. Open Questions, Change Log

### Must Include

- Super Admin cross-tenant access requires explicit impersonation with a CRITICAL audit entry
- No external role has any `STK.*` write permission except viewing their own record
- `STK.BLACKLIST` restricted to Company Admin and Project Director, with mandatory reason and two-step confirmation
- `STK.EDIT_PERFORMANCE_WEIGHTS` restricted to Company Admin only
- Project Manager scope limited to projects where they hold an active assignment

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 02 and 04]

TASK: Write 07-RBAC-Matrix.md for the DCOS Stakeholder Management module.
Document code DCOS-STK-RBAC-001.

Follow exactly Section 5.7 of the master prompt.

Constraints:
- Full matrix: all 20 DCOS roles across all 20 permission codes from Part 4.9
- Every conditional permission footnoted with the exact condition
- Data scope rules expressed as SQL predicates matching the RLS policies in document 04
- Separate access model for external stakeholder users
- Include the negative permission test list for document 09
- Output pure Markdown, no commentary before or after the document
```

---

## 5.8 — `08-API-Reference.md`

**Document Code:** DCOS-STK-API-001
**Depends on:** 02, 04, 05, 07
**Author persona:** Senior System Architect / Backend Engineer

### Required Sections

1. Document Control Header
2. API Conventions — base URL, versioning, content type, date format (ISO 8601 UTC), pagination (cursor), sorting, filtering syntax, idempotency keys
3. Authentication and Authorisation — JWT structure, required claims (`sub`, `tenant_id`, `role`, `project_scope`), tenant validation rule (never from request body)
4. Standard Error Model — error envelope, error code catalogue, HTTP status mapping
5. Rate Limiting — 200 req/min/tenant, headers, 429 behaviour
6. Endpoint Reference — minimum 25 endpoints, each with:
   - Method, path, purpose
   - Required permission code
   - Path/query/body parameters with types and validation
   - Request example (JSON)
   - Success response example with status code
   - All error responses with conditions
   - Audit events emitted
   - Notification events emitted
   - Idempotency and concurrency notes
7. Endpoint groups:
   - Stakeholder CRUD and search
   - Duplicate check
   - Contacts
   - Compliance documents (upload, list, expiry)
   - Project assignments
   - Approval authority
   - Access scope and WBS scope
   - Workflow responsibilities
   - External user provisioning and revocation
   - Status transitions (suspend, reinstate, blacklist, unblacklist)
   - Performance retrieval
   - Resolution service endpoints (approvers, notification recipients, access check)
   - Bulk import
   - Export
   - Audit retrieval
8. Webhook / Event Publication — event codes, payload, delivery, retry, signature verification
9. Realtime Channels — Supabase channel names and subscription payloads
10. Versioning and Deprecation Policy
11. Postman / OpenAPI Snippet — an OpenAPI 3.1 fragment covering at least the core stakeholder endpoints
12. Open Questions, Change Log

### Must Include

- All paths follow Part 4.8
- Every write endpoint accepts an `Idempotency-Key` header
- Optimistic concurrency via `If-Match` / `version` field on updates
- `POST /api/v1/stakeholder-resolution/approvers` documented as the highest-traffic endpoint with caching guidance
- Explicit 403 vs 404 policy: cross-tenant resources return 404, never 403, to avoid leaking existence

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 02, 04, 05, and 07]

TASK: Write 08-API-Reference.md for the DCOS Stakeholder Management module.
Document code DCOS-STK-API-001.

Follow exactly Section 5.8 of the master prompt.

Constraints:
- Minimum 25 endpoints, using exactly the canonical paths in Part 4.8
- Every endpoint: permission code, parameters, request example, success response,
  every error response, audit events, notification events, concurrency notes
- Field names must match document 04 exactly — invent nothing
- Cross-tenant resources return 404, never 403
- Include an OpenAPI 3.1 fragment for the core endpoints
- Output pure Markdown with fenced json/yaml code blocks, no commentary
```

---

## 5.9 — `09-Test-Plan.md`

**Document Code:** DCOS-STK-TEST-001
**Depends on:** 02, 03, 04, 07, 08
**Author persona:** QA Lead / Test Architect

### Required Sections

1. Document Control Header
2. Test Strategy and Objectives
3. Scope — in scope, out of scope, assumptions
4. Test Levels — unit, integration, API, UI/E2E, performance, security, UAT
5. Test Environment and Data — tenants, projects, WBS trees, seeded stakeholders, external user accounts
6. Entry and Exit Criteria per level
7. **Test Case Catalogue** — minimum 80 cases, each with: ID `TC-STK-<AREA>-NNN`, title, related FR/UC, precondition, steps, test data, expected result, priority, type, automation candidate
8. Test areas and minimum counts:
   - Register and search — 8
   - Create and duplicate detection — 8
   - Contacts and compliance documents — 6
   - Project assignment — 10
   - Approval authority — 8
   - Access control and WBS scope — 10
   - Workflow responsibility — 4
   - External user provisioning — 6
   - Status lifecycle and blacklist — 8
   - Performance tracking — 5
   - Integration and resolution service — 8
   - Permission / negative tests — 12
   - Multi-tenant isolation — 6
   - Performance and load — 5
   - Mobile and offline — 4
9. Negative and Security Test Suite — cross-tenant read, JWT tampering, IDOR on `stakeholder_id`, privilege escalation, blacklisted-stakeholder assignment attempt, external user WBS scope bypass, direct table access bypassing the resolution service
10. Performance Test Cases — register load with 5,000 stakeholders under 1.5 s, instant search under 300 ms, resolution service under 200 ms at p95, 500 concurrent users
11. Integration Test Scenarios — full chains: assign approver → submit document → approval resolves → notification delivered → audit written
12. UAT Scenarios by Role — Project Manager, Document Controller, Company Admin, external Consultant
13. Regression Suite Definition
14. Defect Severity Definitions and Triage
15. Traceability Matrix — TC ↔ FR ↔ UC ↔ BR
16. Open Questions, Change Log

### Must Include

- Automated cross-tenant data leak tests declared as a CI/CD gate, per the gap analysis requirement
- A test proving a suspended stakeholder's in-flight approvals escalate rather than stall
- A test proving a blacklisted organisation cannot be re-registered under a name variant
- A test proving the zero-approver condition raises a CRITICAL notification

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 02, 03, 04, 07, and 08]

TASK: Write 09-Test-Plan.md for the DCOS Stakeholder Management module.
Document code DCOS-STK-TEST-001.

Follow exactly Section 5.9 of the master prompt, meeting the minimum test case count
for every listed area (80+ total).

Constraints:
- Every test case: ID, title, related FR/UC, precondition, steps, test data,
  expected result, priority, type, automation candidate
- Include the full negative/security suite and the four mandatory must-include tests
- Include a complete traceability matrix
- Output pure Markdown, no commentary before or after the document
```

---

## 5.10 — `10-Deployment-Notes.md`

**Document Code:** DCOS-STK-DEP-001
**Depends on:** 04, 05, 08
**Author persona:** DevOps Engineer / Lead Developer

### Required Sections

1. Document Control Header
2. Deployment Overview and Architecture Diagram
3. Environments — local, dev, staging, production; differences and data policy
4. Prerequisites — Node version, PostgreSQL version, Supabase project configuration, storage buckets
5. Configuration and Environment Variables — full table: name, purpose, example, secret/non-secret, per environment
6. Storage Configuration — bucket for stakeholder compliance documents, path convention `tenant/{tenant_id}/stakeholders/{stakeholder_id}/...`, signed URL expiry, virus scanning, size limits
7. Database Migration Plan — ordered migration file list, forward and rollback scripts, RLS enablement step, seed data step, verification queries
8. Feature Flags — `stk_external_user_provisioning`, `stk_performance_scoring`, `stk_bulk_import`, with default states per environment
9. Deployment Sequence — step-by-step, including the order relative to Auth/RBAC and Project Setup modules
10. Zero-Downtime Considerations — additive migrations first, backfill, then constraint enforcement
11. Backfill and Data Migration from Legacy — spreadsheet import procedure, validation, dry-run mode, reconciliation report
12. Smoke Test Checklist — the 12 checks that must pass immediately post-deploy
13. Rollback Procedure — trigger conditions, steps, data implications, point of no return
14. Monitoring and Alerting — metrics (resolution service latency, zero-approver events, failed access checks, expiring compliance documents), log queries, alert thresholds, on-call routing
15. Scheduled Jobs — nightly performance score recomputation, daily compliance expiry scan, weekly orphaned-assignment report; schedule, timeout, failure handling, tenant scoping
16. Backup and Recovery — RPO 1 hour, RTO 4 hours, restore verification
17. Security Hardening Checklist — RLS verified enabled on all 15 tables, service-role key never exposed to client, signed URLs only
18. Post-Deployment Verification and Sign-off
19. Open Questions, Change Log

### Must Include

- An explicit verification query confirming RLS is enabled on every stakeholder table before traffic is allowed
- Background jobs must be tenant-scoped and must not leak cross-tenant, per the gap analysis requirement
- Rollback plan for the case where the resolution service degrades and blocks approvals platform-wide

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 04, 05, and 08]

TASK: Write 10-Deployment-Notes.md for the DCOS Stakeholder Management module.
Document code DCOS-STK-DEP-001.

Follow exactly Section 5.10 of the master prompt.

Constraints:
- Ordered migration list with forward and rollback scripts
- Complete environment variable table with per-environment values
- 12-item smoke test checklist with expected results
- Include the RLS verification query and the tenant-scoped job requirement
- Target: Supabase PostgreSQL 15, Next.js on Vercel, React Native mobile
- Output pure Markdown with fenced bash/sql code blocks, no commentary
```

---

## 5.11 — `11-SOP.md`

**Document Code:** DCOS-STK-SOP-001
**Depends on:** 02, 03, 07
**Author persona:** Construction Operations Consultant

### Required Sections

1. Document Control Header
2. Purpose and Applicability
3. Roles and Responsibilities — RACI table for stakeholder data governance
4. Data Governance Policy — who owns stakeholder master data, naming conventions for organisation names, mandatory fields, review frequency
5. **Standard Operating Procedures** — minimum 12, each with: SOP ID, purpose, trigger, responsible role, frequency, prerequisites, numbered steps, decision points, records produced, escalation path, common errors:
   - SOP-STK-01 Register a new stakeholder organisation
   - SOP-STK-02 Verify and approve a stakeholder registration
   - SOP-STK-03 Assign a stakeholder to a project at mobilisation
   - SOP-STK-04 Define the project approval matrix before first document issue
   - SOP-STK-05 Configure WBS-restricted access for a subcontractor
   - SOP-STK-06 Provision and revoke an external user account
   - SOP-STK-07 Monthly compliance document expiry review
   - SOP-STK-08 Monthly stakeholder performance review
   - SOP-STK-09 Handle an approval bottleneck — delegation and escalation
   - SOP-STK-10 Terminate an assignment and hand over open responsibilities
   - SOP-STK-11 Suspend or blacklist a stakeholder
   - SOP-STK-12 Quarterly stakeholder register audit and de-duplication
   - SOP-STK-13 Respond to a client or auditor traceability request
   - SOP-STK-14 Project close-out — archive stakeholder assignments
6. Project Mobilisation Checklist — the stakeholder setup that must be complete before construction start
7. Monthly Governance Calendar — what happens on which working day
8. Quality Records and Retention — what is kept, for how long, where
9. Escalation Matrix — issue type → first responder → escalation → timeframe
10. Common Mistakes and How to Prevent Them
11. Compliance Mapping — ISO 9001 clause references for document and record control
12. Open Questions, Change Log

### Must Include

- The rule that no document may be issued for construction before the project approval matrix is complete
- The rule that a stakeholder must exist and be assigned before any workflow can involve them
- Named responsibility for the stakeholder register: Document Controller maintains, Project Manager approves assignments, Company Admin approves registrations and blacklists

### Copy-Paste Prompt

```
[PASTE PART 1, PART 2, PART 3, PART 4]
[PASTE APPROVED 02, 03, and 07]

TASK: Write 11-SOP.md for the DCOS Stakeholder Management module.
Document code DCOS-STK-SOP-001.

Follow exactly Section 5.11 of the master prompt, writing all 14 SOPs in full.

Constraints:
- Every SOP: ID, purpose, trigger, responsible role, frequency, prerequisites,
  numbered steps, decision points, records produced, escalation path, common errors
- Written for a real construction company's document controller and project manager
  to follow without IT support
- Include the RACI table, mobilisation checklist, and monthly governance calendar
- Output pure Markdown, no commentary before or after the document
```

---

## 5.12 — `12-Training-Guide.md`

**Document Code:** DCOS-STK-TRN-001
**Depends on:** 03, 06, 07, 11
**Author persona:** Enterprise SaaS Trainer / Construction Operations Consultant

### Required Sections

1. Document Control Header
2. Training Objectives and Learning Outcomes
3. Audience Analysis — prior system exposure, device availability, language considerations (English / Khmer bilingual delivery)
4. Training Paths by Role — duration, modules, prerequisites, assessment:
   - Company Admin (full module, 90 min)
   - Project Manager (assignment and authority, 60 min)
   - Document Controller (register maintenance and daily use, 90 min)
   - Discipline Manager (responsibility and performance, 45 min)
   - Procurement Officer (supplier stakeholders, 45 min)
   - Site Supervisor (mobile directory, 20 min)
   - External users — Consultant / Client / Subcontractor / Supplier (30 min onboarding)
5. Core Concepts Lesson — why this is a responsibility control panel, not a contact list; the four control questions; how assignment drives every workflow in DCOS
6. Step-by-Step Walkthroughs — screenshot placeholders marked `[SCREENSHOT: SCR-STK-NNN — description]`, one walkthrough per key task, matching the SOPs
7. Hands-On Exercises — minimum 10, each with scenario, task, expected outcome, and self-check
8. Worked Scenario — full Tower A mobilisation exercise from empty register to complete approval matrix
9. Quick Reference Cards — one page per role, printable: what you can do, what you cannot, where to click, who to call
10. FAQ — minimum 20 real questions with answers
11. Troubleshooting Guide — symptom → likely cause → resolution → escalate to
12. Glossary — construction and system terms, bilingual where useful
13. Assessment — 20 knowledge-check questions with answer key, plus a practical assessment task per role
14. Trainer Notes — timing, common confusions, demo data setup, delivery tips
15. Post-Training Support Plan — floor-walking period, super-user network, refresher schedule
16. Open Questions, Change Log

### Must Include

- The single most important concept, repeated in every path: *if the stakeholder is not assigned with an approval level, the workflow will stop and nobody will be notified — that is the system working correctly, not a bug*
- Exercises that use realistic Cambodian construction project data
- External user onboarding material written for someone who has never used the platform and may never log in again for two weeks

### Copy-Paste Prompt

```
[PASTE PART 1, PART 2, PART 3, PART 4]
[PASTE APPROVED 03, 06, 07, and 11]

TASK: Write 12-Training-Guide.md for the DCOS Stakeholder Management module.
Document code DCOS-STK-TRN-001.

Follow exactly Section 5.12 of the master prompt.

Constraints:
- Seven role-based training paths with duration, content, and assessment
- Minimum 10 hands-on exercises with realistic construction scenarios
- Minimum 20 FAQ entries and 20 assessment questions with answer key
- Screenshot placeholders in the format [SCREENSHOT: SCR-STK-NNN — description]
- Printable quick reference card per role
- Plain, practical language — the audience is site and office staff, not developers
- Output pure Markdown, no commentary before or after the document
```

---

# PART 6 — CONSISTENCY CONTRACT AND QUALITY GATE

## 6.1 Frozen Artefacts

Once a document is approved, the following become frozen and may only change through the Change Log with a version bump propagated to all affected documents:

| Artefact | Frozen By | Consumed By |
|---|---|---|
| Business rule IDs `BRL-STK-NNN` | 01 | 02, 03, 09, 11 |
| Functional requirement IDs `FR-STK-NNN` | 02 | 03, 06, 08, 09 |
| Screen IDs `SCR-STK-NNN` | 02 | 06, 09, 12 |
| Table and column names | 04 | 05, 08, 09, 10 |
| Enum values | Part 4 / 04 | all |
| Permission codes | Part 4 / 07 | 02, 06, 08, 09, 11 |
| Event codes | Part 4 / 05 | 02, 08, 09, 10 |
| API paths | Part 4 / 08 | 05, 09, 10 |
| Test case IDs `TC-STK-*` | 09 | 10 |
| SOP IDs `SOP-STK-NN` | 11 | 12 |

## 6.2 Per-Document Quality Gate

A document is not accepted until all of the following pass:

- [ ] Control header complete, document code correct
- [ ] All required sections present, none merged or skipped
- [ ] Depth target met (Part 3.4)
- [ ] All must-include items present
- [ ] Only canonical enums, statuses, permission codes, event codes, table names, and API paths used
- [ ] Every identifier referenced from another document actually exists there
- [ ] Every workflow documents rejection, timeout, and departure paths
- [ ] Every state-changing action names its audit event
- [ ] Multi-tenant enforcement stated wherever data is accessed
- [ ] No banned generic phrases
- [ ] Construction terminology used correctly throughout
- [ ] Open Questions and Change Log sections present
- [ ] Ends with `**End of Document**`

## 6.3 Cross-Document Verification Prompt

Run this after all 12 documents exist:

```
You are a documentation auditor for the DCOS Stakeholder Management module.

INPUT: the 12 documents 01 through 12.

TASK: Produce a consistency audit report containing:
1. Identifier integrity — every FR, UC, BRL, SCR, TC, SOP, permission code, event code,
   table name, column name, and API path referenced anywhere; flag every reference
   that has no definition, and every definition never referenced.
2. Enum drift — any status, type, approval level, or access level used outside the
   canonical set in Part 4.
3. Contradictions — any statement in one document that conflicts with another.
4. Coverage gaps — any FR without a use case, without a test case, or without an
   endpoint; any endpoint without a permission code; any table without an RLS policy.
5. Depth compliance — any document below its Part 3.4 depth target.
6. A prioritised remediation list.

Output as a Markdown report. Be specific: quote the document, section, and line context
for every finding. Do not fix anything — report only.
```

## 6.4 Suggested Session Sequence

| Session | Output | Inputs to Paste |
|---|---|---|
| 1 | 01-Business-Requirement.md | Parts 1–4 |
| 2 | 02-Functional-Specification.md | Parts 1–4 + 01 |
| 3 | 03-Use-Cases.md | Parts 1–4 + 01 + 02 |
| 4 | 04-Database-Schema.md | Parts 1, 3, 4 + 02 |
| 5 | 07-RBAC-Matrix.md | Parts 1, 3, 4 + 02 + 04 |
| 6 | 05-Integration-Specification.md | Parts 1, 3, 4 + 02 + 04 |
| 7 | 08-API-Reference.md | Parts 1, 3, 4 + 02 + 04 + 05 + 07 |
| 8 | 06-UI-UX-Design.md | Parts 1–4 + 02 + 03 + 07 |
| 9 | 09-Test-Plan.md | Parts 1, 3, 4 + 02 + 03 + 04 + 07 + 08 |
| 10 | 10-Deployment-Notes.md | Parts 1, 3, 4 + 04 + 05 + 08 |
| 11 | 11-SOP.md | Parts 1–4 + 02 + 03 + 07 |
| 12 | 12-Training-Guide.md | Parts 1–4 + 03 + 06 + 07 + 11 |
| 13 | Consistency audit report | All 12 |

If context limits prevent pasting full upstream documents, paste their **canonical extracts only**: the ID tables, enum lists, table/column lists, permission matrix, and endpoint index.

---

## Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1 | 2026-08-04 | Initial issue — 12-document prompt pack for Stakeholder Management | System Architect |

---

**End of Document**
