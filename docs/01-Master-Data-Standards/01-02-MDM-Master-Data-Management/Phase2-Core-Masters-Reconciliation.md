# MDM Phase 2 — Core Masters Reconciliation

**Status:** Underway — repository and local baseline recorded; domain implementation is gated on owner decisions and hosted-state verification  
**Reviewed:** 2026-10-22  
**Related:** [Implementation plan](DCOS-MDM-Implementation-Todos.md), [Phase 0 findings](Phase0-Current-State-and-Decisions.md), [ADR-MDM-001](decisions/ADR-MDM-001-Canonical-Identity-and-Scope.md), [ADR-MDM-002](decisions/ADR-MDM-002-Business-Codes-and-Legacy-Migration.md)

> This is a static repository and migration review. It does not certify hosted schema, inspect or profile live records, or constitute business approval. No Phase 2 schema or data migration is authorized by this baseline.

## 1. Phase 2 objective and boundary

Reconcile the existing Project, WBS, Supplier/Party, People, Organization, and Stakeholder records into governed domains while preserving UUID identity, foreign keys, historical transactions, and module behavior. Deliver one domain slice at a time. Do not create parallel master tables where an existing table is the canonical source.

Phase 2 changes are gated until the Product Owner/domain owners ratify the relevant Phase 0 decisions and the database owner compares hosted schema, policies, and migration history with this repository. Local migration files are not evidence of hosted deployment.

## 2. Repository baseline

| Domain | Current source and evidence | Reconciliation risk / required control |
|---|---|---|
| Company / tenant | `companies.id` is the established tenant identity; `profiles.company_id` feeds JWT `tenant_id` through the custom token hook. | Verify hosted hook and policies, and confirm whether users can belong to more than one company before tenant backfills. |
| Project | `projects.id` is the UUID referenced across modules. Initial schema has globally unique `project_code`, no tenant/company column, and broad authenticated read/create/update policies. Follow-on migrations add project setup and lifecycle fields. | Do not add tenant-scoped uniqueness or project ownership until ownership source, existing project assignments, and all consumers are reconciled. Preserve project UUIDs and current codes. |
| WBS | `wbs_nodes` and `wbs_tasks` are the canonical hierarchy/task sources. Initial `wbs_nodes` uniqueness is `(project_id, wbs_code)`; `full_path` is derived. WBS versioning, imports, planning, QS, documents, inventory, and daily reporting use these IDs/codes. | Preserve UUIDs, project boundary, hierarchy/version behavior, generated paths, rollups, and code references. COD-001’s proposed stable codes conflict with existing move/collision behavior and require an approved compatibility design before changing generators. |
| Supplier / party | `procurement_suppliers` is referenced by RFQ/PO, AP, and other procurement records. It has a nullable `tenant_id`, required but not spine-unique `supplier_code`, and sensitive contact/bank/tax fields. `stakeholders` represents organizations and project parties; `stakeholder_staff` represents their contacts. | Do not merge or relink identities yet. Inventory every FK, read/write path, role, tenant scope, and sensitive field. Keep existing supplier/stakeholder UUIDs and transaction references. |
| People | `profiles.id` is the auth UUID; HR adds employment attributes and assignments elsewhere. `stakeholder_staff` is a separate external-contact identity. | Keep user account, employee/person, and external contact distinct. Define privacy and access boundaries before adding common identity links or exposing employee fields through MDM. |
| Organization | `companies` is the current tenant/company table; project and party organizations are represented through other structures. | Resolve whether organization/legal-party identity is shared and how multiple roles/tenants work before introducing a canonical party relation. |

These are repository findings, not a complete consumer inventory. They do not prove deployed policy behavior or data quality.

### Migration-level foreign-key and consumer map

The migration scan confirms these dependency groups. It is a first-pass FK map: dynamic SQL, JSON references, external integrations, generated types, and every frontend write path still need separate review before a cutover.

| Master | Migration-level consumers found | Cutover concern |
|---|---|---|
| Project | WBS nodes/tasks; project setup/configuration; documents/transmittals; HR assignments and timesheets; Procurement; QS/Finance; Design; Planning; Construction; QA/QC; HSE; Daily Reporting; tender and subcontract records. | Project identity and visibility changes have broad blast radius. Inventory all child-table policies, not only `projects` RLS. |
| WBS node/task | Documents; Procurement; QS BOQ/cost and claims; HR assignments/timesheets; Planning/scheduling; Design; Construction; Inventory; QA/QC; HSE; Daily Reporting; task alerts and activity libraries. | Preserve project membership checks, node path/rollup triggers, imports, version restore, re-parent behavior, and historical snapshots. |
| Supplier | RFQ/quotation/PO/delivery; AP invoices and withholding; subcontract administration; supplier prequalification/performance; tender cost estimation; procurement audit. | Existing transaction FKs point directly at `procurement_suppliers.id`; preserve IDs and bank/tax/contact access boundaries. |
| Stakeholder / contact | Project/client links; project stakeholder mappings/teams; naming conventions; document transmittal receivers; AR client invoices; stakeholder compliance. | Organization and contact identity are separate today. Avoid changing client/vendor joins as part of a code cleanup. |
| Profile / person | Project and WBS ownership/assignment; HR reporting, payroll, attendance, leave, timesheets and employee documents; approval actors/audit; module assignees. | Auth UUIDs are deeply referenced. Keep HR-sensitive records behind HR access and do not substitute person identifiers for auth identity. |

Representative source migrations include `20260527000008_create_projects.sql`, `20260527000009_create_wbs_nodes.sql`, `20260527000016_create_wbs_enterprise_tables.sql`, `20260531000005_create_procurement_tables.sql`, `20260531000023_create_qs_boq_tables.sql`, `20260531000028_account_ap_invoices.sql`, `20260531000029_account_ar_invoices.sql`, `20260531000049_subcontractor_management.sql`, `20260531000057_supplier_prequalification.sql`, and later Planning, Design, Construction, HSE, and Daily Reporting migrations.

### Application write-paths identified so far

- Project: `apps/web/lib/project/projects/create-project.ts`, `projects-queries.ts`, `tender-registration.ts`, project setup services, and the Projects dashboard forms/list. Also search all direct `projects` queries before policy changes.
- WBS: `apps/web/lib/project/wbs/wbs-queries.ts`, `wbs-version-service.ts`, `wbs-hierarchy.ts`, template application, and Master WBS import components. Updates may change `parent_id`, `wbs_code`, and `sort_order` together; version restore and database rollup/path triggers are compatibility requirements.
- Supplier: Procurement query/service layer and `supplier-form.tsx` / `supplier-list.tsx`; also supplier portal, RFQ, PO, invoice, prequalification, and subcontract flows.
- Stakeholder/contact: `apps/web/lib/project/stakeholders/stakeholders-queries.ts`, `stakeholder-assignment.ts`, Stakeholder dashboard forms, and project team/contact management components.

This identifies obvious write owners, not a complete call graph. Raw SQL, generated RPCs, import endpoints, service-role paths, background tasks, and lesser-used module screens remain to be traced.

## 3. Local development snapshot

Read-only aggregate queries were run against the running local Supabase database on 2026-10-22. No personal, bank, tax, contact, project-name, or other row-level values were returned. These results describe local development data only; hosted counts and policy state remain unverified.

| Check | Local result | Consequence |
|---|---:|---|
| Companies / profiles | 1 company; 41 profiles, 35 with a company and 6 without | Do not assume missing profile ownership. Resolve profile/company ownership before tenant-scoped access is enabled. |
| Projects | 14 projects; no `tenant_id` or `company_id` column | Project ownership cannot be filtered at the project row. |
| Project membership as ownership evidence | 12 projects have no members; 13 have no resolvable member-company; 1 has a single member-company; none have conflicting member-company assignments | `project_members` cannot safely backfill ownership for this dataset. An owner-reviewed mapping/source is required for 13 projects. |
| WBS integrity | 294 nodes, 1,998 tasks; zero cross-project parent links, zero task/node project mismatches, zero duplicate task-code groups by project | No sampled aggregate integrity anomaly in these checks. This does not validate imports, version history, or external references. |
| Suppliers | 5 rows; all 5 have null `tenant_id`; zero duplicate `(tenant_id, supplier_code)` groups | No supplier tenant policy can be enabled safely until each row has an approved owner mapping. |
| Stakeholders | 3 rows; zero duplicate normalized organization-name groups | Small local sample only; no duplicate-resolution conclusion for hosted data. |

### Local effective-policy observations

- `projects`, `wbs_nodes`, `stakeholders`, and `profiles` have local SELECT policies with `USING (true)`. Project and WBS authenticated INSERT/UPDATE policies also use unconditional checks. These policies do not provide tenant isolation.
- `procurement_suppliers` policies check Procurement permissions but do not include a `tenant_id` predicate. Permission control alone is not tenant isolation.
- `project_members` SELECT uses `is_project_member(project_id)` and is useful for access membership, but the aggregate profile above shows it is not a complete project ownership source.
- These observations are from local `pg_policies`, not hosted. A broader dependent-table policy audit is required before tightening access, because many modules have their own project/WBS-scoped tables and current policies.

## 4. Proposed execution order

### Slice 2A — Project and WBS integrity baseline

1. Database owner records hosted migration-history and effective RLS/policy inventory for `companies`, `profiles`, `projects`, `project_members`/membership tables, `wbs_nodes`, and `wbs_tasks`.
2. Product/Project owners choose the authoritative project ownership relation and approve project code pattern, uniqueness scope, and legacy-code treatment.
3. Complete a source and consumer inventory for project creation/import, WBS creation/move/version/import, code generation, and downstream FKs.
4. Profile duplicate/missing ownership/code/hierarchy anomalies using aggregate reports; have data owners review any row-level exceptions.
5. Design the smallest additive migration and application transition. Preserve UUIDs and compatibility reads; migrate and reconcile before retiring legacy writes.
6. Release project ownership/RLS changes only with cross-tenant isolation and project membership tests. Apply approved WBS code enforcement separately, after move/version/import compatibility is proven.

### Slice 2B — Supplier and party identity

1. Inventory `procurement_suppliers`, `stakeholders`, `stakeholder_staff`, DWL supplier structures, and all supplier/client/contact FKs and consumers.
2. Obtain Procurement, Finance, Project, and Data Governance decisions on legal-party identity, supplier/subcontractor/client roles, tenant ownership, duplicate survivorship, and sensitive field access.
3. Prepare a reviewable UUID-preserving crosswalk; do not rewrite transaction FKs as part of deduplication without explicit owner approval and reconciliation evidence.
4. Add governed writes and tenant policies only after hosted state and every writer are known; preserve existing transaction joins and audit history.

### Slice 2C — People and organization boundaries

1. Inventory profile, HR, employee assignment, reporting structure, stakeholder contact, and auth relationships.
2. Obtain HR/Security decisions on person identity, employee number, login linkage, company/project employment scope, and restricted attributes.
3. Add only approved identity/link records and privacy-aware policies; preserve auth UUIDs and HR history.

## 5. Phase 2 entry and release gates

- [ ] Product Owner/domain owners ratify ADR-MDM-001/002 decisions and selected release domains.
- [ ] Database owner verifies hosted migration history, schema, custom token hook, membership model, and effective RLS for the selected slice.
- [ ] Named domain owners/stewards approve source-of-record, code scope, lifecycle, access, and survivorship decisions.
- [ ] Consumer/FK/write-path inventories and aggregate data-quality profiles are reviewed for that slice.
- [ ] Migration includes a UUID-preserving crosswalk, reconciliation evidence, compatibility/rollback plan, and staged legacy-write retirement.
- [ ] Quality verifies tenant isolation, FK/reference integrity, row counts, code uniqueness, module workflows, and historical reporting before cutover.

## 6. Work completed in this kickoff

- [x] Recorded a repository-based canonical-source and migration-risk baseline for the core master domains.
- [x] Identified Project/WBS as the lowest-risk first *analysis* slice while documenting unresolved ownership/code compatibility gates.
- [x] Profiled local aggregate Project/WBS/Supplier/Stakeholder and profile-company integrity without retrieving row-level personal data.
- [x] Inspected local schema columns and current RLS predicates for the initial core-master tables.
- [x] Scan migration foreign keys and record major dependent module groups for Project, WBS, Supplier, Stakeholder, and Profile identity.
- [ ] Complete application write-path inventory across UI, APIs, imports, RPCs, triggers, and background jobs.
- [ ] Verify hosted policies, schema, token hook, and migration history; local results do not certify hosted behavior.
- [ ] Resolve company ownership for 13 of 14 local projects and tenant ownership for all 5 local suppliers from an authoritative owner-approved source.
- [ ] Begin a domain migration only after the corresponding gates above are satisfied.

## 7. Current recommendation

Begin Phase 2 with project/WBS inventory and owner decisions, but do not alter canonical schema yet. Project tenant ownership and WBS code stability affect many modules and cannot be safely inferred from repository drafts. Continue to preserve current UUIDs, identifiers, and consumer behavior until the owner-approved migration design and hosted baseline are available.
