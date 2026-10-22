---
name: lanes
description: Run DCOS work in parallel lanes (one Claude session per business module in its own git worktree, each lead using subagents), or an Agent Team for a cross-module feature. Use from the main window (D:\dcos-system) to start lanes, check on them, merge a finished lane, or clean up, e.g. "/lanes start qs planning", "check the lanes", "merge the QS lane", "clean up the lanes".
argument-hint: "start <module>[:<topic>] … | status | merge <module> | cleanup [<module>] | team <module>,<module>"
---

# /lanes: parallel module lanes

The **rules** a lane follows live in `.claude/CLAUDE.md` → "Parallel lanes" (lane scope, core files, add-only migrations, timestamp versions, report back). This skill is the **procedure** the main window runs. Don't repeat the rules in prompts; point lanes at that section.

Per-module facts (key, domain agent, gotchas) are in `references/modules.md`. Prompt templates are in `references/lane-prompt.md` and `references/team-prompt.md`. Read only the file the current step needs.

Run this skill only from the main checkout `D:\dcos-system` (dev server on **3100**). Never from inside a lane.

## Environment facts (this machine)
- `pnpm` is not on PATH. Use `npx -y pnpm@11.13.0 <cmd>`. Read the version from `node_modules/.modules.yaml` if it changes.
- For typecheck, lint and test, call the binaries directly; that's fastest:
  `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js --pass-on-unpruned-suppressions`, `node node_modules/vitest/vitest.mjs run` (in `apps/web`).
- Untracked files in the main checkout (e.g. an unfinished prototype) aren't in any lane, but tsc and eslint still see them in the main checkout. When checking a merge, ignore errors that come only from untracked files and say so.
- Git has no identity configured in Claude's shells. Commit with `git -c user.name="Pouth Liheng" -c user.email=p.liheng@cmedcc.com commit …` plus the attribution trailer.
- Apply migrations from Git Bash (`psql < file`), not PowerShell piping (it corrupts non-ASCII).

## start: create lanes and hand out the tasks
Input: up to 3 modules (counting lanes already open), each with a topic and a task. If the user gave no real task, ask for one (AskUserQuestion). Never invent a feature for a lane to build.

1. **Preflight.**
   - `git status --porcelain | grep -v '^??'` must be empty, because a lane starts from the last commit. If not, offer to commit first.
   - `git worktree list`: count the open lanes. The maximum is 3.
   - Check the tasks don't overlap. Two lanes must not share a module, and a task that touches another module's internals is cross-module (use `team`, see below). Check against `MODULE_PATHS` / `PUBLIC_API` in `apps/web/module-boundaries.mjs` and the gotchas in `references/modules.md`.
2. **Create each lane** (PowerShell, from the repo root):
   `.\scripts\new-lane.ps1 -Module <key> -Topic <slug>`. It prints the folder, branch and port (3001–3003). Then check each lane has `apps/web/.env.local`, `.claude/settings.local.json`, `apps/web/node_modules/next` and `.lane-port`.
3. **Open the windows:** `& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin\code.cmd" --new-window "D:\dcos-lanes\<module>-<topic>"`.
4. **Start the dev servers** (Bash, `run_in_background`, one per lane):
   `cd /d/dcos-lanes/<lane>/apps/web && npx -y pnpm@11.13.0 dev -p <port>`. Wait for `Ready in` with one background until-loop over the task output files. These servers live as long as this session does.
   Tell the user: in each lane window, answer **Don't allow** to the "DCOS: web dev server" auto-start task (it would take 3100).
5. **Fill in the prompts** from `references/lane-prompt.md` with the row from `references/modules.md`. Each lead must first reply to the user with a plan and wait for an OK.
6. **Deliver them.** Ask the user to open the Claude panel in each lane window and send any message (a session can't be messaged until it exists). Then run `ListAgents`, find the rows named `<module>-<topic>-…`, and `SendMessage` each prompt with `notify_when_idle: true`. The prompt's first line must make sense on its own.
7. **Tell the user** that each plan appears in its own window and needs their OK there. Relay idle notices as "plan/report ready in window X". Lanes send their final report here by themselves (CLAUDE.md rule).

## status
For each lane in `git worktree list`: the `ListAgents` row (busy/idle), `git log --oneline <base>..feat/<lane>` (commits = built), and whether its port answers. Report as one table. Don't message lanes just to ask whether they're done.

## merge <module>
One lane per call. The user should have browser-tested the lane first; ask if unsure.
1. The main checkout has no tracked changes. Then `git merge --no-ff feat/<lane> -m "Merge branch 'feat/<lane>': <what> (<Module> lane)"`. On conflicts, stop and show them; don't resolve module code by guesswork.
2. Check the merged result: tsc, eslint (0 errors), vitest. If something breaks, it's the merge: fix it in the main window if it's core, or send it back to the lane.
3. **Migrations the lane added:** confirm the objects exist in the local DB. Then record each version, because lanes apply with psql, which doesn't record it:
   `insert into supabase_migrations.schema_migrations(version,name) values ('<version>','<name>') on conflict do nothing;`
4. **Core requests** from the lane's report: make them here, as separate commits. For new shadcn components: the CLI fails here (it calls pnpm). Fetch `https://ui.shadcn.com/r/styles/base-nova/<name>.json` and write `files[0].content` to `components/ui/<name>.tsx`, with `from "cn"` replaced by `from "@/lib/utils"`.
5. Report: the merge commit, the checks, the migrations now waiting for `/dbpush` (production is only ever via `/dbpush`, run by the user), core requests done, and follow-ups the lane listed.
6. Other lanes don't need to rebase for a `--no-ff` merge. The checks in the next merge cover the combination.

## cleanup [<module>]
Only for lanes that are merged (`git branch --merged` contains `feat/<lane>`) and whose window the user has closed.
1. Stop that lane's background dev server (TaskStop on its task id), or the process on its port.
2. `git worktree remove D:\dcos-lanes\<lane>`, then `git branch -d feat/<lane>`. Use `-d`, never `-D`: an unmerged branch must fail.
3. If a worktree has uncommitted changes, `worktree remove` refuses. Show the user what's in it; never pass `--force` without their say.

## team <module>,<module>[,<module>]: cross-module feature (Agent Team)
Use only when one feature needs changes inside 2–3 modules at once (e.g. Planning↔QS bridge, QS BOQ → Procurement PR, HR payroll → Account). Needs `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `.claude/settings.local.json` (already set on this machine) and a restarted session.
1. Run it from the main window, on a branch `feat/team-<topic>`, while no lane is open for any of those modules.
2. Write the contract first, and get the user's OK on it before anything is built. It covers the tables and RPCs, which module owns each file, the `PUBLIC_API` additions in `module-boundaries.mjs`, and the migration list.
3. Create the team with `references/team-prompt.md`: one teammate per module, each limited to its own paths, plus `database-engineer` as the only migration owner. Require plan approval.
4. Afterwards, check it the same way as a merge (steps 2–5).

## Adding a module to the skill
Add one row to `references/modules.md`: the key from `MODULE_PATHS`, the domain agent from `.claude/agents/`, and the gotchas. The module must already exist in `module-boundaries.mjs`. Project and Administration are core, so their work is done in the main window, not in a lane.
