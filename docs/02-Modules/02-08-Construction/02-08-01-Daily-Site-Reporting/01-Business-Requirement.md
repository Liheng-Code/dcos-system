# DCOS — Daily Reporting Module
## 01 — Business Requirement

| Field | Detail |
|---|---|
| Document Code | DCOS-DR-BR-001 |
| Version | R1 (as built, Phase 1A) |
| Module | 10-01 — Daily Reporting |
| Status | Issued for Review |
| Base References | DCOS-MOD-10-01-DR Module Design R1; Phase0-01 ADRs; Phase0-03 R2 Amendments |

---

## 1. Purpose

Every evening, on every project, answer one question:

> What happened on site today, who says so, and has a responsible person accepted it as the official record?

The module turns daily site information from subcontractors and in-house crews into verified project data that management can rely on, and that can serve as contemporaneous evidence in a later claim.

## 2. Problem today

| Problem | Consequence |
|---|---|
| The existing Site Diary is one editable, deletable report per project per day | No record of who reported what; no history; not usable as evidence |
| It has no reporting party | A subcontractor's figures cannot be told apart from the main contractor's |
| Submitting it updates the schedule immediately | Unverified quantities move planned progress |
| Any signed-in user can read and change any project's diary | No confidentiality between parties |
| Silence and "no work" look the same | Missing information is not noticed |

## 3. Objectives

| # | Objective | Measure |
|---|---|---|
| O1 | One structured daily report per reporting unit per day | Reporting compliance by unit: on time, late, missing, no work |
| O2 | An original submission can never be altered | Zero updates or deletes on version tables (enforced by the database) |
| O3 | A responsible person accepts each report before it becomes official | Share of reports approved; review turnaround time |
| O4 | Reported and verified quantities are kept separate | Variance between reported and verified quantity by unit |
| O5 | Nothing unverified reaches planning | Planning updates occur only at approval |
| O6 | Management sees official figures and what is still outstanding | Coverage line on every summary |
| O7 | Missing reports are noticed the same day | Missing reports raised at the deadline; escalation times met |

## 4. Stakeholders

| Stakeholder | Need |
|---|---|
| Subcontractor foreman / supervisor | Submit quickly from a phone; know what was returned and why |
| In-house site supervisor | Same process as a subcontractor |
| Project Manager | Review by exception; approve, return, or ask a question; publish the day's summary |
| Alternate approver | Stand in for the PM during leave or absence |
| Project Director / management | Official daily picture with a clear statement of what is missing |
| QS | Verified quantities as measurement support (not certification) |
| Planning | Actual progress, productivity and delays from approved reports only |
| HSE | Immediate notice of a reported incident |
| Company Admin | Set up units, reporters, schedule and approvers |
| Auditor / claims team | Immutable versions, evidence with hashes and timestamps, full audit trail |

## 5. Scope

### In scope (Phase 1A, delivered)

- Reporting units (subcontractor or in-house), reporters, WBS scope, reporting schedule.
- Daily report with standard sections, evidence, and an explicit No Work Today report.
- Rules at intake (errors block) and after submission (warnings for the PM).
- Review: approve, approve with remark, request information, return selected items.
- Item-level correction, post-approval amendment, withdrawal before review.
- Verified quantities and PM-confirmed delay classification.
- Planning update on approval.
- Project Daily Summary with coverage, revisions and publishing.
- Missing-report detection, reminders, escalation.
- Audit trail and notifications (in-app, Telegram DM, email).

### Later phases

| Phase | Content |
|---|---|
| 1B | Field App (PWA) with full offline capture and sync |
| 1C | Telegram group binding and Mini App entry |
| 2 | AI-assisted checks, statistical rules, photo re-use detection, delegated reviewer, management overview |
| 3 | RFI / QA-QC / HSE record linkage, cost allocation, sub-IPC measurement support, KPIs |
| 4 | Cross-project analysis and forecasting inputs |

### Out of scope

Identity and roles, WBS structure, payment certification, attendance and payroll, inspection and NCR records, incident records, and claims preparation belong to their own modules. **A reported or verified quantity is never a certified quantity; this module does not write to IPC or payment tables.**

## 6. Business rules

| # | Rule |
|---|---|
| BR1 | One report per reporting unit per report date. |
| BR2 | A submitted version is never changed. A correction or amendment is a new version. |
| BR3 | Errors block submission and nothing is stored; the attempt is logged. Warnings do not block. |
| BR4 | Only an approver of the project may decide on a report. Nobody may approve a version they submitted. |
| BR5 | Returning, requesting information, or approving with a remark requires a comment. |
| BR6 | A return names the items to correct; only those items can be changed in the correction. |
| BR7 | An adjusted (verified) quantity requires a remark; the reported quantity is kept. |
| BR8 | Every delay that lost time must be classified by the approver before it enters the delay register. |
| BR9 | Planning is updated only when a version is approved. |
| BR10 | The official summary contains approved reports only; pending and missing units are stated, not hidden. |
| BR11 | A summary revision is issued only if its content changed. |
| BR12 | A unit that submits nothing by its deadline on a working day is recorded as missing. "No Work Today" with a reason counts as reported. |
| BR13 | A late report is accepted and flagged; it is never refused for lateness alone. |
| BR14 | A reported safety incident is notified immediately; it does not wait for review. |
| BR15 | Evidence can be added by a later version but never removed. |
| BR16 | Only a system administrator sets approvers; a PM cannot appoint their own alternate. |

## 7. Assumptions and constraints

- Reporters have DCOS accounts; subcontractor users hold the `EXT-SUB` role.
- English user interface in Phase 1A; labels are centralised for later translation.
- Photo malware scanning requires a ClamAV daemon reachable by the web server.
- The legacy Site Diary stays available until each project is cut over.

## 8. Success criteria for Phase 1A

1. A reporter can submit, correct and amend a report from a phone browser.
2. A PM can clear a clean report in one action and a flagged one with the findings in view.
3. The schedule changes only after approval, using the verified quantity.
4. Tampering attempts (update, delete, direct write, cross-unit read) are refused by the database.
