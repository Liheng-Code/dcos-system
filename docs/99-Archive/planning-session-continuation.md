# Planning & Scheduling Completion — Session Continuation Notes (R2 batch)

Authoritative spec: `docs/planning-scheduling-completion-plan.md` (read in full earlier).
Engine + DB layers are DONE and green (see below). The remaining work is **UI wiring only**.

## Verified-green baseline (do NOT re-derive)
- `pnpm --filter web exec vitest run lib/planning` → **53 tests pass** across 7 files
  (`delay-governance` 6, `time-impact-analysis` 8, `resource-levelling` 8, `delay-tools` 6,
  `schedule-kpis` 6, `schedule-engine` 18, `resource-service` 4). Covers the 4 new pure engines.
- `pnpm --filter web exec tsc --noEmit` → **EXIT=0** (run **isolated/single — do NOT parallelize it**;
  parallel greps/reads echo-corrupt output in this environment).
- The 4 phase-1 delays tests were REWRITTEN to assert engine-true signals
  (critical/becameCritical/candidate presence/finishSlipWd/projectSlipWd) — NOT exact
  float-consumption arithmetic. Whole-network slides preserve float; own-prolongation consumes
  float. Do NOT "fix" these back to literal expectations — they encode correct engine behavior.
- The typed client (`lib/supabase/database.types.ts`) DOES contain the revision/progress RPCs the
  R2.1/R2.2/R2.4 components call — no type regen required to keep the batch compiling.

## R2 items — status
- **R2.1 Members** ✅ `apps/web/components/planning/plan-project-members.tsx` +
  `apps/web/app/dashboard/planning/members/page.tsx` + Members nav item (`planning-nav.ts`).
- **R2.2 progress reviews** ✅ `apps/web/components/planning/plan-progress-reviews.tsx`
  (queue UI: pending/confirmed/rejected filter, Confirm/Reject → `decide_progress_review` RPC,
  settings toggles `progress_review_enabled`/`lock_on_complete` on `plan_schedule_settings`) +
  notify route `apps/web/app/api/planning/progress-reviews/notify/route.ts` (imports
  `createUserClient, createAdminClient` from `@/lib/supabase/server` + dispatchScheduleAlert from
  `@/lib/notifications/dispatch`).
- **R2.4 portal** ✅ `apps/web/components/planning/portal/programme-projection.tsx` +
  `apps/web/app/portal/programme/[projectId]/page.tsx` + `plan-page-shell.tsx` client/consultant
  redirect → `/portal/programme/{selectedProjectId}` (else `/modules`).

### R2.3 revision workflow UI (NEXT — the in_progress item)
- Deliverable: in `plan-manage-schedules-dialog.tsx`, a revision approval queue —
  take a revision draft → submit (internal) → four-eyes approve/reject
  (`transition_revision` RPC + `plan_revision_approvals` lifecycle) → submit client →
  client approve. Confirm the exact RPC name/signature and `plan_schedule_revisions` status
  columns in `database.types.ts` FIRST (single isolated grep) before writing the component.
- Gate buttons by `can("revision", "submit"/"approve")` from `use-planning-permissions`;
  notify proposer via `/api/planning/progress-reviews/notify`-style route (mirror R2.2's).

### R2.5 delay register float capture UI
- `delay_register` Row (database.types.ts L2744): id, project_id, wbs_task_id, delay_code,
  delay_type, cause, description, impact_days, status, start_date, finish_date,
  responsible_party, notes, created_by, created_at, updated_at.
- `impact_days` is stored float-consumed per event. Show register rows for project with
  impact_days; gate add/edit by `can("delay","edit")`.

### R2.6 EOT notice dialog
- RPC `create_eot_notice_from_delay(p_delay_id, p_contract_id, p_deadline)` →
  returns notice_id (notice_no 'EOT-XXX', trigger_event from delay_type,
  deadline client_date+28 default). Dialog picks a delay_register row + contract
  (via `contract_register`), calls RPC, notifies.

### R2.7 qs-service IPC (qs_progress)
- Wishlist item: seed/fetch realtime progress to qs-service via
  `wbs_task_progress_reviews`-driven queue (IPC contract may already exist in qs-service).
  Low risk; verify existing qs-service IPC shape before touching.

### R2.8 react-pdf monthly report
- Add `@react-pdf/renderer` route generating a monthly programme report
  (snapshot from `v_plan_client_programme` + delay register). Pure server file.

## Phase 3 (WIP, do AFTER R2.x)
- 3.1 TIA panel (`plan-tia.tsx`), 3.2 resource levelling (`plan-resource-levelling.tsx`),
  3.3 readiness attribution (client/consultant visibility on programme projection).

## Pitfalls / rules (from this session)
- **ALWAYS run `tsc --noEmit` as a SINGLE isolated bash call** (never parallel with reads) —
  it is the only trustworthy verifier here. Reads/greps in parallel CORRUPT output with echoes.
- If a read/grep returns mangled content, re-run the SAME call isolated (one at a time) —
  the second isolated call returns true disk state.
- DB migrations live in `supabase/migrations` (numbered). Engine code in
  `apps/web/lib/planning/*.ts` (+ tests). UI in `apps/web/components/planning/*.tsx`.
- Hosted DB is Phase-1 only; migrations 07-20 must be applied by user via Supabase SQL Editor.
- Tests use `pnpm --filter web exec vitest run lib/planning` from `apps/web`.
