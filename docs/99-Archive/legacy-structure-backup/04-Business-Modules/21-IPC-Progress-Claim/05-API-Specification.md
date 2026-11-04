# 05 — API Specification
**Module:** 21 — IPC / Progress Claim
**Doc Code:** DCOS-MOD21-API-001 | **Rev:** R0 | **Status:** Draft
**Source rule:** AUTO-GENERATED from OpenAPI annotations in CI.
Hand-maintained parts: endpoint intent notes and the examples section.

---

## 1. Endpoints

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | /api/projects/:projectId/ipcs | List IPCs for project (filter: status, period) | ipc.view |
| POST | /api/projects/:projectId/ipcs | Create draft IPC for period | ipc.create |
| GET | /api/ipcs/:id | IPC header + totals | ipc.view |
| GET | /api/ipcs/:id/items?section=&page= | Paginated claim lines by BOQ section | ipc.view |
| PATCH | /api/ipcs/:id/items/:itemId | Update this-period qty (Draft only) | ipc.edit |
| POST | /api/ipcs/:id/items/import-progress | Suggest quantities from WBS progress roll-up | ipc.edit |
| POST | /api/ipcs/:id/vo-lines | Add approved VO line | ipc.edit |
| POST | /api/ipcs/:id/backcharges | Add back-charge line | ipc.edit |
| POST | /api/ipcs/:id/submit-internal | Draft → Internal Review | ipc.submit |
| POST | /api/ipcs/:id/approve | Internal Review → PM Endorsement → Submitted (per workflow step) | ipc.approve |
| POST | /api/ipcs/:id/return | Return to Draft with comment | ipc.approve |
| POST | /api/ipcs/:id/recall | Submitted → Draft (audit critical) | ipc.recall |
| POST | /api/ipcs/:id/certifications | Record client certification (bulk lines) | ipc.certify-record |
| POST | /api/ipcs/:id/mark-invoiced | Link AR invoice | ipc.finance |
| POST | /api/ipcs/:id/payments | Record payment against certified value | ipc.finance |
| GET | /api/ipcs/:id/package | Get/generate submission package (async) | ipc.view |
| GET | /api/projects/:projectId/claim-position | Cumulative contract position | ipc.view |
| GET | /api/ipcs/:id/variance-report | Claimed vs certified per line | ipc.view |

## 2. Conventions (inherit platform standard)

- Auth: JWT; `tenant_id` from token claims only — never from body.
- Errors: RFC 7807 problem+json. Validation errors return field map.
- Pagination: cursor-based, `?cursor=&limit=` (default 100, max 500).
- All mutating endpoints write to Audit Engine via service layer (not optional).
- Idempotency: `POST /payments` and `/certifications` require `Idempotency-Key` header.

## 3. Example — record certification

```http
POST /api/ipcs/7f1c.../certifications
Idempotency-Key: 0d2e...
```
```json
{
  "lines": [
    {
      "ipc_item_id": "a11...",
      "certified_qty": 118.50,
      "certified_value": 23700.00,
      "reason_code": "UNDER_MEASURE",
      "reason_note": "Zone 3 slab area re-measured by PMC",
      "certified_by_name": "Consultant QS - Mr. Dara"
    }
  ],
  "certified_at": "2026-07-03"
}
```
Response `200`:
```json
{
  "ipc_id": "7f1c...",
  "status": "Certified",
  "certified_net": 412350.00,
  "variance_total": -8470.00,
  "retention_recomputed": true
}
```

## 4. Webhook Events (Integration Engine)

| Event | Payload summary |
|---|---|
| ipc.submitted | ipc_id, project_id, net_claim, period |
| ipc.certified | ipc_id, certified_net, variance_total |
| ipc.paid | ipc_id, amount, payment_ref |
