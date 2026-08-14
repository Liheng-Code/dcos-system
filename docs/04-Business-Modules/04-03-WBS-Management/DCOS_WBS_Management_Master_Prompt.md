# DCOS — WBS Management Module
## Master Documentation Prompt (12-Document Set)

**Prompt Code:** DCOS-PROMPT-WBS-001
**Version:** R1
**Module:** 04-03 — WBS Management (R1 Module Map No. 06 — Foundation Phase)
**Target Output:** 12 controlled documents per `Document_Conent.md`
**Base References:** `DCOS_System_Architecture_Module_Design_R0.md` (Section 8), `DCOS_Gap_Analysis_R1.docx` (§2.3, §3.4, §5.2, §10.3)
**Output Format:** Markdown (`.md`), one file per document

---

## 0. How To Use This Prompt

This file is a **prompt pack**, not a specification. It contains:

| Part | Content |
|---|---|
| Part 1 | System context block — paste at the top of every session |
| Part 2 | Module scope, boundaries, and non-goals |
| Part 3 | Global writing rules that apply to all 12 documents |
| Part 4 | Canonical reference data — the single source of truth all 12 documents must obey |
| Part 5 | Twelve individual prompt blocks (01 → 12), each ready to copy and run |
| Part 6 | Cross-document consistency contract and quality gate |

**Recommended execution order:** 01 → 02 → 03 → 04 → 07 → 05 → 08 → 06 → 09 → 10 → 11 → 12.

Rationale: the business requirement defines the *why*, the functional specification defines the *what*, use cases define the *behaviour*, and the schema plus RBAC matrix freeze the *data and permission contract*. Every later document consumes those frozen artefacts. Generating the API reference before the schema exists is the fastest way to produce endpoints that reference columns nobody ever created.

**Rule:** Generate one document per session. Before generating document N, paste Part 1, Part 3, Part 4, and the already-approved content of any document N depends on.

**Why WBS is the hardest Foundation module to write:** Stakeholder Management answers *who*. Project Setup answers *which project*. WBS Management answers *where in the works* — and unlike the other two, it is a **recursive structure with roll-up mathematics and a mutation problem**. A stakeholder record changes in isolation. Moving a WBS node re-parents progress, cost, documents, tasks, inspections, and permissions for its entire subtree. Every document in this set must treat *move*, *delete*, and *roll-up* as first-class hazards, not CRUD footnotes.

---

# PART 1 — SYSTEM CONTEXT BLOCK

> Paste this block verbatim at the start of every generation session.

```
SYSTEM IDENTITY
Name: Digital Construction Operating System (DCOS)
Type: Enterprise-grade, multi-tenant construction management platform
Core Principle: WBS-driven multi-project construction operating system integrating all
disciplines, stakeholders, workflows, documents, cost, schedule, and field operations
into one centralized platform.
Industry: Construction / Engineering / BIM / EPC / Design & Build
Deployment: Cloud web application with offline-capable mobile field app
Operating context: Cambodia and Southeast Asia — USD contract currency, KHR local cost,
FIDIC-style client/consultant/contractor structures.

ARCHITECTURE PHILOSOPHY
One unified platform, modular by discipline, WBS-driven structure, multi-tenant,
multi-project, real-time collaboration, mobile-first field operations, RBAC,
append-only audit trail, cloud-native, API-first, document-centric workflows.

CORE HIERARCHY
Company → Project → Phase → Discipline → Building → Level → Zone → Room → Element
→ (Work Package) → Task
Dynamic hierarchy depth, parent-child relationship, progress roll-up, dependency
tracking, location-based task management, WBS code generation support.

TECH STACK
Frontend: Next.js 14 + React + TypeScript + Tailwind
Backend: Node.js + NestJS (Supabase for MVP, per R0 phasing)
Database: PostgreSQL 15 (Supabase) with row-level security
Mobile: React Native, offline-first
Storage: AWS S3 / Supabase Storage
Realtime: Socket.io / Supabase Realtime
Auth: JWT + RBAC
Deployment: Docker + Vercel + VPS/Kubernetes

AI PERSONA
Act as a Senior System Architect, Construction ERP Specialist, BIM Technology Expert,
Enterprise SaaS Designer, and Construction Operations Consultant simultaneously.
Think enterprise-grade and scalable. Use real construction workflow and terminology.
Avoid generic software answers. Prioritise practical implementation.

CURRENT MODULE
04-03 — WBS Management. Foundation phase. R1 Module Map No. 06.
Rated "Captured — correct philosophy, 9/10" in the Gap Analysis, with one named gap:
no CPM/schedule integration design and no structure change control.
```

---

# PART 2 — MODULE SCOPE AND BOUNDARIES

## 2.1 Module Purpose (one paragraph, reuse verbatim in document 01)

WBS Management is the **spine of DCOS**. It converts a construction project from an abstract contract into an addressable physical and organisational structure, so that every task, document, drawing, cost, material batch, inspection, incident, photo, and payment line can be pinned to an exact location and work package. Without the WBS there is no roll-up, no location-based reporting, no cost allocation, no document numbering integrity, and no way to answer the only question management actually asks: *which part of the building is behind, and why?*

## 2.2 In Scope

| Capability Area | Included |
|---|---|
| Structure definition | Node creation, dynamic-depth tree, node type governance, allowed parent-child rules |
| Coding | WBS code segments, manual and auto code generation, uniqueness enforcement, full-path materialisation |
| Structure mutation | Rename, move/re-parent, re-sequence, split, merge, cycle prevention, subtree impact analysis |
| Bulk operations | Excel/CSV import, template application, subtree copy, bulk export |
| Templates | Reusable WBS templates by project type (tower, factory, villa, road, fit-out) |
| Lifecycle | Node status lifecycle, hold, completion, closure, archive, restore |
| Baseline & change control | Structure baseline (R0, R1…), baseline comparison, WBS change request and approval |
| Roll-up engine | Progress roll-up (5 weighting methods), cost roll-up containers, recalculation and caching |
| Responsibility | WBS-node responsible party and discipline owner assignment |
| Linkage registry | Authoritative register of what is attached to each node, used by the delete guard |
| Access scoping | WBS-scoped data visibility feeding the RBAC formula |
| Consumption service | The WBS Resolution Service other modules call for context, validation, and roll-up |

## 2.3 Explicitly Out of Scope

| Excluded | Owning Module | Boundary Statement |
|---|---|---|
| Task creation, assignment, execution | Task Management (Module map 22 / Core) | WBS owns the *container*; tasks live in `tasks` and reference `wbs_node_id`. WBS never stores task detail. |
| Schedule dates, dependencies, float, critical path | Planning & Scheduling (No. 23) | WBS supplies the work-package identity that schedule activities map to. CPM math is not WBS math. |
| BOQ line items, rates, quantities, measurement | BOQ Engine (No. 29) | WBS is the cost **container**; BOQ items reference `wbs_node_id`. WBS stores roll-up totals only, never rates. |
| Budget lines, commitments, actual postings | Budget & Cost Control (No. 30) / Account (No. 42) | WBS reads and aggregates; it does not originate financial records. |
| Document register, revisions, transmittals | Document Control (No. 37) | WBS supplies code segments for the document number. Numbering *rules* are owned by Project Setup. |
| Project code, contract header, numbering rule master | Project Setup (No. 05) | WBS consumes `project_id` and the frozen numbering rule set. |
| Stakeholder register, approval authority master | Stakeholder Management (No. 04) | WBS assigns *responsibility to* a stakeholder/user; it does not define them. |
| BIM model objects, IFC/GUID mapping detail | BIM Coordination (No. 14) | WBS exposes a mapping key for BIM elements; model parsing is Module 14. |
| Physical progress measurement rules per trade | QA/QC (No. 27) and BOQ | WBS consumes measured progress; it does not define measurement method per trade. |

> **Instruction to the AI:** when a document must touch an out-of-scope area, reference the owning module number and treat its internals as a black-box contract. Do not design it here.

## 2.4 The Three Architectural Decisions This Pack Freezes

These are the decisions that separate a real WBS engine from a folder tree. Every document must respect them.

**Decision 1 — Task is not a WBS node.**
R0 §8.2 shows `Task` as the bottom of the WBS hierarchy. That is correct conceptually and wrong structurally. If tasks are nodes, the tree grows to hundreds of thousands of rows per project, every tree query becomes a performance incident, and task lifecycle churn corrupts structure baselines. **The WBS terminates at `WORK_PACKAGE`.** Tasks, documents, BOQ items, inspections, and photos *attach* to a node via `wbs_node_id`. The user still sees tasks under the tree in the UI — the UI joins, the structure does not.

**Decision 2 — Structure is baselined, and post-baseline change is controlled.**
Before a project is baselined, the WBS is freely editable. After baseline, structural change (move, code change, delete, node-type change) requires an approved `wbs_change_requests` record. This is the gap the Gap Analysis flagged indirectly under "baseline revision control" (§3.4). Without it, a QS reconciling last month's IPC against this month's tree finds the tree has silently changed shape.

**Decision 3 — Roll-up is a computed cache, not a stored truth.**
Parent progress and parent cost are never authored. They are derived from leaves by a declared weighting method, cached in `wbs_rollup_cache`, and invalidated by event. Manual parent progress is possible only as an explicit, permissioned, reason-coded override that is visibly flagged in every report. This prevents the classic construction lie: 60% at parent level while every child sits at 20%.

## 2.5 Why This Module Is Foundation Phase

1. Every operational table in DCOS carries `wbs_node_id` — the tree must exist before tasks, documents, procurement, or inspections can be located.
2. Document numbering integrity (`P001-STR-DWG-B01-L05-001-R02`) draws its `B01-L05` segments directly from WBS codes.
3. The RBAC formula is *Role + Project access + Discipline access + Workflow responsibility*; WBS-node scoping is what makes "Discipline access" enforceable at row level rather than screen level.
4. Cost allocation for the entire Commercial phase (BOQ, IPC, retention, EVM) is meaningless without a stable WBS container to allocate against.

---

# PART 3 — GLOBAL WRITING RULES (ALL 12 DOCUMENTS)

## 3.1 Voice and Standard

1. **Language:** Professional construction-industry English. Use PM/QS/planner terminology correctly (work package, control account, roll-up, baseline, re-measurement, look-ahead, location breakdown).
2. **Format:** Pure Markdown. Tables for structured data. Fenced code blocks for DDL, JSON, tree diagrams, and API examples. No decorative emojis.
3. **Document control header** on every document: code, version R1, module, author persona, status, base references, change log table.
4. **Ends with** `**End of Document**`.

## 3.2 Hard Rules

1. **No vague quality words.** "Fast", "user-friendly", "robust", "scalable" are banned unless followed by a number. Replace with measurable statements.
2. **Every requirement is testable.** If a statement cannot become a test case in `09-Test-Plan.md`, rewrite it.
3. **Exceptions are mandatory.** Every workflow must document the rejection path, the timeout path, and the **subtree impact path** (what happens to descendants and to everything linked to them).
4. **Multi-tenant safety in every design.** Any query, endpoint, or screen must state how `tenant_id` is enforced, and additionally how `project_id` scoping is enforced — WBS leaks are project leaks.
5. **Audit everything.** Every state-changing action must name the audit event it emits, from Part 4.11.
6. **Recursion is stated explicitly.** Any operation touching a subtree must state: depth limit, node-count limit, transaction boundary, and what happens on partial failure.
7. **Assume Cambodia / Southeast Asia operating context** for examples: Tower A, Building B01, Level 05, Zone 03, USD/KHR, Khmer and English names, MLMUPC / EDC / PPWSA authority context.

## 3.3 Naming and Casing Rules

| Artefact | Convention | Example |
|---|---|---|
| Table names | `snake_case`, plural | `wbs_node_responsibilities` |
| Column names | `snake_case`, singular | `rollup_method` |
| Enum values | `UPPER_SNAKE_CASE` | `WORK_PACKAGE` |
| API paths | `kebab-case`, plural nouns | `/api/v1/wbs/nodes/{id}/move` |
| Permission codes | `MODULE.ACTION` | `WBS.MOVE_NODE` |
| Event codes | `MODULE.ENTITY.ACTION` | `WBS.NODE.MOVED` |
| Document codes | `DCOS-WBS-<TYPE>-<NNN>` | `DCOS-WBS-BRD-001` |
| Business rule IDs | `BRL-WBS-<NNN>` | `BRL-WBS-014` |
| Functional requirement IDs | `FR-WBS-<NNN>` | `FR-WBS-027` |
| Use case IDs | `UC-WBS-<NNN>` | `UC-WBS-009` |
| Test case IDs | `TC-WBS-<AREA>-<NNN>` | `TC-WBS-MOVE-014` |
| UI screen IDs | `SCR-WBS-<NNN>` | `SCR-WBS-003` |
| SOP IDs | `SOP-WBS-<NN>` | `SOP-WBS-07` |

## 3.4 Depth Targets

| Document | Minimum Depth |
|---|---|
| 01 Business Requirement | 15+ numbered business requirements, 10+ pain points, 10+ measurable success criteria |
| 02 Functional Specification | 45+ functional requirements with IDs, all screens, all rules, all validations, 4 state machines |
| 03 Use Cases | 22+ use cases in full template form, including 6+ exception-heavy cases (move, delete-blocked, circular reference, import failure, baseline conflict, orphaned subtree) |
| 04 Database Schema | The 16 canonical tables with complete DDL, indexes, constraints, RLS policies, recursive CTE examples, trigger definitions, seed data |
| 05 Integration Specification | 14+ consuming modules, event contracts, payloads, failure handling, the WBS Resolution Service contract |
| 06 UI/UX Design | Every screen, every state (empty, loading, error, no-permission, 5,000-node tree), drag-drop interaction spec, mobile behaviour |
| 07 RBAC Matrix | Full matrix: 20 roles × all permission codes, plus WBS-node data-scope rules and inheritance |
| 08 API Reference | 30+ endpoints with request, response, error codes, examples, pagination and lazy-load contract |
| 09 Test Plan | 90+ test cases across functional, tree-integrity, permission, integration, performance, security |
| 10 Deployment Notes | Migration order, backfill of closure table, env vars, rollback, feature flags, smoke tests |
| 11 SOP | 12+ standard operating procedures with responsibility and frequency |
| 12 Training Guide | Role-based training paths, exercises, quick reference cards |

## 3.5 Banned Constructions

Do not write: "the system should be able to…", "as required", "etc.", "and more", "TBD" without an Open Question entry, "handled appropriately", "standard practice" without naming the standard.

---

# PART 4 — CANONICAL REFERENCE DATA (SINGLE SOURCE OF TRUTH)

> This is the frozen contract. All 12 documents must use these values exactly. Do not invent alternatives, do not rename, do not add without recording in the Change Log.

## 4.1 Module Identity

| Attribute | Value |
|---|---|
| Module Code | WBS |
| Module Name | WBS Management |
| Document Prefix | DCOS-WBS |
| Phase | Foundation |
| R1 Module Map No. | 06 |
| R0 Source Section | §8 (Module 3 — WBS Management), §2.3, §26.2 |
| Gap Analysis Reference | §2.3 (preserve), §3.4 (CPM gap), §5.2 (tenant isolation), §10.3 (WBS as single spine) |
| Primary Owner Role | Project Manager (structure), Planner (breakdown), Company Admin (templates) |

## 4.2 Canonical Node Types

`wbs_node_types` is configurable master data, but these eleven ship as system defaults and may not be renamed.

| Code | Label | Typical Use | Can Be Leaf | Cost Container |
|---|---|---|---|---|
| `PROJECT_ROOT` | Project | Auto-created single root per project | No | Yes (total) |
| `PHASE` | Phase | Design / Enabling / Substructure / Superstructure / Fit-out / Handover | No | Yes |
| `DISCIPLINE` | Discipline | ARC / STR / MEP / CIVIL / EXT | No | Yes |
| `BUILDING` | Building | Tower A, Block B, Warehouse 1 | No | Yes |
| `AREA` | Area | External works, car park, site-wide | Yes | Yes |
| `LEVEL` | Level | B02, GF, L01…L45, Roof | No | Yes |
| `ZONE` | Zone | Zone 01, Core, Wing East | No | Yes |
| `ROOM` | Room / Space | R045 Meeting Room, Plant Room | Yes | Yes |
| `ELEMENT` | Element | Slab, column line, façade panel run, riser | Yes | Yes |
| `WORK_PACKAGE` | Work Package | The terminal, measurable unit of work | Yes (must be) | Yes |
| `CONTROL_ACCOUNT` | Control Account | Optional EVM control point marker on any branch node | No | Yes |

**Rules:**
- Exactly one `PROJECT_ROOT` per project, system-created at project activation, never deleted, never moved.
- `WORK_PACKAGE` is always a leaf. It may never have children.
- `CONTROL_ACCOUNT` is a flag-bearing branch node used by EVM (Module 31); a node is a control account if `is_control_account = true`.
- Tasks, documents, BOQ items and all other records attach to nodes; they are never node types.

## 4.3 Structure Rules — Allowed Parent → Child

Enforced through `wbs_structure_rules`, seeded per template. Default permissive set:

| Parent Type | Allowed Child Types |
|---|---|
| `PROJECT_ROOT` | PHASE, DISCIPLINE, BUILDING, AREA |
| `PHASE` | DISCIPLINE, BUILDING, AREA, ZONE, WORK_PACKAGE |
| `DISCIPLINE` | BUILDING, AREA, LEVEL, ZONE, ELEMENT, WORK_PACKAGE |
| `BUILDING` | LEVEL, ZONE, DISCIPLINE, AREA |
| `AREA` | ZONE, ELEMENT, WORK_PACKAGE |
| `LEVEL` | ZONE, ROOM, ELEMENT, DISCIPLINE, WORK_PACKAGE |
| `ZONE` | ROOM, ELEMENT, DISCIPLINE, WORK_PACKAGE |
| `ROOM` | ELEMENT, WORK_PACKAGE |
| `ELEMENT` | WORK_PACKAGE |
| `WORK_PACKAGE` | *(none — terminal)* |

**Depth limit:** maximum 12 levels including root. Hard-stopped at the database and API layer.
**Breadth guidance:** soft warning above 200 direct children of one parent; hard block above 1,000.

## 4.4 Node Status Lifecycle

| Status | Meaning |
|---|---|
| `DRAFT` | Structure being built; not yet available to other modules |
| `ACTIVE` | Live; tasks, documents, and cost may be linked |
| `ON_HOLD` | Work suspended; new links blocked, existing records read-only for progress |
| `COMPLETED` | Physical work complete; awaiting inspection/handover closure |
| `CLOSED` | Commercially and technically closed; no new links, no progress change |
| `ARCHIVED` | Removed from active tree views, retained for history and reporting |
| `CANCELLED` | Descoped work (e.g. removed by variation); retained with reason |

### Transition Table

| From | To | Guard |
|---|---|---|
| DRAFT | ACTIVE | Code valid and unique; parent ACTIVE or DRAFT; project status ACTIVE |
| DRAFT | CANCELLED | Permission `WBS.CHANGE_STATUS`; reason required |
| ACTIVE | ON_HOLD | Reason code required; notification to responsible party |
| ON_HOLD | ACTIVE | Reason required; resumption date recorded |
| ACTIVE | COMPLETED | All descendant nodes COMPLETED/CLOSED/CANCELLED; roll-up progress = 100% |
| COMPLETED | CLOSED | No open tasks, open NCRs, or unapproved documents linked; QA sign-off recorded |
| COMPLETED | ACTIVE | Permission `WBS.CHANGE_STATUS` + reason (re-opened for rework) |
| CLOSED | ARCHIVED | Project status COMPLETED or CLOSED |
| CLOSED | ACTIVE | Requires approved `wbs_change_requests` record; Critical-severity audit |
| ACTIVE | CANCELLED | Approved change request; all linked records must be reassigned or cancelled first |
| ARCHIVED | ACTIVE | `WBS.RESTORE_NODE` permission; project must not be CLOSED |

**Cascade rule:** Setting a parent to ON_HOLD, CLOSED, CANCELLED or ARCHIVED offers an explicit, previewed cascade to descendants. Cascade is never silent — the user sees the affected node count and confirms.

## 4.5 WBS Code Rules

**Format:** dash-separated uppercase segments, one segment per level, drawn from `wbs_code_segments`.

```
P001-B01-L05-Z03-R045-STR-SLAB
 │    │   │   │   │    │   └── Work package segment
 │    │   │   │   │    └────── Discipline segment
 │    │   │   │   └─────────── Room segment
 │    │   │   └─────────────── Zone segment
 │    │   └─────────────────── Level segment
 │    └─────────────────────── Building segment
 └──────────────────────────── Project segment (from Project Setup, immutable)
```

| Rule ID | Rule |
|---|---|
| CODE-01 | `wbs_code` (the node's own segment) is unique among siblings under the same parent |
| CODE-02 | `full_code` (materialised path of segments) is unique within `project_id` — enforced by unique index |
| CODE-03 | Segment character set: `A-Z`, `0-9`, and `_`. Length 1–12. No spaces, no dash inside a segment |
| CODE-04 | Code generation modes: `MANUAL`, `AUTO_SEQUENTIAL` (B01, B02…), `AUTO_TEMPLATE` (mask-driven, e.g. `L{nn}`) — set per node type per project |
| CODE-05 | Code becomes **immutable** once the node has any linked record (`wbs_node_links` count > 0) OR the project structure is baselined. Change thereafter requires an approved change request and emits `WBS.CODE.CHANGED` at HIGH severity |
| CODE-06 | On move, `wbs_code` (own segment) is retained; `full_code` and `full_path` are re-materialised for the node and every descendant |
| CODE-07 | Historical `full_code` values are retained in `wbs_nodes.previous_full_code` and in audit, so old document numbers remain resolvable |
| CODE-08 | Reserved segment `ROOT` is system-only |

**Display path (`full_path`)** is the human-readable name chain: `Tower A / Level 05 / Zone 03 / Room 045 / Structural / Slab`. It is materialised, not computed at read time.

## 4.6 Roll-Up Methods (`rollup_method`)

Set per node; children may differ from parent. Default is inherited from project template.

| Code | Progress Calculation | When To Use |
|---|---|---|
| `EQUAL_WEIGHT` | Simple average of direct children | Early planning, no cost or duration data yet |
| `COST_WEIGHTED` | Σ(child progress × child budget) / Σ(child budget) | Default once BOQ exists — the commercially honest method |
| `DURATION_WEIGHTED` | Σ(child progress × child planned duration) / Σ(duration) | Programme-driven reporting before cost loading |
| `QUANTITY_WEIGHTED` | Σ(completed qty × unit weight) / Σ(total qty × unit weight) | Repetitive work — piling, slabs, blockwork, cladding panels |
| `MANUAL_OVERRIDE` | Value entered by an authorised user | Exception only; requires reason code and is flagged in all reports |

**Roll-up rules:**

| Rule ID | Rule |
|---|---|
| ROLL-01 | Leaf progress originates outside WBS: Task Management, QA/QC measurement, or BOQ re-measurement. WBS never authors leaf progress |
| ROLL-02 | Parent progress is always derived; it is never directly writable except through `MANUAL_OVERRIDE` |
| ROLL-03 | A `MANUAL_OVERRIDE` node displays a persistent visual flag and appears in the Override Exception Report |
| ROLL-04 | Roll-up recalculation is event-driven and asynchronous; the cache stores `calculated_at` and every consumer must display data age above 15 minutes |
| ROLL-05 | Cost roll-up aggregates four measures per node: `budget_value`, `committed_value`, `actual_value`, `forecast_value`, each in project currency and base currency |
| ROLL-06 | CANCELLED nodes are excluded from both numerator and denominator of all roll-ups |
| ROLL-07 | ON_HOLD nodes remain in the denominator — suspended work is still scope |
| ROLL-08 | Recalculation is idempotent and safe to re-run; a full-project rebuild is always available to admins |

## 4.7 Canonical Tables (16)

| # | Table | Purpose |
|---:|---|---|
| 1 | `wbs_nodes` | The tree itself — one row per node |
| 2 | `wbs_node_types` | Configurable node type master with icon, colour, leaf rules |
| 3 | `wbs_structure_rules` | Allowed parent→child pairs per tenant/project/template |
| 4 | `wbs_closure` | Closure table (ancestor, descendant, depth) for O(1) subtree queries |
| 5 | `wbs_code_segments` | Per-project segment definition, generation mode, mask, next sequence |
| 6 | `wbs_node_attributes` | Typed custom attributes per node (area m², gross floor area, elevation, grid ref, IFC GUID) |
| 7 | `wbs_node_responsibilities` | Responsible user/stakeholder per node per discipline, with validity dates |
| 8 | `wbs_templates` | Reusable structure templates by project type |
| 9 | `wbs_template_nodes` | Template node definitions with relative codes and default attributes |
| 10 | `wbs_baselines` | Structure baselines — R0, R1, R2 with approval reference |
| 11 | `wbs_baseline_nodes` | Frozen node snapshot per baseline for comparison |
| 12 | `wbs_change_requests` | Post-baseline structural change control with approval workflow link |
| 13 | `wbs_node_links` | Registry of every record attached to a node — the delete guard's source of truth |
| 14 | `wbs_rollup_cache` | Computed progress and cost aggregates per node with staleness marker |
| 15 | `wbs_progress_snapshots` | Period-end frozen roll-up values for trend, S-curve, and IPC evidence |
| 16 | `wbs_import_batches` | Bulk import runs — file reference, validation results, row-level errors, rollback token |

## 4.8 Core Column Contract (must appear identically wherever referenced)

`wbs_nodes` mandatory columns:

```
id                uuid PK
tenant_id         uuid NOT NULL          -- RLS anchor
project_id        uuid NOT NULL          -- second isolation axis
parent_id         uuid NULL              -- NULL only for PROJECT_ROOT
node_type_code    text NOT NULL          -- FK wbs_node_types
wbs_code          text NOT NULL          -- own segment, unique among siblings
full_code         text NOT NULL          -- materialised, unique per project
node_name         text NOT NULL
full_path         text NOT NULL          -- materialised display path
previous_full_code text NULL
depth             int NOT NULL           -- 0 for root, max 11
sort_order        int NOT NULL
discipline_code   text NULL              -- ARC/STR/MEP/CIVIL/EXT
status            text NOT NULL          -- Part 4.4
rollup_method     text NOT NULL          -- Part 4.6
is_control_account boolean NOT NULL DEFAULT false
is_leaf           boolean NOT NULL
baseline_locked   boolean NOT NULL DEFAULT false
progress_percent  numeric(5,2) NOT NULL DEFAULT 0   -- cached read-model mirror
planned_start     date NULL              -- mirrored from Planning, read-only here
planned_finish    date NULL
created_by        uuid NOT NULL
created_at        timestamptz NOT NULL
updated_by        uuid NULL
updated_at        timestamptz NULL
archived_at       timestamptz NULL
deleted_at        timestamptz NULL       -- soft delete only
```

## 4.9 Canonical API Paths

```
GET    /api/v1/projects/{projectId}/wbs/tree
GET    /api/v1/projects/{projectId}/wbs/tree/lazy
GET    /api/v1/projects/{projectId}/wbs/search
GET    /api/v1/projects/{projectId}/wbs/flat
POST   /api/v1/projects/{projectId}/wbs/nodes
GET    /api/v1/wbs/nodes/{id}
PATCH  /api/v1/wbs/nodes/{id}
DELETE /api/v1/wbs/nodes/{id}
GET    /api/v1/wbs/nodes/{id}/children
GET    /api/v1/wbs/nodes/{id}/ancestors
GET    /api/v1/wbs/nodes/{id}/descendants
GET    /api/v1/wbs/nodes/{id}/links
GET    /api/v1/wbs/nodes/{id}/impact-analysis
POST   /api/v1/wbs/nodes/{id}/move
POST   /api/v1/wbs/nodes/{id}/reorder
POST   /api/v1/wbs/nodes/{id}/duplicate
POST   /api/v1/wbs/nodes/{id}/status
POST   /api/v1/wbs/nodes/{id}/archive
POST   /api/v1/wbs/nodes/{id}/restore
GET    /api/v1/wbs/nodes/{id}/rollup
POST   /api/v1/wbs/nodes/{id}/rollup/recalculate
POST   /api/v1/wbs/nodes/{id}/progress-override
GET    /api/v1/wbs/nodes/{id}/responsibilities
POST   /api/v1/wbs/nodes/{id}/responsibilities
DELETE /api/v1/wbs/responsibilities/{responsibilityId}
GET    /api/v1/wbs/templates
POST   /api/v1/wbs/templates
POST   /api/v1/projects/{projectId}/wbs/apply-template
POST   /api/v1/projects/{projectId}/wbs/import
GET    /api/v1/wbs/import-batches/{batchId}
POST   /api/v1/wbs/import-batches/{batchId}/rollback
GET    /api/v1/projects/{projectId}/wbs/export
POST   /api/v1/projects/{projectId}/wbs/baselines
GET    /api/v1/projects/{projectId}/wbs/baselines
GET    /api/v1/wbs/baselines/{baselineId}/compare
POST   /api/v1/projects/{projectId}/wbs/change-requests
PATCH  /api/v1/wbs/change-requests/{id}/decision
POST   /api/v1/internal/wbs/resolve-context        -- WBS Resolution Service
POST   /api/v1/internal/wbs/validate-node          -- WBS Resolution Service
POST   /api/v1/internal/wbs/register-link          -- WBS Resolution Service
POST   /api/v1/internal/wbs/deregister-link        -- WBS Resolution Service
```

## 4.10 Permission Codes (24)

| Code | Description |
|---|---|
| `WBS.VIEW_TREE` | View the project WBS tree |
| `WBS.VIEW_NODE` | View node detail |
| `WBS.VIEW_COST_ROLLUP` | See cost aggregates on nodes |
| `WBS.CREATE_NODE` | Create a node |
| `WBS.EDIT_NODE` | Edit node name, attributes, rollup method |
| `WBS.EDIT_CODE` | Change a node's code segment |
| `WBS.MOVE_NODE` | Re-parent a node or subtree |
| `WBS.REORDER_NODE` | Change sibling sort order |
| `WBS.DUPLICATE_NODE` | Copy a subtree |
| `WBS.DELETE_NODE` | Soft-delete an unlinked node |
| `WBS.ARCHIVE_NODE` | Archive a node/subtree |
| `WBS.RESTORE_NODE` | Restore an archived node |
| `WBS.CHANGE_STATUS` | Change node status |
| `WBS.CASCADE_STATUS` | Apply a status change to a whole subtree |
| `WBS.BULK_IMPORT` | Import structure from file |
| `WBS.ROLLBACK_IMPORT` | Roll back an import batch |
| `WBS.EXPORT` | Export tree to Excel/CSV |
| `WBS.APPLY_TEMPLATE` | Apply a WBS template to a project |
| `WBS.MANAGE_TEMPLATE` | Create/edit tenant WBS templates |
| `WBS.CONFIGURE_RULES` | Edit node types, structure rules, code segments |
| `WBS.SET_BASELINE` | Create a structure baseline |
| `WBS.RAISE_CHANGE` | Raise a post-baseline change request |
| `WBS.APPROVE_CHANGE` | Approve/reject a WBS change request |
| `WBS.ASSIGN_RESPONSIBLE` | Assign node responsibility |
| `WBS.OVERRIDE_PROGRESS` | Set MANUAL_OVERRIDE progress on a node |
| `WBS.RECALCULATE_ROLLUP` | Trigger full roll-up rebuild |

## 4.11 Event Codes (24)

| Event Code | Severity | Emitted When |
|---|---|---|
| `WBS.NODE.CREATED` | LOW | Node created |
| `WBS.NODE.UPDATED` | LOW | Name/attribute/rollup method changed |
| `WBS.NODE.MOVED` | HIGH | Node re-parented |
| `WBS.NODE.REORDERED` | LOW | Sort order changed |
| `WBS.NODE.DUPLICATED` | MEDIUM | Subtree copied |
| `WBS.NODE.STATUS_CHANGED` | MEDIUM | Status transition |
| `WBS.NODE.STATUS_CASCADED` | HIGH | Status applied to subtree |
| `WBS.NODE.ARCHIVED` | MEDIUM | Node archived |
| `WBS.NODE.RESTORED` | MEDIUM | Node restored |
| `WBS.NODE.DELETED` | HIGH | Soft delete executed |
| `WBS.NODE.DELETE_BLOCKED` | MEDIUM | Delete attempt refused by link guard |
| `WBS.CODE.CHANGED` | HIGH | `wbs_code` or `full_code` changed |
| `WBS.STRUCTURE.RULE_VIOLATION` | MEDIUM | Rejected create/move due to structure rules |
| `WBS.TEMPLATE.APPLIED` | MEDIUM | Template applied to project |
| `WBS.TEMPLATE.SAVED` | LOW | Template created/updated |
| `WBS.IMPORT.STARTED` | LOW | Import batch begins |
| `WBS.IMPORT.COMPLETED` | MEDIUM | Import batch committed |
| `WBS.IMPORT.FAILED` | MEDIUM | Import batch rejected |
| `WBS.IMPORT.ROLLED_BACK` | HIGH | Import batch reversed |
| `WBS.BASELINE.SET` | HIGH | Structure baseline created |
| `WBS.CHANGE.RAISED` | MEDIUM | Change request raised |
| `WBS.CHANGE.APPROVED` | HIGH | Change request approved |
| `WBS.CHANGE.REJECTED` | MEDIUM | Change request rejected |
| `WBS.RESPONSIBILITY.ASSIGNED` | MEDIUM | Node responsibility assigned/revoked |
| `WBS.PROGRESS.OVERRIDDEN` | HIGH | Manual progress override applied |
| `WBS.ROLLUP.RECALCULATED` | LOW | Roll-up rebuild completed |

## 4.12 Notification Rules (aligned to R0 §24.5)

| Trigger | Recipients | Priority | Channels |
|---|---|---|---|
| `WBS.NODE.MOVED` on a node with >0 links | PM, Discipline Manager, Document Controller, node responsible | High | In-app, Email |
| `WBS.CODE.CHANGED` | PM, Document Controller, QS | High | In-app, Email |
| `WBS.NODE.STATUS_CASCADED` to ON_HOLD/CANCELLED | Node responsible for every affected node, PM | High | In-app, Telegram |
| `WBS.CHANGE.RAISED` | PM (approver), Planner | High | In-app, Email |
| `WBS.CHANGE.APPROVED` / `REJECTED` | Originator, PM, Planner | Normal | In-app |
| `WBS.BASELINE.SET` | PM, Project Director, Planner, QS | Normal | In-app, Email |
| `WBS.IMPORT.COMPLETED` / `FAILED` | Import initiator | Normal | In-app |
| `WBS.IMPORT.ROLLED_BACK` | Initiator, PM, Company Admin | High | In-app, Email |
| `WBS.PROGRESS.OVERRIDDEN` | PM, Project Director, QS | High | In-app, Email |
| `WBS.RESPONSIBILITY.ASSIGNED` | Newly responsible user | Normal | In-app, Telegram |
| Node COMPLETED with open NCR linked | QA/QC Manager, PM | High | In-app, Email |

## 4.13 Performance Targets

| Operation | Target | Condition |
|---|---|---|
| Tree load, first 3 levels | < 800 ms | Any project size, lazy-loaded |
| Tree load, 100 nodes fully expanded | < 1 s | Gap Analysis §5.4 target |
| Full tree load, 5,000 nodes | < 3 s | Virtualised rendering, paged fetch |
| Node detail load with links summary | < 500 ms | |
| Subtree move, 500 descendants | < 3 s | Single transaction, closure rebuild included |
| Impact analysis preview | < 1.5 s | Before any destructive action |
| Roll-up recalculation, 5,000 nodes | < 60 s | Async job with progress notification |
| Bulk import validation, 2,000 rows | < 20 s | Dry-run before commit |
| WBS search (code or name) | < 300 ms | Trigram index, project-scoped |
| Resolution Service `validate-node` | < 120 ms p95 | Called synchronously by other modules |

## 4.14 Canonical Worked Example (use consistently in all 12 documents)

```
P001  Tower A Mixed-Use Development                    [PROJECT_ROOT]
├── P001-PH2  Superstructure                           [PHASE]
│   ├── P001-PH2-B01  Tower A                          [BUILDING]
│   │   ├── P001-PH2-B01-L05  Level 05                 [LEVEL]
│   │   │   ├── ...-Z03  Zone 03 (East Wing)           [ZONE]
│   │   │   │   ├── ...-Z03-STR  Structural            [DISCIPLINE]
│   │   │   │   │   ├── ...-STR-SLAB  Slab to L05      [WORK_PACKAGE]  COST_WEIGHTED
│   │   │   │   │   └── ...-STR-COL   Columns L04–L05  [WORK_PACKAGE]
│   │   │   │   └── ...-Z03-MEP  MEP                   [DISCIPLINE]
│   │   │   │       └── ...-MEP-SLV  Sleeves & Inserts [WORK_PACKAGE]
│   │   │   └── ...-R045  Room 045 Meeting Room        [ROOM]
│   │   └── P001-PH2-B01-L06  Level 06                 [LEVEL]
│   └── P001-PH2-EXT  External Works                   [AREA]
└── P001-PH3  Fit-Out                                  [PHASE]
```

Full code of the slab work package: `P001-PH2-B01-L05-Z03-STR-SLAB`
Full path: `Tower A Mixed-Use Development / Superstructure / Tower A / Level 05 / Zone 03 (East Wing) / Structural / Slab to L05`

---

# PART 5 — THE TWELVE PROMPT BLOCKS

---

## 5.1 — `01-Business-Requirement.md`

**Document Code:** DCOS-WBS-BRD-001
**Depends on:** nothing
**Author persona:** Construction Operations Consultant + Senior System Architect

### Required Sections

1. Document Control Header
2. Business Context — how construction companies break down work today (Excel location lists, drawing-number conventions doubling as location codes, planner's Primavera WBS disconnected from the QS's BOQ sections and the site team's floor-by-floor tracker)
3. Problem Statement — 10+ named pain points with real consequence
4. Business Objectives — numbered, each with the operational outcome it produces
5. Stakeholder Analysis — who breaks down work, who consumes the breakdown, who suffers when it is wrong
6. Business Requirements — 15+ IDs `BRL-WBS-001` onward, each with rationale, priority (Must/Should/Could), and source reference
7. Business Rules — the non-negotiables (uniqueness, delete guard, roll-up direction, baseline control)
8. Scope Statement — in scope, out of scope with owning module, assumptions, dependencies
9. Success Criteria — 10+ measurable, e.g. "100% of tasks, documents, and BOQ items created in Phase 2 carry a valid `wbs_node_id`"
10. Business KPIs — adoption, structural stability, roll-up accuracy, override frequency
11. Risks and Mitigations — draw on Gap Analysis §9
12. Constraints — regulatory, contractual, organisational
13. Open Questions, Change Log

### Must Include

- The "one spine" argument stated in business terms, not technical terms: what the company gains when every record has a location, and what it loses when it does not
- Why a WBS designed for the planner alone fails: the QS needs cost containers, the document controller needs code segments, the site engineer needs floor and zone, QA needs inspection lots
- The mixed-project-type problem — a tower, a factory, a road, and a fit-out cannot share one fixed hierarchy, which is why dynamic depth is a business requirement rather than a technical preference
- The structural-change problem stated commercially: if the tree changes shape mid-project, last month's IPC cannot be reconciled to this month's report
- A named business requirement for WBS-based access scoping (a subcontractor sees Level 05 Zone 03, nothing else)
- Explicit statement that the WBS must survive the full project lifecycle including DLP and archive

### Acceptance Criteria

- Every `BRL-WBS-*` is testable and traceable forward to at least one FR
- No technical implementation detail (no table names, no API paths)
- Every pain point has a stated cost — time, money, rework, or claim exposure

### Copy-Paste Prompt

```
[PASTE PART 1, PART 2, PART 3, PART 4]

TASK: Write 01-Business-Requirement.md for the DCOS WBS Management module.
Document code DCOS-WBS-BRD-001.

Follow exactly the section list, depth target, must-include list, and acceptance
criteria in Section 5.1 of the master prompt. Write as a Construction Operations
Consultant explaining to a construction company board why this module exists and
what it must do.

Constraints:
- Minimum 15 business requirements with IDs BRL-WBS-001 onward
- Minimum 10 pain points, each with a stated commercial consequence
- Minimum 10 measurable success criteria
- Business language only — no table names, no API paths, no code
- Use the Part 4.14 Tower A example for all illustrations
- Output pure Markdown, no commentary before or after the document
```

---

## 5.2 — `02-Functional-Specification.md`

**Document Code:** DCOS-WBS-FS-001
**Depends on:** 01
**Author persona:** Senior System Architect

### Required Sections

1. Document Control Header
2. Functional Overview and module context diagram
3. Feature Breakdown — grouped: Structure Definition, Coding, Mutation, Bulk Operations, Templates, Lifecycle, Baseline & Change Control, Roll-Up, Responsibility, Linkage Registry, Access Scoping, Reporting
4. Functional Requirements — 45+ IDs `FR-WBS-001` onward. Each states: description, inputs, processing logic, outputs, validation, error handling, required permission code, emitted audit event, MVP phase tag
5. Screen Inventory — `SCR-WBS-001` onward with purpose and primary actions
6. Validation Rules — complete table, field-level and cross-field
7. Business Rule Enforcement Map — `BRL-WBS-NNN` → `FR-WBS-NNN`
8. State Machines — node status, change request status, import batch status, baseline status (as code-block diagrams)
9. Algorithms — stated precisely enough to implement:
   - Cycle detection on move
   - `full_code` / `full_path` re-materialisation on move and rename
   - Closure table maintenance on insert, move, and delete
   - Code auto-generation with mask and sequence gap handling
   - Roll-up calculation for each of the 5 methods, including the mixed-method parent case
   - Impact analysis computation (affected node count, affected linked record count by type)
   - Import validation pipeline (parse → structural validate → code validate → dry-run diff → commit)
10. Notification Triggers — event → recipient → priority → channel, aligned to Part 4.12
11. Audit Requirements — action → audit event → severity → captured before/after fields
12. Non-Functional Requirements — Part 4.13 targets, concurrency, tenant isolation, data volume assumptions (target: 50 projects × 5,000 nodes per tenant)
13. MVP Scope Marking — every FR tagged MVP / Phase 2 / Phase 3
14. Open Questions, Change Log

### Must Include

- **The delete guard:** a node with any row in `wbs_node_links` cannot be deleted; the system offers Archive or Reassign-links instead, and emits `WBS.NODE.DELETE_BLOCKED`
- **The move contract:** what moves with the node (all descendants, all links, all responsibilities, all attributes), what is recalculated (`full_code`, `full_path`, `depth`, closure rows, roll-up for both old and new ancestor chains), and what is preserved (own `wbs_code`, `previous_full_code`, all history)
- **Concurrency:** two users moving nodes in the same subtree simultaneously — optimistic locking on a subtree version token, second writer receives a conflict error naming the winning operation
- **Partial failure:** subtree operations are single-transaction; if the transaction exceeds the node limit (1,000), the operation is refused with a named error, not silently truncated
- **Mixed-method roll-up:** when children use different `rollup_method` values, the parent applies its own method to child *results*; document this explicitly because it is the most common misunderstanding
- **Baseline behaviour:** `baseline_locked = true` blocks move, code change, delete, and node-type change; each blocked attempt offers "Raise change request"
- **Import behaviour:** dry-run diff must be presented before commit, showing creates, updates, and rejected rows with row numbers and reasons
- **The five-question test from R0 §2.3** — every node must be able to answer project / location / discipline / responsible / status
- **CPM boundary:** WBS mirrors `planned_start` and `planned_finish` read-only from Planning & Scheduling (No. 23); WBS never calculates float or critical path — state this as an explicit non-requirement so the gap flagged in Gap Analysis §3.4 is closed by assignment, not silence

### Acceptance Criteria

- Every FR has a permission code from Part 4.10 and an audit event from Part 4.11
- Every mutating FR documents the rejection path, the concurrency path, and the subtree impact path
- No FR contradicts a `BRL-WBS-*` from document 01
- All five roll-up methods have a worked numeric example using the Part 4.14 tree

### Copy-Paste Prompt

```
[PASTE PART 1, PART 2, PART 3, PART 4]
[PASTE APPROVED 01-Business-Requirement.md]

TASK: Write 02-Functional-Specification.md for the DCOS WBS Management module.
Document code DCOS-WBS-FS-001.

Follow exactly the section list, depth targets, must-include list, and acceptance
criteria in Section 5.2 of the master prompt. Write as a Senior System Architect
producing a specification a development team can build from without asking questions.

Constraints:
- Minimum 45 functional requirements with IDs FR-WBS-001 onward
- Every FR states: description, inputs, processing, outputs, validation, error handling,
  required permission code, emitted audit event, MVP phase tag
- Section 9 algorithms must be precise enough to implement without further design
- Every mutating operation documents rejection, concurrency conflict, and subtree impact
- Provide a worked numeric roll-up example for all five methods using the Part 4.14 tree
- Use only the canonical enums, statuses, permission codes, and event codes from Part 4
- Output pure Markdown, no commentary before or after the document
```

---

## 5.3 — `03-Use-Cases.md`

**Document Code:** DCOS-WBS-UC-001
**Depends on:** 01, 02
**Author persona:** Construction Operations Consultant + Business Analyst

### Required Sections

1. Document Control Header
2. Actor Catalogue — every actor with goals and system-interaction summary
3. Use Case Index — ID, name, actor, priority, related FRs
4. Use Case Diagram (text/Mermaid-style block)
5. Detailed Use Cases — 22+, each in full template form: ID, name, actor, stakeholders, preconditions, trigger, main success scenario (numbered), alternate flows, exception flows, postconditions, business rules applied, permission required, audit events emitted, related FRs
6. End-to-End Scenario — the Tower A walkthrough: template applied at project activation → planner refines to Level 05 → bulk import of 42 rooms → site starts work → level re-sequenced after a variation → baseline set → post-baseline change request → level completed and closed
7. Exception Scenario Catalogue — 6+ heavy cases
8. Use Case to Requirement Traceability Matrix
9. Open Questions, Change Log

### Mandatory Use Cases

| UC Theme | Why It Must Be Written |
|---|---|
| Apply WBS template at project activation | The normal starting path |
| Build tree manually node by node | The fallback path |
| Bulk import 400 rooms from the architect's schedule | The realistic path for fit-out projects |
| Import rejected — duplicate codes and invalid parent references | Error handling under volume |
| Roll back a committed import after discovering wrong level codes | Recovery |
| Move Zone 03 from Level 05 to Level 06 after a design change | The flagship hazard |
| Attempt to delete a node with 34 linked documents and 12 tasks | Delete guard |
| Attempt to move a node that is baseline-locked | Change control gate |
| Raise, approve, and apply a post-baseline change request | Full change control loop |
| Rename a level after documents have been issued against its code | `previous_full_code` behaviour |
| Set structure baseline before first IPC | Commercial dependency |
| Compare current tree against Baseline R0 | Change visibility |
| Assign discipline responsibility for the MEP subtree | Responsibility model |
| Subcontractor views only their assigned subtree | Access scoping |
| Progress rolls up from 6 work packages to Level 05 | Core roll-up |
| PM applies a manual progress override and must justify it | Override control |
| Cancel a descoped zone after an omission variation | CANCELLED semantics |
| Close Level 05 with an open NCR still linked | Closure gate |
| Two planners restructure the same subtree simultaneously | Concurrency |
| Duplicate Level 05 subtree to create Levels 06–20 | Typical-floor pattern |
| Archive a completed building at project handover | Lifecycle end |
| Site engineer navigates the tree offline on mobile | Field reality |

### Acceptance Criteria

- Every use case names its permission code and audit events
- Every exception flow states the exact user-facing message and the recovery action
- At least 6 use cases are exception-led rather than happy-path with an appendix

### Copy-Paste Prompt

```
[PASTE PART 1, PART 2, PART 3, PART 4]
[PASTE APPROVED 01 and 02]

TASK: Write 03-Use-Cases.md for the DCOS WBS Management module.
Document code DCOS-WBS-UC-001.

Follow exactly Section 5.3 of the master prompt, including the mandatory use case
table — every row must become a full use case.

Constraints:
- Minimum 22 use cases in full template form
- Each references its FR IDs, permission code, and emitted audit events
- Each exception flow states the exact user-facing message and recovery path
- Use realistic Cambodian construction context and the Part 4.14 Tower A structure
- Include the full end-to-end Tower A scenario as a continuous narrative
- Output pure Markdown, no commentary before or after the document
```

---

## 5.4 — `04-Database-Schema.md`

**Document Code:** DCOS-WBS-DB-001
**Depends on:** 02
**Author persona:** Senior System Architect + Database Engineer

### Required Sections

1. Document Control Header
2. Schema Overview and ERD (text/Mermaid block) showing all 16 tables and external FK references
3. Design Decisions — why adjacency list **plus** closure table rather than nested set, `ltree`, or recursive-CTE-only; the trade-off table (read speed vs write amplification on move)
4. Per-Table Specification — for each of the 16 canonical tables: purpose, full column table (name, type, nullability, default, description), primary key, foreign keys, unique constraints, check constraints, indexes with justification, RLS policy, runnable `CREATE TABLE` DDL
5. Closure Table Maintenance — insert, move, and delete SQL with worked example
6. Recursive Query Cookbook — ancestors, descendants, subtree aggregate, path materialisation, orphan detection, cycle detection
7. Triggers and Functions — `full_code`/`full_path` materialisation, `is_leaf` maintenance, `depth` maintenance, roll-up invalidation, audit emission hook
8. Row-Level Security — complete policy set on `tenant_id` and `project_id`, plus the WBS-scope policy for subtree-restricted users
9. Indexing Strategy — including trigram index for search, partial indexes for active nodes, composite index for tree fetch
10. Data Volume and Partitioning — projections at 50 projects × 5,000 nodes; when to partition `wbs_closure` and `wbs_progress_snapshots`
11. Migration Order and Backfill — including closure table backfill for existing data
12. Seed Data — node types, default structure rules, three starter templates (Tower / Factory / Fit-Out), default code segments
13. Open Questions, Change Log

### Must Include

- Unique index: `(project_id, full_code) WHERE deleted_at IS NULL`
- Unique index: `(parent_id, wbs_code) WHERE deleted_at IS NULL`
- Check constraint: `depth <= 11`
- Check constraint: exactly one root per project — partial unique index on `(project_id) WHERE parent_id IS NULL AND deleted_at IS NULL`
- Check constraint: `WORK_PACKAGE` nodes must have `is_leaf = true`
- Self-referencing FK `parent_id → wbs_nodes.id` with `ON DELETE RESTRICT` — cascade delete is forbidden and must be stated as a deliberate decision
- Soft delete only; hard delete requires admin plus audit, per Gap Analysis §5.3
- `wbs_node_links` design: `(node_id, entity_type, entity_id)` with a covering index enabling the delete guard to answer in under 100 ms
- `wbs_rollup_cache` staleness columns and the invalidation cascade up the ancestor chain
- RLS policies written as actual PostgreSQL policy statements, not prose

### Acceptance Criteria

- Every DDL block is syntactically valid PostgreSQL 15 and runnable in order
- Every index has a stated query it serves
- Every table has an RLS policy; none is described as "to be added"
- The closure maintenance SQL is proven with a worked before/after example on the Part 4.14 tree

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 02-Functional-Specification.md]

TASK: Write 04-Database-Schema.md for the DCOS WBS Management module.
Document code DCOS-WBS-DB-001.

Follow exactly Section 5.4 of the master prompt.

Constraints:
- Use exactly the 16 canonical table names in Part 4.7 — add tables only if you also
  record them in the Change Log with justification
- Use exactly the column contract in Part 4.8 for wbs_nodes
- Every table: purpose, full column table, constraints, indexes with justification,
  RLS policy, runnable CREATE TABLE DDL
- Target PostgreSQL 15 on Supabase
- Include closure table maintenance SQL with a worked example on the Part 4.14 tree
- Include all must-include constraints listed in Section 5.4
- Include seed data INSERT statements for node types, structure rules, and 3 templates
- Output pure Markdown with fenced sql code blocks, no commentary
```

---

## 5.5 — `05-Integration-Specification.md`

**Document Code:** DCOS-WBS-INT-001
**Depends on:** 02, 04
**Author persona:** Senior System Architect

### Required Sections

1. Document Control Header
2. Integration Philosophy — WBS as the **location and containment authority** for the whole platform
3. Integration Map — diagram plus table of every consuming and providing module
4. Inbound Integrations — what other modules write to or trigger in WBS Management:
   - Project Setup (No. 05) — project activation creates `PROJECT_ROOT`, supplies project code segment and numbering rules
   - Admin Configuration (No. 03) — node types, structure rules, template governance
   - Planning & Scheduling (No. 23) — mirrors `planned_start` / `planned_finish` onto nodes, read-only
   - Task Management — leaf progress feed
   - QA/QC (No. 27) — measured progress and inspection-lot closure signal
   - BOQ Engine (No. 29) / Budget & Cost Control (No. 30) — budget, committed, actual, forecast values per node
   - BIM Coordination (No. 14) — IFC GUID and model-object mapping into `wbs_node_attributes`
5. Outbound Integrations — per consuming module, with contract detail:
   - Task Management — node validation, leaf-only linking rule, node status gate on task start
   - Document Control (No. 37) — code segments for document numbering, `previous_full_code` resolution for superseded numbers
   - Procurement (No. 18) — PR/PO WBS allocation, budget availability check by node
   - Inventory / Stock (No. 20) — material issue consumption charged to node
   - Construction Management (No. 22) — daily report, manpower, equipment, photo location
   - QA/QC (No. 27) — inspection request location, NCR location, punch list by node
   - HSE (No. 28) — incident and permit location
   - Equipment (No. 24) — utilisation allocation per node
   - Progress Claim / IPC (No. 32) — measured quantity by node for monthly valuation
   - Earned Value Management (No. 31) — control account identification and PV/EV/AC per node
   - Reporting & KPI (No. 44) — roll-up read model, S-curve source, location heat map
   - Mobile Field Application (No. 49) — cached subtree manifest, offline tree, conflict rules
   - Approval Workflow Engine — change request routing
   - Notification Engine — WBS-responsible recipient strategy resolution
   - Audit Trail Engine — event emission contract
6. Contract Specifications — for each integration: direction, trigger, payload schema (JSON), synchronous or event-driven, idempotency, failure behaviour, retry policy, SLA
7. **WBS Resolution Service** — the central contract other modules call:
   - `resolveContext(wbs_node_id)` → project, ancestors, discipline, responsible party, status, permission scope
   - `validateNode(wbs_node_id, module, action)` → allowed / blocked with reason (status gate, leaf-only rule, baseline lock)
   - `registerLink(wbs_node_id, entity_type, entity_id)` / `deregisterLink(...)` → the delete guard's write path
   - `resolveSubtree(wbs_node_id, depth)` → descendant ID set for filtered queries
   - `getRollup(wbs_node_id, measures[])` → cached aggregates with `calculated_at`
   - Response schemas, caching rules, cache invalidation events, degraded-mode behaviour when the service is unavailable
8. Event Bus Contract — Part 4.11 event codes with full payload schemas, ordering guarantees, and consumer list per event
9. Failure and Consistency — what happens when a consumer holds a `wbs_node_id` that was archived, moved, or cancelled; the orphan-reference resolution rule
10. Offline and Mobile Sync Contract — subtree cache manifest, staleness rules, conflict resolution (server wins for structure, device wins for field data, per Gap Analysis §4.6)
11. Open Questions, Change Log

### Must Include

- The **link registration contract is mandatory, not optional**: any module creating a record with `wbs_node_id` must call `registerLink`. State the enforcement mechanism (database trigger on consuming tables, or service-layer interceptor) and the reconciliation job that detects unregistered links nightly
- The **leaf-only rule** contract: which entity types may attach to branch nodes and which are restricted to leaves, expressed as a table
- **Move propagation:** what consumers must do when they receive `WBS.NODE.MOVED` — nothing structural (IDs are stable), but any cached `full_code`, `full_path`, or report label must be invalidated
- **Why IDs, never codes, are the integration key.** Codes are human-facing and mutable; `wbs_node_id` is the only stable reference. State this as a hard rule with the failure mode it prevents

### Acceptance Criteria

- Every consuming module named in Part 2.3 and the R1 module map appears with a defined contract
- Every payload schema uses column names from document 04
- Every synchronous call has a stated SLA and a stated degraded-mode fallback

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 02 and 04]

TASK: Write 05-Integration-Specification.md for the DCOS WBS Management module.
Document code DCOS-WBS-INT-001.

Follow exactly Section 5.5 of the master prompt.

Constraints:
- Minimum 14 consuming modules with full contract detail
- Full JSON payload schema for every event in Part 4.11 and every Resolution Service method
- Every integration states: direction, trigger, sync/async, idempotency, failure behaviour,
  retry policy, SLA
- Field names must match document 04 exactly
- Include the link registration enforcement mechanism and nightly reconciliation job
- Output pure Markdown, no commentary before or after the document
```

---

## 5.6 — `06-UI-UX-Design.md`

**Document Code:** DCOS-WBS-UX-001
**Depends on:** 02, 07
**Author persona:** Enterprise SaaS Designer + Construction Operations Consultant

### Required Sections

1. Document Control Header
2. Design Principles — data-dense but readable, tree always visible, destructive actions always previewed
3. Information Architecture — where WBS lives in the R0 §26.1 navigation, and the persistent left tree panel contract
4. Screen Inventory — `SCR-WBS-001` onward, mapped to FRs and permissions
5. Screen Specifications — for each screen: purpose, layout wireframe (ASCII/text block), components, data displayed, actions with permission codes, all states (loading, empty, error, no-permission, partial-data, offline, large-tree)
6. Interaction Specifications:
   - Drag-and-drop move: drop-target validation feedback, invalid-drop reason tooltip, confirmation modal with impact summary
   - Lazy loading and virtualised scrolling behaviour at 5,000 nodes
   - Inline rename with code-immutability indication
   - Multi-select and bulk action behaviour
   - Keyboard navigation and accessibility
7. The Impact Preview Modal — the single most important UI component in this module; specify exactly what it shows before any move, delete, cascade, or cancel
8. Tree Display Modes — Structure, Progress (heat map), Cost, Responsibility, Status, Baseline-Diff
9. Node Detail Panel — tabs: Overview, Attributes, Linked Records, Responsibility, Roll-Up, History
10. Mobile Design — offline tree, breadcrumb-first navigation, why drag-drop is disabled on mobile, node-scoped quick actions
11. Empty, Error, and Edge States — new project with no WBS, node with 0 children, deeply nested breadcrumb truncation, permission-restricted subtree display
12. Visual Language — node type icons, status colours, override flag, baseline-lock indicator, stale-rollup indicator
13. Notification and Toast Patterns
14. Open Questions, Change Log

### Must Include

- **Permission-restricted subtree display rule:** a user restricted to Level 05 Zone 03 sees their subtree with breadcrumb ancestors shown as non-expandable context, never as blank gaps. State this explicitly — it is the most common WBS UI bug
- **The stale roll-up indicator:** any displayed roll-up older than 15 minutes shows its age; no silent stale numbers
- **The override flag:** manual-override nodes are visually distinct at every level of every view, including exports
- **Baseline-diff view:** added, removed, moved, and renamed nodes each with distinct treatment
- Wireframes as text blocks for every screen — no "see Figma"

### Acceptance Criteria

- Every FR from document 02 that has a user interaction maps to a screen
- Every action shown carries a Part 4.10 permission code
- Every screen documents all seven states listed in section 5

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 02 and 07]

TASK: Write 06-UI-UX-Design.md for the DCOS WBS Management module.
Document code DCOS-WBS-UX-001.

Follow exactly Section 5.6 of the master prompt.

Constraints:
- Screen IDs SCR-WBS-001 onward, mapped to FR IDs and permission codes
- Text/ASCII wireframe for every screen — no external design tool references
- Every screen documents loading, empty, error, no-permission, partial-data, offline,
  and large-tree states
- Full specification of the Impact Preview Modal and all six tree display modes
- Explicit specification of restricted-subtree display with ancestor context
- Output pure Markdown, no commentary before or after the document
```

---

## 5.7 — `07-RBAC-Matrix.md`

**Document Code:** DCOS-WBS-RBAC-001
**Depends on:** 02, 04
**Author persona:** Senior System Architect + Security Engineer

### Required Sections

1. Document Control Header
2. Permission Model — the DCOS formula: `Role permission + Project access + Discipline access + WBS scope + Workflow responsibility`
3. Permission Catalogue — all 24 Part 4.10 codes with description, risk level, and default holders
4. Role × Permission Matrix — all 20 canonical DCOS roles × all 24 permissions, with Y / N / Conditional and a footnote per Conditional
5. **WBS Data Scope Model** — the module-specific part:
   - Scope types: `PROJECT_ALL`, `SUBTREE`, `DISCIPLINE_FILTERED`, `RESPONSIBLE_ONLY`, `LINKED_RECORDS_ONLY`
   - How a subtree grant is stored and evaluated
   - Inheritance: a grant on Level 05 implies all descendants; it never implies siblings or ancestors
   - Ancestor visibility rule: ancestors are visible as read-only breadcrumb context, never expandable
   - Interaction with discipline filtering (a STR engineer granted Building B01 sees only STR subtrees within it)
6. External Party Rules — subcontractor and supplier scope, client and consultant scope, hard prohibition on structure mutation permissions for any external role
7. Permission Evaluation Algorithm — precise order of checks, with the deny-wins rule and short-circuit conditions
8. Row-Level Security Mapping — how each scope type is expressed as a PostgreSQL RLS predicate
9. Elevated and Break-Glass Access — Super Admin impersonation, mandatory audit entry, time limit
10. Permission Change Audit — what is logged when a WBS scope grant changes
11. Test Assertions — 25+ statements of the form "Role X with scope Y attempting action Z on node N must be [allowed/denied] because [rule]"
12. Open Questions, Change Log

### Must Include

- `WBS.CONFIGURE_RULES`, `WBS.MANAGE_TEMPLATE`, and `WBS.RECALCULATE_ROLLUP` restricted to Company Admin and Super Admin
- `WBS.APPROVE_CHANGE` restricted to PM and Project Director; the raiser can never be the approver
- `WBS.OVERRIDE_PROGRESS` restricted to PM and Project Director, always reason-coded
- No external role holds any Create, Edit, Move, Delete, Archive, or Status permission — state as an absolute
- Explicit statement that WBS scope narrows but never widens project access
- The deny-wins rule stated without exception

### Acceptance Criteria

- The matrix is complete — 20 roles × 24 permissions, no blanks
- Every Conditional cell has a footnote naming the condition
- Every scope type has a corresponding RLS predicate in section 8

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 02 and 04]

TASK: Write 07-RBAC-Matrix.md for the DCOS WBS Management module.
Document code DCOS-WBS-RBAC-001.

Follow exactly Section 5.7 of the master prompt.

Constraints:
- Complete matrix: all 20 DCOS roles × all 24 permission codes from Part 4.10, no blanks
- Every Conditional cell footnoted with its condition
- Full WBS data scope model with the five scope types and their RLS predicates
- Minimum 25 test assertions in the stated form
- Deny-wins and no-external-mutation stated as absolutes
- Output pure Markdown, no commentary before or after the document
```

---

## 5.8 — `08-API-Reference.md`

**Document Code:** DCOS-WBS-API-001
**Depends on:** 04, 07
**Author persona:** Senior System Architect + API Designer

### Required Sections

1. Document Control Header
2. API Conventions — base URL, versioning, auth header, tenant resolution from JWT (never from body), content type, date format, ID format
3. Common Response Envelope and Error Model — error code catalogue specific to this module
4. Pagination, Filtering, Sorting, and the Lazy-Tree Contract
5. Endpoint Reference — all 38 Part 4.9 paths. For each: purpose, method, path, permission code, path/query/body parameters with types, request example, success response example, all error responses with codes, idempotency behaviour, rate limit, related FR IDs
6. Resolution Service Endpoints — the four `/internal/` endpoints with service-to-service auth model
7. Webhook / Event Publication — subscription model, payload envelope, delivery guarantee, retry
8. Bulk Operation Contracts — import (multipart upload → batch ID → poll status → dry-run diff → commit → rollback token) and export
9. Long-Running Operations — async job pattern for roll-up recalculation and large subtree moves: 202 Accepted, job ID, status polling, completion notification
10. Concurrency Control — subtree version token, `If-Match` header behaviour, 409 conflict payload naming the winning operation
11. Rate Limits — per Gap Analysis §5.4 (200 req/min/tenant), with the tree-fetch exemption rationale
12. Postman/OpenAPI Snippet
13. Open Questions, Change Log

### Must Include Error Codes

`WBS_NODE_NOT_FOUND`, `WBS_PARENT_NOT_FOUND`, `WBS_CIRCULAR_REFERENCE`, `WBS_DEPTH_EXCEEDED`, `WBS_BREADTH_EXCEEDED`, `WBS_CODE_DUPLICATE`, `WBS_CODE_INVALID_FORMAT`, `WBS_CODE_IMMUTABLE`, `WBS_STRUCTURE_RULE_VIOLATION`, `WBS_LEAF_CANNOT_HAVE_CHILDREN`, `WBS_NODE_HAS_LINKS`, `WBS_BASELINE_LOCKED`, `WBS_CHANGE_REQUEST_REQUIRED`, `WBS_STATUS_TRANSITION_INVALID`, `WBS_SUBTREE_TOO_LARGE`, `WBS_CONCURRENT_MODIFICATION`, `WBS_IMPORT_VALIDATION_FAILED`, `WBS_IMPORT_ALREADY_COMMITTED`, `WBS_ROLLUP_STALE`, `WBS_OVERRIDE_REASON_REQUIRED`, `WBS_SCOPE_DENIED`, `WBS_PROJECT_NOT_ACTIVE`

### Acceptance Criteria

- Every endpoint names its permission code and its FR IDs
- Every request and response example uses real field names from document 04 and the Part 4.14 Tower A data
- Every error code appears in at least one endpoint's error table

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 04 and 07]

TASK: Write 08-API-Reference.md for the DCOS WBS Management module.
Document code DCOS-WBS-API-001.

Follow exactly Section 5.8 of the master prompt.

Constraints:
- Document all 38 endpoints listed in Part 4.9, plus any additional endpoint required
  by document 02 (record additions in the Change Log)
- Every endpoint: purpose, permission code, parameters, request example, response
  example, complete error table, idempotency, rate limit, related FR IDs
- All examples use the Part 4.14 Tower A data and document 04 field names
- Include the full error code catalogue listed in Section 5.8
- Include the async job pattern and the subtree version token concurrency contract
- Output pure Markdown with fenced json code blocks, no commentary
```

---

## 5.9 — `09-Test-Plan.md`

**Document Code:** DCOS-WBS-QA-001
**Depends on:** 02, 03, 04, 07, 08
**Author persona:** QA Lead + Senior System Architect

### Required Sections

1. Document Control Header
2. Test Strategy, Scope, and Entry/Exit Criteria
3. Test Environment and Data Requirements — including the seeded 5,000-node performance project
4. Test Case Catalogue — 90+ cases, ID format `TC-WBS-<AREA>-<NNN>`. Areas: `STRUCT`, `CODE`, `MOVE`, `DELETE`, `STATUS`, `ROLLUP`, `BASELINE`, `IMPORT`, `TEMPLATE`, `PERM`, `SCOPE`, `INT`, `PERF`, `SEC`, `MOBILE`, `UI`. Each case: ID, title, related FR/UC, preconditions, steps, expected result, priority, type
5. **Tree Integrity Test Suite** — the module-specific suite: no orphans, no cycles, closure table consistency with adjacency list, `full_code` matches computed path for every node, `depth` matches closure depth, `is_leaf` matches child count, exactly one root per project. These run as automated invariant checks after every mutation test
6. Permission and Scope Test Matrix — role × action × scope, expected allow/deny
7. Integration Test Cases — one per consuming module contract from document 05
8. Performance Test Cases — against every Part 4.13 target, with load profile and pass/fail threshold
9. Security Test Cases — cross-tenant leak, cross-project leak, subtree scope escape, JWT tenant tampering, IDOR on `wbs_node_id`, mass-assignment on protected columns
10. Regression Suite Definition
11. UAT Scenarios — business-language scripts for PM, Planner, QS, Document Controller, Site Engineer
12. Defect Severity Definitions and Traceability Matrix (FR → TC coverage, with uncovered FRs listed explicitly)
13. Open Questions, Change Log

### Must Include

- A cross-tenant leak test for every endpoint, not a single representative test — Gap Analysis §5.2 rates this Critical
- A concurrency test: two simultaneous moves in the same subtree
- A move test that verifies every linked record still resolves and every `full_code` was re-materialised
- An import rollback test verifying the tree returns to its exact pre-import state
- A roll-up correctness test with hand-calculated expected values for all five methods
- A test that a baseline-locked node refuses mutation and offers the change request path
- A test that a `MANUAL_OVERRIDE` node is flagged in every report and export

### Acceptance Criteria

- Every FR from document 02 maps to at least one test case; uncovered FRs are listed, not hidden
- Every Part 4.13 performance target has a test case with a numeric threshold
- Every error code from document 08 has a test case that triggers it

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 02, 03, 04, 07, 08]

TASK: Write 09-Test-Plan.md for the DCOS WBS Management module.
Document code DCOS-WBS-QA-001.

Follow exactly Section 5.9 of the master prompt.

Constraints:
- Minimum 90 test cases with IDs TC-WBS-<AREA>-<NNN>
- Include the full Tree Integrity invariant suite as automated post-mutation checks
- Cross-tenant leak test for every endpoint in document 08
- Hand-calculated expected values for all five roll-up methods
- Every FR mapped to at least one test case; list any uncovered FRs explicitly
- Output pure Markdown, no commentary before or after the document
```

---

## 5.10 — `10-Deployment-Notes.md`

**Document Code:** DCOS-WBS-DEP-001
**Depends on:** 04, 05, 08, 09
**Author persona:** DevOps Engineer + Senior System Architect

### Required Sections

1. Document Control Header
2. Deployment Overview and Dependency Order — WBS deploys after Auth/RBAC, Tenant, and Project Setup; nothing that references `wbs_node_id` deploys before it
3. Migration Plan — numbered migration files in order, each with purpose, forward SQL reference, and reversibility statement
4. **Closure Table Backfill Procedure** — for tenants with existing data: batch size, expected duration per 10,000 nodes, verification query, rollback
5. Environment Variables and Configuration — max depth, max breadth, max subtree operation size, roll-up job schedule, cache TTL, import row limit
6. Feature Flags — `wbs_baseline_control`, `wbs_bulk_import`, `wbs_templates`, `wbs_cost_rollup`, `wbs_drag_drop`, each with default state per phase
7. Background Jobs and Schedules — roll-up recalculation worker, staleness sweeper, link reconciliation job, progress snapshot job (period-end), orphan detection job
8. Rollback Plan — per migration and per feature flag, with the specific hazard: rolling back after nodes exist is a data-loss event, so state the point of no return explicitly
9. Smoke Test Checklist — post-deploy verification tied to document 09 test case IDs
10. Monitoring and Alerting — tree query latency, roll-up job duration and failure, closure table integrity check result, orphan count, unregistered link count, stale cache percentage
11. Performance Tuning Notes — index warm-up, connection pooling for recursive queries, cache sizing
12. Backup and Recovery — per Gap Analysis §5.5 (RTO 4h, RPO 1h), with the WBS-specific concern that a partial restore producing an inconsistent closure table is worse than no restore
13. Runbook — five named incidents: closure table drift, roll-up job stuck, import stuck mid-commit, orphaned subtree detected, cross-project node reference detected
14. Open Questions, Change Log

### Acceptance Criteria

- Migration order is explicit and dependency-correct
- Every feature flag names its default per phase
- Every alert names its threshold and its runbook entry
- The point of no return for rollback is stated unambiguously

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 04, 05, 08, 09]

TASK: Write 10-Deployment-Notes.md for the DCOS WBS Management module.
Document code DCOS-WBS-DEP-001.

Follow exactly Section 5.10 of the master prompt.

Constraints:
- Numbered migration order with reversibility statement per migration
- Full closure table backfill procedure with batch size, duration estimate, and verification query
- Every background job with schedule, timeout, failure behaviour, and alert
- Runbook entries for all five named incidents
- Smoke tests reference document 09 test case IDs
- Output pure Markdown, no commentary before or after the document
```

---

## 5.11 — `11-SOP.md`

**Document Code:** DCOS-WBS-SOP-001
**Depends on:** 02, 03, 07
**Author persona:** Construction Operations Consultant

### Required Sections

1. Document Control Header
2. Purpose and Applicability
3. Roles and Responsibilities (RACI table)
4. SOP Index
5. Detailed SOPs — 12+, each with: SOP ID, purpose, trigger, frequency, responsible role, prerequisites, numbered steps with screen references, decision points, exception handling, records produced, related audit events
6. Governance Calendar — what happens weekly, monthly, at baseline, at phase completion, at project closure
7. Compliance and Audit Evidence — what a client auditor will ask for and where it lives
8. Escalation Matrix
9. Forms and Templates — WBS change request form, structure review checklist, import template layout
10. Change Log

### Mandatory SOPs

| ID | SOP |
|---|---|
| SOP-WBS-01 | Establishing the initial WBS at project award (template selection and refinement) |
| SOP-WBS-02 | Defining and approving the project WBS coding convention |
| SOP-WBS-03 | Bulk importing a WBS from an existing schedule or room schedule |
| SOP-WBS-04 | Reviewing and approving the WBS before baseline |
| SOP-WBS-05 | Setting and re-setting the structure baseline |
| SOP-WBS-06 | Raising and processing a post-baseline WBS change request |
| SOP-WBS-07 | Executing a node move and verifying downstream integrity |
| SOP-WBS-08 | Handling a blocked deletion (archive vs reassign decision) |
| SOP-WBS-09 | Assigning and transferring WBS node responsibility |
| SOP-WBS-10 | Monthly roll-up verification before IPC preparation |
| SOP-WBS-11 | Applying and justifying a manual progress override |
| SOP-WBS-12 | Closing a WBS branch at phase or building completion |
| SOP-WBS-13 | Archiving the WBS at project closure and handover |
| SOP-WBS-14 | Periodic tree integrity and orphan review |

### Must Include

- SOP-WBS-04 must specify who signs off: PM, Planner, QS, and Document Controller each confirm the structure serves their needs before baseline. This is the single control that prevents six months of rework
- SOP-WBS-10 must tie roll-up verification to the IPC cycle explicitly — the QS cannot value work against a tree that changed shape mid-month without a recorded change request
- Every SOP names the audit events it produces, so an auditor can verify the SOP was actually followed

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 02, 03, 07]

TASK: Write 11-SOP.md for the DCOS WBS Management module.
Document code DCOS-WBS-SOP-001.

Follow exactly Section 5.11 of the master prompt, including all 14 mandatory SOPs.

Constraints:
- Each SOP: ID, purpose, trigger, frequency, responsible role, prerequisites,
  numbered steps with SCR-WBS screen references, decision points, exception handling,
  records produced, related audit events
- Written for construction professionals, not developers
- Include the pre-baseline four-party sign-off control in SOP-WBS-04
- Include the WBS change request form layout and the import template column layout
- Output pure Markdown, no commentary before or after the document
```

---

## 5.12 — `12-Training-Guide.md`

**Document Code:** DCOS-WBS-TRN-001
**Depends on:** 03, 06, 11
**Author persona:** Construction Operations Consultant + Technical Trainer

### Required Sections

1. Document Control Header
2. Training Objectives and Audience Analysis
3. Role-Based Training Paths — six tracks with duration, prerequisites, content, and assessment:
   - Project Manager / Project Director (structure governance, change control, override discipline)
   - Planner / Scheduler (breakdown design, templates, import, baseline)
   - QS / Cost Engineer (cost containers, roll-up methods, IPC dependency)
   - Document Controller (code segments, numbering integrity, superseded code resolution)
   - Site Engineer / Supervisor (navigation, progress location, mobile use)
   - Company Admin (node types, structure rules, template governance, tenant setup)
4. Core Concepts Module — taught before any track: what a WBS is, why the spine matters, why Task is not a node, why parent progress is derived
5. Module Walkthrough — screen-by-screen guided tour referencing document 06 screen IDs, with "what you see / what you do / what happens next"
6. Hands-On Exercises — 12+ sandbox scenarios, including the full Tower A build-to-baseline exercise from document 03
7. Common Mistakes and How to Avoid Them — coding the discipline into the wrong level, building the tree around one department's needs, deleting instead of archiving, overriding progress instead of fixing leaf data, restructuring after baseline without a change request, importing without a dry run
8. Quick Reference Cards — one printable page per SOP-critical task
9. Assessment — 20-question quiz with answer key, plus a practical assessment rubric
10. Glossary — construction and system terms (work package, control account, roll-up, baseline, re-measurement, closure, DLP)
11. Change Log

### Must Include

- A plain-language explanation of the five roll-up methods aimed at a QS, with a worked example on paper before touching the system
- A section for site staff on reading a WBS code — this is the skill that makes the whole system navigable
- Screenshot placeholders in the format `[SCREENSHOT: SCR-WBS-NNN — description]`

### Copy-Paste Prompt

```
[PASTE PART 1, PART 3, PART 4]
[PASTE APPROVED 03, 06, 11]

TASK: Write 12-Training-Guide.md for the DCOS WBS Management module.
Document code DCOS-WBS-TRN-001.

Follow exactly Section 5.12 of the master prompt.

Constraints:
- Six role-based training paths with duration, content, and assessment
- Minimum 12 hands-on exercises with realistic construction scenarios
- Minimum 20 assessment questions with answer key
- Screenshot placeholders in the format [SCREENSHOT: SCR-WBS-NNN — description]
- Printable quick reference card per SOP-critical task
- Plain, practical language — the audience is site and office staff, not developers
- Output pure Markdown, no commentary before or after the document
```

---

# PART 6 — CROSS-DOCUMENT CONSISTENCY CONTRACT AND QUALITY GATE

## 6.1 Frozen Artefacts

Once a document is approved, the following become frozen and may only change through the Change Log with a version bump propagated to all affected documents:

| Artefact | Frozen By | Consumed By |
|---|---|---|
| Business rule IDs `BRL-WBS-NNN` | 01 | 02, 03, 09, 11 |
| Functional requirement IDs `FR-WBS-NNN` | 02 | 03, 06, 08, 09 |
| Node types and structure rules | Part 4.2 / 4.3 | all |
| Status list and transition table | Part 4.4 | all |
| Code rules CODE-01…08 | Part 4.5 | 02, 04, 05, 08, 09, 11 |
| Roll-up methods and rules ROLL-01…08 | Part 4.6 | 02, 04, 05, 06, 09, 12 |
| The 16 canonical tables and columns | 04 | 05, 08, 09, 10 |
| Permission codes | Part 4.10 / 07 | 02, 06, 08, 09, 11 |
| Event codes | Part 4.11 / 05 | 02, 04, 08, 09, 10 |
| API paths and error codes | Part 4.9 / 08 | 05, 09, 10 |
| Screen IDs `SCR-WBS-NNN` | 06 | 09, 11, 12 |
| Test case IDs `TC-WBS-*` | 09 | 10 |
| SOP IDs `SOP-WBS-NN` | 11 | 12 |

## 6.2 Per-Document Quality Gate

A document is not accepted until all of the following pass:

- [ ] Control header complete, document code correct
- [ ] All required sections present, none merged or skipped
- [ ] Depth target met (Part 3.4)
- [ ] All must-include items present
- [ ] Only canonical node types, statuses, roll-up methods, permission codes, event codes, table names, and API paths used
- [ ] Every identifier referenced from another document actually exists there
- [ ] Every mutating operation documents rejection, concurrency, and subtree impact paths
- [ ] Every state-changing action names its audit event
- [ ] Tenant **and project** isolation stated wherever data is accessed
- [ ] The three Part 2.4 architectural decisions are never contradicted
- [ ] Out-of-scope items (Part 2.3) are referenced, not designed
- [ ] Part 4.14 Tower A example used for illustrations
- [ ] No banned generic phrases
- [ ] Open Questions and Change Log sections present
- [ ] Ends with `**End of Document**`

## 6.3 Module-Specific Quality Gate Questions

Ask of every generated document before approval:

1. Could a developer, planner, QS, or trainer act on this document without asking a clarifying question?
2. Does anything contradict the R0 principles the Gap Analysis says to preserve — WBS as single spine, dynamic depth, roll-up from child to parent, code uniqueness within project?
3. **Does the document survive the move test?** If a planner moves Zone 03 from Level 05 to Level 06 tomorrow, does this document tell the reader exactly what happens in its dimension — data, screen, permission, API, test, procedure?
4. **Does the document survive the audit test?** Could the company answer a client asking "prove the structure you valued this IPC against is the same structure you valued last month's against"?
5. Is the boundary with Planning & Scheduling (No. 23), BOQ (No. 29), and Task Management held cleanly, or has the document started designing them?

If any answer is no, revise before moving to the next document.

## 6.4 Cross-Document Verification Prompt

Run this after all 12 documents exist:

```
You are a documentation auditor for the DCOS WBS Management module.

INPUT: the 12 documents 01 through 12.

TASK: Produce a consistency audit report containing:
1. Identifier integrity — every BRL, FR, UC, SCR, TC, SOP, permission code, event code,
   table name, column name, API path, and error code referenced anywhere; flag every
   reference with no definition, and every definition never referenced.
2. Enum drift — any node type, status, roll-up method, scope type, or severity used
   outside the canonical set in Part 4.
3. Contradictions — any statement in one document that conflicts with another, with
   particular attention to: delete guard behaviour, code immutability trigger,
   roll-up direction, baseline lock scope, and leaf-only linking rules.
4. Coverage gaps — FRs with no test case, use cases with no screen, permissions with no
   endpoint, events with no consumer, tables with no RLS policy.
5. Boundary violations — any place a document designs Task Management, Planning &
   Scheduling, BOQ, or Document Control internals rather than referencing them.
6. The move test — confirm all 12 documents describe the node-move operation
   consistently in their own dimension.

Output a table of findings with severity (Critical / High / Medium / Low) and the
specific document, section, and line reference for each.
```

---

**End of Prompt Pack — DCOS-PROMPT-WBS-001**
