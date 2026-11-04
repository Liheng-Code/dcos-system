# 19 — Activity Library Phase 3 Plan (quantity providers, what-if, learning, AI)

Status: **PLAN — for review, nothing built** · Drafted 2026-10-05 · Builds on [18-Activity-Library-and-Schedule-Generation-Plan.md](18-Activity-Library-and-Schedule-Generation-Plan.md) (Phases 1–2 delivered and exercised in the browser).

Principle unchanged: the deterministic engine calculates, the AI only suggests, the planner decides, every override is audited. Phase 3 widens what feeds the engine (quantities, productivity) and adds controlled assistance; it does not change who is in charge.

## 1. What the data says today (checked on the local DB, 2026-10-05)

| Area | Finding | Consequence |
|---|---|---|
| **BIM** | `bim_element_takeoff` has 35,302 rows from 4 models, but for slabs (214), beams (312), columns (184), reinforcing bars (3,694) and walls (32) **quantity, unit and level are all empty**; `raw_properties` holds only tag / name / type. `bim_element_wbs_map` has 0 rows. | A BIM quantity provider cannot work yet. The blocker is the **IFC extractor** (it does not read `IfcElementQuantity` or spatial containment), not the provider. |
| **BOQ** | `qs_boq_items`: 926 rows with quantity, unit, `wbs_node_id`, budget code, `dwl_work_item_id`. An existing pure matcher (`boq-matching.ts`) already suggests BOQ line to task links. | A BOQ provider is feasible now. |
| **Site productivity** | `plan_productivity_logs`: 0 rows; `dr_activity_progress`: 3 rows. The index maths and `plan_propose_calibrated_norm` already exist. | Learning from history can be **built** now but has nothing to learn from until Daily Reporting feeds logs. Needs minimum-sample rules so it never "learns" from 3 points. |
| **AI plumbing** | Daily Reporting already has the pattern: `ANTHROPIC_API_KEY`, tool-use with a versioned prompt, runs table (`dr_ai_runs`), asynchronous and advisory only. | Reuse the pattern; do not invent a second one. |
| **Phase 2 gaps** | No UI yet to edit applicability rules, quantity rules, logic rules, requirements, or to add/remove factors; productivity standards cannot be created from the Activity page; no link between consecutive levels. | Phase 3 starts with a short hardening step (3.0). |

## 2. Sub-phases (recommended order)

### 3.0 Authoring gaps and hardening (small, no new concepts)
- Activity page editors: applicability rules, quantity rules, standard logic rules (predecessor/successor picker), requirements (QA/QC, HSE, documents, hold points), productivity factor add/remove, "Link a productivity standard" (new standard from the Norm Library dialog pre-filled with master + method).
- Template: applicability editor; optional **inter-level logic** (e.g. level N+1 survey after level N stripping, with lag) stored on the template and stamped by the planner.
- Generation: option "start of first level = date / after previous level"; show resource lines in the preview.
- Done when: a planner can build a new activity, its standard and a template entirely in the UI, with no SQL.

### 3.1 What-if comparison (deterministic, no AI)
- Reuse `previewGeneration` as a pure function: run N variants of one request (method per activity, productivity factor set, quantity priority, template version) and compare per level and in total: durations, working-day span, crew peaks, exceptions.
- UI: "Compare scenarios" on the Generate page (A/B columns, delta). Nothing is written until a scenario is chosen and committed as a normal run.
- Tests: unit tests on the comparison reducer; example: pump vs crane on 30 levels.

### 3.2 BOQ quantity provider
- Table `plan_act_quantity_links` (project, node, metric_code, boq source + item id, factor, note, confirmed_by/at). Planner confirms suggestions (reuse `boq-matching` ranking); the provider sums confirmed links, so a quantity is always traceable to BOQ lines.
- Provider key `boq` in the existing `QuantityProvider` abstraction; unit conversion and `unit_mismatch` already handled by the resolver.
- UI: on a run, the "missing quantity" row offers "Find in BOQ" with ranked suggestions; accepting writes the link and recalculates (same audited override path).
- Done when: slab volume of a level resolves from BOQ and the run shows source `boq` with the BOQ item reference.

### 3.3 Productivity from site history
- Aggregate `plan_productivity_logs` by activity master + method (via `wbs_tasks.activity_master_id`): sample count, mean/median PI, spread, period.
- **Rules before any suggestion appears:** minimum 5 logs over at least 3 distinct days and 2 projects or locations; exclude outliers beyond 3 MAD; show the sample, never only the number.
- Output: a *proposed* new version of the standard via the existing `plan_propose_calibrated_norm`, with approver = norms approval permission. Approving creates a new norm version; existing runs keep their old reference (library governance rule).
- Done when: seeded logs for one activity produce a proposal, a human approves it, and the next preview uses the new version while old runs are unchanged.
- Dependency: needs Daily Reporting (10-01) to feed logs; without data the screen shows "not enough history" instead of guessing.

### 3.4 BIM quantities (largest; separate decision)
Two parts, in order:
1. **Extractor upgrade** (in the BIM module): read `IfcElementQuantity` / `Qto_*BaseQuantities` (NetVolume, NetArea, Length, Weight), `IfcRelContainedInSpatialStructure` (storey), type/material. Populate `bim_element_takeoff.quantity/unit/level`. Acceptance: for the existing model, slabs, beams, columns and walls have a quantity and a level; re-extraction is idempotent.
2. **Provider:** map `building_level` to WBS level nodes (planner-confirmed, stored in `bim_element_wbs_map`), map IFC class + predefined type to metric (`slab_volume`, `column_volume`, `rebar_weight`), sum per node. Key `bim` in the abstraction; source reference = model + element set.
- Risk: models vary in how they carry quantities. Mitigation: coverage report per model (% of elements with quantity and level) shown before the provider is trusted; below a threshold it returns nothing, so the engine falls back to BOQ / manual / calculated.

### 3.5 AI assistance layer (after 3.1–3.4 give it solid ground)
- Tables: `plan_act_ai_runs` (tool, model, prompt_version, tokens, status, error) and `plan_act_ai_suggestions` (kind, target record, recommendation, reason, source, confidence, affected records, required approval, status pending/accepted/rejected, decided_by/at). Same async + advisory pattern as `dr_ai_runs`; server route only.
- Tools (each returns suggestions, never writes project data):
  - `find_activity_master`: free-text task name to ranked masters. Deterministic keyword/trigram retrieval first; the model only re-ranks the shortlist.
  - `suggest_quantity_mapping`: BOQ/BIM line to node + metric, when 3.2 ranking is ambiguous.
  - `suggest_productivity`: explains the 3.3 statistics in words and flags suspect data; it never invents a number.
  - `detect_schedule_conflict`: deterministic checks first (backward links, resource overload, calendar clashes); the model summarises.
  - `explain_generation`: plain-language account of why a run produced its durations and exceptions, from the run record.
- Accepting a suggestion runs the **same service call a planner would** (override with `source = 'ai_accepted'`, mandatory reason copied from the suggestion), so audit and permissions are identical.
- Controls: org-level switch, per-run token budget, only codes/names/numbers sent (no personal data, no photos here), prompt versions stored, "ai_suggestion" exception reason already exists in the confidence model.
- Done when: a suggestion can be accepted or rejected from the run page, the accept leaves an override row marked AI, and turning the switch off removes the feature without side effects.

### 3.6 Delay and recovery intelligence (later, optional)
- `suggest_recovery_plan`: use the existing Delay Register / TIA data plus what-if (3.1) to propose resequencing or method switches; always as scenarios to compare, never applied directly. Plan separately after 3.1 and 3.5 are in use.

## 3. Cross-cutting rules
- Every new table: RLS by project membership (project data) or Master Libraries permission (library data); append-only for suggestions/decisions/overrides.
- Migrations replay-safe and dry-run in a rolled-back transaction; seeds idempotent; no production steps by Claude (promotion via `/dbpush`).
- Each sub-phase ships with unit tests for the pure parts and a browser walkthrough, as in Phases 1–2.
- Dev-status nav until the owner releases it in `lib/modules/release.ts`.

## 4. Risks
| Risk | Mitigation |
|---|---|
| BIM files carry no usable quantities | Coverage report + fallback chain; extractor work scoped separately |
| Learning from thin or biased site data | Sample thresholds, outlier rule, human approval, versioned norms |
| AI cost / data exposure | Switch, budgets, minimal payload, advisory-only, prompt versioning |
| Planner over-trusts suggestions | Confidence + source shown; low confidence cannot be bulk-accepted |
| Scope creep into scheduling UI | What-if reuses the pure preview; no new scheduler |

## 5. Todo checklist
- [ ] **3.0** editors for applicability / quantity rules / logic / requirements / factors / link standard; inter-level logic; preview shows resources
- [ ] **3.1** scenario compare (pure reducer + UI + tests)
- [ ] **3.2** `plan_act_quantity_links`, BOQ provider, "Find in BOQ" on missing-quantity rows
- [ ] **3.3** history aggregation + thresholds + proposal/approval flow (seeded demo logs for testing only)
- [ ] **3.4a** IFC extractor reads quantities, storey, type; re-extract the existing model and report coverage
- [ ] **3.4b** level map + BIM provider
- [ ] **3.5** AI runs/suggestions tables, server route, the five tools, accept path via audited override, org switch
- [ ] **3.6** recovery scenarios (decide later)

## 6. Decisions needed
1. **Order:** 3.0 → 3.1 → 3.2 first (all deterministic, data exists today), then 3.3/3.4, AI last. Agree, or should BIM come earlier?
2. **BIM scope:** is upgrading the IFC extractor in scope for this module's team, or owned by Design/BIM?
3. **AI:** allowed to send activity names and quantities (no personal data) to the model? Which model and monthly budget cap?
4. **Productivity learning:** should proposals need Planning Manager approval (recommended) or any user with norms-approve permission?

## 7. Decisions (answered 2026-10-05)
1. Order agreed: 3.0 → 3.1 → 3.2 → 3.3/3.4 → 3.5.
2. IFC extractor upgrade is owned by the **Design/BIM team**. Planning only consumes `bim_element_takeoff` and publishes the coverage it needs (quantity, unit, storey per IFC class; see 3.4). 3.4b waits for their delivery.
3. AI: owner asked for advice. Recommendation (applies from 3.5, nothing to decide before then): allow it, **off by default** with an org-level switch; send only activity codes/names/numbers (no people, rates or photos); advisory only; reuse the Daily Reporting model setting; start with a low monthly cap (suggest USD 50, adjustable) plus a per-run token limit. Confirm the cap before 3.5.
4. Productivity proposals need **Planning Manager** approval (norms approval permission).

## 8. Phase 3.0 delivered (2026-10-05)
- **Migration 20261006000007:** children of a master (methods, quantity rules, logic rules, applicability, requirements) and a template's applicability and recipe-level fields are **frozen in the database** once the parent leaves draft (database owners such as seeds are exempt); templates gain `inter_level_*` columns.
- **Activity page editors (draft only, read-only note otherwise):** quantity rules, standard logic (add/remove links to other active activities), QA/QC + hold points, HSE, documents, applicability, methods; **New productivity standard** form (method, crew output, hours, basis, resource lines incl. equipment/material/subcontract, derives the labour constant) and add/remove factors on draft standards. Standards are created as company **drafts**; approval stays in the Norm Library.
- **Template editor:** applicability rules and a **link between levels** (item of level N drives an item of level N+1, relation + lag). Planner stamps the link across the chosen levels (9 unit tests in the planner suite, 2 new). Generate page: toggle "Link consecutive levels" and a **Resources** column (crew size + equipment) in the preview.
- **Verified in the browser:** every editor on a new draft activity, then Active makes them read-only; template with applicability + level link generated for 3 levels: 2F Survey follows 1F Inspection, 3F follows 2F. Test data removed.
- Gaps: editing an existing quantity rule or requirement is delete + re-add (no in-place edit yet); no editor for method-specific factor templates; light theme not checked.

## 9. Phase 3.1 delivered (2026-10-05): what-if comparison
- **Engine** (`scenario-compare.ts`, pure, 7 tests): a variant = method per activity + productivity % for every standard + link-levels on/off. It is applied to the loaded planner inputs, generated in memory, laid out with the CPM engine on the project calendar, and summarised: programme length (working days), finish date, total task-days, critical activities, review/low counts, activities without a duration, and per-level task-days and span. Deterministic ids; the base input is never mutated.
- **Service:** `compareScenarios` loads the inputs once and runs all variants; `GenerationRequest.variant` applies a chosen variant for the real preview and commit. A committed run stores the variant in `plan_act_generation_runs.project_attributes._scenario`, so the run explains why it used the crane.
- **UI:** Generate page > **Compare scenarios** (up to 4 scenarios, A is the reference): per-activity method choice for every activity that has more than one method, productivity %, link levels; results with deltas (green better, red worse), per-level table, **Use this scenario** applies it to the preview (banner with Clear) and the normal Generate commits it.
- **Verified in the browser** on 3 levels with a manual 180 m3 slab volume: pump (A) 31 wd / 81 task-days; crane at 90% (B) 35 wd (+4) / 93 (+12); 120% productivity (C) 28 wd (-3) / 72 (-9). B committed: the three concrete tasks use the crane at 6 days and the run holds the scenario. Test data removed.
- **Limits (by design):** template fixed durations are not changed by method/productivity variants; the span uses the project start date, or today when the project has none; resources and crew peaks are not compared yet (candidate for a later pass).

## 10. Phase 3.2 delivered (2026-10-05): BOQ quantity provider
- **Migration 20261006000008:** `plan_act_quantity_links` (project, WBS node, metric, BOQ source + item id, snapshot of item no / description / unit / quantity, **factor** = share of the line that belongs to the node, reason, who/when) with project-member RLS and `planning/schedule edit` for writes; `plan_act_generation_items.quantity_ref`; commit RPC stores the reference.
- **Provider `boq`** (`boq-provider.ts`, `boq-quantity.ts`): sums live BOQ quantity x factor for a node/metric across project BOQ (`qs_boq_items`) and tender BOQ (`tender_boq_items`), so a BOQ revision flows into the next generation; falls back to the quantity seen at link time if the line cannot be read; reports drift and refuses mixed units. Imported `boq` rows in `plan_act_node_quantities` remain a fallback.
- **Linking is always the planner's decision** (`boq-quantity-service.ts`): ranked suggestions use the existing matcher with the activity name + family ("Concrete Casting Slab"), plural-tolerant scoring, level ranges ("L1-L3" counts as level 1F) and a hard unit filter (m3 = m3 equivalents via `sameUnit`); plain-text search for anything else. A lump line can be shared over the levels of a run (equal exact shares by default, editable). Confirming writes the links, recalculates quantity and duration, keeps the draft-productivity flag, and appends audit rows (field, old, new, reason).
- **UI:** run page > **Find in BOQ** on rows with a missing or non-BOQ quantity; quantity cell shows source and reference (e.g. `BOQ TST-001 x0.333`); unit mismatch blocks the link.
- **Verified in the browser and DB** (project with temporary BOQ lines): activity-matching lines rank first (the m2 formwork line is hidden from suggestions and blocked when reached by search), 540 m3 line shared over 3 levels gives exactly 180 m3 and 4 days per level, audit rows written; a later preview reuses the links (1F-3F get 180, a level without a link stays "missing quantity"); changing the BOQ line to 600 gives 200 per level. Test data removed.
- **Not built (small follow-ups):** a project-level screen to list/remove quantity links (today links are created and used, removal is by SQL or by re-linking); no warning on the run page when a linked BOQ quantity has since changed (`drifted` is computed but not shown); BIM provider waits for the Design/BIM extractor.

## 11. BOQ follow-ups and Phase 3.3 delivered (2026-10-13)
**BOQ follow-ups**
- **Quantity Links** page (Activity Library > Quantity Links): every confirmed link with level, metric, BOQ line, share, quantity at link vs now, what it gives, a "changed" flag and Remove.
- **Drift on the run page:** a BOQ line changed after linking shows "BOQ changed · update" on the row; one click re-reads the link, refreshes its snapshot and re-applies quantity and duration with an audit row. Other levels keep their own chip until updated.

**3.3 Productivity from site history** (no schema change)
- **Engine** (`productivity-learning.ts`, pure, 11 tests): from the logs of one standard it reports usable logs, distinct days, distinct places (projects or WBS levels), median / range / spread of the productivity index, and **excludes outliers beyond 3 scaled MADs of the median, naming them**. A proposal exists only when the agreed thresholds are met (5 logs, 3 days, 2 places). Proposed figures are the *observed* ones: man-hours per unit = sum(actual hours) / sum(quantity), output per day scaled inversely; changes above 30% are flagged for extra review.
- **Service:** logs are read through RLS from tasks that used the standard (or a project copy calibrated from it), so users see the evidence of the projects they belong to. **Create proposed version** writes a company draft `<code>-V<n>` linked by `source_norm_id` with the same crew, factors and method; only an **approved** standard can be calibrated. The current version stays in force until a Planning Manager approves the new one in the Norm Library; existing runs keep the version they used.
- **UI:** a "Site history" panel on every productivity standard (check list of thresholds, statistics, current vs proposed, outliers, large-change warning, create button).
- **Planner:** when several versions of a standard are approved the **newest** is used (approved before draft, then highest version), so approving a calibrated v2 takes effect for the next generation.
- **Verified in the browser and DB** with temporary data: 7 logs (6 around PI 0.73, one at 3.33): outlier excluded and shown, median 0.733, thresholds all met, proposal 2.0 -> 2.7273 man-hours/m3 (+36.4%, flagged large), crew output 60 -> 44 per day, draft v2 created with all 7 resource lines and 6 factors. The BOQ links screen showed 3 changed links and the run-page update re-applied 200 m3. Test data removed and the standard restored to its seeded draft state.
- **Not yet:** retiring v1 when v2 is approved is a manual step in the Norm Library; no history-driven suggestions for draft standards (they must be approved first by design); real logs still depend on Daily Reporting feeding `plan_productivity_logs` (0 rows in the local database).

## 12. Phase 3.4 Planning side delivered (2026-10-13)
**Status of the dependency:** the Design/BIM extract is unchanged: the 35,302 rows of "KOMB - Test 004" still have no quantity, unit or storey on slabs, beams, columns, walls or rebar. The requirements and an acceptance SQL are in [20-BIM-Extract-Requirements-for-Planning.md](20-BIM-Extract-Requirements-for-Planning.md) (written for the Design/BIM team). Phase 3.4a (extractor) stays with them.

**3.4b built so it works the day the data arrives** (migration `20261013000001`, no change to any BIM table):
- `plan_act_bim_metric_map` (company-level, editable, seeded): which IFC class + unit feeds which metric (slab volume/area, beam, column, wall volume/area, rebar weight).
- `plan_act_bim_level_map` (per project and model): BIM storey -> WBS level, planner-confirmed; storeys are suggested by name (`Level 3`, `L03`, `3rd Floor`, `Ground Floor`, `Roof`).
- **Provider `bim`** (`bim-quantity-service.ts`, pure parts in `bim-quantity.ts`, 9 tests): sums elements with quantity > 0 and a storey, in the metric's unit, on the storeys mapped to the node; reference "BIM <model> <revision>: n elements". **Coverage gate:** a class with fewer than 80% usable elements is ignored, so a half-extracted model cannot under-count; the engine falls through to BOQ / manual / calculated. Imported `bim` rows in `plan_act_node_quantities` remain a fallback.
- **Screen** Activity Library > **BIM Quantities**: model picker, coverage per class, storey mapping with suggestions, and the class/unit -> metric rules.
- **Verified in the browser:** on the real extract the screen reports 0% usable for every class with an explanation (no false data). With a temporary synthetic model (3 storeys x 11 slabs, 10 with 18 m3; beams without quantities): slab class 91% = ready, beams 0% = not ready, storeys suggested `Level 1/2/3 -> 1F/2F/3F`, saved; preview gave 180 m3 per mapped level from BIM with reference "BIM TST Synthetic R1: 10 elements", the unmapped level stayed "missing quantity"; after dropping coverage to 55% the provider returned nothing. All test data removed.
- **Open:** wait for the pilot model from the Design/BIM team, then run their acceptance SQL and a walkthrough on real data; rebar and formwork-area metrics only matter once the template has steps that use them.

## 13. Phase 3.5 delivered (2026-10-13): AI assistance (advisory)
**Decisions applied:** off by default; monthly cap USD 50 (editable); only activity codes, names and numbers are sent (no people, rates or photos); model default `claude-sonnet-5-5` (organisation setting or `PLAN_AI_MODEL` can change it); prices for the budget are settings (default USD 2 / 10 per million input / output tokens).

**Schema** (migration `20261013000002`): `plan_act_ai_settings` (single row: switch, cap, per-call token limit, model, prices), `plan_act_ai_runs` (tool, model, prompt version, tokens, cost, outcome, what was sent as ids and counts), `plan_act_ai_suggestions` (recommendation, reason, source, confidence, affected records, required approval, machine payload, status), `plan_act_ai_decide()` (the only way to change a status) and `plan_act_ai_month_spend()`. Clients can only read; the server route writes.

**Pipeline** (`lib/planning/activity-library/ai/`, route `POST /api/planning/activity-ai`): read the context as the caller (row-level security) -> build a shortlist or findings deterministically (nothing to ask = no model call, no cost) -> gate (switch, key, monthly cap, size) -> structured-output call (`output_config.format`, effort low, server-side fallback) -> **validate everything against what was given** (an id outside the shortlist, an unknown finding id, or a number that is not in the data discards the suggestion) -> record the run and store only validated suggestions.

**The five tools:** `find_activity_master` (keyword shortlist, model re-ranks), `suggest_quantity_mapping` (BOQ shortlist by name/level/unit, model chooses; the level share is arithmetic from the BOQ text, not opinion), `suggest_productivity` (explains the 3.3 statistics; may not state a figure that is not in them), `detect_schedule_conflict` (deterministic findings, model prioritises), `explain_generation` (run counts, reasons, quantity sources, scenario). `suggest_recovery_plan` stays in 3.6.

**UI:** Activity Library > **AI Assistant** (switch, budget bar, settings, suggestions, call log with tokens and cost); run page panel (Explain this run, Check for conflicts, pending suggestions); **Ask AI** in the BOQ link dialog; **Find with AI** in the library; **Explain with AI** in a standard's site history. Every card shows recommendation, reason, source, confidence, affected records and required approval. **Accepting** a BOQ suggestion runs the normal BOQ link (override log rows carry source `ai_accepted` and the model's reason); all other kinds only record the decision.

**Verified (local database, signed-in user, scripted model):** off by default (0 model calls), no key, cap and size gates; a valid answer is stored, an invented number / finding id / activity id is dropped; no keyword overlap makes no call; refusal and truncation are recorded without a suggestion; spend is counted; a suggestion can be decided once. In the browser: settings page, run panel, accept (2 levels x 180 m3 from the BOQ line, audit rows `ai_accepted`), reject, and the "switched off" message from the library finder and the run panel. 15 unit tests cover the gate, cost, number and id validation, shortlist and findings.

**Not verified:** a live call to the model. This machine has no `ANTHROPIC_API_KEY`; set it on the server (and `PLAN_AI_MODEL` if you do not want the default) and try Explain this run on a real run before relying on it.

## 14. Phase 3.6 delivered (2026-10-13): recovery scenarios
**What it is:** advisory scenarios that bring the forecast finish back to a target (the baseline finish, N working days earlier, or a date). Every figure is measured by re-running the existing CPM engine on the live programme; nothing is estimated and **nothing changes the programme**.

**Levers** (`recovery-engine.ts`, pure, 12 tests; all measured one by one on the critical path):
- **Crew / second shift** on a critical, not-started, labour-driven activity (one with a productivity norm or generated from the library). Capped (default 20%), risk low up to the cap.
- **Expedite** for critical work crews cannot speed up (procurement, design, approvals): a management action, smaller cap (default 10%), medium risk. Found necessary on the real programme, whose critical path is procurement: adding crews to "Procurement Expediting" would be meaningless.
- **Method change** from the library: another method of the same activity whose productivity standard gives a shorter duration for the recorded quantity (draft standard = high risk).
- **Overlap (fast-track):** a critical finish-to-start link becomes start-to-start after half of the predecessor; highest risk.
Started, finished, manually scheduled and milestone work is never touched, and an activity gets at most one duration change.

**Search:** for each family (A resources, B methods, C expedite, D combined, E everything incl. overlap) a greedy search picks the lever that recovers most per step (ties: lower risk, smaller change) until the target is met; the **last lever is tightened to just enough**; families that would repeat another are skipped. Output per scenario: finish, working days recovered, days still missing (an honest "does not meet the target"), risk and the resource consequence in words.

**Where it runs:** `POST /api/planning/recovery` (server): about a third of a second per CPM run on 802 tasks, so the page shows a spinner instead of freezing the browser. Measured: 15 wd earlier about 5 s; 40 wd earlier about 33 s in the engine (55 s end to end in the browser run). The CPM engine itself is the bottleneck.

**Storage** (migration `20261013000003`): `plan_act_recovery_scenarios` (target, forecast and scenario finish, recovered / remaining days, risk, levers with the days each recovered, resource note, status proposed / adopted / dismissed). "Mark adopted" only records that the planner applied the change by hand.

**AI:** tool `suggest_recovery_plan` (kind `recovery`, target `project`). The server recomputes the scenarios, the model only recommends one and explains the trade-offs; the key must be one of the computed scenarios and every figure must be in the data; the stored payload comes from the engine, not the model. Accepting saves the scenario for discussion (Planning Manager) and does not touch the programme.

**UI:** Activity Library > **Recovery**: target and limits, summary tiles, scenario cards with their ordered changes, Copy change list, Save for discussion, Ask AI to recommend, and the saved scenarios.

**Verified on PRJ-2026-004-PC (802 tasks, 7 critical):** baseline mode says nothing to recover (forecast is ahead of baseline); 15 wd earlier = one 5% expedite on "Procurement Expediting" (339 -> 324 wd, recovers exactly 15); 40 wd earlier: expedite scenario recovers 34 wd, 6 still missing (reported as such); combined with one overlap recovers 38, 2 missing; copy, save, adopt and the "AI is off" message work; the programme stayed at 802 untouched tasks. Test data removed.

**Limits:** the delay register is empty locally, so the recovery works from forecast vs target/baseline, not from logged delay causes (the AI context can take them later); "crewable" is judged from norms/library membership, not from a trade list; one lever per activity (no stacking); greedy, not optimal; resource availability is described, not levelled; the overlap rule (start after half) is a fixed convention.

## 15. Wrap-up pass (2026-10-13): speed and logged delays
**Speed.** Profiling one CPM run on the 802-task programme showed ~90% of the time in two date helpers (`parseISO`, `toISO` in `work-calendar.ts`), not in the scheduling logic. They now build and read dates from their parts and remember parsed dates (bounded cache), with a fall-back to the original path for anything unusual (impossible days such as 2026-02-31 behave exactly as before; asserted by new tests that pin the old behaviour and compare against the original over 3,000 consecutive days). Result: **one CPM run 340 ms -> 82 ms, identical finish date**; the 40-working-day recovery analysis went from **55 s to about 15 s** end to end, the 15-day case from about 5 s to about 2 s. This also speeds every other schedule calculation (Gantt, Schedule command, delay analysis), which share the helpers.

**Logged delays in recovery.** `delay_register` entries that are open or disputed (resolved ones are ignored) are loaded read-only (`loadOpenDelays`, including linked tasks). The Recovery page shows a **Logged delays** card (count, total impact, top causes) and marks any change that touches an activity with a logged delay ("delay logged: <cause>"). The AI recovery context gets the same facts (entries, total impact, causes, and how many changes of each scenario touch delayed activities), so its recommendation can refer to them; figures still have to come from the data. With an empty register the page and the AI context say so instead of inventing causes. Verified with three temporary register entries on the 802-task project (two shown, the resolved one excluded, three badges on the levers); removed afterwards.

**Still open (Phase 3):** 3.4a IFC quantities from the Design/BIM team; a live check of the AI tools once `ANTHROPIC_API_KEY` is set (and Daily Reporting's forced `tool_choice` on `claude-sonnet-5-5` should be checked: that model rejects it).

## 16. Phase 3.4a built (2026-10-13): IFC quantities, storeys and clean takeoff rows
**Scope decision:** the extractor was assigned to the Design/BIM team (section 7); on 2026-10-13 the owner asked Planning to do it, so it was built in the BIM module (`lib/design/bim`, `components/design/bim`) and Planning consumes it.

**What was wrong (found by reading the code, not by running a real file):**
1. Quantity mapping only recognised a project parameter literally named "volume" (`BOQ_EXACT_FIELD_MAP`); the standard IFC base quantities (`NetVolume`, `GrossVolume`, `NetArea`, `NetSideArea`, `Weight` ... inside an `IfcElementQuantity`) were never mapped, so a standard export gave rows with no quantity or unit.
2. The storey came only from custom parameters ("Reference Level", "BOQLevel"); the IFC spatial structure and containment relation (which the viewer already builds) were never used for the takeoff.
3. Every record with a GlobalId was stored: about 30,000 of the 35,302 rows were relationship, property-set, type and group records, not elements.
4. No model-unit handling (a millimetre model would give values 10^9 too large for volumes), and no rebar quantity.

**What now happens on "Extract takeoff"** (`takeoff-quantities.ts`, `takeoff-extract.ts`, pure, 18 tests):
- **Elements only:** relationship / property-set / quantity-set / type / group / spatial / opening records are skipped and counted.
- **Quantities:** per element the standard quantities are read, **net before gross** (`NetVolume > GrossVolume > Volume`, wall side area before footprint, `NetWeight > Weight`), typed quantity sets before same-named properties; the model's length unit (`IFCSIUNIT` prefix, or feet / inches) scales values to m3 / m2 / m / kg; rebar weight is derived from `BarLength` and section (7850 kg/m3) when none is stored. The primary quantity goes in the table's `quantity` / `unit` columns; the other quantities of the element (slab area next to slab volume, with their units) go in `raw_properties._quantities`, and `_quantity_basis` records where the figure came from.
- **Storey:** the containment relation, else the spatial tree, else the bounding-box storey the viewer computes; `_level_source` records which. A project's own parameters still win over everything, so existing conventions are unchanged.
- **Honest gaps:** an element with nothing to measure stays as a visible row with no quantity (never a guess); if no length unit is found, metres are assumed and the toast says so.
- **Report:** the toolbar message states elements, % with a quantity, % with a storey, skipped records, assumptions.
- **Clean-up:** after saving (in batches of 2,000), a final request prunes the old non-element rows of that model; **a row that a BOQ promotion uses is never removed**.
- **Planning side:** the loader reads `_quantities`, coverage counts an element that has any quantity, and the provider answers `slab_volume` and `slab_area` from the same slabs.

**Verified:** 18 BIM tests + 3 Planning tests on fixtures of the documented item-data shape; and an end-to-end run on the local database with a synthetic millimetre model (extractor rows saved through the BIM service, junk pruned while a promoted row was kept, Planning coverage and provider: 54 m3 and 270 m2 for three slabs on level 1, reference "BIM TST Extractor R1: 3 elements"). Test data removed.

**NOT verified, and this matters:** against a real IFC file. The local database holds no model files (storage was not copied) and the models' URLs point at the production bucket, which this work does not touch. The item-data shape comes from the library documentation and the existing viewer code. **Next step for the owner: open "KOMB - Test 004" (or any model) in the viewer, press Extract takeoff, read the toast, then open Activity Library > BIM Quantities.** If coverage is low, the toast and `_quantity_basis` / `_level_source` show what the export lacks (for example Revit's "export base quantities" option off). The 35,302 existing rows of that model stay as they are until that button is pressed.
