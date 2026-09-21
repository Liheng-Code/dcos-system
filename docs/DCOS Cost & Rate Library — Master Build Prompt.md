# MASTER BUILD PROMPT
## DCOS Cost & Rate Library
### Construction Material Specification, Supplier, Price History & Cost Reference Web Application

---

# 1. ROLE

You are a **Senior Full-Stack Software Architect, Construction QS/Commercial Systems Specialist, Database Architect, UI/UX Designer, and Product Engineer**.

Your task is to design and build a production-quality web application called:

> **DCOS Cost & Rate Library**

The application is part of a larger construction management platform called **DCOS**.

The purpose of this module is to create a centralized, secure, searchable, cloud-based construction cost knowledge library containing:

- Construction materials
- Material specifications
- Suppliers
- Supplier quotations
- Historical material prices
- Subcontractor rates
- Labor rates
- Equipment rates
- Project-specific rates
- Cost codes
- Supporting documents
- Price trends
- Supplier comparisons
- Cost benchmarks
- Estimation reference data

The system must allow construction teams to record cost information once and reuse it for:

- Tender estimation
- Budget preparation
- Cost planning
- Procurement
- Supplier comparison
- Historical reference
- Rate analysis
- Project forecasting
- Commercial reporting
- Management decision-making

Do not build this as a simple CRUD application.

Build it as a **structured construction cost intelligence and reference library**.

---

# 2. PRIMARY BUSINESS OBJECTIVE

The core business principle is:

> **Record once → Verify → Approve → Preserve history → Search → Compare → Analyze → Reuse for estimation.**

The application must prevent the common construction problem of having price information scattered across:

- Excel files
- Email
- WhatsApp
- PDF quotations
- Individual computers
- Project folders
- Personal records

Instead, DCOS must create one controlled source of construction cost reference data.

---

# 3. CORE FUNCTIONAL REQUIREMENTS

The application must provide the following major functions:

## 3.1 Material Master

Create and manage construction material records.

Each material should contain:

- Material Code
- Material Name
- Category
- Subcategory
- Discipline
- Material Type
- Description
- Technical Specification
- Standard
- Grade
- Brand
- Model
- Manufacturer
- Unit
- Package Size
- Dimension
- Weight
- Color
- Finish
- Application
- Related Construction Element
- Status
- Tags
- Notes
- Created By
- Created Date
- Modified By
- Modified Date

Example:

```text
MAT-CON-001

Material:
Ready Mix Concrete

Type:
Structural Concrete

Grade:
C30/37

Standard:
EN 206

Unit:
m³

Application:
Structural Beam / Column / Slab
```

---

# 4. MATERIAL SPECIFICATION LIBRARY

Create a dedicated specification record linked to the Material Master.

A material can have multiple specifications or revisions.

Example:

```text
Material
    ↓
Specification
    ↓
Specification Revision
```

Fields:

- Specification ID
- Material ID
- Specification Name
- Standard
- Grade
- Strength
- Dimension
- Thickness
- Density
- Unit
- Manufacturer
- Brand
- Technical Requirements
- Installation Requirements
- Testing Requirements
- Approval Requirements
- Revision
- Effective Date
- Expiry Date
- Supporting Documents
- Status

Support common standards such as:

- EN
- Eurocode-related specifications
- BS
- ASTM
- ACI
- ISO
- Local standards

The system must not assume one standard is universally applicable.

---

# 5. SUPPLIER MASTER

Create a dedicated Supplier Master.

Fields:

- Supplier Code
- Company Name
- Trading Name
- Supplier Type
- Contact Person
- Position
- Phone
- Email
- Address
- Country
- Province / City
- Website
- Product Categories
- Payment Terms
- Delivery Terms
- Lead Time
- Minimum Order Quantity
- Credit Terms
- Supplier Rating
- Reliability Rating
- Quality Rating
- Price Competitiveness
- Status
- Notes
- Supporting Documents

Supplier types:

- Manufacturer
- Distributor
- Importer
- Local Supplier
- Specialist Supplier
- General Supplier

---

# 6. SUPPLIER-MATERIAL RELATIONSHIP

Create a relationship between suppliers and materials.

A supplier can supply many materials.

A material can be supplied by many suppliers.

Therefore:

```text
Supplier
    ↕
Supplier Material
    ↕
Material
```

Supplier Material fields:

- Supplier Material ID
- Supplier ID
- Material ID
- Supplier Product Code
- Supplier Product Name
- Brand
- Manufacturer
- Specification
- Standard
- Package Size
- Minimum Order Quantity
- Lead Time
- Active/Inactive
- Notes

---

# 7. PRICE HISTORY

This is one of the most important components of the system.

NEVER overwrite historical prices.

Every price must be stored as a separate historical record.

Price fields:

- Price ID
- Material ID
- Supplier ID
- Project ID
- Quotation ID
- Date
- Effective Date
- Expiry Date
- Quantity
- Unit
- Currency
- Basic Unit Price
- Discount
- Delivery Cost
- Handling Cost
- Tax
- Other Charges
- Effective Unit Cost
- Payment Terms
- Delivery Terms
- Location
- Lead Time
- Price Status
- Source Document
- Verification Status
- Approval Status
- Created By
- Approved By
- Created Date
- Approved Date
- Notes

Example:

```text
Material:
C30/37 Concrete

Supplier:
Supplier A

Date:
2026-09-05

Basic Price:
95 USD/m³

Delivery:
5 USD/m³

Effective Price:
100 USD/m³

Source:
Quotation QT-2026-0098
```

---

# 8. EFFECTIVE COST CALCULATION

Do not compare suppliers only by quoted unit price.

Calculate:

```text
Effective Cost =
Basic Price
- Discount
+ Delivery
+ Handling
+ Other Charges
+ Applicable Tax
```

Allow configuration because tax treatment may differ.

Display both:

```text
Quoted Unit Price
Effective Unit Cost
```

Example:

```text
Supplier A
Quoted Price: $95
Delivery: $5
Effective Cost: $100

Supplier B
Quoted Price: $92
Delivery: $0
Effective Cost: $92
```

Therefore Supplier B is cheaper in effective terms.

---

# 9. QUOTATION MANAGEMENT

Create a quotation module.

A quotation contains:

```text
Quotation Header
    ↓
Quotation Items
    ↓
Material
    ↓
Price
```

Quotation Header:

- Quotation Number
- Supplier
- Project
- RFQ Number
- Quotation Date
- Valid Until
- Currency
- Payment Terms
- Delivery Terms
- Contact Person
- Source Document
- Status
- Notes

Quotation Items:

- Item Number
- Material
- Supplier Product Code
- Description
- Specification
- Quantity
- Unit
- Unit Price
- Discount
- Delivery
- Tax
- Effective Price
- Lead Time
- Remarks

---

# 10. SUPPLIER QUOTATION COMPARISON

Create a dedicated side-by-side comparison screen.

Example:

| Item | Supplier A | Supplier B | Supplier C |
|---|---:|---:|---:|
| Unit Price | $95 | $92 | $98 |
| Delivery | $5 | $0 | $3 |
| Tax | $10 | $9.20 | $10.10 |
| Effective Cost | $110 | $101.20 | $111.10 |
| Lead Time | 3 days | 5 days | 2 days |
| Payment | 30 days | 15 days | 30 days |

Highlight:

- Lowest price
- Lowest effective cost
- Shortest lead time
- Best payment terms
- Best supplier rating

Allow the user to select multiple suppliers and compare them.

---

# 11. HISTORICAL PRICE TREND

Create interactive charts.

The user must be able to select:

- Material
- Supplier
- Category
- Project
- Location
- Currency
- Period
- Unit

Example:

```text
C30/37 Concrete

2024   $82
2025   $88
2026   $92
```

Display:

- Minimum Price
- Maximum Price
- Average Price
- Median Price
- Latest Price
- Previous Price
- Percentage Change
- Trend Direction
- Number of Records

Calculate:

```text
Price Change % =
(Current Price - Previous Price)
/
Previous Price × 100
```

---

# 12. PRICE TREND VISUALIZATION

Provide:

## Line Chart

Historical price movement over time.

## Bar Chart

Supplier price comparison.

## Area Chart

Price movement by category.

## KPI Cards

```text
Latest Price
Average Price
Lowest Price
Highest Price
YoY Change
Number of Suppliers
Number of Quotations
```

Use interactive filters.

---

# 13. RATE CONFIDENCE

Create a "Rate Confidence" indicator.

The system should evaluate:

- Number of historical records
- Number of suppliers
- Age of latest record
- Price variation
- Number of completed projects
- Verification status
- Approval status

Example:

```text
ESTIMATED MARKET RATE

$94.00/m³

Confidence:
HIGH

Evidence:
✓ 12 historical records
✓ 5 suppliers
✓ Latest quotation < 30 days
✓ 3 completed projects
✓ Low price variation
```

Possible confidence levels:

```text
HIGH
MEDIUM
LOW
INSUFFICIENT DATA
```

Do not represent forecasts as actual market prices.

---

# 14. QUICK COSTING

Create a "Quick Costing" tool.

User enters:

```text
Material:
C30/37 Concrete

Quantity:
350

Unit:
m³
```

The system searches the Cost & Rate Library and returns:

```text
Historical Market Rates

Supplier A     $95/m³
Supplier B     $92/m³
Supplier C     $98/m³

Historical Average
$95/m³

Latest Approved Rate
$92/m³

Recommended Reference Rate
$94/m³
```

Then:

```text
350 × $94
=
$32,900
```

The system must clearly show whether the rate is:

- Actual
- Historical
- Average
- Approved
- Estimated
- Forecast

---

# 15. SUBCONTRACTOR RATE LIBRARY

Create a Subcontractor Master.

Fields:

- Subcontractor Code
- Company Name
- Trade
- Scope
- Contact
- Location
- Rating
- Status
- Notes

Create Subcontractor Rate records.

Example:

```text
Waterproofing

Subcontractor:
ABC Waterproofing

Unit:
m²

2024:
$8.50/m²

2025:
$9.20/m²

2026:
$10.00/m²
```

Support:

- Unit rate
- Lump sum
- Daywork
- Productivity-based rate
- Package rate

---

# 16. LABOR RATE LIBRARY

Create a Labor Rate Library.

Examples:

```text
Masonry Worker
Steel Fixer
Carpenter
Painter
Electrician
Plumber
Welder
General Worker
Supervisor
Operator
```

Fields:

- Labor Code
- Trade
- Skill Level
- Unit
- Basic Rate
- Overtime Rate
- Productivity
- Location
- Currency
- Effective Date
- Source
- Status

---

# 17. EQUIPMENT RATE LIBRARY

Create Equipment Rate Library.

Examples:

```text
Excavator
Crane
Truck
Concrete Pump
Generator
Compactor
Forklift
Scaffolding Equipment
```

Support:

- Hourly rate
- Daily rate
- Weekly rate
- Monthly rate
- Fuel included/excluded
- Operator included/excluded
- Mobilization
- Demobilization

---

# 18. PROJECT MASTER INTEGRATION

Every historical rate should optionally be linked to a project.

Example:

```text
Project
    ↓
Quotation
    ↓
Material
    ↓
Price
```

Project fields:

- Project Code
- Project Name
- Client
- Location
- Project Category
- Contract Type
- Start Date
- Completion Date
- Status

Do not require Project ID for market quotations that are not project-specific.

---

# 19. COST CODE

Allow rates to be linked to Cost Codes.

Example:

```text
03  Concrete
03.30 Cast-in-Place Concrete
03.30.10 Structural Concrete
```

Also support user-configurable cost coding.

This will later allow:

```text
Material
→ Cost Code
→ BOQ
→ Budget
→ Actual Cost
→ Forecast
```

---

# 20. DOCUMENT MANAGEMENT

Every important commercial record should support document attachments.

Examples:

- Supplier quotation PDF
- Technical datasheet
- Product catalogue
- Certificate
- Test report
- Supplier registration
- Price list
- Purchase order
- Invoice

Each document should contain:

- Document ID
- File Name
- Document Type
- Version
- Upload Date
- Uploaded By
- Related Entity
- Status

Do not store only the filename.

Maintain the relationship between document and business record.

---

# 21. SEARCH ENGINE

Create a powerful global search.

Search should work across:

- Material code
- Material name
- Specification
- Brand
- Supplier
- Supplier product code
- Quotation number
- Project
- Cost code
- Subcontractor
- Trade
- Tags

Example:

```text
Search:
"C30 concrete"
```

Results should include:

```text
Materials
Suppliers
Quotations
Price History
Projects
Documents
```

---

# 22. ADVANCED FILTERS

Filters should include:

### Material

- Category
- Subcategory
- Discipline
- Specification
- Grade
- Brand
- Manufacturer

### Supplier

- Supplier
- Supplier Type
- Rating
- Location

### Price

- Currency
- Minimum Price
- Maximum Price
- Effective Cost
- Date Range

### Project

- Project
- Location
- Project Type
- Contract Type

### Status

- Draft
- Submitted
- Reviewed
- Approved
- Active
- Superseded
- Archived

Filters should be combinable.

---

# 23. DASHBOARD

Create a professional management dashboard.

Display:

```text
TOTAL MATERIALS
5,428

SUPPLIERS
327

QUOTATIONS
1,842

PRICE RECORDS
28,531
```

Additional KPIs:

- New prices this month
- Price increases
- Price decreases
- Most expensive materials
- Most frequently quoted materials
- Most competitive suppliers
- Most volatile materials
- Recently updated rates
- Expired quotations
- Rates requiring verification

---

# 24. PRICE ALERTS

Create optional alerts.

Examples:

```text
STEEL PRICE

Previous:
$680/t

Current:
$745/t

Change:
+9.56%

Alert:
SIGNIFICANT PRICE INCREASE
```

Configurable thresholds:

```text
> 5%
> 10%
> 15%
```

---

# 25. FORECASTING

Create a forecasting framework.

Use historical data to estimate future reference rates.

Example:

```text
Current:
$92/m³

Historical annual trend:
+6%

Forecast:
$97.52/m³
```

Forecast must be clearly labeled:

> FORECAST — NOT ACTUAL MARKET PRICE

Allow methods to be configurable later:

- Moving Average
- Weighted Moving Average
- Linear Trend
- Exponential Smoothing
- Other statistical models

Do not use AI-generated forecasts without showing the underlying data.

---

# 26. BUDGET FORECASTING

Create a future-ready Cost Forecast module.

Example:

```text
BOQ Quantity
350 m³

Current Rate
$92/m³

Forecast Rate
$97.52/m³

Forecast Cost
$34,132
```

Display:

```text
Current Budget
Forecast Cost
Variance
Variance %
```

---

# 27. PDF EXPORT

Every major report must support PDF export.

Required reports:

1. Material Specification Report
2. Supplier Profile
3. Price History Report
4. Supplier Comparison
5. Cost Reference Report
6. Subcontractor Rate Report
7. Labor Rate Report
8. Equipment Rate Report
9. Project Rate Report
10. Cost Forecast Report
11. Management Dashboard Report

PDF must have:

- Company / DCOS header
- Report title
- Filters used
- Date generated
- User
- Data table
- Charts where applicable
- Page number
- Confidentiality label where configured

---

# 28. EXCEL EXPORT

Provide Excel export for analytical use.

Required exports:

```text
Material_Master.xlsx
Supplier_Master.xlsx
Price_History.xlsx
Quotation_Data.xlsx
Supplier_Comparison.xlsx
Subcontractor_Rates.xlsx
Labor_Rates.xlsx
Equipment_Rates.xlsx
Project_Rates.xlsx
Cost_Forecast.xlsx
```

Exports must contain structured data, not screenshots.

---

# 29. EXCEL IMPORT

Also provide controlled Excel import.

Users should be able to upload standardized templates.

Import workflow:

```text
Upload Excel
    ↓
Validate
    ↓
Preview
    ↓
Show Errors
    ↓
Confirm Import
    ↓
Create Records
    ↓
Audit Log
```

Never silently import invalid data.

---

# 30. DATA VALIDATION

Implement validation for:

- Required fields
- Duplicate material codes
- Duplicate supplier codes
- Invalid currencies
- Invalid units
- Negative prices
- Invalid dates
- Expired quotations
- Missing suppliers
- Missing specifications
- Duplicate quotations

Show useful error messages.

---

# 31. UNIT MANAGEMENT

Create a Unit Master.

Examples:

```text
m
m²
m³
kg
ton
piece
set
bag
box
liter
hour
day
month
lump sum
%
```

Do not hard-code units throughout the application.

Use a Unit Master.

---

# 32. CURRENCY MANAGEMENT

Create Currency Master.

Examples:

```text
USD
KHR
EUR
THB
VND
CNY
SGD
```

Store the original transaction currency.

Do not overwrite historical transaction prices simply because exchange rates change.

If currency conversion is used, store:

```text
Original Currency
Original Price
Exchange Rate
Converted Currency
Converted Price
Conversion Date
```

---

# 33. PRICE STATUS

Use controlled status:

```text
DRAFT
SUBMITTED
UNDER_REVIEW
APPROVED
ACTIVE
EXPIRED
SUPERSEDED
ARCHIVED
REJECTED
```

Only approved/active rates should normally be available to official estimation workflows.

---

# 34. WORKFLOW

Recommended workflow:

```text
QS / Procurement Staff
        ↓
Create / Import Record
        ↓
Submit
        ↓
Reviewer
        ↓
Verify
        ↓
Manager Approval
        ↓
ACTIVE RATE
        ↓
Estimation / Costing
```

---

# 35. AUDIT TRAIL

Every important change must be logged.

Audit fields:

- User
- Action
- Entity
- Record ID
- Old Value
- New Value
- Date/Time
- Reason
- IP/session where appropriate

Examples:

```text
User A
Changed price
$92 → $95

Reason:
Updated supplier quotation
```

Historical records must never disappear because somebody edited a current record.

---

# 36. ROLE-BASED ACCESS CONTROL

Implement RBAC.

Suggested roles:

```text
SYSTEM ADMIN
QS STAFF
QS MANAGER
PROCUREMENT
COMMERCIAL MANAGER
PROJECT MANAGER
ENGINEER
FINANCE
VIEWER
```

Example permissions:

| Role | View | Create | Edit | Approve | Export |
|---|---:|---:|---:|---:|---:|
| Engineer | ✓ | ✓ | — | — | ✓ |
| QS Staff | ✓ | ✓ | ✓ | — | ✓ |
| QS Manager | ✓ | ✓ | ✓ | ✓ | ✓ |
| Procurement | ✓ | ✓ | ✓ | — | ✓ |
| Commercial Manager | ✓ | — | — | ✓ | ✓ |
| Finance | ✓ | — | — | — | ✓ |
| Viewer | ✓ | — | — | — | — |

Permissions must be configurable.

---

# 37. SECURITY

The application must use secure cloud architecture.

Implement:

- Authentication
- Authorization
- RBAC
- Secure password/authentication handling
- Session management
- Database security
- Input validation
- File upload validation
- Audit logs
- Row-level access where appropriate
- Protection against SQL injection
- Protection against XSS
- Protection against CSRF where applicable
- Secure API endpoints
- Environment variables for secrets
- No secrets committed to source code

Do not expose database credentials in frontend code.

---

# 38. CLOUD STORAGE

Use cloud storage for supporting documents.

The architecture must allow:

```text
Application
      ↓
Secure API
      ↓
PostgreSQL
      ↓
Object/File Storage
```

Documents should not be stored directly as uncontrolled database blobs unless there is a strong reason.

---

# 39. DATABASE ARCHITECTURE

Use a relational database.

Preferred:

> PostgreSQL

Organize the database logically.

Suggested schemas:

```text
core
organization
project
resource
qs
procurement
commercial
inventory
document
system
```

QS tables may include:

```text
qs_material
qs_material_category
qs_material_specification
qs_material_specification_revision
qs_material_supplier
qs_price_history
qs_rate_reference
qs_subcontractor
qs_subcontractor_rate
qs_labor_rate
qs_equipment_rate
qs_cost_code
qs_rate_analysis
```

Procurement tables:

```text
procurement_supplier
procurement_rfq
procurement_quotation
procurement_quotation_item
```

Document tables:

```text
document
document_version
document_relation
```

System:

```text
audit_log
workflow
notification
```

Use proper primary keys, foreign keys, indexes, unique constraints, timestamps, and soft-delete/archive strategies where appropriate.

---

# 40. DATA RELATIONSHIP

The core relationship should be:

```text
MATERIAL
    │
    ├── SPECIFICATION
    │
    ├── SUPPLIER
    │       │
    │       └── SUPPLIER MATERIAL
    │
    ├── PRICE HISTORY
    │       │
    │       ├── PROJECT
    │       ├── QUOTATION
    │       └── SOURCE DOCUMENT
    │
    └── COST CODE
```

Quotation:

```text
SUPPLIER
    ↓
QUOTATION
    ↓
QUOTATION ITEM
    ↓
MATERIAL
    ↓
PRICE
```

---

# 41. RATE ANALYSIS

Prepare the architecture for future rate analysis.

Example:

```text
Concrete C30/37

Material:
$92/m³

Labor:
$4/m³

Equipment:
$3/m³

Wastage:
2%

Overhead:
5%

Profit:
10%

Final Rate:
Calculated
```

The rate analysis engine should eventually support:

```text
Material
+
Labor
+
Equipment
+
Subcontract
+
Wastage
+
Overhead
+
Profit
=
Final Rate
```

---

# 42. BOQ INTEGRATION

Prepare APIs and database relationships so the Cost & Rate Library can later connect to:

```text
QTO
 ↓
BOQ
 ↓
Resource
 ↓
Rate Library
 ↓
Rate Analysis
 ↓
Estimate
 ↓
Budget
```

Do not tightly couple the MVP to a BOQ module if it has not been implemented yet.

Design clean APIs/interfaces for future integration.

---

# 43. UI/UX REQUIREMENTS

The interface must feel like a professional enterprise construction management application.

Design principles:

- Clean
- Modern
- Professional
- Information-dense but not cluttered
- Desktop-first
- Responsive
- Fast navigation
- Clear hierarchy
- Consistent forms
- Strong filtering
- Strong tables
- Useful charts
- Minimal unnecessary animation

Avoid consumer-style UI.

This is a professional engineering/QS/commercial application.

---

# 44. MAIN NAVIGATION

Use:

```text
Dashboard

Cost & Rate Library
├── Materials
├── Specifications
├── Price History
├── Suppliers
├── Subcontractors
├── Labor Rates
├── Equipment Rates
└── Cost Codes

Quotations
├── RFQ
├── Supplier Quotations
└── Comparison

Quick Costing

Rate Analysis

Forecast

Reports

Documents

Administration
├── Users
├── Roles
├── Units
├── Currencies
├── Categories
└── Audit Log
```

---

# 45. MATERIAL LIST SCREEN

Create a professional data table.

Columns:

```text
Code
Material
Category
Specification
Brand
Unit
Latest Price
Supplier
Last Updated
Status
Actions
```

Actions:

```text
View
Edit
Price History
Compare
Quick Cost
Documents
Export
```

Support:

- Search
- Sort
- Filter
- Pagination
- Column selection
- Saved views
- Export

---

# 46. MATERIAL DETAIL SCREEN

When opening a material:

```text
MATERIAL DETAIL

[Overview]
[Specification]
[Suppliers]
[Price History]
[Quotations]
[Price Trend]
[Documents]
[Audit History]
```

Overview:

```text
Material Code
Material Name
Category
Specification
Brand
Unit
Status
```

Price section:

```text
Latest Price
Average Price
Lowest Price
Highest Price
Trend
```

---

# 47. SUPPLIER DETAIL SCREEN

Tabs:

```text
Overview
Materials
Quotations
Price History
Performance
Documents
Audit
```

Display:

- Supplier rating
- Number of materials
- Number of quotations
- Average competitiveness
- Historical transaction count
- On-time/quality metrics where data exists

Do not fabricate supplier performance data.

---

# 48. QUICK COSTING SCREEN

Make this extremely fast.

User should be able to:

```text
Search Material
↓
Enter Quantity
↓
Select Unit
↓
Select Rate Basis
↓
Calculate
```

Rate basis options:

```text
Latest Approved
Lowest Recent
Average
Median
Selected Supplier
Project Historical
Manual
Forecast
```

Show calculation details.

---

# 49. REPORT BUILDER

Create configurable reports.

Filters:

```text
Date
Project
Material
Category
Supplier
Location
Currency
Status
Cost Code
```

Allow:

```text
Preview
Export PDF
Export Excel
```

---

# 50. SAVED FILTERS / VIEWS

Users should be able to save common searches.

Example:

```text
"My Structural Materials"

Category = Structural
Status = Active
Currency = USD
Location = Cambodia
```

Another:

```text
"2026 Concrete Rates"

Category = Concrete
Date = 2026
```

---

# 51. DASHBOARD CUSTOMIZATION

Allow users to customize dashboard widgets.

Widgets:

- Latest Rates
- Price Increase
- Price Decrease
- Supplier Comparison
- Price Trend
- Recent Quotations
- Expiring Quotations
- Pending Approvals
- Forecast
- Cost Benchmarks

---

# 52. NOTIFICATIONS

Support notifications for:

- Quotation expiring
- Rate requiring approval
- Significant price change
- Import errors
- Approval request
- Document expiry
- Forecast update

---

# 53. API ARCHITECTURE

Create clean REST APIs or equivalent backend services.

Example:

```text
GET    /api/materials
POST   /api/materials
GET    /api/materials/:id
PUT    /api/materials/:id

GET    /api/materials/:id/prices
POST   /api/prices

GET    /api/suppliers
POST   /api/suppliers

GET    /api/quotations
POST   /api/quotations

GET    /api/quotations/compare

GET    /api/price-trends

POST   /api/quick-costing

GET    /api/reports
POST   /api/export/pdf
POST   /api/export/excel
```

Use appropriate HTTP status codes and validation.

---

# 54. TECHNOLOGY

Use a modern web architecture.

Preferred:

```text
Frontend:
React / Next.js / Vite

Backend:
Node.js

Database:
PostgreSQL

Authentication:
Secure authentication provider

Storage:
Cloud object storage

Charts:
Modern charting library

Excel:
XLSX-compatible generation

PDF:
Server-side PDF generation

Deployment:
Cloud-ready
```

Use TypeScript wherever practical.

Keep frontend, backend, database, and business logic clearly separated.

---

# 55. RESPONSIVENESS

Primary target:

```text
Desktop
Laptop
Tablet
Mobile
```

However, prioritize desktop/tablet because this is an enterprise construction application.

---

# 56. PERFORMANCE

Optimize for:

- Large material libraries
- Thousands of suppliers
- Tens of thousands of historical price records
- Large quotation datasets

Use:

- Pagination
- Server-side filtering
- Database indexing
- Lazy loading
- Efficient queries
- Caching where appropriate

Do not load 50,000 records into the browser just to display a table.

---

# 57. SAMPLE SEED DATA

Create realistic demo data.

At minimum:

### Materials

30+ materials.

Include:

```text
Concrete
Cement
Rebar
Structural Steel
Steel Plate
Bolt
Anchor Bolt
Sand
Aggregate
Brick
Block
Tile
Marble
Granite
Paint
Waterproofing
Glass
Aluminum
Gypsum Board
Insulation
Cable
Pipe
Valve
```

### Suppliers

10+ suppliers.

### Quotations

30+ quotations.

### Price History

At least 100 historical price records.

### Subcontractors

10+ subcontractors.

### Labor

20+ labor rates.

### Equipment

15+ equipment rates.

Use realistic but clearly fictional/demo supplier names and prices.

Do not represent demo data as real market data.

---

# 58. DEMO WORKFLOW

The application must demonstrate this workflow:

```text
1. Create Material

C30/37 Concrete

        ↓

2. Create Supplier

Supplier A

        ↓

3. Create Supplier Material

Supplier A → C30/37

        ↓

4. Create Quotation

QT-2026-001

        ↓

5. Add Price

$95/m³

        ↓

6. Add Another Supplier

Supplier B

        ↓

7. Add Price

$92/m³

        ↓

8. Compare

Supplier B cheaper

        ↓

9. Approve Rate

        ↓

10. View Price History

        ↓

11. Quick Costing

350 m³

        ↓

12. Calculate

350 × approved reference rate

        ↓

13. Export PDF

        ↓

14. Export Excel
```

---

# 59. DATA QUALITY PRINCIPLES

The system must follow these principles:

### Principle 1

Never overwrite historical commercial data.

### Principle 2

Every price should have a source.

### Principle 3

Every important record should have an owner.

### Principle 4

Approved rates must be distinguishable from unverified rates.

### Principle 5

Forecasts must be distinguishable from actual market prices.

### Principle 6

Original transaction currency must be preserved.

### Principle 7

Units must be standardized.

### Principle 8

Material identity must be separated from price.

### Principle 9

Supplier identity must be separated from quotation.

### Principle 10

Documents must remain linked to their source records.

---

# 60. IMPORTANT BUSINESS RULE

The system must understand the difference between:

```text
MATERIAL MASTER
```

and:

```text
PRICE TRANSACTION
```

For example:

```text
MAT-CON-001
C30/37 Concrete
```

is a permanent identity.

But:

```text
PRICE-001
$92/m³
Supplier A
September 2026
```

is a historical transaction.

Never create a new material simply because its price changed.

---

# 61. SECOND IMPORTANT BUSINESS RULE

Do not treat suppliers as price records.

Supplier:

```text
SUP-001
ABC Construction Materials
```

is a master entity.

Quotation:

```text
QT-2026-0098
```

is a transaction.

Price:

```text
$92/m³
```

is an item inside that transaction.

Maintain these relationships correctly.

---

# 62. THIRD IMPORTANT BUSINESS RULE

The system must preserve historical truth.

If:

```text
2025 = $80/m³
2026 = $92/m³
```

and the user updates the current price to:

```text
$97/m³
```

the system must retain:

```text
2025 = $80
2026 = $92
2026-09 = $97
```

Do not replace the old values.

---

# 63. REPORTING

Provide management reports:

### Material Price Report

```text
Material
Latest
Average
Lowest
Highest
Trend
```

### Supplier Comparison

```text
Supplier
Quoted Price
Effective Cost
Lead Time
Terms
Rating
```

### Price Trend

```text
Month
Price
Change %
```

### Cost Forecast

```text
Current
Forecast
Variance
Variance %
```

### Procurement Intelligence

```text
Most Used Supplier
Lowest Average Supplier
Most Competitive Supplier
Most Volatile Material
```

---

# 64. FUTURE AI FEATURES

Design the architecture so AI can later answer:

```text
"What is the latest approved price for C30/37 concrete?"

"Which supplier has historically provided the lowest effective cost?"

"What was our average rebar price during 2025?"

"How much did cement prices increase?"

"What rate should I use for preliminary costing?"

"Show me similar historical projects."

"Compare current supplier quotations against historical prices."

"Identify unusual price increases."

"Forecast next year's reference price."
```

But do not implement AI before the underlying structured data is reliable.

---

# 65. FUTURE DCOS INTEGRATION

The module must be designed to integrate later with:

```text
PROJECT
    ↓
WBS
    ↓
QTO
    ↓
BOQ
    ↓
COST CODE
    ↓
RESOURCE
    ↓
RATE LIBRARY
    ↓
ESTIMATION
    ↓
BUDGET
    ↓
PROCUREMENT
    ↓
PURCHASE
    ↓
INVENTORY
    ↓
ACTUAL COST
    ↓
FORECAST
```

The Cost & Rate Library should become the reusable pricing foundation of DCOS.

---

# 66. MVP PRIORITY

Do NOT attempt to implement everything simultaneously.

Build in this order:

## PHASE 1 — FOUNDATION

1. Authentication
2. Database
3. RBAC
4. Material Master
5. Supplier Master
6. Unit Master
7. Currency Master

## PHASE 2 — COST LIBRARY

8. Material Specification
9. Supplier Material
10. Price History
11. Document Upload
12. Search
13. Filters

## PHASE 3 — PROCUREMENT

14. Quotation
15. Quotation Items
16. Supplier Comparison
17. Approval Workflow

## PHASE 4 — ANALYTICS

18. Price Trends
19. Dashboard
20. Rate Confidence
21. Price Alerts

## PHASE 5 — REPORTING

22. PDF Export
23. Excel Export
24. Excel Import
25. Report Builder

## PHASE 6 — COSTING

26. Quick Costing
27. Subcontractor Rates
28. Labor Rates
29. Equipment Rates
30. Rate Analysis

## PHASE 7 — FORECASTING

31. Cost Forecast
32. Budget Forecast
33. Historical Benchmarking

## PHASE 8 — DCOS INTEGRATION

34. QTO
35. BOQ
36. Project Budget
37. Procurement
38. Inventory
39. Actual Cost

---

# 67. DEVELOPMENT METHOD

Do not generate a huge amount of disconnected code in one response.

Work incrementally.

For each phase:

1. Explain architecture briefly.
2. Create database schema.
3. Create backend APIs.
4. Create frontend pages.
5. Create components.
6. Create seed data.
7. Test functionality.
8. Fix errors.
9. Verify relationships.
10. Continue to the next phase.

Maintain consistency across all phases.

Do not rewrite working modules unnecessarily.

---

# 68. CODE QUALITY

Use:

- TypeScript
- Strong typing
- Reusable components
- Modular architecture
- Clean naming
- Environment configuration
- Error handling
- Logging
- Validation
- Database migrations
- API validation
- Unit tests where practical
- Integration tests for important workflows

Avoid:

- Hard-coded business data
- Duplicate logic
- Giant components
- Giant files
- Inline credentials
- Uncontrolled database queries
- Fake APIs
- Placeholder functionality presented as completed

---

# 69. ERROR HANDLING

Every API should handle:

- Validation errors
- Authentication errors
- Authorization errors
- Not found
- Duplicate records
- Database errors
- File upload errors
- Import errors

Return useful messages.

Example:

```text
Unable to create material.

Material code MAT-CON-001 already exists.
```

---

# 70. EMPTY STATES

Every page must have a useful empty state.

Example:

```text
No price history found.

Add a supplier quotation or import historical price data
to begin building the price history.
```

Do not show blank screens.

---

# 71. LOADING STATES

Use proper:

- Loading indicators
- Skeletons
- Disabled buttons during submission
- Upload progress
- Export progress where necessary

---

# 72. CONFIRMATION

For destructive actions:

```text
Delete / Archive Material?

This will archive the material and preserve historical
price records.

[Cancel]
[Archive]
```

Never silently delete commercial history.

---

# 73. DESIGN LANGUAGE

Use a professional enterprise design system.

Suggested visual hierarchy:

```text
Top Navigation
Side Navigation
Page Header
KPI Cards
Filter Bar
Data Table
Detail Drawer / Page
Charts
Activity / Audit
```

Use consistent:

- Typography
- Spacing
- Buttons
- Status badges
- Forms
- Tables
- Modal dialogs
- Toast notifications

Avoid excessive rounded cards and decorative UI.

The interface should feel like a serious engineering/commercial system.

---

# 74. ACCESSIBILITY

Support:

- Keyboard navigation
- Clear labels
- Accessible forms
- Readable contrast
- Tooltips where necessary
- Screen-reader-friendly controls
- Logical tab order

---

# 75. SECURITY OF COMMERCIAL DATA

Treat pricing and supplier data as commercially sensitive.

Implement:

- Role-based visibility
- Audit trail
- Secure storage
- Controlled exports
- Permission checks on API level
- Permission checks on frontend level
- Document access control

Frontend hiding alone is NOT security.

---

# 76. FINAL ACCEPTANCE CRITERIA

The application is considered functional when a user can complete this full scenario:

```text
Create material
        ↓
Create specification
        ↓
Create supplier
        ↓
Link supplier to material
        ↓
Create supplier quotation
        ↓
Record price
        ↓
Upload quotation PDF
        ↓
Submit for approval
        ↓
Approve price
        ↓
Create second supplier quotation
        ↓
Compare suppliers
        ↓
View historical price
        ↓
View price trend
        ↓
Calculate quick costing
        ↓
Export PDF
        ↓
Export Excel
```

All information must remain connected.

---

# 77. MOST IMPORTANT ARCHITECTURAL PRINCIPLE

The application is not merely:

```text
Material Database
```

It is:

```text
CONSTRUCTION COST KNOWLEDGE SYSTEM
```

The central relationship is:

```text
Material
   +
Specification
   +
Supplier
   +
Quotation
   +
Price
   +
Project
   +
Date
   +
Document
   +
Cost Code
   +
Historical Data
        ↓
CONSTRUCTION COST INTELLIGENCE
        ↓
ESTIMATION
        ↓
BUDGET
        ↓
FORECAST
```

Build the system around this principle.

---

# 78. FIRST IMPLEMENTATION TASK

Start by producing:

## A. System Architecture

Show:

- Frontend
- Backend
- Database
- Storage
- Authentication
- APIs
- Reporting
- Analytics

## B. Database ERD

Show all major tables and relationships.

## C. Folder Structure

Provide the complete project folder structure.

## D. Database Schema

Create the initial migration/schema.

## E. UI Sitemap

Show all screens.

## F. MVP Dashboard

Build the first dashboard.

## G. Material Master

Build the first complete CRUD module.

## H. Supplier Master

Build the first complete CRUD module.

## I. Price History

Build the first complete price recording system.

Then continue phase by phase.

---

# 79. DO NOT DO THESE THINGS

Do not:

- Build everything as one giant component.
- Store all information in one table.
- Overwrite historical prices.
- Store suppliers as plain text inside price records.
- Store material specifications only as free text.
- Hard-code currencies.
- Hard-code units.
- Delete historical commercial records.
- Treat forecast values as actual prices.
- Expose database credentials.
- Create fake supplier performance data.
- Create fake market prices and present them as real.
- Build AI forecasting before historical data exists.
- Build a decorative dashboard without functional underlying data.
- Use local browser storage as the primary database.
- Depend on manual Excel files as the system of record.

---

# 80. SUCCESS DEFINITION

The final system should allow a QS, procurement officer, commercial manager, project manager, or estimator to answer questions such as:

> "What is the latest approved price for this material?"

> "What did we pay for it last year?"

> "Which supplier is normally cheapest?"

> "What is the effective cost after delivery?"

> "How has this price changed over the last three years?"

> "What rate did Project A use?"

> "What rate should I use for preliminary costing?"

> "How reliable is this reference rate?"

> "Can I compare three supplier quotations?"

> "Can I export the analysis to Excel?"

> "Can I produce a professional PDF report?"

> "Can I trace this price back to the original quotation?"

If the answer to these questions is yes, the Cost & Rate Library is doing its job.

---

# 81. FINAL PRODUCT VISION

The long-term DCOS structure should become:

```text
                         DCOS
                          │
          ┌───────────────┼────────────────┐
          │               │                │
        PROJECT           QS          PROCUREMENT
          │               │                │
          │         COST & RATE            │
          │           LIBRARY              │
          │               │                │
          │       ┌───────┼────────┐       │
          │       │       │        │       │
          │   MATERIAL  LABOR   EQUIPMENT  │
          │       │       │        │       │
          │       └───────┼────────┘       │
          │               │                │
          └───────────────┼────────────────┘
                          │
                    RATE ANALYSIS
                          │
                         BOQ
                          │
                       ESTIMATE
                          │
                        BUDGET
                          │
                       FORECAST
                          │
                     ACTUAL COST
```

The objective is to establish a **single, controlled, reusable construction cost reference system** that becomes more valuable every time DCOS records another quotation, purchase, project rate, subcontract rate, labor rate, or equipment rate.

Build it for long-term scalability, not just the first demo.

---

# 82. EXECUTION INSTRUCTION

Now begin implementation.

Do not only explain what should be built.

**Build the application.**

Start with:

1. Architecture
2. Database schema
3. Project structure
4. Authentication/RBAC foundation
5. Dashboard shell
6. Material Master
7. Supplier Master
8. Price History
9. Search and filters
10. Seed/demo data

After completing each major phase, verify that the application still runs correctly before continuing.

When something is ambiguous, choose a sensible enterprise construction-management implementation and document the assumption rather than stopping the implementation.

Prioritize:

> **Data integrity → Security → Business logic → Usability → Analytics → Visual polish.**

The system must be designed so that future DCOS modules can reuse the same master data instead of creating duplicate Material, Supplier, Project, Unit, Currency, and Cost Code records.