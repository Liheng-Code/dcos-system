# DCOS — 50-Module Build Progress & Remaining Items

**Generated:** May 2026  
**Base Document:** DCOS-Gap-Analysis-R1  
**Status:** 23/50 fully implemented, 11/50 partially implemented, 16/50 not started

---

## Full 50-Module Map — Current Status

| # | Module | R0 Status | Built? | Details |
|---|---|---|---|---|
| 01 | Company / Tenant Setup | ✅ Captured | ✅ | Companies, profiles, settings |
| 02 | User / Role / Permission | ✅ Captured | ✅ | RBAC tables, permission guards, auth |
| 03 | Admin Configuration | ✅ Captured | ✅ | Naming conventions, level templates |
| 04 | Stakeholder Setup | ✅ Captured | ✅ | Stakeholders, templates, staff |
| 05 | Project Setup | ✅ Captured | ✅ | Wizard, mappings, team members |
| 06 | WBS Management | ✅ Captured | ✅ | Tree, tasks, cost, EVM, Gantt, Kanban |
| 07 | Tender Management | 🟡 Partial | ❌ | Not started |
| 08 | Tender Cost Estimation | 🆕 NEW | ❌ | Not started |
| 09 | Bid Submission & Award | 🆕 NEW | ❌ | Not started |
| 10 | Architecture Design | ✅ Captured | ✅ | Drawings, room data, schedules, RFI |
| 11 | Structural Design | ✅ Captured | ✅ | Calculations, rebar, technical queries |
| 12 | MEP Design | ✅ Captured | ✅ | Equipment, loads, sleeves, commissioning |
| 13 | Civil / Geotechnical Design | 🆕 NEW | ❌ | Not started |
| 14 | BIM Coordination | 🟡 Listed | 🟡 | Basic coordination log only — no clash detection or federation |
| 15 | Value Engineering | 🆕 NEW | ❌ | Not started |
| 16 | Authority Submission Tracking | 🆕 NEW | ❌ | Not started |
| 17 | Supplier Prequalification | 🆕 NEW | ❌ | Basic supplier list, no PQ workflow |
| 18 | Procurement (PR/RFQ/PO) | ✅ Captured | ✅ | Full: PR/PO/RFQ, GRN, invoice match, auto-reorder, file upload, notifications, audit log |
| 19 | Subcontractor Management | 🟡 Listed | ❌ | Not started |
| 20 | Inventory / Stock | ✅ Captured | ✅ | Inventory list, goods receipt, auto reorder |
| 21 | Material Test & Traceability | 🆕 NEW | ❌ | Not started |
| 22 | Construction Management | ✅ Captured | ✅ | Daily reports, manpower, equipment, progress photos |
| 23 | Planning & Scheduling | 🟡 Partial | 🟡 | Gantt, calendars, comparison, resource loading — **no CPM engine** |
| 24 | Equipment Management | 🟡 Partial | 🟡 | Basic tracking page — no asset master, maintenance, fuel logs, operator licenses |
| 25 | Lift Plan & Lifting Operations | 🆕 NEW | ❌ | Not started |
| 26 | Drawing Markup & Redline | 🆕 NEW | ❌ | Not started |
| 27 | QA/QC | ✅ Captured | ✅ | ITP, inspections, NCRs |
| 28 | HSE | ✅ Captured | ✅ | Permits, toolbox talks, incidents, risk assessments, observations |
| 29 | BOQ Engine | 🔴 NEW | ✅ | **Implemented** — BOQ builder, sections, revisions, cost library |
| 30 | Budget & Cost Control | 🟡 Partial | 🟡 | Cost transactions, budget view — more depth possible |
| 31 | Earned Value Management | 🆕 NEW | ✅ | **Implemented** — EVM panel, dashboard, S-curve, service |
| 32 | Progress Claim / IPC | 🔴 NEW | ✅ | **Implemented** — Progress claims, IPC items, certifications |
| 33 | Retention Management | 🆕 NEW | ✅ | **Implemented** — Retention ledger, register component |
| 34 | Variation Order Management | 🟡 Partial | 🟡 | VOs created — workflow depth could improve |
| 35 | Contract Administration | 🆕 NEW | ❌ | Not started |
| 36 | Claims & Disputes | 🟡 Listed | 🟡 | Claims page exists — no full dispute workflow |
| 37 | Document Control | ✅ Captured | ✅ | Full: register, naming, transmittals, workflow panel, controller dashboard, audit log |
| 38 | Commissioning / Handover | ✅ Captured | 🟡 | MEP handoff only — no standalone module |
| 39 | DLP Management | ✅ Captured | 🟡 | Mentioned only — not a standalone module |
| 40 | Facility Management Handover | 🆕 NEW | ❌ | Not started |
| 41 | HR Module | 🟡 Partial | 🟡 | Org, attendance, leave, timesheets, training, competency, performance, recruitment, assets — **payroll gap** |
| 42 | Account / Finance | 🟡 Partial | 🟡 | COA, AP, AR, payments, journals, GL, bank, WHT, reports — depth gaps remain |
| 43 | Multi-Currency / FX | 🆕 NEW | ❌ | Not started |
| 44 | Reporting & KPI | ✅ Captured | ✅ | Executive dashboard, reports hub, KPICard, financial/schedule reports |
| 45 | Lessons Learned | 🟡 Listed | ❌ | Not started |
| 46 | Notification Engine | ✅ Captured | ✅ | Task alerts, procurement/leave notifications |
| 47 | Approval Workflow Engine | ✅ Captured | ✅ | Shared approval workflow across modules |
| 48 | Audit Trail Engine | ✅ Captured | ✅ | Procurement audit log, document audit log |
| 49 | Mobile Field Application | 🔴 NEW | ❌ | Not started |
| 50 | Integration Layer | 🟡 Listed | ❌ | Telegram bot mentioned, no formal spec |

## Summary

| Status | Count | % |
|---|---|---|
| ✅ Fully Implemented | 23 | 46% |
| 🟡 Partially Implemented | 11 | 22% |
| ❌ Not Started | 16 | 32% |
| **Total** | **50** | **100%** |

---

## Remaining Items by Priority

### 🔴 Critical Priority — Commercial/Legal Risk

| # | Module | Built? | What's Needed |
|---|---|---|---|
| 19 | **Subcontractor Management** | ❌ | Subcontract setup (contract type, schedule of rates, retention %, performance bond), progress assessment (monthly measurement, back-charge deductions), interim payment certificate (IPC with retention/advance recovery), retention release (practical completion + DLP), performance management (KPI tracking, warning/default notices), back-charge workflow (raise→notify→dispute/accept→deduct from IPC) |
| 43 | **Multi-Currency / FX** | ❌ | Base currency per company, contract currency per project, exchange rate master (manual or API feed), FX gain/loss calculation (transaction-date vs payment-date), multi-currency PO/invoicing, currency exposure report (open commitments/receivables by currency) |
| 49 | **Mobile Field Application** | ❌ | Site task update (assignments, progress, photos) with offline support, daily report creation (manpower, weather), QA inspection checklists (pass/fail, NCR), HSE permit requests/toolbox talks/near-miss reporting, site photos with timestamp+GPS linked to WBS, RFI response, material delivery receipt (GRN at gate), punch list with photo evidence, drawing viewer (cached), offline sync protocol (local-first, conflict resolution, sync status indicator, compressed photos on cellular) |
| 35 | **Contract Administration** | ❌ | Contract register (head contracts + subcontracts — scope, value, dates, conditions), employer instructions (time/cost entitlement tracking), notice register (notice of claim, delay, additional cost — time-barred), contractual correspondence log, entitlement register (every event creating additional time or cost), time bar monitoring (alert before notice deadlines), contract conditions reference, dispute history (positions, settlements) |
| 26 | **Drawing Markup & Redline** | ❌ | PDF/DWF in-browser viewer (no download required), annotation tools (cloud, arrow, text, dimension, freehand pen, highlight, stamps), redline layer (separate from base file), as-built markup layer (links to NCR/site instruction), markup assignment (action items with due dates), markup status workflow (Open→Responded→Accepted→Closed), markup export (PDF for external issue), markup audit trail, RFI/NCR markup linking |

### 🟠 High Priority — Major Operational Gap

| # | Module | Built? | What's Needed |
|---|---|---|---|
| 07 | **Tender Management** | ❌ | Tender register, tender invitation/distribution, addendum management, tender query/response (Q&A log), submission tracking, tender evaluation template |
| 08 | **Tender Cost Estimation** | ❌ | Tender BOQ preparation (from drawings/specs), unit rate library (historical rates by region/project type), labour/plant/material build-up, preliminaries & general costs, subcontractor quotation intake/comparison, tender risk register, bid summary with overhead/profit/mark-up, tender programme, win/loss analysis (bid vs award vs competitors) |
| 09 | **Bid Submission & Award** | ❌ | Bid evaluation/comparison sheet, recommendation report, award letter generation, contract signing workflow, post-award handover to project setup |
| 17 | **Supplier Prequalification** | ❌ | Company registration (legal status, financials, years in business), financial health check (audited accounts, credit rating, turnover), technical capability (equipment, key personnel, references), quality certification (ISO), HSE performance record (incident frequency), insurance coverage verification, approved supplier register (trade categories, expiry), annual renewal with certificate expiry triggers, supplier performance scoring (delivery, quality, responsiveness, commercial), blacklist management |
| 21 | **Material Test & Traceability** | ❌ | Material test certificate upload (attached to stock receipt or MAR), test result recording (cube strength, tensile, thickness), lot/batch tracking (which batch issued to which WBS), material approval request (sample + certificate → consultant approval before use), non-conforming material hold (quarantine + link to NCR), traceability report (by WBS location — show all material batches with certificates), expiry tracking (adhesives, sealants, membranes) |
| 16 | **Authority Submission Tracking** | ❌ | Submission register (authority, reference, date), required document package definition, submission status tracking (Submitted→Under Review→Additional Info→Approved/Rejected), approval condition register (each condition actioned and closed), permit expiry tracking, occupation certificate (OC) linking to handover, utility connection tracking (water, electricity, gas, telecom), regulatory contact database |
| 25 | **Lift Plan & Lifting Operations** | ❌ | Lift plan register (date, load, crane type, radius, height), method statement linking, appointed person assignment (competency certificate), ground bearing check (outrigger load assessment), exclusion zone definition (linked to site plan), pre-lift checklist (crane/sling inspection, load, weather), lift permit linkage (permit requires approved lift plan), post-lift record (incidents/near misses) |
| 23 | **Planning (CPM Engine)** | 🟡 | **Float calculation** (total float, free float per task), critical path identification + visual highlighting, schedule impact propagation (task update → automatic cascade), baseline revision control (Rev 0, Rev 1 with comparison), schedule performance index (SPI → EVM integration), time impact analysis (TIA template for EOT claims) |
| 13 | **Civil / Geotechnical Design** | ❌ | Drawing register, calculation notes, geotechnical report tracking, model files, RFI management, coordination with ARC/STR/MEP |
| 24 | **Equipment Management (full)** | 🟡 | Equipment register + asset master (owned vs rented), utilization tracking per WBS, fuel/running cost log, PPM maintenance schedule, breakdown/repair records (MTBF, repair cost), rental management (hire period, rate, return condition, hire invoice), operator assignment + licence tracking (crane, excavator, forklift) |

### 🟡 Medium Priority — Enhancement / Completeness

| # | Module | Built? | What's Needed |
|---|---|---|---|
| 41 | **HR — Payroll Integration** | 🟡 | Payroll input/output specification, daily labour rates by trade, overtime multipliers, site/meal/risk allowances, tax deduction rules, labour law compliance per jurisdiction |
| 30 | **Budget & Cost Control** | 🟡 | Approved budget baseline from contract BOQ, budget/committed/actual/forecast/variance tracking, cost roll-up through WBS parents, green/amber/red variance thresholds, cost-to-complete + forecast-at-completion |
| 34 | **Variation Order (depth)** | 🟡 | Full VO workflow (draft→submitted→priced→approved/rejected→implemented), schedule impact days, revised contract sum tracking, IPC eligibility for approved VOs |
| 36 | **Claims & Disputes (full)** | 🟡 | EOT/prolongation/disruption/acceleration claims, evidence collection (linked to delay events, tasks, daily reports, photos, RFIs), claim cost build-up, submitted/assessed/agreed/disputed amount tracking, negotiation/adjudication/arbitration/settlement statuses |
| 15 | **Value Engineering** | ❌ | VE proposal register, cost/schedule impact analysis, approval workflow, implementation tracking |
| 14 | **BIM Coordination (deep)** | 🟡 | Full clash detection interface, model versioning/federation, issue tracking and resolution, model-to-WBS linking |
| 38 | **Commissioning / Handover** | 🟡 | Standalone module: system-by-system commissioning, test packs, certificates, handover package (O&M manuals, as-built drawings, spare parts list) |
| 39 | **DLP Management** | 🟡 | Defect register, inspection scheduling, rectification tracking, completion certificate workflow |
| 40 | **FM Handover** | ❌ | Asset register (with warranty), maintenance plans, warranty register (expiry tracking), O&M manual repository, FM data package generation |
| 45 | **Lessons Learned** | ❌ | Searchable knowledge base, project outcome → tender pricing feedback, risk register feedback, method statement template refinement, categorised by trade/project type |
| 50 | **Integration Layer** | 🟡 | API schema specification, webhook event catalog, authentication pattern (API keys/JWT), ERP/accounting sync (QuickBooks, Xero, SAP), BIM/CAD import (Revit, AutoCAD), HR/payroll sync, government/e-permit APIs, IoT/sensor integration, Telegram bot command specification, email inbound parsing, mobile sync protocol |

---

## Summary by Tier

| Tier | Count | Modules |
|---|---|---|
| 🔴 Critical | 5 | 19, 43, 49, 35, 26 |
| 🟠 High | 10 | 07, 08, 09, 17, 21, 16, 25, 23, 13, 24 |
| 🟡 Medium | 13 | 41, 30, 34, 36, 15, 14, 38, 39, 40, 45, 50, 42, 37 (enhance) |
| **Total remaining** | **28** | 17 not started + 11 partially complete |

## Key Achievements Beyond R0

Modules marked as "NEW" or "Critical" in the Gap Analysis that have been built:

| Module | Built | Notes |
|---|---|---|
| 29 — BOQ Engine | ✅ | BOQ builder, sections, revisions, cost library |
| 31 — Earned Value Management | ✅ | EVM panel, dashboard, CPI/SPI/EAC/S-curve |
| 32 — Progress Claim / IPC | ✅ | IPC workflow, items, certifications |
| 33 — Retention Management | ✅ | Retention ledger, release tracking |
