# DCOS — WBS Management Module
## 12 — Training Guide

| Field | Detail |
|---|---|
| Document Code | DCOS-WBS-TRN-001 |
| Version | R1 |
| Module | 04-03 — WBS Management |
| Author Persona | Construction Operations Consultant + Technical Trainer |
| Status | Issued for Use |
| Base References | DCOS-WBS-UC-001, -UX-001, -SOP-001 |

---

## 1. Training Objectives and Audience

By the end of training, each participant can navigate the structure confidently, understands why parent progress is calculated rather than typed, and knows which actions require approval and why.

| Audience | Prior knowledge assumed |
|---|---|
| Project Managers, Directors | Construction management; no software background assumed |
| Planners | Programme software (Primavera/MS Project) |
| QS / Cost Engineers | BOQ, measurement, IPC preparation |
| Document Controllers | Drawing numbering and transmittals |
| Site Engineers, Supervisors | Smartphone use; limited desktop time |
| Company Admins | DCOS platform administration |

Delivery: classroom for core concepts, hands-on in a sandbox project ("Tower A Training"), then supervised live use for the first two weeks.

## 2. Core Concepts Module (60 minutes — everyone attends first)

**2.1 What a WBS is here.** Not a folder tree. It is the addressing system for the whole project: every task, drawing, cost, inspection, photo, and payment line has a location in it. When someone asks "how is Level 05 doing?", DCOS can only answer because Level 05 is a real object with real records attached.

**2.2 Why one structure.** Today the planner, the QS, the document controller, and the site team each keep their own version of the same building. Four versions means four answers to every question and an afternoon of Excel reconciliation each month. One structure means one answer.

**2.3 Why Task is not part of the tree.** Tasks attach to the tree; they are not branches of it. A 20-storey tower has perhaps 5,000 locations and 80,000 tasks. Keeping tasks out of the structure keeps the tree fast, stable, and baselineable. You will still see your tasks under the location — that is the screen joining them, not the structure carrying them.

**2.4 Why parent progress is calculated, not typed.** This is the one that changes behaviour. In DCOS you cannot type "Level 05 is 60%". Level 05 is whatever its zones add up to, weighted by cost (usually). If the number looks wrong, the fix is in the work packages, not in the summary. There is an override, it is permissioned, it is flagged everywhere, and it appears on a report the Project Director reads.

**2.5 Why the structure gets locked.** Once baselined, moving or re-coding needs an approved change request. Reason: the QS values work against the structure every month. If the shape changes quietly, last month's valuation cannot be reconciled to this month's, and the consultant will say so.

**2.6 Reading a WBS code** — the skill that makes the system navigable:

```
P001 - PH2 - B01 - L05 - Z03 - STR - SLAB
 │      │     │     │     │     │     └── work package: the slab
 │      │     │     │     │     └──────── discipline: structural
 │      │     │     │     └────────────── zone 03 (east wing)
 │      │     │     └──────────────────── level 05
 │      │     └────────────────────────── building 01 (Tower A)
 │      └──────────────────────────────── phase 2 (superstructure)
 └─────────────────────────────────────── project P001
```

Read it right to left when you want to know *what*; left to right when you want to know *where*. Every document number on this project carries the middle segments — that is why codes cannot change casually.

## 3. Role-Based Training Paths

| Track | Duration | Prerequisites | Content | Assessment |
|---|---|---|---|---|
| **T1 — Project Manager / Director** | 3 h | Core Concepts | Structure governance, reading the tree in all six modes, impact previews, baseline setting, approving change requests, override discipline, closure gates, monthly review duties (SOP-10/11/14) | Quiz + practical: approve a CR, apply and clear an override with justification |
| **T2 — Planner / Scheduler** | 4 h | Core Concepts | Breakdown design, node types and structure rules, code segments, templates, import wizard, duplicate for typical floors, move and verification (SOP-07), baseline preparation | Practical: build Tower A to baseline-ready in the sandbox |
| **T3 — QS / Cost Engineer** | 3 h | Core Concepts | Nodes as cost containers, all five roll-up methods on paper then on screen, contribution table, cost mode, baseline diff, monthly verification before IPC (SOP-10), override report | Practical: verify a month's roll-up and produce the diff export |
| **T4 — Document Controller** | 2 h | Core Concepts | Code segments and numbering integration, configuring masks, immutability rules, historical code resolution, transmittal implications of moves | Practical: resolve three pre-change document numbers |
| **T5 — Site Engineer / Supervisor** | 1.5 h | Core Concepts | Navigation and search, reading codes, node detail, reporting against locations, mobile offline use, what to do when a location has moved | Practical: locate a node offline and raise a daily report against it |
| **T6 — Company Admin** | 3 h | Core Concepts + platform admin | Node types, structure rules, template library governance, tenant defaults, integrity report, scope grants, what admins deliberately cannot do (baseline, approve CRs, override) | Quiz + practical: publish a template, investigate an integrity finding |

## 4. Module Walkthrough

### 4.1 The WBS Tree Workspace
[SCREENSHOT: SCR-WBS-001 — tree panel with Tower A expanded to Zone 03]

**What you see:** the tree on the left with code, name, and a progress bar per row; the node you selected on the right; a mode selector at top ("Structure / Progress / Cost / Responsibility / Status / Baseline diff"); a baseline chip showing the lock state.
**What you do:** click to select, use the chevron or arrow keys to expand, type in the search box to jump anywhere.
**What happens next:** selecting a node loads its detail panel; nothing you click here changes data until you use an action.

**Tip for large trees:** stop expanding and start searching. On a 5,000-node project, search is faster than any amount of clicking.

### 4.2 The Node Detail Panel
[SCREENSHOT: SCR-WBS-002 — Roll-Up tab showing the contribution table]

**What you see:** six tabs. Overview (identity and status), Attributes, Linked Records (what is attached — this is what blocks deletion), Responsibility, Roll-Up, History.
**What you do:** the Roll-Up tab is where you learn to trust the number: the contribution table shows each child, its value, its weight, and what it contributed.
**What happens next:** if the parent number looks wrong, the table tells you which child is responsible. Fix that child.

### 4.3 The Impact Preview
[SCREENSHOT: SCR-WBS-003 — move preview showing 9 nodes and 46 linked records]

**What you see:** exactly what your action will touch — nodes, linked records by type, code changes, who gets notified, and the audit severity.
**What you do:** read it. All of it. Then confirm or cancel.
**What happens next:** nothing runs until you confirm. If the counts surprise you, that surprise is the point — cancel and investigate.

### 4.4 The Import Wizard
[SCREENSHOT: SCR-WBS-004 — dry-run diff showing 400 creates, 12 updates, 0 rejects]
Four steps: Upload → Validate → Review diff → Commit. The diff is not a formality; it is the last moment before 400 nodes exist.

### 4.5 Baselines and Change Requests
[SCREENSHOT: SCR-WBS-006 — diff view showing one moved node with its CR reference]
[SCREENSHOT: SCR-WBS-007 — change request form with embedded impact preview]

### 4.6 Override Exception Report
[SCREENSHOT: SCR-WBS-009 — override list with age column]
Every override, who applied it, why, and how old. If your name is here for two weeks, expect a conversation.

## 5. Hands-On Exercises (sandbox project "Tower A Training")

| # | Exercise | Track | Success criteria |
|---|---|---|---|
| E-01 | Apply the Tower template and refine Level 05 with zones, disciplines, and three work packages | T2 | Structure valid, no rule violations, codes follow the convention |
| E-02 | Configure code segments so levels generate as L01…L20 | T2, T4, T6 | Preview shows L06 as the next code |
| E-03 | Import 40 rooms from the provided file; then import the deliberately corrupted file | T2 | First commits cleanly; second is rejected and you can explain both errors |
| E-04 | Roll back the room import | T2 | Tree returns to the pre-import state; you can state why rollback was allowed |
| E-05 | Duplicate Level 05 to Levels 06–10 | T2 | 5 new levels, correct codes, all DRAFT, no progress copied |
| E-06 | Assign yourself as responsible for the MEP branch, then transfer it to a colleague | T2, T6 | History shows both assignments; the previous one is end-dated, not deleted |
| E-07 | Calculate on paper what Zone 03 should be, using COST_WEIGHTED, with the given child values; then check the system | T1, T3 | Your figure matches 66.0%; you can explain the weighting |
| E-08 | Recalculate the same zone as EQUAL_WEIGHT and explain to a colleague why the number changed from 66% to 50% | T3 | Explanation names the weighting, not "the system changed it" |
| E-09 | Try to delete Zone 03 (which has linked records) and choose the right alternative | T1, T2 | Deletion blocked; archive chosen; you can justify the choice |
| E-10 | Set Baseline R0, then attempt to move a node | T1, T2 | Move blocked; you raise a CR from the block dialog |
| E-11 | As PM, approve the CR and verify the move afterwards (SOP-WBS-07 step 5) | T1 | Codes updated, links intact, old document number still resolves |
| E-12 | Apply an override with reason `DATA_LAG`, find it on the exception report, then clear it | T1 | Node flagged while active; value returns to derived after clearing |
| E-13 | Produce a baseline diff and explain each entry to a "consultant" (the trainer) | T3 | Every change accounted for, moved entry linked to its CR |
| E-14 | On mobile, offline, find Zone 03 and raise a daily report against it | T5 | Report queued; syncs on reconnect; you can read the code aloud correctly |
| E-15 | Attempt to close Level 05 while an NCR is open | T1, T3 | Closure blocked; you identify the blocking NCR |

## 6. Common Mistakes and How to Avoid Them

| Mistake | Why it happens | Avoid it by |
|---|---|---|
| Building the tree for one department | The planner builds it alone in week one | Run the SOP-WBS-01 workshop; four parties sign off before baseline |
| Coding the discipline at the wrong level | Copying a drawing-number convention blindly | Decide once in SOP-WBS-02 and check a full code end to end |
| Work packages too coarse to measure | "Level 05 Structure" as a single package | Ask the QS: can you measure this monthly? If not, split it |
| Deleting instead of archiving | Delete feels tidy | Remember: records are evidence. Archive keeps them locatable |
| Overriding instead of fixing | Deadline pressure | Fix the leaf data; use override only as a last resort and clear it within 5 days |
| Restructuring after baseline without a CR | "It's just a small change" | It is never just a small change once a valuation exists |
| Importing without reading the dry run | The file looked fine in Excel | 400 wrong nodes take 30 seconds to create and a day to unpick |
| Storing codes in other systems | Codes are readable, so people copy them | Reference locations by the system link, not by typed code — codes can change by CR |
| Expanding the whole tree to find something | Habit from file explorers | Use search; it is scoped and instant |
| Assuming a stale number is current | Numbers look authoritative | Check the age shown next to the value before quoting it |

## 7. Quick Reference Cards (one page each, printable)

**QRC-1 — Reading a WBS code** (the diagram in §2.6 with a blank example to annotate).

**QRC-2 — Before you move a node (SOP-WBS-07):** authority? → preview read? → confirm → verify three descendants, link count, one document number, both roll-up chains → tell the site team.

**QRC-3 — Blocked deletion (SOP-WBS-08):** Archive (work existed) · Cancel (scope removed, needs CR + VO) · Reassign then delete (created in error). Never delete records to free a node.

**QRC-4 — Monthly roll-up check before IPC (SOP-WBS-10):** diff vs baseline → methods correct → overrides reviewed → three branches spot-checked → nothing stale → cancelled/on-hold correct → snapshot taken → diff attached.

**QRC-5 — Raising a change request (SOP-WBS-06):** what changed in the works · why the structure must follow · contractual reference · impact preview read · QS consulted if measured work is affected.

**QRC-6 — Roll-up methods in one line each:** EQUAL_WEIGHT (simple average — early planning only) · COST_WEIGHTED (weighted by budget — the default once BOQ exists) · DURATION_WEIGHTED (weighted by planned days) · QUANTITY_WEIGHTED (weighted by measured quantities — repetitive work) · MANUAL_OVERRIDE (typed, flagged, temporary).

**QRC-7 — Status meanings:** DRAFT (being built) · ACTIVE (live) · ON_HOLD (suspended, still in scope) · COMPLETED (physically done) · CLOSED (gates passed, locked) · CANCELLED (descoped, out of the calculation) · ARCHIVED (history).

## 8. Assessment

### Quiz (20 questions — pass mark 16)

1. Where do tasks live in relation to the WBS? *(Attached to nodes, not part of the tree.)*
2. Who can type a progress figure directly onto a Level node? *(Nobody by normal means; PM/PD only via a flagged, reason-coded override.)*
3. In `P001-PH2-B01-L05-Z03-STR-SLAB`, which segment is the discipline? *(STR.)*
4. What happens to old document numbers when a level is re-coded? *(The old full code is retained and still resolves to the node.)*
5. Name the four parties who sign off the structure before baseline. *(Planner, QS, Document Controller, PM.)*
6. What does the system do when you try to delete a node with 34 documents attached? *(Blocks it, shows the counts, offers Archive or Reassign.)*
7. Which is correct after baseline: move the node then tell the PM, or raise a CR? *(Raise a CR.)*
8. Can the person who raises a change request approve it? *(No.)*
9. Zone has two children: 70% weighted $180k and 30% weighted $20k. COST_WEIGHTED result? *(66%.)*
10. Same children, EQUAL_WEIGHT? *(50%.)*
11. Are CANCELLED nodes included in a parent's roll-up? *(No — excluded entirely.)*
12. Are ON_HOLD nodes included? *(Yes — suspended work is still scope.)*
13. What must be true before a branch can go from COMPLETED to CLOSED? *(No open tasks, no open NCRs, no unapproved documents; QA sign-off recorded.)*
14. A roll-up value shows "· 42 min old". What should you do before quoting it? *(Trigger recalculation and re-check; do not quote stale numbers.)*
15. What is the maximum depth of the structure? *(12 levels including the root.)*
16. Why can't you drag nodes on the mobile app? *(Structure editing is disabled on mobile by design — a mis-drag in the field is expensive.)*
17. A subcontractor is granted Zone 03. What do they see above it? *(Ancestors as non-expandable context only.)*
18. What does the Linked Records tab tell you? *(What is attached to the node — and therefore what blocks deletion.)*
19. Two planners move nodes in the same subtree at once. What happens? *(The second is refused with a conflict message naming the winning operation; nothing is silently merged.)*
20. Where would an auditor find proof that the structure did not change during a valuation period? *(The baseline diff export, plus the change request records.)*

### Practical Assessment Rubric

| Criterion | Competent | Needs more practice |
|---|---|---|
| Navigation | Finds any node in under 20 s using search | Expands the whole tree hunting |
| Reading codes | Reads a full code aloud correctly | Confuses level and zone segments |
| Roll-up understanding | Explains a parent value from its contribution table | Says "the system calculated it" |
| Destructive actions | Reads the impact preview before confirming | Confirms immediately |
| Change control | Raises a CR with a real justification and reference | Asks an admin to "just unlock it" |
| Override discipline | Uses it as a last resort with evidence, clears it | Uses it to make a report look right |

## 9. Glossary

| Term | Meaning |
|---|---|
| WBS | Work Breakdown Structure — the project's addressing system |
| Node | One location or container in the structure |
| Work package | The lowest structural level; a measurable unit of work |
| Control account | A branch node marked as a performance measurement point for EVM |
| Roll-up | Calculating a parent's value from its children |
| Weighting | How much each child counts toward the parent (by cost, duration, or quantity) |
| Override | A manually entered progress value, permissioned and flagged |
| Baseline | A frozen snapshot of the structure used for comparison and change control |
| Change request (CR) | The approved route to change a baselined structure |
| Link | A record (task, document, cost line, inspection) attached to a node |
| Archive | Removing a branch from active views while keeping all history |
| Cancelled | Scope formally removed, usually by omission variation; excluded from calculations |
| Full code | The complete dash-separated code path, unique in the project |
| Stale | A calculated value that has not been refreshed recently |
| IPC | Interim Payment Certificate — the monthly claim to the client |
| DLP | Defects Liability Period |
| Practical completion | The contractual milestone at which the works are handed over |
| Re-measurement | Measuring completed quantities against the BOQ for valuation |

## 10. Change Log

| Version | Date | Change |
|---|---|---|
| R1 | 2026-08-08 | Initial issue |

**End of Document**
