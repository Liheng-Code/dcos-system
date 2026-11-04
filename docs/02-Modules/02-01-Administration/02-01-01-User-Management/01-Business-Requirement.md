# 01 — Business Requirement
# Module USR — User Management & Account Lifecycle

Document path: docs/04-Business-Modules/02-USR-User-Management/01-Business-Requirement.md
Module code: USR
Module number: 02 (DCOS Module Map — Foundation)
Domain: Foundation
Owner: System Admin / HR
Phase: Phase 1 (Foundation)
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-08-24
Reconciles: `docs/02-Governance/01-SOP/01-SOP-User-Management/SOP-User-Management.md`
Architecture basis: `00-Master.md` (Phase 0 decisions, approved by human 2026-08-24)

---

## 1. Business Problem

DCOS today has no controlled, auditable way to manage who can log in and what they can do once
logged in, separate from their HR employment record:

- Staff accounts are created through the HR "Add Employee" form, which generates a throwaway
  random password server-side and force-confirms the email. No activation link is ever sent, no
  one ever validates that the email address is real, and the System Admin either has to invent a
  password to hand over informally or the account is simply unusable until someone resets it.
- Login/access state is not modeled at all. The only status field on a staff record
  (`profiles.status`) is a 15-value HR employment lifecycle enum (`draft` … `archived`). There is
  no way to say "this account cannot log in right now" independent of the person's employment
  stage — an admin cannot lock a single account for a security concern without also touching HR
  employment data, and there is no `locked` value in the system at all.
- `profiles`, `roles`, `role_permissions`, and `user_roles` — the four tables that decide who can
  see and change what — currently have `USING (true)` row-level-security policies. Any signed-in
  user can read or write any other user's role or profile record via the Supabase client directly
  from the browser.
- There is no self-service credential flow. `/login`, `/forgot-password`, and `/reset-password`
  do not exist as routes. The "Forgot password?" link on the landing page's auth form is a dead
  stub with no handler wired to it.
- The Settings UI can edit an existing staff member's fields but cannot create a new user, has no
  Security actions (lock/suspend/disable/force-reset), no Audit Log page, and binds "department"
  to free text instead of the real `departments` table.
- SOP-UM-001 (`SOP-User-Management.md`) already defines the intended process — activation,
  suspension, termination, password policy, a 90-day inactivity rule, and audit requirements —
  but no part of it is implemented in the running system today.

Module USR closes this gap: it gives the System Admin sole, auditable authority over the account
lifecycle (create → invite → activate → lock/suspend/disable), gives staff clean self-service
control over their own credentials, and tightens the currently wide-open RLS on the four core
identity tables — without touching the existing HR employment lifecycle, which continues to work
exactly as it does today.

---

## 2. Primary Actors and Their Goals

| Actor | Role in DCOS | Goals in This Module |
|---|---|---|
| System Administrator | Sole authority for account lifecycle actions | Create staff accounts by invitation (never sets a password); lock/unlock, suspend, disable accounts; force a password reset for a staff member who is locked out; view account status and login activity across the organisation; review the audit trail. |
| HR Manager | Owns the employee master record (`profiles.status`) | Runs the existing employment lifecycle (submit/approve/activate/suspend/terminate/retire/resign/archive); relies on this module to keep `account_status` correctly synchronised with employment changes so a terminated employee cannot still log in. |
| Staff member (any role) | Day-to-day DCOS user | Activates their account from an emailed link and sets their own password (Admin never sees it); changes their own password; recovers access via "Forgot password" without ever having to call anyone; sees their own account status and last login on their profile. |
| Department Manager | Requests staff changes (per SOP §5, §7) | Out of scope for this release — see §6 Out of Scope. Retained here only because the SOP names this actor; no approval-routing UI is built for them in this phase. |

---

## 3. Success Criteria (Measurable Outcomes)

SC1. A System Admin can create a new staff account (identity + role + department) and the
     recipient receives a working activation email within the account creation flow — the Admin
     never sees or sets a password at any point.

SC2. A staff member can click the activation link, set their own password once, and immediately
     reach an `ACTIVE` account without any additional Admin step.

SC3. A System Admin can lock, unlock, suspend, or disable any account in under three clicks from
     the User Management screen, with the action taking effect on the account immediately
     (including revocation of any live session for suspend/disable).

SC4. A staff member who forgets their password can recover access entirely on their own, and the
     system's response to a forgot-password request is identical in wording and timing whether or
     not the email address belongs to a real account (no account enumeration).

SC5. A System Admin can trigger a force password reset for any staff member without ever knowing
     or setting their new password.

SC6. Every account-lifecycle action (invite, activate, password change, password reset request,
     lock, unlock, suspend, disable, force-reset, session revoke, auto-disable) is written to
     `user_audit_logs` with actor, timestamp, old value, and new value — matching SOP §23.

SC7. An account that has not logged in for 90 consecutive days while `ACTIVE` is automatically
     moved to `DISABLED` by the system (not a person), matching SOP §21, without ever
     auto-disabling an account that has never completed activation (`INVITED`) or that is already
     in a non-`ACTIVE` state.

SC8. `profiles`, `roles`, `role_permissions`, and `user_roles` no longer allow an arbitrary
     signed-in user to write another user's role, account status, or department — writes are
     restricted to the acting user's own non-privileged fields, or to System Admin / HR, enforced
     at the database layer (RLS + trigger), not only in the UI.

SC9. A staff member can view and edit their own non-privileged profile fields but cannot change
     their own `role`, `account_status`, `status`, `department_id`, `email`, or `user_code` —
     attempting to do so is rejected by the database itself, regardless of which code path issues
     the write.

---

## 4. Data Ownership Model

Restated from `00-Master.md` §3 — this is the foundational separation the rest of this pack
builds on:

| Column | Meaning | Owner | Who writes it |
|---|---|---|---|
| `profiles.status` | HR employment lifecycle (`draft` → … → `archived`) | HR (Employee Master domain) | HR `LIFECYCLE_ACTIONS`, HR actors only |
| `profiles.account_status` | Login/access lifecycle (this module) | System Admin | `ACCOUNT_STATUS_ACTIONS` (new), invite/activate/reset endpoints, and the 90-day auto-disable job |

The two columns are independent but not disconnected — certain HR lifecycle actions have a
defined, one-way side effect on `account_status` (see `02-Functional-Specification.md` §F4). No
part of this module modifies `profiles_status_check` or the existing `LIFECYCLE_ACTIONS` map.

---

## 5. SOP Reconciliation Summary

Reproduced from `00-Master.md` §9 (the full analysis, not repeated here). This is the guide
`11-SOP.md` uses to write its delta document rather than duplicating `SOP-User-Management.md`.

| SOP section | SOP text | Reconciliation |
|---|---|---|
| §9 Account Activation | "Initial Password: System generated... First Login: Change Password. Mandatory." | **Delta.** Superseded — email activation link, Admin never sets/sees a password. Outcome preserved: user sets their own password before first real use. |
| §16 Password Reset Procedure | "System Admin: Reset Password... User must change password upon next login." | **Compatible, wording updates only.** "Reset Password" now means "trigger a reset link," not "set a literal password." Outcome unchanged. |
| §17 User Suspension | Reasons include "Extended Leave"; suspended users cannot log in. | **Consistent** — directly informs the `long_leave → SUSPENDED` backfill mapping. |
| §18 User Termination | "Deactivate Account / Remove Sessions / Lock Access." | **Consistent** — matches `revoke:true` + `account_status = DISABLED` on HR terminate/retire/deceased/archive/resign. |
| §19 User Archive | "Never deleted... Read Only." | **Consistent** — no DELETE policy on `profiles`; matches the existing `archive` read-only guard. |
| §21 Inactive Account Policy | 90-day auto-disable, reactivation needs approval. | **In scope this release** (was a gap in the original plan; added per `00-Master.md` §8.3). System-initiated `pg_cron` job; reactivation still requires System Admin action. |
| §23 Audit Requirements | Login, Logout, Password Reset, Role Change, Project Assignment, User Creation, User Deactivation must be logged; records cannot be deleted. | **Consistent** with `user_audit_logs` (append-only, no DELETE policy). Canonical event-type vocabulary is mapped in `04-Database-Schema.md`. |
| §25 User Status Definitions | `Pending / Active / Suspended / Disabled / Archived` — flat, single status, no `Locked`. | **Delta, expected.** SOP predates the two-column split and predates `LOCKED`. Mapping table is in `04-Database-Schema.md` (reproduced from `00-Master.md` §3). |
| §7 / §14 Request & approval chain | Manager → System Admin approval required for creation and for role/department/project changes. | **Deviation — accepted.** See §6 below. |

---

## 6. Out of Scope

- **Multi-step request/approval routing (SOP §7, §14) is not implemented in this release —
  System Admin is sole authority for account lifecycle actions. A future phase may route these
  actions through the Approval Workflow Engine (module 10-APP).**
- Automatic failed-login-attempt lockout. `LOCKED` is admin-manual-only in this release (Open
  Question 8.1, resolved Option A). No `login_attempts` table is built.
- Multi-Factor Authentication (SOP §9 lists this as a future requirement — not built here).
- A dedicated `login_attempts`, `user_sessions`, `user_credentials`, or `email_verification_tokens`
  table as separately enumerated in the original informal spec (`System Admin should control
  account.md` §16) — DCOS already has `auth.users` (Supabase-managed) for credentials/sessions and
  `profiles` for the application-level identity record; this module does not fork a parallel
  identity schema.
- A generic, cross-module Audit Log Engine (module `12-AUD`). This module documents and extends
  the existing `user_audit_logs` table and canonical event vocabulary; a shared audit engine for
  all DCOS modules remains a future architectural effort.
- Resolving the duplication between `profiles.role` (legacy single-value column) and the granular
  `roles` / `role_permissions` / `user_roles` RBAC system. Both are honoured everywhere this
  module checks privilege (see `07-RBAC-Matrix.md`), but converging them into one system is a
  separate future ADR.
- A `profiles_directory` view that would let non-sensitive profile fields (name, avatar,
  department, role) be read broadly while genuinely restricting the rest of `profiles`. The RLS
  approach in this module keeps `profiles` SELECT broad for all authenticated users, as it is
  today, for the reasons in `04-Database-Schema.md` §RLS.
- Tenant isolation (`tenant_id`) on any of the affected tables — none exists today anywhere in
  this schema; DCOS is single-tenant in practice and this module does not introduce a tenant
  boundary.
- Native binary import/export of user directories (e.g., Active Directory / LDAP sync, SCIM
  provisioning).

---

## 7. Related Modules

| Module | Relationship |
|---|---|
| Employee Master / HR (existing, `apps/web/app/api/hr/employees`) | Owns `profiles.status` and the `LIFECYCLE_ACTIONS` engine. This module adds `account_status` side effects to specific HR transitions without modifying HR-owned logic. |
| 03-RBAC (reserved code, no folder yet) | This module's `07-RBAC-Matrix.md` documents who may invoke USR/ADM actions against the existing `roles` / `role_permissions` / `user_roles` schema; it does not redesign RBAC. |
| 04-ADM — Admin Configuration (reserved code) | Departments CRUD and the Security/Audit Log admin surfaces built in this module are the first concrete pieces of the eventual 04-ADM domain. |
| 12-AUD — Audit Log Engine (reserved code) | This module documents the canonical `user_audit_logs` event vocabulary as the working precedent; a generic cross-module audit engine remains a future effort. |
| 10-APP — Approval Workflow Engine | Named as the future home for SOP §7/§14 approval routing, per §6 Out of Scope above. Not integrated in this release. |

---

## 8. Open Items Carried Into This Pack

All Phase 0 open questions were resolved by the human on 2026-08-24 (`00-Master.md` §8/§10). None
remain blocking for Docs 01–12. The one item still flagged for a future decision, not blocking
this release:

- **`profiles.role` vs. RBAC `role_permissions`/`user_roles` duplication** — both systems are
  unioned everywhere privilege is checked in this module, consistent with the existing precedent
  in `getActorContext()`. Convergence into a single role system needs its own future ADR.
