# DCOS — Module 04-11 Procurement
## Document 06 — UI / UX Design

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-06 |
| Version | R1 |
| Platforms | Web (Next.js + Tailwind + shadcn/ui), Mobile (React Native) |
| Status | For Development |

---

## 1. Design Principles for This Module

| Principle | Application |
|---|---|
| **Money must be visible before it is spent** | Budget position appears on the PR screen while the buyer types, not on a report next month |
| **The blocked gate is shown before the button** | Pre-issue checks render as a live checklist above the Approve button |
| **Comparison beats data entry** | The CBA screen is the centre of gravity of this module, not the PO form |
| **Never hide the arithmetic** | Normalised prices always shown alongside as-quoted, with the adjustment breakdown expandable |
| **Site users get three fields, not thirty** | Mobile MR is item, quantity, date. Everything else is inferred or optional |
| **Approval must be possible in 15 seconds on a phone** | Approval cards carry the decision-relevant facts, not the full record |
| **Sealed means visibly sealed** | Bid values render as a lock icon and a countdown, not as blanks that look like a bug |

---

## 2. Navigation Structure

```text
Procurement
├── Dashboard
├── Requisitions
│   ├── Material Requisitions (MR)
│   └── Purchase Requisitions (PR)
├── Sourcing
│   ├── RFQ Register
│   ├── Bid Opening Queue
│   └── Evaluations & CBA
├── Orders
│   ├── Purchase Orders
│   ├── Amendments
│   ├── Call-Offs
│   └── Expediting Board
├── Deliveries
│   ├── Incoming Deliveries
│   └── Match Exceptions
├── Long-Lead Register
├── Reports
└── Settings (approval bands, tolerances, reason codes)
```

Procurement also appears as a **tab inside the WBS / Task Workspace** — selecting a WBS node and opening the Procurement tab shows every MR, PR, PO, and delivery attached to that location. This is how a site engineer asks "where is my rebar for Level 5 Zone 3" without knowing a PO number.

---

## 3. Screen S1 — Procurement Dashboard

**Layout:** four KPI tiles across the top, two-column body, action queue on the right.

| Zone | Content |
|---|---|
| Tile 1 | **Committed vs Budget** — horizontal bar per trade; red segment where committed > allowable |
| Tile 2 | **Awaiting My Approval** — count with value; the single most-clicked element on the screen |
| Tile 3 | **Deliveries This Week** — expected / arrived / overdue |
| Tile 4 | **Long-Lead Risk** — count at Amber / Red / Breached |
| Left column | Procurement pipeline funnel: MR → PR → RFQ → CBA → PO → Delivered, with count, value, and median age at each stage. Clicking a stage filters the register below |
| Right column | Action queue, priority-sorted: overdue approvals, unresolved match exceptions, bids ready to open, expediting actions due today |
| Bottom strip | Exception ribbon: emergency POs pending regularisation, budget overrides awaiting decision, single-source awaiting Director |

**Role variation:** a Site Engineer sees only tiles 3 and 4 plus their own MRs. A Project Director sees the exception ribbon first, expanded by default. The layout is the same; the emphasis inverts.

---

## 4. Screen S2 — Material Requisition (Mobile-First)

Mobile is the primary surface for MR; web is the secondary. Design for a gloved thumb on a 5-inch screen in daylight.

```text
┌─────────────────────────────────┐
│  New Material Requisition       │
├─────────────────────────────────┤
│  Location                       │
│  [ Tower B › L05 › Zone 03  ▾ ] │  ← last-used pinned to top
│                                 │
│  Needed by                      │
│  [ 14 Sep 2026 ]  ● Normal      │
│                                 │
│  ── Items ────────────────────  │
│  Rebar T16                      │
│  4,200 kg          ⓘ 1,850 in   │
│                       stock     │
│  [ − ]  [ 4200 ]  [ + ]         │
│                                 │
│  [ + Add item ]                 │
│                                 │
│  📷 Add photo                   │
│                                 │
│  [   Submit Requisition   ]     │
│  ⚠ Offline — will sync          │
└─────────────────────────────────┘
```

| Element | Behaviour |
|---|---|
| Location picker | Defaults to the user's last WBS node; recent five pinned; full tree behind a search box |
| Item search | Type-ahead on code, description, and common site names ("rebar" finds "Reinforcement Bar, Deformed"); barcode/QR scan option |
| Stock hint | Inline free-stock figure with a one-tap "request from store instead" — the cheapest procurement is the one you don't do |
| Duplicate warning | Amber inline banner: "MR-0179 for this item at this location is open, submitted 4 days ago. Continue?" |
| Priority | Normal is default and pre-selected; Urgent and Emergency expand a mandatory justification field |
| Offline | Persistent banner; queued count shown in the app header; sync state visible per record |
| Photo | One tap from camera, auto-compressed on cellular per the mobile sync policy |

---

## 5. Screen S3 — Purchase Requisition

**Layout:** three-pane. Left: PR header and metadata. Centre: line grid. Right: **live budget panel**.

### 5.1 Line Grid Columns

`# · Item · Specification · Qty · UoM · WBS · BOQ Item · BOQ Rate · Est. Rate · Var % · Amount · Required Date · MAR · Status`

| Interaction | Behaviour |
|---|---|
| WBS cell | Tree picker; empty cell renders with a red left border and blocks submission |
| BOQ cell | Type-ahead over the project BOQ; leaving it empty opens the non-BOQ reason picker inline |
| Var % cell | Green ≤ 0%, grey 0-5%, amber 5-10%, red > 10% with a required note tooltip |
| Row expand | Shows source MR references, attachments, and the line's budget check detail |
| Bulk edit | Select rows → set required date, WBS, or BOQ item across the selection |
| Paste from Excel | Supported for qty and rate columns — because the QS will do it anyway |

### 5.2 Live Budget Panel (right)

```text
┌── Budget Position ──────────────┐
│  BOQ C-03-014  Concrete Grade 35│
│                                 │
│  Allowable        142,000.00    │
│  Committed        118,400.00 ▓▓ │
│  Actual            15,280.00 ▓  │
│  ─────────────────────────────  │
│  Available          8,320.00    │
│  This PR           12,500.00    │
│  ─────────────────────────────  │
│  ⛔ Over by         4,180.00     │
│                                 │
│  [ Request Override ]           │
└─────────────────────────────────┘
```

The panel updates on every quantity or rate keystroke, debounced at 400 ms. When multiple BOQ items are affected, it shows a stacked summary with the worst-offending item expanded. Nothing about the overspend is a surprise by the time the buyer reaches the Submit button.

### 5.3 Override Modal

Full-screen on mobile, centred dialog on web. Fields in order: computed variance (read-only, large), reason code (radio, five options), narrative (textarea with a live character counter against the 100-character minimum), recovery plan (radio), and — where `VO_PENDING` is selected — a searchable link to an existing Variation Order or a "create draft VO" action. The submit button stays disabled until every mandatory field is satisfied, with the blocking field named beneath it.

---

## 6. Screen S4 — RFQ and Bid Opening

### 6.1 RFQ Builder

Four-step wizard: **Scope** (select PR lines, package name) → **Bidders** (approved supplier picker filtered by trade category, with PQ expiry warnings inline) → **Terms** (incoterm, payment terms, currencies, required documents, closing datetime) → **Review & Issue** (bidder count vs minimum, preview of the outgoing RFQ document per bidder).

Supplier picker rows show: name, trade categories, PQ expiry, last 3 deliveries on-time %, average quote-response time, current open PO value. A supplier who has never responded to an RFQ is visibly marked. Buyers should be able to see that they are inviting a bidder who never bids.

### 6.2 Bid Opening Screen

```text
┌── RFQ-2026-0031 · Rebar Package Tower B ─────────────────┐
│  Status: Closed for Bidding      Closed 20 Aug 17:00     │
│                                                          │
│  🔒 Bids are sealed. Dual authorisation required to open.│
│                                                          │
│  Bidder                  Submitted        Docs  Complete │
│  Mekong Steel Co.        18 Aug 11:42      4/4     ✔     │
│  Angkor Metals           19 Aug 09:15      4/4     ✔     │
│  Phnom Penh Steel        20 Aug 16:51      3/4     ⚠     │
│  Delta Supply            — not responded    —      —     │
│  Riverside Trading       21 Aug 08:02   ⏱ LATE           │
│                                                          │
│  Value column:  🔒 🔒 🔒 🔒 🔒                             │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Opening requires two authorised users.            │  │
│  │  Initiated by: Sokha Lim (QS Mgr) · 09:12 · 8m left│  │
│  │  [ Confirm Opening as Second Authoriser ]          │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

Sealed values render as a padlock glyph, never as an empty cell — an empty cell reads as a bug and generates support tickets. The late bid stays in the list, visibly marked, and cannot be opened or evaluated. Deleting it would destroy the record of what happened.

---

## 7. Screen S5 — Comparative Bid Analysis

The most important screen in the module. Wide table, bidders as columns, lines as rows, frozen first column and header.

```text
                          │ Mekong Steel │ Angkor Metals │ PP Steel  │  BOQ
──────────────────────────┼──────────────┼───────────────┼───────────┼─────────
Rebar T16   4,200 kg      │   0.92  ✔    │   0.89  ✔     │  0.95 ⚠   │  0.94
Rebar T20   2,800 kg      │   0.91  ✔    │   0.88  ✔     │  0.93 ✔   │  0.94
Binding wire  180 kg      │   1.40  ✔    │   1.55  ✔     │  1.38 ✔   │  1.45
Cut & bend    —           │  incl.  ✔    │   0.06  ✔     │ excl. ✖   │  incl.
──────────────────────────┼──────────────┼───────────────┼───────────┼─────────
As quoted                 │   6,412.00   │    6,198.00   │  6,344.00 │
  + freight               │       0.00   │      180.00   │      0.00 │
  + duty/clearance        │       0.00   │      240.00   │      0.00 │
  − settlement discount   │    −128.00   │        0.00   │      0.00 │
──────────────────────────┼──────────────┼───────────────┼───────────┼─────────
NORMALISED (landed)       │   6,284.00   │    6,618.00   │  6,344.00 │  6,559.00
Rank                      │      1       │        3      │     2     │
Delivery                  │    21 days   │     45 days   │  30 days  │
Technical                 │  Compliant   │   Compliant   │ 1 major ✖ │
On-time history           │     94%      │       78%     │    88%    │
```

| Feature | Behaviour |
|---|---|
| Adjustment rows | Collapsible; each adjustment expands to show the calculation and its source |
| Toggle | As-quoted ↔ Normalised, one switch, both always one click away |
| Non-compliant | Bidder column dimmed and excluded from ranking, but never hidden |
| BOQ column | Always present — the comparison that matters is not just bidder vs bidder but bidder vs what we sold to the client |
| Recommendation panel | Below the table: recommended bidder, delta vs lowest, mandatory justification when not lowest, approval chain preview |
| Split award | Line checkboxes per bidder column; running totals update per bidder as lines are allocated |
| Export | PDF snapshot taken at approval and frozen; the exported CBA is the record, not a re-render |

---

## 8. Screen S6 — Purchase Order

**Layout:** header summary bar (supplier, value, status, version), tabbed body.

| Tab | Content |
|---|---|
| Lines | Item grid with ordered / delivered / invoiced / remaining per line, colour-coded progress bars |
| Terms | Incoterm, payment, delivery location, warranty, advance, retention, special conditions |
| Pre-Issue Checks | The seven gates as a live checklist — green tick, red cross with the specific blocker, grey N/A |
| Delivery | Schedule per line, ASN records, gate receipts, GRN mirror |
| Expediting | Chronological contact log with next-action dates; "Log contact" is a one-line quick-add |
| Amendments | Version list with diff view — old value / new value per changed field |
| Documents | Immutable issued PDFs per version, quotation, CBA snapshot, certificates, correspondence |
| Financials | Committed / relieved / residual, invoices, match status, payment status |
| Activity | Full audit timeline |

**The Approve button** is disabled while any pre-issue gate fails, with the failing gate named directly beneath it: *"Blocked: MAR-2026-0044 for line 2 is Under Review."* Not a generic "cannot approve" toast.

**Version banner:** when viewing an amended PO, a persistent bar reads `Version 3 of 3 · Amended 04 Aug 2026 · [View version history]`. Viewing a superseded version tints the whole page and shows a "This is not the current version" banner.

---

## 9. Screen S7 — Expediting Board

Kanban by expediting status: `Not Started · Confirmed · In Production · Ready · Shipped · In Transit · Customs · At Site`.

Each card: PO number, supplier, item summary, required-on-site date, days remaining (or overdue in red), WBS location, risk flag, next action date. Cards on the critical path carry a red left border. Drag between columns updates status and prompts for a log entry — status changes without a contemporaneous note are how expediting records become useless in a claim.

Filters: supplier, discipline, WBS branch, overdue only, critical path only, next action due today.

---

## 10. Screen S8 — Incoming Deliveries and Match Exceptions

### 10.1 Incoming Deliveries (Mobile-Primary)

Gate-side screen. Search by PO number, supplier, or scan a delivery note QR. Shows ordered vs already-delivered vs this delivery per line, with large `+/−` steppers. Mandatory photo of the delivery note. Condition selector (`Good` / `Damaged` / `Partial`). If no matching open PO exists, the screen refuses and displays: *"No open PO found for this supplier. Do not accept delivery. Contact Procurement."* — with a one-tap call button.

### 10.2 Match Exception Queue

Table of unmatched invoices with variance type badges (`QTY`, `RATE`, `TOTAL`, `NO_GRN`, `NO_PO`), variance amount, ageing days, and assigned owner. Row expands to a side-by-side PO / GRN / Invoice comparison with differing values highlighted. Resolution actions inline: accept variance (opens approval by band), request credit note (drafts supplier correspondence), raise amendment, reject invoice.

---

## 11. Screen S9 — Long-Lead Register

Table sorted by risk, then by float. Columns: item, required on site, total lead time build-up (supplier + shipping + customs + approval, expandable), order-by date, days to order-by, current status, linked PR/PO, linked schedule activity, critical path flag.

Rows breach-coloured: green (> 14 days to order-by), amber (≤ 14), red (≤ 0), black (ordered late — kept visible as the record of what happened). A banner at the top states the count of items whose order-by date has passed. It does not go away when dismissed.

---

## 12. Approval Experience (Web and Mobile)

The approval card is deliberately minimal — an approver on a phone between meetings needs the decision, not the record.

```text
┌───────────────────────────────────────┐
│  PR-2026-0042  ·  Rebar Tower B L1-8  │
│  USD 12,500.00                        │
│                                       │
│  ⚠ Budget: over by USD 4,180          │
│     Override approved by K. Sophal    │
│                                       │
│  BOQ C-03-014 · 3 lines · Needed 14 Sep│
│  Prepared by  Dara Chan (Proc Officer)│
│                                       │
│  [ View full PR ]                     │
│                                       │
│  [   Approve   ]   [   Reject   ]     │
│           [ Return with comment ]     │
└───────────────────────────────────────┘
```

Reject and Return both require a comment before the action completes. Approve above the step-up threshold opens the authentication challenge showing exactly what is being approved and its value, per 03-01 §6.2.

Bulk approval is permitted **only** for records under the lowest value band, and never for records carrying a budget override, single-source flag, or emergency flag. Those must be opened individually. A screen that lets a director approve forty overrides with one checkbox is not an approval control.

---

## 13. Empty, Loading, and Error States

| State | Treatment |
|---|---|
| No PRs yet | Illustration + "Requisitions start on site. Create an MR, or consolidate existing ones." + primary action |
| Budget check running | Inline skeleton in the budget panel, not a blocking spinner — the buyer keeps typing |
| BOQ not loaded for project | Amber project-level banner: "BOQ not yet loaded. Budget validation is disabled. Contact your QS." Shown on every PR screen until resolved |
| Bids sealed | Padlock, countdown to closing, explanatory line — never an empty cell |
| Supplier PQ expired | Inline on the supplier row with an expiry date and a link to 04-10, not a generic validation error |
| Offline (mobile) | Persistent header banner with queued-record count; per-record sync badge |
| Sync conflict | Record surfaced with both versions side by side; per the platform rule, server wins on approvals, device wins on field data |
| Permission denied | Explains which permission is missing and who to ask, rather than "Access denied" |

---

## 14. Accessibility and Localisation

| Requirement | Standard |
|---|---|
| Contrast | WCAG 2.1 AA minimum; status never conveyed by colour alone — always colour + icon + text |
| Keyboard | Full keyboard path through PR line entry and CBA; Tab/Enter grid navigation like a spreadsheet |
| Touch targets | ≥ 48 × 48 dp on all mobile actions; gate-receipt steppers ≥ 64 dp |
| Languages | English, Khmer, Thai, Chinese — number and date formats follow locale, currency never does |
| Numerals | Khmer numerals supported in display; input accepts Latin numerals always |
| Field readability | Mobile screens tested at 800 nits in direct sunlight; high-contrast field theme available |
| Screen reader | Sealed bid values announce as "sealed until 20 August 17:00", not as "blank" |

---

## 15. Component Inventory

| Component | Reused From / New |
|---|---|
| WBS tree picker | Shared — WBS Engine |
| Approval card & chain viewer | Shared — Approval Workflow Engine |
| Audit timeline | Shared — Audit Trail Engine |
| Document uploader with hash | Shared — Document Control |
| Money input (currency-aware) | Shared — Finance |
| **Budget position panel** | New — Procurement |
| **CBA comparison grid** | New — Procurement |
| **Sealed-bid table** | New — Procurement |
| **Pre-issue gate checklist** | New — Procurement |
| **Expediting kanban** | New — Procurement |
| **Gate receipt stepper (mobile)** | New — Procurement, reused by Inventory |

---

*Digital Construction Operating System — Procurement — Doc 06 UI/UX Design — Internal Controlled Document*
