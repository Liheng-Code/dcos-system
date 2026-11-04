# DCOS Developer Onboarding

For a developer joining the DCOS team. It takes you from a fresh clone to a running app, then explains the rules for working on a module. Background on why the project is organised this way is in [DCOS-Modularisation-Plan.md](DCOS-Modularisation-Plan.md).

## 1. Set up your machine

You need:

- Node.js 22 or newer
- pnpm (`npm install -g pnpm`)
- Docker Desktop, running
- Git

Then, from the repository root:

```bash
pnpm install
pnpm exec supabase start
```

The first `supabase start` downloads the Supabase images and applies every migration, so allow several minutes. When it finishes it prints the local URLs and keys. Print them again at any time with `pnpm exec supabase status`.

Create `apps/web/.env.local` from `apps/web/.env.example` and fill in three values from that output:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

Start the app:

```bash
pnpm dev
```

Open http://localhost:3000 and sign in.

| Account | Role | Password |
|---|---|---|
| `liheng@dcos.com` | Administrator | `dcosdemo#2026` |
| `vuthy@dcos.com` | Project manager | `dcosdemo#2026` |
| `kimseng@dcos.com` | HR manager | `dcosdemo#2026` |

These are demo accounts created by the seed files. Your local database also contains one fictional project, `DEMO-001 Demo Office Building`, with a small WBS and ten tasks.

Your local database is yours alone. You will not be given production data or production keys, and you do not need them.

| Local service | Address |
|---|---|
| App | http://localhost:3000 |
| Supabase Studio (browse tables, run SQL) | http://127.0.0.1:54323 |
| Mailpit (emails the app sends locally) | http://127.0.0.1:54324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

## 2. How the code is organised

Everything is one Next.js app in `apps/web`. Each business module owns a set of folders:

| What | Where |
|---|---|
| Pages | `app/dashboard/<module>/` |
| API routes | `app/api/<module>/` |
| Components | `components/<module>/` |
| Services and data access | `lib/<module>/` |
| Navigation | `lib/<module>/<module>-nav.ts` |
| Manifest (key, permission codes, routes, icons) | `lib/modules/manifests/<module>.ts` |

A module with several areas keeps them as subfolders of its own folder, for example `components/construction/site`, `components/construction/qaqc` and `components/construction/hse`. Add a new area the same way rather than as a new top-level folder. Page URLs can differ from the code folders: Construction's pages are still `/dashboard/site`, `/dashboard/qaqc` and `/dashboard/hse`.

The exact folder list for each module is in `apps/web/module-boundaries.mjs`. Anything not listed there is **core**: the shell, WBS, projects, tasks, permissions, the Supabase client and the shared UI components in `components/ui`.

### How a page is put together

New pages, and pages you rework, follow the pattern used by HR's employee detail and leave admin pages:

| Piece | Where | What it holds |
|---|---|---|
| Service | `lib/<module>/<feature>-service.ts` | Every query, write and API call |
| Types | `lib/<module>/<feature>-types.ts` | Row and form shapes |
| Controller hook | `components/<module>/<feature>/use-<feature>.ts` | State and actions, returned as one object |
| Sections | `components/<module>/<feature>/*.tsx` | One component per tab, section or dialog |
| Page | `app/dashboard/<module>/.../page.tsx` | Composes the sections |

Components do not call the database directly; they go through the service.

Each module also has a generated `lib/<module>/<module>-queries.ts`, one small function per query, which the existing screens use. When you add a query, add a function there (keep the `// @table` comment above it) or, for a new feature, write a purpose-named service that uses it. If you paste code that calls `supabase.from(...)` in a component, move it with:

```bash
node scripts/codemods/extract-service.mjs --service apps/web/lib/<module>/<module>-queries.ts --plan <files>
```

Drop `--plan` to apply it, then check the screens with the snapshot tool described below. Rules that can be written as plain functions (calculations, eligibility, routing) go in `lib/<module>/` with a test beside them in `__tests__/`.

`components/hr/employees/detail/` and `lib/hr/employee-detail-service.ts` are the reference example.

## 3. The rules

### Stay inside your module

Your code may import three things: core, your own module, and another module's **public API**. The public API of each module is the short list of files under `PUBLIC_API` in `module-boundaries.mjs`.

For the larger services the public API is a file of named exports, such as `lib/qs/public.ts`: import from that file, not from the service behind it.

Importing anything else from another module fails `pnpm lint` with a `dcos/module-boundaries` error. If you need something another module owns, ask the project owner. The answer is one of:

- the file is added to that module's public API;
- the shared code moves to core;
- you read the data yourself from the database instead.

Do not add entries to `eslint-suppressions.json` to get past the rule.

### Ship unfinished work hidden

You do not need to wait until a feature is finished to merge it. Mark the new page as in development in your module's nav file:

```ts
{ label: "Recruitment", href: "/dashboard/hr/recruitment", status: "development" },
```

A development page is hidden from navigation and its URL redirects to the dashboard, in every environment, until an administrator switches it on.

To see your own development pages locally, add this to `apps/web/.env.local` and restart `pnpm dev`:

```bash
NEXT_PUBLIC_DCOS_SHOW_DEV_FEATURES=true
```

When the feature is ready, tell the project owner. They switch it on in production under Administration → Settings → Module Visibility. Once it is on everywhere, remove the `status` line.

### Database changes

Schema changes go in a new file in `supabase/migrations/`, named `<yyyymmddhhmmss>_<short_description>.sql`. Use the current date and time as the version so it sorts after every existing migration.

- **Add, don't change.** New tables, new nullable columns, new indexes and new policies are safe. Renaming, dropping or changing an existing column needs agreement with the project owner first, because production runs the old code until the next deploy.
- **Your module's tables only.** Tables are prefixed by module (`qs_`, `inv_`, `plan_`, `hse_`, and so on). Shared tables such as `projects`, `profiles`, `wbs_nodes` and `wbs_tasks` belong to core.
- **Every new table needs row-level security** enabled, with policies.
- **Never edit or delete a migration that has been merged.** Write a new one.
- **Make it re-runnable** where you can: `create table if not exists`, `add column if not exists`, `drop policy if exists` before `create policy`.

Test a migration without resetting your database by running it in a transaction that is rolled back, then apply it:

```powershell
# dry run: nothing is kept
("begin;`n" + (Get-Content supabase/migrations/<file>.sql -Raw) + "`nrollback;") | docker exec -i supabase_db_dcos-system psql -U postgres -d postgres -v ON_ERROR_STOP=1

# apply
Get-Content supabase/migrations/<file>.sql -Raw | docker exec -i supabase_db_dcos-system psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1
```

Only the project owner applies migrations to production.

Sample data your module needs for development goes in its own seed file under `supabase/seeds/`. Use fictional data only.

## 4. Day-to-day workflow

1. Update `main` and create a branch: `git switch -c hr/recruitment-list`.
2. Make your change. Keep pull requests small; one feature or fix each.
3. Before pushing, run in `apps/web`:

   ```bash
   pnpm typecheck
   pnpm lint
   pnpm test
   ```

4. Push and open a pull request against `main`. Fill in the template.
5. CI runs the same three checks plus a production build and a migration check. All must pass.
6. The owner of every file you touched is asked to review. Files outside your module, and all database changes, are reviewed by the project owner.
7. After merge, the change deploys. If the feature is marked `development`, users see nothing until it is switched on.

### Checking a refactor did not change behaviour

When you restructure an existing page, record what it shows before and after, and compare:

```bash
node scripts/ui-snapshot/snapshot.mjs my-views.json before.json
# ... refactor ...
node scripts/ui-snapshot/snapshot.mjs my-views.json after.json
node scripts/ui-snapshot/compare.mjs before.json after.json
```

`scripts/ui-snapshot/views.hr.example.json` shows the views file format. The tool only reads; it never submits a form.

## 5. Things that will trip you up

- **Lint baseline.** `apps/web/eslint-suppressions.json` records errors that existed before the rules were enforced. New errors fail. If you fix old ones, run `pnpm lint:prune` to shrink the baseline.
- **Next.js 16.** Some APIs differ from older versions. Check `apps/web/CLAUDE.md` and `node_modules/next/dist/docs/` before changing routing or configuration.
- **Permissions are checked in the browser for some modules.** Treat the database as the security boundary: a table without the right row-level security policy is readable by any signed-in user.
- **Do not run `supabase db reset` or `supabase stop --no-backup` casually.** Both wipe your local database. `supabase stop` on its own keeps your data.
