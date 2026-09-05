# 07 — RBAC Matrix
# Module USR — User Management & Account Lifecycle

Document path: docs/04-Business-Modules/02-USR-User-Management/07-RBAC-Matrix.md
Module code: USR
Module number: 02 (DCOS Module Map — Foundation)
Domain: Foundation
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-08-24
Architecture basis: `00-Master.md` §7.2

---

## 1. Role Definitions (USR-Relevant Roles)

| Role Code | Role Name | Description |
|---|---|---|
| ADMIN | System Administrator | Sole authority for account lifecycle actions in this release. Full access to all USR features. |
| HR | HR Manager | Equivalent authority to ADMIN for USR purposes, matching the existing `HR_ROLE_CODES = {HR_Manager, admin}` union in `getActorContext()`. Runs the HR employment lifecycle whose actions carry `account_status` side effects. |
| STAFF | Any authenticated staff member (any other role) | Self-service only — own profile, own password, own account status visibility. No authority over any other user's account. |
| SYSTEM | The `pg_cron` scheduled job | Not a human actor. Writes exactly one event type (`account_auto_disabled_inactivity`) with `actor_id = NULL`. Has no session, no login, no UI surface. |

**Two-role-system duality — flagged, not resolved by this module:** `profiles.role` (legacy,
single-value, hardcoded 5-value list) and `roles`/`role_permissions`/`user_roles` (the granular
RBAC system) currently coexist and are both checked, unioned, wherever privilege matters in DCOS.
**Every row in this matrix assumes the ADMIN and HR determination is made by unioning both
systems** — a user who holds `admin` only via a `user_roles.role_code` entry (no legacy
`profiles.role = 'admin'`) must be treated identically to one who holds it via the legacy column.
This module does not resolve the duplication; it is called out here so no RBAC check introduced by
this module accidentally checks only one of the two systems and silently locks out a legitimately
privileged user. See `04-Database-Schema.md` §4 for the `is_admin()`/`is_hr()` implementation that
must be used everywhere this distinction matters.

---

## 2. Feature-Level Permission Matrix

Legend: **C** = Create | **R** = Read | **U** = Update | **D** = Delete | **—** = No access

### 2.1 Account Creation (F1)

| Action | ADMIN | HR | STAFF | SYSTEM |
|---|---|---|---|---|
| Invite a new staff account | C | C | — | — |
| View invitation status (`INVITED` badge) | R | R | — | — |

### 2.2 Account Activation (F2)

| Action | ADMIN | HR | STAFF | SYSTEM |
|---|---|---|---|---|
| Complete own activation via emailed link | — | — | U (self) | — |
| View any account's activation status | R | R | — | — |

### 2.3 Admin-Triggered Account Status Actions (F3)

| Action | ADMIN | HR | STAFF | SYSTEM |
|---|---|---|---|---|
| Lock another user's account | U | U | — | — |
| Unlock another user's account | U | U | — | — |
| Suspend another user's account | U | U | — | — |
| Disable another user's account | U | U | — | — |
| Lock/suspend/disable/unlock **own** account | — | — | — | — |

**Staff cannot change their own `account_status` under any circumstance.** Not merely hidden in
the UI — enforced by the `BEFORE UPDATE` trigger on `profiles` (`04-Database-Schema.md` §6),
which rejects any change to `account_status` from a non-service-role, non-admin, non-HR session
regardless of which code path issues the write.

### 2.4 HR Lifecycle Side Effects on `account_status` (F4)

| Action | ADMIN | HR | STAFF | SYSTEM |
|---|---|---|---|---|
| Trigger an HR `LIFECYCLE_ACTIONS` transition that carries an `account_status` side effect | — | U | — | — |

Only HR actors invoke `LIFECYCLE_ACTIONS` (existing, unchanged authorization boundary in
`[id]/route.ts`'s `getActorContext()`). ADMIN does not separately have an HR-lifecycle-triggering
path in this matrix row — an Admin who is also HR (per the role union) uses the HR path.

### 2.5 Self-Service Password Management (F5, F6)

| Action | ADMIN | HR | STAFF | SYSTEM |
|---|---|---|---|---|
| Change own password | U (self) | U (self) | U (self) | — |
| Change another user's password directly | — | — | — | — |
| Request own forgot-password reset | U (self) | U (self) | U (self) | — |
| Complete own forgot-password reset | U (self) | U (self) | U (self) | — |

**No role, including ADMIN, may set or view another user's password.** This is an absolute rule
across this entire module (`01-Business-Requirement.md` SC1, source spec §2.1 "View user's current
password: ❌ Never"). The only admin-side password action is triggering a reset link (F7) — never
setting a value.

### 2.6 Admin Force Password Reset (F7)

| Action | ADMIN | HR | STAFF | SYSTEM |
|---|---|---|---|---|
| Trigger a force-reset link for another user | C | C | — | — |
| Trigger a force-reset link for own account | — | — | — | — |

An Admin/HR resetting their own password uses the self-service forgot-password flow (§2.5), not
this endpoint (`02-Functional-Specification.md` BR7.01).

### 2.7 90-Day Auto-Disable (F8)

| Action | ADMIN | HR | STAFF | SYSTEM |
|---|---|---|---|---|
| Trigger the auto-disable job | — | — | — | C (scheduled, not user-invoked) |
| View that an account was auto-disabled | R | R | — | — |

No human role can manually invoke the auto-disable job outside its schedule; it is not exposed as
an endpoint.

### 2.8 Self-Edit Restriction (F9)

| Action | ADMIN | HR | STAFF | SYSTEM |
|---|---|---|---|---|
| Edit own non-privileged profile fields (phone, address, emergency contact, etc.) | U (self) | U (self) | U (self) | — |
| Edit own `role` | U | U | — | — |
| Edit own `account_status` | U | U | — | — |
| Edit own `status` (HR employment) | U | U | — | — |
| Edit own `department_id` | U | U | — | — |
| Edit own `email` | U | U | — | — |
| Edit own `user_code` | — | — | — | — |

**No role may change its own `user_code`** — this is a system-assigned identifier
(`fn_assign_user_code()` trigger), not an Admin-editable field for any actor, including on
another user's record; it is listed in the protected column set purely as a defense-in-depth
measure, not because Admin needs write access to it.

**Staff cannot change own role, email, department, or `account_status`** — matches the source
spec's §2.2 table exactly ("Change own role: ❌", "Change own email: Usually ❌").

### 2.9 Audit Logging & Dashboards (F10, F11)

| Action | ADMIN | HR | STAFF | SYSTEM |
|---|---|---|---|---|
| View full Audit Log page (USR-06) | R | R | — | — |
| View Security Overview dashboard (USR-05) | R | R | — | — |
| View own audit history (own account's entries only) | R | R | R (self only) | — |
| Delete or modify any audit log entry | — | — | — | — |

No role, including ADMIN, can delete or modify an audit log entry — matches SOP §23 and the
existing `user_audit_logs` table's absence of any UPDATE/DELETE policy. Staff self-read of own
audit entries is supported by the existing `ual_self_read` policy
(`user_id = auth.uid()`) already in place from `20260606000002_user_management_gaps.sql`.

---

## 3. Column-Level Enforcement Summary

Because Postgres RLS cannot restrict which columns an otherwise-permitted row-level `UPDATE`
changes, every "STAFF: —" cell in §2.3 and §2.8 above is enforced at two layers, not one:

1. **UI layer:** the relevant controls are not rendered for a staff member viewing their own
   record (`06-UI-UX-Design.md` USR-03/USR-04).
2. **Database layer (the actual boundary):** the `BEFORE UPDATE` trigger on `profiles`
   (`04-Database-Schema.md` §6) rejects any change to `role`, `account_status`, `status`,
   `department_id`, `email`, or `user_code` from a session that is not `service_role`,
   `is_admin()`, or `is_hr()` — regardless of whether the write originates from this module's
   forms, a direct Supabase client call from any other component, or a future code path not yet
   written. RLS's `UPDATE` policy only confirms the acting user may touch their own row at all;
   it does not and cannot enforce the column-level restriction on its own.

---

## 4. Role Assignment

Roles are read from the union of `profiles.role` (legacy) and `user_roles.role_code` (RBAC),
exactly as `getActorContext()` already does for the HR lifecycle engine. This module introduces no
new role-storage mechanism — `is_admin()`/`is_hr()` (`04-Database-Schema.md` §4) are the
database-layer formalization of the same union already used server-side, and the sidebar gating
recommendation (`06-UI-UX-Design.md` §4) uses the equivalent client-side computation.

A user with `admin` at the organisation level has full USR authority regardless of any
project-level assignment — USR has no project scoping (accounts are organisation-wide identities,
not per-project).
