# DCOS — Daily Reporting Module
## 09 — Test Plan

| Field | Detail |
|---|---|
| Document Code | DCOS-DR-TP-001 |
| Version | R1 (as built, Phase 1A) |
| Module | 10-01 — Daily Reporting |
| Status | Issued for Review |
| Last full run | 2026-10-04, local stack |

---

## 1. Test levels

| Level | What | Where | How to run | Last result |
|---|---|---|---|---|
| Database | Functions, triggers, RLS, constraints | `supabase/tests/dr_daily_reporting.test.sql` | `psql -v ON_ERROR_STOP=1 -f …` (one transaction, rolled back) | 96 assertions pass |
| Unit | Rules, correction merge, labels | `__tests__/rules.test.ts` | `pnpm test` | 22 pass |
| Unit | Scanner protocol and reply parsing | `__tests__/scanner.test.ts` | `pnpm test` | 4 pass |
| Integration | Submission pipeline and RLS through PostgREST | `__tests__/gateway.integration.test.ts` | `DR_IT_REST_URL`, `DR_IT_JWT_SECRET` set; disposable database | 7 pass |
| Integration | Evidence check with real storage and ClamAV | `__tests__/evidence.integration.test.ts` | `DR_IT_SUPABASE_URL`, `DR_IT_SERVICE_KEY`, `DR_IT_UNIT_ID`, `CLAMAV_HOST` set | 3 pass |
| Browser | End-to-end walkthrough | Scripted headless browser, two test users | Manual run | Pass (see §4) |

Integration tests are skipped unless their environment variables are set, so `pnpm test` stays fast and needs no services.

## 2. Database test coverage

| Area | Cases |
|---|---|
| Submit | Number format, initial states, projections, cumulative quantity, evidence row, content hash |
| Idempotency | Replay returns the original receipt and creates nothing |
| Notifications at submit | Review required, safety incident (approver and management), potential delay notice, outbox rows, audit row |
| No early planning write | Progress and delay register untouched before approval |
| Intake invariants | Duplicate, future date, non-member, out-of-scope activity, No Work without reason, progress over 100 |
| Immutability | Version update/delete, line update, evidence hash change, audit delete refused; scan status change allowed |
| RLS | Reporter sees own unit; PM sees project; outsider and other-unit member see nothing; reporter cannot read findings or audit; client cannot insert a report, call a gateway function, join another unit; PM cannot add an approver |
| Review | Non-approver refused; return needs comment and an item; approval blocked until delays classified; open review; return; resubmit creates v2 with v1 intact; carried evidence keeps its hash; stale version refused; verified quantity needs a remark |
| Approval | States, reported quantity kept, verified stored, planning progress, productivity log uses verified quantity, delay register uses the approver's classification, correction closed, reporter notified |
| Segregation of duties | Submitter cannot approve |
| No Work | Replacement needs a reason; creates the next version |
| Summary | Coverage counts, totals exclude pending, verified quantity shown, publish, unchanged refused, reporter refused |
| Amendment | Pending state keeps the old approved version official; approval updates the same productivity log; no duplicate delay; revision 2 supersedes revision 1 |
| Missing | Raised for a silent unit; not for a reporting unit; not for days before a unit existed; idempotent; escalation to level 2; late submission closes it and sets the late flag |
| Legacy import | One imported, duplicate listed, draft left out, approved state and approver kept, delay category mapped, planning untouched, idempotent |
| Hardening | Reporter cannot flip the project switch; PM can; unknown time zone and reminder after deadline refused |

## 3. Unit test coverage (rules)

Complete report passes · required sections · unit-specific sections · scope · unplanned activity · progress, negative values, unit of measure (case-insensitive, fallback to history) · future date and duplicate · inactive unit · evidence minimum as warning and as error · late, low manpower, next-day without manpower · yesterday's plan as the manpower baseline · progress regression with and without a remark · delay without notice flag · No Work · project override and switch-off · item-level merge (line, whole section, removed line, no mutation) · derived labels · coverage sentence.

## 4. Browser walkthrough (2026-10-04)

Environment: local Supabase stack at repo head, dev server, test project `ZZ-DRTEST`, reporter with role EXT-SUB, PM with role L3.

| # | Step | Result |
|---|---|---|
| 1 | Reporter sees only their unit | Pass |
| 2 | Activities pre-filled from the plan | Pass |
| 3 | Live error at 140% progress, cleared when corrected | Pass |
| 4 | Photo upload, server check, thumbnail | Pass |
| 5 | Submit with two warnings; receipt | Pass |
| 6 | PM inbox flagged-first; findings hidden from the reporter | Pass |
| 7 | Return one line; only that line editable; resubmit → v2 highlighted | Pass |
| 8 | Verified quantity refused without remark, accepted with one | Pass |
| 9 | Planning updated on approval with the verified quantity; delay register row | Pass |
| 10 | Summary published; second publish refused | Pass |
| 11 | No Work report; submit blocked without reason; Late and Backdated flags | Pass |
| 12 | Withdraw, then submit again as v2 | Pass |
| 13 | Request information refused without comment; question; answer; back to review | Pass |
| 14 | Amendment refused without reason; sent; approved; revision 2 issued, revision 1 superseded | Pass |
| 15 | Setup: new unit with scope, add reporter, save schedule, switch project on; approver controls hidden from the PM | Pass |
| 16 | Scheduled job raised a missing report; board shows it escalated; excuse with reason | Pass |
| 17 | Notification bell opens the report | **Not verified**: the shared bell menu did not open under automation |

## 5. Not tested

| Item | Reason |
|---|---|
| Telegram DM and email delivery | Local stack has no bot target or Resend key; the outbox recorded the expected "not configured" error |
| `DR_EVIDENCE_SCAN_REQUIRED=true` through the running app | The dev server was not restarted with scanner settings; covered at function level |
| Legacy import on real data | No legacy reports on the local stack |
| Load and concurrency | Not attempted. Concurrent submissions for one unit and date are serialised by an advisory lock and the unique constraint. |
| Real mobile devices | Headless desktop browser only |
| Independent code and security review | Self-review only (see Phase1A-Delivery-Notes) |

## 6. Acceptance before production

1. Database tests pass on a copy of the target database.
2. Both integration suites pass against staging.
3. Walkthrough §4 repeated on two phones (Android, iOS) by a real foreman and a real PM.
4. One real Telegram DM and one real email received for a returned report.
5. EICAR test file rejected through the running application with scanning required.
6. Legacy import reconciled on one project (counts and totals).
