# DCOS-MDM-COD-001 â€” DCOS Master Data Coding & Naming Standard

| Document control | Value |
|---|---|
| Document ID | DCOS-MDM-COD-001 |
| Version | 1.0 Draft for Owner Review |
| Status | Draft for Standardization |
| Parent standard | [DCOS-MDM-STD-001](../DCOS-MDM-STD-001/DCOS-MDM-STD-001.md) |
| Catalogue | [DCOS-MDM-CAT-001](../DCOS-MDM-CAT-001/DCOS-MDM-CAT-001.md) |
| Owner | DCOS Enterprise Architecture / Data Governance |

> Patterns in this draft govern **new codes after approval**. Existing codes remain unchanged until their data is profiled, mapped, and a migration is approved. This document does not assert that a database allocator or hosted constraint already implements these rules.

## 1. Purpose and scope

This Standard defines how governed DCOS entities are identified, coded, named, numbered, and referenced. It applies to catalogue entities that require a human-readable business identifier. It does not define SQL, API, or screen implementation.

## 2. Identifier types

| Identifier | Purpose | Rule |
|---|---|---|
| Technical ID | Stable internal relationship key, currently generally a UUID. | SHALL be used for database references. SHALL NOT be replaced with a business code. |
| Business code | Human-readable identifier used in reports and business operations. | SHALL be unique within the scope in the matrix, stable once assigned, and retained when the record becomes inactive. |
| Name | Readable business description. | SHALL be stored separately from code and MAY be corrected through an audited change. |
| External identifier | Identifier assigned by a customer, supplier, regulator, or external system. | SHALL be stored with its source/system and SHALL NOT overwrite the DCOS code. |
| Alias / legacy code | Prior or alternate identifier retained for search and transition. | SHALL map to one record within its stated source/scope and SHALL not be reassigned. |

## 3. General code rules

1. Codes SHALL use uppercase ASCII letters, digits, and hyphens as separators, except where an established document-control standard requires another form.
2. A code SHALL identify the record, not encode mutable attributes such as name, owner, price, employment status, or technical specification.
3. Prefixes SHALL come from the matrix below. Domain/category components SHALL come from a controlled list. Free-text abbreviations are prohibited in generated codes.
4. Sequential codes SHALL be allocated atomically by a server/database-controlled allocator scoped exactly as specified. Clients SHALL not choose sequence values or tenant IDs.
5. Gaps in a sequence are acceptable. A failed or cancelled request SHALL not cause a previously issued code to be reused.
6. Codes SHALL not be changed because a name, department, discipline, project assignment, or descriptive attribute changes. A correction requires approval, audit evidence, and an old-to-new alias where the original is invalid.
7. Retired codes SHALL remain reserved. Merges SHALL keep retired codes searchable through an alias/crosswalk pointing to the surviving record.
8. Tenant-owned codes may repeat in different tenants only where the scope matrix says tenant. APIs and exports SHALL include tenant context where a code alone is not globally unique.
9. Codes SHALL not contain personal or confidential information.

## 4. Approved proposed code matrix

These patterns form the recommended v1 baseline for owner ratification.

| Entity | Prefix / pattern | Uniqueness scope | Generator / owner | Notes |
|---|---|---|---|---|
| Company / Tenant | `COM-{SEQ6}` | Platform | Platform administrator | Company is the tenant identity; existing company codes are retained. |
| Business Unit | `BU-{SEQ4}` | Tenant | Company steward | Optional domain until ownership is confirmed. |
| Department | `DEP-{SEQ4}` | Tenant | HR steward | Position and permission role are separate concepts. |
| Person | `PER-{SEQ6}` | Tenant | Authorized steward | Only if a separate person master is approved; not an auth UUID. |
| System User | No new business code required | Platform/account scope | Supabase Auth | Auth UUID is technical identity. Do not expose email as a code. |
| Employee | `EMP-{SEQ6}` | Tenant | HR steward/allocator | Stable across department and project changes. |
| Project | `PRJ-{YYYY}-{SEQ5}` | Tenant | Project administrator / allocator | Year is the issuance year and never changes. UUID remains the FK. Existing project codes are preserved. |
| WBS node | `WBS-{SEQ6}` | Project | Project WBS allocator | Node code is stable when re-parented; hierarchy/path is derived separately. |
| Task template | `TSK-{SEQ5}` | Tenant | Planning/Construction steward | Actual scheduled task identity remains project/task-specific. |
| Building | `BLD-{SEQ4}` | Project | Project WBS/location allocator | Use only when a distinct building entity is needed beyond a WBS node. |
| Level | `LVL-{SEQ4}` | Parent building | Project WBS/location allocator | Parent relationship is authoritative; display level labels may be `B1`, `L01`, etc. |
| Zone | `ZON-{SEQ4}` | Parent location | Project WBS/location allocator | Do not use spatial code as a substitute for WBS UUID. |
| Room / Space | `ROM-{SEQ5}` | Project | Project WBS/location allocator | Room name/number from the design remains a separate attribute/alias. |
| General project location | `LOC-{SEQ5}` | Project | Project administrator | Applies to locations not represented by the spatial hierarchy. |
| Room template | `RMT-{SEQ5}` | Tenant | Design/FM steward | Template, not project instance. |
| Element template | `ELM-{SEQ6}` | Tenant | Engineering/BIM steward | Technical attributes remain fields, not code components. |
| Business party | `BP-{SEQ6}` | Tenant | Authorized party steward | One legal-party identity may have Supplier, Client, Consultant, or Contractor roles. |
| Material / Resource | `MAT-{DISC}-{SEQ6}` | Tenant | QS/Engineering allocator | `DISC` is an approved discipline/category code; do not encode grade/specification in code. |
| Material specification | `MATS-{SEQ5}` | Tenant | Engineering steward | Revision is separate, e.g. `R01`; effective-dated revisions are retained. |
| Equipment type | `EQT-{SEQ5}` | Tenant | Plant steward | Reusable model/type, separate from physical asset. |
| Equipment asset | `AST-{SEQ6}` | Tenant | Asset/Plant steward | Individually tracked owned, leased, or hired asset. |
| Labor resource type | `LAB-{SEQ5}` | Tenant | HR/QS steward | Trade/crew classification, not employee identity. |
| Cost code | `CST-{GROUP}-{SEQ4}` | Tenant | Finance/QS steward | Group is controlled; project mappings do not redefine the tenant chart. |
| BOQ item | `BOQ-{SEQ6}` | Project | QS allocator | Actual quantity/rate/revision remains in the BOQ record. |
| Contract | `CON-{PROJECTCODE}-{SEQ3}` | Project | Commercial steward | Project code is a component; contract revision/amendment is separate. |
| Document number | Per Document Control Standard | Project / document class | Document Control | This MDM standard does not supersede the document numbering procedure. |
| Warehouse / Store | `WHS-{SEQ4}` | Project | Inventory steward | Stock, bins, and movements are separate records. |
| Unit of measure | Approved short symbol/code | Platform reference | Data Governance | Use controlled UCUM/ISO-aligned values where adopted; never create local spellings without approval. |
| Currency | ISO 4217 alphabetic code | Platform reference | Finance/Data Governance | Currency code is the standard currency identity. |
| Discipline | Approved 2â€“5 letter code | Platform reference | Engineering/Data Governance | Initial examples: ARC, STR, CIV, MEP, INT, LND, GEN. Stewarded list only. |
| Document type | Approved 2â€“6 letter code | Tenant or platform per configuration | Document Control | Must align with document-control numbering. |

`{SEQn}` is a zero-padded positive sequence of `n` digits. Allocation must reject overflow and require an approved pattern revision rather than silently widen or wrap. `{YYYY}` is the four-digit issuance year. Hyphen is the only general code separator. The `DISC`, `GROUP`, and `PROJECTCODE` components are controlled references and SHALL be validated before allocation.

## 5. WBS and spatial coding rules

The WBS technical ID is the stable UUID. The WBS business code is unique within a project and SHALL remain stable if the node is renamed or moved. Parent relationships and the displayed full path express hierarchy; the node's identity code SHALL NOT be rebuilt from its ancestors. This avoids changing identifiers for every descendant after a re-parent or inserted level.

Spatial identifiers (building, level, zone, room) SHOULD use project/parent-scoped codes only when the project needs a distinct spatial entity. Where a spatial WBS node is already the authoritative record, use its UUID and code rather than duplicating it in a second spatial master.

## 6. Naming rules

- Names SHALL be concise, specific, and understandable to intended users. Store code separately.
- Use the source/legal registered name for legal parties where available; store trading name and aliases separately.
- Do not abbreviate names to fit a code pattern. Approved abbreviations apply only to code components and controlled displays.
- Preserve original-language/legal names where needed. Search normalization may create derived forms but SHALL not replace the source name.
- Trim leading/trailing whitespace; disallow control characters; normalize repeated whitespace for comparison. Do not silently transliterate or remove meaningful characters from stored names.
- File/folder names and document titles follow the applicable Document Control Standard, not these master-name rules.

## 7. Duplicate detection and code assignment

Before issuing a code, the creating service SHALL verify uniqueness within the matrix scope and search likely duplicates using the domain's identifiers and normalized attributes. A duplicate match SHALL be reviewed; the allocator SHALL not merge records automatically.

Sequential allocation SHALL be atomic and concurrency-safe. Tenant and project scope SHALL be determined from authenticated context and validated against the selected parent. Manual code entry MAY be permitted only for a domain with an approved import or legacy exception process; it remains subject to validation and audit.

## 8. Legacy and migration policy

1. Existing codes SHALL be inventoried and profiled before applying new constraints.
2. Preserve the current code as the primary business code when it is unique and operationally established, even if its format differs from this Standard. Record its format as a legacy exception until a migration is approved.
3. If duplicate legacy codes exist within the intended scope, steward review SHALL select survivorship. Do not append arbitrary digits without recording an alias and checking downstream documents.
4. New codes SHALL use this Standard only after approval and implementation of the appropriate allocator/constraint. Do not mix manual and generated numbering silently.
5. Every migration SHALL retain UUID identity, produce an old/new crosswalk, identify all consumers, reconcile references, and include rollback/recovery steps.
6. The current DWL material allocator emits a three-digit sequence and uses a non-tenant-scoped counter, while this proposed standard uses a six-digit tenant-scoped material sequence. Existing DWL codes remain unchanged; allocator migration is a later, separately reviewed implementation decision.

## 9. Code governance and exception control

The MDM governance board approves prefixes, patterns, scope, and revisions. Domain owners approve controlled component lists. Technical custodians implement atomic allocation and database uniqueness. Exceptions SHALL state business need, affected scope, collision analysis, owner, approver, and expiry/review date. A temporary exception does not authorize bypassing tenant isolation or audit.

## Appendix A â€” Approved component examples

| Component | Code | Example use |
|---|---|---|
| Architecture discipline | ARC | `MAT-ARC-000123` |
| Structural discipline | STR | `MAT-STR-000123` |
| Civil discipline | CIV | `MAT-CIV-000123` |
| Mechanical/electrical/plumbing | MEP | `MAT-MEP-000123` |
| General / unclassified | GEN | `MAT-GEN-000123` |
| Revision | `R` + two digits | `R01`, `R02` (separate from entity code) |

## Appendix B â€” Examples

| Entity | Example | Meaning |
|---|---|---|
| Project | `PRJ-2026-00042` | 42nd project code issued in 2026 within the tenant scope. |
| WBS node | `WBS-000127` | Stable node code within its project; hierarchy comes from parent links. |
| Material | `MAT-STR-000123` | Structural material resource; specification is stored separately. |
| Business party | `BP-000456` | Party identity; supplier/client roles are linked attributes/relationships. |
| Employee | `EMP-000031` | Tenant employee number, unrelated to email or project assignment. |
| Contract | `CON-PRJ-2026-00042-003` | Third contract record for the project; amendments are separately versioned. |
