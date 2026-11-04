# DCOS — WBS Management Module
## 11 — Standard Operating Procedures

| Field | Detail |
|---|---|
| Document Code | DCOS-WBS-SOP-001 |
| Version | R1 |
| Module | 04-03 — WBS Management |
| Author Persona | Construction Operations Consultant |
| Status | Issued for Use |
| Base References | DCOS-WBS-FS-001, -UC-001, -RBAC-001, -UX-001 |

---

## 1. Purpose and Applicability

These procedures govern how the project breakdown structure is created, changed, controlled, and closed in DCOS. They apply to every awarded project and to tender projects that progress past pre-qualification. They are mandatory: the structure is the basis of progress reporting, cost allocation, document numbering, and monthly valuation, so informal changes to it are informal changes to the commercial record.

## 2. Roles and Responsibilities (RACI)

| Activity | PM | Planner | QS | Doc Controller | Disc. Manager | PD | Company Admin |
|---|---|---|---|---|---|---|---|
| Design the breakdown | A | R | C | C | C | I | — |
| Approve coding convention | A | R | C | R | C | I | C |
| Import / bulk build | A | R | I | I | C | I | C |
| Pre-baseline sign-off | A | R | R | R | C | I | — |
| Set baseline | R/A | C | C | C | I | A | — |
| Approve change request | A/R | C | C | I | C | A (if PM is raiser) | — |
| Execute move | A | R | I | I | I | I | — |
| Assign responsibility | A | C | I | I | R | I | — |
| Monthly roll-up verification | A | C | R | I | C | I | — |
| Apply override | R/A | I | C | I | I | A | — |
| Close / archive branches | A | C | C | C | R | I | — |
| Templates, types, rules | C | C | I | C | I | I | R/A |

## 3. SOP Index

| ID | Procedure | Frequency |
|---|---|---|
| SOP-WBS-01 | Establishing the initial WBS at project award | Per project |
| SOP-WBS-02 | Defining and approving the coding convention | Per project |
| SOP-WBS-03 | Bulk importing a WBS from a schedule or room list | As required |
| SOP-WBS-04 | Pre-baseline structure review and four-party sign-off | Per project (before first IPC) |
| SOP-WBS-05 | Setting and re-setting the structure baseline | Per baseline |
| SOP-WBS-06 | Raising and processing a post-baseline change request | As required |
| SOP-WBS-07 | Executing a node move and verifying downstream integrity | As required |
| SOP-WBS-08 | Handling a blocked deletion | As required |
| SOP-WBS-09 | Assigning and transferring node responsibility | On mobilisation / personnel change |
| SOP-WBS-10 | Monthly roll-up verification before IPC preparation | Monthly |
| SOP-WBS-11 | Applying and justifying a manual progress override | Exception only |
| SOP-WBS-12 | Closing a WBS branch at phase or building completion | Per milestone |
| SOP-WBS-13 | Archiving the WBS at project closure and handover | Per project |
| SOP-WBS-14 | Periodic tree integrity and orphan review | Monthly |

---

## 4. Detailed Procedures

### SOP-WBS-01 — Establishing the Initial WBS at Project Award

**Purpose:** produce a structure that serves planning, cost, documents, and site simultaneously.
**Trigger:** project status set to ACTIVE by Project Setup. **Frequency:** once per project. **Responsible:** Planner (PM accountable).
**Prerequisites:** contract scope documents, tender BOQ structure, drawing register conventions, agreed phase strategy.

1. Convene a 60-minute structure workshop with PM, Planner, QS, Document Controller, and one Discipline Manager. This meeting is not optional — it is cheaper than restructuring in month four.
2. Agree the breakdown logic in this order: **phases → buildings/areas → levels → zones → disciplines → work packages.** Confirm what the QS will measure against and what the site will report against; if they differ, resolve now.
3. Open SCR-WBS-005 (Template Library). Select the template matching the project type; preview the resulting tree.
4. Apply the template to the project root (SCR-WBS-005 → Apply), mapping building segments (e.g. `B01`).
5. Refine manually in SCR-WBS-001: delete or add branches while nodes are still DRAFT and unlinked.
6. Confirm the deepest level is a **work package** that a QS can measure and a supervisor can report against. If a node cannot be measured, it is a container, not a work package.
7. Set the roll-up method per branch: `EQUAL_WEIGHT` until BOQ exists, then `COST_WEIGHTED` (SOP-WBS-10 revisits this).
8. Activate branches when stable (DRAFT → ACTIVE).
9. Record the workshop outcome in the project file.

**Decision point:** if no template fits within ~70%, build manually and afterwards save the result as a new template (SOP applies to Company Admin approval).
**Exceptions:** template application above 1,000 nodes is applied per phase.
**Records:** structure workshop minutes; template applied reference.
**Audit events:** `WBS.TEMPLATE.APPLIED`, `WBS.NODE.CREATED`, `WBS.NODE.STATUS_CHANGED`.

---

### SOP-WBS-02 — Defining and Approving the Coding Convention

**Purpose:** freeze a code structure that document numbering can depend on for the life of the project.
**Trigger:** immediately after SOP-WBS-01 step 2. **Responsible:** Document Controller (drafts), PM (approves), Company Admin (configures).

1. Draft the segment convention per node type: literal or masked, width, prefix (e.g. LEVEL `L{nn}`, ZONE `Z{n}`, WORK_PACKAGE manual mnemonics such as `SLAB`, `COL`).
2. Check the resulting full code against the document numbering pattern `P001-STR-DWG-B01-L05-001-R02` — the WBS must supply `B01-L05` cleanly.
3. Check against the client's or consultant's required numbering if the contract specifies one. Contractual numbering wins.
4. Configure in SCR-WBS-008; use the live preview column to confirm the next three generated codes.
5. PM approves in writing; DC files the convention sheet.
6. Create the first node of each type — this **locks** the generation mode. Verify before doing so.

**Exception:** mode change after lock requires Company Admin and is only possible before nodes acquire links.
**Records:** approved coding convention sheet.
**Audit events:** configuration change events (`CONFIG_CHANGE` class).

---

### SOP-WBS-03 — Bulk Importing a WBS

**Purpose:** load large repetitive structures without typing errors.
**Trigger:** availability of a room schedule, area schedule, or planner's WBS export. **Responsible:** Planner.

1. Download the import template (SCR-WBS-004). Columns: `parent_ref`, `node_type_code`, `wbs_code`, `node_name`, `discipline_code`, `rollup_method`, `sort_order`, optional attributes.
2. Populate. `parent_ref` may be an existing `full_code` or a row reference within the file.
3. Upload. Do not skip validation output even when it says zero errors — read the counts.
4. Review the **dry-run diff**: creates, updates, rejects. Confirm the create count matches the expected number (e.g. 400 rooms, not 412).
5. Spot-check five rows in the tree preview, including the first and last.
6. Commit. Record the batch number.
7. Verify in the tree: correct parents, correct codes, no unexpected depth.

**Decision point:** any reject rows → fix the file and re-run; never commit a partially correct file intending to fix it afterwards.
**Exception:** file above 5,000 rows must be split.
**Records:** import file, batch number, validation report.
**Audit events:** `WBS.IMPORT.STARTED / COMPLETED / FAILED`.

---

### SOP-WBS-04 — Pre-Baseline Structure Review and Four-Party Sign-Off

**Purpose:** the single control that prevents six months of downstream rework. **This is the most important procedure in this document.**
**Trigger:** structure complete and before Baseline R0 (and always before the first IPC). **Responsible:** PM (accountable); Planner, QS, Document Controller (each signs).

1. Planner issues the structure export (SCR-WBS-001 → Export) to the review parties.
2. **Planner confirms:** every scheduled activity maps to a work package; the depth supports look-ahead planning; no branch is so coarse that progress is unmeasurable.
3. **QS confirms:** every BOQ trade/section can be allocated to nodes; work packages are measurable units; the structure supports monthly valuation and cost reporting by location.
4. **Document Controller confirms:** code segments produce valid document numbers; no segment collides with the drawing register convention; the structure matches the drawing set organisation.
5. **Discipline Managers confirm:** their discipline branches are complete and correctly located.
6. **PM confirms:** the structure answers the five questions for every record — project, location, discipline, responsible, status.
7. All four sign the structure sign-off sheet. Unresolved comments are closed before signature, not after.
8. PM proceeds to SOP-WBS-05.

**Exception:** if any party cannot sign, the baseline is deferred. Do not baseline "provisionally" — a provisional baseline is an unbaselined structure with a false sense of control.
**Records:** structure sign-off sheet (Form WBS-F-01), export attachment.
**Audit events:** none at this step (governance record); the subsequent `WBS.BASELINE.SET` carries the sign-off reference.

---

### SOP-WBS-05 — Setting and Re-Setting the Structure Baseline

**Trigger:** completed SOP-WBS-04. **Responsible:** PM or Project Director.

1. Open SCR-WBS-006. Review the pre-baseline summary: node count, DRAFT node count.
2. Resolve DRAFT nodes — either activate them or accept them knowingly (they are baselined as DRAFT).
3. Enter the baseline label (`R0` for initial) and the sign-off reference.
4. Confirm. All live nodes become locked.
5. Notify the team: from this point every structural change needs a change request. Say this out loud in the next progress meeting; the first blocked move should not be a surprise.
6. Re-baselining (`R1`, `R2`) is reserved for major scope change (large variation, contract amendment, phase re-definition) and requires PD approval. Accumulated small changes are **not** grounds for a new baseline — that is what the diff is for.

**Records:** baseline register entry.
**Audit events:** `WBS.BASELINE.SET` (HIGH).

---

### SOP-WBS-06 — Raising and Processing a Post-Baseline Change Request

**Trigger:** a blocked structural action, or a known scope change. **Responsible:** raiser (any technical role), PM/PD (approver).

1. Raiser opens SCR-WBS-007 (or clicks **Raise Change Request** from the block dialog, which pre-fills the request).
2. Complete: change type, affected nodes, target, justification (minimum: what changed in the works and why the structure must follow), and the contractual reference (EI, VO, site instruction) where one exists.
3. Review the embedded impact preview before submitting. If the linked-record count surprises you, stop and investigate.
4. Submit. The request routes to the PM; if the PM is the raiser it routes to the PD.
5. Approver reviews: is the change justified, is the impact understood, does it need the QS's opinion (valuation continuity)? Consult the QS for any change affecting a node with measured work.
6. Approve (comment optional) or reject (comment mandatory, stating what would make it acceptable).
7. On approval the system applies the change and stamps the CR reference into the audit record.
8. Raiser verifies the result per SOP-WBS-07 steps 5–8.

**Exceptions:** no decision in 48 hours escalates to the PD automatically. If the approver leaves the project, the approval engine's fallback approver receives the request — the request never stalls silently.
**Records:** CR number, approval decision, applied timestamp.
**Audit events:** `WBS.CHANGE.RAISED / APPROVED / REJECTED`, plus the applied operation's event carrying the CR reference.

---

### SOP-WBS-07 — Executing a Node Move and Verifying Downstream Integrity

**Trigger:** approved need to relocate scope. **Responsible:** Planner.

1. Confirm authority: pre-baseline (proceed) or approved CR (proceed with CR reference).
2. In SCR-WBS-001, drag the node to the target, or use Actions → Move.
3. **Read the Impact Preview in full.** Confirm: node count, linked-record count by type, the code change examples, and who will be notified. If the counts do not match your expectation, cancel.
4. Confirm the move.
5. **Verify (mandatory, same day):**
   a. Open three moved descendants; confirm new full codes are correct.
   b. Open the Linked Records tab on the moved node; confirm the count is unchanged from the preview.
   c. Ask the Document Controller to resolve one previously issued document number against the old code — it must still resolve.
   d. Confirm roll-up recalculated on both the old and new parent chains (values refresh within 15 minutes).
6. Inform the site team and discipline managers in the next daily coordination — people navigate by memory, and the memory is now wrong.
7. If anything in step 5 fails, raise it immediately (RB-1/RB-4 in the deployment runbook). Do not attempt a corrective move.

**Records:** move audit entry; CR reference if applicable.
**Audit events:** `WBS.NODE.MOVED` (HIGH).

---

### SOP-WBS-08 — Handling a Blocked Deletion

**Trigger:** delete refused with linked records. **Responsible:** Planner (PM decides).

1. Read the block dialog: how many records, of which types.
2. Decide with the PM between three routes:
   - **Archive** — the work existed and its records must remain locatable. This is correct in most cases.
   - **Cancel** — the scope was formally removed (omission variation). Requires a CR and a variation reference; links must be reassigned or cancelled first.
   - **Reassign links then delete** — the node was created in error and its records belong elsewhere.
3. Never "empty" a node by deleting its records in order to delete the node. Records are evidence.
4. Execute the chosen route through the Impact Preview.
5. Record the decision and reason in the project file.

**Records:** decision note.
**Audit events:** `WBS.NODE.DELETE_BLOCKED`, then `WBS.NODE.ARCHIVED` / `WBS.NODE.STATUS_CHANGED` / `WBS.NODE.DELETED`.

---

### SOP-WBS-09 — Assigning and Transferring Node Responsibility

**Trigger:** mobilisation, personnel change, subcontractor engagement. **Responsible:** Discipline Manager or PM.

1. Identify the branch level at which ownership is meaningful — usually building or level for area engineers, discipline node for discipline leads.
2. Assign in SCR-WBS-002 → Responsibility tab, with discipline and validity start date.
3. Confirm the assignee is an active project team member; if not, add them via Project Setup first.
4. On transfer, end-date the previous assignment rather than deleting it — the history explains who answered which RFI.
5. Review unassigned ACTIVE branches monthly (see SOP-WBS-14 step 4).

**Records:** responsibility register (system).
**Audit events:** `WBS.RESPONSIBILITY.ASSIGNED`.

---

### SOP-WBS-10 — Monthly Roll-Up Verification Before IPC Preparation

**Purpose:** ensure the valuation is computed against a structure and a set of numbers that can be defended. **Trigger:** 3 working days before IPC cut-off. **Responsible:** QS (PM accountable). **Frequency:** monthly.

1. Confirm the structure has not changed shape this period without a CR: open SCR-WBS-006 diff (baseline vs live) and review every entry. Any change without a CR reference is an incident — stop and escalate.
2. Confirm roll-up methods are appropriate: any branch still on `EQUAL_WEIGHT` after BOQ loading should move to `COST_WEIGHTED`. Correct before valuing.
3. Open SCR-WBS-009 (Override Exception Report). For every override: is it still justified? Overrides older than 14 days must be cleared or re-justified in writing.
4. Spot-check three branches using the Roll-Up tab contribution table — confirm the parent number is arithmetically explained by its children.
5. Confirm no roll-up displayed is stale (>15 minutes). Trigger recalculation if needed and re-check.
6. Confirm CANCELLED nodes are genuinely descoped and excluded, and ON_HOLD nodes are genuinely still in scope and included.
7. Capture the period snapshot (automatic on the 1st; verify it ran).
8. Attach the baseline diff export to the IPC submission as structural evidence.

**Decision point:** if steps 1 or 3 raise doubt, the IPC is prepared against the snapshot and the discrepancy is disclosed — never quietly adjusted.
**Records:** verification checklist, snapshot reference, diff export.
**Audit events:** export events; any `WBS.ROLLUP.RECALCULATED`.

---

### SOP-WBS-11 — Applying and Justifying a Manual Progress Override

**Purpose:** allow a genuine exception without destroying the integrity of derived reporting.
**Trigger:** derived progress is demonstrably wrong and the underlying data cannot be corrected in time. **Responsible:** PM or PD only.

1. First attempt to fix the cause: missing task updates, unmeasured work, wrong roll-up method. **An override is the last resort, not the fast route.**
2. If overriding, open SCR-WBS-002 → Roll-Up → Override.
3. Enter the value, select a reason code (`DATA_LAG`, `MEASUREMENT_PENDING`, `SYSTEM_CORRECTION`, `CLIENT_AGREED_ASSESSMENT`), and write a comment stating the evidence.
4. Confirm, understanding that the node is flagged in every report and export until cleared.
5. Fix the underlying data within 5 working days and remove the override.
6. Any override still open at month end is reviewed by the PD and disclosed to the QS before it influences an IPC.

**Records:** override entry with reason; PD monthly review note.
**Audit events:** `WBS.PROGRESS.OVERRIDDEN` (HIGH).

---

### SOP-WBS-12 — Closing a WBS Branch at Phase or Building Completion

**Trigger:** physical completion of a level, zone, building, or phase. **Responsible:** Discipline Manager (prepares), PM (approves).

1. Confirm all descendants are COMPLETED, CLOSED, or CANCELLED.
2. Confirm roll-up shows 100% (tolerance 0.5%) — investigate any gap before proceeding.
3. Set the branch to COMPLETED.
4. Before CLOSED, clear the closure gates: no open tasks, no open NCRs, no unapproved documents linked to the branch. The system will list blockers.
5. Obtain QA/QC sign-off and record its reference.
6. Set CLOSED. Confirm no further links can be created against the branch.
7. Notify procurement and store that material issues to this location are now blocked.

**Exception:** re-opening a CLOSED branch for rework requires a change request.
**Records:** QA sign-off reference.
**Audit events:** `WBS.NODE.STATUS_CHANGED`, `WBS.NODE.STATUS_CASCADED`.

---

### SOP-WBS-13 — Archiving the WBS at Project Closure and Handover

**Trigger:** practical completion and handover of the works. **Responsible:** PM.

1. Confirm all branches are CLOSED or CANCELLED.
2. Confirm the final baseline diff is exported and filed with the final account documentation.
3. Export the full structure (with codes, paths, final progress, and cost where permitted) to the project archive.
4. Confirm the as-built document register resolves against current and historical codes.
5. Archive the structure with cascade; confirm the affected node count matches expectation.
6. Confirm retention: the structure and its audit history are retained for project duration + DLP + 5 years minimum — never purge during DLP.
7. Hand the structure export to the Facility Management handover package where the contract requires it.

**Records:** archive export, retention register entry.
**Audit events:** `WBS.NODE.ARCHIVED`, `WBS.NODE.STATUS_CASCADED`, export events.

---

### SOP-WBS-14 — Periodic Tree Integrity and Orphan Review

**Trigger:** monthly, and after any bulk operation. **Responsible:** Company Admin (with PM for project findings). **Frequency:** monthly.

1. Open SCR-WBS-010 (Integrity & Orphan Report).
2. Review: orphan nodes, closure inconsistencies, code mismatches, unregistered links, zero-budget children under cost-weighted parents.
3. Any orphan or closure inconsistency is escalated immediately to the platform team (deployment runbook RB-1/RB-4) — these are not user-fixable.
4. Review unassigned ACTIVE branches and refer to SOP-WBS-09.
5. Review overrides older than 14 days and refer to SOP-WBS-11.
6. Review structures showing excessive depth (>9 levels) or breadth (>200 siblings) and discuss simplification with the Planner.
7. File the report; a clean report is still filed — the record of checking matters in an audit.

**Records:** monthly integrity report.
**Audit events:** report generation/export events.

---

## 5. Governance Calendar

| When | Activity |
|---|---|
| At award | SOP-01, SOP-02 |
| Before first IPC | SOP-04, SOP-05 |
| Weekly | Structure changes reviewed in progress meeting; unassigned branches checked |
| Monthly (T-3 days to IPC cut-off) | SOP-10 |
| Monthly (month end) | SOP-14; override review by PD |
| At each milestone | SOP-12 |
| On change | SOP-06, SOP-07, SOP-08, SOP-09 |
| At handover | SOP-13 |

## 6. Compliance and Audit Evidence

| Auditor question | Where the answer lives |
|---|---|
| "Is the structure controlled?" | Baseline register + sign-off sheet (SOP-04/05) |
| "Did the structure change since last valuation?" | Baseline diff export (SOP-10 step 1) |
| "Who authorised this change?" | Change request + `WBS.CHANGE.APPROVED` audit |
| "How was this progress figure derived?" | Roll-up contribution table + override report |
| "Why is this document number no longer in the tree?" | Historical code resolution (`previous_full_code`) |
| "Who was responsible for this area in March?" | Responsibility history |
| "Was anything deleted?" | Audit trail; nodes are soft-deleted and never purged |

## 7. Escalation Matrix

| Situation | First | Then | Finally |
|---|---|---|---|
| Blocked structural action | Planner → PM | PM → PD (CR) | — |
| CR not decided in 48 h | Auto-escalation to PD | PD decision | Company Admin |
| Roll-up disputed before IPC | QS → PM | PM → PD | Client disclosure |
| Override unresolved >14 days | PM → PD | PD monthly review | Disclosed in IPC |
| Integrity/orphan finding | Company Admin → platform team | Incident runbook RB-1/RB-4 | Tenant notification if data affected |
| Suspected bypass of baseline lock | Company Admin | Security review | Director |

## 8. Forms and Templates

**Form WBS-F-01 — Structure Sign-Off Sheet:** project, baseline label, node count, export reference, four signature blocks (Planner / QS / Document Controller / PM) each with "confirmed for my discipline's needs" and a comments box, date.

**Form WBS-F-02 — WBS Change Request:** CR number, date, raiser, change type, affected nodes (code and name), proposed change, justification, contractual reference (EI/VO/SI), impact summary (nodes, linked records), QS consulted (Y/N), approver decision, comment, applied date.

**Form WBS-F-03 — Import Template (column layout):**

| Column | Required | Notes |
|---|---|---|
| `parent_ref` | Yes | Existing `full_code` or in-file row reference |
| `node_type_code` | Yes | From the canonical type list |
| `wbs_code` | Conditional | Required when generation mode is MANUAL |
| `node_name` | Yes | Max 120 characters |
| `discipline_code` | No | ARC / STR / MEP / CIVIL / EXT |
| `rollup_method` | No | Defaults to parent's method |
| `sort_order` | No | Defaults to file order |
| `attr_*` | No | One column per attribute, e.g. `attr_area_m2` |

## 9. Change Log

| Version | Date | Change |
|---|---|---|
| R1 | 2026-08-08 | Initial issue |

**End of Document**
