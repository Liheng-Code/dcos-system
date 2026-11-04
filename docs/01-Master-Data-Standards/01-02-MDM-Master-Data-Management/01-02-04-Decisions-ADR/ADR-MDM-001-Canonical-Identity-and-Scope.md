# ADR-MDM-001 — Canonical Identity and Scope

**Status:** Proposed for owner ratification  
**Date:** 2026-10-22  
**Decision owner:** DCOS Product Owner and MDM Governance Board  
**Related:** [STD-001](../DCOS-MDM-STD-001/DCOS-MDM-STD-001.md), [CAT-001](../DCOS-MDM-CAT-001/DCOS-MDM-CAT-001.md), [Phase 0 assessment](../Phase0-Current-State-and-Decisions.md)

## Context

DCOS contains project and WBS records, several external-party/supplier stores, profile-based HR records, Inventory items, and QS/DWL resources. These domains predate the MDM standards and differ in tenant scope, access policy, codes, and transaction references. Consolidating records without a source-of-record decision could break procurement, finance, planning, inventory, or historical reporting.

## Decision proposed

1. Preserve existing UUID primary keys as the technical identity and FK target. Business codes are display/integration identifiers, not relational keys.
2. Keep `companies.id` as the company/tenant key used by `profiles.company_id` and the JWT `tenant_id` claim.
3. Keep `projects`, `wbs_nodes`, and `wbs_tasks` as the canonical project/WBS sources. MDM governs them; it does not clone them.
4. Model a legal/business party once and assign roles (supplier, subcontractor, client, consultant, contractor) through governed relationships. Treat the existing `stakeholders`, `procurement_suppliers`, and `dwl_suppliers` as legacy candidate sources until a row-level survivorship and FK crosswalk is approved. Do not merge tables in the design phase.
5. Keep Person, Employee, System User, and external contact distinct. HR owns employment attributes; account identity and access permissions remain in Auth/RBAC.
6. Treat the reusable technical material/resource identity, inventory item settings, project material approval, supplier product, stock/batch, and cost/price record as separate concepts. Use DWL resources/specifications as the candidate reusable technical identity; retain `inv_items` as the candidate inventory-facing catalogue pending mapping.
7. Scope tenant-owned entities and codes to `companies.id`; scope project records to the existing project UUID. Platform references are explicitly identified and centrally governed.
8. Do not rewrite current codes, UUIDs, or transaction FKs. Future merges require a reviewed crosswalk, consumer checks, preservation of history, and rollback/recovery instructions.

## Consequences

- The first implementation must reconcile party and material records before choosing a definitive physical schema or retiring write paths.
- Existing broad RLS and tenant inconsistencies must be assessed against deployed state before migrations are planned.
- A common party master and links from existing supplier/contract/stakeholder data are a later migration, not a Phase 0 schema change.
- The catalogue can assign stable conceptual entity codes now without forcing every entity into a new table or screen.

## Ratification required

Product Owner and domain owners should confirm the proposed scope and ownership, especially decisions 4–6. Once ratified, record the approver/date below and update this ADR status to **Accepted**.

**Ratified by:** Pending  
**Date:** Pending
