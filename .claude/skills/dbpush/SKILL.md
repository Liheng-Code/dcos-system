---
name: dbpush
description: Push local Supabase migrations to the linked PRODUCTION project (preflight, dry-run, review, confirm, push, verify). Only run when the user types /dbpush.
disable-model-invocation: true
argument-hint: "[fast] [functions]"
---

# /dbpush — push local migrations to production

Pushes `supabase/migrations/*` to the **linked production project** (`swyhplzjhdypvkhstpgp`). This changes production, so follow every step in order and never skip the confirmation in step 5.

Arguments (optional, any order):
- `fast` — skip the full local replay check in step 2 (only if the user already verified locally in this session)
- `functions` — also deploy edge functions in `supabase/functions/` after the DB push (step 7)

## Shell setup (Windows PowerShell)
`supabase` and `git` are often missing from PATH in this shell. Run this first in each PowerShell call, and use the project CLI:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
cd d:\dcos-system
$sb = ".\node_modules\.bin\supabase.cmd"   # then: & $sb <args>
```

## Steps

### 1. Preflight (fail fast, fix before continuing)
- Docker is running: `docker info`. If not, tell the user to start Docker Desktop and stop.
- Duplicate migration versions (digits before the first `_`) must not exist:
  ```powershell
  Get-ChildItem supabase\migrations -Filter *.sql | Group-Object { $_.Name.Split('_')[0] } | Where-Object Count -gt 1
  ```
  Any output = stop and report; rename one file to an unused version.

### 2. Prove the migrations replay from an empty DB (skip if `fast`)
```powershell
& $sb stop --no-backup
& $sb start
```
This wipes the LOCAL database only (it is rebuilt from migrations + seeds). If `start` fails, stop, diagnose and fix the migration (see "Local Supabase" in `.claude/CLAUDE.md`), then restart from step 2. Never push a migration set that does not replay cleanly locally.

### 3. Compare local vs production
```powershell
& $sb migration list --linked
```
Report: which local migrations are missing on remote (these would be pushed), and any remote-only versions (drift).
- If there are **remote-only** versions or a history mismatch, STOP. Explain it and ask the user how to proceed. Do **not** use `--include-all` or `supabase migration repair` on your own.
- If nothing is pending, say "production is already up to date" and stop.

### 4. Dry run and review
```powershell
& $sb db push --dry-run
```
Read every pending migration file. Summarize each in one line and **flag risky statements**: `DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE`/`UPDATE` without a tight `WHERE`, `ALTER COLUMN ... TYPE`, `SET NOT NULL` on existing tables, `DROP POLICY`/disabling RLS, `REVOKE`, and seed data that would touch real production rows.

### 5. Confirm with the user (mandatory, every time)
Use AskUserQuestion. Show: number of pending migrations, their names, and any risk flags. Options: "Push to production" / "Cancel". Approval from an earlier `/dbpush` run does not carry over. If they cancel, stop.

### 6. Push
```powershell
& $sb db push
```
On error, stop and report the exact message. Do not retry with `--include-all`, do not edit already-applied migrations to make it pass, do not run `migration repair` without asking.

### 7. Edge functions (only if `functions` was passed)
Confirm again via AskUserQuestion, then:
```powershell
& $sb functions deploy
```

### 8. Verify and report
```powershell
& $sb migration list --linked
```
Confirm local and remote columns now match. Report what was pushed, in a few lines. Remind the user to run the app's smoke check on production if any migration changed RLS or schemas the UI depends on, and to commit the migration files if not already committed.

## Rules
- Only ever target production through `--linked` commands in this skill; use `--local` for anything else.
- Never print or store database passwords or keys.
- Never push if any earlier step failed or was skipped without the user's say-so.
