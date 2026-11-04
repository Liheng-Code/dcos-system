# 06 — UI/UX Design
# Module USR — User Management & Account Lifecycle

Document path: docs/04-Business-Modules/02-USR-User-Management/06-UI-UX-Design.md
Module code: USR
Module number: 02 (DCOS Module Map — Foundation)
Domain: Foundation
Status: Draft — Awaiting Approval
Version: 1.0
Date: 2026-08-24
Architecture basis: `00-Master.md` §6

---

## 1. Route Table

Reproduced exactly from `00-Master.md` §6, Decision 5. These become the primary surface under the
existing `Administration` folder in `apps/web/components/dashboard/sidebar.tsx` (currently at
lines 675–686, containing only Settings and Stakeholder Templates).

| Nav item | Route | Renders |
|---|---|---|
| User Management | `/dashboard/administration/users` | `StaffListPage` (extended: + Invite sheet, department `Select`, `account_status` column) — **first-time mount**. `StaffListPage` exists as a built, exported component but is not currently imported by any `page.tsx` in the repo. |
| Roles & Permissions | `/dashboard/administration/roles-permissions` | `RolePermissionsPage`, **relocated wholesale** out of `/dashboard/settings`. |
| Departments | `/dashboard/administration/departments` | New Departments CRUD page. |
| Security | `/dashboard/administration/security` | New — account-status-counts dashboard + recent security-relevant `user_audit_logs` feed. See §3 for the distinction from the per-user Security section. |
| Audit Logs | `/dashboard/administration/audit-logs` | New page reading the existing `user_audit_logs` GET endpoint. |

**`/dashboard/settings` after this change:** keeps Company Profile / Modules / Naming Convention
tabs. Its `Roles & Permissions` tab is **removed, not dual-hosted** — `RolePermissionsPage` now
lives solely at the new route, avoiding two places to manage the same data.

**New unauthenticated routes** (not under `/dashboard`, per F5/F6):

| Route | Purpose |
|---|---|
| `/forgot-password` | Staff member requests a password reset link (F6). |
| `/reset-password` | Consumes the Supabase recovery token — serves both first-activation (F2) and routine reset (F6) completion. |

`/login` is **not** built as a new route in this module — the existing landing page
(`apps/web/components/landing/auth-form.tsx`) already serves that role; this module only wires up
its dead "Forgot password?" stub.

---

## 2. Screen Inventory

| Screen ID | Screen Name | Route | Primary Actor |
|---|---|---|---|
| USR-01 | User Management List | `/dashboard/administration/users` | System Admin, HR |
| USR-02 | Invite User (Create Sheet) | Slide-over from USR-01 | System Admin, HR |
| USR-03 | Staff Edit Sheet (extended) | Slide-over from USR-01 | System Admin, HR |
| USR-04 | Security Section (inline, within USR-03) | Section of USR-03 | System Admin, HR |
| USR-05 | Security Overview (global) | `/dashboard/administration/security` | System Admin, HR |
| USR-06 | Audit Log Page | `/dashboard/administration/audit-logs` | System Admin, HR |
| USR-07 | Departments CRUD | `/dashboard/administration/departments` | System Admin, HR |
| USR-08 | Forgot Password | `/forgot-password` | Staff (unauthenticated) |
| USR-09 | Reset / Activate Password | `/reset-password` | Staff (token-authenticated) |
| USR-10 | Change Password (own profile) | Section of the staff member's own profile/settings surface | Staff (self) |
| USR-11 | Admin Dashboard Widget | Embedded on the main Admin/PM dashboard landing page | System Admin |

---

## 3. Screen Details

---

### USR-01 — User Management List

**Layout:** Standard DCOS data table, matching `staff-list-page.tsx`'s existing structure.

**Key data shown:**
- Full name, email, employee ID, department (from `department_id`, falling back to legacy text if
  unresolved), role, position.
- `account_status` badge — colour-coded: `INVITED` = amber, `ACTIVE` = green, `LOCKED` = red,
  `SUSPENDED` = amber/orange, `DISABLED` = muted/grey.
- `last_login_at` (relative time, e.g. "3 days ago"; "Never" if null).
- HR `status` shown as a secondary badge or column, kept visually distinct from `account_status`
  so the two lifecycles are never confused on screen.

**Key actions:**
- "New User" button (System Admin/HR only) → opens USR-02 Invite sheet.
- Click row → opens USR-03 Staff Edit Sheet.
- Filter by `account_status` (multi-select chips), department, role.

**Empty state:** "No users yet. Start by inviting your first team member." with a "New User"
call-to-action (Admin/HR only).

**shadcn/ui components:** Table, Badge, Button, Select (department/status filters).

---

### USR-02 — Invite User (Create Sheet)

**Layout:** Right-side Sheet, matching the source spec's §4 form grouping.

**Sections:**
1. **Employee Information:** Full name, Employee ID (if applicable), Department (`Select`, bound
   to `department_id`), Position, Phone.
2. **Login Information:** Email only. **No password field, no "confirm password" field — this
   form must never render a password input** (BR1.01).
3. **Access Control:** Role (`Select`, existing `profiles.role` values), RBAC role assignment
   (`user_roles`, optional at creation time).

**No "Account Status" radio group** — unlike the source spec's original §4.4 sketch (which showed
Active/Pending/Suspended/Disabled options), this module does **not** let the Admin choose a status
at creation. Every new account starts `INVITED`, full stop (BR1.02) — this is a deliberate,
resolved design decision (source spec §4, "I recommend not allowing Admin to manually choose
Active immediately for a new employee").

**Submit action:** "Send Invitation" (not "Create User") — reinforces that this triggers an email,
not an immediately-usable account.

**Confirmation:** "Invitation sent to [email]. [Name] will receive an email to activate their
account." Matches the source spec's §5 workflow narrative.

**shadcn/ui components:** Sheet, Input, Select, Button, Form (React Hook Form + Zod).

---

### USR-03 — Staff Edit Sheet (Extended)

**Layout:** Existing `staff-edit-sheet.tsx`, extended with the `department` free-text `Input`
(currently ~line 165) replaced by a `Select` bound to `department_id`, and a new "Security" tab or
section added alongside the existing profile fields (see USR-04).

**Existing tabs/sections preserved:** Personal Information, Employment Details, etc. — no existing
field is removed by this module.

**New:** Security section — see USR-04.

**Self-edit note (UI-level, backed by DB trigger per `04-Database-Schema.md` §6):** when a staff
member views their **own** profile (not through this admin sheet, but through their own
profile/settings surface), `role`, `account_status`, `status`, `department_id`, `email`, and
`user_code` are rendered read-only / non-editable in that surface. The database trigger is the
actual enforcement; the UI omitting these fields from the self-service form is a courtesy, not the
security boundary.

---

### USR-04 — Security Section (Inline, within USR-03)

This is the **per-user** Security surface — distinct from USR-05 (global overview). It lives
inline in the Staff Edit Sheet, not as its own page.

**Key data shown:**
- `account_status` (large badge, colour-coded per USR-01).
- `last_login_at`.
- `password_changed_at`.
- `first_login_at` (doubles as activation-completion timestamp, per
  `02-Functional-Specification.md` BR2.03).

**Key actions (each behind its own confirmation dialog):**
- **Lock / Unlock** — toggles based on current `account_status`. Confirmation copy: "This user
  will be immediately signed out and unable to log in until unlocked."
- **Suspend** — confirmation copy: "This user will be immediately signed out. They can be
  reactivated at any time." Optional reason note field.
- **Disable** — confirmation copy: "This user will be immediately signed out and their account
  disabled. Historical records they created are preserved." (Matches the source spec §13's
  explicit reassurance that disabling never deletes records.)
- **Force Password Reset** — confirmation copy: "A password reset link will be sent to [email].
  You will not see or set their new password." (Matches source spec §12.)

**Action visibility rules:** all four status-changing actions and Force Password Reset are hidden
entirely (not just disabled) when the viewer is looking at their **own** account — self-action on
these controls is never offered in the UI (backed by the DB trigger as the real boundary, per
`02-Functional-Specification.md` UC06 Alternate Path B).

**shadcn/ui components:** Badge, Button, AlertDialog (confirmation), Textarea (reason note).

---

### USR-05 — Security Overview (Global)

**This is a distinct screen from USR-04 — do not conflate them.** USR-05 is a read-only,
organisation-wide dashboard. It never initiates a per-user action; those live exclusively in
USR-04 (BR11.02).

**Layout:** Full-width. Top row: 5 KPI tiles (one per `account_status` value). Below: recent
activity feed.

**KPI tiles:** Total Users, Active, Invited, Locked, Suspended, Disabled — each clickable,
navigating to USR-01 pre-filtered by that status.

**Recent activity feed:** last N `user_audit_logs` entries filtered to account-lifecycle event
types (per `04-Database-Schema.md` §9's vocabulary). Each row: timestamp, actor (rendered as
"System" when `actor_id IS NULL` — see BR8.03), event description, affected user.

**Empty state (feed):** "No recent account activity."

**shadcn/ui components:** Card, Badge, Table (or list) for the feed.

---

### USR-06 — Audit Log Page

**Layout:** Standard DCOS data table. Mirror an existing audit-page pattern from another module
(Documents/Procurement/HR Payroll) for visual consistency across DCOS, per the implementation
plan's Phase 4 guidance.

**Key data shown:** timestamp, actor (or "System"), event type (human-readable label mapped from
the canonical `event_type` strings in `04-Database-Schema.md` §9), affected user, old/new value
summary.

**Filters:** date range, event type, affected user, actor.

**No delete/export-modification actions** — read-only, matching the append-only nature of
`user_audit_logs` (SOP §23).

---

### USR-07 — Departments CRUD

**Layout:** Standard DCOS data table + create/edit dialog.

**Key data shown:** department code, name, description, parent department (hierarchical, shown as
indented tree or breadcrumb), department head.

**Key actions:** Create, Edit, (soft) Delete/Deactivate — exact delete semantics against
`department_id` FK's `ON DELETE SET NULL` behaviour are `[TBD — human to confirm whether
departments support hard delete given profiles.department_id on delete set null, or whether an
active-department-with-assigned-staff should block deletion]`.

**shadcn/ui components:** Table, Dialog, Input, Select (parent department), Form.

---

### USR-08 — Forgot Password

**Route:** `/forgot-password` (unauthenticated).

**Layout:** Single-column centered form, matching the visual style of the landing page's
`auth-form.tsx`.

**Fields:** Email.

**Submit action:** always shows the identical generic confirmation regardless of match: "If an
account exists for this email, a password reset link has been sent." (BR6.01) — no loading-state
or error-state difference that could leak account existence via timing.

**Link back:** "Back to login."

---

### USR-09 — Reset / Activate Password

**Route:** `/reset-password?<supabase token params>` (token-authenticated, no prior session
required).

**Layout:** Single-column centered form. Two copy variants driven by whether the backend detects
`account_status = 'INVITED'` for the token's account (activation) vs. any other status (routine
reset) — the underlying flow (BR2.01) is identical; only heading/copy differs:

- **Activation variant:** "Welcome to DCOS. Set your password to activate your account."
- **Reset variant:** "Set a new password for your account."

**Fields:** New password, Confirm password. Live policy checklist (12+ characters, uppercase,
lowercase, number, special character — BR5.02) shown as the user types.

**Error states:** expired/used token → "This link has expired or already been used." with a link
back to USR-08.

**On success:** redirect to login with a success toast, or auto-sign-in — `[TBD — human to confirm
UX preference]`.

---

### USR-10 — Change Password (Own Profile)

**Location:** the staff member's own profile/settings surface — exact host page is `[TBD — locate
or create per the implementation plan's Phase 4 item 6; not yet determined which existing page
hosts "My Profile"]`.

**Fields:** Current password, New password, Confirm new password.

**Submit action:** "Change Password." On success: "Password changed. You have been signed out of
your other devices." (BR5.03 — matches source spec §9's "Invalidate old sessions" step.)

**Error states:** incorrect current password; new password fails policy.

---

### USR-11 — Admin Dashboard Widget

**Location:** embedded on the main Admin dashboard landing page (not a standalone route).

**Layout:** Compact card, matching the source spec's §17 sketch — counts-by-status tiles + a short
recent-activity list (fewer rows than the full USR-05 feed), with a "View all" link to USR-05.

---

## 4. Sidebar Gating

**Current state:** the `Administration` folder in `sidebar.tsx` gates on `isAdmin` alone, itself
derived client-side from `profiles.role === "admin"` (the legacy single-value column).

**Recommendation (per `00-Master.md` §6):** broaden the gate to `isAdmin || isHr`, reusing the
same equivalent-authority union already established server-side in `getActorContext()`'s
`HR_ROLE_CODES` set. Module-map ownership for 02-USR is "HR / System Admin" — an HR Manager who
cannot see the Administration folder at all would be unable to reach User Management despite being
an intended actor for it.

```tsx
// apps/web/components/dashboard/sidebar.tsx — illustrative, not final implementation
{(isAdmin || isHr) && isModuleActive("administration") && (
  <div className={cn(!collapsed && "mt-3")}>
    <FolderHeader label="Administration" open={adminOpen} onToggle={() => setAdminOpen(!adminOpen)} level={1} />
    {(collapsed || adminOpen) && (
      <>
        <NavItem href="/dashboard/settings"                             label="Settings"              icon={Cog} />
        <NavItem href="/dashboard/administration/users"                 label="User Management"        icon={Users} />
        <NavItem href="/dashboard/administration/roles-permissions"     label="Roles & Permissions"    icon={ShieldCheck} />
        <NavItem href="/dashboard/administration/departments"           label="Departments"             icon={Building2} />
        <NavItem href="/dashboard/administration/security"              label="Security"                icon={ShieldAlert} />
        <NavItem href="/dashboard/administration/audit-logs"            label="Audit Logs"              icon={FileClock} />
        <NavItem href="/dashboard/administration/stakeholder-templates" label="Stakeholder Templates"   icon={FileText} />
      </>
    )}
  </div>
)}
```

This is an extension beyond the plan's literal text, low-risk and consistent with the module's
stated ownership — see `00-Master.md` §6 for the full rationale. `isHr` must be computed
client-side using the same `profiles.role` ∪ `user_roles.role_code` union as `is_hr()`
(`04-Database-Schema.md` §4), not `profiles.role` alone, or a user with only an RBAC `role_code`
would be incorrectly hidden from this folder.
