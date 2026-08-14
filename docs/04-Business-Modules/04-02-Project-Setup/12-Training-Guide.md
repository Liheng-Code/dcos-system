# DCOS — Project Setup Module
## 12 — Training Guide

| Field | Detail |
|---|---|
| Document Code | DCOS-PRJ-TRN-001 |
| Version | R1 |
| Module | 04-02 — Project Setup (Foundation Phase) |
| Author Persona | Training Specialist |
| Status | Issued for Review |
| Depends On | DCOS-PRJ-UIX-001, DCOS-PRJ-SOP-001 |

---

## 1. Audience Tracks

| Track | Audience | Duration |
|---|---|---|
| A | Company Admin / Project Director | 2.5 h |
| B | Project Manager / QS Engineer | 3 h |
| C | Tender Team | 1.5 h |
| D | General Staff (view-level) | 45 min |

## 2. Learning Objectives

**Track A:** create projects; approve status changes; assign/change PMs; run the month-end portfolio review; archive projects; understand SoD (why you cannot approve your own request).
**Track B:** drive the award conversion inside 10 working days; maintain contract header via revisions; manage roster, calendar, milestones; request hold/complete correctly.
**Track C:** register tenders with correct deadlines; record bids and results; understand why loss reasons matter for future pricing.
**Track D:** find your projects; read the status chip and dashboard; know what "on hold" and "closed" mean for your daily work.

## 3. Module Walkthrough (screen-by-screen)

Format: *What you see / What you do / What happens next.* Screens per DCOS-PRJ-UIX-001.

### PRJ-SCR-001 Portfolio List
- **See:** all projects you're entitled to, status chips, pipeline value strip.
- **Do:** filter, search, save views ("My active projects").
- **Next:** clicking a row opens the Project Overview.

### PRJ-SCR-002 Creation Wizard
- **See:** 7-step rail; each step saves independently.
- **Do:** complete steps; accept code suggestions on duplicates; INTERNAL projects skip client/contract.
- **Next:** completed wizard leaves a DRAFT (or ACTIVE for internal shortcut); abandoning leaves a resumable DRAFT.

### PRJ-SCR-003 Tender Board
- **See:** kanban columns TENDER → BID_SUBMITTED → AWARDED, countdown chips (amber 7 d, red 3 d).
- **Do:** Register Tender, Record Bid, Record Result — never drag cards; transitions run guards.
- **Next:** a WON result opens the conversion checklist automatically.

### PRJ-SCR-004 Project Overview
- **See:** status chip, phase, setup ring, contract summary, milestone timeline, roster card.
- **Do:** use the Actions menu (filtered by your role and the project status).
- **Next:** every action routes to its screen or the Status Change modal.

### PRJ-SCR-005 Conversion Checklist
- **See:** blocking items pinned with red badges; working-day counter vs the 10-day target.
- **Do:** deep-link into each item; complete all blocking items.
- **Next:** *Request Activation* enables only when blockers are done; Director approves; project turns ACTIVE.

### PRJ-SCR-006 Team Roster
- **See:** member timeline bars; PM pinned with crown.
- **Do:** add members with real start dates (access follows dates); use *Change PM* for replacements — never remove-then-add.
- **Next:** roster changes update everyone's access immediately.

### PRJ-SCR-007 Contract Header
- **See:** locked original value; computed current value banner; revisions drawer.
- **Do:** changes go through *New Revision* with reason + reference.
- **Next:** Director approval; current value recomputes; full audit trail visible.

### PRJ-SCR-008 Milestones
- **See:** timeline with LD flags; overdue in red.
- **Do:** Achieve with evidence; Miss with reason (contractual miss warns about the Critical alert).
- **Next:** alerts fire at 14/7/1 days automatically.

### PRJ-SCR-009 Calendar Editor
- **See:** month grid; building icon = company holiday, flag = project holiday.
- **Do:** confirm the pattern at setup; add local holidays.
- **Next:** Planning and HR consume this calendar; changes apply forward only.

### PRJ-SCR-010 Numbering Rules
- **See:** pattern chips, live preview, Unlocked ✎ / Locked 🔒 badges.
- **Do:** confirm previews with your PM **before** any first issue.
- **Next:** first issued number locks the rule forever — the padlock tooltip tells you when it locked.

### PRJ-SCR-012 Status Change Modal
- **See:** from→to, reason field, the resolved approver, consequence summary.
- **Do:** write reasons that cite references (letters, certificates).
- **Next:** approval request goes to the named approver; history records everything.

## 4. Hands-On Exercises (sandbox)

**All tracks — Exercise 0:** find project P014 Tower A, read its status, phase, PM, and current contract value. (5 min)

**Track C — Exercise C1 (Tower A pre-story):** register tender "Tower A" for client Mekong Development, deadline 20 Feb 14:00 ICT, bond required. Record bid USD 12.4M on deadline day. Record result WON with LOA-2026-031. Observe the checklist appear. (20 min)

**Track B — Exercise B1 (the full Tower A conversion, from 03-Use-Cases):**
1. As QS: enter contract header (LUMP_SUM, USD 12,400,000, commence 01 Apr, complete 30 Sep 2027, DLP 12).
2. As Director (trainer switches role): assign Sokha as PM.
3. As PM: trigger WBS root.
4. As DC: configure DWG/RFI/TRN/PR/PO numbering; verify preview `P014-STR-DWG-B01-L05-001-R00`.
5. As PM: request activation; as Director: approve. Confirm ACTIVE and check the mobilisation lag value. (45 min)

**Track B — Exercise B2:** add a contractual milestone "Structure topping-out" due in 20 days with LD flag; advance the sandbox clock to trigger the 14-day alert; record it achieved with photo evidence. Then record a second milestone missed and read the Critical alert. (20 min)

**Track A — Exercise A1:** attempt to approve a hold request you submitted yourself (observe SoD rejection); approve a colleague's request instead; run the month-end portfolio review checklist from SOP-PRJ-13. (25 min)

**Track A/B — Exercise AB1 (contract revision):** as QS submit revision +250,000 USD reason "VO-004 approved"; as Director approve; verify current value 12,650,000 and the drawer trail. (15 min)

## 5. Common Mistakes and How to Avoid Them

| Mistake | Consequence | Prevention |
|---|---|---|
| Inventing a project code outside the format | Rejected; inconsistent registry | Accept the suggested code; format is enforced |
| Issuing the first drawing before numbering is confirmed | Pattern locks wrong forever | SOP-PRJ-08: PM confirms preview in writing first |
| Remove-then-add to change PM | Gap with zero PMs; approvals stall | Always use *Change PM* (atomic swap) |
| Editing dates/value by asking IT to "fix the number" | Impossible by design; audit protects you | Use contract revisions with reason |
| Calendar set after schedule import | Wrong working-day math in Planning | Confirm calendar during conversion (checklist item) |
| Vague loss reasons ("price") | Estimating learns nothing | Use codes + one honest sentence |
| Leaving conversion items to day 9 | Missed 10-day target, Director stall alert | PM checks the counter daily |
| Recording a missed contractual milestone late | Alert fires late; claim evidence weakened | Record the same day with factual reason |

## 6. Quick Reference Cards (one-liners per SOP)

- **Register tender:** Board → Register → client, value, deadline **with time** → save. (SOP-01)
- **Result won:** Record Result → LOA ref → checklist opens → tell the PM. (SOP-02)
- **Conversion:** Contract → PM → WBS root → Numbering → Activate. Ten working days. (SOP-03)
- **Change PM:** Roster → *Change PM* → incoming + effective time. Never remove-then-add. (SOP-05)
- **Revise contract:** Header → New Revision → delta + reason + reference → approval. (SOP-07)
- **Numbering:** preview → PM confirms → then first issue. Locks forever. (SOP-08)
- **Hold:** Status modal → reason with letter reference → Director approves → team informed. (SOP-11)
- **Close:** PC cert → COMPLETED → final account + handover → CLOSED → archive later. (SOP-12)

## 7. Assessment

### 7.1 Quiz (20 questions — answer key at end)

1. Which three project types exist?
2. Which status allows creation of tasks and PRs?
3. Name the four blocking conversion checklist items.
4. What is the mobilisation target from AWARDED to ACTIVE?
5. Can DRAFT go directly to ACTIVE? When?
6. Who approves ACTIVE → ON_HOLD?
7. What is mandatory when recording a lost tender?
8. Why can't you edit the contract's original value?
9. How is the current contract value computed?
10. When does a numbering rule lock?
11. What must every numbering pattern contain?
12. How many active PMs can a project have?
13. What is the correct way to replace a PM?
14. What drives a team member's system access window?
15. At which days do contractual milestone alerts fire?
16. What must you enter when marking a milestone missed?
17. What happens to new documents/PRs when a project is ON_HOLD?
18. What two confirmations are required for CLOSED?
19. Who can see an ARCHIVED project?
20. Why can't you approve a status change you requested?

**Answer key:** 1 TENDER/AWARDED/INTERNAL · 2 ACTIVE · 3 contract header, PM assigned, WBS root, numbering · 4 10 working days · 5 yes, INTERNAL type only · 6 Project Director · 7 loss reason code · 8 immutable by rule; changes are revisions · 9 original + Σ approved revision deltas · 10 on first number issued · 11 {SEQ:n} · 12 exactly one · 13 *Change PM* atomic swap · 14 roster start/end dates · 15 14/7/1 days · 16 a reason · 17 creation blocked; in-flight approvals complete · 18 final account settlement + handover confirmation · 19 admins only · 20 segregation of duties (BR-PRJ-024).

### 7.2 Practical Assessment Rubric

| Criterion | Pass Standard |
|---|---|
| Tender registration (Track C) | Deadline entered with time and timezone; alerts visible |
| Full conversion (Track B) | All blocking items completed in correct roles; ACTIVE achieved; lag explained |
| Contract revision | Revision with reason/reference; current value verified |
| Numbering | Preview confirmed before issue; can explain lock rule |
| Status discipline (Track A) | SoD understood; reasons cite references |

## 8. Glossary

| Term | Meaning |
|---|---|
| LOA | Letter of Award — client's formal award notice; triggers AWARDED |
| Mobilisation | Award-to-site-start period; measured here as AWARDED→ACTIVE lag |
| Practical Completion (PC) | Works complete for use; triggers COMPLETED and DLP |
| DLP | Defect Liability Period — post-completion defect obligation window |
| Final Account | Agreed final contract value settling all claims/variations; gate to CLOSED |
| IPC | Interim Payment Certificate — monthly claim (commercial modules) |
| Retention | % withheld from payments as performance security (header stores the default) |
| LD | Liquidated Damages — contractual delay damages; flagged on milestones |
| Time bar | Contractual notice deadline (Contract Admin module) |
| WBS | Work Breakdown Structure — the DCOS spine; root created at conversion |
| SoD | Segregation of Duties — requester ≠ approver |

## 9. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1 | 2026-08 | Initial issue | Training Specialist |
