# UI/UX Design Standards — DC/OS System

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 |
| UI Components | shadcn/ui (Radix UI primitives + Tailwind) |
| Icons | Lucide React |
| Forms | react-hook-form + zod |
| Data Tables | TanStack Table |
| Charts | Recharts |
| Drag & Drop | dnd-kit |
| Auth | Supabase Auth |

---

## 1. Design Tokens

### 1.1 Color Palette

Construction industry evokes safety, trust, and clarity. The palette draws from standard construction signage and materials.

```css
/* Tailwind v4 — app/globals.css */

@import "tailwindcss";

@theme {
  /* Primary — signal/safety blue, trustworthy */
  --color-primary-50: #eff6ff;
  --color-primary-100: #dbeafe;
  --color-primary-200: #bfdbfe;
  --color-primary-300: #93c5fd;
  --color-primary-400: #60a5fa;
  --color-primary-500: #1e40af;  /* safety blue — main CTA */
  --color-primary-600: #1e3a8a;
  --color-primary-700: #1e3380;
  --color-primary-800: #172554;
  --color-primary-900: #0f172a;

  /* Warning — OSHA safety orange / high-vis */
  --color-warning-50: #fff7ed;
  --color-warning-100: #ffedd5;
  --color-warning-200: #fed7aa;
  --color-warning-300: #fdba74;
  --color-warning-400: #fb923c;
  --color-warning-500: #d97706;  /* high-vis orange — alerts, overdue */
  --color-warning-600: #c2410c;
  --color-warning-700: #9a3412;
  --color-warning-800: #7c2d12;
  --color-warning-900: #431407;

  /* Success — safety green, approved */
  --color-success-50: #f0fdf4;
  --color-success-100: #dcfce7;
  --color-success-200: #bbf7d0;
  --color-success-300: #86efac;
  --color-success-400: #4ade80;
  --color-success-500: #16a34a;  /* hard-hat green — approved, on-track */
  --color-success-600: #15803d;
  --color-success-700: #166534;
  --color-success-800: #14532d;
  --color-success-900: #052e16;

  /* Danger — stop / red */
  --color-danger-50: #fef2f2;
  --color-danger-100: #fee2e2;
  --color-danger-200: #fecaca;
  --color-danger-300: #fca5a5;
  --color-danger-400: #f87171;
  --color-danger-500: #dc2626;   /* stop sign red — critical issues */
  --color-danger-600: #b91c1c;
  --color-danger-700: #991b1b;
  --color-danger-800: #7f1d1d;
  --color-danger-900: #450a0a;

  /* Neutral — concrete / steel grays */
  --color-surface: #f8fafc;
  --color-muted: #f1f5f9;
  --color-border: #e2e8f0;
  --color-foreground: #0f172a;
  --color-muted-foreground: #64748b;

  /* Radius */
  --radius-sm: 0.375rem;
  --radius: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
}
```

### 1.2 Semantic Color Mappings

| Usage | Token |
|---|---|
| Primary buttons, links, header | `--color-primary-500` |
| Hover states | `--color-primary-600` |
| Success / approved / on-track badges | `--color-success-500` |
| Warnings / overdue / pending review | `--color-warning-500` |
| Errors / critical issues / stop-work | `--color-danger-500` |
| Page background | `--color-surface` |
| Card / panel background | `white` |
| Subtle backgrounds (sidebars, code) | `--color-muted` |
| Borders, dividers | `--color-border` |

### 1.3 Typography

```css
@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

| Element | Size | Weight | Line Height |
|---|---|---|---|
| Display heading (h1) | text-4xl / 2.25rem | bold (700) | 1.2 |
| Page heading (h2) | text-2xl / 1.5rem | semibold (600) | 1.3 |
| Section heading (h3) | text-xl / 1.25rem | semibold (600) | 1.4 |
| Card title (h4) | text-base / 1rem | medium (500) | 1.5 |
| Body | text-sm / 0.875rem | normal (400) | 1.5 |
| Small / caption | text-xs / 0.75rem | normal (400) | 1.5 |
| Data / code | text-sm (mono) | normal (400) | 1.5 |
| Table header | text-xs | medium (500) | 1.5 |
| Badge | text-xs | medium (500) | 1.5 |

### 1.4 Spacing

- Uses standard Tailwind spacing scale (0.25rem increments)
- Standard card padding: `p-4` (1rem) / `p-6` (1.5rem)
- Standard gap between stacked items: `space-y-4`
- Standard gap for grid children: `gap-4`

### 1.5 Shadows

```css
@theme {
  --shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.08);
  --shadow-drawer: -4px 0 12px rgb(0 0 0 / 0.1);
  --shadow-dropdown: 0 4px 12px rgb(0 0 0 / 0.1);
}
```

---

## 2. Component Inventory

### 2.1 shadcn/ui Components to Install

Core (install immediately):
- Button, Input, Label, Badge, Card
- Dialog, Sheet (slide-over panels)
- DropdownMenu, Popover, Command (select-style)
- Tabs, Separator
- Table, Select
- Form (react-hook-form + zod)
- Avatar, Tooltip
- Skeleton, Progress
- Toast / Sonner (notifications)
- Alert, AlertDialog
- Breadcrumb

Phase 2 (complex features):
- Calendar, DatePicker
- DataTable (TanStack Table wrapper)
- Combobox (multi-select skills/trades)
- Textarea
- Checkbox, RadioGroup
- Switch (toggle flags)
- Pagination

### 2.2 Custom Components to Build

| Component | Purpose | Tech |
|---|---|---|
| `ProjectCard` | Project card with status badge, progress, dates | shadcn Card + Badge + Progress |
| `StatusBadge` | Color-coded status (Planning, In Progress, On Hold, Complete, Delayed) | shadcn Badge + semantic colors |
| `KPICard` | Dashboard metric card with icon, trend arrow | shadcn Card + Lucide + Recharts sparkline |
| `DataTable` | Sortable, filterable, paginated table | TanStack Table + shadcn Table |
| `KanbanBoard` | Drag-and-drop task board | dnd-kit + shadcn Card |
| `GanttChart` | Timeline / schedule view | Custom SVG or Recharts |
| `DrawingViewer` | Full-screen blueprint/image viewer | Lightbox pattern + zoom/pan |
| `FileDropzone` | Drag-and-drop file upload | Custom + Supabase Storage |
| `SignaturePad` | Touch-based signature for inspections | react-signature-canvas |
| `PhaseTimeline` | Vertical timeline of project phases | Custom CSS with Tailwind |
| `AddressAutocomplete` | Address lookup for project sites | Google Maps API / Mapbox |
| `MapView` | Project location pins, site mapping | MapLibre GL or Google Maps |

### 2.3 Status Badge Color Map

| Status | Color |
|---|---|
| Planning | `--color-primary-100` / `--color-primary-700` |
| In Progress | `--color-primary-500` |
| On Hold | `--color-warning-200` / `--color-warning-700` |
| Completed | `--color-success-500` |
| Delayed | `--color-warning-500` |
| Overdue | `--color-danger-500` |
| Cancelled | `--color-muted-foreground` |
| Pending Review | `--color-warning-300` |
| Approved | `--color-success-500` |
| Rejected | `--color-danger-500` |

---

## 3. Layout Patterns

### 3.1 App Shell

```
┌──────────────────────────────────────────┐
│ Top Bar                                   │
│ [Logo] [Search] [Notifications] [Avatar]  │
├──────────┬───────────────────────────────┤
│ Sidebar  │ Main Content Area              │
│          │ ┌─────────────────────────────┐│
│ Dashboard │ │                            ││
│ Projects  │ │                            ││
│ Schedule  │ │                            ││
│ Drawings  │ │                            ││
│ Inspections│ │                            ││
│ Team      │ │                            ││
│ Reports   │ │                            ││
│ Settings  │ │                            ││
│          │ └─────────────────────────────┘│
└──────────┴───────────────────────────────┘
```

- **Sidebar**: w-64 (256px), collapsible to w-16 on smaller screens
- **Top bar**: h-16 (64px), fixed
- **Content**: responsive padding (p-4 sm:p-6 lg:p-8)
- **Sidebar links**: Active state uses `--color-primary-50` background + `--color-primary-500` text

### 3.2 Project Detail Layout (Tabbed)

```
┌──────────────────────────────────────────────┐
│ [← Back to Projects]                         │
│ Skyline Tower — Building A                   │
│ Status: ◉ In Progress    Progress: ████░ 80% │
├────┬────┬─────┬──────┬──────┬───────┬───────┤
│Ovrv│Sched│Budgt│Drawng│Team  │Issues │Reports│
├────┴────┴─────┴──────┴──────┴───────┴───────┤
│                                              │
│  Tab content rendered here                   │
│                                              │
└──────────────────────────────────────────────┘
```

- Tabs used across all detail views (projects, inspections, etc.)
- Tab labels are short (3-8 chars) — full labels on hover via tooltip

### 3.3 Dashboard Grid

```
┌─────────────┬─────────────┬─────────────┬─────────────┐
│ Active Proj │ Budget      │ Pending     │ Overdue     │
│      12     │ Health 76%  │ Approvals 5 │ Tasks 3     │
├─────────────┴─────────────┴─────────────┴─────────────┤
│ Cost Overview (Chart — Recharts)                       │
├─────────────┬─────────────┬───────────────────────────┤
│ Upcoming    │ Recent      │ Team Workload             │
│ Milestones  │ Inspections │ (Mini progress bars)      │
└─────────────┴─────────────┴───────────────────────────┘
```

- KPI cards: stat + label + optional trend arrow
- Charts: use Recharts (Line, Bar, Pie) with muted colors
- Max 4 cards per row on desktop, 2 on tablet, 1 on mobile

### 3.4 Data Table Pattern

```tsx
// Standard table — sortable, filterable, paginated
<DataTable
  columns={columns}
  data={data}
  toolbar={<TableToolbar filters={filters} />}
  pagination={{ pageSize: 25, total: 240 }}
/>
```

| Feature | Implementation |
|---|---|
| Sorting | Column header click, arrow indicator |
| Filtering | Toolbar with input + dropdown filters |
| Column visibility | Dropdown toggle |
| Row click | Navigate to detail page |
| Bulk actions | Checkbox column + action bar |
| Pagination | Page numbers + page size selector |
| Empty state | Illustration + "No projects yet" message |

---

## 4. Page Templates (Wireframes)

### 4.1 `/dashboard`

- **KPI row**: Active Projects, Budget Health %, Pending Approvals, Overdue Tasks
- **Chart row**: Cost overview (line chart), Budget distribution (donut)
- **List row**: Upcoming milestones (mini table), Recent inspections, My tasks
- **Empty state**: "Welcome! Create your first project to get started."

### 4.2 `/projects`

- **Toolbar**: "New Project" button, search input, status filter, date range picker
- **Table columns**: Name, Status, Location, PM, Budget, Progress (bar), Start/End dates
- **Row hover**: slight background change
- **Row click**: navigates to `/projects/[id]`
- **Loading state**: Skeleton rows

### 4.3 `/projects/[id]/overview`

- **Header**: Project name, address, status badge, edit button
- **Info cards**: Budget, Timeline, PM, Contractor
- **Progress**: Large progress bar with milestone markers below
- **Team**: Avatar list + "Add Member" button
- **Quick actions**: "New Inspection", "Upload Drawing", "Add Issue"

### 4.4 `/projects/[id]/schedule`

- **Default**: Gantt-chart style timeline of phases and tasks
- **Toggle**: Kanban board view for day-to-day task tracking
- **Phases**: vertical swimlanes (Foundation, Framing, MEP, Finishes)
- **Drag & drop**: reschedule by dragging task bars (Gantt) or cards (Kanban)

### 4.5 `/projects/[id]/drawings`

- **Grid layout**: Card per drawing with thumbnail, title, revision, date
- **Click**: Full-screen viewer with zoom, pan, rotate, layer toggles
- **Sidebar**: Version history, comments, approval status
- **Upload**: Drag-drop zone, automatically create new revision

### 4.6 `/projects/[id]/issues`

- **Table**: Issue #, Title, Priority (Critical/High/Medium/Low), Status, Assignee, Date
- **Priority colors**: Critical=red, High=orange, Medium=blue, Low=gray
- **Click**: Slide-over detail panel (not a new page) — Sheet component
- **Create**: Dialog with form (title, description, priority, assignee, photo upload)

### 4.7 `/inspections`

- **Map view**: Pin clusters of inspection sites
- **Table view**: Toggle to list with date, site, inspector, result (Pass/Fail)
- **Detail**: Checklist with pass/fail items, photo evidence, signature, PDF export

### 4.8 Auth Pages

- `/login` — Email + password form, "Sign in with Google" option
- `/signup` — Name, email, password, role selection
- `/forgot-password` — Email input, sends magic link via Supabase
- Layout: Centered card, project logo at top, clean background

---

## 5. Mobile / Field Strategy

### 5.1 Responsive Breakpoints

| Breakpoint | Width | Layout |
|---|---|---|
| `sm` | ≥640px | Single column, full-width |
| `md` | ≥768px | Two-column grids, sidebar visible |
| `lg` | ≥1024px | Sidebar expanded, multi-column |
| `xl` | ≥1280px | Max content width 1280px |

### 5.2 Field Worker UX

- **Bottom navigation** on mobile (Dashboard, Projects, Inspections, Profile)
- **Large touch targets** — buttons min 44px height
- **Offline-first** forms — draft inspections saved locally, synced when online
- **Camera integration** — tap to capture site photos, auto-upload when on WiFi
- **Simplified data entry** — radio groups, toggle switches, large selects instead of text inputs
- **Voice notes** — optional audio capture for field observations

### 5.3 PWA Considerations

- `manifest.json` with app name, icons, theme color
- Service worker for static asset caching
- Register as `display: standalone` for full-screen mobile experience
- Offline page for when network is unavailable

---

## 6. Folder Structure

```
apps/web/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── forgot-password/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx          ← sidebar + topbar shell
│   │   ├── page.tsx            ← /dashboard
│   │   ├── projects/
│   │   │   ├── page.tsx        ← /projects (list)
│   │   │   └── [id]/
│   │   │       ├── layout.tsx  ← tabs shell
│   │   │       ├── page.tsx    ← overview tab
│   │   │       ├── schedule/page.tsx
│   │   │       ├── budget/page.tsx
│   │   │       ├── drawings/page.tsx
│   │   │       ├── team/page.tsx
│   │   │       ├── issues/page.tsx
│   │   │       └── reports/page.tsx
│   │   ├── inspections/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── team/page.tsx
│   │   ├── reports/page.tsx
│   │   └── settings/page.tsx
│   ├── api/                    ← Next.js API routes
│   └── globals.css
├── components/
│   ├── ui/                     ← shadcn components
│   ├── layout/
│   │   ├── sidebar.tsx
│   │   ├── topbar.tsx
│   │   └── app-shell.tsx
│   ├── projects/
│   │   ├── project-card.tsx
│   │   ├── project-table.tsx
│   │   ├── phase-timeline.tsx
│   │   └── project-form.tsx
│   ├── inspections/
│   ├── drawings/
│   ├── kanban/
│   └── shared/
│       ├── status-badge.tsx
│       ├── kpi-card.tsx
│       ├── data-table.tsx
│       ├── file-dropzone.tsx
│       └── empty-state.tsx
├── hooks/
│   ├── use-auth.ts
│   ├── use-projects.ts
│   └── use-media-query.ts
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── middleware.ts
│   ├── utils.ts
│   └── constants.ts
└── types/
    ├── project.ts
    ├── inspection.ts
    └── user.ts
```

---

## 7. UX Writing Guidelines

- **Be direct and action-oriented**: "Add Project" not "Create a New Project"
- **Use construction terminology**: "Drawing" not "Document", "Inspection" not "Check", "Issue" not "Ticket"
- **Error messages**: "Unable to save inspection. Check your connection and try again." — not "Error 500"
- **Empty states**: "No inspections scheduled for this project." + CTA button
- **Confirmation dialogs**: "Are you sure you want to mark this issue as resolved?" + "Cancel / Resolve"

---

## 8. Accessibility

- All interactive elements reachable via keyboard
- Forms: labels associated with inputs, error messages announced
- Color: never rely on color alone — use icons + text + badges
- Focus indicators visible (ring-2 ring-primary)
- Alt text on all images, including drawings and blueprints
- Role attributes on custom interactive elements (combobox, dialog, tabpanel)

---

## 9. Initialization Order

When implementing this from scratch:

1. `pnpm create next-app@latest apps/web --typescript --tailwind --app`
2. `pnpm dlx shadcn@latest init` — follow prompts, use Tailwind v4
3. `pnpm dlx shadcn@latest add button card input label badge dialog sheet dropdown-menu table tabs form avatar tooltip toast select`
4. Define `globals.css` with the custom theme above
5. Build `app-shell.tsx` + `sidebar.tsx` + `topbar.tsx`
6. Build `status-badge.tsx`, `kpi-card.tsx`, `data-table.tsx`
7. Build login/signup pages with Supabase Auth
8. Build project list + detail pages
9. Iterate on remaining pages per priority

---

## 10. Reference Inspiration

- [Linear](https://linear.app) — clean dark-mode dashboard, kanban, minimal UI
- [Procore](https://www.procore.com) — industry standard construction management (reference UX patterns, not copy)
- [Cal.com](https://cal.com) — excellent shadcn/ui implementation, open-source
- [shadcn/ui examples](https://ui.shadcn.com/examples/dashboard) — dashboard template
