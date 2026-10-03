Cambodia 2026 Statutory Payroll Requirements vs. DCOS Payroll Module Architectural Compliance Report

1. Tax on Salary (TOS) Compliance Analysis

1.1 Cambodia 2026 TOS Statutory Framework

The General Department of Taxation (GDT) under the Ministry of Economy and Finance governs Tax on Salary (TOS) in Cambodia pursuant to the Law on Taxation and relevant implementation regulations. For resident individual employees, TOS is calculated on a monthly progressive tax scale divided into five tax brackets, utilizing a Tax Excess (TE) deduction mechanism to establish net tax liability.

Monthly Tax on Salary (TOS) Progressive Tax Bands (Resident Employees)

Band	Monthly Chargeable / Taxable Salary Threshold (KHR)	Statutory Tax Rate	Tax Excess Amount (TE) (KHR)	Tax Formula
Band 1	KHR 0 – KHR 1,500,000	0%	KHR 0	\text{BTOS} \times 0\%
Band 2	KHR 1,500,001 – KHR 2,000,000	5%	KHR 75,000	(\text{BTOS} \times 5\%) - \text{KHR } 75,000
Band 3	KHR 2,000,001 – KHR 8,500,000	10%	KHR 175,000	(\text{BTOS} \times 10\%) - \text{KHR } 175,000
Band 4	KHR 8,500,001 – KHR 12,500,000	15%	KHR 600,000	(\text{BTOS} \times 15\%) - \text{KHR } 600,000
Band 5	More than KHR 12,500,000	20%	KHR 1,225,000	(\text{BTOS} \times 20\%) - \text{KHR } 1,225,000

Additional TOS Statutory Provisions & Foreign Exchange Rules

* Dependent Rebate Allowance: Resident taxpayers are entitled to a tax deduction allowance of KHR 150,000 per month for a dependent spouse (non-income earning) and per dependent child (under 14 years of age, or up to 25 years of age if enrolled as a full-time student at an accredited educational institution).
* Basis of Taxable Salary Calculation: \text{Basis of Taxable Salary (BTOS)} = \text{Taxable Salary (TS)} - \text{Spousal/Child Rebates} - \text{Employee Pension Contribution}
* Non-Resident Tax Rate: Non-resident employees are assessed at a flat tax rate of 20% on all Cambodian-sourced salary, without entitlement to progressive tax bands or dependent rebates.
* Fringe Benefits Tax: Non-salary fringe benefits are excluded from progressive TOS and are subject to a separate flat tax rate of 20% borne by the employer.
* Currency Exchange Mechanism: Official payroll registers and tax returns must be calculated in Cambodian Riel (KHR). For multi-currency processing (e.g., USD salaries), TOS calculations must apply the official daily exchange rate issued by the National Bank of Cambodia (NBC) on the 15th of the month. If the 15th falls on a public holiday or weekend, the exchange rate from the business day prior to the 15th is applied.

1.2 DCOS Automated Tax Engine Capabilities

The Digital Construction Operating System (DCOS) Payroll Module incorporates a configurable automated tax engine engineered to enforce strict compliance with GDT regulations while eliminating hardcoded software liabilities.

* Architectural Principle ("Never Hardcode"): System administrators can dynamically adjust tax bracket thresholds, statutory percentages, and rebate amounts as tax legislation updates, preventing software lock-in and eliminating code refactoring requirements.
* Residency and Profile Parameter Tracking: System logic maintains separate tax calculation routines for resident versus non-resident employee profiles stored in the Employee Master database, dynamically switching between progressive scale logic and flat 20% calculations.
* Marital & Dependent Master Data Integration: Integrates employee personal profiles (single, married, dependent child counters) directly into the tax engine to automatically calculate and deduct KHR 150,000 monthly allowances prior to establishing the Basis of Taxable Salary (BTOS).
* Dynamic FX and Salary Structure Processing: Interoperates with the Tax Rule engine and NBC exchange rate feeds to perform real-time currency conversions from foreign currencies (e.g., USD) to KHR on statutory determination dates before running progressive rate and TE deduction algorithms.

1.3 Statutory TOS vs. DCOS Functional Comparison

Statutory Mandate (GDT)	DCOS Module Feature & Alignment
Progressive Tax Banding (0%–20%)	Fully Compliant: Dynamic tax engine processes the 5-bracket progressive scale automatically based on parameters defined in the configurable Tax Rule module without manual intervention.
Tax-Free Threshold & TE Deduction	Fully Compliant: Applies the KHR 1,500,000 threshold and subtracts exact bracket-specific Tax Excess (TE) amounts (KHR 75k to KHR 1.225M) within the automated calculation loop.
Dependent Rebates (KHR 150,000)	Fully Compliant: Reads spouse and dependent child counters from the Employee Master database to dynamically adjust the Basis of Taxable Salary (BTOS).
Non-Resident Flat Rate (20%)	Fully Compliant: Evaluates residency flags in employee master records and routes non-resident profiles to a flat 20% tax calculation workflow.

2. National Social Security Fund (NSSF) Schemes Integration

2.1 Cambodia 2026 Statutory NSSF Provisions & Wage Caps

The National Social Security Fund (NSSF), overseen by the Ministry of Labour and Vocational Training (MLVT) under Sub-Decree №32 and Prakas №449, mandates monthly social security contributions across three distinct insurance schemes. All contributions are calculated using defined contributory wage bases bounded by statutory minimum floors and maximum caps.

NSSF Statutory Contribution Breakdown

* Healthcare Scheme:
  * Employee Contribution: 1.3% of contributory wage (Capped at KHR 15,600/month)
  * Employer Contribution: 1.3% of contributory wage (Capped at KHR 15,600/month)
  * Total Combined Contribution: 2.6% of contributory wage (Capped at KHR 31,200/month)
  * Statutory Wage Boundaries: Minimum wage floor of KHR 200,000; Maximum wage ceiling of KHR 1,200,000.
* Pension Scheme (Phase 1: Oct 2022 – Sept 2027):
  * Employee Contribution: 2.0% of contributory wage (Capped at KHR 24,000/month)
  * Employer Contribution: 2.0% of contributory wage (Capped at KHR 24,000/month)
  * Total Combined Contribution: 4.0% of contributory wage (Capped at KHR 48,000/month)
  * Statutory Wage Boundaries: Minimum wage floor of KHR 400,000; Maximum wage ceiling of KHR 1,200,000.
  * Tax Note: Employee pension contributions are statutory deductions subtractable from gross salary prior to TOS calculation.
* Occupational Risk Scheme (Employment Injury):
  * Employee Contribution: 0.0% (N/A)
  * Employer Contribution: 0.8% of contributory wage (Capped at KHR 9,600/month)
  * Total Combined Contribution: 0.8% of contributory wage (Capped at KHR 9,600/month)
  * Statutory Wage Boundaries: Minimum wage floor of KHR 200,000; Maximum wage ceiling of KHR 1,200,000.

2.2 DCOS NSSF Automation Engine Evaluation

The DCOS Payroll Module automates NSSF contribution processing by executing real-time data flows between core system modules:

DCOS NSSF Automation Flow

* 1. Input Data Sources: Employee Master → Salary Structure → NSSF Rule Module
* 2. Automation Engine Processing:
  * Evaluates gross monthly wage against statutory minimum floors (KHR 200k/400k) and maximum ceilings (KHR 1,200,000).
  * Calculates Healthcare Scheme shares (Employee: 1.3% / Employer: 1.3%).
  * Calculates Pension Scheme Phase 1 shares (Employee: 2.0% / Employer: 2.0%).
  * Calculates Occupational Risk Scheme liability (Employer: 0.8%).
* 3. System Outputs: Employee Payroll Deductions | Employer Cost Liabilities | Statutory NSSF Monthly File Export

The engine automatically ingests gross compensation data, applies official NSSF currency exchange rates when foreign currency contracts are processed, clamps the calculation wage base between defined minimum floors and the KHR 1,200,000 ceiling, and segregates employee deductions from employer liabilities across all three schemes without manual intervention.

2.3 Comparative Mapping of NSSF Schemes vs. System Architecture

NSSF Scheme	Statutory Contribution Rates (Emp/Empr)	Statutory Cap (KHR)	DCOS Automation & Rule Handling
Healthcare Scheme	Employee: 1.3%<br>Employer: 1.3%	Employee: KHR 15,600/mo<br>Employer: KHR 15,600/mo<br>(Total: KHR 31,200/mo)	Automated: Clamps contributory wage base between KHR 200k floor and KHR 1.2M ceiling. Calculates 1.3% employee deduction and 1.3% employer liability.
Pension Scheme	Employee: 2.0%<br>Employer: 2.0%	Employee: KHR 24,000/mo<br>Employer: KHR 24,000/mo<br>(Total: KHR 48,000/mo)	Automated: Clamps wage base between KHR 400k floor and KHR 1.2M ceiling. Computes 2.0% employee deduction (automatically fed to BTOS logic) and 2.0% employer contribution. Configurable for statutory rate phase-ins (e.g., 8% in Oct 2027).
Occupational Risk	Employee: 0.0%<br>Employer: 0.8%	Employee: N/A<br>Employer: KHR 9,600/mo<br>(Total: KHR 9,600/mo)	Automated: Binds salary to KHR 1.2M ceiling and generates 0.8% employer-only cost liability. Zero deduction applied to employee pay.

3. Seniority Indemnity Mandates vs. DCOS Disbursement Engine

3.1 Cambodian Labor Law Seniority Indemnity Framework

Under Cambodian Labor Law (Prakas 443 and MLVT Instruction 058/19), employers operating Undetermined Duration Contracts (UDC) must disburse Seniority Indemnity to qualified employees.

1. Annual Entitlement Base: Employees under UDC agreements accrue 15 working days of seniority indemnity per year of continuous service.
2. Semi-Annual Payment Cadence: Payments must be disbursed twice per year in two equal installments alongside second monthly salary payments:
  * June Disbursement: 7.5 days of average daily wages and benefits.
  * December Disbursement: 7.5 days of average daily wages and benefits.
3. Pro-Rata & New Hire Entitlement:
  * Passed-probation employees working continuously between 1 and 6 months within a semester receive a full 7.5-day seniority entitlement for that semester.
  * An employee completing at least 21 working days within an enterprise is credited with 1 full month of continuous service toward seniority accrual. Statutory probation periods are explicitly excluded from seniority accrual tracking.
4. Tax Exemption Limits (Circular 002 MEF):
  * Seniority indemnity payments up to KHR 2,000,000 per semester are exempt from Tax on Salary (TOS).
  * Any portion exceeding KHR 2,000,000 per semester is summed directly into the employee's monthly taxable salary basis (BTOS) for that pay period and taxed under standard progressive rates.

3.2 DCOS Configurable Seniority Disbursement Engine

While Cambodian Labor Law establishes a bi-annual schedule for UDCs, corporate policies or varied employment structures across enterprise divisions require operational flexibility. The DCOS Seniority Rule module reconciles statutory compliance with enterprise customization.

* Disbursement Cadence Configurations: The DCOS engine features configurable schedule parameters, allowing organizations to run Seniority Indemnity calculations under four operational models:
  * Twice Yearly: Standard Cambodian statutory cadence (7.5 days in June / 7.5 days in December).
  * Monthly: Accrued and paid monthly (1.25 days/month) for specialized operational structures.
  * Yearly: Single annual disbursement (15 days in December).
  * Custom: Tailored corporate schedule configurations.
* Data Integration & Wage Calculation Logic: The engine pulls directly from the Seniority Rule, Attendance, Leave, and Salary Structure modules to calculate the daily average wage: \text{Average Daily Wage} = \frac{\text{Monthly Average Wages \& Benefits}}{\text{Monthly Standard Working Days (22, 24, or 26 days)}} \text{Semester Seniority Payment} = \text{Average Daily Wage} \times 7.5 \text{ days}
* Automated Tax Exemption Threshold Enforcement: DCOS isolates the seniority payment, evaluates it against the statutory KHR 2,000,000 tax-free limit, exempts compliant amounts, and channels any taxable excess directly into the monthly TOS calculation matrix.

4. Enterprise Governance, Security, Multi-Tier Approvals, and Project Cost Allocation

4.1 System Security, Auditability, and Multi-Tier Approval Workflow

To ensure strict compliance with corporate governance standards and mitigate financial risk, DCOS implements role-based approval routing, state-based data locking, and automated event logging.

DCOS Multi-Tier Approval Matrix

HR Officer (Generate) → HR Manager (Review) → Finance (Budget/Audit) → Director (Approval) → Payroll Locked

Governance & Security Architecture Features

* Immutable Payroll State Locking: Upon reaching the "Director Approved" state, the system enforces an absolute data lock. Post-approval edits, manual parameter overrides, or unauthorized recalculations are strictly prohibited by system security architecture.
* Automated Cross-Functional Notification System: Event-driven alerts are automatically dispatched to relevant stakeholders (HR, Finance, Director, Employee) upon triggering specific system lifecycle events:
  * Payroll Generated
  * Approval Required
  * Payroll Approved
  * Salary Paid
  * Payroll Rejected
* Enterprise Audit Trail Logging: The payroll engine logs all user actions, rule modifications, approval timestamps, and override requests into a non-editable audit trail to ensure system auditability.

4.2 Construction Industry Differentiation: DCOS Project Cost Allocation Engine

In enterprise construction operations, direct labor costs typically represent 20% to 50% of total project expenditure. Standard HR and payroll systems treat payroll as an isolated general overhead expense terminating at payment distribution. DCOS provides architectural differentiation by converting raw payroll outputs into an integrated project cost management tool.

DCOS Labor Cost Allocation Breakdown Hierarchy

* Payroll Generation
  * → Project Identification
    * → Work Breakdown Structure (WBS)
      * → Task Assignment
        * → Direct Labor Cost Accounting
          * → Productivity Tracking
            * → Real-Time Project Profitability Analysis

By linking timesheet and attendance data to specific construction activities, DCOS allocates net wages, employer statutory costs (NSSF), and associated overhead directly to WBS task lines. This capability allows project managers to measure real-time unit costs, compare budgeted versus actual labor expenditure, and monitor project profitability in real time.

5. Final Compliance Synthesis & Gap Assessment Matrix

Compliance Domain	2026 Cambodia Statutory / Industry Requirement	DCOS Architectural Feature	Compliance Status
Tax on Salary (TOS)	5-tier progressive rate structure (0%–20%), TE deductions, dependent rebates (KHR 150k), flat 20% non-resident rate, NBC 15th-day FX conversion.	Configurable Tax Rule engine ("Never hardcode"), dynamic BTOS subtraction logic, integrated NBC FX rate conversion, resident/non-resident profile flags.	Fully Compliant
NSSF Integration	Healthcare (2.6%), Pension Phase 1 (4.0%), Occupational Risk (0.8%). Wage bases bounded by KHR 200k/400k floors and KHR 1.2M ceiling.	Automated NSSF calculation engine sourcing data from Salary Structure and NSSF Rules. Computes both Employee and Employer contribution shares.	Fully Compliant
Seniority Indemnity	15 days/year for UDC contracts, paid in 7.5-day increments in June & December. Pro-rata service tracking. KHR 2,000,000/semester tax-free threshold.	Seniority Disbursement Engine supporting standard Twice Yearly payments alongside Monthly, Yearly, and Custom options. Automatic tax-exempt threshold filtering.	Fully Compliant
Governance & Security	Multi-tier approval security, absolute data locking post-approval, automated stakeholder notifications, non-editable audit logging.	Role-based 4-stage approval chain (HR Officer → HR Manager → Finance → Director → Payroll Locked), post-approval state lock, event notifications, dynamic audit logging.	Fully Compliant
Cost Allocation	Direct assignment of enterprise labor expenditures (20%–50% of construction budget) to project accounts and operational budgets.	Project Cost Allocation Engine mapping payroll outputs to Project → WBS → Task → Labor Cost → Productivity → Project Profitability.	Fully Compliant

Synthesis Readiness Statement

The Digital Construction Operating System (DCOS) Payroll Module demonstrates full architectural alignment with Cambodia's 2026 statutory payroll regulations. By combining configurable tax and social security calculation engines with multi-tier enterprise governance and a construction-specific Project Cost Allocation Engine, DCOS is fully prepared for compliant production deployment in Cambodian enterprise operations for 2026.
