# DCOS — Daily Reporting Module
## 10 — Deployment Notes

| Field | Detail |
|---|---|
| Document Code | DCOS-DR-DEP-001 |
| Version | R1 (as built, Phase 1A) |
| Module | 10-01 — Daily Reporting |
| Status | Issued for Review |

---

## 1. State on 2026-10-04

Applied to the local development database only. Not committed. Not applied to the remote project.

## 2. Prerequisites

| Item | Detail |
|---|---|
| Database at repo head | Migrations up to `20261003000007` applied. The remote history is known to differ from the repo (`supabase/proposed/migration_history_repair.md`); resolve that first. |
| Extensions | `pg_cron` (already used by the inactive-account job) |
| Roles | `EXT-SUB`, `L1`–`L6`, `SS`, `PE`, `QS`, `QA`, `HSE` exist in `roles` |
| ClamAV | A `clamd` daemon reachable from the web server (TCP 3310) |

## 3. Migrations, in order

| File | Content | Reversible |
|---|---|---|
| `20261004000010_dr_core_schema.sql` | Tables, RLS, immutability triggers, helpers, bucket `dr-evidence`, permission and rule seeds, `projects.dr_enabled`, `task_alerts` type check extended | Drop `dr_*` objects; data loss |
| `20261004000011_dr_functions.sql` | Gateway functions, planning links table, pg_cron job `dr_run_schedule` | Drop functions; unschedule job |
| `20261004000012_dr_legacy_backfill.sql` | `dr_backfill_project()` (not executed) | Drop function |
| `20261004000013_dr_hardening.sql` | Project switch guard, schedule validation | Drop triggers |

Run `supabase/tests/dr_daily_reporting.test.sql` on a copy before applying to a shared database. It runs in one transaction and rolls back.

After applying: `notify pgrst, 'reload schema'` and `pnpm gen:types`.

## 4. Environment variables (web server)

| Variable | Purpose | Required |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Gateway calls | Yes (existing) |
| `CRON_SECRET` | Protects `/api/dr/cron/tick` | Yes |
| `NEXT_PUBLIC_APP_URL` | Links in Telegram and email | Recommended |
| `TELEGRAM_BOT_TOKEN` | Telegram DM | For Telegram (existing) |
| `RESEND_API_KEY`, `RESEND_FROM` | Email | For email (existing) |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Malware scanner | Yes in production |
| `DR_EVIDENCE_SCAN_REQUIRED` | `true` = refuse evidence when no scan could be made | Yes in production |

## 5. ClamAV

```bash
docker run -d --name clamav --restart unless-stopped -p 127.0.0.1:3310:3310 clamav/clamav:stable
```

First start downloads signatures (several minutes; about 1 GB memory in use). Do not expose port 3310 publicly. Check: submit a report with the EICAR test file attached; it must be refused and a `DR.EVIDENCE_QUARANTINED` row must appear in `dr_audit_log`.

## 6. Scheduling

| Job | Setup |
|---|---|
| Reminders, missing reports, escalation | Created by migration 011 as pg_cron job `dr_run_schedule` (`*/15 * * * *`). Verify: `select * from cron.job where jobname = 'dr_run_schedule'` and later `cron.job_run_details`. |
| Telegram / email delivery | Call `GET /api/dr/cron/tick` every 5–15 minutes with `Authorization: Bearer <CRON_SECRET>`. Without it, time-based messages are only delivered when someone next uses the module. In-app alerts do not depend on it. |

## 7. Releasing the page

The Construction module is not in `lib/modules/release.ts`, so the page ships hidden. To show it: Administration → Module Settings, switch on **Daily Reporting** and the **Site & Quality** group (rows `/dashboard/site/daily-reporting` and `group:construction:site_quality` in `nav_item_settings`). To release for everyone by default, add them to `release.ts`.

## 8. Per-project go-live

1. Create subcontractor accounts in User Management with role **Subcontractor (EXT-SUB)**; add them to the project.
2. Daily Reporting → Setup: create units, tick WBS scope, add reporters, set status Active and the mobilisation date.
3. Check the schedule (deadline, reminder, working days).
4. A system administrator sets the primary approver if it is not the project's manager, and an alternate.
5. If the project has legacy Site Diary reports: as the service role, `select dr_backfill_project('<project id>')`; review `skipped` and `drafts_not_imported`; reconcile counts.
6. Stop using the legacy Site Diary for that project (it still syncs to planning at submit).
7. Switch the project on.

## 9. Monitoring

| Check | Query |
|---|---|
| Undelivered notifications | `select status, count(*), max(last_error) from dr_notification_outbox group by 1` |
| Job runs | `select status, start_time from cron.job_run_details where command like '%dr_run_schedule%' order by start_time desc limit 5` |
| Planning sync failures | `select * from dr_planning_links where sync_error is not null` |
| Quarantined files | `select * from dr_audit_log where event_code = 'DR.EVIDENCE_QUARANTINED'` |
| Evidence accepted without a scan | `select count(*) from dr_evidence where scan_engine <> 'clamav'` |
| Reviews waiting | `select count(*) from dr_reports where submission_state = 'SUBMITTED' and review_state in ('AWAITING_REVIEW','IN_REVIEW','AMENDMENT_PENDING')` |

## 10. Known limits

- Files uploaded but never submitted stay in the bucket; there is no clean-up job yet.
- The summary is recalculated on each submit and decision; no caching.
- Report versions cannot be deleted. Removing test data requires disabling the immutability triggers as a database owner.
- Open RLS on the legacy `site_*` tables and on `projects` is unchanged.

## 11. Rollback

Switch projects off (`dr_enabled = false`) and hide the page in Module Settings. Leave the tables in place: approved reports have already updated planning, and dropping the tables would remove the evidence behind those updates.
