# 11 — Standard Operating Procedures
# Module PLN — Planning & Scheduling

Document path: docs/06-Planning-Scheduling/11-SOP.md
Module code: PLN
Module number: 14 (DCOS Module Map)
Domain: Project Control
Phase: Phase 2
Status: Draft
Version: 1.0
Date: 2026-06-14

---

## SOP Overview

These SOPs define the standard working procedures for using the PLN module on a DCOS-managed
construction project. All personnel must follow these procedures to maintain programme integrity,
meet contractual obligations, and support accurate IPC and EOT claims.

---

## SOP-PLN-01: Programme Setup at Project Award

**Responsible:** Planner / Scheduler
**Timing:** Within 14 days of project award (target: contract baseline submitted to client within 28 days per SC2)

**Procedure:**
1. Log in to DCOS and navigate to the assigned project.
2. Go to Planning → New Programme.
3. Enter the programme name as per contract reference (e.g., "Master Construction Programme Rev 0").
4. Set `contract_start_date` and `contract_end_date` exactly as stated in the contract documents.
5. Select `programme_type = 'master'`.
6. If migrating from an existing P6/MS Project file:
   a. Export the programme from P6 as XER, then manually convert to DCOS CSV template (or use the Excel-to-CSV converter provided by the DCOS admin).
   b. Download the DCOS import template from Planning → Import.
   c. Map columns. Refer to the column reference in SOP-PLN-03.
   d. Run dry-run. Fix all errors before confirming import.
7. If building from scratch: add activities manually in the Gantt view using "Add Activity".
8. Add all logical dependencies (FS, SS, FF, SF) as defined in the contract programme.
9. Verify CPM results: all activities should have float values. If any show null, check that the contract_end_date is set.
10. Review the critical path (highlighted in red). Confirm it aligns with the contractual critical path narrative.
11. Set the Contract Baseline: Planning → Baselines → Set Contract Baseline.
    - Baseline name: "Contract Baseline - [project name] - [date]"
    - Confirm the activity count matches expected.
12. Submit programme for internal review (SOP-PLN-04).

**Quality check:** Verify that the CPM-computed completion date ≤ contract_end_date before submitting.

---

## SOP-PLN-02: Weekly Progress Update Cycle

**Responsible:** Site Engineers (submit), Planner (review and confirm)
**Timing:** Every Friday by 17:00 (site submission); every Monday by 12:00 (Planner confirms)

**Procedure:**

**Friday — Site Engineer:**
1. Log in to DCOS → Planning → [Programme Name].
2. Navigate to Gantt View or Activity List.
3. For each activity in progress, click the activity → Activity Detail → enter actual_progress_pct.
4. If the activity started this week: also enter actual_start_date.
5. If the activity completed this week: enter actual_progress_pct = 100 and actual_finish_date.
6. Add notes to explain any deviation from planned progress.
7. Submit update. Status will show "Pending" until Planner reviews.

**Monday — Planner:**
1. Log in to DCOS → Planning → [Programme Name] → Progress Review.
2. Filter by Status = Pending.
3. Review each submission against site inspection reports or daily diaries.
4. For each update: Confirm (if accurate) or Reject with rejection_reason.
5. Rejected updates notify the Site Engineer to re-submit.
6. Once all pending updates are resolved: click "Advance Data Date" to the previous Friday's date (e.g., 2026-06-13 for the week ending 13 June).
7. Verify the data date has advanced and the S-curve has updated.
8. If CPM shows new overdue activities or critical path changes, notify the PM.

**Escalation:** If a Site Engineer fails to submit by Friday 17:00, the Planner enters a 0% variance note on behalf of the engineer with the reason "No submission received — assuming no progress" and proceeds with the data date advance.

---

## SOP-PLN-03: Programme Import from P6 / MS Project

**Responsible:** Planner
**Timing:** Once at project setup (or when onboarding a legacy project)

**Procedure:**
1. Open the DCOS import template (download from Planning → Import → Step 1).
2. In Primavera P6: File → Export → XER. Open in P6 viewer or copy from tabular reports.
3. Map P6 columns to DCOS columns:

| P6 / MS Project Column | DCOS Column | Notes |
|---|---|---|
| Activity ID | activity_code | Must be unique within programme |
| Activity Name | activity_name | |
| Start | planned_start_date | Format: YYYY-MM-DD |
| Finish | planned_finish_date | Format: YYYY-MM-DD |
| Predecessor ID | predecessor_codes | Comma-separated if multiple |
| Relationship Type | dependency_types | FS/SS/FF/SF (P6 abbreviations match) |
| Lag | lag_days | Integer days only |
| WBS Code | wbs_code | Optional; leave blank if no match |
| Responsible Manager | responsible_party | Free text |

4. Save as CSV (UTF-8 encoding, comma delimiter).
5. Upload to DCOS → Planning → [Programme] → Import.
6. Review dry-run report. Fix errors. Warnings for unmatched WBS codes are acceptable.
7. Confirm import.
8. Verify activity count, dependency count, and CPM results match the original P6 output.

**Known limitation:** P6 calendar exceptions (public holidays) are not imported. After import, verify the project calendar in DCOS Project Setup includes all relevant public holidays before relying on CPM duration calculations.

---

## SOP-PLN-04: Programme Submission to Client

**Responsible:** Planner (initiates), PM (approves), Document Controller (packages and dispatches)
**Timing:** As required by contract (typically within 28 days of award, then monthly updates)

**Procedure:**
1. Planner verifies programme is complete, CPM is current, baseline is set.
2. Planner navigates to Programme Dashboard → Status Badge → Submit for Internal Review.
3. PM receives notification. PM reviews programme via Gantt View and Dashboard.
4. PM approves (or rejects with reason). Note: PM cannot be the same person as Planner who submitted (four-eyes rule).
5. If approved: Planner navigates to Status Badge → Submit to Client.
6. Planner selects the baseline to associate with this submission.
7. DCOS automatically creates a transmittal record in Document Control.
8. Document Controller opens Document Control → Transmittals → finds the auto-created transmittal.
9. Document Controller reviews the auto-generated programme PDF, attaches cover letter if required, and dispatches to Client/PMC.
10. On receipt of Client response:
    - If ACCEPTED: Document Controller records acceptance in DCOS → Transmittals → Mark Accepted. Programme moves to approved_client.
    - If REJECTED with comments: Document Controller records rejection → enters client comments. Programme returns to draft. Planner is notified and must address comments.

---

## SOP-PLN-05: Generating and Distributing the Lookahead

**Responsible:** Planner
**Timing:** Every Monday morning, after progress data date has been advanced

**Procedure:**
1. Confirm the data date has been advanced for the previous week (SOP-PLN-02).
2. Navigate to Planning → Lookahead → Generate New Lookahead.
3. Select window type: 2-week (standard) or 4-week (for monthly planning meetings).
4. Confirm window start = Monday of current week. Click Generate.
5. Review the generated lookahead table. Verify all relevant activities are included.
6. If any activities are missing (because their planned dates fall outside the window), check whether the planned dates in the master programme need updating.
7. Click Publish. DCOS sends the lookahead to all Construction Managers and Site Engineers via notification.
8. Print or export PDF for site noticeboard if required.
9. At end of the lookahead window: return to Lookahead Manager → close the window.
10. Mark each item as completed or not completed based on actual status.
11. Record PCR. If PCR < 60%, raise the issue with the PM and Construction Manager.

---

## SOP-PLN-06: Recording and Managing Delay Events

**Responsible:** Planner or PM
**Timing:** Within 24 hours of identifying a delay event (to preserve contemporaneous records)

**Procedure:**
1. Navigate to Planning → Delay Events → New Delay Event.
2. Select delay_type from the approved list. If uncertain between types, consult the PM. Common types:
   - Weather exceeding 3 consecutive working days: `weather`
   - Client instruction to change scope: `instruction`
   - Late design information received: `employer_caused`
   - Contractor's own resource shortage: `contractor_caused`
3. Enter responsible_party (e.g., "Client", "Sub-contractor: XYZ Steel", "Force Majeure").
4. Set delay_start_date. If delay is ongoing, leave delay_end_date blank.
5. Enter a factual, specific description. Do NOT make liability statements at this stage (e.g., "Client failed to provide information" → instead write "Design information for area BLDG-A/L03 not received by planned date of 2026-06-10").
6. Link all impacted activities. The system records current float values.
7. Save with status = 'open'.
8. PM transitions to 'under_review' once they have reviewed.
9. PM transitions to 'agreed' if the delay is accepted, or 'disputed' if contested.
10. Agreed delay events should be handed to the commercial team for EOT assessment.

**Important:** Never delete a delay event. If raised in error, set status to 'disputed' with a note "Raised in error — [reason]". Deletion destroys audit evidence.

---

## SOP-PLN-07: Advance Baseline (Revised Programme)

**Responsible:** Planner
**Timing:** When a significant programme change is accepted (e.g., EOT granted, scope change approved)

**Procedure:**
1. Update activity dates and dependencies in the master programme to reflect the agreed revision.
2. Verify CPM after updates: new critical path should reflect the revised logic.
3. Navigate to Planning → Baselines → Create Revised Baseline.
4. Enter baseline name: "Revised Programme Rev [n] - [reason summary]".
5. Enter reason_for_revision (minimum 50 characters). Reference the EOT or instruction that authorised the revision.
6. Create baseline. Verify activity count matches expected.
7. Set the new baseline as Active. Previous active baseline becomes superseded.
8. Follow SOP-PLN-04 to submit the revised programme to the client.
9. Once client accepts, the revised baseline gains status 'client_accepted'. The EOT module will automatically reference this as the new baseline for future delay analysis.

---

## SOP-PLN-08: End-of-Month Programme Report

**Responsible:** Planner (verifies auto-generated report)
**Timing:** Within 2 working days of advancing the month-end data date

**Procedure:**
1. Advance the data date to the last working day of the month (SOP-PLN-02).
2. DCOS automatically generates a monthly progress report document.
3. Navigate to Document Control → Documents → locate the auto-generated PLN progress report.
4. Review the report:
   - Overall planned % vs actual % — verify figures match the S-curve
   - Top 5 critical delayed activities — verify these match what was discussed in the PM's weekly review
   - CPM-forecast completion date — flag to PM if this exceeds contract end_date
5. If any figures are incorrect, return to Progress Review, correct any confirmed updates, and re-advance the data date to regenerate the report.
6. Once verified: distribute to PM, QS, and (if contractually required) to the Client via Document Control transmittal.
