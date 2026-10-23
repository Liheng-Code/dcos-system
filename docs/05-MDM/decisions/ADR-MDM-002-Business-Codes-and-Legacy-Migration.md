# ADR-MDM-002 — Business Codes and Legacy Migration

**Status:** Proposed for owner ratification  
**Date:** 2026-10-22  
**Decision owner:** DCOS Product Owner and MDM Governance Board  
**Related:** [COD-001](../DCOS-MDM-COD-001/DCOS-MDM-COD-001.md), [Phase 0 assessment](../Phase0-Current-State-and-Decisions.md)

## Context

COD-001 prompt examples conflict on project formats, supplier sequence widths, WBS structure, and material sequence length. Current implementation also differs: project codes are globally unique in the original schema; WBS codes are project-scoped; Inventory item codes are tenant-scoped; DWL material codes are globally unique and allocated from category/discipline counters; supplier profile codes are not spine-unique.

## Decision proposed

1. UUID remains the technical key. Business code is never used in place of a UUID FK.
2. Adopt the proposed patterns and scope in COD-001 for **new records after approval**: tenant-scoped project, party, employee, material/resource, equipment, and cost master codes; project-scoped WBS and BOQ codes; platform-scoped company/reference codes.
3. Use stable non-hierarchical WBS node codes (`WBS-{SEQ6}`) within a project. Parent links and the derived path express hierarchy so a move does not renumber descendants.
4. Use a shared tenant business-party code (`BP-{SEQ6}`) for one party with multiple roles; do not issue independent SUP/SUB/CUS identities for the same legal entity.
5. Use `MAT-{DISC}-{SEQ6}` for new tenant material/resource codes. Existing three-digit DWL codes remain valid legacy codes and are not bulk-renumbered.
6. Allocate sequential codes atomically on the server/database using authenticated tenant/project scope. Sequence gaps are acceptable; reuse is prohibited.
7. Preserve existing codes and UUIDs. A code migration requires a row-level crosswalk, collision review, alias/search support, consumer/FK inventory, data reconciliation, and rollback plan.
8. Do not enforce new code patterns until current data is profiled and hosted schema/RLS are compared with migration history.

## Consequences

- A database allocator refactor is required before tenant-scoped duplicate codes can be issued for domains whose present constraints are global.
- Project code uniqueness may become tenant-scoped in the target standard, but existing global uniqueness can remain as a stricter compatibility constraint during transition.
- Existing DWL and supplier code generation must be treated as legacy behavior until the new allocator is separately designed and migrated.
- External-system identifiers and legacy codes require dedicated fields/mappings; they must not be overloaded into the canonical code.

## Ratification required

The Product Owner and domain owners should approve code pattern, scope, and migration rules. The actual hosted records must then be profiled before implementation. Record approval below and update this ADR status to **Accepted**.

**Ratified by:** Pending  
**Date:** Pending
