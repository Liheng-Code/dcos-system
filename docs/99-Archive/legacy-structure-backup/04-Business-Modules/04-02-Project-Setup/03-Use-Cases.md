# DCOS — Project Setup Module
## 03 — Use Cases

| Field | Detail |
|---|---|
| Document Code | DCOS-PRJ-UC-001 |
| Version | R1 |
| Module | 04-02 — Project Setup (Foundation Phase) |
| Author Persona | Business Analyst + Construction PM |
| Status | Issued for Review |
| Depends On | DCOS-PRJ-BRD-001, DCOS-PRJ-FS-001 |

Use case format: Actors, Preconditions, Trigger, Main Flow, Alternative/Exception Flows, Postconditions, FR refs, Audit events, Notifications.

---

## PRJ-UC-001 — Register a Tender Opportunity

- **Actors:** Tender team member (primary), Project Director (informed)
- **Preconditions:** User has `tender.manage`; client exists in Stakeholder module
- **Trigger:** New opportunity identified
- **Main Flow:**
  1. User opens Tender Board → "Register Tender".
  2. Enters client (lookup), scope summary, estimated value, submission deadline (date, time, timezone), bond requirement.
  3. System validates deadline is in the future; creates project shell with type TENDER, status TENDER; generates/validates project code.
  4. System schedules deadline alerts (14/7/3/1 days).
- **Alternative:** Client not found → user is routed to Stakeholder module request flow; tender saved as DRAFT.
- **Exception:** Duplicate code → 409 with suggestion; user accepts suggestion or edits.
- **Postconditions:** Tender visible on Tender Board with countdown.
- **FR:** PRJ-FR-010, 011, 002 · **Audit:** TENDER_REGISTERED · **Notify:** Project created → Admin, Director

## PRJ-UC-002 — Record Bid Submission

- **Actors:** Tender team member
- **Preconditions:** Project status TENDER
- **Trigger:** Bid physically/electronically submitted to client
- **Main Flow:** Enter submitted value, submission date, transmittal reference → status BID_SUBMITTED.
- **Exception:** Second submission attempt → blocked as idempotent duplicate.
- **Postconditions:** Pipeline value moves to BID_SUBMITTED bucket.
- **FR:** PRJ-FR-012 · **Audit:** BID_SUBMITTED, PROJECT_STATUS_CHANGED

## PRJ-UC-003 — Record Tender Result (Won)

- **Actors:** Tender lead; Director (informed)
- **Preconditions:** Status BID_SUBMITTED
- **Trigger:** Letter of Award received
- **Main Flow:**
  1. Record LOA reference and date.
  2. Status → AWARDED; conversion checklist instantiated from template.
  3. Notifications to Director, PM-designate, QS, Admin.
- **Postconditions:** Conversion checklist active; mobilisation clock starts.
- **FR:** PRJ-FR-013, 020 · **Audit:** TENDER_WON, PROJECT_STATUS_CHANGED · **Notify:** Bid won (High)

## PRJ-UC-004 — Record Tender Result (Lost)

- **Actors:** Tender lead
- **Main Flow:** Record winner (if known), winning price (if known), coded loss reason + notes → status LOST, record read-only, archived per retention.
- **Exception:** Reason omitted → validation error (BR-PRJ-019).
- **FR:** PRJ-FR-014 · **Audit:** TENDER_LOST

## PRJ-UC-005 — Convert Awarded Tender to Active Project *(flagship)*

- **Actors:** PM, QS, Document Controller, Project Director (approver)
- **Preconditions:** Status AWARDED; conversion checklist open
- **Trigger:** LOA recorded
- **Main Flow:**
  1. QS enters contract header: type, original value, currency, commencement/completion dates, DLP months, retention reference (checklist item ✔).
  2. Admin/Director assigns PM; roster started (item ✔; PM uniqueness enforced).
  3. PM triggers WBS root creation → WBS module creates root node (item ✔).
  4. Document Controller configures numbering rules for DWG/RFI/TRN/PR/PO with preview (item ✔).
  5. Optional non-blocking items completed or waived with reason.
  6. PM requests activation; Director approves (requester ≠ approver).
  7. Status → ACTIVE; all modules unlocked; team notified; mobilisation lag computed.
- **Exception A:** WBS call fails → item remains open, retry idempotent.
- **Exception B:** Activation requested with open blocking item → 409 listing items.
- **Postconditions:** Project fully operational; numbering frozen on first issue thereafter.
- **FR:** PRJ-FR-020–023, 050, 040, 042, 080 · **Audit:** CONTRACT_ADDED, TEAM_MEMBER_ASSIGNED, CHECKLIST_ITEM_COMPLETED ×n, PROJECT_STATUS_CHANGED · **Notify:** activation → full team

## PRJ-UC-006 — Create Internal Project (Shortcut)

- **Actors:** Company Admin
- **Main Flow:** Wizard with type INTERNAL → client step skipped, contract header optional → DRAFT→ACTIVE direct transition permitted (BR-PRJ-005).
- **FR:** PRJ-FR-001, 003, 030 · **Audit:** PROJECT_CREATED, PROJECT_STATUS_CHANGED

## PRJ-UC-007 — Assign Project Manager

- **Actors:** Director or Company Admin
- **Main Flow:** Select user → role PM → start date → save; RBAC project access activates.
- **Exception:** Active PM already exists → instruct to use PM Change (UC-008).
- **FR:** PRJ-FR-040, 042 · **Audit:** TEAM_MEMBER_ASSIGNED · **Notify:** PM assigned (High)

## PRJ-UC-008 — Replace Project Manager Mid-Project

- **Actors:** Director
- **Main Flow:** PM Change action → pick incoming PM → effective datetime → atomic swap (outgoing end-dated, incoming started, same instant).
- **Exception:** Concurrent change attempts → second rejected on partial unique index.
- **Postconditions:** No gap/overlap; open approvals of outgoing PM re-routed by Workflow Engine.
- **FR:** PRJ-FR-043 · **Audit:** PM_CHANGED (High) · **Notify:** old PM, new PM, Director

## PRJ-UC-009 — Add Team Member with Effective Dates

- **Actors:** PM
- **Main Flow:** Add user, project role, start date, optional end date → access active in window only.
- **FR:** PRJ-FR-040 · **Audit:** TEAM_MEMBER_ASSIGNED

## PRJ-UC-010 — Remove Team Member

- **Actors:** PM
- **Main Flow:** End-date assignment → system lists open items owned by the user → PM reassigns or acknowledges flags → access revoked from end date.
- **Exception:** Target is current PM → blocked, use UC-008.
- **FR:** PRJ-FR-041 · **Audit:** TEAM_MEMBER_REMOVED

## PRJ-UC-011 — Create Contract Header

- **Actors:** QS (draft), PM (confirm)
- **Main Flow:** Enter type, original value, currency, dates, DLP, clause refs → saved as the single head-contract header.
- **Exception:** Second header attempt → 409 (one head contract per project).
- **FR:** PRJ-FR-050 · **Audit:** CONTRACT_ADDED

## PRJ-UC-012 — Revise Contract Value

- **Actors:** QS (request), Director (approve)
- **Main Flow:** New revision: delta value and/or new dates + mandatory reason + reference → approval → current value recomputed = original + Σ revisions.
- **Exception:** Attempt to edit original value directly → blocked (BR-PRJ-009).
- **FR:** PRJ-FR-051 · **Audit:** CONTRACT_REVISED (High)

## PRJ-UC-013 — Configure Numbering Rule and First Issue Lock

- **Actors:** Document Controller
- **Main Flow:**
  1. Select record type (e.g., DWG) → compose pattern from tokens → live preview shows `P001-STR-DWG-B01-L05-001-R00`.
  2. Save rule (unlocked).
  3. Later, Document module requests first number → resolution service issues 001 → rule auto-locks.
- **Exception:** Edit attempt after lock → 423 Locked; guidance to create rule for a new record type.
- **FR:** PRJ-FR-080–082 · **Audit:** NUMBERING_RULE_CREATED, NUMBERING_RULE_LOCKED · **Notify:** DC, PM

## PRJ-UC-014 — Define Project Calendar and Add Holiday

- **Actors:** PM
- **Main Flow:** Review inherited company pattern → adjust working days/hours → add project holiday (e.g., local ceremony day) → prospective effect only.
- **FR:** PRJ-FR-070, 071 · **Audit:** CALENDAR_UPDATED, HOLIDAY_ADDED

## PRJ-UC-015 — Create Contractual Milestone

- **Actors:** QS
- **Main Flow:** Type CONTRACTUAL, title, due date, LD-exposure flag, contract clause ref → alerts scheduled at 14/7/1 days.
- **FR:** PRJ-FR-060, 061 · **Audit:** MILESTONE_CREATED

## PRJ-UC-016 — Record Milestone Achieved / Missed

- **Actors:** PM
- **Main Flow (achieved):** Mark achieved with date + evidence link (document/photo).
- **Main Flow (missed):** Mark missed → mandatory reason → contractual type raises Critical notification to PM, Director, Admin.
- **FR:** PRJ-FR-062 · **Audit:** MILESTONE_ACHIEVED / MILESTONE_MISSED

## PRJ-UC-017 — Place Project On Hold / Resume

- **Actors:** PM (request), Director (approve)
- **Main Flow:** Request hold with reason → approval → status ON_HOLD → platform gate blocks new tasks/documents/PRs; in-flight approvals complete. Resume mirrors with approval.
- **FR:** PRJ-FR-031 · **Audit:** PROJECT_ON_HOLD / PROJECT_RESUMED · **Notify:** full team (High)

## PRJ-UC-018 — Complete, Close, Archive

- **Actors:** PM (request), Director (approve), Admin (archive)
- **Main Flow:**
  1. Practical completion → COMPLETED (DLP phase; only DLP records creatable).
  2. Final account confirmed + handover confirmed → CLOSED (read-only except DLP).
  3. Retention trigger → ARCHIVED (admin-only).
- **FR:** PRJ-FR-032, 034 · **Audit:** PROJECT_COMPLETED, PROJECT_CLOSED, PROJECT_ARCHIVED

## PRJ-UC-019 — Cancel Tender / Cancel Active Project

- **Actors:** Director
- **Main Flow:** Cancel with mandatory reason → approval → CANCELLED read-only. Active-project path shows committed-cost warning from Procurement read model; acknowledgment recorded.
- **FR:** PRJ-FR-033 · **Audit:** PROJECT_CANCELLED (Critical)

---

## End-to-End Scenario — "Tower A" (January → April)

| Date | Actor | Action | Status After | System Side-Effects |
|---|---|---|---|---|
| 06 Jan | Tender team | Register tender for Client "Mekong Development", deadline 20 Feb 14:00 ICT | TENDER | Code P014 reserved; alerts scheduled 06/13/17/19 Feb |
| 13–19 Feb | System | Deadline countdown alerts | TENDER | Notifications to tender owner, Director |
| 20 Feb | Tender team | Bid submitted USD 12.4M, transmittal T-0142 | BID_SUBMITTED | Pipeline bucket updated |
| 18 Mar | Tender lead | LOA-2026-031 received | AWARDED | Conversion checklist instantiated; win notifications |
| 19 Mar | QS | Contract header: LUMP_SUM, USD 12,400,000, commence 01 Apr, complete 30 Sep 2027, DLP 12 mo | AWARDED | CONTRACT_ADDED; checklist item ✔ |
| 19 Mar | Director | Assigns Sokha as PM (start 19 Mar) | AWARDED | RBAC access active; PM notified; item ✔ |
| 21 Mar | PM | Triggers WBS root creation | AWARDED | WBS module creates root "P014 Tower A"; item ✔ |
| 24 Mar | Doc Controller | Numbering rules for DWG/RFI/TRN/PR/PO configured | AWARDED | Rules saved unlocked; item ✔ |
| 26 Mar | PM → Director | Activation requested; approved | **ACTIVE** | All modules unlocked; team notified; mobilisation lag = 6 working days (target met) |
| 02 Apr | Structure team | First drawing issued → resolver returns P014-STR-DWG-B01-L01-001-R00 | ACTIVE | DWG numbering rule auto-locks; NUMBERING_RULE_LOCKED |

## Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1 | 2026-08 | Initial issue | Business Analyst |
