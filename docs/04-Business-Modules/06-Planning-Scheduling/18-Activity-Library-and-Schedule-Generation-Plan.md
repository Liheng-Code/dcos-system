# 18 — Activity Library & Schedule Generation Plan

Status: **Phase 1 and Phase 2 built on the local DB (dev-status nav); Phase 3 not started** · Drafted 2026-10-05 · Inputs: master prompt "DCOS Construction Knowledge & Schedule Generation Engine" + static prototype (`index.html`, `styles.css`, `app.js`).
Principle: WBS = WHERE, Activity = WHAT, Method = HOW, Resources = WITH WHAT, Schedule = WHEN. Library = knowledge, Template = recipe, Generation Engine = assembly, Planner = authority. AI suggests only; the engine is deterministic.

## 1. What already exists (do not rebuild)

| Master-prompt concept | Existing DCOS entity | Decision |
|---|---|---|
| Project Activity | `wbs_tasks` (1,498 rows; `wbs_node_id`, `duration_days/unit`, `dependency_task_ids/types/lag_days` arrays, `constraint_*`, `activity_type`, baseline cols, `cost_code`) | **Extend** with `activity_master_id`, `method_id`, `generation_run_id`, `confidence`. No new `project_activities` / `project_activity_dependencies` table (links stay arrays, per schedule-duration-rules). |
| WBS location | `wbs_nodes` (`node_type`, `level_type`, `discipline`, `source_level_template_id`) | Reuse as-is. |
| Productivity Standard | `plan_productivity_norms` (+ `status`, `valid_from/to`, `source_norm_id`, `approved_by`, `efficiency_pct`, `dwl_work_item_id`) and `plan_productivity_norm_resources` | **Extend**: add `activity_master_id`, `method_id`; allow `project_id is null` = company standard. Unit is labour-hr/unit today — engine converts to qty/day. 0 rows today, so no migration risk. |
| Resource Standard | `plan_productivity_norm_resources` (labour) + `dwl_resources` / `dwl_v_resource_costing_rates` | Extend `kind` to equipment/material/subcontract + rule column (`per_crew`, `per_pour`, `optional`). Rates stay in DWL. |
| Quantity | `wbs_node_quantities` (`metric_code`, `source`, `is_current`, revision) + `boq-mapping-service` | Reuse; provider abstraction sits in `lib/planning`. |
| Calendar | `plan_calendars`, `work-calendar.ts`, `schedule-engine.ts` (CPM) | Reuse; generation calls the existing engine for dates. |
| Baseline | `wbs_baselines`, `baseline-service.ts` | Reuse for "approve baseline". |
| Template applying | `wbs_templates` + `apply_wbs_template` → `import_master_wbs('merge')`; Level Library | Activity Template **complements** this: WBS template builds the tree, Activity Template stamps a recipe onto chosen level nodes. Same merge/skip-existing semantics. |
| Library permissions/RLS | `can_manage_master_libraries()`, "authenticated view / privileged manage" policy pattern, `set_updated_at()` | Reuse verbatim. |
| Not to confuse | `activity_step_template_*` | Progress *steps* inside one task. Keep separate; cross-link only. |
| Module wiring | `planning` manifest, `planning-nav.ts`, `release.ts`, `module-boundaries.mjs` | New pages under `app/dashboard/planning/activity-library/`, nav item `status: "development"` until released. |

Naming: existing tables are `plan_*`; the prompt's names (`productivity_standards`, `resource_standards`) would duplicate `plan_productivity_norms`. New tables use `plan_act_*` (e.g. `plan_act_masters`).

## 2. Review of the prototype and the master prompt

Prototype is a good UI skeleton (tree + list, 13 tabs, template sequence, generation run screen) but is static JS. Fix when porting to Next.js:
1. **Template has 13 steps but library has only 10 slab masters.** Steps 02–04 (wall/column rebar, formwork, concrete) need masters in `COLUMN` / `SHEAR WALL` / `CORE WALL`. Seed those families (Phase 1) or the template cannot generate.
2. Step 01 "Survey" is a Slab master but the template runs it once per floor before wall work — fine, but needs a `scope` flag (floor-level vs. element-level) on template items.
3. Prototype seeds Architectural/MEP (~50 activities) with made-up usage counts and versions. Ship **Structure → RC only** per the prompt; drop invented usage/version numbers (derive from real data).
4. Productivity maths: the tab shows 58.9 (static) but 60×0.95×1.05×0.98 = 58.65; and the prompt's example uses 62.7. Engine returns the number, UI never computes it.
5. "Active/Draft/Under Review…" in the prompt is a 6-state lifecycle; prototype only shows ACTIVE. Implement all six with transition rules.
6. Prototype links are FS-only with a lag on step 13. Template dependencies need type + lag + optional flag, and must map onto `dependency_task_ids/types/lag_days` arrays on generation.
7. Prompt requires `library_versions` as a global concept; simpler and enough: **each versioned row is immutable once APPROVED**; edits create a new version row. Generation runs store the version ids they used (no global library version).
8. Master prompt lists ~30 tables. Phase 1 needs ~14 (below). Defer QA/QC / HSE / document requirements to simple child tables with free text + optional links to existing QA/QC/HSE modules; do **not** duplicate those modules' registries.

## 3. Target data model (phased)

**Phase 1 – knowledge (all `plan_act_*`, company-level, RLS = view all / manage via `can_manage_master_libraries()`)**
- `domains`, `categories`, `families` (3 small tables, code unique, soft `is_active`)
- `masters` (code unique per version; `family_id`, `discipline`, `work_type`, `default_unit`, `status` enum 6-state, `version`, `revision`, `owner`, `source`, `effective_date`, `superseded_date`, `supersedes_id`) — `unique (code, version)`
- `methods` (master_id, name, constraints)
- productivity: extend `plan_productivity_norms` + new `plan_act_productivity_factors` (norm_id, factor_type enum, value, condition)
- resources: extend `plan_productivity_norm_resources` (equipment/material, rule)
- `quantity_rules` (master_id, metric_code, provider_priority array, formula expr as structured parts: base metric, deductions, additions)
- `logic_rules` (from_master, to_master, type FS/SS/FF/SF, lag, optional) — recommendations only
- `templates`, `template_items` (template_id, master_id, seq, scope, method_id, norm_id, duration override), `template_dependencies`
- `applicability_rules` (target = master|template; attribute, operator, value) — evaluated by a pure function
- `qaqc_reqs`, `hse_reqs`, `doc_reqs` (simple child tables)
- `change_history` (entity, entity_id, from_status, to_status, who, when, reason) — append-only, trigger-written

**Phase 2 – project side**
- Extend `wbs_tasks` (`activity_master_id`, `method_id`, `norm_id`, `generation_run_id`, `confidence`, `template_item_id`)
- `plan_act_generation_runs` (project, scope node ids, template id+version, norm versions used, quantity source snapshot, engine version, counts, status, by/at)
- `plan_act_generation_items` (run_id, task_id, confidence, exception reasons[], inputs snapshot jsonb)
- `plan_act_overrides` (task_id, field, old, new, reason, by, at, source) — append-only
- Generation is **transactional RPC** (all tasks or none); rerun creates a new run, never edits an old one.

**Phase 3 –** BIM/BOQ providers, AI tools, historical productivity from `plan_productivity_logs`, what-if.

## 4. Service layer (`lib/planning/activity-library/`, pure functions + thin Supabase services, Vitest tests)

`productivity-engine.ts` (adjusted rate = base × Π factors; duration = qty / rate, rounded up to engine unit) · `quantity-resolver.ts` (provider interface: Manual, BOQ via `boq-mapping-service`, BIM stub) · `applicability.ts` · `logic-generator.ts` (template deps → `dependency_*` arrays) · `confidence.ts` (exception reasons: missing qty, unknown method, low-confidence norm, no template…) · `generation-service.ts` (orchestrates §16 pipeline, calls `schedule-engine` for dates) · `library-service.ts` (CRUD + lifecycle) · `override-service.ts`. Register public entries in `lib/planning/public.ts` and `module-boundaries.mjs`.

## 5. UI (under Planning, shadcn/Tailwind — not the prototype's custom CSS)

1. **Activity Library** `/dashboard/planning/activity-library` — tree + table, filters, search, status chips.
2. **Activity detail** — 13 tabs from the prompt; Phase 1 builds Overview, Methods, Productivity (with live preview calling the engine), Resources, Quantity, Logic, Templates, Version History; the rest are read-only lists first.
3. **Templates** — ordered list editor first (add/remove/reorder, dependency type + lag, method/norm picker); visual node canvas is optional polish.
4. **Generate** (Phase 2) — project → WBS scope (levels) → template → preview → run; result page with confidence filters (All / Review / Low / Missing / Logic / Qty / Resource), accept-high-confidence, per-row resolve, override dialog with mandatory reason, "send to baseline".

## 6. TODO

### Phase 0 — decisions & prep (before code)
- [ ] Confirm decisions in §7
- [ ] Check `tenant_id`/multi-company convention (DWL uses `tenant_id`; planning tables use `project_id`) and follow it for library tables
- [ ] Add module-boundary entries and a dev-status nav item in `planning-nav.ts` / `release.ts`

### Phase 1 — Knowledge foundation
- [ ] Migration A: domains/categories/families/masters + enums + lifecycle trigger + change_history + RLS (dry-run in rolled-back txn per CLAUDE.md; apply via psql from Git Bash)
- [ ] Migration B: methods, factors, extend norms & norm resources, quantity_rules, logic_rules, applicability, QA/HSE/doc reqs
- [ ] Migration C: templates, template_items, template_dependencies
- [ ] Seed (idempotent): Structure → RC → 8 families; 10 Slab masters; Column/Shear Wall/Core Wall masters needed by the floor template; 3 concrete methods; productivity + factors; resources; logic; `TPL-STR-HR-RC-FLOOR-001`
- [ ] Pure engines + tests: productivity, applicability, quantity resolver, confidence
- [ ] library-service + API routes/Zod schemas
- [ ] UI: library list/tree, detail tabs, template editor
- [ ] Typecheck, lint, test, build; update `04-Database-Schema.md`, `08-API-Reference.md`

### Phase 2 — Generation
- [ ] Migration D: extend `wbs_tasks`; generation_runs/items; overrides
- [ ] `generate_schedule` RPC + generation-service (levels 01–30 loop, WBS node matching, quantity mapping, durations, dependencies → arrays, resource assignment via existing resource-generation-service)
- [ ] Run page, exception filters, override flow with audit, baseline hand-off to `baseline-service`
- [ ] Verify end-to-end on a **copy** of a local project (e.g. PRJ-2026-004-PC levels), compare with hand-built schedule; take `scripts/db-backup.ps1` first

### Phase 3 — Intelligence
- [ ] BIM/BOQ providers · AI tool boundary (`find_applicable_template`, `suggest_*`, `explain_generation`) writing suggestions only · historical productivity from `plan_productivity_logs` · what-if

## 7. Decisions (answered 2026-10-05)
1. **Reuse `wbs_tasks` as Project Activity and `plan_productivity_norms` as Productivity Standard** (recommended) vs. new parallel tables as in the master prompt.
2. **Scope of seed:** Structure → RC only (recommended, matches prompt) vs. also the prototype's Architectural/MEP lists.
3. **Library level:** company-wide (recommended, like other Master Libraries) vs. per-project copies.
4. **Where in the nav:** new "Activity Library" group in Planning (recommended) vs. under Master Libraries.

Answers: **1** reuse `wbs_tasks` / `plan_productivity_norms`; **2** seed Structure + Architectural + MEP (70 masters); **3** company-wide; **4** new Planning nav group "Activity Library" (hidden until released in `lib/modules/release.ts`).

## 8. Phase 1 delivered (2026-10-05)
- Migrations `20261006000001-3` applied locally (tables `plan_act_*`, lifecycle/immutability triggers, append-only history, RLS). Norm tables extended (`activity_master_id`, `method_id`, `output_per_day`, `version`; resource kinds + allocation rule).
- Seed `supabase/seeds/seed_activity_library.sql` (idempotent): 16 families, 70 masters, Slab concrete methods/norms/factors/resources/quantity rule/requirements, slab logic, and active template `TPL-STR-HR-RC-FLOOR-001` (13 items, 12 dependencies). Seeded norms are **draft** (assumed figures; approving a norm needs the planning/norms approve permission).
- Engines + 16 tests in `lib/planning/activity-library/` (productivity, applicability, quantity resolver, confidence), `library-service.ts`.
- UI: `/dashboard/planning/activity-library` (tree + list), `/[id]` (tabs), `/templates` (read-only recipe view).
- Known gaps: create/edit forms for masters, methods and templates (only lifecycle actions and factor edits exist); new-version copy keeps productivity standards linked to the old version; Column/Wall template steps 02-04 use the Shear Wall masters as proxy; production promotion via `/dbpush` is the user's step.

## 9. Authoring + Phase 2 delivered (2026-10-05)
- **Authoring:** New/Edit Activity Master (draft only), method add/edit/delete, template editor (new template, add/remove/reorder items, method, standard duration, dependency type/lag/optional, "Chain all FS", save recipe, new version, activate), all lifecycle moves. Governance verified in SQL: active master/template are immutable, illegal transitions rejected, activating a new version supersedes the old one.
- **Migrations 20261006000004-5:** `wbs_tasks` provenance columns (`activity_master_id`, `activity_method_id`, `generation_run_id`, `generation_confidence`), `plan_act_generation_runs` / `_items`, append-only `plan_act_overrides`, `plan_act_node_quantities` (the manual/BIM/BOQ quantity staging table; `wbs_node_quantities` is limited to GFA), and RPC `plan_act_commit_generation` (one transaction, RLS applies to the caller; tested as admin and rolled back).
- **Engine:** `generation-planner.ts` (pure; 7 tests) + `generation-service.ts` (load inputs, preview, commit, review, override with mandatory reason, accept). Task code = `<master code>@<level code>`; existing codes are skipped so a re-run never duplicates. Dependencies are written into the existing `dependency_*` arrays of the new tasks.
- **UI:** `/generate` (template, project attributes, levels, preview, generate), `/runs/[id]` (filters, accept, override dialog, override log, high-confidence bulk accept).
- **Verified:** real preview against the local DB on a project with 3 typical levels: 13 activities per level, slab concrete with a manual 180 m3 gives 4 days (60 x 0.95 x 1.05 x ... factors), flagged "draft productivity".
- **Not done / known gaps:** only slab concrete has a productivity standard, so other steps use fixed template durations (starting figures) and others show "no productivity"; no link between consecutive levels (level N+1 start is the planner's call); dates come from the existing Schedule command after generation; baseline is set with the existing baseline tools; BIM/BOQ providers and AI tools are Phase 3; resource assignment from standards (labour/equipment onto the task) is not wired yet; UI has not been exercised in a browser.

## 10. Resource assignment + more productivity standards (2026-10-05)
- **Migration 20261006000006:** commit RPC now also writes `plan_task_work` (quantity + norm) for every generated task that has both, so the existing engine computes crews, hours and planned cost. New RPC `plan_act_generate_resources(run)` assigns the non-optional equipment/subcontract lines of the standard (resources named "<role> - from library", assignment source `library`, which the labour generator never deletes). Labour still comes from the existing `plan_generate_resource_loading` (needs scheduled dates). Run page has an **Assign resources** button doing both. Tested end to end in a rolled-back transaction: 180 m3 pumped concrete gives plan_task_work calc ok, pump 100% and vibrators 200% assigned.
- **Standards + calculated quantity:** company draft standards for slab formwork, finishing, curing and stripping, each with a "Slab area" quantity rule. A `calculated` provider derives `slab_area` from the level GFA (`wbs_node_quantities`, "m2" normalised to "m²"); the approximation is stated on the rule. These template steps no longer carry fixed durations. Preview on a project with GFA: 26 activities for 2 levels, 16 high / 8 review / 2 low; the only low ones are slab concrete (no volume yet).
- **Remaining gaps:** rebar tonnage, wall volumes and slab volume have no derivation (enter manual or BIM/BOQ quantities); material lines are not assigned (procurement phase); labour crews need dates, so run Schedule before **Assign resources**.

## 11. Browser walkthrough (2026-10-05)
Driven with Playwright against the local app (admin user, project with GFA data): library list and tree, activity detail tabs, templates, generate (attributes, level picker, preview), commit, run review, override dialog, accept-all-high, assign resources. No console errors. Test data was removed afterwards (run, 117 tasks, test resources/quantities).
Bugs found and fixed: the **Generate** nav item had not been added; level list was unordered and "Typical" selected nothing when `level_type` is empty (now inferred from the level name and sorted physically); run rows were not in template order; light-only row tints looked grey in the dark theme.
Verified in the UI + DB: override records old/new/reason and recalculates duration (180 m3 -> 4 d), an empty reason is rejected, low-confidence items cannot be accepted, accept-all-high accepted 72, equipment assignments were created (18, pump 100%, vibrators 200%), `plan_task_work` rows were written.
Not exercised: Schedule command followed by labour generation (needs scheduled dates), template editor interactions (add/reorder/save), master create/edit dialog, the dark/light theme toggle.

## 12. Editors and Schedule-to-labour walkthrough (2026-10-05)
Driven in the browser: create/edit master, method add/delete, lifecycle draft to active (Edit disappears once active; history rows written), template create, add activities, duration, Chain all FS, save, reorder, lifecycle, New version (v2 copies items and links), and generate -> WBS Schedule -> Assign resources.
Fixed: reordering left links pointing at later activities (now flagged "out of order" and Save is blocked until fixed or re-chained); New Activity form defaulted to an arbitrary family (now hierarchy-ordered, first = Structure > RC > Column); **Assign resources now calls `recompute_task_work` first**, because Task Work rows are computed at commit time without dates and stayed at "no working-day duration" after Schedule (labour was 0; now 12 labour + 6 equipment assignments for 3 levels).
Side effect to know: the WBS **Schedule** dialog saves its start date to `projects.start_date` (null before). Test data and that field were restored afterwards.
Still open: labour pools ("<trade> - from norms") are created with the generator's placeholder capacity, so heavy crews show as short until sized; visual drag-and-drop template canvas; light theme not checked.
