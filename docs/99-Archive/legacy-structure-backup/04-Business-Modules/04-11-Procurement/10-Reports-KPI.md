# DCOS — Module 04-11 Procurement
## Document 10 — Reports & KPI

| Field | Value |
|---|---|
| Document Code | DCOS-MOD-04-11-PROC-10 |
| Version | R1 |
| Depends On | Doc 04 Database Schema (materialised views), Reporting Engine |
| Status | For Development |

---

## 1. Reporting Philosophy

Construction procurement reporting fails in one of two directions: either it reports activity (how many POs did we raise) or it reports history (what did we spend last quarter). Neither changes an outcome.

Useful procurement reporting answers three forward-looking questions:

1. **Are we about to overspend?** — committed vs allowable, before the money leaves.
2. **Are we about to be late?** — long-lead and delivery risk against the programme.
3. **Are we buying well?** — price against BOQ, competition, and supplier performance.

Everything else is a supporting detail.

---

## 2. KPI Definitions

### 2.1 Cost Control KPIs

| KPI | Formula | Target | Owner |
|---|---|---|---|
| Commitment Ratio | `committed / boq_allowable` per item, trade, project | ≤ 1.00 | QS |
| Cost Exposure | `committed + actual` vs `allowable + approved_vo` | ≤ 100% | Commercial Manager |
| Procurement Saving | `(PR estimate − awarded value) / PR estimate` | ≥ 2% | Procurement Manager |
| BOQ Variance | `(awarded rate − boq_allowable_rate) / boq_allowable_rate` per item | ≤ 0% | QS |
| Budget Override Rate | Override count / PR count | ≤ 5% | Project Director |
| Budget Override Value | Total override value / project budget | ≤ 2% | Commercial Manager |
| Uncommitted Balance | `allowable − committed − actual` by trade | Tracked, not targeted | QS |
| Residual Release Accuracy | Residual commitment released at PO close / expected | 100% | Finance |

### 2.2 Cycle Time KPIs

| KPI | Measured From → To | Target (median) |
|---|---|---|
| MR Review Time | MR submitted → MR approved | ≤ 1 working day |
| PR Preparation Time | MR approved → PR submitted | ≤ 2 working days |
| PR Approval Time | PR submitted → PR approved | ≤ 2 working days |
| Sourcing Time | PR approved → RFQ issued | ≤ 2 working days |
| Bidding Window | RFQ issued → bids closed | Per RFQ, ≥ 24h minimum |
| Evaluation Time | Bids opened → CBA approved | ≤ 3 working days |
| PO Issue Time | Award approved → PO issued | ≤ 1 working day |
| **Total PR → PO** | PR approved → PO issued | **≤ 7 working days** |
| **Total MR → Delivery** | MR submitted → GRN confirmed | **Tracked per item class** |
| Emergency Route | Emergency request → PO issued | ≤ 1 working day |

**Approval bottleneck metric:** median hold time per approver, per value band. Published on the weekly report by name. Approval delay is the largest single contributor to procurement cycle time on every construction project ever measured, and it does not improve until it is attributed.

### 2.3 Delivery Performance KPIs

| KPI | Formula | Target |
|---|---|---|
| On-Time Delivery Rate | Deliveries on or before scheduled date / total deliveries | ≥ 90% |
| On-Time In-Full (OTIF) | Deliveries on time **and** complete / total | ≥ 85% |
| Delivery Schedule Adherence | `abs(actual − scheduled)` mean days | ≤ 2 days |
| Rejection Rate | Rejected deliveries / total deliveries | ≤ 2% |
| Quarantine Rate | Receipts held for missing certificates / total | ≤ 5% |
| Unmatched Delivery Count | Deliveries arriving with no open PO | 0 |
| Expediting Coverage | Open PO lines with an expediting entry in the last 14 days / open lines past 50% of lead time | ≥ 95% |

### 2.4 Compliance and Governance KPIs

| KPI | Formula | Target |
|---|---|---|
| Competitive Coverage | PO value with ≥ 3 valid bids / PO value above threshold | ≥ 90% |
| Single-Source Rate | Single-source PO value / total PO value | ≤ 10% |
| Non-Lowest Award Rate | Non-lowest award count / awarded count | ≤ 15%, all justified |
| Emergency Purchase Rate | Emergency PO count / total PO count | ≤ 5% |
| Emergency Regularisation | Regularised within 3 days / emergency POs | 100% |
| WBS/BOQ Linkage | PO lines with valid WBS + BOQ / total PO lines | ≥ 98% |
| Three-Way Match First Pass | Invoices matched without exception / total | ≥ 85% |
| PQ Compliance | POs issued to currently-approved suppliers / total | 100% |
| SoD Exception Count | Active segregation-of-duties exceptions | Minimised, always visible |

### 2.5 Supplier Performance KPIs

Fed back to 04-10 Supplier Prequalification for the supplier scorecard.

| Dimension | Weight | Source |
|---|---|---|
| Delivery reliability (OTIF) | 30% | GRN vs scheduled date |
| Quality (rejection and NCM rate) | 25% | QA/QC inspection outcomes |
| Commercial (price vs market, invoice accuracy) | 20% | CBA ranking history, match exception rate |
| Responsiveness (RFQ response rate, quote turnaround, acknowledgement time) | 15% | RFQ and PO timestamps |
| Compliance (documentation, certificates, HSE) | 10% | Document completeness at receipt |

Score bands: `A ≥ 85` · `B 70–84` · `C 55–69` · `D < 55` (review) · `Suspended`.

---

## 3. Report Catalogue

### R-01 Committed Cost Report

| Attribute | Detail |
|---|---|
| Audience | QS, Commercial Manager, PM, Project Director |
| Frequency | Real-time, formal snapshot monthly |
| Grouping | BOQ item → trade → WBS branch → project → company |
| Columns | Allowable · Approved VO · Total budget · Committed (approved POs) · Actual (matched invoices) · Available · % committed · Open PR pipeline |
| Drill-down | BOQ item → PO lines → PO → GRN → invoice |
| Alert | Rows > 90% highlighted amber, > 100% red |
| Source | `mv_committed_cost_by_boq`, `mv_committed_cost_by_wbs` |

The single most important report in the module. It is the reason the WBS and BOQ linkage rules are non-negotiable.

### R-02 Procurement Pipeline Report

Count, value, and median age at each stage: MR open · PR draft · PR pending approval · PR approved awaiting RFQ · RFQ open · bids awaiting opening · under evaluation · award pending approval · PO draft · PO pending approval · PO issued awaiting delivery. Items exceeding the stage target are flagged with the responsible party named.

### R-03 Cycle Time Analysis

Per-record durations for every stage transition, with median, 90th percentile, and trend over the last six periods. Segmented by value band, discipline, procurement type, and buyer. Includes the approver bottleneck table.

### R-04 Savings and Price Variance Report

| Column | Source |
|---|---|
| PR estimate | `pr_line.estimated_amount_base` |
| BOQ allowable | `pr_line.boq_allowable_rate × qty` |
| Lowest compliant bid | CBA |
| Awarded value | PO line |
| Saving vs PR estimate | Awarded − estimate |
| Variance vs BOQ | Awarded − allowable |
| Cumulative project position | Rolling total |

Reported by trade, so the pattern is visible: "we are consistently 8% over BOQ on MEP fixings" is a tender-pricing lesson, not a procurement failure.

### R-05 Delivery Status and Risk Report

Open PO lines with: required date, scheduled date, expediting status, days to required date, delivered %, risk rating, WBS location, linked schedule activity, critical-path flag. Sorted by float ascending. This is the report the PM reads on Monday morning.

### R-06 Long-Lead Register Report

Every long-lead item with lead-time build-up, order-by date, days remaining, current procurement status, and linked schedule activity. Breached items listed first and never suppressed.

### R-07 Supplier Performance Report

Per supplier: PO count and value, OTIF, average delivery variance days, rejection rate, invoice accuracy, RFQ response rate, average quote turnaround, current score and band, trend. Filterable by trade and project.

### R-08 Supplier Spend Analysis

Spend by supplier, trade, project, period, and currency. Includes concentration analysis: top 10 suppliers as % of spend, and any supplier exceeding 25% of a trade category. Concentration is a commercial risk before it is anything else — if one rebar supplier holds 70% of your steel, their price is not really a market price.

### R-09 Three-Way Match Report

Match status per invoice: matched · exception (by type) · pending GRN · pending invoice. Exception ageing buckets (0-5, 6-10, 11-20, 20+ days) with owner. Includes variance acceptance register for the period.

### R-10 Governance Exception Pack

Consolidated monthly: budget overrides · single-source awards · non-lowest awards · emergency purchases and regularisation status · SoD exceptions · PQ-expired supplier activity · sealed-bid access attempts · configuration changes · match variances accepted. One document, one audience, one uncomfortable meeting per month.

### R-11 Open PO Register

All open POs with supplier, value, delivered %, invoiced %, residual commitment, age, and status. The reconciliation base for month-end. Total residual commitment on this report must equal the committed figure on R-01 — if it does not, one of the two is wrong and both stop being trusted.

### R-12 Procurement Plan vs Actual

Planned procurement milestones (from the procurement schedule) against actual PR, RFQ, award, and PO dates. Shows slippage per package and the downstream schedule impact.

---

## 4. Dashboard Specifications

### 4.1 Executive / Board Dashboard (company-wide)

| Widget | Content |
|---|---|
| Total committed across portfolio | Value + % of total budget, by project |
| Projects over commitment threshold | Count + list, red |
| Company-wide procurement savings | Value + % vs estimates, YTD trend |
| Supplier concentration | Top 10 as % of spend |
| Governance exceptions this month | Override / single-source / emergency counts |
| Procurement cycle time | Company median with trend arrow |

### 4.2 Project Director Dashboard

Committed vs budget by trade (bar) · approval bottlenecks by person · long-lead risk count · overdue delivery count with critical-path split · emergency and override register · match exceptions over 10 days.

### 4.3 Project Manager Dashboard

Pipeline funnel · awaiting my approval · deliveries this week · long-lead board · delivery risk against programme · committed vs budget for my project · top five overdue PO lines.

### 4.4 Procurement Manager Dashboard

Team workload by buyer · pending approvals with ageing · bids ready to open · evaluations in progress · expediting actions due · supplier performance alerts · blanket ceiling and validity warnings · savings YTD.

### 4.5 QS / Cost Engineer Dashboard

Committed cost by BOQ item with % bars · items over 80% · non-BOQ lines awaiting endorsement · overrides pending · awarded vs BOQ variance by trade · residual commitment on closing POs.

### 4.6 Site Dashboard (mobile)

My MRs and their status · deliveries arriving at my WBS today and this week · items in quarantine · overdue deliveries affecting my tasks. No commercial values.

---

## 5. Data Sources and Refresh

| Report | Source | Refresh | Latency Tolerance |
|---|---|---|---|
| R-01 Committed Cost | `mv_committed_cost_by_boq/wbs` | 15 min + on PO approval | Near real-time |
| R-02 Pipeline | Live query with index | On load | Real-time |
| R-03 Cycle Time | `mv_procurement_cycle_time` | Nightly | 1 day |
| R-04 Savings | `mv_savings_analysis` | Nightly | 1 day |
| R-05 Delivery Status | `mv_po_delivery_status` | 5 min | Near real-time |
| R-06 Long-Lead | Live query | On load | Real-time |
| R-07/R-08 Supplier | `mv_supplier_spend` + scoring job | Nightly | 1 day |
| R-09 Match | `mv_three_way_match_status` | 15 min | Near real-time |
| R-10 Governance Pack | Audit query, async | Monthly, scheduled | N/A |
| R-11 Open PO Register | Live query | On load | Real-time |
| R-12 Plan vs Actual | Live + schedule join | On load | Real-time |

---

## 6. Export and Distribution

| Requirement | Specification |
|---|---|
| Formats | PDF (formatted, with header block and generation timestamp), XLSX (raw data), CSV (integration) |
| Async threshold | > 10,000 rows returns a job reference; notification on completion |
| Scheduled distribution | Any report may be scheduled to a recipient list; schedule changes are audited |
| Watermarking | PDF exports carry the requesting user, timestamp, and project — commercial data leaves with attribution attached |
| Audit | Every export writes `PROC.REPORT_EXPORTED` with filters and row count; > 500 rows requires step-up |
| Snapshot integrity | Monthly formal reports are snapshotted and stored immutably — the month-end position does not change retrospectively when a late PO is backdated |

That last point causes more month-end arguments than any other. Freeze the snapshot, record the late entry in the next period, and keep both.

---

## 7. Report Performance Targets

| Report | Rows | Target |
|---|---|---|
| R-01 Committed Cost, single project | ~5,000 BOQ items | < 3 s |
| R-01, company-wide, 20 projects | ~100,000 | < 15 s (async above) |
| R-02 Pipeline | ~2,000 records | < 2 s |
| R-05 Delivery Status | ~3,000 open lines | < 2 s |
| R-09 Three-Way Match | ~5,000 invoices | < 3 s |
| R-11 Open PO Register | ~1,500 POs | < 2 s |
| Dashboard first paint | — | < 2 s per platform NFR |

---

## 8. KPI Ownership and Review Cadence

| KPI Group | Owner | Reviewed | Forum |
|---|---|---|---|
| Cost control | QS / Commercial Manager | Weekly | Project commercial meeting |
| Cycle time | Procurement Manager | Weekly | Procurement team meeting |
| Delivery performance | Procurement Manager + PM | Weekly | Project progress meeting |
| Compliance / governance | Project Director | Monthly | Project review board |
| Supplier performance | Procurement Manager | Monthly | Supplier review |
| Portfolio commitment | Commercial Manager | Monthly | Company management meeting |
| Fraud signals (Doc 09 §7) | Internal audit | Monthly | Audit committee |

A KPI without a named owner and a scheduled forum is a number on a screen. It will be admired for three weeks and then ignored.

---

*Digital Construction Operating System — Procurement — Doc 10 Reports & KPI — Internal Controlled Document*
