# DCOS: Deploy-Time Module Selection (Prompt and Runbook)

Purpose: choose which DCOS business modules a Vercel deployment ships (for example only Project), instead of every module going live. The selection is made before each deploy with one environment variable.

This file has two parts:

1. A reusable **prompt** to give Claude Code when you want this set up, or changed, in the repo.
2. A **runbook** for the Vercel steps you do yourself.

---

## 1. Prompt for Claude Code

Copy everything inside the block below.

```text
Goal
I want to choose, before each production deploy, which DCOS modules go live.
Example: only Project / Projects / WBS / Tasks to Vercel, the other modules hidden.

Requirements
1. One environment variable, DCOS_ENABLED_MODULES, read at build time.
   - Value: comma-separated module_settings keys, e.g. "project" or "project,qs,planning".
   - Valid keys: project, administration, hr, qs, planning, procurement, inventory,
     design, construction, document_control, account, reporting.
   - "project" and "administration" are always on.
   - Unset, empty or "all" ships every module (local development default).
   - An unknown key must fail the build with a message listing the valid keys.
2. A module that is off:
   - leaves the sidebar and the module hub (derive from lib/modules/registry.ts);
   - its dashboard pages redirect to /dashboard;
   - its API, Telegram mini-app and portal routes answer 404.
3. Derive the blocked URLs from apps/web/module-boundaries.mjs (MODULE_PATHS) so there
   is no second route list to keep in sync.
4. Client code needs the same selection: expose it as NEXT_PUBLIC_DCOS_ENABLED_MODULES
   through the `env` option in next.config.ts.
5. Put the pure logic in apps/web/module-deployment.mjs, the client helper in
   apps/web/lib/modules/deployment.ts, and unit tests in
   apps/web/lib/modules/__tests__/deployment.test.ts.
6. Document the variable in apps/web/.env.example and in .claude/CLAUDE.md
   (Modules & boundaries section).

Constraints
- Work against the LOCAL Supabase only. Never touch production (no --linked, no db push,
  no Supabase MCP). Promoting migrations is done by me with /dbpush.
- Read apps/web/CLAUDE.md first: this is Next.js 16 (middleware is now "proxy"; check
  node_modules/next/dist/docs/ before changing routing or config).
- Do not add to the boundary baseline in eslint-suppressions.json.
- Hiding is not removal: Project imports QS, Planning and HR code, so the other modules'
  code stays in the bundle. State this limit in the summary.

Verify before reporting done
- Typecheck, lint and the unit tests pass.
- Load next.config.ts through Next's own loader with DCOS_ENABLED_MODULES=project and show
  the generated redirects and rewrites; also show that unset changes nothing and a typo
  (e.g. "projcet") fails.

Then
- Commit on the current feature branch with the Co-Authored-By trailer and push it.
- Do NOT merge to main or open a PR unless I ask; tell me what merging would ship.
```

---

## 2. Runbook: Vercel steps (you do these)

### 2.1 Add the variable

Vercel → project (`dcos-system-web`) → Settings → Environment Variables → Add.

| Field | Value |
|---|---|
| Type | **Config** (not Secret, so you can read it back) |
| Key | `DCOS_ENABLED_MODULES` |
| Value | `project` (value only, no `DCOS_ENABLED_MODULES=`, no quotes, no spaces) |
| Environments | **Production and Preview**, or separate entries if you want different values |
| Link to Projects | the DCOS web project |

Use separate entries when Preview should show more than Production, for example Preview `project,qs` and Production `project`.

### 2.2 Redeploy so the value is applied

The value is inlined at build time, so existing deployments do not change.

1. Deployments → ⋯ on the deployment → **Redeploy**.
2. Turn **off** "Use existing build cache".
3. In the build log, look for: `[dcos] modules enabled: project, administration`.

### 2.3 Check the result

- The module hub shows only the enabled modules (Project and Administration for `project`).
- A hidden URL such as `/dashboard/hr` redirects to `/dashboard`.
- A hidden API route such as `/api/hr/anything` returns 404.

### 2.4 Get it into Production

A push to a feature branch creates a **Preview** deployment, not Production. Production builds the Production Branch (Settings → Git), usually `main`. Pick one:

- **Merge** the feature branch into `main` (ships everything on the branch).
- **Promote to Production** on the tested Preview deployment (deployment ⋯ menu), which serves that exact build. The variable is baked in at build time, so make sure that build used the value you want live.

Before shipping, confirm the production database has the migrations the branch needs (`/dbpush`, done by you).

### 2.5 Change the selection later

Edit `DCOS_ENABLED_MODULES` in Vercel, then redeploy with the build cache off.

---

## 3. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Every module still shows | The deployed code predates the feature (not merged or pushed to the branch being built), or the variable is not set for that environment | Confirm the deployment's commit includes `feat(modules): choose which modules a deployment ships`; tick the right environment; redeploy without cache |
| Preview shows all modules, Production variable is set | Variable was added for Production only | Edit it and tick Preview, then redeploy the Preview |
| No `[dcos] modules enabled` line in the build log | Variable not set for that environment, or old code | As above. The line only prints when the variable is set |
| Build fails with "unknown module(s)" | Typo in a key | Use only the valid keys listed above |
| Administration still shows | By design: it is always on so users, roles and Module Settings stay manageable | Optional change: allow leaving it out, at the cost of no admin access on that deployment |
| Telegram attendance bot stops | HR is off, so `/api/hr`, `/api/telegram` and `/telegram-app` return 404 | Include `hr` in the list |
| WBS look-ahead page redirects | Planning owns that route and it is off | Include `planning` |

## 4. Limits to remember

- **Hidden, not removed.** Disabled modules are still in the bundle.
- **Not a data boundary.** RLS protects data; a logged-in user could still query a hidden module's tables through the Supabase API unless RLS denies them.
- **Planning and QS code is used by Project** (WBS Gantt, look-ahead, S-curve, cost tab, pre-contract and award screens). Hiding those modules is safe; removing their tables or code is not.

## 5. Where it lives in the repo

| File | Role |
|---|---|
| `apps/web/module-deployment.mjs` | Parse and validate the variable; compute blocked routes |
| `apps/web/lib/modules/deployment.ts` | Client-side `isModuleDeployed()` |
| `apps/web/lib/modules/registry.ts` | Filters the module list (sidebar, hub) |
| `apps/web/next.config.ts` | Inlines the variable; adds redirects and 404 rewrites |
| `apps/web/module-boundaries.mjs` | Source of each module's folders and routes |
| `apps/web/lib/modules/__tests__/deployment.test.ts` | Unit tests |
