# DCOS — Quantity Surveying Module
## Standard Operating Procedure (SOP)
**Document Ref:** SOP-QS-001  
**Revision:** R1  
**Date:** 2026-06-06  
**Owner:** Commercial Manager / QS Manager  

---

## 1. PURPOSE & SCOPE

This SOP governs the complete commercial lifecycle of a construction project within the DCOS platform — from pre-contract cost estimation through to financial close-out. It covers:

- Cost Library management
- Bill of Quantities (BOQ) creation and baseline control
- Budget monitoring and variance analysis
- Cost transaction recording
- Variation Order (VO / Change Order) management
- Interim Payment Certificates (IPC / Progress Claims)
- Retention deduction and release
- Earned Value Management (EVM) reporting
- Portfolio-level commercial dashboard
- Tendering and bid evaluation *(in development)*
- Contract Administration *(in development)*
- Subcontractor management *(in development)*

**Applies to:** QS Engineers, QS Managers, Project Managers, Commercial Managers, Finance Officers, and Directors on any project managed in DCOS.

---

## 2. MODULE NAVIGATION

| Feature | Path | Access Level |
|---------|------|--------------|
| BOQ & Budget Hub | `/dashboard/qs` | QS Engineer+ |
| Cost Library | `/dashboard/qs/cost-library` | QS Manager+ |
| Variation Orders | `/dashboard/qs/variations` | QS Engineer+ |
| Progress Claims (IPC) | `/dashboard/qs/claims` | QS Engineer+ |
| Retention Register | `/dashboard/qs/retention` | QS Manager+ |
| Tendering *(TBD)* | `/dashboard/qs/tendering` | QS Manager+ |

The sidebar groups all QS features under **"Quantity Surveying"** with sub-sections:
- QS & Cost (BOQ, Cost Library, Variation Orders, Claims, Retention)
- Tendering (Cost Estimation, Tender Management, Bid Evaluation)
- Contract Admin (Notices, Employer Instructions, Correspondence, Entitlements)
- Subcontractors (Sub-IPCs, Back Charges, Performance Notices)

---

## 3. DATABASE TABLES REFERENCE

| Table | Purpose |
|-------|---------|
| `qs_cost_divisions` | Cost library — top-level divisions |
| `qs_cost_sections` | Cost library — mid-level sections |
| `qs_cost_items` | Cost library — rate items with cost breakdowns |
| `qs_boq_sections` | Project BOQ groupings (baseline status) |
| `qs_boq_items` | BOQ line items linked to WBS nodes and cost codes |
| `qs_budget_revisions` | Audit trail of post-lock BOQ changes |
| `qs_cost_transactions` | Actual cost entries (invoices, POs, timesheets) |
| `qs_variation_orders` | Change order register |
| `qs_vo_items` | Line items within each VO |
| `qs_vo_approvals` | Multi-step VO approval trail |
| `qs_progress_claims` | Monthly IPC claims (G702-format) |
| `qs_claim_items` | Line items per IPC |
| `qs_retention_ledger` | Retention deductions and release transactions |

---

## 4. QS PROCESS OVERVIEW

```
PRE-CONTRACT             POST-CONTRACT               CLOSE-OUT
─────────────            ──────────────────────      ──────────────
Cost Library     ──→     BOQ Baseline         ──→    Final Account
Tender BOQ       ──→     Budget Monitoring    ──→    Retention Release
Bid Evaluation   ──→     Cost Transactions    ──→    Final Certificate
                         Variation Orders
                         Progress Claims (IPC)
                         EVM Reporting
```

---

## 5. PHASE 1 — PRE-CONTRACT

### SOP-QS-01: Cost Library Management

**Who:** QS Manager, Senior QS Engineer  
**When:** Project setup or periodic library maintenance  
**System Path:** `/dashboard/qs/cost-library`

#### Steps

1. Navigate to **QS → Cost Library**
2. The library is organised in **3 levels**: Divisions → Sections → Items
3. Standard MasterFormat divisions (01–33) are pre-seeded in the system
4. **To add a Division:** click "Add Division" → enter Code, Name, Sequence
5. **To add a Section:** expand a division → click "Add Section"
6. **To add a Cost Item:** expand a section → click "Add Item" → fill in:
   - Code, Description, Unit, Base Rate
   - Cost breakdown: Labor %, Material %, Equipment % (must sum ≤ 100%)
7. Items with `is_active = false` are hidden from BOQ library lookups
8. Cost items are referenced in the BOQ Builder via the "Search library" autocomplete

#### Validation Rules

| Rule | Detail |
|------|--------|
| Item code | Must be unique within its section |
| Base rate | Must be > 0 |
| Component percentages | Labor% + Material% + Equipment% ≤ 100% |
| Sequence | Determines display order; auto-assigned if left blank |

---

### SOP-QS-02: Tender BOQ Creation *(in development)*

**Who:** Estimator, QS Engineer  
**When:** Responding to a tender invitation  
**System Path:** `/dashboard/qs/tendering/cost-estimation` *(TBD)*

#### Steps

1. Navigate to **QS → Tendering → Cost Estimation**
2. Create or open the linked tender from **Tender Management**
3. In the **Tender BOQ** tab, add sections and items from the rate library
4. For each item, build up the unit rate:
   - Labour + Material + Plant components
   - Apply productivity factor and wastage %
5. Add subcontractor quotes under the **Sub-Quotes** tab (compare quotes per trade)
6. In the **Risk Register**, add risk items with likelihood, impact, and priced amount
7. Compile the **Bid Summary**:
   - Direct Cost + Preliminaries + Overhead % + Profit % + Contingency + Risk Allowance = Total Bid Price
8. Set status to `final` and submit

#### Bid Summary Calculation

| Component | Description |
|-----------|-------------|
| Direct Cost | Sum of all tender BOQ items |
| Preliminaries | Site setup, temporary works, insurances |
| Subcontract Cost | Sum of preferred sub-quotes |
| Overhead % | Company overhead applied to direct cost |
| Profit % | Commercial margin |
| Contingency | Risk buffer for known unknowns |
| Risk Allowance | Priced risk items from risk register |
| **Total Bid Price** | Auto-calculated generated column |

---

### SOP-QS-03: Tender Management *(in development)*

**Who:** Commercial Manager, QS Manager  
**When:** Running an invitation-to-tender process  
**System Path:** `/dashboard/qs/tendering` *(TBD)*

#### Tender Types

| Type | Description |
|------|-------------|
| Open | Public advertisement, any bidder |
| Selective | Invited list only |
| Negotiated | Direct negotiation with single party |
| Restricted | Limited, pre-qualified suppliers |

#### Steps

1. Navigate to **QS → Tendering → Tender Management**
2. Create new tender: enter tender number, title, type, submission deadline
3. For selective tenders: add invited suppliers → track response (accepted/declined/no response)
4. Issue **Addenda** as required (addendum number, title, attachment URL)
5. Manage **Queries log**: record questions and published answers; mark confidential where required
6. Record **Submissions**: bidder name, submitted date, bid amount, responsiveness status
7. Evaluate bids under **Bid Evaluation**: shortlist, score, and recommend award
8. Award tender: set winning submission → status → `awarded`

---

### SOP-QS-04: Bid Evaluation *(in development)*

**Who:** Commercial Manager, QS Manager, Director  
**When:** After tender submission deadline  
**System Path:** `/dashboard/qs/tendering/bid-evaluation` *(TBD)*

#### Steps

1. Open the tender and navigate to the **Submissions** tab
2. Mark each submission as `responsive` or `non_responsive`
3. For responsive submissions, enter evaluation scores per criteria
4. Set preferred submissions to `shortlisted`
5. Prepare recommendation report
6. Award to selected bidder → tender status → `awarded`

---

## 6. PHASE 2 — POST-CONTRACT: BUDGET ESTABLISHMENT

### SOP-QS-05: BOQ Creation (Bill of Quantities)

**Who:** QS Manager, QS Engineer  
**When:** After contract award, before work commences  
**System Path:** `/dashboard/qs` → Bill of Quantities tab

#### Steps

1. Navigate to **QS → BOQ & Budget** → **Bill of Quantities** tab
2. Select the project from the dropdown
3. Click **"Add Section"** to create BOQ divisions (e.g., "Substructure", "Superstructure", "Finishes")
4. Within each section, click **"Add Item"**:
   - Search cost library by code or description (auto-populates unit and rate)
   - Or enter free-form description
   - Set **Unit**, **Quantity**, **Unit Rate** → Total Amount auto-calculates
   - Optionally link to a **WBS Node** (`wbs_node_id`) for WBS-level cost tracking
   - Mark provisional items with the "Provisional" toggle
   - Set **Contingency %** for risk allowance items
5. Review complete BOQ totals and confirm accuracy
6. When BOQ is ready for contract sign-off: click **"Approve BOQ"** → `draft → approved`
7. Once contract is executed: click **"Lock BOQ"** → `approved → locked`
   - Locked BOQ is the contract baseline — no direct editing permitted
   - All changes post-lock must go through a Variation Order (see SOP-QS-08)
8. Post-lock revisions create an entry in `qs_budget_revisions` and set status to `revised`

#### Baseline Status Rules

| Status | Meaning | Who Can Transition |
|--------|---------|-------------------|
| `draft` | Being built, editable | QS Engineer |
| `approved` | Reviewed and agreed, awaiting execution | QS Manager |
| `locked` | Contract baseline frozen | QS Manager |
| `revised` | Post-lock amendment approved via VO | QS Manager + Director |

#### BOQ Item Fields

| Field | Description |
|-------|-------------|
| Description | Item narrative |
| Unit | Measurement unit (m², m³, m, nr, t, etc.) |
| Quantity | Contract quantity |
| Unit Rate | Rate from cost library or manually entered |
| Total Amount | Auto-calculated: Quantity × Unit Rate |
| WBS Node | Optional link for WBS-level cost roll-up |
| Cost Item | Optional link to rate library for cost breakdown |
| Contingency % | Risk allowance on this item |
| Is Provisional | Mark for items with uncertain scope |

---

### SOP-QS-06: Budget & Variance Monitoring

**Who:** QS Manager, Project Manager, Commercial Manager  
**When:** Weekly or monthly review cycle  
**System Path:** `/dashboard/qs` → Budget & Variance tab

#### Steps

1. Navigate to **QS → BOQ & Budget** → **Budget & Variance** tab
2. Select the project from the dropdown
3. Review the **4 KPI cards** at the top:
   - **Total Budget:** Locked BOQ total
   - **Committed:** Approved POs/subcontracts not yet invoiced
   - **Actual Cost:** Paid or approved invoices
   - **Forecast / Spent:** Progress bar showing Actual ÷ Budget %
4. Expand any section to view item-level breakdown:

| Column | Definition |
|--------|-----------|
| Budget | Locked BOQ item total |
| Committed | POs raised against this item |
| Actual | Invoiced/paid against this item |
| Forecast | Committed + Actual + estimated to complete |
| Variance | Budget − Forecast |
| Var % | Variance ÷ Budget × 100 |

5. **Variance pill colour coding:**
   - Green: Variance > 0 and < 5% of budget (under budget)
   - Amber: Variance between 0% and negative (minor over-run)
   - Red: Variance negative (over budget)
6. Investigate red items and initiate corrective action

---

## 7. PHASE 3 — POST-CONTRACT: COST CONTROL

### SOP-QS-07: Cost Transaction Recording

**Who:** QS Engineer, Site Quantity Surveyor, Finance Officer  
**When:** On receipt of invoice, PO approval, timesheet, or delivery docket  
**System Path:** `/dashboard/qs` → Cost Transactions tab

#### Steps

1. Navigate to **QS → BOQ & Budget** → **Cost Transactions** tab
2. Click **"Record Cost"** to open the entry form
3. Fill in the required fields:
   - **Transaction Type:** Invoice / Purchase Order / Timesheet / Delivery / Other
   - **Cost Category:** Labor / Material / Equipment / Subcontract / Other
   - **Description** of cost
   - **Vendor / Supplier name**
   - **Cost Date** (date expense incurred)
   - **Invoice Date** (if applicable)
   - **Quantity × Unit Cost** = Total Cost (auto-calculated)
   - **Reference Number** (invoice or PO number for audit trail)
   - **BOQ Item** (optional — allocates cost to BOQ budget line)
   - **WBS Node** (optional — tracks cost at WBS hierarchy level)
   - **Payment Status:** Pending / Approved / Paid
4. Save the transaction
5. Use **Category Filter** chips to filter view by cost type
6. Delete transactions only before payment approval

#### Transaction Type Definitions

| Type | Use Case |
|------|----------|
| Invoice | Supplier/subcontractor invoice received and to be paid |
| Purchase Order | Committed cost — PO raised but not yet invoiced |
| Timesheet | Direct labour costs logged by supervisors |
| Delivery | Site delivery docket matched to a PO |
| Other | Miscellaneous site costs not covered above |

#### Payment Status Workflow

```
pending → approved → paid
```

- **Pending:** Transaction recorded, awaiting approval
- **Approved:** Verified by QS Manager, ready for payment
- **Paid:** Payment confirmed by Finance

---

### SOP-QS-08: Variation Order (VO) Management

**Who:** QS Engineer (raise), QS Manager (review), PM / QS Manager / Director (approve per threshold)  
**When:** Whenever scope, price, or programme changes are identified  
**System Path:** `/dashboard/qs/variations`

#### VO Status Flow

```
draft → submitted → [approved | rejected] → implemented
```

#### Steps

1. Navigate to **QS → Variation Orders**
2. Click **"New Variation Order"**
3. Enter:
   - **Title:** Brief description of the change
   - **VO Type:** Client Request / Design Change / Site Condition / Regulatory / Other
   - **Schedule Impact:** Number of calendar days impact (positive = delay)
   - **Description:** Full narrative of scope and justification
4. Save as `draft` — VO number is auto-generated in format `VO-YYYY-XXXX`
5. Add **line items** to the VO (description, unit, quantity, rate, total)
6. When ready for approval, click **"Submit"** → status: `draft → submitted`
7. **Multi-Step Approval Routing** (based on VO total amount):

| VO Amount | Approval Chain |
|-----------|----------------|
| < $5,000 | Project Manager (1 step) |
| $5,000 – $50,000 | PM → QS Manager (2 steps) |
| ≥ $50,000 | PM → QS Manager → Commercial Director (3 steps) |

8. Each approver receives a notification, reviews the VO, and clicks:
   - **"Approve"** → Advances to next step (or fully approved if final step)
   - **"Reject"** → Must enter rejection reason → Status: `rejected`
9. Rejection resets to `draft` for revision and resubmission
10. Once all approval steps are complete → status: `approved`
11. After the change is physically implemented on site → QS marks: `implemented`

#### VO Impact on Contract Sum

- Approved VOs **do not** directly modify locked BOQ line items
- Approved VO amounts accumulate as `net_vo_amount` in IPC claims
- The running Contract Sum = Original Contract Sum + Net Approved VO Amount
- Rejected VOs have no financial impact

---

### SOP-QS-09: Earned Value Management (EVM) Monitoring

**Who:** Commercial Manager, Project Manager, Director  
**When:** Monthly project review meetings  
**System Path:** `/dashboard/qs` → EVM Dashboard tab

#### Steps

1. Navigate to **QS → BOQ & Budget** → **EVM Dashboard** tab
2. Select the project from the dropdown
3. Click **"Refresh"** to compute latest metrics from current task progress and cost data
4. Review the **Health Status banner**:
   - Green (On Track): CPI ≥ 0.95 and SPI ≥ 0.95
   - Amber (Watch): Either CPI or SPI < 0.95
   - Red (At Risk): Both CPI and SPI < 0.95
5. Review the **12 EVM KPI metrics**:

| Metric | Full Name | Formula | Target |
|--------|-----------|---------|--------|
| BAC | Budget at Completion | Total locked BOQ | Reference |
| PV | Planned Value | Schedule-based budget consumed | Reference |
| EV | Earned Value | % Complete × BAC | EV ≥ PV |
| AC | Actual Cost | Sum of cost transactions | AC ≤ EV |
| CPI | Cost Performance Index | EV ÷ AC | ≥ 1.00 |
| SPI | Schedule Performance Index | EV ÷ PV | ≥ 1.00 |
| CV | Cost Variance | EV − AC | Positive |
| SV | Schedule Variance | EV − PV | Positive |
| EAC | Estimate at Completion | BAC ÷ CPI | ≤ BAC |
| VAC | Variance at Completion | BAC − EAC | Positive |
| TCPI | To-Complete Performance Index | (BAC − EV) ÷ (BAC − AC) | ≤ 1.00 |
| EAC% | EAC as % of BAC | EAC ÷ BAC × 100 | ≤ 100% |

6. Note the **delayed/blocked task count** shown below the KPIs
7. Use the **Portfolio tab** for cross-project EVM comparison

#### Interpretation Guide

| CPI / SPI Value | Meaning | Action Required |
|-----------------|---------|-----------------|
| ≥ 1.10 | Significantly ahead/under | Verify data accuracy |
| 1.00 – 1.09 | On track | Monitor |
| 0.95 – 0.99 | Slight concern | Review with PM |
| 0.85 – 0.94 | At risk | Corrective action plan required |
| < 0.85 | Critical | Escalate to Director |

---

### SOP-QS-10: Cost S-Curve Monitoring

**Who:** QS Manager, Commercial Manager  
**When:** Monthly or after major milestones  
**System Path:** `/dashboard/qs` → Cost S-Curve tab

#### Steps

1. Navigate to **QS → BOQ & Budget** → **Cost S-Curve** tab
2. Select the project from the dropdown
3. Click **"Capture Today"** to record a progress snapshot:
   - System records current Planned Cost and Actual Cost at today's date
4. The SVG chart renders cumulative cost curves over time:
   - Dashed line = Planned cost curve
   - Solid line = Actual cost curve
5. KPI cards show latest snapshot data: Planned Cost, Actual Cost, Variance, Progress %
6. **Cost Variance** = Planned − Actual (positive = under-spend; negative = over-spend)
7. Build snapshots over the project life to establish trend

> **Note:** A true planned S-curve requires a time-phased budget distribution based on the schedule baseline. Currently the "planned" value is manually captured at each snapshot. A future enhancement will derive planned spend from task schedule dates × BOQ item values automatically.

---

## 8. PHASE 4 — PAYMENT CERTIFICATION

### SOP-QS-11: Interim Payment Certificate (IPC / Progress Claim)

**Who:** Contractor QS (prepare), Client QS / Superintendent (certify)  
**When:** Monthly, per contract payment interval  
**System Path:** `/dashboard/qs/claims`

#### IPC Status Flow

```
draft → submitted → client_reviewed → certified → paid
```

#### Steps — Contractor Side (Prepare Claim)

1. Navigate to **QS → Progress Claims**
2. Click **"New Claim"**
3. Fill in:
   - **Claim Period:** Start and end date
   - **Original Contract Sum:** Auto-populated from locked BOQ total
   - **Retention %:** Per contract terms (typically 5%)
4. Click **"Initialize Items"** — system auto-populates claim items from locked BOQ:
   - **Scheduled Value:** From locked BOQ item total
   - **Previous Completed:** Sum from all prior `certified` or `paid` claims
5. For each BOQ item, enter:
   - **This Period:** Value claimed in this period (must not exceed remaining scheduled value)
   - **Materials Stored:** On-site materials procured but not yet installed
6. Review the **G702 Summary** at the bottom:

| G702 Field | Source |
|------------|--------|
| Original Contract Sum | Locked BOQ total |
| Net VO Amount | Sum of all `approved` VOs |
| Contract Sum to Date | Original + Net VO |
| Total Completed & Stored | Sum of all claim item amounts |
| Less Retention | Total × Retention % |
| Less Previous Certificates | Sum of all prior certified/paid claims |
| **Current Payment Due** | Total − Retention − Previous Certs |

7. Click **"Submit"** → status: `draft → submitted`

#### Steps — Client Side (Review and Certify)

8. Client QS receives notification (future: email), opens claim in system
9. Reviews each line item; may enter **Client Adjustment** amounts with reasons
10. Click **"Mark Reviewed"** → status: `submitted → client_reviewed`
11. Superintendent reviews summary and adjusted totals
12. Click **"Certify"** → System performs automatically:
    - Records certified amount, certifier name, and timestamp
    - Creates a retention deduction entry in `qs_retention_ledger`
    - Status: `client_reviewed → certified`
13. When payment is received and banked: Finance clicks **"Mark Paid"** → status: `certified → paid`

#### Percentage Complete Calculation

```
% Complete (item) = Total to Date ÷ Scheduled Value × 100
Total to Date = Previous Completed + This Period + Materials Stored
```

---

### SOP-QS-12: Retention Register Management

**Who:** QS Manager, Finance Officer  
**When:** Automatic on IPC certification; manual at Practical Completion and DLP  
**System Path:** `/dashboard/qs/retention`

#### Retention Deductions (Automatic)

- When an IPC is certified in the system, a retention deduction entry is **automatically created**
- The amount deducted = `retention_amount` from the certified IPC
- Entry type = `deduction`, approval status = `approved` (auto-approved on certification)

#### Viewing the Register

1. Navigate to **QS → Retention**
2. Select the project
3. Review **3 KPI cards**:
   - **Total Deducted** (all deduction transactions)
   - **Total Released** (all approved release transactions)
   - **Outstanding Balance** (Deducted − Released)
4. The ledger table shows every transaction: date, type, amount, trigger, status

#### Release Requests

5. When a release trigger is reached, click **"Request Release"**
6. Fill in:
   - **Release Trigger:** Practical Completion / DLP Completion / Other
   - **Amount to Release** (typically 50% of outstanding at Practical Completion)
   - **Expected Release Date**
   - **Notes** (reference certificate number or contract clause)
7. Submit → approval status: `pending`
8. QS Manager or Director reviews and clicks **"Approve"** or rejects with reason
9. On approval → status: `approved`, outstanding balance updates

#### Standard Retention Split

| Event | Release % | Typical Timing |
|-------|-----------|----------------|
| Practical Completion | 50% of total deducted | On issuance of PC Certificate |
| DLP Completion | Remaining 50% | End of Defects Liability Period (typically 12 months) |

---

## 9. PHASE 5 — PORTFOLIO REPORTING

### SOP-QS-13: Portfolio Dashboard

**Who:** Commercial Director, CFO, Executive Team  
**When:** Weekly or monthly executive review  
**System Path:** `/dashboard/qs` → Portfolio tab

#### Steps

1. Navigate to **QS → BOQ & Budget** → **Portfolio** tab
2. Review the **6 Portfolio KPI cards**:
   - Total active projects
   - Portfolio total value (sum of all contract sums)
   - Total spent to date
   - Portfolio variance (sum of Budget − EAC across all projects)
   - Portfolio EAC (sum of all project EACs)
   - Count of at-risk projects (CPI or SPI < 0.95, or variance negative)
3. Review the **project comparison table**:

| Column | Description |
|--------|-------------|
| Project | Project name and code |
| Budget | Total locked BOQ |
| Actual | Total cost transactions |
| Variance % | (Budget − Actual) ÷ Budget |
| Progress % | Weighted task completion |
| CPI | Cost Performance Index |
| SPI | Schedule Performance Index |
| EAC | Estimate at Completion |
| Health | On Track / At Risk badge |

4. At-risk projects are flagged in red; click the project name to navigate to its QS dashboard
5. Use this view to prioritise management attention and resource allocation

---

## 10. PHASE 6 — CLOSE-OUT

### SOP-QS-14: Final Account *(in development)*

**Who:** QS Manager, Commercial Manager  
**When:** After Practical Completion, before end of DLP  

#### Steps (future implementation)

1. Ensure all Variation Orders are in `implemented` status
2. Agree final re-measured quantities for all provisional BOQ items
3. Ensure all subcontractor accounts are finalized
4. Prepare Final Account Statement:
   - Original Contract Sum
   - + Sum of all approved VOs
   - ± Final measurement adjustments
   - = **Final Contract Sum**
5. Submit Final Account to client for agreement and signature
6. Once agreed: lock all BOQ items, close all open VOs
7. Issue **Final Certificate** triggering final retention release (if DLP ended)

---

## 11. SUBCONTRACTOR MANAGEMENT *(in development)*

### SOP-QS-15: Subcontractor IPC (Sub-IPC)

**Who:** QS Engineer, Subcontract Manager  
**When:** Monthly, per subcontract payment terms  
**System Path:** `/dashboard/qs/subcontractors/sub-ipc` *(TBD)*

#### Steps (future implementation)

1. Navigate to **QS → Subcontractors → Sub-IPCs**
2. Create monthly Sub-IPC against the subcontract BOQ
3. Assess claimed progress against sub-contract items
4. Issue recommended payment (may be less than claimed — Superintendent's assessment)
5. Sub-IPC status: `draft → submitted → certified → paid`
6. Certified Sub-IPC links to main contract cost transaction (Subcontract category)

---

### SOP-QS-16: Back Charges

**Who:** QS Engineer, Site Manager  
**When:** When costs are incurred due to subcontractor default  
**System Path:** `/dashboard/qs/subcontractors/back-charges` *(TBD)*

#### Steps (future implementation)

1. Navigate to **QS → Subcontractors → Back Charges**
2. Create a back charge event: description, date, incurred cost, responsible subcontractor
3. Attach supporting evidence (site instruction, photos, day work sheets)
4. Deduct the agreed back charge amount from the next Sub-IPC payment
5. Notify subcontractor formally via Contract Admin notice

---

## 12. CONTRACT ADMINISTRATION *(in development)*

### SOP-QS-17: Employer Instructions (EIs)

**Who:** QS Manager, Contract Administrator  
**When:** On receipt of instruction from client or superintendent  
**System Path:** `/dashboard/qs/contract-admin/instructions` *(TBD)*

#### EI Register Fields (planned)

| Field | Description |
|-------|-------------|
| EI Number | Sequential number (EI-YYYY-NNNN) |
| Date Issued | Date instruction received |
| Issued By | Client representative / Superintendent |
| Description | Full instruction narrative |
| Contract Reference | Applicable contract clause |
| Cost Impact | Estimated cost effect |
| Time Impact | Estimated programme effect (days) |
| VO Reference | Linked VO raised in response |
| Status | Open / Responded / Closed |

---

## 13. GAP REGISTER & IMPLEMENTATION STATUS

| Gap ID | Description | Priority | Status |
|--------|-------------|----------|--------|
| GAP-01 | RBAC not enforced on QS components | Critical | Open |
| GAP-02 | Multi-step VO approval not role-wired | Critical | Open |
| GAP-03 | Tendering module — no frontend implementation | High | Open |
| GAP-04 | Contract Administration module — zero implementation | High | Open |
| GAP-05 | Subcontractor management — zero implementation | High | Open |
| GAP-06 | Payment voucher integration with certified IPCs | High | Open |
| GAP-07 | Budget revision approval workflow UI | Medium | Open |
| GAP-08 | QS KPIs absent from Executive Dashboard | Medium | Open |
| GAP-09 | No PDF/report generation (IPC, BOQ, VO, Retention) | Medium | Open |
| GAP-10 | Cost code breakdown not shown in budget analysis | Medium | Open |
| GAP-11 | No time-phased planned cash flow baseline | Medium | Open |
| GAP-12 | No contingency reserve drawdown tracking | Medium | Open |
| GAP-13 | VO approval audit trail not visible in UI | Medium | Open |
| GAP-14 | No email/notification triggers for approvals | Low | Open |
| GAP-15 | No Excel/CSV export for BOQ, budget, claim reports | Low | Open |
| GAP-16 | No multi-currency support on QS tables | Low | Open |
| GAP-17 | No audit log viewer for QS transactions | Low | Open |
| GAP-18 | WBS-level budget rollup not in WBS tree view | Low | Open |

---

## 14. ROLES & RESPONSIBILITIES MATRIX (RACI)

| Activity | QS Engineer | QS Manager | PM | Commercial Director | Finance |
|----------|:-----------:|:----------:|:--:|:-------------------:|:-------:|
| Cost Library maintenance | C | A/R | I | I | — |
| BOQ creation | R | A | C | I | — |
| BOQ approval | C | R/A | C | I | — |
| BOQ lock | — | R/A | C | I | — |
| Budget monitoring | R | A | C | I | I |
| Cost transaction entry | R | A | I | — | C |
| VO creation | R | A | C | I | — |
| VO approval (<$5K) | C | I | A/R | — | — |
| VO approval ($5K–$50K) | — | R | A | I | — |
| VO approval (≥$50K) | — | C | C | A/R | — |
| IPC preparation | R | A | C | I | — |
| IPC certification | — | C | C | I | A/R |
| Retention release request | C | R/A | C | I | C |
| Retention release approval | — | C | — | A/R | C |
| Portfolio reporting | C | R | C | A | I |

*R = Responsible, A = Accountable, C = Consulted, I = Informed*

---

## 15. DOCUMENT CONTROL

| Field | Value |
|-------|-------|
| Document Number | SOP-QS-001 |
| Title | Quantity Surveying Module SOP |
| Revision | R1 |
| Prepared By | DCOS Commercial Team |
| Reviewed By | QS Manager |
| Approved By | Commercial Director |
| Issue Date | 2026-06-06 |
| Next Review | 2026-12-06 |
| Storage Location | `docs/01-Governance/01-SOP/22-SOP-Quantity-Surveying/` |

---

*End of Document — SOP-QS-001 R1*
