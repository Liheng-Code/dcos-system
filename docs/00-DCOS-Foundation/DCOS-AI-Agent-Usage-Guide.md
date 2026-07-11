# DCOS AI Agent Usage Guide
**Document Code:** DCOS-DEV-AGENT-002 | **Version:** R0 | **Date:** June 2026
**Audience:** Solo developer building DCOS with Claude Code

---

## 1. Overview

DCOS uses a team of 9 specialized AI agents inside Claude Code. Each agent has a narrow role, its own context, and only the tools it needs. You are the Project Director — you orchestrate, approve, and make decisions. The agents execute.

**The core principle:** Never ask one generic AI session to do everything. Each agent is a specialist.

---

## 2. How to Invoke Agents

### Explicit Invocation
Type `@agent-name` at the start of your message:
```
@system-architect design the Leave module data model and approval workflow
@database-engineer write the migration for the retention_ledger table
@code-reviewer review the current git diff
```

### Automatic Routing
Claude Code reads each agent's `description` field and routes automatically when your task matches. For example, asking "what should the IPC retention table look like?" will trigger `system-architect`. Asking "review this diff before I commit" triggers `code-reviewer`.

### Via Workflow Skills (Slash Commands)
Workflow skills chain agents automatically:
```
/design-module 22-Retention        → delegates to system-architect + commercial-qs
/build-module 22-Retention db      → delegates to database-engineer
/build-module 22-Retention api     → delegates to backend-engineer
/build-module 22-Retention ui      → delegates to frontend-engineer
/review-module 22-Retention        → delegates to code-reviewer + commercial-qs
/update-docs 22-Retention          → delegates to docs-writer
```

---

## 3. Agent Quick Reference

| Agent | Invoke when you need | Example prompt |
|---|---|---|
| `system-architect` | Module design pack, data model, ADR, cross-module integration | `@system-architect design the Leave module entity model and approval flow` |
| `backend-engineer` | New API route, service logic, Zod validation, Supabase RPC | `@backend-engineer implement the IPC submit endpoint per 02-Functional-Spec.md` |
| `frontend-engineer` | New dashboard page, form, table, component from 06-doc | `@frontend-engineer build the payslip list page following 06-UI-UX-Design.md` |
| `database-engineer` | New migration, RLS policy, index, seed data | `@database-engineer write the migration for the retention_ledger table per 04-Database-Schema.md` |
| `code-reviewer` | Before every commit or merge — PASS/FAIL checklist | `@code-reviewer review the current git diff` |
| `commercial-qs` | IPC, BOQ, retention, VO calculation validation | `@commercial-qs validate the retention calculation in apps/web/lib/qs/qs-service.ts` |
| `mobile-engineer` | React Native field app, offline sync (Phase 3 only) | `@mobile-engineer implement offline timesheet entry with sync queue` |
| `docs-writer` | Module pack documents, SOPs, tracker updates | `@docs-writer write 01-Business-Requirement for module 22-Retention` |
| `dcos-project-control-agent` | Project health report, risk detection, executive summary | `@dcos-project-control-agent generate this week's project health summary` |

---

## 4. Tool Restrictions — What Each Agent Can and Cannot Do

| Agent | Can Read | Can Edit | Can Run Bash |
|---|---|---|---|
| `system-architect` | ✅ All docs + code | ❌ No | ❌ No (WebSearch only) |
| `backend-engineer` | ✅ | ✅ `apps/web/` only | ✅ (general) |
| `frontend-engineer` | ✅ | ✅ `apps/web/` only | ✅ (general) |
| `database-engineer` | ✅ | ✅ `supabase/` only | ✅ (supabase CLI only) |
| `code-reviewer` | ✅ | ❌ No | ✅ (read-only git) |
| `commercial-qs` | ✅ | ❌ No | ❌ No |
| `mobile-engineer` | ✅ | ✅ `apps/mobile/` only | ✅ (general) |
| `docs-writer` | ✅ | ✅ `docs/` only | ❌ No |
| `dcos-project-control-agent` | ✅ All | ❌ No | ✅ (read-only) |

**Universal restrictions (all agents):**
- Cannot `git push` — requires human confirmation
- Cannot edit applied Supabase migrations (dated before today)
- Cannot run `supabase db reset --linked` (destroys production data)
- Cannot `rm -rf` or drop tables without human confirmation
- Cannot access `.env*` files

---

## 5. The Module Pipeline

Every module follows the same 5-stage pipeline. Run one module at a time in early phases.

```
Stage 1 — Design
  You: /design-module NN-Name
  Agent: system-architect
  Output: 01–06 docs in docs/03-Business-Modules/NN-Name/
  You: Approve Doc 01 and Doc 02 before continuing
  If money module: commercial-qs reviews Doc 02 before sign-off

Stage 2 — Database
  You: /build-module NN-Name db
  Agent: database-engineer
  Output: supabase/migrations/YYYYMMDD_*.sql
  You: Read every migration line by line before applying

Stage 3 — Backend
  You: /build-module NN-Name api
  Agent: backend-engineer
  Output: apps/web/app/api/[module]/ + apps/web/lib/[module]/
  Agent: code-reviewer reviews diff after each feature
  You: Verify BR# test coverage listed in summary

Stage 4 — Frontend
  You: /build-module NN-Name ui
  Agent: frontend-engineer
  Output: apps/web/app/dashboard/[module]/ + apps/web/components/[module]/
  Agent: code-reviewer reviews diff
  You: Hand-test screens in browser

Stage 5 — Review & Docs
  You: /review-module NN-Name
  Agent: code-reviewer → PASS/FAIL checklist
  Agent: commercial-qs → validates money logic (if applicable)
  You: Resolve all CRITICAL and HIGH findings
  You: /update-docs NN-Name
  Agent: docs-writer → updates tracker, fills remaining docs
  You: Verify worked example in the running app; merge
```

---

## 6. Providing Good Context

**Always give agents a reference document path.** Vague prompts produce generic output.

| Instead of... | Say... |
|---|---|
| "design the retention module" | `@system-architect design the retention module. Reference: docs/03-Business-Modules/22-Retention/`. The IPC module at `docs/03-Business-Modules/21-IPC/` is the closest reference for depth." |
| "write a migration" | `@database-engineer write the migration for the retention_ledger table per docs/03-Business-Modules/22-Retention/04-Database-Schema.md` |
| "review the code" | `@code-reviewer review the current git diff for the retention module. The spec is at docs/03-Business-Modules/22-Retention/02-Functional-Specification.md` |

---

## 7. Handling Agent Errors

If an agent does something wrong — wrong path, wrong convention, incorrect rule — the fix is almost always one sentence added to the agent's `.md` file.

**Fix process:**
1. Identify what went wrong and why
2. Open `.claude/agents/[agent-name].md`
3. Add a specific rule in the "What You Must Never Do" or "Behavioral Rules" section
4. Commit the agent file change the same as code

**Example:** If `backend-engineer` queried Supabase directly in a route handler instead of the service layer:
```markdown
## What You Must Never Do
- Put Supabase queries directly in route handlers — all queries belong in the service layer in apps/web/lib/
```

Agent files are living code — commit them, review their diffs, improve them every sprint.

---

## 8. Daily Rhythm

| Block | You do | Agents do |
|---|---|---|
| Morning (30 min) | `/daily-kickoff` — review yesterday; pick today's 1–3 tasks | Report overnight results; queue Open Questions |
| Midday (2–3 h) | Approve designs, review migrations line-by-line, hand-test screens | Run build stages you launched |
| Afternoon (2–3 h) | Launch next pipeline stages; pair with agent on complex logic | Build, test, self-review |
| End of day (30 min) | `/review-module` on today's diff; commit/merge; plan tomorrow | `docs-writer` updates packs and tracker |

---

## 9. Agent–Phase Mapping

| Phase | Primary agents | Your focus |
|---|---|---|
| P0 — Architecture sprint | `system-architect` (90%), `commercial-qs` | Approve every design; write ADRs |
| P1 — Core MVP | `database-engineer`, `backend-engineer`, `frontend-engineer` | Review RLS and audit setup exhaustively |
| P2 — Commercial | `backend-engineer`, `commercial-qs` (every module), `code-reviewer` | Verify IPC/retention math against a real project |
| P3 — Execution & Field | `mobile-engineer`, `frontend-engineer` | Field-test offline sync personally |
| P4 — Advanced | `system-architect` (new designs), `backend-engineer` | Contract admin and claims logic review |
| P5 — Integration & AI | `backend-engineer`, `system-architect` | Decide integration priorities from real client demand |

---

## 10. Configuration Reference

Agent files: `.claude/agents/[agent-name].md`
Skills: `.claude/skills/[skill-name]/skill.md`
Permissions + hooks: `.claude/settings.json`
This guide: `docs/00-DCOS-Foundation/DCOS-AI-Agent-Usage-Guide.md`
Setup guideline: `docs/DCOS_AI_Agent_Setup_Guideline.docx`
