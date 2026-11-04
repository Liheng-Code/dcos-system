# 06 — UI/UX Design
## DCOS Stakeholder Management Module

| Field | Value |
|---|---|
| Document Code | DCOS-STK-UX-001 |
| Module | Stakeholder Management (Module 04 — Foundation) |
| Version | R1.0 |
| Status | Issued for Review |
| Author Role | Enterprise SaaS Designer |
| Date | 2026-08-08 |
| Related Documents | DCOS-STK-FS-001, DCOS-STK-UC-001, DCOS-STK-RBAC-001 |

---

## 1. Design Principles

This module should feel like **a construction control room**, not a marketing app.

| Principle | In Practice |
|---|---|
| Density over whitespace | A Document Controller scans 200 rows a day. Row height 44px, not 72px. |
| Status is information, not decoration | Colour carries one meaning only: lifecycle state. Nothing else is coloured. |
| No animation without function | Transitions ≤ 150ms and only where they clarify state change. No entrance animations, no parallax, no easing flourishes. |
| Every screen answers "who is responsible" | The four control questions are visible without drilling. |
| Failure states are informative | A blocked action explains what is missing and who can unblock it. Never a bare "Permission denied". |
| Nothing hidden behind hover | Touch devices and gloves exist. Actions are visible or in an explicit menu. |
| The table is the product | The register is the most-used screen in the module. It gets the most design attention. |

**Anti-patterns explicitly rejected:** avatar-heavy layouts, activity feeds styled like social timelines, gradient buttons, illustrated empty states with cartoon characters, celebratory confirmation animations, tooltips as the only carrier of critical information.

---

## 2. Layout System

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR   [Search stakeholders…]        [Filter ▾] [Export] [+ Add Stakeholder]│  56px
├────────┬────────────────┬──────────────────────────────┬─────────────────────┤
│        │ TYPE FILTER    │  MAIN WORKSPACE              │  DETAIL PANEL       │
│ SIDE   │                │                              │                     │
│ BAR    │ All        412 │  ┌────────────────────────┐  │  Angkor Structural  │
│        │ Client       6 │  │ Org │Type│Contact│Role │  │  Consultants Ltd    │
│ Dash   │ Consultant  18 │  │─────┼────┼───────┼─────│  │  ● Active           │
│ Proj   │ Subcontr.   47 │  │ ... │... │  ...  │ ... │  │                     │
│ WBS    │ Supplier   214 │  │ ... │... │  ...  │ ... │  │  1 Basic Info    ▾  │
│ Design │ Authority    9 │  │ ... │... │  ...  │ ... │  │  2 Project Assign ▸ │
│ Procur │ Testing      4 │  │ ... │... │  ...  │ ... │  │  3 Approval Auth  ▸ │
│ Constr │ Internal    14 │  │                        │  │  4 Access Control ▸ │
│ Docs   │ JV Partner   2 │  │                        │  │  5 Workflow Resp  ▸ │
│ QA/QC  │                │  └────────────────────────┘  │  6 Performance    ▸ │
│ HSE    │                │  ◀ 1–50 of 412 ▶             │                     │
│ HR     │                │                              │  [Edit] [⋯]         │
│ Acct   │                │                              │                     │
│ Report │                │                              │                     │
│ Admin ●│                │                              │                     │
└────────┴────────────────┴──────────────────────────────┴─────────────────────┘
  220px       200px              flexible (min 560px)            380px
```

### 2.1 Column Behaviour

| Region | Desktop ≥1440 | Laptop 1024–1439 | Tablet 768–1023 | Mobile <768 |
|---|---|---|---|---|
| Sidebar | 220px fixed | 64px icon rail | Off-canvas drawer | Off-canvas drawer |
| Type filter | 200px fixed | 200px fixed | Collapses to a horizontal chip row | Horizontal chip row, scrollable |
| Main workspace | Flexible | Flexible | Full width | Full width, card list not table |
| Detail panel | 380px, pinned | 380px, overlays on open | Full-screen sheet | Full-screen sheet |

The detail panel is **pinned** on desktop, meaning the register stays visible and selection moves between rows without losing context. This is the single most important layout decision in the module — a Document Controller comparing three suppliers should not be navigating back and forth.

---

## 3. Design Tokens

### 3.1 Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--surface-base` | `#FFFFFF` | `#141517` | Page background |
| `--surface-raised` | `#F7F8F9` | `#1C1E21` | Panels, table header |
| `--surface-hover` | `#F0F2F4` | `#24272B` | Row hover |
| `--surface-selected` | `#E8EEF6` | `#1E2A38` | Selected row |
| `--border-subtle` | `#E3E6E9` | `#2A2E33` | Table rules, dividers |
| `--border-strong` | `#C7CCD1` | `#3A3F46` | Input borders |
| `--text-primary` | `#16181B` | `#EDEEF0` | Body |
| `--text-secondary` | `#5C636B` | `#9BA1A9` | Labels, metadata |
| `--text-disabled` | `#9BA1A9` | `#5C636B` | Inactive |
| `--accent` | `#1F5FA8` | `#4A8FD6` | Primary action, focus ring |
| `--status-active` | `#1E7A44` | `#3FA968` | Active |
| `--status-pending` | `#B57A0A` | `#D9A22B` | Pending approval, draft-submitted |
| `--status-inactive` | `#6B7280` | `#8B929B` | Inactive, draft |
| `--status-suspended` | `#C2600C` | `#E08034` | Suspended |
| `--status-blacklisted` | `#B02A2A` | `#DC5757` | Blacklisted |
| `--warning-bg` | `#FDF3E3` | `#33270F` | Warning banner |
| `--danger-bg` | `#FCEDED` | `#33191A` | Destructive confirm |

Status colour appears **only** on status chips, the performance bar, and expiry indicators. It is never used for branding, headers, or emphasis.

### 3.2 Typography

| Token | Size / Line | Weight | Use |
|---|---|---|---|
| `--font-sans` | Inter, system-ui, "Noto Sans Khmer" | — | All text |
| `--font-mono` | JetBrains Mono, ui-monospace | — | Codes, WBS paths, registration numbers |
| `--text-xs` | 11px / 16px | 500 | Chips, metadata, table meta |
| `--text-sm` | 13px / 20px | 400 | Table body, form values |
| `--text-base` | 14px / 22px | 400 | Body, panel content |
| `--text-lg` | 16px / 24px | 600 | Panel section headings |
| `--text-xl` | 20px / 28px | 600 | Screen titles |

"Noto Sans Khmer" is in the stack because contact names and organisation names are routinely entered in Khmer script. A missing-glyph box in a stakeholder name is a data-integrity failure, not a cosmetic one.

### 3.3 Spacing, Radius, Elevation

Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48px.
Radius: `--radius-sm` 4px (chips, inputs), `--radius-md` 6px (cards, panels). Nothing larger.
Elevation: `--shadow-panel` `0 1px 3px rgba(0,0,0,0.08)`; `--shadow-modal` `0 8px 24px rgba(0,0,0,0.16)`. Two levels only.

### 3.4 Status Chip Specification

| Status | Dot | Label | Background | Text |
|---|---|---|---|---|
| Draft | ● grey | Draft | transparent | `--status-inactive` |
| Pending Approval | ● amber | Pending | `--warning-bg` | `--status-pending` |
| Active | ● green | Active | transparent | `--status-active` |
| Active + Preferred | ● green + ★ | Active | transparent | `--status-active` |
| Suspended | ● orange | Suspended | `--warning-bg` | `--status-suspended` |
| Inactive | ● grey | Inactive | transparent | `--status-inactive` |
| Blacklisted | ● red | Blacklisted | `--danger-bg` | `--status-blacklisted` |

Chips carry a dot **and** a text label. Colour alone never conveys status — required for accessibility and for the 8% of male users with colour vision deficiency who will be reading this register daily.

### 3.5 Internal vs External Marker

External stakeholders carry a small outlined badge `EXT` in `--text-secondary` immediately after the organisation name, in the table and the panel header. This is the single most consequential distinction in the module — an external party's access constraints differ fundamentally — and it must be visible at a glance without opening anything.

---

## 4. Navigation Placement

Primary: `Admin → Stakeholder Management`.
Contextual: `Projects → [Project] → Stakeholders` tab, which opens SCR-STK-014 (Project Stakeholder Matrix) rather than the global register. A Project Manager working on one project should not have to filter a 412-row tenant register down to their 80 rows.

---

## 5. Screen Specifications

---

### SCR-STK-001 — Stakeholder Register

**Purpose.** The working surface. Find, scan, compare, and open stakeholder records.
**Entry.** `Admin → Stakeholder Management`; global search result; notification deep link.
**Permission.** `STK.VIEW_LIST`.

**Components**

| Component | Behaviour |
|---|---|
| Type filter panel | 12 canonical types + "All". Live count per type from `mv_stakeholder_type_counts`. Active type has a 2px left accent bar and `--surface-selected` background. Switching type does not reload the page. |
| Search input | Autofocus on screen entry. Debounce 200ms. Minimum 2 characters. Searches organisation name, contact name, contact email, project role. Clear button appears when populated. |
| Filter button | Opens a popover: status (multi), project (single), discipline (multi), approval level (multi), access level (multi), compliance expiring within N days, reliability score band. Applied filters render as removable chips below the top bar. |
| Table | Columns: Organisation Name (with `EXT` badge), Stakeholder Type, Contact Person, Project Role, Approval Level, Status. Sticky header. Sortable on all columns except Approval Level. Row height 44px. |
| Row interaction | Hover → `--surface-hover`, cursor pointer. Click → opens detail panel, row takes `--surface-selected` and retains it. Keyboard: ↑↓ move selection, Enter opens, Esc closes panel. |
| Pagination | Cursor-based, 50 per page. "1–50 of 412" with ◀ ▶ controls. Not infinite scroll — Document Controllers work positionally and need a stable page reference. |
| Export | Visible only with `STK.EXPORT`. Exports the current filter set. |
| Add Stakeholder | Always visible per the module standard. Disabled with an explanatory tooltip if the user lacks `STK.CREATE`, never hidden — hiding it makes the permission model invisible. |

**Column detail**

| Column | Width | Content |
|---|---|---|
| Organisation Name | 28% | Legal name, `--text-sm` 500. Trading name below in `--text-xs --text-secondary` when different. `EXT` badge inline. |
| Stakeholder Type | 14% | Type label, `--text-sm` |
| Contact Person | 18% | Primary contact name; position below in `--text-xs` |
| Project Role | 16% | Role on the currently filtered project; "—" when no project filter, or "3 projects" when assigned to several |
| Approval Level | 12% | Highest level held on the filtered project; "—" if none |
| Status | 12% | Status chip |

**States**

| State | Presentation |
|---|---|
| Default | Table populated, counts shown |
| Loading (initial) | Skeleton rows, 8 placeholder rows matching final row height. No spinner. |
| Loading (filter change) | Existing rows dim to 60% opacity; a 2px indeterminate bar under the top bar. Rows are not cleared — losing context on every keystroke is worse than brief staleness. |
| Empty (no stakeholders in tenant) | "No stakeholders registered yet." Subtext: "Add your first stakeholder, or import from a spreadsheet." Two buttons: `+ Add Stakeholder`, `Import`. No illustration. |
| No results (filters applied) | "No stakeholders match these filters." Shows the active filter chips. Button: `Clear all filters`. |
| Error | Inline banner above the table: "Could not load the register." with `Retry`. Previously loaded rows remain visible if any. |
| No permission | The module does not appear in the Admin menu. Direct URL → "You do not have access to Stakeholder Management. Contact your Company Admin." |
| Offline | Read-only banner: "Offline — showing cached data from {time}." Write actions disabled. |

**Responsive**

- **Tablet:** type filter becomes a horizontal scrollable chip row above the table. Columns drop to Organisation, Type, Status. Detail panel becomes a full-screen sheet.
- **Mobile:** table becomes a card list. Each card: organisation name + `EXT` badge, type, primary contact, status chip. Search moves into a sticky header. Type filter is a chip row. Tap opens the full-screen detail sheet.

---

### SCR-STK-002 — Add Stakeholder

**Purpose.** Create an organisation record with duplicate protection.
**Entry.** `+ Add Stakeholder` from the register.
**Pattern.** Right-side drawer, 520px, four steps with a progress indicator. Drawer rather than modal so the register stays visible behind it — the user is often checking whether the organisation already exists.

**Steps**

1. **Type** — 12 type cards in a 2-column grid. Each card: type name and a one-line description of what that type means in practice ("Consultant — reviews and approves design deliverables"). Single select.
2. **Organisation** — legal name, trading name, registration number, tax ID, country, default currency, website. Duplicate check fires on blur of legal name.
3. **Contact** — first contact person. All fields from FR-STK-015. Automatically flagged primary.
4. **Compliance** — mandatory document types for the selected stakeholder type, listed with upload slots. Optional documents in a collapsed "Add other documents" section.

**Duplicate feedback**

| Result | Presentation |
|---|---|
| Clear | A small green check beside the legal name field: "No matching organisation found." |
| Fuzzy match | Inline amber card below the field, not a modal: shows the candidate's legal name, type, status, registration number, and project count, with two buttons: `Open existing record` and `This is a different organisation`. The second requires a reason in a text field before Continue re-enables. |
| Exact registration match | Red inline card. Only `Open existing record` is offered. No override path. |
| Blacklist match | Red inline card: "This organisation cannot be registered. Your Company Admin has been notified." No detail shown unless the user holds `STK.VIEW_DETAIL`, in which case the reason category and evidence reference are displayed. |

**States.** Default; validating (inline spinner on the duplicate check only, not the whole form); saving (footer button shows a spinner, form disabled); error (field-level messages plus a summary banner listing every failed field as an anchor link); unsaved-change guard on close.

---

### SCR-STK-003 — Stakeholder Detail Panel

**Purpose.** Single source of truth for one stakeholder.
**Pattern.** Right panel, 380px, six accordion sections in the exact order mandated by the module standard.

**Header**
```
Angkor Structural Consultants Ltd     [EXT]
Consultant                             ● Active  ★
Reg. 00012345 · Phnom Penh, KH
─────────────────────────────────────────────
[Edit]  [Assign to project]  [⋯]
```

The `⋯` menu contains: Suspend, Blacklist, Archive, View audit history, Export record. Destructive actions are separated by a divider and rendered in `--status-blacklisted`.

**Sections**

| # | Section | Collapsed Summary | Expanded Content |
|---|---|---|---|
| 1 | Basic Information | Type, country, status | Legal name, trading name, registration number, tax ID, country, currency, website, addresses, notes (masked for external roles) |
| 2 | Project Assignment | "3 active projects" | One card per assignment: project name, role, discipline, dates, status chip, contractual representative. Card click opens SCR-STK-004. |
| 3 | Approval Authority | "FINAL_APPROVE on 1, APPROVE on 2" | Per project: authority level, scope (module / entity type), threshold, fallback approver, active delegation |
| 4 | Access Control | "Limited · 5 modules · 2 WBS grants" | Per project: access level, module list as chips, WBS grants as breadcrumb paths, confidentiality tier |
| 5 | Workflow Responsibility | "4 of 8 enabled" | Eight toggle rows per project assignment, showing enabled state and who enabled it |
| 6 | Performance Tracking | "74% — below threshold" | Metrics + progress bar (see below) |

**Performance presentation**

```
Reliability score
████████████████░░░░░░░  74%     ⚠ Below 80% threshold
Based on 47 events · updated 2026-08-08 02:00

Average response time        18.4 days   (SLA 14)   ⚠
Approval delay               +4.2 days              ⚠
Task completion rate         88%                    ✓
Document turnaround          71%                    ⚠

[View event history]
```

The bar fills `--status-active` at ≥80%, `--status-suspended` at 60–79%, `--status-blacklisted` below 60%. Below 80% an amber warning row appears beside the bar. Fewer than 10 events renders "Insufficient data — 6 of 10 events required" with an unfilled bar, never a zero score.

**States.** Closed (register full width); loading (skeleton in section 1, others collapsed); archived record (grey banner: "This stakeholder is archived. Assignments are not possible."); blacklisted (red banner with reason, category, evidence reference, and who blacklisted it, for roles holding `STK.VIEW_DETAIL`); no permission for a section (section renders with a lock icon and "Restricted" — the section's existence is not hidden, so the user knows what to request access to).

---

### SCR-STK-004 — Project Assignment Drawer

**Purpose.** Create or edit an assignment. The most consequential screen in the module.
**Pattern.** Drawer, 560px, five sections in one scrollable form with a sticky footer. Not a wizard — Project Managers configure these repeatedly and need to jump between sections.

**Sections:** Assignment (project, role, discipline, contractual representative, contract reference, dates) · Approval Authority (embeds SCR-STK-005) · Access Control (embeds SCR-STK-006) · WBS Scope (embeds the picker) · Workflow Responsibility (embeds SCR-STK-007).

**Activation gate.** The footer shows a persistent readiness checklist rather than only failing on submit:

```
Ready to activate — 2 items remaining
  ✓ Project and role set
  ✓ Access level set
  ✗ Approval authority not set
  ✗ No workflow responsibility enabled
                          [Save as draft]  [Activate]
```

`Activate` is disabled until all four are satisfied. Each unmet item is a link that scrolls to and focuses the relevant section. Telling somebody what is wrong only after they press the button wastes their time twice.

**Blocked-assignment presentation.** If the selected stakeholder is not `ACTIVE`, the drawer replaces the form with an explanatory state:

```
⚠ Cannot assign this stakeholder

Mekong Interior Solutions Co., Ltd. is Blacklisted.

Reason:   Contract default
Evidence: DOC-2026-0442 (Termination Notice)
Recorded: 12 Feb 2026 by Sophea Chan, Project Director

If you believe this is incorrect, contact your Company Admin.
                                              [Close]
```

For roles without `STK.VIEW_DETAIL`, everything below "is Blacklisted." is replaced with "Contact your Company Admin for details."

---

### SCR-STK-005 — Approval Authority Configuration

**Purpose.** Set who can approve what.
**Pattern.** Section within SCR-STK-004, or standalone drawer when edited from the detail panel.

**Components**

| Component | Behaviour |
|---|---|
| Level selector | Four radio cards: No Approval, Review Only, Approve, Final Approval. Each carries a one-line consequence description ("Approve — can approve items at this workflow step; the step closes when a Final Approval is also satisfied"). |
| Scope | Two selects: Module (default `ALL`) and Entity Type (default `ALL`, filtered by module). `+ Add scoped authority` adds another row, so one assignment can hold different levels for different entity types. |
| Threshold | Numeric + currency, enabled only when level is `Approve` and module is `PROC` or `ACC`. Currency is locked to the project currency and shown disabled with a tooltip explaining why. |
| Fallback approver | Searchable select of other active assignments on the same project holding equal or higher authority. Marked required for `Approve` and `Final Approval`. |
| Delegation | Collapsed "Set temporary delegation" section: delegate assignment, start date, end date. End date required, max 90 days, enforced in the date picker itself. |
| Change reason | Textarea, appears automatically when the assignment has in-flight items. Required in that case. |

**In-flight warning.** When items are in flight, an amber banner sits above the form:

```
⚠ 4 items are currently routed to this approver
   3 structural submittals · 1 inspection request

   When you save:
   ○ Keep existing routing — in-flight items stay with the current approver
   ● Re-route in-flight items to the new approver

   [View items]
```

Making the routing choice explicit at the point of change is what prevents the "we thought it re-routed" argument three months later.

**Gap warning.** On save, if the configuration leaves a workflow step unroutable on any WBS branch:

```
⚠ This configuration leaves 1 workflow step with no approver

   Fit-out material approval · B01 / L18–L22
   No active assignment holds APPROVE for PROC / MATERIAL_APPROVAL on this branch.

   This gap will appear on the Project Stakeholder Matrix until resolved.

                        [Go back and fix]  [Save anyway]
```

---

### SCR-STK-006 — Access Control & WBS Scope Picker

**Purpose.** Bound what a party can see.

**Access level.** Three radio cards. For external stakeholders, `Full Access` is rendered disabled with the explanation: "Full access is not available for external stakeholders." It is shown-but-disabled rather than hidden, so the rule is visible rather than mysterious.

**Module scope.** Multi-select chip grid of module codes, enabled only for `Limited Access`. Modules the current user cannot themselves access are shown disabled.

**Confidentiality tier.** Slider, 1–4, with plain-language labels: 1 Issued / public · 2 Project internal · 3 Commercial · 4 Internal commercial. Capped at 2 for external stakeholders, with the upper range visibly disabled.

**WBS scope picker**

```
WBS Scope                    ○ Full project    ● Restricted to selected nodes

  Search WBS…                                     3 grants · 47 nodes covered
  ┌──────────────────────────────────────────────────────────────┐
  │ ▾ ☐ P001 Tower A                                             │
  │   ▾ ☑ B01 Main Building                    ← direct grant     │
  │     ▸ ☑ L01 Ground Floor          inherited                   │
  │     ▸ ☑ L02 Level 2               inherited                   │
  │     ▸ ☑ L03 Level 3               inherited                   │
  │     ▸ ☑ L04 Level 4               inherited                   │
  │     ▸ ☑ L05 Level 5               inherited                   │
  │     ▸ ☐ L06 Level 6                                           │
  │     ▸ ☐ L07 Level 7                                           │
  │   ▸ ☐ B02 Annex                                               │
  └──────────────────────────────────────────────────────────────┘

  Granted:  B01 › L01–L05  (5 grants, 47 descendant nodes)
```

Inheritance must be visually explicit. A checked-and-greyed checkbox with the word "inherited" is the difference between a Project Manager understanding that granting `L03` also grants every zone, room, and element beneath it — and discovering that fact when a subcontractor sees something they should not.

Selecting an ancestor that would grant everything triggers a confirmation: "Granting the project root gives access to the entire project. For a subcontractor this defeats the purpose of a scope restriction. Continue?"

---

### SCR-STK-007 — Workflow Responsibility Toggles

**Purpose.** Declare what this party actually does.
**Pattern.** Eight labelled toggle rows.

Each row: responsibility name, a one-line description of the real workflow effect, the toggle, and — once enabled — small metadata showing who enabled it and when.

```
Document Review                                          [ ●──]  ON
Receives documents for review and can record review decisions
Enabled by Chan Sopheak · 12 Jun 2026

Inspection Approval                                      [──○ ]  OFF
Can approve inspection requests and close NCRs
⚠ Requires at least Approve authority — set authority first
```

Toggles requiring `APPROVE` authority (`INSPECTION_APPROVAL`, `PAYMENT_CERTIFICATION`) render disabled with the inline explanation when authority is insufficient. Turning off a responsibility with in-flight items opens a blocking dialog listing them.

---

### SCR-STK-008 — Contact Management

**Purpose.** Manage the people, not just the organisation.
**Pattern.** List within the detail panel, expanding to a drawer for add and edit.

Each contact row: name (Latin), name (local script) beneath if present, position, discipline chip, primary star, external-login indicator, active state. Actions per row: Edit, Set as primary, Provision login, Deactivate.

**Primary change.** Selecting "Set as primary" on a non-primary contact shows an inline confirm: "Sok Dara will replace Chea Ratana as the primary contact." Atomic; no intermediate state where two or zero contacts are primary.

**Deactivation block.**
```
⚠ Cannot deactivate this contact

Chea Ratana is the only approver on 2 open items:

  SUB-2026-0113  Structural submittal · awaiting review · 4 days
  IR-2026-0498   Inspection request · awaiting approval · 1 day

Reassign these items before deactivating.
                              [Reassign items]  [Cancel]
```

---

### SCR-STK-009 — Compliance Document Register

**Purpose.** Prove the party is legally and contractually current.
**Pattern.** Table within the detail panel.

Columns: Document Type, Reference, Issued, Expires, Status indicator, Actions.

**Expiry indicator**

| Condition | Presentation |
|---|---|
| No expiry | "—" in `--text-disabled` |
| > 60 days | Green dot + date |
| 31–60 days | Amber dot + date + "in 47 days" |
| 8–30 days | Amber dot + date + "in 21 days", row background `--warning-bg` |
| ≤ 7 days | Red dot + date + "in 3 days", row background `--danger-bg` |
| Expired | Red dot + "Expired 9 days ago", row background `--danger-bg`, plus a "Mandatory" badge if applicable |
| Superseded | Row in `--text-disabled`, collapsed under "Show superseded (3)" |

A missing mandatory document renders as a placeholder row with a red outline and an `Upload` button, so absence is as visible as expiry. An empty list is not the same as compliance.

**Upload.** Drag-and-drop zone plus file picker. Progress bar during upload; "Scanning…" state during virus scan; the record is not created until the scan returns clean. Rejections state the specific reason ("File is 34 MB. Maximum is 25 MB.") rather than a generic failure.

---

### SCR-STK-010 — Performance Tracking Panel

Specified in SCR-STK-003 §6. The standalone expansion adds an event history table: date, source module, entity reference, assigned, completed, SLA, elapsed, within-SLA flag, context note. Filterable by project, module, and date range. Exportable with `STK.VIEW_PERFORMANCE` + `STK.EXPORT`.

Scores are never editable. There is no edit affordance anywhere on this screen — not a disabled one, not a hidden one. A context note may be added against an individual event to record mitigating circumstances, but the event itself is immutable.

---

### SCR-STK-011 — Status Change / Blacklist Dialog

**Purpose.** Make consequential state changes deliberate.
**Pattern.** Centred modal, 480px. Modal, not drawer — this needs to interrupt.

**Suspend**
```
Suspend Angkor Structural Consultants Ltd

This will:
  • Block new project assignments
  • Freeze 3 active assignments
  • Escalate 2 in-flight approvals to fallback approvers

Reason category *
  [ Compliance lapse                                    ▾ ]

Reason *
  [                                                       ]
  [                                                       ]

                                    [Cancel]  [Suspend]
```

The consequence list is computed live for this specific stakeholder, not generic copy. A Project Director should know that two approvals will move before they click, not afterwards.

**Blacklist**
```
⚠ Blacklist Mekong Interior Solutions Co., Ltd.

This action affects the entire company, not just this project.

This will:
  • Terminate 2 assignments across 2 projects
  • Revoke 4 external user logins immediately
  • Block this organisation from all future assignments
  • Block registration of similarly-named organisations
  • Leave 14 open items requiring reassignment

Reason category *      [ Contract default              ▾ ]
Reason *               [ min. 20 characters             ]
Evidence reference *   [ Document ID or notice ref      ]

Type the organisation's legal name to confirm *
  [                                                       ]
  Must match exactly: Mekong Interior Solutions Co., Ltd.

                                  [Cancel]  [Blacklist]
```

`Blacklist` stays disabled until every required field is complete and the typed name matches character for character. This is the highest-consequence action in the module; the friction is the feature.

---

### SCR-STK-012 — External User Provisioning

**Purpose.** Give an outside party a login without giving them the company.
**Pattern.** Drawer, 480px.

Contents: contact selector (contacts with a valid email only; others shown disabled with "No email address on file"), external role selector (four options with plain descriptions), a read-only **effective access preview**, and the invitation notice.

**Effective access preview** — the most important element on this screen:

```
This user will be able to access:

  Project      Tower A
  Modules      Documents · RFI · Design Review
  Discipline   STR only
  WBS scope    Entire project
  Authority    Review only — cannot approve
  Documents    Up to tier 2 (Project internal)

  They will NOT see: cost data, other disciplines,
  internal documents, or any other project.
```

Rendered from the same resolution logic that will enforce access at runtime, not from a hand-written summary. Somebody granting external access should see exactly what they are granting, in the words of what the person will experience.

**Active links list** shows status (Invited / Active / Expired / Revoked), invited date, last login, with `Resend invitation` and `Revoke access` actions. Revoke opens a confirm modal stating the action is immediate and irreversible.

---

### SCR-STK-013 — Bulk Import & Validation Report

**Purpose.** Get legacy spreadsheets into the system without importing their mess.
**Pattern.** Full-page, three steps: Upload → Validate → Commit.

**Step 1.** Template download link (prominent — most import failures start with a wrong template), drag-and-drop upload, column mapping table where source headers map to target fields with auto-suggested matches.

**Step 2 — Validation report** (dry run, no writes):

```
Validation complete — 480 rows analysed

  ✓ 402  Ready to import
  ⚠  61  Match an existing stakeholder
  ⚠  12  Duplicate within this file
  ✗   5  Invalid — cannot import

  [All]  [Ready]  [Matches existing]  [Internal duplicates]  [Invalid]

  Row  Organisation             Issue                          Action
  ───────────────────────────────────────────────────────────────────
  14   ABC Trading              Matches "ABC Trading Co Ltd"    [Merge ▾]
  22   Sok Dara Construction    Duplicate of row 19             [Skip ▾]
  31   Mekong Interiors (Cam)   Blacklisted organisation        Blocked
  47   Delta Supply             Invalid email: "delta@"         [Fix ▾]
  58   —                        Missing legal name              [Fix ▾]
```

Row 31 has no action affordance at all. A blacklisted match is not a choice.

**Step 3 — Commit.** Confirmation stating exactly what will happen: "402 stakeholders will be created in Draft status. 61 rows will be merged into existing records. 17 rows will be skipped. Imported records must be verified individually before they can be assigned to a project." Post-commit reconciliation report is downloadable and retained.

---

### SCR-STK-014 — Project Stakeholder Matrix

**Purpose.** Answer "who is who on this project" in one view, and expose gaps before they cause a halt.
**Entry.** `Projects → [Project] → Stakeholders`.

```
Tower A — Stakeholder Matrix                    47 parties · 2 defects
                              [Group by: Role ▾]  [Export]  [+ Assign]

⚠ 2 configuration defects
   • Fit-out material approval (B01/L18–L22) — no eligible approver
   • Fire Authority — no contractual representative assigned
   [Review defects]

CLIENT & CONSULTANTS
Organisation              Role         Disc  Authority       Access      Resp    Status
─────────────────────────────────────────────────────────────────────────────────────
Mekong Development  EXT   Employer     ALL   Final Approval  Limited·5   3/8     ● Active
Angkor PMC          EXT   PMC          ALL   Approve         Limited·7   5/8     ● Active
Angkor Structural   EXT   STR Consult  STR   Approve         Limited·3   2/8     ● Active
Delta MEP           EXT   MEP Consult  MEP   Approve         Limited·3   2/8     ⚠ Suspended

SUBCONTRACTORS  (12)                                                        [expand]
SUPPLIERS  (28)                                                             [expand]
AUTHORITIES  (4)                                                            [expand]
```

The defect banner is the point of this screen. A Project Manager should discover an unroutable approval step during mobilisation — not when a drawing halts in month nine and nobody understands why.

Export produces a formatted matrix suitable for the project kick-off record and the ISO 9001 quality plan.

---

### SCR-STK-015 — Mobile Stakeholder Directory

**Purpose.** A site supervisor needs a phone number, standing in the rain, with no signal.
**Pattern.** Mobile-first, read-only, offline-capable.

```
┌─────────────────────────────┐
│ ← Stakeholders          ⟳   │
│ ┌─────────────────────────┐ │
│ │ 🔍 Search               │ │
│ └─────────────────────────┘ │
│ [All][Subs][Suppliers][Con] │
│                             │
│ Mekong Blockwork      EXT   │
│ Subcontractor · ARC         │
│ Sok Vanna · Site Manager    │
│ 📞 012 345 678   ✈ @sokvanna│
│ ─────────────────────────── │
│ Angkor Structural     EXT   │
│ Consultant · STR            │
│ Sok Dara · Review Lead      │
│ 📞 077 888 999   ✉ email    │
│ ─────────────────────────── │
│                             │
│ Updated 2 hours ago         │
└─────────────────────────────┘
```

Tapping a phone number dials. Tapping the Telegram handle opens Telegram. Tapping the row opens a read-only detail sheet with all contacts for that organisation and their project scope.

**Offline behaviour.** Cache age is shown at the bottom of every screen. Beyond 7 days a persistent amber bar appears: "Directory last updated 9 days ago. Connect to refresh." No write action is available offline — and critically, no approval or access decision is ever computed on-device. Cached scope may be stale, and an authority decision made against stale scope cannot be undone.

---

## 6. Interaction Patterns

| Pattern | Specification |
|---|---|
| Instant search | 200ms debounce, minimum 2 characters, request cancellation on new input, results replace in place without layout shift |
| Filter chips | Below top bar, each removable with ×, plus "Clear all" when two or more are active |
| Row selection | Single. Persists while the panel is open. Survives sort and pagination where the row remains visible. |
| Panel open/close | 150ms slide. No fade, no bounce. |
| Unsaved changes | Closing a drawer with dirty fields → "Discard changes? Your edits will be lost." with `Keep editing` / `Discard`. |
| Optimistic updates | Used only for toggles and primary-contact changes. Everything touching authority, access, or status is pessimistic — the UI does not show an authority change as applied until the server confirms it. |
| Concurrency conflict | 409 → modal showing field-level differences between the user's version and the current one, with `Reload and reapply` / `Cancel`. Never a silent overwrite. |
| Bulk selection | Not offered in MVP. Bulk authority or access changes are too consequential for a checkbox column. |
| Keyboard | `/` focus search · `↑↓` move row selection · `Enter` open panel · `Esc` close panel or drawer · `Ctrl/Cmd+K` global search · Tab order follows visual order |

---

## 7. Form Design Standards

- Labels above inputs, left-aligned, `--text-xs` `--text-secondary`, 500 weight.
- Required fields marked with `*` after the label. Optional fields are never marked "(optional)" — the asterisk carries the whole signal.
- Input height 36px, radius 4px, `--border-strong` border, 2px `--accent` focus ring with 2px offset.
- Validation on blur for format rules; on submit for cross-field rules. Never on keystroke — validating an email while it is being typed is a hostile pattern.
- Error text below the field in `--status-blacklisted`, `--text-xs`, with a matching border colour change.
- Error messages state what is wrong and what to do: "Expiry date must be after the issue date (12 Mar 2026)." Not "Invalid date."
- Grouped fields use a labelled fieldset with a 1px top rule, not a card.
- Sticky footer for primary actions in every drawer. Primary right, secondary left of it, destructive far left.

---

## 8. Table Design Standards

Density: 44px rows, 12px horizontal cell padding. Header 40px, `--surface-raised`, sticky, `--text-xs` uppercase 600.
Sorting: click header to sort, click again to reverse, third click clears. Active sort shows a caret.
Column resize: drag handles on the header, widths persisted per user per screen.
Pagination over infinite scroll, for positional stability and predictable export scope.
Row density toggle (comfortable 52px / compact 36px) persisted per user — deferred to Phase 2.

---

## 9. Empty States and First Run

| Context | Content |
|---|---|
| Empty register | "No stakeholders registered yet." / "Add your first stakeholder, or import an existing list from a spreadsheet." / `+ Add Stakeholder` `Import` |
| No project assignments | "This stakeholder is not assigned to any project." / `Assign to project` |
| No compliance documents | "No compliance documents on file." Mandatory types listed as placeholder rows with `Upload` buttons. |
| No performance data | "Insufficient data. 6 of 10 required events recorded." / "A reliability score appears once this stakeholder has completed at least 10 SLA-bearing items." |
| No external users | "No external logins provisioned." / `Provision access` |
| Empty project matrix | "No stakeholders assigned to Tower A." / "Start with the client and lead consultant — the approval matrix must be complete before documents can be issued for construction." |

No illustrations. No cartoon characters. A short factual sentence and the action that resolves it.

---

## 10. Error and Permission-Denied Presentation

| Situation | Presentation |
|---|---|
| Load failure | Inline banner above the content region with `Retry`. Existing content preserved. |
| Save failure (server) | Toast, bottom-left, 6s, with `Retry`. Form state preserved and still editable. |
| Save failure (validation) | Summary banner at the top of the form listing each failed field as an anchor link, plus field-level messages. |
| Action not permitted | Control rendered disabled with a tooltip naming the required permission: "Requires Assign Project permission. Contact your Company Admin." |
| Screen not permitted | Full-screen state: "You do not have access to Stakeholder Management." plus who to contact. |
| Record not found or out of scope | "This record is not available." No distinction is drawn between "does not exist" and "not permitted" — the API returns 404 for both, and the UI must not leak the difference. |
| Session expired | Modal: "Your session has expired. Sign in to continue." Unsaved form data is preserved in memory and restored after re-authentication. |

---

## 11. Accessibility

| Requirement | Standard |
|---|---|
| Contrast | 4.5:1 body text, 3:1 large text and UI boundaries. All status colours verified against both themes. |
| Colour independence | Every status carries a dot shape and a text label. Colour is never the sole carrier. |
| Focus | Visible 2px `--accent` ring with 2px offset on every interactive element. Never removed. |
| Keyboard | Every action reachable without a pointer. Logical tab order. Focus trapped in modals, returned to the trigger on close. |
| Screen readers | Table with proper `<th scope="col">`. Status chips with `aria-label="Status: Active"`. Live region announcing filter result counts. Accordion sections with `aria-expanded`. |
| Touch targets | Minimum 44×44px on all touch surfaces. |
| Motion | All transitions respect `prefers-reduced-motion`, reducing to instant state change. |
| Zoom | Usable at 200% without horizontal scroll on the main workspace. |
| Language | `lang` attribute set per text run so Khmer content is announced correctly. |

---

## 12. Dark Mode

Not an inversion. Surfaces are neutral dark greys rather than pure black to reduce halation on OLED site tablets. Status colours are lightened for contrast against dark surfaces (see §3.1). Elevation is conveyed by surface lightness rather than shadow. Follows the system preference by default with a manual override persisted per user.

---

## 13. Mobile and Field Considerations

What a Site Supervisor actually needs from this module on a phone, in priority order:

1. **A phone number, fast.** Search, tap, dial. Three interactions maximum.
2. **A Telegram handle.** Site coordination in Cambodia runs on Telegram; the handle must be one tap from the directory.
3. **Who is responsible for this scope.** "Which subcontractor has L05 blockwork?"
4. **Offline availability.** Basements, lift shafts, and rural sites have no signal.

What they do **not** need on a phone: creating stakeholders, configuring authority, setting WBS scope, or blacklisting. Those are office tasks on a large screen, and offering them on mobile invites mistakes with consequences that are hard to reverse. The mobile surface is deliberately read-only.

---

## 14. Microcopy Library

**Buttons:** `+ Add Stakeholder` · `Assign to project` · `Activate` · `Save as draft` · `Provision access` · `Revoke access` · `Suspend` · `Reinstate` · `Blacklist` · `Remove blacklist` · `Archive` · `Set as primary` · `Reassign items` · `Clear all filters` · `Retry` · `Discard` · `Keep editing`

**Confirmations**
- Suspend: "Suspend {org}? New assignments will be blocked and {n} active assignments will freeze."
- Blacklist: "This action affects the entire company, not just this project."
- Revoke: "Revoke access for {name}? They will be signed out immediately. This cannot be undone."
- Archive: "Archive {org}? The record is retained for history but cannot be assigned to projects."
- Discard: "Discard changes? Your edits will be lost."

**Warnings**
- "{n} items are currently routed to this approver."
- "This configuration leaves {n} workflow steps with no approver."
- "Reliability score is below the 80% threshold."
- "{doc} expires in {n} days."
- "{doc} expired {n} days ago. This stakeholder will be suspended automatically."
- "Granting the project root gives access to the entire project."
- "Directory last updated {n} days ago. Connect to refresh."

**Errors**
- "Organisation legal name is required."
- "Enter a valid email address."
- "This registration number is already registered to {org}."
- "A stakeholder with this identity already exists."
- "This organisation cannot be registered. Your Company Admin has been notified."
- "Cannot assign a {status} stakeholder."
- "This stakeholder is already assigned to this project."
- "Set an approval authority level before activating."
- "Enable at least one workflow responsibility."
- "External stakeholders cannot be granted full access."
- "Fallback approver must hold equal or higher authority."
- "Expiry date must be after the issue date ({date})."
- "File is {size}. Maximum is 25 MB."
- "This file type is not permitted. Upload a PDF, JPG, or PNG."
- "{n} open items must be reassigned before this assignment can be terminated."
- "This record was changed by {user}. Review the differences before saving."
- "Typed name does not match. Enter the organisation's legal name exactly."
- "Requires {permission} permission. Contact your Company Admin."
- "This record is not available."

**Success**
- "{org} registered and submitted for verification."
- "{org} assigned to {project}."
- "Assignment activated."
- "Invitation sent to {email}. It expires in 7 days."
- "Access revoked."
- "{n} stakeholders imported as drafts."

---

## 15. Open Questions

| ID | Question | Impact |
|---|---|---|
| Q-21 | Should the detail panel be pinned or overlaying at 1024–1439px? Pinning leaves 440px for the table, which is tight for six columns. | Laptop layout |
| Q-22 | Is a row-density toggle worth building, or is one well-chosen density sufficient? | Phase 2 scope |
| Q-23 | Should the mobile directory expose the project matrix, or is a flat contact list sufficient for field use? | Mobile scope |
| Q-24 | Should the effective-access preview appear on the assignment drawer as well as external provisioning? | Consistency vs form length |

---

## 16. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1.0 | 2026-08-08 | Initial issue — 15 screens, tokens, patterns, microcopy | Enterprise SaaS Designer |

---

**End of Document**
