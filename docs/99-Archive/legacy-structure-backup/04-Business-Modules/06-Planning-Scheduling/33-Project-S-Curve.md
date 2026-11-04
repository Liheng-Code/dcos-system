# 33 — Project S-Curve (cost and time on one curve)

> Status: built 2026-10-27. Builds on doc 24 (BOQ-driven programme), which gives every activity a budget from the BOQ.

## Why one curve
Cost and time used to have separate S-curves, and they did not agree:
- the Planning S-curve counted only baselined tasks and spread them over calendar days;
- QS used a hand-typed planned curve;
- the dashboard drew a fixed shape.

A project is controlled against **one** plan: the cost-loaded programme, called the Performance Measurement Baseline in EVM. Every actual figure is measured against it on the same chart.

## The lines
All lines are cumulative, in project currency, per week or month.

| Line | Meaning | Source |
|---|---|---|
| **Planned value (PV)** | the baseline: what should have been done by each date, in money | active baseline dates × frozen `baseline_cost` (else `budget_cost`), spread evenly over each activity's **working days** (project calendar) |
| **Forecast** (dashed) | where the current programme is heading | current dates × `budget_cost`, same spread |
| **Earned value (EV)** | budget of the work actually done | Σ `budget_cost` × progress; history from progress snapshots, live value at the data date |
| **Actual cost (AC)** | cost spent | QS cost records (invoices, timesheets, deliveries, other), not purchase orders |
| **Committed (PO)** | ordered, not yet spent | QS cost records of type PO; shown, but not used in CPI |
| **Certified (IPC)** | gross cumulative work value certified by the client | certified or paid progress claims (`total_completed_stored`), dated at certification |

The actual lines stop at the project's **data date** (`projects.data_date`, else today).

## Indicators at the data date
- **Schedule:** SPI = EV ÷ PV and SV = EV − PV.
- **Cost:** CPI = EV ÷ AC and CV = EV − AC.
- **Forecasts:**
  - EAC = BAC ÷ CPI;
  - ETC = EAC − AC;
  - VAC = BAC − EAC;
  - TCPI = (BAC − EV) ÷ (BAC − AC).
- **Billing:** Certified − EV. A positive value means the client certified more than was earned (over-certified); a negative value means under-certified.
- **Progress:** planned % against earned %, both as a share of BAC.

**EV basis.** The indicators use EV measured on the baseline (baselined activities × baseline cost), so EV, PV and BAC share one basis. `at_data_date.ev_total` is the same EV on the whole current budget. The dashboards (health grid, portfolio, executive, control room) show EVM only when the baseline carries the whole budget. Otherwise they show no CPI or SPI rather than mixed figures.

**Permissions.** The RPC runs with the caller's rights. A user without Planning schedule or baseline view rights (for example QS-only) still gets PV, AC and Certified, but not the snapshot EV history or the baseline name. Old snapshots taken before `earned_value` existed are rescaled with the budget recorded at the time (`bac`), or with the current budget if none was recorded.

## Baseline health
The card checks whether planned value can be trusted:
- **Baseline carries only part of the budget.** This is usual right after *Generate from BOQ*: activities got budgets after the baseline was set. Set a new (revised) baseline in Planning › Gantt.
- **Activities with a budget but no baseline dates.**
- **Old baselines without a frozen cost.** These use the current budget.

## Where it shows
- **Project page:** S-Curve tab (`/dashboard/projects/<code>/scurve`).
- **Planning:** S-Curve & EVM shows this curve, then Cost Loading, then *Compare baselines* (the older baseline comparison chart).
- **QS:** EVM › S-curve sub-tab; the EVM dashboard tiles use the same figures.
- **Dashboard:** the cost tab shows the curve in compact mode.
- **Same numbers everywhere:** the health grid, executive dashboard, portfolio and control room read the same figures through `getProjectCostAnalytics`.

## Build
- **SQL:** RPC `project_scurve(project, period)` (SECURITY INVOKER) in migration `20261027105053_core_project_scurve.sql`.
  - It reuses `plan_project_workdays` and `plan_period_start` (doc 24, Phase 3).
  - `progress_snapshots` gained `earned_value` and `bac`.
- **Pure logic:** `apps/web/lib/project-scurve.ts` holds the EVM formulas, chart rows and health checks, with tests. `lib/evm-service.ts` uses the same formulas.
- **Card:** `apps/web/components/project/scurve/project-scurve-card.tsx`.
- **Retired:** the hand-typed planned curve (`qs_cost_baseline`, `components/qs/cost-scurve.tsx`) is no longer shown, and the table is kept unused. The synthetic cash-flow curve on the cost dashboard was removed.

## After Generate from BOQ: set a new baseline
1. Commit the programme and schedule it.
2. In Planning › Gantt, choose *Set baseline* → **Revised**, with a reason. This freezes the dates and `baseline_cost` for every activity.
3. The S-curve warning disappears. BAC then equals the BOQ budget on the activities: 3,953,277.11 for PRJ-2026-004-PC.
