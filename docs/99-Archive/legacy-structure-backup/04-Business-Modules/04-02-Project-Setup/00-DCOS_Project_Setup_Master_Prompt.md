# DCOS — Project Setup Module
## Master Documentation Prompt (12-Document Set)

**Prompt Code:** DCOS-PROMPT-PRJ-001
**Version:** R1
**Module:** 04-02 — Project Setup (R1 Module Map No. 05 — Foundation Phase)
**Target Output:** 12 controlled documents per `Document_Conent.md`
**Base References:** `DCOS_System_Architecture_Module_Design_R0.md` (Section 7), `DCOS_Gap_Analysis_R1.docx`
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

Rationale: the business requirement defines the *why*, the functional spec defines the *what*, use cases define the *behaviour*, and the schema plus RBAC matrix freeze the *data and permission contract*. Every later document consumes those frozen artefacts. Never generate the API reference before the schema exists — it will invent field names.

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
Deployment: Cloud-based web application with offline-capable mobile support

ARCHITECTURE PRINCIPLES (NON-NEGOTIABLE)
- One unified platform, modular by discipline
- WBS is the single spine — every record links to project + WBS + discipline + responsible + status
- Multi-tenant with PostgreSQL row-level security (tenant_id on every table)
- Shared engines: Approval Workflow, Notification Matrix, Audit Trail (append-only)
- Admin-configurable business rules — never hard-code workflows, statuses, or chains
- Modular monolith first; extract services only when a module becomes the bottleneck

TECH STACK
Frontend: Next.js 14 + React + TypeScript + Tailwind + shadcn/ui
Backend: Supabase (MVP) → Node.js/NestJS (scale)
Database: PostgreSQL 15 on Supabase, RLS enforced
Mobile: React Native, offline-first sync
Storage: Supabase Storage / S3-compatible, CDN delivery, signed URLs
Auth: JWT + RBAC; tenant_id validated from token, never from request body
Realtime: Supabase Realtime channels
Deployment: Vercel + Docker

AI ROLE
Act as Senior System Architect, Construction ERP Specialist, and Enterprise SaaS
Designer. Think enterprise-grade, use real construction workflow logic and
terminology, avoid generic software answers, prioritise practical implementation.
```

---

# PART 2 — MODULE SCOPE, BOUNDARIES, AND NON-GOALS

## 2.1 Module Purpose

Project Setup is the **entry gate of every project into DCOS**. No WBS node, task, document, PR, inspection, or payment can exist without a project context. The module owns the project registry, the tender-to-award lifecycle, the contract header, the project team roster, lifecycle phases with stage gates, milestones, the project working calendar, and the document/record numbering rules that every other module consumes.

## 2.2 In Scope

| Area | Content |
|---|---|
| Project registry | Multi-project portfolio, project code, project profile, classification, status |
| Tender lifecycle | Tender registration, bid tracking, win/loss, conversion of tender → awarded project |
| Contract header | Contract type, original value, currency, dates, key conditions references |
| Project team | PM assignment, role-on-project roster, join/leave dates, single-active-PM rule |
| Lifecycle phases | Initiation → Planning → Execution → Monitoring & Controlling → Closure, with configurable stage-gate checklists |
| Milestones | Contractual and internal milestones with achieved/missed tracking |
| Project calendar | Working days, working hours, project-specific holidays (feeds Planning & HR) |
| Numbering rules | Project-scoped numbering patterns for documents, RFIs, transmittals, PRs, POs |
| Project settings | Per-project configuration overrides (retention %, approval chain selection, notification rules reference) |
| Project dashboard | Setup-completeness widget, status summary, phase/gate position |

## 2.3 Out of Scope (Non-Goals)

| Excluded | Owned By |
|---|---|
| WBS tree creation and management | Module 06 — WBS Management |
| Tender BOQ pricing and cost estimation | Module 08 — Tender Cost Estimation |
| Bid document assembly and submission package | Module 09 — Bid Submission & Award |
| Stakeholder master records | Module 04 — Stakeholder Setup (Project Setup only *links* stakeholders to projects) |
| BOQ, budget lines, cost control | Module 29/30 — BOQ Engine, Budget & Cost Control |
| Employer instructions, notices, time bars | Module 35 — Contract Administration |
| Variation orders and IPC | Modules 32/34 — Commercial layer |
| Baseline schedule and CPM | Module 23 — Planning & Scheduling |

**Boundary rule:** Project Setup stores the *contract header* (identity, type, value, dates). Deep contract administration (instructions, notices, entitlements) is Module 35. Project Setup stores the *budget reference* only; budget lines live in the BOQ/Budget modules.

## 2.4 Why This Module Is Foundation Phase

1. Every table in DCOS carries `project_id` — the registry must exist first.
2. Document numbering integrity (`P001-STR-DWG-B01-L05-001-R02`) depends on project code and numbering rules frozen at setup.
3. RBAC resolution = Role + **Project access** + Discipline + Workflow responsibility — project team roster is half of the permission formula.
4. Tender → Awarded conversion is the moment budget baseline, WBS, and team obligations are triggered; the gap analysis rates the pre-contract lifecycle as a High-risk gap.

---

# PART 3 — GLOBAL WRITING RULES (ALL 12 DOCUMENTS)

1. **Language:** Professional construction-industry English. Use QS/PM terminology correctly (award, LOA, practical completion, DLP, retention, mobilisation).
2. **Format:** Pure Markdown. Tables for structured data. Fenced code blocks for DDL, JSON, and API examples. No decorative emojis.
3. **Document control header** on every document: code, version R1, module, author persona, status, base references, change log table.
4. **Canonical data discipline:** Statuses, table names, field names, event codes, and role names come from Part 4 only. If a document needs something not in Part 4, add it AND record it in that document's change log with justification.
5. **Traceability:** Every functional requirement gets an ID (`PRJ-FR-001`). Use cases reference FR IDs. Test cases reference use case IDs. The API reference maps endpoints to FR IDs.
6. **Multi-tenancy:** Every design decision must state how tenant isolation is preserved. No exceptions.
7. **Audit:** Every state-changing operation must name its audit event code from Part 4.10.
8. **No invention of adjacent modules:** When touching WBS, BOQ, Stakeholder, or Contract Admin, reference their module number and treat their internals as a black-box contract.
9. **Realism:** Examples use realistic Cambodian/SEA construction context (USD contract, KHR costs, Tower A, Building B1, Level 05) consistent with the R0 examples.
10. **Length discipline:** Depth over padding. A section with nothing meaningful to say is one sentence, not a filler paragraph.

---

# PART 4 — CANONICAL REFERENCE DATA (SINGLE SOURCE OF TRUTH)

## 4.1 Module Identity

| Attribute | Value |
|---|---|
| Module Code | PRJ |
| Module Name | Project Setup |
| Document Prefix | DCOS-PRJ |
| Phase | Foundation |
| R1 Module Map No. | 05 |
| Internal Folder Code | 04-02-Project-Setup |

## 4.2 Project Types

| Code | Type | Description |
|---|---|---|
| TENDER | Tender / Pre-Contract | Registered opportunity being bid; no execution records allowed |
| AWARDED | Awarded / Post-Contract | Live contract; full module access |
| INTERNAL | Internal Project | Company-owned work (head office fit-out, R&D); no client billing chain |

## 4.3 Canonical Project Status List and Transitions

```
DRAFT            Project shell created, setup incomplete
TENDER           Registered tender, bid in preparation
BID_SUBMITTED    Bid submitted, awaiting result
LOST             Tender lost — read-only, archived per retention policy
AWARDED          Award received (LOA) — conversion checklist active
ACTIVE           Execution running — all modules enabled
ON_HOLD          Suspended — task creation blocked, existing records read/update-limited
COMPLETED        Practical completion achieved — DLP phase, restricted record creation
CLOSED           Final account settled, handover done — read-only except DLP module
ARCHIVED         Retention storage — read-only, admin access only
CANCELLED        Terminated before/without completion — read-only with reason
```

**Allowed transitions:**

| From | To | Guard |
|---|---|---|
| DRAFT | TENDER, ACTIVE (internal), CANCELLED | Setup checklist for phase passed |
| TENDER | BID_SUBMITTED, CANCELLED | Bid record exists |
| BID_SUBMITTED | AWARDED, LOST | Result recorded with date + reference |
| AWARDED | ACTIVE | Award conversion checklist passed (contract, PM, WBS root, numbering rules frozen) |
| ACTIVE | ON_HOLD, COMPLETED | Hold reason mandatory; completion requires PM + Director approval |
| ON_HOLD | ACTIVE, CANCELLED | Resume/termination approval |
| COMPLETED | CLOSED | Final account + handover confirmation |
| CLOSED | ARCHIVED | Retention trigger, admin action |

**Rules:** all transitions emit `PROJECT_STATUS_CHANGED` + specific event; all transitions write to `project_status_history`; no status may be skipped except DRAFT→ACTIVE for INTERNAL type.

## 4.4 Lifecycle Phases and Stage Gates

| Phase Code | Phase | Gate to Exit |
|---|---|---|
| INIT | Initiation | Go/No-Go decision recorded |
| PLAN | Planning | WBS root created, baseline dates, budget reference, team assigned |
| EXEC | Execution | — (runs with MONI in parallel) |
| MONI | Monitoring & Controlling | — |
| CLOS | Closure | Handover package, final account, lessons learned entry |

Each gate is a configurable checklist (`project_checklists` / `project_checklist_items`) — items are admin-configurable per project type, never hard-coded.

## 4.5 Contract Types

```
LUMP_SUM          Lump Sum / Fixed Price
UNIT_RATE         Unit Rate / Remeasurement
DESIGN_BUILD      Design & Build
COST_PLUS         Cost Plus / Reimbursable
EPC               Engineer-Procure-Construct
TURNKEY           Turnkey
NSC               Nominated Subcontract (when company acts as NSC)
```

## 4.6 Milestone Types

```
CONTRACTUAL       Written into contract — missing has LD exposure
INTERNAL          Company target milestone
PAYMENT           Payment-linked milestone (advance, stage payment)
HANDOVER          Sectional or full handover
AUTHORITY         Regulatory milestone (permit, OC)
```

Milestone statuses: `PLANNED → ACHIEVED | MISSED | CANCELLED` (MISSED requires reason; CONTRACTUAL misses raise Critical notification).

## 4.7 Canonical Table Set (15 Tables)

Use exactly these names. Additions require a change-log entry with justification.

| # | Table | Purpose |
|---|---|---|
| 1 | `projects` | Project master registry |
| 2 | `project_status_history` | Every status transition with actor, reason, timestamp |
| 3 | `project_phases` | Phase instance per project with gate state |
| 4 | `project_checklists` | Gate/setup checklist instances |
| 5 | `project_checklist_items` | Individual checklist items with completion evidence |
| 6 | `project_milestones` | Contractual and internal milestones |
| 7 | `project_team_members` | Role-on-project roster (user, role, from/to dates) |
| 8 | `project_contracts` | Contract header — type, value, currency, dates |
| 9 | `project_contract_revisions` | Contract value/date revisions with reason (VO summary reference only) |
| 10 | `tender_records` | Tender registration — client, submission deadline, bond, status |
| 11 | `bid_submissions` | Bid events — submitted value, date, result, win/loss reason |
| 12 | `project_calendars` | Working-day pattern and working hours per project |
| 13 | `project_calendar_holidays` | Project-specific non-working days |
| 14 | `project_numbering_rules` | Numbering patterns per record type per project |
| 15 | `project_settings` | Key-value configuration overrides per project |

**Mandatory columns on every table:** `id uuid PK`, `tenant_id uuid NOT NULL`, `created_at`, `created_by`, `updated_at`, `updated_by`. RLS policy on `tenant_id` on all 15.

**Key constraints to include in the schema document:**
- `projects.project_code` unique per tenant
- Exactly one active PM per project (partial unique index on `project_team_members` where `role = 'PM' AND end_date IS NULL`)
- `project_contracts.original_value >= 0`; currency FK to Multi-Currency module currency master
- `project_numbering_rules` immutable once first record issued against the pattern (enforced by application + audit)
- Status column constrained to the Part 4.3 list via CHECK or enum
- Soft delete only (`is_archived`), never hard delete a project with child records

## 4.8 Roles and Permission Summary

| Role | Create | Edit | Status Change | Team Manage | Numbering Config | View |
|---|---|---|---|---|---|---|
| Super Admin | ✓ | ✓ | ✓ | ✓ | ✓ | All tenants (impersonation + audit) |
| Company Admin | ✓ | ✓ | ✓ | ✓ | ✓ | All company projects |
| Project Director | ✓ | ✓ | ✓ (incl. HOLD/COMPLETE approval) | ✓ | — | All company projects |
| Project Manager | — | ✓ (assigned) | Request only | ✓ (assigned) | — | Assigned projects |
| Discipline Manager | — | — | — | — | — | Assigned projects |
| QS Engineer | — | Contract header (draft) | — | — | — | Assigned projects |
| Document Controller | — | — | — | — | Propose | Assigned projects |
| Engineer / Staff | — | — | — | — | — | Assigned projects |
| Client / Consultant | — | — | — | — | — | Own project summary only |
| Viewer | — | — | — | — | — | Granted projects, read-only |

## 4.9 Numbering Rule Tokens

Patterns are composed of tokens; example `{PROJECT}-{DISCIPLINE}-{TYPE}-{BUILDING}-{LEVEL}-{SEQ:3}-R{REV}` → `P001-STR-DWG-B01-L05-001-R02`.

```
{PROJECT}      Project code
{DISCIPLINE}   Discipline code (ARC/STR/MEP/...)
{TYPE}         Record type code (DWG/RFI/TRN/PR/PO/...)
{BUILDING}     WBS building code
{LEVEL}        WBS level code
{ZONE}         WBS zone code
{SEQ:n}        Zero-padded sequence, scope = pattern instance
{REV}          Revision number
{YYYY} {YY} {MM}  Date tokens
```

## 4.10 Audit Event Codes

```
PROJECT_CREATED            PROJECT_UPDATED           PROJECT_STATUS_CHANGED
PROJECT_AWARDED            PROJECT_ON_HOLD           PROJECT_RESUMED
PROJECT_COMPLETED          PROJECT_CLOSED            PROJECT_ARCHIVED
PROJECT_CANCELLED          TENDER_REGISTERED         BID_SUBMITTED
TENDER_WON                 TENDER_LOST               CONTRACT_ADDED
CONTRACT_REVISED           TEAM_MEMBER_ASSIGNED      TEAM_MEMBER_REMOVED
PM_CHANGED                 PHASE_GATE_PASSED         CHECKLIST_ITEM_COMPLETED
MILESTONE_CREATED          MILESTONE_ACHIEVED        MILESTONE_MISSED
CALENDAR_UPDATED           HOLIDAY_ADDED             NUMBERING_RULE_CREATED
NUMBERING_RULE_LOCKED      PROJECT_SETTING_CHANGED
```

Severity mapping: status changes, PM_CHANGED, CONTRACT_REVISED, NUMBERING_RULE_LOCKED = **High**; PROJECT_CANCELLED, PROJECT_ARCHIVED, MILESTONE_MISSED (contractual) = **Critical**; the rest = Medium/Low per Audit Engine rules.

## 4.11 Notification Rules (Module Contribution to Notification Matrix)

| Event | Notify | Priority | Channels |
|---|---|---|---|
| Project created | Company Admin, Project Director | Normal | In-app |
| Tender deadline approaching (configurable days) | Tender owner, Director | High | In-app, Telegram |
| Bid result recorded (won) | Director, PM, QS, Company Admin | High | In-app, Email |
| Award conversion checklist incomplete at N days | PM, Director | High | In-app, Email |
| PM assigned / changed | New PM, old PM, Director | High | In-app, Email |
| Project placed on hold / resumed | Full project team | High | In-app, Email, Telegram |
| Contractual milestone due in 14/7/1 days | PM, Director, QS | High→Critical | In-app, Email, Telegram |
| Contractual milestone missed | PM, Director, Company Admin | Critical | In-app, Email, Telegram |
| Project completed / closed | Team, Director, Account | Normal | In-app, Email |
| Numbering rule locked | Document Controller, PM | Normal | In-app |

## 4.12 Module KPIs

- Setup completeness % per project (checklist-driven)
- Tender win rate (won ÷ submitted), by client and project type
- Average tender-to-award duration
- Award-to-ACTIVE conversion duration (mobilisation lag)
- Contractual milestone on-time rate
- Projects by status / phase (portfolio view)
- Contract value pipeline: TENDER vs BID_SUBMITTED vs AWARDED vs ACTIVE

---

# PART 5 — TWELVE DOCUMENT PROMPT BLOCKS

> Copy one block per session together with Part 1, Part 3, Part 4, and dependencies.

---

## 5.1 — `01-Business-Requirement.md`

**Document Code:** DCOS-PRJ-BRD-001
**Depends on:** none
**Author persona:** Construction Operations Consultant + Senior System Architect

```
Generate 01-Business-Requirement.md for the DCOS Project Setup module.
Document code DCOS-PRJ-BRD-001.

Required sections:
1. Document Control Header
2. Business Context — the fragmented reality: tenders tracked in Excel, project codes
   invented ad hoc, contract values only in the QS's head, no single project registry,
   award-to-mobilisation chaos. Reference the Gap Analysis finding that the
   pre-contract lifecycle is a High-risk gap.
3. Business Objectives — measurable (e.g. 100% of projects registered before any
   record creation; tender win-rate visibility; zero duplicate project codes;
   award conversion inside 10 working days)
4. Stakeholder Analysis — per role in Part 4.8: goals, pains, gains
5. Business Rules — minimum 20 numbered rules (BR-PRJ-001…), covering project code
   uniqueness, single active PM, tender→award conversion gate, numbering freeze,
   status transition guards, hold/termination approvals, internal project shortcut
6. Business Process Narratives — three: (a) tender registration to award,
   (b) awarded project activation, (c) project hold and closure
7. Success Criteria and KPIs — from Part 4.12
8. Assumptions, Constraints, Dependencies — Stakeholder module (client link),
   WBS module (root node), Multi-Currency (currency master), Admin Config
9. Out of Scope — restate Part 2.3
10. Change Log

Constraints: business language only — no table names, no API. Every rule testable.
Output pure Markdown.
```

---

## 5.2 — `02-Functional-Specification.md`

**Document Code:** DCOS-PRJ-FS-001
**Depends on:** 01
**Author persona:** Senior System Architect

```
Generate 02-Functional-Specification.md for the DCOS Project Setup module.
Document code DCOS-PRJ-FS-001.

Required sections:
1. Document Control Header
2. Functional Overview — module position in Foundation phase, consumers of its data
3. Functional Requirements — ID format PRJ-FR-001, grouped:
   FR Group A: Project Registry (create wizard, code validation, classification, search/filter, portfolio list)
   FR Group B: Tender Lifecycle (register tender, bond tracking, deadline alerts, bid submission record, win/loss capture, lost-tender archival)
   FR Group C: Award Conversion (LOA capture, conversion checklist, contract header creation, team assignment enforcement, numbering freeze, WBS root trigger)
   FR Group D: Status & Phase Management (transition engine per Part 4.3, phase gates per Part 4.4, hold/resume with approval, closure workflow)
   FR Group E: Team Roster (assign/remove members, PM uniqueness, role-on-project, effective dating, RBAC hand-off)
   FR Group F: Contract Header (contract types per Part 4.5, value and currency, revision tracking with reason, read model for commercial modules)
   FR Group G: Milestones (types per Part 4.6, due tracking, achieved/missed workflow, LD-exposure flag)
   FR Group H: Calendar (working pattern, holidays, inheritance from company calendar with override)
   FR Group I: Numbering Rules (pattern builder with Part 4.9 tokens, preview, lock-on-first-use, per-record-type rules)
   FR Group J: Settings & Dashboard (per-project overrides, setup-completeness widget, portfolio dashboard)
   Each FR: ID, title, description, priority (MoSCoW), acceptance criteria, audit events emitted (Part 4.10), notifications triggered (Part 4.11)
4. Status Machines — projects (Part 4.3), milestones, checklist items — with Mermaid state diagrams
5. Validation Rules table
6. Error and Edge Cases — duplicate code retry, PM removed mid-project, hold with open approvals, cancellation with committed cost, timezone handling for deadlines
7. Non-Functional Requirements — portfolio list < 1.5 s at 1,000 projects; wizard step save < 500 ms; all writes audited
8. Change Log

Constraints: every FR traceable to a BR from document 01. Statuses and events only
from Part 4. Output pure Markdown with Mermaid diagrams in fenced blocks.
```

---

## 5.3 — `03-Use-Cases.md`

**Document Code:** DCOS-PRJ-UC-001
**Depends on:** 01, 02
**Author persona:** Business Analyst + Construction PM

```
Generate 03-Use-Cases.md for the DCOS Project Setup module.
Document code DCOS-PRJ-UC-001.

Produce minimum 18 use cases, ID format PRJ-UC-001, each with: actors, preconditions,
trigger, main flow (numbered), alternative flows, exception flows, postconditions,
FR references, audit events, notifications.

Mandatory use cases:
- Register a tender opportunity
- Record bid submission
- Record tender result (won) and (lost)
- Convert awarded tender to active project (the flagship use case — full checklist)
- Create internal project (shortcut path)
- Assign Project Manager / replace Project Manager mid-project
- Add team member with effective dates / remove team member
- Create contract header / revise contract value with reason
- Configure numbering rule and issue first numbered record (lock behaviour)
- Define project calendar and add holiday
- Create contractual milestone / record milestone achieved / record milestone missed
- Place project on hold / resume project
- Complete project (practical completion) / close project / archive project
- Cancel tender / cancel active project (termination path)

Include one end-to-end scenario narrative: "Tower A" from tender registration in
January to ACTIVE status in April, showing every status transition, actor, and
system side-effect (WBS root creation trigger, RBAC activation, numbering freeze).

Output pure Markdown.
```

---

## 5.4 — `04-Database-Schema.md`

**Document Code:** DCOS-PRJ-DB-001
**Depends on:** 02, 03
**Author persona:** Lead Database Architect

```
Generate 04-Database-Schema.md for the DCOS Project Setup module.
Document code DCOS-PRJ-DB-001.

Constraints:
- Use exactly the 15 canonical table names in Part 4.7 — add tables only with a
  Change Log entry and justification
- Every table: purpose, full column table (name, type, null, default, description),
  constraints, indexes with justification, RLS policy, runnable CREATE TABLE DDL
- Target PostgreSQL 15 on Supabase
- Include all mandatory constraints from Part 4.7 (unique project code per tenant,
  single active PM partial index, status CHECK from Part 4.3, soft delete only)
- ERD as Mermaid erDiagram covering all 15 tables plus external references
  (users, stakeholders, currencies, wbs_nodes) drawn as external entities
- Sequence-safety design for project_numbering_rules — explain how concurrent
  number issuance avoids duplicates (advisory lock or dedicated sequence row
  with SELECT ... FOR UPDATE)
- Seed data INSERT statements: project types, contract types, milestone types,
  default phase templates, default checklist templates, default numbering patterns
- Migration ordering note: which tables must exist before WBS, Task, and Document
  modules can migrate

Output pure Markdown with fenced sql blocks, no commentary outside the document.
```

---

## 5.5 — `05-Integration-Specification.md`

**Document Code:** DCOS-PRJ-INT-001
**Depends on:** 02, 04
**Author persona:** Senior System Architect

```
Generate 05-Integration-Specification.md for the DCOS Project Setup module.
Document code DCOS-PRJ-INT-001.

Required sections:
1. Document Control Header
2. Integration Philosophy — Project Setup as the context provider for the whole
   platform: every module resolves project existence, status, team, calendar,
   and numbering through this module
3. Integration Map — diagram plus table of every consuming and providing module
4. Inbound Integrations:
   - Stakeholder Setup — client_id and project stakeholder links
   - Admin Configuration — phase templates, checklist templates, project types
   - Multi-Currency — currency master reference
5. Outbound Integrations (contract detail per consumer):
   - WBS Management — project activation triggers WBS root creation; WBS blocked
     for non-ACTIVE projects
   - Task Management — project status gate (no task creation when ON_HOLD/CLOSED)
   - Document Control — numbering rule resolution service, project code injection
   - Procurement — project + budget reference validation before PR
   - Account/Finance & BOQ — contract header read model (original value, revisions,
     currency), milestone payment linkage
   - Planning & Scheduling — project calendar and milestone feed
   - HR/Timesheet — project calendar working days, team roster validation
   - RBAC Engine — project access half of the permission formula; team roster events
   - Approval Workflow Engine — hold/complete/cancel approval chains
   - Notification Engine — events per Part 4.11
   - Audit Trail Engine — events per Part 4.10 with role snapshot
   - Reporting & KPI — portfolio dashboard feed
   - Mobile Field Application — cached project list, status, calendar for offline
6. Project Context Resolution Service — the central API other modules call:
   - resolveProjectContext(project_id) → status, phase, calendar, team, settings
   - checkProjectGate(project_id, action) → allowed/blocked with reason
   - resolveNumber(project_id, record_type, context) → next formatted number
   Response schemas, caching rules (context cacheable 60 s; numbering never cached),
   cache invalidation events
7. Event Bus Contract — event codes from Part 4.10 with full JSON payload schemas
8. Failure Behaviour — idempotency keys, retry policy, what happens when WBS root
   creation fails after activation (saga/compensation note)
9. Change Log

Output pure Markdown.
```

---

## 5.6 — `06-UI-UX-Design.md`

**Document Code:** DCOS-PRJ-UIX-001
**Depends on:** 02, 03, 07
**Author persona:** Enterprise SaaS Product Designer

```
Generate 06-UI-UX-Design.md for the DCOS Project Setup module.
Document code DCOS-PRJ-UIX-001.

Required sections:
1. Document Control Header
2. Design Principles — DCOS UI philosophy (left sidebar, dashboard-driven,
   data-dense but readable, dark/light, minimal clicks)
3. Screen Inventory with IDs (PRJ-SCR-001…):
   - Portfolio List (filterable by status/phase/type/client/PM, saved views)
   - Project Creation Wizard (steps: classification → client → contract → team →
     calendar → numbering → review; per-step save; INTERNAL shortcut path)
   - Tender Board (kanban by tender status, deadline countdown chips)
   - Project Overview Dashboard (status, phase gate position, setup completeness
     ring, milestones timeline, team roster card, key contract facts)
   - Award Conversion Checklist screen (blocking items highlighted)
   - Team Roster screen (effective-date timeline per member)
   - Contract Header screen with revision history drawer
   - Milestone screen (timeline + table views, missed-milestone flag)
   - Calendar editor (month grid, holiday list, working-pattern editor)
   - Numbering Rules screen (pattern builder with live preview, lock badge)
   - Settings screen
   - Status Change modal with reason + approval routing display
4. Per screen: purpose, layout description (wireframe as ASCII or description),
   components, states (loading/empty/error/read-only by status), role visibility
   from document 07
5. Interaction Rules — status-driven read-only behaviour, destructive-action
   confirmations, unsaved-changes guard in wizard
6. Mobile Considerations — which screens exist on mobile (portfolio list read,
   project overview read, milestone view); which are desktop-only (wizard,
   numbering builder)
7. Accessibility and i18n notes (EN/KM readiness)
8. Change Log

Output pure Markdown.
```

---

## 5.7 — `07-RBAC-Matrix.md`

**Document Code:** DCOS-PRJ-RBAC-001
**Depends on:** 02
**Author persona:** Security Architect

```
Generate 07-RBAC-Matrix.md for the DCOS Project Setup module.
Document code DCOS-PRJ-RBAC-001.

Required sections:
1. Document Control Header
2. Permission Model — User permission = Role + Project access + Discipline +
   Workflow responsibility; explain how Project Setup both consumes and produces
   the project-access dimension
3. Permission Catalogue — atomic permissions (project.create, project.edit,
   project.status.request, project.status.approve, project.team.manage,
   project.contract.edit, project.contract.revise, project.numbering.configure,
   project.numbering.lock, project.calendar.edit, project.milestone.manage,
   project.archive, tender.manage, bid.record, project.view.full,
   project.view.summary)
4. Full Role × Permission Matrix — all roles from Part 4.8, expanded to the
   atomic catalogue, with ✓ / — / C (conditional) and every C footnoted
5. Row-Level Rules — tenant isolation, assigned-project scoping, client sees own
   projects summary only, Super Admin impersonation with audit
6. Status-Dependent Overrides — matrix of which permissions are suspended per
   project status (e.g. ON_HOLD blocks task-affecting edits; CLOSED read-only
   except DLP; ARCHIVED admin-only)
7. Segregation of Duties — requester of status change cannot approve it;
   contract reviser cannot approve own revision
8. JWT Claims and Enforcement Points — API middleware, RLS, UI gating
9. Test Hooks — list of RBAC assertions the test plan must cover
10. Change Log

Output pure Markdown.
```

---

## 5.8 — `08-API-Reference.md`

**Document Code:** DCOS-PRJ-API-001
**Depends on:** 04, 07
**Author persona:** Senior Backend Engineer

```
Generate 08-API-Reference.md for the DCOS Project Setup module.
Document code DCOS-PRJ-API-001.

Conventions: REST, /api/v1 prefix, JWT bearer, tenant from token, standard error
envelope, cursor pagination, ISO 8601 UTC.

Endpoint groups (full spec for each: method, path, permission required,
request schema, response schema, error codes, audit event emitted, example):

Projects:      GET/POST /projects, GET/PATCH /projects/:id,
               POST /projects/:id/status  (transition with guard evaluation),
               GET /projects/:id/status-history, POST /projects/:id/archive
Tenders:       POST /tenders, PATCH /tenders/:id, POST /tenders/:id/bid,
               POST /tenders/:id/result   (won|lost → conversion trigger)
Conversion:    GET /projects/:id/conversion-checklist,
               PATCH /projects/:id/conversion-checklist/items/:itemId
Team:          GET/POST /projects/:id/team, PATCH/DELETE /projects/:id/team/:memberId,
               POST /projects/:id/team/pm-change
Contract:      GET/POST /projects/:id/contract, POST /projects/:id/contract/revisions
Milestones:    CRUD /projects/:id/milestones, POST .../:msId/achieve, POST .../:msId/miss
Calendar:      GET/PUT /projects/:id/calendar, CRUD /projects/:id/calendar/holidays
Numbering:     CRUD /projects/:id/numbering-rules, POST .../:ruleId/preview,
               POST /projects/:id/numbering/resolve   (internal service endpoint)
Settings:      GET/PATCH /projects/:id/settings
Context:       GET /projects/:id/context   (resolution service per document 05)

Also include: idempotency-key support on status and result endpoints, rate limits,
webhook event list mirroring Part 4.10, and a traceability table mapping every
endpoint to FR IDs from document 02.

Output pure Markdown with fenced json examples.
```

---

## 5.9 — `09-Test-Plan.md`

**Document Code:** DCOS-PRJ-TST-001
**Depends on:** 02, 03, 04, 07, 08
**Author persona:** QA Lead

```
Generate 09-Test-Plan.md for the DCOS Project Setup module.
Document code DCOS-PRJ-TST-001.

Required sections:
1. Document Control Header
2. Test Strategy — unit / integration / E2E / security / performance pyramid
3. Test Environment and Data — seed tenants (two, for isolation tests), seed
   projects in every status of Part 4.3
4. Test Case Catalogue — ID PRJ-TC-001, each mapped to PRJ-UC and PRJ-FR IDs:
   - Full status-transition matrix: every allowed transition passes, every
     disallowed transition rejected with correct error
   - Award conversion: checklist gating, partial completion blocking
   - Single-active-PM constraint under concurrent assignment attempts
   - Numbering: concurrency test — 50 parallel number requests, zero duplicates;
     lock-after-first-issue enforcement
   - Cross-tenant isolation: user of tenant A cannot read/write tenant B project
     via API or direct RLS probe (per Gap Analysis §5.2 CI requirement)
   - RBAC: every C-conditional cell from document 07 asserted
   - Status-dependent overrides: edits blocked on ON_HOLD/CLOSED/ARCHIVED
   - Milestone missed → Critical notification fired
   - Calendar inheritance and override behaviour
   - Timezone edge cases on tender deadlines and milestone due dates
5. Performance Tests — portfolio 1,000 projects < 1.5 s; wizard step < 500 ms;
   number resolution < 200 ms under contention
6. Regression Pack definition and CI gate
7. Acceptance Criteria and Exit Report template
8. Change Log

Output pure Markdown.
```

---

## 5.10 — `10-Deployment-Notes.md`

**Document Code:** DCOS-PRJ-DEP-001
**Depends on:** 04, 05, 08
**Author persona:** DevOps Lead

```
Generate 10-Deployment-Notes.md for the DCOS Project Setup module.
Document code DCOS-PRJ-DEP-001.

Required sections:
1. Document Control Header
2. Deployment Position — Foundation module; must deploy before WBS, Task,
   Document modules; migration ordering from document 04
3. Migration Scripts — order, idempotency, rollback strategy per migration
4. Seed and Reference Data deployment (templates, patterns, types)
5. Environment Variables and Feature Flags (tender module toggle, internal
   project shortcut toggle)
6. RLS Verification Step — post-deploy automated cross-tenant probe
7. Zero-Downtime Notes — numbering sequence safety during deploy
8. Monitoring — health endpoints, key metrics (status-transition failures,
   numbering contention, conversion checklist stalls), alert thresholds
9. Backup/DR alignment with platform policy (RTO 4h / RPO 1h per Gap Analysis §5.5)
10. Rollback Playbook and smoke-test checklist
11. Change Log

Output pure Markdown.
```

---

## 5.11 — `11-SOP.md`

**Document Code:** DCOS-PRJ-SOP-001
**Depends on:** 03, 06, 07
**Author persona:** Construction Operations Consultant

```
Generate 11-SOP.md for the DCOS Project Setup module.
Document code DCOS-PRJ-SOP-001.

Standard Operating Procedures for company staff (not developers). Each SOP:
purpose, responsible role, frequency/trigger, prerequisites, numbered steps with
screen references from document 06, records produced, escalation path.

Required SOPs:
- SOP-PRJ-01 Register a new tender opportunity
- SOP-PRJ-02 Record bid submission and tender result
- SOP-PRJ-03 Convert an awarded tender to an active project (the critical SOP —
  include the full conversion checklist walkthrough and 10-working-day target)
- SOP-PRJ-04 Set up an internal project
- SOP-PRJ-05 Assign or change the Project Manager
- SOP-PRJ-06 Maintain the project team roster
- SOP-PRJ-07 Enter and revise the contract header
- SOP-PRJ-08 Configure project numbering rules before first document issue
- SOP-PRJ-09 Maintain the project calendar and holidays
- SOP-PRJ-10 Manage contractual milestones and respond to a missed milestone
- SOP-PRJ-11 Place a project on hold and resume it
- SOP-PRJ-12 Complete, close, and archive a project
- SOP-PRJ-13 Month-end portfolio review using the dashboard

Include a RACI table across all SOPs and roles.
Output pure Markdown.
```

---

## 5.12 — `12-Training-Guide.md`

**Document Code:** DCOS-PRJ-TRN-001
**Depends on:** 06, 11
**Author persona:** Training Specialist

```
Generate 12-Training-Guide.md for the DCOS Project Setup module.
Document code DCOS-PRJ-TRN-001.

Required sections:
1. Document Control Header
2. Audience Tracks — (a) Company Admin / Director, (b) PM / QS,
   (c) Tender team, (d) General staff (view-level)
3. Learning Objectives per track
4. Module Walkthrough — screen-by-screen guided tour referencing document 06
   screen IDs, with "what you see / what you do / what happens next"
5. Hands-On Exercises — sandbox scenarios per track, including the full
   Tower A tender-to-active exercise from document 03
6. Common Mistakes and How to Avoid Them — duplicate codes, forgetting numbering
   setup before first document, missing conversion checklist items, calendar
   not set before scheduling
7. Quick Reference Cards — one-page cheat sheets per SOP
8. Assessment — 20-question quiz with answer key, practical assessment rubric
9. Glossary — construction and system terms (LOA, DLP, IPC reference,
   practical completion, mobilisation, time bar)
10. Change Log

Output pure Markdown.
```

---

# PART 6 — CROSS-DOCUMENT CONSISTENCY CONTRACT AND QUALITY GATE

## 6.1 Frozen Artefacts

Once approved, these are frozen and every later document must consume them verbatim:

| Artefact | Frozen In | Consumed By |
|---|---|---|
| Business rules BR-PRJ-* | 01 | 02, 03, 09, 11 |
| FR IDs PRJ-FR-* | 02 | 03, 08, 09 |
| Status list and transitions | Part 4.3 | All |
| 15 canonical tables and columns | 04 | 05, 08, 09, 10 |
| Permission catalogue | 07 | 06, 08, 09 |
| Screen IDs PRJ-SCR-* | 06 | 11, 12 |
| Event codes | Part 4.10 | 02, 04, 05, 08, 09 |

## 6.2 Consistency Checks Before Accepting Any Document

- [ ] Statuses used exactly match Part 4.3 — no invented statuses
- [ ] Table and column names exactly match document 04 once it exists
- [ ] Every state-changing operation names its Part 4.10 event code
- [ ] Every notification references a Part 4.11 rule
- [ ] Tenant isolation stated wherever data access is described
- [ ] Numbering lock rule (immutable after first issue) never contradicted
- [ ] Single-active-PM rule never contradicted
- [ ] Out-of-scope items (Part 2.3) not designed inside this module
- [ ] Traceability IDs present and resolvable (BR → FR → UC → TC / API)
- [ ] Document control header and change log present

## 6.3 Quality Gate Questions

Ask of every generated document before approval:

1. Could a developer, QS, or trainer act on this document without asking a clarifying question?
2. Does anything contradict the R0 architecture principles the Gap Analysis says to preserve (WBS spine, shared engines, configurable rules, append-only audit)?
3. Is the tender→award→active conversion path — the module's flagship flow — complete and gated in this document's dimension?
4. Would this survive a client audit asking "show me who changed the contract value and why"?

If any answer is no, revise before moving to the next document.

---

**End of Prompt Pack — DCOS-PROMPT-PRJ-001**
