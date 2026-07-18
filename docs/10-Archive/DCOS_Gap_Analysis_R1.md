# DCOS — System Architecture Gap Analysis & Improvement Report
## Digital Construction Operating System

| Field | Detail |
|---|---|
| Document Code | DCOS-ARCH-GAP-001 |
| Version | R1 — Initial Issue |
| Base Document | DCOS System Architecture Module Design R0 |
| Review Type | End-to-End Construction Enterprise Platform Review |
| Classification | Internal — Strategic Architecture |
| Prepared | May 2026 |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [What Has Been Captured — Strengths](#2-what-has-been-captured--strengths)
3. [What Is Shallow — Needs More Design](#3-what-is-shallow--needs-more-design)
4. [What Is Missing — Must Be Added](#4-what-is-missing--must-be-added)
5. [Platform Infrastructure Gaps](#5-platform-infrastructure-gaps)
6. [Revised Complete Module Map](#6-revised-complete-module-map)
7. [Revised Build Priority & Phasing](#7-revised-build-priority--phasing)
8. [Database Architecture Additions](#8-database-architecture-additions)
9. [Architecture Risk Register](#9-architecture-risk-register)
10. [Recommendations & Next Steps](#10-recommendations--next-steps)

---

## 1. Executive Summary

This report presents a comprehensive review of the DCOS System Architecture document (R0) against the requirements of a complete, end-to-end construction enterprise platform. The review evaluates what has been designed, what has been captured at a shallow level, and what is missing entirely — across all phases of the construction lifecycle.

The R0 architecture document is a strong strategic foundation. The WBS-driven unified platform philosophy is correct. The core engines — approval workflow, notification matrix, and audit trail — are well-designed with genuine depth. The discipline module structure (Architecture, Structure, MEP) is appropriate for a construction environment.

However, the document has significant gaps that will prevent DCOS from functioning as a true enterprise platform if left unaddressed. The most critical gaps fall in four areas: financial control depth (no BOQ engine, no earned value management, no retention), pre-contract lifecycle (no tender cost estimation, no bid management scoring), supply chain completeness (no supplier prequalification, no material traceability), and platform infrastructure (no mobile field app design, no drawing markup engine, no integration specifications).

### Coverage Summary

| Area | Captured | Partial | Missing | Risk |
|---|---|---|---|---|
| Pre-contract & Tender | 1 | 1 | 2 | 🔴 High |
| Design & Engineering | 2 | 1 | 3 | 🟡 Medium |
| Procurement & Supply Chain | 2 | 2 | 3 | 🔴 High |
| Construction Execution | 3 | 2 | 3 | 🟡 Medium |
| Cost & Commercial | 1 | 2 | 4 | 🔴 Critical |
| Handover & Post-Contract | 2 | 0 | 1 | 🟡 Medium |
| Platform Foundations | 3 | 1 | 5 | 🔴 High |
| **TOTAL** | **14** | **9** | **21** | **🔴 Platform incomplete** |

> **Key Conclusion:** The R0 document covers approximately 37% of what a complete enterprise construction platform requires. The financial control layer, pre-contract lifecycle, and platform infrastructure are the highest-priority gaps. These gaps must be addressed in R1 before detailed module development begins.

---

## 2. What Has Been Captured — Strengths

The following areas in R0 are well-designed and represent genuine architecture work that should be preserved in its current form.

### 2.1 Core Platform Engines — Excellent Depth

The three cross-cutting engines are the strongest part of the R0 document. They demonstrate enterprise-level thinking and are production-ready in their design.

| Engine | Coverage | Notable Strengths |
|---|---|---|
| Audit Trail Engine | ✅ Excellent | Full data model with 25 fields, severity levels, category taxonomy, retention policy, UI design, API endpoints, and integration rules. One of the best-designed sections in the document. |
| Notification Matrix | ✅ Excellent | Complete trigger list, priority levels, channel strategy, escalation logic, anti-spam rules, template examples, and data model. Ready for implementation. |
| Approval Workflow Engine | ✅ Good | Generic multi-step flow covers all use cases. Connected to all relevant modules. Minor gap: no parallel approval path design for multi-discipline sign-off. |

### 2.2 Discipline Design Modules — Appropriately Structured

| Module | Coverage | Assessment |
|---|---|---|
| Architecture Design | ✅ Captured | Drawing register, room data sheets, finish schedules, RFI, authority submission, and design coordination workflow all present. Practical and construction-relevant. |
| Structural Design | ✅ Captured | Drawing register, calculation notes, model file tracking, rebar review, shop drawing review, and technical queries covered. Good depth for a structural discipline module. |
| MEP Design | ✅ Captured | All sub-disciplines listed, sleeve/opening coordination, equipment schedule, RFI, and commissioning handoff workflow. Correctly defers test data to commissioning module. |
| BIM Coordination | ✅ Captured | Listed as a module with clash detection interface. Not designed in detail — acceptable at R0 stage. |

### 2.3 WBS Engine — Correct Philosophy

The WBS-driven architecture is the correct philosophy for a construction operating system. The dynamic depth, breadcrumb path, roll-up mechanism, and unique code rule are all sound decisions. The five-question framework (project / WBS / discipline / responsible / status) is a strong design principle.

> **Preserve These Decisions:**
> - WBS as the single spine connecting all modules — do not change this.
> - Dynamic hierarchy depth (not fixed levels) — essential for mixed project types.
> - Progress and cost roll-up from child to parent — correct calculation direction.
> - WBS code uniqueness within project — critical for document numbering integrity.

### 2.4 Document Control — Solid Foundation

The document control module covers revision control, transmittal, approval workflow, status flow, and common document types. The document numbering example (`P001-STR-DWG-B01-L05-001-R02`) is well-structured for construction practice. The transmittal-as-access-gate principle is architecturally sound.

### 2.5 Construction Execution Module — Practical

Site task management, daily reports, manpower logs, equipment logs, progress updates, photo uploads, and the task status flow are all appropriate for construction site operations. The concrete pour record mention is a good construction-specific touch.

### 2.6 QA/QC and HSE Modules — Industry Standard

ITP, inspection request, hold/witness points, NCR, corrective action, and punch list represent standard construction QA practice. HSE covers toolbox talks, safety permits, incident reporting, and the correct permit types for construction sites (hot work, confined space, work at height, excavation, lifting, electrical isolation).

### 2.7 MVP Build Priority — Pragmatic

The four-phase MVP build sequence is pragmatic and correctly defers complexity. Starting with project setup, WBS, task management, document control, and approval workflow before adding financial control is the right order. This sequencing should be maintained in the build plan.

---

## 3. What Is Shallow — Needs More Design

The following modules are mentioned or listed in R0 but lack sufficient design detail for a development team to build from. These are not missing — they are incomplete. Each needs a dedicated module design session before implementation.

### 3.1 Account / Finance Module — Critical Depth Gap

This is the most under-designed module relative to its business importance. The module is listed with correct features (chart of accounts, AP/AR, payment, cash flow, budget vs actual, variation order, final account) but none of these are designed in depth.

| Missing Design | Business Impact | Priority |
|---|---|---|
| BOQ structure and line item model | Cannot link cost to WBS without BOQ engine | 🔴 Critical |
| Progress claim / IPC workflow | No designed flow for client billing | 🔴 Critical |
| Three-way match logic | PO + GRN + Invoice matching rules not defined | 🟠 High |
| Budget commitment vs expenditure logic | Cannot produce committed cost reports | 🟠 High |
| Retention calculation rules | Standard 5–10% retention not handled | 🟠 High |
| Variation order valuation workflow | Mentioned but no workflow designed | 🟠 High |
| Cash flow projection | No forecast model defined | 🟡 Medium |
| Final account process | Mentioned but no structured workflow | 🟡 Medium |

### 3.2 Subcontractor Module — Listed, Not Designed

The subcontractor module appears in the module map (Module 19) but has no dedicated design section. Subcontractor management is one of the most complex workflows in construction, touching procurement, site execution, QA/QC, progress claims, retention, and payment simultaneously.

| Required Design Area | Description |
|---|---|
| Subcontract setup | Contract type, scope of work, schedule of rates, milestone schedule, retention percentage, performance bond |
| Progress assessment | Monthly measurement against BOQ items, back-charge deductions, attendance credit |
| Interim payment certificate | IPC preparation, deduction of retention, deduction of back charges, advance recovery |
| Retention release | Practical completion release and DLP completion release workflow |
| Performance management | KPI tracking, warning notices, default notices, termination procedure |
| Back-charge management | Raise back-charge, notify subcontractor, dispute or accept, deduct from IPC |

### 3.3 Equipment Management Module — Surface Only

Equipment is mentioned in the construction module and listed in the module map (Module 18) but has no dedicated module design. Construction equipment is a significant cost centre and operational dependency.

| Missing Feature | Why It Matters |
|---|---|
| Equipment register and asset master | Cannot track owned vs rented equipment without an asset record |
| Utilization tracking per WBS | Equipment cost must be allocated to WBS for project cost accuracy |
| Fuel and running cost log | Fuel is a major site expense — needs daily tracking per equipment unit |
| Maintenance schedule (PPM) | Planned preventive maintenance prevents breakdowns and cost overruns |
| Breakdown and repair records | Mean time between failures and repair cost needed for equipment planning |
| Rental management | External hire — hire period, hire rate, return condition, hire invoice |
| Operator assignment and licence tracking | Safety compliance for crane, excavator, and forklift operators |

### 3.4 Planning & Scheduling Module — Gantt Without CPM Engine

The planning module lists Gantt view, baseline vs actual, S-curve, and look-ahead plan — which are the right outputs. However, the module does not describe how the critical path method (CPM) engine works, how float is calculated, or how schedule updates propagate through dependencies. Without this, the Gantt is a display tool, not a scheduling engine.

**What needs to be added:**
- Float calculation (total float, free float) per task and WBS path
- Critical path identification and visual highlighting
- Schedule impact propagation when a task is updated — automatic cascade
- Baseline revision control — Revision 0, Revision 1 with comparison
- Schedule performance index (SPI) as part of EVM integration
- Time impact analysis (TIA) template for EOT claims

### 3.5 HR Module — Payroll Integration Gap

The HR module covers employee master, attendance, leave, and timesheet correctly. However, the payroll support section is underdeveloped. The document says "payroll input" and "payroll export" without defining what these mean. A construction company's payroll is complex — it involves daily labour rates, overtime multipliers, allowances (site allowance, meal allowance, risk allowance), tax deductions, and labour law compliance for the operating jurisdiction.

### 3.6 Claims & Disputes Module — Listed Only

Module 22 (Claims & Disputes) appears in the module map with the description "EOT, cost claims, evidence" but has no design section. Claims are how the company recovers losses from employer-caused delays, variations, disruption, and acceleration. The module needs a dedicated design covering EOT claim preparation, contemporaneous records, expert reports, dispute resolution procedure, and adjudication support.

### 3.7 Lessons Learned Module — Too Light

Module 23 is listed as "Knowledge and historical data" with no design at all. In a mature construction company, lessons learned is a searchable knowledge base that connects project outcomes to future tender pricing, risk registers, and method statement templates. The current description is too vague to build from.

---

## 4. What Is Missing — Must Be Added

The following are completely absent from the R0 document but are essential for an end-to-end construction enterprise platform. Each represents a standalone capability that needs a full module design section.

### 4.1 BOQ / Cost Breakdown Structure Engine

> **Priority: Critical — Foundation of Financial Control**
> No construction enterprise system can function without a Bill of Quantities engine. The BOQ is the bridge between design, procurement, cost control, and client billing. Without it, there is no basis for budget, no basis for procurement pricing, and no basis for valuing progress.

The BOQ engine must be designed as a first-class module, not an afterthought under Account/Finance. It serves as the cost DNA of every project.

| BOQ Component | Description | Links To |
|---|---|---|
| BOQ item master | Item code, description, unit of measure, unit rate, quantity, total value | WBS, Procurement, Account |
| Trade / section structure | Group BOQ items by trade (concrete, steel, finishes, MEP) | Discipline modules |
| Tender BOQ | Pre-award BOQ for bid pricing and tender comparison | Tender / Project Setup |
| Contract BOQ | Awarded BOQ — the financial baseline of the project | Contract, Budget |
| Revised BOQ | Variation orders update the contract BOQ with revision tracking | Variation Order |
| Procurement BOQ linking | PR and PO linked to BOQ item codes for budget commitment tracking | Procurement |
| Progress measurement | Monthly re-measurement of BOQ items for progress claim preparation | IPC, Subcontractor |
| Resource-loaded BOQ | Labour, plant, and material cost against each BOQ item for cost-to-complete | Planning, Equipment, HR |
| BOQ cost report | Budget vs committed vs actual spend per BOQ item and trade | Reporting |

### 4.2 Earned Value Management (EVM) Module

Earned Value Management is the industry standard for measuring true project performance. Without EVM, a construction company's reporting is limited to "what percentage is physically complete" — which tells management nothing about whether the project is on budget or will finish within the contract sum.

| EVM Metric | Formula | What It Tells Management |
|---|---|---|
| Planned Value (PV) | Budgeted cost of work scheduled | What we planned to have done by today |
| Earned Value (EV) | Budgeted cost of work performed | What we have actually achieved in budget terms |
| Actual Cost (AC) | Actual cost incurred to date | What we have actually spent |
| Cost Variance (CV) | EV − AC | Positive = under budget. Negative = over budget |
| Schedule Variance (SV) | EV − PV | Positive = ahead of schedule. Negative = behind |
| Cost Performance Index (CPI) | EV / AC | CPI < 1 means cost overrun. CPI > 1 means cost saving |
| Schedule Performance Index (SPI) | EV / PV | SPI < 1 means behind programme. SPI > 1 means ahead |
| Estimate at Completion (EAC) | BAC / CPI | Forecast final cost at current performance rate |
| Variance at Completion (VAC) | BAC − EAC | Projected final over/under-run against contract sum |

### 4.3 Tender Cost Estimation Module

There is no module designed for the actual cost estimating process during tender preparation. Winning tenders at the right price is the source of all future revenue.

| Estimation Feature | Description |
|---|---|
| Tender BOQ preparation | Build the bid BOQ from drawings, specifications, and scope documents |
| Unit rate library | Historical unit rates from completed projects, benchmarked by region and project type |
| Labour rate schedule | Labour cost by trade, including direct cost, on-costs, and productivity factors |
| Preliminary and general costs | Site establishment, supervision, plant, temporary works, insurance, bonds |
| Subcontractor quotation intake | Receive and compare sub-quotes during tender period |
| Tender risk register | Identify and price risk items — weather, ground conditions, design risk, market volatility |
| Bid summary and mark-up | Aggregate direct costs, apply overheads and profit margin, produce final bid price |
| Tender programme | Preliminary programme for method statement and resource planning |
| Tender submission package | BOQ, programme, method statement, risk register, qualifications |
| Win/loss analysis | Compare bid price to award price and to competitors when known |

### 4.4 Supplier Prequalification Module

The procurement module starts from the assumption that an approved supplier list already exists. In practice, suppliers and subcontractors must be formally prequalified before they are eligible to receive RFQs or be awarded subcontracts.

| PQ Feature | Description |
|---|---|
| Company registration | Legal status, registration number, paid-up capital, years in business |
| Financial health check | Audited accounts, bank reference, credit rating, turnover vs capacity |
| Technical capability | Scope of work, equipment list, key personnel CVs, past project references |
| Quality certification | ISO 9001, ISO 14001, OHSAS 18001 / ISO 45001 certificates |
| HSE performance record | Incident frequency rate, near miss rate, enforcement history |
| Insurance coverage | Public liability, employer's liability, professional indemnity, plant insurance |
| Approved supplier register | PQ result, approved trade categories, approval expiry date |
| Annual renewal process | Trigger review when certificates expire or performance falls below threshold |
| Supplier performance scoring | Delivery reliability, quality, responsiveness, commercial compliance — tracked per PO |
| Blacklist management | Flag and block suppliers with poor performance, fraud, or regulatory violations |

### 4.5 Drawing Markup & Redline Module

Construction is a drawing-intensive industry. Engineers, inspectors, and site supervisors need to annotate drawings directly. Without in-platform markup, users will fall back to external PDF tools and lose the audit trail.

| Markup Feature | Description |
|---|---|
| PDF / DWF viewer | View drawings in-browser without downloading. No external viewer required. |
| Annotation tools | Cloud, arrow, text box, dimension, freehand pen, highlight, stamp (Approved/Rejected/For Information) |
| Redline layer | Markups exist as a separate layer — never modifying the base drawing file |
| As-built markup | Special redline layer for as-built deviations — links to NCR or site instruction |
| Markup assignment | Assign a markup to a user for response — becomes an action item with due date |
| Markup status | Open / Responded / Accepted / Closed — full lifecycle tracking |
| Markup export | Export drawing + markup layer as PDF for external issue (client, authority) |
| Markup audit trail | Who added, modified, or closed each markup — linked to audit log engine |
| Markup linking to RFI/NCR | Link a markup directly to an RFI or NCR record for traceability |

### 4.6 Mobile Field Application

The R0 document mentions mobile offline as a Phase 4 item but provides no design for it. The mobile field application is not an advanced feature — it is a core operational requirement. Site supervisors, QA inspectors, and HSE officers cannot carry laptops across a construction site.

| Mobile Module | Key Features | Offline Required |
|---|---|---|
| Site task update | View assigned tasks, update progress, upload photos | Yes |
| Daily report | Create daily report, log manpower headcount, log weather | Yes |
| QA inspection | Complete inspection checklist, record pass/fail, raise NCR | Yes |
| HSE permit request | Request work permit, record toolbox talk, report near miss | Yes |
| Site photo with location | Timestamp and GPS-tagged photos linked to WBS node | Yes |
| RFI response | View and respond to RFIs from site | Yes |
| Material delivery receipt | Confirm GRN at site gate, photo of delivery documentation | Partial |
| Punch list | Record and close punch list items with photo evidence | Yes |
| Drawing viewer | View latest issued drawings linked to current task | Yes — cached |

> **Offline Sync Design Principles:**
> - All mobile data must be written to local device storage first, then synced to server on connection.
> - Conflict resolution: server timestamp wins for approvals; device timestamp wins for field data.
> - Sync status indicator must be visible on every screen.
> - Compressed photo upload on cellular — full resolution upload on WiFi only.

### 4.7 Retention Management Module

Retention is a fundamental financial mechanism in construction contracts — a percentage (typically 5%) of every certified payment is withheld as security for performance obligations. Absent from the R0 document entirely.

| Retention Feature | Description |
|---|---|
| Retention percentage setup | Configure retention rate per contract (e.g. 5% reducing to 2.5% at 50% completion) |
| Retention deduction per IPC | Automatically deduct correct retention from each interim payment certificate |
| Retention account balance | Running balance of retention held — both client-owed to us and us-owed to subcontractors |
| Practical completion release | Trigger release of 50% of retention (or per contract terms) at practical completion |
| DLP completion release | Release remaining retention at end of Defect Liability Period with client sign-off |
| Retention bond alternative | Some contracts allow retention bond instead of cash — track bond details and expiry |
| Subcontractor retention mirror | Deduct from sub-IPCs exactly as the client deducts from us |
| Retention receivable report | Aged report showing retention due from client by contract and anticipated release date |

### 4.8 Progress Claim / Interim Payment Certificate (IPC) Module

The IPC is the most important monthly document in construction — the formal claim submitted to the client for payment of completed work. The entire workflow is absent from R0.

```
IPC Workflow:
1. Prepare draft IPC       — QS measures completed work against contract BOQ items
2. Add approved variations — All client-approved VOs added at certified values
3. Apply retention         — Deduct retention per contract (usually 5% → 2.5%)
4. Apply advance recovery  — Recover mobilisation advance per recovery schedule
5. Apply back-charges      — Deduct agreed back-charges
6. Submit to client/PMC    — Formal submission with measurement sheets and photos
7. Client/PMC review       — Client may adjust quantities — tracked adjustment log
8. Certification           — Certified value recorded — difference reason logged
9. Payment                 — Payment against certified IPC → links to AP/AR
10. Cumulative tracking    — Running total: original contract + variations + certified to date
```

### 4.9 Multi-Currency & Foreign Exchange Module

The project setup lists a currency field but the system has no FX engine. Construction projects in Southeast Asia routinely involve contracts in one currency (USD) with costs in another (KHR, THB, VND).

| FX Feature | Description |
|---|---|
| Base currency per company | Company reporting currency — all consolidated reports in this currency |
| Contract currency per project | Invoice and payment currency per contract — may differ from base currency |
| Exchange rate master | Daily or monthly exchange rates per currency pair — manual entry or API feed |
| FX gain/loss calculation | Track difference between transaction-date rate and payment-date rate |
| Multi-currency PO | Issue PO in supplier's currency, track in contract currency and base currency |
| Multi-currency invoicing | Invoice in client's preferred currency, recognise revenue in base currency |
| Currency exposure report | Open commitments and receivables by currency — FX risk management |

### 4.10 Material Test Certificate & Traceability Module

Construction materials must be tested and certified before incorporation into permanent works. The current inventory module tracks receipt and issue but has no mechanism for linking a stock item to its test certificates or material approval request.

| Traceability Feature | Description |
|---|---|
| Material test certificate upload | Attach test certificates to a stock receiving record or material approval |
| Test result recording | Record cube strength tests, tensile tests, thickness measurements |
| Lot / batch tracking | Track which batch/lot of material was issued to which WBS location |
| Material approval request (MAR) | Formal submission of material sample and certificate to consultant/client for approval before use |
| Non-conforming material hold | Flag and quarantine material that fails test — link to NCR in QA/QC module |
| Traceability report | For any WBS location: show which material batches were incorporated, with certificates |
| Expiry tracking | Some materials (adhesives, sealants, waterproofing membranes) have shelf life |

### 4.11 Lift Plan & Lifting Operations Module

Lifting is one of the highest-risk activities on a construction site and is regulated in most jurisdictions. The HSE module covers lifting permits but does not cover the lift planning process.

| Lift Planning Feature | Description |
|---|---|
| Lift plan register | Record each planned lift with date, load, crane type, radius, height |
| Method statement linking | Attach detailed lift method statement document |
| Appointed person assignment | Designated lift supervisor with competency certificate |
| Ground bearing check | Record ground bearing capacity assessment for crane outrigger loads |
| Exclusion zone definition | Define and notify exclusion zones — linked to site plan/drawing |
| Pre-lift checklist | Crane inspection, sling inspection, load confirmation, weather check |
| Lift permit linkage | Link lift plan to HSE lifting permit — permit cannot be issued without approved lift plan |
| Post-lift record | Record actual lift performance, any incidents or near misses |

### 4.12 Authority Submission Tracking Module

Every construction project requires regulatory approvals — building permits, planning approvals, utility connections, fire authority certificates. There is no dedicated module for tracking the full regulatory submission lifecycle.

| Authority Submission Feature | Description |
|---|---|
| Submission register | Track every regulatory submission by authority, reference number, submission date |
| Required document package | Define what documents must be included per authority type |
| Submission status tracking | Submitted / Under Review / Additional Info Required / Approved / Rejected |
| Approval condition register | Record conditions attached to approvals — each condition must be actioned and closed |
| Expiry tracking | Permits have validity periods — trigger alerts before expiry |
| Occupation certificate (OC) | Final certificate linking to handover — building cannot be occupied without OC |
| Utility connection tracking | Water, electricity, gas, telecom connections from utility authority |
| Regulatory contact database | Named contacts at each authority — builds institutional knowledge |

### 4.13 Contract Administration Module

Contract administration is distinct from project management — it is the formal management of the contractual relationship with the client, tracking notices, instructions, entitlements, time bars, and claims. Without this, the company is exposed to losing contractual entitlements through non-compliance with notice provisions.

| Contract Admin Feature | Description |
|---|---|
| Contract register | Head contract details, subcontract register — scope, value, dates, conditions |
| Employer's instructions (EI) | Formal instructions from client — each one potentially creates a time and cost entitlement |
| Notice register | Contractual notices — notice of claim, notice of delay, notice of additional cost. Time-barred. |
| Contractual correspondence log | Track all formal correspondence — letters, minutes of meetings, emails with contractual significance |
| Entitlement register | Track every event that creates an entitlement to additional time or cost |
| Time bar monitoring | Alert when a notice deadline is approaching — missing time bars costs money |
| Contract conditions reference | Key contract conditions linked to relevant records — e.g. Clause 20 for claims |
| Dispute history | Record of disputes raised, positions taken, settlements reached |

### 4.14 Integration Layer Design

The R0 document lists an Integration Engine in the application layer but provides no specification. Without a designed integration layer, every integration becomes a custom one-off project.

| Integration Area | Target Systems | Priority |
|---|---|---|
| Accounting / ERP | QuickBooks, Xero, SAP — financial sync for payables, receivables, GL | 🟠 High |
| BIM / CAD | Revit, AutoCAD, Navisworks — model file import, attribute extraction | 🟡 Medium |
| HR / Payroll | Existing HR or payroll systems — employee sync, payslip export | 🟡 Medium |
| Government / Regulatory | e-permit systems, customs, tax authority reporting | 🟡 Medium |
| IoT / Sensors | Concrete temperature sensors, structural monitoring, weather stations | 🟢 Low |
| Telegram Bot | Already planned — needs formal bot command specification | 🟠 High |
| Email / Exchange | Inbound email parsing for RFI responses, document transmittal receipt | 🟡 Medium |
| Mobile app sync | Offline-first sync protocol between mobile app and server | 🔴 Critical |

---

## 5. Platform Infrastructure Gaps

Beyond individual module gaps, the R0 document has structural platform-level omissions that affect all modules simultaneously.

### 5.1 Data Archiving and Retention Policy

The audit log section defines retention periods but there is no platform-wide data lifecycle policy. Without a defined archiving strategy, the production database will grow without bound.

| Data Type | Active Retention | Archive Period | Storage Tier |
|---|---|---|---|
| Active project data | Project duration + 2 years | 10 years | Hot storage (fast) |
| Completed project data | 2 years post-completion | 10 years | Warm storage |
| Financial records | 7 years minimum | 10 years per jurisdiction | Warm storage |
| Drawing files | Project duration + 5 years | 15 years (latent defects) | Cold storage |
| Site photos | Project duration + 3 years | 10 years | Cold storage |
| Audit logs — security | Active | 7 years | Warm storage |
| HR and payroll records | Employment + 7 years | 10 years | Cold storage |
| Tender records (unsuccessful) | 2 years | 5 years | Cold storage |

### 5.2 Multi-Tenant Security Architecture

DCOS is described as multi-tenant but the security architecture for tenant isolation is not specified. If a Company A user can — even accidentally — see Company B data, the system is a security and commercial liability.

> **Required Tenant Isolation Design:**
> - Row-level security (RLS) in PostgreSQL — all tables must include `tenant_id` with RLS policy.
> - All API endpoints must validate `tenant_id` from JWT token — never from request body.
> - File storage must be partitioned by tenant — no shared bucket paths.
> - Background jobs must be tenant-scoped — job queue cannot leak cross-tenant.
> - Super Admin access to tenant data requires explicit impersonation with audit log entry.
> - Automated cross-tenant data leak tests must be part of CI/CD pipeline.

### 5.3 File Storage Architecture

Construction projects involve very large files (BIM models up to several GB, drawing sets of hundreds of files, photo archives of tens of thousands of images). File management needs dedicated design.

| File Architecture Decision | Recommendation |
|---|---|
| File size limits | Drawings: 100MB max. BIM models: 2GB max. Photos: 20MB max (auto-compressed for mobile) |
| Versioning | Never overwrite files — always store new version. Soft delete only. Hard delete requires admin + audit. |
| CDN delivery | All file downloads via CDN (Cloudflare) — never direct S3 URLs. Signed URLs with expiry. |
| Virus scanning | All uploads scanned before stored. Quarantine infected files with alert to admin. |
| Image processing | Auto-generate thumbnails and compressed previews for photos. Store original + preview. |
| BIM file handling | Large file upload via chunked multipart. Resume on failure. Progress indicator required. |
| Backup strategy | Daily snapshot to separate region. Point-in-time recovery for 30 days. |
| Storage quotas | Per-tenant storage quota configurable. Alert at 80% usage. Hard block at 100%. |

### 5.4 System Performance Benchmarks

The R0 document does not define any performance requirements. Explicit performance targets are needed to guide architecture decisions, database indexing strategy, and caching design.

| Operation | Target Response Time | Notes |
|---|---|---|
| Dashboard load (first paint) | < 2 seconds | Critical path — most-used screen |
| WBS tree load (100 nodes) | < 1 second | Needs lazy loading for large trees |
| Task list (1,000 tasks) | < 1.5 seconds | Pagination required |
| Document search | < 2 seconds | Full-text search on PostgreSQL |
| Report generation (standard) | < 5 seconds | Pre-computed views recommended |
| Report generation (complex) | < 30 seconds | Async job with notification on complete |
| File upload (10MB drawing) | < 10 seconds | On good connection — progress indicator |
| Mobile sync (offline session) | < 30 seconds | Depends on data volume — progress required |
| Notification delivery (in-app) | < 3 seconds | Realtime channel via Supabase |
| API rate limit (external calls) | 200 req/min/tenant | Configurable per tier |

### 5.5 Disaster Recovery & Business Continuity

Construction companies operate on legally binding schedules. A platform outage that prevents site reporting, document submission, or payment approval has direct contractual consequences.

| DR Metric | Target | Implementation |
|---|---|---|
| Recovery Time Objective (RTO) | 4 hours maximum | Automated failover to standby region |
| Recovery Point Objective (RPO) | 1 hour maximum | Continuous database replication + hourly backup |
| Uptime SLA | 99.5% minimum | Monitoring + alerting + on-call rotation |
| Planned maintenance window | Sundays 02:00–04:00 | Announced 48 hours in advance |
| Data backup frequency | Hourly incremental + daily full | Stored in separate region |
| Backup restoration test | Monthly | Full restoration test with time recorded |

---

## 6. Revised Complete Module Map

The recommended complete module map for DCOS as an end-to-end construction enterprise platform. **NEW** = added in this review. **Partial** = listed in R0 but needs design work.

| No. | Module | Status | Phase |
|---|---|---|---|
| 01 | Company / Tenant Setup | ✅ Captured | Foundation |
| 02 | User / Role / Permission | ✅ Captured | Foundation |
| 03 | Admin Configuration | ✅ Captured | Foundation |
| 04 | Stakeholder Setup | ✅ Captured | Foundation |
| 05 | Project Setup | ✅ Captured | Foundation |
| 06 | WBS Management | ✅ Captured | Foundation |
| 07 | Tender Management | 🟡 Partial — needs design | Pre-contract |
| 08 | Tender Cost Estimation | 🆕 NEW — add to R1 | Pre-contract |
| 09 | Bid Submission & Award | 🆕 NEW — add to R1 | Pre-contract |
| 10 | Architecture Design | ✅ Captured | Design |
| 11 | Structural Design | ✅ Captured | Design |
| 12 | MEP Design | ✅ Captured | Design |
| 13 | Civil & Geotechnical Design | 🆕 NEW — add to R1 | Design |
| 14 | BIM Coordination | 🟡 Listed — needs design | Design |
| 15 | Value Engineering | 🆕 NEW — add to R1 | Design |
| 16 | Authority Submission Tracking | 🆕 NEW — add to R1 | Design |
| 17 | Supplier Prequalification | 🆕 NEW — add to R1 | Procurement |
| 18 | Procurement (PR/RFQ/PO) | ✅ Captured | Procurement |
| 19 | Subcontractor Management | 🟡 Listed — needs design | Procurement |
| 20 | Inventory / Stock | ✅ Captured | Procurement |
| 21 | Material Test & Traceability | 🆕 NEW — add to R1 | Procurement |
| 22 | Construction Management | ✅ Captured | Execution |
| 23 | Planning & Scheduling | 🟡 Partial — add CPM engine | Execution |
| 24 | Equipment Management | 🟡 Partial — needs design | Execution |
| 25 | Lift Plan & Lifting Operations | 🆕 NEW — add to R1 | Execution |
| 26 | Drawing Markup & Redline | 🆕 NEW — add to R1 | Execution |
| 27 | QA/QC | ✅ Captured | Execution |
| 28 | HSE | ✅ Captured | Execution |
| 29 | BOQ Engine | 🔴 NEW — Critical add | Commercial |
| 30 | Budget & Cost Control | 🟡 Partial — needs depth | Commercial |
| 31 | Earned Value Management | 🆕 NEW — add to R1 | Commercial |
| 32 | Progress Claim / IPC | 🔴 NEW — Critical add | Commercial |
| 33 | Retention Management | 🆕 NEW — add to R1 | Commercial |
| 34 | Variation Order Management | 🟡 Partial — needs workflow | Commercial |
| 35 | Contract Administration | 🆕 NEW — add to R1 | Commercial |
| 36 | Claims & Disputes | 🟡 Listed — needs design | Commercial |
| 37 | Document Control | ✅ Captured | All phases |
| 38 | Commissioning / Handover | ✅ Captured | Handover |
| 39 | DLP Management | ✅ Captured | Post-contract |
| 40 | Facility Management Handover | 🆕 NEW — add to R1 | Post-contract |
| 41 | HR Module | 🟡 Partial — payroll gap | Support |
| 42 | Account / Finance | 🟡 Partial — needs depth | Support |
| 43 | Multi-Currency / FX | 🆕 NEW — add to R1 | Support |
| 44 | Reporting & KPI | ✅ Captured | Support |
| 45 | Lessons Learned | 🟡 Listed — too light | Support |
| 46 | Notification Engine | ✅ Captured | Platform |
| 47 | Approval Workflow Engine | ✅ Captured | Platform |
| 48 | Audit Trail Engine | ✅ Captured | Platform |
| 49 | Mobile Field Application | 🔴 NEW — Critical add | Platform |
| 50 | Integration Layer | 🟡 Listed — needs spec | Platform |

### 6.1 Quantity Surveying / Commercial Control TODOs

The missing and shallow commercial clauses in Sections 3 and 4 should be treated as a dedicated Quantity Surveying / Commercial Control workstream. Modules 29 to 36 are the QS-owned commercial core. Module 08 is the pre-contract QS estimating input. Module 19 has subcontract commercial overlap. Module 42 should consume certified commercial outputs, not own QS measurement logic.

| Module | TODOs |
|---|---|
| 08 Tender Cost Estimation | Define tender estimate workflow from draft estimate to bid submission; create tender BOQ separate from contract BOQ; add unit rate library from historical projects; support labour, material, equipment, subcontract, preliminaries, overhead, profit, and contingency build-up; add subcontract quotation comparison; add priced tender risk register; produce bid summary showing direct cost, indirect cost, margin, and final tender price; add win/loss analysis after tender result. |
| 19 Subcontractor Management - commercial overlap | Add subcontract BOQ or schedule of rates; add sub-IPC workflow mirroring head contract IPC; deduct and release subcontract retention; add back-charge workflow; add subcontract variation instruction and valuation; track committed, claimed, certified, paid, and remaining subcontract value; feed subcontract commitments and actuals into project cost control. |
| 29 BOQ Engine | Define BOQ hierarchy from section to item to WBS mapping and cost category; add item fields for code, description, unit, quantity, rate, amount, trade, WBS node, and remarks; support tender BOQ, contract BOQ, revised BOQ, and VO-adjusted BOQ; add BOQ import/export; link BOQ items to PR/RFQ/PO, IPC measurement, and reporting; keep revision history for quantity and rate changes; report by WBS, trade, section, and project total. |
| 30 Budget & Cost Control | Create approved budget baseline from contract BOQ; track budget, committed cost, actual cost, forecast cost, and variance; derive commitments from approved PO/subcontracts; derive actuals from invoices, timesheets, delivery records, and manual cost entries; roll costs up through WBS parent nodes; apply green/amber/red variance thresholds; provide dashboards by project, WBS, BOQ section, and cost category; add cost-to-complete and forecast-at-completion. |
| 31 Earned Value Management | Define EVM inputs: BAC, PV, EV, AC, physical progress, and baseline dates; calculate CPI, SPI, CV, SV, EAC, VAC, and TCPI; derive EV from approved BOQ budget multiplied by measured progress; derive AC from actual posted costs; derive PV from baseline schedule and planned cost curve; add project and WBS EVM dashboards; flag CPI/SPI threshold breaches; store monthly EVM snapshots; export EVM reports. |
| 32 Progress Claim / IPC | Define IPC workflow: draft, internal review, submitted, client reviewed, certified, paid; generate IPC from BOQ measured quantities; track previous, current, and cumulative quantities and percent complete; include approved VO amounts; deduct retention, advance recovery, and back-charges; record client adjustments and reasons; track certified amount versus claimed amount; send certified IPC to Account / Finance AR. |
| 33 Retention Management | Configure retention percentage per contract and subcontract; deduct retention automatically from IPC and sub-IPC; track retention receivable from client and retention payable to subcontractors; add practical completion and DLP completion release rules; support retention bond alternative; provide aged retention report with expected release dates; route retention release through approval workflow. |
| 34 Variation Order Management | Define VO workflow from draft to submitted, priced, approved or rejected, and implemented; price VO items against existing BOQ items or new BOQ items; track schedule impact days; update revised contract sum after approval; push approved VO value into IPC; exclude pending or rejected VO value from certified amount; maintain VO register by status, value, and approval date; audit rate and quantity changes. |
| 35 Contract Administration | Create head contract and subcontract registers; track employer instructions, site instructions, and formal notices; add entitlement register for time and cost events; add notice deadline and time-bar alerts; link contract events to VO, EOT, claim, RFI, NCR, and correspondence; store key contract clauses; add formal correspondence log; provide commercial risk dashboard. |
| 36 Claims & Disputes | Define claim workflow from event identification to notice, evidence collection, claim preparation, submission, assessment, and resolution or dispute; support EOT, prolongation cost, disruption, acceleration, and variation dispute claims; link claims to delay events, WBS tasks, daily reports, photos, RFIs, instructions, and correspondence; add claim cost build-up; add evidence checklist; track submitted, assessed, agreed, and disputed amounts; support negotiation, adjudication, arbitration, and settlement statuses. |
| 42 Account / Finance interface | Keep accounting separate from QS measurement; receive certified IPC into AR; receive approved supplier and subcontract invoices into AP; return paid/received status to QS dashboards; map cost transactions to chart of accounts; leave BOQ, IPC, VO, retention, and EVM ownership with QS / Commercial Control. |

Minimum shared data requirements:

- Every commercial record must link to `project_id`.
- BOQ, cost, measurement, EVM, IPC, VO, and claim records should link to `wbs_node_id` where applicable.
- QS workflows must use the shared approval workflow, notification engine, and append-only audit trail.
- Reports must support project-level, WBS-level, BOQ-level, and portfolio-level views.

Acceptance scenarios:

- Create a contract BOQ and confirm total budget rolls up by WBS and project.
- Post actual costs and confirm budget variance updates.
- Measure progress and generate an IPC from BOQ quantities.
- Apply retention and confirm certified amount is reduced correctly.
- Approve a VO and confirm revised contract sum and IPC eligibility update.
- Capture an EVM snapshot and verify PV, EV, AC, CPI, SPI, EAC, and VAC.
- Create a subcontract IPC and confirm subcontract retention and payable tracking.
- Create a claim event and confirm evidence, notices, and valuation remain traceable.
- Reconcile QS reports with Account / Finance totals.

---

## 7. Revised Build Priority & Phasing

### Phase 1 — Core Platform (Unchanged — Correct)

The original Phase 1 is correct. Build the backbone before adding discipline modules.

| Module | Why First |
|---|---|
| Authentication & RBAC | Nothing else can run without identity and access control |
| Company / Tenant / Admin | Multi-tenant foundation — all data is tenant-scoped from day one |
| Project Setup | All modules require a project context |
| WBS Management | The spine of the entire system — must exist before tasks or documents |
| Task Management | Core execution mechanism shared by all disciplines |
| Document Control | Drawing and document management is needed on day one of a project |
| Approval Workflow Engine | Required by documents, tasks, PRs, and finance from the start |
| Basic Dashboard & KPIs | Management visibility must be present from first go-live |
| Daily Report | Most frequent field operation — site teams need this immediately |
| RFI Management | High volume, time-sensitive — needed from construction start |

### Phase 2 — Commercial Foundation (NEW — Elevated Priority)

> The financial layer must be added in Phase 2, not Phase 3. Procurement and construction execution cannot be properly controlled without a cost baseline. The BOQ and IPC modules are elevated because they are commercial dependencies of every other module.

| Module | Why Phase 2 |
|---|---|
| BOQ Engine | Cost backbone — procurement and IPC depend on this |
| Budget & Cost Control | Cannot control cost without a budget baseline linked to BOQ |
| Procurement (PR/RFQ/PO) | Procurement needs BOQ to validate budget availability |
| Inventory / Stock | Stock management must connect to GRN and procurement |
| Progress Claim / IPC | Monthly billing — revenue depends on this working correctly |
| Retention Management | Every IPC needs retention calculated — cannot separate |
| Variation Order Management | Variations affect budget and IPC — must be concurrent |
| Subcontractor Management | Sub-IPCs mirror head contract IPC — same timing |
| QA/QC | Inspection must gate payment — ITP linked to IPC milestone |
| HSE | Safety compliance is a contractual obligation from day one |

### Phase 3 — Site Execution & HR (Previously Phase 2)

| Module | Why Phase 3 |
|---|---|
| Construction Module (full) | Full site execution with all logs and progress reporting |
| Planning & Scheduling + CPM | Baseline schedule with true critical path engine |
| Equipment Management | Equipment cost allocation to WBS for cost accuracy |
| HR — full depth | Labour costing feeds into project cost and productivity reporting |
| Timesheet | Labour cost allocation requires working HR module |
| Drawing Markup & Redline | Field teams need markup tools once construction is active |
| Mobile Field Application | Site teams cannot carry laptops — mobile is not optional after Phase 2 |
| Material Test & Traceability | QA compliance requires certificate tracking from Phase 3 onwards |
| Supplier Prequalification | Approved supplier list needed before major procurement begins |

### Phase 4 — Advanced Commercial & Handover

| Module | Why Phase 4 |
|---|---|
| Earned Value Management | EVM requires stable cost and schedule data — needs Phase 2+3 data |
| Contract Administration | Notice tracking and entitlement register — legal exposure management |
| Claims & Disputes | Build on contract admin foundation |
| Multi-Currency / FX | Required for international projects — add when needed |
| Authority Submission | Regulatory tracking — project-specific need |
| Commissioning / Handover | End of project lifecycle — add when first projects approach completion |
| DLP Management | Post-handover — add after first projects complete |
| Tender Cost Estimation | Estimating module — add when pipeline of new tenders requires it |
| Lessons Learned | Knowledge management — requires project completion history |
| Facility Management Handover | FM integration — add when client systems are known |

### Phase 5 — Intelligence Layer

| Module | Why Phase 5 |
|---|---|
| BIM Coordination (full) | Deep BIM integration requires stable document and drawing platform |
| AI analytics | Meaningful AI requires 12–24 months of clean project data |
| Forecasting engine | Forecast accuracy depends on historical data depth |
| IoT / Sensor integration | On-site sensors — project-specific, add when sensors are deployed |
| ERP integration | Accounting/ERP sync — implement when company ERP is identified |
| Government API integration | e-Permit and tax reporting APIs — jurisdiction-specific |

---

## 8. Database Architecture Additions

The R0 document provides a solid initial ERD grouping (Groups A through H). The following additional table groups are required to support the missing modules.

| ERD Group | New Tables Required | Supports Module |
|---|---|---|
| Group I: BOQ & Cost | `boq_items`, `boq_sections`, `boq_revisions`, `budget_lines`, `cost_commitments`, `cost_actuals`, `cost_forecasts` | BOQ Engine, Budget & Cost Control, EVM |
| Group J: Commercial | `progress_claims`, `ipc_items`, `ipc_certifications`, `variation_orders`, `retention_records`, `retention_releases`, `advance_recoveries` | IPC, Retention, Variation Orders |
| Group K: Subcontract | `subcontracts`, `subcontract_items`, `sub_ipcs`, `sub_ipc_items`, `back_charges`, `performance_notices` | Subcontractor Management |
| Group L: Contract Admin | `contracts`, `employer_instructions`, `contractual_notices`, `entitlement_register`, `dispute_records`, `time_bar_alerts` | Contract Administration, Claims |
| Group M: Prequalification | `supplier_pq_records`, `pq_documents`, `pq_approvals`, `supplier_performance_scores`, `supplier_approved_trades` | Supplier Prequalification |
| Group N: Equipment | `equipment_assets`, `equipment_utilisation`, `fuel_logs`, `maintenance_schedules`, `maintenance_records`, `equipment_hire_records` | Equipment Management |
| Group O: Material QA | `material_test_certs`, `material_batches`, `batch_wbs_assignments`, `material_approval_requests`, `non_conforming_material` | Material Test & Traceability |
| Group P: Drawing Markup | `drawing_markups`, `markup_annotations`, `markup_assignments`, `markup_actions`, `redline_layers` | Drawing Markup & Redline |
| Group Q: Lift Planning | `lift_plans`, `lift_method_statements`, `lift_checklists`, `lift_records`, `appointed_persons` | Lift Plan Module |
| Group R: Authority Submissions | `authority_submissions`, `submission_packages`, `approval_conditions`, `condition_actions`, `permit_register` | Authority Submission Tracking |
| Group S: Tendering | `tender_boq`, `unit_rate_library`, `tender_sub_quotes`, `tender_risk_items`, `bid_summaries`, `win_loss_records` | Tender Cost Estimation |
| Group T: FX & Currency | `currencies`, `exchange_rates`, `fx_transactions`, `currency_exposure_ledger` | Multi-Currency / FX |
| Group U: Mobile Sync | `mobile_sync_sessions`, `sync_queue`, `sync_conflicts`, `offline_cache_manifest`, `device_registrations` | Mobile Field Application |
| Group V: FM Handover | `asset_register`, `asset_maintenance_plans`, `warranty_register`, `om_manuals`, `fm_handover_packages` | Facility Management Handover |

---

## 9. Architecture Risk Register

Each risk represents a scenario where the current R0 architecture, if built as-is without addressing the gap, would cause a real operational or commercial failure.

| Risk | Trigger | Impact | Likelihood | Rating |
|---|---|---|---|---|
| No BOQ engine | First project goes to billing | Cannot produce IPC — no revenue flow | Certain | 🔴 Critical |
| No IPC workflow | Month-end billing cycle | Manual Excel billing — audit and error risk | Certain | 🔴 Critical |
| No retention module | First IPC submitted | Incorrect payment — legal exposure | Certain | 🔴 Critical |
| No mobile app | Site teams adopt system | Field data captured on paper — no value | Very Likely | 🔴 Critical |
| No multi-currency | First USD-KHR project | All FX transactions unrecorded — accounts wrong | Very Likely | 🔴 Critical |
| No subcontract module | First subcontract award | Sub-IPCs managed in spreadsheet — leakage | Certain | 🔴 Critical |
| No material traceability | First QA audit or client inspection | Cannot prove materials meet spec — rejection | Likely | 🟠 High |
| No contract admin module | First employer instruction received | Missed time bar — loss of entitlement | Likely | 🟠 High |
| No drawing markup | Site engineers start using system | Revert to external tools — no audit trail | Very Likely | 🟠 High |
| No tenant isolation design | Multi-company deployment | Cross-tenant data leak — catastrophic breach | Possible | 🔴 Critical |
| No DR plan | Server failure during billing period | Platform unavailable — contractual breach risk | Possible | 🟠 High |
| No CPM engine in planning | Programme update presented to client | Cannot identify critical path — schedule risk | Likely | 🟡 Medium |

---

## 10. Recommendations & Next Steps

### 10.1 Immediate Actions — Before R1 Development Starts

| Action | Owner | Timeline |
|---|---|---|
| Design BOQ engine as standalone module with full data model and workflow | System Architect | 2 weeks |
| Design IPC / progress claim module with full workflow and data model | System Architect + QS | 2 weeks |
| Design retention management module linked to IPC and subcontract | System Architect + QS | 1 week |
| Design subcontractor management module — full contract-to-payment flow | System Architect | 2 weeks |
| Design mobile field application — screen flows and offline sync protocol | System Architect + UX | 3 weeks |
| Define multi-tenant row-level security model in PostgreSQL | Lead Developer | 1 week |
| Design drawing markup engine — viewer + annotation layer + audit | System Architect | 2 weeks |
| Specify integration layer — API schema, webhook events, authentication | System Architect | 1 week |

### 10.2 R1 Document Structure — Required Sections Per Module

Each of the 50 modules in the revised module map must include at minimum:

| Section | Content Required |
|---|---|
| Purpose | One paragraph explaining what this module does and why it exists |
| Business context | What construction process or workflow does this support — real-world context |
| Key stakeholders | Who uses this module, who approves, who views |
| Main features | Bulleted list of features — minimum 8–10 for a major module |
| Workflow | Step-by-step status flow — start to close, including rejection paths |
| Data model | Key table fields with type and description |
| Integration points | What other modules does this connect to and how |
| Notification rules | What events trigger notifications and to whom |
| Reports | What reports and KPIs does this module contribute to |
| Status list | Complete list of statuses for all record types in this module |

### 10.3 Architecture Principles to Preserve

The following decisions from R0 are correct and must not be changed in R1 or later versions.

| Principle | Reason to Preserve |
|---|---|
| WBS as the single spine of all modules | Connecting all data to WBS is the differentiating architecture decision that makes DCOS an operating system rather than a collection of tools. |
| Modular monolith, not microservices initially | Microservices add operational complexity. Start monolith, extract services only when a specific module becomes the bottleneck. |
| Supabase for MVP, NestJS for scale | Pragmatic progression — avoid over-engineering for early-stage volume. Keep this phasing. |
| Approval workflow as a shared engine | All modules using one approval engine ensures consistent auditability and avoids duplicating logic in 20 different places. |
| Notification as a matrix, not hardcoded | Configurable notification rules mean the system adapts to different projects and clients without code changes. |
| Audit trail as append-only | Legal and contractual traceability is a hard requirement in construction. Never allow audit log deletion. |
| External stakeholder via transmittal gate | Documents must be formally issued to external parties — this prevents accidental release of internal documents. |

### 10.4 Summary Score

| Assessment Area | Score | Comment |
|---|---|---|
| Core platform engines | 9/10 ✅ | Audit trail, notification, and approval engines are genuinely excellent. |
| WBS architecture | 9/10 ✅ | Correct philosophy, well-designed. Minor gap in schedule CPM integration. |
| Discipline design modules | 8/10 ✅ | ARC/STR/MEP are appropriate. Civil/geotech gap needs addressing. |
| Construction execution | 7/10 🟡 | Good foundation. Equipment, lift planning, and mobile are missing. |
| Financial / commercial layer | 3/10 🔴 | Most critical gap. BOQ, IPC, retention, EVM all absent. |
| Procurement / supply chain | 6/10 🟡 | Core PR/PO good. Prequalification and traceability missing. |
| Pre-contract / tender | 4/10 🟠 | Project setup exists. Cost estimation and bid management absent. |
| Platform infrastructure | 5/10 🟡 | Good intentions. Mobile, FX, integration spec, DR all missing. |
| **Overall architecture score** | **6.4/10** | Strong foundation, significant gaps. R1 must address commercial layer. |

---

> **Final Verdict**
>
> DCOS R0 is a well-structured architectural blueprint with a strong core philosophy. The WBS-driven unified platform approach is correct and should be preserved. The document is not ready for full development as-is — the financial and commercial layer must be designed first. Address the 8 immediate actions in Section 10.1 to produce R1. R1 should be the complete 50-module specification before Phase 2 development begins.

---

*Digital Construction Operating System — Internal Controlled Document*
*DCOS-ARCH-GAP-001 | Version R1 | May 2026*
