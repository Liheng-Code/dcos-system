---
name: dcos-nextjs-ui
version: 1.0.0
description: Design and implement DCOS Next.js UI screens, dashboards, forms, WBS/task workspaces, and construction-module interfaces using React, TypeScript, Tailwind CSS, and shadcn/ui.
---

# DCOS Next.js UI Skill

## Purpose

Use this skill when designing or coding user interfaces for the Digital Construction Operating System (DCOS). The UI must support a construction enterprise platform driven by Project, WBS, Task, Document, Approval, Notification, Audit, and Reporting workflows.

The goal is not to make pretty screens only. The goal is to make construction work controllable, traceable, and fast for real project users.

## Core UI Principle

DCOS UI follows this rule:

```text
Project context first
→ WBS / location context second
→ module workflow third
→ action and approval state always visible
```

Every major screen should clearly answer:

1. Which project is the user working in?
2. Which WBS location or discipline is selected?
3. What record is being created, reviewed, approved, or tracked?
4. Who is responsible?
5. What is the current status?
6. What is the next action?

## Preferred Stack

Use this stack unless the user says otherwise:

```text
Framework: Next.js App Router
Language: TypeScript
UI: Tailwind CSS + shadcn/ui
Forms: React Hook Form + Zod
Tables: TanStack Table
Data Fetching: TanStack Query / React Query
Icons: lucide-react
Charts: Recharts
State: Zustand or lightweight local state first
Auth/Data: Supabase client when applicable
```

## UI Style Direction

Design style should be:

- Professional construction SaaS dashboard
- Clean enterprise layout
- Dense enough for real project data
- Not childish, not over-animated
- Fast to scan
- Role-aware
- Status-driven
- Good for desktop first, responsive second

Use a practical visual hierarchy:

```text
Top bar: project selector, search, notifications, user menu
Left sidebar: main modules
Page header: title, breadcrumb, main actions
Main content: table, board, tree, dashboard, or form
Right drawer/panel: detail, activity, approval, comments
```

## Main DCOS Navigation

Recommended primary navigation:

```text
Dashboard
Projects
WBS / Task Workspace
Design
Procurement
Construction
Documents
QA/QC
HSE
HR
Account
Reports
Admin
```

For MVP, prioritize:

```text
Dashboard
Projects
Stakeholders
WBS
Tasks
Documents
Approvals
Reports
Admin
```

## Standard Page Layout Pattern

Use this layout for most DCOS screens:

```tsx
<PageShell>
  <PageHeader
    title="..."
    breadcrumb={[...]}
    actions={...}
  />

  <Toolbar
    search={...}
    filters={...}
    viewToggle={...}
  />

  <MainContent>
    {/* table, tree, form, dashboard cards, kanban */}
  </MainContent>
</PageShell>
```

## WBS / Task Workspace Layout

This is one of the most important DCOS screens.

Recommended layout:

```text
Left Panel: WBS Tree
Top Bar: Project selector + breadcrumb + filters
Main Panel: Task list / board / schedule view
Right Panel: Selected task detail, approvals, documents, comments, activity
```

Modes:

```text
WBS Mode        = clean structure view, progress rollup, document count
Execution Mode  = task list, status, assigned user, dates, dependency status
Dashboard Mode  = KPIs, delays, bottlenecks, aging reports
```

Do not show confusing empty text like only "No tasks". Use useful empty states:

```text
No execution tasks linked to this WBS yet.
Create a task, link a document, or select a child WBS node.
```

## Standard Components to Generate

When asked to design a module UI, consider these reusable components:

```text
ProjectSelector
ModuleSidebar
PageHeader
BreadcrumbTrail
StatusBadge
PriorityBadge
DisciplineBadge
WbsTree
WbsBreadcrumb
DataTable
FilterBar
ViewToggle
RightDetailDrawer
ApprovalTimeline
ActivityTimeline
CommentThread
AttachmentPanel
NotificationBell
ActionRequiredInbox
KpiCard
ProgressCard
FormSection
FormFooterActions
```

## Status Badge Rules

Use clear badge logic.

Task statuses:

```text
Open
Assigned
In Progress
On Hold
Completed
Submitted for Approval
Approved
Rejected
Closed
Cancelled
```

Document statuses:

```text
Draft
Submitted
Under Review
Approved
Approved with Comment
Rejected
Issued for Construction
Superseded
Archived
```

Procurement statuses:

```text
Draft PR
Submitted PR
Approved PR
RFQ Issued
Quotation Received
Evaluation
PO Draft
PO Approved
PO Issued
Delivered
Partially Delivered
Closed
Cancelled
```

Inspection statuses:

```text
Draft
Submitted
Scheduled
Inspected
Passed
Failed
Reinspection Required
Closed
```

When coding, create a central status config:

```ts
export const taskStatusConfig = {
  open: { label: "Open", tone: "muted" },
  assigned: { label: "Assigned", tone: "info" },
  in_progress: { label: "In Progress", tone: "warning" },
  submitted_for_approval: { label: "Submitted for Approval", tone: "purple" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  closed: { label: "Closed", tone: "neutral" },
};
```

Avoid hardcoding status labels in many components.

## Form Design Rules

DCOS forms should be sectioned and practical.

Recommended form structure:

```text
1. Basic Information
2. Project / WBS / Discipline Linkage
3. Responsibility / Assignment
4. Dates / Priority / Status
5. Technical Details
6. Attachments
7. Approval / Workflow
8. Notes / Comments
```

Required controls:

- Show required fields clearly.
- Use validation messages near the field.
- Use searchable selects for project, WBS, user, stakeholder, document type.
- Use date pickers for planned/actual dates.
- Use attachment upload with file type and file size display.
- Use save draft and submit actions separately when workflow requires it.

Typical footer:

```text
Cancel | Save Draft | Submit / Assign / Approve
```

## Table Design Rules

For DCOS data tables:

- Use sticky header where helpful.
- Support search, filters, sort, pagination.
- Support column visibility.
- Support row action menu.
- Support bulk actions only when safe.
- Show status, priority, due date, assignee, WBS path.
- Avoid overly wide columns without truncation.
- Provide detail drawer instead of navigating away for quick review.

Common table columns:

```text
Code
Title / Name
Project
WBS Path
Discipline
Assigned To
Status
Priority
Due Date
Updated At
Actions
```

## Dashboard Design Rules

Dashboard should show control, not decoration.

Use these dashboard blocks:

```text
KPI Cards
Progress by WBS
Task Status Breakdown
Overdue Items
Pending Approvals
RFI Aging
Document Review Aging
Procurement Delay
NCR Aging
Cost / Budget Summary when module exists
Recent Activity
Action Required Inbox
```

For each KPI, define:

```text
Title
Value
Trend
Risk level
Click-through target
```

## Approval UI Pattern

Every approval-based record should have:

```text
Current status
Current approver
Approval timeline
Submitted date
Due date / aging
Decision buttons
Comment box
Rejection reason required
```

Approval buttons:

```text
Approve
Approve with Comment
Reject
Request Revision
Reassign Reviewer
```

Never allow rejection without comment.

## Audit / Activity UI Pattern

Every important record should include an Activity tab:

```text
Created
Updated
Submitted
Assigned
Approved
Rejected
Uploaded
Downloaded
Closed
Reopened
```

Show before/after values for update actions when available.

## Notification UI Pattern

Global notification components:

```text
NotificationBell
NotificationCenter
ActionRequiredInbox
```

Filter groups:

```text
All
Unread
Action Required
Critical
Approvals
Overdue
```

## Module Screen Guidance

### Project Setup

Screens:

```text
Project List
Create Project Wizard
Project Detail
Stakeholder Assignment
Team Assignment
WBS Setup
Calendar Setup
Document Numbering Setup
Workflow Setup
Activation Checklist
```

### Stakeholder Setup

Screens:

```text
Stakeholder Company Register
Contact Person Register
Stakeholder Template Library
Assign Stakeholder to Project
Project Stakeholder Responsibility Matrix
```

### WBS Management

Screens:

```text
WBS Tree Builder
WBS Node Form
WBS Import Preview
WBS Progress Rollup
WBS Detail Drawer
```

### Task Management

Screens:

```text
Task Dashboard
Task List
Kanban Board
Task Create Form
Task Detail Drawer
Task Approval View
My Tasks
Team Workload
```

### Document Control

Screens:

```text
Document Register
Upload Document
Revision History
Document Review Queue
Transmittal Register
Document Detail
```

### Procurement

Screens:

```text
PR List
PR Create Form
RFQ Register
Quotation Comparison
PO Register
Delivery Tracking
```

### QA/QC

Screens:

```text
Inspection Request List
Inspection Checklist
NCR Register
Punch List
Quality Dashboard
```

### HSE

Screens:

```text
Safety Dashboard
Permit Register
Toolbox Talk
Incident Register
Risk Assessment
```

## Coding Rules

When generating UI code:

1. Use TypeScript.
2. Use small, reusable components.
3. Keep mock data separate from component logic.
4. Use typed interfaces for records.
5. Avoid putting all code in one massive file unless user asks for one-file mockup.
6. Prefer server components for static layout and client components for interactivity.
7. Use accessible labels and semantic HTML.
8. Use loading, empty, error, and success states.
9. Use confirmation dialogs for destructive actions.
10. Never expose secret keys in frontend code.

## Recommended File Structure

```text
src/
├─ app/
│  ├─ (dashboard)/
│  │  ├─ dashboard/
│  │  ├─ projects/
│  │  ├─ wbs/
│  │  ├─ tasks/
│  │  ├─ documents/
│  │  └─ admin/
├─ components/
│  ├─ layout/
│  ├─ shared/
│  ├─ status/
│  ├─ wbs/
│  ├─ tasks/
│  ├─ documents/
│  ├─ approvals/
│  └─ dashboards/
├─ features/
│  ├─ projects/
│  ├─ wbs/
│  ├─ tasks/
│  ├─ documents/
│  └─ approvals/
├─ lib/
│  ├─ supabase/
│  ├─ validations/
│  ├─ constants/
│  └─ utils/
├─ types/
└─ data/
   └─ mock/
```

## Supabase UI Integration Rules

When UI connects to Supabase:

- Use environment variables with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Never use service role key in frontend.
- Respect Row Level Security.
- Filter records by current project and tenant context.
- Use server actions or route handlers when business logic is sensitive.
- Keep upload validation on both client and server.

## Output Style

When responding to UI design requests, provide:

1. Screen purpose
2. User roles
3. Layout structure
4. Main components
5. Data fields
6. Actions and workflow
7. Status behavior
8. Optional code or HTML mockup if requested

When coding, provide complete files with paths.

## What To Avoid

Avoid:

- Random SaaS UI with no construction logic
- Hardcoded statuses everywhere
- Overly simple CRUD screens without workflow states
- Hiding approval and audit history
- Ignoring WBS linkage
- Ignoring role permissions
- Mixing admin setup screens with execution screens
- Making left navigation too crowded with project cards
- Designing only for one project when DCOS is multi-project

## Quality Checklist

Before finalizing any DCOS UI output, verify:

- Project context is visible.
- WBS linkage is available where needed.
- Status is visible and consistent.
- Responsible user is visible.
- Next action is clear.
- Role permission has been considered.
- Approval and audit trail are not forgotten.
- Empty/loading/error states exist.
- Layout works for large construction datasets.
- UI supports future module expansion.

