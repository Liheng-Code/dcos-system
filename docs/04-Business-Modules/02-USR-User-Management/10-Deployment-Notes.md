# 10 — Deployment Notes
# Module USR — User Management & Account Lifecycle

Document path: docs/04-Business-Modules/02-USR-User-Management/10-Deployment-Notes.md
Module code: USR
Module number: 02 (DCOS Module Map — Foundation)
Domain: Foundation
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-08-24
Architecture basis: `00-Master.md` §8.3

---

## 1. Migration Order

USR migrations must run after:

1. Core auth and profiles tables (`20260526_0001_create_profiles.sql`)
2. `departments` (`20260527000030_create_hr_organization_tables.sql`)
3. `user_audit_logs` (`20260606000002_user_management_gaps.sql`)
4. The current `profiles_status_check` constraint
   (`20260618000001_employee_master_r21_foundation.sql`) — USR's migration must not run before
   this, since the backfill mapping (`04-Database-Schema.md` §2) reads existing `status` values
   that this migration establishes.
5. `20260602000057_enable_rls_core_tables.sql` — the wide-open policies this module's RLS
   migration replaces.

**Suggested migration file sequence** (illustrative naming — `database-engineer` finalises):

```
20260901000001_add_profiles_account_status.sql
20260901000002_backfill_profiles_account_status.sql
20260901000003_add_profiles_department_id.sql
20260901000004_backfill_profiles_department_id.sql
20260901000005_create_is_admin_is_hr_functions.sql
20260901000006_tighten_rls_core_tables.sql
20260901000007_create_profiles_protected_columns_trigger.sql
20260901000008_create_usr_auto_disable_pg_cron_job.sql
```

Each migration is atomic — column addition, backfill, helper functions, RLS policy replacement,
trigger creation, and the `pg_cron` job are separate files so any one step can be rolled back
independently if a problem is found in staging.

---

## 2. Supabase Email Templates

Configure in the Supabase Dashboard → Authentication → Email Templates (not in migration SQL):

| Template | Subject line | Notes |
|---|---|---|
| Invite user | "Your DCOS account has been created" | Must include `{{ .ConfirmationURL }}`. Content per `05-Integration-Specification.md` §2. |
| Reset password | "Reset your DCOS password" | Must include `{{ .ConfirmationURL }}`. Same template serves both routine reset and force-reset (Admin-triggered) — content should not assume which. |

**Redirect URL:** both templates must point to
`{SITE_URL}/reset-password` (not a Supabase-hosted default page). Configure this in Supabase
Dashboard → Authentication → URL Configuration → Redirect URLs, adding both the production and any
staging/preview URLs explicitly (Supabase rejects redirects to URLs not on the allow-list).

**Token expiry:** verify the actual configured expiry window for recovery links in the Supabase
project (Dashboard → Authentication → Email → OTP/Link expiry settings) and record the real value
here once confirmed — do not assume the source spec's suggested "15–30 minutes" without checking
the deployed project's actual setting. `[TBD — human/database-engineer to confirm and record the
actual configured value]`.

---

## 3. SMTP Configuration

DCOS uses Supabase's built-in email sending for both invite and reset emails — no separate SMTP
provider is introduced by this module. If DCOS already has (or later adds) a custom SMTP provider
configured in Supabase Dashboard → Project Settings → Auth → SMTP Settings for deliverability at
scale, both templates in §2 route through it automatically; no code change is required in this
module either way.

---

## 4. `pg_cron` Auto-Disable Job Scheduling

Per `00-Master.md` §8.3 and `04-Database-Schema.md` §8.

**Enablement:** the `pg_cron` extension must be enabled on the Supabase project (Dashboard →
Database → Extensions → `pg_cron`, or via migration `create extension if not exists pg_cron;`).
Confirm the project's plan tier supports `pg_cron` before relying on it — `[TBD — human to confirm
the Supabase plan tier in use supports pg_cron; if not, the fallback is a Vercel Cron Job calling a
dedicated API route that invokes the same `fn_auto_disable_inactive_accounts()` RPC]`.

**Schedule:** daily, `0 2 * * *` (02:00 UTC) — chosen to run during low-traffic hours; adjust to
the organisation's actual low-traffic window if materially different from UTC business hours.

**Monitoring:** `pg_cron`'s own `cron.job_run_details` table records each run's start/end time and
status. Operationally, an Admin should be able to see the job's last successful run — surfaced
either via a query against `cron.job_run_details` in a future ops dashboard, or (minimum viable)
by checking for `account_auto_disabled_inactivity` entries in USR-06 with a recent-enough
timestamp as an indirect health signal. A dedicated job-health widget is `[TBD — human to confirm
if needed in R0]`.

**Idempotency:** the job's `WHERE account_status = 'ACTIVE'` scoping (`04-Database-Schema.md` §8)
makes re-running it safe — an account it already disabled will not match on a subsequent run and
will not generate a duplicate audit entry.

---

## 5. Environment Variables

No new environment variables are required beyond what already exists:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` is used by every admin-facing endpoint in `08-API-Reference.md`
(invite, force-reset, lock/unlock/suspend/disable, list users, dashboard summary) via
`createAdminClient()`. Confirm this key is present in the Vercel environment for all deployment
targets (production and preview) and is never exposed to the client bundle — same discipline as
the existing HR endpoints already using it.

**Site URL for email redirects:** confirm `NEXT_PUBLIC_SITE_URL` (or equivalent existing variable
used elsewhere in this repo for absolute URL construction) is correctly set per environment, since
`/reset-password` redirect URLs (§2 above) must resolve correctly in both production and any
preview/staging deployments.

---

## 6. RLS Deployment Sequencing

The `04-Database-Schema.md` §5–§6 RLS policy replacement and trigger must be deployed together, in
a maintenance window if possible, since the period between "old `USING(true)` policy dropped" and
"new self/admin policy + trigger created" — if these land in separate migrations run out of order —
could produce either a temporary lockout (no policy present at all) or a temporary re-opening (old
policy still present alongside a new one, whichever Postgres evaluates permissively). Use a single
transaction-scoped migration for the drop-and-replace step specifically (§5's policy SQL), even
though the column/backfill/helper-function steps before it can be separate files.

**Before deploying:** confirm in Supabase Dashboard → Authentication that JWTs issued to
`authenticated` users carry the claims `is_admin()`/`is_hr()` depend on (`profiles.role`,
`user_roles.role_code` — both read via table lookups inside the functions, not JWT claims
directly, so this is a lower-risk dependency than a JWT-claims-based design would be, but still
worth a smoke test against a real session before flipping the policies in production).

---

## 7. Seed Data

For development and testing, the database-engineer should provide a seed script creating:

- One `INVITED` test account (never activated) — to verify the auto-disable job correctly ignores
  it regardless of invite age.
- One `ACTIVE` test account with `last_login_at` 91 days in the past — to verify the auto-disable
  job correctly matches it.
- One `ACTIVE` test account with `last_login_at` 89 days in the past — to verify the boundary is
  not over-matched.
- One `LOCKED`, one `SUSPENDED`, one `DISABLED` test account — to verify the job never touches
  them regardless of `last_login_at` age.
- At least one test department (`departments` row) with a matching-by-name `profiles.department`
  text value, and one with a non-matching value — to verify the department backfill's match and
  no-match paths both work as intended.

Seed script location: `supabase/seed/seed_usr_demo.sql`.

---

## 8. Rollback Plan

If the `account_status` migration must be rolled back after deployment but before significant
production use:

1. Drop the `pg_cron` job: `select cron.unschedule('usr_auto_disable_inactive_accounts');`
2. Drop the trigger: `drop trigger if exists trg_guard_profiles_protected_columns on
   public.profiles;`
3. Restore the prior `USING (true)` RLS policies on `profiles`, `roles`, `role_permissions`,
   `user_roles` (re-apply `20260602000057_enable_rls_core_tables.sql`'s policy statements).
4. Drop `is_admin()`/`is_hr()` if no other module has begun depending on them yet (check before
   dropping — per `05-Integration-Specification.md` §3, these are documented as a shared
   dependency other modules may reuse).
5. `alter table public.profiles drop column if exists account_status;` and
   `drop column if exists department_id;` — **data loss warning**: any lock/suspend/disable/invite
   history captured only in `account_status` (not also in `user_audit_logs`) is lost. The audit
   log itself is unaffected by this rollback (it is a separate table), so the historical record of
   *that an action happened* survives even if the live `account_status` column is removed.

**Preferred over rollback once live:** a Supabase point-in-time restore, for the same reason noted
in the Planning-Scheduling module's deployment notes — rolling back a column that other code paths
may have started depending on is riskier than restoring to a known-good point in time.

---

## 9. Feature Flag

Given this module tightens RLS on tables (`profiles`, `roles`, `role_permissions`, `user_roles`)
that essentially every other DCOS module reads from, a feature flag around the **UI surfaces**
(new nav items, invite/security actions) is lower-risk than trying to flag the RLS change itself
— RLS correctness must be verified in staging before it reaches production regardless of any UI
flag, since it affects existing HR/RBAC/dashboard flows immediately upon deployment (see
`09-Test-Plan.md` §4.3 RLS Regression tests).

```typescript
// apps/web/components/dashboard/sidebar.tsx — illustrative
const USR_NAV_ENABLED = process.env.NEXT_PUBLIC_USR_NAV_ENABLED === 'true';
```

Set `NEXT_PUBLIC_USR_NAV_ENABLED=true` once the full RLS regression checklist
(`09-Test-Plan.md` §4.3) passes in staging.
