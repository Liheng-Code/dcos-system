# DCOS — Project Setup Module
## 08 — API Reference

| Field | Detail |
|---|---|
| Document Code | DCOS-PRJ-API-001 |
| Version | R1 |
| Module | 04-02 — Project Setup (Foundation Phase) |
| Author Persona | Senior Backend Engineer |
| Status | Issued for Review |
| Depends On | DCOS-PRJ-DB-001, DCOS-PRJ-RBAC-001 |

---

## 1. Conventions

- Base: `/api/v1` · Auth: `Authorization: Bearer <JWT>` · `tenant_id` from token only.
- Timestamps ISO 8601 UTC. Money `decimal` as string. Cursor pagination: `?cursor=&limit=` → `{data, next_cursor}`.
- Standard error envelope:

```json
{ "error": { "code": "PROJECT_CODE_DUPLICATE", "message": "Project code P014 already exists", "details": {"suggestion": "P016"} } }
```

- Common errors: `401 UNAUTHENTICATED`, `403 FORBIDDEN` (RBAC/status override), `404 NOT_FOUND` (or cross-tenant), `409 CONFLICT` (guards, duplicates), `422 VALIDATION_FAILED`, `423 LOCKED` (numbering), `429 RATE_LIMITED`.
- `Idempotency-Key` header supported where marked ⚡ — replay returns the original response.
- Rate limit: 200 req/min/tenant (platform standard); `resolveNumber` additionally 50 req/min/project.

## 2. Endpoints

### 2.1 Projects

#### `GET /projects` — permission `project.view.full` (C¹ scoped)
Query: `status, phase, type, client_id, pm_id, q, cursor, limit`.

```json
{ "data": [{ "id":"…","project_code":"P014","project_name":"Tower A","status":"ACTIVE",
  "current_phase":"EXEC","client":{"id":"…","name":"Mekong Development"},
  "project_manager":{"id":"…","name":"Sokha"},"contract_current_value":"12650000.00","currency":"USD" }],
  "next_cursor": null }
```

#### `POST /projects` — `project.create` · Audit `PROJECT_CREATED`

```json
{ "project_code":"P016","project_name":"Riverside Mall","project_type":"TENDER",
  "client_id":"…","sector":"Commercial","location":"Phnom Penh","timezone":"Asia/Phnom_Penh" }
```
`201` project · `409 PROJECT_CODE_DUPLICATE` with suggestion · `422 CLIENT_INVALID`.

#### `GET /projects/:id` · `PATCH /projects/:id` — `project.view.full` / `project.edit`
PATCH editable fields: name, sector, location, description, timezone. Code immutable after ACTIVE → `409 CODE_IMMUTABLE`. Audit `PROJECT_UPDATED`.

#### `POST /projects/:id/status` ⚡ — `project.status.request` · Audit `PROJECT_STATUS_CHANGED` + specific

```json
{ "to": "ON_HOLD", "reason": "Client suspension letter CL-118" }
```
`202` `{workflow_instance_id}` when approval required · `200` when direct (allowed pairs) · `409 TRANSITION_NOT_ALLOWED` `{allowed_to:[…]}` · `409 CONVERSION_CHECKLIST_INCOMPLETE` `{open_blocking_items:[…]}`.

#### `GET /projects/:id/status-history`
Chronological transitions with actor, reason, approver.

#### `POST /projects/:id/archive` — `project.archive` · Audit `PROJECT_ARCHIVED`
`409 NOT_CLOSED` unless status CLOSED.

### 2.2 Tenders

#### `POST /tenders` — `tender.manage` · Audit `TENDER_REGISTERED`
Creates project (type TENDER) + tender record in one call.

```json
{ "project": {"project_code":"P015","project_name":"Riverside Mall","client_id":"…"},
  "tender": {"estimated_value":"8200000.00","submission_deadline":"2026-09-15T07:00:00Z",
             "bond_required":true,"scope_summary":"Design & build, 4-storey retail"} }
```

#### `PATCH /tenders/:id` — `tender.manage`
Pre-result edits only → `409 RESULT_RECORDED` after.

#### `POST /tenders/:id/bid` ⚡ — `bid.record` · Audit `BID_SUBMITTED`

```json
{ "submitted_value":"7980000.00","submitted_at":"2026-09-15T06:40:00Z","transmittal_ref":"T-0198" }
```
`409 BID_EXISTS` on duplicate (unique constraint).

#### `POST /tenders/:id/result` ⚡ — `bid.record` · Audit `TENDER_WON` | `TENDER_LOST`

```json
{ "result":"WON","result_reference":"LOA-2026-031","result_date":"2026-03-18" }
```
```json
{ "result":"LOST","loss_reason_code":"PRICE","winner_name":"ABC Corp","winning_price":"7500000.00" }
```
WON side-effect: status → AWARDED, conversion checklist instantiated (returned in response). `422 LOSS_REASON_REQUIRED`.

### 2.3 Conversion

#### `GET /projects/:id/conversion-checklist`

```json
{ "checklist_id":"…","status":"OPEN","working_days_since_award":4,"target_days":10,
  "items":[{"id":"…","item_code":"CONTRACT_HEADER","label":"Contract header recorded",
            "is_blocking":true,"status":"COMPLETED","evidence_ref":"contract:…"},
           {"id":"…","item_code":"WBS_ROOT","is_blocking":true,"status":"OPEN"}] }
```

#### `PATCH /projects/:id/conversion-checklist/items/:itemId` — role per item mapping · Audit `CHECKLIST_ITEM_COMPLETED`
Body: `{status, evidence_ref?, waive_reason?}`. `WBS_ROOT` completion triggers the WBS root command (Integration §4.1); failure → `502 WBS_ROOT_FAILED`, item stays OPEN, retry-safe. `422 WAIVE_BLOCKING_FORBIDDEN`.

### 2.4 Team

#### `GET /projects/:id/team` · `POST /projects/:id/team` — `project.team.manage` · Audit `TEAM_MEMBER_ASSIGNED`

```json
{ "user_id":"…","project_role":"ENGINEER","start_date":"2026-04-01","end_date":null }
```
`409 PM_EXISTS` if role PM and active PM present · `403 SELF_GRANT_FORBIDDEN` (SoD §6).

#### `PATCH /projects/:id/team/:memberId` · `DELETE /projects/:id/team/:memberId`
DELETE = end-date (soft). Response includes `open_items_owned` for reassignment. `409 IS_CURRENT_PM` → use pm-change.

#### `POST /projects/:id/team/pm-change` ⚡ — Director · Audit `PM_CHANGED`

```json
{ "incoming_user_id":"…","effective_at":"2026-08-10T01:00:00Z" }
```
Atomic swap; `409 CONCURRENT_PM_CHANGE` on race (partial unique index).

### 2.5 Contract

#### `GET /projects/:id/contract` — read model for Finance/BOQ

```json
{ "contract_type":"LUMP_SUM","original_value":"12400000.00","currency":"USD","currency_locked":true,
  "commencement_date":"2026-04-01","completion_date":"2027-09-30","dlp_months":12,
  "retention_percent":"5.00",
  "revisions":[{"revision_no":1,"value_delta":"250000.00","reason":"VO-004 approved","approved_at":"…"}],
  "current_value":"12650000.00" }
```

#### `POST /projects/:id/contract` — `project.contract.edit` · Audit `CONTRACT_ADDED`
`409 CONTRACT_EXISTS` (one head contract).

#### `POST /projects/:id/contract/revisions` ⚡ — `project.contract.revise` · Audit `CONTRACT_REVISED`

```json
{ "value_delta":"250000.00","new_completion_date":null,"reason":"VO-004 approved","reference":"VO-004" }
```
`202` with workflow instance (approval chain). `422 REASON_REQUIRED`.

#### `POST /projects/:id/contract/lock-currency` — internal (Finance service token)
Sets `currency_locked = true`. Idempotent.

### 2.6 Milestones

- `GET /projects/:id/milestones` · `POST` (`project.milestone.manage`, Audit `MILESTONE_CREATED`) · `PATCH /milestones/:msId` (PLANNED only) · `DELETE` → status CANCELLED.
- `POST /projects/:id/milestones/:msId/achieve` — `{achieved_date, evidence_ref}` · Audit `MILESTONE_ACHIEVED`.
- `POST /projects/:id/milestones/:msId/miss` — `{missed_reason}` mandatory · Audit `MILESTONE_MISSED`; contractual type publishes Critical notification. `422 REASON_REQUIRED`.

### 2.7 Calendar

- `GET /projects/:id/calendar` — pattern + effective holiday list (inherited merged with overrides).
- `PUT /projects/:id/calendar` — `project.calendar.edit` · Audit `CALENDAR_UPDATED`. Prospective-only note in response.
- `POST /projects/:id/calendar/holidays` · `DELETE /projects/:id/calendar/holidays/:hid` — Audit `HOLIDAY_ADDED`.

### 2.8 Numbering

#### `GET /projects/:id/numbering-rules` · `POST` — `project.numbering.configure` · Audit `NUMBERING_RULE_CREATED`

```json
{ "record_type":"DWG","pattern":"{PROJECT}-{DISCIPLINE}-DWG-{BUILDING}-{LEVEL}-{SEQ:3}-R{REV}" }
```
`422 PATTERN_INVALID` (missing {SEQ:n} or unknown token) · `409 RULE_EXISTS`.

#### `PATCH /projects/:id/numbering-rules/:ruleId`
Pre-lock only → `423 RULE_LOCKED` after first issue.

#### `POST /projects/:id/numbering-rules/:ruleId/preview`
Body: context map → `{preview: "P014-STR-DWG-B01-L05-001-R00"}`. No side effects.

#### `POST /projects/:id/numbering/resolve` ⚡ — internal service endpoint · Audit `NUMBERING_RULE_LOCKED` (first call only)

```json
{ "record_type":"DWG","context":{"DISCIPLINE":"STR","BUILDING":"B01","LEVEL":"L05","REV":"00"} }
```
`200 {number, seq, rule_locked}` — transactional row lock, never cached. `404 RULE_MISSING` · `422 CONTEXT_TOKEN_MISSING`.

### 2.9 Settings & Context

- `GET /projects/:id/settings` · `PATCH` — Audit `PROJECT_SETTING_CHANGED` (before/after in audit payload).
- `GET /projects/:id/context` — resolution service (Integration §5.1); cache 60 s.
- `GET /projects/:id/gate?action=` — gate service (Integration §5.2); consuming modules fail closed on outage.

## 3. Webhook Events

All Part 4.10 event codes published with the envelope in Integration §6. Subscription management is platform-level (Integration Engine); this module guarantees at-least-once with `event_id` idempotency.

## 4. Traceability

| Endpoint group | FR IDs |
|---|---|
| Projects CRUD/list | PRJ-FR-001–005 |
| Status | PRJ-FR-030–034 |
| Tenders/bids/results | PRJ-FR-010–015 |
| Conversion | PRJ-FR-020–023 |
| Team / pm-change | PRJ-FR-040–043 |
| Contract | PRJ-FR-050–053 |
| Milestones | PRJ-FR-060–062 |
| Calendar | PRJ-FR-070–071 |
| Numbering | PRJ-FR-080–082 |
| Settings/context/gate | PRJ-FR-090; Integration §5 |

## 5. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1 | 2026-08 | Initial issue | Backend Engineer |
