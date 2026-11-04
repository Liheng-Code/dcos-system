# DCOS — WBS Management Module
## 05 — Integration Specification

| Field | Detail |
|---|---|
| Document Code | DCOS-WBS-INT-001 |
| Version | R1 |
| Module | 04-03 — WBS Management |
| Author Persona | Senior System Architect |
| Status | Issued for Review |
| Base References | DCOS-WBS-FS-001, DCOS-WBS-DB-001 |

---

## 1. Integration Philosophy

WBS Management is the platform's **location and containment authority**. Other modules never store structure; they store a `wbs_node_id` and ask WBS three questions: *where is this* (resolve), *may I attach here* (validate), and *what does this branch add up to* (rollup). In exchange, every module owes WBS one obligation: **register the link**. The delete guard, impact analysis, and audit story all depend on `wbs_node_links` being complete.

**Hard rule — IDs, never codes.** `wbs_node_id` is the only stable inter-module reference. `full_code` and `full_path` are human-facing and mutable (moves, re-codes). A module that stores a code will break on the first approved change request; a module that stores the ID survives every restructure. Consumers may cache codes for display only, and must invalidate on `WBS.NODE.MOVED` / `WBS.CODE.CHANGED`.

## 2. Integration Map

| Module | Direction | Mechanism |
|---|---|---|
| Project Setup (05) | Inbound | Event `PRJ.PROJECT.ACTIVATED` → root creation; numbering rules read |
| Admin Configuration (03) | Inbound | Node types, structure rules, attribute keys |
| Planning & Scheduling (23) | Inbound | Planned-date mirror (read-only columns) |
| Task Management | Both | Leaf progress inbound; validate/resolve/register outbound |
| QA/QC (27) | Both | Measured progress + closure signals inbound; location services outbound |
| BOQ (29) / Budget (30) | Inbound | Cost measures per node |
| BIM Coordination (14) | Inbound | IFC GUID mapping into attributes |
| Document Control (37) | Outbound | Code segments, historical resolution |
| Procurement (18) | Outbound | PR/PO allocation validation, budget-by-node read |
| Inventory/Stock (20) | Outbound | Issue-to-node validation, consumption registration |
| Construction (22) | Outbound | Daily report / manpower / photo location |
| HSE (28) | Outbound | Incident/permit location |
| Equipment (24) | Outbound | Utilisation allocation |
| IPC (32) | Outbound | Measured value by node, snapshots, baseline evidence |
| EVM (31) | Outbound | Control accounts, PV/EV/AC aggregation frame |
| Reporting (44) | Outbound | Roll-up read model, snapshots, heat maps |
| Mobile (49) | Outbound | Scope manifest, offline cache, sync rules |
| Approval Engine | Both | CR routing out; decisions in |
| Notification Engine | Outbound | WBS-responsible recipient resolution |
| Audit Engine | Outbound | Event emission (Part 4.11) |

## 3. Inbound Integrations

### 3.1 Project Setup — root creation
- **Trigger:** event `PRJ.PROJECT.ACTIVATED` `{project_id, project_code, tenant_id}`.
- **Action:** create PROJECT_ROOT with `wbs_code = project_code`; seed `wbs_code_segments` from the project's template choice.
- **Idempotency:** keyed on project_id; duplicate event = no-op (one-root index backstops).
- **Failure:** creation failure raises CRITICAL system audit + admin notification; project remains ACTIVE, WBS unusable until repaired — retry job every 5 min.

### 3.2 Planning & Scheduling — date mirror
- **Contract:** Module 23 calls `PATCH /internal/wbs/nodes/{id}/planned-dates` (service auth) with `{planned_start, planned_finish, source_activity_id}`. WBS stores, never edits, never computes. UI shows "from Programme".
- **Boundary restated:** float, dependencies, and critical path are Module 23's; WBS refuses any other writer of these columns.

### 3.3 Task Management / QA-QC — leaf progress feed
- **Event consumed:** `TASK.PROGRESS.UPDATED` / `QA.MEASUREMENT.RECORDED` `{wbs_node_id, progress_percent, measured_at, source}`.
- **Rules:** target must be leaf (else rejected + integrity report); write leaf value; invalidate ancestors (T3); async recompute.
- **Ordering:** per-node ordering by `measured_at`; late events older than current value's timestamp are ignored and logged.

### 3.4 BOQ / Budget — cost measures
- **Event consumed:** `BOQ.NODE_TOTALS.CHANGED` `{wbs_node_id, budget_value, committed_value, actual_value, forecast_value, currency, base_ccy_values}` (aggregated by BOQ per node).
- **Action:** upsert leaf measures into cache inputs; invalidate ancestors. WBS never sees line items.

### 3.5 BIM Coordination — model mapping
- Writes `wbs_node_attributes` rows `attr_key='ifc_guid'` via attribute API; bulk endpoint; conflicts (GUID already mapped elsewhere in project) rejected with both node ids returned.

## 4. Outbound Integrations (consumer contracts)

Common pattern per consumer: **on create** of a wbs-referencing record → `validateNode` (sync) → on success create record → `registerLink` (sync, same saga) → on delete/cancel → `deregisterLink`. SLA and fallback in §6.

| Consumer | Specifics |
|---|---|
| Task Management | Leaf-only entity_type `task`; status gate blocks new tasks on non-ACTIVE nodes (FR-040); task start additionally checks node ACTIVE (R0 §8.6 "task can only start if WBS is active") |
| Document Control (37) | Reads code segments for numbering at issue time; resolves historical numbers via `GET /wbs/search?code=` including `previous_full_code` (FR-011). Documents may attach to branch nodes |
| Procurement (18) | PR line carries node; validate + budget-availability read `getRollup(node,[budget,committed])`; PO inherits PR node |
| Inventory (20) | MIV issue-to-node validation; consumption registered as `stock_issue` link |
| Construction (22) | daily_report/photo/manpower attach at any node level; photos GPS-tagged upstream, node chosen by user |
| QA/QC (27) | inspection_request leaf-only; NCR any level; open-NCR count feeds closure gate (FR-023) via status callback `GET /internal/links/status-counts?node&entity_type=ncr` implemented by QA and called by WBS at gate time |
| HSE (28) | incident/permit at any level; permit issue checks node not ON_HOLD unless permit type = remedial |
| Equipment (24) | utilisation rows registered as links for cost allocation reads |
| IPC (32) | reads `wbs_progress_snapshots` for period evidence + baseline diff export; never live cache for a submitted IPC |
| EVM (31) | reads `is_control_account` nodes; aggregates PV/EV/AC per control account via rollup service |
| Reporting (44) | reads `v_wbs_rollup_public` view + snapshots; must render staleness age >15 min (ROLL-04 consumer duty) |
| Mobile (49) | pulls scope manifest (§9); structure = server wins |
| Notification Engine | resolves recipient strategy `WBS_RESPONSIBLE` via `GET /internal/wbs/nodes/{id}/responsibilities?current=true&discipline=` walking up ancestors to nearest assignment |
| Approval Engine | CR submission creates approval instance; decision webhook applies FR-029 |
| Audit Engine | every Part 4.11 event mirrored to `audit_logs` with module_code WBS |

## 5. WBS Resolution Service (the platform contract)

Service-to-service auth (JWT client-credentials, `aud=dcos-internal`); tenant from token.

### 5.1 `POST /api/v1/internal/wbs/resolve-context`
Req: `{"wbs_node_id":"…"}`
Resp:
```json
{
  "node_id":"9f2…","project_id":"p001…","tenant_id":"t01…",
  "full_code":"P001-PH2-B01-L05-Z03-STR-SLAB",
  "full_path":"Tower A … / Slab to L05",
  "node_type_code":"WORK_PACKAGE","status":"ACTIVE","is_leaf":true,
  "discipline_code":"STR","baseline_locked":true,
  "ancestors":[{"node_id":"…","node_type_code":"LEVEL","wbs_code":"L05"}, "…"],
  "responsible":{"user_id":"…","role_label":"Area Engineer","inherited_from_node":"…-B01"}
}
```
Cache: consumers may cache 10 min; invalidate on `WBS.NODE.MOVED|STATUS_CHANGED|CODE.CHANGED` for the node or any ancestor. SLA p95 120 ms.

### 5.2 `POST /api/v1/internal/wbs/validate-node`
Req: `{"wbs_node_id":"…","module":"TASK","entity_type":"task","action":"CREATE"}`
Resp allowed: `{"allowed":true}` · blocked:
```json
{"allowed":false,"reason_code":"WBS_STATUS_GATE","message":"Node is ON_HOLD (Authority stop-work). New tasks are blocked.","node_status":"ON_HOLD"}
```
Reason codes: `WBS_NODE_NOT_FOUND`, `WBS_STATUS_GATE`, `WBS_LEAF_ONLY`, `WBS_PROJECT_NOT_ACTIVE`, `WBS_SCOPE_DENIED`. Synchronous, p95 120 ms, **no caching** (gate decisions must be live).

### 5.3 `POST /api/v1/internal/wbs/register-link` / `deregister-link`
Req: `{"wbs_node_id":"…","entity_type":"task","entity_id":"…"}` → `{"registered":true,"link_id":"…"}`. Idempotent on unique key (repeat = 200 with existing id). Deregister of missing link = 200 `{"deregistered":false}` + logged. **Mandatory**: enforcement = service-layer interceptor in the platform SDK (every repository save of a wbs-bearing entity auto-calls it in-saga) **plus** the nightly reconciliation job that scans consuming tables (`tasks`, `documents`, `boq_items`, `inspection_requests`, `daily_reports`, `stock_transactions`, `safety_incidents`, `equipment_utilisation` …) for `wbs_node_id` values absent from `wbs_node_links`, repairs (registered_by='RECONCILER'), and reports counts to the integrity dashboard (FR-045); non-zero counts alert (doc 10).

### 5.4 `POST /api/v1/internal/wbs/resolve-subtree`
Req: `{"wbs_node_id":"…","max_depth":null}` → `{"node_ids":["…"],"count":9}`. Used by consumers to filter their own queries "everything under Level 05". Cache 5 min; invalidate on subtree mutation events.

### 5.5 `GET /api/v1/internal/wbs/nodes/{id}/rollup?measures=progress,budget,actual`
Resp: `{"progress_percent":66.0,"is_override":true,"budget_value":200000,"actual_value":121000,"currency":"USD","calculated_at":"2026-08-08T09:12:00Z","is_stale":false}`. Consumers must surface `calculated_at` when age >15 min.

### 5.6 Degraded mode
If the service is unreachable: consumers **must fail closed for writes** (no unvalidated link creation) and **fail open for reads** using last cached context flagged `stale=true`. Retry with exponential backoff, 3 attempts, then queue.

## 6. Contract Table (per-integration mechanics)

| Contract | Dir | Mode | Idempotency | Retry | SLA | Failure behaviour |
|---|---|---|---|---|---|---|
| Root creation | in | event | project_id key | 5-min job | 1 min | CRITICAL alert |
| Date mirror | in | sync PATCH | activity_id + node | caller | 500 ms | 409 on non-Planning writer |
| Leaf progress | in | event | node+measured_at | bus redelivery | eventual ≤15 min | late-event drop logged |
| Cost totals | in | event | node+version | bus | eventual ≤15 min | stale badge |
| validate-node | out | sync | n/a | none (fail closed) | 120 ms p95 | write refused |
| register-link | out | sync in saga | unique key | 3× backoff | 200 ms | saga rollback |
| resolve-context | out | sync | n/a | cache fallback | 120 ms p95 | stale-flagged read |
| CR approval | both | async workflow | cr_id | engine | 48 h escalation | fallback approver |
| Notifications | out | async | event+recipient | engine retry | 3 s in-app | delivery log |
| Audit | out | async, guaranteed | event id | outbox pattern | ≤5 s | outbox drains; never lost |

Event publication uses the **transactional outbox**: audit/notification/bus emission written in the same DB transaction as the mutation, drained by a relay — a structure change can never occur without its events.

## 7. Event Bus Contract

Envelope:
```json
{"event_id":"uuid","event_code":"WBS.NODE.MOVED","occurred_at":"…","tenant_id":"…",
 "project_id":"…","actor_user_id":"…","correlation_id":"…","payload":{…}}
```

| Event | Payload keys | Consumers |
|---|---|---|
| WBS.NODE.CREATED | node_id, parent_id, node_type_code, full_code | Reporting, Mobile |
| WBS.NODE.MOVED | node_id, old_parent_id, new_parent_id, old_full_code, new_full_code, descendant_count, cr_ref? | ALL consumers (cache invalidation), DC, Reporting, Mobile |
| WBS.CODE.CHANGED | node_id, old_full_code, new_full_code, cr_ref | Document Control, Reporting |
| WBS.NODE.STATUS_CHANGED / STATUS_CASCADED | node_id(s), status_from, status_to, reason_code | Task, QA, HSE, Mobile |
| WBS.NODE.DELETED / ARCHIVED / RESTORED | node_id, full_code | Reporting, Mobile |
| WBS.BASELINE.SET | baseline_id, label, node_count | IPC, QS dashboards |
| WBS.CHANGE.RAISED/APPROVED/REJECTED | cr_id, change_type, node_ids | Approval, Notification |
| WBS.PROGRESS.OVERRIDDEN | node_id, value, reason_code | Reporting, PD dashboard |
| WBS.ROLLUP.RECALCULATED | project_id, node_count, duration_ms | Reporting (cache refresh) |
| WBS.IMPORT.* | batch_id, counts | Notification |
| WBS.TEMPLATE.APPLIED | template_id, project_id, node_count | Reporting |
| WBS.RESPONSIBILITY.ASSIGNED | node_id, user_id, discipline_code | Notification |

Ordering: per-node ordered (partition key node_id); cross-node ordering not guaranteed — consumers must not assume it.

## 8. Failure & Consistency — the orphan-reference rule

A consumer holding a `wbs_node_id` that is now ARCHIVED/CANCELLED/CLOSED: **the reference remains valid forever** (soft delete only). Reads resolve with the current status; writes are gated by `validate-node`. A consumer holding an id that fails to resolve at all indicates data corruption → consumer must flag the record, not delete it; the integrity job (FR-045) reports cross-references for repair. There is no scenario in which a registered link's node disappears — ON DELETE RESTRICT guarantees it.

## 9. Offline / Mobile Sync Contract (Module 49)

- **Manifest:** `GET /internal/wbs/scope-manifest?user_id=` → nodes in the user's scope with id, parent, code, path, type, status, version stamp; delta endpoint by `since` cursor.
- **Cache staleness:** manifest older than 24 h forces refresh before structure-dependent actions; navigation allowed regardless.
- **Conflict rule (Gap §4.6):** structure = **server wins** always; field data (reports, photos) = device wins on content, but the node reference is by ID so structure moves never invalidate queued field records. If a queued record targets a node that became CLOSED/CANCELLED while offline, sync parks it in a conflict queue with user resolution ("choose new location / discard"), never silent drop.
- **Sync status:** every mobile screen shows sync state per Gap §4.6 principle.

## 10. Open Questions

| # | Question |
|---|---|
| OQ-01 | Should `resolve-subtree` support code-prefix resolution for legacy integrations? (Current: no — IDs only; codes via search endpoint.) |
| OQ-02 | Bus technology binding (Supabase Realtime vs BullMQ events) — deferred to platform decision; contracts above are transport-agnostic. |

## 11. Change Log

| Version | Date | Change |
|---|---|---|
| R1 | 2026-08-08 | Initial issue |

**End of Document**
