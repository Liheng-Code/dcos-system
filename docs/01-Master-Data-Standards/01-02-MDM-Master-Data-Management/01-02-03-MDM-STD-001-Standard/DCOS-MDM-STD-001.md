# DCOS-MDM-STD-001 — DCOS Enterprise Master Data Standard

| Document control | Value |
|---|---|
| Document ID | DCOS-MDM-STD-001 |
| Version | 1.0 Draft for Owner Review |
| Status | Draft for Standardization |
| Owner | DCOS Enterprise Architecture / Data Governance |
| Effective date | Upon approval |
| Review cycle | Annual, or after a material architecture or governance change |
| Related documents | [Master Data Catalogue](../DCOS-MDM-CAT-001/DCOS-MDM-CAT-001.md); [Coding & Naming Standard](../DCOS-MDM-COD-001/DCOS-MDM-COD-001.md) |

> This draft establishes an internally consistent implementation baseline. It does not record company approval. Domain owners must ratify ownership, scope, and operating responsibilities before production governance controls are enabled.

## 1. Purpose

This Standard establishes the principles and controls for identifying, owning, creating, validating, changing, using, and retiring master data in DCOS. It applies across the unified construction operating system and its modular discipline workspaces.

Its governing principle is: **one business identity, one controlled definition, and one authoritative source for each approved scope.** Modules may maintain domain-specific attributes and transactions, but must reference the same identity where they describe the same entity.

## 2. Scope

This Standard applies to enterprise, tenant/company, project, resource, and reference data listed in CAT-001. It covers data governance, coding, lifecycle, security, quality, integration, imports, and auditability.

It does not prescribe SQL schemas, APIs, screen layouts, detailed module workflows, or the detailed content of libraries. Those are governed by subordinate specifications and implementation designs.

## 3. Normative terms

- **SHALL** means mandatory for conformance.
- **SHOULD** means recommended unless a documented exception is approved.
- **MAY** means optional.
- **Master data** identifies relatively stable business entities reused by multiple processes.
- **Reference data** is a controlled vocabulary or classification used to validate or categorize records.
- **Transaction data** records an event or business activity and retains the relevant master identity and historical values.

## 4. Governing principles

1. **Authoritative identity:** Each catalogue entity SHALL have one declared system of record within its approved scope. Consumer modules SHALL not create independent duplicates of that identity.
2. **Separate identifier types:** Technical primary keys, business codes, names, and external-system identifiers are distinct. Existing UUID primary keys remain the internal relationship keys; a business code SHALL NOT replace them as an FK.
3. **WBS as project spine:** Project records and project-controlled work SHALL use the existing project and WBS structure where relevant. MDM does not create a parallel project or WBS hierarchy.
4. **Tenant isolation:** Company-owned data SHALL be isolated by the authenticated tenant/company context. Tenant identifiers SHALL be derived from trusted server/auth context and validated against referenced project and parent records.
5. **Governed reuse:** Enterprise or tenant masters MAY be reused by projects. A project extension adds approved project context without silently changing the enterprise definition or creating an uncontrolled duplicate.
6. **Lifecycle over deletion:** Referenced masters SHALL be deactivated, deprecated, merged, or archived under control rather than hard-deleted. Historical transactions SHALL retain their original identity and relevant snapshots.
7. **Auditability:** Creation, approval, changes, code assignment, merge, status transition, import, export, and archival SHALL be attributable and traceable.
8. **Proportionate governance:** Controls SHALL reflect business risk and sensitive data. Employee, finance, and supplier banking information require restricted access.

## 5. Data classification and scope

| Scope | Definition | DCOS control |
|---|---|---|
| Platform reference | Vocabularies intentionally shared by all tenants (for example ISO country codes, if adopted). | Platform custodian controls changes; tenant writes are prohibited. |
| Tenant/company | Data owned by one company and reusable across its projects (for example suppliers, employees, inventory items). | Tenant-scoped access and uniqueness. Tenant extension is a separate record or mapping, not mutation of platform reference data. |
| Project | Data defined for a project (for example project, WBS node, project location, project cost code). | Project access rules apply; project-owned records reference the company and project context. |
| Resource / library | Reusable materials, labor, equipment types, assemblies, and cost references. | The catalogue SHALL state whether the resource is platform, tenant, or project scoped. Prices and stock balances are not identity attributes. |
| Transaction-supporting | Controlled definitions used by transactions (for example units, tax categories, document types). | Changes are effective-dated or versioned where prior transactions depend on historical meaning. |

The repository currently uses `companies.id` as the company identity linked from `profiles.company_id` and exposed in JWT `tenant_id`. New tenant-owned records SHALL align with that established identity unless an approved architecture decision replaces it. Global reference data SHALL be explicitly identified; absence of `tenant_id` alone does not make a record global.

## 6. Domains and authoritative-source rule

CAT-001 is the register of recognized MDM entities, ownership, scope, and consumers. The current implementation baseline keeps `projects`, `wbs_nodes`, and `wbs_tasks` as the project/WBS sources of record. Candidate supplier, people, and material tables require reconciliation against CAT-001 and the current-state assessment before migration. This Standard does not declare separate legacy tables to be equivalent merely because they use similar names.

For each entity CAT-001 SHALL identify:

- a stable entity code and definition;
- data scope and mandatory/optional status;
- a business owner and steward function;
- an authoritative source and consuming modules;
- relationships to project/WBS and other masters;
- lifecycle and migration notes where legacy records exist.

## 7. Ownership and segregation of duties

| Role | Accountability |
|---|---|
| Executive sponsor | Sponsors the governance framework and resolves escalated cross-functional conflicts. |
| MDM governance board | Approves standards, cross-domain definitions, exceptions, and ownership disputes. |
| Domain owner | Accountable for definition, quality thresholds, access, and approval rules for a domain. |
| Data steward | Reviews requests, resolves quality exceptions, searches duplicates, and maintains the catalogue and code lists. |
| Technical custodian | Implements database constraints, access policies, integrations, audit retention, and recovery. |
| Data consumer | Uses authoritative IDs and reports defects; does not create a local substitute master. |

The requesting user SHALL not approve their own request where separation of duties is required. Domain owners SHALL assign named users or roles and delegations in an approved governance register before enabling approvals in production.

## 8. Naming, codes, and reference values

DCOS-MDM-COD-001 governs code patterns, names, abbreviations, generated sequences, and legacy identifiers. Each entity SHALL have a defined uniqueness scope and code assignment method. A code SHALL remain stable once used in a transaction or external reference; corrections require an audited change and alias/crosswalk where the code cannot be preserved.

Names SHALL be readable, descriptive, and separate from codes. Business-sensitive or personally identifying information SHALL NOT be embedded in codes. Units, currencies, countries, disciplines, statuses, and classifications SHALL use controlled reference values. Local extensions SHALL be namespaced and stewarded.

Historical transactions SHALL preserve the code/name or other descriptive snapshot required for faithful reporting even if the live master changes later.

## 9. Lifecycle and change control

The standard lifecycle is:

```text
Requested → Draft → Validated → Reviewed → Approved → Active
                                      ↘ Rejected / Returned
Active → Change Requested → Approved Change → Active
Active → Inactive / Deprecated → Archived
Duplicate → Reviewed → Merged or Retired (with crosswalk)
```

- Draft and rejected records SHALL not be available for ordinary transactional selection.
- Activation SHALL require mandatory-field, code, relationship, duplicate, and permission checks.
- Material changes to identity, legal status, classification, or transaction meaning SHOULD require approval and effective dating.
- A record with references SHALL not be physically deleted through ordinary user workflows.
- Merge SHALL identify a surviving record, map retired IDs/codes, preserve transaction references, record the rationale, and be reversible by a documented recovery procedure where feasible.
- Imports SHALL enter the same validation, duplicate, authorization, approval, and audit controls as UI/API requests.
- Exceptions SHALL state justification, risk, owner, approver, scope, and expiry/review date.

## 10. Data quality and duplicate controls

Master records SHALL meet the domain's approved minimum completeness, accuracy, consistency, uniqueness, validity, timeliness, integrity, and traceability requirements before activation. The domain owner SHALL define required attributes in the applicable dictionary or module specification.

Duplicate checks SHOULD combine exact business identifiers with normalized names and domain-specific attributes. Potential matches SHALL be reviewed by a steward; automated matching MAY suggest candidates but SHALL NOT silently merge legal parties, people, materials, or assets.

Data-quality monitoring SHOULD report completeness, duplicate rate, invalid/retired code use, unapproved records, stale records, failed imports, and change-request aging. Thresholds and review frequency SHALL be configurable by domain risk.

## 11. Security and privacy

Access SHALL follow least privilege and separation of duties. RLS and server-side authorization SHALL enforce tenant/company and, where applicable, project scope. Client-side filtering alone is insufficient. Mutations SHALL validate that every referenced tenant, project, WBS node, and parent belongs to the authenticated scope.

Sensitive employee, banking, tax, and identity data SHALL be restricted to approved roles. Read-only consumers SHOULD receive only fields needed for their function. Exports SHALL be permission-checked and auditable. Cross-tenant access SHALL be denied by default.

## 12. Integration and WBS use

Modules SHALL reference canonical master UUIDs and may display the approved business code/name. Integrations SHALL preserve the source-system identifier separately from DCOS identity and record mapping failures for review. Synchronization SHALL define source of truth, direction, conflict ownership, retry behavior, and audit evidence before activation.

The WBS provides project context; master data provides standardized business identity. Materials, equipment, cost codes, documents, inspections, and tasks link to the project/WBS where their business process requires it. Tenant-level master data is not assigned a project merely to make it selectable in a project.

## 13. Audit, retention, and reporting

An auditable event SHALL identify actor/service, action, entity and record, timestamp, source, reason where applicable, approval decision, and before/after values or a protected diff. Audit history SHALL not be editable by ordinary users. Sensitive values SHALL be redacted or access-restricted in audit views while retaining evidence of the change.

Archival and retention SHALL follow company policy and applicable obligations. Deactivation or archival SHALL not break foreign keys or historical reports. The domain owner SHALL define retention and periodic review requirements before production enablement.

## 14. Implementation and conformance

Implementation SHALL proceed in controlled domain slices:

1. Approve this Standard, CAT-001, COD-001, ownership, and first-release scope.
2. Inventory current schema, RLS, consumers, imports, duplicates, and codes; confirm deployed state.
3. Establish canonical sources and UUID/code crosswalks for selected domains.
4. Add database constraints and tenant-safe lifecycle controls with reviewed backfills and rollback plans.
5. Migrate consumers and imports; retire duplicate write paths only after reconciliation.
6. Monitor quality, access, audit, and operating performance before expanding scope.

A domain conforms when its catalogue entry, owner, scope, code rule, lifecycle, permissions, audit behavior, duplicate process, consumer links, and migration/cutover evidence are documented and reviewed. Material exceptions require governance approval. No production data migration is authorized by this document alone.

## 15. Document hierarchy and maintenance

```text
DCOS-MDM-STD-001  Governing rules
├── DCOS-MDM-CAT-001  Recognized domains and entities
├── DCOS-MDM-COD-001  Codes, names, and numbering
├── Data dictionaries and domain specifications
├── Governance and operating procedures
└── Actual governed master records
```

The MDM governance board owns revisions. Proposed changes SHALL state rationale, affected entities/modules, migration impact, and effective date. Review at least annually and after major platform or business changes.

## Appendix A — Initial quality dimensions

| Dimension | Control question |
|---|---|
| Completeness | Are the required attributes present for this lifecycle state? |
| Accuracy | Is the record supported by a reliable business source? |
| Consistency | Do values and relationships agree across DCOS? |
| Uniqueness | Is this the sole active identity for the entity within its scope? |
| Validity | Do codes and values conform to approved rules? |
| Timeliness | Is the record current for its effective period? |
| Integrity | Are references valid and within the same authorized scope? |
| Traceability | Can source, owner, changes, and approvals be established? |

## Appendix B — Required glossary

| Term | Definition |
|---|---|
| Authoritative source | Approved system/table or controlled process responsible for the current identity and definition. |
| Business code | Human-readable, governed identifier for a business entity. |
| Data owner | Business role accountable for a domain's definition, quality, and access. |
| Data steward | Operational role that validates, maintains, and monitors domain records. |
| Data custodian | Technical role responsible for secure storage, controls, and availability. |
| Golden record | The accepted authoritative representation of an entity within a defined scope. |
| Master data | Reusable identity data describing core entities used by business processes. |
| Project extension | Approved project-specific attributes or selection linked to an enterprise/tenant master. |
| Reference data | Controlled values used for classification or validation. |
| Single source of truth | The governed authoritative source for a defined entity and scope. |
| Tenant | Company boundary used to isolate company-owned DCOS data. |
| Transaction data | Data recording a business event, retaining required historical context. |
| WBS | Project work breakdown structure providing shared project context for work and records. |
