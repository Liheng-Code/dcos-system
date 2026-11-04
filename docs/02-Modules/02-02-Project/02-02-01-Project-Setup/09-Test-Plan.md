# DCOS — Project Setup Module
## 09 — Test Plan

| Field | Detail |
|---|---|
| Document Code | DCOS-PRJ-TST-001 |
| Version | R1 |
| Module | 04-02 — Project Setup (Foundation Phase) |
| Author Persona | QA Lead |
| Status | Issued for Review |
| Depends On | DCOS-PRJ-FS-001, DCOS-PRJ-UC-001, DCOS-PRJ-DB-001, DCOS-PRJ-RBAC-001, DCOS-PRJ-API-001 |

---

## 1. Test Strategy

| Layer | Scope | Tooling (indicative) |
|---|---|---|
| Unit | Transition guards, current-value computation, pattern parser, working-day calculator | Vitest/Jest |
| Integration | API + DB constraints, RLS, workflow chains, WBS command, event publication | Supertest + test DB |
| E2E | Wizard, Tender board, Conversion, Status modal (per PRJ-SCR IDs) | Playwright |
| Security | RBAC matrix, cross-tenant, SoD, status overrides | API probes in CI |
| Performance | Portfolio, wizard save, numbering contention | k6 |

CI gate: unit + integration + security suites must pass on every merge; cross-tenant probes are a **blocking** pipeline stage per Gap Analysis §5.2.

## 2. Test Environment and Data

- Two seed tenants: **T-A** (primary), **T-B** (isolation probes). Identical schemas, distinct JWTs.
- Seed projects in T-A covering **every** status: DRAFT, TENDER, BID_SUBMITTED, LOST, AWARDED (checklist half-done), ACTIVE, ON_HOLD, COMPLETED, CLOSED, ARCHIVED, CANCELLED, plus one INTERNAL.
- Seed users per role in Part 4.8; one user with roster end-date yesterday (boundary tests).
- Clock control: test harness can freeze/advance time for deadline and alert tests.

## 3. Test Case Catalogue

Format: ID · Title · Refs (UC/FR) · Expected.

### 3.1 Status Transition Matrix

| ID | Case | Refs | Expected |
|---|---|---|---|
| PRJ-TC-001 | Every allowed transition in the canonical map succeeds with history row | FR-030, UC-005/17/18 | 200/202; `project_status_history` row with actor |
| PRJ-TC-002 | Every disallowed pair (full 11×11 sweep minus allowed) rejected | FR-030 | 409 `TRANSITION_NOT_ALLOWED` with `allowed_to` list |
| PRJ-TC-003 | DRAFT→ACTIVE allowed for INTERNAL, rejected for TENDER/AWARDED types | UC-006, BR-PRJ-005 | Per type |
| PRJ-TC-004 | HOLD/CANCEL without reason | BR-PRJ-012/017 | 422 |
| PRJ-TC-005 | Status history is append-only (UPDATE/DELETE as authenticated) | DB §2.2 | Permission denied |

### 3.2 Award Conversion

| ID | Case | Refs | Expected |
|---|---|---|---|
| PRJ-TC-010 | Activation with one open blocking item | FR-020, UC-005 | 409 `CONVERSION_CHECKLIST_INCOMPLETE` listing the item |
| PRJ-TC-011 | Waive attempt on blocking item | DB chk constraint | 422 `WAIVE_BLOCKING_FORBIDDEN` |
| PRJ-TC-012 | WBS command failure → item stays OPEN; retry succeeds idempotently | FR-021 | 502 then 200; single WBS root |
| PRJ-TC-013 | Result WON instantiates checklist atomically (kill between steps) | FR-013 | Transactional: both or neither |
| PRJ-TC-014 | Mobilisation lag computed in working days using project calendar (holiday inside window) | FR-023 | Holiday excluded |

### 3.3 Team & PM

| ID | Case | Refs | Expected |
|---|---|---|---|
| PRJ-TC-020 | 10 concurrent PM assignment attempts | FR-042 | Exactly one succeeds; others 409 on partial unique index |
| PRJ-TC-021 | PM change atomic swap — no instant with 0 or 2 active PMs | FR-043, UC-008 | Verified by timestamp query |
| PRJ-TC-022 | Remove current PM via DELETE | FR-041 | 409 `IS_CURRENT_PM` |
| PRJ-TC-023 | Roster effective dates: access active on start date 00:00, revoked after end date | BR-PRJ-023, RBAC hook 2 | 200 inside window; 403 outside |
| PRJ-TC-024 | Self-grant to roster as PM | RBAC §6 | 403 `SELF_GRANT_FORBIDDEN`; Company Admin allowed with High audit |

### 3.4 Contract

| ID | Case | Refs | Expected |
|---|---|---|---|
| PRJ-TC-030 | Direct edit of original_value | BR-PRJ-009 | Rejected; revision path only |
| PRJ-TC-031 | Revision without reason | FR-051 | 422 |
| PRJ-TC-032 | Current value = original + Σ approved deltas (3 revisions incl. negative) | FR-051 | Exact decimal match |
| PRJ-TC-033 | Currency change after lock-currency callback | FR-053 | 409 |
| PRJ-TC-034 | Second head contract | FR-050 | 409 `CONTRACT_EXISTS` |

### 3.5 Numbering

| ID | Case | Refs | Expected |
|---|---|---|---|
| PRJ-TC-040 | **50 parallel resolve calls, one rule** | FR-081 | 50 unique sequential numbers, zero gaps/duplicates |
| PRJ-TC-041 | First resolve locks rule; PATCH after | FR-082 | `is_locked=true`; 423 `RULE_LOCKED` |
| PRJ-TC-042 | Pattern without {SEQ:n} / unknown token | FR-080 | 422 `PATTERN_INVALID` |
| PRJ-TC-043 | Resolve with missing context token | API §2.8 | 422 `CONTEXT_TOKEN_MISSING`; seq not consumed |
| PRJ-TC-044 | Idempotency-Key replay on resolve | API ⚡ | Same number returned; seq incremented once |
| PRJ-TC-045 | Resolve across two app instances (contention) | DB §2.14 | Row lock serialises; < 200 ms p95 |

### 3.6 Cross-Tenant Isolation (CI-blocking)

| ID | Case | Refs | Expected |
|---|---|---|---|
| PRJ-TC-050 | T-B JWT reads T-A project by id (API) | RBAC §4 | 404 (not 403 — existence hidden) |
| PRJ-TC-051 | T-B JWT direct PostgREST select on all 15 tables | Gap §5.2 | 0 rows each |
| PRJ-TC-052 | T-B JWT write attempts (insert/update) on all 15 tables | RLS with-check | Denied |
| PRJ-TC-053 | tenant_id spoof in request body ignored | Part 1 principle | Token tenant wins |

### 3.7 RBAC & Status Overrides

| ID | Case | Refs | Expected |
|---|---|---|---|
| PRJ-TC-060 | Full role × permission sweep (every cell of RBAC §3) | RBAC hook 1 | Matches matrix incl. all C footnotes |
| PRJ-TC-061 | Each suspended permission per status (RBAC §5 matrix) | RBAC hook 3 | 403 in that status |
| PRJ-TC-062 | Requester approves own transition / revision (all 4 chains) | BR-PRJ-024 | Rejected by workflow |
| PRJ-TC-063 | Client external user: summary 200, detail 403, raw tables 0 rows | RBAC hook 7 | Per spec |

### 3.8 Milestones, Calendar, Gates

| ID | Case | Refs | Expected |
|---|---|---|---|
| PRJ-TC-070 | Contractual milestone alerts at 14/7/1 days (clock advance) | FR-061 | Notifications published per matrix |
| PRJ-TC-071 | Miss contractual milestone | FR-062 | Reason mandatory; Critical notification event |
| PRJ-TC-072 | Calendar inheritance + override-removal of company holiday | FR-070/071 | Effective list correct |
| PRJ-TC-073 | Gate matrix: task/doc/pr create per status (Integration §4.2 table) | FR-031 | Allow/block exactly per table |
| PRJ-TC-074 | Gate service outage → consumer fails closed | Integration §7 | Creation blocked with retry error |
| PRJ-TC-075 | Tender deadline timezone: 14:00 ICT stored/alerted correctly around DST-free offset | FS §5 | UTC storage, ICT display |
| PRJ-TC-076 | Offline mobile task created against project that went ON_HOLD → sync | Integration §4.7 | Rejected with conflict record |

## 4. Performance Tests

| ID | Scenario | Target |
|---|---|---|
| PRJ-PT-001 | Portfolio list, 1,000 projects, filters applied | p95 < 1.5 s |
| PRJ-PT-002 | Wizard step save | p95 < 500 ms |
| PRJ-PT-003 | Numbering resolve, 20 rps sustained on one rule | p95 < 200 ms, zero duplicates |
| PRJ-PT-004 | Status transition incl. gate + history + events | p95 < 1 s |
| PRJ-PT-005 | Context endpoint under cache-miss storm | p95 < 300 ms |

## 5. Regression Pack & CI Gate

- Regression pack = §3.1, §3.5, §3.6, §3.7 in full + smoke of remaining groups.
- Pipeline stages: unit → integration → **security (blocking)** → E2E (nightly) → performance (weekly + pre-release).
- Any change to transition map, RBAC matrix, or numbering logic requires the full catalogue.

## 6. Acceptance Criteria and Exit Report

Module accepted when: 100% Must-priority FRs covered by passing tests; zero open Critical/High defects; cross-tenant suite green 10 consecutive runs; performance targets met on staging data volume.

Exit report template: summary table (planned/executed/passed/failed/blocked per group), defect list with severity, performance results vs targets, RLS probe evidence, sign-offs (QA Lead, System Architect, Product Owner).

## 7. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1 | 2026-08 | Initial issue | QA Lead |
