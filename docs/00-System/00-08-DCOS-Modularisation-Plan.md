# DCOS Modularisation Plan

> **Status:** Phase 0 done locally (push and branch protection deferred); Phases 1–4 implemented, Phase 5 code work verified in the browser, Phase 6 started; commit, branch protection, the team-member trial and the permission decisions are pending · **Created:** 2026-10-01 · **Owner:** Liheng

## Why this plan exists

DCOS is one Next.js application with about 285 dashboard pages, 119 API routes and roughly 440 database tables. Four goals drive this plan:

1. Deploy to production without waiting for every module to be complete.
2. Assign a module to a team member, and release it to production when it is ready.
3. Grow the system without breaking what already works.
4. Manage each module separately while keeping them integrated.

## Approach

Keep one repository, one application and one database. Do not move code into separate `packages/` or `modules/` workspaces yet. The goals are met by four things the repository does not have today:

- a manifest per module that declares its features, routes, navigation and permission codes;
- a release status per feature, so unfinished work is hidden and unreachable in production;
- a lint rule that stops one module importing another module's internals;
- a pull-request workflow with per-module owners and enforced CI.

The same four things make it possible to split a module into its own repository later, if that is ever needed.

### What already exists and is reused

| Need | Existing piece |
|---|---|
| Module registry | `module_settings` table, `lib/module-settings-service.ts`, `/modules` hub page |
| Feature toggles | `nav_item_settings` table, `lib/nav-item-settings-service.ts` |
| Navigation definitions | ten `lib/*-nav.ts` files sharing the `ModuleNavGroup` type |
| Permissions | `roles`, `user_roles`, `role_permissions` tables, `lib/permissions.ts` |

### Known gaps

- A module or nav item with no settings row is treated as visible, so new work appears by default.
- A disabled module is hidden from the sidebar but its URL still opens.
- Permissions are a UI hint for most modules; six permission codes have no seeded rows and default to allow.
- Module keys and permission module codes are two vocabularies bridged by a hand-written map (`lib/module-key-map.ts`).
- About 1,690 direct `supabase.from()` calls sit in components and pages, outside any service layer.

## Phases

Effort figures are rough estimates for one person.

### Phase 0 — Safety net (1–2 days)

**Goal:** nothing reaches `main` unchecked.

- CI runs on `main`.
- CI runs typecheck, lint, tests and build.
- Existing lint errors are baselined so only new ones fail.
- Branch protection on `main`: pull request and passing CI required.

**Done when:** a pull request with a type error or a new lint error cannot be merged.

**Status 2026-10-01:** CI workflow, scripts and lint baseline are in place locally. Deferred by the owner: committing and pushing these changes, and branch protection on `main`. Until both are done, CI is not enforcing anything.

**Baseline recorded 2026-10-01:**

| Check | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | 0 errors |
| Tests (Vitest) | 197 passed, 1 skipped, 22 files |
| ESLint | 427 errors in 195 files, 323 warnings |

The 427 lint errors are recorded in `apps/web/eslint-suppressions.json`. Most are `no-explicit-any` (209) and `react-hooks/set-state-in-effect` (149). They are paid down module by module in Phases 5 and 6; run `pnpm lint:prune` in `apps/web` after fixing some to shrink the baseline.

### Phase 1 — Module manifests and registry (3–5 days)

**Goal:** one source of truth per module, with no change in behaviour.

- Define a manifest type: module key, name, permission codes, route prefixes, nav groups, features.
- Write a manifest for each of the 12 existing modules, reusing the current `*-nav.ts` content.
- Generate the sidebar, the route-to-module map and the module-to-permission map from the manifests.

**Done when:** the sidebar and route gating look identical for every role, and adding a module means adding one file.

**Status 2026-10-01:** implemented; awaiting a logged-in visual check (the local Supabase stack was down).

- Manifests live in `apps/web/lib/modules/manifests/`, one per module, and are listed in `apps/web/lib/modules/registry.ts`.
- The sidebar, module hub, route guard (`isRouteBlocked`) and `MODULE_KEY_MAP` now derive from the registry.
- `apps/web/lib/modules/__tests__/registry.test.ts` pins the derived maps to the values they replaced.
- The `*-nav.ts` files are referenced by the manifests; Phase 3 moved them to `lib/<module>/`.

**Found in Phase 1 and resolved in Phase 2:**

- Inventory routes are missing from the route guard, so `/dashboard/inventory/*` is not role-gated on direct URL.
- `/dashboard/my-tasks` and `/dashboard/department` are not attributed to any module.
- `lib/nav-item-catalog.ts` (the admin "manage navigation items" list) has drifted from the real navigation: it lacks, for example, Planning's Productivity group, Overview and MS Project Sync, and Document Control's MDR and Submittals. It should be derived from the manifests.

### Phase 2 — Feature release control (3–4 days)

**Goal:** deploy unfinished work to production safely.

- Add a status to each feature: `development`, `released`, `disabled`.
- Mark every existing feature `released` so nothing disappears.
- Flip the default: a feature with no setting is hidden.
- Block the route of a non-released feature, not only its sidebar entry.
- Keep the existing admin toggle page as the production switch.

**Done when:** a feature merged as `development` is invisible and unreachable in production until it is switched on.

**Approved 2026-10-01:** this reverses the earlier "hide in sidebar and hub only" decision.

**Status 2026-10-01:** implemented with no database change; awaiting a logged-in check (the local Supabase stack was down).

How it works:

- A feature is a nav group or a page under it, identified by its `nav_key` (the page's href, or `group:<module>:<slug>`).
- Its status is declared in code, on the nav item in the module's `*-nav.ts` file: `status: "development"`. No status means released, so every existing feature is released.
- The per-environment switch is the existing `nav_item_settings` row. A row wins; with no row, a released feature is on and a development feature is off.
- The dashboard route guard blocks a route when its module is off, its feature or group is off, or the user's role is not permitted. Blocked routes redirect to `/dashboard`.
- Administration is never blocked, so a toggle can always be undone.
- If the settings cannot be loaded, the guard fails open and blocks nothing on the module toggle.

Shipping an unfinished feature:

1. Add the page and its nav item with `status: "development"`, then merge and deploy. It is hidden and unreachable everywhere.
2. To work on it locally, set `NEXT_PUBLIC_DCOS_SHOW_DEV_FEATURES=true` in `apps/web/.env.local`, or switch it on in Administration → Settings → Module Visibility → Manage navigation items.
3. To release it, switch it on in production from the same dialog. Once it is on everywhere, remove the `status` line.

A whole new module is released the same way through its `module_settings` row: seed the row with `is_active = false` in the module's migration, then switch it on in production.

Also resolved in this phase:

- Inventory, My Tasks and Department routes are now attributed to their modules, so the role check applies to them by direct URL.
- The admin navigation-item list is derived from the manifests and now includes the pages it had missed.

Limits:

- Views that share one page through a `?tab=` query (for example the QS Cost Control tabs) can be hidden but not route-blocked.
- The guard runs in the browser. It is a release switch, not a security boundary; database enforcement is Phase 6.

**Before deploying to production:** any module or navigation item already switched off there becomes unreachable, not just hidden. Review them first:

```sql
select module_key from public.module_settings where not is_active;
select nav_key, module_key from public.nav_item_settings where not is_active;
```

### Phase 3 — Module boundaries (about 1 week)

**Goal:** a change in one module cannot silently break another.

- Give each domain one public entry file; everything else is internal.
- Move the flat `lib/*.ts` services into their domain folders.
- Add the import-boundary lint rule as a warning, fix the existing cross-domain imports (about 26 folder-level edges), then make it an error.
- Name the shared core explicitly: WBS, projects, permissions, Supabase client, UI.

**Done when:** CI fails if one module imports another module's internals.

**Status 2026-10-01:** implemented. The rule is an error and rejects any new cross-module import; 27 existing ones are baselined as debt.

What was done:

- 31 flat `lib/*.ts` business files moved into `lib/<module>/` (for example `lib/qs/qs-service.ts`, `lib/hr/hr-nav.ts`), with 147 imports rewritten. Files left at the `lib/` root are core.
- `apps/web/module-boundaries.mjs` maps every folder to its owning module and lists each module's public API. Anything not listed is core.
- The `dcos/module-boundaries` ESLint rule (`apps/web/eslint-rules/`) enforces it: a file may import core, its own module, or another module's public API.
- `lib/modules/__tests__/boundaries.test.ts` checks the map against the module registry and the file system.

A deviation from the original task list: there is no barrel `index.ts` per module. A barrel that re-exports both client components and server code is hazardous in the Next.js App Router and slows builds, so the public API is a list of files in `module-boundaries.mjs` instead. Adding to it is a deliberate change in a file the project owner controls.

Public API today, beyond each module's nav file:

| Module | File | Why it is shared |
|---|---|---|
| Planning | `lib/planning/work-calendar.ts` | Working-day arithmetic used by Construction and WBS |
| Planning | `lib/planning/schedule-service.ts` | Progress snapshots read by earned value and dashboards |
| QS | `lib/qs/tender-lifecycle.ts` | Owner of tender stage; driven by the project screens |
| HR | `components/hr/leave/who-is-on-leave-today.tsx` | Dashboard widget |

Ownership decided by map entry, without moving the file:

- `components/report-kit` (chart and report-frame primitives) is core.
- The look-ahead route and its four views under `components/project/wbs` and `app/dashboard/wbs/lookahead` belong to Planning.
- `app/dashboard/administration/year-end` belongs to HR.

All of the debt below was cleared in Phase 6 by declaring public APIs and moving the WBS area functions to core. The table is kept as the record of what it was.

Debt at the end of Phase 3 (27 imports in 23 files):

| Count | From → to | What |
|---:|---|---|
| 14 | core → QS | Project, WBS and dashboard screens and `print-service` reading `qs-service`, `tender-cost-service`, `tender-approval`, `use-tender-permissions` |
| 4 | Design → QS | BIM quantity promotion into the BOQ |
| 3 | core → Planning | WBS and award screens using baseline, activity-step and resource services |
| 2 | Procurement → QS | BOQ item picker and raise-PR dialogs reading `qs-service` |
| 1 | QS → Procurement | BOQ builder opening the raise-PR dialog |
| 1 | Planning → Construction | Activity site-diary panel reading daily reports |
| 1 | core → HR | Notification dispatch using the Telegram bot client |
| 1 | core → Document Control | Naming transmittal detail using the printable transmittal sheet |

19 of the 27 go through QS's two large service files. Splitting those into a small read contract (BOQ items, project areas, cost summary) and internals is the main piece of work, and belongs with the QS roll-out in Phase 6.

How to work with the rule:

- To use something from another module, add the file to that module's `PUBLIC_API` entry, or move the code to core. Do not add to the baseline.
- After removing a baselined import, run `pnpm lint:prune` in `apps/web`.

### Phase 4 — Team readiness (3–4 days)

**Goal:** a team member can start without production data or production access.

- `CODEOWNERS` per module; shared code and `supabase/migrations` owned by the project owner.
- A fake-data seed set. The current local database is a production clone with real employee and payroll records and must not be shared.
- Migration rules: additive only, each module touches only its own prefixed tables, the owner reviews every migration.
- A pull-request template and a short onboarding guide.
- Preview deployments per pull request.

**Done when:** a new person goes from clone to running app with fake data in under an hour, and cannot merge outside their module without owner approval.

**Check first:** required code-owner review on a private repository, and multiple collaborators on Vercel, may need paid plans.

**Status 2026-10-01:** files in place; four items remain with the project owner (below).

What was done:

- `.github/CODEOWNERS`: every module's folders listed, all owned by `@Liheng-Code` until assigned; database, CI, the module contract and the lint baseline always stay with the project owner. A test keeps it in step with `module-boundaries.mjs`.
- `supabase/seeds/dev_demo_project.sql`: a fictional project (`DEMO-001`) with a small WBS and ten tasks, applied automatically on a fresh `supabase start`. Fresh stacks already get 35 demo users from `staff_list-seed.sql`. Dry-run in a rolled-back transaction; not applied to the owner's database.
- `.github/pull_request_template.md`: checks, release status, migration rules, cross-module imports.
- `scripts/check-migrations.mjs`, run in CI: migration file naming and unique versions.
- [DCOS-Developer-Onboarding.md](DCOS-Developer-Onboarding.md): setup, module layout, the rules, the workflow.

Remaining with the project owner:

1. **Assign modules.** Replace `@Liheng-Code` on a module's lines in `CODEOWNERS` with the member's GitHub username, and confirm `@Liheng-Code` is the right handle for the owner.
2. **Commit, push, and enable branch protection** on `main` with required status checks and "Require review from Code Owners". Without this, `CODEOWNERS` only suggests reviewers.
3. **Trial a from-empty setup.** A fresh `supabase start` replaying all 470 migrations plus both seeds has not been tested here, because that would mean wiping the working database. The first new member's setup is the test; expect to fix a migration or two.
4. **Decide what preview deployments connect to.** A preview that points at the production database would run unreleased code against live data. Options: a separate staging Supabase project, or previews with no database until one exists.

Also worth checking: the seeded demo accounts all use the password in `staff_list-seed.sql`. If any production account shares one of those emails and that password, change it before giving anyone access to the repository.

### Phase 5 — Pilot on HR (1–2 weeks)

**Goal:** prove the whole loop on Employees and E-Leave.

- Split the two largest pages (employee detail, leave admin) into components plus a service file.
- Move their database calls behind that service.
- Add tests for leave rules and balances.
- A team member builds one new HR feature end to end: branch, preview, merge hidden, release by flag.

**Done when:** one feature has gone from assignment to production release without the owner touching its code.

**Status 2026-10-01:** the code work is done and verified; the team-member trial remains.

What was done:

| Page | Before | After |
|---|---|---|
| Employee detail (`app/dashboard/hr/employees/[id]/page.tsx`) | 1,826 lines, one component, 27 state variables, 32 inline database calls | 110-line page, a controller hook, 16 components, one service file |
| Leave admin (`app/dashboard/hr/leave/admin/page.tsx`) | 1,473 lines, one component, 38 state variables, 17 inline database calls | 85-line page, a controller hook, 9 components, one service file |

The pattern, which the remaining modules follow in Phase 6:

- **Service** (`lib/hr/employee-detail-service.ts`, `lib/hr/leave-admin-service.ts`): every query, write and API call. Components make no database calls.
- **Types** (`lib/hr/*-types.ts`): row and form shapes.
- **Controller hook** (`components/hr/.../use-*.ts`): all state and actions for the page, returned as one object.
- **Section components** (`components/hr/employees/detail/`, `components/hr/leave/admin/`): one per tab, section or dialog, each rendering from the controller.
- **Page**: composes them.

The JSX was moved verbatim by line range, so markup and behaviour are unchanged.

Tests added (36, all passing):

- `lib/hr/__tests__/leave-day-calculation.test.ts`: day counting, Sunday and holiday exclusion, half days.
- `lib/hr/__tests__/approval-chain.test.ts`: who approves leave at each level, manual overrides, exclusions.
- `lib/hr/__tests__/leave-year-end-rules.test.ts`: rounding, completed service years, seniority band lookup, gender-restricted and inactive leave types. These rules were private helpers in the year-end API route and were extracted to `lib/hr/leave-year-end-rules.ts` unchanged.

How it was verified:

- A browser script signed in as a demo admin and recorded visible text, form values and button state for 41 views: the module hub, the sidebar, every tab of two employee records, every leave-admin section and its add, edit and delete dialogs. The recording after the refactor is identical to the one taken before.
- Save paths were exercised with unchanged values (employee compliance, payroll profile and leave/assets; leave type edit; leave type validation). All succeeded and row fingerprints in the database were identical before and after.
- This also served as the logged-in check of Phases 1 and 2: the sidebar, hidden items and hub order are as intended.

Not covered:

- Saves that write an audit or history entry (personal info, employment, system access, lifecycle actions, probation confirmation) and deletes were not exercised, to avoid adding entries to real records. Their code moved with the same logic and passes typecheck.
- The carry-forward calculation itself is still inside the year-end route's `buildPreview` and has no unit test.

Remaining: a team member builds one new HR feature end to end (branch, pull request, merge as `development`, release by switch). This needs the Phase 4 owner items done first.

### Phase 6 — Roll-out and permission enforcement (ongoing, per module)

**Goal:** every module at the HR standard, with permissions enforced in the database.

- Repeat Phase 5 for QS, Planning, Procurement, Inventory and the rest, in order of assignment.
- Seed `role_permissions` for the modules that currently default to allow: construction, QA/QC, HSE, account, planning, reporting.
- Enforce permissions in RLS and API routes.
- Merge the two module vocabularies into one.

**Done when:** a user without a module's permission is refused by the database, not only by the sidebar.

**Status 2026-10-01:** started. Tooling, cross-module contracts and one security fix are done; the per-module roll-out and database enforcement are open and need decisions (below).

#### Done

**Security fix.** `/api/hr/leave/withdraw` and `/api/hr/leave/cancel-request` ran with the service-role key and never checked who was calling, so anyone able to reach the app could withdraw or cancel a leave request by ID. Both now require a signed-in user who owns the request, which is what the screen already assumed. Verified: 401 when not signed in, 403 for a signed-in non-owner, record unchanged. A scan of all 119 API routes found no other service-role route without a caller check (`/api/auth/forgot-password` is public by design).

**Cross-module imports: 27 → 0.** Every import across a module boundary now goes through a declared public API, and the lint baseline for the boundary rule is empty.

- Seven WBS area functions (GFA per node, project site area) moved from the QS service to core (`lib/wbs-area-service.ts`); only WBS screens used them.
- QS exposes two files of named exports: `lib/qs/public.ts` (19 names from the commercial service) and `lib/qs/public-tender.ts` (5 names from the tender service). The rest of both services is internal.
- `lib/planning/public.ts` and `lib/construction/site/public.ts` do the same for two smaller services.
- Eight small files are public as a whole: tender approval and its permission hook, baselines, activity steps, the Telegram sender, and three components used as widgets or dialogs by another module.
- `public*.ts` files are owned by the project owner in `CODEOWNERS`.

**One code folder per module.** Modules whose code was spread over several top-level folders now keep it under one folder per layer, so a team member can be given a module as "`components/<module>/` and `lib/<module>/`":

| Module | Before | After |
|---|---|---|
| Construction | `components/site`, `components/qaqc`, `components/hse`, `lib/site` | `components/construction/{site,qaqc,hse}`, `lib/construction/site` |
| QS | `components/tenders`, `components/qto` | `components/qs/tenders`, `components/qs/qto` |
| Design | `components/bim`, `lib/bim` | `components/design/bim`, `lib/design/bim` |
| HR | `components/telegram`, `lib/telegram` | `components/hr/telegram`, `lib/hr/telegram` |
| Reporting | `components/insights` | `components/reporting/insights` |
| Inventory | `components/inv`, `lib/inv` | `components/inventory`, `lib/inventory` |
| Document Control | transmittal screens in `components/naming` (core) | `components/documents/transmittals/transmittal-{list,create,detail}.tsx` |

Two core folders were renamed or folded in for clarity: `components/reports` (shared charts, report frame and export, used by six modules) became `components/report-kit`, so it is not mistaken for the Reporting module; `components/master-libraries` (one file) moved into `components/administration`.

The Project module's folders (`projects`, `wbs`, `tasks`, `stakeholders`) are grouped as `components/project/*` and `lib/project/*` to match the sidebar. They stay core in the boundary rules, because every module builds on projects and the WBS; Planning's look-ahead and Gantt views inside `components/project/wbs` remain owned by Planning.

Files moved with `git mv` (history follows with `git log --follow`). Page, API and webhook URLs are unchanged, including `/api/inv`. Core component folders stay at the top level: grouping them under a `core/` folder would rewrite about 700 imports, `components/ui` is where the shadcn tool installs components, and core is owned by the project owner either way.

The transmittal screens still read through `lib/naming/naming-queries.ts` (core). Moving their queries into `lib/documents` is a follow-up if Document Control is handed to a team member.

**Module vocabularies.** The two vocabularies (`module_settings.module_key` and `role_permissions.module`) are joined in one place, each module's manifest (`rbacModules`). Renaming the codes in the database would touch about 1,200 permission rows and every policy that names them for no functional gain, so they are left as they are.

**Tooling.**

- `scripts/ui-snapshot/`: records what each view shows before and after a refactor and compares the two. Used to verify the HR pilot.
- `scripts/module-scorecard.mjs`: per-module progress, below. Re-run it after each module.

#### Scorecard (2026-10-01)

| Module | Files | Lines | DB calls in UI | UI files with DB calls | Data access in services | UI files over 800 lines | Test files |
|---|---:|---:|---:|---:|---:|---:|---:|
| QS | 189 | 58,360 | 414 | 84 | 49% | 7 | 0 |
| HR | 193 | 39,193 | 278 | 66 | 51% | 4 | 3 |
| Procurement | 66 | 10,030 | 159 | 33 | 10% | 0 | 0 |
| Planning | 172 | 37,898 | 112 | 27 | 63% | 5 | 21 |
| Inventory | 108 | 15,158 | 69 | 27 | 68% | 0 | 0 |
| Construction | 42 | 8,341 | 54 | 13 | 34% | 2 | 1 |
| Document Control | 22 | 6,280 | 52 | 12 | 4% | 1 | 0 |
| Account | 41 | 3,759 | 50 | 21 | 0% | 0 | 0 |
| Design | 65 | 7,921 | 25 | 8 | 57% | 1 | 0 |
| Reporting | 11 | 1,084 | 5 | 1 | 29% | 0 | 0 |
| Core | 277 | 50,979 | 407 | 87 | 23% | 6 | 3 |

"DB calls in UI" counts `.from(...)` and `.rpc(...)` in pages and components. The target for each module is zero, with every call in a `lib/<module>/` service. HR's two pilot pages are done; 66 HR files remain.

Suggested order, by risk and size: finish HR (payroll run page next), then Procurement and Account (small, almost no service layer, financial data), then QS, then the rest. Each module is done the way the HR pilot was: snapshot, extract service and sections, snapshot again, add tests for its rules.

#### Permission enforcement: current state

Measured against the local database:

- All 439 tables have row-level security enabled, and one (`timesheet_approvals`) has no policy, so only the service role can touch it.
- On 224 tables any signed-in user can insert rows; on 221 any signed-in user can read every row. The policies are `using (true)` or equivalent.
- The widest write access is on tender (28 tables), QS (25), design (19), procurement (17), QTO (14) and account (13).
- `role_permissions` is seeded for 11 module codes. There are no rows for `construction`, `qa_qc`, `hse`, `account_finance` or `reporting_kpi`, and Design has no code at all, so those modules are open to every signed-in user.
- A SQL function `has_permission(module, action, field)` already exists and can be the basis of real policies.
- Of 119 API routes, 110 use the service-role key (which bypasses row-level security), and about 90 of those identify the user but do not check a role. Inventory (44 routes), BIM (6) and Planning (10) check no role in the route.

This matches the existing [RLS Security Remediation Tracker](DCOS-RLS-Security-Remediation-Tracker.md), which records that remediation needs an explicit go-ahead.

#### Data access moved out of the screens (2026-10-01): done for every module

Every module's screens now reach the database through a query file in `lib/`, not directly.

| | Before | After |
|---|---:|---:|
| Direct database calls in pages and components | 1,691 | 50 |
| Query files | 0 | 19 (plus Account's hand-written service) |
| Query functions | 0 | 1,117 |

Scorecard after the move:

| Module | DB calls in UI | Data access in services | UI files over 800 lines | Test files |
|---|---:|---:|---:|---:|
| QS | 10 | 99% | 7 | 0 |
| HR | 5 | 99% | 4 | 3 |
| Construction | 3 | 96% | 2 | 1 |
| Design | 2 | 96% | 1 | 0 |
| Document Control | 2 | 96% | 0 | 0 |
| Inventory | 0 | 100% | 0 | 0 |
| Planning | 0 | 100% | 5 | 21 |
| Account | 0 | 100% | 0 | 0 |
| Reporting | 0 | 100% | 0 | 0 |
| Procurement | 0 | 100% | 0 | 0 |
| Core | 28 | 94% | 6 | 3 |

The 50 calls left are of three kinds: the table or function name is chosen at runtime, the client is passed in as a parameter, or the file is a hook on the sign-in and permission path that was deliberately not touched.

How it was done:

- `scripts/codemods/extract-service.mjs` parses each `supabase.from(...)` chain, turns its variable arguments into parameters, generates one function per distinct query in `lib/<module>/<module>-queries.ts`, and replaces the call site expression for expression. Names it cannot infer well are set in `scripts/codemods/names/<module>.json`. It can be run again on new code.
- Each module was recorded in the browser before and after with `scripts/ui-snapshot/`: 286 screens in total, all identical apart from fields that show the current time or a frame rate.
- Typecheck, lint, the unit tests and two new CI checks pass.

What the browser comparison caught, and typecheck and lint did not:

- an unrelated line of code rewritten by the tool's clean-up step (a label showed its internal key);
- an import placed above a `"use client"` line in 27 files written without semicolons (the app failed to build). `scripts/check-directives.mjs` now checks this in CI.

Typecheck caught a generated function given the same name as a local function in the calling file; the tool now refuses such a name.

Limits:

- The generated functions are thin: one per query, returning the query. They are a single place for data access, not yet a designed service API. Grouping them into purpose-named functions is follow-up work, module by module.
- The comparison covers what each screen shows on load and on its tabs. Dialogs, wizards and save actions inside pages were only spot-checked (Account, Procurement and HR saves with unchanged values).
- Large page files were not split in this pass; the count of files over 800 lines is unchanged.

#### Account pilot (2026-10-01): done locally

Account is the first module taken all the way: service layer and database enforcement.

- **Service layer.** All 50 database calls in Account's 21 screens moved to `lib/account/account-service.ts`. The scorecard for Account now reads 0 calls in UI, 100% in services.
- **Permissions.** 44 `account_finance` permission rows seeded; 52 policies on 13 tables replace the single "any signed-in user" policy each had.
- **Anonymous access closed.** The eight Account report views, and two more views in QS and Contracts, were readable through the API without signing in. Details, the default permission matrix and the verification are in the [RLS tracker, section 7](DCOS-RLS-Security-Remediation-Tracker.md).
- **Sidebar fix.** `hooks/use-permitted-modules.ts` no longer relies on a query that the API cut off at 1,000 rows.
- **Verified.** 18 Account screens identical for an administrator before and after; access checked through the API as five kinds of caller; a user with no Account role no longer sees Account and is redirected from its URLs.

The two migrations are applied to the local database only. Production changes when they are pushed.

#### Decisions needed before database enforcement continues

1. **Review the Account permission matrix** in the RLS tracker. It is a default chosen for segregation of duties, not a confirmed business rule; in particular, accountants cannot approve.
2. **The permission matrix for the four still-unseeded modules**: which roles may view, create, edit, approve in Construction, QA/QC, HSE and Reporting, and whether Design gets its own code. This is a business decision and cannot be inferred from the code.
3. ~~How the client programme portal authenticates.~~ Decided 2026-10-01: the portal is public by design, so `v_plan_client_programme` stays readable without signing in.
4. **Production roll-out.** The work is on branch `feat/modularisation`, pushed to GitHub on 2026-10-01. Opening the pull request, merging to `main` and running `/dbpush` are the project owner's steps; the two security migrations are the most urgent part. Run it as `/dbpush fast`: without `fast` the command wipes and rebuilds the local database first.

Policies are rolled out one module at a time, on the local database first, verified with the snapshot tool as an administrator and through the API as restricted users, as was done for Account.

### Phase 7 — Extraction (only on a trigger)

Start only if one of these happens:

- someone must work on a module without seeing the rest of the code, which requires a separate repository for that module;
- a second application, such as the mobile field app, needs the shared types and permissions, which requires shared packages.

## Rules that apply throughout

- No working feature is removed and no business behaviour changes without approval.
- No database column or API contract is renamed silently.
- Migrations are never deleted, and the local database is never reset.
- Changes are small and incremental; each phase is verified before the next starts.

## Open decisions

1. ~~Phase 2: approve that disabled features block their URL as well as hiding from the sidebar.~~ Approved 2026-10-01.
2. Phase 5: confirm HR as the pilot, or name the module to assign first.
3. Phase 4: confirm whether paid GitHub and Vercel plans are acceptable if required.
