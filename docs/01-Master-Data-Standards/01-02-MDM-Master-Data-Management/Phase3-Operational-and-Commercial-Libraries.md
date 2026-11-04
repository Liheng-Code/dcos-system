# MDM Phase 3 — Operational and Commercial Libraries

**Status:** Underway — MAT create adapter/API/UI and local migration are complete; owner decisions, bypass closure, and remaining domains are open  
**Reviewed:** 2026-10-22  
**Related:** [Implementation plan](DCOS-MDM-Implementation-Todos.md), [Phase 0 findings](Phase0-Current-State-and-Decisions.md), [Phase 2 reconciliation](Phase2-Core-Masters-Reconciliation.md), [CAT-001](DCOS-MDM-CAT-001/DCOS-MDM-CAT-001.md), [COD-001](DCOS-MDM-COD-001/DCOS-MDM-COD-001.md)

> This is a repository and local development baseline. Counts below come from aggregate, read-only queries against local Supabase on 2026-10-22. They do not certify hosted deployment, approve ownership/coding policy, or authorize production migration.

## 1. Objective and boundaries

Make operational libraries for reusable materials/resources, equipment, commercial cost/rate references, and controlled values. Maintain clear identity boundaries:

- A reusable technical resource is not an inventory item, project material approval, supplier product, stock/batch, or price observation.
- Equipment type/model is not an owned/leased/hired asset instance, project assignment, or equipment rate.
- A cost/rate library input is not an awarded BOQ, purchase transaction, approved budget, certified claim, or posted actual. Transactions retain snapshots of the values and source versions used at the time.
- Controlled global values and tenant extensions must have explicit ownership, lifecycle, scope, and effective dating.

No Phase 3 master write path should be activated until its owner, code scope, tenant policy, duplicate rules, and consumer transition are approved.

### Material adapter implementation update (2026-10-22)

The first local implementation slice now has an applied local forward migration, typed MAT create payload validation, and authenticated apply/retry API and UI actions:

- `mdm_apply_material_create(request_id, expected_version)` atomically applies only approved, tenant-scoped MAT create requests to `dwl_resources` plus `dwl_material_attributes`, records the result and append-only event, and preserves current resource UUID/code behavior through the established allocator.
- `mdm_retry_material_apply(request_id, expected_version, reason)` requires the MDM approval permission and a reason before reauthorizing a failed adapter attempt.
- The MAT adapter is marked ready to indicate code availability, but request intake remains disabled by default. This is not owner ratification of CAT-001/COD-001 choices.
- `POST /api/mdm/requests` validates MAT create payloads at intake; draft edits and submission repeat the domain-schema validation. The database apply RPC repeats authoritative payload, tenant, permission, maker-checker, version, schema, and duplicate checks.
- Migration: [20261022170000_mdm_material_adapter.sql](../../supabase/migrations/20261022170000_mdm_material_adapter.sql). Applied to local Supabase on 2026-10-22 and confirmed in local migration history. No hosted changes or tests were performed.
- Existing `dwl_create_material()` and direct table-write/import paths still bypass MDM. Adapter duplicate serialization does not coordinate with legacy direct creates; close this race and bypass before claiming governed cutover.

This is an implementation draft for the material slice, not Phase 3 completion or a production-ready write-path cutover.

## 2. Current sources and local profile

| Concept | Existing local source | Local profile | Initial interpretation / control |
|---|---|---:|---|
| Reusable technical resource/material | `dwl_resources`, with category/division, material attributes/specifications, revisions, photos, and allocator | 837 resources; one tenant represented; zero null tenants; zero duplicate global codes | Strong candidate reusable technical-resource master. `MAT-STR-001`-style legacy allocation differs from proposed six-digit tenant-scoped rule. Preserve codes until approved transition. |
| Inventory-facing item | `inv_items` | 460 items; one tenant represented; zero null tenants | Operational inventory selection/settings, not proven identical to reusable DWL resource. No identical normalized codes overlap in this local profile. Do not merge based on code or name alone. |
| Stock and movements | `inv_stock`, GRN, movement, requisition, transfer, return, and adjustment tables | Not row-profiled in this kickoff | Quantity/location/batch and movement remain operational transactions; retain history and FKs. |
| Material specification | `dwl_material_specs`, `dwl_material_spec_revisions`, attributes and supplier links | 16 specs, 16 revisions, 21 supplier-material links | Versioned specification and supplier applicability remain related records, not material identity. Verify effective revision and source links before migrations. |
| Price observations | `dwl_resource_prices`, quotations/submissions and supplier-material relations | 878 resource-price rows; zero missing tenant IDs | Effective-dated commercial observations. Preserve supplier, currency, source, and validity history; never overwrite certified/posted transaction snapshots. |
| Work items / assemblies | `dwl_work_items`, `dwl_assemblies`, assembly-costing and component tables | 305 work items, 22 assemblies, 22 assembly-cost rows | Composite resource/production recipes and cost calculations; distinguish from atomic material master and BOQ/actual transactions. |
| Unit rates | `unit_rate_library`, `tender_unit_rates`, `snap_unit_rates` and linked lines | 7 shared unit-rate rows, 9 tender rates, 0 snapshot headers | Rate sources have different lifecycle/scope. Snapshot tables and tender-specific rates must retain historical values. `unit_rate_library` has no tenant column in the local schema review. |
| Equipment | `dwl_equipment_attributes`, `dwl_assembly_equipment`, `site_equipment`, `dr_equipment`, and design-specific equipment tables | 93 DWL equipment-attribute rows; 0 `site_equipment`; 0 `dr_equipment`; 0 design-MEP equipment rows | Current evidence describes equipment attributes, assembly inputs, or project/field usage. No populated central type/asset master was found in this table scan. Define type/model and physical asset separately before creating one. |
| Currency | `currencies` | 12 rows | Candidate platform reference table; local policies allow authenticated read and admin management. Confirm ISO 4217 conformance, update governance, and historical FX/snapshot behavior. |
| Unit of measure | Text `unit` fields on multiple tables | No canonical UOM table found in the reviewed local table scan | Define a canonical list, conversion dimensions, symbols, and legacy aliases before changing existing free-text values. Do not assume unlike units are convertible. |
| Cost codes / classifications | Cost code fields in project/QS/DWL schemas and configuration | No standalone canonical cost-code master found in the reviewed table scan | Inventory scope and consumers; decide tenant chart vs platform classifications and project mappings before creating/normalizing a master. |

This is a small local dataset profile. It does not estimate hosted duplicates, verify data provenance, or establish that all application and SQL sources were discovered.

### Existing operational UI and import coverage

Phase 3 is not starting from an empty library. The repository already has extensive DWL/QS workflows:

| Existing capability | Current entry points | MDM gap |
|---|---|---|
| Resource/material browse, detail, create, edit, category, photos, specification and lifecycle fields | `/dashboard/qs/dwl-resources`, `/dashboard/qs/dwl-materials`, `dwl-resources-list-page.tsx`, `dwl-materials-list-page.tsx`, `dwl-material-form-dialog.tsx` | Writes directly to DWL RPCs/tables. Tenant RLS exists, but approved MDM request/approval is not the mandatory write path. Existing code allocator uses a different legacy pattern. |
| Material duplicate check and duplicate report | `dwl-material-form-dialog.tsx`, `dwl-material-duplicates-dialog.tsx`, `dwl_find_material_matches`, material fingerprint views | Useful candidate duplicate adapter; existing manual review avoids automatic merge. Scope, matching fields, and cross-table Inventory matches still need steward approval. |
| Material/supplier/spec/price import and supplier price workflow | `/dashboard/qs/dwl-material-import`, DWL import dialogs/services, price dashboard and approval pages | Imports write DWL records directly. Verify dry-run, batch atomicity/recovery, authorization, row crosswalk, and whether every path applies the same duplicate and approval controls. |
| Work items, assemblies, estimates, cost items, labor/equipment rates | QS DWL pages and forms under `/dashboard/qs/dwl-*` | These are composite/commercial libraries, not a canonical equipment asset master. Rate-library sources need effective dating, scope, snapshot, and tenant-policy reconciliation. |
| Inventory item browse and stock operations | Inventory module and `inv_items` / `inv_stock` tables | Operational inventory lifecycle remains distinct. Material-resource mapping is not yet established; local exact code overlap was zero. |

The Phase 3 UI/import checklist therefore means **govern these existing workflows and close their bypasses**, not build a second set of duplicate screens. Until this integration is complete, the existing tenant users with direct-write access can bypass MDM approval even if the new MDM request UI is used.

## 3. Security and lifecycle observations

- Local RLS on `dwl_resources`, `dwl_material_specs`, `dwl_resource_prices`, `dwl_supplier_materials`, `dwl_suppliers`, `dwl_supplier_profiles`, `dwl_equipment_attributes`, `inv_items`, and `inv_stock` uses tenant-oriented policy families. Review actual policy predicates and tenant-join invariants before reusing these paths for MDM.
- `currencies` is locally readable by authenticated users and manageable by admins; confirm whether its governance is platform-wide and whether tenant extensions are prohibited or separately modeled.
- `unit_rate_library` and `tender_unit_rates` use legacy broad authenticated CRUD policies in the local policy inventory. These policies are not sufficient evidence of tenant-safe MDM write access.
- `site_equipment` has a project-oriented policy family. `dr_equipment` is SELECT-only in the local policy list. Neither table is evidence of a governed enterprise equipment-type/asset master.
- Existing DWL material allocator/counter and legacy QS migrations are extensive. Do not change code generation, merge records, or rewrite historical references until hosted state, all consumers, and legacy crosswalks are approved.

## 4. Proposed execution slices

### Slice 3A — Material/resource identity

1. Obtain QS/Engineering/Inventory owner decision on the proposed `dwl_resources` source-of-record role and its boundary from `inv_items`.
2. Inventory all read/write/import paths, codes, uniqueness constraints, tenant joins, duplicates/fingerprints, resource attributes/specs/revisions, supplier product links, and QS/DWL consumers.
3. Define code allocation and grandfathering for existing DWL resources versus new records; retain UUIDs and old codes and provide search aliases if needed.
4. **Partially implemented:** a governed create/apply path exists for approved MAT create requests, with domain validation and the legacy allocator. Change/deprecate, intake activation, and mandatory routing of existing UI/import writes remain open.
5. Migrate only approved fields and aliases after row-level crosswalk review; no merge or wholesale recode by default.

### Slice 3B — Units, currencies, and controlled classifications

1. Inventory unit/currency/classification fields and transaction snapshots across Inventory, Procurement, QS, Finance, Planning, and DWL.
2. Confirm globally governed values, tenant extension rules, ISO/industry vocabularies adopted, conversion rules, effective dating, and deprecation behavior.
3. Reuse `currencies` only after reviewing hosted schema and policy. Design a UOM master with dimensionality and conversion rules only after owner approval; preserve raw historical snapshots.

### Slice 3C — Equipment type and asset identity

1. Inventory all type/model, equipment attribute, asset, lease/hire, maintenance, utilization, and project-assignment sources.
2. Obtain Plant/Construction/Finance owner decisions on asset identity, accounting boundary, code patterns, ownership, and lifecycle.
3. Design type/model and physical asset as separate identities, with project assignment and maintenance history linked to an asset, not copied into a library row.
4. Integrate `dwl_equipment_attributes`, `site_equipment`, and field-report records only where IDs and ownership semantics are proven.

### Slice 3D — Cost codes and rate libraries

1. Inventory cost codes, BOQ classifications, unit-rate sources, QS/DWL formulas, currencies, effective periods, and snapshots.
2. Assign Finance/QS owners and distinguish reusable rate inputs from project/tender estimates, approved BOQ values, commitments, certified claims, and posted actuals.
3. Preserve historical transaction values and source/version references; define rate validity and supersession rules before library write paths are centralized.

### Slice 3E — Shared UI and import operations

After 3A–3D decisions and security baselines are approved, deliver typed browse/search/detail and request/change workflows, steward review, validated dry-run imports with row errors and duplicate candidates, and audit history. Imports must call the same domain services and database authorization as interactive writes.

## 5. Phase 3 gates and acceptance

- [ ] Domain owners ratify material, equipment, cost-code, unit, currency, and classification scope and system-of-record decisions.
- [ ] Database owner verifies hosted migrations, data, tenant policy predicates, allocators, triggers, and effective grants for each selected source.
- [ ] Full consumer and write-path map includes application calls, RPCs/dynamic SQL, imports, scheduled jobs, triggers, reporting and external identifiers.
- [ ] Codes and uniqueness are approved; existing values have an owner-reviewed duplicate/crosswalk/survivorship report.
- [ ] Each master is distinct from operational, project, supplier-specific, and financial transaction records; immutable historical snapshots are verified.
- [ ] Domain writes enforce authenticated tenant scope, role permissions, validation, duplicate review, lifecycle, audit, and effective dating.
- [ ] Imports are dry-run first, produce row-level results, and use the governed write path.
- [ ] Cross-module acceptance covers material requisition → purchase → receipt/stock → QS/cost; equipment assignment → site/maintenance; cost/rate → tender/BOQ/budget/actuals.
- [ ] Domain owner and quality sign-off is recorded before legacy writes are retired or hosted rollout begins.

## 6. Kickoff work completed

- [x] Discover local material, Inventory, DWL, QS/rate, currency, UOM, and equipment source tables.
- [x] Record aggregate local row counts and null-tenant/code-overlap checks without retrieving row-level business or personal values.
- [x] Inspect local RLS policy names for key library/reference tables and identify broad legacy rate-library policies.
- [x] Record candidate source boundaries and a phased implementation sequence.
- [x] Draft MAT create adapter migration and apply/retry API/UI wiring using existing DWL resource identity and code allocation; keep intake disabled.
- [x] Add MAT payload validation for draft create, edit, and submit paths plus authoritative database apply validation.
- [x] Document legacy direct-write bypass and adapter/legacy duplicate race.
- [x] Apply the new migration to local Supabase and confirm migration history. Because ordinary `migration up --local` was blocked by unrelated older files missing from local history, the Supabase CLI ran the migration in a temporary workdir containing already-applied versions plus this migration only. No unrelated pending migrations were run.
- [ ] Hosted rollout remains separately gated on database owner verification and domain-owner approval.
- [ ] Complete hosted state and full application/SQL consumer review.
- [ ] Obtain domain owner decisions and approve the Phase 3 first-release scope.
- [ ] Implement domain adapters, code allocators, screens/imports, and cutovers only after the relevant gates pass.

## 7. Recommendation

Start with a governed `dwl_resources` material/resource slice while retaining `inv_items` as the separate inventory-facing catalogue; map relationships without merging identities. Then govern reference vocabularies and cost/rate sources, and design equipment type/asset masters after Plant owners confirm the source. This recommendation follows current repository structure and local profile only; domain owners must ratify it before schema or hosted changes.
