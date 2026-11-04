# 10 — Deployment Notes
## DCOS Stakeholder Management Module

| Field | Value |
|---|---|
| Document Code | DCOS-STK-DEP-001 |
| Module | Stakeholder Management (Module 04 — Foundation) |
| Version | R1.0 |
| Status | Issued for Review |
| Author Role | DevOps Engineer / Lead Developer |
| Date | 2026-08-08 |
| Related Documents | DCOS-STK-DB-001, DCOS-STK-INT-001, DCOS-STK-API-001, DCOS-STK-TEST-001 |

---

## 1. Deployment Overview

```
                    ┌──────────────┐
   Users ──────────►│  Cloudflare  │  CDN + WAF + signed URL delivery
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │  Vercel      │  Next.js 14 frontend (edge + SSR)
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │  API tier    │  NestJS on VPS/K8s — public + service routes
                    │  (2+ pods)   │  Service routes NOT exposed at the public edge
                    └──────┬───────┘
              ┌────────────┼────────────┬──────────────┐
              ▼            ▼            ▼              ▼
       ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐
       │ Supabase  │ │  Redis   │ │ Supabase │ │  Scheduler  │
       │ PostgreSQL│ │  cache   │ │ Storage  │ │  (tenant-   │
       │ 15 + RLS  │ │ + queue  │ │ + S3     │ │   scoped)   │
       └───────────┘ └──────────┘ └──────────┘ └─────────────┘
```

**Deployment order relative to other modules.** This module depends on Module 02 (Auth & RBAC), Module 05 (Project Setup), and Module 06 (WBS Management). It must be deployed **after** all three and **before** any consuming module that calls the resolution service — Document Control, RFI, Task Management, Procurement, QA/QC.

---

## 2. Environments

| Environment | Purpose | Data | Access |
|---|---|---|---|
| `local` | Developer machines | Seeded fixtures, synthetic only | Developers |
| `dev` | Continuous integration target | Synthetic; reset nightly | Engineering |
| `staging` | UAT and pre-release verification | Anonymised production-shaped data; **no real personal data** | Engineering + business UAT |
| `production` | Live | Real tenant data | Operations only; break-glass audited |

**Data policy.** Production data is never copied to a lower environment. Staging is populated by a generator that produces realistic Cambodian organisation names, Khmer contact names, and realistic WBS shapes without any real personal data. Restoring a production backup into staging to reproduce a bug requires Company Admin sign-off and full anonymisation first.

---

## 3. Prerequisites

| Component | Version | Notes |
|---|---|---|
| Node.js | 20.11 LTS | API and build toolchain |
| pnpm | 9.x | Workspace package manager |
| PostgreSQL | 15.x | Supabase-managed |
| Extensions | `pg_trgm`, `ltree`, `pgcrypto` | Must be enabled before migration 004 |
| Redis | 7.2 | Resolution cache + BullMQ job queue |
| Supabase CLI | 1.180+ | Migration execution |
| Docker | 24+ | Local and K8s images |

**Storage buckets** (created before first deploy):

| Bucket | Purpose | Public | Max Object |
|---|---|---|---|
| `stakeholder-documents` | Compliance certificates | No — signed URLs only | 25 MB |
| `stakeholder-imports` | Bulk import source files | No | 10 MB |
| `stakeholder-exports` | Generated exports | No — signed URLs, 1-hour expiry | 100 MB |

Path convention, enforced server-side and never client-supplied:

```
tenant/{tenant_id}/stakeholders/{stakeholder_id}/{document_id}/{filename}
tenant/{tenant_id}/imports/{import_session_id}/{filename}
tenant/{tenant_id}/exports/{export_job_id}/{filename}
```

---

## 4. Environment Variables

| Variable | Purpose | Secret | dev | staging | production |
|---|---|:--:|---|---|---|
| `DATABASE_URL` | App connection — role `dcos_app` | ✓ | dev pooler | staging pooler | prod pooler, PgBouncer transaction mode |
| `DATABASE_MIGRATION_URL` | Migration role `dcos_migrator` | ✓ | — | — | Direct connection, not pooled |
| `DATABASE_SCHEDULER_URL` | Scheduler role `dcos_scheduler` | ✓ | — | — | Separate pool |
| `SUPABASE_URL` | Project URL | — | dev | staging | prod |
| `SUPABASE_ANON_KEY` | Client-side key | — | dev | staging | prod |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | ✓ | dev | staging | prod |
| `JWT_SECRET` | Token verification | ✓ | dev | staging | rotated quarterly |
| `SERVICE_JWT_SECRET` | Service-to-service auth | ✓ | dev | staging | rotated quarterly |
| `REDIS_URL` | Cache and queue | ✓ | local | managed | managed cluster |
| `STK_CACHE_TTL_SECONDS` | Resolution cache ceiling | — | `900` | `900` | `900` |
| `STK_DUPLICATE_THRESHOLD` | Trigram similarity floor | — | `0.85` | `0.85` | `0.85` |
| `STK_INVITATION_TTL_HOURS` | External invitation validity | — | `168` | `168` | `168` |
| `STK_SIGNED_URL_TTL_SECONDS` | Document download window | — | `900` | `900` | `900` |
| `STK_MAX_DOCUMENT_BYTES` | Upload ceiling | — | `26214400` | `26214400` | `26214400` |
| `STK_REVOCATION_SLA_MINUTES` | Termination revocation window | — | `1` | `60` | `60` |
| `VIRUS_SCAN_URL` | Scanning service endpoint | ✓ | mock | real | real |
| `VIRUS_SCAN_FAIL_MODE` | Behaviour when scanner is down | — | `REJECT` | `REJECT` | `REJECT` |
| `STORAGE_BUCKET_DOCUMENTS` | Bucket name | — | as above | as above | as above |
| `CDN_BASE_URL` | Signed URL host | — | direct | Cloudflare | Cloudflare |
| `SMTP_URL` | Invitation and notification email | ✓ | mailhog | real | real |
| `TELEGRAM_BOT_TOKEN` | Operational alerts | ✓ | mock | real | real |
| `AUDIT_SINK_URL` | Audit engine endpoint | ✓ | local | staging | prod |
| `NOTIFICATION_SINK_URL` | Notification engine endpoint | ✓ | local | staging | prod |
| `SENTRY_DSN` | Error tracking | ✓ | — | staging | prod |
| `LOG_LEVEL` | Verbosity | — | `debug` | `info` | `info` |
| `RATE_LIMIT_PER_TENANT` | Standard endpoints | — | `1000` | `200` | `200` |
| `RATE_LIMIT_RESOLUTION` | Resolution endpoints | — | `10000` | `2000` | `2000` |

`STK_REVOCATION_SLA_MINUTES` is `1` in dev so that TC-STK-EXT-005 completes deterministically in CI rather than waiting an hour.

---

## 5. Database Roles

```sql
-- Application role: no bypass, no destructive grants on append-only tables
CREATE ROLE dcos_app       LOGIN NOINHERIT;
CREATE ROLE dcos_scheduler LOGIN NOINHERIT;
CREATE ROLE dcos_migrator  LOGIN NOINHERIT;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO dcos_app;

-- Append-only enforcement (DCOS-STK-DB-001 §6)
REVOKE UPDATE, DELETE ON stakeholder_status_history        FROM dcos_app;
REVOKE UPDATE, DELETE ON stakeholder_performance_events    FROM dcos_app;
REVOKE DELETE           ON stakeholder_blacklist_records   FROM dcos_app;
REVOKE INSERT, UPDATE, DELETE ON stakeholder_performance_scores FROM dcos_app;

-- Only the scheduler may write computed scores
GRANT INSERT, UPDATE ON stakeholder_performance_scores TO dcos_scheduler;
GRANT SELECT         ON ALL TABLES IN SCHEMA public    TO dcos_scheduler;
GRANT INSERT         ON stakeholder_status_history      TO dcos_scheduler;

-- Hard deletes are impossible for the application in every environment
REVOKE DELETE ON stakeholders, project_stakeholders, stakeholder_contacts FROM dcos_app;
```

`dcos_app` is **not** the table owner. If it were, `FORCE ROW LEVEL SECURITY` would be the only thing standing between a bug and a cross-tenant leak. Separating ownership means two independent controls must fail.

---

## 6. Migration Plan

### 6.1 Forward Order

| # | File | Contents | Rollback Safe |
|---|---|---|---|
| 001 | `001_stk_extensions.sql` | `pg_trgm`, `ltree`, `pgcrypto` | Yes |
| 002 | `002_stk_enums.sql` | 10 enum types | Yes, if unused |
| 003 | `003_stk_functions.sql` | `stk_normalise_name`, `stk_bump_version`, `stk_sync_is_external` | Yes |
| 004 | `004_stk_core_tables.sql` | stakeholders, contacts, addresses, documents | Yes, if empty |
| 005 | `005_stk_reference_tables.sql` | project_roles, document_types, performance_weights | Yes, if empty |
| 006 | `006_stk_assignment_tables.sql` | project_stakeholders | Yes, if empty |
| 007 | `007_stk_scope_tables.sql` | authorities, access_scopes, wbs_scopes, responsibilities | Yes, if empty |
| 008 | `008_stk_history_tables.sql` | status_history, blacklist_records | **No** — data loss |
| 009 | `009_stk_performance_tables.sql` | performance_events, performance_scores | **No** — data loss |
| 010 | `010_stk_user_links.sql` | stakeholder_user_links | **No** — access records |
| 011 | `011_stk_indexes.sql` | All indexes | Yes |
| 012 | `012_stk_rls.sql` | Enable, force, create policies | **NEVER independently** |
| 013 | `013_stk_triggers.sql` | Version, history, activation gate, is_external sync | Yes |
| 014 | `014_stk_views.sql` | Views and materialised view | Yes |
| 015 | `015_stk_grants.sql` | Role grants and revocations | Yes |
| 016 | `016_stk_seed.sql` | Document types, project roles, weights per tenant | Yes |

### 6.2 Execution

```bash
# 1. Verify prerequisites
psql "$DATABASE_MIGRATION_URL" -c "SELECT version();"
psql "$DATABASE_MIGRATION_URL" -c \
  "SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm','ltree','pgcrypto');"

# 2. Backup before any structural change
supabase db dump --db-url "$DATABASE_MIGRATION_URL" \
  -f "backup-pre-stk-$(date +%Y%m%d-%H%M%S).sql"

# 3. Apply migrations in order
supabase migration up --db-url "$DATABASE_MIGRATION_URL"

# 4. Verify RLS BEFORE admitting any traffic (see §7)
psql "$DATABASE_MIGRATION_URL" -f scripts/verify_rls.sql

# 5. Seed reference data per tenant
psql "$DATABASE_MIGRATION_URL" -v tenant="'<tenant-uuid>'" -f 016_stk_seed.sql

# 6. Refresh the materialised view
psql "$DATABASE_APP_URL" -c "REFRESH MATERIALIZED VIEW mv_stakeholder_type_counts;"
```

### 6.3 Rollback Order

Reverse: 016 → 001. **Migration 012 must never be rolled back independently of 004–010.** Dropping RLS while tables hold data is a security regression, not a schema change. If a rollback past 012 is genuinely required, take the API offline first, then roll back 012 and everything above it in one window.

### 6.4 Index Creation on Re-Deploy

Migration 011 uses plain `CREATE INDEX` on first deploy (empty tables, instant). On any subsequent re-run against populated tables, use the concurrent variant to avoid write locks:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stakeholders_name_trgm
  ON stakeholders USING gin (legal_name gin_trgm_ops);
```

`CONCURRENTLY` cannot run inside a transaction block, so these are executed as separate statements outside the migration transaction.

---

## 7. RLS Verification — Deployment Gate

This query must return **zero rows** before any traffic is admitted. A non-empty result blocks the release.

```sql
-- scripts/verify_rls.sql
\set ON_ERROR_STOP on

WITH stk_tables AS (
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM   pg_class c
  JOIN   pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = 'public'
    AND  c.relkind = 'r'
    AND  (c.relname LIKE 'stakeholder%'
          OR c.relname IN ('project_stakeholders','stk_document_types',
                           'stk_performance_weights'))
),
failures AS (
  SELECT relname, 'RLS not enabled' AS problem
  FROM   stk_tables WHERE relrowsecurity = false
  UNION ALL
  SELECT relname, 'RLS not forced'
  FROM   stk_tables WHERE relforcerowsecurity = false
  UNION ALL
  SELECT t.relname, 'No policy defined'
  FROM   stk_tables t
  WHERE  NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = t.oid)
)
SELECT * FROM failures;
```

```bash
ROWS=$(psql "$DATABASE_MIGRATION_URL" -tAc "$(cat scripts/verify_rls.sql)" | wc -l)
if [ "$ROWS" -ne 0 ]; then
  echo "DEPLOYMENT BLOCKED: RLS verification failed"
  psql "$DATABASE_MIGRATION_URL" -f scripts/verify_rls.sql
  exit 1
fi
```

A second gate runs the six tenant-isolation cases from DCOS-STK-TEST-001 §6.13 against the freshly migrated environment. Both gates must pass.

---

## 8. Feature Flags

| Flag | Controls | local | dev | staging | production |
|---|---|:--:|:--:|:--:|:--:|
| `stk_core` | The module itself | on | on | on | on |
| `stk_external_user_provisioning` | FR-STK-045 to 048 | on | on | on | **off at launch** |
| `stk_performance_scoring` | FR-STK-055 to 059 | on | on | on | **off at launch** |
| `stk_bulk_import` | FR-STK-066, 067 | on | on | on | **off at launch** |
| `stk_compliance_auto_suspend` | FR-STK-021 | on | on | on | **off at launch** |
| `stk_authority_delegation` | FR-STK-035 (Phase 3) | on | off | off | off |
| `stk_mobile_directory` | FR-STK-068, 069 | on | on | on | off |

**Launch sequence.** Core ships dark-flagged off for external provisioning, scoring, auto-suspend, and import. These are enabled per tenant once the register is populated and verified. Auto-suspend in particular must not be enabled against a freshly imported register — it would suspend every stakeholder whose legacy compliance dates were never captured, on day one.

---

## 9. Deployment Sequence

```
1.  Announce maintenance window (48 h notice for production)
2.  Verify Modules 02, 05, 06 are deployed and healthy
3.  Take a full database backup
4.  Create storage buckets and apply bucket policies
5.  Apply migrations 001–016
6.  Run RLS verification gate            ← BLOCKING
7.  Run tenant-isolation test suite      ← BLOCKING
8.  Seed reference data per tenant
9.  Deploy API tier (rolling, 2 pods minimum, health-gated)
10. Verify service routes are NOT reachable from the public edge
11. Deploy scheduler with tenant-scoped job registration
12. Deploy frontend to Vercel
13. Warm the resolution cache for active projects
14. Run the 12-point smoke test          ← BLOCKING
15. Enable stk_core for pilot tenants
16. Monitor for 24 h before wider enablement
17. Sign-off and close the window
```

---

## 10. Zero-Downtime Strategy

For subsequent releases against a populated database:

| Phase | Action | Rule |
|---|---|---|
| 1 | Additive migration only | New nullable columns, new tables, new indexes `CONCURRENTLY`. No drops, no renames, no `NOT NULL` on existing columns. |
| 2 | Deploy code that writes both old and new shapes | Backward compatible with the previous release still running |
| 3 | Backfill | Batched, tenant-scoped, throttled; monitored for replication lag |
| 4 | Deploy code that reads the new shape | |
| 5 | Enforce constraints | `NOT NULL`, CHECK, unique — only after backfill verification |
| 6 | Drop the old shape | Minimum one release later, never in the same deploy |

Renaming a column is three releases, not one. The temptation to do it in a single deploy is the most common cause of a failed rolling update.

---

## 11. Legacy Data Migration

For tenants arriving with spreadsheet registers.

```
1. Export the legacy directory to the DCOS import template
2. Upload via POST /stakeholders/import/validate      (DRY RUN — no writes)
3. Review the validation report:
     ready / matches existing / internal duplicates / invalid / blacklist-blocked
4. Correct the source file; re-run the dry run until only intended rows remain
5. Commit via POST /stakeholders/import/commit
     → all rows land in DRAFT, never ACTIVE
6. Download the reconciliation report and retain it as a migration record
7. Verify each record individually through the registration approval flow
8. Only then enable stk_compliance_auto_suspend for that tenant
```

Step 8 is not optional sequencing. Enabling auto-suspend before verification would suspend the entire imported register, because legacy spreadsheets rarely carry accurate certificate expiry dates.

---

## 12. Smoke Test Checklist

All twelve must pass before the window closes. Approximately 8 minutes.

| # | Check | Command / Action | Expected |
|---|---|---|---|
| 1 | API health | `GET /health` | 200, `{"status":"ok","module":"stk"}` |
| 2 | Database connectivity | `GET /health/db` | 200, migration version `016` |
| 3 | RLS active | Run `verify_rls.sql` | Zero rows |
| 4 | Cross-tenant blocked | `GET /stakeholders/{beta-id}` with an alpha JWT | 404, `CRITICAL` audit written |
| 5 | Register loads | `GET /stakeholders?limit=10` | 200, correct tenant rows only |
| 6 | Type counts | Compare panel counts to a direct DB count | Exact match |
| 7 | Create and duplicate check | `POST /stakeholders/duplicate-check` with a known duplicate | 200, `FUZZY_MATCH`, candidate returned |
| 8 | Assignment gate | `POST /stakeholder-assignments/{id}/activate` with no authority | 422 `ASSIGNMENT_NO_AUTHORITY` with `readiness` |
| 9 | Resolution — success | `POST /stakeholder-resolution/approvers` on a configured project | 200, ordered approvers with snapshots |
| 10 | Resolution — zero approver | Same on an unconfigured WBS branch | 422 `NO_ELIGIBLE_APPROVER`, diagnostics, `CRITICAL` notification, **not cached** |
| 11 | Document upload and signed URL | Upload a small PDF; request the download URL | Stored, scanned clean, signed URL with 15-minute expiry, no direct bucket path |
| 12 | Audit sink reachable | Perform any write; query the audit engine | Entry present with correlation ID and role snapshot |

Check 10 is the single most important smoke test in this module. It verifies the behaviour that separates a working authority system from a dangerous one.

---

## 13. Rollback Procedure

### 13.1 Triggers

| Condition | Action |
|---|---|
| RLS verification fails | Block deployment — no rollback needed, nothing was admitted |
| Any tenant-isolation test fails post-deploy | **Immediate rollback.** No investigation first. |
| Resolution service returns incorrect approvers | **Immediate rollback** — silent authority failure |
| Resolution service unavailable, blocking approvals platform-wide | Rollback API tier; see §13.3 |
| Register load or search degraded beyond targets | Investigate first; roll back if unresolved within 30 minutes |
| Cosmetic or single-screen defect | Fix forward |

### 13.2 Steps

```bash
# 1. Disable the module for all tenants (fastest mitigation, no data change)
curl -X POST "$FLAG_API/flags/stk_core" -d '{"enabled": false}'

# 2. Roll back the API tier to the previous image
kubectl rollout undo deployment/dcos-api -n production

# 3. Roll back the frontend
vercel rollback <previous-deployment-url>

# 4. Only if the schema is implicated — take the API offline first
kubectl scale deployment/dcos-api --replicas=0 -n production
supabase migration down --db-url "$DATABASE_MIGRATION_URL" --to 011
```

### 13.3 Resolution Service Degradation

If the resolution service is failing but the rest of the platform is healthy, **do not** disable it and let workflows proceed. Consuming modules are built to fail closed (DCOS-STK-INT-001 §7): with the service unavailable they queue work and inform users. That is the correct degraded state.

The dangerous mitigation — bypassing resolution so that approvals can continue — must never be applied. An unavailable authority service becoming an implicit grant of authority is the exact failure this architecture exists to prevent.

### 13.4 Point of No Return

Once external users have accepted invitations and logged in, rolling back migration 010 destroys their links. From that point, rollback is API-tier only; schema rollback requires a restore from backup with the associated data loss window, and Company Admin sign-off.

---

## 14. Scheduled Jobs

All jobs are **tenant-scoped by construction**. A job that starts without a tenant scope is rejected at start-up — this is verified by TC-STK-TEN-006 and is a CI gate.

| Job | Schedule | Timeout | Failure Handling |
|---|---|---|---|
| `stk:compliance-expiry-scan` | Daily 02:00 tenant-local | 5 min/tenant | Retry ×3, then ops alert. **Never silently skips a tenant** — a skipped tenant is reported explicitly. |
| `stk:performance-score-compute` | Daily 02:30 | 15 min/tenant | Retry ×2; stale scores display their computation timestamp with a staleness warning rather than a wrong number |
| `stk:external-user-reconciliation` | Hourly | 2 min/tenant | Revokes orphaned links; each orphan produces a `HIGH` audit entry |
| `stk:delegation-expiry` | Daily 00:15 | 1 min/tenant | Lapses expired delegations; no auto-renewal |
| `stk:type-count-refresh` | Every 60 s | 10 s | `REFRESH MATERIALIZED VIEW CONCURRENTLY`; failure is non-blocking, counts go stale |
| `stk:cache-warm` | Every 15 min | 5 min | Pre-resolves hot project/module combinations |
| `stk:orphaned-assignment-report` | Weekly Monday 06:00 | 10 min | Reports assignments whose stakeholder is no longer `ACTIVE` |
| `stk:export-cleanup` | Daily 04:00 | 5 min | Deletes export objects older than 7 days |

```typescript
// Tenant scoping is structural, not conventional
export async function runTenantScopedJob(jobName: string, fn: JobFn) {
  const tenants = await listActiveTenants();
  const failures: string[] = [];

  for (const tenant of tenants) {
    try {
      await withTenantContext(tenant.id, async (ctx) => {
        // ctx sets app.tenant_id; every query inside is RLS-filtered
        await fn(ctx);
      });
    } catch (err) {
      failures.push(tenant.id);
      logger.error({ jobName, tenantId: tenant.id, err }, 'tenant job failed');
    }
  }

  if (failures.length > 0) {
    // Explicit, never silent
    await raiseOpsAlert(`${jobName} failed for ${failures.length} tenant(s)`, failures);
  }
}
```

---

## 15. Monitoring and Alerting

### 15.1 Metrics

| Metric | Type | Alert Threshold | Severity |
|---|---|---|---|
| `stk_resolution_latency_p95` | Histogram | > 200 ms for 5 min | High |
| `stk_resolution_zero_approver_total` | Counter | > 5 per hour per tenant | **Critical** |
| `stk_resolution_cache_hit_ratio` | Gauge | < 0.7 for 15 min | Medium |
| `stk_resolution_unavailable_total` | Counter | > 0 | **Critical** |
| `stk_access_denied_total{cross_tenant="true"}` | Counter | **> 0** | **Critical** |
| `stk_access_denied_total{external="true"}` | Counter | > 5 per user per 10 min | High |
| `stk_audit_write_failure_total` | Counter | > 0 | **Critical** |
| `stk_cache_invalidation_failure_total` | Counter | > 0 | High |
| `stk_external_user_orphan_total` | Counter | > 0 | High |
| `stk_compliance_expired_mandatory_total` | Gauge | > 0 | High |
| `stk_assignment_activation_gate_failures` | Counter | Informational | — |
| `stk_register_search_latency_p95` | Histogram | > 300 ms | Medium |
| `stk_scheduled_job_tenant_skipped_total` | Counter | > 0 | High |

### 15.2 Alert Routing

| Severity | Channel | Response |
|---|---|---|
| Critical | PagerDuty + Telegram ops channel | 15 minutes, 24/7 |
| High | Slack `#dcos-alerts` + email | Next business hour |
| Medium | Slack `#dcos-alerts` | Same business day |

**`stk_access_denied_total{cross_tenant="true"} > 0` pages immediately regardless of hour.** A single cross-tenant denial is either an attack or a defect in isolation. Both warrant waking somebody.

### 15.3 Log Queries

```sql
-- Zero-approver events in the last 24 hours, by project
SELECT project_id, module_code, entity_type, count(*)
FROM   audit_logs
WHERE  action_type = 'STK.RESOLUTION.NO_APPROVER'
  AND  created_at > now() - interval '24 hours'
GROUP  BY 1,2,3 ORDER BY 4 DESC;

-- External access denials clustered by user (probing detection)
SELECT user_id, count(*), min(created_at), max(created_at)
FROM   audit_logs
WHERE  action_type = 'STK.ACCESS.DENIED'
  AND  created_at > now() - interval '1 hour'
GROUP  BY 1 HAVING count(*) >= 5;

-- Any cross-tenant attempt, ever
SELECT * FROM audit_logs
WHERE  action_type = 'STK.ACCESS.DENIED' AND severity = 'CRITICAL'
ORDER  BY created_at DESC;
```

### 15.4 Log Hygiene

Application logs must never contain: JWTs, signed URLs, `SUPABASE_SERVICE_ROLE_KEY`, blacklist `reason_text`, contact email or phone numbers, or invitation tokens. Verified by SEC-14 in the security suite.

---

## 16. Backup and Recovery

| Aspect | Target | Implementation |
|---|---|---|
| RPO | 1 hour | Continuous WAL archiving + hourly incremental |
| RTO | 4 hours | Automated failover to standby region |
| Full backup | Daily 01:00 UTC | Retained 30 days |
| Point-in-time recovery | 30 days | Supabase PITR |
| Storage objects | Daily snapshot to a separate region | 90-day retention |
| Restoration test | Monthly | Full restore to an isolated environment, time recorded |
| Backup verification | Every backup | Checksum plus a row-count sanity check |

**Restore verification must include the RLS gate.** A restored database with RLS disabled is worse than no restore — it looks healthy and leaks silently.

---

## 17. Security Hardening Checklist

| # | Check | Verification |
|---|---|---|
| 1 | RLS enabled and forced on all 18 tables | `verify_rls.sql` returns zero rows |
| 2 | Every table has at least one policy | Included in `verify_rls.sql` |
| 3 | `dcos_app` is not the table owner | `SELECT tableowner FROM pg_tables WHERE tablename LIKE 'stakeholder%'` |
| 4 | Append-only grants revoked | `\dp stakeholder_status_history` shows no UPDATE/DELETE for `dcos_app` |
| 5 | Performance score writes limited to `dcos_scheduler` | `\dp stakeholder_performance_scores` |
| 6 | Service-role key absent from client bundles | Static scan of the Vercel build output |
| 7 | Service routes unreachable from the public edge | External curl to `/stakeholder-resolution/*` → connection refused |
| 8 | Signed URLs only; no public bucket read | Bucket policy audit |
| 9 | Virus scanning fails closed | `VIRUS_SCAN_FAIL_MODE=REJECT` in all environments |
| 10 | Rate limits derived from the JWT claim, not headers | SEC-11 |
| 11 | TLS 1.3 enforced; HSTS enabled | SSL Labs A+ |
| 12 | Secrets in the vault, never in the repository | `gitleaks` scan clean |
| 13 | Tenant-isolation suite passing | CI gate, every build |
| 14 | Audit sink reachable and writes failing closed | Smoke check 12 |

---

## 18. Post-Deployment Verification

| Window | Check | Owner |
|---|---|---|
| T+0 | 12-point smoke test | DevOps |
| T+15 min | Error rate below baseline; no Critical alerts | DevOps |
| T+1 h | Resolution latency and cache hit ratio within targets | DevOps |
| T+4 h | First scheduled job cycle completed for all tenants with no skips | DevOps |
| T+24 h | Zero cross-tenant denials; zero audit write failures; zero unexplained zero-approver events | Lead Developer |
| T+48 h | Business verification: a Document Controller and a Project Manager confirm normal operation | Business owner |
| T+7 days | Performance trend review; flag enablement decision for deferred features | Lead Developer + Company Admin |

**Sign-off required from:** Lead Developer (technical), DevOps (operational), Company Admin (business), Security owner (isolation gates).

---

## 19. Open Questions

| ID | Question | Impact |
|---|---|---|
| Q-37 | Should `stk_compliance_auto_suspend` default off permanently per tenant, or auto-enable 30 days after import verification completes? | Onboarding automation |
| Q-38 | Is a 60-minute revocation SLA achievable with hourly reconciliation, or is a 15-minute job needed in production? | Job schedule vs cost |
| Q-39 | Should cache warming target all active projects, or only those with activity in the last 7 days? | Redis memory footprint |
| Q-40 | Does PgBouncer transaction-mode pooling interfere with transaction-local `set_config` for `app.tenant_id`? Must be verified explicitly before production. | **Blocking — verify before launch** |

Q-40 is the most consequential open item in this document. Transaction-mode pooling and session-scoped settings interact badly; the module uses transaction-local `set_config` specifically to be safe under pooling, but this must be proven under load, not assumed.

---

## 20. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1.0 | 2026-08-08 | Initial issue — migration plan, RLS gate, feature flags, jobs, monitoring, rollback | DevOps Engineer |

---

**End of Document**
