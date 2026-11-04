# DCOS — WBS Management Module
## 01 — Business Requirement Document

| Field | Detail |
|---|---|
| Document Code | DCOS-WBS-BRD-001 |
| Version | R1 |
| Module | 04-03 — WBS Management (Foundation Phase, R1 Module Map No. 06) |
| Author Persona | Construction Operations Consultant + Senior System Architect |
| Status | Issued for Review |
| Base References | DCOS_System_Architecture_Module_Design_R0.md §8, DCOS_Gap_Analysis_R1.docx §2.3, §3.4, §10.3 |

| Change Log | | |
|---|---|---|
| R1 | 2026-08-08 | Initial issue |

---

## 1. Business Context

Every construction company already has a work breakdown structure. The problem is that it has five of them, and they do not agree.

The planner keeps one in Primavera or MS Project, organised by activity. The QS keeps one in the BOQ, organised by trade and bill section. The document controller keeps one hidden inside drawing numbers — `TWR-A-L05-STR-001` — invented by whoever numbered the first drawing. The site team keeps one on a whiteboard, organised floor by floor. The accountant keeps one in cost codes that predate the project. When the Project Director asks "how is Level 05 doing?", four departments give four answers computed against four different definitions of Level 05, and someone spends an afternoon reconciling them in Excel.

DCOS's core architectural decision — confirmed as the principle to preserve in the Gap Analysis (§10.3) — is that there is **one** breakdown structure, owned by the platform, and every task, drawing, cost line, material batch, inspection, incident, photo, and payment valuation attaches to a node in it. WBS Management is the module that builds, protects, and serves that structure.

For a company operating in Cambodia and Southeast Asia — mixed portfolios of towers, factories, villas, roads, and fit-outs, USD contracts with KHR costs, FIDIC-style client/consultant structures — the WBS must additionally survive a reality the textbooks skip: projects are messy, structures change mid-stream when a variation lands, and the tree must remain reconcilable month to month or the interim payment certificate becomes indefensible.

## 2. Problem Statement — Pain Points

| # | Pain Point | Commercial Consequence |
|---|---|---|
| PP-01 | Each department maintains its own breakdown of the same building | 2–4 staff-days per month per project spent reconciling progress reports; contradictory numbers presented to the client |
| PP-02 | Location codes live inside drawing numbers with no master register | A renamed level orphans hundreds of drawing numbers; document retrieval during a defect claim takes days instead of minutes |
| PP-03 | Progress percentages are typed at summary level ("Level 05 is 60%") with no derivation | Management discovers real progress at handover; optimistic reporting hides 2–3 months of slippage until it is unrecoverable |
| PP-04 | Cost cannot be answered by location — only by cost code or supplier | "What did the Level 05 slab cost us?" is unanswerable; loss-making zones subsidised invisibly by profitable ones |
| PP-05 | Structure changes silently mid-project (zones merged, levels renumbered) | Last month's IPC valuation cannot be reconciled to this month's; consultant challenges the claim; payment delayed 30–60 days |
| PP-06 | No control over who may restructure | A well-meaning engineer reorganises a folder tree and breaks every report; recovery takes a week |
| PP-07 | Subcontractors see everything or nothing | Either commercial exposure (sub sees the whole project's data) or blindness (sub gets PDFs by email, replies by WhatsApp) |
| PP-08 | Repetitive structures rebuilt by hand for every project | 3–5 days of setup per tower project re-typing 40 identical floors; typos in codes propagate into documents |
| PP-09 | Deleting a location silently strands its records | Tasks, photos, and inspections pointing at deleted locations; audit trail broken; claim evidence lost |
| PP-10 | No record of which material batch went into which element | A failed cube test cannot be traced to the pours it affects; the consultant rejects a whole floor instead of one zone; demolition and recasting cost borne entirely by the contractor |
| PP-11 | Responsibility for an area is tribal knowledge | RFIs and inspection requests sit unanswered because "nobody owns Zone 03"; response-time KPIs unmeasurable |
| PP-12 | Fixed-depth software forced onto variable projects | A road project jammed into Building/Level/Room fields produces nonsense codes nobody uses; the tool is abandoned and Excel returns |

## 3. Business Objectives

| # | Objective | Operational Outcome |
|---|---|---|
| BO-01 | Establish one authoritative breakdown per project, consumed by all disciplines | One definition of "Level 05" across planning, cost, documents, QA, and site |
| BO-02 | Make every operational record locatable | Any task, document, cost, or inspection answers the five questions: which project, which location, which discipline, who is responsible, what status |
| BO-03 | Derive summary progress from the bottom up, never type it at the top | Reported progress is arithmetically defensible in front of the client and the consultant |
| BO-04 | Aggregate cost by location as well as by code | Zone- and level-level profitability visible monthly, not at final account |
| BO-05 | Control structural change after commercial baseline | Every tree change after baseline is requested, approved, and traceable — the IPC reconciles month to month |
| BO-06 | Scope external party visibility to their subtree | Subcontractors and suppliers work inside the platform without commercial exposure |
| BO-07 | Reuse structure templates across the portfolio | Tower project setup in hours, not days; consistent coding across projects enables portfolio comparison |
| BO-08 | Preserve every historical location code | Documents numbered against an old code remain resolvable for the life of the project plus DLP plus the latent-defect period |
| BO-09 | Name a responsible party for every active branch | Unanswered RFIs and inspections have an owner and an escalation path |
| BO-10 | Support any project shape at any depth | Towers, factories, roads, and fit-outs each get a structure that matches how they are actually built |

## 4. Stakeholder Analysis

| Stakeholder | Relationship to the WBS | Suffers When It Is Wrong |
|---|---|---|
| Project Manager | Governs structure; approves changes; answers to the client on progress | Presents irreconcilable numbers; loses credibility in progress meetings |
| Planner / Scheduler | Designs the breakdown; maps schedule activities to work packages | Schedule and site report against different structures; look-aheads meaningless |
| QS / Cost Engineer | Uses nodes as cost containers; values IPC against the tree | Cannot defend monthly valuation; retention and claims disputes |
| Document Controller | Draws numbering segments from node codes | Broken document numbers; failed retrieval during audits and claims |
| Site Engineer / Supervisor | Reports progress and daily work against locations | Reports into the void; work done but not credited |
| QA/QC Inspector | Locates inspections, NCRs, and punch items | Inspection lots ambiguous; NCR closure unverifiable |
| HSE Officer | Locates incidents and permits | Incident trends by area invisible |
| Discipline Managers (ARC/STR/MEP) | Own discipline subtrees and deliverables | Cross-discipline coordination failures at exactly the locations that clash |
| Subcontractor | Works within an assigned subtree | Over- or under-exposure to project data |
| Client / Consultant | Reviews progress and valuations against the structure | Rejects claims when structure shifts unexplained |
| Company Admin / Director | Compares projects across the portfolio | No like-for-like comparison; tender pricing learns nothing from history |

## 5. Business Requirements

Priority: **M** = Must, **S** = Should, **C** = Could.

| ID | Requirement | Rationale | Pri | Source |
|---|---|---|---|---|
| BRL-WBS-001 | Each project shall have exactly one breakdown structure with a single root, created automatically when the project becomes active. | One spine; no parallel trees | M | R0 §2.1, §8.1 |
| BRL-WBS-002 | The structure shall support variable depth up to 12 levels, with node types (phase, discipline, building, area, level, zone, room, element, work package) combinable to suit the project type. | Towers, factories, roads, and fit-outs are shaped differently | M | R0 §2.3; PP-12 |
| BRL-WBS-003 | Every node shall carry a code, unique among its siblings, forming a full code unique within the project, usable as a segment source for document numbering. | Numbering integrity; retrieval | M | R0 §8.6, §15.5 |
| BRL-WBS-004 | The lowest structural level shall be the work package; tasks, documents, costs, materials, and inspections shall attach to nodes rather than being nodes. | Structure stability; performance; baseline integrity | M | Part 2.4 D1 |
| BRL-WBS-005 | Summary (parent) progress shall always be derived from child data by a declared weighting method; it shall never be directly authored except by an explicit, permissioned, reason-coded override that is visibly flagged in every report. | Ends optimistic top-down reporting | M | PP-03; R0 §8.6 |
| BRL-WBS-006 | Cost shall aggregate by node: budget, committed, actual, and forecast, in project and base currency. | Location profitability | M | BO-04 |
| BRL-WBS-007 | A node with any linked record shall not be deletable; the system shall offer archive or link reassignment instead. | No stranded records; audit integrity | M | PP-09 |
| BRL-WBS-008 | The project structure shall be baselined at a declared point (before first IPC at latest); thereafter, moves, code changes, deletions, and type changes shall require an approved change request. | IPC reconcilability; claim defence | M | PP-05; Gap §3.4 |
| BRL-WBS-009 | Historical full codes shall be preserved and resolvable after rename or move, for project duration + DLP + 5 years. | Old document numbers must resolve | M | PP-02; Gap §5.1 |
| BRL-WBS-010 | Data visibility shall be scopeable to a subtree per user or external party, with ancestors visible as context only. | External access without exposure | M | PP-07; BO-06 |
| BRL-WBS-011 | Each active branch shall support a named responsible party per discipline, with validity dates, feeding notification and escalation. | RFI/inspection ownership | M | PP-11 |
| BRL-WBS-012 | Reusable structure templates by project type shall be maintainable at company level and applicable at project activation. | Setup speed; portfolio consistency | M | PP-08 |
| BRL-WBS-013 | Structure shall be importable from spreadsheet with full validation and a previewed dry run before commit, and a committed import shall be reversible. | Realistic setup path for large structures | M | PP-08 |
| BRL-WBS-014 | Every structural action (create, rename, move, status change, delete, import, baseline, override) shall be recorded in the append-only audit trail with before/after values. | Traceability; dispute evidence | M | R0 §24.4 |
| BRL-WBS-015 | Node lifecycle shall include hold, completion, closure, cancellation (descoped work), and archive, with completion gated on descendant completion and closure gated on open-item checks. | Lifecycle truth; DLP survival | M | BO-08 |
| BRL-WBS-016 | The structure shall be navigable and readable offline on mobile for a user's assigned scope. | Site reality — no laptops on the slab | S | Gap §4.6 |
| BRL-WBS-017 | Typical-floor structures shall be duplicable (build Level 05 once, replicate to Levels 06–20 with re-coded segments). | Tower reality | S | PP-08 |
| BRL-WBS-018 | The structure shall be comparable against any baseline, showing added, removed, moved, and renamed nodes. | Change visibility for client and QS | S | BO-05 |
| BRL-WBS-019 | Descoped nodes (omission variations) shall be cancellable with reason, excluded from progress denominators but retained in history. | Variation reality | S | BO-05 |
| BRL-WBS-020 | Node attributes (floor area, elevation, grid reference, BIM model key) shall be extensible per node without schema change. | BIM and quantity linkage later | C | Gap §4.14 |

## 6. Business Rules (Non-Negotiable)

| Rule | Statement |
|---|---|
| BR-A | One root per project. The root is system-created, never moved, never deleted. |
| BR-B | Full code unique within project. Sibling code unique under one parent. |
| BR-C | Roll-up flows child → parent only. There is no legitimate top-down write path except the flagged override. |
| BR-D | Delete is guarded. Linked nodes archive; they do not disappear. |
| BR-E | Post-baseline structural change requires approval. No exceptions, including admins. |
| BR-F | Audit is append-only. Structural history is never editable. |
| BR-G | External parties never mutate structure. Viewing scope, never editing rights. |
| BR-H | Every record created anywhere in DCOS that references a location must reference a valid, active node. |

## 7. Scope Statement

**In scope:** structure definition and mutation, coding, templates, bulk import/export, lifecycle, baseline and change control, progress and cost roll-up containers, responsibility assignment, linkage registry, subtree-scoped access, and the resolution service other modules consume.

**Out of scope (owning module):** task execution (Task Management); schedule dates, float, and critical path (Planning & Scheduling, No. 23); BOQ items, rates, and measurement (BOQ Engine, No. 29); budget lines and postings (No. 30/42); document registers and transmittals (No. 37); project codes and numbering rule masters (Project Setup, No. 05); stakeholder and approval-authority masters (No. 04); BIM model parsing (No. 14).

**Assumptions:** Project Setup and Stakeholder Management are live before this module; the approval workflow engine is available for change requests; the audit engine is available from day one.

**Dependencies:** project activation event (creates the root); numbering rules frozen by Project Setup; user/role provisioning from RBAC.

## 8. Success Criteria

| # | Criterion | Measure |
|---|---|---|
| SC-01 | 100% of tasks, documents, BOQ items, inspections, and daily reports created after go-live carry a valid node reference | Automated nightly check; zero orphans |
| SC-02 | Zero authored parent progress outside flagged overrides | Override Exception Report |
| SC-03 | Overrides below 2% of active branch nodes per project per month | Monthly governance review |
| SC-04 | Structure baseline set before first IPC on 100% of awarded projects | Baseline register vs IPC register |
| SC-05 | 100% of post-baseline structural changes carry an approved change request | Audit query: mutation events without CR reference = 0 |
| SC-06 | Tower-class project structure established in under 1 working day using templates | Setup time log |
| SC-07 | Any historical document number resolves to a current node in under 30 seconds | Retrieval drill, quarterly |
| SC-08 | Every active branch has a current responsible party | Unassigned-branch report = 0 for ACTIVE nodes |
| SC-09 | Monthly progress reconciliation effort reduced from days to under 1 hour | PM time survey, 3 months post-adoption |
| SC-10 | Zero cross-project or cross-tenant structure visibility incidents | Security test suite; incident register |
| SC-11 | Subcontractor users active inside their scope on 100% of projects with subcontracted works | Access log review |

## 9. Business KPIs

| KPI | Target | Frequency |
|---|---|---|
| Records with valid node reference | 100% | Nightly |
| Structural changes after baseline without CR | 0 | Monthly |
| Manual override rate | < 2% of branch nodes | Monthly |
| Template usage on new projects | ≥ 80% | Quarterly |
| Median RFI/inspection response where responsibility assigned vs not | ≥ 40% faster | Quarterly |
| Tree-related support tickets | Declining trend | Monthly |

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Planner builds the tree for scheduling alone; QS and DC needs ignored | Structure reworked mid-project — the most expensive failure this module can have | Mandatory four-party sign-off (PM, Planner, QS, Document Controller) before baseline (SOP-WBS-04) |
| Teams bypass the guard by archiving-and-recreating nodes | History fragmented | Archive requires reason; recreation with a recently archived code is warned and audited |
| Over-deep trees (12 levels everywhere) | Unusable navigation; roll-up noise | Templates model restraint; breadth/depth warnings; training |
| Cross-tenant or cross-project leak via tree queries | Catastrophic breach (Gap §5.2, Critical) | Row-level isolation on tenant and project; leak tests on every endpoint in CI |
| Roll-up trusted while stale | Wrong numbers in an IPC | Staleness visibly displayed; pre-IPC verification SOP |
| Import loads a wrong structure at scale | Hundreds of bad nodes in minutes | Dry-run diff mandatory; batch rollback |

## 11. Constraints

- Contractual: IPC valuations must reconcile against a declared structure revision; consultant may audit structural history at any time.
- Legal/retention: structural history retained project + DLP + 5 years minimum (aligned to Gap §5.1 drawing retention).
- Organisational: site staff operate on mobile with intermittent connectivity; Khmer/English bilingual user base.
- Platform: multi-tenant from day one; append-only audit; configurable rules over hard-coding (R0 §23.3).

## 12. Open Questions

| # | Question | Owner |
|---|---|---|
| OQ-01 | Is a per-project override budget (hard cap on MANUAL_OVERRIDE count) wanted, or governance-by-report only? | PM Council |
| OQ-02 | Should CANCELLED scope remain visible to client/consultant roles by default, or on request? | Commercial Director |
| OQ-03 | Minimum template set at launch: Tower, Factory, Fit-Out confirmed — is Road/Infrastructure required for Phase 1? | Operations |

## 13. Change Log

| Version | Date | Change |
|---|---|---|
| R1 | 2026-08-08 | Initial issue for review |

**End of Document**
