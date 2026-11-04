# 02 — Functional Specification
# Module USR — User Management & Account Lifecycle

Document path: docs/04-Business-Modules/02-USR-User-Management/02-Functional-Specification.md
Module code: USR
Module number: 02 (DCOS Module Map — Foundation)
Domain: Foundation
Owner: System Admin / HR
Phase: Phase 1 (Foundation)
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-08-24
Architecture basis: `00-Master.md` §3, §4, §7, §8.1, §8.3

---

## 1. Feature List

### F1 — Account Creation by Invitation

The System Admin creates a staff account by identity + role + department only. No password is
ever set or seen by the Admin. The system sends an activation email.

**Business Rules**

BR1.01  Account creation is performed via Supabase Auth `inviteUserByEmail()`. The Admin-supplied
        payload contains identity fields (full name, email, employee ID, department, position,
        phone) and access fields (role, department). It never contains a password field.

BR1.02  On successful invite, the system creates (or updates, if `handle_new_user()` already ran)
        the corresponding `profiles` row with `account_status = 'INVITED'`. `account_status` is
        set explicitly by the invite endpoint, not by the `handle_new_user()` trigger, which has
        no knowledge of this column.

BR1.03  Only a System Admin (or HR, per the existing `HR_ROLE_CODES` union — see
        `07-RBAC-Matrix.md`) may invoke account creation.

BR1.04  An `account_invited` audit event is written to `user_audit_logs` with `actor_id` set to
        the inviting Admin's `id` and `user_id` set to the new account's `id`.

BR1.05  Account creation does not set `profiles.status` (the HR employment field) to anything
        other than its existing default behaviour in the HR "Add Employee" flow. This module adds
        the invite mechanism to that flow; it does not change how the HR employment `status` is
        assigned on creation.

BR1.06  Duplicate email invitation is rejected with a clear error — Supabase Auth already
        enforces email uniqueness on `auth.users`; the invite endpoint surfaces this as a
        `409 USR_EMAIL_EXISTS` rather than a raw Auth error.

---

### F2 — Account Activation

The invited staff member clicks the emailed link, sets their own password once, and their account
becomes usable.

**Business Rules**

BR2.01  Activation is a token-based password-set flow, technically identical to a password reset
        (Supabase treats both as "recovery" links). The same endpoint
        (`POST /api/auth/reset-password`) serves both first-activation and forgot-password
        completions.

BR2.02  When the reset-password endpoint successfully sets a new password for an account whose
        `account_status` is currently `INVITED`, the system flips `account_status` to `ACTIVE` in
        the same transaction. This is the activation-completion event.

BR2.03  `profiles.first_login_at` is reused as the activation-completion timestamp (per
        `00-Master.md`, unless a future phase decides activation and first actual login must be
        recorded separately — not the case in this release).

BR2.04  An `account_activated` audit event is written with `actor_id = user_id` (the staff member
        activates their own account) and `note` recording that this was an activation completion,
        not a routine password reset.

BR2.05  A link that has already been used, or that has expired, must be rejected by Supabase Auth
        before this module's logic runs; the reset-password endpoint returns the Supabase error
        translated into a user-facing message ("This link has expired or already been used.
        Request a new one.").

---

### F3 — Admin-Triggered Account Status Actions (Lock / Unlock / Suspend / Disable)

The System Admin directly controls `account_status` for security and access-management reasons,
independent of HR employment actions.

**Business Rules**

BR3.01  Four admin-initiated transitions exist: `lock`, `unlock`, `suspend`, `disable`. Each is
        exposed as its own endpoint under a new `ACCOUNT_STATUS_ACTIONS` map, modeled on the
        existing `LIFECYCLE_ACTIONS` pattern in `apps/web/app/api/hr/employees/[id]/route.ts`.

BR3.02  Only a System Admin (or HR, per the existing role union) may invoke `lock`, `suspend`, or
        `disable`. `unlock` follows the same authorization.

BR3.03  `lock` and `suspend` and `disable` each call `auth.admin.signOut(id)` to revoke the
        account's live session(s), matching SOP §17/§18's "cannot log in" / "remove sessions"
        requirement.

BR3.04  `unlock` sets `account_status = 'ACTIVE'`. It does not call `signOut` (there is nothing to
        revoke — an unlock is a restoration of access, not a removal).

BR3.05  Each transition writes its corresponding audit event: `account_locked`,
        `account_unlocked`, `account_suspended`, `account_disabled` — `actor_id` is the acting
        Admin, `old_value`/`new_value` capture the `account_status` before/after.

BR3.06  `LOCKED` is admin-manual-only in this release (Open Question 8.1, resolved Option A). No
        automatic failed-login-attempt lockout exists. There is no `login_attempts` table.

BR3.07  A staff member may never self-trigger any of these four actions on their own account.
        Enforced by BR3.02 (endpoint authorization) and independently by the `BEFORE UPDATE`
        trigger described in F9 (defense in depth for any direct-client write path).

---

### F4 — HR Lifecycle → `account_status` Side Effects

Specific HR employment lifecycle transitions (owned by the existing `LIFECYCLE_ACTIONS` engine)
carry a defined, automatic side effect on `account_status`. This is the one place HR actions and
this module's access-control column intersect.

**Business Rules**

BR4.01  The following HR `LIFECYCLE_ACTIONS` keys carry an `account_status` side effect, applied
        inside the same transaction as the existing `profiles.status` update, in the existing
        `[id]/route.ts` handler:

        | HR action | New `status` | `account_status` side effect | Session revoke |
        |---|---|---|---|
        | `suspend` | `suspended` | → `SUSPENDED` | Yes (already `revoke:true`) |
        | `terminate`, `retire`, `deceased`, `archive` | (respective) | → `DISABLED` | Yes (already `revoke:true`) |
        | `resign` | `resigned` | → `DISABLED` | Yes — **added to scope**; the plan's original list omitted `resign`, but it has identical `revoke:true` semantics and maps to `DISABLED` in the backfill table (`04-Database-Schema.md`), so it must behave the same live |
        | `long_leave` | `long_leave` | → `SUSPENDED` | Yes — **added to scope**; not currently `revoke:true` in the existing code, recommended addition so a newly-placed-on-leave employee cannot keep a live session while HR believes the account is suspended |
        | `activate` | `active` | → `ACTIVE`, **only if current `account_status` is `SUSPENDED` or `DISABLED`; never if `LOCKED`** | n/a |
        | `approve`, `submit`, `start_probation` | (respective) | No change | n/a |

BR4.02  The `activate` restore rule (BR4.01 row 5) exists because `activate` is also how a rehire
        (previously `terminated` → HR re-activates) or an employee returning from `long_leave`
        re-enters active employment. Without a matching `account_status` restore, HR would
        reactivate someone's employment record and they would still be unable to log in with no
        obvious reason why.

BR4.03  Excluding `LOCKED` from the `activate` restore is deliberate: `LOCKED` is a System Admin
        security action, not an HR employment state. HR reactivating employment must never
        silently clear a security lock. Only System Admin can clear `LOCKED` (via `unlock`, F3).

BR4.04  Each HR action that carries an `account_status` side effect writes its own
        `account_status`-scoped audit entry (in addition to the existing `employment_status_changed`
        entry the HR handler already writes) — see `04-Database-Schema.md` for the exact
        event-type strings.

BR4.05  This module does not modify `profiles_status_check` or the `LIFECYCLE_ACTIONS` map's
        existing `status` values. The side effect is an addition alongside the existing update,
        in the same transaction, not a replacement of any existing behaviour.

---

### F5 — Self-Service Password Management (Change Password)

A logged-in staff member changes their own password.

**Business Rules**

BR5.01  Requires an active session. The endpoint validates the current password before accepting
        a new one.

BR5.02  Password policy (shared Zod schema, reused by change-password, reset-password, and
        activation): minimum 12 characters, at least one uppercase, one lowercase, one number, one
        special character. Matches SOP §15's "12 characters recommended" and the source spec's
        recommendation, superseding the SOP's minimum-8 language.

BR5.03  On success: `password_changed_at` is updated to `now()`; a `password_changed` audit event
        is written with `actor_id = user_id`; all other active sessions for the user are
        invalidated (`auth.admin.signOut`), matching SOP §9's "Invalidate old sessions" step and
        the source spec's Change Password workflow.

BR5.04  A staff member may only change their own password through this flow. They can never
        change another user's password (SOP §2.2, source spec §2.2 "Change another user's
        password: ❌").

---

### F6 — Forgot Password / Self-Service Reset

A staff member who cannot log in recovers access without any Admin involvement.

**Business Rules**

BR6.01  The forgot-password endpoint always returns an identical, generic response regardless of
        whether the submitted email matches an existing account: *"If an account exists for this
        email, a password reset link has been sent."* This applies to both the response body and
        response timing — the endpoint must not leak existence via response latency either.
        Matches SOP intent (no explicit SOP text, but stated in the source spec §10) and standard
        DCOS security posture.

BR6.02  `resetPasswordForEmail()` is called only if a matching `profiles`/`auth.users` record
        exists. If it does not, the endpoint still returns the generic success response but sends
        no email.

BR6.03  The reset link is Supabase-managed: single-use, time-limited (Supabase default recovery
        token expiry — verified, not assumed, per `09-Test-Plan.md`). On successful password set,
        the token is consumed and cannot be reused.

BR6.04  On successful reset completion, the same activation-detection logic as F2 applies: if the
        account's `account_status` was `INVITED`, it flips to `ACTIVE`. Otherwise `account_status`
        is unchanged by a routine forgot-password reset.

BR6.05  A `password_reset_requested` audit event is written when the forgot-password endpoint is
        called for a matching account (not for non-matching emails — there is no user record to
        attach the event to). A `password_reset_completed` audit event is written when the reset
        actually completes.

BR6.06  A reset request is not permitted to bypass or reveal `account_status`. A `SUSPENDED`,
        `DISABLED`, or `LOCKED` account may still request and complete a password reset link
        (Supabase-level operation), but this does **not** change `account_status` — the account
        remains unable to log in until an Admin restores it (F3). Resetting a password is not a
        backdoor around an Admin's suspend/disable/lock decision.

---

### F7 — Admin Force Password Reset

The System Admin triggers a reset link for a staff member who cannot self-serve (e.g., lost email
access temporarily, or simply asks the Admin for help), without ever setting or seeing a password.

**Business Rules**

BR7.01  Only a System Admin (or HR) may invoke force-reset, and only for another user's account —
        an Admin does not need this endpoint for their own account (they use F6 like anyone else).

BR7.02  The endpoint calls `generateLink()` / `resetPasswordForEmail()` and never returns a
        password, temporary or otherwise, in the response body or the audit log.

BR7.03  A `force_reset_triggered` audit event is written with `actor_id` = the Admin, `user_id` =
        the target account.

BR7.04  Force-reset does not change `account_status`. If the target account is `LOCKED`,
        `SUSPENDED`, or `DISABLED`, triggering a reset link does not implicitly restore access —
        the Admin must separately `unlock`/reactivate if that is also intended (matches BR6.06's
        principle).

---

### F8 — 90-Day Auto-Disable (System-Initiated)

A scheduled job disables accounts that have gone idle, per SOP §21. This is **not** a user or
Admin action — it is the one transition in this module triggered by the system itself.

**Business Rules**

BR8.01  A daily scheduled job (`pg_cron`) compares `last_login_at` to `now()` for every account
        currently `account_status = 'ACTIVE'`. Any such account idle for more than 90 days has
        `account_status` set to `DISABLED`.

BR8.02  The job's `WHERE` clause is scoped explicitly to `account_status = 'ACTIVE'`. It must never
        act on `INVITED` (never-logged-in accounts are not "idle," they are "never activated" — a
        different condition, out of this rule's scope), `LOCKED`, `SUSPENDED`, or `DISABLED`
        accounts, which have their own transition paths and must not be touched by this job.

BR8.03  The job writes `account_auto_disabled_inactivity` to `user_audit_logs` with
        `actor_id = NULL` — this is system-initiated, not admin-initiated. Any UI or report
        consuming this audit trail must render a `NULL` actor as **"System"**, never as a blank or
        an error.

BR8.04  Reactivating an auto-disabled account still requires explicit System Admin action (the
        `unlock`/reactivate path in F3) — matching SOP §21's "reactivation requires approval." The
        job never re-enables an account it disabled.

BR8.05  The job does not call `auth.admin.signOut()` — an account idle for 90 days by definition
        has no live session to revoke. (If this assumption is ever wrong — e.g. a very
        long-lived refresh token — that is a `09-Test-Plan.md` verification item, not a rule
        change here.)

---

### F9 — Column-Level Self-Edit Restriction

A staff member may edit their own non-privileged profile fields (phone, address, emergency
contact, etc.) but must never be able to change their own privileged columns, regardless of which
code path issues the write.

**Business Rules**

BR9.01  The protected column set on `profiles` is: `role`, `account_status`, `status`,
        `department_id`, `email`, `user_code`.

BR9.02  Enforcement is a `BEFORE UPDATE` trigger on `profiles`, not RLS alone and not
        application-layer-only enforcement. Postgres RLS `WITH CHECK` cannot restrict which
        *columns* changed within an otherwise-permitted row-level `UPDATE`; a trigger is the only
        mechanism that can inspect `OLD` vs `NEW` per column regardless of which client issued the
        write (direct browser Supabase client, API route, or future code path).

BR9.03  If any protected column's `NEW` value differs from `OLD`, and the executing context is
        neither the Supabase `service_role` (trusted backend/admin-client routes — `unlock`,
        `suspend`, HR's `LIFECYCLE_ACTIONS`, etc. must remain unaffected) nor a session for which
        `is_admin()` or `is_hr()` evaluates true, the trigger rejects the update with an
        exception.

BR9.04  This rule complements, not replaces, the RLS `UPDATE` policy (`04-Database-Schema.md`
        §RLS) — RLS decides *which rows* a self-edit may touch (their own row only); the trigger
        decides *which columns* within that row a non-privileged actor may change.

BR9.05  A staff member cannot change their own email, matching the source spec (§2.2, "Change own
        email: Usually ❌") and SOP intent — email is treated as an identity field, Admin-owned.

---

### F10 — Audit Logging

Every account-lifecycle event is written to the existing `user_audit_logs` table using a canonical
event-type vocabulary.

**Business Rules**

BR10.01 All events listed across F1–F8 above are written using the exact `event_type` strings
        enumerated in `04-Database-Schema.md` §Audit Event Vocabulary. No ad-hoc event-type
        strings are introduced outside that list without updating this document and that table.

BR10.02 `user_audit_logs` records are never deleted or updated after insert — matches SOP §23
        ("Audit records cannot be deleted") and the existing table's RLS, which has no DELETE or
        UPDATE policy.

BR10.03 System-initiated events (currently only `account_auto_disabled_inactivity`, F8) use
        `actor_id = NULL`. Every other event type in this module has a non-null `actor_id`.

---

### F11 — Admin Security & Dashboard Overview

The System Admin has a global, read-oriented view of account health, distinct from the per-user
inline Security actions.

**Business Rules**

BR11.01 The dashboard/Security overview surfaces counts by `account_status`
        (`INVITED`/`ACTIVE`/`LOCKED`/`SUSPENDED`/`DISABLED`) and a recent `user_audit_logs` feed
        filtered to account-lifecycle event types.

BR11.02 This overview is read-only. No account-status-changing action is initiated from this
        screen — per-user Lock/Unlock/Suspend/Disable/Force-Reset actions live inline in the
        per-user edit sheet's Security section (`06-UI-UX-Design.md`), not on the global overview.

BR11.03 Only System Admin (or HR) may view this overview, matching `07-RBAC-Matrix.md`.

---

## 2. Status Model — `account_status`

### 2.1 States

| Status | Meaning | Set by |
|---|---|---|
| `INVITED` | Account created; activation link sent; never yet logged in | Invite endpoint (F1); HR create flow default |
| `ACTIVE` | Normal, usable account | Activation completion (F2); Admin unlock/reactivate (F3); HR `activate` restore (F4) |
| `LOCKED` | Admin-manual security hold. Cannot log in. | Admin `lock` only (F3) |
| `SUSPENDED` | Temporarily blocked — investigation, extended leave, contract expiry, etc. | Admin `suspend` (F3); HR `suspend`/`long_leave` side effect (F4) |
| `DISABLED` | No longer permitted to log in — terminal for this account (until Admin explicitly reactivates) | Admin `disable` (F3); HR `terminate`/`retire`/`deceased`/`archive`/`resign` side effect (F4); system 90-day auto-disable (F8) |

### 2.2 Transition Diagram

```
                    ┌────────────────────────────┐
                    │      SYSTEM ADMIN           │
                    │   creates staff account     │
                    └──────────────┬───────────────┘
                                   │  BR1.01–BR1.06
                                   ▼
                          ┌─────────────────┐
                          │     INVITED      │
                          └─────────┬─────────┘
                                   │  staff clicks activation
                                   │  link, sets own password
                                   │  BR2.01–BR2.05
                                   ▼
                          ┌─────────────────┐
              ┌──────────►│      ACTIVE      │◄──────────┐
              │           └─────────┬─────────┘           │
              │                     │                      │
   Admin unlock                Admin lock             HR `activate`
   (BR3.04)               (admin-manual only,      (BR4.01, restores
              │             BR3.06)                  from SUSPENDED/
              │                     ▼                 DISABLED only —
              │           ┌─────────────────┐         never LOCKED,
              │           │      LOCKED      │         BR4.02–BR4.03)
              │           └─────────────────┘              │
              │                                             │
              │   Admin suspend (BR3.01) /                  │
              │   HR suspend, long_leave (BR4.01)            │
              │                     │                        │
              │                     ▼                        │
              └───────────┬─────────────────┐                │
                          │    SUSPENDED     │────────────────┘
                          └─────────┬─────────┘
                                   │  Admin disable (BR3.01) /
                                   │  HR terminate, retire, deceased,
                                   │  archive, resign (BR4.01) /
                                   │  system 90-day auto-disable
                                   │  (BR8.01–BR8.02, ACTIVE-only)
                                   ▼
                          ┌─────────────────┐
                          │     DISABLED     │────── Admin reactivate
                          └─────────────────┘        (unlock path, BR4.01
                                                        restore) ─────────┐
                                                                          │
                                                                    back to ACTIVE
```

### 2.3 Transition Table

| From | To | Trigger | Actor | Session revoke | BR ref |
|---|---|---|---|---|---|
| — | `INVITED` | Account created | System Admin (or HR) | n/a | BR1.02 |
| `INVITED` | `ACTIVE` | Activation link completed | Staff (self) | n/a | BR2.02 |
| `ACTIVE` | `LOCKED` | Admin lock | System Admin | Yes | BR3.01, BR3.03 |
| `LOCKED` | `ACTIVE` | Admin unlock | System Admin | No | BR3.04 |
| `ACTIVE` | `SUSPENDED` | Admin suspend | System Admin | Yes | BR3.01, BR3.03 |
| `SUSPENDED` | `ACTIVE` | Admin unlock/reactivate, or HR `activate` | System Admin / HR | No | BR3.04, BR4.01 |
| `ACTIVE`/`SUSPENDED`/`LOCKED` | `DISABLED` | Admin disable | System Admin | Yes | BR3.01, BR3.03 |
| `DISABLED` | `ACTIVE` | Admin unlock/reactivate, or HR `activate` | System Admin / HR | No | BR3.04, BR4.01 |
| `ACTIVE` | `SUSPENDED` | HR `suspend` / `long_leave` | HR | Yes | BR4.01 |
| `ACTIVE`/any | `DISABLED` | HR `terminate`/`retire`/`deceased`/`archive`/`resign` | HR | Yes | BR4.01 |
| `ACTIVE` | `DISABLED` | System 90-day idle auto-disable | System (`actor_id = NULL`) | No (BR8.05) | BR8.01–BR8.04 |

**Explicit rule — `LOCKED` is never silently cleared:** HR's `activate` side effect (BR4.01) only
restores `account_status` from `SUSPENDED` or `DISABLED`. If the current `account_status` is
`LOCKED`, the HR `activate` action changes `profiles.status` as normal but leaves
`account_status = LOCKED` untouched. Only a System Admin `unlock` clears a lock (BR4.03).

**Explicit rule — auto-disable is `ACTIVE`-only:** The system job (F8) never transitions an
`INVITED`, `LOCKED`, `SUSPENDED`, or already-`DISABLED` account. Those states have their own
transition paths and are excluded from the job's `WHERE` clause by design (BR8.02).

---

## 3. Workflow — Who Can Trigger What

| Transition | Who may trigger |
|---|---|
| Create account (→ `INVITED`) | System Admin, HR |
| Activate (`INVITED` → `ACTIVE`) | Staff member (self, via emailed link) |
| Lock (`ACTIVE` → `LOCKED`) | System Admin only |
| Unlock (`LOCKED` → `ACTIVE`) | System Admin only |
| Suspend (`ACTIVE` → `SUSPENDED`) | System Admin, or automatically via HR `suspend`/`long_leave` |
| Disable (any → `DISABLED`) | System Admin, or automatically via HR `terminate`/`retire`/`deceased`/`archive`/`resign`, or the system (90-day job) |
| Reactivate (`SUSPENDED`/`DISABLED` → `ACTIVE`) | System Admin, or automatically via HR `activate` (never restores from `LOCKED`) |
| Force password reset | System Admin only (for any staff account) |
| Change own password | Staff member (self) only |
| Forgot / reset own password | Staff member (self), unauthenticated flow |
| Auto-disable after 90 days idle | System (`pg_cron` job); no human actor |

No actor other than System Admin (or the equivalent-authority HR role, per the existing
`HR_ROLE_CODES` union) can invoke `lock`, `unlock`, `suspend`, `disable`, or force-reset on another
user's account. No staff member can invoke any of these on their own account — see
`07-RBAC-Matrix.md` for the complete permission matrix and the trigger-level enforcement.

---

## 4. Integration Points

| Integrated module / component | How |
|---|---|
| Employee Master / HR (`apps/web/app/api/hr/employees/[id]/route.ts`) | `LIFECYCLE_ACTIONS` gains the `account_status` side effects in F4, applied in the same transaction as the existing `profiles.status` update. No existing HR behaviour is altered. |
| `user_audit_logs` (existing table) | All events in F1–F8 write here using the canonical vocabulary in `04-Database-Schema.md`. |
| Supabase Auth Admin API | `inviteUserByEmail`, `generateLink`/`resetPasswordForEmail`, `admin.listUsers`, `admin.signOut` — see `05-Integration-Specification.md`. |
| `departments` table | New `department_id` FK on `profiles` replaces the free-text department field in the invite and edit forms — see `04-Database-Schema.md` §Departments Wiring. |
| Sidebar navigation (`apps/web/components/dashboard/sidebar.tsx`) | New Administration nav items route to this module's screens — see `06-UI-UX-Design.md`. |
| `pg_cron` (Supabase extension) | Runs the F8 90-day auto-disable job daily — see `04-Database-Schema.md` and `10-Deployment-Notes.md`. |

---

## 5. Assumptions & Constraints

- `first_login_at` is reused as the activation-completion timestamp (BR2.03). If a future phase
  needs to distinguish "activated" from "first actual login" as separate events, this is a schema
  change outside this release.
- `auth.admin.signOut(id)`'s exact immediacy against an in-flight JWT (vs. only blocking future
  refresh) is `[TBD — human to confirm]` at the infrastructure level; `09-Test-Plan.md` includes a
  verification test rather than assuming either behaviour.
- The two-role-system duality (`profiles.role` legacy column unioned with `user_roles`/
  `role_permissions`) is not resolved by this module. Every admin-check introduced here
  (`is_admin()`/`is_hr()`, `ACCOUNT_STATUS_ACTIONS`, sidebar gating) honours both, per
  `00-Master.md` §7.2's flag.
- `tenant_id` is intentionally absent from every table this module touches — not an oversight; see
  `00-Master.md` §8.5.
