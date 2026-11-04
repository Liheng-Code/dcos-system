# 06 — UI/UX Design
# Module PLN — Planning & Scheduling

Document path: docs/06-Planning-Scheduling/06-UI-UX-Design.md
Module code: PLN
Module number: 14 (DCOS Module Map)
Domain: Project Control
Phase: Phase 2
Status: Draft
Version: 1.0
Date: 2026-06-14

---

## 1. Screen Inventory

| Screen ID | Screen Name | Route | Primary Actor |
|---|---|---|---|
| PLN-01 | Programme List | `/dashboard/planning` | All project members |
| PLN-02 | Programme Dashboard | `/dashboard/planning/[id]` | PM, Planner |
| PLN-03 | Gantt Chart View | `/dashboard/planning/[id]/gantt` | Planner, PM, Site Engineer |
| PLN-04 | Activity Detail Sheet | (slide-over panel within PLN-03) | Planner, Site Engineer |
| PLN-05 | Progress Review | `/dashboard/planning/[id]/progress` | Planner |
| PLN-06 | Baseline Manager | `/dashboard/planning/[id]/baselines` | Planner, PM |
| PLN-07 | Lookahead Manager | `/dashboard/planning/[id]/lookahead` | Planner, Construction Manager |
| PLN-08 | Delay Events | `/dashboard/planning/[id]/delays` | Planner, PM |
| PLN-09 | S-Curve Report | `/dashboard/planning/[id]/scurve` | PM, QS, Client |
| PLN-10 | Programme Import | `/dashboard/planning/[id]/import` | Planner |
| PLN-11 | Workflow Panel | (slide-over from PLN-02) | Planner, PM, Document Controller |
| PLN-12 | Client Programme View | `/dashboard/planning/[id]/client-view` | Client / PMC Rep |

---

## 2. Screen Details

---

### PLN-01 — Programme List

**Layout:** Standard DCOS data table. Two-column layout: project selector (left sidebar) + programme table (main area).

**Key data shown:**
- Programme name, type badge (Master / Sub / Commissioning etc.)
- Status badge (colour-coded: draft=grey, submitted=amber, approved=green, active=blue, archived=muted)
- Data date, last updated, revision number
- Overall progress % (progress bar)
- Forecast completion date vs contract completion date (green if on time, red if overrun)

**Key actions:**
- "New Programme" button (Planner only) → opens creation dialog
- Click row → navigates to PLN-02 (Programme Dashboard)
- Filter by status (multi-select chips)

**Empty state:** "No programmes yet for this project. Start by creating a Master Programme." with a "Create Programme" call-to-action (Planner only). Non-planner empty state: "No programmes have been created yet."

**shadcn/ui components:** Table, Badge, Button, Select (project filter), Progress bar

---

### PLN-02 — Programme Dashboard

**Layout:** Full-width with top stat row (4 KPI cards) and two-column body (S-curve left 60%, activity tiles right 40%). Breadcrumb: Project → Planning → [Programme Name].

**Key data shown (KPI cards):**
1. Overall Progress: planned % vs actual % at data date, with delta and trend arrow
2. Critical Path: count of critical activities, count with negative float (red badge if > 0)
3. Schedule Status: "On Track" / "At Risk" / "Overrun" + days ahead/behind
4. Data Date: current data date, with "Advance Date" button for Planner/PM

**S-curve panel (left):**
- Line chart: planned curve (blue), actual curve (green), today marker (dashed vertical line)
- Date range slider below chart
- "View Full Report" link → PLN-09

**Activity tiles (right):**
- Overdue activities (planned finish < data date, progress < 100) — red count badge
- Starting next 14 days — amber count badge
- On hold — count badge
- Lookahead PCR last window — percentage with trend

**Header actions:**
- "Programme Actions" dropdown: Submit for Review, View Baselines, Import, Export PDF
- Status badge with workflow state; click → opens PLN-11 (Workflow Panel)

**Empty state:** "Data date has not been set. Advance the data date to begin progress tracking."

**shadcn/ui components:** Card, Badge, Button, DropdownMenu, Sheet (for workflow panel)

**Recharts:** LineChart for S-curve

---

### PLN-03 — Gantt Chart View

**Layout:** Full-width. Left panel (35%): activity list with indent for hierarchy. Right panel (65%): scrollable Gantt timeline. Synchronized vertical scrolling.

**Activity list columns:**
- Indent level (collapse/expand for summary bands)
- Activity code
- Activity name
- Status badge
- Progress % (mini bar)
- Responsible party

**Gantt timeline:**
- Timeline header: year / month / week scale (toggleable: month, week, day view)
- Per activity row: three bars stacked vertically
  1. Contract baseline bar (grey, faint) — shown if baseline exists
  2. Current planned bar (blue)
  3. Actual progress fill (green overlay on planned bar, left-to-right based on progress %)
- Critical path activities: planned bar shown in red
- Milestones: diamond shape
- Data date: dashed vertical line across full chart
- Today: solid thin vertical line

**Interaction:**
- Click activity row → opens PLN-04 (Activity Detail Sheet, slide-over from right)
- Drag planned bars to adjust dates (Planner only; triggers validation, updates via PATCH)
- Hover bar → tooltip: planned start, planned finish, actual start, progress %, float

**Toolbar:**
- Zoom in/out (day/week/month view toggle)
- "Add Activity" button (Planner only)
- "Show Baseline" toggle
- "Highlight Critical Path" toggle (ON by default)
- "Filter" (by status, responsible party)
- "Export PDF" button

**Empty state (no activities):** Gantt panel shows "No activities yet. Add activities or import a programme."

**shadcn/ui components:** Sheet, Button, Toggle, DropdownMenu, Tooltip
**Custom component:** GanttChart (built with SVG or Canvas — not a library; custom to DCOS)

---

### PLN-04 — Activity Detail Sheet (Slide-over)

**Layout:** Right-side Sheet (400px wide). Two tabs: "Details" and "Progress History".

**Details tab:**
- Activity code, name (editable for Planner)
- Type badge (normal / milestone / summary / buffer)
- WBS node link (shows wbs_name; click navigates to WBS module)
- Planned start / finish dates (date pickers for Planner)
- Planned duration (auto-calculated from dates, read-only)
- Responsible party (text input for Planner)
- CPM results (read-only block): ES, EF, LS, LF, Total Float, Is Critical badge
- Actual start date (set by Site Engineer or Planner)
- Progress % (input 0–100 for Site Engineer — creates a pending progress update)
- Actual finish date (set by Planner/PM to complete activity)
- Status actions: "Put On Hold", "Cancel Activity", "Mark Complete" (role-gated)

**Progress History tab:**
- Table: data_date, submitted_by, submitted_progress_pct, status (pending/confirmed/rejected), reviewed_by, reviewed_at, notes
- Each pending row shows "Confirm" / "Reject" buttons for Planner

**shadcn/ui components:** Sheet, Tabs, Badge, Button, Input, DatePicker, Label

---

### PLN-05 — Progress Review

**Layout:** Full-width table. Filter bar at top: by data_date, by status (pending/confirmed/rejected), by activity.

**Purpose:** Planner's batch review workspace for all pending progress updates before advancing the data date.

**Key data shown:**
- Activity code, activity name
- Submitted by (user name), submitted at (time)
- Submitted progress %, current confirmed %, delta
- Actual start / finish dates submitted
- Notes from site engineer
- Status badge

**Key actions:**
- "Confirm" / "Reject" buttons per row (inline for pending rows)
- "Confirm All Visible" button (bulk confirm after review — with confirmation dialog)
- After all pending items reviewed: "Advance Data Date" button (triggers advance-date flow)
- Date picker to filter by data date

**Empty state:** "No pending progress updates. All updates have been reviewed." with "Advance Data Date" call-to-action.

**shadcn/ui components:** Table, Badge, Button, Input, DatePicker, Dialog (for confirm all), AlertDialog

---

### PLN-06 — Baseline Manager

**Layout:** Full-width. Two panels: baseline list (left 40%) + baseline detail (right 60%).

**Baseline list:** Name, type (Contract / Revised), status (active / superseded / client_accepted), creation date, created by, activity count.

**Baseline detail (right panel when a baseline is selected):**
- Baseline name, reason for revision
- Snapshot date (created_at)
- Activity count in snapshot
- "Set as Active" button (Planner/PM; disabled for contract baseline if another already exists)
- "Export Snapshot" — downloads JSONB snapshot as formatted CSV
- Baseline comparison table: activity code, name, baseline planned dates, current planned dates, date variance (highlighted red if positive)

**Header actions:**
- "Create Revised Baseline" button (Planner only) → opens dialog: name, reason (min 50 chars)
- First baseline creation shows a special "Set Contract Baseline" primary button

**Empty state:** "No baselines yet. Set the contract baseline to begin comparison tracking." + "Set Contract Baseline" button.

**shadcn/ui components:** Card, Badge, Button, Dialog, Textarea (for reason), Table

---

### PLN-07 — Lookahead Manager

**Layout:** Two sections stacked: active/upcoming lookahead (top), lookahead history (bottom table).

**Active lookahead section:**
- Current lookahead: window type badge (2-week / 4-week), window dates, published date
- Activities table: code, name, planned start, planned finish, responsible party, completion status (checkbox — Planner/Site Engineer can tick off)
- Plan Completion Rate (PCR): large number, color coded (green ≥ 80%, amber 60-79%, red < 60%)
- "Close Lookahead" button (Planner) → confirms PCR and archives window
- "Export PDF" button

**Lookahead history table:**
- Window dates, type, PCR, status (published / closed)
- Click row → view detail (read-only)

**Header actions:**
- "Generate New Lookahead" button (Planner only) → opens dialog: select 2-week or 4-week, confirms auto-computed window start (Monday of data date week)

**Empty state:** "No lookaheads published yet." + "Generate Lookahead" button (Planner only).

**shadcn/ui components:** Card, Badge, Button, Checkbox, Table, Dialog

---

### PLN-08 — Delay Events

**Layout:** Table with expandable rows. Filter by delay_type, status, responsible_party.

**Table columns:**
- Reference (DE-001), Delay type badge, Responsible party, Start date, Duration (days), Status badge, Impacted activities count

**Expanded row:**
- Full description
- Impacted activities list (codes + names + float at event open/close)
- Status transition buttons: "Move to Under Review", "Mark Agreed", "Mark Disputed" (role-gated)
- If agreed: "Available for EOT" indicator badge

**Header actions:**
- "New Delay Event" button (Planner, PM only) → opens Sheet with all fields + activity multi-select

**Empty state:** "No delay events recorded." + "Record Delay Event" button.

**shadcn/ui components:** Table, Badge, Button, Sheet, Textarea, MultiSelect

---

### PLN-09 — S-Curve Report

**Layout:** Full-width chart page. Control bar at top; chart fills remaining space.

**Control bar:**
- Date range picker (from / to)
- Baseline selector (which baseline to use for planned curve)
- Export button (PDF / CSV)

**Chart:**
- X-axis: calendar dates
- Y-axis: cumulative progress % (0–100)
- Blue line: planned cumulative progress (from selected baseline)
- Green line: actual cumulative progress
- Dashed vertical line: current data date
- Shaded area between planned and actual: positive variance = behind (red tint), ahead = green tint
- Hover tooltip: date, planned %, actual %, variance %

**Below chart:** Summary table: monthly milestones, planned %, actual %, variance.

**shadcn/ui components:** Card, Button, Select, DatePicker
**Recharts:** ComposedChart (Line + Area)

---

### PLN-10 — Programme Import

**Layout:** Wizard (3 steps). Step indicator at top.

**Step 1 — Download Template:**
- Instruction text explaining the required DCOS CSV format
- Column reference table (column name, required/optional, format, example)
- "Download Template" button (downloads blank CSV)
- "I have my file ready" → Next button

**Step 2 — Upload and Dry-Run:**
- File upload dropzone (CSV or XLSX)
- On upload: spinner, then dry-run results table appears
  - Valid rows: green row indicator
  - Error rows: red indicator + error description column
  - Warning rows: amber (unmatched WBS codes)
  - Summary: "[n] valid, [m] errors, [k] warnings"
- If errors > 0: "Fix errors before importing" — Next button disabled
- If warnings only: Next button enabled with "Proceed with [k] warnings" label

**Step 3 — Confirm Import:**
- Summary card: activities to import, dependencies to create, WBS links, warnings summary
- "Confirm Import" primary button
- "Back" button
- On success: redirect to PLN-03 (Gantt View) with success toast

**shadcn/ui components:** Button, Table, Badge, Card, Input (file), Progress (upload indicator)

---

### PLN-11 — Workflow Panel (Slide-over)

**Layout:** Right-side Sheet (480px). Shows current programme status, available transitions, and history.

**Content:**
- Programme name and current status (large badge)
- Status timeline: each status in the lifecycle shown as steps (similar to shadcn Steps pattern), completed steps filled, current step highlighted
- Available action buttons (role-gated):
  - Planner sees: "Submit for Internal Review" (if draft)
  - PM sees: "Approve" / "Reject with Reason" (if submitted_internal)
  - Planner sees: "Submit to Client" (if approved_internal)
  - PM/Doc Controller sees: "Record Client Acceptance" / "Record Client Rejection" (if submitted_client)
- Rejection reason field (textarea, shown when reject is selected)
- History log: list of past status transitions with user, timestamp, and any reason

**shadcn/ui components:** Sheet, Badge, Button, Textarea, Separator

---

### PLN-12 — Client Programme View (Read-Only Portal)

**Layout:** Simplified version of PLN-02. No action buttons except PDF export.

**Key data shown:**
- Programme name, approved revision number, client acceptance date
- Status banner: "This is the client-accepted programme. Revision [n], accepted on [date]."
- Overall progress KPI card
- S-curve chart (read-only)
- Gantt chart (read-only, no drag, no click-to-edit)
- Delay events table (agreed and under_review events only — no open/disputed visibility)

**Access restriction:** This screen only renders approved_client revision data. If the client is logged in during a period where there is no approved_client programme, a message shows: "No approved programme is available for view at this time. Contact the project team."

**shadcn/ui components:** Card, Badge, Button (Export PDF only)

---

## 3. Navigation Flow

```
PLN-01 (Programme List)
  └── Click programme → PLN-02 (Programme Dashboard)
        ├── "View Gantt" → PLN-03 (Gantt View)
        │     └── Click activity → PLN-04 (Activity Detail Sheet, overlay)
        ├── "Review Progress" → PLN-05 (Progress Review)
        ├── "Baselines" → PLN-06 (Baseline Manager)
        ├── "Lookahead" → PLN-07 (Lookahead Manager)
        ├── "Delay Events" → PLN-08 (Delay Events)
        ├── "S-Curve" → PLN-09 (S-Curve Report)
        ├── "Import" → PLN-10 (Programme Import)
        └── Click status badge → PLN-11 (Workflow Panel, overlay)

Client user → PLN-12 (Client Programme View, separate entry point)
```

**Sidebar navigation entry:** "Planning" under the Project Control section of the main sidebar. Sub-items visible after navigating into a programme: Gantt, Progress, Baselines, Lookahead, Delays, S-Curve.

---

## 4. Global UI Patterns

- **Status badges** follow the DCOS standard colour system: grey=draft, amber=submitted/pending, blue=active, green=approved/confirmed, red=rejected/overrun, muted=archived/cancelled
- **Role gating:** Action buttons that are not available to the current user's role are hidden entirely (not disabled) to avoid confusion
- **Audit trail access:** A "History" icon button on key records (activity, baseline, delay event) opens a read-only history drawer showing all audit log entries for that record
- **Gantt PDF export:** Server-side rendering via a headless Puppeteer call or a dedicated export API route; the PDF includes: project name, programme name, print date, data date, and a page-wide Gantt view at week scale
- **Toast notifications:** Sonner toast on all successful mutations (confirm progress, advance date, set baseline, etc.)
- **Loading states:** Skeleton placeholders for Gantt chart and S-curve while data loads; spinner on CPM "recalculating" state
