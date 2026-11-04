# DCOS — Daily Reporting Module
## 02 — Functional Specification

| Field | Detail |
|---|---|
| Document Code | DCOS-DR-FS-001 |
| Version | R1 (as built, Phase 1A) |
| Module | 10-01 — Daily Reporting |
| Status | Issued for Review |
| Base References | DCOS-DR-BR-001 |

---

## F1. Reporting unit setup

| ID | Function |
|---|---|
| F1.1 | Create and edit a reporting unit: code, name, type (Subcontractor / In-house team), linked subcontract, status, mobilisation date. |
| F1.2 | Unit status: Planned → Active → Suspended → Demobilised. Only an Active unit can submit and is checked for missing reports. |
| F1.3 | WBS scope: select nodes; the unit may report only on activities under them. No selection = whole project. |
| F1.4 | Members: add a person as reporter, mark a lead, revoke or restore. A unit that is Active with no reporter shows a warning. |
| F1.5 | Evidence policy per unit: photos required per activity; warn the PM or block submission. |
| F1.6 | Extra required sections per unit: Equipment, Materials. |
| F1.7 | Reporting schedule per project: reminder time, deadline, late window (hours), working days, time zone (default: the project's). |
| F1.8 | Approvers per project: primary and alternate with validity dates. With no primary, the project's Project Manager approves. Set by a system administrator only. |
| F1.9 | Project switch: turns reminders, missing-report checks and escalation on or off for the project. |

## F2. Report form

| ID | Function |
|---|---|
| F2.1 | Choose unit (if more than one) and report date (today or earlier). |
| F2.2 | Work report or No Work Today. A No Work report needs only a reason. |
| F2.3 | Steps: Site & manpower · Activities · Resources · Events · Safety & next day · Review & submit. |
| F2.4 | Activities scheduled for the date are pre-filled from the plan. Others in scope can be added from a list. |
| F2.5 | An activity not on the plan needs a description and a reason. |
| F2.6 | Activity with steps: step progress is entered; the activity percentage rolls up by weight. |
| F2.7 | Photos are attached per activity (camera) or to the report (photo or PDF). |
| F2.8 | Rules run as the form is filled; errors and warnings are shown against the section or line. |
| F2.9 | Draft is saved on the device at once and on the server after a pause; a banner shows which. |
| F2.10 | Review screen shows totals, attachments and all findings. Submit is disabled while an error exists or a file is uploading. |
| F2.11 | Submit returns a receipt (report number, version). A retry after a lost connection returns the same receipt. |

### Sections

| Section | Fields | Required |
|---|---|---|
| Weather & site conditions | condition, hours lost, note | Yes |
| Manpower | trade, planned, on site, supervisors, hours | Yes |
| Activities & progress | activity, status, cumulative %, quantity today, unit, crew, hours, OT, actual start/finish, remarks, steps | Yes |
| Equipment | type, asset no., working / idle / breakdown hours | If configured |
| Materials | description, delivered, used, unit, delivery note | If configured |
| Delay events | cause, description, hours lost, activity, from/to, notice required | If any |
| Issues & constraints | description, severity, action needed from | If any |
| Instructions received | type, given by, reference, description | If any |
| Inspection requests | reference, status | If any |
| Area / work-front access | area, state | If any |
| Safety | toolbox talk held, incidents, near misses, observations | Yes |
| Next-day plan | activity, note, manpower, quantity | Yes |

## F3. Rules

| Code | Check | When | Default |
|---|---|---|---|
| REQ_FIELD | Required section or field missing | Intake | Error |
| INV_UNIT | Unit not active, or user not a reporter | Intake | Error |
| INV_WBS | Activity outside the unit's scope | Intake | Error |
| UNPLANNED_REASON | Unplanned activity without description and reason | Intake | Error |
| PROGRESS_MAX_100 | Progress outside 0–100 | Intake | Error |
| QTY_NEGATIVE | Negative quantity or hours | Intake | Error |
| UOM_MISMATCH | Unit differs from the activity's | Intake | Error |
| DATE_FUTURE | Report date in the future | Intake | Error |
| DUP_REPORT | A report already exists for unit and date | Intake | Error |
| EVIDENCE_MIN | Fewer photos than the unit's policy | Intake | Per unit |
| LATE_SUBMIT | Submitted after the deadline | After submit | Warning |
| MANPOWER_BELOW_PLAN | On-site manpower under 80% of plan | After submit | Warning |
| PROGRESS_REGRESS | Progress below the last approved figure, no remark | After submit | Warning |
| NEXT_DAY_MISSING_RESOURCE | Next-day activity with no manpower | After submit | Warning |
| DELAY_NO_NOTICE_FLAG | Employer-related delay without "notice required" | After submit | Warning |
| PROGRESS_JUMP | Production of the day above 3x the activity's 10-day average | After submit | Warning |
| PRODUCTIVITY_ABNORMAL | Output per worker below 0.4x or above 2.5x the activity's usual (median) | After submit | Warning |
| QTY_RANGE | Quantity outside the range set for its unit of measure, or progress up by more than the daily limit | After submit | Per project |
| PHOTO_REUSE | A new photo is the same file as, or looks the same as, one the unit attached to an earlier report (last 60 days) | After submit | Warning |

PROGRESS_JUMP and PRODUCTIVITY_ABNORMAL compare a report with the unit's own approved history (the verified quantity where the approver changed it). They stay off until the unit has 10 approved working days and the activity itself has 3 days with production. They use the quantity when the line and its history carry one in the same unit of measure, otherwise the gain in cumulative progress. QTY_RANGE needs no history and does nothing until a range is configured in its parameters (`by_uom`, `max_daily_progress_pct`).

Severity and parameters are data. A project may override or switch off a rule.

## F4. Review

| ID | Function |
|---|---|
| F4.1 | Review inbox lists reports awaiting a decision, flagged reports first. |
| F4.2 | Review package: the report, findings, evidence, version history, changes since the previous version highlighted. |
| F4.3 | Opening a report marks it In review. |
| F4.4 | Approve; or Approve with remark (comment visible to the unit). |
| F4.5 | Verified quantity per activity line, with a mandatory remark. |
| F4.6 | Delay classification per delay line (excusable / non-excusable / compensable / non-compensable), proposed from the cause, confirmed by the approver. |
| F4.7 | Request information: a question to the unit; the report waits; the answer returns it to review without a new version. |
| F4.8 | Return for correction: select sections or lines and give a reason for each. |
| F4.9 | A decision on an outdated version is refused. |

## F5. Correction, withdrawal, amendment

| ID | Function |
|---|---|
| F5.1 | Withdraw: a reporter may withdraw a report that is still awaiting review, then submit again for that date. |
| F5.2 | Correct: only returned items are editable; the rest is locked. Resubmitting creates the next version. |
| F5.3 | A No Work report can be replaced by a work report, with a reason, until the day's summary is official. |
| F5.4 | Amend: an approved report can be amended with a reason by a reporter of the unit or an approver. The amendment awaits approval; the previously approved version stays official until then. |

## F6. Project Daily Summary

| ID | Function |
|---|---|
| F6.1 | Live view per date: coverage (expected, approved, pending, missing, no work, late) and totals from approved versions. |
| F6.2 | Totals: manpower by trade, activities by status, reported and verified quantities, delays and notices, weather hours, issues, instructions, incidents, equipment hours. |
| F6.3 | Publish with an optional narrative → Official revision. Later change → next revision; the earlier one becomes Superseded. |
| F6.4 | Publishing unchanged content is refused. |

## F7. Missing reports

| ID | Function |
|---|---|
| F7.1 | Reminder to reporters at the reminder time if nothing is submitted. |
| F7.2 | Missing record at the deadline on a working day for an Active, mobilised unit; reporters notified. |
| F7.3 | Escalation: approver at 09:00 next day; management at 09:00 on the second day. |
| F7.4 | A late submission closes the record as Late Submitted. |
| F7.5 | An approver may excuse a missing report with a reason. |
| F7.6 | Review overdue (12 h approver, 24 h management) and correction overdue (24 h reporter, 48 h approver, 72 h management). |

## F8. Notifications

In-app alert always; Telegram DM and email according to the recipient's preferences; critical items are emailed regardless of the email toggle.

| Event | Recipients | Priority |
|---|---|---|
| Report or correction awaiting review | Approvers | High |
| Safety incident in a submitted report | Approvers, management, HSE | Critical |
| Delay flagged "notice required" (at submission, unverified) | Approvers, QS | Critical |
| Delay notice confirmed (at approval) | QS, management | Critical |
| Returned / information requested | Unit reporters | High |
| Approved | Unit reporters | Normal |
| Reminder / missing / escalations | See F7 | Normal → Critical |
| Summary published | Management | Normal |

## F9. Audit

Every submission, rejection at intake, review opening, decision, correction, amendment, withdrawal, evidence view, quarantine, missing-report event and summary publication is written to an append-only log with actor, time and details.

## F10. Evidence handling

Files go to private storage through a signed upload. At submission the server scans each new file for malware, checks its real type, and computes its SHA-256. An infected file is deleted and logged, and the submission stops. Viewing uses short-lived signed links issued only to users allowed to see the report.
