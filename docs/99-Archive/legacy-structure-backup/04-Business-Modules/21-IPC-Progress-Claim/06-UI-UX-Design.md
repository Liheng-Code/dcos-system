# 06 — UI / UX Design
**Module:** 21 — IPC / Progress Claim
**Doc Code:** DCOS-MOD21-UI-001 | **Rev:** R0 | **Status:** Draft
**Attachments:** wireframes/screen mockups go in ./Attachments/

---

## 1. Screen Inventory

| # | Screen | Route | Primary user |
|---|---|---|---|
| S1 | IPC List (per project) | /projects/:id/ipcs | QS, PM |
| S2 | IPC Workspace (claim editor) | /ipcs/:id | QS Engineer |
| S3 | Certification Entry | /ipcs/:id/certify | QS Engineer |
| S4 | Contract Position Dashboard | /projects/:id/claim-position | PM, Director |
| S5 | Variance Report | /ipcs/:id/variance | QS Manager |

## 2. S2 — IPC Workspace (the core screen)

```
┌──────────────────────────────────────────────────────────────────┐
│ P012 — Tower A   IPC-07   Period: 26 May – 25 Jun 2026   [DRAFT] │
│ Net claim: $412,350   Retention: $24,500   Advance rec: $15,000  │
│ [Import from progress] [Add VO line] [Add back-charge] [Submit ▸]│
├──────────────┬───────────────────────────────────────────────────┤
│ BOQ Sections │  Item  Description     Unit  Rate   Prev  This  Cum│
│ ▸ 1 Prelims  │  2.03  RC slab G35     m3    200   540   118.5 658│
│ ▾ 2 Concrete │  2.04  RC column G40   m3    215    88    12.0 100│⚠
│   2.1 Substr │  ...                                              │
│ ▸ 3 Masonry  │  VO-003 Additional canopy steel        12,400     │
│ ▸ VO lines   │                                                   │
│ ▸ Backcharges│  Section subtotal ............ $96,210            │
└──────────────┴───────────────────────────────────────────────────┘
```

Key behaviors:
- Left panel = BOQ section tree (mirrors BOQ Engine structure). Lazy-load lines.
- Editable cell: **This-period qty only.** Everything else read-only/computed.
- ⚠ overrun badge when cumulative > BOQ qty → forces comment popover (BR3).
- "Import from progress" shows suggested quantities from WBS roll-up side-by-side
  with current entry; QS accepts per line — never silent overwrite.
- Totals bar recalculates live; retention/advance figures are read-only chips with
  an info popover showing the rule applied ("5% of cumulative, reducing at 50%").
- Status banner color follows platform status palette.

## 3. S3 — Certification Entry

- Two-column layout: Claimed (frozen snapshot) | Certified (editable).
- Bulk tools: "certify all as claimed", then adjust exceptions.
- Each adjusted line requires reason code (dropdown) — note optional except
  for RATE_DISPUTE and QUALITY_HOLD.
- Variance column auto-computes with red/green coloring.
- Save = one atomic action; partial certification not allowed in v1.

## 4. S4 — Contract Position Dashboard

Cards: Original Contract Sum | Approved VOs | Revised Sum | Certified to Date |
Retention Held | Advance Outstanding | Receivable Aging.
Chart: cumulative claimed vs certified vs paid (monthly bars + line).

## 5. UX Rules

- All money right-aligned, thousands separators, contract currency symbol from
  project settings.
- Draft autosaves every 30 s; explicit "unsaved" indicator.
- Mobile: read-only views only (S1, S4). Claim editing is desktop-only by design.
- Empty states: first IPC screen explains prerequisites ("Contract BOQ must be
  approved") with link, instead of a blank table.
- Destructive actions (recall, return) always require comment modal.
