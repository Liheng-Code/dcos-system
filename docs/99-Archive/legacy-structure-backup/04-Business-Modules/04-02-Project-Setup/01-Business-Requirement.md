# DCOS — Project Setup Module
## 01 — Business Requirement Document

| Field | Detail |
|---|---|
| Document Code | DCOS-PRJ-BRD-001 |
| Version | R1 |
| Module | 04-02 — Project Setup (Foundation Phase, R1 Module Map No. 05) |
| Author Persona | Construction Operations Consultant + Senior System Architect |
| Status | Issued for Review |
| Base References | DCOS_System_Architecture_Module_Design_R0.md §7, DCOS_Gap_Analysis_R1.docx |

---

## 1. Business Context

Today, most construction companies manage their project portfolio in fragments. Tenders are tracked in a QS's personal Excel file. Project codes are invented ad hoc — one department writes "TWR-A", another writes "TowerA-2026", and the accountant writes "PJ-014". Contract values live in email attachments and in the QS's head. There is no single registry that answers the simplest management question: *how many projects do we have, in what stage, worth how much?*

The most dangerous window is the award-to-mobilisation period. A Letter of Award arrives, the site team mobilises on enthusiasm, and three months later the company discovers that no formal contract header was recorded, the document numbering convention was never agreed, the WBS was created differently by each discipline, and half the team was never formally assigned. The DCOS Gap Analysis rates the pre-contract lifecycle as a **High-risk gap** in the current architecture — this module closes it.

Project Setup is the entry gate of every project into DCOS. No WBS node, task, document, purchase requisition, inspection, or payment can exist without a project context created and controlled here.

## 2. Business Objectives

| # | Objective | Measure |
|---|---|---|
| O1 | Single source of truth for the project portfolio | 100% of company projects registered in DCOS before any child record is created |
| O2 | Eliminate duplicate and inconsistent project codes | Zero duplicate project codes per company; code format enforced by system |
| O3 | Full tender pipeline visibility | Win rate, pipeline value, and tender deadlines visible on one dashboard |
| O4 | Controlled award conversion | Awarded tenders converted to ACTIVE projects within 10 working days, gated by a checklist |
| O5 | Contract value integrity | Every contract value change recorded with reason, actor, and timestamp — audit-provable |
| O6 | Numbering integrity platform-wide | Document/RFI/PR numbering rules frozen before first issue; zero renumbering incidents |
| O7 | Team accountability | Exactly one active Project Manager per project at all times; full roster with effective dates |
| O8 | Contractual milestone protection | No contractual milestone missed without prior Critical alert at 14/7/1 days |

## 3. Stakeholder Analysis

| Role | Goals | Pains Today | Gains With DCOS |
|---|---|---|---|
| Company Admin | Clean registry, controlled setup | Ad hoc codes, orphan projects | Enforced wizard, code uniqueness |
| Project Director | Portfolio and pipeline visibility, approval control | No consolidated view, surprises at month-end | Portfolio dashboard, gated status changes |
| Project Manager | Fast mobilisation with clear baseline | Chasing contract facts, unclear team | Conversion checklist, one project overview |
| QS Engineer | Accurate contract value and milestones | Values in emails, missed time-sensitive dates | Contract header with revisions, milestone alerts |
| Tender Team | Deadline control, win/loss learning | Deadlines in personal calendars | Tender board with countdown, win/loss records |
| Document Controller | Frozen numbering before first document | Renumbering chaos mid-project | Numbering rules with lock-on-first-use |
| Engineer / Staff | Know which projects they belong to | Verbal assignments | Roster with effective dates driving access |
| Client / Consultant | Status transparency | Ad hoc reporting | Read-only project summary |
| Accountant | Reliable contract and milestone data | Reconciling spreadsheets | Contract header read model |

## 4. Business Rules

| ID         | Rule |
|---         |---|
| BR-PRJ-001 | Every project must have a project code unique within the company (tenant). |
| BR-PRJ-002 | A project must be one of three types: TENDER, AWARDED, or INTERNAL. |
| BR-PRJ-003 | No child record (WBS, task, document, PR, inspection, payment) may exist without a valid project. |
| BR-PRJ-004 | A tender project cannot hold execution records (tasks, daily reports, PRs). |
| BR-PRJ-005 | Project status must follow the canonical transition map; statuses cannot be skipped, except DRAFT→ACTIVE for INTERNAL projects. |
| BR-PRJ-006 | Conversion from AWARDED to ACTIVE requires completion of the award conversion checklist: contract header recorded, PM assigned, WBS root created, numbering rules configured and frozen. |
| BR-PRJ-007 | Exactly one active Project Manager must exist per project at any point in time. |
| BR-PRJ-008 | Replacing a PM is a single atomic action: the outgoing PM's assignment is end-dated and the incoming PM's assignment starts, with no gap and no overlap. |
| BR-PRJ-009 | Contract original value is entered once; every subsequent change is a contract revision with mandatory reason. The original value is never overwritten. |
| BR-PRJ-010 | Contract currency must reference the company currency master and cannot change after the first financial record exists. |
| BR-PRJ-011 | Numbering rules become immutable once the first record has been issued against the pattern. |
| BR-PRJ-012 | Placing a project ON_HOLD requires a mandatory reason and Project Director approval. |
| BR-PRJ-013 | While ON_HOLD, no new tasks, PRs, or documents may be created on the project; existing approvals in flight may complete. |
| BR-PRJ-014 | COMPLETED status requires PM request and Project Director approval; it represents practical completion. |
| BR-PRJ-015 | CLOSED status requires final account settlement confirmation and handover confirmation. |
| BR-PRJ-016 | A CLOSED project is read-only for all modules except DLP Management. |
| BR-PRJ-017 | Cancelling a project (any stage) requires a mandatory reason and Director approval; the project becomes read-only. |
| BR-PRJ-018 | A project with linked child records can never be hard-deleted; archival is the only removal path. |
| BR-PRJ-019 | A lost tender is archived read-only per the retention policy (2 years active, 5 years archive). |
| BR-PRJ-020 | Every contractual milestone must have a due date; missing a contractual milestone requires a recorded reason and raises a Critical notification. |
| BR-PRJ-021 | Contractual milestone due-date alerts fire at 14, 7, and 1 day(s) before due. |
| BR-PRJ-022 | The project calendar defaults from the company calendar and may be overridden per project; changes apply prospectively only. |
| BR-PRJ-023 | Team membership dates define access: a user's project access starts on the assignment start date and ends on the end date. |
| BR-PRJ-024 | The requester of a status change cannot be its approver (segregation of duties). |
| BR-PRJ-025 | All create, update, status, team, contract, and numbering actions are audited with before/after values. |

## 5. Business Process Narratives

### 5.1 Tender Registration to Award

The tender team registers an opportunity the day it is identified: client, scope summary, submission deadline, bond requirement. The system tracks the deadline with countdown alerts. On submission day, the bid value and date are recorded (BID_SUBMITTED). When the result arrives, it is recorded as won or lost with reference and reason. A win moves the project to AWARDED and activates the conversion checklist; a loss archives the record with a win/loss reason that feeds future estimating intelligence.

### 5.2 Awarded Project Activation

On AWARDED status, the PM and QS work through the conversion checklist: enter the contract header (type, value, currency, dates), assign the project team with the PM formally designated, trigger creation of the WBS root, and configure the numbering rules for drawings, RFIs, transmittals, PRs and POs. Only when every blocking item is complete can the Director approve the transition to ACTIVE — which switches on task creation, document issue, and procurement for all modules. Target: 10 working days from LOA.

### 5.3 Hold and Closure

If the client suspends works, the PM requests ON_HOLD with reason; the Director approves; the platform blocks new record creation while preserving in-flight approvals. At practical completion the PM requests COMPLETED; during DLP only defect records are created. When the final account is settled and handover confirmed, the project is CLOSED, and later ARCHIVED per retention policy.

## 6. Success Criteria and KPIs

- Setup completeness % per project (checklist-driven)
- Tender win rate (won ÷ submitted), by client and project type
- Average tender-to-award duration; average award-to-ACTIVE (mobilisation lag) vs 10-day target
- Contractual milestone on-time rate
- Projects by status/phase (portfolio view); contract value pipeline by status
- Zero duplicate project codes; zero numbering-rule changes after lock

## 7. Assumptions, Constraints, Dependencies

| Type | Item |
|---|---|
| Dependency | Stakeholder Setup (Module 04) provides the client master; a project links to an existing client stakeholder |
| Dependency | WBS Management (Module 06) creates the WBS root when triggered at activation |
| Dependency | Multi-Currency module provides the currency master |
| Dependency | Admin Configuration provides phase templates, checklist templates, and project type configuration |
| Dependency | Approval Workflow Engine executes hold/complete/cancel approval chains |
| Constraint | Multi-tenant: all data is tenant-scoped with row-level security |
| Constraint | Audit trail is append-only; no exceptions for this module |
| Assumption | Company calendar exists before the first project calendar is created |

## 8. Out of Scope

WBS tree management (Module 06); tender BOQ pricing and cost estimation (Module 08); bid document assembly (Module 09); stakeholder master records (Module 04); BOQ/budget lines (Modules 29/30); employer instructions, notices, and time bars (Module 35); variation orders and IPC (Modules 32/34); baseline schedule and CPM (Module 23). Project Setup stores the contract *header* only.

## 9. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1 | 2026-08 | Initial issue | System Architect |
