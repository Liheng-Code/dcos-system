# DCOS Master Data Management — Implementation Todo Plan

**Status:** Proposed implementation plan  
**Plan owner:** Enterprise Architecture / MDM Product Owner  
**Scope:** Turn DCOS-MDM-STD-001, CAT-001 and COD-001 into governed, usable system capabilities  
**Related index:** [Master.md](Master.md)
**Phase 0 assessment:** [Current-State Findings and Decisions](Phase0-Current-State-and-Decisions.md)

**Current phase status:** Phase 1 implementation and local Supabase acceptance are complete. Phase 2 remains open on owner ratification and hosted schema/RLS verification. Phase 3 has an applied local MAT create adapter/API/UI slice; legacy bypass closure, domain owner decisions, other operational/commercial domains, and consumer cutovers remain open.

## 1. Purpose

This plan sequences the work needed to make the MDM design operational in DCOS: approved standards, a canonical catalogue, governed identifiers, secure lifecycle controls, domain screens, existing-data migration, and module integrations.

The plan does not assume a greenfield database. DCOS already has Project and WBS records, Procurement supplier records, HR employee records, and material-related records across Inventory and QS. Implementation SHALL identify the authoritative source for each entity and preserve existing transaction references and history.

## 2. Current baseline and planning assumptions

- The three named MDM documents currently contain authoring prompts and required content, rather than approved final standards/catalogues. Their intended rules are inputs, not yet implementation-ready normative decisions.
- The current app uses Supabase Auth and PostgreSQL migrations. Tenant/company isolation, existing RLS policies, and module boundaries must be inspected and aligned before MDM writes are introduced.
- Existing `projects`, `wbs_nodes`, and `wbs_tasks` remain the project/WBS spine unless an approved architecture decision changes this.
- `procurement_suppliers` is already consumed by Procurement, Inventory, Accounts Payable, and subcontracting. Do not create another supplier table as a competing source of truth.
- Inventory and QS contain material/catalogue concepts with different purposes. Decide which are reusable master records and which are project, commercial, or transactional records before consolidating them.
- The current worktree contains uncommitted Library UI/API/hooks and sector-specific cost-library JSON. The API routes are placeholders, and no `cost_libraries` migration is present in the current tree; confirm history and deployment before relying on it.
- Do not automatically promote every catalogue entity to a central CRUD screen. Prioritize domains with clear ownership, consumers, and migration paths.

## 3. Delivery phases and todos

Legend: `[ ]` open · `[x]` complete. A phase is complete only when its exit criteria are met and recorded here.

### Phase 0 — Establish the approved standard and implementation decisions

- [x] **Architecture:** Replace the STD-001 build prompt with a complete internally reviewed Draft 1.0 enterprise standard.
- [x] **Architecture / Data Governance:** Produce the CAT-001 Draft 1.0 catalogue with stable entity codes, scope, ownership functions, mandatory status, consumers, and candidate/current source notes.
- [x] **Architecture:** Produce the COD-001 Draft 1.0 coding and naming standard, including uniqueness scope, allocator rules, code stability, and legacy handling.
- [x] **Architecture:** Reconcile STD-001 ↔ CAT-001 ↔ COD-001 and record proposed decisions on global/tenant/project scope, party/material identity, and person/login separation.
- [ ] **Product Owner / Domain Owners:** Ratify the first release domains, entity ownership, and proposed decision records before implementation.
- [ ] **Product Owner:** Approve the first release domains and explicitly defer catalogue entities without an owner or near-term consumer.
- [x] **Architecture:** Record proposed ADRs for canonical entity ownership and code generation / migration approach; owner ratification remains open.
- [ ] **Database / Backend:** Complete the table, RLS, foreign-key, code, uniqueness, CRUD, import, and consumer inventory for selected domains. Initial evidence is recorded in [Phase 0 assessment](Phase0-Current-State-and-Decisions.md); hosted schema and full consumer verification remain open.
- [ ] **Architecture / Database:** Decide whether to adopt, revise, or retire the uncommitted Library UI/API/hooks and JSON catalogs. Initial review found placeholder API routes and no verified `cost_libraries` migration in the current tree; verify its deployment/history, tenant scope, authorization, audit/lifecycle behavior, effective dating, and QS compatibility.
- [ ] **Data Steward / Product Owner:** Profile current records for duplicate codes/names, missing tenant/company scope, invalid statuses, orphaned references, and inconsistent naming. Keep findings and proposed survivorship decisions in a migration register.
- [x] **Architecture:** Complete an initial repository-based MDM baseline and capture evidence-backed constraints plus decisions requiring owners in [Phase 0 assessment](Phase0-Current-State-and-Decisions.md).
- [x] **Architecture:** Confirm the named CAT-001, COD-001, and STD-001 target files are prompts and implementation input, not approved operational standards.
- [x] **Architecture:** Produce the domain/source crosswalk and identify code-pattern, uniqueness-scope, and allocator conflicts from current migrations and the COD-001 prompt.

**Phase 0 exit criteria:** Draft standards are internally consistent; recommended decisions are recorded; first-release entities and ownership are ratified; hosted schema/RLS and data-quality risks are reviewed; no unresolved decision would change the first schema migration. The design package is ready, but formal exit remains open until the unchecked owner/database items above are completed.

### Phase 1 — Build shared MDM governance foundations

- [x] **Architecture:** Define the governance registry/request/event model, lifecycle transitions, permission boundaries, tenant/project RLS rules, API boundary, UI scope, and acceptance criteria in [Phase 1 Governance Foundation Design](Phase1-Governance-Foundation-Design.md).
- [ ] **Product Owner / Domain Owners:** Ratify the MDM standards/ADRs and Phase 1 initial entity scope before production activation.
- [ ] **Database owner:** Confirm hosted schema, tenant JWT hook registration, MDM role/permission data, and project membership behavior before hosted promotion. Local prerequisites were present and the migration is applied locally.
- [x] **Architecture / Backend:** Define the first-release entity registry and scope model (platform reference, tenant/company, project, and approved project extension) without duplicating the existing project/WBS hierarchy.
- [x] **Database design:** Specify tenant-safe governance records for master-data requests/change requests, review/approval decisions, lifecycle state, effective dates, and audit references in the Phase 1 foundation design.
- [x] **Database design:** Define append-only change history and historical preservation requirements in the Phase 1 foundation design.
- [x] **Backend foundation:** Add shared Zod transport schemas for create/update/deactivate requests, decisions, cancellation, and list filters; reject system-managed fields and bound payload size.
- [x] **Backend foundation:** Add a pure lifecycle transition guard for permission, maker/checker, reason, status, and adapter-readiness prechecks. Database functions must repeat these checks transactionally.
- [x] **Backend:** Implement tenant authorization from authenticated JWT/profile context; never trust submitted tenant identifiers. Enforce maker/checker and optimistic version checks transactionally. Project scope fails closed because the project-to-tenant relation is absent.
- [x] **Backend:** Implement request create/edit, submit, review, approve/reject/return, and cancel transitions. Activation, domain changes, deprecation, archive, and merge remain deferred to domain adapters.
- [x] **Backend:** Return structured request validation errors for interactive creation and draft edits.
- [ ] **Backend / Domain Owners:** Add domain-specific duplicate-search hooks when the first entities and their matching keys are ratified; generic JSON requests cannot safely infer cross-domain identity.
- [x] **Database / Backend:** Draft and apply the migration locally for registry/request/event tables, FK/index constraints, tenant RLS, append-only audit events, transactional RPCs, and permission seeds. Rollback means disabling intake and preserving request/audit data; do not drop populated audit tables. Hosted application remains open.
- [x] **Frontend:** Build entity registry, intake configuration, request creation, review queue/actions, request detail/history, and registry configuration history.
- [x] **Quality:** Apply the migration to the existing local Supabase database without resetting it; run rollback-only lifecycle/security checks and confirm no test data remains.
- [ ] **Database owner / Quality:** Verify hosted migration history, registered custom access-token hook, and tenant isolation before hosted promotion.
- [ ] **Product Owner / Domain Owners:** Ratify the initial requestable entity scope and approve which data can be handled by the generic, non-applying foundation.

**Implementation status:** Phase 1 implementation and local acceptance are complete for the tenant-scoped, non-applying governance foundation. Project-scoped requests, sensitive entity intake, platform reference intake, duplicate matching, and domain activation remain deferred until ownership, privacy, and adapter decisions are approved. Hosted promotion remains gated on owner/database sign-off.

**Phase 1 closure record (2026-10-22):** All source implementation and local acceptance work in this phase is complete. Focused ESLint passed; rollback-only SQL checks passed and left no test data; the migration is recorded in local Supabase migration history. The workspace-wide typecheck is not a Phase 1 blocker: its failures are in unrelated Library UI worktree files, with no reported MDM diagnostics. Phase 1 is closed for local development only. Hosted rollout and formal owner/database approvals remain explicitly open release gates; domain adapters and duplicate-search hooks belong to the later domain phases.

### Phase 2 — Reconcile and govern existing core masters

**Execution baseline:** [Phase 2 Core Masters Reconciliation](Phase2-Core-Masters-Reconciliation.md). Repository and local aggregate baseline are recorded; project/WBS is the first analysis slice. No hosted-state certification or Phase 2 schema migration is claimed.

Deliver in bounded domain slices. Each slice must identify the canonical table/source, map old identifiers, preserve FKs/history, and migrate consumers before legacy write paths are retired.

- [x] **Architecture:** Record the repository-based canonical-source and migration-risk baseline for Project, WBS, Supplier/Party, People, Organization, and Stakeholder domains.
- [x] **Database / Quality:** Run read-only local aggregate integrity checks and inspect effective local policies without retrieving row-level personal data.
- [x] **Architecture / Database:** Scan migration FK dependencies and identify major consuming modules; application write-path review remains open.
- [ ] **Product Owner / Domain Owners:** Ratify the Phase 0 decisions and approve Phase 2 release domains before schema or data changes.
- [ ] **Database owner:** Compare hosted schema, effective RLS, custom token hook, membership model, and migration history for the first slice.

- [ ] **Project domain:** Confirm `projects` as canonical; reconcile project code/name rules, company ownership, uniqueness scope, lifecycle, and all create/import paths.
- [ ] **WBS domain:** Confirm `wbs_nodes` and `wbs_tasks` as canonical project structure; apply approved code/name validation without breaking hierarchy versioning, planning, or module integrations.
- [ ] **Supplier / business partner domain:** Treat `procurement_suppliers` as the candidate canonical supplier record; assess tenant scoping and current broad RLS, code uniqueness, duplicate vendors, supplier vs subcontractor role, and all Procurement/Inventory/Finance/Contract consumers. Preserve the existing supplier UUIDs or provide an explicit, tested crosswalk.
- [ ] **People domain:** Map HR employee/person records separately from Supabase login/profile identities; define employment lifecycle, privacy boundaries, and links between person, user account, company, and project assignment.
- [ ] **Organization domain:** Confirm company, business unit, and department sources and ownership; align company/tenant identity with the existing auth/RLS model rather than introduce a conflicting tenant key.
- [ ] **Stakeholder / customer domain:** Determine whether existing stakeholder/contact records can represent client, consultant, supplier contacts, and other parties without conflating a legal entity with its people.
- [ ] **Database / Backend:** Add only approved missing fields/constraints and tenant-safe policies; avoid renaming IDs or columns without a consumer-by-consumer migration plan.
- [ ] **Data Steward:** Deduplicate and normalize existing core records using approved survivorship rules; export a reviewable before/after crosswalk.
- [ ] **Backend / Frontend:** Route create/update/deactivate actions for each migrated domain through the MDM lifecycle and permissions; retain read access for module consumers.
- [ ] **Quality:** Reconcile row counts and references, check existing transactions, verify tenant isolation, and obtain domain-owner sign-off before disabling legacy write paths.

**Exit criteria:** Core records have a documented system of record, unique governed business codes, owner, lifecycle, and audited write path; dependent modules retain valid references and behavior.

### Phase 3 — Implement operational and commercial master libraries

**Execution baseline:** [Phase 3 Operational and Commercial Libraries](Phase3-Operational-and-Commercial-Libraries.md). Local source tables, aggregate counts, policy families, candidate boundaries, and an applied local MAT adapter migration are recorded. No hosted change is claimed.

- [x] **Architecture / Database:** Inventory local Material/Inventory/DWL/QS, rate, currency, UOM, and equipment sources and record candidate identity boundaries.
- [x] **Quality:** Run local aggregate row-count, tenant-null, and normalized-code-overlap checks without retrieving row-level values.
- [x] **Database:** Review local RLS policy families; record broad rate-library policies and tenant-oriented Inventory/DWL policies for follow-up.
- [x] **Backend / Frontend:** Map existing DWL material, duplicate, specification, price, and import UI paths; confirm that these direct writes are not yet governed by MDM approval.
- [x] **Backend / Database / Frontend:** Draft a tenant-scoped MAT create apply/retry adapter, API endpoints, registry readiness indicator, and approved-request UI actions. Intake stays disabled; see [Phase 3 implementation update](Phase3-Operational-and-Commercial-Libraries.md#material-adapter-implementation-update-2026-10-22).
- [x] **Backend:** Add typed MAT v1 payload validation at create, draft edit, and submit boundaries; retain authoritative database validation at apply.
- [x] **Database:** Apply `20261022170000_mdm_material_adapter.sql` to local Supabase via the Supabase CLI and confirm its local migration-history entry; unrelated pending migrations were excluded.
- [ ] **Quality / Database owner:** Perform local acceptance and review the history-reconciliation issue before hosted promotion. No hosted promotion is included.
- [ ] **Product Owner / Domain Owners:** Ratify the first Phase 3 domain slice, canonical source, owners, code rules, and tenant/global scope.

- [ ] **Material domain decision:** Define the boundary between enterprise material identity, project-approved material selections, supplier-specific products, inventory stock/batches, and QS cost/rate library items.
- [ ] **Material domain:** Ratify `dwl_resources` as canonical or select an alternative; map existing Inventory and QS records without treating price, stock, or project specification rows as reusable material identity.
- [ ] **Material write-path cutover:** Route existing DWL create/edit/import writes through governed operations or equivalent authorization/audit; coordinate duplicate locking with remaining direct writes before disabling bypasses.
- [ ] **Equipment domain:** Inventory equipment/plant/tool records; separate reusable equipment type/model from owned/leased asset instances and project allocation.
- [ ] **Cost/commercial references:** Reconcile cost codes, BOQ classification, units of measure, currencies, tax, and payment terms with existing QS/Finance records; preserve historical transaction snapshots.
- [ ] **Cost libraries:** Bring the existing library work under the approved MDM ownership/scope and coding rules, or document its replacement path. Do not use the preliminary `cost_libraries` schema as the canonical material master without the Phase 0 domain decision.
- [ ] **Reference data:** Establish controlled lists and ownership for units, currencies, countries/locations, disciplines, statuses, and classifications. Specify global vs tenant-configurable values and effective dating.
- [ ] **Backend / Database:** Enforce approved code patterns and scoped uniqueness at the database boundary, with safe concurrent sequence allocation where sequential codes are approved.
- [ ] **Frontend:** Deliver domain-specific browse, search, detail, create/request, edit/change request, and lifecycle views using shared MDM governance behavior.
- [ ] **Import:** Add validated CSV/XLSX templates, dry-run preview, row-level errors, duplicate matches, approval routing, and a downloadable result report. Imports SHALL use the same authorization and governance controls as UI changes.
- [ ] **Quality:** Validate representative cross-module use cases: material requisition → purchase → receipt/stock → QS/cost reporting; equipment assignment → construction/maintenance; cost code → BOQ/budget/actuals.

**Exit criteria:** First operational libraries have approved code rules, clear distinction between master and transaction data, controlled imports, and working consumer integrations.

### Phase 4 — Connect modules and migrate consumers

- [ ] **Backend:** Publish typed domain services/selectors for canonical records so modules do not create local copies or bypass lifecycle checks.
- [ ] **Procurement / Inventory / Finance:** Replace free-text or duplicate supplier/material selectors with canonical references where applicable; preserve historical display snapshots where transaction semantics require them.
- [ ] **Project / WBS / Planning / Documents / QA-QC / HSE:** Verify project, WBS, location, discipline, and responsible-party references use canonical IDs and approved codes consistently.
- [ ] **QS / Finance:** Map BOQ, budget, cost, rate, and transaction line items to the appropriate master entities without changing historical certified/posted values.
- [ ] **Search and reporting:** Add master-data search, lifecycle and completeness views, duplicate queue, change-request aging, and domain quality indicators from governed records.
- [ ] **Integration:** Define stable external identifiers and mappings for import/export; record source system, source key, sync outcome, and conflict/error handling before enabling automated synchronization.
- [ ] **Migration:** Run staged backfills, compare counts and checksums/mappings, inspect exceptions with data owners, and retain a rollback path for each consumer cutover.
- [ ] **Architecture:** Remove or deprecate duplicate local master write paths only after all consumers are migrated and verified.

**Exit criteria:** Selected modules consume canonical master IDs; integrations cannot create silent duplicates; historical reports and transactions retain their original meaning.

### Phase 5 — Governance operations, quality monitoring, and rollout

- [ ] **Product Owner / Data Governance:** Assign named domain owners and stewards, escalation routes, review cadence, and approval limits for each released domain.
- [ ] **Frontend / Backend:** Deliver stewardship dashboard for completeness, duplicates, invalid codes, inactive/deprecated records, unapproved changes, import failures, and request aging.
- [ ] **Backend:** Add configurable periodic review reminders and exception expiry/review tracking; avoid hard-coding cadence that the standard leaves configurable.
- [ ] **Audit / Security:** Review access by role, sensitive employee/vendor data, export permissions, immutable history, and tenant boundaries.
- [ ] **Data Steward:** Complete pilot cleanup for one tenant and selected domains; resolve or explicitly disposition every exception before broad release.
- [ ] **Product Owner:** Train administrators/stewards and publish operating procedures for new records, changes, duplicates, imports, merges, deactivation, and exceptions.
- [ ] **Release:** Roll out tenant by tenant with feature flags or controlled enablement, monitor errors and adoption, and keep a documented rollback/cutover decision.
- [ ] **Architecture:** Refresh the MDM document hierarchy and implementation status after the first production rollout.

**Exit criteria:** A pilot tenant operates MDM through the approved process, quality exceptions have owners, administrators are trained, and rollout/rollback evidence is accepted.

## 4. Cross-cutting acceptance checklist

- [ ] Every selected entity has a catalogue entry, owner, steward, scope, authoritative source, consumers, and lifecycle.
- [ ] Technical primary keys remain distinct from human-readable business codes and display names.
- [ ] Codes are generated/validated consistently, scoped uniquely as approved, and never silently reassigned after use.
- [ ] Tenant/company and project access are enforced in the database and server paths; client filtering alone is insufficient.
- [ ] Create, change, approve, merge, deactivate, and archive operations are authorized and auditable.
- [ ] Duplicate detection, merge/survivorship, and referential integrity have explicit behavior.
- [ ] Imports cannot bypass validation, authorization, duplicate review, approval, or audit.
- [ ] Inactive/deprecated records remain available to historical transactions and reports.
- [ ] Existing consumers and transaction history are reconciled before legacy sources become read-only.
- [ ] Database types, documentation, and operational procedures are updated with each released slice.

## 5. Explicitly deferred until justified

- Full enterprise-wide golden-record matching across all domains.
- Automated two-way synchronization with ERP, accounting, BIM, or government platforms.
- AI-driven entity resolution or automatic merges.
- Building every catalogue entity before its business owner and consuming module are ready.
- Replacing stable UUID foreign keys with business codes.
- A standalone MDM microservice; begin within the existing modular application and database.

## 6. Decisions to carry into Phase 0

These are implementation decisions for the named owners to resolve and record; they are not implied by the prompts:

1. Which platform/global reference data is centrally controlled, and which values may a tenant extend?
2. Is supplier a tenant-wide legal-entity record, and how are subcontractor qualifications/roles represented without a second supplier identity?
3. What is the canonical boundary among material master, QS cost library, supplier product, project material approval, and inventory item/stock?
4. Which employee/person fields may be visible to non-HR modules, and how do employee, external stakeholder, and login identities relate?
5. Which entity codes are assigned by users versus generated by DCOS, and what are the approved code patterns and uniqueness scopes?
6. Which first-release domains are required for the pilot, and who approves each domain's data cleanup and migration?

