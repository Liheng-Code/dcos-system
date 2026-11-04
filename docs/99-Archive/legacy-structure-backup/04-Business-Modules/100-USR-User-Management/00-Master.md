# 00-Master — Architecture & Reconciliation Decisions

## Digital Construction Operating System (DCOS)

## Module: 02-USR — User Management & Account Lifecycle

Module Code: USR
Domain: Foundation
Owner: HR / System Admin (per `DCOS-Module-Map.md` §3)
Doc Status: **Approved — all Phase 0 open questions resolved by human 2026-08-24**
Version: 0.2
Date: 2026-08-24
Author: system-architect (Phase 0 of the approved implementation plan); Open Questions §8/§10 resolved by human sign-off, recorded by orchestrator

---

# 1. Purpose

This is the Phase 0 gate document for the **System Admin Account Lifecycle** feature. It formally resolves the seven reconciliation questions raised in the approved implementation plan, sanity-checks each decision against the actual current schema and code (not just the plan's description of it), and records where reality diverged from the plan's assumptions.

Nothing below authorizes code or migrations. This is the design contract Docs 01–12 (Phase 1, owner `docs-writer`) and the schema (Phase 2, owner `database-engineer`) must build to.

**Inputs read for this note:**
- `docs/01-DCOS-Foundation/DCOS-Module-Map.md`, `DCOS-System-Architecture.md`, `DCOS-RLS-Security-Remediation-Tracker.md`
- `docs/02-Governance/01-SOP/01-SOP-User-Management/SOP-User-Management.md` (full 30 sections)
- `docs/04-Business-Modules/06-Planning-Scheduling/` (template pack — no ADR folder exists in this repo; `docs/09-Architecture/ADR/` referenced in the operating brief does not exist, so "settled ADR" checks were done against `DCOS-System-Architecture.md` §16 Governance Rules and the RLS tracker instead)
- `supabase/migrations/20260618000001_employee_master_r21_foundation.sql` (full `profiles_status_check`, 15 values)
- `supabase/migrations/20260602000057_enable_rls_core_tables.sql` (the wide-open policies)
- `supabase/migrations/20260606000002_user_management_gaps.sql` (`user_audit_logs` + its working RLS pattern)
- `supabase/migrations/20260526_0001_create_profiles.sql` (`profiles` base table, `handle_new_user()` trigger)
- `supabase/migrations/20260527000030_create_hr_organization_tables.sql` (`departments` table)
- `apps/web/app/api/hr/employees/[id]/route.ts`, `apps/web/app/api/hr/employees/route.ts`
- `apps/web/components/settings/staff-list-page.tsx`, `staff-edit-sheet.tsx`, `role-permissions-page.tsx`
- `apps/web/app/dashboard/settings/page.tsx`, `apps/web/components/dashboard/sidebar.tsx`
- `.claude/skills/dcos-rbac-permission/skill.md`

---

# 2. Decision 1 — Docs Pack Scope

**Decision:** One combined pack at `docs/04-Business-Modules/02-USR-User-Management/`, covering create → invite → activate → lock/suspend/disable, plus Departments and Audit Logs UI. `03-RBAC`, `04-ADM`, `12-AUD` remain reserved module-map codes with no folder created now. The pack cross-references the existing, real RBAC schema (`roles`, `role_permissions`, `user_roles`) and UI (`role-permissions-page.tsx`) rather than redesigning them.

**Rationale:** `role-permissions-page.tsx` already implements a real permission matrix (14 modules × 11 actions, keyed by `role_code`) against real tables. Redesigning RBAC now would be waste; 02-USR's Doc 07 (RBAC Matrix) documents *who may invoke which USR/ADM actions*, not a new permission model.

**Doc naming — flag:** two different 12-doc naming conventions are live in this repo:
- `DCOS-Module-Map.md` §7 canonical list: `01-Business-Requirement, 02-Functional-Specification, 03-Workflow, 04-Database-Schema, 05-API-Specification, 06-UI-UX-Design, 07-Permission-Matrix, 08-Notification-Matrix, 09-Audit-Requirements, 10-Reports-KPI, 11-UAT-Test-Cases, 12-SOP` — matches `21-IPC-Progress-Claim`'s actual folder.
- `06-Planning-Scheduling`'s actual folder (and the plan's Phase 1 table): `01-Business-Requirement, 02-Functional-Specification, 03-Use-Cases, 04-Database-Schema, 05-Integration-Specification, 06-UI-UX-Design, 07-RBAC-Matrix, 08-API-Reference, 09-Test-Plan, 10-Deployment-Notes, 11-SOP, 12-Training-Guide`.

The task brief and the plan both point at the Planning-Scheduling naming, so **02-USR uses that sequence** (already reflected in the plan's Phase 1 table). This is not a new decision — flagging it so `docs-writer` doesn't "fix" the naming to match the module-map's stale §7 list mid-pack. Module-map §7 is now out of sync with two of three example packs in the repo; worth a separate housekeeping note to the human, not blocking this feature.

---

# 3. Decision 2 — `profiles.status` vs. `account_status`

**Decision:** `account_status` is added as a new column on `profiles`, values `INVITED | ACTIVE | LOCKED | SUSPENDED | DISABLED`, independent of `status`. Neither `profiles_status_check` nor `LIFECYCLE_ACTIONS` is touched.

| Column | Meaning | Owner | Who writes it |
|---|---|---|---|
| `status` | HR employment lifecycle (draft → … → archived) | HR (this is the Employee Master domain) | `LIFECYCLE_ACTIONS` in `[id]/route.ts`, HR actors only |
| `account_status` | Login/access lifecycle (this feature) | System Admin | New `ACCOUNT_STATUS_ACTIONS` (Phase 3), invite/activate/reset endpoints |

**Backfill mapping** (the plan's mapping only covered 12 of the 15 `status` values — closing the gap here):

| `status` value | → `account_status` | Basis |
|---|---|---|
| `active` | `ACTIVE` | Plan, confirmed |
| `suspended` | `SUSPENDED` | Plan, confirmed |
| `resigned`, `terminated`, `retired`, `deceased`, `archived` | `DISABLED` | Plan, confirmed — terminal separations |
| `draft`, `pending`, `pending_approval`, `approved`, `probation` | `INVITED` | Plan, confirmed — not yet a working, logged-in account |
| `disabled` | `DISABLED` | **Gap closed.** Distinct HR value meaning the employment record itself is administratively deactivated short of full termination; terminal enough to map to `DISABLED`. |
| `long_leave` | `SUSPENDED` | **Gap closed.** SOP §17 explicitly lists "Extended Leave" as a suspension reason — `long_leave` is the closest SOP analog to `Suspended`, and it's reversible (matches `SUSPENDED` semantics, not `DISABLED`). |
| `inactive` | `SUSPENDED` | **Gap closed, lower confidence.** No SOP or code definition of what `inactive` means distinct from the other 14 values. Treated as reversible/non-terminal by default (safer than `DISABLED`, which would require an explicit reactivation approval per SOP §21). **Flagged in §8 Open Questions — confirm with HR before backfill runs.** |

This backfill mapping must be reproduced verbatim in `04-Database-Schema.md` and the Phase 2 migration.

---

# 4. Decision 3 — HR Lifecycle → `account_status` Side Effects

**Decision:** Yes, extending the plan's recommendation with one addition found during reconciliation.

| HR action (`LIFECYCLE_ACTIONS` key) | New `status` | `account_status` side effect | Session revoke |
|---|---|---|---|
| `suspend` | `suspended` | → `SUSPENDED` | Already `revoke:true` |
| `terminate`, `retire`, `deceased`, `archive` | (respective) | → `DISABLED` | Already `revoke:true` |
| `resign` | `resigned` | → `DISABLED` | Already `revoke:true` — plan's list omitted `resign`, but it has identical `revoke:true` semantics to `terminate`/`retire` and maps to `DISABLED` in the backfill table above; excluding it would leave a live inconsistency between backfilled data and future transitions. **Added to scope.** |
| `long_leave` | `long_leave` | → `SUSPENDED` | **Not currently `revoke:true` in code — recommend adding it.** Backfill maps `long_leave` → `SUSPENDED`, so the live transition should match, or a newly-placed employee could keep an active session while HR believes their account is suspended. |
| `activate` | `active` | → `ACTIVE`, **only if current `account_status` is `SUSPENDED` or `DISABLED`; never if `LOCKED`.** | n/a |
| `approve`, `submit`, `start_probation` | (respective) | No change | n/a |

**Rationale for `activate` auto-restoring `account_status`:** `activate` is also how a rehire (previously `terminated` → HR re-activates) or an employee returning from `long_leave` re-enters `active` employment. Without a matching `account_status` restore, HR would reactivate someone's employment record and they'd still be unable to log in, with no obvious reason why. Excluding `LOCKED` specifically is deliberate: `LOCKED` is a System Admin security action (Decision 6/Open Question 7 territory), not an HR employment state — HR reactivating employment must never silently clear a security lock. Only System Admin can clear `LOCKED`.

This is an extension beyond the plan's literal Phase 0 §3 text ("terminate/retire/deceased/archive → DISABLED, suspend → SUSPENDED"); flagged as such. Implementation stays exactly where the plan said: inside the existing `[id]/route.ts` handler, alongside the existing `status` update, same transaction.

---

# 5. Decision 4 — Departments Wiring

**Decision:** Confirmed as the plan describes, with the target schema verified.

- Add `profiles.department_id uuid references public.departments(id) on delete set null`.
- `public.departments` already exists (`20260527000030_create_hr_organization_tables.sql`): `id, department_code, department_name, description, parent_id, department_head, created_at, updated_at` — hierarchical (self-referencing `parent_id`), richer than the flat text field it replaces.
- Keep `profiles.department` (text) as a deprecated display fallback — do not drop it in this feature.
- Backfill: match `profiles.department` (case-insensitive) against `departments.department_name`; unmatched rows keep `department_id = NULL` and retain their original `department` text for manual admin reconciliation post-migration. Do not attempt fuzzy matching — an unresolved match is safer than a wrong one.
- UI cutover: `staff-edit-sheet.tsx`'s free-text `department` `Input` (line ~165) becomes a `Select` bound to `department_id`, sourced from `public.departments`.

**Flag for Phase 3 (backend-engineer):** `apps/web/app/api/hr/employees/[id]/route.ts`'s `PROFILE_UPDATE_FIELDS` and `SENSITIVE_FIELDS` arrays currently list `department` (text) as an editable, reason-gated sensitive field. Both arrays need `department_id` added; whether `department` (text) should be removed from `PROFILE_UPDATE_FIELDS` once the FK lands, or kept writable for the transition period, is a Phase 3 implementation call, not a Phase 0 one — noting it here so it isn't missed.

---

# 6. Decision 5 — Settings/Nav Coexistence

**Decision:** Confirmed structurally, with target routes made explicit (the plan named the nav items but not their destinations) and one correction to the plan's premise.

**Correction to plan's premise:** the plan describes `staff-list-page.tsx`/`staff-edit-sheet.tsx` as the current, live Settings UI for staff. Verified: **`StaffListPage` is not mounted anywhere in `apps/web/app/`** — it exists as a built, exported component (`components/settings/staff-list-page.tsx:41`) with no `page.tsx` importing it. It is not dead code to refactor "in place" on a live route; it's finished-but-unwired code that Phase 4 will wire up for the first time. This doesn't change the plan's instruction ("extend in place rather than fork") — it just means "in place" means giving it a route, not modifying traffic on an existing one.

**Route assignments** (new, under the existing `Administration` folder in `sidebar.tsx:676`):

| Nav item | Route | Renders |
|---|---|---|
| User Management | `/dashboard/administration/users` | `StaffListPage` (extended: + Invite sheet, department `Select`, account_status column) — first-time mount |
| Roles & Permissions | `/dashboard/administration/roles-permissions` | `RolePermissionsPage`, relocated wholesale out of `/dashboard/settings` |
| Departments | `/dashboard/administration/departments` | New Departments CRUD page |
| Security | `/dashboard/administration/security` | New — account-status-counts dashboard + recent security-relevant `user_audit_logs` feed (backed by `GET /api/admin/dashboard/account-summary`). **Clarifies an ambiguity the plan left implicit**: this is a global admin overview, distinct from the per-user Lock/Unlock/Suspend/Disable/Force-Reset actions, which live inline in the `staff-edit-sheet.tsx` Security section (Phase 4 item 2), not on this page. |
| Audit Logs | `/dashboard/administration/audit-logs` | New page reading existing `user_audit_logs` GET endpoint |

**`/dashboard/settings` after this change:** keeps Company Profile / Modules / Naming Convention tabs. The `roles` tab is **removed** (not left dual-hosted) — `RolePermissionsPage` now lives solely at the new route, avoiding two places to manage the same data.

**Sidebar gating — extension flagged:** the `Administration` folder currently gates on `isAdmin` alone, itself derived client-side from `profiles.role === "admin"` (the legacy single-value column — see Decision 6 for why this matters). Module-map §3 lists 02-USR's owner as "HR / Admin," and the server-side `getActorContext()` pattern in `[id]/route.ts` already treats `HR_Manager` and `admin` as an equivalent-authority set (`HR_ROLE_CODES`). **Recommend** broadening the sidebar gate for this folder to the same union (`isAdmin || isHr`), reusing that existing pattern rather than inventing a new one. This is an addition beyond the plan's literal text; low-risk, and consistent with the module's stated ownership.

---

# 7. Decision 6 — RLS Tightening Approach

## 7.1 Scope of the four tables

`profiles`, `roles`, `role_permissions`, `user_roles` currently carry `FOR ALL TO authenticated USING (true) WITH CHECK (true)` (`20260602000057_enable_rls_core_tables.sql`). `approval_thresholds` has the same pattern on the same migration but is explicitly **out of scope** here per the plan — flagged separately, not touched.

## 7.2 No `is_admin()`-style helper exists yet

Searched the full `supabase/migrations/` tree — there is no `is_admin()`, `is_hr()`, or any SQL helper function. The one working precedent is `user_audit_logs`'s RLS (`20260606000002_user_management_gaps.sql`):

```
EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
```

— and the app-layer precedent in `[id]/route.ts`'s `getActorContext()`, which unions `profiles.role` (legacy single-value column: `admin | project_manager | contractor | inspector | viewer`) with `user_roles.role_code` (the real RBAC join table) before checking membership in `HR_ROLE_CODES = {HR_Manager, admin}`.

**Decision:** Phase 2 creates two SQL helper functions modeled directly on that union pattern — `public.is_admin(uid uuid default auth.uid())` and `public.is_hr(uid uuid default auth.uid())` — each checking `profiles.role` OR a matching `user_roles.role_code`, `SECURITY DEFINER`. Every new policy below calls these instead of repeating the `EXISTS` boilerplate. This is new (no such helper existed), but it's a direct formalization of logic that already exists and is already trusted in two places, not an invented pattern.

**Flag — two overlapping role systems:** `profiles.role` (legacy, single value, hardcoded 5-value list, edited via a plain `<select>` in `staff-edit-sheet.tsx`) and `roles`/`role_permissions`/`user_roles` (the real, granular RBAC system `role-permissions-page.tsx` manages) currently coexist and are both checked, unioned, wherever "is this user privileged" matters. This feature does not resolve that duplication — doing so is a larger RBAC-consolidation effort outside this feature's scope — but every new admin-check in this feature (RLS helpers, `ACCOUNT_STATUS_ACTIONS`, sidebar gating) must keep checking **both**, matching the existing precedent, or a user who only has an RBAC `role_code` (no legacy `profiles.role`) would be silently locked out of things they should be able to do. Worth its own future ADR; noted here so it isn't missed mid-build.

## 7.3 Policy shape per table

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | **Stays broad** (`true` for `authenticated`) — see rationale below | No policy for `authenticated` (default deny) — creation only via `handle_new_user()` trigger (`SECURITY DEFINER`, bypasses RLS) or admin-client backend routes (service role, bypasses RLS) | `id = auth.uid() OR is_admin() OR is_hr()`, **plus the trigger in §7.4** | No policy (default deny) — matches SOP §19 "never deleted"; use `status`/`account_status` transitions, not row deletion |
| `roles` | Stays broad (`true`) — config/lookup table, already read client-side without gating by `role-permissions-page.tsx` | `is_admin()` | `is_admin()` | `is_admin()` |
| `role_permissions` | Stays broad (`true`) | `is_admin()` | `is_admin()` | `is_admin()` |
| `user_roles` | Stays broad (`true`) — approval/assignment lookups across other modules depend on reading "who holds which role" broadly | `is_admin()` | `is_admin()` | `is_admin()` |

**Why `profiles` SELECT stays broad, not tightened:** this is the one place this note deviates from a literal reading of "tighten the wide-open policies," and it needs to be explicit. Postgres RLS cannot restrict which *columns* a SELECT returns — only which *rows*. `profiles` is read broadly across the entire platform today (task assignee pickers, approver dropdowns, WBS ownership display, the sidebar's own `isAdmin` check) for non-sensitive fields (`full_name`, `avatar_url`, `department`, `role`). Restricting `profiles` SELECT to self-or-admin would break every one of those cross-module lookups — exactly the regression class the plan's own Phase 5 QA section calls out ("RLS regression across HR employee list, RBAC role editor, and dashboards"). The RLS remediation tracker's own §3 makes the same call for genuine reference tables: permissive **read** is often reasonable; the real risk is on writes. The plan's Phase 2 §2 wording ("read broadly available for UI gating, write restricted to admin role holders") already anticipated this — this section makes it a concrete, binding policy shape rather than leaving it to interpretation. A future `profiles_directory` view (name/avatar/department/role only, safe for broad exposure, with the sensitive HR/PII columns behind a genuinely restricted `profiles` read) is the architecturally cleaner long-term fix; it's a larger, repo-wide refactor (every `.from("profiles").select(...)` call for a name lookup would need to switch views) and is flagged for the RLS remediation tracker, not built in this feature.

## 7.4 Column-level self-edit restriction — BEFORE UPDATE trigger, not app-layer-only

The plan flags the correct nuance: RLS's `UPDATE` policy cannot say "this user may change columns A/B but not C/D" — a `WITH CHECK` clause governs whether the resulting row is acceptable, not which specific columns changed, so the self-edit `UPDATE` policy above must allow the row-level write and something else must stop a non-privileged user from smuggling a `role` or `account_status` change into their own "edit my phone number" request.

**Decision: a `BEFORE UPDATE` trigger on `profiles`, not app-layer-only enforcement.**

**Why, not just "app enforces it":** direct-Supabase-client writes from React components are the dominant pattern in this codebase (the sidebar itself queries `profiles` directly from the browser client, not through an API route). If self-profile-editing follows that same pattern — plausible, since nothing in the plan routes it through a backend API — then app-layer-only enforcement means *only the specific form component* that happens to omit `role`/`account_status`/`department_id`/`status` from its payload is what protects those columns. Any other current or future direct-client write path (a bug, a new form, a bulk-edit feature) has no second line of defense. A DB-level trigger protects the column regardless of which code path issues the `UPDATE` — it's the same reasoning the RLS tracker itself gives for why permissive RLS is dangerous even when a backend proxy route's own check is believed correct.

**Design intent** (for `database-engineer` to implement in Phase 2 — not specified as SQL here):
- `BEFORE UPDATE ON public.profiles FOR EACH ROW`
- Protected column set: `role`, `account_status`, `status`, `department_id`, `email`, `user_code`
- If any protected column's `NEW` value is distinct from its `OLD` value, and the executing context is neither the Supabase `service_role` (our own trusted backend/admin-client routes — these must remain unaffected, since `ACCOUNT_STATUS_ACTIONS` and the HR `LIFECYCLE_ACTIONS` route legitimately change `status`/`account_status` via the admin client) nor `is_admin()`/`is_hr()` true for the acting session — reject with an exception.
- Triggers fire on every `UPDATE` regardless of RLS bypass, so this is the one place service-role traffic must be explicitly exempted rather than assumed exempt.
- This complements, not replaces, the RLS `UPDATE` policy in §7.3 — RLS decides *which rows* a self-edit may touch (their own), the trigger decides *which columns* within that row.

---

# 8. Open Questions — RESOLVED 2026-08-24

## 8.1 Point 7 of the plan — Failed-login lockout — **RESOLVED: Option A**

**Decision: `LOCKED` is admin-manual-only for this release.** System Admin explicitly locks/unlocks via the `ACCOUNT_STATUS_ACTIONS` endpoints. No `login_attempts` table, no automatic-lockout logic. Matches the SOP (no automatic-lockout language anywhere in its 30 sections). Option B (automatic N-attempts lockout) remains a strict superset that can be added later without rework, if ever needed.

## 8.2 `status = 'inactive'` mapping ambiguity — **RESOLVED: `SUSPENDED`**

**Decision:** `inactive → SUSPENDED` in the backfill mapping (§3), confirmed as final — not merely a default pending confirmation. Reversible, matches "temporarily blocked" semantics, doesn't require a reactivation approval step.

## 8.3 SOP §21 — 90-day inactivity auto-disable — **RESOLVED: Option A, added to scope**

**Decision: in scope.** A scheduled job (Supabase `pg_cron` preferred over an Edge Function, given no Edge Functions exist elsewhere in this repo yet) runs daily, compares `last_login_at` to `now()`, and sets `account_status = DISABLED` for any `ACTIVE` account idle >90 days, writing `account_auto_disabled_inactivity` to `user_audit_logs` with `actor_id = NULL` (system-initiated, not admin-initiated — `08-API-Reference.md`/audit consumers should render a `NULL` actor as "System" rather than blank). Reactivation of an auto-disabled account still requires System Admin action (unlock/reactivate via `ACCOUNT_STATUS_ACTIONS`), matching SOP §21's "reactivation requires approval."

**Scope impact — added to the approved plan:**
- **Phase 2 (database-engineer):** new migration for the `pg_cron` job (or equivalent scheduled trigger) + `account_auto_disabled_inactivity` added to the canonical audit event-type vocabulary (Phase 2 item 5).
- **Phase 1 (docs-writer):** `02-Functional-Specification.md` must document this as a system-initiated transition (not a user action) in the state machine; `10-Deployment-Notes.md` must cover `pg_cron` scheduling/enablement; `09-Test-Plan.md` must include a test for the 90-day boundary.
- **Phase 5 QA:** add a case verifying the job only fires on `ACTIVE` accounts (not `INVITED`/`LOCKED`/`SUSPENDED`/`DISABLED` — those have their own transition paths) and that it never wrongly disables a never-logged-in `INVITED` account (the job's `WHERE` clause must scope to `account_status = 'ACTIVE'` specifically).

## 8.4 SOP §7/§14 — request/approval workflow ahead of account creation — **RESOLVED: accepted as documented deviation**

**Decision:** System Admin remains sole authority for invite/lock/suspend/disable in this release — no upstream Department-Manager approval step is built. This is a confirmed, deliberate MVP scope reduction, not an oversight. `01-Business-Requirement.md` (Phase 1) must state this explicitly in its Out-of-Scope section: *"Multi-step request/approval routing (SOP §7, §14) is not implemented in this release — System Admin is sole authority for account lifecycle actions. A future phase may route these actions through the Approval Workflow Engine (module 10-APP)."*

## 8.5 Tenant isolation does not currently exist on any of these tables

`profiles`, `roles`, `role_permissions`, `user_roles`, `departments` have no `tenant_id` column anywhere in the migration history searched. This contradicts the platform-wide principle that every table carries `tenant_id`. This is a pre-existing, repo-wide condition — DCOS is currently single-tenant in practice — not something introduced by or fixable within this feature. **Decision: do not add `tenant_id` in this pass.** Noting it so nobody mistakes the RLS policies in §7.3 (which are role/self-scoped, not tenant-scoped) for a tenancy oversight — there is no tenant boundary anywhere in this codebase yet to enforce.

---

# 9. SOP Reconciliation Summary (for `11-SOP.md`, Phase 1)

| SOP section | SOP text | Reconciliation |
|---|---|---|
| §9 Account Activation | "Initial Password: System generated... First Login: Change Password. Mandatory." | **Delta.** Superseded by the plan's already-confirmed decision (email activation link, Admin never sets/sees a password). `11-SOP.md` must update this section's *mechanism* description; the outcome (user sets their own password before first real use) is preserved. |
| §16 Password Reset Procedure | "System Admin: Reset Password... User must change password upon next login." | **Compatible, wording updates only.** "Reset Password" now means "trigger a reset link" (`POST /api/admin/users/[id]/force-reset`), not "set a literal password." Outcome unchanged. |
| §17 User Suspension | Reasons include "Extended Leave"; suspended users cannot log in. | **Consistent** — directly informs the `long_leave → SUSPENDED` backfill mapping in §3. |
| §18 User Termination | "Deactivate Account / Remove Sessions / Lock Access." | **Consistent** — matches `revoke:true` + `account_status = DISABLED` in §4. |
| §19 User Archive | "Never deleted... Read Only." | **Consistent** — matches Decision 6's no-DELETE-policy stance and the existing `archive` action's read-only enforcement in `[id]/route.ts` (`current.status === "archived"` guard). |
| §21 Inactive Account Policy | 90-day auto-disable, reactivation needs approval. | **Gap — see Open Question 8.3.** Not currently in the plan's scope. |
| §23 Audit Requirements | Login, Logout, Password Reset, Role Change, Project Assignment, User Creation, User Deactivation must be logged; audit records cannot be deleted. | **Consistent** with `user_audit_logs` (append-only, no DELETE policy exists on it either) and the canonical event vocabulary the plan already lists in Phase 2 §5. `08-API-Reference.md`/`04-Database-Schema.md` should map each SOP-required event to its exact `event_type` string. |
| §25 User Status Definitions | `Pending / Active / Suspended / Disabled / Archived` — 5 values, no `Locked`, and this is a single flat status. | **Delta, expected.** SOP predates the two-column (`status` + `account_status`) split and predates `LOCKED`. `11-SOP.md` must add an explicit mapping table (this doc's §3) showing how the SOP's 5 conceptual states map across `status` (HR) and `account_status` (access) — SOP's `Pending` ≈ `account_status=INVITED`; SOP's `Active/Suspended/Disabled/Archived` map onto both columns depending on context. `LOCKED` is a net-new state the SOP doesn't anticipate (Open Question 8.1). |
| §7 / §14 Request & Modification approval chain | Manager → System Admin approval required for creation and for role/department/project changes. | **Deviation — see Open Question 8.4.** Not a wording delta; a scope decision the human should explicitly bless. |

---

# 10. Open Questions — Resolution Log

All four blocking questions were put to the human and resolved 2026-08-24 (see §8 for full reasoning/scope-impact of each):

1. **Failed-login lockout mechanism** — **RESOLVED: Option A**, admin-manual-only `LOCKED`. No `login_attempts` table.
2. **`status = 'inactive'` → `account_status` mapping** — **RESOLVED: `SUSPENDED`**, final.
3. **SOP §21 90-day inactivity auto-disable** — **RESOLVED: Option A**, added to scope (new `pg_cron` job, Phase 2/1/5 impact recorded in §8.3).
4. **SOP §7/§14 approval-chain-before-account-creation** — **RESOLVED: Option A**, accepted as a documented deviation; `01-Business-Requirement.md` must carry the Out-of-Scope statement from §8.4.
5. **`profiles.role` vs. RBAC `role_permissions`/`user_roles` duplication** — not a blocking question for this feature (both are unioned everywhere, consistently), still flagged as needing its own future ADR — the two systems should eventually converge on one. No action in this feature.

---

# 11. Hand-off Checklist

- [x] This document (Doc 00) reviewed and approved by human 2026-08-24
- [x] Open Questions §8.1 (failed-login lockout) answered by human — Option A, admin-manual-only
- [x] Open Questions §8.2–§8.4 answered by human — all recommended options accepted
- [ ] Doc 01 (Business Requirement) — to include the Out-of-Scope statement from §8.4
- [ ] Doc 02 (Functional Specification) — state machine must include `LOCKED` even if manual-only, the `activate`-restores-`account_status` rule from §4, and the system-initiated 90-day auto-disable transition from §8.3
- [ ] Doc 04 table list reviewed — `tenant_id` intentionally absent per §8.5, not an oversight; `pg_cron` job schema from §8.3 included
- [ ] All rejection/negative paths defined (RLS negative tests, non-admin column-guard trigger rejection, SOP §21 job boundary conditions)
- [ ] All BR# numbers assigned in Doc 02
- [ ] Integration points listed in Doc 05, including the `is_admin()`/`is_hr()` helper functions as a shared dependency other modules may reuse
- [ ] Money columns — n/a, this module has no monetary fields
- [ ] `commercial-qs` review — n/a, not a money module
- [ ] RLS policy shapes in §7.3–§7.4 reviewed by `database-engineer` before Phase 2 migration is written
- [ ] `pg_cron` auto-disable job (§8.3) reviewed by `database-engineer` before Phase 2 migration is written
