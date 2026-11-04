# DCOS — Module 04: Task Management
## 06 — UI / UX Design

| Field | Value |
|---|---|
| Document Code | DCOS-M04-UX-001 |
| Module | 04 — Task Management |
| Version | R1.0 |
| Platforms | Web (Next.js + Tailwind + shadcn/ui), Mobile (React Native) |

---

## 1. Design Principles

| Principle | Application in Task Management |
|---|---|
| WBS is always visible | The left tree is persistent context. A user should never wonder *where* a task is. |
| One screen, one job | The task list answers "what needs doing"; the task detail answers "what happened and what's next". No screen tries to do both. |
| Field first, office second | Every action a site user needs is reachable in ≤ 2 taps on mobile. Desktop density is for managers, not for site. |
| Status is colour, not words alone | Status colour is consistent across list, board, tree, calendar and mobile. Colour is always paired with a label for accessibility. |
| Evidence is the default, not an extra | Photo capture is a primary button on the mobile progress screen, not buried in an attachments tab. |
| Never lose field data | Offline entries persist visibly. Nothing disappears because of a network error. |
| Blocking is explained | When the system prevents an action, it names the blocker and offers the next step (link to the RFI, the permit request, the predecessor task). |

---

## 2. Information Architecture

```text
Projects ▸ {Project} ▸ WBS / Task Workspace
   ├── WBS Tree (left rail, persistent)
   ├── Task Views (main)
   │     ├── List
   │     ├── Board (Kanban by status)
   │     ├── Calendar
   │     ├── Timeline (Gantt-lite, read-only)
   │     └── Map/Plan (Phase 3 — drawing-pinned tasks)
   ├── Task Detail (drawer or full page)
   │     ├── Overview
   │     ├── Progress
   │     ├── Checklist
   │     ├── Resources
   │     ├── Links
   │     ├── Evidence
   │     ├── Comments
   │     └── Activity (audit timeline)
   └── Panels
         ├── My Tasks
         ├── Action Required (approval inbox)
         └── Saved Views
```

---

## 3. Web — Task Workspace Layout

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│  DCOS   [Project: Tower A ▾]   ⌕ Search tasks, codes, documents…   🔔12  👤   │
├───────────┬───────────────────────────────────────────────────────────────────┤
│ WBS TREE  │  Tower A / Building 01 / Level 05 / Zone 03            [⋯ actions]│
│           │  ┌─────────────────────────────────────────────────────────────┐  │
│ ▾ Tower A │  │ Progress 62%  ██████████████░░░░░░░  Tasks 48 · Late 6 · Hold 2│ │
│  ▾ B01    │  └─────────────────────────────────────────────────────────────┘  │
│   ▸ L01   │                                                                    │
│   ▸ L04   │  [ List ] [ Board ] [ Calendar ] [ Timeline ]      + New Task  ⋮  │
│   ▾ L05   │  Filters: Discipline ▾ Status ▾ Assignee ▾ Due ▾ Late ☐ Critical ☐│
│    ▸ Z01  │  ┌────────────────────────────────────────────────────────────┐   │
│    ▾ Z03  │  │ ● Code        Title              Assignee  Due    Prog  St │   │
│      ARC  │  │ ● T0042 ⚠     Slab rebar fixing  Sokha    08 Aug  78%  ▶  │   │
│      STR  │  │ ● T0043       MEP sleeve check   Dara     09 Aug  20%  ▶  │   │
│      MEP  │  │ ● T0044 ⏸     Formwork strike    Vichea   10 Aug  0%   ⏸  │   │
│  ▸ B02    │  │ ● T0045 ✔     Setting out        Sopheak  06 Aug  100% ✓  │   │
│           │  └────────────────────────────────────────────────────────────┘   │
│ [+ Node]  │  48 tasks · showing 1–50            ⟨ 1 2 3 ⟩       [Export ▾]    │
└───────────┴───────────────────────────────────────────────────────────────────┘
```

### 3.1 WBS Tree (left rail)

- Width 280px, collapsible to icon rail.
- Each node shows: name, progress micro-bar, and badge counts (late in red, held in amber) when non-zero.
- Selecting a node filters the main panel to that node **and its descendants** (toggle: "this node only").
- Lazy-loads children beyond 100 nodes.
- Search within tree jumps to and highlights the matching node path.

### 3.2 Task List

| Column | Notes |
|---|---|
| Status dot | Colour-coded, tooltip with full status name |
| Task code | Monospace, click opens detail drawer |
| Title | Truncated with tooltip; sub-tasks indented under parent |
| Flags | ⚠ overdue, ⏸ on hold, ★ critical path, ↻ rework, 🔒 blocked |
| WBS path | Shown only when the view spans multiple nodes |
| Discipline | Coloured chip |
| Assignee | Avatar + name |
| Planned finish | Red when past and incomplete |
| Progress | Bar + % |
| Actions | Inline: Start / Update / Submit / Approve depending on status and permission |

**Behaviours**

- Server-side pagination, 50 rows default.
- Multi-select checkbox column enables bulk actions (assign, reschedule, tag, export).
- Column chooser persisted per user per project.
- Row click opens a right-side drawer; ⌘/Ctrl-click opens full page.
- Sticky header and horizontal scroll on narrow screens.

### 3.3 Board View

- Columns follow the lifecycle: Open · Assigned · In Progress · On Hold · Completed · Submitted · Approved.
- Cards show code, title, assignee avatar, due date, progress ring, and flags.
- Drag between columns performs the transition and enforces the same guards as the detail screen; an illegal drop snaps back with an explanatory toast.
- Swimlane toggle: by discipline, by assignee, or by WBS node.
- WIP indicator per column (count, and a soft warning above a configurable limit).

### 3.4 Calendar View

- Month/week toggle; tasks rendered as bars from planned start to planned finish.
- Milestones as diamonds.
- Non-working days shaded per the project calendar.
- Drag to reschedule (permission-gated), with a confirmation showing the schedule impact on successors.

### 3.5 Timeline (Gantt-lite)

- Read-only in this module; editing lives in Planning & Scheduling.
- Shows baseline bar (grey) under the current bar (coloured), dependency arrows, and critical path highlighting.
- Hover reveals float, variance and dependency detail.

---

## 4. Task Detail

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ P001-STR-B01L05-T0042  ★ Critical            [In Progress ▾]   ⋮  ✕      │
│ Slab reinforcement fixing — Zone 3                                        │
│ Tower A / Building 01 / Level 05 / Zone 03 · STR · Construction Activity  │
├──────────────────────────────────────────────────────────────────────────┤
│ Overview │ Progress │ Checklist │ Resources │ Links │ Evidence │ Comments │ Activity │
├──────────────────────────────────────────────────────────────────────────┤
│  Progress   ███████████████░░░░  77.6%   9.7 / 12.5 ton                   │
│                                                                           │
│  Assignee     Sokha Chan (Site Engineer)          Priority   High         │
│  Supervisor   Vichea Lim                          Approver   Discipline Mgr│
│  Planned      04 Aug → 08 Aug  (5 d)              Actual     04 Aug → —   │
│  Baseline     04 Aug → 08 Aug                     Forecast   10 Aug  +2 d │
│  Float        0 d (critical)                      Holds      1 (2.5 d)    │
│                                                                           │
│  ⚠ Overdue by 2 days                                                      │
│  🔗 Governing drawing: STR-DWG-B01-L05-001 R03  (current)                  │
│  🛡 Inspection required — not yet requested                                │
│                                                                           │
│  [ Update Progress ]  [ Put On Hold ]  [ Mark Complete ]   ⋮ More         │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Tab Contents

| Tab | Contents |
|---|---|
| **Overview** | Identity, responsibility, schedule, gates, blockers, primary actions |
| **Progress** | Progress log table (date, entry, cumulative, by whom, source, note, photo thumbs) + "Add entry" |
| **Checklist** | Items with pass/fail/NA, weight, mandatory marker, comment and photo per item; failing an item offers "Raise NCR" |
| **Resources** | Three sub-tables (manpower, equipment, material) by date, with daily totals and productivity |
| **Links** | Grouped by relationship: Governing (drawings, method statements), Blockers (RFI, permit), Outputs (documents produced), References (BOQ item, PR, VO), Related tasks |
| **Evidence** | Photo grid with capture time, uploader, GPS pin; lightbox with metadata; filter by progress entry |
| **Comments** | Threaded, @mentions, internal/external toggle, attachment support |
| **Activity** | Chronological audit timeline: every status change, field change (before → after), assignment, hold, approval decision, notification delivery |

### 4.2 Action Bar Logic

| Status | Primary Actions Shown |
|---|---|
| DRAFT | Publish · Edit · Delete (only while draft) |
| OPEN | Assign · Edit · Cancel |
| ASSIGNED | Start Work · Reassign · Edit · Cancel |
| IN_PROGRESS | Update Progress · Put On Hold · Mark Complete |
| ON_HOLD | Resume · View hold reason · Escalate |
| COMPLETED | Submit for Approval · Request Inspection · Reopen work |
| SUBMITTED_FOR_APPROVAL | Approve · Reject (approver only) · Recall (submitter, before first decision) |
| REJECTED | View rejection reason · Resume work |
| APPROVED | Close · Reopen (PM+) |
| CLOSED | Reopen (PM+) · Export |
| CANCELLED | View reason · Export |

Disabled actions always carry a tooltip explaining why, never a silent grey button.

### 4.3 Blocking Dialogs

**Blocked by predecessor**

```text
┌ Cannot start this task ────────────────────────────────┐
│ 2 predecessor tasks are not yet complete:               │
│  • T0038  Formwork erection — In Progress (Sopheak)     │
│  • T0039  MEP sleeve fixing — Submitted (awaiting Dara) │
│                                                         │
│ [ Notify predecessors ]  [ Request override ]  [ Close ]│
└─────────────────────────────────────────────────────────┘
```

**Override** requires permission and a mandatory reason, and states plainly: "This will be recorded in the audit log and reported to the Project Manager."

**Permit missing**

```text
A valid Hot Work permit is required before starting this task.
[ Request permit ]  (opens HSE permit request pre-filled from this task)
```

---

## 5. Key Modals and Forms

### 5.1 New Task

Two-column form; right column shows a live preview of the generated task code and the gates that will apply.

| Section | Fields |
|---|---|
| Location | Project (locked), WBS node (tree picker, pre-filled), parent task (optional) |
| Identity | Task type, discipline, title, description, work category, priority, tags |
| Measurement | Progress method; if QUANTITY → planned quantity + unit; if CHECKLIST → checklist template |
| Schedule | Planned start, planned finish (duration auto-calculates), constraint type |
| Responsibility | Assignee / crew / subcontractor, supervisor, approver override |
| Links | Governing drawing, BOQ item, method statement |
| Footer | Gate summary chips: "Inspection required · 2 photos on completion · Permit: none" |

Validation is inline and immediate. The save button states what will happen: **Create & Assign** vs **Save as Draft**.

### 5.2 Update Progress (Web)

```text
┌ Update Progress — T0042 ───────────────────────────────┐
│ Date      [ 10 Aug 2026 ▾ ]                             │
│ Quantity  [    4.2    ] ton    Cumulative: 9.7 / 12.5   │
│ Progress  ███████████████░░░░  77.6%   (was 44.0%)      │
│ Man-hours [    96     ]  (optional)                     │
│ Note      [ Zone 3 bay 2 complete; bay 3 short 0.8 t  ] │
│ Photos    [📷 Add]  ▣ ▣ ▣                                │
│                                        [Cancel] [Save]  │
└─────────────────────────────────────────────────────────┘
```

### 5.3 Put On Hold

Reason (searchable select) → responsible party (auto-filled from reason, editable) → expected resume date → link a blocking record (RFI / EI / permit / PR) → note → optional photo. A banner states: "Hold time is recorded for delay analysis and may be used in claims."

### 5.4 Approve / Reject

Split-screen: left shows submitted evidence (photos, checklist results, inspection status, progress history); right shows the decision panel. Reject requires a comment of at least 10 characters and offers a checkbox "Raise NCR" and "Create rework task".

---

## 6. Panels

### 6.1 My Tasks

Grouped: **Overdue** (red), **Due today**, **In progress**, **Rejected — needs rework**, **Upcoming (7 days)**, **Blocked**. Each group collapsible with a count. This is the default landing panel for Engineer, Supervisor and Subcontractor roles.

### 6.2 Action Required (Approval Inbox)

Default landing panel for Discipline Manager, PM and Director. Rows show waiting time (amber > 24h, red > 72h), submitter, task, and value/quantity where applicable. Supports approve/reject inline with a required comment on reject, and bulk approve for low-risk task types only (configurable, never for inspection-gated tasks).

---

## 7. Mobile Design (React Native)

### 7.1 Navigation

Bottom tabs: **Tasks · Daily · Capture · Notifications · More**

### 7.2 Task List (mobile)

```text
┌─────────────────────────────┐
│ ⟨ Tower A        ⌕   ⚙      │
│ ● Offline — 3 pending sync  │
├─────────────────────────────┤
│ TODAY                       │
│ ┌─────────────────────────┐ │
│ │ T0042  ⚠ Overdue 2d  ★  │ │
│ │ Slab rebar fixing Z3    │ │
│ │ B01 / L05 / Z03         │ │
│ │ ███████████░░ 78%       │ │
│ │ [ Update ]   [ Photos ] │ │
│ │ ⟳ Pending sync          │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ T0044  ⏸ On hold        │ │
│ │ Formwork strike         │ │
│ │ Awaiting RFI-018        │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### 7.3 Mobile Interaction Rules

| Rule | Detail |
|---|---|
| Two taps to progress | Task card → Update → enter quantity → Save |
| Camera is primary | The progress screen opens with a large camera button; photos attach to the entry automatically |
| Large touch targets | Minimum 48dp; gloves and sunlight assumed |
| High-contrast mode | Outdoor palette with heavier weights; automatic on high ambient light where supported |
| Offline banner | Always visible when offline, with pending-count and a manual "Sync now" |
| Sync badge on every card | Pending / Syncing / Synced / Failed — never hidden in a settings screen |
| No destructive gestures | Swipe never deletes; swipe reveals Update / Hold / Open |
| Voice note fallback | Where typing is impractical, a voice note attaches to the progress entry (transcribed later) |

### 7.4 Mobile Screens

| Screen | Purpose |
|---|---|
| Task list (assigned, cached) | Today's work |
| Task detail (compact) | Overview, progress, checklist, photos, drawing thumbnail |
| Update progress | Quantity/percent, photos, note, save offline |
| Checklist runner | One item per screen for inspection-style tasks, with pass/fail/NA and photo |
| Hold request | Reason picker, photo, note |
| Drawing viewer | Cached governing drawing, pinch-zoom, no markup in Phase 1 |
| Sync centre | Pending queue, failures, conflicts, manual retry |

---

## 8. Visual Language

### 8.1 Status Colours

| Status | Colour | Hex | Icon |
|---|---|---|---|
| Draft | Slate | `#94A3B8` | ○ |
| Open | Sky | `#38BDF8` | ○ |
| Assigned | Blue | `#3B82F6` | ◐ |
| In Progress | Indigo | `#6366F1` | ▶ |
| On Hold | Amber | `#F59E0B` | ⏸ |
| Completed | Teal | `#14B8A6` | ◑ |
| Submitted | Violet | `#8B5CF6` | ↑ |
| Approved | Green | `#22C55E` | ✓ |
| Rejected | Red | `#EF4444` | ✕ |
| Closed | Grey | `#64748B` | ● |
| Cancelled | Zinc, strikethrough | `#A1A1AA` | ⊘ |

### 8.2 Discipline Chips

ARC `#0EA5E9` · STR `#F97316` · MEP `#8B5CF6` · CIV `#84CC16` · PRC `#EAB308` · QAQC `#14B8A6` · HSE `#EF4444` · ADM `#64748B`

### 8.3 Typography and Density

- UI font: Inter. Codes and quantities: JetBrains Mono (alignment matters in tables).
- Desktop table row height 40px (compact) / 52px (comfortable), user-selectable.
- Numeric columns right-aligned; units in a lighter weight beside the value.

### 8.4 Empty, Loading, Error States

| State | Treatment |
|---|---|
| No tasks in this WBS node | Illustration + "No tasks here yet" + primary "Create task" + secondary "Generate from template" |
| Loading list | Skeleton rows (never a spinner over an empty page) |
| Load failure | Inline error card with Retry; last cached data shown with a staleness timestamp |
| Permission denied | "You don't have access to this task" with a request-access action, never a raw 403 |
| Offline | Amber banner; read-only sections greyed with an explanation |

---

## 9. Accessibility

| Requirement | Implementation |
|---|---|
| Contrast | ≥ 4.5:1 for text, ≥ 3:1 for UI components and status indicators |
| Colour independence | Every status pairs colour with an icon and text label |
| Keyboard | Full keyboard navigation of list, drawer and forms; visible focus rings; `j/k` row navigation, `Enter` to open, `E` to edit |
| Screen readers | ARIA labels on status dots, progress bars announce "78 percent complete"; drawer is a labelled dialog with focus trap |
| Motion | Respects `prefers-reduced-motion`; no essential information conveyed by animation |
| Language | English and Khmer; Khmer line-height increased for legibility; date format per project locale |
| Touch | 48dp minimum targets on mobile; no hover-only affordances |

---

## 10. Performance Targets (UI)

| Interaction | Target |
|---|---|
| Task list first paint (50 rows) | < 1.5 s |
| Task detail drawer open (cached list) | < 400 ms |
| Progress save round-trip (web) | < 1 s |
| WBS tree expand (100 children) | < 500 ms |
| Board drag-drop feedback | Optimistic, instant; rollback with toast on failure |
| Mobile task list from cold start (offline) | < 2 s |

---

## 11. Component Inventory

| Component | Reuse Scope |
|---|---|
| `<WbsTreePanel />` | Shared with Documents, QA/QC, Procurement |
| `<TaskStatusBadge />` | Global |
| `<ProgressBar variant="task\|wbs" />` | Global |
| `<TaskCard />` | Board, mobile, dashboards |
| `<TaskTable />` | Task list, reports, exports preview |
| `<TaskDetailDrawer />` | Task workspace, dashboards, search results |
| `<EvidenceGrid />` | Tasks, inspections, daily reports |
| `<ChecklistRunner />` | Tasks, QA/QC inspections, HSE checklists |
| `<HoldReasonDialog />` | Tasks, procurement, documents |
| `<ApprovalPanel />` | Shared approval engine UI |
| `<ActivityTimeline />` | Any auditable record |
| `<SyncStatusChip />` | All mobile records |

---

**End of Document — DCOS-M04-UX-001**
