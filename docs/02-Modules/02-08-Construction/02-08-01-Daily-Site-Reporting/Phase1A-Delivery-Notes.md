# Phase 1A — Delivery Notes (online core)

Date: 2026-10-04. Status: **built, tested, and walked through in a browser on the local stack. Applied to the local database only. Not committed, not applied to remote.**

## 1. What was built

| Area | Files |
|---|---|
| Schema (34 tables, RLS, immutability triggers, permission and rule seeds, evidence bucket) | `supabase/migrations/20261004000010_dr_core_schema.sql` |
| Write gateway functions, planning sync on approval, summary, schedule job | `supabase/migrations/20261004000011_dr_functions.sql` |
| Legacy import helper (defined, not run) | `supabase/migrations/20261004000012_dr_legacy_backfill.sql` |
| Database tests (92 assertions) | `supabase/tests/dr_daily_reporting.test.sql` |
| Rules engine, correction merge, status labels, payload schema | `apps/web/lib/construction/daily-reporting/{rules,merge,status,types}.ts` |
| Server gateway and submission pipeline | `apps/web/lib/construction/daily-reporting/{server,submission}.ts` |
| Client service | `apps/web/lib/construction/daily-reporting/service.ts` |
| API routes (13) | `apps/web/app/api/dr/**` |
| Screens | `apps/web/components/construction/daily-reporting/*`, `apps/web/app/dashboard/site/daily-reporting/page.tsx` |
| Unit tests (22) and gateway integration test (7, opt-in) | `apps/web/lib/construction/daily-reporting/__tests__/` |
| Wiring | `construction-nav.ts` (new tab; old one renamed "Site Diary (legacy)"), `module-boundaries.mjs`, `.github/CODEOWNERS` |

## 2. How it works

- **One write path.** Clients have no insert/update/delete on any report table. `app/api/dr/*` authenticates the user, runs the rules engine, and calls `dr_*` database functions that only the service role may execute. Each function writes the record, its audit event and its notifications in one transaction.
- **Immutable versions.** `dr_report_versions` and every line table reject UPDATE and DELETE by trigger. A correction or amendment is a new version. Evidence keeps its first hash and server receipt time.
- **Rules.** The same TypeScript engine runs in the form and in the submit route. Errors block and nothing is stored (the attempt is audited). Warnings are stored for the PM. Severity and thresholds are rows in `dr_rule_definitions`; a project row overrides the global one. The database also enforces membership, unit status, future date, WBS scope, duplicates and numeric ranges itself.
- **Review.** Approve, approve with remark, request information, return. A return reopens only the selected items; the server rebuilds the corrected version from the reviewed version plus edits to those items. Verified quantities are stored beside the reported ones with a mandatory remark.
- **Planning sync happens on approval only** and uses the verified quantity. Each delay that lost time must be classified by the approver before it is written to `delay_register`.
- **Summary.** A Live row per project and date is recalculated from approved versions on every submit and decision. Publishing freezes it as the next Official revision and is refused if nothing changed.
- **Missing reports.** `dr_run_schedule()` raises reminders, missing records and escalations (reporter → approver next 09:00 → management on day 2), plus review-overdue and correction-overdue notices. Every notification has a key, so repeated runs send each once.
- **Notifications.** In-app alerts go into `task_alerts` immediately. Telegram DM and email go through `dr_notification_outbox`, delivered after each API write and by the cron route.

## 3. Verified

| Check | Result |
|---|---|
| Migrations apply on the local database (brought to repo head on 2026-10-04) | Pass |
| `supabase/tests/dr_daily_reporting.test.sql` on the local database | 92 assertions pass |
| Unit tests (`rules.test.ts`) | 22 pass |
| Gateway integration test against PostgREST | 7 pass |
| Whole unit suite | 460 pass, 8 skipped |
| ESLint | 0 errors (warnings are pre-existing) |
| TypeScript | No errors in new code (remaining errors are stale `.next/types`) |
| **Browser walkthrough** on the local stack with a test subcontractor reporter and a test PM | Pass, see below |

Browser walkthrough, one report (`DR-2026-000001`) through its whole life:

1. Reporter sees only their unit; activities are pre-filled from the plan.
2. Live rule fires on 140% progress and clears when corrected.
3. Photo upload: signed upload, server content check, SHA-256 stored, thumbnail served by signed URL.
4. Submit with two warnings (missing photo, delay without notice flag); receipt shown.
5. PM inbox shows the report flagged first; checks panel is visible to the PM and not to the reporter.
6. PM returns one activity line with a reason. Reporter sees the request; only that line is editable, the rest is locked.
7. Resubmission creates v2; the changed line is highlighted for the PM.
8. Approval with a verified quantity is refused without a remark, accepted with one.
9. On approval: task progress updated (35% and 10%), productivity log written with the verified 38 m², delay register row `DLY-001` with the PM's classification. Nothing was written before approval.
10. Daily summary shows coverage, verified against reported quantities; publish creates revision 1; a second publish is refused as unchanged.
11. Missing-reports board and Setup screen render with the unit, its reporter, schedule and approver text.

## 4. Not verified, or not done

Updated 2026-10-04 after the completion pass. Full detail: `09-Test-Plan.md`.

| Item | Detail |
|---|---|
| **Telegram and email delivery** | The outbox ran and failed locally with "RESEND_API_KEY and RESEND_FROM must be configured", as expected on this machine. Not tested against the live bot or Resend. |
| **Notification bell link** | Code changed so a Daily Reporting alert opens its report. The shared bell menu would not open under browser automation, so it was not clicked. |
| **Scanning required, through the running app** | ClamAV integration is tested at function level against a real daemon (clean file accepted, EICAR rejected, deleted and audited). The dev server was not restarted with `CLAMAV_HOST`, so the same was not seen through the UI. |
| **Legacy cut-over** | `dr_backfill_project()` is tested on fixtures, never on real data. The old screens are still in place. |
| **Independent review** | Security review was a self-review; findings fixed in `20261004000013` and in the API. No second reviewer. |
| **Real phones** | Headless desktop browser only. |
| **Release switch** | The page is hidden by default; switched on locally through `nav_item_settings`. |
| **Old site tables' and `projects` open RLS** | Unchanged (out of scope). `projects.dr_enabled` is now guarded by a trigger. |
| **Khmer UI; offline; Telegram Mini App; AI** | Later phases. |

Completion pass additions: ClamAV scanner (`scanner.ts`), hardening migration, payload size limits, reporter-only upload, idempotency key limited to its unit, reporter-only action buttons, bell link, 12-document pack.

## 5. Decisions made while building (please confirm)

1. **Segregation of duties:** nobody can approve a version they submitted. A PM who amends a report needs the alternate approver (or an admin) to approve it.
2. **Only a system administrator** can set primary/alternate approvers, so a PM cannot appoint their own alternate.
3. **Empty WBS scope = whole project.**
4. **Unit members are the reporters; project-wide read** goes to approvers and to project members whose role has `construction / daily_reporting` view with a scope other than `own`. Seeded: L0–L5, PE, QS, QA, HSE project-wide; L6, SS, EXT-SUB own unit only.
5. **Recipients:** "management" = project members holding L1 or L2. Delay notices also go to QS. Safety incidents also go to HSE. There is no Contract Administrator role in the role list.
6. **Evidence cannot be removed** by a correction or amendment, only added.
7. **Imported legacy reports** all sit in one `LEGACY` in-house unit per project, because the old model has no unit.
8. **In-app alerts reuse `task_alerts`** instead of a new table, so they appear in the existing bell. Whether the bell opens `metadata.href` was not checked.

## 6. Corrections to earlier Phase 0 statements

- Telegram is **already in the app** for HR: bot, webhook, `initData` verification, account linking (`profiles.telegram_user_id`, `telegram_link_codes`), a Mini App with leave screens. Phase 1C can reuse it; the "session minting" spike in `Phase0-05` is not needed, because the existing Mini App authenticates each request with `Authorization: tma <initData>`.
- `supabase/functions` exists (4 edge functions). A PWA registration component exists (`components/pwa-register.tsx`).
- The `EXT-SUB` role exists, so subcontractor accounts are created through existing User Management (Q5). That flow was not exercised.
- Projects have their own `time_zone`; the schedule uses it by default.

## 7. To deploy

1. Bring the target database to repo head, then apply `20261004000010`, `…011`, `…012` in order.
2. Run `supabase/tests/dr_daily_reporting.test.sql` against a copy first.
3. Environment: `CRON_SECRET` (cron route), `NEXT_PUBLIC_APP_URL` (links in messages), existing `TELEGRAM_BOT_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM`.
4. Schedule `GET /api/dr/cron/tick` every 5–15 minutes with `Authorization: Bearer <CRON_SECRET>`. Without it, Telegram and email for time-based events are only sent when someone next uses the module.
5. Regenerate `database.types.ts` (`pnpm gen:types`).
6. Per project: Setup tab → create units, add reporters, set the schedule, confirm the approver, then switch the project on. For a project with legacy reports, run `select dr_backfill_project('<project id>')` as the service role first and review the result.
