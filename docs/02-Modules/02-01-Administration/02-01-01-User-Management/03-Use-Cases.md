# 03 — Use Cases
# Module USR — User Management & Account Lifecycle

Document path: docs/04-Business-Modules/02-USR-User-Management/03-Use-Cases.md
Module code: USR
Module number: 02 (DCOS Module Map — Foundation)
Domain: Foundation
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-08-24

---

## Overview

This document defines the primary use cases for Module USR. Each use case describes one actor
performing one primary scenario, with alternate paths for rejection, error, and guard conditions.
Business rule references (BR n.nn) are cross-referenced to `02-Functional-Specification.md`.

Actors covered: System Administrator, HR Manager, Staff Member, System (scheduled job).

---

## UC01 — Admin Creates a Staff Account (Invite Flow)

**Actor:** System Administrator (or HR, per role union)
**Feature:** F1 — Account Creation by Invitation
**Precondition:** The acting user is authenticated and holds `admin` or an `HR_ROLE_CODES` role.

**Trigger:** Admin selects "New User" on the User Management screen (`/dashboard/administration/users`).

### Main Flow

1. Admin fills in identity fields: full name, email, employee ID (if applicable), phone,
   department (selected from `departments` via `department_id`, BR — see `04-Database-Schema.md`),
   position.
2. Admin selects access fields: role, and any RBAC role assignment. **No password field is shown
   anywhere in this form** (BR1.01).
3. Admin submits. System calls `auth.admin.inviteUserByEmail(email)`.
4. System creates/updates the `profiles` row: identity fields populated, `account_status =
   'INVITED'` (BR1.02).
5. System writes `account_invited` to `user_audit_logs`, `actor_id` = Admin's id (BR1.04).
6. Supabase sends the activation email to the new user containing a recovery-type link.
7. Admin sees the new user in the User Management list with an `INVITED` status badge.

### Alternate Path A — Email Already Exists

At step 3, Supabase Auth rejects the invite because the email is already registered. System
returns `409 USR_EMAIL_EXISTS` (BR1.06). Admin is shown: "An account already exists for this
email address." Admin may search the existing user instead of creating a duplicate.

### Alternate Path B — Non-Admin Attempts to Create a User

Rejected at authorization: `403 Forbidden`. The "New User" action is not shown to non-Admin/HR
users in the UI (`07-RBAC-Matrix.md`), and the endpoint independently enforces this server-side.

---

## UC02 — Staff Activates Account (First-Time Password Set)

**Actor:** Staff member (the newly invited user)
**Feature:** F2 — Account Activation
**Precondition:** An `INVITED` account exists; the staff member has received the activation email.

**Trigger:** Staff member clicks the activation link in the email.

### Main Flow

1. Link opens `/reset-password` (or an activation-specific route rendering the same form — see
   `06-UI-UX-Design.md`) with the Supabase recovery token in the URL.
2. Staff member enters a new password and confirms it. Password policy is validated client-side
   and re-validated server-side (BR5.02, shared Zod schema).
3. Staff member submits. System validates the Supabase recovery token, sets the new password.
4. System detects `account_status = 'INVITED'` for this account and flips it to `ACTIVE`
   (BR2.02). `first_login_at` is set to `now()` (BR2.03).
5. System writes `account_activated` to `user_audit_logs`, `actor_id = user_id` (self) (BR2.04).
6. Staff member is redirected to login (or auto-signed-in, per the chosen UX — see
   `06-UI-UX-Design.md`) and reaches the dashboard.

### Alternate Path A — Link Expired or Already Used

At step 3, Supabase Auth rejects the token. System shows: "This link has expired or already been
used. Request a new one." (BR2.05) with a link to the forgot-password flow (which will also
correctly detect the still-`INVITED` status and re-send an activation-equivalent reset link).

### Alternate Path B — Password Does Not Meet Policy

At step 2, client and server both reject a password under 12 characters or missing a required
character class (BR5.02). Staff member is shown the specific unmet requirement(s).

---

## UC03 — Staff Changes Own Password

**Actor:** Staff member
**Feature:** F5 — Self-Service Password Management
**Precondition:** Staff member has an active session and `account_status = 'ACTIVE'`.

**Trigger:** Staff member navigates to their profile/security section and selects "Change
Password."

### Main Flow

1. Staff member enters current password, new password, confirm new password.
2. System validates the current password against the account (BR5.01).
3. System validates the new password against policy (BR5.02).
4. System updates the password, sets `password_changed_at = now()` (BR5.03).
5. System writes `password_changed` to `user_audit_logs`, `actor_id = user_id` (BR5.03).
6. System invalidates all other active sessions for this user (`auth.admin.signOut`, BR5.03),
   keeping only the current session that just performed the change.
7. Staff member sees a success confirmation.

### Alternate Path A — Current Password Incorrect

At step 2, rejected with `400 USR_INVALID_CURRENT_PASSWORD`. No session is affected, no audit
event beyond a normal failed-attempt log (if any is added by Supabase Auth itself — this module
does not add a separate `login_attempts` table, BR3.06).

### Alternate Path B — New Password Same as Current

Rejected client- and server-side with a clear message; not a security-critical rule, a usability
one — `[TBD — human to confirm whether this check is required or optional for R0]`.

---

## UC04 — Staff Forgets Password

**Actor:** Staff member (may be unauthenticated)
**Feature:** F6 — Forgot Password / Self-Service Reset
**Precondition:** None — this flow is reachable without a session, from the landing page's
"Forgot password?" link.

**Trigger:** Staff member clicks "Forgot password?" and enters their email.

### Main Flow

1. Staff member submits their email on `/forgot-password`.
2. System checks for a matching account. Regardless of the result, the response shown to the
   staff member is identical: *"If an account exists for this email, a password reset link has
   been sent."* (BR6.01).
3. If a match exists: system calls `resetPasswordForEmail()`, sends the reset email, and writes
   `password_reset_requested` to `user_audit_logs` (BR6.02, BR6.05).
4. If no match exists: no email is sent, no audit event is written (there is no `user_id` to
   attach it to) — the generic response is still shown (BR6.01).
5. Staff member (if a real account) receives the email, clicks the link, and completes the same
   flow as UC02 steps 2–6 (BR6.03–BR6.04).
6. System writes `password_reset_completed` on successful completion (BR6.05).

### Alternate Path A — Account Is Suspended/Disabled/Locked

At step 5, the reset link still works and the password is still set (Supabase-level operation is
independent of `account_status`) — but `account_status` is **not** changed by this flow unless it
was `INVITED` (BR6.04, BR6.06). The staff member still cannot log in afterward if the account was
`SUSPENDED`/`DISABLED`/`LOCKED`; they see the normal "account not active" message on login attempt.
This is intentional — a password reset is never a backdoor around an Admin decision.

---

## UC05 — Admin Force-Resets a Staff Member's Password

**Actor:** System Administrator
**Feature:** F7 — Admin Force Password Reset
**Precondition:** Target account exists. Acting user holds `admin`/HR authority.

**Trigger:** Admin selects "Force Password Reset" from the target user's Security section in the
edit sheet.

### Main Flow

1. Admin confirms the action in a confirmation dialog (irreversible-feeling action; SOP §12 "Force
   Password Reset" pattern).
2. System calls `generateLink()`/`resetPasswordForEmail()` for the target user. **No password is
   generated, returned, or displayed to the Admin at any point** (BR7.02).
3. System writes `force_reset_triggered` to `user_audit_logs`, `actor_id` = Admin, `user_id` =
   target (BR7.03).
4. Target user receives the reset email and completes UC04 steps 5–6 to set their own new
   password.
5. Admin sees confirmation: "A password reset link has been sent to [email]."

### Alternate Path A — Target Is Not the Admin's Own Account

This is the only supported path for this use case (BR7.01) — an Admin resetting their own
password uses UC04 like any other user.

---

## UC06 — Admin Locks / Unlocks / Suspends / Disables an Account

**Actor:** System Administrator
**Feature:** F3 — Admin-Triggered Account Status Actions
**Precondition:** Target account exists, is not the Admin's own account (self-action is blocked by
UI and independently by the BEFORE UPDATE trigger for `account_status`, F9).

**Trigger:** Admin selects Lock / Unlock / Suspend / Disable from the target user's Security
section.

### Main Flow (Lock example — Suspend/Disable follow the identical shape)

1. Admin selects "Lock Account." A confirmation dialog explains the effect ("This user will be
   immediately signed out and unable to log in until unlocked.").
2. Admin confirms. System sets `account_status = 'LOCKED'` (BR3.01).
3. System calls `auth.admin.signOut(target_id)` (BR3.03).
4. System writes `account_locked` to `user_audit_logs`, `actor_id` = Admin (BR3.05).
5. UI reflects the new status badge immediately.

### Variant — Unlock

Same shape; sets `account_status = 'ACTIVE'` (BR3.04); **no** session revoke call (nothing to
revoke); writes `account_unlocked`.

### Variant — Suspend

Same shape as Lock; sets `account_status = 'SUSPENDED'`; revokes session; writes
`account_suspended`. Optionally captures a `suspended_reason` note in the confirmation dialog
(reusing the existing `profiles.suspended_reason` field where applicable — `[TBD — human to
confirm whether account_status-driven suspensions also populate this HR-owned field, or whether a
separate reason field is needed for Admin-initiated suspensions]`).

### Variant — Disable

Same shape as Lock; sets `account_status = 'DISABLED'`; revokes session; writes
`account_disabled`.

### Alternate Path A — Target Account Is `INVITED`

Locking/suspending/disabling an account that has never activated is permitted (an Admin may need
to withdraw an erroneous invite before the person ever logs in) — the action proceeds normally;
`signOut` is a no-op since no session exists.

### Alternate Path B — Admin Attempts Action on Own Account

Blocked in the UI (action not offered on the Admin's own record) and independently rejected at the
database layer if attempted directly, since the trigger in F9 protects `account_status` from
self-modification even for an Admin acting on their own row through a non-privileged code path —
`[TBD — human to confirm whether an Admin should be exempted from the self-edit trigger for their
own account_status, or whether this is correctly always blocked]`.

---

## UC07 — Admin Views the Security / Account Dashboard

**Actor:** System Administrator
**Feature:** F11 — Admin Security & Dashboard Overview
**Precondition:** Acting user holds `admin`/HR authority.

**Trigger:** Admin navigates to `/dashboard/administration/security`.

### Main Flow

1. System queries account counts grouped by `account_status` (BR11.01).
2. System queries the most recent `user_audit_logs` entries filtered to account-lifecycle event
   types (BR11.01).
3. Dashboard renders count tiles (Total, Active, Invited, Locked, Suspended, Disabled) and a
   recent-activity feed, matching the source spec's §17 dashboard sketch.
4. Admin can click through to `/dashboard/administration/users` for any status tile to see the
   filtered list, or to `/dashboard/administration/audit-logs` for the full log.

### Alternate Path A — No Recent Activity

Feed shows an empty state: "No recent account activity."

---

## UC08 — System Auto-Disables an Account After 90 Days Idle

**Actor:** System (scheduled `pg_cron` job) — no human actor
**Feature:** F8 — 90-Day Auto-Disable
**Precondition:** An account has `account_status = 'ACTIVE'` and `last_login_at` older than 90
days from the job's run time.

**Trigger:** Daily `pg_cron` schedule fires.

### Main Flow

1. Job selects all `profiles` rows where `account_status = 'ACTIVE'` and
   `now() - last_login_at > interval '90 days'` (BR8.01–BR8.02).
2. For each matched row, job sets `account_status = 'DISABLED'`.
3. Job writes `account_auto_disabled_inactivity` to `user_audit_logs` with `actor_id = NULL`
   (BR8.03).
4. No session revoke is issued (BR8.05) — an idle account by definition has no live session to
   revoke.
5. Job completes; matched-row count is available in job logs for operational monitoring (see
   `10-Deployment-Notes.md`).

### Alternate Path A — Account Never Activated (`last_login_at IS NULL`, still `INVITED`)

Excluded entirely by the `account_status = 'ACTIVE'` scoping (BR8.02) — an `INVITED` account can
never be matched by this job regardless of how old the invite is. This is a deliberate exclusion;
a separate stale-invite cleanup policy is `[TBD — human to confirm if needed in a future phase]`.

### Alternate Path B — Account Already `LOCKED`/`SUSPENDED`/`DISABLED`

Excluded by the same `account_status = 'ACTIVE'` scoping — the job never re-touches an account
already in one of these states, preventing it from ever overwriting an Admin's or HR's more
specific reason for the account being inactive.
