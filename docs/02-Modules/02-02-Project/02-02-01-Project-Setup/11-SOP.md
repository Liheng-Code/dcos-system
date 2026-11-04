# DCOS — Project Setup Module
## 11 — Standard Operating Procedures (SOP)

| Field | Detail |
|---|---|
| Document Code | DCOS-PRJ-SOP-001 |
| Version | R1 |
| Module | 04-02 — Project Setup (Foundation Phase) |
| Author Persona | Construction Operations Consultant |
| Status | Issued for Review |
| Depends On | DCOS-PRJ-UC-001, DCOS-PRJ-UIX-001, DCOS-PRJ-RBAC-001 |

Audience: company staff. Screen references use PRJ-SCR IDs from the UI/UX document. Every SOP ends with the records it produces and the escalation path.

---

## SOP-PRJ-01 — Register a New Tender Opportunity

- **Responsible:** Tender team member · **Trigger:** opportunity identified · **Prerequisite:** client exists in Stakeholder module
1. Open **Tender Board (PRJ-SCR-003)** → *Register Tender*.
2. Select client. If missing, request creation via Stakeholder module first — do not proceed with a wrong client.
3. Enter scope summary, estimated value, submission deadline (date **and time**, confirm timezone), bond requirement.
4. Accept or adjust the suggested project code. Save.
5. Verify the countdown chip appears on the board.
- **Records:** tender project (TENDER), deadline alerts scheduled. · **Escalation:** duplicate-code dispute → Company Admin.

## SOP-PRJ-02 — Record Bid Submission and Tender Result

- **Responsible:** Tender lead · **Trigger:** bid handed over / result letter received
1. On the tender card: *Record Bid* → submitted value, date/time, transmittal reference. Status becomes BID_SUBMITTED.
2. On result: *Record Result*.
   - **Won:** enter LOA reference and date → project becomes AWARDED; conversion checklist opens automatically. Immediately notify the designated PM verbally as well — do not rely on the system alone for a win.
   - **Lost:** enter loss reason (coded), winner and winning price if known. Be honest in the reason — this data prices the next tender.
- **Records:** bid record, result, win/loss analytics entry. · **Escalation:** result disputed/unclear → Project Director before recording.

## SOP-PRJ-03 — Convert an Awarded Tender to an Active Project *(critical SOP — 10-working-day target)*

- **Responsible:** PM (coordinator); QS, Document Controller, Director contribute · **Trigger:** status AWARDED
1. Open **Conversion Checklist (PRJ-SCR-005)**. The working-day counter vs target is shown top-right — check it daily.
2. **QS:** *Enter contract header →* (PRJ-SCR-007): contract type, original value, currency (check twice — it locks after the first financial record), commencement/completion dates, DLP months, retention %. Item turns ✔.
3. **Director/Admin:** assign the PM on **Team Roster (PRJ-SCR-006)**. Item ✔.
4. **PM:** trigger *Create WBS root*. If it errors, retry; if it errors twice, raise to IT — do not improvise a manual WBS.
5. **Document Controller:** *Configure numbering →* (PRJ-SCR-010) for DWG, RFI, TRN, PR, PO. Use the live preview to confirm format with the PM and, where the contract requires, the client's numbering convention. **These lock at first use — get them right now.**
6. Complete or waive (with reason) non-blocking items: core team, calendar confirmation, kick-off.
7. **PM:** *Request Activation*. **Director:** approve via the Status Change modal (PRJ-SCR-012).
8. Confirm status chip shows ACTIVE and the team received the activation notification.
- **Records:** contract header, roster, WBS root, numbering rules, activation approval, mobilisation-lag KPI. · **Escalation:** counter exceeds 10 working days → automatic stall alert to Director; PM presents blockers at the weekly meeting.

## SOP-PRJ-04 — Set Up an Internal Project

- **Responsible:** Company Admin
1. **Wizard (PRJ-SCR-002)** → type INTERNAL (client/contract steps become optional).
2. Complete team, calendar, numbering as needed.
3. On Review, use *Create & Activate* (internal shortcut).
- **Records:** ACTIVE internal project. · **Escalation:** none.

## SOP-PRJ-05 — Assign or Change the Project Manager

- **Responsible:** Project Director
1. **First assignment:** Team Roster → *Add member* → role PM → start date.
2. **Replacement:** use *Change PM* (never remove-then-add): select incoming PM and effective date/time → confirm. The system swaps atomically; both PMs are notified; open approvals re-route automatically.
- **Records:** roster rows, PM_CHANGED audit. · **Escalation:** outgoing PM unavailable for handover → Director records handover notes in project comments.

## SOP-PRJ-06 — Maintain the Project Team Roster

- **Responsible:** PM · **Frequency:** on every join/leave, reviewed monthly
1. Add members with correct project role and start date the day they join — access follows these dates, so late entry means locked-out staff.
2. On leaving: *Remove* → review the open-items panel → reassign each item → confirm end date.
3. Monthly: verify roster against actual site/office team; end-date ghosts.
- **Records:** roster with effective dates. · **Escalation:** role dispute → Director.

## SOP-PRJ-07 — Enter and Revise the Contract Header

- **Responsible:** QS (prepare), Director (approve revisions)
1. Initial entry during conversion (SOP-PRJ-03 step 2).
2. Any value or completion-date change: **Contract Header (PRJ-SCR-007)** → *New Revision* → delta value / new date, reason (mandatory), reference (VO number, side letter). Submit → Director approves.
3. Never request an edit of the original value — the current value is always original + revisions, and the drawer shows the full trail for audit.
- **Records:** revision rows with approvals. · **Escalation:** client disputes recorded value → Director + Contract Administration module (when live).

## SOP-PRJ-08 — Configure Numbering Rules Before First Document Issue

- **Responsible:** Document Controller · **Trigger:** conversion checklist / before first issue of any record type
1. **Numbering (PRJ-SCR-010):** for each record type build the pattern from tokens; check the live preview against the contract's document-control requirements.
2. Have the PM confirm the preview in writing (comment on screen).
3. Do not issue any document until its rule is confirmed — **the first issue locks the pattern permanently**.
4. If a new pattern is genuinely needed later, create a rule for a new record type; never attempt renumbering.
- **Records:** numbering rules, lock events. · **Escalation:** client-mandated format conflict → PM → Director.

## SOP-PRJ-09 — Maintain the Project Calendar and Holidays

- **Responsible:** PM · **Frequency:** at setup; when site working pattern changes; when local holidays announced
1. **Calendar Editor (PRJ-SCR-009):** confirm inherited company pattern or adjust (e.g., 6-day site week).
2. Add project-specific holidays (local ceremony days); override an inherited holiday only with Director's knowledge — it affects schedule and payroll.
3. Remember: changes apply forward only; they never rewrite past records.
- **Records:** calendar, holiday list. · **Escalation:** payroll conflict → HR Manager.

## SOP-PRJ-10 — Manage Contractual Milestones and Respond to a Miss

- **Responsible:** QS (create), PM (achieve/miss)
1. At contract entry, create every contractual milestone with due date, clause reference, and LD-exposure flag.
2. Watch the 14/7/1-day alerts; at the 7-day alert, PM reviews readiness in the weekly meeting.
3. **Achieved:** record date + evidence (certificate, photo, transmittal).
4. **Missed:** record the factual reason the same day. A contractual miss alerts the Director automatically — the PM must follow with a recovery note within 24 h and coordinate any EOT/claim action with the QS.
- **Records:** milestone statuses, evidence, miss reasons. · **Escalation:** LD-exposed miss → Director + (when live) Claims module entry.

## SOP-PRJ-11 — Place a Project On Hold and Resume It

- **Responsible:** PM (request), Director (approve)
1. On formal suspension (client letter, force majeure): Status Change modal → ON_HOLD → reason citing the instruction reference → submit for approval.
2. Inform the site team: new tasks, documents, and PRs are blocked; in-flight approvals will complete.
3. Keep the suspension letter in Document Control linked to the project.
4. Resume mirrors the process with the resumption instruction reference.
- **Records:** hold/resume history with reasons and approvals. · **Escalation:** prolonged hold (> 30 days) → Director reviews cancellation vs continuation monthly.

## SOP-PRJ-12 — Complete, Close, and Archive a Project

- **Responsible:** PM (requests), Director (approves), Company Admin (archives)
1. **Practical completion:** request COMPLETED with the PC certificate reference as evidence. During DLP, only defect records are created (DLP module).
2. **Closure:** after final account settlement and handover confirmation, request CLOSED. Verify both confirmations are attached — the system will ask for them.
3. **Archive:** at the retention trigger, Company Admin archives; the project becomes admin-only.
- **Records:** completion/closure approvals, archive event. · **Escalation:** final account dispute blocks closure → Director + QS.

## SOP-PRJ-13 — Month-End Portfolio Review

- **Responsible:** Project Director · **Frequency:** monthly, first working week
1. **Portfolio (PRJ-SCR-001):** review counts by status/phase and the pipeline value strip.
2. Check mobilisation lags (AWARDED aging), stalled conversions, and milestone on-time rate on the dashboard.
3. Review win rate by client/sector with the tender lead; feed conclusions to estimating.
4. Verify no project sits in DRAFT > 30 days (clean up or cancel) and no ON_HOLD without a monthly review note.
- **Records:** review minutes (Document Control). · **Escalation:** portfolio risk items → executive meeting.

---

## RACI Matrix

R = Responsible · A = Accountable · C = Consulted · I = Informed

| SOP | Tender Team | QS | PM | Doc Controller | Director | Company Admin | HR |
|---|---|---|---|---|---|---|---|
| 01 Register tender | R | C | — | — | A/I | I | — |
| 02 Bid & result | R | C | I | — | A | I | — |
| 03 Award conversion | I | R | R/A | R | A | C | — |
| 04 Internal project | — | — | C | — | I | R/A | — |
| 05 Assign/change PM | — | — | I | — | R/A | C | — |
| 06 Roster upkeep | — | — | R/A | — | I | C | I |
| 07 Contract header | — | R | C | — | A | — | — |
| 08 Numbering | — | — | C | R/A | I | — | — |
| 09 Calendar | — | — | R/A | — | C | — | C |
| 10 Milestones | — | R | R/A | — | I | — | — |
| 11 Hold/resume | — | C | R | — | A | I | — |
| 12 Complete/close/archive | — | C | R | — | A | R (archive) | — |
| 13 Portfolio review | C | C | C | — | R/A | I | — |

## Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1 | 2026-08 | Initial issue | Operations Consultant |
