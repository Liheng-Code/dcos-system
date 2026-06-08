# DC/OS System — AGENTS.md

## Architecture

Scaffold monorepo — apps/ and packages/ subdirectories exist but are empty.

```
apps/api/          — intended API service
apps/web/          — intended frontend
packages/config/   — shared configuration
packages/shared/   — shared code
packages/ui/       — shared UI components
docs/              — empty
```

The only live infrastructure is the **Supabase** project (`project_id = "dcos-system"`, PostgreSQL 17, Deno v2 edge runtime). Supabase config at `supabase/config.toml`.

## Developer Commands

```bash
supabase start       # start all local Supabase services
supabase stop        # stop services
supabase status      # check health
supabase db reset    # reset DB, run migrations + seed
supabase db push     # push schema changes
supabase functions serve  # serve edge functions (hot-reload via per_worker policy)
supabase functions deploy  # deploy to production
```

Local Supabase services run on:
- API: `localhost:54321`
- DB: `localhost:54322`
- Studio: `localhost:54323`
- Inbucket (email): `localhost:54324`
- Edge runtime inspector: `8083`

## Environment Files

- `apps/web/.env.local` — client-safe Supabase credentials (public anon key)
- `apps/api/.env` — server-side credentials (service role key, DB URL)

**Key gotcha:** Supabase keys rotate on every `supabase stop` + `supabase start`. Refresh env files after restarting:
```bash
supabase status --output env > apps/web/.env.local
supabase status --output env > apps/api/.env
```

Env vars use generic prefixes (`PUBLIC_SUPABASE_*` for web, `SUPABASE_*` for API). Rename to framework-specific prefixes when adopted (e.g. `NEXT_PUBLIC_SUPABASE_*`, `VITE_SUPABASE_*`).

## What's Missing

- No root `package.json`, no package manager chosen (npm/pnpm/yarn/bun)
- No test, lint, typecheck, or formatter infrastructure
- No CI/CD workflows
- Not yet a git repository
- Edge function directories under `supabase/functions/` are empty
- DB migrations dir (`supabase/migrations/`) and seed (`supabase/seed.sql`) are empty

An agent working here will need to set up these foundations before writing application code.

## Supabase Conventions

- Auth: email signup enabled, confirmations disabled, site URL `localhost:3000`
- Edge runtime policy: `per_worker` (hot reload), Deno 2
- Seed via `supabase/seed.sql` (enabled)
- Migrations enabled
- Storage: `50MiB` file size limit, S3 protocol enabled

## Git

- `.gitignore` exists at root (covers node_modules, .env, dist, .temp, .branches)
- Not yet initialized as a git repo — run `git init` before committing anything
