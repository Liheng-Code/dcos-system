# DCOS Quantity Surveying — Module Review & Remaining Core Work

**Date:** 2026-10-30 · **Branch reviewed:** `feat/projects-redesign` · **Scope:** pre-contract, post-contract, cost & rate library, QTO, subcontracts, contract admin, platform readiness

## 1. Summary

| Area | State |
|---|---|
| Tender lifecycle, estimation, cost library, prelims, BOQ, alternates, QTO (PDF + DXF) | **Built**, deep |
| Post-contract BOQ, VO register, IPC create → approve → certify → AR invoice | **Built**, but only 1–2 steps deep |
| Final account, CVR / monthly cost report, price fluctuation, dayworks, PS expenditure, PC sums | **Not built** |
| Cost control (commitments, actuals, forecast) | **Partial** — all manual entry, no feed from Procurement/Finance |
| Subcontract IPC | **Stub** — header-only manual amounts |
| Security (RLS), DB-enforced rules, transactions, tests | **Not release-ready** |
| Release | **Nothing released** — no `qs` key in `apps/web/lib/modules/release.ts` |

The domain reference files (`.claude/skills/domain-quantity-surveying/references/03`–`15`) are empty stubs, so the comparison below is against standard QS practice, the IPC functional spec (`docs/04-Business-Modules/21-IPC-Progress-Claim/02-Functional-Specification.md`, F1–F15 / BR1–BR8) and the module's own plan docs.

## 2. Defects to fix before any release (Priority 0)

1. **Retention over-counted.** `recalculateClaim` computes retention on the *cumulative* certified value (`lib/qs/qs-service.ts:1370`), and certification inserts that full figure as a new `qs_retention_ledger` deduction every IPC (`qs-service.ts:1571`). Retention held grows with every certificate.
2. **No row-level security.** `using (true)` on every `tender_*`, `qs_*` (BOQ, VO, claims, retention, advance recovery, approvals, audit log), `subcontract*` and `contract_register` table. Helpers `is_project_member()` / `has_permission()` exist (`20260919000001`) and are used ~220 times elsewhere, never by QS. `qs_audit_log` accepts inserts from any user.
3. **No server-side writes / transactions.** No `app/api` routes for QS post-contract; all writes are browser Supabase calls. Multi-step operations are not atomic: certify → retention ledger → AR invoice; award conversion (stage, BOQ/prelims/price list/risk carry-over, snapshot, contract, programme baseline).
4. **Rules enforced only in the app:** tender stage transitions (`lib/qs/tender-lifecycle.ts:41-55`), BOQ `baseline_status` lock (`checkBoqForLock`, `qs-service.ts:587`), IPC BR1 (BOQ locked) and BR2 (one open IPC).
5. **Numbering:** VO numbers `VO-{year}-{last 4 clock digits}` (can collide, not sequential); IPC number is a plain integer, not `{PROJECT}-IPC-NN`.
6. **Bid Evaluation unusable:** no UI to define criteria, so every scoring matrix shows "No criteria defined".

## 3. Core functions not yet built (Missing)

| # | Function | Notes / existing hooks to build on |
|---|---|---|
| M1 | **Final account** | No tables or service. Overview "Final Account" link opens the Cost/m² tab; `getFinalCostSummary` is a cost/m² summary. Needs statement, agreed adjustments (VOs, PS/PC, fluctuation, claims), contra, retention, close-out sign-off. |
| M2 | **Monthly cost report / CVR** (cost–value reconciliation) | Only budget print and VO register print exist. |
| M3 | **Variation workflow depth** | Missing: instruction → VO link (`contract_employer_instructions.type='variation'` exists but unlinked); contractor quotation, QS valuation, claimed vs agreed amounts; on "implemented" nothing updates BOQ, budget revisions or cost budget. |
| M4 | **Dayworks (post-contract)** | Only `tender_dayworks` on tender side; no daywork sheets/valuation. |
| M5 | **Provisional sum expenditure & PC sums** | PS is only a flag (`qs_boq_items.is_provisional`); no instruction/spend/omit-and-adjust. Prime cost sums absent everywhere. Tender PS/dayworks tables exist, UI tabs removed 2026-07-21 (OQ-8). |
| M6 | **Price fluctuation / CPA** | Nothing in schema or code. |
| M7 | **VO lines and contra/back-charges on main IPC** | IPC uses header `net_vo_amount` only (F5/BR5); F8 contra not built. |
| M8 | **Commitments feed into cost control** | `qs_cost_transactions.transaction_type` allows `'po'` but Procurement never writes; subcontract values, AP and payroll not rolled in. Committed/actual are manual (`cost-entry.tsx`). |
| M9 | **Forecast at completion / cost-to-complete** | Forecast = `max(budget, committed, actual)`; no CTC entry or method. Budget is BOQ selling value, not a cost budget. |
| M10 | **Cash flow forecast** | `qs_cost_baseline` exists; its editor `cost-scurve.tsx` is orphaned; not tied to Finance cash flow or core `project_scurve`. |
| M11 | **EOT and loss & expense claims** | Delay register raises an EOT notice (`20260919000012`); no submission/assessment/award; `entitlement_register` holds figures only, no quantification. |
| M12 | **Retention release mechanics** | `release_trigger` is a label; no link to practical completion/DLP dates, no release certificate, nothing posted to Finance; no cap/reduction steps. |
| M13 | **Partial payments & due dates** | Payment is all-or-nothing, set by hand; no due-date tracking or interest. |
| M14 | **IPC certification extras** | No disputed/under-certification status, claimed-vs-certified report (F14), revise-and-resubmit history (F15), line lock after submission (BR6), quantity × rate measurement / overrun check (BR3). |
| M15 | **Supplier/subcontractor quote levelling** | Lump-sum quotes per trade only; no line-by-line comparison; preferred quote does not feed BOQ rates. Doc 12 C-F comparison UI not built. |
| M16 | **Benchmarking / historic cost analysis** | Cost Database saves BOQ snapshots only; no $/m² comparison, cross-tender analytics or indexing. |
| M17 | **QTO → post-contract BOQ, DWG, IFC source** | QTO P1 (post-contract transfer, IFC, DC revision picker) and C4 DWG not started. |
| M18 | **QS notifications** | `qs_notifications` is written by a claim trigger but never read; no VO notifications; QS doesn't use `lib/notifications/dispatch.ts`. |

## 4. Partially built (needs completion)

| Area | Gap |
|---|---|
| **Subcontract IPC** | Header-only manual amounts (`merged-claims-view.tsx` `SubIpcList`); `subcontract_ipc_items` unused; no certification, retention ledger or AP link. Subcontract variations: no approval chain, no line items, don't change subcontract value. Back-charges not linked to IPC. |
| **Approvals** | Bespoke tables (`qs_vo_approvals`, `qs_claim_approvals`, `tender_bid_approvals`); VO thresholds hard-coded (5k / 50k); reset-to-draft leaves stale approval rows; no due dates/escalation; not driven by `project_approval_flows`. |
| **Advance recovery** | Typed by hand each period; no schedule/% rule (F7); omitted from printed certificate. |
| **Materials on site** | One number per line; no register or recovery. |
| **Budget revisions** | Only created by amending a locked BOQ item; not linked to VOs. |
| **Tender register** | `tender_register.status` shown but never changed; real lifecycle is `tender_stage` — two status models. No filter/search. |
| **Submissions page** | Records competing bidders (employer view) while lifecycle is contractor-side. Documents are URL fields only (also addenda attachments). |
| **Award records** | `tender_award_records` (Bid Evaluation → Awards) not connected to the award-conversion flow. |
| **Rate build-up on BOQ line** | Only labour + material buckets; equipment/subcontract folded into material. Overheads/profit/risk are tender-wide only, no per-section markups. Bid summary delete not permission-gated (`bid-summary-tab.tsx:173`). |
| **Price lock UI** | Only `BoqTab` / `BoqItemMappingTab` receive `isLocked`; other tabs find out on save failure. |
| **Units / standards** | Fixed 16-unit list (`lib/qs/boq-units.ts`), no unit master; BOQ uses internal A–Z codes; 219 of 305 `dwl_work_items` still lack a CSI section. |
| **Permissions** | `cost_per_m2_internal` seeded but never checked — dual-rate separation exists only in seed data. `use-tender-permissions.ts` uses hard-coded role codes. |
| **Exports** | Browser HTML print only, `$` hard-coded; no PDF files; no Excel export of tender BOQ; alternates not printed; no sub-IPC or final account outputs. |
| **Cost library** | Material detail Documents and Audit tabs are stubs; doc 12 C-J (trends, confidence, forecast) deferred. |
| **Audit** | Not on approvals, subcontract tables, `contract_register`, most tender tables. |

## 5. Open plan-doc phases (`docs/04-Business-Modules/20-Quantity-Surveying/`)

| Doc | Not done |
|---|---|
| 18 QS WBS Template Library | Phases 0,1,2,4,5 in progress; 3 (starter libraries) and 6 (governance/rollout) not started |
| 17 Prelim category-driven | Mixed-project packages, provenance, formula validation, rate/currency editing, Phase 5 pilot |
| 12 Material Spec & Price | C-F quotation comparison UI; C-J deferred; decision D1 (coding) awaiting QS Manager |
| 15 Global Cost Database | 3b multi-region deferred; BOQ lock DB backstop TBD |
| 08 DWL ↔ BOQ | Step 5 (repoint `qs_boq_items` / `boq-builder.tsx` to DWL) not started |
| 07 / 09 DWL | Phase 8 population ongoing; Unit Rate Library redesign never started; RLS remediation tracker deferred |
| 04-20-01 QTO | C4 DWG, P1, P2 |
| 01 Business Requirement; 21-IPC docs 01–12 | Still R0 Draft, pending approval |

## 6. Quality & housekeeping

- **Tests:** none for `qs-service.ts` (3,156 lines), `tender-cost-service.ts` (2,639), `qs-queries.ts` (1,954), lifecycle, approvals, price lock, prelims, award conversion. Only 5 pure-function tests in `lib/qs/__tests__` + 10 QTO engine tests.
- **Dead / legacy:** `pullFromUnitRateLibrary` (no callers), `/tenders/unit-rates`, `lib/qs/contract-service.ts` (no importers; contracts pages use `qs-queries.ts`), orphaned `cost-scurve.tsx`, static `/dashboard/qs/overview`, frozen `dwl_material_divisions` still referenced in `dwl-types.ts`, frozen legacy rate tables awaiting drop.
- **Hotspots to split:** `qs-service.ts`, `tender-cost-service.ts`, `dwl-cost-item-detail.tsx` (1,895), `boq-tab.tsx` (1,637).
- **Data model:** `tender_boq_items` has no `tenant_id`; Procurement reads/writes `qs_boq_items` directly, outside the QS public API.
- **Domain skill:** QS reference files 03–15 are empty stubs — worth filling so future reviews have a spec.

## 7. Recommended order

1. **P0 – Correctness & security:** fix retention, add project-scoped RLS on QS/tender/subcontract tables, move certify/award into transactional RPCs, DB-enforce BOQ lock + stage transitions + IPC BR1/BR2, sequential numbering.
2. **P1 – Close the money loop:** VO workflow (instruction → valuation → BOQ/budget), VO and contra lines on IPC, Procurement PO/subcontract commitments → cost control, sub-IPC full flow, retention release + partial payments.
3. **P2 – Reporting & close-out:** forecast/CTC, CVR / monthly cost report, cash flow, **final account**, PDF exports.
4. **P3 – Breadth:** dayworks, PS/PC expenditure, fluctuation/CPA, EOT & L&E claims, quote levelling, benchmarking, QTO P1/DWG, notifications.
5. **Then release** QS pages in `release.ts`, with tests on the big services first.
