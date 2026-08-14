# DCOS — WBS Management Module
## 02 — Functional Specification

| Field | Detail |
|---|---|
| Document Code | DCOS-WBS-FS-001 |
| Version | R1 |
| Module | 04-03 — WBS Management (Foundation) |
| Author Persona | Senior System Architect |
| Status | Issued for Review |
| Base References | DCOS-WBS-BRD-001; Master Prompt Part 4 |

| Change Log | | |
|---|---|---|
| R1 | 2026-08-08 | Initial issue |

---

## 1. Functional Overview

WBS Management provides: the tree (structure definition and mutation), the codes (segment generation and integrity), the gates (lifecycle, baseline, change control), the mathematics (roll-up), the registry (what is linked where — the delete guard), and the service (context resolution for every other module).

```
            ┌────────────── consumes ──────────────┐
Project Setup ──activation──▶ ┌─────────────────┐ ◀── Task Mgmt (leaf progress)
Admin Config ──rules/types──▶ │  WBS MANAGEMENT │ ◀── QA/QC (measured progress)
Planning #23 ──dates(ro)────▶ │                 │ ◀── BOQ #29 (cost measures)
                              └───────┬─────────┘
              provides: resolve / validate / register-link / rollup
                                      ▼
   Documents #37 · Procurement #18 · Stock #20 · Construction #22 · QA/QC #27
   HSE #28 · Equipment #24 · IPC #32 · EVM #31 · Reporting #44 · Mobile #49
```

## 2. Feature Breakdown

| Group | Features |
|---|---|
| Structure Definition | Node CRUD, type governance, parent-child rules, depth/breadth limits |
| Coding | Segment definition, MANUAL / AUTO_SEQUENTIAL / AUTO_TEMPLATE generation, uniqueness, materialised full code and path, historical code retention |
| Mutation | Rename, move, reorder, duplicate subtree, cycle prevention, impact preview |
| Bulk Operations | CSV/Excel import with dry run and rollback, export |
| Templates | Company template library, apply-at-activation, save-as-template |
| Lifecycle | Seven statuses, guarded transitions, previewed cascade |
| Baseline & Change Control | Baseline snapshots, lock, change requests via approval engine, baseline diff |
| Roll-Up | Five methods, event-driven async recalc, cache with staleness, override with reason |
| Responsibility | Per-node per-discipline responsible party with validity dates |
| Linkage Registry | register/deregister link, delete guard, nightly reconciliation |
| Access Scoping | Five scope types feeding RLS (detail in 07-RBAC-Matrix) |
| Reporting Feeds | Roll-up read model, snapshots, override exception report |

## 3. Functional Requirements

Format per FR: **Description · Inputs · Processing · Outputs · Validation · Errors · Permission · Audit Event · Phase**.

### 3.1 Structure Definition

| ID | Requirement |
|---|---|
| FR-WBS-001 | **Create root on project activation.** Trigger: `PRJ.PROJECT.ACTIVATED` event. Processing: create single `PROJECT_ROOT` node with project code as segment, status ACTIVE, depth 0. Validation: no existing root for project. Errors: duplicate-root refused. Permission: system. Audit: `WBS.NODE.CREATED`. **MVP** |
| FR-WBS-002 | **Create node.** Inputs: parent_id, node_type_code, wbs_code (or auto), node_name, discipline_code?, rollup_method?, attributes?. Processing: validate structure rule (Part 4.3), depth ≤ 11, sibling code unique, generate code if auto; insert node; insert closure rows; set parent `is_leaf=false`; invalidate ancestor roll-up. Outputs: node with full_code, full_path. Errors: `WBS_STRUCTURE_RULE_VIOLATION`, `WBS_DEPTH_EXCEEDED`, `WBS_CODE_DUPLICATE`, `WBS_LEAF_CANNOT_HAVE_CHILDREN` (parent is WORK_PACKAGE), `WBS_BASELINE_LOCKED` (adding under a locked branch → allowed unless project setting `baseline_blocks_additions=true`; default false, additions permitted, recorded in next baseline diff). Permission: `WBS.CREATE_NODE`. Audit: `WBS.NODE.CREATED`. **MVP** |
| FR-WBS-003 | **Node type governance.** WORK_PACKAGE must be leaf; only Part 4.3-permitted children accepted; CONTROL_ACCOUNT is a flag (`is_control_account`) settable on branch nodes by `WBS.EDIT_NODE`, consumed by EVM (#31). Audit: `WBS.NODE.UPDATED`. **Phase 2** (flag), **MVP** (leaf rule) |
| FR-WBS-004 | **Breadth guard.** >200 direct children: warning requiring confirmation; >1,000: hard refusal `WBS_BREADTH_EXCEEDED`. **MVP** |
| FR-WBS-005 | **Edit node.** Name, discipline, attributes, rollup_method, sort metadata. Code changes are FR-WBS-010, status FR-WBS-020. Concurrency: optimistic `updated_at` check → `WBS_CONCURRENT_MODIFICATION`. Permission: `WBS.EDIT_NODE`. Audit: `WBS.NODE.UPDATED` with changed_fields. **MVP** |
| FR-WBS-006 | **Rename propagation.** On node_name change, re-materialise `full_path` for node and all descendants (single transaction, ≤1,000 nodes else `WBS_SUBTREE_TOO_LARGE`). `full_code` unaffected. **MVP** |

### 3.2 Coding

| ID | Requirement |
|---|---|
| FR-WBS-007 | **Segment definition per project.** For each node type: generation mode, mask (e.g. `L{nn}`), next sequence, prefix. Seeded from template; editable until first node of that type exists, then mode locked. Permission: `WBS.CONFIGURE_RULES`. Audit: `WBS.NODE.UPDATED` (config scope). **MVP** |
| FR-WBS-008 | **Auto code generation.** AUTO_SEQUENTIAL: next unused sequence under parent (gaps not reused unless `reuse_gaps=true`). AUTO_TEMPLATE: apply mask; collision → increment; 50 attempts → error. Format validated against CODE-03. **MVP** |
| FR-WBS-009 | **Full code materialisation.** `full_code` = parent full_code + '-' + wbs_code. Root full_code = project code segment. Unique per project (partial index, live rows). **MVP** |
| FR-WBS-010 | **Code immutability.** `wbs_code` editable while node has zero links AND project not baselined. Afterwards `WBS_CODE_IMMUTABLE`; change path = approved change request → on apply: old full_code written to `previous_full_code` (append, semicolon-separated history), re-materialise subtree, emit `WBS.CODE.CHANGED` HIGH. Permission: `WBS.EDIT_CODE` (+approved CR post-baseline). **MVP** |
| FR-WBS-011 | **Historical code resolution.** Lookup by any current or previous full_code returns the current node. Serves Document Control number resolution. **MVP** |

### 3.3 Mutation

| ID | Requirement |
|---|---|
| FR-WBS-012 | **Move node/subtree.** Inputs: node_id, new_parent_id, position. Processing (single transaction): cycle check via closure table; structure rule check at new parent; depth check for deepest descendant; sibling code collision check; delete/re-insert closure rows for subtree; re-materialise full_code/full_path/depth for subtree; retain own wbs_code; write previous_full_code; invalidate roll-up on OLD and NEW ancestor chains; bump subtree version token. Guards: `WBS_BASELINE_LOCKED` (→ offer change request), `WBS_CIRCULAR_REFERENCE`, `WBS_SUBTREE_TOO_LARGE` (>1,000), root immovable. Concurrency: version token `If-Match`; loser gets `WBS_CONCURRENT_MODIFICATION` naming winning operation id. Permission: `WBS.MOVE_NODE`. Audit: `WBS.NODE.MOVED` HIGH with old/new parent, old/new full_code. Notification per Part 4.12. **MVP** |
| FR-WBS-013 | **Impact analysis (mandatory preview).** Before move/delete/cascade/cancel, compute: descendant count, linked record count by entity_type (from `wbs_node_links`), affected responsibilities, roll-up chains to invalidate, codes to re-materialise. Target < 1.5 s. The UI must display this before confirmation; the API exposes it at `/impact-analysis`. **MVP** |
| FR-WBS-014 | **Reorder siblings.** Update sort_order transactionally. Permission: `WBS.REORDER_NODE`. Audit: `WBS.NODE.REORDERED` LOW. **MVP** |
| FR-WBS-015 | **Duplicate subtree.** Copy structure, attributes, rollup methods, structure-relevant settings; never copy links, progress, responsibilities (optional flag), or status (new nodes = DRAFT). Re-code via mask (L05→L06) or prompt. Limit 1,000 nodes. Permission: `WBS.DUPLICATE_NODE`. Audit: `WBS.NODE.DUPLICATED`. **MVP** |
| FR-WBS-016 | **Delete guard.** DELETE allowed only when `wbs_node_links` count = 0 AND no children AND not baseline-locked. Soft delete (`deleted_at`). Otherwise `WBS_NODE_HAS_LINKS` + emit `WBS.NODE.DELETE_BLOCKED` + offer Archive / Reassign-links. Root undeletable. Permission: `WBS.DELETE_NODE`. Audit: `WBS.NODE.DELETED` HIGH. **MVP** |

### 3.4 Bulk Operations & Templates

| ID | Requirement |
|---|---|
| FR-WBS-017 | **Import pipeline.** Upload CSV/XLSX → parse → structural validation (parents resolvable, types legal, depth, codes) → dry-run diff (creates/updates/rejects with row numbers and reasons) → user commits → transactional apply → batch recorded with rollback token. Limits: 5,000 rows, 20 s validation for 2,000 rows. Errors: `WBS_IMPORT_VALIDATION_FAILED` (report attached). Permission: `WBS.BULK_IMPORT`. Audit: `WBS.IMPORT.STARTED/COMPLETED/FAILED`. **MVP** |
| FR-WBS-018 | **Import rollback.** Reverse a committed batch iff no imported node has since acquired links or children outside the batch; else refuse with the blocking node list. `WBS_IMPORT_ALREADY_COMMITTED` if already rolled back. Permission: `WBS.ROLLBACK_IMPORT`. Audit: `WBS.IMPORT.ROLLED_BACK` HIGH. **MVP** |
| FR-WBS-019 | **Export.** Flat CSV/XLSX of tree with full_code, full_path, type, status, progress, cost measures (permission-filtered: cost columns require `WBS.VIEW_COST_ROLLUP`). Override-flagged rows marked. Permission: `WBS.EXPORT`. Audit: EXPORT action per R0 §24.4.7. **MVP** |
| FR-WBS-020 | **Templates.** Company-level library; save subtree as template (structure + relative codes + attributes, no links); apply at/after activation under a chosen node; template versioned. Permissions: `WBS.MANAGE_TEMPLATE`, `WBS.APPLY_TEMPLATE`. Audit: `WBS.TEMPLATE.SAVED/APPLIED`. **MVP** |

### 3.5 Lifecycle

| ID | Requirement |
|---|---|
| FR-WBS-021 | **Status transitions.** Exactly the Part 4.4 table; illegal transition → `WBS_STATUS_TRANSITION_INVALID`. Reason required where specified. Permission: `WBS.CHANGE_STATUS`. Audit: `WBS.NODE.STATUS_CHANGED` with status_from/to. **MVP** |
| FR-WBS-022 | **Completion gate.** ACTIVE→COMPLETED requires all descendants COMPLETED/CLOSED/CANCELLED and roll-up = 100% (tolerance 0.5%). Otherwise refusal listing blocking descendants. **MVP** |
| FR-WBS-023 | **Closure gate.** COMPLETED→CLOSED requires zero open tasks, zero open NCRs, zero unapproved documents in links (checked via link registry counts by status supplied by owning modules through the validation callback) and a recorded QA sign-off reference. **Phase 2** (NCR/doc checks), **MVP** (task check) |
| FR-WBS-024 | **Cascade with preview.** Parent → ON_HOLD/CLOSED/CANCELLED/ARCHIVED offers cascade: impact preview (FR-WBS-013), explicit confirm, per-node transition validation, partial-failure report (nodes that failed their guard remain, listed). Permission: `WBS.CASCADE_STATUS`. Audit: `WBS.NODE.STATUS_CASCADED` HIGH. **MVP** |
| FR-WBS-025 | **Cancel (descope).** ACTIVE→CANCELLED requires approved change request + all links reassigned or cancelled first (guard lists blockers). Excluded from roll-ups per ROLL-06. **Phase 2** |
| FR-WBS-026 | **Archive/Restore.** Archive removes from default tree views; restore requires `WBS.RESTORE_NODE` and project not CLOSED. Audit: `WBS.NODE.ARCHIVED/RESTORED`. **MVP** |

### 3.6 Baseline & Change Control

| ID | Requirement |
|---|---|
| FR-WBS-027 | **Set baseline.** Snapshot every live node (id, parent, code, full_code, name, type, status, sort) into `wbs_baseline_nodes` under a `wbs_baselines` row (label R0, R1…, approval reference, set_by, set_at). Sets `baseline_locked=true` on all snapshot nodes. Permission: `WBS.SET_BASELINE`. Audit: `WBS.BASELINE.SET` HIGH. Notification per Part 4.12. **MVP** |
| FR-WBS-028 | **Locked-node behaviour.** `baseline_locked=true` blocks move, code change, delete, type change → error `WBS_BASELINE_LOCKED` / `WBS_CHANGE_REQUEST_REQUIRED`, response includes "raise change request" action. Rename and attribute edits remain free (recorded in diff). **MVP** |
| FR-WBS-029 | **Change request.** Fields: nodes affected, change type (MOVE/CODE/DELETE/CANCEL/TYPE), justification, requested_by; routed through Approval Workflow Engine (approver: PM or Project Director; raiser ≠ approver). On approval the requested operation is applied by the system with CR reference stamped into the audit event. Rejection returns with comment. Timeout: escalation per notification rules (48 h → Project Director). Departure path: if the assigned approver is deactivated, the approval engine's fallback approver contract applies (Stakeholder module). Permissions: `WBS.RAISE_CHANGE`, `WBS.APPROVE_CHANGE`. Audit: `WBS.CHANGE.RAISED/APPROVED/REJECTED`. **MVP** |
| FR-WBS-030 | **Baseline compare.** Diff current tree vs chosen baseline: added, removed, moved (old/new parent), renamed, re-coded. Exportable. **Phase 2** |

### 3.7 Roll-Up

| ID | Requirement |
|---|---|
| FR-WBS-031 | **Leaf progress intake.** Consumed from Task Management / QA-QC / BOQ via event; WBS never authors leaf progress (ROLL-01). Intake writes leaf `progress_percent` and invalidates ancestor cache. **MVP** |
| FR-WBS-032 | **Roll-up computation.** Per node by its `rollup_method` (Part 4.6). Mixed-method rule: a parent applies its own method to child *results* — e.g. a COST_WEIGHTED parent weights each child's computed progress by child budget regardless of how the child derived it. Async worker; idempotent; full rebuild available (`WBS.RECALCULATE_ROLLUP`). 5,000-node rebuild < 60 s. Audit: `WBS.ROLLUP.RECALCULATED` LOW. **MVP** |
| FR-WBS-033 | **Cost roll-up.** Aggregate budget/committed/actual/forecast from BOQ/Budget feeds per node, both currencies. Visible only with `WBS.VIEW_COST_ROLLUP`. **Phase 2** |
| FR-WBS-034 | **Staleness.** Cache rows carry `calculated_at`, `is_stale`. Any consumer display older than 15 min must show age (contract restated to consumers in doc 05). Stale sweeper re-queues. **MVP** |
| FR-WBS-035 | **Manual override.** Sets node `rollup_method=MANUAL_OVERRIDE` + value + mandatory reason code + comment. Flagged everywhere (UI, reports, exports); listed in Override Exception Report; removal recalculates. Permission: `WBS.OVERRIDE_PROGRESS`. Audit: `WBS.PROGRESS.OVERRIDDEN` HIGH. Error without reason: `WBS_OVERRIDE_REASON_REQUIRED`. **MVP** |
| FR-WBS-036 | **Period snapshots.** Period-end job freezes roll-up values per node into `wbs_progress_snapshots` (period label, e.g. 2026-07) for S-curves and IPC evidence. **Phase 2** |

### 3.8 Responsibility, Links, Scoping

| ID | Requirement |
|---|---|
| FR-WBS-037 | **Responsibility assignment.** Per node per discipline: user or stakeholder contact, role label, valid_from/valid_to; one current primary per (node, discipline); history retained. Feeds Notification recipient strategy "WBS Responsible". Permission: `WBS.ASSIGN_RESPONSIBLE`. Audit: `WBS.RESPONSIBILITY.ASSIGNED`. **MVP** |
| FR-WBS-038 | **Link registry.** `registerLink(node, entity_type, entity_id)` / `deregisterLink` service; consuming modules must call on create/delete of any wbs-referencing record; nightly reconciliation scans consuming tables for unregistered links and repairs + reports. Guard answers in <100 ms. **MVP** |
| FR-WBS-039 | **Leaf-only rule.** Entity types restricted to leaf nodes: task, inspection_request, material_batch_assignment, boq_item (default; configurable per type in Admin Config). Branch-attachable: document, photo, incident, permit, daily_report, budget_line. Violation → refusal by `validateNode`. **MVP** |
| FR-WBS-040 | **Status gate for consumers.** `validateNode` refuses new links on ON_HOLD (configurable), CLOSED, CANCELLED, ARCHIVED, and DRAFT nodes (except during setup by structure editors). **MVP** |
| FR-WBS-041 | **Subtree scoping.** Scope grants (PROJECT_ALL / SUBTREE / DISCIPLINE_FILTERED / RESPONSIBLE_ONLY / LINKED_RECORDS_ONLY) evaluated on every read; ancestors of a granted subtree visible as non-expandable context. Full model in doc 07. **MVP** |
| FR-WBS-042 | **Search.** Code + name search, project-scoped, trigram-backed, < 300 ms at 5,000 nodes, respecting scope. **MVP** |

### 3.9 Reporting & Misc

| ID | Requirement |
|---|---|
| FR-WBS-043 | **Tree read models.** Full tree, lazy tree (children on demand), flat list; all scope-filtered; lazy default above 500 nodes. **MVP** |
| FR-WBS-044 | **Override Exception Report.** All MANUAL_OVERRIDE nodes with value, reason, who, when, age. **MVP** |
| FR-WBS-045 | **Orphan & integrity report.** Nightly: orphan nodes, closure inconsistencies, full_code mismatches, is_leaf mismatches, unregistered links. Zero-tolerance alerting (doc 10). **MVP** |
| FR-WBS-046 | **Planned dates mirror.** `planned_start`/`planned_finish` written only by Planning & Scheduling (#23) integration; read-only in this module; displayed on nodes. **Explicit non-requirement:** WBS computes no float, no critical path, no dependency logic — this closes Gap Analysis §3.4 by assignment to Module 23. **Phase 2** |
| FR-WBS-047 | **Mobile subtree manifest.** Produce a cacheable manifest (nodes, codes, paths, statuses) for a user's scope for offline navigation; structure conflicts resolve server-wins on sync. **Phase 3** |
| FR-WBS-048 | **Attribute management.** Typed custom attributes (text/number/date/json) per node, e.g. area_m2, elevation, grid_ref, ifc_guid. **Phase 2** |

## 4. Screen Inventory

| ID | Screen | Primary Actions |
|---|---|---|
| SCR-WBS-001 | WBS Tree Workspace (left tree + node detail) | navigate, create, rename, move (drag), status, search |
| SCR-WBS-002 | Node Detail Panel (tabs: Overview, Attributes, Linked Records, Responsibility, Roll-Up, History) | edit, assign, override |
| SCR-WBS-003 | Impact Preview Modal | confirm/cancel destructive ops |
| SCR-WBS-004 | Import Wizard (upload → validate → diff → commit) | import, rollback |
| SCR-WBS-005 | Template Library | manage, apply |
| SCR-WBS-006 | Baseline Manager & Diff Viewer | set baseline, compare |
| SCR-WBS-007 | Change Request Form & Queue | raise, approve, reject |
| SCR-WBS-008 | Code Segment Configuration | configure rules |
| SCR-WBS-009 | Override Exception Report | review |
| SCR-WBS-010 | Integrity & Orphan Report | review, repair |

## 5. Validation Rules

| # | Field/Context | Rule |
|---|---|---|
| V-01 | wbs_code | `^[A-Z0-9_]{1,12}$`; not `ROOT` |
| V-02 | node_name | 1–120 chars, no leading/trailing space |
| V-03 | parent/type | pair must exist in `wbs_structure_rules` |
| V-04 | depth | computed depth ≤ 11 |
| V-05 | sibling code | unique among live siblings |
| V-06 | full_code | unique among live nodes per project |
| V-07 | rollup_method | one of Part 4.6; MANUAL_OVERRIDE only via FR-WBS-035 |
| V-08 | status | transition in Part 4.4 table |
| V-09 | move target | not self, not own descendant (closure check) |
| V-10 | override | reason_code mandatory; value 0–100 |
| V-11 | import row | parent reference resolvable within file or tree |
| V-12 | responsibility | valid_to ≥ valid_from; assignee active in project (Stakeholder check) |
| V-13 | cross-field | WORK_PACKAGE ⇒ is_leaf=true enforced at write |

## 6. Business Rule Enforcement Map

| BRL | Enforced by |
|---|---|
| BRL-WBS-001 | FR-001, DB one-root index |
| BRL-WBS-002 | FR-002/003/004, V-03/04 |
| BRL-WBS-003 | FR-007–011, V-01/05/06 |
| BRL-WBS-004 | FR-039, Part 2.4 D1, leaf rule |
| BRL-WBS-005 | FR-031/032/035, ROLL-02/03 |
| BRL-WBS-006 | FR-033 |
| BRL-WBS-007 | FR-016, FR-038 |
| BRL-WBS-008 | FR-027–029 |
| BRL-WBS-009 | FR-010/011 |
| BRL-WBS-010 | FR-041 (doc 07) |
| BRL-WBS-011 | FR-037 |
| BRL-WBS-012 | FR-020 |
| BRL-WBS-013 | FR-017/018 |
| BRL-WBS-014 | every FR's audit column |
| BRL-WBS-015 | FR-021–026 |
| BRL-WBS-016 | FR-047 |
| BRL-WBS-017 | FR-015 |
| BRL-WBS-018 | FR-030 |
| BRL-WBS-019 | FR-025 |
| BRL-WBS-020 | FR-048 |

## 7. State Machines

### Node Status
```
DRAFT ──▶ ACTIVE ──▶ ON_HOLD ──▶ ACTIVE
  │          │  ▲                    
  │          │  └────(reopen)◀── COMPLETED ──▶ CLOSED ──▶ ARCHIVED
  │          │                                   │  ▲        │
  │          └──(CR)──▶ CANCELLED                └──(CR)─────┘(restore)
  └────────────▶ CANCELLED
```

### Change Request
```
DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → APPLIED
                        │
                        └→ REJECTED → (CLOSED or resubmit as new)
Timeout: SUBMITTED/UNDER_REVIEW > 48h → ESCALATED (still UNDER_REVIEW, escalation notified)
```

### Import Batch
```
UPLOADED → VALIDATING → VALIDATED(diff ready) → COMMITTING → COMMITTED → ROLLED_BACK
               │                                    │
               └→ VALIDATION_FAILED                 └→ COMMIT_FAILED (auto-reverted)
```

### Baseline
```
DRAFT → SET(locked) → SUPERSEDED (when a later baseline is set; remains comparable)
```

## 8. Algorithms

**A1 — Cycle detection on move.** Refuse if `EXISTS (SELECT 1 FROM wbs_closure WHERE ancestor_id = :node AND descendant_id = :new_parent)` — i.e. the new parent is inside the moving subtree. O(1) with the closure index.

**A2 — Closure maintenance on move.** Delete rows `(a,d)` where d ∈ subtree(node) and a ∉ subtree(node); insert cross-product of ancestors(new_parent) ∪ {new_parent} × subtree(node) with recomputed depths. Full SQL in doc 04 §5.

**A3 — Re-materialisation.** BFS from moved/renamed node: `full_code(child) = full_code(parent) || '-' || wbs_code(child)`; `full_path` analogous with names and ' / '; `depth = parent.depth + 1`. Single transaction; count guard 1,000.

**A4 — Auto code.** SEQUENTIAL: `next_seq` from `wbs_code_segments` row (SELECT … FOR UPDATE), format with mask width, increment. TEMPLATE: substitute `{nn}`/`{nnn}` with sequence, `{PARENT}` with parent segment; collision → next sequence, cap 50.

**A5 — Roll-up per method.** Let children i with result pᵢ (their own computed or override value), excluding CANCELLED (ROLL-06):
- EQUAL_WEIGHT: Σpᵢ / n
- COST_WEIGHTED: Σ(pᵢ·budgetᵢ) / Σbudgetᵢ (budget 0 children fall back to equal weight within the zero-budget subset, weighted at 0 against budgeted siblings? No — rule: children with budget 0 are excluded from a COST_WEIGHTED parent's calculation and flagged in the integrity report)
- DURATION_WEIGHTED: Σ(pᵢ·durᵢ)/Σdurᵢ, dur = planned_finish − planned_start (days); missing dates → excluded + flagged
- QUANTITY_WEIGHTED: Σ(done_qtyᵢ·wᵢ)/Σ(total_qtyᵢ·wᵢ) from BOQ quantity feed
- MANUAL_OVERRIDE: stored value; children still computed for the report but do not feed this node upward — the override value feeds the parent

**Worked example (Part 4.14 tree).** Zone 03 children: STR (2 WPs) and MEP (1 WP). WP progress: SLAB 80% (budget $120k), COL 50% ($60k), SLV 30% ($20k). STR node COST_WEIGHTED: (80·120+50·60)/(120+60) = (9600+3000)/180 = **70.0%**. MEP: single child = **30%**. Zone 03 COST_WEIGHTED over child results: STR result 70 × $180k, MEP 30 × $20k → (70·180+30·20)/200 = (12600+600)/200 = **66.0%**. Same children EQUAL_WEIGHT at Zone: (70+30)/2 = **50.0%**. DURATION_WEIGHTED with STR dur 40d, MEP dur 10d: (70·40+30·10)/50 = **62.0%**. QUANTITY_WEIGHTED at STR with slab 480/600 m² and columns 12/24 nr (weight 1 m²≡1, 1 col≡5): (480·1+12·5)/(600·1+24·5) = 540/720 = **75.0%**. MANUAL_OVERRIDE at Zone 03 set to 60%: Level 05 receives 60 for this zone regardless of the 66 computed, and the zone is flagged.

**A6 — Impact analysis.** One closure query for descendant ids; one grouped count over `wbs_node_links` by entity_type; responsibilities count; ancestor chains (old+new for move). Returns counts + top-level samples.

**A7 — Import pipeline.** Parse → row-level schema check → build in-memory forest resolving parents by row reference or existing full_code → apply V-01…V-13 per row → diff vs tree → present → commit inside one transaction with batch id stamped on created rows.

## 9. Notification Triggers

Exactly Part 4.12 of the master prompt (restated as the binding table for this document). No additional triggers introduced.

## 10. Audit Requirements

Every event in Part 4.11, with: user snapshot fields per R0 §24.4.5, old/new values for UPDATED/MOVED/STATUS/CODE events, CR reference on post-baseline mutations, batch id on import events, reason code on override/hold/cancel.

## 11. Non-Functional Requirements

Part 4.13 targets adopted verbatim. Concurrency: subtree version token; last-writer-refused. Volume assumption: 50 projects × 5,000 nodes per tenant; closure ≈ 12× node count. Isolation: every query carries tenant_id and project_id predicates via RLS (doc 04 §8); `validate-node` p95 < 120 ms.

## 12. MVP Scope Summary

MVP: FR-001–002, 004–012, 013–022, 024, 026–029, 031–032, 034–035, 037–045.
Phase 2: FR-003(flag), 023(full), 025, 030, 033, 036, 046, 048.
Phase 3: FR-047.

## 13. Open Questions

| # | Question |
|---|---|
| OQ-01 | Should `baseline_blocks_additions` default true for client-audited projects? (Currently false.) |
| OQ-02 | Zero-budget children under COST_WEIGHTED: excluded+flagged (current rule) vs auto-fallback to EQUAL_WEIGHT for whole parent? |

## 14. Change Log

| Version | Date | Change |
|---|---|---|
| R1 | 2026-08-08 | Initial issue |

**End of Document**
