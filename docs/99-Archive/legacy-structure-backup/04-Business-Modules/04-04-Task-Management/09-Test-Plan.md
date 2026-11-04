# DCOS — Module 04: Task Management
## 09 — Test Plan

| Field | Value |
|---|---|
| Document Code | DCOS-M04-TEST-001 |
| Module | 04 — Task Management |
| Version | R1.0 |
| Test Levels | Unit · Integration · API · UI/E2E · Mobile/Offline · Security · Performance · UAT |

---

## 1. Objectives and Scope

### 1.1 Objectives

1. Prove that no task can exist outside a project and WBS node.
2. Prove that the status machine cannot be bypassed through any interface (UI, API, mobile sync, bulk action).
3. Prove that progress data is append-only and reconstructible.
4. Prove that governance gates (evidence, checklist, inspection, permit, separation of duty) hold under all paths.
5. Prove that WBS roll-up is mathematically correct for every weighting method.
6. Prove that offline field data is never lost and never duplicated.
7. Prove absolute tenant isolation.

### 1.2 In Scope

Task CRUD, lifecycle, assignment, dependencies, progress, evidence, checklists, resource logs, links, comments, roll-up, reports, exports, mobile sync, RBAC, notifications emitted, audit records written.

### 1.3 Out of Scope

CPM calculation correctness (Planning module), inspection checklist content (QA/QC), permit issuing logic (HSE), payroll calculation (HR), notification channel delivery internals (Notification Engine) — these are verified at the interface only.

---

## 2. Test Environments

| Environment | Purpose | Data |
|---|---|---|
| DEV | Developer unit and component tests | Synthetic seed |
| QA | Functional, integration, API, E2E | Anonymised reference project (1 project, 3 buildings, 12 levels, ~2,000 tasks) |
| PERF | Load and volume | 5 tenants, 20 projects, 250,000 tasks, 1M progress logs, 500 concurrent users |
| UAT | Business acceptance | Real pilot project with real users and real drawings |
| PROD (smoke only) | Post-deploy verification | Read-only smoke suite plus one disposable test project |

---

## 3. Test Data Requirements

| Dataset | Content |
|---|---|
| TD-01 Tenants | 2 tenants (Alpha Construction, Beta Builders) with no shared users |
| TD-02 Users | One user per role from the RBAC matrix, plus 1 subcontractor org user and 1 client user |
| TD-03 WBS | 5-level tree: Project → Building(3) → Level(12) → Zone(4) → Room/Element |
| TD-04 Task types | All 8 seeded types with distinct gate configurations |
| TD-05 Tasks | 2,000 tasks across all statuses, disciplines, and progress methods |
| TD-06 Dependencies | Chains of length 10, fan-out of 8, one deliberate cycle attempt |
| TD-07 Documents | Drawings with current and superseded revisions |
| TD-08 Permits | Valid, expired and revoked permits of each type |
| TD-09 Media | Photos with and without GPS/EXIF, 50KB to 20MB, one EICAR test file |
| TD-10 Offline queue | 200 queued operations including duplicates and stale entries |

---

## 4. Unit Tests

| ID | Target | Assertion |
|---|---|---|
| UT-01 | `fn_generate_task_code` | Sequence increments per project; pattern tokens substituted; zero-padded to 4 |
| UT-02 | `fn_generate_task_code` concurrency | 100 parallel inserts yield 100 unique codes, no gaps required |
| UT-03 | Quantity progress calc | 9.7/12.5 → 77.60; caps at 100.00; division by zero returns null not error |
| UT-04 | Checklist progress calc | Weighted; NA counts as complete; PENDING excluded |
| UT-05 | Milestone progress | Only 0 or 100 accepted; 50 rejected |
| UT-06 | `fn_eval_dependency_status` | FS satisfied only when predecessor APPROVED/CLOSED; SS on actual_start; soft links always satisfied |
| UT-07 | Cycle detection | A→B→C→A rejected with path in message; A→B twice rejected as duplicate |
| UT-08 | Roll-up EQUAL | Mean of child percentages |
| UT-09 | Roll-up DURATION | Duration-weighted mean matches hand calculation to 2 dp |
| UT-10 | Roll-up COST | Cost-weighted; tasks with null budget excluded from both numerator and denominator |
| UT-11 | Roll-up exclusion | CANCELLED tasks excluded; ON_HOLD tasks included at current percentage |
| UT-12 | Status transition table | Every illegal pair raises `ILLEGAL_STATUS_TRANSITION`; all legal pairs pass |
| UT-13 | Overdue days | 0 when complete; correct positive integer when late; null when no planned finish |
| UT-14 | Hold duration | Multiple hold periods sum correctly; open hold accrues from `hold_start` |
| UT-15 | Productivity | quantity ÷ man-hours; null when man-hours = 0 |
| UT-16 | Forecast finish | Derived from progress rate; equals planned when rate = 1 |
| UT-17 | Search vector | Task code weighted A; title B; matches partial code search |
| UT-18 | Working-day date math | Planned finish skips weekends and configured public holidays |

---

## 5. Integration Tests

| ID | Scenario | Expected |
|---|---|---|
| IT-01 | Create task under closed WBS node | `422 WBS_NODE_INACTIVE`; no row inserted |
| IT-02 | Progress update propagates | Task, Zone, Level, Building, Project percentages all update in one transaction |
| IT-03 | Roll-up failure rolls back | Simulated roll-up exception → progress log absent, task unchanged |
| IT-04 | Submit creates approval instance | `approval_instance_id` populated; approver notified; task in Action Required inbox |
| IT-05 | Approval decision callback | Multi-step route advances step 1→2; final approval sets APPROVED and `approved_at` |
| IT-06 | Reject creates NCR and rework task | Both records created and linked; task REJECTED; `rejection_count` = 1 |
| IT-07 | Inspection PASS unlocks approval | Approve blocked before result, permitted after |
| IT-08 | Inspection FAIL returns to work | Status IN_PROGRESS, `is_rework` true, NCR linked, notifications sent |
| IT-09 | Permit revoked auto-holds tasks | All dependent IN_PROGRESS tasks ON_HOLD with reason HR-PMT; HSE and supervisor notified |
| IT-10 | Drawing superseded | Tasks flagged; start blocked where `block_on_superseded_dwg`, warned otherwise |
| IT-11 | Predecessor approval releases successor | `dependency_status` READY; `TASK.PREDECESSOR_DONE` emitted once, not per retry |
| IT-12 | Material issue decrements stock | Stock transaction created with `task_id` and `wbs_node_id`; insufficient stock raises exception path |
| IT-13 | Man-hours aggregate to HR | Nightly job payload matches sum of `task_resource_manpower` for the date |
| IT-14 | CPM write-back | Planning sets float and critical flag; user-editable fields untouched; no audit noise for unchanged values |
| IT-15 | Baseline application | Baseline fields set; subsequent PATCH attempt on baseline fields rejected |
| IT-16 | Audit written for every transition | One `audit_logs` row per transition with correct severity and before/after values |
| IT-17 | Event outbox replay | Consumer downtime then recovery → each event applied exactly once by idempotency key |
| IT-18 | Cancel flags successors | Successors marked `dependency_review_required`; assignees notified; roll-up denominator reduced |

---

## 6. API Tests

| ID | Endpoint / Case | Expected |
|---|---|---|
| API-01 | `POST /tasks` minimal valid | 201, code generated, gates returned |
| API-02 | `POST /tasks` missing `wbs_node_id` | 422 with field-level error |
| API-03 | `POST /tasks` duplicate `Idempotency-Key`, same body | Original 201 result returned, no second row |
| API-04 | `POST /tasks` duplicate key, different body | 409 `IDEMPOTENCY_CONFLICT` |
| API-05 | `GET /tasks` filter combinations (20 permutations) | Correct row sets; pagination totals accurate |
| API-06 | `GET /tasks?page_size=500` | Capped to 200 with a meta note |
| API-07 | `PATCH /tasks/{id}` with `status` field | 422 — status changes only via action endpoints |
| API-08 | `PATCH /tasks/{id}` with `task_code` | 422 read-only field |
| API-09 | `POST /start` while BLOCKED | 409 with `blocking_tasks` array and override permission name |
| API-10 | `POST /start` with override, no permission | 403 |
| API-11 | `POST /start` with override, with permission, no reason | 422 |
| API-12 | `POST /progress` decreasing without permission | 403 |
| API-13 | `POST /progress` exceeding planned quantity | 100% recorded, over-run flagged, `authorise_overrun` required to accept |
| API-14 | `POST /complete` with 1 photo where 2 required | 409 `EVIDENCE_REQUIRED` with `details.required` |
| API-15 | `POST /complete` with pending mandatory checklist item | 409 `CHECKLIST_INCOMPLETE` |
| API-16 | `POST /approve` by submitter | 409 `SELF_APPROVAL_NOT_ALLOWED` |
| API-17 | `POST /reject` without comment | 422 |
| API-18 | `POST /dependencies` creating a cycle | 422 `DEPENDENCY_CYCLE` with path |
| API-19 | `POST /tasks/bulk` mixed permissions | 207 with per-item results |
| API-20 | `POST /tasks/export` | 202 + job; audit EXPORT row with filters and row count |
| API-21 | Rate limit exceeded | 429 with `Retry-After` |
| API-22 | Malformed JWT / expired token | 401 |
| API-23 | Sparse fieldset `fields=task_code,status` | Only those fields returned |
| API-24 | `GET /tasks/{id}` without `task.view_financial` | `budget_value` and `cost_code` absent from payload entirely |

---

## 7. UI / E2E Tests

| ID | Journey | Expected |
|---|---|---|
| E2E-01 | PM creates project WBS, generates 200 tasks from template | Completed in one session; preview matches created set |
| E2E-02 | Supervisor assigns 10 tasks via bulk action | All assigned; each notified; 10 individual audit records |
| E2E-03 | Engineer starts, updates, completes and submits a task | Status chips update in list, board and tree without page reload |
| E2E-04 | Approver approves from Action Required inbox | Item disappears from inbox; successor assignee sees release notification |
| E2E-05 | Board drag from In Progress to Approved | Blocked with explanatory toast (must pass Completed and Submitted) |
| E2E-06 | Hold dialog | Reason mandatory; responsible party auto-fills; linked RFI selectable; banner appears on the task card |
| E2E-07 | Blocked-start dialog | Lists blockers with names and statuses; "Notify predecessors" sends notifications |
| E2E-08 | WBS tree filtering | Selecting Level 05 shows only its descendants; "this node only" toggle works |
| E2E-09 | Column chooser and saved view | Persist across logout/login per user per project |
| E2E-10 | Activity timeline completeness | Every action performed in the test appears with correct actor and before/after |
| E2E-11 | Client login | Sees progress but no costs, no internal comments, no resource logs, no subcontractor names |
| E2E-12 | Subcontractor login | Sees only own organisation's tasks; direct URL to another task returns "not found" |
| E2E-13 | Keyboard navigation | Full list navigation and drawer operation without a mouse |
| E2E-14 | Khmer language | UI renders correctly; dates formatted per project locale; no text truncation |

---

## 8. Mobile and Offline Tests

| ID | Scenario | Expected |
|---|---|---|
| MOB-01 | Cold start offline | Cached task list renders in < 2 s with offline banner |
| MOB-02 | Update progress offline with 3 photos | Saved locally; card shows Pending sync; data survives app restart and device reboot |
| MOB-03 | Reconnect | Queue syncs in order; card shows Synced; server progress matches device entry |
| MOB-04 | Duplicate submission (double tap, retry) | One progress log created — idempotency honoured |
| MOB-05 | Task cancelled server-side while offline | Sync returns conflict; entry appears in conflict queue; photos preserved |
| MOB-06 | Permission removed while offline | Sync rejected with clear message; data retained for supervisor re-post |
| MOB-07 | Airplane mode for 8 hours, 50 operations | All applied on reconnect; no loss, no duplication |
| MOB-08 | Cellular upload | Photos compressed to configured max dimension; originals queued for WiFi |
| MOB-09 | Storage full on device | Graceful error, existing queue preserved, user warned before data loss |
| MOB-10 | GPS disabled | Progress still saves; GPS fields null; no blocking |
| MOB-11 | Clock skew (device 2 days behind) | Server timestamps authoritative; `client_captured_at` retained separately |
| MOB-12 | Sync of 200 queued items | Completes in < 30 s with visible progress; partial failure retries only failed items |

---

## 9. Security Tests

| ID | Test | Expected |
|---|---|---|
| SEC-01 | Cross-tenant task GET by ID | 404, no existence disclosure, CRITICAL audit event, admin security alert |
| SEC-02 | Cross-tenant task list via manipulated `project_id` | Empty result set; RLS blocks even with a forged application-layer claim |
| SEC-03 | JWT with tampered `tenant_id` | 401 signature failure |
| SEC-04 | JWT with elevated `roles` claim | Rejected — roles resolved server-side from the database, not trusted from the token |
| SEC-05 | Direct database query as application role without RLS context | Returns zero rows (FORCE ROW LEVEL SECURITY) |
| SEC-06 | SQL injection in `q`, `tags`, comment body | Parameterised; no injection; special characters preserved in stored text |
| SEC-07 | XSS payload in task title, comment, note | Escaped on render in web and mobile; stored raw, never executed |
| SEC-08 | Path traversal in attachment `file_name` | Rejected; storage path is server-generated only |
| SEC-09 | EICAR test file upload | Quarantined; `virus_scan_status = INFECTED`; admin alerted; file not downloadable |
| SEC-10 | Signed upload URL replay after expiry | 403 |
| SEC-11 | Attachment access by non-project user via direct storage URL | Denied; all downloads via signed, scoped URLs |
| SEC-12 | Subcontractor accesses another subcontractor's task | 404 + CRITICAL audit |
| SEC-13 | Privilege escalation via bulk endpoint | Per-item permission check; unauthorised items fail individually |
| SEC-14 | Audit log tamper attempt (UPDATE/DELETE) | Rejected by rule/permission; attempt logged |
| SEC-15 | Progress log tamper attempt | UPDATE/DELETE silently no-op per rule; row count unchanged |
| SEC-16 | 10 rapid permission denials | Rate-limited; security report entry created |
| SEC-17 | Telegram command from unlinked account | Rejected; no data leaked in the reply |
| SEC-18 | Webhook signature verification | Payload with wrong HMAC rejected by the reference consumer |

---

## 10. Performance Tests

| ID | Scenario | Target | Load Profile |
|---|---|---|---|
| PERF-01 | Task list, 50 rows, filtered | < 1.5 s p95 | 500 concurrent users |
| PERF-02 | Task detail with 20 activity entries | < 1.0 s p95 | 500 concurrent |
| PERF-03 | Progress update + roll-up (5-level tree, 1,000 sibling tasks) | < 3.0 s p95 | 100 concurrent updates |
| PERF-04 | WBS tree expand, 100 children | < 0.5 s p95 | 200 concurrent |
| PERF-05 | Full-text search across 250,000 tasks | < 2.0 s p95 | 100 concurrent |
| PERF-06 | Bulk generate 1,000 tasks | < 60 s async, no lock contention | Single job |
| PERF-07 | Export 20,000 tasks to XLSX | < 120 s async | 5 concurrent jobs |
| PERF-08 | Mobile delta sync, 500 tasks | < 30 s on 3G | 50 devices |
| PERF-09 | Sustained write load | 50 progress logs/second for 10 minutes with no error rate increase | — |
| PERF-10 | Database growth | 1M progress logs; indexes and query plans remain within targets | — |

**Monitoring during PERF:** query plans reviewed for sequential scans on `tasks`, `task_progress_logs`; connection pool saturation; materialised view refresh lag; p99 latency, not just p95.

---

## 11. Data Integrity Tests

| ID | Test | Expected |
|---|---|---|
| DI-01 | Attempt hard DELETE on a task with status history | Rejected by policy |
| DI-02 | Attempt UPDATE on `task_progress_logs` | No-op; row unchanged |
| DI-03 | Orphan check | No task without a valid project and WBS node; foreign keys enforced |
| DI-04 | Cancelled task retains all history | Progress logs, photos, resources, comments intact and queryable |
| DI-05 | Reconstruct progress from logs | Sum of log entries equals `actual_quantity` on the task for all quantity tasks |
| DI-06 | Roll-up reconciliation | Recomputing all WBS nodes from scratch matches stored values across the whole project |
| DI-07 | Concurrent progress updates on one task | Row lock prevents lost update; both logs recorded; final percentage correct |
| DI-08 | Concurrent approve by two approvers | Only one succeeds; the other receives a stale-state error |
| DI-09 | Archive and restore | Archived tasks excluded from active queries but fully restorable with history |

---

## 12. Acceptance Criteria (UAT)

| ID | Criterion | Verified By |
|---|---|---|
| UAT-01 | PM builds a real WBS and issues a week's work in under 60 minutes | Project Manager |
| UAT-02 | Site engineer records a day's progress with photos in under 60 seconds per task, on site, on mobile data | Site Engineer |
| UAT-03 | Supervisor closes out the day: reviews, approves or rejects all submissions, in under 15 minutes | Site Supervisor |
| UAT-04 | Discipline manager identifies the top 5 bottlenecks without exporting to Excel | Discipline Manager |
| UAT-05 | QS produces a delay register for a real hold event and accepts it as claim evidence | QS Engineer |
| UAT-06 | QA inspector's failed inspection correctly drives rework and re-inspection | QA/QC Inspector |
| UAT-07 | Subcontractor submits progress and sees nothing belonging to others | Subcontractor |
| UAT-08 | Client views progress and confirms no internal or commercial data is visible | Client representative |
| UAT-09 | Reported WBS progress is accepted as accurate by both site and commercial teams | PM + QS jointly |
| UAT-10 | A full task history is reconstructible for a disputed activity | Contracts Manager |

**Exit criteria:** zero open Critical or High defects; ≤ 5 Medium defects with agreed workarounds; all UAT criteria signed off; performance targets met in PERF; security tests all passed.

---

## 13. Defect Severity

| Severity | Definition | Response |
|---|---|---|
| **Critical** | Data loss, cross-tenant leak, status machine bypass, progress log corruption, offline data loss | Block release; fix immediately |
| **High** | Gate bypass, wrong roll-up, missing audit entry, approval routed to wrong person, permission escalation | Fix before release |
| **Medium** | Incorrect filter, report discrepancy, UI state error with a workaround | Fix in current sprint or agree workaround |
| **Low** | Cosmetic, wording, minor layout | Backlog |

---

## 14. Regression Suite

Run on every release; must be fully automated.

| Pack | Contents | Runtime Target |
|---|---|---|
| Smoke (post-deploy, all environments) | Create → assign → start → progress → complete → submit → approve → close; tenant isolation spot check | < 5 min |
| Core regression | All UT + IT + API tests | < 30 min |
| E2E regression | E2E-01 to E2E-14 | < 45 min |
| Mobile regression | MOB-01 to MOB-12 on iOS and Android | < 60 min |
| Security regression | SEC-01 to SEC-18 | < 20 min |
| Performance regression | PERF-01 to PERF-05, trend-compared to the previous release | Nightly |

---

## 15. Traceability

| Requirement Group | Covering Tests |
|---|---|
| BR-TM-001..006 (structure) | IT-01, UT-01, UT-02, API-02, DI-03 |
| BR-TM-010..014 (assignment) | E2E-02, API-10, RBAC section 9 tests |
| BR-TM-020..025 (dependencies) | UT-06, UT-07, IT-11, API-09, API-18 |
| BR-TM-030..035 (progress) | UT-03..05, API-12, API-13, DI-02, DI-05 |
| BR-TM-040..047 (governance) | UT-12, IT-04..IT-10, API-14..API-17, DI-01 |
| BR-TM-050..054 (roll-up/integration) | UT-08..UT-11, IT-02, IT-03, DI-06 |
| BR-TM-060..063 (field/offline) | MOB-01..MOB-12 |
| NFR-TM-01..10 | PERF-01..PERF-10, SEC-01..SEC-05, E2E-13, E2E-14 |

---

**End of Document — DCOS-M04-TEST-001**
