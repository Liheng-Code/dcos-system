# 04 — Database Schema
# Module USR — User Management & Account Lifecycle

Document path: docs/04-Business-Modules/02-USR-User-Management/04-Database-Schema.md
Module code: USR
Module number: 02 (DCOS Module Map — Foundation)
Domain: Foundation
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-08-24
Architecture basis: `00-Master.md` §3, §5, §7, §8.3, §8.5

---

## Architecture Decision

This module does **not** create a parallel identity schema. `profiles` (existing), `auth.users`
(Supabase-managed), `departments` (existing), `roles`/`role_permissions`/`user_roles` (existing),
and `user_audit_logs` (existing) are extended in place. `profiles.status` (HR employment lifecycle)
and `profiles_status_check` are **not modified**. `tenant_id` is intentionally absent from every
table touched by this module — see §7 below.

---

## 1. `profiles.account_status` — New Column

```sql
alter table public.profiles
  add column if not exists account_status text not null default 'INVITED'
    check (account_status in ('INVITED', 'ACTIVE', 'LOCKED', 'SUSPENDED', 'DISABLED'));

create index if not exists idx_profiles_account_status on public.profiles(account_status);
```

**Ownership:** System Admin (login/access lifecycle). Independent of `profiles.status` (HR
employment lifecycle, HR-owned). See `01-Business-Requirement.md` §4 for the full ownership model.

**Who writes it:**
- Invite endpoint sets `INVITED` on account creation (not the `handle_new_user()` trigger — verify
  that trigger's `insert` does not clobber a value this module sets in a follow-up update; the
  invite flow should set `account_status` explicitly after the `auth.users` row exists).
- Activation / password-reset endpoint flips `INVITED → ACTIVE` on successful password set.
- `ACCOUNT_STATUS_ACTIONS` (new, Admin-only) sets `LOCKED`/`ACTIVE`/`SUSPENDED`/`DISABLED` per
  `02-Functional-Specification.md` §F3.
- HR `LIFECYCLE_ACTIONS` (existing engine, extended) sets `SUSPENDED`/`DISABLED`/`ACTIVE` as a side
  effect per `02-Functional-Specification.md` §F4.
- The `pg_cron` auto-disable job (§8 below) sets `DISABLED`, `actor_id = NULL`.

**Not touched by this column:** `profiles.status`, `profiles_status_check`, the existing
`LIFECYCLE_ACTIONS` map's `status` values.

---

## 2. Backfill Mapping — `profiles.status` → `account_status`

Reproduced verbatim from `00-Master.md` §3. This mapping must be reproduced exactly in the Phase 2
migration's backfill `UPDATE` statements — all 15 values of `profiles_status_check` are covered.

| `status` value | → `account_status` | Basis |
|---|---|---|
| `active` | `ACTIVE` | Confirmed |
| `suspended` | `SUSPENDED` | Confirmed |
| `resigned` | `DISABLED` | Confirmed — terminal separation |
| `terminated` | `DISABLED` | Confirmed — terminal separation |
| `retired` | `DISABLED` | Confirmed — terminal separation |
| `deceased` | `DISABLED` | Confirmed — terminal separation |
| `archived` | `DISABLED` | Confirmed — terminal separation |
| `draft` | `INVITED` | Confirmed — not yet a working, logged-in account |
| `pending` | `INVITED` | Confirmed — not yet a working, logged-in account |
| `pending_approval` | `INVITED` | Confirmed — not yet a working, logged-in account |
| `approved` | `INVITED` | Confirmed — not yet a working, logged-in account |
| `probation` | `INVITED` | Confirmed — not yet a working, logged-in account |
| `disabled` | `DISABLED` | Gap closed — distinct HR value meaning the employment record itself is administratively deactivated short of full termination; terminal enough to map to `DISABLED` |
| `long_leave` | `SUSPENDED` | Gap closed — SOP §17 lists "Extended Leave" as a suspension reason; reversible, matches `SUSPENDED` semantics |
| `inactive` | `SUSPENDED` | Gap closed, lower confidence — no SOP or code definition distinct from the other 14 values; treated as reversible/non-terminal by default (safer than `DISABLED`, which requires an explicit reactivation approval per SOP §21) |

Example backfill statement shape (illustrative — database-engineer finalises the exact migration):

```sql
update public.profiles set account_status = case status
  when 'active'            then 'ACTIVE'
  when 'suspended'         then 'SUSPENDED'
  when 'resigned'          then 'DISABLED'
  when 'terminated'        then 'DISABLED'
  when 'retired'           then 'DISABLED'
  when 'deceased'          then 'DISABLED'
  when 'archived'          then 'DISABLED'
  when 'draft'             then 'INVITED'
  when 'pending'           then 'INVITED'
  when 'pending_approval'  then 'INVITED'
  when 'approved'          then 'INVITED'
  when 'probation'         then 'INVITED'
  when 'disabled'          then 'DISABLED'
  when 'long_leave'        then 'SUSPENDED'
  when 'inactive'          then 'SUSPENDED'
  else 'INVITED'
end;
```

---

## 3. Departments Wiring

```sql
alter table public.profiles
  add column if not exists department_id uuid references public.departments(id) on delete set null;

create index if not exists idx_profiles_department_id on public.profiles(department_id);
```

- `public.departments` already exists (`20260527000030_create_hr_organization_tables.sql`):
  `id, department_code, department_name, description, parent_id, department_head, created_at,
  updated_at` — hierarchical (self-referencing `parent_id`).
- `profiles.department` (text) is **kept** as a deprecated display fallback — not dropped in this
  release.
- Backfill: match `profiles.department` (case-insensitive) against `departments.department_name`;
  unmatched rows keep `department_id = NULL` and retain their original `department` text for
  manual admin reconciliation post-migration. **No fuzzy matching** — an unresolved match is safer
  than a wrong one.
- UI cutover: the free-text `department` `Input` in `staff-edit-sheet.tsx` becomes a `Select` bound
  to `department_id`, sourced from `public.departments`.
- `department_id` is added to both `PROFILE_UPDATE_FIELDS` and `SENSITIVE_FIELDS` in
  `apps/web/app/api/hr/employees/[id]/route.ts`. Whether the legacy `department` text field stays
  writable during the transition period is a Phase 3 implementation call, not fixed here.

---

## 4. RLS Helper Functions — `is_admin()` / `is_hr()`

No `is_admin()`-style helper exists anywhere in the current migration history. The only working
precedent is `user_audit_logs`'s inline `EXISTS` check and the application-layer
`getActorContext()` in `[id]/route.ts`, which unions `profiles.role` (legacy single-value column)
with `user_roles.role_code` before checking membership in `HR_ROLE_CODES = {HR_Manager, admin}`.

```sql
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  )
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = uid and ur.role_code in ('admin')
  );
$$;

create or replace function public.is_hr(uid uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role in ('admin', 'HR_Manager')
  )
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = uid and ur.role_code in ('admin', 'HR_Manager')
  );
$$;
```

**Design note:** `is_hr()` includes `admin` (matching the existing `HR_ROLE_CODES` set — admin and
HR are treated as an equivalent-authority set for this module's purposes). Every new policy in
this document calls these functions rather than repeating the `EXISTS` boilerplate.

**Flag — two overlapping role systems (not resolved here):** `profiles.role` (legacy, single
value, 5-value hardcoded list) and `roles`/`role_permissions`/`user_roles` (the real, granular RBAC
system) currently coexist and are both checked, unioned, wherever "is this user privileged"
matters. This module does not resolve that duplication — every admin-check introduced here must
keep checking **both**, matching the existing precedent, or a user who only holds an RBAC
`role_code` (no legacy `profiles.role`) would be silently locked out of things they should be able
to do. Flagged for a future ADR.

---

## 5. RLS Policy Shapes

Replaces the `USING (true)` policies from `20260602000057_enable_rls_core_tables.sql` on the four
core tables. `approval_thresholds` (same migration, same wide-open pattern) stays **out of scope**
— not touched by this module.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | **Stays broad** (`true` for `authenticated`) — see rationale below | No policy for `authenticated` (default deny) — creation only via `handle_new_user()` trigger (`SECURITY DEFINER`, bypasses RLS) or admin-client backend routes (service role, bypasses RLS) | `id = auth.uid() OR is_admin() OR is_hr()`, **plus the BEFORE UPDATE trigger in §6** | No policy (default deny) — matches SOP §19 "never deleted"; use `status`/`account_status` transitions, not row deletion |
| `roles` | Stays broad (`true`) — config/lookup table, already read client-side without gating | `is_admin()` | `is_admin()` | `is_admin()` |
| `role_permissions` | Stays broad (`true`) | `is_admin()` | `is_admin()` | `is_admin()` |
| `user_roles` | Stays broad (`true`) — approval/assignment lookups across other modules depend on reading "who holds which role" broadly | `is_admin()` | `is_admin()` | `is_admin()` |

**Why `profiles` SELECT stays broad, not tightened — this is a deliberate decision, not an
oversight; do not "improve" on it.** Postgres RLS cannot restrict which *columns* a SELECT
returns — only which *rows*. `profiles` is read broadly across the entire platform today (task
assignee pickers, approver dropdowns, WBS ownership display, the sidebar's own `isAdmin` check)
for non-sensitive fields (`full_name`, `avatar_url`, `department`, `role`). Restricting `profiles`
SELECT to self-or-admin would break every one of those cross-module lookups. The DCOS RLS
remediation tracker's own guidance makes the same call for genuine reference-style reads:
permissive **read** is often reasonable; the real risk is on **writes**. A future
`profiles_directory` view (name/avatar/department/role only, safe for broad exposure, with
sensitive HR/PII columns behind a genuinely restricted `profiles` read) is the architecturally
cleaner long-term fix; it is a larger, repo-wide refactor and is out of scope for this module.

Example policy shape (illustrative — database-engineer finalises exact SQL):

```sql
drop policy if exists "profiles_authenticated_all" on public.profiles;

create policy "profiles_select_all" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin() or public.is_hr())
  with check (id = auth.uid() or public.is_admin() or public.is_hr());

-- No INSERT or DELETE policy for `authenticated` — both default-deny.
-- Row creation happens only via handle_new_user() (SECURITY DEFINER) or the
-- service-role admin client used by backend API routes.
```

```sql
drop policy if exists "roles_authenticated_all" on public.roles;
create policy "roles_select_all"  on public.roles for select to authenticated using (true);
create policy "roles_admin_write" on public.roles for insert to authenticated with check (public.is_admin());
create policy "roles_admin_update" on public.roles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "roles_admin_delete" on public.roles for delete to authenticated using (public.is_admin());
-- role_permissions and user_roles follow the identical shape.
```

---

## 6. `BEFORE UPDATE` Trigger — Column-Level Self-Edit Restriction

RLS's `UPDATE` policy above (`id = auth.uid() OR is_admin() OR is_hr()`) permits a staff member to
update their own row, but cannot restrict *which columns* they change within it. A trigger closes
that gap so the restriction holds regardless of which client issues the write — the dominant
pattern in this codebase is direct-Supabase-client writes from React components (the sidebar
itself queries `profiles` directly from the browser client), so app-layer-only enforcement would
protect only the one form that happens to omit these fields from its payload.

**Protected column set:** `role`, `account_status`, `status`, `department_id`, `email`,
`user_code`.

**Design intent** (database-engineer implements the exact PL/pgSQL):

```sql
create or replace function public.fn_guard_profiles_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Service-role traffic (our own trusted backend/admin-client routes — ACCOUNT_STATUS_ACTIONS,
  -- LIFECYCLE_ACTIONS, invite/activation endpoints) must remain unaffected. Triggers fire on
  -- every UPDATE regardless of RLS bypass, so this is the one place service-role traffic must be
  -- explicitly exempted rather than assumed exempt.
  if current_setting('request.jwt.claim.role', true) = 'service_role' then
    return new;
  end if;

  if public.is_admin(auth.uid()) or public.is_hr(auth.uid()) then
    return new;
  end if;

  if new.role            is distinct from old.role
     or new.account_status is distinct from old.account_status
     or new.status          is distinct from old.status
     or new.department_id   is distinct from old.department_id
     or new.email            is distinct from old.email
     or new.user_code        is distinct from old.user_code
  then
    raise exception 'You are not permitted to change role, account_status, status, department_id, email, or user_code on this record.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profiles_protected_columns on public.profiles;
create trigger trg_guard_profiles_protected_columns
  before update on public.profiles
  for each row execute function public.fn_guard_profiles_protected_columns();
```

This complements, not replaces, the RLS `UPDATE` policy in §5 — RLS decides *which rows* a
self-edit may touch (their own), the trigger decides *which columns* within that row.

---

## 7. Tenant Isolation — Intentionally Absent

`profiles`, `roles`, `role_permissions`, `user_roles`, `departments` have no `tenant_id` column
anywhere in the migration history. This is a pre-existing, repo-wide condition — DCOS is currently
single-tenant in practice — not something introduced by or fixable within this module.
**Decision: do not add `tenant_id` in this pass.** The RLS policies in §5 are role/self-scoped, not
tenant-scoped, because there is no tenant boundary anywhere in this codebase yet to enforce.

---

## 8. `pg_cron` Auto-Disable Job

Supabase `pg_cron` is preferred over an Edge Function — no Edge Functions exist elsewhere in this
repo yet, and this job is a straightforward scheduled SQL statement.

```sql
-- Enable the extension once, if not already enabled.
create extension if not exists pg_cron;

create or replace function public.fn_auto_disable_inactive_accounts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select id from public.profiles
    where account_status = 'ACTIVE'
      and last_login_at is not null
      and last_login_at < now() - interval '90 days'
  loop
    update public.profiles
      set account_status = 'DISABLED'
      where id = r.id;

    insert into public.user_audit_logs (user_id, actor_id, event_type, old_value, new_value, note)
      values (
        r.id,
        null,
        'account_auto_disabled_inactivity',
        jsonb_build_object('account_status', 'ACTIVE'),
        jsonb_build_object('account_status', 'DISABLED'),
        'Automatically disabled after 90 days of inactivity (SOP §21).'
      );
  end loop;
end;
$$;

select cron.schedule(
  'usr_auto_disable_inactive_accounts',
  '0 2 * * *',  -- daily at 02:00
  $$ select public.fn_auto_disable_inactive_accounts(); $$
);
```

**Scoping is load-bearing:** the `WHERE` clause matches only `account_status = 'ACTIVE'`. This
must never widen to include `INVITED` (never-logged-in accounts, `last_login_at IS NULL`, are
correctly excluded by both the `account_status` and `last_login_at is not null` conditions),
`LOCKED`, `SUSPENDED`, or already-`DISABLED` accounts — see `02-Functional-Specification.md` §F8,
BR8.02.

**Reactivation:** the job never re-enables an account it disabled. Reactivation is exclusively a
System Admin action (`unlock`/reactivate, §F3), matching SOP §21's "reactivation requires
approval."

---

## 9. Audit Event-Type Vocabulary

`user_audit_logs.event_type` is free-text (no schema change to the table itself). The canonical
set for this module:

| `event_type` | Written by | `actor_id` | SOP §23 mapping |
|---|---|---|---|
| `account_invited` | Invite endpoint (F1) | Admin/HR | User Creation |
| `account_activated` | Activation completion (F2) | Self | — (activation completion) |
| `password_changed` | Change-password endpoint (F5) | Self | Password Reset (analogous) |
| `password_reset_requested` | Forgot-password endpoint, matching account only (F6) | Self (the account owner, even though unauthenticated at request time) | Password Reset |
| `password_reset_completed` | Reset-password completion (F6) | Self | Password Reset |
| `force_reset_triggered` | Admin force-reset endpoint (F7) | Admin | Password Reset |
| `account_locked` | Admin lock action (F3) | Admin | User Deactivation (analogous) |
| `account_unlocked` | Admin unlock action (F3) | Admin | — |
| `account_suspended` | Admin suspend action, or HR `suspend`/`long_leave` side effect (F3/F4) | Admin or HR | User Deactivation (analogous) |
| `account_disabled` | Admin disable action, or HR `terminate`/`retire`/`deceased`/`archive`/`resign` side effect (F3/F4) | Admin or HR | User Deactivation |
| `account_auto_disabled_inactivity` | `pg_cron` job (F8) — **added per `00-Master.md` §8.3** | `NULL` — render as "System" in any UI/report | User Deactivation |
| `session_revoked` | Any action that calls `auth.admin.signOut()` (lock/suspend/disable/change-password) | Admin or Self | Logout (analogous) |
| `employment_status_changed` | Existing HR handler (unchanged, not new to this module) | HR | Role Change / User Deactivation depending on transition |

All events are append-only — `user_audit_logs` has no UPDATE or DELETE policy, matching SOP §23
("Audit records cannot be deleted").

---

## 10. Entity Relationship Summary

```
auth.users (Supabase-managed)
  └── profiles (1:1, existing)
        ├── account_status   (this module — login/access lifecycle)
        ├── status           (existing — HR employment lifecycle, unchanged)
        ├── department_id ──► departments (this module — FK, existing table)
        ├── role             (existing — legacy single-value RBAC column)
        └── user_roles ──► roles ──► role_permissions (existing RBAC schema, unchanged)

profiles
  └── user_audit_logs (existing, 1:many — user_id = subject, actor_id = actor or NULL for system)
```

---

## Hand-off Checklist

- [ ] Doc 01 approved by human
- [ ] Doc 02 approved by human
- [ ] `account_status` column + check constraint reviewed by `database-engineer`
- [ ] Backfill mapping (§2) reproduced verbatim in the migration — all 15 `status` values covered
- [ ] `department_id` FK + backfill-by-name-match (§3) reviewed
- [ ] `is_admin()`/`is_hr()` helper functions (§4) reviewed — union both `profiles.role` and
      `user_roles.role_code`, matching existing precedent
- [ ] RLS policy shapes (§5) reviewed — `profiles` SELECT stays broad, confirmed as deliberate
- [ ] `BEFORE UPDATE` trigger design (§6) reviewed — service-role exemption confirmed necessary
- [ ] `tenant_id` intentionally absent (§7) — confirmed not an oversight
- [ ] `pg_cron` job (§8) reviewed — `ACTIVE`-only scoping confirmed load-bearing
- [ ] Audit event-type vocabulary (§9) reviewed against `SOP-User-Management.md` §23
- [ ] Money columns: none in this module — confirmed
- [ ] `commercial-qs` review: not required — no monetary fields
- [ ] `database.types.ts` regenerated after migration lands (no such file exists in the repo today)
