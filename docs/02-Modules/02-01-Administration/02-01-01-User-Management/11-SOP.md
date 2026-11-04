# 11 — Standard Operating Procedures
# Module USR — User Management & Account Lifecycle

Document path: docs/04-Business-Modules/02-USR-User-Management/11-SOP.md
Module code: USR
Module number: 02 (DCOS Module Map — Foundation)
Domain: Foundation
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-08-24
Supersedes/extends: `docs/02-Governance/01-SOP/01-SOP-User-Management/SOP-User-Management.md`
(DCOS-SOP-UM-001) — **this document is a delta, not a replacement.** Sections of that SOP not
listed below are unaffected and remain fully authoritative as written.

---

## How to Use This Document

`SOP-User-Management.md` is the org-level standard operating procedure — 30 sections covering the
full user lifecycle, roles, password policy, and audit requirements. This module implements a
subset of that SOP in DCOS software. Where the software's actual mechanism differs from the SOP's
original wording, this document records the delta. **Do not re-read this as a standalone
procedure** — follow `SOP-User-Management.md` for anything not listed below, and follow the
procedures in this document wherever it says "delta" or "new."

The mapping below is reproduced from `00-Master.md` §9 (the full analysis, not repeated).

| SOP section | SOP text | Reconciliation |
|---|---|---|
| §9 Account Activation | "Initial Password: System generated... First Login: Change Password. Mandatory." | **Delta.** See SOP-USR-01 below — email activation link, Admin never sets/sees a password. Outcome preserved: user sets their own password before first real use. |
| §16 Password Reset Procedure | "System Admin: Reset Password... User must change password upon next login." | **Compatible, wording updates only.** See SOP-USR-02 below — "Reset Password" now means "trigger a reset link," not "set a literal password." Outcome unchanged. |
| §17 User Suspension | Reasons include "Extended Leave"; suspended users cannot log in. | **Consistent** — see SOP-USR-03. Directly informs the `long_leave → SUSPENDED` backfill mapping. |
| §18 User Termination | "Deactivate Account / Remove Sessions / Lock Access." | **Consistent** — see SOP-USR-03. Matches `revoke:true` + `account_status = DISABLED`. |
| §19 User Archive | "Never deleted... Read Only." | **Consistent, unchanged.** No new procedure needed — follow SOP §19 as written. |
| §21 Inactive Account Policy | 90-day auto-disable, reactivation needs approval. | **Newly implemented this release.** See SOP-USR-04 below. |
| §23 Audit Requirements | Login, Logout, Password Reset, Role Change, Project Assignment, User Creation, User Deactivation must be logged; records cannot be deleted. | **Consistent, mechanism documented.** See SOP-USR-05 below for the exact event-type mapping. |
| §25 User Status Definitions | `Pending / Active / Suspended / Disabled / Archived` — flat, single status, no `Locked`. | **Delta.** See SOP-USR-06 below for the two-column mapping table (SOP predates the `status`/`account_status` split and predates `LOCKED`). |
| §7 / §14 Request & Modification approval chain | Manager → System Admin approval required for creation and for role/department/project changes. | **Deviation, accepted.** See SOP-USR-07 below. |

---

## SOP-USR-01: Creating and Activating a Staff Account

**Supersedes:** SOP §9 "Account Activation" mechanism (outcome preserved, method changed).
**Responsible:** System Administrator (creates), Staff member (activates).
**Timing:** As needed, on hiring or onboarding.

**Procedure:**

1. System Admin navigates to Administration → User Management → New User.
2. Admin enters Employee Information (name, employee ID, department, position, phone) and Login
   Information (email only — **no password field is presented**).
3. Admin selects Role and any RBAC assignment under Access Control.
4. Admin submits. The account is created with `account_status = INVITED`. **The Admin never sets,
   sees, or is shown a password at any point in this procedure.**
5. The system sends an activation email to the new staff member's address.
6. Staff member opens the email, clicks "Activate Account," and is taken to the DCOS password-set
   screen.
7. Staff member sets their own password (minimum 12 characters, upper + lower case, number,
   special character — see SOP §15, unchanged).
8. On successful submission, `account_status` flips to `ACTIVE`. Staff member may now log in.

**If the activation link has expired or was already used:** the staff member uses the Forgot
Password flow (SOP-USR-02) — the system correctly detects the account is still `INVITED` and
treats the resulting reset as an activation completion.

---

## SOP-USR-02: Password Reset Procedures

**Supersedes:** SOP §16, wording only. Outcome unchanged: user sets their own new password before
resuming normal use.

### 2A — Staff-Initiated (Forgot Password)

**Responsible:** Staff member (self-service, no Admin involvement required).

1. Staff member clicks "Forgot password?" on the login page.
2. Enters their email address.
3. System always displays: *"If an account exists for this email, a password reset link has been
   sent."* — this message is shown identically whether or not the email matches a real account.
   **Do not interpret an absence of a received email as confirmation the account doesn't exist —
   check spelling and spam folder first.**
4. If the email matched an account, staff member receives the reset email, clicks the link, and
   sets a new password.
5. All other active sessions for that account are signed out automatically.

### 2B — Admin-Initiated (Force Reset)

**Responsible:** System Administrator.
**When to use:** a staff member calls or messages the Admin saying they cannot access their email
to complete 2A themselves, or is otherwise locked out and needs the Admin's help.

1. Admin navigates to Administration → User Management → [staff member] → Security section.
2. Admin clicks "Force Password Reset" and confirms.
3. **Admin does not ask the staff member for their current or a desired new password at any
   point** — this is a hard rule (SOP §2.1 "View user's current password: Never").
4. System sends a reset link to the staff member's registered email.
5. Staff member completes the reset themselves, following steps 4–5 of procedure 2A.

---

## SOP-USR-03: Suspension and Termination — Effect on Login Access

**Consistent with SOP §17/§18.** This procedure documents the mechanism, since SOP-User-
Management.md predates the `account_status` column that actually enforces "cannot log in."

**Responsible:** System Administrator (direct security action) or HR Manager (via the employment
lifecycle).

**Two paths reach the same outcome:**

**Path A — Admin-initiated (security reason, not an employment change):**
1. Admin navigates to the staff member's Security section.
2. Admin selects Suspend or Disable, optionally records a reason, and confirms.
3. `account_status` changes immediately; any live session is revoked; the staff member cannot log
   in from that point forward.

**Path B — HR-initiated (employment change: suspension, extended leave, resignation, termination,
retirement, deceased, archive):**
1. HR runs the corresponding action in the Employee Master record, exactly as before this module
   existed.
2. The system now **also** updates `account_status` automatically as a side effect of that HR
   action (see the mapping table in `02-Functional-Specification.md` §F4) and revokes any live
   session where applicable.
3. HR does not need to separately visit the Security section — the login-access consequence is
   automatic and immediate.

**Reactivation (either path):** only a System Administrator can restore access from `SUSPENDED` or
`DISABLED` back to `ACTIVE` (or an HR `activate` action restores it automatically under the same
rule) — **except** an account that is `LOCKED`, which only a System Admin's explicit Unlock action
can clear. An HR employment reactivation never silently clears a security lock.

**Historical records are never deleted.** Suspending, disabling, or terminating an account does
not remove or orphan any RFI, document, BOQ, task, approval, or other record the person created —
matching SOP §18/§19's data-preservation intent.

---

## SOP-USR-04: 90-Day Inactive Account Policy (Newly Implemented This Release)

**Implements SOP §21**, previously not built in the running system.

**Responsible:** System (automatic) for the disable action; System Administrator for
reactivation.

1. Each night, the system automatically checks every `ACTIVE` account's last login date.
2. Any account that has not logged in for more than 90 consecutive days is automatically set to
   `DISABLED`. This is a system action, not performed by any person — the audit log will show
   "System" as the actor for this event.
3. Accounts that have never activated (`INVITED`, never logged in at all) are **not** affected by
   this policy, no matter how old the invitation is — this policy only applies to accounts that
   were `ACTIVE` and then went idle, not accounts that were never used.
4. Accounts already `LOCKED`, `SUSPENDED`, or `DISABLED` are not touched by this check — they
   already have their own reason for being inaccessible.
5. **Reactivation requires System Admin approval**, matching SOP §21 exactly — a staff member
   whose account was auto-disabled cannot self-reactivate; they must contact a System Admin, who
   reviews and reactivates via the standard Unlock/reactivate action in the Security section.

---

## SOP-USR-05: Audit Logging — Event Mapping

**Consistent with SOP §23.** SOP §23 lists the categories that must be logged; this table maps
each to the exact system event recorded, for anyone auditing compliance against the SOP.

| SOP §23 category | System `event_type` |
|---|---|
| User Creation | `account_invited` |
| Password Reset | `password_reset_requested`, `password_reset_completed`, `force_reset_triggered`, `password_changed` |
| Role Change | `employment_status_changed` (existing HR mechanism, unchanged) |
| User Deactivation | `account_locked`, `account_suspended`, `account_disabled`, `account_auto_disabled_inactivity` |
| Login / Logout | Handled by Supabase Auth's own session mechanism; `session_revoked` is written whenever this module forces a sign-out (lock/suspend/disable/change-password) |
| Project Assignment | Out of scope for this module — not a USR event |

**Audit records cannot be deleted or modified**, by anyone, including a System Administrator —
this is enforced at the database level (no UPDATE/DELETE policy exists on the audit table), not
merely a procedural rule.

---

## SOP-USR-06: User Status — Mapping SOP §25 to the Implemented Columns

**Delta from SOP §25.** SOP-User-Management.md's original 5-value flat status
(`Pending/Active/Suspended/Disabled/Archived`) predates the system's actual two-column design
(`profiles.status` for HR employment, `profiles.account_status` for login access) and predates the
`Locked` state. This is not a contradiction — it is the SOP's conceptual model expressed across two
columns instead of one, plus one net-new state the original SOP did not anticipate.

| SOP §25 concept | Where it lives today |
|---|---|
| Pending | `account_status = INVITED` |
| Active | `account_status = ACTIVE` (and typically `status = active`) |
| Suspended | `account_status = SUSPENDED` (may correspond to `status = suspended`, `long_leave`, or `inactive` depending on cause) |
| Disabled | `account_status = DISABLED` (may correspond to `status = disabled`, `resigned`, `terminated`, `retired`, `deceased`, or `archived` depending on cause) |
| Archived | `status = archived` (HR employment record, read-only, never deleted — independent of `account_status`, which will also be `DISABLED` for an archived record) |
| *(not in original SOP)* | `account_status = LOCKED` — a System Admin security hold, distinct from any employment reason. See SOP-USR-03. |

The full 15-value `status` → `account_status` backfill mapping is in `04-Database-Schema.md` §2.

---

## SOP-USR-07: Approval Chain — Deviation Notice

**Deviates from SOP §7/§14.** SOP-User-Management.md specifies a Manager → System Admin approval
chain before a new user is created and before role/department/project changes are made.

**This release does not implement that approval routing.** The System Administrator is the sole
authority for all account lifecycle actions described in this document — account creation,
lock/unlock/suspend/disable, and force password reset happen immediately on the Admin's action,
with no upstream approval step from a Department Manager.

This is a deliberate, confirmed scope decision for this release, not an oversight. A future phase
may route these actions through the DCOS Approval Workflow Engine (module 10-APP). Until then,
System Administrators should apply the same judgment SOP §7/§14 intended a Manager's approval to
provide — verifying the request is legitimate — informally, before acting, since the software does
not enforce a second approver.

---

## Related Documents

- `docs/02-Governance/01-SOP/01-SOP-User-Management/SOP-User-Management.md` — the full 30-section
  org-level SOP; authoritative for everything not listed in the reconciliation table above.
- `00-Master.md` — the architecture decision note this document's mapping is sourced from.
- `02-Functional-Specification.md` — full business-rule detail behind every procedure above.
- `12-Training-Guide.md` — role-based quick-reference walkthroughs of these same procedures.
