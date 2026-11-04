# DCOS — Project Setup Module
## 06 — UI/UX Design

| Field | Detail |
|---|---|
| Document Code | DCOS-PRJ-UIX-001 |
| Version | R1 |
| Module | 04-02 — Project Setup (Foundation Phase) |
| Author Persona | Enterprise SaaS Product Designer |
| Status | Issued for Review |
| Depends On | DCOS-PRJ-FS-001, DCOS-PRJ-UC-001, DCOS-PRJ-RBAC-001 |

---

## 1. Design Principles

Per DCOS UI philosophy: left sidebar navigation, top global search, dashboard-driven workflow, data-dense but readable, dark/light mode, minimal clicks, real-time notifications, role-based personalisation. Module-specific principles:

- **Status is always visible.** Every project screen shows the status chip (color-coded) and phase position in the header — users must never act without knowing the project state.
- **The wizard never loses work.** Each step saves independently; abandoning mid-wizard leaves a resumable DRAFT.
- **Blocked means explained.** Every disabled action shows a tooltip with the gate reason ("Project on hold since 02 Jul — resume requires Director approval").
- **Read-only is styled, not hidden.** In CLOSED/ARCHIVED states, data remains visible with a read-only banner rather than disappearing.

Status chip colors: DRAFT gray · TENDER blue · BID_SUBMITTED indigo · AWARDED teal · ACTIVE green · ON_HOLD amber · COMPLETED purple · CLOSED slate · LOST/CANCELLED red · ARCHIVED dark gray.

## 2. Screen Inventory

| ID | Screen | Primary Roles |
|---|---|---|
| PRJ-SCR-001 | Portfolio List | All internal roles |
| PRJ-SCR-002 | Project Creation Wizard | Admin, Director |
| PRJ-SCR-003 | Tender Board | Tender team, Director |
| PRJ-SCR-004 | Project Overview Dashboard | All assigned |
| PRJ-SCR-005 | Award Conversion Checklist | PM, QS, DC, Director |
| PRJ-SCR-006 | Team Roster | PM, Admin, Director |
| PRJ-SCR-007 | Contract Header | QS, PM, Director |
| PRJ-SCR-008 | Milestones | QS, PM, Director |
| PRJ-SCR-009 | Calendar Editor | PM, Admin |
| PRJ-SCR-010 | Numbering Rules | Document Controller, Admin |
| PRJ-SCR-011 | Project Settings | Admin, PM |
| PRJ-SCR-012 | Status Change Modal | Per RBAC |

---

### PRJ-SCR-001 — Portfolio List

**Purpose:** company-wide project registry with filters and saved views (PRJ-FR-004).

```
┌────────────────────────────────────────────────────────────────┐
│ Projects                     [+ New Project]  [Saved Views ▾]  │
│ [Search…] [Status ▾] [Phase ▾] [Type ▾] [Client ▾] [PM ▾]      │
├──────┬──────────────┬─────────┬────────┬──────────┬───────────┤
│ Code │ Name         │ Status  │ Phase  │ Client   │ PM        │
│ P014 │ Tower A      │ ●ACTIVE │ EXEC   │ Mekong D.│ Sokha     │
│ P015 │ Riverside Mall│ ●TENDER│ INIT   │ Delta Gr.│ —         │
└──────┴──────────────┴─────────┴────────┴──────────┴───────────┘
Pipeline strip: TENDER $18.2M · BID $12.4M · AWARDED $0 · ACTIVE $46.1M
```

**Components:** data table (cursor pagination), pipeline value strip, status chips, saved-view selector.
**States:** loading skeleton rows · empty ("No projects yet — create your first project") · error with retry.
**Role visibility:** C¹ roles see assigned projects only; Admin/Director see all; Viewer read-only (no New Project button).

### PRJ-SCR-002 — Project Creation Wizard

**Purpose:** guided creation, DRAFT until complete (PRJ-FR-001).

Steps (left stepper rail): **1 Classification → 2 Client → 3 Contract → 4 Team → 5 Calendar → 6 Numbering → 7 Review**.

- Step saves independently ("Saved ✓" toast); browser-close safe; unsaved-changes guard on in-step navigation.
- INTERNAL type: steps 2 and 3 collapse to optional; Review offers "Create & Activate" (BR-PRJ-005 shortcut).
- Code field validates live; duplicate shows inline error + "Use P016 instead?" suggestion chip.
- Review step summarises all entries with per-step edit links.

**States:** per-step validation errors inline; resume banner when reopening a DRAFT ("Continue setup — 4 of 7 steps done").

### PRJ-SCR-003 — Tender Board

**Purpose:** kanban of the tender pipeline (PRJ-FR-010–014).

Columns: **TENDER → BID_SUBMITTED → AWARDED | LOST** (LOST collapsed by default). Cards show client, estimated value, and a deadline countdown chip that turns amber at 7 days, red at 3. Card actions: Record Bid, Record Result. Drag-and-drop disabled — transitions only through actions (guards must run).

### PRJ-SCR-004 — Project Overview Dashboard

**Purpose:** single project home (PRJ-FR-091/092 project scope).

```
┌ P014 Tower A  ●ACTIVE  Phase: EXEC ▸  PM: Sokha  [Actions ▾] ┐
├───────────────┬───────────────────┬───────────────────────────┤
│ Setup 100% ◔  │ Contract          │ Milestones                │
│ (ring widget) │ USD 12.40M LUMP_SUM│ ▮▮▮▯▯ timeline           │
│               │ +$250k rev (R2)   │ Next: Struct. topping-out │
├───────────────┴───────────────────┴───────────────────────────┤
│ Team roster card (8 active)   │ Recent status history         │
└────────────────────────────────────────────────────────────────┘
```

Setup-completeness ring links to open checklist items. Actions menu is RBAC + status filtered (e.g., "Place on hold" visible to PM in ACTIVE only).

### PRJ-SCR-005 — Award Conversion Checklist

**Purpose:** the mobilisation cockpit (PRJ-FR-020, UC-005).

Blocking items pinned on top with red "Blocking" badges; each row shows status, owner suggestion, evidence link, and a deep-link action button ("Enter contract header →", "Configure numbering →"). Footer: **Request Activation** — disabled with explanatory tooltip until all blocking items COMPLETED; shows working-days-since-award counter vs the 10-day target.

### PRJ-SCR-006 — Team Roster

**Purpose:** effective-dated membership (PRJ-FR-040–043).

Timeline view per member (horizontal bars over project duration) + table view toggle. PM row visually pinned with crown icon. **Change PM** opens a dedicated modal (incoming PM + effective datetime) — never editable inline, reflecting the atomic swap. Removing a member surfaces the open-items reassignment panel before confirmation.

### PRJ-SCR-007 — Contract Header

**Purpose:** head contract facts + revision history (PRJ-FR-050–053).

Original value displayed locked (padlock icon, tooltip: "Original value is immutable — use revisions"). Current value computed banner: `Original 12,400,000 + Revisions 250,000 = Current 12,650,000 USD`. Right-side **Revisions drawer**: chronological list with delta, reason, reference, approver. Currency field disabled with lock note once `currency_locked`.

### PRJ-SCR-008 — Milestones

**Purpose:** milestone control (PRJ-FR-060–062).

Views: timeline (default) and table. Contractual milestones carry an LD flag icon. Row actions: Achieve (date + evidence picker) / Miss (reason modal, warning banner for contractual: "This will raise a Critical alert to the Director"). Overdue PLANNED rows highlighted red.

### PRJ-SCR-009 — Calendar Editor

**Purpose:** working pattern + holidays (PRJ-FR-070/071).

Month grid with working days shaded; company-inherited holidays shown with a building icon, project-specific with a flag icon; clicking an inherited holiday offers "Make working day (override)". Working-pattern editor: day toggles + start/end time. Banner: "Changes apply from today forward only."

### PRJ-SCR-010 — Numbering Rules

**Purpose:** pattern builder with lock state (PRJ-FR-080–082).

Per record type row: pattern (token chips), live preview (`P014-STR-DWG-B01-L05-001-R00`), next sequence, and state badge **Unlocked ✎ / Locked 🔒**. Locked rows are read-only with tooltip: "Locked on first issue (02 Apr 2026). Create a new record-type rule if a different pattern is needed." Token palette drag-in with validation ("Pattern must contain {SEQ:n}").

### PRJ-SCR-011 — Project Settings

Key-value settings grouped (Commercial defaults, Workflow, Notifications, Regional). Every change confirms with before→after summary (feeds audit).

### PRJ-SCR-012 — Status Change Modal

Universal modal for all transitions: shows from→to, mandatory reason field when required, the resolved approval chain ("Will be sent to: Project Director — Dara"), and consequence summary ("On hold blocks new tasks, documents and PRs on this project"). Confirmation checkbox for CANCELLED with committed-cost warning panel.

## 3. Interaction Rules

| Rule | Behaviour |
|---|---|
| Status-driven read-only | CLOSED/ARCHIVED render a top banner "Read-only — project closed 12 Jan 2027"; all inputs disabled, not hidden |
| Destructive confirmations | Cancel/miss/remove require typed or checkbox confirmation with consequence text |
| Unsaved changes | Wizard and editors guard navigation with save/discard prompt |
| Blocked actions | Disabled + tooltip with gate reason; never silently missing for roles that hold the permission |
| Real-time | Status chip, checklist, and roster update live via realtime channel; concurrent-edit toast ("Updated by Dara just now — refresh") |

## 4. Mobile Considerations

| Screen | Mobile |
|---|---|
| Portfolio List | Read-only cards with status chip and search |
| Project Overview | Read-only summary (status, milestones, team) |
| Milestones | View + Achieve with photo evidence (field use) |
| Wizard, Numbering, Calendar editor, Contract | **Desktop-only** — complexity unsuitable for small screens; mobile shows "Open on desktop" note |

Offline: cached project list and calendar per Integration Spec §4.7; sync status indicator on every mobile screen.

## 5. Accessibility & i18n

- WCAG AA contrast in both themes; status never conveyed by color alone (chip text always present).
- Full keyboard navigation of wizard and tables; focus management in modals.
- EN/KM string externalisation; dates rendered per locale; Khmer numerals not used in generated record numbers (numbering patterns are ASCII by contract).

## 6. Change Log

| Version | Date | Change | Author |
|---|---|---|---|
| R1 | 2026-08 | Initial issue | Product Designer |
