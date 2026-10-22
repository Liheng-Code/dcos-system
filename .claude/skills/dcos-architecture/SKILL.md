---
name: dcos-architecture
description: How each DCOS module is actually built today: its tables, triggers, RPCs, RLS, services, public API, invariants, cross-module links and known gaps. One map per module, plus a cross-module integration map. Load before designing, reviewing or changing a module, before writing a lane or Agent Team prompt, and when asked "how does <module> work" or "what touches <table>". Complements dcos-system-architect (platform principles) and the domain-* skills (business rules).
---

# DCOS module architecture maps

Three layers, each with one job:

| Layer | Where | Answers |
|---|---|---|
| Platform principles | `dcos-system-architect` skill | How DCOS should be shaped (WBS spine, shared engines) |
| Business rules | `domain-*` skills | What the business needs (BOQ, IPC, leave, RFQ rules) |
| **As-built architecture** | **this skill** | **How a module is built now, and what must not break** |

## How to use
- Read **only** the map for the module you're working on, plus `references/integration-map.md` if the work touches another module. Don't load every map.
- The maps are a snapshot. Before relying on a file path, table or export for a change, confirm it still exists; code moves faster than docs.
- If a map and the code disagree, the code wins. Fix the map in the same change.

## Maps
Each map follows `references/_template.md`. Status as of 2026-10-22:

| Module (hub card) | Key | Map | Status |
|---|---|---|---|
| Planning | `planning` | `references/planning.md` | **Mapped** |
| Quantity Surveying | `qs` | `references/qs.md` | **Mapped** |
| Procurement | `procurement` | `references/procurement.md` | **Mapped** |
| Project | core | `references/project.md` | Pending |
| Reporting | `reporting` | `references/reporting.md` | Pending |
| Document Control | `document_control` | `references/document-control.md` | Pending |
| Construction | `construction` | `references/construction.md` | Pending |
| HR Management | `hr` | `references/hr.md` | Pending |
| Inventory | `inventory` | `references/inventory.md` | Pending |
| Account | `account` | `references/account.md` | Pending |
| Administration | core | `references/administration.md` | Pending |
| Design & BIM (no hub card) | `design` | `references/design.md` | Pending |

A **Pending** map holds only the facts already known from other maps. Treat it as unmapped.

## Mapping a pending module
1. Run one read-only Explore subagent per module (up to 3 in parallel). Give it the 6 sections of `_template.md`, the module's `MODULE_PATHS` / `PUBLIC_API` from `apps/web/module-boundaries.mjs`, its manifest in `lib/modules/manifests/`, its migrations and its `docs/04-Business-Modules/<module>` folder. Ask for facts with file paths, and "unverified" where it isn't sure.
2. Spot-check the claims you'll rely on: query the local DB for the columns and functions, and grep for exports.
3. Write the map from the template, add its links to `integration-map.md`, and set its row above to **Mapped** with the date.

## Keeping maps current
- `/lanes merge` updates the merged module's map (new tables, RPCs, public exports, invariants, gaps closed or opened).
- A change that adds a cross-module link must add a row to `integration-map.md`.
- New migrations: add their tables and functions to the owning module's map.
