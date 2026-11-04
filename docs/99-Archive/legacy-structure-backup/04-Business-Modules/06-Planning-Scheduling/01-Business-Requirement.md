# 01 — Business Requirement
# Module PLN — Planning & Scheduling

Document path: docs/06-Planning-Scheduling/01-Business-Requirement.md
Module code: PLN
Module number: 14 (DCOS Module Map)
Domain: Project Control
Phase: Phase 2
Owner: Planning Manager
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-06-14

---

## 1. Business Problem

Construction projects consistently overrun time and cost because there is no single, auditable source
of truth for the programme schedule. On a typical project the following conditions exist:

- The master programme lives in a planner's Primavera P6 or MS Project file on a local desktop,
  inaccessible to the project team in real time.
- Progress updates travel by weekly email from site engineers to the planner, who manually updates
  the schedule and produces a PDF that is already stale on the day it is issued.
- The project manager has no visibility of which activities are on the critical path, which have
  float consumed, or whether a delay on one activity will cause a cascade to the completion date.
- Lookahead schedules (2-week, 4-week) are produced in Excel by site engineers with no link to the
  master programme, so planned vs actual drift is never formally tracked.
- When a delay occurs, there is no documented history of the planned dates at contract award
  (the baseline), making Extension of Time (EOT) claims and delay analysis nearly impossible to
  support with evidence.
- Physical progress percentages reported to the client in IPC/payment applications are not
  reconciled with the programme — the QS and planner use different figures for the same activity.
- Resource allocation (manpower, equipment) is managed separately from the schedule with no
  linkage to show that a planned activity has the resources committed to execute it.

DCOS Module PLN replaces this fragmented process with an integrated programme management layer
that sits on top of the WBS spine, uses the same activity hierarchy already established in
wbs_nodes and wbs_tasks, and connects forward to the IPC, EOT, procurement, and HR modules.

---

## 2. Primary Actors and Their Goals

| Actor | Role in Construction | Goals in This Module |
|---|---|---|
| Planner / Scheduler | Owns the programme | Create and maintain the master programme; set baselines; publish lookahead schedules; produce delay analysis |
| Project Manager (PM) | Accountable for project delivery | Monitor critical path and float; approve baseline changes; review S-curve and EVM metrics; act on delay alerts |
| Site Engineer | Executes and reports site progress | Update actual progress on assigned activities; confirm start/finish dates; view lookahead |
| Construction Manager | Coordinates trades on site | Review 2-week lookahead; flag resource conflicts; confirm activity readiness |
| QS / Commercial Manager | Prepares IPCs and EAC | Read certified progress percentages from the programme to support payment applications |
| Client / PMC Representative | Monitors contractor's programme | View approved master programme and progress reports; receive delay notifications; review EOT submissions |
| Document Controller | Manages formal submittals | Submit programme revisions to the client through the standard approval workflow |

---

## 3. Success Criteria (Measurable Outcomes)

SC1. The master programme is accessible to all authorised project team members in real time
     from a web browser — no programme file is needed.

SC2. A certified baseline is set within 28 days of project award. All subsequent revisions are
     tracked against that baseline with a full history preserved.

SC3. Physical progress entered by site engineers in the PLN module is the same figure consumed
     by the IPC module — zero reconciliation gap between the planner and QS.

SC4. The critical path is calculated and displayed automatically whenever activity dates or
     progress change. The planner is not required to run a manual calculation.

SC5. A 2-week lookahead schedule is generated from the master programme, distributed to the
     construction team, and tracked against actual completion — with variance recorded.

SC6. An S-curve for planned vs actual progress is produced automatically from the programme
     data at any point in time without manual export to Excel.

SC7. When an activity is delayed and float is consumed on a critical path activity, an automatic
     alert is sent to the Project Manager within one business day of the data being entered.

SC8. The EOT module can consume the delay analysis output from PLN (impacted vs as-planned
     schedule) without manual re-entry.

SC9. Every change to a baseline, activity date, or progress figure is recorded in the audit log
     with the user, timestamp, old value, and new value.

SC10. A programme can be imported from a CSV/Excel format on initial project setup so that the
      existing Primavera P6 or MS Project programme can be onboarded without re-entry.

---

## 4. Out of Scope

The following items are explicitly out of scope for Module PLN:

- Native Primavera P6 or MS Project file import/export (XER or MPP binary formats). DCOS
  supports structured CSV/Excel import only. Binary P6/MSP integration is a future Phase 6
  integration layer item (Module INT).
- ~~Resource levelling algorithms (automatic re-scheduling of activities to smooth resource peaks).
  PLN supports resource assignment and utilisation visibility, not automatic levelling.~~
  **Superseded:** float-bounded resource levelling (preview/apply) was built under the Completion
  Plan (item 3.2); see `14-Completion-Plan.md` and `15-Completion-Plan-Continuation.md`.
- ~~Cost loading of the schedule beyond linking to existing WBS budget_cost fields.~~
  **Superseded 2026-09-21** (decision recorded in `16-Productivity-and-Resource-Costing-Plan.md`):
  PLN now includes **resource cost loading** — man-hours and equipment-days derived from task
  quantity and productivity norms, priced from resource rates, phased by week and rolled up to
  WBS nodes. Still out of scope for PLN: commercial cost control (budgets, commitments, actuals,
  cost-to-complete), which remains owned by Module BGT (Budget Control) and Module COST (Cost
  Control) and by QS. `wbs_tasks.budget_cost` stays the progress weight; planned resource cost is
  held separately.
- Earned Value Management (EVM) financial calculations (BCWS, BCWP, ACWP, CPI, SPI). These
  metrics are designed in Module RPT (Reporting & KPI) using data from PLN and COST. PLN
  provides the physical progress % input only.
- Production of Extension of Time claim documents. PLN provides delay analysis data; the EOT
  module (Module 39) owns claim drafting, submission, and approval.
- Drawing production or modification. Programme bars and Gantt charts in DCOS are a
  visualisation layer; they do not produce contract-deliverable PDF programmes. PDF export of
  the programme is a supported feature, but not a formally submitted document — that flow goes
  through the Document Control module.
- Subcontractor programme management. PLN manages the main contractor's programme. Subcontractor
  sub-programmes are a future enhancement.
- Integration with IoT or sensor-based automatic progress detection.
