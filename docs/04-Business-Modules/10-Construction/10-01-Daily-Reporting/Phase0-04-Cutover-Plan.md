# Phase 0 — Cut-over Plan: `site_daily_reports` → `daily_report`

Depends on ADR-1 and ADR-2. Nothing here is executed in Phase 0.

## 1. What exists

| Object | Role today |
|---|---|
| `site_daily_reports`, `site_daily_report_activities`, `site_manpower`, `site_equipment`, `site_progress_photos` | Data |
| `sync_daily_report_to_planning()`, `get_daily_report_planning_context()`, `get_task_site_diary_history()` | Planning link |
| `lib/construction/site/daily-report-service.ts`, `daily-report-math.ts`, `public.ts` | Service layer (exposed to other modules through `public.ts`) |
| `components/construction/site/daily-report-editor.tsx`, `site-daily-reports.tsx` | UI |
| `components/planning/plan-activity-site-diary-panel.tsx`, `plan-progress-review-queue.tsx` | Consumers in Planning |
| `app/dashboard/site/daily-reports/page.tsx` | Route |

## 2. Stages

| Stage | Action | Exit check |
|---|---|---|
| S0 | Freeze: no new columns on old tables. Add a deprecation comment to the old service. | — |
| S1 | Phase 1A migrations create new tables. Old UI untouched. | Old reports still work. |
| S2 | Create one `reporting_unit` per project from existing data: one `IN_HOUSE_TEAM` "Main contractor" unit plus one `SUBCONTRACTOR` unit per distinct `site_manpower.contractor` value matched to `subcontracts` (unmatched values listed for a human to map). | Unit list reviewed by PM. |
| S3 | Backfill script, idempotent, per project: for each old report create `daily_report` + version 1 (`ORIGINAL`, channel `IMPORT`, `source_site_report_id` set) with payload built from the old rows. Old `submitted/verified_by_pm/closed` map per mapping doc §3. | Row counts and manpower/quantity totals match old data per project and date. Reconcile report saved. |
| S4 | Backfilled `verified_by_pm`/`closed` reports are treated as approved by the recorded user/time where known; otherwise `approved_by` is left null and flagged `IMPORTED`. They never re-trigger planning sync. | No planning rows changed by backfill (checked by diff). |
| S5 | Per-project switch flag `dr_enabled`. When on: new UI for that project, old route redirects, old submit sync disabled for that project, approval-time sync enabled. | Pilot project runs a full week. |
| S6 | Roll out remaining projects. Planning panels (`plan-activity-site-diary-panel`, review queue provenance) read from a view that unions old and new until all projects are switched. | All projects flagged. |
| S7 | Old tables set read-only (revoke writes, trigger). Old UI and RPCs removed in a later release. **Not dropped.** | Legal/retention sign-off. |

## 3. Risks and handling

| Risk | Handling |
|---|---|
| Old `site_manpower` is keyed by project/date, not by report | Group by date; attach to that date's report; orphans (manpower with no report) become `NO_WORK`-less imported reports flagged `IMPORTED_NO_HEADER`. |
| Duplicate old reports for one date | Old table has no uniqueness. Keep the latest `updated_at` as v1; earlier ones saved as `ORIGINAL`-flagged history in the import log, not as versions. List for PM review. |
| Planning data already derived from old reports | Never recomputed. Provenance links (`progress_review_id`, `productivity_log_id`, `delay_event_id`) remain on old rows. |
| Open (not yet synced) old drafts at switch time | Block the switch for a project until drafts are submitted or discarded. |
| Old open RLS (`USING (true)`) | Fixed only for new tables in 1A. Tightening old tables is a separate security task (see RLS tracker `docs/01-DCOS-Foundation/DCOS-RLS-Security-Remediation-Tracker.md`). |
| Rollback | Per-project flag back to off; new data for that project remains and is not auto-copied back. Document this limit to users. |

## 4. Success criteria

1. Per project, backfilled report count equals old count (minus listed duplicates).
2. Sum of reported manpower and quantity per project per date matches.
3. Zero rows changed in `wbs_tasks`, `plan_productivity_logs`, `delay_register` by the backfill.
4. Planning site-diary panel shows the same history before and after the switch.
