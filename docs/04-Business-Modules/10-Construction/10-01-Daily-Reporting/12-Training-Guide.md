# DCOS — Daily Reporting Module
## 12 — Training Guide

| Field | Detail |
|---|---|
| Document Code | DCOS-DR-TG-001 |
| Version | R1 (Phase 1A) |
| Module | 10-01 — Daily Reporting |
| Status | Issued for Review |

Three short sessions: reporters (30 minutes), approvers (45 minutes), administrators (20 minutes).

---

## Part A — Reporters

### What you need

A DCOS login, and your Project Manager must have added you to your reporting unit. If the page says "You are not a reporter on this project", ask the PM.

### Submit today's report

1. Open **Construction → Daily Reporting**.
2. Check the date and press **Start report**.
3. **Site & manpower:** choose the weather; add each trade with the number on site.
4. **Activities:** your planned activities are already listed. For each one enter:
   - **Progress %**: the total so far, not today's increase.
   - **Quantity today** and its unit.
   - **Crew size** and hours.
   - Press **Add photo** and take the picture.
5. Work that is not on the list: **Activity not on the plan**, then describe it and say why.
6. **Resources:** equipment and materials, if your unit must report them.
7. **Events:** delays (cause, what happened, hours lost), issues, instructions you received.
8. **Safety & next day:** toolbox talk yes/no, incidents, and tomorrow's plan with manpower.
9. **Review & submit:** red items must be fixed. Amber items are allowed; the PM will see them.
10. **Submit report.** You get a number like `DR-2026-000148`.

### No work today

Press **No work today**, write the reason, submit. If you do nothing, your unit is recorded as missing.

### If the signal drops

Your draft is kept on the phone ("Saved on device — not yet sent"). When the signal returns, press Submit again. You will not create two reports.

### If your report is returned

1. You get a notification. Open the report.
2. Read the red box: what the PM wants corrected.
3. Press **Correct returned items**. Only those items can be changed.
4. Fix them, write a short reply, **Resubmit**.

### If the PM asks a question

Open the report, type your answer in the red box, **Send answer**.

### Common messages

| Message | What to do |
|---|---|
| Cumulative progress must be between 0 and 100% | Enter the total progress so far |
| Unit of measure should be m2 | Use the unit shown |
| This activity needs at least 1 photo | Add a photo, or submit and explain to the PM |
| A report already exists for this unit and date | Open the existing report |
| An attached file was rejected by the virus scanner | Take the photo again with the camera |

### Do and don't

- Do report the same day.
- Do record every delay and every instruction.
- Don't send photos by chat instead.
- Don't round quantities up. The PM measures.

---

## Part B — Approvers

### Your tabs

**Review** (what waits for you), **Daily summary**, **Missing reports**, **Setup**.

### Review a report

1. **Review** tab. Flagged reports are at the top.
2. Open one. At the top, **Checks** lists what the system found.
3. Read each section. Amber lines changed since the previous version.
4. Look at the photos for each activity.
5. Choose:

| You want to | Do |
|---|---|
| Accept it | **Approve** |
| Accept with a note to the unit | Type a comment → **Approve with remark** |
| Accept but not the quantity | Enter **Verified quantity** and a remark on that line, then approve |
| Ask something | Type the question → **Request information** |
| Have something corrected | Tick **Return** on the line or section, give the reason, type a comment → **Return for correction** |

6. For each delay, check the **Contractual classification** before approving.

You cannot approve a report you submitted yourself.

### What approval does

Approval updates the schedule progress, the productivity log (with your verified quantity) and the delay register. Nothing reaches the schedule before you approve.

### Publish the daily summary

1. **Daily summary**, choose the date.
2. Read the coverage line, for example "3 of 5 reports approved — 2 pending".
3. Add a narrative and **Publish**. If more reports are approved later, publish again; that issues the next revision.

### Missing reports

Each morning open **Missing reports**. Chase the unit, or **Excuse** with a reason.

### Amendments

If an approved report is wrong, the unit or you press **Amend**, change it and give a reason. A different approver approves it.

---

## Part C — Administrators

### Set up a project

1. Make sure each reporter has a DCOS account. Subcontractor users get the **Subcontractor** role.
2. **Setup → New** unit: code (e.g. `SC-A2`), name, type, subcontract, mobilisation date.
3. Tick the WBS nodes the unit works in. Leave all unticked for the whole project.
4. **Save**, then add reporters. The first one is the lead.
5. Set the unit **Active**.
6. Check the **Reporting schedule**.
7. **Approvers** (system administrator): add a primary approver if it is not the project's manager, and an alternate with an end date.
8. **Switch on** Daily Reporting for the project.

### Choices per unit

| Setting | Use |
|---|---|
| Photos required per activity | 1 is the default |
| If photos are missing | "Warn the PM" to start; "Block submission" for units that keep omitting them |
| Extra required sections | Equipment or Materials for units that must report them |

### When someone leaves

Revoke the person in the unit's member list. For an approver's absence, add an alternate with dates.

### Hiding or showing the page

Administration → Module Settings → Construction → Daily Reporting.

---

## Practice exercise (all roles, 20 minutes)

1. Reporter submits a report with one activity, a quantity of 120 m², one photo, and one employer-caused delay.
2. Approver returns the activity line: "check the measured area".
3. Reporter corrects it to 90 m² and resubmits.
4. Approver enters a verified quantity of 85 m² with a remark, confirms the delay classification, approves.
5. Approver publishes the summary. Everyone reads the coverage line and the verified quantity.
6. Reporter amends the report with a reason; a second approver approves; the summary is published as revision 2.
