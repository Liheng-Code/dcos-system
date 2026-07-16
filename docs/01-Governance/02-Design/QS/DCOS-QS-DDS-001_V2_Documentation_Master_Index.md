# DCOS Design Specification & Documentation Master Index
## Quantity Surveying (QS) Module

**Document Number:** DCOS-QS-DDS-001
**Version:** 2.0 — Consolidated Structure
**Status:** Active — Living Document
**Classification:** Internal
**Supersedes:** V1.0 skeleton (53-chapter draft) and the 29-document module plan
**Standard Compliance:** ISO/IEC/IEEE 15289, 12207, 29148, IEEE 1016, ISO/IEC 25010, ISO 9001 — applied by *mapping*, not by producing 29 separate volumes (see §1.2)

---

## Document Control

| Item | Information |
|---|---|
| Document ID | DCOS-QS-DDS-001 |
| Version | 2.0 |
| Author | DCOS Commercial / System Architecture Team |
| Date | 2026-07-16 |
| Next Review | With each feature release |
| Storage | `docs/01-Governance/02-Design/QS/` |

## Revision History

| Version | Date | Description |
|---|---|---|
| 1.0 | — | Initial 53-chapter skeleton + 29-document module plan (draft, unfilled) |
| 2.0 | 2026-07-16 | Consolidated 29 docs → 8 living documents; mapped all 53 chapters to owners; registered existing artifacts (SOP-QS-001 R3, FS-QS-001 build prompt, Cambodia seed data); added library reconciliation and menu mapping; adopted doc-as-you-build rule |

---

# 1. How This Document Works

## 1.1 Purpose

This is the **single index** for all QS module documentation. Every design question — "where is the IPC calculation defined?", "where is the permission matrix?", "what tests cover the rate engine?" — is answered here by pointing to exactly one living document. No content is duplicated across documents; this index only maps.

## 1.2 The consolidation principle

The V1.0 plan defined 29 documents plus a 53-chapter specification. For a small iterative team, that volume guarantees stale, contradictory documentation. V2.0 consolidates everything into **8 living documents (D1–D8)**. Standards compliance is preserved by traceability: each ISO/IEEE-mapped document type from V1.0 is *contained within* one of the eight (see §3 mapping), so an auditor can still find BRD content, SRS content, test documentation, etc.

## 1.3 The doc-as-you-build rule

1. When a feature enters development → its **Feature Spec** (D3) is written first, in the proven build-prompt format.
2. In the same sprint → **Rules Book (D4)**, **Data & API (D5)**, and **Test Book (D7)** are updated with that feature's formulas, schema, and acceptance tests.
3. **No document is written for features not yet scheduled.** Deferred chapters are marked deferred here, with their phase.
4. A feature is not "done" until its row in the Traceability Register (§7) is complete.

---

# 2. The Eight Living Documents

| ID | Document | Absorbs (from V1.0 plan) | Status | Location / Artifact |
|---|---|---|---|---|
| **D1** | Module Charter | 01 Vision, 02 Scope, 03 BRD | **Complete** — content in §4 below | This document, §4 |
| **D2** | SOP & Business Workflow | 07 Business Workflow | **Exists — R3 issued** | `SOP-QS-001_R3_Quantity_Surveying_Module.docx` — 17 procedures + 3 R3 additions, each with workflow control (status flow, gates, entry/exit, exceptions) |
| **D3** | Feature Specifications (one per feature) | 04 SRS, 05 User Stories, 06 Use Cases, 08 UI Screens | **Pattern proven; FS-QS-001 exists** | Register in §5. Format: role/objective, schema, calculation rules, recalc behavior, UI spec, API, acceptance tests, out-of-scope, DoD |
| **D4** | Rules & Calculations Book | 14 Calculation, 15 Measurement, 16 BOQ, 17 Cost Estimation, 22 Validation Rules | **~60% exists, distributed** — consolidation index in §6 | To be extracted into `QS-Rules-Book.md` as features stabilize |
| **D5** | Data & API Design | 11 Database, 12 ER Diagram, 13 API | **Partial** — schemas live in D2 §2/§25-refs and FS-QS-001 §2/§6 | Grow per feature; ERD generated from live Supabase schema, not hand-drawn |
| **D6** | Permission & Notification Matrix | 10 Permission Matrix, 23 Notification Rules | **Partial** — RACI in SOP R3 §15; notification rules per SOP procedure | Extend to full CRUD-level matrix when RBAC is wired (GAP-01/02) |
| **D7** | Test Book | 24 Test Plan, 25 Test Cases | **Seeded** — T1–T10 in FS-QS-001 §8 with exact expected values | One test set per feature spec; UAT = acceptance tests run by QS staff |
| **D8** | Manuals & Release | 26 User Manual, 27 Admin Manual, 28 Deployment, 29 Release Notes | **Deferred** — pre-release phase | Do not write for unbuilt screens |

**Libraries note (18–21 Rate/Material/Labor/Equipment Library):** these four V1.0 documents are *screens*, not documents. They consolidate into **two designs** inside D3: the **Resource Library** (one screen, one table, `category` filter = material/labor/equipment/subcon — the Price List promoted to company level) and the **Rate Library** (unit-rate compositions without prices). Both are specified as part of FS-QS-002 (see §5). The V1.0 idea of five separate library modules is rejected — it fragments the single-source-of-truth chain.

---

# 3. Mapping the V1.0 53-Chapter DDS to Owners

Every chapter of the V1.0 skeleton is owned exactly once. "Platform" = DCOS core engines, documented at platform level, **not rewritten inside the QS module**.

| DDS Chapters | Owner | Status |
|---|---|---|
| 1–7 Introduction, References, Terms, Purpose, Scope, Business Context, Stakeholders | **D1 Charter** (§4 below) | Complete |
| 8–9 Functional Overview, Module Architecture | **D1** + DCOS Architecture R0/Gap R1 | Complete |
| 10–11 User Roles, Permission Matrix | **D6** | Partial (RACI done; CRUD matrix pending GAP-01) |
| 12 Business Workflow | **D2 SOP R3** | Complete |
| 13 Use Case Model | **D3** feature specs (procedure steps = use cases) | Per feature |
| 14–16 UI Design, Navigation, Screen Specs | **D3** UI sections + §8 menu map below | Per feature |
| 17 Functional Specifications | **D3** | Per feature |
| 18–23 Business/Validation/Calculation/Measurement/BOQ/Estimation Rules | **D4 Rules Book** (§6 index) | ~60% |
| 24–26 Database, Data Dictionary, ERD | **D5** | Partial |
| 27–28 API, Integration | **D5** + platform Integration Layer spec (Gap R1 §4.14) | Partial |
| 29 Security Design | Platform (RLS/tenant isolation, Gap R1 §5.2) + D5 per-table RLS notes | Platform |
| 30 Audit Trail | **Platform engine** (Architecture R0 §24.4) — QS only registers its `module_code` events | Platform — do not redesign |
| 31 Notification Design | **Platform engine** (R0 §24.5) — QS rules listed in D6 | Platform |
| 32–33 Reporting, Dashboard | **D3** (FS per report/dashboard) + SOP R3 KPI definitions | Per feature |
| 34–38 Performance, Reliability, Availability, Scalability, Backup | **Platform** (Gap R1 §5.4/§5.5 benchmarks & DR) | Platform |
| 39–41 Deployment, Config Mgmt, Logging | **D8** + platform | Deferred |
| 42–43 Error/Exception Handling | **D3** per feature + D2 exception-handling blocks | Per feature |
| 44–46 Testing, Traceability, UAT | **D7** + §7 register | Seeded |
| 47–50 Installation, Admin, User, Maintenance Guides | **D8** | Deferred |
| 51 Release Management | **D8** | Deferred |
| 52 Future Enhancements | §9 roadmap below | Complete |
| 53 Appendices | Per document | — |

---

# 4. D1 — Module Charter (content)

## 4.1 Vision

One commercial engine for the whole contract lifecycle: every riel of cost and every dollar of revenue on a DCOS project flows through a single controlled chain — Price List → Unit Rate → BOQ → Budget → Transactions/VO → IPC → Retention → Final Account — with nothing living in Excel and nothing changing without a status, an approver, and an audit trail.

## 4.2 Scope

**In scope:** the four QS submodules — Tender & Estimate (tender register, cost estimation with 8 tabs, budget codes, tender management, submissions, bid evaluation), Cost Control (BOQ baseline, budget & variance, cost transactions, EVM, S-curve, time-phased baseline & cash flow, VO, IPC, retention), Subcon Mgmt (sub-IPC, back charges), Contract Admin (EIs, notices, entitlements) — plus the company-level Resource Library and Rate Library.

**Out of scope (owned elsewhere):** approval workflow engine, notification engine, audit trail engine, RBAC framework, document control, WBS engine (all platform); accounting GL/AP/AR (Finance module); procurement PR/RFQ/PO (Procurement module — QS consumes PO commitments as cost data).

**Boundary rules:** the locked BOQ is the only budget baseline; the certified IPC is the only revenue instrument; internal cost/margin never appears in client-facing output (dual-rate firewall).

## 4.3 Business context & stakeholders

Cambodian main contractor practice: USD contracts, ex-VAT pricing with VAT at bid summary, ~5% retention with 50/50 PC/DLP release, monthly IPC billing, heavy labor-only subcontracting, day-rate labor market. Stakeholders: QS Engineer, QS Manager, Estimator, PM, Commercial Director, Finance, Director; external — client/consultant QS, subcontractors, suppliers.

## 4.4 Success criteria

A tender can be priced end-to-end without Excel; a price change recalculates the bid in one action; the first project IPC is produced from the system with retention auto-deducted; management sees per-project margin position (tender vs forecast vs actual) on one dashboard.

---

# 5. D3 — Feature Specification Register

| FS ID | Feature | Absorbing enterprise tabs (V1.0 list) | Status |
|---|---|---|---|
| FS-QS-001 | Price List + Unit Rate Build-Up + Tender BOQ linking | 12 Rate Library (tender level), 14 Unit Price Analysis | **Issued** — `PROMPT_Price_List_Unit_Rate_Buildup_Tender_BOQ.md` incl. ARC/STR/MEP mock templates, T1–T10; seed data: `seed_price_list_{STR,ARC,MEP}_cambodia.sql` (249 items, PP market basis) |
| FS-QS-002 | Company Resource Library + Rate Library (recipes, save-to/load-from library, re-link by code) | 09–13 Material/Labor/Equipment/Rate/Resource Libraries → **2 screens** | Next — schema hook `library_rate_id` exists |
| FS-QS-003 | Bid Summary revision snapshot engine + input freeze | 22 Approval Workflow (QS usage) | Planned — rules defined in conversation record & D2 |
| FS-QS-004 | Sub Quotes → subcontracted BOQ rate feed | — | Planned |
| FS-QS-005 | Excel BOQ import/export | 21 Import & Export | Planned — highest user-demand item |
| FS-QS-006 | Quantity Take-Off + Measurement Sheets | 05 QTO, 06 Measurement Sheets | Planned — genuine gap; quantities currently unsupported by measurement backup |
| FS-QS-007 | Time-phased baseline & cash flow UI | 19 Forecast & Cash Flow | Planned — full design in SOP R3 §SOP-QS-10A (GAP-20) |
| FS-QS-008 | Margin engine (dual cost/sell rates) | — | Planned — design in SOP R3 §SOP-QS-05A (GAP-19) |
| FS-QS-009 | Final QS Cost Report (internal + client versions) | 17 Payment Certificates (final) | Planned — design in SOP R3 §SOP-QS-14A (GAP-21) |
| FS-QS-010 | Sub-IPC & back charges | 16 Progress Valuation (sub side) | Planned — SOP R3 §SOP-QS-15/16 |
| FS-QS-011 | Contract Admin — EI register & time-bar alerts | — | Planned — SOP R3 §SOP-QS-17 |
| FS-QS-012 | GFA, Site Area & Cost per m² Measurement and Reporting | — | **Issued** — `FS-QS-012_GFA_Cost_per_m2_Measurement.md` incl. school example mock data, T1–T12; guideline: `DCOS-QS-GDL-001 V1.0` |

Each FS follows the FS-QS-001 template: Role & Objective / Schema / Calculation Rules / Recalculation & Freeze Behavior / UI Spec / API / Mock Data / Acceptance Tests / Out of Scope / DoD.

---

# 6. D4 — Rules & Calculations Book (consolidation index)

Authoritative formulas currently distributed across D2 and FS-QS-001; to be extracted verbatim into `QS-Rules-Book.md`:

| Rule set | Current source |
|---|---|
| Unit rate build-up (per-line wastage on material; productivity on labor+plant); flat-mode fallback | FS-QS-001 §3.1–3.2 |
| BOQ item: rate linking, unit-match validation, manual override flag | FS-QS-001 §3.3, §5.3 |
| Bid summary chain: Direct+Subcon+Prelims → OH% → Profit% → Contingency → Risk → VAT (bases must be fixed & displayed) | SOP R3 SOP-QS-02; conversation decision log |
| Revision control: draft-edit-freely / final-freeze / new-revision-with-reason; snapshot-on-finalize | SOP R3 + FS-QS-001 §4 |
| VO thresholds: <5K PM · 5–50K PM+QSM · ≥50K +Director; contract sum = original + net approved VOs | SOP R3 SOP-QS-08 |
| IPC / G702: scheduled value from locked BOQ; over-claim block; retention auto-deduction on certify | SOP R3 SOP-QS-11 |
| Retention: deduction only via certification; 50% PC / 50% DLP release, ceiling checks | SOP R3 SOP-QS-12 |
| EVM: 12 metrics, health thresholds (CPI/SPI 0.95), escalation ladder | SOP R3 SOP-QS-09 |
| Time-phased distribution: linear by working days; override must total 100%; PV single-source | SOP R3 SOP-QS-10A |
| Margin: sell = Σ cost-component × (1+markup); visibility firewall | SOP R3 SOP-QS-05A |
| Rounding: store 4dp, display 2dp, never round intermediates | FS-QS-001 §3.5 |
| GFA measurement: entered per level from drawings, never derived; 100%/50%/0% inclusion rules | DCOS-QS-GDL-001 §3, FS-QS-012 §3.1–3.3 |
| Site Area: entered at project node from title deed; denominator for external works only | DCOS-QS-GDL-001 §4, FS-QS-012 §3.4 |
| Cost allocation: building cost ÷ GFA, external cost ÷ Site Area, never mixed | DCOS-QS-GDL-001 §5, FS-QS-012 §3.5–3.7 |
| Split reporting: above-ground $/m² and basement $/m² reported separately (mandatory) | DCOS-QS-GDL-001 §7, FS-QS-012 §3.7 |
| Standard Final Cost Summary: 5-line mandatory format | DCOS-QS-GDL-001 §9, FS-QS-012 §3.7 |
| Measurement rules (SMM basis for KH practice) | **Gap — to be authored with FS-QS-006** |

---

# 7. Traceability Register (format + seed)

Kept as a spreadsheet/table keyed by FS ID: `Requirement → Rule (D4) → Tables (D5) → API → Screen → Test (D7) → UAT sign-off`. Seed rows exist for FS-QS-001: e.g. *rate build-up requirement → D4 rule §3.1 → `unit_rates`,`unit_rate_lines` → `/unit-rates` endpoints → Unit Rates tab (build-up mode) → T1, T4, T10 → pending UAT*.

---

# 8. Menu Reconciliation — Enterprise 25 Tabs → DCOS Structure

| DCOS submodule (keep — lifecycle order) | Absorbs enterprise tabs |
|---|---|
| QS Dashboard | 01 Dashboard, 20 Reports (QS KPIs) |
| Tender & Estimate | 04 BOQ (tender), 05 QTO, 06 Measurement, 07 Cost Estimation, 08 CBS (= budget codes), 14 Unit Price Analysis |
| Cost Control | 15 VO, 16 Progress Valuation, 17 Payment Certificates, 18 Budget Control, 19 Forecast & Cash Flow |
| Subcon Mgmt | 16 (sub side), back charges |
| Contract Admin | EI/notices/entitlements (not in enterprise list — DCOS addition) |
| Libraries (company level) | 09–13 → Resource Library + Rate Library (two screens) |
| — Platform (not QS) | 02 Projects, 03 WBS Explorer, 22 Approval Workflow, 23 Audit Trail, 24 Settings, 25 Administration |

---

# 9. Roadmap Snapshot (chapter 52)

Now: FS-QS-002/003 (library + snapshot engine) → then FS-QS-005 (Excel import), FS-QS-007/008 (baseline, margin) → then FS-QS-006 (QTO), FS-QS-009–011 (close-out, subcon, contract admin). Deferred until pre-release: D8 manuals, deployment guide, release notes. Open critical gaps carried from SOP R3 register: GAP-01/02 (RBAC wiring) block D6 completion.

---

# 10. Artifact Inventory (everything that exists today)

| Artifact | Type | Maps to |
|---|---|---|
| SOP-QS-001_R3_Quantity_Surveying_Module.docx | Controlled SOP, 41pp | D2 |
| PROMPT_Price_List_Unit_Rate_Buildup_Tender_BOQ.md | Feature spec FS-QS-001 | D3, D4, D5, D7 |
| seed_price_list_STR_cambodia.sql (72 items) | Seed data | FS-QS-001 |
| seed_price_list_ARC_cambodia.sql (77 items) | Seed data | FS-QS-001 |
| seed_price_list_MEP_cambodia.sql (100 items) | Seed data | FS-QS-001 |
| DCOS System Architecture R0 + Gap Analysis R1 | Platform architecture | Platform references |
| FS-QS-012_GFA_Cost_per_m2_Measurement.md | Feature spec FS-QS-012 | D3, D4, D5, D7 |
| DCOS-QS-GDL-001_GFA_Cost_per_m2_Guideline.md | GFA & Cost per m² Guideline | D4 (measurement rules) |
| seed_gfa_school_example.sql | Seed data (school example) | FS-QS-012 |
| This document (DDS-001 V2.0) | Master index | All |

---

**End of Document — DCOS-QS-DDS-001 V2.0**
