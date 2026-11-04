# 21 — Planning ↔ QS Bridge: Quantity-Driven Duration

Status: **Design, for decision** · Drafted 2026-10-20 · Input: `docs/Standard_WBS_Planning_and_QS_Modules.xlsx` (Planning WBS standard, QS WBS standard, Bridge Mapping, Productivity Library, Integration Rules).
Readers: Planning Manager, QS Manager, Project Controls, developers.

Goal: an activity's duration is **calculated** from the QS quantity at its location and an approved productivity standard, and stays traceable to the BOQ lines it came from:

```
Duration (wd) = Σ QS quantity (this element, this location) × unit factor ÷ (output per crew-day × crews) × factors
```

---

## 1. The workbook in one picture

| Workbook concept | Meaning | Answers |
|---|---|---|
| Planning WBS (sheet 01) | Location + sequence tree: Project › Phase › Building › Floor › Work Group › Activity | WHEN / WHERE |
| QS WBS (sheet 02) | Product / element tree: QS-1 Prelims … QS-7 Provisional | WHAT / HOW MUCH |
| Bridge Mapping (sheet 03) | Planning Type Code (e.g. `BA-nF-ST`) ↔ QS Bridge Code (e.g. `QS-3.1`), with a duration-driver flag | The join |
| Productivity Library (sheet 04) | Output per crew-day per trade and unit (P01–P25) | Qty → days |
| Integration Rules (sheet 05) | Keep both trees separate, join by keys, allocate quantities by location, calibrate after 1–2 floors | Governance |

The workbook's core rule is right: **do not merge the two trees; connect them with keys.** The design below keeps that, and maps every workbook concept onto something DCOS already has, so we add keys and rules, not a third structure.

---

## 2. What DCOS already has (verified on the local DB, 2026-10-20)

| Workbook concept | DCOS today | State |
|---|---|---|
| Planning WBS tree | `wbs_nodes` (`node_type` building/level/…, `level_type`, `area_label`, `cost_code`) + `wbs_tasks` (Level 5 activities); WBS templates + Level Library build it | In use. PJR-2026-003 has `BA` › `00.UG … 13.RF`. **No Work Group level (ST/AR/M1/M2/QA)** in the generated trees. |
| QS WBS (QS-1…QS-7) | **Budget Codes** (85 rows, groups A–G) + **QS Element Library** (518 rows: Discipline › Section › Sub Section › Sub Element, typical unit, budget code). Tender BOQ lines carry `discipline, section, sub_section, sub_element, budget_code_id` | In use. The 841-line BOQ of PJR-2026-003 is classified on every line. |
| Location-allocated quantity | `tender_boq_items.building_code` + `.level` | **Already allocated**: all 852 lines have building `BA` and a level (`02.GF`, `04.1F` … `All`). |
| Activity (what is done) | **Activity Master library** `plan_act_masters` (70 masters, e.g. `STR-RC-COL-001 Column Reinforcement`, ton) with methods, quantity rules, logic rules, templates, generation runs | Built on branch **`feat/activity-library`** (not merged; tables exist on the local DB, code is not on `feat/projects-redesign` / `main`). |
| Productivity Library | `plan_productivity_norms` (+ crew resources, factors, versions, approval, calibration from site logs) | Built; norms can link to an Activity Master. |
| BOQ → activity quantity | `plan_task_work` (one BOQ line per task) and, on the branch, `plan_act_quantity_links` (node + metric ← many BOQ lines × share) with drift detection | Linking is **manual, line by line** (ranked text suggestions). This is the gap. |
| Steps inside an activity | Activity Step Templates (fixed/scaled duration spread over the activity duration) | Built 2026-10-20. |

**Conclusion:** the two "templates" exist. What is missing is the **standard bridge** that lets the system link them by rule instead of by hand, plus a **location bridge**, because the BOQ and the WBS name the same floors differently.

---

## 3. Design decisions (recommended)

### D1. QS side: no new QS-x codes; the standard is Budget Code + Element Library
The workbook's `QS-3.1.6 Reinforcement` is coarser than what DCOS already records (`Super Structure › Structural Column › Rebar`), and the norms need the finer grain (column rebar 1.0 t/day vs slab rebar 2.5 t/day, P05 vs P07). Adding a parallel QS-x list would reintroduce the naming drift the Element Library exists to prevent.
→ **QS Bridge Key = Element Library entry** (Discipline › Section › Sub Section › Sub Element). The workbook's `QS-x.y` code can be stored as an **alias** on Budget Codes for reports that want the workbook numbering.

### D2. Planning side: the Activity Master is the hub; Type Code is derived, not stored
`BA-3F-ST` = building code `BA` + level code `3F` + work group `ST`. All three already exist (or will: see D4) on the WBS nodes above the activity, so the Type Code is **computed** for display/export. The duration key is finer than the Type Code: **Activity Master + WBS level node.**

### D3. The bridge is a company standard, held at Activity Master level
One table of rules, maintained by Project Controls, says which QS elements feed which activity and how units convert:

| Activity Master | ← QS Element (Sub Section › Sub Element) | Unit factor | Role |
|---|---|---|---|
| STR-RC-COL-001 Column Reinforcement (t) | Structural Column › Rebar (kg) | 0.001 | driver |
| STR-RC-COL-002 Column Formwork (m²) | Structural Column › Formwork (m²) | 1 | driver |
| STR-RC-COL-003 Column Concrete (m³) | Structural Column › Concrete (m³) | 1 | driver |
| — | Structural Column › Steel Tie Wire (kg) | — | **excluded** (material, not a duration driver) |
| ARC Blockwork (m²) | Interior/Exterior Wall › Hollow clay brick … (m²) | 1 | driver |

Cardinality follows workbook rule 5: one activity ← many elements (summed after unit conversion); one element → many activities only through location (floors). The workbook's coarse sheet 03 mapping (`BA-nF-ST ↔ QS-3.1`) becomes a **coverage check** derived from these rules (every work group's elements accounted for), not a second set of links.

### D4. Add the Work Group level to the Planning standard
Sheet 01 Level 4 (`ST`, `AR`, `M1`, `M2`, `QA`, plus `EW`, `FD`, `WP`, `ME` for basement/roof) becomes a `work_group_code` on WBS nodes, produced by WBS templates under each level. Each Activity Master gets a default work group, so generated activities land in the right group and the Type Code can be derived.

### D5. Location bridge per project, auto-matched
BOQ levels and WBS levels are numbered differently on the same project (PJR-2026-003: BOQ `04.1F` vs WBS `03.1F`; BOQ `13.10F`, `14.TR` vs WBS `12.TF`, `13.RF`). A per-project **location map** (`building_code + level label` → WBS level node) is auto-filled by matching the level suffix (`1F`, `GF`, `MZ`), and the QS/Planner confirms the leftovers once. Lines with level `All` (project-wide) need an explicit split rule: by GFA share, equal per level, or not duration-driving.

### D6. Duration basis per activity (the workbook's "Duration Driver?" column)
Each Activity Master carries `duration_basis`:
- `quantity` (workbook "Yes"/"Medium"): duration from the bridge quantity and norm;
- `fixed` (inspection, testing, curing): duration from the master or template;
- `programme` (design, procurement lead time, handover; workbook "No"): planner-entered, never recalculated.

### D7. Calculated, previewed, then applied: never silent
Same rule as Task Work and Re-spread: the engine proposes quantity and duration with its trace (which BOQ lines, which factor, which norm version); the planner applies in bulk; locked/started activities are skipped; every change is audited.

---

## 4. Data model (additions only)

| Table / column | Purpose |
|---|---|
| `plan_act_qs_bridge` (company) | `master_id`, `quantity_rule_id` (metric), QS match: `discipline`, `section`, `sub_section`, `sub_element` (nullable = wildcard) or `element_library_id`; `unit_from`, `unit_to`, `unit_factor`; `role` (`driver` / `excluded`); `priority`; `note`; lifecycle as other `plan_act_*` rows. |
| `wbs_nodes.work_group_code` | `ST`, `AR`, `M1`, `M2`, `QA`, `EW`, `FD`, `WP`, `ME`, `SP`… (check list from sheet 01). |
| `plan_act_masters.default_work_group`, `.duration_basis`, `.default_step_template_id` | Where the activity lands, how its duration is set, which step template it gets. |
| `plan_location_map` (project) | `project_id`, `building_code`, `qs_level_label`, `wbs_node_id`, `match` (`auto`/`confirmed`), `split_rule` for `All`. |
| `budget_codes.workbook_alias` (optional) | `QS-3.1` etc. for workbook-style reports. |
| `plan_act_quantity_links.source` += `bridge_rule`, `+ bridge_id` | Rule-generated links are distinguishable from hand links and re-derivable when the BOQ changes. |

Everything else (masters, norms, factors, quantity rules, generation runs, quantity links, `plan_task_work`, step templates) is reused as is.

---

## 5. Calculation pipeline

```
Tender/Project BOQ line ──(element)──► Bridge rule ──► Activity Master + metric
        │                                    │ unit factor, driver/excluded
        └──(building + level)──► Location map ──► WBS level node
                                                    │
Activity = (Activity Master, WBS level node) ◄──────┘
   quantity  = Σ line qty × unit factor × share         (trace: plan_act_quantity_links, source bridge_rule)
   norm      = newest approved standard for the master (draft allowed, flagged)
   duration  = ceil(quantity ÷ (output/day × crews) × Π factors)     → plan_task_work.duration_wd_derived
   steps     = default step template, spread over the duration        (Activity Step Templates)
   dates     = CPM engine after the planner applies
```

**Worked example from real data** (PJR-2026-003, level `02.GF`, columns):
- Rebar: 10,516.48 + 1,921.92 + 3,061.26 kg = 15,499.66 kg × 0.001 = **15.50 t**; workbook P05 column rebar 1.0 t/day per 8-man crew → 15.5 crew-days → **8 wd with 2 crews**.
- Formwork: 221.76 m² ÷ P08 40 m²/day → **6 wd** (1 crew).
- Concrete: 45.86 m³ ÷ P10 80 m³/day → **1 wd** (pump-limited).
- Steel tie wire 619.99 kg: excluded by rule, no activity.

---

## 6. Review of the workbook (fix before it becomes the standard)

1. **Rebar grain.** `QS-3.1.6 Reinforcement` is one item while the library has per-element rates (P05/P06/P07). DCOS BOQ already splits rebar per element; keep that (D1).
2. **Units.** BOQ rebar is in **kg**, norms in **tonne**. The bridge must carry a unit factor; a missing factor must block the link (`unit_mismatch`), not be guessed.
3. **Non-driver lines.** Tie wire, embedded items, admixtures sit under the same element as the driver. They need an explicit `excluded` role, or they inflate quantities.
4. **Level naming.** The workbook uses `BA-1F…`; the Level Library holds both `L01` and `1F` styles, and the BOQ adds a running number (`04.1F`). Pick one level code standard for new projects (recommend `GF`, `1F`…`nF`, `MZ`, `RF`, `B1`, `UG`) and keep the location map for old data.
5. **Workbook Level 4 vs activities.** Sheet 03 bridges at Work Group level (`BA-nF-ST ↔ QS-3.1`). Durations need activity level (column rebar ≠ slab concrete). Use sheet 03 as the coverage check (D3), not the link.
6. **Productivity figures.** P01–P25 are indicative (the workbook says so). Load them as **draft** company standards, calibrated after the first 1–2 floors through the existing site-history calibration.
7. **"Limited by pump / batching" (P10).** That is an equipment cap, not a labour rate. Model as a productivity factor or equipment constraint (both exist), not as a lower labour output.
8. **Project-wide lines (`All`).** 24 BOQ lines have no level. Each needs a split rule or is marked non-driving.

---

## 7. Phased plan

| Phase | Scope | Done when |
|---|---|---|
| **0. Decide + merge** | Answer §8. Merge `feat/activity-library` into the working line (19 migrations, ~10k lines). Its tables already exist on the local DB. | Branch merged, migrations replay, tests green. |
| **1. Standards data** | `plan_act_qs_bridge`, `work_group_code`, master `duration_basis` / `default_work_group` / `default_step_template_id`. Seed the bridge for the 70 masters from the Element Library + sheet 03; seed P01–P25 as draft norms; bridge editor page (Activity Library › QS Bridge). | Every driver element in the PJR-2026-003 BOQ maps to a master or is marked excluded; coverage report shows 0 unmapped driver lines. |
| **2. Location map** | `plan_location_map`, auto-match by level suffix, confirm screen, `All` split rules. | PJR-2026-003's 15 BOQ levels map to its 14 WBS levels, with exceptions confirmed. |
| **3. Auto-link + calculate** | Engine: BOQ × bridge × location → quantity links (`bridge_rule`) → `plan_task_work` → derived duration; preview with trace; bulk apply; drift on BOQ change. Works for **generated** activities and for **existing** schedules (tag existing tasks with masters by name, as the step-template matcher does). | Column rebar/formwork/concrete per level of PJR-2026-003 show the §5 figures with BOQ trace. |
| **4. Steps + schedule** | Default step template assigned at generation; steps spread over the calculated duration; CPM re-run; compare to baseline (workbook step 4). | Variance report: calculated vs baseline duration per activity. |
| **5. Calibration loop** | Site logs → calibrated norm proposals (exists on branch) reviewed after floors 1–2 (workbook rule 7). | One norm re-versioned from site data; next calculation uses it. |

Test project: **PJR-2026-003** (841 classified, level-allocated BOQ lines; WBS levels exist, 0 activities). PRJ-2026-004-PC has activities but no BOQ, so it cannot prove the bridge.

---

## 8. Decisions (answered 2026-10-20)

1. **Merge `feat/activity-library` first** and build on it. → **Yes** (merged into `feat/projects-redesign`, commit `72b2097`).
2. **QS key = Element Library**; QS-1…QS-7 only as a report label. → **Yes** (the optional `budget_codes` alias column was not added; add it when a report needs it).
3. **Add the Work Group level** (`ST/AR/M1/M2/QA` …) under floors. → **Yes**.
4. **Level code standard** for new projects. → **`G00, L01…` (Level Library style)**, i.e. `B01…`, `G00`, `M01…`, `L01…Lnn`, `R00`, `PH01…`. Type Code example: `BA-L03-ST`. The location map (Phase 2) translates BOQ labels such as `04.1F` / `02.GF` and old WBS codes such as `03.1F` to these.
5. **Ownership** as the workbook proposes. → **Yes**: Planning Manager owns WBS and masters, QS Manager owns elements and quantities, Project Controls owns the bridge and location maps.

## 9. Phase 0 + Phase 1 delivered (2026-10-20, local DB)

- **Phase 0:** `feat/activity-library` merged (clean, no conflicts with the 9 newer commits; its 11 migrations had already been applied to the local DB by hand). Typecheck, lint (0 errors) and 837 tests green after the merge.
- **Migration `20261020000003_planning_qs_bridge.sql`:** `plan_work_groups` (EW, FD, ST, WP, AR, M1, M2, ME, QA) + `wbs_nodes.work_group_code`; `plan_act_masters.duration_basis` / `default_work_group` / `default_step_template_id`; `plan_act_qs_bridge` (match on Discipline / Section / Sub Section / Sub Element / unit, `unit_factor`, role driver/excluded; view all, manage = Master Library managers).
- **Seed `supabase/seeds/seed_planning_qs_bridge.sql`** (idempotent, verified by re-running): 10 draft masters for elements the BOQ measures but the library lacked (Beam, Stair, Pile Cap rebar/formwork/concrete; Blockwork); work group + duration basis on all 80 masters (10 lot activities are `fixed`); default step templates on 24 finish/MEP masters; 47 quantity rules; 73 bridge rules (structure, architecture, MEP by Element Library names, exclusions); workbook P03–P23 as 23 **draft** company norms with crew lines (pump line on pours).
- **Engine** `lib/planning/activity-library/qs-bridge.ts` (pure, 8 tests): most-specific-rule matching, case/space-insensitive, one line → several metrics, exclusions, unit mismatch reported never converted, coverage report. Service `qs-bridge-service.ts`.
- **UI:** Activity Library › **QS Bridge** — project BOQ coverage (counts, quantity per metric with the activities that use it, unmapped groups with one-click "Rule") and the rule editor.
- **Coverage on PJR-2026-003 (841 BOQ lines):** 694 feed a metric used by an activity (e.g. column rebar 130.40 t, slab concrete 1,093.22 m³, blockwork 10,331 m²), 81 excluded, 66 unmapped, 0 unit mismatches. Unmapped = elements with no master yet: bored piles, septic tank, structural steel roof, parapet, earthwork, handrails, anti-termite, façade, plus 9 unclassified placeholder lines. Metrics with no master yet: external plaster and external paint.
- **Assumptions to review (QS / Planning):** slab rebar split 50/50 bottom/top; workbook rates are indicative; HVAC ductwork has no bridge rule (library measures GI ductwork in kg, the master in m²).
- **Not done (Phase 2 next):** location map (BOQ `building + level` → WBS level node), then the per-level calculation that writes quantity links and Task Work. UI not yet exercised in a browser.

## 10. Phase 2 delivered (2026-10-20, local DB): location map

- **Migration `20261020000004_plan_location_map.sql`:** `plan_location_map` (project, BOQ `building_code` + `qs_level_label` → `wbs_node_id`; status `confirmed` / `ignored`; `split_rule` `none` / `equal` / `gfa` for project-wide lines). RLS: project members read; write needs planning/schedule edit (same as quantity links). Verified: admin can write and read; a non-member sees 0 rows and an insert is refused.
- **Engine** `lib/planning/activity-library/location-map.ts` (pure, 9 tests): `canonicalLevel` reads BOQ labels, WBS codes and names into the decision-4 standard (`04.1F`/`03.1F` → `L01`, `02.GF`/"Ground Floor" → `G00`, `01.UG` → `B01`, `MZ` → `M01`, `RF` → `R00`, `PH1` → `PH01`); it refuses to guess `TF`, `TR`, `LG`. `suggestLocationMap` (saved decisions first, then exactly-one-match suggestions, single-building tolerance for blank codes). `allocateLine` gives a BOQ line's level shares from **saved decisions only**: one level, or project-wide lines split equally or by level GFA (equal when no GFA).
- **Service** `location-map-service.ts` (levels with their building code, level GFA, saved decisions, upsert, reset).
- **UI:** QS Bridge › **Location map** tab: each BOQ location with what it reads as, its line count, a WBS level picker (or split rule for project-wide lines), status, confirm / ignore / undo, "Confirm N suggestions", and the WBS levels no BOQ location points to.
- **PJR-2026-003:** 16 BOQ locations → **13 suggested correctly** (UG, GF, MZ, 1F–9F, RF), **2 for the planner** (`13.10F`: the WBS has no 10F, only `12.TF`; `14.TR`: no reading), **1 project-wide** (`All`, 13 lines; GFA is recorded on 11 of 14 levels). Nothing is confirmed yet: confirming is the planner's step.
- **Next (Phase 3):** per activity (master × level) quantity = Σ bridge contribution × `allocateLine` share → quantity links (`bridge_rule`) and `plan_task_work` → duration preview and bulk apply.

## 11. Phase 3 delivered (2026-10-20, local DB): per-level quantities and durations

- **Approach:** the bridge writes ordinary `plan_act_quantity_links` rows, so the merged engine does the rest unchanged: the BOQ provider reads them (live BOQ quantity × factor), **Generate** turns them into durations and Task Work, the drift check flags BOQ revisions, and the Quantity Links page lists them.
- **Migration `20261020000005_quantity_links_bridge_source.sql`:** `source` (`manual` / `bridge_rule`), `bridge_rule_id`, `metric_unit` (so a kg line × 0.001 reports t). `aggregateBoqLinks` uses `metric_unit`; the Quantity Links page shows a "Bridge" badge, the factor as ×0.001 (not 0.1 %) and the converted unit.
- **Engine** `bridge-calc.ts` (pure, 7 tests): `computeBridgeLinks` = bridge classification × confirmed location shares → one link per (level, metric, BOQ line) with factor = unit factor × share; level/metric pairs a planner linked by hand are skipped; driver lines at unconfirmed locations are counted, not guessed. `buildPreview` / `previewDays` use the same productivity engine and rounding as generation.
- **Service** `bridge-calc-service.ts`: `loadMasterRates` (the standard generation picks: default method, approved before draft, newest version, × factors), `applyBridgeLinks` (replaces the project's `bridge_rule` links only), `refreshTaskWorkFromLinks` (existing activities with an Activity Master get their level's quantity in Task Work as source `import`; a hand-typed quantity is kept).
- **UI:** QS Bridge › **Quantities & durations**: matrix activity × confirmed level (quantity and one-crew days, rate and norm per row, draft / missing-rate flags, unallocated lines), **Apply quantities**, then a link to Generate.
- **Template fix (seed section G):** `TPL-STR-HR-RC-FLOOR-001` (draft) carried fixed placeholder durations from before quantities existed, and a fixed duration wins over the calculated one. Cleared where the master now has a quantity rule and a standard (slab bottom/top rebar, shear-wall concrete); kept for survey, MEP embedded, pre-pour inspection (fixed by nature) and shear-wall rebar/formwork (no rate yet).
- **Verified end to end on PJR-2026-003** (test decisions and links removed afterwards): 13 suggested locations confirmed → 633 links in 40 ms (84 driver lines left at the unconfirmed 10F / TR / All). Ground floor: column rebar 15.50 t → 16 d (1 crew, P05), column formwork 221.76 m² → 6 d, blockwork 220 m² → 8 d, plaster 226 m² → 5 d. **Generate preview on 1F** now reads source `boq` in metric units: slab rebar 5.84 t → 3 d, slab concrete 87.15 m³ → 2 d, slab formwork 581 m² → 5 d, shear-wall concrete 23.43 m³ → 1 d. **Existing activity** (temporary column-rebar task on GF): Task Work 15.5 t, reason "QS Bridge: BOQ B.04.022 ×0.001 + …", calc ok, 992 man-hours, 16 wd at 8 men.
- **Gaps that need Planning / QS, not code:** no productivity standard yet for stair, shear-wall rebar/formwork, doors, windows, ceiling (rows show "no productivity standard"); the RC floor template covers slabs and shear walls only, so columns, beams, stairs and finishes are calculated but not generated until a template includes them; location decisions for PJR-2026-003 (10F, TR, All) are still open.
- **Not done:** tagging activities of existing schedules (e.g. PRJ-2026-004-PC) with Activity Masters, so Task Work refresh has something to update; UI not yet exercised in a browser.

## 12. Gap closed (2026-10-20): full typical-floor template

- **Seed `supabase/seeds/seed_typical_floor_template.sql`** (idempotent): draft template **`TPL-BLD-TYP-FLOOR-001` "Typical Floor – Full Cycle (Structure, MEP, Finishes)"**, 47 activities and 63 links per floor:
  structure (setting out → column + shear-wall rebar → formwork → concrete → slab + beam formwork → beam rebar, embedded MEP, slab bottom/top rebar, stair formwork/rebar → pre-pour hold point → slab pour with beams and stairs cast together → finishing → curing → stripping +3 d), MEP first fix after stripping, finishes (blockwork → plaster after in-wall first fix → waterproofing → screed / wall tiling → floor tiling; ceiling after ceiling-void services; frames, windows; painting), MEP second fix, door leaves last. **Next floor's setting out = 1 working day after this floor's slab pour** (inter-level link 17 → 1). Applicability as the RC floor template (reinforced concrete, typical floor). Only survey, MEP embedded and pre-pour inspection carry fixed durations; every link points backwards, so the template editor accepts it.
- **Proxy rates (bridge seed section G):** 8 draft standards for structural activities the workbook has no figure for, each naming its proxy (shear / core wall rebar ≈ P05, wall / core / stair formwork ≈ P08, stair rebar ≈ P06, core / stair concrete ≈ P10). Section H (placeholder clearing) now runs last, so the RC floor template's shear-wall rebar/formwork placeholders were cleared too.
- **Generate preview, PJR-2026-003, nine typical floors 1F–9F** (temporary links, removed afterwards): 423 activities, applicable; 216 durations from BOQ quantity (all draft standards), 27 fixed, 180 without a duration. 1F structure: column rebar 15.5 t → 16 d, beam rebar 15.5 t → 13 d, beam formwork 447 m² → 6 d, slab formwork 581 m² → 5 d, slab rebar 5.84 t → 3 d each, slab pour 87 m³ → 2 d, stairs 1–2 d; finishes: blockwork 1,018 m² → 34 d, plaster 1,120 m² → 23 d, painting → 14 d. CPM (Mon–Sat, **one crew per activity**): slab pour every ~38–45 working days, ~105–135 working days per floor including finishes; no loops.
- **What the preview says to fix next (data, not code):**
  1. **Crews.** Durations are for one crew; a 45-day structural floor cycle comes from single crews on column/beam rebar. Planners size crews in Task Work (2–3 rebar gangs bring the cycle to ~2 weeks); a default crew count per template item would make generated cycles realistic from the start.
  2. **MEP quantities.** This tender BOQ has no Element-Library-classified MEP lines, so all 14 MEP activities show "missing quantity". A classified MEP BOQ (bridge rules exist) fills them.
  3. **Missing rates:** ceiling framing / boards, door frames / leaves, windows (quantities exist, no standard); waterproofing and screed have no per-floor BOQ quantity; HVAC ductwork still needs its kg → m² decision.

## 13. Default crews per template activity (2026-10-20)

- **Migration `20261020000006_template_item_crews.sql`:** `plan_act_template_items.crews` and `plan_act_generation_items.crews` (default 1, 0 < crews ≤ 50); `plan_act_commit_generation` stores the item's crews; `plan_act_link_run_work` writes them to `plan_task_work.crews`, so Task Work's man-hours, crew size, derived duration and labour loading agree with the generated schedule.
- **Engine:** generated duration = quantity ÷ (output per crew-day × crews); the stored rate stays per crew. A fixed template duration ignores crews. Quantity overrides and BOQ re-sync on the run page recalculate with the item's crews; the recovery engine compares alternative methods at the task's current crews (like for like). 2 new planner tests.
- **Template editor:** a "crews" field next to the fixed duration (disabled when a fixed duration is set); read-only view shows "calculated · N crews".
- **`TPL-BLD-TYP-FLOOR-001` starting crews** (seed, only while an item is still at 1): column and beam rebar 4 gangs, slab rebar 2, formwork 2, stripping 2, pours 1 (pump-limited); blockwork 4, plaster 3, tiling / painting / ceilings 2; MEP left at 1 (no MEP quantities to size against yet).
- **Effect on PJR-2026-003 (preview + CPM, Mon–Sat, temporary links removed afterwards):** structural floor cycle **19 working days** (was ~43 with one crew); 1F column rebar 15.5 t × 4 → 4 d, beam rebar × 4 → 4 d, slab formwork × 2 → 3 d, blockwork 1,018 m² × 4 → 9 d, plaster × 3 → 8 d; nine typical floors poured by 2027-07-22 and finished by 2027-08-26 (was 2028-05-27). Commit path checked in a rolled-back transaction: 4 crews reach Task Work, 992 man-hours, derived 4 wd = generated 4 d.
- **Generate attaches step templates (same day):** after a run commits, every new activity whose master has an active `default_step_template_id` gets those steps through the Apply-to-Activities engine (`attachDefaultStepTemplates` in `lib/planning/step-template-bulk-service.ts`), spread over its calculated duration (Task Work's crew-derived duration). It runs after the commit transaction on purpose: a failure leaves the generated schedule and tells the planner. Steps have days but no dates until the schedule gives the activity dates; the step panel then shows **Re-spread** ("the activity now has dates; the steps don't yet"). Verified on GF of PJR-2026-003 with temporary tasks: blockwork 9 wd @ 4 crews → 6 steps (fixed setting out 1 d + inspection ½ d, 7.5 d shared); plaster 8 wd @ 3 crews → 6 steps; column rebar (no step template, split structural master) → none.
- **Next lever (Planning Manager's call):** the 19-day cycle is the pure finish-to-start chain setting out → column rebar → formwork → concrete → slab formwork → slab rebar → hold point → pour. Faster cycles need overlap in the template logic (e.g. slab formwork start-to-start with column concrete, beam rebar overlapping slab rebar), not more crews.
