# DCOS — WBS Management Module
## 10 — Deployment Notes

| Field | Detail |
|---|---|
| Document Code | DCOS-WBS-DEP-001 |
| Version | R1 |
| Module | 04-03 — WBS Management |
| Author Persona | DevOps Engineer + Senior System Architect |
| Status | Issued for Review |
| Base References | DCOS-WBS-DB-001, -INT-001, -API-001, -QA-001 |

---

## 1. Deployment Order

**Must be deployed after:** Authentication & RBAC, Company/Tenant, Admin Configuration, Project Setup, Approval Workflow Engine, Notification Engine, Audit Engine.
**Must be deployed before:** Task Management, Document Control, Procurement, Inventory, Construction, QA/QC, HSE, BOQ, IPC, EVM, Equipment, Mobile — every module that stores `wbs_node_id`.

Deploying a consumer before WBS produces records that cannot register links and cannot be validated. This ordering is a hard gate in the release plan, not a preference.

## 2. Migration Plan

| # | Migration | Purpose | Reversible |
|---|---|---|---|
| 001 | `wbs_node_types` | Node type master | Yes (drop, no dependents yet) |
| 002 | `wbs_structure_rules` | Parent/child matrix | Yes |
| 003 | `wbs_nodes` | Core tree (no import FK yet) | Yes **only while empty** |
| 004 | `wbs_closure` | Closure table | Yes |
| 005 | `wbs_code_segments` | Segment config | Yes |
| 006 | `wbs_node_attributes` | Custom attributes | Yes |
| 007 | `wbs_node_responsibilities` | Node ownership | Yes |
| 008 | `wbs_templates`, `wbs_template_nodes` | Template library | Yes |
| 009 | `wbs_baselines`, `wbs_baseline_nodes` | Baselines | Yes |
| 010 | `wbs_change_requests` | Change control | Yes |
| 011 | `wbs_node_links` | Link registry | Yes |
| 012 | `wbs_rollup_cache` | Roll-up cache | Yes (rebuildable) |
| 013 | `wbs_progress_snapshots` | Period snapshots | No — historical evidence |
| 014 | `wbs_import_batches` + `wbs_nodes.import_batch_id` | Import | Yes |
| 015 | Triggers/functions (T1–T4), RLS policies, scope functions | Behaviour | Yes |
| 016 | Seed: node types, 34 structure rules, 3 templates (SEED-WBS-001), default segments | Master data | Yes (idempotent upserts) |

All migrations are forward-only in production; `down` scripts exist for pre-production only.

**Point of no return:** once migration 003 holds live nodes with registered links (i.e. any consumer module has written a `wbs_node_id`), rollback of migrations 003/004/011 is a **data-loss event** and is forbidden. Recovery beyond that point is by restore-from-backup, not by down-migration. This threshold is typically crossed within hours of the first project activation.

## 3. Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `WBS_MAX_DEPTH` | 11 | Max depth excluding root (root=0) |
| `WBS_BREADTH_WARN` | 200 | Soft warning on direct children |
| `WBS_BREADTH_MAX` | 1000 | Hard block |
| `WBS_SUBTREE_OP_MAX` | 1000 | Sync transaction node limit; above → async job |
| `WBS_IMPORT_ROW_MAX` | 5000 | Import row cap |
| `WBS_ROLLUP_WORKER_CONCURRENCY` | 4 | Parallel recalculation workers |
| `WBS_ROLLUP_SWEEP_INTERVAL` | 60s | Stale sweeper cadence |
| `WBS_ROLLUP_STALE_WARN_MIN` | 15 | Age at which consumers must show staleness |
| `WBS_CONTEXT_CACHE_TTL` | 600s | resolve-context cache |
| `WBS_SUBTREE_CACHE_TTL` | 300s | resolve-subtree cache |
| `WBS_RECONCILE_CRON` | `0 2 * * *` | Nightly link reconciliation |
| `WBS_INTEGRITY_CRON` | `30 2 * * *` | Nightly invariant check |
| `WBS_SNAPSHOT_CRON` | `0 1 1 * *` | Period-end snapshot (monthly) |
| `WBS_IMPORT_ROLLBACK_WINDOW_DAYS` | 7 | Self-service rollback window (RBAC C7) |
| `WBS_CR_ESCALATION_HOURS` | 48 | Change request escalation |

## 4. Closure Table Backfill

For any environment with pre-existing adjacency data (pilot tenants migrated from an earlier build):

```sql
-- Per project, batched. Run inside a maintenance window.
INSERT INTO wbs_closure (ancestor_id, descendant_id, depth, project_id, tenant_id)
WITH RECURSIVE adj AS (
  SELECT id AS descendant_id, id AS ancestor_id, 0 AS depth, project_id, tenant_id
  FROM wbs_nodes WHERE project_id = :pid AND deleted_at IS NULL
  UNION ALL
  SELECT a.descendant_id, n.parent_id, a.depth + 1, a.project_id, a.tenant_id
  FROM adj a JOIN wbs_nodes n ON n.id = a.ancestor_id
  WHERE n.parent_id IS NOT NULL)
SELECT ancestor_id, descendant_id, depth, project_id, tenant_id FROM adj
ON CONFLICT DO NOTHING;
```

| Item | Value |
|---|---|
| Batch size | 1 project at a time (≤5,000 nodes) |
| Expected duration | ~8–12 s per 10,000 nodes on the reference instance |
| Verification | Run the closure-vs-adjacency consistency CTE (DB doc §5) — **must return 0 rows** before the project is released to users |
| Rollback | `DELETE FROM wbs_closure WHERE project_id = :pid` and re-run — closure is fully derivable, so backfill is always safely repeatable |
| Gate | No project is marked live until its verification returns 0 |

Roll-up cache is seeded after backfill via a full recalculation per project.

## 5. Feature Flags

| Flag | Phase 1 (MVP) | Phase 2 | Phase 3 | Notes |
|---|---|---|---|---|
| `wbs_core` | ON | ON | ON | Tree, codes, mutation, lifecycle — kill switch only for incident |
| `wbs_drag_drop` | ON | ON | ON | Falls back to menu-based move if disabled |
| `wbs_bulk_import` | ON | ON | ON | Disable to stop volume incidents fast |
| `wbs_templates` | ON | ON | ON | |
| `wbs_baseline_control` | OFF | **ON** | ON | Enable before the first project reaches IPC; enabling mid-project is safe (locks apply from the first baseline set) |
| `wbs_cost_rollup` | OFF | **ON** | ON | Depends on BOQ (No. 29) being live |
| `wbs_change_requests` | OFF | **ON** | ON | Must be ON whenever `wbs_baseline_control` is ON — otherwise locked structures have no legitimate change path. Startup check enforces this pairing and refuses to boot on violation |
| `wbs_snapshots` | OFF | **ON** | ON | Needed by IPC |
| `wbs_mobile_manifest` | OFF | OFF | **ON** | With Module 49 |
| `wbs_planned_dates_mirror` | OFF | **ON** | ON | With Module 23 |

## 6. Background Jobs

| Job | Schedule | Timeout | Failure behaviour | Alert |
|---|---|---|---|---|
| Roll-up recalculation worker | Continuous queue consumer | 5 min/job | Retry ×3 with backoff, then dead-letter | Queue depth >500 or DLQ >0 |
| Stale sweeper | Every 60 s | 30 s | Log and continue | Stale nodes >10% of project for >30 min |
| Link reconciliation | Nightly 02:00 | 30 min | Report partial, alert | Unregistered links > 0 |
| Integrity invariants | Nightly 02:30 | 20 min | Report | Any invariant failure = page |
| Period snapshot | Monthly 01:00 on the 1st | 60 min | Retry once, then page | Missing snapshot for any active project |
| Import batch cleanup | Weekly | 10 min | Log | — |
| Baseline lock audit (locked nodes mutated without CR) | Nightly | 10 min | Report | Any hit = page (indicates a bypass) |

All jobs are **tenant-scoped and project-scoped** — a job runner may never process two tenants in one transaction (Gap §5.2).

## 7. Rollback Plan

| Scenario | Action |
|---|---|
| Bad app release, schema unchanged | Redeploy previous image; no data impact |
| Bad release with additive migration, no live data | Down-migrate in reverse order 016→001 |
| Bad release after live nodes exist | **Do not down-migrate.** Disable the offending feature flag, patch forward. Data loss risk is total for migrations 003/004/011 |
| Bad import (user-level) | `POST /wbs/import-batches/{id}/rollback` — not a deployment action |
| Corrupt closure after a failed move | Rebuild closure for the affected project from adjacency (§4); adjacency is the source of truth |
| Corrupt roll-up | Full recalculation — cache is disposable by design |

## 8. Smoke Tests (post-deploy)

| # | Check | Reference case |
|---|---|---|
| 1 | Activate a scratch project → root created | TC-WBS-STRUCT-001 |
| 2 | Create → rename → move a 3-node subtree | TC-WBS-MOVE-001 |
| 3 | Invariant suite on scratch project returns green | INV-01..11 |
| 4 | Delete guard blocks a linked node | TC-WBS-DELETE-002 |
| 5 | Roll-up computes expected 70.00% on the seeded STR node | TC-WBS-ROLLUP-001 |
| 6 | Cross-tenant probe returns 404 | TC-WBS-SEC-001 |
| 7 | validate-node responds < 120 ms | TC-WBS-PERF-010 |
| 8 | Tree loads < 800 ms on the volume project | TC-WBS-PERF-001 |
| 9 | Audit event present for each smoke mutation | TC-WBS-SEC-111 |
| 10 | Import dry run on the 412-row fixture reports 400/12/0 | TC-WBS-IMPORT-001 |

Failure of checks 3, 4, 6, or 9 = automatic rollback of the app release.

## 9. Monitoring & Alerting

| Metric | Threshold | Runbook |
|---|---|---|
| `wbs_tree_load_p95` | >1 s for 5 min | RB-3 |
| `wbs_validate_node_p95` | >200 ms for 5 min | RB-3 |
| `wbs_rollup_queue_depth` | >500 for 10 min | RB-2 |
| `wbs_rollup_job_failures` | >0 in 15 min | RB-2 |
| `wbs_stale_node_ratio` | >10% for 30 min | RB-2 |
| `wbs_integrity_failures` | >0 | RB-1 |
| `wbs_orphan_count` | >0 | RB-4 |
| `wbs_unregistered_links` | >0 | RB-4 |
| `wbs_cross_project_refs` | >0 | RB-5 |
| `wbs_import_stuck` (COMMITTING >10 min) | >0 | RB-3 |
| `wbs_baseline_bypass` (locked mutation without CR) | >0 | RB-1 + security review |
| DB: closure table row growth | >20× node count | index/partition review |

## 10. Performance Tuning

- Warm `ix_cl_anc`, `ix_cl_desc`, `ix_wbs_children` after major deploys (`pg_prewarm`).
- Recursive/closure queries use a dedicated connection pool (max 20) so tree traffic cannot starve OLTP writes.
- `resolve-context` and `resolve-subtree` caches sized for 50k hot nodes/tenant; eviction LRU.
- Roll-up worker batches ancestor updates per project to avoid lock convoys on `wbs_rollup_cache`.
- `VACUUM ANALYZE wbs_closure` weekly after heavy restructuring periods.

## 11. Backup & Recovery

Aligned to Gap §5.5: **RTO 4 h, RPO 1 h**; hourly incremental, daily full, cross-region; PITR 30 days.

**WBS-specific concern:** a partial restore that recovers `wbs_nodes` without a consistent `wbs_closure` (or vice versa) is worse than no restore — the tree will read correctly in some queries and wrongly in others, silently. Therefore:

1. Restore is always **whole-database, point-in-time**, never table-level.
2. After any restore, run the integrity invariant suite before opening access.
3. If closure is inconsistent post-restore, **truncate and rebuild it from adjacency** (§4) rather than attempting repair — closure is derived data.
4. Roll-up cache is always rebuilt post-restore, never trusted.
5. Restoration drill monthly, with time recorded (Gap §5.5).

## 12. Runbook

**RB-1 — Integrity invariant failure / baseline bypass detected**
1. Freeze structural mutation: set `wbs_core` to read-only mode (flag `wbs_readonly=true`).
2. Identify affected project(s) from the integrity report.
3. If closure-only: rebuild closure for the project (§4), re-verify.
4. If adjacency corrupt (orphans, cycles): restore point-in-time to before the first failing timestamp; replay only audited operations after review.
5. If baseline bypass: treat as a security incident — identify actor from audit, review permission grants, report to Company Admin.
6. Post-incident: add a regression case to doc 09.

**RB-2 — Roll-up job stuck or backlogged**
1. Check DLQ and worker logs; identify poison project.
2. Pause consumer for that project (`wbs_rollup_pause:{project_id}`).
3. Users see staleness badges — this is degraded, not broken; communicate to PM.
4. Fix data cause (commonly a cycle introduced by direct DB edit, or a zero-budget COST_WEIGHTED parent).
5. Resume, run full recalculation for the project, verify values against a hand-checked node.

**RB-3 — Import stuck mid-commit / latency breach**
1. Check batch status; a batch in COMMITTING beyond 10 min has lost its worker.
2. Verify transaction state in DB; an uncommitted transaction has already rolled back — mark batch COMMIT_FAILED and notify the initiator.
3. Never "finish" a partial import by hand; re-run from the file.
4. For latency: check pool saturation, index bloat, and whether a large subtree operation is holding locks; kill long-running structural transactions >120 s.

**RB-4 — Orphaned subtree or unregistered links detected**
1. Orphans: identify parent that was hard-deleted (should be impossible — investigate how RESTRICT was bypassed; likely direct DB access).
2. Re-parent orphans under the project root as a holding node named `RECOVERED-<date>`, notify PM, never delete.
3. Unregistered links: reconciliation job repairs automatically; if the count is large, identify the consuming module skipping the SDK interceptor and raise a defect against that module.

**RB-5 — Cross-project or cross-tenant node reference detected**
1. Treat as **security incident** immediately: capture the offending rows, do not modify.
2. Notify security owner and Company Admin per R0 §24.5 critical rules.
3. Determine whether RLS was bypassed (service role misuse) or a consumer stored a foreign ID.
4. Quarantine affected records; run the full cross-tenant suite (TC-WBS-SEC-001..0NN) before restoring normal access.
5. Post-incident report to tenant owners as required by contract.

## 13. Open Questions

| # | Question |
|---|---|
| OQ-01 | Should `wbs_readonly` mode be a first-class feature flag with UI messaging, or an ops-only toggle? (Recommended: first-class, with a banner.) |
| OQ-02 | Retention of `wbs_import_batches` files — currently indefinite; align with Gap §5.1 tiering in R1.1. |

## 14. Change Log

| Version | Date | Change |
|---|---|---|
| R1 | 2026-08-08 | Initial issue |

**End of Document**
