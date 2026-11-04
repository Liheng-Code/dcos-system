# 09 — Test Plan
# Module PLN — Planning & Scheduling

Document path: docs/06-Planning-Scheduling/09-Test-Plan.md
Module code: PLN
Module number: 14 (DCOS Module Map)
Domain: Project Control
Phase: Phase 2
Status: Draft
Version: 1.0
Date: 2026-06-14

---

## 1. Test Scope

This plan covers functional testing for all 11 PLN features and their business rules, plus
integration testing for the IPC pull contract and the async CPM trigger.

Out of scope: performance/load testing of CPM on large programmes (>500 activities) is flagged
as a Phase 3 concern (OQ-12). PDF export rendering is tested manually only.

---

## 2. Unit Tests

### 2.1 CPM Calculation (RPC `run_pln_cpm`)

| Test ID | Description | Expected Result |
|---|---|---|
| UT-CPM-01 | Simple FS chain: A→B→C, equal durations | ES/EF/LS/LF correct, total float = 0 for all (all critical) |
| UT-CPM-02 | Parallel paths: A→B and A→C→D with different durations | Longest path is critical; shorter has positive float |
| UT-CPM-03 | Negative lag (lead time) on FS link | B starts N days before A finishes; EF correctly adjusted |
| UT-CPM-04 | SS dependency | B starts same day as A; CPM correctly propagates |
| UT-CPM-05 | FF dependency | B finishes same day as A; CPM correctly propagates |
| UT-CPM-06 | Activity with actual_progress_pct=50 and remaining_duration_override=true | CPM uses remaining_duration_days, not derived from planned_duration |
| UT-CPM-07 | All activities complete (progress=100) | No critical activities; all float positive |
| UT-CPM-08 | Contract end date exceeded | is_critical activities have negative float; programme_overrun alert emitted |
| UT-CPM-09 | Programme with no end_date | CPM returns error code; warning flag set on programme |
| UT-CPM-10 | Summary band activity | Summary band progress = weighted avg of children |

### 2.2 Cycle Detection (RPC `check_pln_dependency_cycle`)

| Test ID | Description | Expected Result |
|---|---|---|
| UT-CYC-01 | A → B, then add B → A | Returns true (cycle detected); link blocked |
| UT-CYC-02 | A → B → C, then add C → A | Returns true (three-node cycle) |
| UT-CYC-03 | A → B → C, then add A → C (shortcut, no cycle) | Returns false; link allowed |
| UT-CYC-04 | Single node linking to itself | Blocked by DB constraint (pln_activity_links_no_self_link) |

### 2.3 S-Curve Materialisation (RPC `materialise_pln_scurve`)

| Test ID | Description | Expected Result |
|---|---|---|
| UT-SCU-01 | Programme with 3 activities, equal weight | planned cumulative % increases linearly across durations |
| UT-SCU-02 | Advance data date, one activity 100% | actual cumulative % > 0 at that data date |
| UT-SCU-03 | Re-materialise same data date | Upserts (does not duplicate rows); row count unchanged |
| UT-SCU-04 | Activity with null wbs_node_id (planning-only) | Included in S-curve calculation |

---

## 3. Integration Tests

### 3.1 Programme Approval Workflow

| Test ID | Business Rule | Steps | Expected |
|---|---|---|---|
| IT-WF-01 | BR8.02, BR8.03 | Planner submits → PM approves → Planner submits to client | Status moves draft→submitted_internal→approved_internal→submitted_client |
| IT-WF-02 | BR8.03 (four-eyes) | Planner submits → same user attempts PM approval | 403 PLN_FOUR_EYES error |
| IT-WF-03 | BR8.06 | Submit programme → attempt to submit again before approval | 409 PLN_ALREADY_IN_FLIGHT error |
| IT-WF-04 | Reject path | PM rejects with < 20 char reason | 400 PLN_REASON_TOO_SHORT |
| IT-WF-05 | Reject path | PM rejects with valid reason | Status → draft; rejection_reason stored; Planner notified |

### 3.2 Baseline Management

| Test ID | Business Rule | Steps | Expected |
|---|---|---|---|
| IT-BL-01 | BR4.01 | Create contract baseline twice on same programme | 409 PLN_CONTRACT_EXISTS on second attempt |
| IT-BL-02 | BR4.02 | Create revised baseline with 30-char reason | 400 PLN_REASON_TOO_SHORT |
| IT-BL-03 | BR4.04 | Activate baseline B; baseline A was active | A.status → superseded; B.status → active |
| IT-BL-04 | Immutability | Attempt to PATCH fields on contract baseline via API | 403 Forbidden |

### 3.3 Progress Updates

| Test ID | Business Rule | Steps | Expected |
|---|---|---|---|
| IT-PR-01 | BR5.02 | Site engineer submits 60%, Planner confirms. Site engineer submits 40% | 400 PLN_PROGRESS_REGRESSION |
| IT-PR-02 | BR5.04 | Progress = 100, actual_finish_date set, Planner confirms → activity locked | Subsequent progress submission returns 400 PLN_ACTIVITY_LOCKED |
| IT-PR-03 | BR5.06 | Site engineer submits; Planner confirms → CPM triggered | After CPM run, is_critical and total_float_days updated on affected activities |
| IT-PR-04 | BR5.07 | Advance data_date to today. Advance data_date to yesterday | 400 PLN_DATE_NOT_FORWARD |
| IT-PR-05 | BR5.06 reject | Planner rejects update without rejection_reason | 400 PLN_REASON_REQUIRED |

### 3.4 Programme Import

| Test ID | Business Rule | Steps | Expected |
|---|---|---|---|
| IT-IMP-01 | BR7.03 | Upload CSV with invalid date in row 4 | Dry-run returns error on row 4; error_count=1; valid rows unaffected |
| IT-IMP-02 | BR7.06 | Upload CSV with duplicate activity_code in rows 2 and 9 | Dry-run flags both rows as errors |
| IT-IMP-03 | BR7.04 | Upload CSV with wbs_code that doesn't match project | Dry-run returns warning (not error); confirm import creates activity as planning-only |
| IT-IMP-04 | BR7.05 | Import into active programme | 409 PLN_PROGRAMME_NOT_DRAFT |
| IT-IMP-05 | BR7.03 | Confirm import with error_count > 0 | 422 — confirm import blocked |

### 3.5 IPC Integration Pull

| Test ID | Description | Steps | Expected |
|---|---|---|---|
| IT-IPC-01 | Normal pull | Confirm progress for 3 activities; call ipc-progress with data_date | Returns 3 activities with correct confirmed_progress_pct |
| IT-IPC-02 | Activity with no confirmed updates | Activity exists but no confirmed progress | Returns activity with confirmed_progress_pct: "0.00" |
| IT-IPC-03 | Planning-only activity (no wbs_node_id) | Call ipc-progress | Activity not returned (filtered by wbs_node_id IS NOT NULL) |
| IT-IPC-04 | Role restriction | Site engineer calls ipc-progress endpoint | 403 Forbidden |

### 3.6 Delay Events

| Test ID | Business Rule | Steps | Expected |
|---|---|---|---|
| IT-DE-01 | BR10.04 | Create delay event, link activity with float=5. After CPM run, float drops to 0. | float_at_event_close is recorded when delay event is closed |
| IT-DE-02 | BR10.06 | Delay event agreed; attach to EOT. Attempt to edit delay event. | 409 PLN_DELAY_EVENT_LOCKED |
| IT-DE-03 | BR10.03 | CLIENT role attempts to create a delay event | 403 Forbidden |

---

## 4. End-to-End Test Scenarios

### E2E-01 — Full Programme Lifecycle

1. Planner creates programme "Master Programme" for test project.
2. Planner adds 10 activities with FS dependencies.
3. CPM runs; critical path identified correctly (verified against manual calculation).
4. Planner sets Contract Baseline (BR4.01).
5. Planner submits for internal review (BR8.02).
6. PM approves (IT-WF-01).
7. Planner submits to client.
8. Document Controller records client acceptance (baseline → client_accepted).
9. Planner activates programme.
10. Site engineer submits progress on 3 activities.
11. Planner reviews and confirms progress.
12. Planner advances data date.
13. S-curve snapshot created; dashboard tiles updated.
14. **Verify:** S-curve shows actual > 0; CPM results updated; no PLN_PROGRAMME_NOT_DRAFT errors.

### E2E-02 — Import then Generate Lookahead

1. Planner imports 50 activities from DCOS template CSV.
2. Dry-run passes with 0 errors, 2 warnings. Planner confirms import.
3. Planner generates 2-week lookahead.
4. Lookahead published → Construction Managers notified.
5. Site Engineer marks 3 lookahead items complete.
6. Planner closes lookahead.
7. **Verify:** PCR calculated as (3 / total planned in window) × 100.

### E2E-03 — Delay Event to EOT Handoff

1. Planner creates delay event type='employer_caused', links 2 activities.
2. Float at event open recorded correctly.
3. PM transitions status to 'agreed'.
4. `pln.delay_event.agreed` event emitted.
5. EOT module (simulated by direct API call) attaches delay event via eot_claim_id.
6. Planner attempts to edit delay event.
7. **Verify:** 409 PLN_DELAY_EVENT_LOCKED returned.

---

## 5. Regression Checklist

After any change to the PLN module, verify the following have not regressed:

- [ ] CPM runs and updates all activities after progress confirm
- [ ] S-curve materialises after data date advance
- [ ] Four-eyes check blocks same-user approval
- [ ] Contract baseline remains immutable
- [ ] CLIENT role cannot access draft programme data
- [ ] IPC progress endpoint returns only wbs-linked, confirmed activities
- [ ] Import dry-run never writes data
- [ ] Circular dependency detection blocks cycle creation
