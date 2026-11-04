# 05 — Integration Specification
# Module USR — User Management & Account Lifecycle

Document path: docs/04-Business-Modules/02-USR-User-Management/05-Integration-Specification.md
Module code: USR
Module number: 02 (DCOS Module Map — Foundation)
Domain: Foundation
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-08-24

---

## 1. Supabase Auth Admin API Usage

All Admin API calls run server-side only, via `createAdminClient()` (`apps/web/lib/supabase/
server.ts`) using the service role key. Never called from the browser client.

| Supabase Auth Admin API | Used by | Purpose |
|---|---|---|
| `auth.admin.inviteUserByEmail(email, options)` | `POST /api/admin/users/invite` (F1) | Creates the `auth.users` row and sends the activation email in one call. `options.data` may carry `full_name` for `handle_new_user()`'s metadata read. Never passes a password. |
| `auth.admin.generateLink({ type: 'recovery', email })` / `resetPasswordForEmail(email)` | `POST /api/admin/users/[id]/force-reset` (F7), `POST /api/auth/forgot-password` (F6) | Generates or sends a recovery-type link. Same underlying mechanism serves activation (F2, via invite's own link), forgot-password (F6), and admin force-reset (F7) — all three are "someone gets a link that lets them set a new password." |
| `auth.admin.listUsers()` | `GET /api/admin/users` (dashboard/list) | Cross-referenced with `profiles` for the User Management list and dashboard counts. Used sparingly — `profiles` is the primary read source; `listUsers()` is only needed where `auth.users`-only fields (e.g., `email_confirmed_at`) are relevant. |
| `auth.admin.signOut(userId)` | `ACCOUNT_STATUS_ACTIONS` lock/suspend/disable (F3), HR `LIFECYCLE_ACTIONS` side effects (F4), change-password (F5) | Revokes the target user's active session(s). See §4 below for the verification note on immediacy. |

**Never used:** `auth.admin.createUser()` with a caller-supplied password — this is exactly the
pattern this module replaces (the current `apps/web/app/api/hr/employees/route.ts` throwaway-
password behaviour). `auth.admin.updateUserById()` to set a password directly on a user's behalf
is likewise not used by any endpoint in this module; Admin never sets or sees a password (§01
Business Requirement, SC1).

---

## 2. Email Templates

Supabase's built-in email templates are reused, not replaced, for all token-based flows —
activation and password reset are the same underlying Supabase "recovery" email type, so the
template content must speak to both without being confusing.

| Template | Supabase template slot | Content requirements |
|---|---|---|
| Invite / Activation | "Invite user" | Subject: "Your DCOS account has been created." Body: identifies the sender org, states the recipient's email, contains the `{{ .ConfirmationURL }}` activation link, states the link's expiry window. Matches the source spec's §6 recommended wording. |
| Password Reset | "Reset password" | Subject: "Reset your DCOS password." Body: contains `{{ .ConfirmationURL }}`, states the link's expiry window, includes a "If you did not request this, ignore this email" line (defense against forgot-password being triggered by someone else entering the victim's email — the account itself is never at risk since no password is changed without completing the link). |

**Redirect URL:** both templates' confirmation link must resolve to `/reset-password` in the DCOS
web app (see `06-UI-UX-Design.md`), which is responsible for detecting whether this is an
activation (`account_status = 'INVITED'`) or a routine reset and adjusting on-screen copy
accordingly — the backend logic (BR2.02/BR6.04) is identical either way; only the UI copy differs.
Full redirect URL / SMTP configuration is in `10-Deployment-Notes.md`.

---

## 3. Shared Dependency — `is_admin()` / `is_hr()` Helper Functions

Per `00-Master.md` §11 Hand-off Checklist, these two SQL functions (full design in
`04-Database-Schema.md` §4) are documented here as a **shared dependency other DCOS modules may
reuse**, not a USR-private implementation detail:

```sql
public.is_admin(uid uuid default auth.uid()) returns boolean
public.is_hr(uid uuid default auth.uid())    returns boolean
```

Any future module needing an "is this user privileged" RLS check should call these functions
rather than re-implementing the `profiles.role` ∪ `user_roles.role_code` union inline. This keeps
the two-role-system duality (flagged in `04-Database-Schema.md` §4 and `07-RBAC-Matrix.md`) from
being re-derived incorrectly in a second location.

---

## 4. Verification Item — Session Revocation Semantics

`auth.admin.signOut(userId)`'s exact behaviour against an **already-issued, in-flight JWT** is not
assumed in this module's design: it may only invalidate the refresh token (blocking future token
renewal) rather than immediately killing a currently-valid access token still within its expiry
window. This determines whether "immediately revokes active sessions" (SC3, BR3.03) is fully
satisfiable without additional middleware (e.g., a shorter JWT expiry, or a per-request
`account_status` check added to a shared request guard).

**This must be verified against the live Supabase project, not assumed**, before Phase 5 QA
sign-off — see `09-Test-Plan.md` for the corresponding test. If verification shows `signOut()`
alone is insufficient for a true "immediate" revocation, a follow-up scope item (shorter JWT
expiry, or middleware-level `account_status` gate) is `[TBD — human to confirm scope]`.

---

## 5. Integration Points with Other DCOS Areas

| Integration | Direction | Purpose |
|---|---|---|
| Employee Master / HR (`apps/web/app/api/hr/employees/[id]/route.ts`) | USR extends HR's existing handler | `LIFECYCLE_ACTIONS` gains `account_status` side effects (F4) in the same transaction as the existing `profiles.status` update. No new endpoint; existing endpoint extended in place. |
| `apps/web/app/api/hr/employees/route.ts` (POST) | USR replaces this endpoint's account-creation mechanism | The throwaway-random-password `auth.admin.createUser()` call is replaced by the invite flow (F1). |
| `departments` table (existing) | USR reads | Populates the invite form's and edit sheet's department `Select`, replacing the free-text field (F1, `04-Database-Schema.md` §3). |
| `roles` / `role_permissions` / `user_roles` (existing RBAC schema) | USR reads and reuses | Role assignment on invite (F1) writes to `user_roles`. RLS tightening on these tables is USR-owned per `04-Database-Schema.md` §5, but the permission model itself is not redesigned (`07-RBAC-Matrix.md`). |
| `user_audit_logs` (existing table) | USR writes | All account-lifecycle events (F1–F8) — canonical vocabulary in `04-Database-Schema.md` §9. |
| Sidebar navigation (`apps/web/components/dashboard/sidebar.tsx`) | USR extends | New Administration nav items — routes and gating in `06-UI-UX-Design.md`. |
| `apps/web/hooks/use-supabase-auth.ts` (existing hook) | USR extends | Gains `changePassword`, `requestPasswordReset`, `confirmPasswordReset` methods wrapping the new `/api/auth/*` endpoints. |
| `apps/web/components/landing/auth-form.tsx` | USR wires up | The existing dead "Forgot password?" stub is connected to the new `/forgot-password` route. |
| `pg_cron` (Supabase extension) | USR schedules | Daily 90-day auto-disable job — see `04-Database-Schema.md` §8 and `10-Deployment-Notes.md`. |
| Notification Engine (future/shared) | USR does not integrate in this release | Account lifecycle events are written to `user_audit_logs` only. Email delivery for invite/reset is handled entirely by Supabase Auth's own email sending, not DCOS's in-app Notification Engine. In-app notifications for these events (e.g., "Your account was suspended") are `[TBD — human to confirm if needed in R0 or deferred]`. |
| 10-APP Approval Workflow Engine (future) | Not integrated | Per `01-Business-Requirement.md` §6 Out of Scope — System Admin is sole authority in this release. |

---

## 6. What This Module Does Not Integrate With

- No LDAP/Active Directory/SCIM provisioning.
- No third-party MFA provider (SOP §9 lists MFA as a future requirement, not built here).
- No generic cross-module Audit Log Engine (`12-AUD` reserved code) — this module documents and
  extends `user_audit_logs` directly.
