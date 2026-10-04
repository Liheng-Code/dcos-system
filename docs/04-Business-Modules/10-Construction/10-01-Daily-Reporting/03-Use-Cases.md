# DCOS — Daily Reporting Module
## 03 — Use Cases

| Field | Detail |
|---|---|
| Document Code | DCOS-DR-UC-001 |
| Version | R1 (as built, Phase 1A) |
| Module | 10-01 — Daily Reporting |
| Status | Issued for Review |
| Base References | DCOS-DR-FS-001 |

Actors: **Reporter** (subcontractor or in-house), **Approver** (PM or alternate), **Admin** (PM for unit setup; system administrator for approvers), **System** (scheduled job).

---

## UC-01 Set up a reporting unit

| | |
|---|---|
| Actor | Admin |
| Precondition | Project exists with a WBS; the reporter has a DCOS account |
| Main flow | 1. Open Daily Reporting → Setup. 2. New unit: code, name, type, subcontract, mobilisation date. 3. Tick the WBS nodes in scope. 4. Save. 5. Add reporters; the first becomes lead. 6. Set status Active. 7. Check the schedule and approver. 8. Switch the project on. |
| Result | The unit can submit; reminders and missing checks run for it |
| Exceptions | Unit code already used → save refused. Active with no reporter → warning shown. |

## UC-02 Submit a daily report

| | |
|---|---|
| Actor | Reporter |
| Precondition | Active unit; reporter is an active member |
| Main flow | 1. Start report for the date. 2. Fill weather and manpower. 3. Confirm progress, quantity and crew for the pre-filled activities; add photos. 4. Record delays, issues, instructions. 5. Safety and next-day plan. 6. Review screen; fix any error. 7. Submit. |
| Result | Report and version 1 stored; receipt shown; approver notified |
| Alternatives | A1 Lost connection at submit → draft stays on the device; Submit again returns one receipt. A2 Warnings only → submission proceeds; approver sees them. |
| Exceptions | E1 Error (e.g. progress 140%) → Submit disabled. E2 Report already exists → directed to it. E3 Infected file → file removed, submission stopped, event logged. |

## UC-03 Report no work

| | |
|---|---|
| Actor | Reporter |
| Main flow | 1. Start report. 2. Choose No work today. 3. Give the reason. 4. Submit. |
| Result | A No Work report awaiting review; the unit is not missing |
| Alternative | Work happened after all → Replace No Work with a report, with a reason, before the day's summary is official |

## UC-04 Withdraw a report

| | |
|---|---|
| Actor | Reporter |
| Precondition | Report awaiting review, not yet opened by an approver |
| Main flow | Open the report → Withdraw → start a new report for the date |
| Result | The report number is kept; the new submission is the next version |
| Exception | Review has started → refused |

## UC-05 Approve a clean report

| | |
|---|---|
| Actor | Approver |
| Main flow | 1. Review tab. 2. Open the report. 3. Check content and photos. 4. Approve. |
| Result | Version approved; planning updated; reporters notified; live summary updated |
| Exception | The approver submitted this version → approval refused (segregation of duties) |

## UC-06 Approve with a verified quantity

| | |
|---|---|
| Actor | Approver |
| Main flow | 1. Open the report. 2. Enter a verified quantity on an activity line and a remark. 3. Confirm or change each delay classification. 4. Approve (with a remark if needed). |
| Result | Reported quantity kept; verified quantity stored beside it; planning and summary use the verified figure; classified delays enter the delay register |
| Exceptions | Verified quantity without a remark → refused. A delay that lost time left unclassified → refused. |

## UC-07 Return for correction

| | |
|---|---|
| Actor | Approver, then Reporter |
| Main flow | 1. Approver ticks Return on the sections or lines concerned and gives a reason for each. 2. Writes a comment. 3. Return for correction. 4. Reporter is notified, opens the report, chooses Correct returned items. 5. Edits the unlocked items. 6. Resubmits with an optional reply. |
| Result | Version 2 (correction); version 1 unchanged; the approver sees the changes highlighted |
| Exceptions | No item selected or no comment → refused. Reporter edits a locked item through another route → the server discards that edit. |

## UC-08 Request information

| | |
|---|---|
| Actor | Approver, then Reporter |
| Main flow | 1. Approver writes a question → Request information. 2. Reporter opens the report, answers. 3. The report returns to the approver. |
| Result | No new version; question and answer are in the history |

## UC-09 Amend an approved report

| | |
|---|---|
| Actor | Reporter of the unit, or Approver |
| Main flow | 1. Open the approved report → Amend. 2. Change the content. 3. Give the reason. 4. Send. 5. An approver (not the person who amended) approves. |
| Result | New version (amendment) becomes the approved one; planning rows are updated, not duplicated; the summary shows that a new revision is due |
| Exception | No reason → refused |

## UC-10 Publish the daily summary

| | |
|---|---|
| Actor | Approver |
| Main flow | 1. Daily summary tab, choose the date. 2. Check coverage and totals. 3. Optional narrative. 4. Publish. |
| Result | Official revision; management notified |
| Alternatives | Approvals or amendments arrive later → the page says data changed → Publish issues the next revision |
| Exception | Nothing changed → refused |

## UC-11 Missing report

| | |
|---|---|
| Actor | System, Reporter, Approver |
| Main flow | 1. Reminder at the reminder time. 2. At the deadline: missing record, reporters notified. 3. Next day 09:00: approver notified. 4. Second day 09:00: management notified. |
| Alternatives | A1 Reporter submits late → record closed as Late Submitted; report flagged Late (and Backdated after the late window). A2 Approver excuses with a reason. |

## UC-12 View evidence

| | |
|---|---|
| Actor | Anyone allowed to see the report |
| Main flow | Open the report; thumbnails load through short-lived links; click to open |
| Result | Each viewing is logged per report |

## UC-13 Change approvers

| | |
|---|---|
| Actor | System administrator |
| Main flow | Setup → Approvers → choose role and end date → add the person |
| Result | The alternate may decide and publish inside the dates |
| Exception | A PM attempts it → controls are not shown and the database refuses |
