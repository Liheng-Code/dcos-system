# Agent Team prompt template (cross-module feature)

Use this only after the user has approved the contract (SKILL.md → team, step 2). Run it in the main window on branch `feat/team-<topic>`.

```
Create an agent team for this cross-module feature: <feature, one sentence>.

Contract (approved by the user; don't change it without asking):
<tables and RPCs, which module owns which file, PUBLIC_API additions, migration list>

Teammates:
- <module A>: edits only MODULE_PATHS.<a> (apps/web/module-boundaries.mjs) and its docs. Domain check with <domain agent A>.
- <module B>: edits only MODULE_PATHS.<b> and its docs. Domain check with <domain agent B>.
- database-engineer: the only one writing supabase/migrations/ (add-only, YYYYMMDDHHMMSS_<module>_<what>.sql, dry-run then apply to the local DB).
Core files (module-boundaries.mjs PUBLIC_API, lib/modules/*, components/ui) are changed only by you, the lead.

Require plan approval before each teammate edits. Teammates agree on any change to a shared type or API among themselves and tell you.
Follow "Parallel lanes" in .claude/CLAUDE.md for migrations and core files.
When everything is done, the code-reviewer agent reviews the full diff. Then run typecheck, lint and test (npx pnpm@11.13.0 … in apps/web), commit, and report: what changed, how to test at http://localhost:3100, migrations added (for /dbpush), and follow-ups.
```
