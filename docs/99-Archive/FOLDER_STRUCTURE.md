# DCOS System — Complete Folder Structure

> **Repo:** `dcos-system` v1.0.0 · **Branch:** `main` · **Snapshot:** 2026-10-01
> **Type:** pnpm-workspace monorepo · **App:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4
> **Backend:** Supabase (PostgreSQL + RLS + Deno Edge Functions)
> **Remote:** `github.com/Liheng-Code/dcos-system`

---

## Project Inventory

| Metric | Count |
| --- | ---: |
| Directories (excl. build/vendor) | 644 |
| Files (excl. build/vendor) | 2,204 |
| `.tsx` React components / routes | 834 |
| `.ts` TypeScript modules | 327 |
| `.sql` migrations + seeds | 484 |
| `.md` documentation | 344 |
| `.xlsx` / `.docx` / `.pptx` business artefacts | 43 |
| Next.js page routes (`page.tsx`) | 297 |
| API route handlers (`route.ts`) | 119 |
| Vitest suites | 22 |
| Supabase migrations | 470 |
| Claude agents / skills | 19 / 19 |

### File-type distribution

| Extension | Files | Area |
| --- | ---: | --- |
| `.tsx` | 834 | `apps/web/app` + `apps/web/components` |
| `.sql` | 484 | `supabase/migrations` (470), `seeds` (9), `proposed`, `scripts/sql` |
| `.md` | 344 | `docs/`, `.claude/agents`, `.claude/skills`, root config docs |
| `.ts` | 327 | `apps/web/lib`, `hooks`, `contexts`, `supabase/functions` |
| `.docx` | 20 | `docs/` specs, HR forms |
| `.xlsx` | 19 | WBS master, rate libraries, BoQ templates |
| `.png` / `.jpg` | 18 | `docs/10-Archive` mockups & photos |
| `.json` | 12 | configs, `tsconfig`, `components.json`, `package*.json` |
| `.zip` | 8 | `docs/` source bundles |
| `.html` | 5 | `docs/10-Archive` prototypes |
| `.pdf` | 5 | `docs/` reference drawings |
| `.svg` | 5 | `apps/web/public` branding |
| `.ps1` | 4 | `scripts/`, `.claude/hooks` |
| `.mjs` | 3 | `scripts/`, `apps/web` (eslint/postcss) |
| `.jsx` | 2 | `docs/10-Archive` UI mockups |
| `.yaml` / `.yml` | 4 | `pnpm-workspace.yaml`, `.github/workflows/ci.yml`, `pnpm-lock` |

### Excluded from this listing (build/vendor/ephemeral)
`node_modules/` · `.next/` · `.git/` · `.backups/` · `shots/` · `temp/` · `.opencode/`

---

## Top-Level Map

| Path | Type | Contents |
| --- | --- | --- |
| `apps/` | workspace | `web/` — the single application |
| `supabase/` | data | 470 migrations, 9 seeds, 5 edge functions, `config.toml` |
| `docs/` | docs | Enterprise specs, module specs, templates (18 subtrees) |
| `scripts/` | tooling | PowerShell DB scripts, SQL diagnostics, seed generator |
| `.claude/` | agents | 19 agents, 19 skills, DB-wipe hook, settings |
| `.github/` | ci | `workflows/ci.yml` |
| `.vscode/` | editor | `settings.json`, `tasks.json` |
| `.opencode/` | tool | opencode runtime (excluded from tree) |
| root files | config | `package.json`, `pnpm-workspace.yaml`, `Dockerfile`, `docker-compose.yml`, `vercel.json` |

---

## Workspace Wiring

`pnpm-workspace.yaml` → `packages: apps/*`, `packages/*` (the `packages/` scope is reserved; no directory yet)

| Root script | Delegates to |
| --- | --- |
| `pnpm dev` | `pnpm --dir apps/web dev` → `next dev -H 0.0.0.0` |
| `pnpm build` | `pnpm --dir apps/web build` → `next build` |
| `pnpm lint` | `pnpm --dir apps/web lint` → `eslint` |
| `pnpm --dir apps/web test` | `vitest run` |
| `pnpm --dir apps/web gen:types` | `supabase gen types typescript --project-id swyhplzjhdypvkhstpgp` |

---

## Application Layers

| Layer | Path | Size |
| --- | --- | --- |
| Routes (UI) | `apps/web/app/**/page.tsx` | 297 routes |
| API | `apps/web/app/api/**/route.ts` | 119 endpoints, 9 domains |
| Components | `apps/web/components/*` | 30 feature folders |
| Domain logic | `apps/web/lib/*` | 78 modules + 11 service folders |
| Primitives | `apps/web/components/ui/` | 21 shadcn components |
| Hooks / Contexts | `apps/web/hooks`, `apps/web/contexts` | 12 hooks, 2 contexts |
| Database | `supabase/` | 470 migrations, 5 functions |
| Tests | `apps/web/lib/*/__tests__/` | 22 vitest suites |

### API domains
`admin` · `auth` · `bim` · `geo` · `hr` · `inv` · `planning` · `telegram` · `tenders`

### Business modules (UI)
`account` · `administration` · `contracts` · `department` · `design` · `documents` · `hr` ·
`hse` · `insights` · `inventory` · `mobile` · `my-tasks` · `planning` · `procurement` ·
`projects` · `profile` · `qaqc` · `qs` · `qto` · `reports` · `settings` · `site` ·
`stakeholders` · `subcontractors` · `tasks` · `tenders` · `wbs`

### `lib/` service folders
`admin-users` · `auth` · `bim` · `email` · `hr` · `inv` · `notifications` · `planning` (42) ·
`qs` · `site` · `supabase` · `tasks` · `telegram`

---

## Conventions Reference

| Concern | Location / Rule |
| --- | --- |
| Migrations | `supabase/migrations/YYYYMMDDHHMMSS_snake_case_description.sql` |
| Seeds | `supabase/seeds/seed_*.sql`, `staff_list-seed.sql`, `prj_*.sql` |
| API routes | `app/api/<domain>/<resource>/route.ts` |
| Domain services | `lib/<domain>/<name>-service.ts` + `<name>-schemas.ts` (zod) |
| Pure logic + tests | `lib/<domain>/__tests__/<name>.test.ts` (vitest, colocated) |
| UI components | `components/<feature>/…`; primitives only in `components/ui/` |
| Auth | Supabase SSR (`lib/supabase/server.ts`, `client.ts`) + Postgres RLS |
| DB types | `lib/supabase/database.types.ts` — generated, never hand-edited |
| Agent rules | `apps/web/CLAUDE.md`, `apps/web/AGENTS.md`, `.claude/CLAUDE.md` |
| Docs | `docs/<NN>-<Section>/`, module-prefixed (`04-11-Procurement`, `05-MDM`) |
| Naming | `docs/01-DCOS-Foundation/DCOS-Naming-Convention.md` |

---

## Complete Tree

Every directory and file in the repository. Directory annotation `[N entries]` = number of
direct children.

```
|-- .claude   [7 entries]
|   |-- agents   [19 entries]
|   |   |-- backend-engineer.md
|   |   |-- code-reviewer.md
|   |   |-- commercial-qs.md
|   |   |-- construction-manager.md
|   |   |-- database-engineer.md
|   |   |-- dcos-project-control-agent.md
|   |   |-- design-manager.md
|   |   |-- docs-writer.md
|   |   |-- document-control-manager.md
|   |   |-- finance-manager.md
|   |   |-- frontend-engineer.md
|   |   |-- hr-manager.md
|   |   |-- hse-manager.md
|   |   |-- mobile-engineer.md
|   |   |-- planning-manager.md
|   |   |-- procurement-manager.md
|   |   |-- qaqc-manager.md
|   |   |-- qs-manager.md
|   |   `-- system-architect.md
|   |-- hooks   [1 entries]
|   |   `-- block-db-wipe.ps1
|   |-- skills   [19 entries]
|   |   |-- dbpush   [1 entries]
|   |   |   `-- SKILL.md
|   |   |-- dcos-audit-notification-skill   [2 entries]
|   |   |   |-- README.md
|   |   |   `-- skill.md
|   |   |-- dcos-documentation   [2 entries]
|   |   |   |-- README.md
|   |   |   `-- skill.md
|   |   |-- dcos-nextjs-ui   [2 entries]
|   |   |   |-- README.md
|   |   |   `-- skill.md
|   |   |-- dcos-rbac-permission   [2 entries]
|   |   |   |-- README.md
|   |   |   `-- skill.md
|   |   |-- dcos-supabase-database   [2 entries]
|   |   |   |-- README.md
|   |   |   `-- skill.md
|   |   |-- dcos-system-architect   [2 entries]
|   |   |   |-- README.md
|   |   |   `-- skill.md
|   |   |-- dcos-workflow-engine   [2 entries]
|   |   |   |-- README.md
|   |   |   `-- skill.md
|   |   |-- domain-construction   [2 entries]
|   |   |   |-- references   [5 entries]
|   |   |   |   |-- construction-planning.md
|   |   |   |   |-- productivity-analysis.md
|   |   |   |   |-- progress-monitoring.md
|   |   |   |   |-- site-coordination.md
|   |   |   |   `-- site-reporting.md
|   |   |   `-- SKILL.md
|   |   |-- domain-core   [2 entries]
|   |   |   |-- references   [4 entries]
|   |   |   |   |-- agent-governance.md
|   |   |   |   |-- approval-matrix.md
|   |   |   |   |-- evidence-policy.md
|   |   |   |   `-- permission-matrix.md
|   |   |   `-- SKILL.md
|   |   |-- domain-design-engineering   [2 entries]
|   |   |   |-- references   [4 entries]
|   |   |   |   |-- architectural.md
|   |   |   |   |-- design-coordination.md
|   |   |   |   |-- mep.md
|   |   |   |   `-- structural.md
|   |   |   `-- SKILL.md
|   |   |-- domain-document-control   [2 entries]
|   |   |   |-- references   [2 entries]
|   |   |   |   |-- document-register.md
|   |   |   |   `-- revision-control.md
|   |   |   `-- SKILL.md
|   |   |-- domain-finance   [2 entries]
|   |   |   |-- references   [2 entries]
|   |   |   |   |-- accounting.md
|   |   |   |   `-- financial-reporting.md
|   |   |   `-- SKILL.md
|   |   |-- domain-hr   [2 entries]
|   |   |   |-- references   [3 entries]
|   |   |   |   |-- attendance.md
|   |   |   |   |-- leave-management.md
|   |   |   |   `-- recruitment.md
|   |   |   `-- SKILL.md
|   |   |-- domain-hse   [2 entries]
|   |   |   |-- references   [2 entries]
|   |   |   |   |-- risk-assessment.md
|   |   |   |   `-- safety-inspection.md
|   |   |   `-- SKILL.md
|   |   |-- domain-planning   [2 entries]
|   |   |   |-- references   [3 entries]
|   |   |   |   |-- delay-analysis.md
|   |   |   |   |-- programme-development.md
|   |   |   |   `-- schedule-monitoring.md
|   |   |   `-- SKILL.md
|   |   |-- domain-procurement   [2 entries]
|   |   |   |-- references   [6 entries]
|   |   |   |   |-- procurement-planning.md
|   |   |   |   |-- purchase-order.md
|   |   |   |   |-- quotation-analysis.md
|   |   |   |   |-- research.md
|   |   |   |   |-- rfq-management.md
|   |   |   |   `-- supplier-evaluation.md
|   |   |   `-- SKILL.md
|   |   |-- domain-qaqc   [2 entries]
|   |   |   |-- references   [2 entries]
|   |   |   |   |-- inspection.md
|   |   |   |   `-- ncr-management.md
|   |   |   `-- SKILL.md
|   |   `-- domain-quantity-surveying   [2 entries]
|   |       |-- references   [18 entries]
|   |       |   |-- 16-templates   [1 entries]
|   |       |   |   `-- README.md
|   |       |   |-- 00-governance.md
|   |       |   |-- 01-core-knowledge.md
|   |       |   |-- 02-research.md
|   |       |   |-- 03-tender.md
|   |       |   |-- 04-qto.md
|   |       |   |-- 05-boq.md
|   |       |   |-- 06-cost-estimation.md
|   |       |   |-- 07-procurement.md
|   |       |   |-- 08-contract-variation.md
|   |       |   |-- 09-cost-control.md
|   |       |   |-- 10-ipc-payment.md
|   |       |   |-- 11-claims.md
|   |       |   |-- 12-final-account.md
|   |       |   |-- 13-reporting.md
|   |       |   |-- 14-data-model.md
|   |       |   |-- 15-workflows.md
|   |       |   `-- 17-reference.md
|   |       `-- SKILL.md
|   |-- CLAUDE.md
|   |-- scheduled_tasks.lock
|   |-- settings.json
|   `-- settings.local.json
|-- .github   [1 entries]
|   `-- workflows   [1 entries]
|       `-- ci.yml
|-- .vscode   [2 entries]
|   |-- settings.json
|   `-- tasks.json
|-- apps   [1 entries]
|   `-- web   [26 entries]
|       |-- app   [14 entries]
|       |   |-- api   [9 entries]
|       |   |   |-- admin   [3 entries]
|       |   |   |   |-- audit-logs   [1 entries]
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- dashboard   [1 entries]
|       |   |   |   |   `-- account-summary   [1 entries]
|       |   |   |   |       `-- route.ts
|       |   |   |   `-- users   [3 entries]
|       |   |   |       |-- [id]   [5 entries]
|       |   |   |       |   |-- disable   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   |-- force-reset   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   |-- lock   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   |-- suspend   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   `-- unlock   [1 entries]
|       |   |   |       |       `-- route.ts
|       |   |   |       |-- invite   [1 entries]
|       |   |   |       |   `-- route.ts
|       |   |   |       `-- route.ts
|       |   |   |-- auth   [3 entries]
|       |   |   |   |-- change-password   [1 entries]
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- forgot-password   [1 entries]
|       |   |   |   |   `-- route.ts
|       |   |   |   `-- reset-password   [1 entries]
|       |   |   |       `-- route.ts
|       |   |   |-- bim   [1 entries]
|       |   |   |   `-- models   [2 entries]
|       |   |   |       |-- [id]   [5 entries]
|       |   |   |       |   |-- file   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   |-- takeoff   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   |-- viewpoints   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   |-- wbs-map   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   `-- route.ts
|       |   |   |       `-- route.ts
|       |   |   |-- geo   [2 entries]
|       |   |   |   |-- reverse   [1 entries]
|       |   |   |   |   `-- route.ts
|       |   |   |   `-- search   [1 entries]
|       |   |   |       `-- route.ts
|       |   |   |-- hr   [6 entries]
|       |   |   |   |-- attendance   [5 entries]
|       |   |   |   |   |-- checkin   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   |-- checkout   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   |-- qr   [1 entries]
|       |   |   |   |   |   `-- rotate   [1 entries]
|       |   |   |   |   |       `-- route.ts
|       |   |   |   |   |-- telegram   [1 entries]
|       |   |   |   |   |   `-- link-code   [1 entries]
|       |   |   |   |   |       `-- route.ts
|       |   |   |   |   `-- today   [1 entries]
|       |   |   |   |       `-- route.ts
|       |   |   |   |-- employees   [3 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   |-- fill-missing   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- leave   [5 entries]
|       |   |   |   |   |-- cancel-request   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   |-- carryover-expiry   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   |-- seniority-rules   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   |-- withdraw   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   `-- year-end   [1 entries]
|       |   |   |   |       `-- route.ts
|       |   |   |   |-- overtime   [7 entries]
|       |   |   |   |   |-- [id]   [10 entries]
|       |   |   |   |   |   |-- allocate-cost   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- approve   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- cancel   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- clock-in   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- clock-out   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- pay   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- reject   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- submit   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- verify   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   |-- analytics   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   |-- check-overlap   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   |-- dashboard   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   |-- notifications   [1 entries]
|       |   |   |   |   |   `-- process   [1 entries]
|       |   |   |   |   |       `-- route.ts
|       |   |   |   |   |-- rates   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- payroll   [1 entries]
|       |   |   |   |   `-- [periodId]   [1 entries]
|       |   |   |   |       `-- advance   [1 entries]
|       |   |   |   |           `-- route.ts
|       |   |   |   `-- timesheets   [4 entries]
|       |   |   |       |-- [id]   [3 entries]
|       |   |   |       |   |-- approve   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   |-- reject   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   `-- submit   [1 entries]
|       |   |   |       |       `-- route.ts
|       |   |   |       |-- generate-week   [1 entries]
|       |   |   |       |   `-- route.ts
|       |   |   |       |-- _utils.ts
|       |   |   |       `-- route.ts
|       |   |   |-- inv   [12 entries]
|       |   |   |   |-- adjustments   [2 entries]
|       |   |   |   |   |-- [id]   [3 entries]
|       |   |   |   |   |   |-- approve   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- reject   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- grns   [2 entries]
|       |   |   |   |   |-- [id]   [2 entries]
|       |   |   |   |   |   |-- confirm   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- items   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- labels   [1 entries]
|       |   |   |   |   `-- [type]   [1 entries]
|       |   |   |   |       `-- [id]   [1 entries]
|       |   |   |   |           `-- route.ts
|       |   |   |   |-- locations   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- mrs   [2 entries]
|       |   |   |   |   |-- [id]   [5 entries]
|       |   |   |   |   |   |-- approve   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- issue   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- reject   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- submit   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- returns   [2 entries]
|       |   |   |   |   |-- [id]   [3 entries]
|       |   |   |   |   |   |-- inspect   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- post   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- stock   [1 entries]
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- stocktakes   [2 entries]
|       |   |   |   |   |-- [id]   [6 entries]
|       |   |   |   |   |   |-- cancel   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- complete   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- lines   [2 entries]
|       |   |   |   |   |   |   |-- [lineId]   [1 entries]
|       |   |   |   |   |   |   |   `-- approve   [1 entries]
|       |   |   |   |   |   |   |       `-- route.ts
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- start   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- submit   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- stores   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   `-- route.ts
|       |   |   |   |-- tools   [2 entries]
|       |   |   |   |   |-- [id]   [3 entries]
|       |   |   |   |   |   |-- issue   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- return   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   `-- route.ts
|       |   |   |   |   `-- route.ts
|       |   |   |   `-- transfers   [2 entries]
|       |   |   |       |-- [id]   [6 entries]
|       |   |   |       |   |-- approve-dest   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   |-- approve-source   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   |-- dispatch   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   |-- receive   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   |-- reject   [1 entries]
|       |   |   |       |   |   `-- route.ts
|       |   |   |       |   `-- route.ts
|       |   |   |       `-- route.ts
|       |   |   |-- planning   [4 entries]
|       |   |   |   |-- alerts   [1 entries]
|       |   |   |   |   `-- [projectId]   [1 entries]
|       |   |   |   |       `-- evaluate   [1 entries]
|       |   |   |   |           `-- route.ts
|       |   |   |   |-- progress-reviews   [1 entries]
|       |   |   |   |   `-- notify   [1 entries]
|       |   |   |   |       `-- route.ts
|       |   |   |   |-- reports   [1 entries]
|       |   |   |   |   `-- monthly   [1 entries]
|       |   |   |   |       `-- [projectId]   [1 entries]
|       |   |   |   |           `-- route.ts
|       |   |   |   `-- sync   [1 entries]
|       |   |   |       `-- [projectId]   [6 entries]
|       |   |   |           |-- commit   [1 entries]
|       |   |   |           |   `-- route.ts
|       |   |   |           |-- config   [1 entries]
|       |   |   |           |   `-- route.ts
|       |   |   |           |-- export   [1 entries]
|       |   |   |           |   `-- route.ts
|       |   |   |           |-- preview   [1 entries]
|       |   |   |           |   `-- route.ts
|       |   |   |           |-- sessions   [2 entries]
|       |   |   |           |   |-- [sessionId]   [1 entries]
|       |   |   |           |   |   `-- route.ts
|       |   |   |           |   `-- route.ts
|       |   |   |           `-- status   [1 entries]
|       |   |   |               `-- route.ts
|       |   |   |-- telegram   [2 entries]
|       |   |   |   |-- miniapp   [2 entries]
|       |   |   |   |   |-- leave   [7 entries]
|       |   |   |   |   |   |-- apply   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- approve   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- balance   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- my-requests   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- pending-approvals   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   |-- reference   [1 entries]
|       |   |   |   |   |   |   `-- route.ts
|       |   |   |   |   |   `-- reject   [1 entries]
|       |   |   |   |   |       `-- route.ts
|       |   |   |   |   `-- session   [1 entries]
|       |   |   |   |       `-- route.ts
|       |   |   |   `-- webhook   [1 entries]
|       |   |   |       `-- route.ts
|       |   |   `-- tenders   [1 entries]
|       |   |       `-- [tenderId]   [1 entries]
|       |   |           `-- ai-boq-draft   [1 entries]
|       |   |               `-- route.ts
|       |   |-- dashboard   [29 entries]
|       |   |   |-- account   [13 entries]
|       |   |   |   |-- ap   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- ar   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- bank   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- coa   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- currencies   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- gl   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- journals   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- payment-runs   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- payments   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- reports   [8 entries]
|       |   |   |   |   |-- ap-aging   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- ar-aging   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- balance-sheet   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- budget-vs-actual   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- cash-flow   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- profit-loss   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- trial-balance   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- wht   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- administration   [10 entries]
|       |   |   |   |-- audit-logs   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- departments   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- leave-types   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- master-libraries   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- roles-permissions   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- security   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- stakeholder-templates   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- team-capacity   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- users   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   `-- year-end   [1 entries]
|       |   |   |       `-- page.tsx
|       |   |   |-- contracts   [7 entries]
|       |   |   |   |-- correspondence   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- employer-instructions   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- entitlements   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- notices   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- register   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- department   [1 entries]
|       |   |   |   `-- page.tsx
|       |   |   |-- design   [8 entries]
|       |   |   |   |-- arc   [7 entries]
|       |   |   |   |   |-- door-schedule   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- drawings   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- finish-schedule   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- material-approval   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- rfi   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- room-data   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- window-schedule   [1 entries]
|       |   |   |   |       `-- page.tsx
|       |   |   |   |-- bim   [2 entries]
|       |   |   |   |   |-- viewer   [1 entries]
|       |   |   |   |   |   `-- [modelId]   [1 entries]
|       |   |   |   |   |       `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- coordination   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- markup   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- mep   [7 entries]
|       |   |   |   |   |-- commissioning   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- drawings   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- equipment   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- load-schedule   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- rfi   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- sleeves   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- submittals   [1 entries]
|       |   |   |   |       `-- page.tsx
|       |   |   |   |-- str   [7 entries]
|       |   |   |   |   |-- calculations   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- design-changes   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- drawings   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- models   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- rebar   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- rfi   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- technical-queries   [1 entries]
|       |   |   |   |       `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- documents   [7 entries]
|       |   |   |   |-- audit-log   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- controller   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- mdr   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- submittals   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- transmittals   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- hr   [18 entries]
|       |   |   |   |-- analytics   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- assets   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- attendance   [7 entries]
|       |   |   |   |   |-- checkin   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- my   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- reports   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- shifts   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- sites   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- supervisor   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- competency   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dashboard   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- documents   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- employees   [5 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- list   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- layout.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- leave   [16 entries]
|       |   |   |   |   |-- admin   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- apply   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- approval-chain   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- approval-chains   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- approvals   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- balance   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- my-requests   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- notifications   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- probation-policy   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- public-holidays   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- replacement   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- reports   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- seniority-rules   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- team-calendar   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- who-is-on-leave   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- organization   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- overtime   [14 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- analytics   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- apply   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- approval-chain   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- approval-chains   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- approvals   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- audit   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- edit   [1 entries]
|       |   |   |   |   |   `-- [id]   [1 entries]
|       |   |   |   |   |       `-- page.tsx
|       |   |   |   |   |-- level-config   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- limits   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- my-requests   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- notifications   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- rates   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- payroll   [16 entries]
|       |   |   |   |   |-- approvals   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- audit   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- config   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- cost-allocation   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- entry   [1 entries]
|       |   |   |   |   |   `-- [id]   [1 entries]
|       |   |   |   |   |       `-- page.tsx
|       |   |   |   |   |-- my-payslip   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- notifications   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- nssf-config   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- periods   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- reports   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- run   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- runs   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- seniority-config   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- setup   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- tax-config   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- performance   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- recruitment   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- resources   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- timesheet   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- training   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- hse   [7 entries]
|       |   |   |   |-- incidents   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- observations   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- permits   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- risk-assessments   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- toolbox-talks   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- insights   [2 entries]
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- inventory   [13 entries]
|       |   |   |   |-- adjustments   [3 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- grns   [3 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- items   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- movements   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- mrs   [3 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- returns   [3 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- stock   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- stocktakes   [3 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- stores   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- tools   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- transfers   [3 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- mobile   [3 entries]
|       |   |   |   |-- devices   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- sync   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- my-tasks   [1 entries]
|       |   |   |   `-- page.tsx
|       |   |   |-- planning   [16 entries]
|       |   |   |   |-- activity-step-templates   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- calendars   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- comparison   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- delays   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- gantt   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- lookahead   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- members   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- overview   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- productivity   [5 entries]
|       |   |   |   |   |-- boq-mapping   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- cost-rollup   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- site-records   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- task-work   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- reports   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- resource-loading   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- scurve   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- sheet   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- sync   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- procurement   [16 entries]
|       |   |   |   |-- analytics   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- audit-log   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- auto-reorder   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- boq   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- goods-receipt   [2 entries]
|       |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- invoice-matches   [3 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- notifications   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- po   [3 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- pr   [3 entries]
|       |   |   |   |   |-- [id]   [3 entries]
|       |   |   |   |   |   |-- budget-confirmation   [2 entries]
|       |   |   |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |   |-- edit   [1 entries]
|       |   |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- prequalification   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- rfq   [3 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   |-- new   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- supplier-performance   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- supplier-portal   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- suppliers   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- profile   [1 entries]
|       |   |   |   `-- page.tsx
|       |   |   |-- projects   [1 entries]
|       |   |   |   `-- page.tsx
|       |   |   |-- qaqc   [3 entries]
|       |   |   |   |-- ncrs   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- qs   [22 entries]
|       |   |   |   |-- boq   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- claims   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- certify   [1 entries]
|       |   |   |   |   |       `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- cost-database   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-assemblies   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-cost-items   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-equipment-rates   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-estimate   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-labor-rates   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-material-import   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-materials   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-price-approvals   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-price-dashboard   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-resources   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-subcontractor-rates   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-suppliers   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- dwl-work-items   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- element-library   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- evm   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- overview   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- variations   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- qto   [3 entries]
|       |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- reports   [3 entries]
|       |   |   |   |-- schedule   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- settings   [1 entries]
|       |   |   |   `-- page.tsx
|       |   |   |-- site   [8 entries]
|       |   |   |   |-- daily-reports   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- equipment   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- inspections   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- manpower   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- ncrs   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- progress-photos   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- stakeholders   [1 entries]
|       |   |   |   `-- page.tsx
|       |   |   |-- subcontractors   [5 entries]
|       |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- back-charges   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- performance-notices   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- tasks   [2 entries]
|       |   |   |   |-- [taskId]   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- tenders   [10 entries]
|       |   |   |   |-- bid-evaluation   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- budget-codes   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- cost-estimation   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- cost-library   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- register   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- submissions   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- tender-management   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- unit-rates   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- layout.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- wbs   [3 entries]
|       |   |   |   |-- lookahead   [2 entries]
|       |   |   |   |   |-- layout.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- templates   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   `-- page.tsx
|       |   |   |-- layout.tsx
|       |   |   `-- page.tsx
|       |   |-- forgot-password   [1 entries]
|       |   |   `-- page.tsx
|       |   |-- icons   [2 entries]
|       |   |   |-- 192   [1 entries]
|       |   |   |   `-- route.tsx
|       |   |   `-- 512   [1 entries]
|       |   |       `-- route.tsx
|       |   |-- modules   [1 entries]
|       |   |   `-- page.tsx
|       |   |-- portal   [1 entries]
|       |   |   `-- programme   [1 entries]
|       |   |       `-- [projectId]   [1 entries]
|       |   |           `-- page.tsx
|       |   |-- reset-password   [1 entries]
|       |   |   `-- page.tsx
|       |   |-- telegram-app   [2 entries]
|       |   |   |-- leave   [5 entries]
|       |   |   |   |-- apply   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- approvals   [2 entries]
|       |   |   |   |   |-- [id]   [1 entries]
|       |   |   |   |   |   `-- page.tsx
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- balance   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   |-- my-requests   [1 entries]
|       |   |   |   |   `-- page.tsx
|       |   |   |   `-- page.tsx
|       |   |   `-- layout.tsx
|       |   |-- verify   [1 entries]
|       |   |   `-- doc   [1 entries]
|       |   |       `-- [id]   [1 entries]
|       |   |           `-- page.tsx
|       |   |-- favicon.ico
|       |   |-- globals.css
|       |   |-- layout.tsx
|       |   |-- manifest.ts
|       |   `-- page.tsx
|       |-- components   [30 entries]
|       |   |-- account   [20 entries]
|       |   |   |-- ap-aging-view.tsx
|       |   |   |-- ap-invoice-form.tsx
|       |   |   |-- ap-invoice-list.tsx
|       |   |   |-- ar-aging-view.tsx
|       |   |   |-- ar-invoice-form.tsx
|       |   |   |-- ar-invoice-list.tsx
|       |   |   |-- balance-sheet-view.tsx
|       |   |   |-- bank-account-list.tsx
|       |   |   |-- budget-vs-actual-view.tsx
|       |   |   |-- cash-flow-view.tsx
|       |   |   |-- coa-form.tsx
|       |   |   |-- coa-tree.tsx
|       |   |   |-- gl-ledger-view.tsx
|       |   |   |-- journal-entry-list.tsx
|       |   |   |-- payment-run-list.tsx
|       |   |   |-- payment-voucher-form.tsx
|       |   |   |-- payment-voucher-list.tsx
|       |   |   |-- profit-loss-view.tsx
|       |   |   |-- trial-balance-view.tsx
|       |   |   `-- withholding-tax-list.tsx
|       |   |-- administration   [4 entries]
|       |   |   |-- admin-dashboard-widget.tsx
|       |   |   |-- audit-log-page.tsx
|       |   |   |-- departments-page.tsx
|       |   |   `-- security-overview-page.tsx
|       |   |-- auth   [1 entries]
|       |   |   `-- auth-card.tsx
|       |   |-- bim   [17 entries]
|       |   |   |-- bim-delete-dialog.tsx
|       |   |   |-- bim-edit-dialog.tsx
|       |   |   |-- bim-model-register.tsx
|       |   |   |-- bim-review-promote-dialog.tsx
|       |   |   |-- bim-status-bar.tsx
|       |   |   |-- bim-toolbar.tsx
|       |   |   |-- bim-upload-dialog.tsx
|       |   |   |-- color-filter.tsx
|       |   |   |-- discipline-filter.tsx
|       |   |   |-- element-properties.tsx
|       |   |   |-- ifc-viewer.tsx
|       |   |   |-- ifc-viewer-layout.tsx
|       |   |   |-- levels-panel.tsx
|       |   |   |-- preset-views.tsx
|       |   |   |-- spatial-tree.tsx
|       |   |   |-- view-cube.tsx
|       |   |   `-- viewpoints-panel.tsx
|       |   |-- dashboard   [26 entries]
|       |   |   |-- action-inbox.tsx
|       |   |   |-- chart-card.tsx
|       |   |   |-- construction-module-header-tabs.tsx
|       |   |   |-- control-room.tsx
|       |   |   |-- executive-dashboard.tsx
|       |   |   |-- health-grid.tsx
|       |   |   |-- module-header-tabs.tsx
|       |   |   |-- module-hub.tsx
|       |   |   |-- module-page-layout.tsx
|       |   |   |-- needs-attention.tsx
|       |   |   |-- planning-module-header-tabs.tsx
|       |   |   |-- portfolio-band.tsx
|       |   |   |-- postcontract-dashboard.tsx
|       |   |   |-- precontract-dashboard.tsx
|       |   |   |-- progress-dashboard.tsx
|       |   |   |-- project-context.tsx
|       |   |   |-- project-health-strip.tsx
|       |   |   |-- project-switcher.tsx
|       |   |   |-- qs-module-header-tabs.tsx
|       |   |   |-- recent-documents.tsx
|       |   |   |-- reporting-module-header-tabs.tsx
|       |   |   |-- sidebar.tsx
|       |   |   |-- task-alerts-menu.tsx
|       |   |   |-- task-alerts-provider.tsx
|       |   |   |-- traceability-feed.tsx
|       |   |   `-- user-menu.tsx
|       |   |-- design   [9 entries]
|       |   |   |-- arc-room-data-sheet.tsx
|       |   |   |-- arc-schedules.tsx
|       |   |   |-- design-coordination-log.tsx
|       |   |   |-- design-drawing-list.tsx
|       |   |   |-- design-page-shell.tsx
|       |   |   |-- design-review-comments.tsx
|       |   |   |-- design-rfi-list.tsx
|       |   |   |-- mep-schedules.tsx
|       |   |   `-- str-schedules.tsx
|       |   |-- documents   [8 entries]
|       |   |   |-- mdr   [2 entries]
|       |   |   |   |-- mdr-batch-import-dialog.tsx
|       |   |   |   `-- mdr-page.tsx
|       |   |   |-- submittals   [4 entries]
|       |   |   |   |-- comment-resolution-sheet.tsx
|       |   |   |   |-- submittal-create-dialog.tsx
|       |   |   |   |-- submittal-detail-panel.tsx
|       |   |   |   `-- submittal-list-page.tsx
|       |   |   |-- transmittals   [1 entries]
|       |   |   |   `-- dtn-printable-sheet.tsx
|       |   |   |-- document-controller-dashboard.tsx
|       |   |   |-- document-edit-sheet.tsx
|       |   |   |-- document-list-page.tsx
|       |   |   |-- document-stamp-modal.tsx
|       |   |   `-- document-workflow-panel.tsx
|       |   |-- hr   [5 entries]
|       |   |   |-- attendance   [1 entries]
|       |   |   |   `-- telegram-link-card.tsx
|       |   |   |-- employees   [2 entries]
|       |   |   |   |-- employees-tabs.tsx
|       |   |   |   `-- fill-missing-dialog.tsx
|       |   |   |-- leave   [4 entries]
|       |   |   |   |-- leave-request-detail.tsx
|       |   |   |   |-- leave-request-form.tsx
|       |   |   |   |-- who-is-on-leave-today.tsx
|       |   |   |   `-- year-end-run-wizard.tsx
|       |   |   |-- overtime   [2 entries]
|       |   |   |   |-- ot-request-detail.tsx
|       |   |   |   `-- ot-request-form.tsx
|       |   |   `-- payroll   [6 entries]
|       |   |       |-- payroll-charts.tsx
|       |   |       |-- payroll-helpers.ts
|       |   |       |-- payroll-notifications-list.tsx
|       |   |       |-- payslip-card.tsx
|       |   |       |-- pit-calculator.ts
|       |   |       `-- salary-structure-sheet.tsx
|       |   |-- hse   [6 entries]
|       |   |   |-- hse-incidents.tsx
|       |   |   |-- hse-observations.tsx
|       |   |   |-- hse-page-shell.tsx
|       |   |   |-- hse-permits.tsx
|       |   |   |-- hse-risk-assessments.tsx
|       |   |   `-- hse-toolbox-talks.tsx
|       |   |-- insights   [4 entries]
|       |   |   |-- approval-pipeline-table.tsx
|       |   |   |-- module-insight-page.tsx
|       |   |   |-- module-overview-cards.tsx
|       |   |   `-- task-status-table.tsx
|       |   |-- inv   [34 entries]
|       |   |   |-- adjustment-create-page.tsx
|       |   |   |-- adjustment-detail-page.tsx
|       |   |   |-- adjustment-list.tsx
|       |   |   |-- grn-create-page.tsx
|       |   |   |-- grn-detail-page.tsx
|       |   |   |-- grn-list.tsx
|       |   |   |-- inv-dashboard-page.tsx
|       |   |   |-- inv-status-badge.tsx
|       |   |   |-- inv-types.ts
|       |   |   |-- item-form.tsx
|       |   |   |-- item-list.tsx
|       |   |   |-- label-print-button.tsx
|       |   |   |-- location-form.tsx
|       |   |   |-- movement-list.tsx
|       |   |   |-- mr-create-page.tsx
|       |   |   |-- mr-detail-page.tsx
|       |   |   |-- mr-list.tsx
|       |   |   |-- return-create-page.tsx
|       |   |   |-- return-detail-page.tsx
|       |   |   |-- return-list.tsx
|       |   |   |-- stock-balance-list.tsx
|       |   |   |-- stocktake-create-page.tsx
|       |   |   |-- stocktake-detail-page.tsx
|       |   |   |-- stocktake-list.tsx
|       |   |   |-- store-detail-page.tsx
|       |   |   |-- store-form.tsx
|       |   |   |-- store-list.tsx
|       |   |   |-- tool-detail-page.tsx
|       |   |   |-- tool-form.tsx
|       |   |   |-- tool-issue-form.tsx
|       |   |   |-- tool-list.tsx
|       |   |   |-- transfer-create-page.tsx
|       |   |   |-- transfer-detail-page.tsx
|       |   |   `-- transfer-list.tsx
|       |   |-- landing   [9 entries]
|       |   |   |-- auth-form.tsx
|       |   |   |-- auth-toggle.tsx
|       |   |   |-- demo-user-dropdown.tsx
|       |   |   |-- isometric-scene.tsx
|       |   |   |-- landing-kpi-card.tsx
|       |   |   |-- left-panel.tsx
|       |   |   |-- password-input.tsx
|       |   |   |-- project-carousel.tsx
|       |   |   `-- right-panel.tsx
|       |   |-- master-libraries   [1 entries]
|       |   |   `-- master-libraries-page.tsx
|       |   |-- naming   [22 entries]
|       |   |   |-- naming-budget-packages.tsx
|       |   |   |-- naming-budget-sections-editor.tsx
|       |   |   |-- naming-company-abbreviations.tsx
|       |   |   |-- naming-convention-admin-page.tsx
|       |   |   |-- naming-discipline-codes.tsx
|       |   |   |-- naming-document-create.tsx
|       |   |   |-- naming-document-types-sync.tsx
|       |   |   |-- naming-level-list-editor.tsx
|       |   |   |-- naming-level-template-admin.tsx
|       |   |   |-- naming-numbering-rules.tsx
|       |   |   |-- naming-project-code-gen.tsx
|       |   |   |-- naming-project-wizard.tsx
|       |   |   |-- naming-stakeholder-abbreviations.tsx
|       |   |   |-- naming-transmittal-create.tsx
|       |   |   |-- naming-transmittal-detail.tsx
|       |   |   |-- naming-transmittal-list.tsx
|       |   |   |-- naming-wbs-building-config.tsx
|       |   |   |-- naming-wbs-code-preview.tsx
|       |   |   |-- naming-wbs-level-config.tsx
|       |   |   |-- naming-wbs-room-numbering.tsx
|       |   |   |-- naming-wbs-types.ts
|       |   |   `-- naming-wbs-zone-config.tsx
|       |   |-- planning   [83 entries]
|       |   |   |-- portal   [1 entries]
|       |   |   |   `-- programme-projection.tsx
|       |   |   |-- sync   [1 entries]
|       |   |   |   `-- sync-dashboard.tsx
|       |   |   |-- gantt-bar.tsx
|       |   |   |-- gantt-command-bar.tsx
|       |   |   |-- gantt-dependency-editor.tsx
|       |   |   |-- gantt-dependency-lines.tsx
|       |   |   |-- gantt-header.tsx
|       |   |   |-- gantt-legend.tsx
|       |   |   |-- gantt-milestone.tsx
|       |   |   |-- gantt-progress-line.tsx
|       |   |   |-- gantt-summary-bar.tsx
|       |   |   |-- gantt-task-detail-drawer.tsx
|       |   |   |-- gantt-task-tree.tsx
|       |   |   |-- gantt-toolbar.tsx
|       |   |   |-- gantt-types.ts
|       |   |   |-- gantt-utils.ts
|       |   |   |-- gantt-view.tsx
|       |   |   |-- plan-activity-site-diary-panel.tsx
|       |   |   |-- plan-activity-step-templates.tsx
|       |   |   |-- plan-bar-style-dialog.tsx
|       |   |   |-- plan-boq-mapping.tsx
|       |   |   |-- plan-calendar-exceptions.tsx
|       |   |   |-- plan-calendar-list.tsx
|       |   |   |-- plan-calendars-tabs.tsx
|       |   |   |-- plan-calibrate-norm-dialog.tsx
|       |   |   |-- plan-comparison-dashboard.tsx
|       |   |   |-- plan-cost-rollup.tsx
|       |   |   |-- plan-data-date-dialog.tsx
|       |   |   |-- plan-delay-analysis.tsx
|       |   |   |-- plan-delay-register.tsx
|       |   |   |-- plan-duration-apply-dialog.tsx
|       |   |   |-- plan-float-settings-dialog.tsx
|       |   |   |-- plan-gantt-chart.tsx
|       |   |   |-- plan-levelling-panel.tsx
|       |   |   |-- plan-manage-schedules-dialog.tsx
|       |   |   |-- plan-move-project-dialog.tsx
|       |   |   |-- planning-dashboard-charts.tsx
|       |   |   |-- planning-module-shell.tsx
|       |   |   |-- planning-overview-infographic.tsx
|       |   |   |-- planning-resource-charts.tsx
|       |   |   |-- planning-scurve-card.tsx
|       |   |   |-- plan-norm-dialog.tsx
|       |   |   |-- plan-norm-dwl-import-dialog.tsx
|       |   |   |-- plan-norm-library.tsx
|       |   |   |-- plan-page-shell.tsx
|       |   |   |-- plan-print-dialog.tsx
|       |   |   |-- plan-progress-line-dialog.tsx
|       |   |   |-- plan-progress-review-queue.tsx
|       |   |   |-- plan-progress-review-settings.tsx
|       |   |   |-- plan-project-members.tsx
|       |   |   |-- plan-resource-dialog.tsx
|       |   |   |-- plan-resource-loading.tsx
|       |   |   |-- plan-schedule-reports.tsx
|       |   |   |-- plan-schedule-view.tsx
|       |   |   |-- plan-set-baseline-dialog.tsx
|       |   |   |-- plan-sheet.tsx
|       |   |   |-- plan-sheet-detail-panel.tsx
|       |   |   |-- plan-site-records.tsx
|       |   |   |-- plan-task-calendar.tsx
|       |   |   |-- plan-task-detail-drawer.tsx
|       |   |   |-- plan-task-work.tsx
|       |   |   |-- plan-task-work-csv-dialog.tsx
|       |   |   |-- plan-task-work-history-dialog.tsx
|       |   |   |-- plan-tia-analysis.tsx
|       |   |   |-- plan-timescale-dialog.tsx
|       |   |   |-- plan-wbs-code-dialog.tsx
|       |   |   |-- plan-working-time-dialog.tsx
|       |   |   |-- portfolio-gantt.tsx
|       |   |   |-- schedule-levels.ts
|       |   |   |-- schedule-timeline.tsx
|       |   |   |-- schedule-toolbar.tsx
|       |   |   |-- sheet-cell.tsx
|       |   |   |-- sheet-grid.tsx
|       |   |   |-- sheet-grid-context.tsx
|       |   |   |-- sheet-row.tsx
|       |   |   |-- sheet-row-context-menu.tsx
|       |   |   |-- sheet-toolbar.tsx
|       |   |   |-- sheet-types.ts
|       |   |   |-- sheet-utils.ts
|       |   |   |-- task-status.ts
|       |   |   |-- use-column-preferences.ts
|       |   |   |-- use-date-format-preference.ts
|       |   |   `-- use-sheet-data.ts
|       |   |-- procurement   [36 entries]
|       |   |   |-- auto-reorder.tsx
|       |   |   |-- boq-item-editor.tsx
|       |   |   |-- boq-item-picker-dialog.tsx
|       |   |   |-- boq-list.tsx
|       |   |   |-- boq-section-form.tsx
|       |   |   |-- budget-confirmation-detail.tsx
|       |   |   |-- budget-confirmation-form.tsx
|       |   |   |-- file-upload.tsx
|       |   |   |-- goods-receipt-form.tsx
|       |   |   |-- goods-receipt-list.tsx
|       |   |   |-- invoice-match-detail.tsx
|       |   |   |-- invoice-match-form.tsx
|       |   |   |-- invoice-match-list.tsx
|       |   |   |-- po-detail.tsx
|       |   |   |-- po-form.tsx
|       |   |   |-- po-list.tsx
|       |   |   |-- pr-detail.tsx
|       |   |   |-- pr-form.tsx
|       |   |   |-- pr-list.tsx
|       |   |   |-- proc-permission-guard.tsx
|       |   |   |-- procurement-analytics.tsx
|       |   |   |-- procurement-audit-log.tsx
|       |   |   |-- procurement-notifications.tsx
|       |   |   |-- raise-pr-from-boq-dialog.tsx
|       |   |   |-- rfq-detail.tsx
|       |   |   |-- rfq-form.tsx
|       |   |   |-- rfq-list.tsx
|       |   |   |-- supplier-delivery-form.tsx
|       |   |   |-- supplier-form.tsx
|       |   |   |-- supplier-list.tsx
|       |   |   |-- supplier-performance.tsx
|       |   |   |-- supplier-portal.tsx
|       |   |   |-- supplier-po-view.tsx
|       |   |   |-- supplier-prequalification.tsx
|       |   |   |-- supplier-rfq-response.tsx
|       |   |   `-- use-procurement-permissions.ts
|       |   |-- projects   [12 entries]
|       |   |   |-- precontract   [4 entries]
|       |   |   |   |-- control-sections.tsx
|       |   |   |   |-- setup-sections.tsx
|       |   |   |   |-- shared.tsx
|       |   |   |   `-- workstream-sections.tsx
|       |   |   |-- steps   [2 entries]
|       |   |   |   |-- step-panel.tsx
|       |   |   |   `-- use-stakeholder-steps.ts
|       |   |   |-- award-conversion-dialog.tsx
|       |   |   |-- postcontract-detail.tsx
|       |   |   |-- precontract-bid-prep.tsx
|       |   |   |-- precontract-detail.tsx
|       |   |   |-- precontract-wizard.tsx
|       |   |   |-- project-edit-sheet.tsx
|       |   |   |-- project-list-page.tsx
|       |   |   |-- project-map-thumb.tsx
|       |   |   |-- project-setup-wizard.tsx
|       |   |   `-- project-stakeholders-tab.tsx
|       |   |-- qaqc   [5 entries]
|       |   |   |-- inspection-request-list.tsx
|       |   |   |-- inspection-result-sheet.tsx
|       |   |   |-- itp-manager.tsx
|       |   |   |-- ncr-detail-sheet.tsx
|       |   |   `-- ncr-list.tsx
|       |   |-- qs   [76 entries]
|       |   |   |-- advance-recovery-register.tsx
|       |   |   |-- audit-log.tsx
|       |   |   |-- boq-builder.tsx
|       |   |   |-- boq-lock-dialog.tsx
|       |   |   |-- budget-revisions.tsx
|       |   |   |-- budget-view.tsx
|       |   |   |-- certification-page.tsx
|       |   |   |-- contingency-register.tsx
|       |   |   |-- cost-control.tsx
|       |   |   |-- cost-database-page.tsx
|       |   |   |-- cost-entry.tsx
|       |   |   |-- cost-per-m2-dashboard.tsx
|       |   |   |-- cost-scurve.tsx
|       |   |   |-- create-boq-slidein.tsx
|       |   |   |-- currency-settings.tsx
|       |   |   |-- dwl-assemblies-list-page.tsx
|       |   |   |-- dwl-assembly-form-dialog.tsx
|       |   |   |-- dwl-assembly-item-form-dialog.tsx
|       |   |   |-- dwl-assembly-layer-form-dialog.tsx
|       |   |   |-- dwl-assembly-layer-viewer-3d.tsx
|       |   |   |-- dwl-assembly-resource-line-form-dialog.tsx
|       |   |   |-- dwl-cost-item-create-dialog.tsx
|       |   |   |-- dwl-cost-item-detail.tsx
|       |   |   |-- dwl-cost-item-general-edit-dialog.tsx
|       |   |   |-- dwl-cost-item-import-dialog.tsx
|       |   |   |-- dwl-cost-item-library-list-page.tsx
|       |   |   |-- dwl-equipment-rate-form-dialog.tsx
|       |   |   |-- dwl-equipment-rate-import-dialog.tsx
|       |   |   |-- dwl-equipment-rates-list-page.tsx
|       |   |   |-- dwl-estimate-list-page.tsx
|       |   |   |-- dwl-import-lib.ts
|       |   |   |-- dwl-labor-rate-form-dialog.tsx
|       |   |   |-- dwl-labor-rate-import-dialog.tsx
|       |   |   |-- dwl-labor-rates-list-page.tsx
|       |   |   |-- dwl-material-category-dialog.tsx
|       |   |   |-- dwl-material-detail-page.tsx
|       |   |   |-- dwl-material-form-dialog.tsx
|       |   |   |-- dwl-material-import-compare.ts
|       |   |   |-- dwl-material-import-dialog.tsx
|       |   |   |-- dwl-material-import-page.tsx
|       |   |   |-- dwl-material-price-dialog.tsx
|       |   |   |-- dwl-materials-list-page.tsx
|       |   |   |-- dwl-material-spec-dialog.tsx
|       |   |   |-- dwl-model-factor-form-dialog.tsx
|       |   |   |-- dwl-model-form-dialog.tsx
|       |   |   |-- dwl-price-approvals-page.tsx
|       |   |   |-- dwl-price-dashboard.tsx
|       |   |   |-- dwl-price-form-dialog.tsx
|       |   |   |-- dwl-project-form-dialog.tsx
|       |   |   |-- dwl-recipe-line-form-dialog.tsx
|       |   |   |-- dwl-resource-form-dialog.tsx
|       |   |   |-- dwl-resource-import-dialog.tsx
|       |   |   |-- dwl-resources-list-page.tsx
|       |   |   |-- dwl-snapshot-dialog.tsx
|       |   |   |-- dwl-subcon-rate-form-dialog.tsx
|       |   |   |-- dwl-subcon-rate-import-dialog.tsx
|       |   |   |-- dwl-subcontractor-rates-list-page.tsx
|       |   |   |-- dwl-supplier-form-dialog.tsx
|       |   |   |-- dwl-supplier-import-dialog.tsx
|       |   |   |-- dwl-supplier-material-dialog.tsx
|       |   |   |-- dwl-suppliers-list-page.tsx
|       |   |   |-- dwl-types.ts
|       |   |   |-- dwl-work-item-form-dialog.tsx
|       |   |   |-- dwl-work-items-list-page.tsx
|       |   |   |-- evm-dashboard.tsx
|       |   |   |-- evm-view.tsx
|       |   |   |-- library-rate-picker.tsx
|       |   |   |-- merged-claims-view.tsx
|       |   |   |-- merged-variations-view.tsx
|       |   |   |-- portfolio-view.tsx
|       |   |   |-- progress-claim-list.tsx
|       |   |   |-- qs-overview-infographic.tsx
|       |   |   |-- qs-search-index-refresh-button.tsx
|       |   |   |-- retention-register.tsx
|       |   |   |-- update-boq-slidein.tsx
|       |   |   `-- variation-order-list.tsx
|       |   |-- qto   [4 entries]
|       |   |   |-- drawing-viewer.tsx
|       |   |   |-- qto-item-form.tsx
|       |   |   |-- qto-list-page.tsx
|       |   |   `-- qto-workspace.tsx
|       |   |-- reports   [2 entries]
|       |   |   |-- charts   [4 entries]
|       |   |   |   |-- bar-chart.tsx
|       |   |   |   |-- chart-wrapper.tsx
|       |   |   |   |-- kpi-grid.tsx
|       |   |   |   `-- progress-chart.tsx
|       |   |   `-- layout   [3 entries]
|       |   |       |-- report-export.tsx
|       |   |       |-- report-frame.tsx
|       |   |       `-- report-header.tsx
|       |   |-- settings   [11 entries]
|       |   |   |-- approval-threshold-panel.tsx
|       |   |   |-- change-password-card.tsx
|       |   |   |-- company-profile-page.tsx
|       |   |   |-- module-settings-page.tsx
|       |   |   |-- notification-preferences-panel.tsx
|       |   |   |-- personal-info-card.tsx
|       |   |   |-- profile-account-info-card.tsx
|       |   |   |-- role-permissions-page.tsx
|       |   |   |-- staff-edit-sheet.tsx
|       |   |   |-- staff-invite-sheet.tsx
|       |   |   `-- staff-list-page.tsx
|       |   |-- site   [8 entries]
|       |   |   |-- daily-report-editor.tsx
|       |   |   |-- site-daily-reports.tsx
|       |   |   |-- site-equipment.tsx
|       |   |   |-- site-inspections.tsx
|       |   |   |-- site-manpower.tsx
|       |   |   |-- site-ncrs.tsx
|       |   |   |-- site-page-shell.tsx
|       |   |   `-- site-progress-photos.tsx
|       |   |-- stakeholders   [9 entries]
|       |   |   |-- bulk-hr-assign-dialog.tsx
|       |   |   |-- constants.ts
|       |   |   |-- sparkline.tsx
|       |   |   |-- staff-manager-dialog.tsx
|       |   |   |-- stakeholder-company-card.tsx
|       |   |   |-- stakeholder-edit-sheet.tsx
|       |   |   |-- stakeholder-list-page.tsx
|       |   |   |-- template-edit-sheet.tsx
|       |   |   `-- template-list-page.tsx
|       |   |-- tasks   [3 entries]
|       |   |   |-- department-workspace.tsx
|       |   |   |-- my-tasks-dashboard.tsx
|       |   |   `-- team-planner-grid.tsx
|       |   |-- telegram   [1 entries]
|       |   |   `-- leave-apply-form.tsx
|       |   |-- tenders   [5 entries]
|       |   |   |-- cost-estimation   [21 entries]
|       |   |   |   |-- ai-boq-draft-dialog.tsx
|       |   |   |   |-- assign-cost-database-dialog.tsx
|       |   |   |   |-- assign-library-to-boq-dialog.tsx
|       |   |   |   |-- bid-summary-tab.tsx
|       |   |   |   |-- boq-element-library-picker-dialog.tsx
|       |   |   |   |-- boq-tab.tsx
|       |   |   |   |-- cost-per-m2-tab.tsx
|       |   |   |   |-- cost-summary-tab.tsx
|       |   |   |   |-- cover-summary-tab.tsx
|       |   |   |   |-- element-library-picker-dialog.tsx
|       |   |   |   |-- exclude-items-tab.tsx
|       |   |   |   |-- load-library-dialog.tsx
|       |   |   |   |-- preliminaries-tab.tsx
|       |   |   |   |-- price-list-picker-dialog.tsx
|       |   |   |   |-- price-list-tab.tsx
|       |   |   |   |-- project-budget-tab.tsx
|       |   |   |   |-- risks-tab.tsx
|       |   |   |   |-- save-to-cost-database-dialog.tsx
|       |   |   |   |-- sub-quotes-tab.tsx
|       |   |   |   |-- tender-cost-import-dialog.tsx
|       |   |   |   `-- unit-rates-tab.tsx
|       |   |   |-- cost-library   [4 entries]
|       |   |   |   |-- add-item-dialog.tsx
|       |   |   |   |-- item-editor.tsx
|       |   |   |   |-- prelim-tree.tsx
|       |   |   |   `-- site-data-panel.tsx
|       |   |   |-- element-library   [3 entries]
|       |   |   |   |-- add-element-dialog.tsx
|       |   |   |   |-- element-detail-panel.tsx
|       |   |   |   `-- element-library-tree.tsx
|       |   |   |-- submissions   [1 entries]
|       |   |   |   `-- submission-form-dialog.tsx
|       |   |   `-- budget-code-external-refs.tsx
|       |   |-- ui   [21 entries]
|       |   |   |-- alert-dialog.tsx
|       |   |   |-- avatar.tsx
|       |   |   |-- badge.tsx
|       |   |   |-- button.tsx
|       |   |   |-- card.tsx
|       |   |   |-- checkbox.tsx
|       |   |   |-- dialog.tsx
|       |   |   |-- dropdown-menu.tsx
|       |   |   |-- input.tsx
|       |   |   |-- kpi-card.tsx
|       |   |   |-- label.tsx
|       |   |   |-- location-picker.tsx
|       |   |   |-- popover.tsx
|       |   |   |-- scroll-area.tsx
|       |   |   |-- select.tsx
|       |   |   |-- separator.tsx
|       |   |   |-- skeleton.tsx
|       |   |   |-- sonner.tsx
|       |   |   |-- table.tsx
|       |   |   |-- tabs.tsx
|       |   |   `-- tooltip.tsx
|       |   |-- wbs   [34 entries]
|       |   |   |-- builder   [8 entries]
|       |   |   |   |-- use-wbs-builder-data.ts
|       |   |   |   |-- wbs-builder.tsx
|       |   |   |   |-- wbs-builder-cell.tsx
|       |   |   |   |-- wbs-builder-grid.tsx
|       |   |   |   |-- wbs-builder-row.tsx
|       |   |   |   |-- wbs-builder-toolbar.tsx
|       |   |   |   |-- wbs-builder-types.ts
|       |   |   |   `-- wbs-versions-dialog.tsx
|       |   |   |-- apply-template-dialog.tsx
|       |   |   |-- gfa-inline-editor.tsx
|       |   |   |-- gfa-rollup.tsx
|       |   |   |-- master-wbs-generator-dialog.tsx
|       |   |   |-- master-wbs-import-dialog.tsx
|       |   |   |-- project-site-area-dialog.tsx
|       |   |   |-- template-management-page.tsx
|       |   |   |-- template-node-edit-sheet.tsx
|       |   |   |-- template-node-tree.tsx
|       |   |   |-- template-upsert-dialog.tsx
|       |   |   |-- wbs-activity-steps-panel.tsx
|       |   |   |-- wbs-constraint-readiness.tsx
|       |   |   |-- wbs-cost-tab.tsx
|       |   |   |-- wbs-evm-panel.tsx
|       |   |   |-- wbs-execution-view.tsx
|       |   |   |-- wbs-gantt-view.tsx
|       |   |   |-- wbs-import-dialog.tsx
|       |   |   |-- wbs-kanban-view.tsx
|       |   |   |-- wbs-lookahead-timeline.tsx
|       |   |   |-- wbs-lookahead-view.tsx
|       |   |   |-- wbs-management-page.tsx
|       |   |   |-- wbs-node-detail-panel.tsx
|       |   |   |-- wbs-node-edit-sheet.tsx
|       |   |   |-- wbs-node-workspace.tsx
|       |   |   |-- wbs-resources-view.tsx
|       |   |   |-- wbs-scurve-chart.tsx
|       |   |   |-- wbs-summary-view.tsx
|       |   |   |-- wbs-task-edit-sheet.tsx
|       |   |   |-- wbs-task-kpi-page.tsx
|       |   |   |-- wbs-tasks-page.tsx
|       |   |   |-- wbs-tree-page.tsx
|       |   |   |-- wbs-types.ts
|       |   |   `-- wbs-weekly-plan.tsx
|       |   `-- pwa-register.tsx
|       |-- contexts   [2 entries]
|       |   |-- module-settings-context.tsx
|       |   `-- planning-permissions-context.tsx
|       |-- hooks   [12 entries]
|       |   |-- use-admin-or-hr-guard.ts
|       |   |-- use-bim-viewer.ts
|       |   |-- use-cached-fetch.ts
|       |   |-- use-is-wbs-manager.ts
|       |   |-- use-permitted-modules.ts
|       |   |-- use-planning-permissions.ts
|       |   |-- use-pwa-install.ts
|       |   |-- use-qs-library-search.ts
|       |   |-- use-qs-permissions.ts
|       |   |-- use-qto-permissions.ts
|       |   |-- use-supabase-auth.ts
|       |   `-- use-tender-permissions.ts
|       |-- lib   [69 entries]
|       |   |-- admin-users   [5 entries]
|       |   |   |-- account-status-route-handler.ts
|       |   |   |-- actor-context.ts
|       |   |   |-- admin-users-schemas.ts
|       |   |   |-- admin-users-service.ts
|       |   |   `-- audit-log.ts
|       |   |-- auth   [4 entries]
|       |   |   |-- auth-schemas.ts
|       |   |   |-- auth-service.ts
|       |   |   |-- password-policy.ts
|       |   |   `-- redirect.ts
|       |   |-- bim   [4 entries]
|       |   |   |-- bim-boq-promotion-service.ts
|       |   |   |-- bim-service.ts
|       |   |   |-- bim-types.ts
|       |   |   `-- ifc-helpers.ts
|       |   |-- email   [1 entries]
|       |   |   `-- resend.ts
|       |   |-- hr   [9 entries]
|       |   |   |-- approval-chain.ts
|       |   |   |-- attendance.ts
|       |   |   |-- auth.ts
|       |   |   |-- employee-master.ts
|       |   |   |-- leave.ts
|       |   |   |-- leave-day-calculation.ts
|       |   |   |-- leave-schemas.ts
|       |   |   |-- permissions.ts
|       |   |   `-- standard-positions.ts
|       |   |-- inv   [2 entries]
|       |   |   |-- inv-schemas.ts
|       |   |   `-- inv-service.ts
|       |   |-- notifications   [1 entries]
|       |   |   `-- dispatch.ts
|       |   |-- planning   [41 entries]
|       |   |   |-- __tests__   [22 entries]
|       |   |   |   |-- boq-matching.test.ts
|       |   |   |   |-- constraint-feed-mapping.test.ts
|       |   |   |   |-- cost-engine.test.ts
|       |   |   |   |-- cost-levelling-profile.test.ts
|       |   |   |   |-- cost-phasing.test.ts
|       |   |   |   |-- delay-governance.test.ts
|       |   |   |   |-- duration-apply-service.test.ts
|       |   |   |   |-- dwl-norm-import.test.ts
|       |   |   |   |-- levelling-profile.test.ts
|       |   |   |   |-- productivity-index.test.ts
|       |   |   |   |-- reference-levelling.ts
|       |   |   |   |-- resource-levelling.test.ts
|       |   |   |   |-- resource-levelling-equivalence.test.ts
|       |   |   |   |-- resource-service.test.ts
|       |   |   |   |-- resource-trade-dashboard.test.ts
|       |   |   |   |-- schedule-engine.test.ts
|       |   |   |   |-- schedule-kpis.test.ts
|       |   |   |   |-- task-work-csv.test.ts
|       |   |   |   |-- time-impact-analysis.test.ts
|       |   |   |   |-- work-calendar-hours.test.ts
|       |   |   |   |-- work-engine.test.ts
|       |   |   |   `-- work-engine-parity.test.ts
|       |   |   |-- sync   [7 entries]
|       |   |   |   |-- change-detection.ts
|       |   |   |   |-- engine.ts
|       |   |   |   |-- export-xml.ts
|       |   |   |   |-- mapping.ts
|       |   |   |   |-- mspd-parser.ts
|       |   |   |   |-- realtime.ts
|       |   |   |   `-- types.ts
|       |   |   |-- activity-steps-service.ts
|       |   |   |-- baseline-service.ts
|       |   |   |-- boq-mapping-service.ts
|       |   |   |-- boq-matching.ts
|       |   |   |-- constraint-feed-mapping.ts
|       |   |   |-- cost-engine.ts
|       |   |   |-- cost-levelling-profile.ts
|       |   |   |-- cost-phasing.ts
|       |   |   |-- cost-service.ts
|       |   |   |-- delay-analysis.ts
|       |   |   |-- delay-governance.ts
|       |   |   |-- duration-apply-service.ts
|       |   |   |-- dwl-norm-import.ts
|       |   |   |-- gantt-bar-style.ts
|       |   |   |-- gantt-print.ts
|       |   |   |-- levelling-profile.ts
|       |   |   |-- levelling-service.ts
|       |   |   |-- monthly-report-html.ts
|       |   |   |-- planning-overview-data.ts
|       |   |   |-- predecessor-syntax.ts
|       |   |   |-- productivity-index.ts
|       |   |   |-- productivity-log-service.ts
|       |   |   |-- productivity-service.ts
|       |   |   |-- project-schedule-service.ts
|       |   |   |-- resource-generation-service.ts
|       |   |   |-- resource-levelling.ts
|       |   |   |-- resource-service.ts
|       |   |   |-- schedule-audit.ts
|       |   |   |-- schedule-comparison-service.ts
|       |   |   |-- schedule-engine.ts
|       |   |   |-- schedule-kpis.ts
|       |   |   |-- scurve-comparison.ts
|       |   |   |-- task-work-csv.ts
|       |   |   |-- tia-service.ts
|       |   |   |-- time-impact-analysis.ts
|       |   |   |-- timescale.ts
|       |   |   |-- wbs-code-mask.ts
|       |   |   |-- work-calendar.ts
|       |   |   `-- work-engine.ts
|       |   |-- qs   [1 entries]
|       |   |   `-- qs-overview-data.ts
|       |   |-- site   [3 entries]
|       |   |   |-- __tests__   [1 entries]
|       |   |   |   `-- daily-report-sync.test.ts
|       |   |   |-- daily-report-math.ts
|       |   |   `-- daily-report-service.ts
|       |   |-- supabase   [3 entries]
|       |   |   |-- client.ts
|       |   |   |-- database.types.ts
|       |   |   `-- server.ts
|       |   |-- tasks   [1 entries]
|       |   |   `-- assign-task.ts
|       |   |-- telegram   [7 entries]
|       |   |   |-- bot.ts
|       |   |   |-- init-data.ts
|       |   |   |-- leave-handlers.ts
|       |   |   |-- miniapp-auth.ts
|       |   |   |-- miniapp-context.tsx
|       |   |   |-- webapp-types.d.ts
|       |   |   `-- webhook-handlers.ts
|       |   |-- account-nav.ts
|       |   |-- ai-boq-draft-schema.ts
|       |   |-- api-error.ts
|       |   |-- boq-units.ts
|       |   |-- construction-nav.ts
|       |   |-- contract-service.ts
|       |   |-- contract-types.ts
|       |   |-- control-room-service.ts
|       |   |-- csv-export.ts
|       |   |-- date-format.ts
|       |   |-- design-nav.ts
|       |   |-- document-control-nav.ts
|       |   |-- document-stamping.ts
|       |   |-- evm-service.ts
|       |   |-- hr-nav.ts
|       |   |-- insights-service.ts
|       |   |-- inventory-nav.ts
|       |   |-- landing-service.ts
|       |   |-- master-libraries.ts
|       |   |-- module-key-map.ts
|       |   |-- module-nav.ts
|       |   |-- module-settings-service.ts
|       |   |-- nav-item-catalog.ts
|       |   |-- nav-item-settings-service.ts
|       |   |-- number-to-words.ts
|       |   |-- permissions.ts
|       |   |-- planning-nav.ts
|       |   |-- prelim-library-service.ts
|       |   |-- print-service.ts
|       |   |-- procurement-nav.ts
|       |   |-- project-categories.ts
|       |   |-- project-setup-service.ts
|       |   |-- qaqc-service.ts
|       |   |-- qs-boq-validation.ts
|       |   |-- qs-element-library-shared.ts
|       |   |-- qs-library-search.ts
|       |   |-- qs-nav.ts
|       |   |-- qs-service.ts
|       |   |-- qto-service.ts
|       |   |-- reporting-nav.ts
|       |   |-- request-dedup.ts
|       |   |-- schedule-service.ts
|       |   |-- stakeholder-assignment.ts
|       |   |-- supplier-prequalification-service.ts
|       |   |-- task-alerts.ts
|       |   |-- task-scope.ts
|       |   |-- team-planning-store.ts
|       |   |-- tender-ai-boq-draft.ts
|       |   |-- tender-approval.ts
|       |   |-- tender-cost-database.ts
|       |   |-- tender-cost-service.ts
|       |   |-- tender-lifecycle.ts
|       |   |-- utils.ts
|       |   |-- wbs-code.ts
|       |   |-- wbs-hierarchy.ts
|       |   `-- wbs-version-service.ts
|       |-- public   [7 entries]
|       |   |-- file.svg
|       |   |-- globe.svg
|       |   |-- next.svg
|       |   |-- sw.js
|       |   |-- vercel.svg
|       |   |-- web-ifc.wasm
|       |   `-- window.svg
|       |-- .env.example
|       |-- .env.local
|       |-- .env.local.remote-backup
|       |-- .env.production
|       |-- .gitignore
|       |-- AGENTS.md
|       |-- CLAUDE.md
|       |-- components.json
|       |-- eslint.config.mjs
|       |-- next.config.ts
|       |-- next-env.d.ts
|       |-- package.json
|       |-- postcss.config.mjs
|       |-- README.md
|       |-- tsconfig.json
|       |-- tsconfig.tsbuildinfo
|       |-- vercel.json
|       `-- vitest.config.ts
|-- docs   [18 entries]
|   |-- 00-Start-up   [8 entries]
|   |   |-- 01-Business-Requirement.md
|   |   |-- 03-Workflow-Diagram.md
|   |   |-- 04-Database-Schema.md
|   |   |-- 05-API-Specification.md
|   |   |-- 07-Permission-Matrix.md
|   |   |-- 12-SOP.md
|   |   |-- files.zip
|   |   `-- System Admin should control account.md
|   |-- 01-DCOS-Foundation   [12 entries]
|   |   |-- 05-DCOS-Naming-Convention   [3 entries]
|   |   |   |-- DCOS_Naming_Convention_SOP.docx
|   |   |   |-- DCOS_Naming_Standards.pdf
|   |   |   `-- DCOS-Naming-Convention.md
|   |   |-- DCOS_Reorganized_System_Architecture.pptx
|   |   |-- DCOS-AI-Agent-Usage-Guide.md
|   |   |-- DCOS-Coding-Convention.md
|   |   |-- DCOS-Document-Control-Procedure.md
|   |   |-- DCOS-Governance-Framework.md
|   |   |-- DCOS-Module-Map.md
|   |   |-- DCOS-Naming-Convention.md
|   |   |-- DCOS-RLS-Security-Remediation-Tracker.md
|   |   |-- DCOS-Roadmap.md
|   |   |-- DCOS-System-Architecture.md
|   |   `-- DCOS-Vision.md
|   |-- 02-Governance   [1 entries]
|   |   `-- 01-SOP   [7 entries]
|   |       |-- 01-SOP-User-Management   [2 entries]
|   |       |   |-- DCOS_SOP_User_Management.docx
|   |       |   `-- SOP-User-Management.md
|   |       |-- 02-SOP-Stakeholder-Management   [1 entries]
|   |       |   `-- 01-Stakeholder-Management.md
|   |       |-- 03-SOP-Project-Setup   [3 entries]
|   |       |   |-- DCOS_Project_Setup_Blueprint.pdf
|   |       |   |-- DCOS-SOP-Project-Setup.docx
|   |       |   `-- SOP-Project-Setup.md
|   |       |-- 04-SOP-WBS-Management   [3 entries]
|   |       |   |-- DCOS_SOP_WBS_Management_R2.docx
|   |       |   |-- SOP-WBS-Management.md
|   |       |   `-- The_DCOS_WBS_Spine.pdf
|   |       |-- 05-SOP-Task-Management   [2 entries]
|   |       |   |-- DCOS_Task_Management.pdf
|   |       |   `-- SOP-Task-Management.md
|   |       |-- 06-SOP-Planning-Scheduling   [1 entries]
|   |       |   `-- SOP-PLN-001.md
|   |       `-- 22-SOP-Quantity-Surveying   [1 entries]
|   |           `-- SOP-QS-Module.md
|   |-- 04-Business-Modules   [14 entries]
|   |   |-- 02-USR-User-Management   [13 entries]
|   |   |   |-- 00-Master.md
|   |   |   |-- 01-Business-Requirement.md
|   |   |   |-- 02-Functional-Specification.md
|   |   |   |-- 03-Use-Cases.md
|   |   |   |-- 04-Database-Schema.md
|   |   |   |-- 05-Integration-Specification.md
|   |   |   |-- 06-UI-UX-Design.md
|   |   |   |-- 07-RBAC-Matrix.md
|   |   |   |-- 08-API-Reference.md
|   |   |   |-- 09-Test-Plan.md
|   |   |   |-- 10-Deployment-Notes.md
|   |   |   |-- 11-SOP.md
|   |   |   `-- 12-Training-Guide.md
|   |   |-- 04-01-Stakeholder-Management   [16 entries]
|   |   |   |-- 01-Business-Requirement.md
|   |   |   |-- 02-Functional-Specification.md
|   |   |   |-- 03-Use-Cases.md
|   |   |   |-- 04-Database-Schema.md
|   |   |   |-- 05-Integration-Specification.md
|   |   |   |-- 06-UI-UX-Design.md
|   |   |   |-- 07-RBAC-Matrix.md
|   |   |   |-- 08-API-Reference.md
|   |   |   |-- 09-Test-Plan.md
|   |   |   |-- 10-Deployment-Notes.md
|   |   |   |-- 11-SOP.md
|   |   |   |-- 12-Training-Guide.md
|   |   |   |-- DCOS_Stakeholder_Management_Master_Prompt.md
|   |   |   |-- files.zip
|   |   |   |-- Stakeholder Management.md
|   |   |   `-- Stakeholder_Detail.md
|   |   |-- 04-02-Project-Setup   [22 entries]
|   |   |   |-- 04-02-01-Pre Contract Project   [1 entries]
|   |   |   |   `-- PRE-CONTRACT Project Prompt.md
|   |   |   |-- 04-02-02-Post Contract Project   [0 entries]
|   |   |   |-- 01-Business-Requirement.md
|   |   |   |-- 02-Functional-Specification.md
|   |   |   |-- 03-Use-Cases.md
|   |   |   |-- 04-Database-Schema.md
|   |   |   |-- 05-Integration-Specification.md
|   |   |   |-- 06-UI-UX-Design.md
|   |   |   |-- 07-RBAC-Matrix.md
|   |   |   |-- 08-API-Reference.md
|   |   |   |-- 09-Test-Plan.md
|   |   |   |-- 10-Deployment-Notes.md
|   |   |   |-- 11-SOP.md
|   |   |   |-- 12-Training-Guide.md
|   |   |   |-- DCOS_Project_Setup_Master_Prompt (1).md
|   |   |   |-- DCOS_Project_Setup_Master_Prompt.md
|   |   |   |-- DCOS_Project_Setup_Training_Summary.pdf
|   |   |   |-- DCOS_Project_Setup_Training_Summary.pptx
|   |   |   |-- DCOS-SOP-Project-Setup.docx
|   |   |   |-- files (1).zip
|   |   |   |-- New Text Document.txt
|   |   |   `-- Project Categories.md
|   |   |-- 04-03-WBS-Management   [16 entries]
|   |   |   |-- 01-Business-Requirement.md
|   |   |   |-- 02-Functional-Specification.md
|   |   |   |-- 03-Use-Cases.md
|   |   |   |-- 04-Database-Schema.md
|   |   |   |-- 05-Integration-Specification.md
|   |   |   |-- 06-UI-UX-Design.md
|   |   |   |-- 07-RBAC-Matrix.md
|   |   |   |-- 08-API-Reference.md
|   |   |   |-- 09-Test-Plan.md
|   |   |   |-- 10-Deployment-Notes.md
|   |   |   |-- 11-SOP.md
|   |   |   |-- 12-Training-Guide.md
|   |   |   |-- DCOS_SOP_WBS_Management_R2.docx
|   |   |   |-- DCOS_WBS_Management_Master_Prompt.md
|   |   |   |-- DCOS_WBS_Management_Training_Summary.pptx
|   |   |   `-- files (2).zip
|   |   |-- 04-04-Task-Management   [13 entries]
|   |   |   |-- 01-Business-Requirement.md
|   |   |   |-- 02-Functional-Specification.md
|   |   |   |-- 03-Use-Cases.md
|   |   |   |-- 04-Database-Schema.md
|   |   |   |-- 05-Integration-Specification.md
|   |   |   |-- 06-UI-UX-Design.md
|   |   |   |-- 07-RBAC-Matrix.md
|   |   |   |-- 08-API-Reference.md
|   |   |   |-- 09-Test-Plan.md
|   |   |   |-- 10-Deployment-Notes.md
|   |   |   |-- 11-SOP.md
|   |   |   |-- 12-Training-Guide.md
|   |   |   `-- files.zip
|   |   |-- 04-11-Procurement   [14 entries]
|   |   |   |-- 01-Business-Requirement.md
|   |   |   |-- 02-Functional-Specification.md
|   |   |   |-- 03-Workflow-Diagram.md
|   |   |   |-- 04-Database-Schema.md
|   |   |   |-- 05-API-Specification.md
|   |   |   |-- 06-UI-UX-Design.md
|   |   |   |-- 07-Permission-Matrix.md
|   |   |   |-- 08-Notification-Matrix.md
|   |   |   |-- 09-Audit-Requirements.md
|   |   |   |-- 10-Reports-KPI.md
|   |   |   |-- 11-Test-Cases.md
|   |   |   |-- 12-SOP.md
|   |   |   |-- 12-Training-Guide.md
|   |   |   `-- files.zip
|   |   |-- 04-18-HR   [5 entries]
|   |   |   |-- 04-18-1-Employee Master   [4 entries]
|   |   |   |   |-- # DCOS_HR_Employee_Master_Document.md
|   |   |   |   |-- # SOP-Employee-Master.md
|   |   |   |   |-- DCOS_HR_Employee_Master_Policy_R2.docx
|   |   |   |   `-- DCOS-SOP-Employee-Master.docx
|   |   |   |-- 04-18-2-E-Leave   [5 entries]
|   |   |   |   |-- # DCOS_HR_ELeave_Module_Design_R1_Part 1.md
|   |   |   |   |-- # DCOS_HR_ELeave_Module_Design_R1_Part 2.md
|   |   |   |   |-- # DCOS_HR_ELeave_Module_Design_R1_Part 3.md
|   |   |   |   |-- DCOS_HR_ELeave_Module_Design_R1_Full.docx
|   |   |   |   `-- Year-End Run.md
|   |   |   |-- 04-18-3-Attendance   [2 entries]
|   |   |   |   |-- # SOP-Attendance-System.md
|   |   |   |   `-- DCOS_SOP_Attendance_Management_System_v1.0.docx
|   |   |   |-- 04-18-4-Overtime   [1 entries]
|   |   |   |   `-- # SOP-OT-Management.md
|   |   |   `-- 04-18-5-Payroll   [3 entries]
|   |   |       |-- # DCOS HR Payroll Module Design Plan.md
|   |   |       |-- # DCOS-Payroll Module.md
|   |   |       `-- DCOS-Payroll-Cambodia-Compliance-Plan.md
|   |   |-- 06-Planning-Scheduling   [27 entries]
|   |   |   |-- # Time Impact Analysis (TIA) Engine.md
|   |   |   |-- 00-Planning-Scheduling_Master.md
|   |   |   |-- 01-Business-Requirement.md
|   |   |   |-- 02-Functional-Specification.md
|   |   |   |-- 03-Use-Cases.md
|   |   |   |-- 04-Database-Schema.md
|   |   |   |-- 05-Integration-Specification.md
|   |   |   |-- 06-UI-UX-Design.md
|   |   |   |-- 07-RBAC-Matrix.md
|   |   |   |-- 08-API-Reference.md
|   |   |   |-- 09-Test-Plan.md
|   |   |   |-- 10-Deployment-Notes.md
|   |   |   |-- 11-SOP.md
|   |   |   |-- 12-Training-Guide.md
|   |   |   |-- 13-MSProject-Gap-Remediation-Plan.md
|   |   |   |-- 14-Completion-Plan.md
|   |   |   |-- 15-Completion-Plan-Continuation.md
|   |   |   |-- 16-Productivity-and-Resource-Costing-Plan.md
|   |   |   |-- 17-Site-Daily-Report-Planning-Integration.md
|   |   |   |-- Baseline.md
|   |   |   |-- files.zip
|   |   |   |-- Master_Prompt_06_Look_Ahead_Planning_DCOS.md.md
|   |   |   |-- Master_Prompt_08_Delay_Analysis_DCOS.md
|   |   |   |-- Master_Prompt_10_Resource_Planning_DCOS.md
|   |   |   |-- Master_Prompt_11_Resource_Leveling_DCOS.md
|   |   |   |-- Master_Prompt_DCOS_CPM_Design.md
|   |   |   `-- MS-Project-Sync-Design.md
|   |   |-- 12-Quantity-Surveying   [41 entries]
|   |   |   |-- Old   [2 entries]
|   |   |   |   |-- 06-QS-Cost-Control-System-Guide.md
|   |   |   |   `-- DCOS-QS-GDL-001_GFA_Cost_per_m2_Guideline.docx
|   |   |   |-- 00-DCOS Design Specification.md
|   |   |   |-- 01-Business-Requirement.md
|   |   |   |-- 02-Budget-Code-Design.md
|   |   |   |-- 03-BOQ-Design.md
|   |   |   |-- 04-GFA-Site-Area-Cost-per-m2-Design.md
|   |   |   |-- 05-Prelim-Cost-Library-Design.md
|   |   |   |-- 07-SOP_Direct_Works_Cost_Library_Module.md
|   |   |   |-- 08-SOP_Direct_Works_Library_Tender_BOQ_Integration.md
|   |   |   |-- 09-Session-Status-DWL-BOQ-Integration.md
|   |   |   |-- 10-QS-Element-Library-Design.md
|   |   |   |-- 11-QTO-API-Spec.md
|   |   |   |-- 11-QTO-Database-Schema.md
|   |   |   |-- 11-QTO-Module-Design.md
|   |   |   |-- 12-Material-Specification-Price-Recording-Design.md
|   |   |   |-- 13-SOP_Material_Specification_Price_Recording.md
|   |   |   |-- 14-AI-Prompt_Material_Spec_Row_Generator.md
|   |   |   |-- 15-Global-Cost-Database-Architecture.md
|   |   |   |-- Budget Code.xlsx
|   |   |   |-- Budget_Code_Updated - Copy.xlsx
|   |   |   |-- Budget_Code_Updated.xlsx
|   |   |   |-- CAMBODIA_CONSTRUCTION_MARKET_RATES_2025_2026.md
|   |   |   |-- DCOS — Tender QTO Module.md
|   |   |   |-- DCOS-QS-GDL-001_V1.1_GFA_Cost_per_m2_Guideline.docx
|   |   |   |-- Description_Library.md
|   |   |   |-- files.zip
|   |   |   |-- Price List Libraries.xlsx
|   |   |   |-- QS_Element_Library (1).xlsx
|   |   |   |-- QS_Element_Library (3).xlsx
|   |   |   |-- QS_Element_Library (4).xlsx
|   |   |   |-- QS_Element_Library (5).xlsx
|   |   |   |-- QS_Element_Library (6).xlsx
|   |   |   |-- QS_Element_Library.xlsx
|   |   |   |-- QS_Module_Training_Summary.pptx
|   |   |   |-- Quantity Surveying.md
|   |   |   |-- seed_price_list_ARC_cambodia.sql
|   |   |   |-- seed_price_list_MEP_cambodia.sql
|   |   |   |-- seed_price_list_STR_cambodia.sql
|   |   |   |-- SOP-QS-001_R3_Quantity_Surveying_Module.docx
|   |   |   |-- SOP-QS-001_R3_Quantity_Surveying_Module.md
|   |   |   `-- SOP-QSP-001_R1_CostControl_Procurement_Integration.docx
|   |   |-- 21-IPC-Progress-Claim   [13 entries]
|   |   |   |-- Attachments   [1 entries]
|   |   |   |   `-- IPC-worked-example.md
|   |   |   |-- 01-Business-Requirement.md
|   |   |   |-- 02-Functional-Specification.md
|   |   |   |-- 03-Workflow-Diagram.md
|   |   |   |-- 04-Database-Schema.md
|   |   |   |-- 05-API-Specification.md
|   |   |   |-- 06-UI-UX-Design.md
|   |   |   |-- 07-Permission-Matrix.md
|   |   |   |-- 08-Notification-Matrix.md
|   |   |   |-- 09-Audit-Requirements.md
|   |   |   |-- 10-Reports-KPI.md
|   |   |   |-- 11-Test-Cases.md
|   |   |   `-- 12-SOP.md
|   |   |-- 26-INV-Inventory   [12 entries]
|   |   |   |-- 01-Business-Requirement.md
|   |   |   |-- 02-Functional-Specification.md
|   |   |   |-- 03-Workflow.md
|   |   |   |-- 04-Database-Schema.md
|   |   |   |-- 05-API-Specification.md
|   |   |   |-- 06-UI-UX-Design.md
|   |   |   |-- 07-Permission-Matrix.md
|   |   |   |-- 08-Notification-Matrix.md
|   |   |   |-- 09-Audit-Requirements.md
|   |   |   |-- 10-Reports-KPI.md
|   |   |   |-- 11-UAT-Test-Cases.md
|   |   |   `-- 12-SOP.md
|   |   |-- 31-cwims   [6 entries]
|   |   |   |-- cwims.md
|   |   |   |-- CWIMS_Enterprise_Documentation_Package.docx
|   |   |   |-- Item_Master_Mapping.md
|   |   |   |-- Material List.xlsx
|   |   |   |-- Material_List.md
|   |   |   `-- README.md
|   |   |-- 32-Naming convention   [2 entries]
|   |   |   |-- DCOS_Naming_Convention_R1.html
|   |   |   `-- DCOS_Naming_Convention_Standard_R1.docx
|   |   `-- PLAN-task-dashboards-and-cross-department.md
|   |-- 05-MDM   [7 entries]
|   |   |-- DCOS-MDM-CAT-001   [2 entries]
|   |   |   |-- DCOS-MDM-CAT-001.md
|   |   |   `-- DCOS-MDM-CAT-001_DCOS_Master_Data_Catalogue.docx
|   |   |-- DCOS-MDM-COD-001   [2 entries]
|   |   |   |-- DCOS-MDM-COD-001.md
|   |   |   `-- DCOS-MDM-COD-001_DCOS_Master_Data_Coding_Naming_Standard.docx
|   |   |-- DCOS-MDM-DIC-001   [0 entries]
|   |   |-- DCOS-MDM-GOV-001   [0 entries]
|   |   |-- DCOS-MDM-PRO-001   [0 entries]
|   |   |-- DCOS-MDM-STD-001   [2 entries]
|   |   |   |-- DCOS-MDM-STD-001_Enterprise_Master_Data_Standard_R1.0.docx
|   |   |   `-- PROMPT — BUILD DCOS-MDM-STD-001.md
|   |   `-- Master.md
|   |-- 10-Archive   [64 entries]
|   |   |-- Project Example   [1 entries]
|   |   |   `-- CStage Name.md
|   |   |-- # DCOS Architecture Task Group & Tasks.md
|   |   |-- # DCOS Construction Task Group & Task.md
|   |   |-- # DCOS Master Libraries Design Plan.md
|   |   |-- # DCOS MEP Task Group & Task.md
|   |   |-- # DCOS Procurement Task Group & Task.md
|   |   |-- # DCOS Structure Task Group & Task.md
|   |   |-- # DCOS Task Template Library Design.md
|   |   |-- 20260705_Cobmine_BoQ_Format-INT00.xlsx
|   |   |-- 22-QS-Cost-Control-System-Guide.md
|   |   |-- 50_Module_Build_Progress.md
|   |   |-- 50_Module_Build_Progress_R1.md
|   |   |-- 50_Module_Build_Progress_R2.md
|   |   |-- AI_Agent_System_Archtecture.md
|   |   |-- apply leave form.jpg
|   |   |-- apply leave form.png
|   |   |-- bbbb.png
|   |   |-- Budget_Code_Updated - Copy.xlsx
|   |   |-- Budget_Code_Updated.xlsx
|   |   |-- Cambodia_TOS_Calculation_Guide.md
|   |   |-- card.png
|   |   |-- DCOS_AI_Agent_Setup_Guideline.docx
|   |   |-- DCOS_Gap_Analysis_R1.md
|   |   |-- DCOS_HR_Module_Enterprise_Design_R1.md
|   |   |-- DCOS_HR_Payroll_UI_Screen_Design_R2.md
|   |   |-- DCOS_Naming_Convention_Implementation_Plan.md
|   |   |-- DCOS_Naming_Convention_R1.html
|   |   |-- DCOS_Procurement_Implementation_Plan_R1.md
|   |   |-- DCOS_Procurement_Module_Spec_R1.md
|   |   |-- dcos_project_setup_ui_react.jsx
|   |   |-- DCOS_System_Architecture_Module_Design_R0.md
|   |   |-- dcos_wbs_ui_screen.jsx
|   |   |-- DCOS-Project-Structure.md
|   |   |-- dddd.png
|   |   |-- deepseek_html_20260527_aed5e5.html
|   |   |-- display when user click on task.png
|   |   |-- e-leave.jpg
|   |   |-- gap.png
|   |   |-- hr-attendance-module-plan.md
|   |   |-- landing-page-plan.md
|   |   |-- Leave Balance Dashboard.png
|   |   |-- Leave Type Register.jpg
|   |   |-- leave_approver_config.md
|   |   |-- leave_system_flows-V-3.html
|   |   |-- local-to-production.md
|   |   |-- PLAN_QS_Tender_RBAC.md
|   |   |-- precontract-to-postcontract-flow.md
|   |   |-- Probation.md
|   |   |-- public holiday.jpg
|   |   |-- qs-module-review.md
|   |   |-- Role_Permission_Matrix_R0.md
|   |   |-- sss.png
|   |   |-- staff_list.md
|   |   |-- task.png
|   |   |-- task_management_flow_R1.html
|   |   |-- task_management_improvements_R1.md
|   |   |-- task_module_gap_analysis_R1.md
|   |   |-- TOS_Calculation_Trace_Sophat.md
|   |   |-- ui-standards.md
|   |   |-- wbs tree.png
|   |   |-- wbs update.png
|   |   |-- wbs.png
|   |   |-- xxx.png
|   |   `-- zzz.png
|   |-- 7_Floor_Building_Master_WBS_Complete_Mockup.xlsx
|   |-- Activity_Step_Templates_Architectural_MEP.xlsx
|   |-- DCOS Cost & Rate Library — Master Build Prompt.md
|   |-- DCOS_Bulk_Materials_Export_2026-09-15.csv
|   |-- DCOS_Cost_Rate_Library_Material_Spec_Price_Template.xlsx
|   |-- DCOS_Subcontractor_Rates_2026-09-15.xlsx
|   |-- DCOS_Supplier_Master_2026-09-15.xlsx
|   |-- Document Conent.md
|   |-- Enterprise DCOS Documentation Structure.md
|   |-- env local.md
|   |-- planning-session-continuation.md
|   `-- supabase.txt
|-- scripts   [5 entries]
|   |-- sql   [1 entries]
|   |   `-- diagnostic_inv_items.sql
|   |-- db-backup.ps1
|   |-- db-restore.ps1
|   |-- generate-task-seeds.mjs
|   `-- supabase-guard.ps1
|-- supabase   [8 entries]
|   |-- .branches   [1 entries]
|   |   `-- _current_branch
|   |-- .temp   [10 entries]
|   |   |-- start-secrets   [1 entries]
|   |   |   `-- supabase_edge_runtime_dcos-system   [1 entries]
|   |   |       `-- env   [1 entries]
|   |   |           `-- docker.env
|   |   |-- cli-latest
|   |   |-- gotrue-version
|   |   |-- linked-project.json
|   |   |-- pooler-url
|   |   |-- postgres-version
|   |   |-- project-ref
|   |   |-- rest-version
|   |   |-- storage-migration
|   |   `-- storage-version
|   |-- functions   [5 entries]
|   |   |-- _shared   [1 entries]
|   |   |   `-- qs-embedding.ts
|   |   |-- escalation-check   [1 entries]
|   |   |   `-- index.ts
|   |   |-- notify-task   [1 entries]
|   |   |   `-- index.ts
|   |   |-- qs-library-embed   [1 entries]
|   |   |   `-- index.ts
|   |   `-- qs-library-search   [1 entries]
|   |       `-- index.ts
|   |-- migrations   [470 entries]
|   |   |-- 20260526_0001_create_profiles.sql
|   |   |-- 20260527000001_add_staff_fields.sql
|   |   |-- 20260527000002_create_rbac_tables.sql
|   |   |-- 20260527000003_seed_rbac_data.sql
|   |   |-- 20260527000004_add_status_to_profiles.sql
|   |   |-- 20260527000005_add_department_manager_role.sql
|   |   |-- 20260527000006_create_companies.sql
|   |   |-- 20260527000007_create_stakeholders.sql
|   |   |-- 20260527000008_create_projects.sql
|   |   |-- 20260527000009_create_wbs_nodes.sql
|   |   |-- 20260527000010_create_document_control.sql
|   |   |-- 20260527000011_create_stakeholder_staff.sql
|   |   |-- 20260527000012_create_stakeholder_templates.sql
|   |   |-- 20260527000013_create_project_stakeholder_mappings.sql
|   |   |-- 20260527000014_create_project_team_members.sql
|   |   |-- 20260527000015_extend_project_setup.sql
|   |   |-- 20260527000016_create_wbs_enterprise_tables.sql
|   |   |-- 20260527000017_seed_wbs_templates.sql
|   |   |-- 20260527000018_add_task_timeline_comments.sql
|   |   |-- 20260527000019_add_task_type_category.sql
|   |   |-- 20260527000020_storage_task_attachments.sql
|   |   |-- 20260527000021_add_completed_rejected_status.sql
|   |   |-- 20260527000022_alter_sort_order_to_bigint.sql
|   |   |-- 20260527000023_allow_task_delete_permission.sql
|   |   |-- 20260527000024_create_task_alerts.sql
|   |   |-- 20260527000025_create_naming_convention_tables.sql
|   |   |-- 20260527000026_create_wbs_running_numbers.sql
|   |   |-- 20260527000027_create_document_running_numbers.sql
|   |   |-- 20260527000028_create_budget_running_numbers.sql
|   |   |-- 20260527000029_create_transmittal_tables.sql
|   |   |-- 20260527000030_create_hr_organization_tables.sql
|   |   |-- 20260527000031_extend_profiles_for_hr.sql
|   |   |-- 20260527000032_create_employee_assignments.sql
|   |   |-- 20260527000033_create_employee_documents_certifications.sql
|   |   |-- 20260527000034_seed_hr_organization_data.sql
|   |   |-- 20260527000035_create_attendance_tables.sql
|   |   |-- 20260527000036_create_leave_tables.sql
|   |   |-- 20260527000037_create_timesheet_tables.sql
|   |   |-- 20260527000038_create_performance_tables.sql
|   |   |-- 20260527000039_create_level_naming_templates.sql
|   |   |-- 20260529000039_create_training_tables.sql
|   |   |-- 20260529000040_create_competency_tables.sql
|   |   |-- 20260529000041_create_recruitment_tables.sql
|   |   |-- 20260529000042_create_asset_management_tables.sql
|   |   |-- 20260529000043_extend_leave_schema.sql
|   |   |-- 20260529000044_add_color_cancel_window_to_leave_types.sql
|   |   |-- 20260529000045_add_level_naming_template_to_projects.sql
|   |   |-- 20260529000046_create_public_holidays_table.sql
|   |   |-- 20260529000047_add_note_to_public_holidays.sql
|   |   |-- 20260529000048_assign_hr_manager_role.sql
|   |   |-- 20260529000049_update_leave_approver_config_admin_policy.sql
|   |   |-- 20260529000050_update_level_template_config_format.sql
|   |   |-- 20260530000001_add_leave_types_admin_rls_policies.sql
|   |   |-- 20260530000002_add_gender_to_profiles_and_leave_restrictions.sql
|   |   |-- 20260530000003_extend_profiles_employee_master.sql
|   |   |-- 20260530000004_set_maternity_paternity_leave_rules.sql
|   |   |-- 20260530000005_allow_all_staff_view_leave_requests.sql
|   |   |-- 20260530000006_add_baseline_fields_to_wbs_tasks.sql
|   |   |-- 20260530000008_add_lag_days_to_wbs_tasks.sql
|   |   |-- 20260531000001_create_insight_rpcs.sql
|   |   |-- 20260531000002_add_delay_reason_to_tasks.sql
|   |   |-- 20260531000003_create_progress_snapshots.sql
|   |   |-- 20260531000004_create_schedule_rpcs.sql
|   |   |-- 20260531000005_create_procurement_tables.sql
|   |   |-- 20260531000006_create_rfq_tables.sql
|   |   |-- 20260531000007_create_invoice_matching_tables.sql
|   |   |-- 20260531000008_create_weekly_plans.sql
|   |   |-- 20260531000009_create_snapshot_rpc.sql
|   |   |-- 20260531000010_create_qaqc_tables.sql
|   |   |-- 20260531000011_create_ncr_tables.sql
|   |   |-- 20260531000012_create_procurement_notifications.sql
|   |   |-- 20260531000013_create_procurement_audit_log.sql
|   |   |-- 20260531000014_create_procurement_inventory.sql
|   |   |-- 20260531000015_seed_procurement_permissions.sql
|   |   |-- 20260531000016_create_procurement_storage.sql
|   |   |-- 20260531000022_create_qs_cost_library.sql
|   |   |-- 20260531000023_create_qs_boq_tables.sql
|   |   |-- 20260531000024_create_qs_cost_transactions.sql
|   |   |-- 20260531000025_drop_redundant_boq_tables.sql
|   |   |-- 20260531000026_extend_qs_boq_ui_fields.sql
|   |   |-- 20260531000027_account_chart_of_accounts.sql
|   |   |-- 20260531000028_account_ap_invoices.sql
|   |   |-- 20260531000029_account_ar_invoices.sql
|   |   |-- 20260531000030_account_payment_vouchers.sql
|   |   |-- 20260531000031_account_financial_periods.sql
|   |   |-- 20260531000032_create_qs_variation_orders.sql
|   |   |-- 20260531000033_create_qs_progress_claims.sql
|   |   |-- 20260531000034_create_qs_retention_ledger.sql
|   |   |-- 20260531000035_account_journal_entries.sql
|   |   |-- 20260531000036_account_bank_accounts.sql
|   |   |-- 20260531000037_account_payment_runs.sql
|   |   |-- 20260531000038_account_withholding_tax.sql
|   |   |-- 20260531000039_account_reporting_views.sql
|   |   |-- 20260531000040_design_shared.sql
|   |   |-- 20260531000041_design_architecture.sql
|   |   |-- 20260531000042_design_structure.sql
|   |   |-- 20260531000043_design_mep.sql
|   |   |-- 20260531000044_site_execution.sql
|   |   |-- 20260531000045_planning_scheduling.sql
|   |   |-- 20260531000046_hse.sql
|   |   |-- 20260531000047_document_control_enhancements.sql
|   |   |-- 20260531000048_qs_core_depth.sql
|   |   |-- 20260531000049_subcontractor_management.sql
|   |   |-- 20260531000050_multi_currency_fx.sql
|   |   |-- 20260531000051_contract_administration.sql
|   |   |-- 20260531000052_drawing_markup_redline.sql
|   |   |-- 20260531000053_mobile_field_app.sql
|   |   |-- 20260531000054_tender_management.sql
|   |   |-- 20260531000055_tender_cost_estimation.sql
|   |   |-- 20260531000056_bid_submission_award.sql
|   |   |-- 20260531000057_supplier_prequalification.sql
|   |   |-- 20260531000058_dashboard_reports.sql
|   |   |-- 20260601000050_create_payroll_tables.sql
|   |   |-- 20260601000051_fix_payroll_rls_policies.sql
|   |   |-- 20260602000052_extend_employee_payroll_profiles.sql
|   |   |-- 20260602000053_create_tax_nssf_configuration_tables.sql
|   |   |-- 20260602000054_extend_payroll_workflow.sql
|   |   |-- 20260602000055_create_payroll_cost_allocation.sql
|   |   |-- 20260602000056_add_tolerance_to_tos_brackets.sql
|   |   |-- 20260602000057_enable_rls_core_tables.sql
|   |   |-- 20260602000058_fix_tos_rls_policies.sql
|   |   |-- 20260602000059_fix_employee_payroll_profile_rls.sql
|   |   |-- 20260602000060_seed_employee_hr_payroll_profiles.sql
|   |   |-- 20260602000061_seed_employee_salary_structures.sql
|   |   |-- 20260603000001_add_document_types_rls_policies.sql
|   |   |-- 20260604000001_create_wbs_progress_rollup.sql
|   |   |-- 20260604000002_fix_wbs_progress_rollup_formula.sql
|   |   |-- 20260604000003_fix_wbs_rollup_child_subquery.sql
|   |   |-- 20260604000004_fix_wbs_rollup_project_progress.sql
|   |   |-- 20260606000001_update_user_management.sql
|   |   |-- 20260606000002_user_management_gaps.sql
|   |   |-- 20260607000001_stakeholder_sop_compliance.sql
|   |   |-- 20260607000002_wbs_add_phase.sql
|   |   |-- 20260607000003_project_registration_gaps.sql
|   |   |-- 20260608000001_task_status_fix.sql
|   |   |-- 20260608000002_task_assignee_id.sql
|   |   |-- 20260608000003_update_alert_trigger.sql
|   |   |-- 20260608000004_task_recurrences.sql
|   |   |-- 20260608000005_task_escalations.sql
|   |   |-- 20260608000006_notification_preferences.sql
|   |   |-- 20260609000001_fix_cpm_multi_predecessor.sql
|   |   |-- 20260609000002_delay_register.sql
|   |   |-- 20260609000070_create_shift_schedule_tables.sql
|   |   |-- 20260609000071_add_selfie_to_attendance_logs.sql
|   |   |-- 20260609000072_attendance_storage_and_manual_method.sql
|   |   |-- 20260609000073_employee_attendance_site_assignments.sql
|   |   |-- 20260610000001_schedule_levels.sql
|   |   |-- 20260610000002_add_leave_payroll_reversal_flag.sql
|   |   |-- 20260610000003_add_leave_withdraw_cancel_rls_policies.sql
|   |   |-- 20260610000004_update_leave_seniority_rules_admin_policy.sql
|   |   |-- 20260611000001_task_constraints.sql
|   |   |-- 20260611000002_add_ot_clock_actions.sql
|   |   |-- 20260611000003_add_employee_id_auto_generation.sql
|   |   |-- 20260611000004_backfill_employee_id.sql
|   |   |-- 20260611000005_fix_vuthy_employee_id.sql
|   |   |-- 20260611000006_regenerate_employee_id_4digit.sql
|   |   |-- 20260611000007_delete_staff_0036_0037.sql
|   |   |-- 20260611000008_add_work_location_to_profiles.sql
|   |   |-- 20260612000001_qs_rbac_and_vo_approvals.sql
|   |   |-- 20260612000002_qs_contingency_drawdowns.sql
|   |   |-- 20260612000003_qs_cost_baseline_distribution.sql
|   |   |-- 20260612000004_qs_audit_log.sql
|   |   |-- 20260613000001_qs_multi_currency.sql
|   |   |-- 20260614000001_create_qs_boq_header.sql
|   |   |-- 20260615000001_qs_data_integrity.sql
|   |   |-- 20260616000001_add_probation_fields_to_profiles.sql
|   |   |-- 20260616000002_seed_remaining_employee_profiles.sql
|   |   |-- 20260617000001_create_overtime_tables.sql
|   |   |-- 20260617000002_seed_overtime_defaults.sql
|   |   |-- 20260617000003_fix_overtime_status_constraint.sql
|   |   |-- 20260617000004_add_ot_cost_allocation.sql
|   |   |-- 20260617000005_add_employment_policy.sql
|   |   |-- 20260617000006_ot_notifications_revision.sql
|   |   |-- 20260617000007_ot_level_config_planned_levels.sql
|   |   |-- 20260618000001_employee_master_r21_foundation.sql
|   |   |-- 20260618000002_seed_hr_permissions.sql
|   |   |-- 20260618000003_seed_hr_tab_permissions.sql
|   |   |-- 20260618000004_payroll_enhancements.sql
|   |   |-- 20260619000001_seed_salary_structures.sql
|   |   |-- 20260619000002_timesheet_workflow.sql
|   |   |-- 20260620000001_wbs_template_nodes.sql
|   |   |-- 20260620000002_fix_template_node_codes.sql
|   |   |-- 20260621000001_create_inv_module_tables.sql
|   |   |-- 20260621000002_seed_inv_permissions.sql
|   |   |-- 20260622000001_create_inv_audit_log.sql
|   |   |-- 20260623000001_add_company_id_to_profiles_jwt_hook.sql
|   |   |-- 20260624000001_master_libraries.sql
|   |   |-- 20260624000002_master_libraries_multi_template_generation.sql
|   |   |-- 20260624000003_master_libraries_item_generation.sql
|   |   |-- 20260624000004_master_libraries_generation_limits.sql
|   |   |-- 20260624000005_master_libraries_append_generation.sql
|   |   |-- 20260624000006_location_node_support.sql
|   |   |-- 20260624000007_target_node_generation.sql
|   |   |-- 20260624000008_drop_old_generate_overloads.sql
|   |   |-- 20260624000009_normalize_existing_wbs_own_codes.sql
|   |   |-- 20260624000010_force_master_library_own_codes.sql
|   |   |-- 20260624000011_fix_wbs_code_own_codes.sql
|   |   |-- 20260624000012_force_master_library_own_codes_dynamic_temp.sql
|   |   |-- 20260624000013_force_master_library_own_codes_no_temp.sql
|   |   |-- 20260624000014_force_master_library_own_codes_lint_clean.sql
|   |   |-- 20260624000015_task_template_master.sql
|   |   |-- 20260624000016_generate_library_tasks.sql
|   |   |-- 20260624000017_generate_library_tasks_lint_clean.sql
|   |   |-- 20260624000018_generate_tasks_on_selected_target.sql
|   |   |-- 20260624000019_stage_master.sql
|   |   |-- 20260624000020_generate_tasks_with_stage_master.sql
|   |   |-- 20260624000021_task_group_master_extended.sql
|   |   |-- 20260624000022_task_template_master_extended.sql
|   |   |-- 20260624000023_regenerate_employee_id_5digit.sql
|   |   |-- 20260710000001_assign_department_from_job_title.sql
|   |   |-- 20260711000001_fix_qs_audit_trigger_column_count.sql
|   |   |-- 20260711000002_add_company_id_to_profiles.sql
|   |   |-- 20260711000003_budget_codes.sql
|   |   |-- 20260711000004_budget_codes_seed.sql
|   |   |-- 20260711000005_tender_price_list.sql
|   |   |-- 20260711000006_tender_boq_items_qs_extension.sql
|   |   |-- 20260711000007_tender_preliminaries_items.sql
|   |   |-- 20260711000008_tender_bid_summaries_cover_fields.sql
|   |   |-- 20260711000009_tender_bid_summaries_oh_profit_base_fix.sql
|   |   |-- 20260711000010_tender_module_delete_policies.sql
|   |   |-- 20260712000001_project_precontract_details.sql
|   |   |-- 20260716000002_tender_client_contractor_columns.sql
|   |   |-- 20260717000001_create_bim_tables.sql
|   |   |-- 20260717000002_create_bim_storage_bucket.sql
|   |   |-- 20260717000003_recreate_tender_price_list.sql
|   |   |-- 20260717000004_create_bim_element_takeoff.sql
|   |   |-- 20260717000005_create_rate_libraries.sql
|   |   |-- 20260717000006_seed_rate_libraries.sql
|   |   |-- 20260717000007_prelim_cost_library.sql
|   |   |-- 20260717000008_reload_schema_cache.sql
|   |   |-- 20260718000001_gfa_site_area_wbs_projects_columns.sql
|   |   |-- 20260718000002_create_wbs_node_quantities.sql
|   |   |-- 20260718000003_qs_boq_elemental_category.sql
|   |   |-- 20260718000004_seed_qs_cost_per_m2_rbac.sql
|   |   |-- 20260718000005_tender_gfa_cost_per_m2.sql
|   |   |-- 20260718000006_prelim_library_cases.sql
|   |   |-- 20260718000007_project_source_tender_link.sql
|   |   |-- 20260718000008_prelim_library_seed.sql
|   |   |-- 20260718000010_fix_wbs_node_quantities_missing_columns.sql
|   |   |-- 20260718000011_wbs_node_quantities_project_id.sql
|   |   |-- 20260718000012_wbs_node_quantities_source_ref.sql
|   |   |-- 20260719000001_seed_tender_rbac.sql
|   |   |-- 20260719000002_seed_qs_libraries_rbac.sql
|   |   |-- 20260719000003_reload_schema_cache_wbs_node_quantities.sql
|   |   |-- 20260719000004_prelim_library_admin_only.sql
|   |   |-- 20260720000001_create_module_settings.sql
|   |   |-- 20260720000002_reconcile_rate_library_schema_drift.sql
|   |   |-- 20260720000003_dwl_phase1_resources.sql
|   |   |-- 20260720000004_dwl_seed_starter_catalogue.sql
|   |   |-- 20260720000005_dwl_v_current_prices_security_invoker.sql
|   |   |-- 20260720000006_dwl_phase2_work_items.sql
|   |   |-- 20260720000007_dwl_seed_work_item_03_02_010.sql
|   |   |-- 20260720000008_dwl_phase3_assemblies.sql
|   |   |-- 20260720000009_dwl_phase4_parametric_models.sql
|   |   |-- 20260720000010_dwl_phase5_snapshots.sql
|   |   |-- 20260720000011_dwl_phase6_migrate_unit_rate_library.sql
|   |   |-- 20260720000012_dwl_phase6_migrate_rate_libraries.sql
|   |   |-- 20260720000013_dwl_phase6_migrate_qs_cost_items.sql
|   |   |-- 20260720000014_dwl_phase6_migrate_company_rate_library.sql
|   |   |-- 20260720000015_dwl_phase6_migrate_tender_unit_rates.sql
|   |   |-- 20260720000016_dwl_phase6_shadow_columns.sql
|   |   |-- 20260720000017_fix_dwl_tenant_isolation.sql
|   |   |-- 20260721000001_repoint_tender_boq_items_unit_rate_id.sql
|   |   |-- 20260721000002_dwl_phase6_freeze_legacy_tables.sql
|   |   |-- 20260722000002_tender_boq_dwl_assembly_link.sql
|   |   |-- 20260722000003_tender_exclude_items.sql
|   |   |-- 20260722000004_cleanup_preliminaries.sql
|   |   |-- 20260722000005_restore_tender_boq_items_rate_source_drift.sql
|   |   |-- 20260722000006_qs_audit_tender_boq_items.sql
|   |   |-- 20260722000007_dwl_phase6_freeze_qs_cost_items.sql
|   |   |-- 20260722000008_fix_dwl_resources_delete.sql
|   |   |-- 20260722000009_qs_element_library.sql
|   |   |-- 20260722000010_qs_element_library_seed.sql
|   |   |-- 20260722000011_qs_description_library.sql
|   |   |-- 20260722000012_qs_description_library_seed.sql
|   |   |-- 20260723000001_add_category_to_description_library.sql
|   |   |-- 20260723000002_qs_description_library_fill_costs.sql
|   |   |-- 20260723000003_tender_register_default_margins.sql
|   |   |-- 20260724000001_qs_description_library_material_labor_rates.sql
|   |   |-- 20260724000002_qs_reseed_price_list_libraries.sql
|   |   |-- 20260724000003_create_nav_item_settings.sql
|   |   |-- 20260724000004_seed_nav_item_settings.sql
|   |   |-- 20260724000005_reorder_procurement_pr_rfq.sql
|   |   |-- 20260725000001_qs_contract_snapshots.sql
|   |   |-- 20260725000002_qs_risk_items.sql
|   |   |-- 20260725000003_qs_price_list_items.sql
|   |   |-- 20260725000004_reload_schema_cache.sql
|   |   |-- 20260725000005_add_boq_pr_link.sql
|   |   |-- 20260725000006_enhance_boq_view_with_boq_number.sql
|   |   |-- 20260725000007_seed_nav_suppliers_group.sql
|   |   |-- 20260725000008_seed_nav_procurement_groups.sql
|   |   |-- 20260725000009_seed_nav_procurement_groups_2.sql
|   |   |-- 20260725000010_seed_nav_overview_group.sql
|   |   |-- 20260725000011_reorder_nav_procurement_groups.sql
|   |   |-- 20260725000012_seed_supplier_performance_data.sql
|   |   |-- 20260727000001_extend_inv_items_stores.sql
|   |   |-- 20260727000002_create_inv_locations.sql
|   |   |-- 20260727000003_create_inv_returns.sql
|   |   |-- 20260727000004_create_inv_tools.sql
|   |   |-- 20260727000005_create_inv_notifications.sql
|   |   |-- 20260727000006_add_severity_to_inv_audit_log.sql
|   |   |-- 20260727000007_register_inventory_module.sql
|   |   |-- 20260727000008_seed_inv_tools_permissions.sql
|   |   |-- 20260727000009_drop_procurement_inventory.sql
|   |   |-- 20260727000010_seed_inv_items_material_list.sql
|   |   |-- 20260728000001_qs_progress_claims_ar_invoice_link.sql
|   |   |-- 20260728000002_ipc_contract_terms_and_advance_recovery.sql
|   |   |-- 20260728000003_qs_claim_approval_chain.sql
|   |   |-- 20260728000004_qs_claim_submission_document.sql
|   |   |-- 20260728000005_qs_claim_certification_variance.sql
|   |   |-- 20260728000006_qs_claim_notifications.sql
|   |   |-- 20260728000007_landing_public_stats.sql
|   |   |-- 20260729000001_add_pr_field_enhancements.sql
|   |   |-- 20260729000002_add_ordered_delivered_to_boq_view.sql
|   |   |-- 20260729000003_add_over_requisition_guard.sql
|   |   |-- 20260729000004_add_po_boq_reference.sql
|   |   |-- 20260729000005_create_budget_confirmations.sql
|   |   |-- 20260729000006_add_budget_code_to_boq_requisition_view.sql
|   |   |-- 20260729000007_simplify_budget_confirmation_items.sql
|   |   |-- 20260729000008_backfill_pr_total_estimated_cost.sql
|   |   |-- 20260729000009_po_form_enhancements.sql
|   |   |-- 20260729000010_create_po_revisions.sql
|   |   |-- 20260730000001_fix_module_settings_rls.sql
|   |   |-- 20260805000001_create_qto_tables.sql
|   |   |-- 20260805000002_seed_qto_rbac.sql
|   |   |-- 20260805000003_seed_qto_data.sql
|   |   |-- 20260805000004_create_qto_storage.sql
|   |   |-- 20260806000001_fix_stale_wbs_full_path.sql
|   |   |-- 20260806000002_create_msp_sync_tables.sql
|   |   |-- 20260815000001_relocate_stakeholders_nav_to_project.sql
|   |   |-- 20260817000001_add_leave_type_rounding_expiry.sql
|   |   |-- 20260817000002_add_payroll_notifications_update_policy.sql
|   |   |-- 20260817000003_allow_payroll_entries_status_sync.sql
|   |   |-- 20260817000004_fix_payroll_settings_rls.sql
|   |   |-- 20260817000005_add_payroll_periods_read_policy.sql
|   |   |-- 20260817000006_telegram_attendance_checkin.sql
|   |   |-- 20260817000007_telegram_leave_commands.sql
|   |   |-- 20260824000001_normalize_profile_department.sql
|   |   |-- 20260824000002_task_department_scoping.sql
|   |   |-- 20260824000003_cross_department_task_fields.sql
|   |   |-- 20260824000004_team_weekly_planning.sql
|   |   |-- 20260824000005_seed_task_dept_permissions.sql
|   |   |-- 20260824035735_usr_account_status_column.sql
|   |   |-- 20260824035808_usr_rbac_helper_functions.sql
|   |   |-- 20260824035840_usr_tighten_core_rls.sql
|   |   |-- 20260824035908_usr_profiles_protected_columns_trigger.sql
|   |   |-- 20260824040047_usr_fix_protected_columns_trigger_service_context.sql
|   |   |-- 20260824040105_usr_departments_fk.sql
|   |   |-- 20260824040148_usr_auto_disable_inactive_cron.sql
|   |   |-- 20260824040214_usr_audit_event_type_vocabulary.sql
|   |   |-- 20260824040430_usr_lock_down_function_execute_grants.sql
|   |   |-- 20260824041139_usr_revoke_is_admin_is_hr_anon_execute.sql
|   |   |-- 20260824041308_usr_optimize_rls_policy_initplan.sql
|   |   |-- 20260824050000_usr_revoke_user_sessions_function.sql
|   |   |-- 20260825000001_seed_department_organization.sql
|   |   |-- 20260902000001_project_sector_building_type.sql
|   |   |-- 20260902000002_prelim_library_early_works.sql
|   |   |-- 20260902000003_wbs_tasks_activity_detail_fields.sql
|   |   |-- 20260902000004_fix_wbs_progress_flush_missing_temp_table.sql
|   |   |-- 20260902000005_project_data_date.sql
|   |   |-- 20260903000001_schedule_engine_support.sql
|   |   |-- 20260904000001_wbs_lock_backbone.sql
|   |   |-- 20260904000002_wbs_tasks_lock_guard.sql
|   |   |-- 20260904000003_planning_project_tools.sql
|   |   |-- 20260904000004_plan_timescale.sql
|   |   |-- 20260905000001_create_user_ui_preferences.sql
|   |   |-- 20260905000002_fix_wbs_progress_status_exclusion_and_reparent_trigger.sql
|   |   |-- 20260905000003_add_baseline_cost_variance.sql
|   |   |-- 20260905000004_create_plan_resources.sql
|   |   |-- 20260905000005_plan_resources_profile_link.sql
|   |   |-- 20260905100449_plan_schedule_streams.sql
|   |   |-- 20260907000001_master_wbs_import.sql
|   |   |-- 20260908000001_scurve_series.sql
|   |   |-- 20260910000001_dwl_material_attributes.sql
|   |   |-- 20260910000002_dwl_material_specs.sql
|   |   |-- 20260910000003_dwl_supplier_profiles_and_materials.sql
|   |   |-- 20260910000004_dwl_resource_prices_effective_cost.sql
|   |   |-- 20260910000005_dwl_price_submissions.sql
|   |   |-- 20260910000006_dwl_quotations.sql
|   |   |-- 20260910000010_dwl_seed_ceiling_materials.sql
|   |   |-- 20260910000011_dwl_seed_ceiling_specs_suppliers.sql
|   |   |-- 20260910000012_dwl_seed_ceiling_quotations_prices.sql
|   |   |-- 20260910000020_dwl_recipe_views_effective_cost.sql
|   |   |-- 20260910000021_dwl_material_categories.sql
|   |   |-- 20260910000022_dwl_material_attributes_category_fields.sql
|   |   |-- 20260910000023_dwl_material_photos.sql
|   |   |-- 20260910000024_dwl_material_photos_storage.sql
|   |   |-- 20260910000025_dwl_v_materials_category_budget_photos.sql
|   |   |-- 20260910000026_dwl_material_categories_expand.sql
|   |   |-- 20260910000027_dwl_material_categories_seed_more.sql
|   |   |-- 20260910000028_dwl_backfill_migrated_material_attributes.sql
|   |   |-- 20260910000029_dwl_bulk_materials_csv_import.sql
|   |   |-- 20260910000030_dwl_material_code_standardize.sql
|   |   |-- 20260910000031_dwl_material_category_costcode_backfill.sql
|   |   |-- 20260910000032_dwl_supplier_master_view.sql
|   |   |-- 20260910000033_dwl_bulk_suppliers_xlsx_import.sql
|   |   |-- 20260910000034_dwl_subcon_rates_schema.sql
|   |   |-- 20260910000035_dwl_bulk_subcon_rates_xlsx_import.sql
|   |   |-- 20260910000036_dwl_cost_item_library_schema.sql
|   |   |-- 20260910000037_dwl_seed_cost_item_ceiling_example.sql
|   |   |-- 20260910000038_dwl_v_suppliers_add_vendor_kind.sql
|   |   |-- 20260910000039_dwl_assembly_general_info_fields.sql
|   |   |-- 20260910000040_dwl_assembly_crew_equipment_descriptions.sql
|   |   |-- 20260910000041_dwl_assembly_layer_materials_specs.sql
|   |   |-- 20260910000042_dwl_assembly_layer_materials_screws_clips.sql
|   |   |-- 20260910000043_dwl_cost_item_create_form_fields.sql
|   |   |-- 20260910000044_dwl_assembly_costing_tuned_overrides.sql
|   |   |-- 20260910000045_dwl_labor_rates_schema.sql
|   |   |-- 20260917000001_companies_date_format.sql
|   |   |-- 20260917000002_plan_schedule_settings.sql
|   |   |-- 20260917000003_plan_schedule_settings_progress_line.sql
|   |   |-- 20260917000004_plan_schedule_settings_bar_style.sql
|   |   |-- 20260918000001_activity_step_templates.sql
|   |   |-- 20260918000002_activity_step_template_fields.sql
|   |   |-- 20260918000003_activity_step_template_seed_data.sql
|   |   |-- 20260919000001_project_members_and_permission_helpers.sql
|   |   |-- 20260919000002_planning_audit_index.sql
|   |   |-- 20260919000003_advance_data_date.sql
|   |   |-- 20260919000004_baseline_governance.sql
|   |   |-- 20260919000005_schedule_alert_types_and_state.sql
|   |   |-- 20260919000006_weekly_plan_close_and_constraint_source.sql
|   |   |-- 20260919000007_planning_role_permissions_seed.sql
|   |   |-- 20260919000008_planning_rls_v2.sql
|   |   |-- 20260919000009_progress_review.sql
|   |   |-- 20260919000010_revision_approval_workflow.sql
|   |   |-- 20260919000011_delay_governance.sql
|   |   |-- 20260919000012_eot_notice_from_delay.sql
|   |   |-- 20260919000013_ipc_planning_progress.sql
|   |   |-- 20260919000014_monthly_report_jobs.sql
|   |   |-- 20260919000015_project_members_rls.sql
|   |   |-- 20260919000016_programme_transmittal.sql
|   |   |-- 20260919000017_client_programme_view.sql
|   |   |-- 20260919000018_tia_scenarios.sql
|   |   |-- 20260919000019_procurement_constraint_feed.sql
|   |   |-- 20260919000020_document_rfi_inspection_feed.sql
|   |   |-- 20260919000021_levelling_runs.sql
|   |   |-- 20260922000001_plan_calendars_hours_per_day.sql
|   |   |-- 20260922000002_get_resource_loading.sql
|   |   |-- 20260922000003_site_manpower_wbs_link.sql
|   |   |-- 20260922000004_planning_productivity_permissions_seed.sql
|   |   |-- 20260922000005_productivity_norms.sql
|   |   |-- 20260922000006_plan_task_work.sql
|   |   |-- 20260922000007_plan_task_work_boq_link.sql
|   |   |-- 20260922000008_plan_resource_generation.sql
|   |   |-- 20260922000009_plan_resource_trade_dashboard.sql
|   |   |-- 20260922000010_plan_task_cost.sql
|   |   |-- 20260922000011_plan_productivity_logs.sql
|   |   |-- 20260922000012_plan_calibrated_norm_and_timesheet_bridge.sql
|   |   |-- 20260923000001_module_settings_realtime.sql
|   |   |-- 20260923000002_project_location_coordinates.sql
|   |   |-- 20260923000003_weekly_plans_project_status_index.sql
|   |   |-- 20260923000004_apply_levelling_constraints.sql
|   |   |-- 20260923000005_create_bim_element_boq_promotions.sql
|   |   |-- 20260925000001_capture_prod_drift_tables.sql
|   |   |-- 20260925000002_qs_library_search.sql
|   |   |-- 20260925000003_budget_code_external_refs.sql
|   |   |-- 20260925000004_tender_ai_boq_drafts.sql
|   |   |-- 20260925000005_tender_bid_preparation.sql
|   |   |-- 20260928000001_tender_lifecycle.sql
|   |   |-- 20260928000002_tender_gates.sql
|   |   |-- 20260928000003_tender_workstream_registers.sql
|   |   |-- 20260928000004_tender_award_carryover_access.sql
|   |   |-- 20260928000005_daily_report_planning_integration.sql
|   |   |-- 20260928000006_construction_phase_a_remediation.sql
|   |   |-- 20260928000007_construction_phase_b_manpower_plant.sql
|   |   |-- 20260928000008_construction_phase_c_holdpoints_backcharges.sql
|   |   |-- 20260928000009_tender_cost_database.sql
|   |   |-- 20260928000010_dwl_rate_placeholder_cleanup.sql
|   |   |-- 20260928000011_dwl_equipment_rates_labor_all_in.sql
|   |   `-- 20260928000012_document_control_phase1_real_construction.sql
|   |-- proposed   [2 entries]
|   |   |-- 20260921000001_drop_unused_empty_tables.sql
|   |   `-- migration_history_repair.md
|   |-- seeds   [9 entries]
|   |   |-- prj_2026_004_pc_custom_quantities_norms.sql
|   |   |-- seed_contract_admin.sql
|   |   |-- seed_cost_item_library_finishes.sql
|   |   |-- seed_demo_users.sql
|   |   |-- seed_hattha_bank_tower_schedule.sql
|   |   |-- seed_material_master_estimated_prices.sql
|   |   |-- seed_prj_2026_004_pc_resources.sql
|   |   |-- seed_supplier_prequalification.sql
|   |   `-- staff_list-seed.sql
|   |-- snippets   [0 entries]
|   `-- config.toml
|-- .dockerignore
|-- .gitignore
|-- docker-compose.yml
|-- Dockerfile
|-- package.json
|-- package-lock.json
|-- pnpm-lock.yaml
|-- pnpm-workspace.yaml
`-- vercel.json


```

---

_Generated by automated tree walk of the working tree. Regenerate after structural changes._
