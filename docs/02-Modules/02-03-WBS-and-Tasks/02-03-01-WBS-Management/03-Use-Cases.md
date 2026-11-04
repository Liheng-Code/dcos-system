# DCOS — WBS Management Module
## 03 — Use Cases

| Field | Detail |
|---|---|
| Document Code | DCOS-WBS-UC-001 |
| Version | R1 |
| Module | 04-03 — WBS Management |
| Author Persona | Construction Operations Consultant + Business Analyst |
| Status | Issued for Review |
| Base References | DCOS-WBS-BRD-001, DCOS-WBS-FS-001 |

---

## 1. Actor Catalogue

| Actor | Goal in this module | Interaction Summary |
|---|---|---|
| Project Manager (PM) | Govern the structure; approve change; answer for progress | Reviews tree, approves CRs, sets baseline, applies overrides in exception |
| Planner | Design and maintain the breakdown | Builds, imports, duplicates, refines, baselines |
| QS / Cost Engineer | Trust the tree as the cost/valuation container | Reads roll-ups, verifies pre-IPC, consumes baseline diffs |
| Document Controller (DC) | Draw stable code segments | Configures with planner, resolves historical codes |
| Site Engineer | Locate work; report against nodes | Navigates (web/mobile), views scope |
| QA/QC Inspector | Locate inspections | Navigates; closure signals feed gates |
| Discipline Manager | Own a discipline subtree | Assigns responsibility; reviews progress |
| Subcontractor User | Work within an assigned subtree | Scoped viewing only |
| Company Admin | Govern types, rules, templates | Configures masters |
| System (DCOS) | Automate root creation, roll-up, integrity | Event-driven jobs |

## 2. Use Case Index

| ID | Name | Actor | Pri | FRs |
|---|---|---|---|---|
| UC-WBS-001 | Apply template at project activation | Planner | M | 001, 020 |
| UC-WBS-002 | Build tree manually | Planner | M | 002, 005, 008 |
| UC-WBS-003 | Bulk import room schedule | Planner | M | 017 |
| UC-WBS-004 | Import rejected on validation | Planner | M | 017 |
| UC-WBS-005 | Roll back committed import | Planner | M | 018 |
| UC-WBS-006 | Move Zone 03 to Level 06 | Planner | M | 012, 013 |
| UC-WBS-007 | Delete blocked by links | Planner | M | 016 |
| UC-WBS-008 | Move blocked by baseline | Planner | M | 028 |
| UC-WBS-009 | Raise/approve/apply change request | Planner, PM | M | 029 |
| UC-WBS-010 | Rename level after documents issued | DC, Planner | M | 006, 010, 011 |
| UC-WBS-011 | Set baseline before first IPC | PM | M | 027 |
| UC-WBS-012 | Compare tree vs Baseline R0 | QS | S | 030 |
| UC-WBS-013 | Assign MEP responsibility | Discipline Mgr | M | 037 |
| UC-WBS-014 | Subcontractor scoped view | Subcontractor | M | 041 |
| UC-WBS-015 | Progress rolls up to Level 05 | System | M | 031, 032 |
| UC-WBS-016 | PM applies manual override | PM | M | 035 |
| UC-WBS-017 | Cancel descoped zone | PM | S | 025, 029 |
| UC-WBS-018 | Close level with open NCR | PM | M | 023 |
| UC-WBS-019 | Concurrent restructure conflict | 2× Planner | M | 012 |
| UC-WBS-020 | Duplicate Level 05 → 06–20 | Planner | M | 015 |
| UC-WBS-021 | Archive building at handover | PM | S | 024, 026 |
| UC-WBS-022 | Navigate tree offline on mobile | Site Engineer | S | 047 |
| UC-WBS-023 | Configure code segments | Admin, DC | M | 007 |
| UC-WBS-024 | Cascade hold on Zone subtree | PM | M | 024 |

## 3. Use Case Diagram

```
 Planner ──── UC-001..006, 008..010, 019, 020, 023
 PM ───────── UC-009, 011, 016, 017, 018, 021, 024
 QS ───────── UC-012, (reads UC-015 output)
 DC ────────── UC-010, 023
 Discipline Mgr ─ UC-013
 Subcontractor ── UC-014
 Site Engineer ── UC-022
 System ───────── UC-015, root creation, integrity jobs
```

## 4. Detailed Use Cases

> Template fields: Preconditions · Trigger · Main Flow · Alternates · Exceptions · Postconditions · Rules · Permission · Audit.

---

### UC-WBS-001 — Apply WBS Template at Project Activation
**Actor:** Planner. **Stakeholders:** PM, QS, DC.
**Preconditions:** Project P001 ACTIVE; root exists (FR-001); tenant template "Tower — 2 Phase" published; planner holds `WBS.APPLY_TEMPLATE`.
**Trigger:** Planner opens SCR-WBS-005 and selects the template for P001.
**Main Flow:**
1. System shows template preview: 2 phases, 1 building, 12 levels, 4 zones/level, STR+MEP+ARC discipline nodes, ~350 nodes.
2. Planner selects target = root, sets building segment B01.
3. System dry-runs code generation, shows resulting code sample (`P001-PH2-B01-L01…`), no collisions.
4. Planner confirms; system applies in one transaction; nodes created DRAFT.
5. System emits `WBS.TEMPLATE.APPLIED`; toast links to tree.
**Alternate:** 3a. Collision with an existing manually created node → affected rows listed; planner may re-map segment or exclude branch.
**Exception:** 4a. Transaction exceeds 1,000-node guard → message *"Template exceeds the single-operation limit (1,000 nodes). Apply per phase."* Recovery: apply per-phase subtemplates.
**Postconditions:** Structure present in DRAFT; audit written.
**Permission:** `WBS.APPLY_TEMPLATE`. **Audit:** `WBS.TEMPLATE.APPLIED`.

---

### UC-WBS-002 — Build Tree Manually
**Actor:** Planner.
**Preconditions:** Root exists; `WBS.CREATE_NODE`.
**Trigger:** No suitable template (bespoke factory).
**Main Flow:** create PHASE → BUILDING → LEVEL nodes one by one via SCR-WBS-001 "+ child"; codes auto-sequential; each create validates structure rules; nodes DRAFT; planner activates branches when stable.
**Exceptions:** illegal pair (ROOM under PROJECT_ROOT) → *"Room cannot be created under Project. Allowed here: Phase, Discipline, Building, Area."* (`WBS.STRUCTURE.RULE_VIOLATION` audited). Depth 13 attempt → `WBS_DEPTH_EXCEEDED` message with current depth shown.
**Postconditions:** Valid partial tree. **Audit:** `WBS.NODE.CREATED` per node.

---

### UC-WBS-003 — Bulk Import 400 Rooms from the Architect's Schedule
**Actor:** Planner. **FR:** 017.
**Preconditions:** Levels/zones exist; XLSX in import template layout (SOP-WBS-03 form); `WBS.BULK_IMPORT`.
**Main Flow:**
1. Upload in SCR-WBS-004; system parses 412 rows.
2. Validation passes; dry-run diff: 400 creates (ROOM under existing zones), 12 updates (name changes), 0 rejects.
3. Planner reviews diff, commits.
4. System applies transactionally; batch WB-IMP-0007 recorded with rollback token; `WBS.IMPORT.COMPLETED`.
**Alternate:** partial acceptance is not offered — commit is all-or-nothing by design; planner may edit the file and re-run.
**Postconditions:** 400 ROOM nodes DRAFT under correct zones.

---

### UC-WBS-004 — Import Rejected: Duplicate Codes and Bad Parents
**Actor:** Planner.
**Trigger:** Upload of a hand-edited file.
**Main Flow:** validation finds 6 duplicate sibling codes and 3 parent references that resolve nowhere.
**Exception Flow (primary path):** system stops at VALIDATION_FAILED; report lists row numbers: *"Row 41: code R045 duplicates row 12 under P001-PH2-B01-L05-Z03"*, *"Row 77: parent 'L5-Z9' not found in file or tree."* Nothing is written. `WBS.IMPORT.FAILED` audited with report attached.
**Recovery:** planner fixes the file, re-uploads; previous failed batch retained for reference.

---

### UC-WBS-005 — Roll Back a Committed Import
**Actor:** Planner. **FR:** 018.
**Preconditions:** Batch WB-IMP-0007 COMMITTED yesterday; wrong level codes discovered (L06 rooms imported under L05).
**Main Flow:** open batch → Rollback → system verifies no imported node has acquired links/children outside the batch → confirm → reversal in one transaction → `WBS.IMPORT.ROLLED_BACK` (HIGH) → notification to planner, PM, Company Admin.
**Exception:** 2 rooms already have inspection requests linked → refusal listing both nodes: *"Cannot roll back: R101, R102 have linked records. Reassign or remove links first."* Recovery: reassign links (UC-WBS-007 path), retry.
**Postconditions:** Tree identical to pre-import state (verified by TC-WBS-IMPORT-*).

---

### UC-WBS-006 — Move Zone 03 from Level 05 to Level 06 (Flagship)
**Actor:** Planner. **Stakeholders:** PM, DC, QS, node responsibles.
**Preconditions:** Not baseline-locked (else UC-WBS-008); `WBS.MOVE_NODE`; Zone 03 subtree = 9 nodes, 34 documents, 12 tasks, 3 responsibilities linked.
**Trigger:** Design change relocates the zone scope.
**Main Flow:**
1. Planner drags Z03 onto L06 in SCR-WBS-001.
2. System validates drop target live (rule, cycle, depth, code collision) — target highlights green.
3. Impact Preview Modal (SCR-WBS-003): "9 nodes move; 46 linked records follow; codes re-materialise from P001-PH2-B01-**L05**-Z03… to …**L06**-Z03…; roll-up recalculates on both level chains."
4. Planner confirms.
5. Single transaction: closure rewrite, re-materialisation, previous_full_code written, version token bump, cache invalidation both chains.
6. `WBS.NODE.MOVED` (HIGH); notifications to PM, Discipline Manager, DC, responsibles.
**Alternates:** 2a. Invalid drop (onto own descendant) → red highlight + tooltip *"Cannot move a node into its own subtree."*
**Exceptions:** 5a. Sibling code Z03 already exists under L06 → `WBS_CODE_DUPLICATE`: *"L06 already contains Z03. Rename one zone or choose a different code on move."* Offered inline re-code.
**Postconditions:** IDs unchanged; all links intact; old full codes resolvable (FR-011).
**Audit:** `WBS.NODE.MOVED` with old/new parent and codes.

---

### UC-WBS-007 — Attempt to Delete a Node with 34 Documents and 12 Tasks
**Actor:** Planner.
**Main Flow:** Delete on Z03 → guard finds 46 links → refusal dialog: *"Zone 03 has 46 linked records (34 documents, 12 tasks). Deleting is not possible. Choose: Archive zone · Reassign links · Cancel."* `WBS.NODE.DELETE_BLOCKED` audited.
**Alternate A:** Archive → status path per FR-026 (links preserved, node hidden from default views).
**Alternate B:** Reassign links → guided picker to a target node honouring leaf-only rules; each reassignment audited by the owning module + link registry updated; when count reaches 0, delete proceeds (`WBS.NODE.DELETED`, HIGH).
**Rule:** BR-D. **Permission:** `WBS.DELETE_NODE` / `WBS.ARCHIVE_NODE`.

---

### UC-WBS-008 — Move Blocked by Baseline Lock
**Actor:** Planner.
**Preconditions:** Baseline R0 set (UC-WBS-011); Z03 `baseline_locked=true`.
**Main Flow:** drag attempt → immediate block: *"Structure is baselined (R0, 2026-06-30). Moving Zone 03 requires an approved change request."* Button: **Raise Change Request** → pre-filled CR form (UC-WBS-009).
**Audit:** blocked attempt recorded via `WBS.STRUCTURE.RULE_VIOLATION`-class entry with reason BASELINE_LOCKED.
**Rule:** BR-E; FR-028.

---

### UC-WBS-009 — Raise, Approve, and Apply a Change Request
**Actors:** Planner (raise), PM (approve).
**Main Flow:**
1. Planner submits CR: type MOVE, node Z03, target L06, justification "Design change per EI-014".
2. Approval engine routes to PM (raiser ≠ approver enforced). `WBS.CHANGE.RAISED`.
3. PM reviews with embedded impact preview; approves with comment.
4. System applies the move automatically, stamping CR-WBS-0009 into the `WBS.NODE.MOVED` audit event. `WBS.CHANGE.APPROVED` (HIGH).
**Alternates:** 3a. Reject with mandatory comment → `WBS.CHANGE.REJECTED`; planner may revise and resubmit as a new CR.
**Exceptions:** 3b. No action in 48 h → escalation notification to Project Director (Part 4.12). 3c. PM deactivated mid-flow → approval engine fallback approver receives it (Stakeholder module contract); audit notes reassignment.
**Postconditions:** Structure changed with full paper trail; baseline diff will show the move with its CR reference.

---

### UC-WBS-010 — Rename a Level After Documents Have Been Issued Against Its Code
**Actors:** DC, Planner.
**Scenario:** "Level 05" renamed "Level 05 — Podium Transfer"; separately, a CR re-codes `L05`→`L05A` after a numbering clash with a joint-venture partner's set.
**Main Flow (rename):** name-only change → full_path re-materialised for subtree; full_code untouched; documents unaffected. `WBS.NODE.UPDATED`.
**Main Flow (re-code, post-baseline):** CR per UC-WBS-009 → on apply, `previous_full_code` gains `P001-PH2-B01-L05`; subtree re-materialised; `WBS.CODE.CHANGED` (HIGH); DC notified.
**Verification:** DC pastes old document number `P001-STR-DWG-B01-L05-001-R02` into resolution search → resolves to the L05A node (FR-011) in <30 s (SC-07).

---

### UC-WBS-011 — Set Structure Baseline Before First IPC
**Actor:** PM. **Stakeholders:** Planner, QS, DC (four-party sign-off per SOP-WBS-04).
**Preconditions:** Sign-off checklist complete; `WBS.SET_BASELINE`.
**Main Flow:** SCR-WBS-006 → "Set Baseline R0" → summary (node count 512, DRAFT nodes listed as warning) → confirm → snapshot written, `baseline_locked=true` across live nodes → `WBS.BASELINE.SET` (HIGH) → notifications (PM, PD, Planner, QS).
**Exception:** DRAFT nodes present → warning, not a block: *"37 nodes are still DRAFT. They will be baselined as DRAFT. Continue?"*
**Postconditions:** R0 comparable forever; change control armed.

---

### UC-WBS-012 — Compare Current Tree Against Baseline R0
**Actor:** QS.
**Main Flow:** SCR-WBS-006 diff view → Added 14 (fit-out rooms), Moved 1 (Z03, CR-WBS-0009 shown), Renamed 2, Removed 0, Re-coded 1 → export attached to IPC-04 submission as structural evidence.
**Postconditions:** Consultant question "did the structure change?" answered in one artefact.

---

### UC-WBS-013 — Assign Discipline Responsibility for the MEP Subtree
**Actor:** Discipline Manager (MEP).
**Main Flow:** node `…-B01` → Responsibility tab → assign Eng. Sokha (MEP) valid from 2026-08-01 → inheritance note: applies to descendants without a closer assignment → `WBS.RESPONSIBILITY.ASSIGNED`; Sokha notified (Telegram + in-app).
**Alternate:** transfer → previous assignment end-dated, history retained.
**Exception:** assignee not active on project → refusal via Stakeholder validation (V-12): *"Sokha is not an active member of P001. Add to the project team first."*

---

### UC-WBS-014 — Subcontractor Views Only Their Assigned Subtree
**Actor:** Subcontractor User (rebar sub).
**Preconditions:** SUBTREE scope grant on `…-L05-Z03-STR`.
**Main Flow:** login → tree shows breadcrumb ancestors (P001 / Superstructure / Tower A / Level 05 / Zone 03) as non-expandable context, expandable content only from the STR node down; search returns scope-filtered results; cost tab absent (no `WBS.VIEW_COST_ROLLUP`).
**Exception:** direct URL to node outside scope → 403 `WBS_SCOPE_DENIED`; attempt audited.
**Rule:** doc 07 scope model; no mutation actions rendered for external roles.

---

### UC-WBS-015 — Progress Rolls Up from Six Work Packages to Level 05
**Actor:** System.
**Trigger:** Task Management emits leaf progress updates after site submissions.
**Main Flow:** leaf values written (FR-031) → ancestor caches invalidated → async worker recomputes Zone → Discipline → Level per each node's method (worked numbers in FS §8 A5) → dashboards read cache with `calculated_at` shown.
**Exception:** worker backlog >15 min → staleness badge on all consumers; sweeper re-queues; alert if >60 min (doc 10).

---

### UC-WBS-016 — PM Applies a Manual Progress Override and Must Justify It
**Actor:** PM.
**Scenario:** Zone 03 leaf data lags reality after a weekend pour; client meeting in 1 hour.
**Main Flow:** node → Roll-Up tab → Override → value 66%, reason code `DATA_LAG`, comment mandatory → confirm warning: *"Override values are flagged in every report and listed in the Override Exception Report until removed."* → `WBS.PROGRESS.OVERRIDDEN` (HIGH); PD and QS notified.
**Alternate:** remove override next day → recalculation restores derived value; removal audited.
**Exception:** missing reason → `WBS_OVERRIDE_REASON_REQUIRED`, no partial save.
**Governance:** appears in SCR-WBS-009 until cleared; SC-03 KPI counts it.

---

### UC-WBS-017 — Cancel a Descoped Zone After an Omission Variation
**Actor:** PM. **FR:** 025, 029.
**Preconditions:** VO-011 omits Zone 04 fit-out; CR raised referencing the VO.
**Main Flow:** CR approved → guard requires zero live links → 6 open tasks exist → PM cancels tasks in Task Management (their own workflow) → links deregister → cancellation applies; nodes CANCELLED with reason `OMISSION_VO-011`; excluded from denominators (ROLL-06) → Level roll-up recomputes upward.
**Postconditions:** History retained; progress honest.

---

### UC-WBS-018 — Close Level 05 with an Open NCR Still Linked
**Actor:** PM. **FR:** 023.
**Main Flow:** COMPLETED→CLOSED attempt → closure gate query finds 1 open NCR (NCR-0034 via link registry status callback) → refusal: *"Level 05 cannot be closed: 1 open NCR (NCR-0034 — honeycombing, Z03 slab soffit). Close the NCR in QA/QC first."* → QA closes NCR → retry succeeds; QA sign-off reference recorded; `WBS.NODE.STATUS_CHANGED`.
**Notification:** the blocked attempt notifies QA/QC Manager and PM (Part 4.12 last row).

---

### UC-WBS-019 — Two Planners Restructure the Same Subtree Simultaneously
**Actors:** Planner A, Planner B.
**Main Flow:** A moves Z03→L06 (commits first, version token v41→v42). B, holding v41, submits reorder within Z03 → `WBS_CONCURRENT_MODIFICATION`: *"This subtree was changed by [Move Z03 → L06, Planner A, 14:02] while you were editing. Refresh to continue."* B refreshes, re-applies if still valid.
**Rule:** last-writer-refused; no silent merge; both attempts audited.

---

### UC-WBS-020 — Duplicate Level 05 Subtree to Create Levels 06–20
**Actor:** Planner. **FR:** 015.
**Main Flow:** duplicate wizard → source L05 (34 nodes) → repeat ×15 → code mask `L{nn}` sequence 06–20 → preview 510 new nodes in batched transactions of ≤1,000 → apply → all new nodes DRAFT, no links/progress copied → `WBS.NODE.DUPLICATED` per batch.
**Exception:** L07 already exists partially → collision list; planner excludes L07 from the run and merges manually.

---

### UC-WBS-021 — Archive a Completed Building at Project Handover
**Actor:** PM.
**Main Flow:** B01 CLOSED after closure gates → Archive with cascade preview (487 nodes) → confirm → subtree ARCHIVED, hidden from default views, fully reportable → `WBS.NODE.ARCHIVED` + `WBS.NODE.STATUS_CASCADED`.
**Exception:** 3 descendants still COMPLETED (not CLOSED) → cascade partial-failure report lists them; PM closes them first.

---

### UC-WBS-022 — Site Engineer Navigates the Tree Offline on Mobile
**Actor:** Site Engineer. **FR:** 047 (Phase 3).
**Main Flow:** overnight WiFi sync caches scope manifest → on the slab with no signal, engineer browses breadcrumb-first navigation, opens node context for a daily report draft → on reconnect, structure deltas pull server-wins; a node moved overnight shows a banner *"Location updated: Zone 03 is now under Level 06"*; the draft's node reference (ID-based) is unaffected.
**Rule:** IDs, never codes, as references — the move is invisible to the draft's validity.

---

### UC-WBS-023 — Configure Code Segments for a New Project
**Actors:** Company Admin, DC.
**Main Flow:** SCR-WBS-008 → per node type set mode/mask (LEVEL: AUTO_TEMPLATE `L{nn}`; ZONE: AUTO_SEQUENTIAL `Z` prefix; WORK_PACKAGE: MANUAL) → save → first LEVEL node created locks LEVEL mode (FR-007).
**Exception:** mode change attempt after lock → *"Level uses L{nn} and 12 levels exist. Generation mode is locked for this project."*

---

### UC-WBS-024 — Cascade Hold on a Zone Subtree
**Actor:** PM.
**Scenario:** Authority stop-work on Zone 03 pending fire-access review.
**Main Flow:** Z03 → On Hold with cascade → impact preview (9 nodes, 12 open tasks affected — tasks blocked via status gate FR-040) → reason `AUTHORITY_STOP_WORK` → confirm → `WBS.NODE.STATUS_CASCADED` (HIGH); every affected responsible + PM notified (Telegram per Part 4.12).
**Resume:** cascade back to ACTIVE with resumption date recorded.

---

## 5. End-to-End Scenario — Tower A, Activation to Level Closure

1. **Award week.** P001 activated (Project Setup) → root auto-created. Planner applies "Tower — 2 Phase" template (UC-001): phases, B01, L01–L12 skeleton.
2. **Refinement.** Planner details Level 05 manually (UC-002): zones, STR/MEP discipline nodes, work packages `SLAB`, `COL`, `SLV`.
3. **Fit-out scale-up.** Architect's room schedule → 400 rooms imported (UC-003) after one failed validation run (UC-004) caught duplicate R045.
4. **Typical floors.** L05 duplicated to L06–L20 (UC-020).
5. **Coding locked in.** DC + Admin finalise segments (UC-023); DC confirms document numbering pulls `B01-L05` correctly.
6. **Sign-off & baseline.** Four-party review (SOP-WBS-04); PM sets Baseline R0 (UC-011) the week before IPC-01.
7. **Execution.** Site progress flows in; roll-ups compute (UC-015); Sokha owns MEP for B01 (UC-013); rebar sub works inside its STR zone scope (UC-014).
8. **Design change.** EI-014 relocates Zone 03 → blocked by lock (UC-008) → CR raised, approved, applied (UC-009/006); QS attaches the baseline diff to IPC-04 (UC-012).
9. **Exception month.** Weekend pour outpaces data → PM overrides Zone 03 with reason (UC-016), clears it two days later.
10. **Descope.** VO-011 omits Zone 04 fit-out → cancelled with clean links (UC-017).
11. **Closure.** Level 05 completes; first close attempt blocked by NCR-0034 (UC-018); NCR closed; level CLOSED; at handover B01 archived (UC-021).

Every step above is reconstructible from the audit trail with CR and VO references — which is the point.

## 6. Exception Scenario Catalogue

| # | Scenario | Covered In |
|---|---|---|
| EX-1 | Move into own subtree (cycle) | UC-006 alt 2a |
| EX-2 | Delete with links | UC-007 |
| EX-3 | Baseline-locked mutation | UC-008 |
| EX-4 | Import validation failure at volume | UC-004 |
| EX-5 | Import rollback blocked by acquired links | UC-005 |
| EX-6 | Concurrent subtree modification | UC-019 |
| EX-7 | Closure blocked by open NCR | UC-018 |
| EX-8 | Cascade partial failure | UC-021 |
| EX-9 | Scope escape via direct URL | UC-014 |
| EX-10 | Approver timeout / departure on CR | UC-009 3b/3c |

## 7. Traceability Matrix (UC → FR)

| UC | FRs |
|---|---|
| 001 | 001, 020 · 002 | 002, 005, 008 · 003 | 017 · 004 | 017 · 005 | 018 · 006 | 012, 013 · 007 | 016, 026 · 008 | 028 · 009 | 029 · 010 | 006, 010, 011 · 011 | 027 · 012 | 030 · 013 | 037 · 014 | 041, 042 · 015 | 031, 032, 034 · 016 | 035, 044 · 017 | 025 · 018 | 023 · 019 | 012 · 020 | 015 · 021 | 024, 026 · 022 | 047 · 023 | 007 · 024 | 024, 040 |

All FRs referenced by ≥1 UC except configuration/report FRs 033, 036, 038–039, 043, 045–046, 048 which are system/service-facing and covered directly by test cases in document 09.

## 8. Open Questions

| # | Question |
|---|---|
| OQ-01 | Should cascade-hold auto-hold linked tasks (current: status gate blocks new activity; existing task hold is Task Management's decision)? |

## 9. Change Log

| Version | Date | Change |
|---|---|---|
| R1 | 2026-08-08 | Initial issue |

**End of Document**
