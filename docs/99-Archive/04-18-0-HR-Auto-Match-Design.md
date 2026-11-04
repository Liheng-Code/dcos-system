# HR Auto-Match Design

Status: draft for build. Goal: register an employee once in Employee Master; Attendance, Timesheet, OT, E-Leave and Payroll derive everything else and only ask HR for exceptions.

Decisions (2026-10-02): all rules/rates are HR-configured (never hard-coded); a day may be split across projects; payroll is monthly; OT type is suggested by the system, confirmed by the requester.

## 1. Principles

1. Employee Master (`profiles`) is the only registration point.
2. Defaults come from HR-editable **assignment rules**, not per-person setup.
3. One daily fact row per employee per day feeds Timesheet, OT and Payroll.
4. Humans only see exceptions (the HR "Needs attention" inbox).

## 2. Assignment rules (replaces manual per-employee setup)

Table `hr_assignment_rules` (HR-managed UI under Organization Setup):

| column | meaning |
|---|---|
| `priority` | lower wins when several rules match |
| match columns (all nullable = wildcard) | `employment_type`, `employment_category`, `labor_category`, `department_id`, `position_id`, `company_id` |
| outputs | `leave_group`, `payroll_group`, `shift_id`, `default_site_id`, `ot_eligible`, `tax_applicable`, `nssf_applicable`, `payroll_type`, `currency`, `salary_template_id` |

Group values reuse `employee_master_lists` (`leave_group`, `payroll_group`, `labor_category`), already seeded.

**On employee create or on change of a matching field**, a service `provisionEmployee(id)` applies the best rule and creates, if missing:
leave balances for the leave group · `employee_payroll_profiles` · `employee_tax_profiles` · `employee_nssf_profiles` · `employee_shift_assignments` · `employee_attendance_site_assignments` · `reporting_structure` from `profiles.report_to` · salary structure from the template.

Rules are idempotent: they never overwrite a value HR set by hand (`source = 'manual'` vs `'rule'` on the assignment rows). The free-text columns on `profiles` (`leave_group`, `payroll_group`, `shift_group`, `attendance_site`, `cost_center`) stay as the displayed result and are written by the service.

Bank account and national ID remain manual (personal data); they appear in the exceptions inbox until filled.

## 3. Daily attendance fact

Table `attendance_daily` (one row per employee per date, unique):

`employee_id, work_date, shift_id, site_id, status, first_in, last_out, worked_hours, regular_hours, ot_hours_actual, late_minutes, is_holiday, leave_request_id, ot_request_id, needs_review, review_reason, source`

Built by `buildAttendanceDaily(employeeId, date)`, run nightly and on each log, leave decision or OT decision:

1. Logs (`attendance_logs`): first valid check-in, last valid check-out, worked hours.
2. Shift (`work_shifts` via assignment): scheduled hours, grace, overnight; late minutes; split regular vs beyond-shift hours.
3. Holiday (`leave_public_holidays`) and rest day (`work_days` of the shift).
4. Approved leave overlapping the date → status LEAVE, link `leave_request_id`, half-day aware.
5. Approved OT request for the date → compare requested vs actual; actual capped to approved hours.
6. Site match: GPS/QR resolves to `site_locations`; project comes from section 5.

`needs_review = true` when: missing check-out, hours outside shift with no OT request, leave and logs overlap, log at a site not assigned to the employee.

`attendance_records` stays as the legacy/manual-correction table; `attendance_daily` reads it as an override layer.

## 4. OT type suggestion (HR-configured)

Table `overtime_type_rules` (priority-ordered, HR edits): condition → `ot_type` from `overtime_rates`.

| condition kind | example |
|---|---|
| `public_holiday` | date in `leave_public_holidays` → `public_holiday` |
| `rest_day` | date not in shift `work_days` → `weekend` |
| `night_window` | start/end overlaps configured window → `night_shift` |
| `default` | otherwise → `weekday` |

The OT apply form pre-selects the first matching type; requester/supervisor may change it with a reason. `emergency` and `project_critical` stay manual choices.

`overtime_rates` gets a `payroll_component_code` column so each OT type maps to its payslip component by configuration (replaces the multiplier-based mapping now in the payroll run).

## 5. Project split in the Timesheet

Table `timesheet_entries` already has `project_id`, `wbs_node_id`, `task_id`, `hours_worked`, `ot_hours`.

- Weekly timesheet is generated from `attendance_daily`: each day's `regular_hours` and OT hours are pre-filled onto the employee's default project (`employee_project_assignments` / `project_members`; if several, split by `allocation_percent`).
- Employee edits only the split (move hours between projects/tasks). The save rule: entries for a day must sum to `worked_hours`; otherwise the day is flagged, not blocked.
- Hours with no project fall to the employee's cost center (overhead).
- Existing trigger `plan_productivity_log_from_timesheet` keeps feeding planning when a task is set.
- Approved timesheet entries are the basis for `payroll_cost_allocations` (project labour cost); payroll pay itself uses attendance and OT.

## 6. Monthly payroll inputs

Payroll run for a period reads only:

| input | source |
|---|---|
| working days | shift `work_days` minus public holidays for the month (replaces the 26-day setting where a shift exists) |
| present days / unpaid absence | `attendance_daily` |
| leave days (paid/unpaid) | `attendance_daily` + `leave_requests` (half-day aware, holidays excluded) |
| OT hours and type | approved OT requests, matched to `ot_hours_actual` |
| pay components | salary structure + `overtime_rates` + tax/NSSF config |

Period close is blocked while any `needs_review` rows exist in the period for included employees (HR can override with a note).

## 7. Needs-attention inbox (HR)

One page listing, with a one-click action each:

- employee missing payroll/tax/NSSF/bank profile or salary structure
- attendance days with `needs_review`
- OT worked without an approved request, or approved but not worked
- Telegram user with no matched employee (match by phone / `employee_id`)
- approved leave inside a locked payroll period

## 8. Build order

1. Migration: `hr_assignment_rules`, `attendance_daily`, `overtime_type_rules`, `overtime_rates.payroll_component_code`, `source` on assignment rows. (database-engineer; guarded and idempotent, dry-run first.)
2. `lib/hr/provisioning.ts` + rules admin UI + backfill dry-run for the 39 existing employees (report only, no writes until HR reviews).
3. `lib/hr/attendance-daily.ts` + nightly runner + unit tests (pure functions for shift/late/OT matching).
4. Timesheet generation from `attendance_daily` with project split.
5. OT apply form: type suggestion. Payroll run switched to the new inputs.
6. Needs-attention inbox, Telegram auto-link.

Tests: pure functions (rule matching, daily build, OT type resolution, working-day calc) in `lib/hr/__tests__`, following the existing Vitest setup.

## 9. Open items

- Whether daily-wage and Foreign Worker groups (payroll groups `daily_wage`, labor category `foreign_worker`) need different pay logic. Out of scope for the monthly run; keep them excluded from auto-provisioned salary structure until defined.
- NSSF/tax applicability for foreign workers per rule output (confirm with HR).

## 10. Build status (2026-10-02)

All six steps are built on `feat/modularisation`; migrations 20261002000004 to 20261002000007 are applied to the local DB only.

| Step | Delivered |
|---|---|
| 1 | Foundation tables and OT component mapping (`hr_assignment_rules`, `attendance_daily`, `overtime_type_rules`, `overtime_rates.payroll_component_code`) |
| 2 | Rule matching and provisioning, Assignment Rules page with dry-run, Classify screen |
| 3 | Daily attendance builder and `POST /api/hr/attendance-daily` (no scheduler configured yet) |
| 4 | Timesheet generation from daily facts with project split, My Timesheet editor, advisory day check |
| 5 | OT type suggestion on the apply form; payroll run reads the daily table; unpaid-leave/absence deduction behind `payroll_settings.attendance_deduction` (off by default) |
| 6 | Needs Attention inbox, day resolution with a required note (payroll blocks on unresolved days), Telegram auto-link by shared phone number |

Conventions worth knowing:
- OT request times are wall-clock values stored as UTC; attendance logs are true instants. The daily builder handles each accordingly.
- A timesheet entry's `hours_worked` includes its `ot_hours`.
- Daily attendance is not built on a schedule yet: it is built when payroll is calculated or a timesheet is generated, or by calling the endpoint (a scheduler may send `CRON_SECRET`).
