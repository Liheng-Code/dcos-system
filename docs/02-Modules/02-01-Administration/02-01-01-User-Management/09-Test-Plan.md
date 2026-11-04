# 09 — Test Plan
# Module USR — User Management & Account Lifecycle

Document path: docs/04-Business-Modules/02-USR-User-Management/09-Test-Plan.md
Module code: USR
Module number: 02 (DCOS Module Map — Foundation)
Domain: Foundation
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-08-24
Architecture basis: `00-Master.md` §8.3 (Phase 5 QA notes)

---

## 1. Test Scope

This plan covers functional testing for all 11 USR features and their business rules
(`02-Functional-Specification.md`), plus the RLS and trigger regression testing required by the
core-table tightening (`04-Database-Schema.md` §5–§6) and the 90-day auto-disable job (§8).

Out of scope: load/performance testing of the invite/reset email pipeline (Supabase-managed,
outside DCOS's control); MFA (not built in this release).

---

## 2. Unit / Endpoint Tests

### 2.1 Account Creation (F1)

| Test ID | Description | Expected Result |
|---|---|---|
| UT-INV-01 | Admin invites a new user with valid fields | `201`; `profiles.account_status = 'INVITED'`; `account_invited` audit entry written |
| UT-INV-02 | Admin invites with an email already in `auth.users` | `409 USR_EMAIL_EXISTS` |
| UT-INV-03 | Non-admin, non-HR user attempts to invite | `403 Forbidden` |
| UT-INV-04 | Invite payload inspected for a password field | Confirm no password field exists anywhere in the request schema — static/contract test, not just runtime |

### 2.2 Activation-Link Expiry (F2)

| Test ID | Description | Expected Result |
|---|---|---|
| UT-ACT-01 | Staff completes activation within the link's validity window | `account_status` INVITED → ACTIVE; `first_login_at` set; `account_activated` audit entry |
| UT-ACT-02 | Staff attempts activation after the Supabase-managed link expiry | `400 USR_INVALID_TOKEN`; `account_status` remains `INVITED` |
| UT-ACT-03 | Staff attempts to reuse an already-consumed activation link | `400 USR_INVALID_TOKEN` — **verify against live Supabase, don't assume single-use is enforced by DCOS code; confirm it is a Supabase Auth guarantee** |
| UT-ACT-04 | Password submitted at activation fails policy (e.g., 8 chars, no special character) | `400 USR_PASSWORD_POLICY`; `account_status` unchanged |

### 2.3 Reset-Token Single-Use / Expiry (F6, shared mechanism with F2)

| Test ID | Description | Expected Result |
|---|---|---|
| UT-RST-01 | Reset link used once, successfully | Password updated; token subsequently rejected if reused (UT-ACT-03 mechanism) |
| UT-RST-02 | Reset link expiry window | Confirm actual Supabase default expiry value in the deployed project (not assumed from source-spec's suggested "15–30 minutes") — record the actual value in `10-Deployment-Notes.md` once verified |
| UT-RST-03 | Reset completed on an account whose `account_status` was already `ACTIVE` | Password updated; `account_status` unchanged; `password_reset_completed` (not `account_activated`) written |
| UT-RST-04 | Reset completed on an account whose `account_status` is `SUSPENDED`/`DISABLED`/`LOCKED` | Password updated (Supabase-level operation succeeds); `account_status` **unchanged** — account still cannot log in afterward (BR6.06) |

### 2.4 Email-Enumeration-Safe Forgot-Password (F6)

| Test ID | Description | Expected Result |
|---|---|---|
| UT-ENUM-01 | Submit a matching email | `200`; generic message; `resetPasswordForEmail()` called; `password_reset_requested` written |
| UT-ENUM-02 | Submit a non-matching email | `200`; **identical** generic message body to UT-ENUM-01; no email sent; no audit entry written |
| UT-ENUM-03 | Response timing comparison, matched vs. non-matched | Response latency must not be distinguishably different between the two cases (e.g., don't skip a DB round-trip on the non-match path in a way that makes it measurably faster) |
| UT-ENUM-04 | Submit a malformed email (not a valid email shape) | `400` input-validation error — this is the only case allowed to differ, since it discloses nothing about account existence |

### 2.5 Admin-Triggered Status Actions (F3)

| Test ID | Description | Expected Result |
|---|---|---|
| UT-LOCK-01 | Admin locks an `ACTIVE` account | `account_status → LOCKED`; `signOut()` called; `account_locked` written |
| UT-LOCK-02 | Admin unlocks a `LOCKED` account | `account_status → ACTIVE`; no `signOut()` call; `account_unlocked` written |
| UT-LOCK-03 | Admin suspends an `ACTIVE` account | `account_status → SUSPENDED`; `signOut()` called; `account_suspended` written |
| UT-LOCK-04 | Admin disables an account | `account_status → DISABLED`; `signOut()` called; `account_disabled` written |
| UT-LOCK-05 | Admin attempts any status action on their own account | Blocked (`400`/`403` per implementation) |
| UT-LOCK-06 | Non-admin, non-HR attempts any status action | `403 Forbidden` |
| UT-LOCK-07 | Admin locks an `INVITED` account (never activated) | Succeeds; `signOut()` is a no-op (no session existed) |

### 2.6 HR Lifecycle Side Effects (F4)

| Test ID | Description | Expected Result |
|---|---|---|
| UT-HRSE-01 | HR runs `suspend` action | `profiles.status → suspended`; `account_status → SUSPENDED`; `signOut()` called |
| UT-HRSE-02 | HR runs `terminate`/`retire`/`deceased`/`archive` | `account_status → DISABLED`; `signOut()` called |
| UT-HRSE-03 | HR runs `resign` | `account_status → DISABLED`; `signOut()` called — **added to scope per `00-Master.md` §4; verify this was not missed by treating `resign` identically to `terminate` in the implementation** |
| UT-HRSE-04 | HR runs `long_leave` | `account_status → SUSPENDED`; `signOut()` called — **verify `revoke:true` was actually added to this action, since it was not present in the original code** |
| UT-HRSE-05 | HR runs `activate` on an account currently `SUSPENDED` | `account_status → ACTIVE` |
| UT-HRSE-06 | HR runs `activate` on an account currently `DISABLED` | `account_status → ACTIVE` |
| UT-HRSE-07 | HR runs `activate` on an account currently `LOCKED` | `account_status` **remains `LOCKED`** — `profiles.status` still updates normally; this is the critical negative test for BR4.03 |
| UT-HRSE-08 | HR runs `approve`/`submit`/`start_probation` | `account_status` unchanged |

### 2.7 Self-Service Password (F5)

| Test ID | Description | Expected Result |
|---|---|---|
| UT-PWD-01 | Correct current password, valid new password | Password updated; `password_changed_at` updated; other sessions revoked; current session remains valid |
| UT-PWD-02 | Incorrect current password | `400 USR_INVALID_CURRENT_PASSWORD`; no change |
| UT-PWD-03 | New password fails policy | `400 USR_PASSWORD_POLICY` |
| UT-PWD-04 | Session revocation actually takes effect on a live second session, not just new logins | Log in on device A and device B; change password on device A; **verify device B's session is actually rejected on its next request**, not merely blocked from refreshing — this is the same underlying question as the RLS/session verification item below |

### 2.8 Admin Force Reset (F7)

| Test ID | Description | Expected Result |
|---|---|---|
| UT-FRST-01 | Admin force-resets another user | `200`; no password value anywhere in response; `force_reset_triggered` written |
| UT-FRST-02 | Admin attempts force-reset on own account | Blocked — `400 USR_SELF_TARGET` |
| UT-FRST-03 | Non-admin, non-HR attempts force-reset | `403 Forbidden` |

---

## 3. 90-Day Auto-Disable Job Tests (F8)

Per `00-Master.md` §8.3 Phase 5 QA notes — these are explicitly required, not optional additions.

| Test ID | Description | Expected Result |
|---|---|---|
| UT-AUTO-01 | **90-day boundary test** — account `ACTIVE`, `last_login_at` exactly 90 days ago | `[TBD — human to confirm boundary inclusivity: does "more than 90 days" mean `> 90` or `>= 90`? Test both the 89-day-11-hour and 90-day-1-hour cases explicitly to pin down the actual behavior once implemented]` |
| UT-AUTO-02 | Account `ACTIVE`, `last_login_at` 89 days ago | Not disabled — job must not touch this row |
| UT-AUTO-03 | Account `ACTIVE`, `last_login_at` 91 days ago | Disabled; `account_status → DISABLED`; `account_auto_disabled_inactivity` written with `actor_id = NULL` |
| UT-AUTO-04 | **Job only fires on `ACTIVE` accounts** — account `INVITED`, never logged in (`last_login_at IS NULL`), invited 200 days ago | **Not** disabled — must be excluded by the `account_status = 'ACTIVE'` scoping regardless of invite age |
| UT-AUTO-05 | Account `LOCKED`, `last_login_at` 200 days ago | Not disabled — job must not override an existing `LOCKED` state |
| UT-AUTO-06 | Account `SUSPENDED`, `last_login_at` 200 days ago | Not disabled — job must not override an existing `SUSPENDED` state |
| UT-AUTO-07 | Account already `DISABLED`, `last_login_at` 200 days ago | No-op — job does not re-process or duplicate an audit entry for an already-`DISABLED` account |
| UT-AUTO-08 | Run job twice in succession with no new matches | Second run writes zero new audit entries — job is not accidentally re-matching already-`DISABLED` rows |
| UT-AUTO-09 | Reactivation after auto-disable | Auto-disabled account requires explicit Admin unlock/reactivate action; the job itself never re-enables it |
| UT-AUTO-10 | Audit feed rendering | `account_auto_disabled_inactivity` entries with `actor_id = NULL` render as **"System"** in USR-05/USR-06 — not blank, not an error, not the target user's own name |

---

## 4. Integration / RLS Tests

### 4.1 RLS Negative Tests — `profiles`

| Test ID | Description | Expected Result |
|---|---|---|
| IT-RLS-01 | Staff A attempts to `UPDATE` staff B's `full_name` via direct Supabase client | RLS rejects — `id = auth.uid()` fails for staff A on staff B's row |
| IT-RLS-02 | Staff A attempts to `UPDATE` their own `role` via direct Supabase client | RLS `UPDATE` policy allows the row-level write (own row), but the `BEFORE UPDATE` trigger rejects the change — confirms defense-in-depth is real, not theoretical |
| IT-RLS-03 | Staff A attempts to `UPDATE` their own `account_status` via direct Supabase client | Same as IT-RLS-02, for `account_status` specifically |
| IT-RLS-04 | Staff A attempts to `UPDATE` their own non-privileged field (e.g., `phone`) | Succeeds |
| IT-RLS-05 | Admin updates another user's `role` via the admin-client service role | Succeeds — service-role exemption in the trigger confirmed working |
| IT-RLS-06 | Staff A attempts `INSERT` into `profiles` directly | Rejected — no INSERT policy for `authenticated`; only `handle_new_user()` (SECURITY DEFINER) or service-role backend routes may insert |
| IT-RLS-07 | Any authenticated user attempts `DELETE` on a `profiles` row | Rejected — no DELETE policy |
| IT-RLS-08 | Staff A reads staff B's `profiles` row (non-sensitive fields) | Succeeds — SELECT stays broad by design (`04-Database-Schema.md` §5) |

### 4.2 RLS Negative Tests — `roles` / `role_permissions` / `user_roles`

| Test ID | Description | Expected Result |
|---|---|---|
| IT-RLS-09 | Non-admin attempts to `INSERT`/`UPDATE`/`DELETE` on `roles` | Rejected — `is_admin()` fails |
| IT-RLS-10 | Non-admin attempts to `INSERT`/`UPDATE`/`DELETE` on `role_permissions` | Rejected |
| IT-RLS-11 | Non-admin attempts to `INSERT`/`UPDATE`/`DELETE` on `user_roles` | Rejected |
| IT-RLS-12 | Non-admin reads `roles`/`role_permissions`/`user_roles` | Succeeds — SELECT stays broad |
| IT-RLS-13 | Admin performs `INSERT`/`UPDATE`/`DELETE` on all three tables | Succeeds |

### 4.3 RLS Regression — Existing Consumers (per implementation plan Phase 5)

| Test ID | Description | Expected Result |
|---|---|---|
| IT-REG-01 | HR employee list still loads correctly after RLS tightening | No regression — HR list uses the admin-client backend route, unaffected by `authenticated`-role RLS changes |
| IT-REG-02 | RBAC role editor (`role-permissions-page.tsx`) still functions for an admin user | No regression |
| IT-REG-03 | Task assignee pickers / approver dropdowns / WBS ownership displays across other modules | No regression — these depend on broad `profiles` SELECT, confirmed unaffected by §4.1 changes |
| IT-REG-04 | Sidebar's own `isAdmin` check | No regression — still resolves correctly post-tightening |

### 4.4 Session Revocation Verification (per `05-Integration-Specification.md` §4)

| Test ID | Description | Expected Result |
|---|---|---|
| IT-SESS-01 | Suspend/disable an account with a live, in-flight (not-yet-expired) JWT | **Verify against the live Supabase project** whether the existing session's next authenticated request is actually rejected, or only future token refresh is blocked. Record the actual finding — do not assume either outcome. |
| IT-SESS-02 | If IT-SESS-01 shows immediate revocation is not fully satisfied by `signOut()` alone | Flag as a follow-up scope item (shorter JWT expiry or middleware-level `account_status` check) — `[TBD — human to confirm scope if this gap is confirmed]` |

---

## 5. End-to-End Test Scenarios

### E2E-01 — Full Invite-to-Active Lifecycle

1. Admin invites a new staff account.
2. Staff receives activation email, clicks link, sets password.
3. `account_status` INVITED → ACTIVE; staff logs in successfully.
4. Staff changes their own password from their profile.
5. Staff logs out, logs back in with the new password.
6. **Verify:** every step wrote the correct audit entry (`account_invited`, `account_activated`,
   `password_changed`).

### E2E-02 — Admin Security Actions and Recovery

1. Admin suspends the account from E2E-01.
2. Staff attempts to log in — rejected (account not `ACTIVE`).
3. Admin unlocks/reactivates the account.
4. Staff logs in successfully again.
5. **Verify:** `account_suspended` and `account_unlocked` audit entries present; no password was
   touched or reset during this cycle.

### E2E-03 — Forgot Password End-to-End

1. Staff (with an existing `ACTIVE` account) clicks "Forgot password?" from the landing page.
2. Submits their email; receives the generic confirmation message.
3. Receives the reset email; clicks the link; sets a new password.
4. Logs in with the new password.
5. **Verify:** `password_reset_requested` and `password_reset_completed` audit entries present;
   `account_activated` is **not** written (this was not an activation, `account_status` was
   already `ACTIVE`).

### E2E-04 — HR Termination Cascades to Account Lock-Out

1. HR runs `terminate` on an `ACTIVE` staff account.
2. **Verify:** `profiles.status → terminated`; `account_status → DISABLED`; session revoked;
   `employment_status_changed` and `account_disabled` audit entries both present.
3. Terminated staff attempts to log in — rejected.
4. **Verify:** historical records created by the terminated user (tasks, documents, approvals —
   spot-check at least one other module) remain intact and are not deleted or orphaned.

### E2E-05 — 90-Day Auto-Disable

1. Seed an `ACTIVE` test account with `last_login_at` set to 91 days in the past.
2. Trigger the `pg_cron` job manually (or wait for schedule in a staging environment).
3. **Verify:** account is `DISABLED`; audit entry present with `actor_id = NULL`, rendered as
   "System" in USR-06.
4. **Verify:** a sibling `INVITED` test account with no `last_login_at`, created 200 days ago, is
   untouched by the same job run.
