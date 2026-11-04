# 08 — API Reference
# Module USR — User Management & Account Lifecycle

Document path: docs/04-Business-Modules/02-USR-User-Management/08-API-Reference.md
Module code: USR
Module number: 02 (DCOS Module Map — Foundation)
Domain: Foundation
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-08-24
Architecture basis: implementation plan Phase 3 table; `02-Functional-Specification.md`

---

## Conventions

- Admin-facing routes live under `apps/web/app/api/admin/users/`; self-service auth routes live
  under `apps/web/app/api/auth/`.
- All admin routes require an authenticated session (`Authorization` via Supabase cookie/session,
  matching the existing `createUserClient()` pattern) and server-side authorization via
  `getActorContext()`-equivalent logic (ADMIN or HR).
- All admin routes use `createAdminClient()` (service role) for the actual writes, after
  authorizing the caller with `createUserClient()`.
- Dates: ISO 8601. Errors: `{ "error": "message", "code": "USR_ERR_CODE" }`.
- No endpoint in this module ever accepts or returns a plaintext password for anyone other than
  the authenticated user changing their own password (`/api/auth/change-password`).

---

## POST /api/admin/users/invite

Admin-only. Creates a new staff account by invitation. Replaces the current throwaway-password
`createUser` call in `apps/web/app/api/hr/employees/route.ts`.

**Request body:**
```json
{
  "full_name": "John Smith",
  "email": "john.smith@company.com",
  "employee_id": "EMP-00125",
  "department_id": "uuid",
  "position": "Structural Engineer",
  "phone": "+855 12 345 678",
  "role": "project_manager",
  "user_role_codes": ["Structural_Engineer"]
}
```

**Response 201:**
```json
{
  "id": "uuid",
  "email": "john.smith@company.com",
  "account_status": "INVITED",
  "created_at": "2026-08-24T10:00:00Z"
}
```

**Behavior:** calls `auth.admin.inviteUserByEmail()`; creates/updates `profiles` with
`account_status = 'INVITED'`; writes `account_invited` to `user_audit_logs`.

**Errors:**
- `400 USR_MISSING_FIELDS` — `full_name` or `email` missing
- `409 USR_EMAIL_EXISTS` — email already registered in `auth.users`
- `403 Forbidden` — caller is not ADMIN or HR

---

## POST /api/admin/users/[id]/force-reset

Admin-only. Triggers a password reset link for another user. Never returns a password.

**Request body:** `{}` (no body required)

**Response 200:**
```json
{
  "ok": true,
  "message": "Reset link sent to john.smith@company.com"
}
```

**Behavior:** calls `generateLink()`/`resetPasswordForEmail()` for the target user's email; writes
`force_reset_triggered` to `user_audit_logs`.

**Errors:**
- `404 USR_USER_NOT_FOUND`
- `403 Forbidden` — caller is not ADMIN or HR
- `400 USR_SELF_TARGET` — caller attempted to force-reset their own account (use
  `/api/auth/forgot-password` instead)

---

## POST /api/admin/users/[id]/lock

## POST /api/admin/users/[id]/unlock

## POST /api/admin/users/[id]/suspend

## POST /api/admin/users/[id]/disable

Admin-only. New `ACCOUNT_STATUS_ACTIONS` map alongside the existing `LIFECYCLE_ACTIONS` in
`[id]/route.ts` — same actor-check/audit-log scaffolding, new map of transitions.

**Request body (suspend/disable — optional reason):**
```json
{
  "reason": "Extended leave — returning 2026-11-01"
}
```

**Request body (lock/unlock):** `{}` (no body required)

**Response 200:**
```json
{
  "ok": true,
  "account_status": "SUSPENDED"
}
```

**Behavior:**

| Endpoint | Sets `account_status` to | Calls `signOut()` | Audit event |
|---|---|---|---|
| `lock` | `LOCKED` | Yes | `account_locked` |
| `unlock` | `ACTIVE` | No | `account_unlocked` |
| `suspend` | `SUSPENDED` | Yes | `account_suspended` |
| `disable` | `DISABLED` | Yes | `account_disabled` |

**Errors:**
- `404 USR_USER_NOT_FOUND`
- `403 Forbidden` — caller is not ADMIN or HR, or caller targeted their own account
- `409 USR_INVALID_TRANSITION` — e.g., `unlock` called on an account that is not currently
  `LOCKED` — `[TBD — human to confirm whether unlock/suspend/disable are idempotent no-ops or hard
  errors when called on an account already in the target-adjacent state]`

---

## GET /api/admin/users

List users with filters. Powers USR-01 (User Management list) and dashboard counts.

**Query params:** `?account_status=ACTIVE&department_id=uuid&role=project_manager&q=search+term`

**Response 200:**
```json
{
  "users": [
    {
      "id": "uuid",
      "full_name": "John Smith",
      "email": "john.smith@company.com",
      "employee_id": "EMP-00125",
      "department_id": "uuid",
      "department_name": "Structural",
      "role": "project_manager",
      "status": "active",
      "account_status": "ACTIVE",
      "last_login_at": "2026-08-22T08:42:00Z",
      "password_changed_at": "2026-07-01T09:00:00Z"
    }
  ],
  "total": 126
}
```

**Errors:**
- `403 Forbidden` — caller is not ADMIN or HR

---

## POST /api/auth/change-password

Requires an authenticated session. Self-service only.

**Request body:**
```json
{
  "current_password": "OldPass@2026",
  "new_password": "NewSecurePass@2026!"
}
```

**Response 200:**
```json
{
  "ok": true,
  "message": "Password changed. You have been signed out of your other devices."
}
```

**Behavior:** validates current password; validates new password against the shared policy Zod
schema (12+ chars, upper, lower, number, special); updates password; sets `password_changed_at`;
writes `password_changed`; calls `signOut()` on all sessions except the current one.

**Errors:**
- `400 USR_INVALID_CURRENT_PASSWORD`
- `400 USR_PASSWORD_POLICY` — new password fails policy; body includes which rule(s) failed
- `401 Unauthorized` — no active session

---

## POST /api/auth/forgot-password

Unauthenticated. Email-enumeration-safe.

**Request body:**
```json
{
  "email": "john.smith@company.com"
}
```

**Response 200 (always, regardless of match):**
```json
{
  "ok": true,
  "message": "If an account exists for this email, a password reset link has been sent."
}
```

**Behavior:** checks for a matching account; calls `resetPasswordForEmail()` only if matched;
writes `password_reset_requested` only if matched. Response body and timing must not differ based
on match — see `09-Test-Plan.md` for the non-enumeration test.

**Errors:** none that reveal account existence. Only a `400` for a malformed email is returned as
a distinguishable error (input validation, not existence disclosure).

---

## POST /api/auth/reset-password

Consumes the Supabase recovery token from the query string/hash the client received via email
link. Serves both first-activation (F2) and routine password reset (F6).

**Request body:**
```json
{
  "new_password": "NewSecurePass@2026!"
}
```
(Supabase recovery session is established client-side via the token before this call; the server
route operates within that recovery session context — exact implementation detail for
`backend-engineer`, matching however `auth-helpers`/`ssr` in this repo's Supabase version expects
the recovery flow to be completed.)

**Response 200:**
```json
{
  "ok": true,
  "account_status": "ACTIVE",
  "was_activation": true
}
```

**Behavior:** sets new password; if `account_status` was `INVITED`, flips to `ACTIVE` and sets
`first_login_at`; writes `account_activated` (if `was_activation`) or `password_reset_completed`
(otherwise).

**Errors:**
- `400 USR_INVALID_TOKEN` — expired or already-used recovery token
- `400 USR_PASSWORD_POLICY`

---

## GET /api/admin/dashboard/account-summary

Powers USR-05 (Security Overview) and USR-11 (Admin Dashboard Widget).

**Response 200:**
```json
{
  "counts": {
    "INVITED": 4,
    "ACTIVE": 117,
    "LOCKED": 2,
    "SUSPENDED": 1,
    "DISABLED": 2
  },
  "total": 126,
  "recent_activity": [
    {
      "id": "uuid",
      "event_type": "account_locked",
      "actor_name": "Admin User",
      "actor_id": "uuid",
      "user_name": "David Chan",
      "user_id": "uuid",
      "created_at": "2026-08-24T08:10:00Z"
    },
    {
      "id": "uuid",
      "event_type": "account_auto_disabled_inactivity",
      "actor_name": "System",
      "actor_id": null,
      "user_name": "Mary Lee",
      "user_id": "uuid",
      "created_at": "2026-08-24T02:00:03Z"
    }
  ]
}
```

**Behavior note:** `actor_name` is `"System"` whenever `actor_id IS NULL` (§`04-Database-Schema.md`
§9, BR8.03) — the API, not just the UI, should resolve this so every consumer gets the correct
label without re-implementing the null check.

**Errors:**
- `403 Forbidden` — caller is not ADMIN or HR
