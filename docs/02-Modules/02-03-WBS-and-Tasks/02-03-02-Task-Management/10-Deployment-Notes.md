# DCOS — Module 04: Task Management
## 10 — Deployment Notes

| Field | Value |
|---|---|
| Document Code | DCOS-M04-DEP-001 |
| Module | 04 — Task Management |
| Version | R1.0 |
| Target Stack | Next.js (Vercel) · NestJS API · PostgreSQL/Supabase · React Native · Redis/BullMQ |

---

## 1. Deployment Overview

```text
┌──────────────┐   ┌───────────────┐   ┌──────────────────┐
│  Web (Vercel)│   │ Mobile (Expo/ │   │ Telegram Bot     │
│  Next.js     │   │ App stores)   │   │ webhook service  │
└──────┬───────┘   └───────┬───────┘   └────────┬─────────┘
       │                   │                    │
       └─────────┬─────────┴────────────────────┘
                 ▼
        ┌────────────────────┐        ┌──────────────────┐
        │  API (NestJS)      │◀──────▶│ Redis + BullMQ   │
        │  task module       │        │ rollup, exports, │
        └─────────┬──────────┘        │ sync, outbox     │
                  │                   └──────────────────┘
                  ▼
        ┌────────────────────┐        ┌──────────────────┐
        │ PostgreSQL         │        │ Object Storage   │
        │ (Supabase, RLS)    │        │ S3/R2 + CDN      │
        └────────────────────┘        └──────────────────┘
```

Task Management deploys as a module inside the modular monolith API. It has no independent runtime in Phase 1. Background work (roll-up recalculation for large trees, bulk generation, exports, outbox delivery, mobile media processing) runs on the shared queue with dedicated queue names so it can be scaled or extracted later without a code rewrite.

---

## 2. Prerequisites

| Dependency | Minimum Version / State |
|---|---|
| PostgreSQL | 15+ with `pgcrypto`, `pg_trgm`, `btree_gin` extensions |
| Modules deployed first | 01 Company/Tenant, 02 User/Role/Permission, 05 Project Setup, 06 WBS Management, 47 Approval Engine, 48 Audit Engine, 46 Notification Engine |
| Object storage | Bucket provisioned with tenant-prefixed paths and lifecycle rules |
| Redis | 7+ for BullMQ queues |
| CDN | Signed-URL delivery configured for attachment downloads |
| Virus scanning | Scanning service reachable from the upload pipeline |

**Hard gate:** do not deploy Task Management before WBS Management and the Audit Engine. Tasks without a WBS parent or without audit capture are unusable and produce data that cannot be corrected retroactively.

---

## 3. Database Migration Sequence

Run in this order. Each migration is idempotent and reversible except where noted.

| # | Migration | Notes |
|---|---|---|
| 001 | `create_task_enums` | All ENUM types |
| 002 | `create_task_config_tables` | `task_types`, `task_hold_reasons`, `task_status_transitions` |
| 003 | `seed_task_config` | Seed 8 task types, 13 hold reasons, transition table per tenant |
| 004 | `create_task_templates` | Templates and template items/dependencies |
| 005 | `create_tasks_table` | Core table, constraints |
| 006 | `create_task_indexes` | All indexes — build `CONCURRENTLY` on any environment with existing data |
| 007 | `create_task_children` | assignments, dependencies, progress logs, status history, holds |
| 008 | `create_task_checklists` | checklists and items |
| 009 | `create_task_resources` | manpower, equipment, material |
| 010 | `create_task_links_comments_attachments` | links, comments, watchers, attachments, tags |
| 011 | `create_task_sync_tables` | sync queue and conflicts |
| 012 | `create_task_functions` | code generation, progress recalc, roll-up, dependency eval, cycle check, status guard, search vector |
| 013 | `create_task_triggers` | Attach all triggers |
| 014 | `create_task_rules` | Append-only rules on `task_progress_logs` |
| 015 | `enable_task_rls` | RLS policies on every module table — **not reversible in production** |
| 016 | `create_task_views` | `v_task_summary`, `v_task_delay_register`, `v_task_productivity`, `mv_wbs_progress` |
| 017 | `create_task_permissions` | Insert permission keys and default role bundles |

### 3.1 Migration Safety Rules

- Index creation on populated tables uses `CREATE INDEX CONCURRENTLY` outside a transaction.
- Never drop a column in a forward migration; deprecate, stop writing, remove in a later release after one full cycle.
- Every migration is tested against a restored production-sized snapshot before release.
- RLS is enabled in the same deployment as the tables — never a follow-up release. A window where tasks exist without RLS is a data-leak window.

### 3.2 Rollback

| Scenario | Action |
|---|---|
| Migration 001–014 fails | Automatic transaction rollback; redeploy after fix |
| Migration 015 (RLS) fails | Halt deployment. Do not proceed with application deployment. Tables without RLS must not receive traffic |
| Post-deploy defect in application code | Roll back the application image; leave the schema in place (schema is additive and backward compatible) |
| Data corruption suspected | Restore from point-in-time recovery; replay outbox events from the last known-good timestamp |

---

## 4. Environment Configuration

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://…` | Primary connection |
| `DATABASE_POOL_MAX` | `20` | Per API instance |
| `REDIS_URL` | `redis://…` | Queue backend |
| `TASK_ROLLUP_ASYNC_THRESHOLD` | `500` | Sibling task count above which roll-up moves to the queue |
| `TASK_BULK_ASYNC_THRESHOLD` | `1000` | Bulk generation async cut-over |
| `TASK_EXPORT_MAX_ROWS` | `50000` | Export ceiling |
| `TASK_DEFAULT_PAGE_SIZE` | `50` | List default |
| `TASK_MAX_PAGE_SIZE` | `200` | Hard cap |
| `TASK_BACKDATE_WINDOW_DAYS` | `7` | Default; overridable per project |
| `TASK_PHOTO_MAX_DIM_CELLULAR` | `1600` | Mobile compression |
| `TASK_ATTACHMENT_MAX_MB` | `20` | Photo/video ceiling |
| `TASK_SYNC_BATCH_MAX_OPS` | `200` | Mobile batch size |
| `TASK_OUTBOX_RETRY_MAX_HOURS` | `24` | Event delivery window |
| `STORAGE_BUCKET_TASKS` | `dcos-task-media` | Media bucket |
| `SIGNED_URL_TTL_SECONDS` | `900` | Download URL lifetime |
| `VIRUS_SCAN_ENDPOINT` | `https://…` | Upload scanning |
| `FEATURE_TASK_BOQ_LINK` | `false` | Phase 2 toggle |
| `FEATURE_TASK_MOBILE_SYNC` | `true` | Mobile sync API |
| `FEATURE_TASK_TELEGRAM_CMDS` | `false` | Inbound bot commands |

Secrets live in the platform secret manager. No secret is ever committed, logged, or written to audit values.

---

## 5. Feature Flags and Rollout

| Flag | Default | Rollout Plan |
|---|---|---|
| `task_module_enabled` | off | Enable per tenant after WBS data is loaded |
| `task_mobile_sync` | off | Enable after the pilot project's devices are enrolled |
| `task_bulk_generate` | off | Enable for PM role after a supervised training session — this flag can create thousands of records |
| `task_dependency_override` | on | Permission-gated; monitored |
| `task_boq_link` | off | Phase 2, with the BOQ Engine |
| `task_telegram_commands` | off | Enable after bot-user linking is verified |
| `task_auto_close` | off | Enable per project once approval discipline is established |

**Rollout sequence per tenant:**

1. Deploy schema and code with `task_module_enabled = off`.
2. Load configuration: task types, hold reasons, templates, numbering pattern, roll-up weighting.
3. Enable for one pilot project and a named user group (PM, one supervisor, three engineers).
4. Run the smoke suite against that project.
5. Two-week pilot; review adoption metrics and defect log.
6. Enable project by project — never for a whole tenant at once.

---

## 6. Background Jobs

| Job | Queue | Schedule | Purpose |
|---|---|---|---|
| `task.rollup.recalc` | `rollup` | On demand (threshold-triggered) | Large-tree progress recalculation |
| `task.rollup.reconcile` | `rollup` | Nightly 02:00 project-local | Full recompute and drift check; alerts on any mismatch |
| `task.overdue.scan` | `scheduler` | Daily 06:00 project-local | Emits `TASK.DUE_TODAY` and `TASK.OVERDUE` |
| `task.hold.ageing` | `scheduler` | Daily 06:15 | Emits `TASK.HOLD_AGEING` beyond threshold |
| `task.escalation` | `scheduler` | Daily 06:30 | Approval and overdue escalation to manager/director |
| `task.recurrence.generate` | `scheduler` | Daily 01:00 | Materialises recurring task instances within the horizon |
| `task.bulk.generate` | `bulk` | On demand | Template bulk creation |
| `task.export` | `export` | On demand | XLSX/CSV generation and signed delivery |
| `task.outbox.dispatch` | `events` | Every 10 s | Domain event delivery with retry |
| `task.media.process` | `media` | On demand | Thumbnail generation, EXIF extraction, virus scan follow-up |
| `task.manhours.aggregate` | `integration` | Nightly 23:30 | HR/cost aggregate publication |
| `task.sync.cleanup` | `maintenance` | Weekly | Purges synced queue rows older than 90 days |
| `mv_wbs_progress.refresh` | `rollup` | Every 5 min (concurrently) | Dashboard view freshness |

**Timezone rule:** scheduled jobs run in the project's local timezone, not server UTC. A 06:00 overdue alert must arrive at 06:00 in Phnom Penh, not at 13:00.

---

## 7. Monitoring and Alerting

| Metric | Threshold | Alert |
|---|---|---|
| API p95 latency (`/tasks` list) | > 2 s for 5 min | Warning |
| API p95 latency (task actions) | > 3 s for 5 min | Warning |
| Error rate (5xx) | > 1% over 5 min | Critical |
| Roll-up job queue depth | > 500 | Warning |
| Roll-up reconciliation drift | Any mismatch | Critical — indicates calculation or transaction bug |
| Outbox undelivered events | > 100 or age > 1 h | Critical |
| Mobile sync failure rate | > 5% of batches | Critical — field data at risk |
| Sync conflicts unresolved | > 20 or age > 48 h | Warning to project admin |
| Attachment virus-scan backlog | > 50 pending | Warning |
| Cross-tenant access attempts | Any | Critical security alert |
| Dependency overrides | > 10/day/project | Warning to PM — signals planning problems, not just system usage |
| Tasks created but never updated after 7 days | > 30% of created | Adoption warning to the project team |

**Dashboards:** API health, queue health, adoption (tasks created/updated/completed per day per project), data quality (tasks without evidence, holds without linked records, progress corrections per user).

---

## 8. Backup and Recovery

| Item | Policy |
|---|---|
| Database full backup | Daily, retained 30 days, separate region |
| Incremental / WAL | Continuous; point-in-time recovery to any moment in the last 30 days |
| Object storage | Versioned; cross-region replication; lifecycle to cold tier per the retention table |
| Recovery Time Objective | 4 hours |
| Recovery Point Objective | 1 hour |
| Restoration test | Monthly, timed, documented |
| Outbox replay | Events retained 7 days to permit consumer replay after restoration |

**Restore procedure for task data specifically:** restore the database to the target timestamp, then replay `task.*` events from the outbox to bring downstream consumers (Planning, QA/QC, cost) back into alignment. Media is restored independently and reconciled by `task_attachments.storage_path`.

---

## 9. Performance Tuning Notes

| Area | Guidance |
|---|---|
| Hot query | `GET /tasks` filtered by project + status + planned_finish — ensure the partial index on incomplete tasks is used; verify no sequential scan on `tasks` |
| Roll-up recursion | Depth is bounded by WBS depth (typically ≤ 7). Guard against runaway recursion with a depth limit of 20 |
| `task_progress_logs` growth | Partition by month once the table exceeds ~10M rows |
| Materialised view | `REFRESH MATERIALIZED VIEW CONCURRENTLY` only; a blocking refresh will stall dashboards |
| Connection pooling | Use PgBouncer in transaction mode; avoid session-level `SET` outside transactions (affects the dependency-override setting — pass it per transaction) |
| N+1 risk | Task list must join assignee, WBS path and flags in one query; never fetch per row |
| Attachment listing | Always paginate; a task with 200 photos must not load all thumbnails at once |

---

## 10. Deployment Checklist

### Pre-Deployment

- [ ] All prerequisite modules deployed and healthy
- [ ] Migrations tested against a production-sized snapshot
- [ ] RLS policies verified with the automated cross-tenant leak test suite
- [ ] Seed configuration prepared per tenant (task types, hold reasons, numbering)
- [ ] Feature flags set to off
- [ ] Rollback plan reviewed and the previous image tagged
- [ ] Maintenance window announced 48 hours in advance if downtime is expected

### Deployment

- [ ] Enable maintenance banner (read-only mode if required)
- [ ] Run migrations 001–017 in order; verify each completes
- [ ] Verify RLS is enabled and forced on every module table
- [ ] Deploy API image; verify `/health` and `/health/db`
- [ ] Deploy web build
- [ ] Register queues and verify worker consumption
- [ ] Submit mobile build to stores (mobile lags web — API must be backward compatible for at least one prior mobile version)
- [ ] Clear maintenance banner

### Post-Deployment

- [ ] Run the production smoke suite (create → approve → close on a disposable test project, then delete the project)
- [ ] Verify audit rows are written for the smoke transactions
- [ ] Verify a test notification is delivered on each active channel
- [ ] Verify the nightly reconciliation job is scheduled and its first run is clean
- [ ] Monitor error rate and latency for 24 hours
- [ ] Enable `task_module_enabled` for the pilot project only
- [ ] Confirm with the pilot PM that the task list loads with correct WBS context

---

## 11. Mobile Release Coordination

| Rule | Detail |
|---|---|
| API compatibility window | The API must support the current and previous two mobile versions. Site users will not update promptly |
| Forced upgrade | Only for security defects or sync-protocol breaking changes; the app shows a blocking screen with an explanation |
| Sync protocol version | Sent in every sync request; the server rejects unsupported versions with a clear upgrade message rather than a generic error |
| Offline data protection | An app update must never clear the local queue. Migration of local storage is tested on every release with a populated queue |
| Store review lag | Plan 3–7 days for iOS/Android review; never gate a server release on store approval |

---

## 12. Known Operational Risks

| Risk | Mitigation |
|---|---|
| Bulk generation creates thousands of unwanted tasks | `dry_run` preview mandatory in the UI; permission-gated; batch is reversible via bulk cancel within 24 hours |
| Roll-up drift between stored and computed progress | Nightly reconciliation with alerting on any mismatch |
| Photo storage cost growth | Compression on upload, thumbnail-first delivery, lifecycle transition to cold storage, per-tenant quota with 80% alert |
| Mobile users on very old devices | Minimum OS documented; graceful degradation for camera and GPS features |
| Overdue notification storm at go-live (historic tasks imported with past dates) | Suppress overdue notifications for the first 48 hours after a data import; log-only mode |
| Approval bottleneck when a manager is on leave | Delegation configured before go-live; escalation rules active from day one |

---

**End of Document — DCOS-M04-DEP-001**
