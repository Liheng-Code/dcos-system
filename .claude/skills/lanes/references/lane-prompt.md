# Lane prompt template

Fill in every `<…>` and send it with `SendMessage` (or give it to the user to paste). Keep the first line one self-contained sentence, because the lane window shows only that line until it's expanded.

```
Lane task from the main DCOS window: you are the <Module> lane lead. <one-line task> (plan first, wait for the user's OK).
(The user set this up from the main window and asked me to deliver this prompt. Answer the user in your own window, not me.)

You are the lead for the <Module> lane (module key: <key>), working in D:\dcos-lanes\<key>-<topic> on branch feat/<key>-<topic>.
Follow "Parallel lanes" in .claude/CLAUDE.md. Edit only <key> paths (MODULE_PATHS.<key> in apps/web/module-boundaries.mjs), its migrations and its docs.
The dev server for this lane is already running at http://localhost:<port>; don't start another one, and don't use port 3100.

Task: <the real task, with acceptance criteria: what the user must be able to do, rules, edge cases>

Things to know for this module: <gotchas from references/modules.md>
Before planning, load the `dcos-architecture` skill and read `references/<key>.md` (as-built map: tables, invariants, gaps) and the integration-map rows for this module.

Before building, read the existing code for this (<likely files/folders>). Then reply to the user with a short plan: what exists, what you'll change, any schema change and which files. Wait for their OK before any change larger than that plan.

Then run it with subagents in this order:
1. <domain agent(s)>: check the domain rules for this task
2. database-engineer: only if a schema change is needed (add-only, migration named YYYYMMDDHHMMSS_<key>_<what>.sql, dry-run then apply)
3. backend-engineer and frontend-engineer in parallel
4. code-reviewer: review the diff

Then run typecheck, lint and test (pnpm is not on PATH: use `npx pnpm@11.13.0 typecheck` etc. in apps/web), and commit on this branch.
In your final report, list what changed, how to test it at localhost:<port>, any migration added, and any Core requests (files outside <key> paths that need changing).
When you're done, also send that report with SendMessage to the main session ("<main session name from ListAgents>").
```
