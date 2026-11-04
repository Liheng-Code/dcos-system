# DCOS — Project Setup Module
## 10 — Deployment Notes

| Field | Detail |
|---|---|
| Document Code | DCOS-PRJ-DEP-001 |
| Version | R1 |
| Module | 04-02 — Project Setup (Foundation Phase) |
| Author Persona | DevOps Lead |
| Status | Issued for Review |
| Depends On | DCOS-PRJ-DB-001, DCOS-PRJ-INT-001, DCOS-PRJ-API-001 |

---

## 1. Deployment Position

Foundation module. Deploys **after** Authentication/RBAC and Admin Configuration, **before** WBS, Task, Document, and Procurement modules — all of which FK `projects.id` and consume the numbering resolver and gate service. A release train that ships a consumer module without this module's matching migration must fail the pipeline dependency check.

## 2. Migration Scripts

Order per DCOS-PRJ-DB-001 §4. Rules:

| Rule | Detail |
|---|---|
| Idempotency | All migrations `IF NOT EXISTS` / guarded; re-run safe |
| One concern per migration | Table, then indexes, then RLS policy as separate files (rollback granularity) |
| Rollback | Every up-migration ships a down-migration; destructive downs (drop table) allowed only pre-GA — post-GA rollback = forward-fix policy |
| Naming | `V{seq}__prj_{description}.sql`, e.g. `V0140__prj_projects.sql` |

Migration set:

```
V0140__prj_projects.sql
V0141__prj_projects_indexes.sql
V0142__prj_projects_rls.sql
V0143__prj_status_history.sql            (+ revoke update/delete)
V0144__prj_calendars_settings.sql
V0145__prj_calendar_holidays.sql
V0146__prj_phases_checklists_items.sql
V0147__prj_team_members.sql              (+ partial unique PM index)
V0148__prj_contracts_revisions.sql
V0149__prj_tenders_bids.sql
V0150__prj_numbering_rules.sql
V0151__prj_seed_reference_data.sql
```

## 3. Seed and Reference Data

`V0151` seeds (idempotent upserts): conversion checklist template `CONVERSION_DEFAULT`, phase gate templates, numbering defaults (DWG/RFI/TRN/PR/PO), tender loss-reason code list. Seeds live in Admin Configuration tables; this migration only runs if Admin module schema present (guard check).

## 4. Environment Variables and Feature Flags

| Key | Purpose | Default |
|---|---|---|
| `PRJ_CODE_PATTERN` | Project code regex | `^P[0-9]{3}$` |
| `PRJ_CONVERSION_TARGET_DAYS` | Mobilisation KPI target (working days) | `10` |
| `FEATURE_TENDER_MODULE` | Toggle tender board & endpoints | `true` |
| `FEATURE_INTERNAL_SHORTCUT` | DRAFT→ACTIVE for INTERNAL | `true` |
| `PRJ_GATE_CACHE_TTL_S` | Gate response cache | `10` |
| `PRJ_CONTEXT_CACHE_TTL_S` | Context cache | `60` |
| `PRJ_NUMBER_RATE_LIMIT` | resolve/min/project | `50` |

Flags evaluated per tenant where the platform flag service supports it.

## 5. RLS Verification Step (Post-Deploy, Automated)

Pipeline stage `verify:rls` runs after every deploy to every environment:

1. Mint JWTs for probe tenants T-A and T-B.
2. For each of the 15 tables: T-B select must return 0 rows of T-A data; T-B insert/update with T-A `tenant_id` must be denied.
3. API probe: `GET /projects/{T-A id}` with T-B token → 404.
4. Any failure → deployment marked failed, automatic rollback of app release (DB stays — RLS failure is app/token config, investigate before schema rollback).

Evidence artifact (JSON report) attached to the release record.

## 6. Zero-Downtime Notes

- **Numbering safety during deploy:** number issuance uses a DB row lock (`FOR UPDATE`), so old and new app versions issuing concurrently cannot duplicate. Do **not** introduce app-level counters — the DB row is the single sequence authority.
- Migrations are additive in this release; no table rewrites → no lock windows beyond DDL instants.
- Rolling deploy: gate and context endpoints are version-stable contracts; consumers tolerate both versions during rollout.
- Maintenance window (platform standard, Sundays 02:00–04:00) not required for this release; reserve it for future column-type changes.

## 7. Monitoring

| Metric | Source | Alert Threshold |
|---|---|---|
| `prj_status_transition_failures` | API 409/5xx on /status | > 5/min warn; 5xx any → page |
| `prj_numbering_contention_ms` | resolve lock wait histogram | p95 > 200 ms warn |
| `prj_numbering_duplicates` | Uniqueness watchdog query (5 min) | > 0 → page immediately |
| `prj_conversion_stalled` | AWARDED age > target days | Daily digest to Director (also a business notification) |
| `prj_gate_latency` / availability | Gate endpoint | p95 > 300 ms warn; availability < 99.9% page |
| `prj_event_dlq_depth` | Event bus DLQ | > 0 warn; > 10 page |
| Health endpoints | `/healthz` (liveness), `/readyz` (DB + admin-template dependency) | Standard |

## 8. Backup / DR Alignment

Per platform policy (Gap Analysis §5.5): RTO 4 h, RPO 1 h — continuous replication + hourly incremental, daily full, separate region. Module-specific note: `project_numbering_rules.next_seq` restored state may lag issued numbers by up to RPO; the post-restore reconciliation job scans consumer tables (documents, RFIs, PRs, POs) for max issued sequence per rule and fast-forwards `next_seq` **before** the API is reopened. This job is part of the DR runbook and the monthly restoration test.

## 9. Rollback Playbook & Smoke Checklist

**Rollback:** app release rollback first (previous image); schema stays (additive). Feature flags allow disabling tender endpoints independently if the fault is isolated there.

**Post-deploy smoke (5 min, scripted):**

- [ ] `/healthz`, `/readyz` green on all instances
- [ ] Create DRAFT project in staging tenant → 201
- [ ] Duplicate code attempt → 409 with suggestion
- [ ] Status TENDER→BID_SUBMITTED on seed project → 200 + history row
- [ ] `resolveNumber` on seed rule → sequential number, < 200 ms
- [ ] Gate check on ON_HOLD seed project → `allowed:false`
- [ ] RLS verify stage report attached
- [ ] One event observed on bus with valid envelope

## 10. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1 | 2026-08 | Initial issue | DevOps Lead |
