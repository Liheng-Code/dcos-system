# DCOS — WBS Management Module
## 09 — Test Plan

| Field | Detail |
|---|---|
| Document Code | DCOS-WBS-QA-001 |
| Version | R1 |
| Module | 04-03 — WBS Management |
| Author Persona | QA Lead + Senior System Architect |
| Status | Issued for Review |
| Base References | DCOS-WBS-FS-001, -UC-001, -DB-001, -RBAC-001, -API-001 |

---

## 1. Test Strategy

Risk-weighted. The three highest-risk behaviours — **move**, **delete guard**, and **roll-up correctness** — receive the deepest coverage, plus an automated **tree-integrity invariant suite** that runs after every mutation test in CI. Cross-tenant isolation is treated as Critical per Gap Analysis §5.2 and is tested on **every** endpoint, not a sample.

**Entry criteria:** schema migrated; seed data loaded; API deployed to test; RBAC roles provisioned; performance dataset seeded.
**Exit criteria:** 100% Critical/High cases passed; zero open Critical/High defects; every FR mapped to ≥1 executed case; integrity invariants green; performance targets met.

## 2. Environment & Test Data

| Dataset | Content |
|---|---|
| DS-1 Tower A | Part 4.14 structure, ~40 nodes, links seeded (34 docs, 12 tasks on Z03) |
| DS-2 Volume | 1 project, 5,000 nodes, 12 levels deep, 60k closure rows, 40k links |
| DS-3 Multi-tenant | Tenant A + Tenant B, structurally identical trees, identical node names — for leak detection |
| DS-4 Baseline | DS-1 with Baseline R0 set and 1 approved CR applied |
| DS-5 Import | Valid 412-row file; corrupt file (6 duplicate codes, 3 bad parents); 6,000-row oversize file |
| DS-6 Roll-up | Nodes with hand-calculated expected values for all five methods |

Roles provisioned: all 20 canonical roles × scope types (PROJECT_ALL, SUBTREE, DISCIPLINE_FILTERED, RESPONSIBLE_ONLY, LINKED_RECORDS_ONLY).

## 3. Tree Integrity Invariant Suite (runs after every mutation test)

| ID | Invariant | Query source |
|---|---|---|
| INV-01 | No orphans: every non-root node's parent exists and is live | DB doc §5 orphan query = 0 |
| INV-02 | No cycles: no node is its own ancestor at depth>0 | closure self-check = 0 |
| INV-03 | Closure ≡ adjacency (no missing, no extra rows) | DB doc §5 consistency CTE = 0 |
| INV-04 | `full_code` = parent.full_code + '-' + wbs_code for every node | comparison query = 0 mismatches |
| INV-05 | `full_path` matches name chain | = 0 mismatches |
| INV-06 | `depth` = closure depth from root | = 0 mismatches |
| INV-07 | `is_leaf` = (child count 0) | = 0 mismatches |
| INV-08 | Exactly one live root per project | count = 1 |
| INV-09 | Every WORK_PACKAGE is a leaf | = 0 violations |
| INV-10 | Every live node has a `wbs_rollup_cache` row | = 0 missing |
| INV-11 | Every `wbs_node_links` row points to a live node | = 0 dangling |

Any invariant failure fails the parent test regardless of its own assertion.

## 4. Test Case Catalogue

Priority: **C**ritical / **H**igh / **M**edium / **L**ow. Type: F(unctional), I(ntegration), P(erformance), S(ecurity), U(I).

### 4.1 STRUCT — structure definition (FR-001..006)

| ID | Title | Pre | Steps | Expected | Pri | T |
|---|---|---|---|---|---|---|
| TC-WBS-STRUCT-001 | Root auto-created on activation | New project | Emit `PRJ.PROJECT.ACTIVATED` | One PROJECT_ROOT, depth 0, ACTIVE, code = project code | C | I |
| TC-WBS-STRUCT-002 | Duplicate activation event | 001 done | Re-emit event | No second root; idempotent no-op | H | I |
| TC-WBS-STRUCT-003 | Create legal child | DS-1 | POST ZONE under LEVEL | 201; closure rows added; parent is_leaf=false | C | F |
| TC-WBS-STRUCT-004 | Create illegal child | DS-1 | POST ROOM under PROJECT_ROOT | 409 `WBS_STRUCTURE_RULE_VIOLATION`; message lists allowed types | H | F |
| TC-WBS-STRUCT-005 | Depth limit | node at depth 11 | POST child | 409 `WBS_DEPTH_EXCEEDED` | H | F |
| TC-WBS-STRUCT-006 | Breadth warning at 201 | parent w/ 200 children | POST child | 201 with `meta.warning` breadth | M | F |
| TC-WBS-STRUCT-007 | Breadth hard block at 1,001 | parent w/ 1,000 | POST child | 409 `WBS_BREADTH_EXCEEDED` | M | F |
| TC-WBS-STRUCT-008 | Child under WORK_PACKAGE | DS-1 | POST under SLAB | 409 `WBS_LEAF_CANNOT_HAVE_CHILDREN` | H | F |
| TC-WBS-STRUCT-009 | Rename propagates full_path | DS-1 | PATCH L05 name | All 9 descendants' full_path updated; full_code unchanged | H | F |
| TC-WBS-STRUCT-010 | Concurrent edit on same node | DS-1 | Two PATCH with stale token | Second 409 `WBS_CONCURRENT_MODIFICATION` | H | F |
| TC-WBS-STRUCT-011 | Create under non-ACTIVE project | project ON_HOLD | POST node | 409 `WBS_PROJECT_NOT_ACTIVE` | M | F |
| TC-WBS-STRUCT-012 | Control account flag | DS-1 | PATCH is_control_account on LEVEL | 200; EVM read exposes node | M | F |

### 4.2 CODE — coding (FR-007..011)

| ID | Title | Expected | Pri | T |
|---|---|---|---|---|
| TC-WBS-CODE-001 | AUTO_SEQUENTIAL generation | Z01, Z02, Z03 in order; no reuse of gaps by default | H | F |
| TC-WBS-CODE-002 | AUTO_TEMPLATE mask `L{nn}` | L01…L12 zero-padded | H | F |
| TC-WBS-CODE-003 | Invalid characters | `L 05` or `l05` → 422 `WBS_CODE_INVALID_FORMAT` | H | F |
| TC-WBS-CODE-004 | Sibling duplicate | Second Z03 under L05 → 409 `WBS_CODE_DUPLICATE` | C | F |
| TC-WBS-CODE-005 | Same code under different parents | Z03 under L05 and L06 both allowed | H | F |
| TC-WBS-CODE-006 | full_code uniqueness enforced at DB | Direct SQL insert of duplicate full_code → unique violation | C | S |
| TC-WBS-CODE-007 | Code immutable with links | PATCH code on Z03 (46 links) → 409 `WBS_CODE_IMMUTABLE`, details reason LINKED_RECORDS | C | F |
| TC-WBS-CODE-008 | Code immutable after baseline | DS-4 → 409 with `change_request_required:true` | C | F |
| TC-WBS-CODE-009 | previous_full_code retained after re-code | Old code stored; search resolves | C | F |
| TC-WBS-CODE-010 | Historical resolution ≤30 s manual drill | Search old document code returns current node | H | F |
| TC-WBS-CODE-011 | Segment mode lock | Change LEVEL mode after 12 levels → 409 | M | F |
| TC-WBS-CODE-012 | Reserved code ROOT | POST wbs_code=ROOT → 422 | L | F |

### 4.3 MOVE — the flagship hazard (FR-012, 013)

| ID | Title | Expected | Pri | T |
|---|---|---|---|---|
| TC-WBS-MOVE-001 | Move Z03 L05→L06 (DS-1) | 200; 9 nodes re-coded; INV-01..11 green | C | F |
| TC-WBS-MOVE-002 | All links resolve after move | 46 links still point to live nodes; entity queries unchanged | C | I |
| TC-WBS-MOVE-003 | full_code re-materialised for every descendant | 0 mismatches (INV-04) | C | F |
| TC-WBS-MOVE-004 | previous_full_code written for subtree | Every moved node retains old code | H | F |
| TC-WBS-MOVE-005 | Move into own descendant | 409 `WBS_CIRCULAR_REFERENCE` | C | F |
| TC-WBS-MOVE-006 | Move to self | 409 | H | F |
| TC-WBS-MOVE-007 | Move root | 409 refused | H | F |
| TC-WBS-MOVE-008 | Move causing depth breach | 409 `WBS_DEPTH_EXCEEDED` on deepest descendant | H | F |
| TC-WBS-MOVE-009 | Move with sibling code collision | 409 `WBS_CODE_DUPLICATE` | H | F |
| TC-WBS-MOVE-010 | Move violating structure rule | 409 `WBS_STRUCTURE_RULE_VIOLATION` | H | F |
| TC-WBS-MOVE-011 | Move baseline-locked node | 409 `WBS_BASELINE_LOCKED`, CR path offered | C | F |
| TC-WBS-MOVE-012 | Move via approved CR | Applied; audit carries cr_ref | C | I |
| TC-WBS-MOVE-013 | Concurrent move, same subtree (UC-019) | Second 409 with winning-operation details | C | F |
| TC-WBS-MOVE-014 | Roll-up invalidated on both chains | Old and new ancestors marked stale | C | F |
| TC-WBS-MOVE-015 | Subtree >1,000 nodes | 202 async job; completes; invariants green | H | P |
| TC-WBS-MOVE-016 | Transaction rollback on mid-move failure | Injected failure → tree unchanged; invariants green | C | F |
| TC-WBS-MOVE-017 | `WBS.NODE.MOVED` event payload | Contains old/new parent, old/new full_code, descendant_count | H | I |
| TC-WBS-MOVE-018 | Impact analysis accuracy | Counts match post-move reality exactly | H | F |

### 4.4 DELETE — guard (FR-016)

| ID | Title | Expected | Pri | T |
|---|---|---|---|---|
| TC-WBS-DELETE-001 | Delete unlinked leaf | 200 soft delete; `deleted_at` set; row retained | H | F |
| TC-WBS-DELETE-002 | Delete node with 46 links | 409 `WBS_NODE_HAS_LINKS`, by_type counts, alternatives listed | C | F |
| TC-WBS-DELETE-003 | `WBS.NODE.DELETE_BLOCKED` audited | Event present with counts | H | I |
| TC-WBS-DELETE-004 | Delete node with children | 409 refused | H | F |
| TC-WBS-DELETE-005 | Delete root | 409 refused | H | F |
| TC-WBS-DELETE-006 | Delete baseline-locked | 409 `WBS_BASELINE_LOCKED` | C | F |
| TC-WBS-DELETE-007 | DB cascade impossible | Direct `DELETE FROM wbs_nodes` on a parent → FK RESTRICT error | C | S |
| TC-WBS-DELETE-008 | Deleted node's audit history survives | Audit rows queryable after delete | C | S |
| TC-WBS-DELETE-009 | Reassign links then delete | After links moved, delete succeeds | H | F |

### 4.5 STATUS — lifecycle (FR-021..026)

| ID | Title | Expected | Pri | T |
|---|---|---|---|---|
| TC-WBS-STATUS-001 | Legal transition DRAFT→ACTIVE | 200 | H | F |
| TC-WBS-STATUS-002 | Illegal DRAFT→CLOSED | 409 `WBS_STATUS_TRANSITION_INVALID` with allowed list | H | F |
| TC-WBS-STATUS-003 | COMPLETED gate with incomplete descendant | 409 listing blockers | C | F |
| TC-WBS-STATUS-004 | COMPLETED when all descendants done | 200 | H | F |
| TC-WBS-STATUS-005 | CLOSED blocked by open NCR (UC-018) | 409 naming NCR-0034 | C | I |
| TC-WBS-STATUS-006 | CLOSED after NCR closed | 200; QA sign-off recorded | C | I |
| TC-WBS-STATUS-007 | ON_HOLD blocks new task link | validate-node returns allowed=false `WBS_STATUS_GATE` | C | I |
| TC-WBS-STATUS-008 | Cascade hold with preview | 9 nodes ON_HOLD; notifications to each responsible | H | F |
| TC-WBS-STATUS-009 | Cascade partial failure | Failed nodes listed; succeeded nodes changed | H | F |
| TC-WBS-STATUS-010 | CANCELLED excluded from roll-up | Denominator excludes node (ROLL-06) | C | F |
| TC-WBS-STATUS-011 | ON_HOLD remains in denominator | Value unchanged by hold (ROLL-07) | H | F |
| TC-WBS-STATUS-012 | Archive/restore round trip | Hidden then restored; links intact | M | F |
| TC-WBS-STATUS-013 | Reopen CLOSED requires CR | 409 without CR; 200 with approved CR | H | F |

### 4.6 ROLLUP (FR-031..036)

| ID | Title | Expected value (DS-6 / Part 4.14) | Pri | T |
|---|---|---|---|---|
| TC-WBS-ROLLUP-001 | COST_WEIGHTED at STR | 80×120k, 50×60k → **70.00%** | C | F |
| TC-WBS-ROLLUP-002 | COST_WEIGHTED at Zone (mixed children) | STR 70×180k, MEP 30×20k → **66.00%** | C | F |
| TC-WBS-ROLLUP-003 | EQUAL_WEIGHT at Zone | (70+30)/2 = **50.00%** | C | F |
| TC-WBS-ROLLUP-004 | DURATION_WEIGHTED at Zone | 40d/10d → **62.00%** | C | F |
| TC-WBS-ROLLUP-005 | QUANTITY_WEIGHTED at STR | 540/720 → **75.00%** | C | F |
| TC-WBS-ROLLUP-006 | MANUAL_OVERRIDE feeds parent | Zone override 60 → Level uses 60, not 66 | C | F |
| TC-WBS-ROLLUP-007 | Parent progress not directly writable | PATCH progress on branch → 403/422 | C | S |
| TC-WBS-ROLLUP-008 | Override without reason | 422 `WBS_OVERRIDE_REASON_REQUIRED` | H | F |
| TC-WBS-ROLLUP-009 | Override flagged in UI, report, export | Flag present in all three | C | U |
| TC-WBS-ROLLUP-010 | Override removal recalculates | Returns to 66.00% | H | F |
| TC-WBS-ROLLUP-011 | Leaf update invalidates ancestor chain | All ancestors `is_stale=true` | C | F |
| TC-WBS-ROLLUP-012 | Recalculation idempotent | Two runs → identical values | H | F |
| TC-WBS-ROLLUP-013 | Zero-budget child under COST_WEIGHTED | Excluded + flagged in integrity report | M | F |
| TC-WBS-ROLLUP-014 | Missing dates under DURATION_WEIGHTED | Excluded + flagged | M | F |
| TC-WBS-ROLLUP-015 | Staleness surfaced >15 min | `calculated_at` age returned; UI shows age | H | U |
| TC-WBS-ROLLUP-016 | Snapshot freezes period values | Later changes don't alter 2026-07 snapshot | H | F |

### 4.7 BASELINE & CHANGE CONTROL (FR-027..030)

| ID | Title | Expected | Pri | T |
|---|---|---|---|---|
| TC-WBS-BASELINE-001 | Set R0 | Snapshot count = live node count; all locked | C | F |
| TC-WBS-BASELINE-002 | Only one current baseline | Setting R1 clears is_current on R0 | H | F |
| TC-WBS-BASELINE-003 | Locked mutation blocked | Move/delete/code → 409 | C | F |
| TC-WBS-BASELINE-004 | Rename allowed post-baseline | 200; appears in diff as renamed | M | F |
| TC-WBS-BASELINE-005 | CR raiser cannot approve | 403 (+DB constraint) | C | S |
| TC-WBS-BASELINE-006 | CR approval applies change | Move executed; cr_ref in audit | C | I |
| TC-WBS-BASELINE-007 | CR rejection requires comment | 422 without comment | H | F |
| TC-WBS-BASELINE-008 | CR timeout escalation at 48 h | Escalation notification to PD | H | I |
| TC-WBS-BASELINE-009 | Approver deactivated mid-flow | Fallback approver receives; audit notes reassignment | H | I |
| TC-WBS-BASELINE-010 | Diff accuracy | Added/renamed/moved/recoded/removed counts match seeded changes | C | F |

### 4.8 IMPORT (FR-017..019)

| ID | Title | Expected | Pri | T |
|---|---|---|---|---|
| TC-WBS-IMPORT-001 | Valid 412-row import | 400 creates, 12 updates, 0 rejects; committed | C | F |
| TC-WBS-IMPORT-002 | Duplicate codes + bad parents | VALIDATION_FAILED; rows 41 and 77 reported; nothing written | C | F |
| TC-WBS-IMPORT-003 | Nothing written on failed validation | Node count unchanged | C | F |
| TC-WBS-IMPORT-004 | Oversize file (6,000 rows) | Rejected with limit message | M | F |
| TC-WBS-IMPORT-005 | Dry-run diff precedes commit | Commit without VALIDATED state → 409 | H | F |
| TC-WBS-IMPORT-006 | Rollback restores exact prior state | Node set, closure, codes byte-identical to pre-import snapshot; INV green | C | F |
| TC-WBS-IMPORT-007 | Rollback blocked by acquired links | 409 listing blocking nodes | C | F |
| TC-WBS-IMPORT-008 | Double rollback | 409 `WBS_IMPORT_ALREADY_COMMITTED` | M | F |
| TC-WBS-IMPORT-009 | Commit failure auto-reverts | Injected failure → COMMIT_FAILED, tree unchanged | C | F |
| TC-WBS-IMPORT-010 | Export contains override flags and respects cost permission | Verified per role | H | F |

### 4.9 TEMPLATE (FR-020)

| ID | Title | Expected | Pri |
|---|---|---|---|
| TC-WBS-TEMPLATE-001 | Apply tower template | ~350 nodes DRAFT, codes generated | H |
| TC-WBS-TEMPLATE-002 | Apply with collision | Collision list returned; nothing partial | H |
| TC-WBS-TEMPLATE-003 | Save subtree as template | No links/progress copied | M |
| TC-WBS-TEMPLATE-004 | Apply above 1,000 nodes | 202 async or refusal per guard | M |
| TC-WBS-TEMPLATE-005 | Duplicate L05 → L06–L20 | 510 nodes, correct masks, DRAFT | H |

### 4.10 PERM & SCOPE (doc 07)

Assertions A-01…A-28 from doc 07 §10 are executed as `TC-WBS-PERM-001…028` verbatim. Additional:

| ID | Title | Expected | Pri |
|---|---|---|---|
| TC-WBS-SCOPE-029 | Ancestor context rendering | Ancestors returned `context_only:true`, no children | C |
| TC-WBS-SCOPE-030 | Search respects scope | Out-of-scope nodes absent from results | C |
| TC-WBS-SCOPE-031 | Discipline filter + subtree combination | Only STR branches within B01 visible | H |
| TC-WBS-SCOPE-032 | Cost columns absent without permission | No cost keys in payload | C |
| TC-WBS-SCOPE-033 | RESPONSIBLE_ONLY inheritance | Descendants of responsible node visible | H |
| TC-WBS-SCOPE-034 | Scope grant change audited | PERMISSION_CHANGE CRITICAL event | H |

### 4.11 INTEGRATION (doc 05)

| ID | Title | Expected | Pri |
|---|---|---|---|
| TC-WBS-INT-001 | validate-node blocks leaf-only entity on branch | allowed=false `WBS_LEAF_ONLY` | C |
| TC-WBS-INT-002 | register-link idempotent | Repeat call returns existing link id | H |
| TC-WBS-INT-003 | Deregister on entity delete | Guard count decrements | C |
| TC-WBS-INT-004 | Reconciliation repairs unregistered link | Link created with registered_by=RECONCILER; reported | C |
| TC-WBS-INT-005 | Task creation saga rolls back if register-link fails | No orphan task, no orphan link | C |
| TC-WBS-INT-006 | Document numbering pulls correct segments | `P001-STR-DWG-B01-L05-001-R02` composed | H |
| TC-WBS-INT-007 | Historical number resolves after re-code | Resolves to current node | C |
| TC-WBS-INT-008 | Planned dates writable only by Planning service | Other caller → 403 | H |
| TC-WBS-INT-009 | BOQ totals event updates cost roll-up | Values propagate to ancestors | H |
| TC-WBS-INT-010 | Notification recipient resolution walks ancestors | Nearest responsible chosen | H |
| TC-WBS-INT-011 | Outbox guarantees event on mutation | Kill relay, restart → event delivered exactly once per consumer | C |
| TC-WBS-INT-012 | Consumer cache invalidation on MOVED | Cached full_code refreshed | H |
| TC-WBS-INT-013 | Degraded mode: writes fail closed | Service down → dependent create refused, not silently allowed | C |
| TC-WBS-INT-014 | Mobile manifest scope-correct | Only granted subtree present | H |
| TC-WBS-INT-015 | Offline queued record survives node move | Record binds by ID; syncs cleanly | H |
| TC-WBS-INT-016 | Offline record targeting CLOSED node | Goes to conflict queue, not dropped | H |

### 4.12 PERFORMANCE (Part 4.13)

| ID | Operation | Threshold | Load profile |
|---|---|---|---|
| TC-WBS-PERF-001 | Tree first 3 levels (DS-2) | < 800 ms p95 | 50 concurrent users |
| TC-WBS-PERF-002 | 100-node expanded tree | < 1 s p95 | 50 concurrent |
| TC-WBS-PERF-003 | Full 5,000-node load (paged) | < 3 s p95 | 10 concurrent |
| TC-WBS-PERF-004 | Node detail + links summary | < 500 ms p95 | 100 concurrent |
| TC-WBS-PERF-005 | Move 500-descendant subtree | < 3 s | serial |
| TC-WBS-PERF-006 | Impact analysis | < 1.5 s | 20 concurrent |
| TC-WBS-PERF-007 | Roll-up rebuild 5,000 nodes | < 60 s | background |
| TC-WBS-PERF-008 | Import validation 2,000 rows | < 20 s | serial |
| TC-WBS-PERF-009 | Search on 5,000 nodes | < 300 ms p95 | 100 concurrent |
| TC-WBS-PERF-010 | validate-node | < 120 ms p95 | 500 rps |
| TC-WBS-PERF-011 | Delete-guard link count | < 100 ms | node with 40k links |
| TC-WBS-PERF-012 | Sustained mixed load | No target breach over 30 min soak | 200 users |

### 4.13 SECURITY

| ID | Title | Expected | Pri |
|---|---|---|---|
| TC-WBS-SEC-001..0NN | **Cross-tenant leak on every endpoint** — parameterised suite executing all 38 public endpoints from doc 08 with Tenant A token against Tenant B resources (DS-3) | 404 for every endpoint; zero data returned; count of endpoints covered asserted equal to the endpoint registry so new endpoints cannot skip the suite | C |
| TC-WBS-SEC-101 | Cross-project leak within tenant | User on P001 requesting P002 node → 403 | C |
| TC-WBS-SEC-102 | JWT tenant tampering | Modified claim → signature failure 401 | C |
| TC-WBS-SEC-103 | tenant_id in request body | 400; body value ignored | C |
| TC-WBS-SEC-104 | IDOR on node id | Enumeration returns 404 uniformly (no existence disclosure) | C |
| TC-WBS-SEC-105 | Mass assignment on protected columns | Attempt to set `baseline_locked`, `full_code`, `depth`, `subtree_version` via PATCH → ignored/422 | C |
| TC-WBS-SEC-106 | RLS enforced at DB, not only API | Direct DB connection as tenant role sees only own rows | C |
| TC-WBS-SEC-107 | Impersonation audited | Every event carries is_impersonation, session expires at 4 h | H |
| TC-WBS-SEC-108 | Export audited | EXPORT audit event with row count | H |
| TC-WBS-SEC-109 | Internal endpoints unreachable publicly | Public gateway → 404 | C |
| TC-WBS-SEC-110 | Rate limit enforced | 429 with Retry-After beyond cap | M |
| TC-WBS-SEC-111 | Audit immutability | UPDATE/DELETE on audit rows refused | C |
| TC-WBS-SEC-112 | Sensitive values never in audit payload | No tokens/passwords in old/new values | H |

Error-code coverage: a parameterised suite `TC-WBS-ERR-001…023` triggers each of the 23 catalogue codes at least once and asserts the HTTP class mapping (409 for state blocks, 403 for permission, 422 for validation).

## 5. Regression Suite

Every Critical case plus the full invariant suite plus TC-WBS-SEC-001..0NN run on every merge to main. Full catalogue runs nightly and pre-release.

## 6. UAT Scenarios (business language)

| ID | Role | Script |
|---|---|---|
| UAT-01 | Planner | Set up Tower A from template, refine Level 05, import 400 rooms, duplicate to L06–L20, submit for sign-off |
| UAT-02 | PM | Review structure, set Baseline R0, later approve a move CR, apply and then remove an override |
| UAT-03 | QS | Verify roll-up before IPC-04, export baseline diff, confirm cost by zone reconciles to BOQ |
| UAT-04 | Document Controller | Confirm numbering segments, re-code a level via CR, retrieve a pre-change document number |
| UAT-05 | Site Engineer | Find Zone 03 on mobile offline, open node, raise a daily report against it, sync |
| UAT-06 | Subcontractor | Confirm only the granted zone is visible and no editing controls appear |

## 7. Defect Severity

| Sev | Definition | Examples |
|---|---|---|
| S1 Critical | Data loss, cross-tenant leak, wrong roll-up used commercially, broken tree invariant | Move corrupts closure; cost visible to unauthorised role |
| S2 High | Core workflow blocked, guard bypassable | Delete guard skippable; CR approvable by raiser |
| S3 Medium | Workaround exists | Diff export misformats |
| S4 Low | Cosmetic | Icon spacing |

## 8. Traceability (FR → TC)

| FR | Cases |
|---|---|
| 001–002 | STRUCT-001..003, 011 |
| 003 | STRUCT-008, 012 |
| 004 | STRUCT-006, 007 |
| 005–006 | STRUCT-009, 010 |
| 007–011 | CODE-001..012, INT-006, INT-007 |
| 012–013 | MOVE-001..018 |
| 014 | STRUCT-003 (order), TEMPLATE-005 |
| 015 | TEMPLATE-005, MOVE-015 |
| 016 | DELETE-001..009 |
| 017–019 | IMPORT-001..010 |
| 020 | TEMPLATE-001..004 |
| 021–026 | STATUS-001..013 |
| 027–030 | BASELINE-001..010 |
| 031–036 | ROLLUP-001..016 |
| 037 | INT-010, SCOPE-033 |
| 038–040 | INT-001..005, STATUS-007 |
| 041–042 | SCOPE-029..032, PERM-001..028 |
| 043 | PERF-001..003 |
| 044 | ROLLUP-009 |
| 045 | INT-004, ROLLUP-013/014 |
| 046 | INT-008 |
| 047 | INT-014..016 |
| 048 | STRUCT-003 (attributes), INT-009 |

**Uncovered FRs: none.** FR-046 and FR-047 are Phase 2/3 and their cases are marked deferred-with-owner rather than removed.

## 9. Open Questions

| # | Question |
|---|---|
| OQ-01 | Should the cross-tenant suite also run against internal service endpoints with a mismatched service tenant context? (Recommended: yes, added as TC-WBS-SEC-113 in R1.1.) |

## 10. Change Log

| Version | Date | Change |
|---|---|---|
| R1 | 2026-08-08 | Initial issue |

**End of Document**
