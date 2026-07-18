# Local to Production: Supabase Migration Guide

## Why This Setup Makes It Easy

Supabase's local dev system (`supabase start`) mirrors the hosted production environment. The same `config.toml`, same migrations, same edge functions — they deploy identically.

## Steps to Go to Production

### 1. Create a Supabase project

Sign up at [supabase.com](https://supabase.com), create a new project. You'll get a **project ref** (looks like `abcdefghijklmnopqrst`) and an **anon key** + **service role key**.

### 2. Link local to production

```bash
supabase link --project-ref <your-project-ref>
```

This connects your local `supabase/` directory to that specific project. It stores the DB password locally so subsequent commands work.

### 3. Push your schema (when you have migrations)

```bash
supabase db push
```

This runs any migration files from `supabase/migrations/` against the production DB. Since you have none yet, you'd first create them:

```bash
supabase migration new create_profiles
# edit supabase/migrations/<timestamp>_create_profiles.sql
supabase db push
```

### 4. Deploy edge functions (when you have them)

```bash
supabase functions deploy <function-name>
```

### 5. Update env files

Replace localhost URLs + keys with your production project's values:

**`apps/web/.env.local`** → rename to `.env.production` or use your framework's production env:
```
PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<production-anon-key>
```

**`apps/api/.env`** → rename to `.env.production`:
```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<production-service-role-key>
SUPABASE_ANON_KEY=<production-anon-key>
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

You can get all these from your Supabase project dashboard under **Settings → API**.

### 6. Adjust `config.toml` for production

Things that differ:
- `site_url` → your real domain
- Auth providers → enable + add production client IDs/secrets
- Storage bucket settings
- Rate limits

## Key Principles

| Local | Production |
|---|---|
| Database migrations first created + tested locally | Then pushed via `supabase db push` |
| Edge functions tested with `supabase functions serve` | Then deployed via `supabase functions deploy` |
| Env vars point to `localhost:54321` / local keys | Point to `https://<ref>.supabase.co` / production keys |
| `supabase start/stop` manages services | Everything runs on Supabase's infrastructure |

## What You Should Do Now (for smooth migration later)

1. **Create at least one migration** before pushing — establishes the pattern
2. **Keep `config.toml` in sync** — avoid editing it directly on the Supabase dashboard; manage it locally and push
3. **Don't hardcode keys** — use the env file pattern you already have
