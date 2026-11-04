# DCOS — WBS Management Module
## 08 — API Reference

| Field | Detail |
|---|---|
| Document Code | DCOS-WBS-API-001 |
| Version | R1 |
| Module | 04-03 — WBS Management |
| Author Persona | Senior System Architect + API Designer |
| Status | Issued for Review |
| Base References | DCOS-WBS-DB-001, DCOS-WBS-RBAC-001 |

---

## 1. Conventions

| Item | Value |
|---|---|
| Base URL | `https://api.dcos.app/api/v1` |
| Auth | `Authorization: Bearer <JWT>` |
| Tenant | Resolved from JWT claim `tenant_id` — **never** read from body or query. A body `tenant_id` is rejected 400. |
| Content type | `application/json`; import upload `multipart/form-data` |
| IDs | UUID v4 |
| Dates | ISO-8601 UTC (`2026-08-08T09:12:00Z`); date-only `YYYY-MM-DD` |
| Idempotency | `Idempotency-Key` header honoured on all POST mutations (24 h window) |
| Concurrency | `If-Match: <subtree_version>` required on move/reorder/duplicate/status-cascade |
| Versioning | URL major version; additive changes only within v1 |

### Response envelope

```json
{ "data": { }, "meta": { "request_id": "…", "elapsed_ms": 43 } }
```
```json
{ "error": { "code": "WBS_CODE_DUPLICATE", "message": "…", "details": { }, "request_id": "…" } }
```

### HTTP mapping

| Class | Status |
|---|---|
| Validation | 422 |
| Permission / scope | 403 |
| Tenant mismatch / not found | 404 |
| Business-state block (lock, guard, status) | **409** — so the UI can offer the alternative route |
| Concurrency | 409 `WBS_CONCURRENT_MODIFICATION` |
| Async accepted | 202 with `job_id` |

## 2. Error Code Catalogue

`WBS_NODE_NOT_FOUND` · `WBS_PARENT_NOT_FOUND` · `WBS_CIRCULAR_REFERENCE` · `WBS_DEPTH_EXCEEDED` · `WBS_BREADTH_EXCEEDED` · `WBS_CODE_DUPLICATE` · `WBS_CODE_INVALID_FORMAT` · `WBS_CODE_IMMUTABLE` · `WBS_STRUCTURE_RULE_VIOLATION` · `WBS_LEAF_CANNOT_HAVE_CHILDREN` · `WBS_NODE_HAS_LINKS` · `WBS_BASELINE_LOCKED` · `WBS_CHANGE_REQUEST_REQUIRED` · `WBS_STATUS_TRANSITION_INVALID` · `WBS_SUBTREE_TOO_LARGE` · `WBS_CONCURRENT_MODIFICATION` · `WBS_IMPORT_VALIDATION_FAILED` · `WBS_IMPORT_ALREADY_COMMITTED` · `WBS_ROLLUP_STALE` · `WBS_OVERRIDE_REASON_REQUIRED` · `WBS_SCOPE_DENIED` · `WBS_PROJECT_NOT_ACTIVE` · `WBS_PERMISSION_DENIED`

## 3. Pagination, Filtering, Lazy Tree

- List endpoints: `?page=1&page_size=100` (max 500), response `meta.total`, `meta.has_more`.
- Tree: `/wbs/tree?depth=3` returns to depth 3 with `has_children` flags; `/wbs/tree/lazy?parent_id=&page=` expands one level (page 200).
- Filters: `status`, `node_type_code`, `discipline_code`, `is_control_account`, `updated_since`.
- Sort: `sort=sort_order|full_code|node_name|progress_percent`.

## 4. Endpoint Reference

> Each entry: purpose · permission · params · request · response · errors · idempotency · rate limit · FRs.

### 4.1 Tree & Read

**`GET /projects/{projectId}/wbs/tree`** — scoped tree to depth. Perm `WBS.VIEW_TREE`. Query: `depth` (default 3, max 12), `mode` (structure|progress|cost|status), `include_archived` (default false).
```json
{"data":{"root":{"node_id":"9a1…","wbs_code":"P001","full_code":"P001",
 "node_name":"Tower A Mixed-Use Development","node_type_code":"PROJECT_ROOT",
 "status":"ACTIVE","progress_percent":42.0,"is_leaf":false,"has_children":true,
 "subtree_version":41,"children":[
   {"node_id":"3c7…","wbs_code":"PH2","full_code":"P001-PH2","node_name":"Superstructure",
    "node_type_code":"PHASE","status":"ACTIVE","progress_percent":51.0,"has_children":true,
    "context_only":false,"children":[]}]},
 "rollup_calculated_at":"2026-08-08T09:12:00Z","is_stale":false}}
```
Errors: 403 `WBS_SCOPE_DENIED`, 404. Rate limit: exempt from the 200/min tenant cap (navigation traffic), own cap 600/min/user. FR-043.

**`GET /projects/{projectId}/wbs/tree/lazy?parent_id=&page=`** — one level of children. Perm `WBS.VIEW_TREE`. FR-043.

**`GET /projects/{projectId}/wbs/search?q=&limit=`** — code or name, trigram, scope-filtered, includes `previous_full_code` matches. Perm `WBS.VIEW_TREE`.
```json
{"data":[{"node_id":"7f3…","full_code":"P001-PH2-B01-L05A-Z03",
 "matched_on":"previous_full_code","previous_full_code":"P001-PH2-B01-L05-Z03",
 "full_path":"Tower A … / Zone 03 (East Wing)","status":"ACTIVE"}]}
```
FR-011, FR-042.

**`GET /projects/{projectId}/wbs/flat`** — flat paginated list for tables/exports. Perm `WBS.VIEW_TREE`. FR-043.

**`GET /wbs/nodes/{id}`** — node detail (+`?include=attributes,responsibilities,links_summary,rollup`). Perm `WBS.VIEW_NODE`. Cost fields omitted without `WBS.VIEW_COST_ROLLUP`. Errors 403/404. FR-005.

**`GET /wbs/nodes/{id}/children`** · **`/ancestors`** · **`/descendants?max_depth=`** — closure-backed reads. Perm `WBS.VIEW_TREE`. Ancestors outside scope return `context_only:true` with name/code only (RBAC §4).

**`GET /wbs/nodes/{id}/links`** — grouped counts + paginated detail.
```json
{"data":{"total":46,"by_type":[{"entity_type":"document","count":34},
 {"entity_type":"task","count":12}]}}
```
Perm `WBS.VIEW_NODE`. FR-038.

**`GET /wbs/nodes/{id}/impact-analysis?action=MOVE&target_parent_id=`** — preview payload for SCR-WBS-003.
```json
{"data":{"descendant_count":9,"linked_records":{"document":34,"task":12},
 "responsibilities":3,"code_changes":[{"node_id":"…",
 "from":"P001-PH2-B01-L05-Z03-STR-SLAB","to":"P001-PH2-B01-L06-Z03-STR-SLAB"}],
 "rollup_chains":["…L05","…L06"],"notify_roles":["PM","DISCIPLINE_MANAGER",
 "DOCUMENT_CONTROLLER"],"blocking":[]}}
```
Perm: the permission of the previewed action. Target <1.5 s. FR-013.

### 4.2 Mutation

**`POST /projects/{projectId}/wbs/nodes`** — create. Perm `WBS.CREATE_NODE`.
```json
{"parent_id":"5b2…","node_type_code":"WORK_PACKAGE","wbs_code":"SLAB",
 "node_name":"Slab to L05","discipline_code":"STR","rollup_method":"COST_WEIGHTED",
 "sort_order":10,"attributes":{"area_m2":640}}
```
201 → node object. Errors: 422 `WBS_CODE_INVALID_FORMAT`; 409 `WBS_CODE_DUPLICATE`, `WBS_STRUCTURE_RULE_VIOLATION`, `WBS_DEPTH_EXCEEDED`, `WBS_BREADTH_EXCEEDED`, `WBS_LEAF_CANNOT_HAVE_CHILDREN`; 404 `WBS_PARENT_NOT_FOUND`; 409 `WBS_PROJECT_NOT_ACTIVE`. Idempotent via header. FR-002.

**`PATCH /wbs/nodes/{id}`** — name, discipline, rollup_method, is_control_account, attributes, `wbs_code` (guarded). Perm `WBS.EDIT_NODE` (+`WBS.EDIT_CODE` for code). Errors: 409 `WBS_CODE_IMMUTABLE` (details include `reason: LINKED_RECORDS|BASELINE`, `change_request_required: true`), `WBS_BASELINE_LOCKED`, `WBS_CONCURRENT_MODIFICATION`. FR-005, 006, 010.

**`DELETE /wbs/nodes/{id}`** — soft delete. Perm `WBS.DELETE_NODE`.
409 example:
```json
{"error":{"code":"WBS_NODE_HAS_LINKS","message":"Zone 03 has 46 linked records.",
 "details":{"by_type":{"document":34,"task":12},
 "alternatives":["ARCHIVE","REASSIGN_LINKS"]}}}
```
FR-016.

**`POST /wbs/nodes/{id}/move`** — `If-Match` required. Perm `WBS.MOVE_NODE`.
```json
{"new_parent_id":"8d4…","position":3,"new_wbs_code":null,"change_request_id":null}
```
200 → `{"data":{"node_id":"…","new_full_code":"P001-PH2-B01-L06-Z03","descendants_updated":9,"subtree_version":42}}`
Errors: 409 `WBS_CIRCULAR_REFERENCE`, `WBS_CODE_DUPLICATE`, `WBS_DEPTH_EXCEEDED`, `WBS_SUBTREE_TOO_LARGE`, `WBS_BASELINE_LOCKED` (with `change_request_required:true`), `WBS_CONCURRENT_MODIFICATION` (details: winning operation, actor, timestamp). >1,000 descendants → 202 async job. FR-012.

**`POST /wbs/nodes/{id}/reorder`** — `{"position":2}` or `{"ordered_sibling_ids":[…]}`. Perm `WBS.REORDER_NODE`. FR-014.

**`POST /wbs/nodes/{id}/duplicate`** — `{"target_parent_id":"…","repeat":15,"code_mask":"L{nn}","start_sequence":6,"copy_responsibilities":false}`. 202 async above 200 nodes. Perm `WBS.DUPLICATE_NODE`. Errors: 409 `WBS_CODE_DUPLICATE` (collision list), `WBS_SUBTREE_TOO_LARGE`. FR-015.

**`POST /wbs/nodes/{id}/status`** — `{"status":"ON_HOLD","reason_code":"AUTHORITY_STOP_WORK","comment":"…","cascade":true}`. Perm `WBS.CHANGE_STATUS` (+`WBS.CASCADE_STATUS` if cascade). Errors: 409 `WBS_STATUS_TRANSITION_INVALID` (details: allowed transitions), blocking descendants list on COMPLETED/CLOSED gates. Cascade partial failure returns 207-style payload inside 200: `{"succeeded":9,"failed":[{"node_id":"…","reason":"OPEN_NCR"}]}`. FR-021–025.

**`POST /wbs/nodes/{id}/archive`** · **`/restore`** — Perm `WBS.ARCHIVE_NODE` / `WBS.RESTORE_NODE`. FR-026.

### 4.3 Roll-Up

**`GET /wbs/nodes/{id}/rollup?measures=progress,budget,committed,actual,forecast`** — Perm `WBS.VIEW_NODE` (+`WBS.VIEW_COST_ROLLUP` for cost; unauthorised measures silently omitted, listed in `meta.omitted_measures`).
```json
{"data":{"progress_percent":66.0,"is_override":true,"override_reason":"DATA_LAG",
 "derived_progress_percent":66.0,"budget_value":200000.00,"currency":"USD",
 "calculated_at":"2026-08-08T09:12:00Z","is_stale":false,
 "contributions":[{"node_id":"…","node_name":"STR","value":70.0,"weight":180000,"contribution":63.0}]}}
```
FR-032, 033, 034.

**`POST /wbs/nodes/{id}/rollup/recalculate`** — 202 `{"job_id":"…"}`. Perm `WBS.RECALCULATE_ROLLUP`. FR-032.

**`POST /wbs/nodes/{id}/progress-override`** — `{"progress_percent":66.0,"reason_code":"DATA_LAG","comment":"Weekend pour not yet in task data"}`; `DELETE` same path removes it. Perm `WBS.OVERRIDE_PROGRESS`. Errors 422 `WBS_OVERRIDE_REASON_REQUIRED`. FR-035.

### 4.4 Responsibility

**`GET /wbs/nodes/{id}/responsibilities?current=true&discipline=MEP`** — includes `inherited_from_node` when resolved from an ancestor. Perm `WBS.VIEW_NODE`.
**`POST /wbs/nodes/{id}/responsibilities`** — `{"user_id":"…","discipline_code":"MEP","role_label":"MEP Lead","valid_from":"2026-08-01"}`. Perm `WBS.ASSIGN_RESPONSIBLE`. Errors 422 (assignee not on project roster).
**`DELETE /wbs/responsibilities/{responsibilityId}`** — end-dates (never hard-deletes). FR-037.

### 4.5 Templates

**`GET /wbs/templates?project_type=TOWER`** · **`POST /wbs/templates`** (from subtree: `{"source_node_id":"…","template_name":"…","project_type":"TOWER"}`) — Perm `WBS.MANAGE_TEMPLATE`.
**`POST /projects/{projectId}/wbs/apply-template`** — `{"template_id":"…","target_node_id":"…","segment_overrides":{"BUILDING":"B01"},"dry_run":true}`. Dry run returns the diff; live run 202 above 200 nodes. Perm `WBS.APPLY_TEMPLATE`. Errors 409 `WBS_CODE_DUPLICATE`, `WBS_SUBTREE_TOO_LARGE`. FR-020.

### 4.6 Import / Export

**`POST /projects/{projectId}/wbs/import`** (multipart: `file`) → 202 `{"batch_id":"…","batch_number":"WB-IMP-0007","status":"VALIDATING"}`. Perm `WBS.BULK_IMPORT`.
**`GET /wbs/import-batches/{batchId}`** → status + `validation_report` + `diff_report`.
```json
{"data":{"status":"VALIDATION_FAILED","row_count":412,"reject_count":9,
 "validation_report":[{"row":41,"column":"wbs_code",
   "message":"Code R045 duplicates row 12 under P001-PH2-B01-L05-Z03"},
  {"row":77,"column":"parent_ref","message":"Parent 'L5-Z9' not found in file or tree"}]}}
```
**`POST /wbs/import-batches/{batchId}/commit`** — commits a VALIDATED batch (all-or-nothing). Errors 409 `WBS_IMPORT_VALIDATION_FAILED`.
**`POST /wbs/import-batches/{batchId}/rollback`** — Perm `WBS.ROLLBACK_IMPORT`. Errors 409 `WBS_IMPORT_ALREADY_COMMITTED` (already rolled back) or `WBS_NODE_HAS_LINKS` with the blocking node list. FR-017, 018.

**`GET /projects/{projectId}/wbs/export?format=xlsx&include_cost=true`** — 202 for large trees; cost columns require `WBS.VIEW_COST_ROLLUP`; export audited. Perm `WBS.EXPORT`. FR-019.

### 4.7 Baseline & Change Control

**`POST /projects/{projectId}/wbs/baselines`** — `{"label":"R0","approval_ref":"…"}` → 201 with node_count. Perm `WBS.SET_BASELINE`. FR-027.
**`GET /projects/{projectId}/wbs/baselines`** — list. 
**`GET /wbs/baselines/{baselineId}/compare?against=live|baselineId`** →
```json
{"data":{"added":14,"renamed":2,"moved":[{"node_id":"…","from_parent":"…L05",
 "to_parent":"…L06","change_request_id":"cr-9","cr_number":"CR-WBS-0009"}],
 "recoded":[{"from":"P001-PH2-B01-L05","to":"P001-PH2-B01-L05A"}],"removed":0}}
```
FR-030.
**`POST /projects/{projectId}/wbs/change-requests`** — `{"change_type":"MOVE","node_ids":["…"],"payload":{"new_parent_id":"…"},"justification":"Design change per EI-014"}`. Perm `WBS.RAISE_CHANGE`. FR-029.
**`PATCH /wbs/change-requests/{id}/decision`** — `{"decision":"APPROVED","comment":"…"}`; system applies the change and returns the resulting operation summary. Perm `WBS.APPROVE_CHANGE`. Errors 403 when `requested_by == decided_by`. FR-029.
**`GET /projects/{projectId}/wbs/change-requests?status=`** — queue.

### 4.8 Configuration & Reports

**`GET|PATCH /projects/{projectId}/wbs/code-segments`** — Perm `WBS.CONFIGURE_RULES`. Errors 409 when `mode_locked`. FR-007.
**`GET|POST|PATCH /wbs/node-types`**, **`/wbs/structure-rules`** — Perm `WBS.CONFIGURE_RULES`.
**`GET /projects/{projectId}/wbs/reports/overrides`** — FR-044.
**`GET /projects/{projectId}/wbs/reports/integrity`** — FR-045.

### 4.9 Internal (Resolution Service)

`POST /internal/wbs/resolve-context` · `/validate-node` · `/register-link` · `/deregister-link` · `/resolve-subtree` · `GET /internal/wbs/nodes/{id}/rollup` · `GET /internal/wbs/scope-manifest` · `PATCH /internal/wbs/nodes/{id}/planned-dates`.

Auth: client-credentials JWT, `aud=dcos-internal`, service identity claim; tenant and project derived from the referenced node, cross-checked against the calling service's tenant context. Contracts and payloads are specified in document 05 §5. Rate limit 3,000/min/service. Not reachable from public gateway.

## 5. Long-Running Operations

Operations exceeding thresholds (move >1,000 descendants, duplicate >200, template apply >200, import commit, export >5,000 rows, rollup rebuild) return:
```json
{"data":{"job_id":"9c1…","status":"QUEUED","poll":"/wbs/jobs/9c1…"}}   // HTTP 202
```
`GET /wbs/jobs/{jobId}` → `{"status":"RUNNING","progress":0.62,"processed":620,"total":1000}`; terminal states `SUCCEEDED|FAILED` with `result` or `error`. Completion also raises an in-app notification. Jobs are cancellable while QUEUED only.

## 6. Concurrency Control

Every subtree-affecting call sends `If-Match: <subtree_version>` from the last read. Server compares against the nearest common subtree token; mismatch →
```json
{"error":{"code":"WBS_CONCURRENT_MODIFICATION","message":"This subtree changed while you were editing.",
 "details":{"winning_operation":"MOVE","node_id":"7f3…","actor":"Dara (Planner)",
 "occurred_at":"2026-08-08T14:02:11Z","current_version":42}}}
```
No merge is attempted. Clients refresh and re-evaluate.

## 7. Rate Limits

| Class | Limit |
|---|---|
| Default tenant cap (Gap §5.4) | 200 req/min/tenant |
| Tree read endpoints (`/tree`, `/tree/lazy`, `/children`, `/search`) | 600 req/min/user, exempt from tenant cap — navigation is not integration traffic |
| Mutations | 60 req/min/user |
| Import upload | 10/hour/project |
| Export | 20/hour/tenant |
| Internal service endpoints | 3,000 req/min/service |

Headers: `X-RateLimit-Limit`, `-Remaining`, `-Reset`; 429 with `Retry-After`.

## 8. OpenAPI Snippet

```yaml
openapi: 3.1.0
info: { title: DCOS WBS Management API, version: "1.0.0" }
paths:
  /projects/{projectId}/wbs/tree:
    get:
      operationId: getWbsTree
      security: [{ bearerAuth: [] }]
      parameters:
        - { name: projectId, in: path, required: true, schema: { type: string, format: uuid } }
        - { name: depth, in: query, schema: { type: integer, default: 3, maximum: 12 } }
      responses:
        "200": { description: Scoped tree }
        "403": { description: WBS_SCOPE_DENIED }
  /wbs/nodes/{id}/move:
    post:
      operationId: moveWbsNode
      parameters:
        - { name: If-Match, in: header, required: true, schema: { type: string } }
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [new_parent_id]
              properties:
                new_parent_id: { type: string, format: uuid }
                position: { type: integer }
                change_request_id: { type: string, format: uuid, nullable: true }
      responses:
        "200": { description: Moved }
        "202": { description: Async job for large subtree }
        "409": { description: WBS_BASELINE_LOCKED | WBS_CIRCULAR_REFERENCE | WBS_CONCURRENT_MODIFICATION }
components:
  securitySchemes:
    bearerAuth: { type: http, scheme: bearer, bearerFormat: JWT }
```

## 9. Open Questions

| # | Question |
|---|---|
| OQ-01 | Should cascade partial failure use HTTP 207 Multi-Status rather than 200 with a failure array? (Current: 200 + array, simpler for clients.) |
| OQ-02 | Webhook subscriptions for external systems on WBS events — deferred to Integration Layer module (No. 50). |

## 10. Change Log

| Version | Date | Change |
|---|---|---|
| R1 | 2026-08-08 | Initial issue. Added `/import-batches/{id}/commit` and `/wbs/jobs/{id}` beyond Part 4.9 list — recorded here per Part 3 rule 4. |

**End of Document**
