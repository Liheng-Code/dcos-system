---
name: perf-check
description: Measure why DCOS pages or tabs are slow, and check that a change did not make them slower. Counts each page's Supabase requests and sequential request rounds in a headless browser on the local stack, times production page requests read-only, and lists the known causes with their fixes. Use when the user says the app, a page or a tab is slow (especially "slow on production, fine locally"), before shipping a change that adds data loading to a shared component, layout or provider, or when asked to run a performance check.
argument-hint: "[page paths | project code] [--clicks]"
---

# perf-check: find what makes a page slow

## Why rounds, not milliseconds
Locally a Supabase request takes ~5-20 ms, so a page that waits for 20 requests in a row still feels instant. On production every request crosses the internet (browser in Cambodia, Vercel edge sin1, functions icn1, Supabase ap-northeast-2 Seoul): **each sequential round costs one round trip, ~100-250 ms**. So the measure that predicts production speed is the **number of rounds** a page waits for, then the number of requests. Local milliseconds mislead.

Baseline after the Oct 2026 fix (commit f3e71ad): full page load 25-61 requests in **4-7 rounds**; a project tab click 0-34 requests in **1 round** and **0 server navigations**. Before it: 88-128 requests in 17-23 rounds.

## Step 1: measure locally (the probe)
Needs: local Supabase running, dev server on :3100 (`pnpm dev`). The script reads the keys from `supabase status` itself and refuses any non-local URL, so it never touches production.

```bash
# Git Bash: MSYS_NO_PATHCONV=1 stops it rewriting /dashboard paths into C:/... paths
MSYS_NO_PATHCONV=1 node .claude/skills/perf-check/scripts/perf-probe.mjs \
  --pages /dashboard,/dashboard/planning/gantt,/dashboard/qs \
  --json <scratchpad>/perf-before.json

# One project: every tab as a full load, then clicking through the tabs in the page
MSYS_NO_PATHCONV=1 node .claude/skills/perf-check/scripts/perf-probe.mjs --project PRJ-2026-004-PC --clicks

# After a change: same arguments plus --baseline to print the difference per page
MSYS_NO_PATHCONV=1 node .claude/skills/perf-check/scripts/perf-probe.mjs --pages ... --baseline <scratchpad>/perf-before.json
```

Options: `--tabs overview,boq` (subset of project tabs), `--email <user>` (default liheng@dcos.com; use a non-admin to see RLS cost), `--app <url>` (another local port, e.g. a lane on 3001), `--json <file>`.

Columns:
- **requests / rounds**: Supabase calls and how many wait on an earlier one. Dev mode (React StrictMode) runs effects twice, so production makes about half the requests; rounds compare as they are.
- **server-nav**: requests to the Next server on an in-page click (RSC). On production each costs ~0.2 s (plus a cold start up to 1.5 s). A tab click should show 0.
- **repeated**: the same endpoint fetched more than twice in one page load: a sign of a missing shared cache or provider.

What to look for, in order:
1. **Rounds > 7 on a full load**, or **> 1 on a tab click**: a request chain (await A, then B, then C). Find the component with the `await` chain.
2. **The same table many times** (`user_roles`, `roles`, `profiles`, `projects`): several components fetch the same thing on mount. Share it (context, module-level promise, or an RPC).
3. **server-nav > 0 on a tab click**: the tab uses `router.push/replace` for a page that is client-only. Use `window.history.replaceState` (see below).
4. **One slow request** in `slowest`: a heavy query or RPC. Check it with `explain analyze` on the local DB, and `pg_stat_statements` (`select query, calls, mean_exec_time from pg_stat_statements order by total_exec_time desc limit 20`).

## Step 2: time production (read-only)
No login needed; these only time the Vercel side.

```bash
B=https://dcos-system-web.vercel.app
curl -sI $B/dashboard | grep -i x-vercel-id     # expect sin1::icn1::  (edge::function region)
for p in /dashboard/qs /dashboard/projects/PRJ-2026-004-PC/boq; do for i in 1 2 3; do
  MSYS_NO_PATHCONV=1 curl -s -o /dev/null -H "RSC: 1" -w "$p %{time_starttransfer}s\n" "$B$p?_rsc=x$RANDOM"; done; done
```
Expected: cached module routes ~0.1 s, dynamic routes ~0.2 s, first hit after a deploy or idle period up to ~0.8-1.5 s (cold start). If the function region is not `icn1`, check `regions` in both `vercel.json` files.

Vercel request logs are not available on the current plan (403). For the browser-to-Supabase part on production, ask the user for a DevTools Network screenshot (F12 > Network, reload, sort by start time).

Never query the production Supabase project from this skill. Production database checks belong to the user (or `/dbpush`).

## Known causes and fixes in this codebase
| Cause | Fix already in place | Do not reintroduce |
|---|---|---|
| Sidebar permissions: ~30 requests, 4-5 rounds, layout spinner waits | RPC `current_user_module_access` + sessionStorage cache in `apps/web/hooks/use-permitted-modules.ts` | per-code permission loops in the layout path |
| `auth.getUser()` 4-17x per page, serialised behind supabase-js's session lock | `apps/web/lib/supabase/client.ts` shares one answer for 60 s | a second Supabase browser client that bypasses `createClient()` |
| Project tab click asked the server for the route | `project-workspace.tsx` `openTab` uses `window.history.replaceState`; tab read from `usePathname()` | `router.replace` for in-page tab switches on client-only pages |
| Functions in iad1 (US) while the DB is in Seoul | `"regions": ["icn1"]` in `vercel.json` and `apps/web/vercel.json` | removing or changing the region without moving the DB |
| PostgREST `.in()` with >~215 ids returns 414 and retries | batch with `in-chunks.ts` | long `.in()` lists |

## Report
Give the user: the pages measured, requests and rounds before/after (a small table), the cause found with file:line, and the fix. Keep production timings separate from local ones and say which is which. When a fix lands, update the baseline numbers in this file.
