# Phase 0 — Vocabulary Mapping (R1 design → current repo)

Source of truth for repo columns: `20260527000016_create_wbs_enterprise_tables.sql`, `20260531000044_site_execution.sql`, `20260928000005_daily_report_planning_integration.sql`, `20260609000002_delay_register.sql`, `20260531000049_subcontractor_management.sql`.

## 1. Structural mapping

| R1 concept | Repo equivalent | Decision |
|---|---|---|
| `wbs_node_id` | `wbs_nodes.id` | Same. |
| `activity_id` | `wbs_tasks.id` (has `wbs_node_id`, `task_code`, `progress`) | R1 "activity" **is** `wbs_tasks`. Column named `task_id` in DR tables to match the repo. |
| Activity steps | `wbs_task_steps` + `step_progress` jsonb | Keep step progress in the version payload; roll up on approval only (ADR-2). |
| Tenant | none (project-scoped); `profiles.company_id` | Use `project_id` + `dr_has_project_access()`. No `tenant_id` column. Idempotency key unique per `project_id`. |
| `app_user` | `profiles` (id = `auth.users.id`) | Use `profiles`. |
| `reporting_unit.stakeholder_id / subcontract_id` | `subcontracts.id`, `subcontracts.vendor_id → procurement_suppliers` | Unit links to `subcontract_id`; vendor derived. No stakeholder FK. |
| `reporting_unit.department_id` (in-house) | HR org tables (`20260527000030_create_hr_organization_tables.sql`) | Confirm department table name when writing the migration. |
| In-house reporter `hr_employee_id` | `profiles` (employee master extended) | Same `profiles` id. |
| Working calendar / holidays | `public_holidays` | Use it; project calendar from planning calendars if present. |
| Report number `DR-2026-000148` | `wbs_running_numbers` pattern | New `dr_running_numbers` (per project per year), allocated inside the submit function with a row lock. |
| Photos | `site_progress_photos` + storage bucket | Replace with `dr_evidence`; reuse the bucket with a new path prefix. |
| Manpower | `site_manpower` (per project/date, trade, contractor) and activity-level `headcount` | Replace with `dr_manpower` per version. Activity-level crew hours remain in `dr_activity_progress`. |
| Equipment | `site_equipment` (per day, hours_operated) | Replace with `dr_equipment` per version; keep hours working/idle/breakdown. |
| Delay register | `delay_register` (`delay_type` excusable / non_excusable / compensable / non_compensable) | Different axis from R1 cause categories. See §2. |
| Audit | no shared log | `dr_audit_log` (ADR-3). |

## 2. Delay categories

R1 §9.4 has 11 **causes**. The repo has two different things: the daily-report `delay_category` (8 values) and `delay_register.delay_type` (4 contractual classifications).

| R1 cause | Existing `delay_category` | Default `delay_register.delay_type` on approval |
|---|---|---|
| `EMPLOYER_CAUSED` | `client` | compensable, excusable |
| `DESIGN_INFORMATION` | `rfi_design` | excusable (compensable per PM) |
| `CONTRACTOR_CAUSED` | `labor` | non_excusable |
| `SUBCONTRACTOR_CAUSED` | `subcontractor` | non_excusable |
| `WEATHER` | `weather` | excusable, non_compensable |
| `MATERIAL_SUPPLY` | `material` | non_excusable |
| `THIRD_PARTY_UTILITY` | — new | excusable (PM confirms) |
| `AUTHORITY` | — new | excusable (PM confirms) |
| `FORCE_MAJEURE` | — new | excusable, non_compensable |
| `ACCESS_NOT_RELEASED` | — new | excusable (usually compensable) |
| `OTHER` | `other` / `safety` | PM decides |

Decision: DR stores the R1 **cause** (superset). A mapping function proposes the contractual `delay_type`; the **PM confirms it at approval** before any `delay_register` row is written. Existing `safety` maps to `OTHER` with a tag.

Contract-specific classification (compensable or not) is a legal judgement and must not be inferred silently. Mark the default column above as "proposed" in the UI.

## 3. Report and activity status mapping

| Old (`site_daily_reports.status`) | New |
|---|---|
| `draft` | submission `DRAFT` |
| `submitted` | submission `SUBMITTED`, review `AWAITING_REVIEW` |
| `verified_by_pm` | review `APPROVED` |
| `closed` | review `APPROVED`, included in an `OFFICIAL` summary |

| Old activity `sync_status` | New |
|---|---|
| `draft` | line exists in a DRAFT |
| `pending_approval` | line in a version awaiting review |
| `approved` / `synced` | version approved and planning sync done |
| `rejected` | version `RETURNED` |

## 4. Activity status values

Keep existing `not_started / in_progress / completed / hindered / stopped` for `work_status`. R1 does not define its own list.

## 5. Quantities and UoM

- `reported_qty` ← `quantity_done`; `uom` ← `quantity_unit`. Free-text today; the `UOM_MISMATCH` rule needs a task's expected UoM from `wbs_tasks`/norms (planning `plan_productivity_*`). Confirm the source column when writing the rule; if absent, the rule is limited to units seen on prior approved reports.
- Cumulative quantity: not stored on the old model. Derive on submit from approved versions; store on the line.

## 6. Roles

RBAC lives in `20260527000002_create_rbac_tables.sql`. New permissions to seed in Phase 1A:
`dr.submit`, `dr.view_unit`, `dr.review`, `dr.approve`, `dr.amend`, `dr.publish_summary`, `dr.admin_units`. Mapping to roles (PM, Site Engineer, Project Director, Company Admin) is part of the RBAC matrix doc.
