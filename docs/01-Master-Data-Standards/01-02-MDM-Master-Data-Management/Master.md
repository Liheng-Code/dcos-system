| No.    | Document ID          | Document                                    | Purpose                                                                                                                  |
| ------ | -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **01** | **DCOS-MDM-STD-001** | **Enterprise Master Data Standard**         | The **main policy & standard** — defines what MDM is, principles, scope, governance, responsibilities, and overall rules |
| **02** | **DCOS-MDM-CAT-001** | **Master Data Catalogue**                   | Defines **what master data DCOS has**: Project, WBS, Material, Supplier, Employee, Equipment, etc.                       |
| **03** | **DCOS-MDM-COD-001** | **Master Data Coding & Naming Standard**    | Defines **how everything is coded and named**: Project codes, Material codes, Supplier codes, WBS codes, etc.            |
| **04** | **DCOS-MDM-DIC-001** | **Master Data Dictionary**                  | Defines **what each field means**: field name, data type, mandatory/optional, description, allowed values, relationships |
| **05** | **DCOS-MDM-GOV-001** | **Master Data Governance & Responsibility** | Defines **who creates, reviews, approves, changes and controls** master data                                             |
| **06** | **DCOS-MDM-PRO-001** | **Master Data Management Procedures**       | Defines **how users actually operate the system**: create → review → approve → activate → change → deactivate            |

## Implementation planning

- [DCOS Master Data Management — Implementation Todo Plan](DCOS-MDM-Implementation-Todos.md) — phased implementation plan, current-state reconciliation, migration gates, and acceptance criteria.
- [MDM Phase 0 — Current-State Findings and Decisions](Phase0-Current-State-and-Decisions.md) — repository evidence, implementation constraints, and decisions awaiting owners.
- [ADR-MDM-001 — Canonical Identity and Scope](decisions/ADR-MDM-001-Canonical-Identity-and-Scope.md) — proposed identity, ownership, and entity-scope decisions.
- [ADR-MDM-002 — Business Codes and Legacy Migration](decisions/ADR-MDM-002-Business-Codes-and-Legacy-Migration.md) — proposed code patterns, allocation, and migration rules.
- [MDM Phase 1 — Governance Foundation Design](Phase1-Governance-Foundation-Design.md) — request lifecycle, permissions, tenant security, API/UI boundaries, and acceptance criteria.
- [MDM Phase 1 Supabase migration](../../supabase/migrations/20261022160000_mdm_governance_foundation.sql) — tenant registry, request/event tables, RLS, permission seeds, and transactional governance RPCs (applied and acceptance-checked locally; hosted promotion remains gated).
- [MDM Phase 2 — Core Masters Reconciliation](Phase2-Core-Masters-Reconciliation.md) — canonical-source baseline, bounded domain sequence, migration gates, and initial Project/WBS analysis slice.
- [MDM Phase 3 — Operational and Commercial Libraries](Phase3-Operational-and-Commercial-Libraries.md) — local source baseline plus applied local MAT create adapter; owner approval, legacy write-path cutover, and other library domains remain open.
