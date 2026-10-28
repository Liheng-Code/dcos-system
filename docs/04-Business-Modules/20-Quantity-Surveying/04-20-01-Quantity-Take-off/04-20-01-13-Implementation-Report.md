# 13 – Implementation Report (P0, tender)
**Module:** 04-20-01 Quantity Take-off
**Date:** 2026-10-27 · **Branch:** `feat/qs-qto-sessions` (lane worktree `D:\dcos-lanes\qs-qto-sessions`)

## Decisions
| Spec says | Built | Why |
|---|---|---|
| New `qs_takeoff_*` tables | Extend the existing `qto_*` schema (doc 04 maps each table) | Keeps the V1 data, drawing register and viewer; changes are additive and safe while other lanes run |
| REST `/api/v1/qs/takeoff/*` | Supabase RLS + `SECURITY DEFINER` RPCs, wrapped by `lib/qs/qto/session-service.ts` (doc 08) | The DCOS pattern; the rules are enforced in the database |
| Session ↔ Document Control revision (BR-01) | Session ↔ exact QTO drawing revision; optional `qto_drawing_revisions.document_revision_id` | The QTO drawing register stays; a DC picker needs a core change (see "Core requests") |
| Item-level 9-status workflow (V1) | Version-level 7-status workflow (Master Plan §13); the item `status` column is legacy | One review per version, as the spec requires |
| "Completed" status (doc 02) | APPROVED → PUBLISHED | Master Plan §13 |
| Multi-step create wizard | One dialog with four sections and a confirmation step | Project setup wizards were removed elsewhere in DCOS |
| "Senior QS" role | Whoever holds `qto_approval.approve` (L1–L3 by default) | No such role exists in DCOS |
| `qs_takeoff_revision_change` table | Computed on demand (`compare.ts`) | Always reflects current data; nothing to keep in sync |

## Status against Master Plan P0
| Requirement | Status | Notes |
|---|---|---|
| Sessions and versions, parent and baseline, concurrency-safe numbering | Done | Row lock + unique key; one open version per session |
| Project, purpose and exact source revision | Done | TENDER only in the UI; CONSTRUCTION is allowed in the DB and comes in P1 |
| Manual 2D measurement: length, polyline, area, perimeter, count, point | Done | PDF only (pdf.js); DWG files can be stored but not measured |
| PDF snap and precision tools | Done | Snaps to endpoints, intersections, midpoints and lines read from the PDF vectors (`lib/qs/qto/pdf-snap.ts`, tested). Also ortho, wheel zoom at the cursor, X/Y readout, 1:N presets. E2E: clicks 2–5 units off target still gave 200 units = 6,000 mm exactly. Scanned PDFs have no vectors to snap to |
| Smart pick and Same hatch (area from the PDF lines) | Done | `lib/qs/qto/smart-pick.ts` (tested): lines noded into a planar graph, gaps closed, dead ends pruned, face around the click traced; hatch = 4+ evenly spaced parallel lines, ignored when picking and matched by angle + spacing for Same hatch. Curves flattened. Works with area volumes. Islands (columns, text) are not deducted. E2E: 16.2 m² from loose split lines, 17.28 m² inside a hatch, Same hatch volume 2 areas × 0.20 m = 7.92 m³ |
| Calibration | Done | Known distance + unit, per revision and page, history kept, zoom-independent; area uses scale² (V1 bug fixed) |
| Geometry evidence | Done | Points, page, revision and calibration id per measurement |
| Classification: trade, WBS, building, level, zone, budget code, BOQ line | Done | Location is free text (DCOS has no location master); one BOQ line per item |
| Item statuses FIRM / PROVISIONAL / EXCLUDED / PENDING_CLARIFICATION | Done | Reason or assumption enforced at submission |
| Calculation engine (decimal, units, allowlisted formulas, deductions, authorised factors, staged rounding, append-only history) | Done | BigInt fixed point; `new Function` removed |
| Version-controlled measurement rules | Done | Draft → approved (frozen) → retired; `DCOS-STD` v1 seeded; Rules tab |
| QA/QC issues (blocking, warnings, acknowledgement, no duplicates) | Done | Client rules + server re-check on submission |
| Review and approval, separation of duties | Done | Self-approval rejected in the DB and hidden in the UI |
| Immutable publication + snapshot hash | Done | sha256 of canonical jsonb, reproducible |
| Revision comparison | Done | Added, removed, increased, decreased, unchanged, modified, rule changed, source changed, unresolved; no % when the previous value is 0 |
| Excel / CSV export | Done | From the snapshot only; audited |
| Downstream transfer | Done for the **tender BOQ** | Idempotent, conflict-safe, failures recorded; Cost Estimation reads the tender BOQ. Post-contract BOQ / Cost Control: P1 |
| Audit trail | Done | `qto_audit_log` triggers on every new table; review history; export log |
| Access control | Done | Tenant + permission RLS; private bucket with signed URLs |
| Dashboard | Done | Counts per status, blocking issues, provisional items, failed transfers. Filters: status and trade; date and QS filters not built |
| Auto-save | Done | 30 s after the last edit; Ctrl+S |
| Automated tests | Done | 39 Vitest + 53-assertion SQL suite + browser E2E (below) |

## CAD drawings (DXF), 2026-10-28
Plan: DXF read by DCOS's own code now, DWG through a self-hosted converter later (ODA File Converter, gated on its licence). Phases C0–C3 are done; C4 (DWG) is not started.

| Part | Status | Notes |
|---|---|---|
| DXF reader (`lib/qs/qto/cad/dxf-parse.ts`) | Done | ASCII DXF, no dependency. LINE, LWPOLYLINE/POLYLINE (bulges), ARC, CIRCLE, ELLIPSE, SPLINE, INSERT (nested, arrays, attributes), HATCH (loops, pattern lines), TEXT/MTEXT (alignment), DIMENSION (block at group 12), MULTILEADER, SOLID, POINT; OCS mirroring. Unknown types counted, binary DXF refused. Runs in a Web Worker |
| Exact geometry (`cad-geometry.ts`) | Done | True arcs kept; areas by Green's theorem, hatch areas by AutoCAD's even-odd fill |
| CAD viewer | Done | Viewport canvas redrawn per view (crisp at any zoom), AutoCAD colours, hatch patterns, text; layers panel; true scale from units; existing tools, snap, grips, Smart pick work on CAD lines |
| CAD take-off (`cad-select.ts`) | Done | Pick object, All on layer, Same hatch (pattern + layer), Same block; confirmation with count and total; evidence handles on each measurement |
| Upload | Done | DXF accepted and read at upload; units asked when missing; DWG stored with "save as DXF" guidance |
| DWG conversion (C4) | Not started | Needs the ODA licence check and a core request (converter service) |

**Checked against AutoCAD 2018 on a real drawing** (19F–22F PT slab, DWG converted with AutoCAD's own console):
- All 175 hatches, polylines and circles: DCOS area and perimeter = AutoCAD within 1e-6. For three hatches with "text box" loops, AutoCAD's LIST area counts only the first loop; AutoCAD's own recreated boundaries (`-HATCHEDIT`) equal DCOS.
- In the browser: scale 0.1 m per sheet unit set automatically; Pick object on beam 1F46AC = 1.92 m² (AutoCAD 1.9200); Same hatch picked all 31 `ANSI33` beam hatches = 71.899 m² (AutoCAD 71.899) × 0.60 m = 43.139 m³.
- Read in about 20 ms (225 objects, 527 primitives).
- Found while testing: dimension geometry inside a block was misplaced (group 12 insert point not applied) — fixed; three blocks in that drawing lie hundreds of metres outside the plan, also in AutoCAD.

## P1 / P2 (not started)
- IFC as a session source: reuse Design/BIM `bim_models` and `bim_element_takeoff`, which already parse IFC in the browser.
- CONSTRUCTION purpose: remeasurement and transfer to `qs_boq_items` (post-contract BOQ) and Cost Control.
- Document Control revision picker (needs a core change).
- Native DWG viewing.
- Assisted change detection, anomaly detection, AI classification.

## Verification run on 2026-10-27
- **Unit tests:** `pnpm test`: 1308 passed, 11 skipped (39 of them QTO engine tests).
- **Typecheck and lint:** `pnpm typecheck` clean; `pnpm lint` 0 errors.
- **Database tests:** `supabase/tests/qto_sessions.test.sql`: ALL QTO SESSION TESTS PASSED.
- **Browser E2E** (Playwright + Edge, dev server on :3001, throwaway tender and generated PDF, removed afterwards):
  1. As an L3 user: create the session, then calibrate a 6,000 mm dimension (= 30 mm per page unit).
  2. Measure the 200 × 160-unit rectangle: 28.8 m².
  3. Apply rule AREA-MEAS with Waste 1.05: **30.24 m²**. Validate, then submit.
  4. As an L2 user: approve, publish, then transfer. The tender BOQ line reads 30.24 m² (section "Finishes").
  5. Excel export downloaded.
  6. New version created; the item is carried with lineage, marked UNVERIFIED.
- **Bugs found by the E2E and fixed:** temp-table `DELETE` and `UPDATE` statements in the RPCs had no `WHERE`. PostgREST's `pg_safeupdate` rejects these, but psql as postgres does not, so the SQL suite could not catch them. The submitter was also shown the Approve button.

## Known limitations
- CAD: model space only (no paper-space layouts or xrefs); WIPEOUT and ATTDEF are not drawn; MTEXT formatting is reduced to plain text; DWG cannot be measured until converted to DXF.
- Smart pick only reads vector PDFs, does not deduct islands inside an area, and treats any run of 4+ evenly spaced parallel lines (e.g. stair treads) as hatch.
- The calculation is computed in the browser and recorded by the RPC, which checks gross − deductions = net, the unit, and finite non-negative values. It does not re-evaluate the formula on the server.
- An item maps to at most one BOQ line; splitting one measurement across lines is not supported.
- Legacy V1 tables `qto_packages`, `qto_assumptions`, `qto_clarifications`, `qto_reviews`, `qto_revisions` still have open RLS and no UI.
- No React component tests (the repo has no React test environment) and no 500-item performance test.
- Migrations were tested by dry run and applied to the local DB. A clean replay from an empty database was not run, because that needs a wipe.

## Core requests (main lane)
1. Add a Document Control read export to `PUBLIC_API.document_control` in `module-boundaries.mjs`, so a session can link a DC revision.
2. At merge: update `.claude/skills/dcos-architecture/references/qs.md` (QTO section) and `integration-map.md` (QTO → tender BOQ transfer: RPC `qto_transfer_to_tender_boq`, writes `tender_boq_items.quantity`).
3. Release, when wanted: `lib/modules/release.ts`.
