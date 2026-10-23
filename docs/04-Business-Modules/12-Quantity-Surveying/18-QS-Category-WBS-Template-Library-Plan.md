# QS Category WBS Template Library — Suggestion Plan

**Status:** Implementation in progress  
**Date:** 2026-10-21  
**Scope:** Quantity Surveying / Cost & Estimation, reusable WBS templates, and Planning WBS integration  
**Category source:** `docs/04-Business-Modules/04-02-Project-Setup/Project Categories.md`

**Execution update:** Initial category applicability and QS-to-Planning template association foundation implemented; local migrations `20261021000016` through `20261021000021` applied. Category-aware template recommendation is present in the QS tender apply flow. QS template applications snapshot the source template/items/locations, record the applying user and generated count, and link generated BOQ lines to the application record. QS template lifecycle now supports draft, published, superseded, and archived states; publication freezes version content and applying a non-published template is rejected. QS scope rows and location patterns now have explicit kinds; actual project levels, routes, chainage segments, and assets remain in the existing operational WBS/location model. Category-family approval, item-level mapping review, starter family templates, authoring UI, and project workflow integration remain open.

## Resume handoff — 2026-10-22

This plan is not complete. Resume from the remaining work below; do not treat the foundation migrations as approved QS/Planning standards. Phases 0–2 have meaningful implementation but still have open decisions and verification. Phase 3 has no reviewed starter libraries yet. Phases 4–5 have early QS recommendation, association, and provenance foundations, while their complete preview/apply and Planning workflows remain open. Phase 6 governance and rollout work has not started.

| Phase | Current state | Main remaining work |
|---|---|---|
| 0 — Align standards and inventory | In progress | Inventory templates, apply behavior, operational WBS/location fields, QS bridge records, permissions, and compatibility; record the architecture decision and unresolved gaps. |
| 1 — Category coverage | In progress | Define only structure-changing questions, multi-category composition, custom/legacy fallback, and obtain QS/Planning review of the initial family matrix. |
| 2 — Data/content model | In progress | Decide module composition and bridge-rule ownership; finish compatibility, project pinning, authoring/version UI, linear integration, RLS/audit/deletion rules, and architecture verification. |
| 3 — Starter libraries | Not started | Agree reference projects and assumptions, author representative templates for all families, map only reviewed content, then record QS/Planning approvals. |
| 4 — QS recommendation and preview | In progress | Recommendation entry point exists. Finish explanation/attribute handling, version and module choice, coverage/conflict preview, saved choice, recovery states, and workflow verification. |
| 5 — Planning apply and location bridge | In progress | QS↔Planning associations and QS application provenance exist. Implement Planning WBS preview/merge, linear location mapping, quantity traceability, version-change handling, and building/linear end-to-end verification. |
| 6 — Governance and rollout | Not started | Define roles/approvals, audit and release notes, pinning/deprecation policy, migration guidance, operational reporting, and pilot signoff. |

### Suggested continuation order

1. Complete the Phase 0 inventory and record the source-of-truth/compatibility decisions before expanding schema.
2. Close the Phase 1 custom/legacy category path and identify decisions that require QS/Planning owner review.
3. Resolve Phase 2 module composition and `plan_act_qs_bridge` ownership; then finish compatibility, authoring/version workflow, project pinning, and the RLS/audit review.
4. Build Phase 3 starter templates from approved reference scope. Keep unreviewed mappings marked as unmapped or proposed.
5. Complete Phase 4 and Phase 5 previews and workflows, then Phase 6 governance, rollout, and pilot.

QS/Planning approval, family-boundary decisions, and representative project references are stakeholder inputs. Keep those items visible as pending instead of assuming approval during implementation.

## 1. Purpose

Provide QS and project teams with reusable, versioned WBS templates matched to the project's sector and building type. A selected template should help structure the estimate and provide a predictable starting point for the operational WBS in Planning. QS quantities, cost elements, and planning locations must remain separately managed and connected through stable mappings.

The intended flow is:

```text
Project category → suggested WBS profile/template → QS scope and BOQ mapping
                                      ↓
                         Planning WBS preview and apply
                                      ↓
                 BOQ/location links → planning activities
```

## 2. Findings from the current design

### Existing foundations to reuse

- The project taxonomy stores a sector in `projects.category` and the leaf category in `projects.building_type`. The standard list covers 33 building and infrastructure types across Residential, Commercial, Industrial, Institutional, and Infrastructure.
- WBS templates already have `template_category` (sector) and `building_types` applicability, an active/versioned lifecycle, and project matching context. The apply path supports a previewable selection and merge behavior.
- WBS template content includes reusable sections, building anchors, floor blocks, and template activities. Activity masters can be linked when templates are applied.
- QS Element Library and Budget Codes classify what is measured and costed. BOQ items can reference WBS nodes, and the Planning–QS bridge already defines an explicit element-to-activity bridge and a project location map.

### Design gaps to resolve

1. **The template content model is building-oriented.** Sections and repeated floor blocks suit buildings. Roads, bridges, drainage, water supply, and utility projects need alignments, chainages, reaches, structures, systems, or assets. Do not model these as fake floors.
2. **A QS WBS and Planning WBS answer different questions.** QS structure groups scope and quantities; Planning WBS locates and sequences delivery. Combining them would make either tree awkward and create category-specific duplication.
3. **Category coverage is broader than template count should be.** Thirty-three category-specific copies would drift. Many categories share a construction delivery pattern and can use a common family with optional packages and scope modules.
4. **QS-to-planning matching is not the same as template application.** The bridge design already calls for Element Library-to-Activity Master rules and a separate BOQ building/level-to-WBS location map. Template selection should establish useful identifiers and structure, while the bridge continues to map quantities and locations.
5. **The QS BOQ design describes optional direct WBS node linkage, but the live tender flow also uses building and level labels.** The design should support both direct WBS assignment and the explicit location-map workflow, avoiding a second competing mapping system.

## 3. Recommended design principles

1. **Keep the QS scaffold and Planning WBS template as linked libraries.** The repository already has `qs_wbs_templates` for estimate-line/location scaffolding and `wbs_templates` for operational delivery structure. These represent different trees and should not be collapsed into one catalog. Avoid creating a third template catalog; add explicit, version-aware links between the two where needed.
2. **Templates are delivery structures, not cost codes.** Use stable node keys and template/version identifiers. Keep QS element IDs, budget codes, and activity master codes as separate entities connected through explicit mapping records.
3. **Map by applicability, not one-template-per-category.** A template family may apply to many categories; a category may offer multiple profiles where scale or scope changes the structure.
4. **Compose at the package level.** A mixed-use or multi-block development can combine building, infrastructure, and external works packages under one project WBS rather than selecting one “dominant” template for everything.
5. **Preserve stable keys and snapshots.** Display names and codes can change under governance; links should refer to immutable node keys and pinned template versions. Applying a newer version must never silently reshape an existing project WBS.
6. **Use controlled defaults.** Category and project attributes recommend a template. Users confirm profile, package scope, and optional modules before applying.

## 4. Template family proposal

Start with a small set of reusable delivery families, then fill the applicability matrix for all 33 category slugs. These are family recommendations, not final WBS structures; QS and Planning owners should validate node depth and work packages against the company's standard.

| Family | Common use | Category examples | Structural pattern |
|---|---|---|---|
| Low-rise building | Detached and small multi-unit buildings | Luxury villa, mansion/estate, private residence, standard villa, townhouse, restaurant, clinic, school, religious building | Project → building/block → level or zone → work package/system |
| Multi-storey building | Buildings where floor repetition and vertical logistics drive planning | Apartment, condominium, residential tower, office building, hotel, hospital, government building | Project → building/tower → basement/podium/typical/roof levels → work package/system |
| Commercial / mixed-use complex | Large retail, mixed uses, phased buildings, public areas | Shopping mall, retail building, showroom, mixed-use building, university, residential development | Project → phase/package → building/use zone → level/area → work package/system |
| Industrial / large-span | Process, manufacturing, logistics and large-span facilities | Factory, warehouse, manufacturing facility, logistics center, industrial building | Project → facility/zone → process or building area → system/package → work package |
| Linear infrastructure | Linear civil and utility work | Road, bridge, drainage, water supply, utility, other infrastructure | Project → route/system → reach/structure → chainage/segment/asset → work package/system |

Additional category logic:

- Residential development, mixed-use, university, hospital, and large commercial complexes should allow multiple packages. Their project category alone cannot reliably infer a single delivery structure.
- Bridge works may use a linear parent with bridge-asset subtrees (approach, abutment, pier, deck, ancillary) as a composition. Road and drainage can share chainage/location conventions without sharing every work package.
- Infrastructure projects should support segment/chainage location identifiers and quantities. Building-only fields such as floor height remain optional and unused for these families.
- Custom categories should be assignable to a family with an explicit fallback to a general template and a warning that the mapping needs review.

## 5. Target library and data relationships

Reuse the current QS `qs_wbs_templates` catalog for estimate scaffolds and the Planning `wbs_templates` catalog for delivery WBS structure. Add only metadata and content capabilities needed to express this design:

```text
Project (sector, building type, attributes)
  └─ Template recommendation (category/profile rules)
       └─ Published WBS template version
            ├─ WBS template nodes (stable keys, parent, node kind, location kind)
            ├─ Optional packages/modules
            └─ QS/activity associations (explicit mapping records)

Project BOQ lines ── QS element / budget code
       ├── QS-to-activity bridge ── Activity Master
       └── location assignment ── Planning WBS node
```

Recommended concepts for technical design:

- **Template family/profile:** e.g. `building_low_rise`, `building_multi_storey`, `industrial_large_span`, `infrastructure_linear`. This distinguishes reusable delivery patterns from the sector slug currently held in `template_category`.
- **Applicability rules:** supported sector and building-type slugs, plus optional attributes such as storey band, number of blocks, linear/non-linear, and package scope. Rules should distinguish “suggested” from “allowed.”
- **Template version:** published immutable version/snapshot; draft editing should not change the version applied to a project.
- **Node kinds/location kinds:** allow building-specific `level` and infrastructure `chainage`, `segment`, `reach`, `structure`, `system`, or `zone` nodes. Keep project-specific location instances in operational `wbs_nodes`.
- **Optional modules:** repeatable scope modules (for example external works, basement, façade, utilities, bridge structures) selected during preview. A module must have stable keys and declared insertion point.
- **Mapping records:** version-aware links from template node key to QS Element Library entry, Budget Code, and/or Activity Master where there is a defensible standard. Allow one-to-many mappings, explicit exclusions, and unit conversion data where quantity rules require it. Do not encode these links only in template JSON notes.
- **Project application record:** record chosen template/version, selected modules, user confirmation, and apply result for traceability.

Reuse existing `plan_act_qs_bridge` for element-to-activity quantity rules and `plan_location_map` for BOQ location-to-project-WBS assignment. The template mapping can provide defaults for those workflows, but should not replace their rule and confirmation behavior.

## 6. QS and Planning workflow

### Library authoring

1. Authorized WBS/Planning administrators create or revise a template draft, choose its family, and tag sector/building-type applicability.
2. QS maintainers add or review QS Element Library/Budget Code associations and mark each association as driver, supporting, excluded, or unmapped. Mapping ownership and approval should follow the existing Planning–QS Bridge governance: QS owns elements/quantities; Planning owns WBS and activity masters; Project Controls governs cross-module bridges.
3. Authors validate node keys, hierarchy, applicable categories, optional modules, location kinds, and mappings. Publish a new immutable version after approval.

### Project estimate setup

1. Read the project sector and building type, then recommend one or more compatible template profiles.
2. Ask for the small set of attributes that materially selects structure (for example floors, number of blocks, linear scope, major systems, or package split). Missing attributes should leave alternatives visible rather than imply certainty.
3. Let QS choose a template and add/remove allowed modules. Preview the QS scope structure and mapping coverage before generating or mapping BOQ items.
4. Keep QS BOQ/element classification intact. Offer suggested mapping to template nodes and make unmapped or ambiguous lines visible for QS review.

### Planning WBS application and quantity bridge

1. From the project or QS handoff, preview the selected template version and its nodes against the existing operational WBS.
2. Apply with the existing merge behavior, preserving project WBS IDs and existing node/task edits. Report created, matched/skipped, unresolved, and conflicting nodes. Do not overwrite project changes.
3. Resolve each BOQ location to a project WBS location through the existing location map; confirm ambiguous and project-wide allocations. Infrastructure uses chainage/segment/asset mapping rules instead of floor matching.
4. Use the existing QS bridge to link measured QS elements to activity masters, then allocate quantities to confirmed WBS locations. Show trace from each generated planning quantity/duration back to the BOQ line, element, mapping rule, location, and norm version.
5. On template or BOQ revision, show a difference/coverage preview. Never silently rewrite the operational WBS or previously applied estimate snapshot.

## 7. Matching and fallback behavior

Recommended selection order:

1. Exact building type + compatible family attributes.
2. Sector + compatible family attributes.
3. Explicitly approved general template.
4. No automatic apply if no suitable published template exists; allow a controlled manual WBS or report the missing category coverage.

Where multiple templates are valid, rank them as suggestions and explain the match reason (category, floors, scale, package type). Keep user override available and record the selected template/version. Treat legacy project categories as aliases only for display and migration; do not match them silently to an unrelated modern category.

## 8. Delivery phases

| Phase | Work | Completion evidence |
|---|---|---|
| 0. Align standards | Confirm category slugs, family definitions, ownership, and whether the current template JSON will be generalized or adapted behind a common node model. Inventory all current template records and project applications. | Approved family definitions and gap inventory; no duplicate QS template catalog planned. |
| 1. Category coverage | Build and review an explicit matrix mapping every standard and custom category to suggested families, alternatives, and fallback behavior. | Automated/manual coverage confirms all 33 standard types and custom-category fallback. |
| 2. Schema/content model | Add family/applicability rules, generalized location/node kinds, optional module composition, immutable publication version, and explicit mapping records as required. Preserve the building floor-block editor during transition. | Building templates continue to load; infrastructure template can represent route/segment/asset hierarchy without floor fields. |
| 3. Seed initial libraries | Create one approved starter per family and needed optional modules. Populate stable node keys and reviewed QS/activity associations; mark gaps/exclusions. | QS and Planning signoff; no unreviewed association presented as an approved mapping. |
| 4. QS selection and preview | Add category-aware recommendations, attribute questions, template/module selection, QS mapping coverage, and estimate snapshot. | Estimate setup shows matching reason, selected version, optional modules, and unresolved mapping counts. |
| 5. Planning apply and location bridge | Extend apply preview for generalized locations and package composition. Reuse current merge, activity link, QS bridge, and location-map services. | Building and linear samples apply safely; location quantities trace back to BOQ lines. |
| 6. Governance and rollout | Add publishing approvals, deprecation/supersession policy, migration guidance, and reporting for unmapped categories/elements. | Existing project WBS and estimates remain stable; administrators can identify stale versions and mapping gaps. |

### Phase-by-phase implementation todos

The following checklist expands the delivery phases into reviewable work. Items marked **decision** should be settled before the dependent build starts. Items marked **verify** require evidence from the named artifact or workflow.

#### Phase 0 — Align standards and inventory

- [x] **Decision:** Keep QS estimate scaffolds (`qs_wbs_templates`) and Planning delivery templates (`wbs_templates`) as separate linked libraries because they represent different trees; do not add a third catalog.
- [ ] **Decision:** Confirm that the first release proposes/matches existing QS elements and BOQ lines; it does not auto-create priced BOQ lines.
- [ ] **Decision:** Approve the template family names and their intended boundaries (low-rise, multi-storey, commercial/mixed-use, industrial/large-span, linear infrastructure).
- [ ] Inventory published, active, draft, and project-linked WBS templates; record their `template_category`, `building_types`, versions, content shape, and references from projects.
- [ ] Inventory the current apply RPC and editor assumptions: sections, building anchor, floor blocks, activity placement, dependency keys, stable keys, merge matching, and version increments.
- [ ] Inventory current operational WBS node types and project location fields. Identify what supports `zone`, `segment`, `chainage`, `reach`, `structure`, and `asset`; identify what would require schema work.
- [ ] Inventory QS entities and bridge records used in the running code: Element Library IDs, Budget Codes, BOQ classification, `plan_act_qs_bridge`, location-map fields, and direct BOQ-to-WBS links.
- [ ] Identify ownership and permissions for template edits, publication, QS associations, and company-level defaults. Document current RBAC gaps.
- [ ] Draft the compatibility strategy for existing building template JSON and existing project applications; do not invalidate or rewrite current content during migration.
- [ ] **Verify:** Produce an inventory and a short architecture decision record naming source-of-truth tables, owners, compatibility approach, and unresolved infrastructure-location gaps.

#### Phase 1 — Complete category coverage matrix

- [x] Extract all standard sector and building-type slugs directly from `apps/web/lib/project-categories.ts`; treat slugs as keys and labels as display text. Implemented in `apps/web/lib/qs/qs-wbs-template-profiles.ts`.
- [x] Add every standard category to a review matrix with primary family, allowed alternatives, matching attributes, optional modules, and fallback behavior. Initial family matrix is implemented; QS/Planning review is still required before approval.
- [ ] Define category-specific selection questions only where answers change the WBS structure (for example number of blocks, storey band, campus/phased scope, process zones, or linear route/asset scope).
- [ ] Specify how multi-use projects compose packages (for example residential towers + retail podium + external infrastructure), including shared project-level scope.
- [ ] Specify custom sector/building-type behavior, including unassigned categories, legacy slugs, and explicit administrator mapping to a family.
- [ ] Review all mappings with QS and Planning; flag categories where the source taxonomy is too broad to determine a family without attributes.
- [ ] **Verify:** Coverage report has one row per standard building-type slug, no missing slugs, no orphan family references, and an explicit path for custom/legacy categories. A runtime coverage helper is implemented; run it during phase verification.

#### Phase 2 — Data model and template content model

- [x] Write the target schema and migration map before implementation. Reuse existing applicability fields where sufficient; add a family/profile concept without reusing sector values as family IDs. Initial QS metadata is in migration `20261021000016`; QS-to-Planning version-pinned associations are in `20261021000017`.
- [x] Define published-version behavior: drafts are editable; publishing assigns the next version, freezes header/items/locations, and supersedes the previous published version; archived versions remain immutable. QS tender applications pin the template version and preserve a full application snapshot. Explicit project-level pinning and the draft authoring/version-creation UI remain open.
- [x] Define stable template node key rules and validation (unique within version/composition, immutable after publication where referenced, with explicit deprecation/migration behavior). Cross-library links qualify keys by template part (`sections:<key>` or `floor_blocks.<type>:<key>`) and validate against the current template content; immutable publication and migration behavior remain open.
- [x] Define generalized node/location kinds for building and linear work. QS template scope kinds (`scope_group`, `scope_item`, `work_package`, `system`, `asset`) and location-pattern kinds (`building`, `level`, `zone`, `area`, `facility`, `route`, `segment`, `asset`, `system`) describe reusable template content. Applying a pattern records its kind/config in provenance; concrete project levels/routes/chainage sections/assets remain operational WBS/location instances.
- [ ] Define optional module composition: stable module ID/version, insertion point, prerequisites/exclusions, repeatability, duplicate-key validation, and merge behavior.
- [x] Define explicit template mapping relations to QS Element Library, Budget Code, and Activity Master. Include mapping role, effective template version, units/conversion where applicable, approval state, and unmapped/excluded states. Existing QS item rows already hold element, budget-code, activity-master, unit-conversion, and driver-role fields; new links connect QS templates/items to version-pinned Planning template/node keys. Full item-level authoring and approval workflow remains open.
- [ ] Decide whether these template associations seed/configure existing `plan_act_qs_bridge` records or remain recommendations used during linking; prevent duplicate competing rule stores.
- [x] Define and implement QS scaffold application provenance: project/tender, QS template version, selected scope and locations, who/when, generated count, immutable source snapshot, and generated BOQ line linkage. Planning module composition, apply mode, and unresolved conflict reporting remain open for the Planning integration workflow.
- [x] Add administration workflow to create, approve, reopen, and deactivate whole-template, QS-item-to-Planning-node, and location-pattern-to-Planning-node associations. Links pin both template versions and stale links cannot be newly approved.
- [ ] Design safe migration/backward compatibility for existing `content` JSON and current building floor-block editor. Existing templates should continue to parse and apply.
- [ ] Define operational WBS support for linear locations. Add only the fields and node types required by approved location semantics; do not add a second project location hierarchy without an explicit mapping.
- [ ] Specify RLS, indexes, uniqueness constraints, audit events, and deletion/archive rules for each new relation.
- [ ] **Verify:** Architecture review confirms no duplicated template catalog, stable identifiers, reproducible published versions, and a valid building plus linear example represented by the same target model.

#### Phase 3 — Seed and validate starter libraries

- [ ] Agree on representative sample projects or approved reference structures for each family; record assumptions and exclusions.
- [ ] Create a starter WBS for low-rise buildings and identify how levels/zones and repeated blocks are represented.
- [ ] Create a starter WBS for multi-storey buildings, including basement, podium, typical floors, roof, and optional façade/external works modules.
- [ ] Create a starter WBS for commercial/mixed-use complexes, including package boundaries and shared/public-area scope.
- [ ] Create a starter WBS for industrial/large-span facilities, including process/production zones and building/site packages where applicable.
- [ ] Create a starter WBS for linear infrastructure with route/system, reaches or structures, chainage/segments/assets, and work packages.
- [ ] Assign stable node keys and consistent naming/coding rules; document how optional modules avoid key collisions.
- [ ] Map only reviewed nodes/elements to QS elements, budget codes, and activity masters. Mark unsupported, not-applicable, excluded, and unmapped cases distinctly.
- [ ] Check that quantity-driving element links have valid unit handling and that one QS element can map to multiple activities only under explicit rules and location allocation.
- [ ] Run QS and Planning review workshops; capture corrections, ownership, approval, and version release notes.
- [ ] **Verify:** Each starter is a draft/published version as appropriate, mapping coverage is reported, invalid links are rejected, and no illustrative association is represented as an approved company standard.

#### Phase 4 — QS recommendation and preview experience

- [x] Add category-aware template recommendation to the QS estimate/tender setup entry point, reading sector and building type from the project record. Implemented in the tender QS WBS template picker; template explanation and disambiguating scope attributes remain open below.
- [ ] Show why each template is suggested (exact category, family attributes, scope/package match) and distinguish recommended templates from other allowed options.
- [ ] Collect only required disambiguating attributes and preserve unknown/unconfirmed answers; do not silently select a profile from missing information.
- [ ] Allow QS to choose a template version and applicable modules/packages, then preview the resulting WBS structure and QS coverage before creating any links.
- [ ] Show mapping coverage states for BOQ/QS lines: matched, ambiguous, excluded, not applicable, and unmapped. Provide a review route for unresolved items.
- [ ] Keep the estimate's BOQ and QS element classification unchanged unless the user explicitly confirms a separate supported operation.
- [ ] Save the selected template/version, attributes, package/module selection, and mapping snapshot with the estimate/tender context.
- [ ] Define empty, legacy category, custom category, no-template, and multiple-valid-template states, with actionable recovery paths.
- [ ] **Verify:** A QS user can select, compare, preview, and save a template choice with version and match explanation; no BOQ item is silently reclassified or priced.

#### Phase 5 — Planning apply and location/quantity bridge

- [ ] Extend template preview/apply to support generalized node kinds and selected modules while preserving the existing building workflow.
- [ ] Confirm the merge identity rules use stable template/node keys and do not rely on mutable display names alone.
- [ ] Preview existing-project conflicts, repeated modules, removed nodes, and version updates. Require explicit user action for destructive or ambiguous changes.
- [ ] Apply the chosen template to a project with merge semantics; preserve project WBS IDs, user edits, started/locked activities, and dependencies.
- [ ] Add the location-map path for linear locations (route/system, chainage interval, segment/reach, or asset) using approved operational WBS semantics.
- [ ] Use template associations to prefill suggestions in existing QS bridge/location workflows; require confirmation for ambiguous category, unit, or location matches.
- [ ] Keep calculation provenance through BOQ line → QS element → bridge rule → activity master/metric → project WBS location → derived quantity/duration/norm.
- [ ] Add preview/apply behavior for subsequent BOQ and template-version changes, including stale mapping and missing-node warnings.
- [ ] **Verify:** Apply and link a building sample and a linear sample end-to-end; demonstrate idempotent repeat apply, preservation of manual edits, unresolved-match reporting, and BOQ traceability.

#### Phase 6 — Governance, rollout, and maintenance

- [ ] Define role permissions for draft, edit, mapping review, publication, deprecation, and project application.
- [ ] Define approval responsibilities for Planning WBS structure, QS mappings/quantities, and Project Controls cross-module rules.
- [ ] Add audit history and release notes for template versions, category mappings, optional modules, and associations.
- [ ] Define deprecation/supersession policy and how existing projects remain pinned while new projects receive current recommendations.
- [ ] Prepare migration/rollout guidance for existing templates, project category slugs, project WBSs, and legacy estimates.
- [ ] Add an operational report for category coverage, template age/version, QS mapping gaps, unresolved locations, and applied projects needing review.
- [ ] Pilot with representative low-rise, multi-storey, industrial, and linear projects; collect QS and Planner corrections before wider publication.
- [ ] **Verify:** Pilot signoff confirms no existing project was silently changed, permissions match ownership, and open mapping/location issues are visible to accountable users.

#### Cross-phase implementation controls

- [ ] Keep database changes in ordered Supabase migrations and maintain generated database types.
- [ ] Keep template parsing/validation and matching logic in shared typed library code rather than duplicating rules in separate screens.
- [ ] Maintain the existing template format during transition and include a documented conversion path for any new generalized format.
- [ ] Use representative fixtures for all five families, category mapping completeness, version pinning, module composition, and merge conflicts.
- [ ] Record implementation evidence and unresolved assumptions in this plan or linked phase documents as each phase closes.

## 9. Acceptance criteria

- All standard project categories have at least one reviewed recommended template family or an explicit general fallback.
- A multi-package project can combine compatible template modules without duplicate stable node keys or forced single-category selection.
- At least one building template and one linear infrastructure template can be previewed and applied through the same project WBS workflow.
- A QS user can see which BOQ/element lines are mapped, excluded, ambiguous, or unmapped before linking them to Planning.
- Template-to-QS and template-to-activity mappings use stable identifiers and preserve mapping/version provenance.
- BOQ locations map to building levels or infrastructure locations through explicit, reviewable rules; ambiguous matches require confirmation.
- Applying a template to an existing WBS preserves user edits and records which version and modules were applied.
- Updating a library version does not alter an existing estimate snapshot or project WBS unless a user explicitly previews and applies an update.

## 10. Decisions needed before implementation

1. How should the QS scaffold library and Planning template library be governed? **Recommendation:** maintain them as linked, distinct catalogs; QS owns estimate structure and QS associations, Planning owns operational WBS structure, and Project Controls owns cross-library mappings.
2. Should the QS template library generate BOQ sections/items, or only propose mappings to existing QS elements and BOQ lines? **Recommendation:** initially map existing QS elements and preserve BOQ authoring; consider BOQ generation only after QS confirms a stable category-specific measurement bill.
3. What is the minimum first release? **Recommendation:** one low-rise building, one multi-storey building, one industrial, and one linear infrastructure template, with category coverage and custom fallback completed before broad rollout.
4. Which existing operational infrastructure WBS/location model should be the target for chainage and asset mapping? Confirm before extending the template editor, so template and project nodes share compatible location semantics.

## 11. Source references

- `docs/04-Business-Modules/04-02-Project-Setup/Project Categories.md`
- `apps/web/lib/project-categories.ts`
- `docs/04-Business-Modules/06-Planning-Scheduling/18-Activity-Library-and-Schedule-Generation-Plan.md`
- `docs/04-Business-Modules/06-Planning-Scheduling/21-Planning-QS-Bridge-Design.md`
- `docs/04-Business-Modules/12-Quantity-Surveying/03-BOQ-Design.md`
- `docs/04-Business-Modules/12-Quantity-Surveying/10-QS-Element-Library-Design.md`
- `docs/04-Business-Modules/12-Quantity-Surveying/17-Prelim-Cost-Library-Category-Driven-Improvement-Plan.md`
- `apps/web/lib/qs/qs-wbs-template-profiles.ts`
- `apps/web/lib/qs/qs-wbs-template-planning-links.ts`
- `apps/web/components/administration/qs-wbs-planning-link-editor.tsx`
- `supabase/migrations/20261021000016_qs_wbs_template_category_profiles.sql`
- `supabase/migrations/20261021000017_qs_planning_template_links.sql`
- `supabase/migrations/20261021000018_qs_wbs_template_application_provenance.sql`
- `supabase/migrations/20261021000019_qs_wbs_template_version_lifecycle.sql`
- `supabase/migrations/20261021000020_qs_wbs_template_publish_snapshot_version.sql`
- `supabase/migrations/20261021000021_qs_template_node_location_kinds.sql`
- `apps/web/lib/qs/qs-wbs-location-kinds.ts`
