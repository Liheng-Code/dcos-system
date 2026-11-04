# DCOS — WBS Management Module
## 06 — UI / UX Design

| Field | Detail |
|---|---|
| Document Code | DCOS-WBS-UX-001 |
| Version | R1 |
| Module | 04-03 — WBS Management |
| Author Persona | Enterprise SaaS Designer + Construction Operations Consultant |
| Status | Issued for Review |
| Base References | DCOS-WBS-FS-001, DCOS-WBS-RBAC-001, R0 §26 |

---

## 1. Design Principles

1. **The tree is furniture, not a destination.** The WBS panel is persistently docked on the left of every project workspace (R0 §26.2); WBS Management screens add editing capability to the same panel rather than a separate app.
2. **Destructive actions are always previewed.** No move, delete, cascade, or cancel executes without the Impact Preview Modal.
3. **Data-dense but readable.** Node rows carry code, name, status, progress, and up to two badges — no more.
4. **Numbers declare their age.** Any roll-up older than 15 minutes shows how old it is.
5. **Blocked ≠ dead end.** Every block offers the legitimate route (Archive instead of Delete, Raise CR instead of Move).
6. **Bilingual-ready.** All labels externalised; Khmer/English toggle; codes never translated.

## 2. Information Architecture

```
Top nav: Dashboard · Projects · WBS/Task Workspace ▸ · Design · Procurement · …
                                       │
        ┌──────────────────────────────┴───────────────────────────────┐
        │  Left: WBS Tree Panel (persistent)   Main: context content    │
        │  WBS Management adds: edit mode, import, templates,           │
        │  baselines, change requests, segment config, reports          │
        └───────────────────────────────────────────────────────────────┘
```

Entry points: project workspace (tree panel → "Manage structure"), Admin → WBS Configuration (types, rules, templates), Reports → WBS Override / Integrity.

## 3. Screen Inventory

| ID | Screen | FRs | Key permissions |
|---|---|---|---|
| SCR-WBS-001 | WBS Tree Workspace | 002,005,006,012,014,021,042,043 | VIEW_TREE, CREATE/EDIT/MOVE_NODE |
| SCR-WBS-002 | Node Detail Panel (6 tabs) | 005,031–037,048 | VIEW_NODE, EDIT_NODE, VIEW_COST_ROLLUP |
| SCR-WBS-003 | Impact Preview Modal | 013,016,024,025 | contextual |
| SCR-WBS-004 | Import Wizard | 017,018 | BULK_IMPORT, ROLLBACK_IMPORT |
| SCR-WBS-005 | Template Library | 020 | APPLY/MANAGE_TEMPLATE |
| SCR-WBS-006 | Baseline Manager & Diff | 027,030 | SET_BASELINE, VIEW_TREE |
| SCR-WBS-007 | Change Request Form & Queue | 029 | RAISE/APPROVE_CHANGE |
| SCR-WBS-008 | Code Segment Configuration | 007 | CONFIGURE_RULES |
| SCR-WBS-009 | Override Exception Report | 035,044 | VIEW_TREE (+PM/PD scope) |
| SCR-WBS-010 | Integrity & Orphan Report | 045 | CONFIGURE_RULES |

## 4. Screen Specifications

### SCR-WBS-001 — WBS Tree Workspace

**Purpose:** navigate, search, and (with permission) build the structure.

```
┌─ Project: Tower A (P001) ──────────── [Mode: Structure ▾] [Baseline R0 🔒] [⋯] ┐
│ ┌── Tree Panel (380px) ─────────────┐ ┌── Node Detail / Content ─────────────┐ │
│ │ 🔍 search code or name…           │ │  P001-PH2-B01-L05-Z03  Zone 03 (East)│ │
│ │ ─────────────────────────────────  │ │  [Overview][Attrs][Links][Resp]…     │ │
│ │ ▾ P001 Tower A            ▓ 42%   │ │                                      │ │
│ │   ▾ PH2 Superstructure    ▓ 51%   │ │  Status  ACTIVE     Type ZONE        │ │
│ │     ▾ B01 Tower A         ▓ 48%   │ │  Roll-up 66.0% (COST_WEIGHTED)       │ │
│ │       ▾ L05 Level 05      ▓ 62%   │ │  Updated 4 min ago                   │ │
│ │         ▸ Z03 Zone 03 ⚑   ▓ 66%   │ │  Responsible  Sokha (Area Engineer)  │ │
│ │         ▸ Z04 Zone 04  ⛔ CANCELLED │ │  Linked  34 documents · 12 tasks     │ │
│ │       ▸ L06 Level 06      ▓ 12%   │ │                                      │ │
│ │ [+ Child] [⇅ Reorder] [⋯ Actions] │ │  [Edit] [Change status] [Raise CR]   │ │
│ └───────────────────────────────────┘ └──────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Components:** virtualised tree rows (code · name · progress bar · status chip · badges), search box, mode selector, breadcrumb bar, action toolbar, node detail region.

**States**

| State | Treatment |
|---|---|
| Loading | Skeleton rows at 3 levels; search disabled; no spinner over the whole page |
| Empty (new project) | Root only + primary CTA "Apply a template" / secondary "Build manually" / tertiary "Import from file" |
| Node with 0 children | Chevron hidden; "+ Child" available if type permits |
| Error | Inline banner with retry; last successful tree retained on screen, marked "may be out of date" |
| No permission | Node rows outside scope simply absent; ancestors shown greyed, chevron disabled, tooltip "Outside your access — shown for context" |
| Partial data (stale roll-up) | Progress values in amber with "· 22 min old" suffix |
| Offline (mobile/web PWA) | Banner "Offline — showing cached structure from 07:12"; edit actions hidden |
| Large tree (>500 nodes) | Lazy expansion; "Load 200 more" at breadth cut-off; search becomes the primary navigation affordance |

### SCR-WBS-002 — Node Detail Panel

Tabs and content:

| Tab | Content |
|---|---|
| Overview | code, full code, path, type, status, discipline, rollup method + computed value + age, planned dates ("from Programme — read only"), baseline lock chip, responsible summary |
| Attributes | typed key/value list (area m², elevation, grid ref, IFC GUID), inline add/edit |
| Linked Records | grouped counts by entity type with drill-through; this is what the delete guard sees |
| Responsibility | current + history, assign/transfer, discipline column |
| Roll-Up | method selector, child contribution table (child · method · value · weight · contribution), override control with reason picker |
| History | audit timeline for this node: created, renamed, moved (with CR ref), status changes, override applied/removed |

The Roll-Up tab's contribution table is the anti-lying device: it shows exactly how the parent number was produced.

```
Child            Method            Value   Weight(budget)  Contribution
STR              COST_WEIGHTED     70.0%   $180,000        63.0%
MEP              EQUAL_WEIGHT      30.0%   $ 20,000         3.0%
                                          ────────────────────────
Zone 03 (COST_WEIGHTED)                    $200,000        66.0%
```

### SCR-WBS-003 — Impact Preview Modal (the critical component)

Shown before **every** move, delete, cascade, cancel, archive, template apply over 50 nodes, and import commit.

```
┌ Move "Zone 03 (East Wing)" to "Level 06" ───────────────────────────┐
│ This affects:                                                       │
│   9 nodes will move        46 linked records follow                 │
│      · 34 documents  · 12 tasks                                     │
│   3 responsibility assignments move with the subtree                │
│                                                                     │
│ Codes will change:                                                  │
│   P001-PH2-B01-L05-Z03-STR-SLAB → P001-PH2-B01-L06-Z03-STR-SLAB     │
│   …and 8 more   [show all]                                          │
│   Old codes remain searchable for document retrieval.               │
│                                                                     │
│ Roll-up recalculates: Level 05 chain and Level 06 chain             │
│ Notifications: PM, Discipline Manager, Document Controller, Sokha   │
│                                                                     │
│ ⚠ This action is audited as HIGH severity.                          │
│                    [Cancel]                    [Confirm move]       │
└─────────────────────────────────────────────────────────────────────┘
```

Rules: counts are live (computed <1.5 s); if computation fails the action is refused, never confirmed blind; confirm button disabled until counts load.

### SCR-WBS-004 — Import Wizard

Four steps with a persistent stepper: **Upload → Validate → Review diff → Commit**.

- Upload: template download link, drag zone, row limit stated (5,000).
- Validate: progress bar with row counter; on failure, a scrollable error table (row · column · message) plus "Download annotated file".
- Review diff: three tabs — Create (400) · Update (12) · Reject (0) — with tree preview of where nodes land.
- Commit: Impact Preview → apply → success panel with batch number and a **Roll back** button (visible for 7 days per C7).

States: uploading, validating (cancellable), validation_failed, validated, committing (non-cancellable, progress), committed, commit_failed (auto-reverted banner).

### SCR-WBS-005 — Template Library

Card grid by project type; each card shows node count, depth, disciplines, last used, version. Actions: Preview (read-only tree), Apply (target node picker + segment mapping), Save current subtree as template, Publish/Unpublish.

### SCR-WBS-006 — Baseline Manager & Diff Viewer

Left: baseline list (R0, R1…) with set date, setter, node count, current chip. Right: diff between any two selections (or baseline vs live).

```
Compare: Baseline R0 (30 Jun 2026)  ⇄  Live structure
 + Added      14   ▸ fit-out rooms L21–L24
 ~ Renamed     2
 ↷ Moved       1   Z03: L05 → L06        CR-WBS-0009  approved 21 Jul  PM Dara
 # Re-coded    1   L05 → L05A            CR-WBS-0011
 − Removed     0
                                            [Export diff (PDF/XLSX)]
```

Colour/iconography distinct per change class; every moved/re-coded row links to its CR.

### SCR-WBS-007 — Change Request Form & Queue

Form: change type, affected nodes (picker, multi), target/new value, justification (mandatory, min 20 chars), supporting reference (EI/VO number), embedded impact preview, submit.
Queue: filter by status/type/raiser; approver view shows impact preview inline plus baseline context; Approve requires comment optional, Reject requires comment mandatory. Escalation badge after 48 h.

### SCR-WBS-008 — Code Segment Configuration

Table per node type: generation mode, mask, prefix, next sequence, reuse gaps, lock state. Live preview column showing the next three codes that would be produced. Locked rows show a padlock with "12 Level nodes exist — mode locked".

### SCR-WBS-009 — Override Exception Report

Table: node, path, override value, derived value (what it would be), difference, reason code, applied by, applied at, age. Sort default by age descending. Row action: open node / remove override. Export permitted to PM/PD/QS.

### SCR-WBS-010 — Integrity & Orphan Report

Sections: orphan nodes, closure inconsistencies, full_code mismatches, is_leaf mismatches, unregistered links (by module), zero-budget children under COST_WEIGHTED parents. Each with count, last checked, and a Repair action (admin only) that runs the documented fix and audits it.

## 5. Interaction Specifications

### 5.1 Drag-and-drop move
- Drag handle on row hover; only rendered with `WBS.MOVE_NODE` and when not baseline-locked (locked rows show a padlock and a "Raise CR" affordance instead).
- On drag, valid drop targets highlight green, invalid grey; hovering an invalid target shows the reason inline: *"Room cannot contain a Zone"*, *"Cannot move into its own subtree"*, *"L06 already has a Z03"*, *"Depth limit reached"*.
- Drop opens SCR-WBS-003. Nothing commits on drop alone.
- Auto-scroll at panel edges; ESC cancels; keyboard alternative: select node → `Ctrl+X`, select target → `Ctrl+V` → same modal.

### 5.2 Lazy loading and virtualisation
- Initial fetch: 3 levels. Expanding fetches children (page 200). Row virtualisation keeps DOM under ~120 rows regardless of tree size.
- Search bypasses the tree: results list shows full path; selecting a result auto-expands the ancestor chain only.

### 5.3 Inline rename
- Double-click name → inline edit; code shown adjacent, greyed with a padlock when immutable, tooltip stating why ("34 linked records" or "Baseline R0").
- Rename saves on Enter, shows a subtle toast when >20 descendant paths were re-materialised.

### 5.4 Multi-select and bulk actions
- Shift/Ctrl selection within one parent only (cross-parent bulk mutation is refused by design — it hides intent).
- Bulk actions: status change, reorder, assign responsibility, export selection. All route through Impact Preview.

### 5.5 Keyboard and accessibility
- Full arrow-key tree navigation; `→`/`←` expand/collapse; `Enter` opens detail; roles `tree`/`treeitem` with `aria-level`, `aria-expanded`, `aria-selected`.
- Status and override conveyed by icon + text, never colour alone (WCAG AA); contrast ≥ 4.5:1; focus rings visible.

## 6. Tree Display Modes

| Mode | Row shows | Primary user |
|---|---|---|
| Structure | code, name, type icon | Planner |
| Progress | progress bar, %, staleness, override flag | PM, Site |
| Cost | budget / committed / actual / variance chips (permission-gated) | QS |
| Responsibility | responsible name + discipline chip; unassigned rows flagged | Discipline Manager |
| Status | status chip prominent; on-hold and cancelled greyed with reason tooltip | PM |
| Baseline diff | change-class icons overlaid on rows | QS, PM |

Mode persists per user per project.

## 7. Visual Language

| Element | Treatment |
|---|---|
| Node type | distinct icon per type; spine types (phase/building/level) heavier weight |
| Status | DRAFT (dashed outline) · ACTIVE (solid) · ON_HOLD (amber pause) · COMPLETED (blue check) · CLOSED (grey lock) · CANCELLED (strikethrough) · ARCHIVED (hidden by default, ghosted when shown) |
| Override flag ⚑ | amber pennant on the node **and** on every ancestor row that consumed it, in every mode and in exports |
| Baseline lock 🔒 | padlock on row and in detail header, with baseline label on hover |
| Stale roll-up | amber value + "· N min old"; >60 min switches to grey with "recalculating…" if a job is queued |
| Context-only ancestor | reduced opacity, no chevron, no hover actions |

## 8. Mobile Design (Module 49 surface)

- **Breadcrumb-first navigation:** a single-column list of children with a sticky breadcrumb; no horizontal tree, no drag-drop (structure editing is disabled on mobile entirely — a deliberate decision, since a mis-drag on a phone is expensive and unrecoverable in the field).
- Available: browse, search, view node detail, view linked records, view progress, quick actions that create records elsewhere (daily report, inspection, photo) pre-filled with the node.
- Offline: cached scope manifest; sync badge on every screen; structure changes pulled server-wins with an inline banner when a node the user was viewing has moved.
- Tap targets ≥44 px; codes shown in monospace and truncated from the left (the meaningful segments are on the right).

## 9. Notification & Toast Patterns

| Situation | Pattern |
|---|---|
| Successful mutation | Toast with undo where safe (rename, reorder — 10 s); no undo for move/delete (they went through Impact Preview) |
| Blocked action | Inline dialog stating the rule, the count, and the legitimate alternative button |
| Long operation (import, rebuild) | Non-blocking progress card in the corner; completion notification via bell |
| Someone else changed the subtree | Banner "Zone 03 was moved by Dara 2 min ago — Refresh" (never auto-refresh mid-edit) |

## 10. Open Questions

| # | Question |
|---|---|
| OQ-01 | Should cost mode show variance as % or absolute by default? (Current: absolute, % on hover.) |
| OQ-02 | Is a read-only mobile tree acceptable for Site Supervisors long-term, or is status change needed on mobile in Phase 3? |

## 11. Change Log

| Version | Date | Change |
|---|---|---|
| R1 | 2026-08-08 | Initial issue |

**End of Document**
