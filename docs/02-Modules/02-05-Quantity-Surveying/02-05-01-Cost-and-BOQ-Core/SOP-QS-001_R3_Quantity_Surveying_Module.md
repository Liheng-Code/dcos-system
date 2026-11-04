

DCOS

Digital Construction Operating System

Quantity Surveying Module

Standard Operating Procedure (SOP)



Table of Contents



1. Purpose & Scope

This Standard Operating Procedure governs the complete commercial lifecycle of a construction project within the DCOS platform — from pre-contract cost estimation through to financial close-out. It defines the standard process, the workflow control applied at every stage, the responsible roles, and the system controls that enforce commercial governance.

The SOP covers the following processes:

Cost Library management (rate build-up and maintenance)

Tender BOQ creation, tender management, and bid evaluation (in development)

Bill of Quantities (BOQ) creation and contract baseline control

Rate build-up and margin application — dual cost/sell rates (NEW in R3)

Budget monitoring and variance analysis

Time-phased budget baseline and monthly cash flow forecast (NEW in R3)

Cost transaction recording (invoices, POs, timesheets, deliveries)

Variation Order (VO / Change Order) management with threshold-based approval

Earned Value Management (EVM) and Cost S-Curve monitoring

Interim Payment Certificates (IPC / Progress Claims) in G702 format

Retention deduction and release management

Portfolio-level commercial reporting

Final Account and close-out (in development)

Final QS Cost Report — internal full-cost version and client sell-side version (NEW in R3)

Subcontractor Sub-IPC and back charges (in development)

Contract Administration — Employer Instructions (in development)





2. Definitions & Abbreviations

3. Module Navigation

The sidebar groups all QS features under “Quantity Surveying” with the following sub-sections:

QS & Cost — BOQ, Cost Library, Variation Orders, Claims, Retention

Tendering — Cost Estimation, Tender Management, Bid Evaluation

Contract Admin — Notices, Employer Instructions, Correspondence, Entitlements

Subcontractors — Sub-IPCs, Back Charges, Performance Notices

4. Database Tables Reference



5. QS Process Overview & Master Workflow Map

The QS module follows the commercial lifecycle of a construction contract. Each phase hands a controlled baseline to the next:

Master status lifecycles controlled by this SOP:





6. Phase 1 — Pre-Contract

SOP-QS-01: Cost Library Management



Procedure Steps

Navigate to QS → Cost Library.

The library is organised in 3 levels: Divisions → Sections → Items.

S

To add a Division: click “Add Division” → enter Code, Name, Sequence.

To add a Section: expand a division → click “Add Section”.

To add a Cost Item: expand a section → click “Add Item” → fill in Code, Description, Unit, Base Rate, and the cost breakdown (Labor %, Material %, Equipment % — must sum ≤ 100%).

Items with is_active = false are hidden from BOQ library lookups.

C

Validation Rules

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Obsolete rate found: deactivate the item and create a replacement — never overwrite the old rate history.

Duplicate code rejected by the system: correct the code or place the item under the appropriate section.

SOP-QS-02: Tender BOQ Creation (in development)



Procedure Steps

Navigate to QS → Tendering → Cost Estimation.

Create or open the linked tender from Tender Management.

In the Tender BOQ tab, add sections and items from the rate library.

F

Add subcontractor quotes under the Sub-Quotes tab (compare quotes per trade).

In the Risk Register, add risk items with likelihood, impact, and priced amount.

Compile the Bid Summary: Direct Cost + Preliminaries + Overhead % + Profit % + Contingency + Risk Allowance = Total Bid Price.

Set status to final and submit.

Bid Summary Calculation

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Addendum received after finalisation: revert to draft, record the addendum reference, re-price affected items, re-finalise.

Sub-quote withdrawn: replace with next preferred quote and record the change in the sub-quotes comparison.

SOP-QS-03: Tender Management (in development)



Tender Types

Procedure Steps

Navigate to QS → Tendering → Tender Management.

C

F

Issue Addenda as required (addendum number, title, attachment URL).

Manage the Queries log: record questions and published answers; mark confidential where required.

Record Submissions: bidder name, submitted date, bid amount, responsiveness status.

Evaluate bids under Bid Evaluation: shortlist, score, and recommend award.

Award tender: set winning submission → status → awarded.

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

No responsive bids received: record outcome, cancel or re-issue the tender as a new revision.

Confidential query: mark confidential — the answer is issued only to the querying bidder and flagged in the log.

SOP-QS-04: Bid Evaluation (in development)



Procedure Steps

Open the tender and navigate to the Submissions tab.

Mark each submission as responsive or non_responsive.

F

Set preferred submissions to shortlisted.

P

Award to the selected bidder → tender status → awarded.

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Tied scores: Commercial Manager applies documented tie-break criteria (price, programme, HSE record) and records the rationale.

Preferred bidder withdraws: escalate to next shortlisted bidder; re-issue recommendation for approval.



7. Phase 2 — Post-Contract: Budget Establishment

SOP-QS-05: BOQ Creation (Bill of Quantities)



Procedure Steps

Navigate to QS → BOQ & Budget → Bill of Quantities tab.

S

Click “Add Section” to create BOQ divisions (e.g., “Substructure”, “Superstructure”, “Finishes”).

Within each section, click “Add Item”: search the cost library by code or description (auto-populates unit and rate) or enter a free-form description; set Unit, Quantity, Unit Rate → Total Amount auto-calculates; optionally link a WBS Node for WBS-level cost tracking; mark provisional items with the “Provisional” toggle; set Contingency % for risk allowance items.

R

When the BOQ is ready for contract sign-off: click “Approve BOQ” → draft → approved.

Once the contract is executed: click “Lock BOQ” → approved → locked. The locked BOQ is the contract baseline — no direct editing permitted. All post-lock changes must go through a Variation Order (see SOP-QS-08).

Post-lock revisions create an entry in qs_budget_revisions and set status to revised.

Baseline Status Rules

BOQ Item Fields

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Error discovered after lock: raise a budget revision (with Director approval) or a VO depending on whether the error is internal or contractual.

Client-supplied BOQ differs from measured quantities: mark affected items provisional and resolve through re-measurement at Final Account.

SOP-QS-05A: Rate Build-Up & Margin Application (NEW in R3)





Procedure Steps

Navigate to QS → BOQ & Budget → Markup Settings and select the project.

E

Submit for approval → Commercial Director reviews and approves the markup set → status approved.

I

Item-level exception: enter a markup_pct_override with a mandatory reason (e.g., loss-leader pricing, provisional item) — the override replaces the component build-up for that item.

Total Amount = Quantity × Sell Rate — this is the contract value shown on the BOQ, claimed in IPCs, and reported to the client.

E

Markup settings lock automatically when the BOQ locks (SOP-QS-05) → status locked.

Sell Rate Formula



Worked Example — C25 Concrete, Slab (Cost Rate $85.00/m³)

Quantity 500 m³ → Contract value $47,345 (sell), estimated cost $42,500, expected margin $4,845 (10.2%).

Data Model Additions

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Mid-project markup policy change: applies to pricing of new VOs only — the locked baseline sell rates never change.

Library item without a 100% component split: price via item-level margin override with reason, and flag the library item for correction (SOP-QS-01).

Client requests rate breakdown: only the sell rate build-up may be shared in the contractual format; internal cost/markup structure requires Commercial Director approval and a contractual open-book basis.

SOP-QS-06: Budget & Variance Monitoring



Procedure Steps

Navigate to QS → BOQ & Budget → Budget & Variance tab and select the project.

Review the 4 KPI cards: Total Budget (locked BOQ total); Committed (approved POs/subcontracts not yet invoiced); Actual Cost (paid or approved invoices); Forecast/Spent progress bar (Actual ÷ Budget %).

E

A

I

Column Definitions

Variance Colour Coding

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Cost recorded without BOQ allocation: QS Engineer re-allocates the transaction to the correct BOQ item before the next review.

Forecast exceeds contract sum: immediate escalation to Commercial Director with recovery plan (this is an EAC breach, see SOP-QS-09).



8. Phase 3 — Post-Contract: Cost Control

SOP-QS-07: Cost Transaction Recording



Procedure Steps

Navigate to QS → BOQ & Budget → Cost Transactions tab.

Click “Record Cost” to open the entry form.

F

S

Use the Category Filter chips to filter the view by cost type.

D

Transaction Type Definitions

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Wrong amount discovered after approval: post a contra (negative) transaction referencing the original, then re-enter correctly.

Invoice without a PO: record as Invoice type and flag to Procurement for retrospective PO or escalation.

SOP-QS-08: Variation Order (VO) Management



Procedure Steps

Navigate to QS → Variation Orders and click “New Variation Order”.

E

Save as draft — the VO number is auto-generated in the format VO-YYYY-XXXX.

A

When ready for approval, click “Submit” → draft → submitted.

T

E

Rejection resets the VO to draft for revision and resubmission.

Once all approval steps are complete → status approved.

After the change is physically implemented on site → QS marks implemented.

Multi-Step Approval Routing

VO Impact on Contract Sum

Approved VOs do not directly modify locked BOQ line items.

Approved VO amounts accumulate as net_vo_amount in IPC claims.

Running Contract Sum = Original Contract Sum + Net Approved VO Amount.

Rejected VOs have no financial impact.



Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Urgent site instruction before VO approval: proceed only with PM written instruction; raise the VO within 48 hours and reference the instruction.

Client disputes VO value: keep the VO at submitted, record the client position in the description, and negotiate; do not implement financially until approved.

Approver unavailable: Commercial Director may reassign the approval step; reassignment is logged.

SOP-QS-09: Earned Value Management (EVM) Monitoring



Procedure Steps

Navigate to QS → BOQ & Budget → EVM Dashboard tab and select the project.

Click “Refresh” to compute the latest metrics from current task progress and cost data.

R

R

N

Use the Portfolio tab for cross-project EVM comparison.

EVM Metrics

Interpretation & Escalation Guide

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

CPI/SPI ≥ 1.10 (too good): treat as a data-quality flag — verify progress claims and cost completeness before reporting.

Progress data missing for the period: chase task owners; do not certify the monthly report with stale EV data.

SOP-QS-10: Cost S-Curve Monitoring



Procedure Steps

Navigate to QS → BOQ & Budget → Cost S-Curve tab and select the project.

Click “Capture Today” to record a progress snapshot — the system records current Planned Cost and Actual Cost at today's date.

T

K

C

B



Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Missed monthly snapshot: capture immediately and note the gap — do not back-date snapshots.

SOP-QS-10A: Time-Phased Budget Baseline & Cash Flow Forecast (NEW in R3)



This procedure converts the locked BOQ into a month-by-month planned spend distribution — the time-phased baseline. It is the single source of the planned S-curve (SOP-QS-10), the EVM Planned Value (SOP-QS-09), and the project cash flow forecast. Distribution is automatic from the schedule, with manual override where spend is not linear.

Procedure Steps

Navigate to QS → BOQ & Budget → Budget Baseline and select the project.

Click “Generate Baseline” — the system auto-distributes each BOQ item value across calendar months using the planned start–finish dates of the linked WBS/task (linear spread by working days per month).

Items without a schedule link appear in the Unallocated panel — allocate these manually across months.

R

Submit the baseline → QS Manager approves → status locked as Baseline Rev 0.

Open the Cash Flow tab. The system derives: Cash Out = monthly cost forecast shifted by supplier/subcontractor payment terms; Cash In = forecast IPC certifications × (1 − retention %) shifted by certification and client payment terms; retention releases added at the PC and DLP months.

R

M

Distribution Rules

Cash Flow Components

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Schedule re-baseline (EOT, acceleration): regenerate the forecast as a new baseline revision — never edit Rev 0.

Persistent negative cash months: escalate to Commercial Director and Finance for facility arrangement or claim/IPC timing review.

Large unallocated remainder (> 5% of contract sum): baseline cannot be approved until allocation is complete.



9. Phase 4 — Payment Certification

SOP-QS-11: Interim Payment Certificate (IPC / Progress Claim)



Procedure Steps — Contractor Side (Prepare Claim)

Navigate to QS → Progress Claims and click “New Claim”.

F

Click “Initialize Items” — the system auto-populates claim items from the locked BOQ: Scheduled Value (from locked BOQ item total) and Previous Completed (sum from all prior certified or paid claims).

F

R

Click “Submit” → status draft → submitted.

Procedure Steps — Client Side (Review and Certify)

C

R

Click “Mark Reviewed” → status submitted → client_reviewed.

S

Click “Certify” → the system automatically records the certified amount, certifier name, and timestamp; creates a retention deduction entry in qs_retention_ledger; and sets status client_reviewed → certified.

When payment is received and banked: Finance clicks “Mark Paid” → status certified → paid.

G702 Summary

Percentage Complete Calculation



Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Client certifies less than claimed: the certified amount governs; the difference and reasons are retained in the claim record for Final Account negotiation.

Claim rejected outright: return to draft, correct measurements/evidence, resubmit within the same period where possible.

Materials stored disputed: provide delivery dockets and storage evidence; unresolved amounts are removed from the current claim and re-claimed next period.

SOP-QS-12: Retention Register Management



Retention Deductions (Automatic)

When an IPC is certified, a retention deduction entry is automatically created.

The amount deducted = retention_amount from the certified IPC.

Entry type = deduction, approval status = approved (auto-approved on certification).



Viewing the Register

Navigate to QS → Retention and select the project.

R

T

Release Requests

When a release trigger is reached, click “Request Release”.

F

Submit → approval status pending.

QS Manager or Director reviews and clicks “Approve” or rejects with reason.

On approval → status approved, and the outstanding balance updates.

Standard Retention Split

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Retention bond substituted for cash retention: record bond details in notes and suspend further deductions per contract terms.

Client delays release beyond expected date: escalate via Contract Admin notice (SOP-QS-17 and Notice register) — retention receivable is a contractual entitlement.



10. Phase 5 — Portfolio Reporting

SOP-QS-13: Portfolio Dashboard



Procedure Steps

Navigate to QS → BOQ & Budget → Portfolio tab.

R

R

A

U

Project Comparison Columns

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Project missing from portfolio: verify the BOQ is locked — unlocked projects have no budget baseline and are excluded from EAC aggregation.

11. Phase 6 — Close-Out

SOP-QS-14: Final Account (in development)



Procedure Steps (future implementation)

Ensure all Variation Orders are in implemented status.

A

E

P

S

O

Issue the Final Certificate, triggering the final retention release (if DLP has ended).

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Client disputes final measurement: unresolved items move to Claims & Disputes; agreed items are certified to keep cash flowing.

SOP-QS-14A: Final QS Cost Report (NEW in R3)





Internal Final Cost Report — Columns (per BOQ item, section/trade, and project)

Client Final Statement — Columns (sell side only)

Procedure Steps

C

Generate the Internal Final Cost Report; review margin variance versus tender margin per trade — this is the project's commercial lessons-learned record.

QS Manager review → Commercial Director approval → internal version archived (status approved).

Generate the Client Final Statement — the system renders sell-side fields only, from the approved data set.

I

O

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Client demands cost breakdown (open-book request): release requires Commercial Director approval and a contractual open-book basis — record the decision and scope of disclosure.

Disputed final items: split the client statement into agreed and disputed sections; certify and close the agreed portion, route disputed items to Claims & Disputes.



12. Subcontractor Management (in development)

SOP-QS-15: Subcontractor IPC (Sub-IPC)



Procedure Steps (future implementation)

Navigate to QS → Subcontractors → Sub-IPCs.

C

A

I

Sub-IPC status: draft → submitted → certified → paid.

T

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Subcontractor disputes assessment: record the dispute against the Sub-IPC; pay the undisputed certified amount on time.

SOP-QS-16: Back Charges



Procedure Steps (future implementation)

Navigate to QS → Subcontractors → Back Charges.

C

A

D

N

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Subcontractor disputes the charge: hold the deduction, escalate through Contract Admin; deduct only the finally agreed amount.

13. Contract Administration (in development)

SOP-QS-17: Employer Instructions (EIs)



EI Register Fields (planned)

Workflow Control

Process status flow:



Control gates:





Exception and rejection handling:

Verbal instruction received on site: confirm in writing to the issuer within 24 hours and register the confirmation as the EI.

Instruction with no apparent cost/time impact: register and close with a nil-impact assessment — never leave EIs unregistered.



14. Gap Register & Implementation Status

15. Roles & Responsibilities Matrix (RACI)



R = Responsible,  A = Accountable,  C = Consulted,  I = Informed

16. Document Control



Revision History



End of Document — SOP-QS-001 R3