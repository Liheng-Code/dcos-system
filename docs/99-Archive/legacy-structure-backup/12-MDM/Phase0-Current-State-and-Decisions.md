# MDM Phase 0 — Current-State Findings and Decisions

**Status:** Working architecture baseline; domain-owner decisions remain open  
**Reviewed:** 2026-10-22  
**Scope:** Repository and migration-file review for DCOS-MDM-STD-001, CAT-001, COD-001 and the in-progress Library feature  
**Related plan:** [DCOS-MDM-Implementation-Todos.md](DCOS-MDM-Implementation-Todos.md)
**Decision records:** [ADR-MDM-001](decisions/ADR-MDM-001-Canonical-Identity-and-Scope.md); [ADR-MDM-002](decisions/ADR-MDM-002-Business-Codes-and-Legacy-Migration.md)

> This is a repository-based design assessment. It does not certify what migrations are currently deployed in Supabase, approve a business policy, or replace domain-owner review.

## 1. Findings

| Area | Current evidence | MDM implication |
|---|---|---|
| Source documents | The CAT-001 and COD-001 files are authoring prompts. The STD-001 target file also begins as a build prompt. | Convert prompts into controlled normative documents; do not treat prompt examples as approved policies. |
| Tenant identity | `companies` is the company record. `profiles.company_id` references it, and the custom access-token hook publishes that company UUID as JWT `tenant_id`. | Use the established company identity as the tenant key unless an ADR authorizes a change. Do not introduce an unrelated tenant registry. |
| Project | `projects` has UUID identity and globally unique `project_code`; the original migration's authenticated read/create/update policies are broad. | Keep project UUID as FK identity. Before applying tenant-scoped uniqueness or RLS, audit later migrations and deployed state, backfill ownership, and test all project consumers. |
| WBS | `wbs_nodes` and `wbs_tasks` are the live project structure. `wbs_nodes` has `(project_id, wbs_code)` uniqueness and a generated full path. Its initial policies are broad for authenticated users. | WBS remains the project structure spine; do not create a parallel MDM WBS entity. Coding rules must preserve project-scoped uniqueness and WBS versioning behavior. |
| Supplier / stakeholder | `procurement_suppliers` is consumed by Procurement, Inventory, AP, and subcontracting; it has nullable `tenant_id`, no code uniqueness in its initial migration, and broad initial RLS. `stakeholders` separately represents organizations/clients/consultants/suppliers; `stakeholder_staff` stores their contacts. DWL also has supplier-related records. | There are overlapping legal-party and supplier-role concepts. Preserve existing UUIDs and transaction links. Decide whether a canonical business-party record is needed and model supplier/subcontractor as roles/qualifications only after a complete consumer/FK/RLS inventory. |
| People and identity | HR extends `profiles` with employment fields; `reporting_structure` points to profiles. `stakeholder_staff` independently stores external contact people. | Keep login/account identity distinct from human/person identity. Avoid moving HR-sensitive fields into a shared contact or user table without privacy and access decisions. |
| Inventory items | `inv_items` is explicitly tenant-wide, has required `tenant_id`, and unique `(tenant_id, item_code)`. It includes unit, stock thresholds and inspection flags. | It is an existing inventory-facing item catalogue candidate, but not automatically the sole enterprise material identity. Separate item identity from stock, project approval, and price/rate records. |
| QS/DWL libraries | The repo contains DWL resources, material attributes/specifications/revisions, supplier-material links, cost libraries, duplicate fingerprints, and a material code allocator. `dwl_next_material_code` currently yields patterns such as `MAT-STR-001`. | The DWL material resource is a second strong candidate for governed material identity. Map it against `inv_items` and QS records before selecting authority; the existing duplicate matcher/allocator may be reusable after policy approval. |
| Cost library UI in progress | Uncommitted Library pages/components/hooks and API routes exist. The API routes currently return empty lists or “Sector required” responses. Local JSON files hold sector-specific catalogs. No `cost_libraries` migration is present in the current tree. | Treat as prototype/import source, not an operational MDM service. Confirm migration history and deployed state before adoption. |
| Code policy | COD-001 examples include `MAT-STR-000001` and `MAT-STR-000123`; the current DWL allocator creates `MAT-STR-001`. Project examples include `PRJ-2026-00001` and `PRJ-001`; supplier examples vary between 5- and 6-digit sequences. The WBS section presents hierarchical numeric formats while the general example embeds a project code. | Normalize one authoritative pattern per entity, define scope and immutability, and prepare a legacy crosswalk. Do not bulk-rewrite codes until every consumer and external reference has been checked. |
| Code storage and scope | `inv_items` enforces `(tenant_id, item_code)`. `dwl_resources` has `tenant_id` but a global unique constraint on `code`; its counter groups by category/discipline rather than tenant. `dwl_supplier_profiles.supplier_code` is explicitly documented as not spine-unique. | A tenant-wide code rule would conflict with current DWL global uniqueness and shared counters. Decide whether DWL codes are globally unique or tenant-scoped before changing allocator or constraints. |
| Audit/governance | Existing modules have different audit and approval implementations. No cross-domain MDM lifecycle engine is established by the reviewed material. | Verify shared platform capability before reuse. Introduce an MDM-owned request/audit interface rather than assuming a universal engine exists. |

## 2. Architecture decisions supported by repository evidence

These are implementation constraints for Phase 0. They do not require a new platform architecture decision unless later evidence contradicts them.

1. **Stable relational identity:** Existing UUID primary keys remain the relationship keys. Business codes are human-readable identifiers and SHALL NOT replace UUID foreign keys.
2. **Project/WBS authority:** `projects`, `wbs_nodes`, and `wbs_tasks` remain canonical for project and WBS identity; MDM governs their definitions and lifecycle rather than cloning them.
3. **Tenant key:** `companies.id` is the established company/tenant identity for JWT `tenant_id`. Any new tenant-owned records should derive tenant from trusted auth context and validate parent/project ownership.
4. **Transaction preservation:** Existing procurement, inventory, QS, and finance transactions retain their UUID references and historical snapshots. Any entity merge requires a reviewed old-to-survivor mapping and no destructive FK rewrites without an approved migration.
5. **Modular implementation:** Begin in the existing Next.js/Supabase modular application. A separate MDM service is not justified by the repository evidence.
6. **Material domain split:** Treat inventory item/stock, reusable material identity/specification, project material approval, and cost/rate library entries as distinct concepts pending the canonical entity mapping.

## 3. Domain and source crosswalk (initial)

| Business domain | Existing records / source | Candidate MDM role | Reconciliation needed before authority is assigned |
|---|---|---|---|
| Company / tenant | `companies`; `profiles.company_id`; JWT `tenant_id` | Company is the tenant identity used by current auth context. | Check company provisioning and multi-company user behavior; confirm hosted RLS and all tenant-aware modules use the same UUID. |
| Project | `projects` | Canonical project master, with existing UUID preserved. | Verify company ownership and reconcile globally unique project codes with desired per-company numbering. |
| WBS | `wbs_nodes`, `wbs_tasks` | Canonical project hierarchy and task identity, not a parallel library. | Compare WBS code generator, imports, versioning, planning/QS links, and historical external code references. |
| External organization / party | `stakeholders`, `procurement_suppliers`, `dwl_suppliers` + `dwl_supplier_profiles` | Candidate shared legal-party identity with supplier/client/consultant/subcontractor roles. | Build full FK and consumer map; decide survivorship and tenant ownership; preserve contract, PO, invoice, and price history references. |
| Contact person | `stakeholder_staff`; supplier contact fields; HR `profiles` | Contact/person identity distinct from login and employee status. | Find duplicate contacts and decide whether a shared person key is needed; set privacy boundaries before linking HR people. |
| Employee / account | `profiles` plus HR extensions and reporting links | Existing user profile is the account/employee data host today; it may not be the long-term person master. | Map profiles to employment lifecycle, external user accounts, and field/finance references; do not expose protected fields as shared MDM data by default. |
| Inventory item | `inv_items` | Tenant-level inventory catalogue and item settings. | Crosswalk item codes/descriptions/units to DWL resources and transaction line snapshots; decide if rows link to a reusable material UUID. |
| Technical material/resource | `dwl_resources` + `dwl_material_attributes` + spec revisions | Candidate reusable technical resource identity and specifications. | Resolve global code constraint vs tenant ownership, category semantics, duplicate resolution, and resource codes consumed by QS. |
| Cost/rate library | DWL resource price history and QS library data; in-progress local JSON catalogs | Commercial data tied to resource, supplier, location, currency, validity, and source. | Keep price history separate from material identity. Determine which JSON catalogs are seed/import content and their provenance. |

## 4. Code reconciliation findings

| Entity | Prompt examples / choices | Current implementation evidence | Required standard decision |
|---|---|---|---|
| Project | `PRJ-2026-00001`, `PRJ-001` | `projects.project_code` is required and globally unique; no generator was identified in the original project migration. | Pick one readable pattern and whether year is part of identity; define per-tenant or global uniqueness; retain existing codes through migration. |
| WBS | Project-prefixed example and numeric hierarchy alternatives | `wbs_nodes.wbs_code` is unique within a project; full path is derived from ancestor codes. | Decide whether node code is local to project and path is derived/display-only. Preserve stable references through re-parenting and versioning. |
| Material | Several six-digit examples; generic category/discipline component | DWL allocator emits a three-digit sequence grouped by category/discipline, and its counter is not tenant-keyed; `inv_items` uses tenant-scoped arbitrary codes. | Choose one pattern, uniqueness scope, and crosswalk strategy. Profile existing codes and collisions before changing allocation. |
| Supplier | Five- and six-digit examples; optional common business partner prefix | Procurement supplier code is required but not unique in the initial schema; DWL supplier code is a non-unique profile attribute; stakeholder rows have no common party code in the reviewed migration. | Decide party identity vs role code, tenant scope, uniqueness, and how external identifiers are stored. |
| Employee | Person/employee/user distinctions requested; examples differ | HR data extends profile/account records; no employee-number policy was established in the reviewed migration. | Decide whether employee number exists independently of auth UUID and define a stable, privacy-safe code. |

### Working code defaults for drafting (not approved policy)

1. UUID remains the internal key. A business code is a stable, readable identifier and SHALL NOT be used as a foreign key.
2. Preserve existing codes at first release. Any renumbering needs a reviewed old-to-new crosswalk, and historical records must remain searchable by old code.
3. Do not enable new code patterns until one pattern, uniqueness scope, sequence width, and allocator scope are approved per entity.
4. Keep names and technical attributes separate from codes; changing descriptive attributes must not silently change identity.
5. Retired codes remain reserved where they have appeared in a transaction or external record.

## 5. Proposed resolution baseline

The draft standards and ADRs now use the following consistent implementation baseline: retain UUID keys; keep Company as the tenant identity; retain Project/WBS tables as canonical; treat business party roles as relationships to one party identity; keep Person/Employee/User distinct; separate material identity from inventory item, project approval, supplier product, stock, and price; scope tenant-owned identifiers to tenant and WBS codes to project; preserve existing codes pending a reviewed migration. These are proposed defaults for owner ratification, not recorded organizational approvals.

## 6. Decisions still requiring business/domain approval

| ID | Decision | Proposed working default | Approver needed |
|---|---|---|---|
| D1 | Which domains ship in the first MDM release? | Project/WBS governance plus party/supplier and material/resource reconciliation; no universal CRUD library in release 1. | Product Owner |
| D2 | Is one organization/legal-party master required across stakeholders, suppliers, clients, and subcontractors? | Yes as the target conceptual identity, with roles; retain current physical tables until a complete FK/consumer crosswalk is approved. | Procurement, Finance, Project/Stakeholder owners |
| D3 | What is the reusable material source of record? | DWL resource/specification is the candidate technical identity; `inv_items` remains the inventory-facing catalogue. Link/reconcile after profiling. | QS and Inventory owners |
| D4 | What are code patterns and uniqueness scopes? | Adopt the proposed matrix in COD-001 for new records; preserve all existing codes and UUIDs; no allocator/constraint changes before profiling. | Data Governance Board / domain owners |
| D5 | Are global reference lists centrally controlled, and what tenant extension mechanism is permitted? | Centrally govern explicitly global values; tenant extensions require a stewarded tenant-owned mapping and may not mutate platform values. | Product Owner / Data Governance |
| D6 | How do employee, person, external contact, and login identities relate? | Keep them distinct; HR owns employment fields and access; define a separate person key only if approved by HR/Security. | HR and Security owners |
| D7 | What is the authoritative deployed schema and RLS state? | Migration files are not proof of deployment; compare hosted schema/RLS before migration or cutover. | Database/Platform owner |
| D8 | Is a `cost_libraries` migration deployed or stored in another branch/history? | No such migration is present in the current repository tree; verify hosted state and repository history before adopting the prototype UI. | Implementing developer / Database owner |

## 7. Required Phase 0 follow-up

- [ ] Owners resolve D1–D8 or record explicit deferral and accountable owner.
- [ ] Complete a consumer and FK inventory for `stakeholders`, `procurement_suppliers`, DWL supplier records, DWL material records, `inv_items`, and QS libraries.
- [ ] Complete and review the code crosswalk for project, WBS, supplier, employee, material/resource, cost, and document codes; include database uniqueness and generator scope.
- [ ] Compare Supabase hosted schema/RLS with migration history for the selected domains.
- [x] Produce a proposed code-pattern matrix from COD-001 and existing generation/schema rules; document conflicts and legacy behavior in COD-001 and ADR-MDM-002.
- [x] Prepare internally consistent Draft 1.0 STD-001, CAT-001, and COD-001 documents for owner review.
- [x] Record recommended canonical identity/scope and code/migration decisions in ADR-MDM-001 and ADR-MDM-002.
- [ ] Ratify the first-release domain list, code scope, party/material ownership, and proposed ADR decisions.
- [ ] Compare hosted schema/RLS with repository migrations; profile actual record/code collisions and approve the no-loss migration/cutover strategy.

## 8. Phase 0 gate

The Phase 0 **design package is complete and ready for owner ratification**: the three documents are internally aligned drafts, and both recommended architecture decisions are recorded. Phase 0 is not formally closed until the Product Owner/domain owners ratify scope and decisions and the database owner verifies hosted state and data-quality/migration risks. No production database changes are authorized by this assessment.

