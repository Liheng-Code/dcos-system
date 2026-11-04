# Phase 1B — Delivery Notes (Field App, offline capture and sync)

Date: 2026-10-04. Status: **built, tested, and walked through in a browser on a production build against the local stack. Applied to the local database only. Not committed.**

## 1. What was built

| Area | Files |
|---|---|
| Offline grants, devices, conflicts, quarantine, late evidence | `supabase/migrations/20261004000020_dr_offline_sync.sql` |
| Database tests (51 assertions) | `supabase/tests/dr_offline_sync.test.sql` |
| Server side of sync | `apps/web/lib/construction/daily-reporting/sync-server.ts`, `app/api/dr/sync/{pull,push,evidence,conflicts/[id]/resolve}` |
| On-device store, sync engine, browser client, photo compression | `apps/web/lib/construction/daily-reporting/offline/{store,sync,client,compress}.ts` |
| Sync engine tests (12) | `__tests__/offline-sync.test.ts` |
| Field App screen | `apps/web/app/field/{layout,page}.tsx`, `app/field/manifest.json/route.ts`, `components/construction/daily-reporting/field/field-app.tsx` |
| Form reuse | `dr-report-form.tsx` takes an optional offline data source |
| Approver screens | `dr-conflicts.tsx`; offline banner and flags in `dr-report-view.tsx`, `dr-workspace.tsx` |
| Service worker | `apps/web/public/sw.js` (Field App page and static files cached, network first) |

## 2. How it works

**Field App** is a separate page, `/field`, with its own manifest (installable as "DCOS Field"). It does not use the dashboard shell, so nothing on it needs the network to render.

1. **Online, on opening:** the app calls `POST /api/dr/sync/pull`. The server issues (or extends) an **offline grant** for this device: the user, the device, the units they may report for, valid 72 hours. It returns the form for each unit: scoped activities, rules, schedule, recent reports. All of it is stored in IndexedDB.
2. **Offline:** the user picks a unit and a date and fills the same form as online. Rules run on the device from the cached rule set. Photos are stored on the device. **Save** writes a queue item to IndexedDB, with its own id (the idempotency key), the grant id and the device time.
3. **Back online** (browser "online" event, app brought to the front, a 60-second timer, or **Sync now**): the engine sends items oldest first. For each: the report (`/api/dr/sync/push`), then each photo (signed upload, then `/api/dr/sync/evidence`). Every step is saved on the device before the next, so an interrupted run resumes without sending anything twice.
4. **Review and approval are not in the Field App.** They need a live session in the dashboard.

### What the server does with a pushed report

| Situation | Result |
|---|---|
| No grant ever covered this user, device, unit and time | Refused (403). The report stays on the device, marked "Not accepted". |
| Everything in order | Normal report, awaiting review. `sync_state` EVIDENCE_PENDING until its photos arrive, then SYNCED. |
| Grant or membership revoked since; unit no longer active; rule errors; activity outside scope; future date; device clock ahead | **Stored**, `sync_state` REQUIRES_REVIEW, reasons in `dr_reports.review_flags`. The approver sees a banner and decides as usual. Approval sets it to SYNCED. |
| A report already exists for that unit and date | **Held** in `dr_sync_conflicts` (CONFLICT) with its full content. The reporter or an approver chooses: keep the existing report, or keep the offline one as the next version (an amendment if the existing one was approved). |
| The database cannot store the payload (a value out of range, a reference that does not exist) | **Held** in `dr_sync_conflicts` (QUARANTINE) with the payload and the database error. An approver closes it with a reason; the content remains on file. |

Lateness of an offline report is judged on the time it was written on the device, not the time it synced.

## 3. Verified

| Check | Result |
|---|---|
| Migration applies on the local database | Pass |
| `supabase/tests/dr_offline_sync.test.sql` | 51 assertions pass |
| `supabase/tests/dr_daily_reporting.test.sql` (unchanged behaviour) | 96 assertions pass |
| Sync engine unit tests | 12 pass |
| Whole unit suite | 476 pass, 11 skipped (opt-in integration tests) |
| ESLint | 0 errors |
| Production build (`next build`) | Pass, all routes compiled |

Browser walkthrough on the production build (`next start`, port 3100), headless Chromium, test reporter and test PM:

| # | Step | Result |
|---|---|---|
| 1 | Open `/field` online: forms and grant downloaded | Pass |
| 2 | Network cut. Start a report: activities come from the device cache | Pass |
| 3 | Photo attached and stored on the device | Pass |
| 4 | Save: item shown "Saved on device — not yet sent"; bar shows "Offline · 1 waiting to send" | Pass |
| 5 | **Reload the page with no network**: the app loads from the service worker cache and the queued report is still there | Pass |
| 6 | Starting a second report for the same unit and date is blocked on the device | Pass |
| 7 | Network restored: report sent, photo uploaded, scanned by ClamAV, item shown "Sent" with its report number | Pass |
| 8 | Database: channel FIELD_APP, device time kept, queue age recorded, late flag from device time | Pass |
| 9 | Conflict: while the phone is offline another submission is made for the same date; on reconnect the item shows "Conflict"; **Keep mine as a new version** → version 2, conflict resolved | Pass |
| 10 | Conflict resolved by the PM in the dashboard (**Keep the existing report only**); the Field App then shows "Closed" | Pass |
| 11 | Offline grant revoked while the phone is offline: report still accepted, "Sent — the PM must review it", reason shown; PM sees the banner; approval clears the flag | Pass |
| 12 | Infected file attached online with scanning required: submission stopped with a clear message, file removed, quarantine audited, no report created | Pass |
| 13 | Unfinished draft restored after the form was interrupted | Pass (seen by accident: a failed test run left a draft that reappeared) |

## 4. Not verified, or not done

| Item | Detail |
|---|---|
| **Real phones** | All tests used headless desktop Chromium with network emulation. Not tested on Android or iOS. iOS matters most: no Background Sync, and storage may be evicted for a web app that is not installed. The app asks for persistent storage and warns when it is not granted, and syncs on focus instead of in the background; none of that was seen on a real iPhone. |
| **Offline reload in development mode** | Does not work with `next dev`: the dev runtime waits for its hot-reload socket. It works on a production build. |
| **PIN / biometric unlock** | Not built. The design asks for it; the Field App relies on the device's own lock and on the grant's 72-hour expiry. |
| **Chunked, resumable photo upload** | Not built. Each photo is one signed upload, retried whole. Files are limited to 20 MB. |
| **Background sync** | Not built (React Native, Phase 3). Sync runs while the app is open or brought to the front. |
| **Merging two reports by hand** | The server supports a merged payload (`MERGE`); there is no merge editor. The choices on screen are keep existing or keep the offline one as a new version. |
| **Corrections and amendments offline** | Online only by decision. The Field App writes new reports and No Work reports. |
| **Revoking offline access from the UI** | Function `dr_revoke_offline_access` exists; no admin screen. |
| **Photos orphaned on the device** | A photo removed from a draft before saving stays in IndexedDB. No clean-up yet. |
| **Quarantine path in the browser** | Covered by database tests only. |
| **Long offline periods, large queues, low storage** | Not tested. |

## 5. Observation outside this module

On the production build, opening a dashboard page and reloading it immediately signed the test user out (`auth/v1/user` returned 403 `session_not_found`); a reload after a few seconds did not. It reproduced twice. It looks like the refresh-token rotation (`refresh_token_reuse_interval = 10`) reacting to an interrupted page load, possibly made worse by my running two servers (3000 and 3100) on one cookie. It is in the shared sign-in layer, not in Daily Reporting, and I did not investigate further. For the Field App the consequence is handled: when signed out it keeps the queue and asks the user to sign in.

## 6. Decisions made while building (please confirm)

1. **Grant length 72 hours**, extended on every online check-in; a new grant only when the user's units change. Maximum 168 hours.
2. **Photos follow the report** (design order). A report is visible to the approver before its photos finish uploading, marked "Photos uploading".
3. **A photo the scanner cannot check is retried later, not dropped.** A photo the scanner rejects is dropped and the report still goes in.
4. **Keeping the offline report in a conflict makes it the next version**; if the existing report was already approved, it becomes an amendment awaiting approval and the approved version stays official.
5. **Either the reporter or an approver may resolve a conflict.** Only an approver may close a quarantined report.
6. **The Field App is a second installable app** (`/field`), separate from the attendance app's manifest. The shared service worker was extended; other pages behave as before.

## 7. To deploy

1. Apply `20261004000020_dr_offline_sync.sql` after the 1A migrations.
2. Serve over HTTPS (service workers and persistent storage require it).
3. Tell reporters to open `/field` once while online, then "Add to Home Screen".
4. Environment as for 1A. `CLAMAV_HOST` and `DR_EVIDENCE_SCAN_REQUIRED=true` apply to photos sent from the Field App too.

## 8. Local database note

While developing this migration I dropped and recreated its own new tables twice on the local database to re-apply it (`dr_devices`, `dr_offline_grants`, `dr_version_origins`, `dr_sync_conflicts`, and the column `dr_reports.review_flags`). That removed one test row (the origin record of test report `DR-2026-000003`). No other data was touched. I did not take a fresh dump before doing it, which the project rules ask for before any drop; the automatic two-hourly backups and the dump from before the migration run (`%TEMP%\drlog\local_before_migrations_20261004.dump`) exist.
