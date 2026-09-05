# MASTER PROMPT FOR CLAUDE AI

## DCOS-MDM-CAT-001 — DCOS Master Data Catalogue

### ROLE

Act as a **Senior Enterprise Architect, Construction ERP Architect, Master Data Management (MDM) Architect, Construction Management Systems Architect, and Data Governance Specialist** with extensive experience designing enterprise systems for construction and real-estate companies.

You are responsible for creating a professional, structured, implementation-ready document for the DCOS platform.

---

# DOCUMENT TO CREATE

**Document ID:** DCOS-MDM-CAT-001  
**Document Title:** DCOS Master Data Catalogue  
**Document Type:** Enterprise Master Data Catalogue  
**Document Status:** Draft for Standardization  
**Parent Standard:** DCOS-MDM-STD-001 — DCOS Enterprise Master Data Standard

---

# 1. DCOS SYSTEM CONTEXT

DCOS is an integrated **Construction ERP & Operations Management Platform** designed to manage the complete lifecycle of construction and real-estate projects.

DCOS is intended to integrate:

- Company / Organization Management
- Project Management
- Project Breakdown / WBS
- Planning & Scheduling
- Design Management
- BIM Coordination
- Quantity Surveying
- Estimation
- BOQ Management
- Procurement
- Supplier Management
- Subcontractor Management
- Construction Operations
- Material Management
- Stock / Inventory
- Warehouse Management
- QA/QC
- HSE
- Document Control
- Equipment Management
- HR / Workforce
- Payroll
- Accounting & Finance
- Cost Control
- Contract Management
- Claims & Disputes
- Commissioning
- Handover
- Defects Liability Period (DLP)

The DCOS platform must operate using a **centralized and standardized master-data model**.

---

# 2. PURPOSE OF THIS DOCUMENT

Create the official **DCOS Master Data Catalogue**.

The purpose of this document is to define:

> **WHAT master data exists within DCOS.**

The catalogue shall establish the official list of master-data domains and master-data entities that the DCOS platform recognizes and controls.

The catalogue shall provide a common enterprise reference for:

- Management
- Project Management
- Engineering
- Design
- BIM
- QS
- Procurement
- Construction
- Warehouse
- QA/QC
- HSE
- HR
- Finance
- IT
- Developers
- Database architects
- Data administrators
- System administrators
- Auditors

---

# 3. IMPORTANT SCOPE RULE

Do NOT turn this document into a detailed database specification.

This document is a **Master Data Catalogue**, not a Data Dictionary.

Therefore:

### This document SHALL define:

- Master Data Domain
- Master Data Entity
- Entity Code
- Entity Name
- Definition
- Purpose
- Business Owner / Responsible Function
- Primary DCOS Modules
- High-level relationships
- Classification as Enterprise / Project / Transaction-supporting master data
- Whether the entity is mandatory or optional at enterprise level
- General notes

### This document SHALL NOT fully define:

- Every database column
- SQL table structures
- Detailed data types
- API endpoints
- UI screen designs
- Detailed validation rules
- Detailed approval workflows
- Individual material codes
- Individual supplier records
- Individual employee records
- Detailed pricing
- Detailed WBS coding structures

Those items will be governed by other DCOS standards/specifications.

---

# 4. CORE PRINCIPLE

Use this fundamental principle:

> **One business entity = One controlled master-data definition = One authoritative source.**

For example:

A Supplier must not be independently created in:

- Procurement
- QS
- Warehouse
- Finance
- Subcontractor Management

Instead, DCOS shall have one authoritative **Supplier Master**, which is reused by those modules.

Likewise:

- One Project Master
- One WBS Master
- One Material Master
- One Employee Master
- One Equipment Master
- One Customer Master
- One Supplier Master
- One Subcontractor Master

etc.

---

# 5. MASTER DATA CLASSIFICATION

Define a clear high-level classification system.

At minimum, classify master data into:

### A. Enterprise Master Data

Data shared across the organization.

Examples:

- Company
- Business Unit
- Department
- Employee
- Supplier
- Customer
- Material
- Equipment

### B. Project Master Data

Data created or controlled at project level.

Examples:

- Project
- Project Phase
- WBS
- Building
- Level
- Zone
- Location
- Project Cost Code

### C. Resource Master Data

Resources used to execute projects.

Examples:

- Material
- Labor
- Equipment
- Plant
- Tools
- Resource Group

### D. Commercial / Cost Master Data

Data used to control commercial and project cost structures.

Examples:

- Cost Code
- BOQ Structure
- Work Category
- Contract Type
- Cost Category
- Revenue Category

### E. Organizational Master Data

Examples:

- Company
- Branch
- Business Unit
- Department
- Team
- Position
- Role

### F. Reference / Classification Data

Clearly distinguish reference data from core master data.

Examples may include:

- Country
- Province
- District
- Currency
- Unit of Measure
- Trade
- Discipline
- Project Type
- Building Type
- Material Category

Explain the difference between:

**Master Data** vs **Reference Data**.

Do not incorrectly classify every dropdown list as master data.

---

# 6. MASTER DATA DOMAIN STRUCTURE

Develop a logical domain structure for DCOS.

At minimum consider:

1. Organization
2. Project
3. WBS / Project Structure
4. Location
5. Commercial
6. Cost
7. QS / BOQ
8. Resource
9. Material
10. Supplier
11. Subcontractor
12. Customer / Client
13. Employee / Workforce
14. Equipment
15. Design / Engineering
16. BIM
17. Procurement
18. Inventory / Warehouse
19. QA/QC
20. HSE
21. Document
22. Finance
23. HR
24. Contract
25. Commissioning / Handover
26. Reference Data

Do NOT automatically create a separate master-data entity for every DCOS module.

Determine whether an item should be:

- Master Data
- Reference Data
- Transaction Data
- Configuration Data
- Metadata

and explain the classification.

---

# 7. MASTER DATA CATALOGUE

Create the primary catalogue as a professional table.

Use the following columns:

| Field | Description |
|---|---|
| Domain Code | Unique domain identifier |
| Domain Name | Master-data domain |
| Entity Code | Unique master-data entity code |
| Entity Name | Official entity name |
| Definition | Short business definition |
| Purpose | Why the entity exists |
| Scope | Enterprise / Project / Both |
| Primary Owner | Responsible business function |
| Main Users | Main users/functions |
| Primary DCOS Modules | Modules consuming the entity |
| Key Relationships | Major related master entities |
| Classification | Master / Reference / Configuration |
| Mandatory | Yes / No / Conditional |
| Status | Proposed / Approved / Retired |
| Notes | Important high-level notes |

Keep definitions concise but professional.

---

# 8. IDENTIFICATION AND CODING

Create a logical naming and identification approach for catalogue entities.

Example:

```text
ORG
PRJ
WBS
LOC
MAT
SUP
SUB
CUS
EMP
EQP
BOQ
CST
DOC
CON
```

Then define entity identifiers such as:

```text
MDM-ORG
MDM-PRJ
MDM-WBS
MDM-MAT
MDM-SUP
MDM-EMP
MDM-EQP
MDM-BOQ
```

Do not create thousands of individual business codes.

The purpose is to establish the **catalogue-level entity identification system**.

---

# 9. RECOMMENDED CORE MASTER DATA

Evaluate and catalogue the following entities.

Do not blindly accept the list. Improve it where necessary.

## Organization

- Company
- Branch
- Business Unit
- Department
- Division
- Team
- Position
- Organization Role

## Project

- Project
- Project Type
- Project Category
- Project Phase
- Project Status
- Project Client
- Project Location
- Project Organization

## WBS / Project Structure

- WBS
- Building
- Block
- Level
- Zone
- Area
- Room
- Work Package
- Cost Code
- Activity Classification

## Location

- Country
- Province
- District
- Site
- Site Area
- Building
- Level
- Zone
- Room
- Warehouse
- Storage Location

Avoid duplicate entities where one entity can serve multiple purposes.

## Material

- Material
- Material Category
- Material Group
- Material Type
- Material Specification
- Material Brand
- Material Grade
- Material Family

Clearly distinguish between:

**Material Master**

and

**Material Transaction**.

For example:

Material Master:

> Cement — Portland Cement — 42.5N

Transaction:

> 100 bags received on 04 September 2026.

## Supplier

- Supplier
- Supplier Category
- Supplier Type
- Supplier Classification
- Supplier Contact

## Subcontractor

- Subcontractor
- Trade Contractor
- Subcontractor Category
- Subcontractor Classification

Explain whether Supplier and Subcontractor should be separate entities or specialized parties under a common **Business Partner / Party Master**.

Make a professional architectural recommendation.

## Customer / Client

- Customer
- Client
- Owner
- Developer
- Consultant

Determine whether these should be separate entities or roles of a common party/business-partner structure.

## Employee / Workforce

- Employee
- Worker
- Position
- Job Title
- Skill
- Trade
- Certification
- Organization Assignment

Do not mix Employee Master with Employee Transactions such as attendance or payroll transactions.

## Equipment

- Equipment
- Equipment Category
- Equipment Type
- Equipment Class
- Equipment Manufacturer
- Equipment Model

Clearly distinguish Equipment Master from:

- Equipment utilization
- Equipment maintenance
- Equipment rental transactions
- Equipment movement

## QS / Cost

- BOQ
- BOQ Item
- Cost Code
- Cost Category
- Work Category
- Rate Category
- Resource Category
- Cost Type

Explain which are true master data and which are transactional structures.

## Procurement

- Procurement Category
- Procurement Method
- Purchase Type
- Supplier
- Material
- Contract Type
- Payment Term
- Delivery Term

Identify which items are master/reference data.

## Inventory

- Material
- Warehouse
- Storage Location
- Stock Category
- Stock Classification
- Unit of Measure

## Design / Engineering

- Discipline
- Design Package
- Drawing Type
- Drawing Classification
- Engineering System
- Element Classification

## BIM

Consider:

- BIM Discipline
- BIM Category
- BIM Element Classification
- Model Type
- Model Zone
- BIM Object Classification
- Level of Information
- Model Status

Do not overcomplicate BIM master data. Identify only what should truly be controlled centrally.

## QA/QC

Consider:

- Inspection Type
- Test Type
- Quality Category
- Defect Category
- Inspection Classification
- Acceptance Criteria Category

Clearly distinguish master/reference data from inspection transactions.

## HSE

Consider:

- Hazard Category
- Risk Category
- Incident Category
- PPE Category
- Safety Inspection Type
- Permit Type

## Document

Consider:

- Document Type
- Document Category
- Document Discipline
- Document Status
- Revision Type
- Confidentiality Classification

Clearly distinguish Document Master / Document Metadata from actual document transactions/files.

## Finance

Consider:

- Account
- Account Category
- Cost Centre
- Profit Centre
- Currency
- Tax Type
- Payment Term

Evaluate which should be controlled by Finance and which should come from an accounting system.

## Contract

Consider:

- Contract
- Contract Type
- Contract Category
- Payment Term
- Retention Type
- Contract Party
- Claim Category

Clearly distinguish Contract Master from contract transactions.

## Handover / DLP

Consider:

- Handover Package
- Asset
- Defect Category
- Warranty Type
- DLP Category

Determine which should be master data versus transaction data.

---

# 10. MASTER DATA RELATIONSHIPS

Create a high-level relationship model.

Show how the most important master entities connect.

At minimum illustrate:

```text
Organization
      │
      ▼
Project
      │
      ▼
WBS
      │
      ├──── Building
      ├──── Level
      ├──── Zone
      └──── Room
      │
      ▼
Cost Code
      │
      ├──── BOQ
      ├──── Material
      ├──── Labor
      └──── Equipment
```

And:

```text
Supplier ───── Material
    │              │
    ▼              ▼
Procurement ─── Inventory
                    │
                    ▼
                 Project
                    │
                    ▼
                Cost Control
                    │
                    ▼
                 Finance
```

Create a high-level Mermaid diagram showing the major relationships.

Do not create a detailed database ERD.

---

# 11. DCOS MODULE CONSUMPTION

Create a matrix showing which DCOS modules use which master data.

Example:

| Master Data | Planning | QS | Procurement | Inventory | Construction | Finance |
|---|---:|---:|---:|---:|---:|---:|
| Project | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| WBS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Material |  | ✓ | ✓ | ✓ | ✓ | ✓ |
| Supplier |  |  | ✓ | ✓ | ✓ | ✓ |
| Equipment | ✓ | ✓ |  |  | ✓ | ✓ |
| Employee | ✓ |  |  |  | ✓ | ✓ |

Expand this into a complete high-level DCOS Master Data ↔ Module Matrix.

---

# 12. MASTER DATA OWNERSHIP

At catalogue level, identify the responsible business function.

Examples:

| Domain | Typical Owner |
|---|---|
| Organization | Corporate / HR |
| Project | Project Management |
| WBS | Planning / Project Controls |
| Material | Procurement / QS |
| Supplier | Procurement |
| Employee | HR |
| Equipment | Equipment / Operations |
| Cost Code | Finance / Project Controls |
| BOQ | QS |
| Document | Document Control |
| Finance | Finance |
| BIM Classification | BIM / Engineering |

Do not create a detailed RACI in this document.

Only identify the **primary ownership function**.

---

# 13. ENTERPRISE VS PROJECT MASTER DATA

Clearly explain which master data is:

### Enterprise-wide

Example:

```text
Material
Supplier
Employee
Equipment
Company
Department
Currency
UOM
```

### Project-specific

Example:

```text
Project
WBS
Building
Level
Zone
BOQ
Project Cost Code
Project Location
```

### Shared / Hybrid

Example:

```text
Material
Supplier
Equipment
Employee
Cost Code
```

Explain how global master records can be reused by projects while project-specific attributes remain controlled at project level.

---

# 14. MASTER DATA HIERARCHY

Define the logical hierarchy of master data.

For example:

```text
ENTERPRISE
│
├── Organization
│
├── Resources
│   ├── Employee
│   ├── Equipment
│   ├── Material
│   └── Supplier
│
└── Projects
    │
    └── Project
        │
        ├── WBS
        │   ├── Building
        │   ├── Level
        │   ├── Zone
        │   └── Room
        │
        ├── BOQ
        ├── Cost Structure
        └── Project Controls
```

Improve the structure if a better enterprise architecture exists.

---

# 15. MASTER DATA VS TRANSACTION DATA

Include a clear explanation with construction examples.

### Master Data

Relatively stable business entities:

> Material, Supplier, Employee, Equipment, Project, WBS.

### Transaction Data

Business events:

> Purchase Order, Material Receipt, Material Issue, Invoice, Payment, Timesheet, Inspection, NCR, RFQ.

Explain that transactions reference master data and SHALL NOT recreate master entities.

Example:

```text
Material Master
       ↓
Purchase Request
       ↓
Purchase Order
       ↓
Goods Receipt
       ↓
Inventory
       ↓
Material Issue
       ↓
Project Cost
```

---

# 16. MASTER DATA VS REFERENCE DATA

Provide clear examples.

For example:

**Material** = Master Data

**Unit of Measure** = Reference Data

**Supplier** = Master Data

**Currency** = Reference Data

**Project** = Master Data

**Project Status values** = Reference Data

Explain the reasoning.

---

# 17. DUPLICATION CONTROL

The catalogue shall support the principle that the same business entity should not be independently maintained by different modules.

Example:

BAD:

```text
Procurement Supplier
QS Supplier
Finance Supplier
Warehouse Supplier
```

GOOD:

```text
             Supplier Master
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
   Procurement    QS       Finance
```

Include high-level rules for preventing duplicate master-data domains.

---

# 18. MASTER DATA SYSTEM OF RECORD

For each major domain, identify the authoritative DCOS master.

Example:

| Domain | System of Record |
|---|---|
| Project | DCOS Project Master |
| WBS | DCOS WBS Master |
| Material | DCOS Material Master |
| Supplier | DCOS Supplier Master |
| Employee | DCOS Employee Master / HR |
| Equipment | DCOS Equipment Master |
| Cost Code | DCOS Cost Master |
| BOQ | DCOS QS / BOQ Master |

Where integration with external ERP/accounting/HR systems may exist, explain that the **System of Record must be explicitly defined**.

Do not assume DCOS owns every enterprise master if an external corporate ERP is the authoritative system.

---

# 19. MASTER DATA LIFECYCLE — HIGH LEVEL

Only provide the high-level lifecycle.

For example:

```text
Proposed
   ↓
Created
   ↓
Reviewed
   ↓
Approved
   ↓
Active
   ↓
Inactive
   ↓
Retired
```

Do not provide detailed workflow procedures.

---

# 20. MASTER DATA CATALOGUE GOVERNANCE

Define rules for maintaining this catalogue.

The catalogue itself SHALL be controlled.

Define:

- Catalogue owner
- Review frequency
- Change request
- New entity creation
- Entity retirement
- Duplicate entity prevention
- Version control
- Approval
- Change history

---

# 21. NEW MASTER DATA ENTITY REQUEST

Define a high-level process for adding a new master-data entity.

Example:

```text
Business Need
      ↓
Entity Assessment
      ↓
Master / Transaction / Reference Classification
      ↓
Duplicate Check
      ↓
Domain Owner Review
      ↓
MDM Governance Approval
      ↓
Catalogue Update
      ↓
Implementation
```

The key question SHALL be:

> **Does this need to become a new master-data entity, or can an existing entity/classification satisfy the requirement?**

---

# 22. MASTER DATA ANTI-PATTERNS

Include a concise list of prohibited or discouraged patterns.

Examples:

- Duplicate master entities across modules
- Free-text supplier names
- Free-text material names where a master exists
- Multiple codes for the same entity
- Module-specific copies of enterprise master data
- Hard deletion of active master records
- Uncontrolled creation of master records
- Creating transaction data as master data
- Creating every dropdown as a master entity
- Project teams independently creating corporate master entities without governance

---

# 23. CATALOGUE QUALITY REQUIREMENTS

Define quality requirements for the catalogue itself.

Each catalogue entry should have:

- Unique Entity Code
- Unique Entity Name
- Clear Definition
- Clear Business Purpose
- Clear Owner
- Clear Scope
- Clear Classification
- Clear Module Usage
- Clear Major Relationships
- Clear Status

---

# 24. FINAL MASTER DATA CATALOGUE

Create a consolidated master table containing all approved/proposed master-data entities.

Organize it by domain.

Use a professional format such as:

```text
DOMAIN
│
├── ENTITY
│   ├── Code
│   ├── Name
│   ├── Definition
│   ├── Owner
│   ├── Scope
│   └── Modules
```

The catalogue should be comprehensive enough to cover the major DCOS platform requirements, but avoid unnecessary entities.

Use architectural judgment.

---

# 25. REQUIRED SUMMARY TABLES

At the end of the document provide:

### Table A — Master Data Domain Summary

| Domain | No. of Entities | Primary Owner | Scope |
|---|---:|---|---|

### Table B — Core Enterprise Master Data

List the most important enterprise-wide entities.

### Table C — Core Project Master Data

List the most important project-level entities.

### Table D — Master Data by DCOS Module

Show which modules consume which master data.

### Table E — System of Record

Show the authoritative owner/system for major master-data domains.

### Table F — Master vs Reference vs Transaction

Clearly classify the major DCOS data objects.

---

# 26. MASTER DATA ARCHITECTURE PRINCIPLES

Conclude the catalogue with the following architectural principles:

1. Single Source of Truth
2. One Entity — One Master
3. Unique Identification
4. Controlled Ownership
5. Reusable Across Modules
6. No Uncontrolled Duplication
7. Clear System of Record
8. Controlled Lifecycle
9. Traceability
10. Data Quality
11. Enterprise Reusability
12. Project-Level Flexibility
13. Integration Readiness
14. Auditability

---

# 27. DOCUMENT STRUCTURE

Produce the final document using this structure:

```text
DCOS-MDM-CAT-001
DCOS Master Data Catalogue

DOCUMENT CONTROL

1. Introduction
2. Purpose
3. Scope
4. Relationship to DCOS-MDM-STD-001
5. Master Data Classification
6. DCOS Master Data Architecture
7. Master Data Domains
8. Master Data Catalogue
9. Master Data Hierarchy
10. Master Data Relationships
11. Enterprise vs Project Master Data
12. Master Data Ownership
13. DCOS Module Consumption
14. System of Record
15. Master Data vs Transaction Data
16. Master Data vs Reference Data
17. Master Data Lifecycle
18. Catalogue Governance
19. New Master Data Entity Process
20. Duplication Control
21. Anti-Patterns
22. Catalogue Quality Requirements
23. Master Data Summary
24. Architecture Principles
25. Appendices
```

---

# 28. WRITING REQUIREMENTS

Write this as a **professional enterprise standard/catalogue**, not as an AI explanation.

Use:

- Formal business language
- Construction-industry terminology
- Enterprise architecture terminology
- Clear tables
- Consistent terminology
- Numbered headings
- Professional definitions
- Concise explanations

Use the following normative terminology where applicable:

- **SHALL** = mandatory
- **SHOULD** = recommended
- **MAY** = optional

Avoid unnecessary academic theory.

Avoid excessive narrative.

Prioritize:

**clarity → structure → consistency → practical implementation.**

---

# 29. IMPORTANT ARCHITECTURAL JUDGMENT

Do not simply copy the entity lists provided in this prompt.

Review every proposed entity and determine whether it is genuinely:

- Master Data
- Reference Data
- Transaction Data
- Configuration Data
- Metadata

Where appropriate, consolidate entities.

For example, evaluate whether:

```text
Supplier
Subcontractor
Client
Consultant
Customer
```

should be independent master entities or different roles/types of a common:

```text
Business Partner / Party Master
```

Likewise evaluate:

```text
Employee
Worker
Person
Contact
```

and:

```text
Building
Block
Facility
Asset
Location
```

Make the architecture scalable and avoid unnecessary duplication.

---

# 30. CONSTRUCTION-SPECIFIC REQUIREMENT

The catalogue must be designed specifically for a **construction enterprise**, not a generic manufacturing ERP.

Ensure it supports:

- Multiple projects
- Multiple buildings
- Multiple levels
- WBS
- BOQ
- Cost control
- Materials
- Suppliers
- Subcontractors
- Workforce
- Equipment
- Construction activities
- Design disciplines
- BIM
- QA/QC
- HSE
- Procurement
- Inventory
- Contracts
- Documents
- Finance
- Project handover

The architecture must support both:

**Corporate / Enterprise Level**

and

**Project / Site Level**.

---

# 31. EXPECTED FINAL OUTPUT

Produce a complete **DCOS-MDM-CAT-001 — DCOS Master Data Catalogue** document.

The final result must allow DCOS management and technical teams to answer:

> **What master data exists in DCOS?**

> **What domain does each entity belong to?**

> **Who owns it?**

> **Is it enterprise-level or project-level?**

> **Which modules use it?**

> **What other master data does it relate to?**

> **Is it Master Data, Reference Data, or Transaction Data?**

> **Which system is the authoritative System of Record?**

> **How is duplication prevented?**

Do not go deeper into database columns, SQL implementation, API specifications, or detailed workflows.

Those belong to later DCOS documentation.

---

# 32. FINAL QUALITY CHECK

Before completing the document, perform an internal architecture review.

Check that:

- Every major DCOS business area is represented.
- Master Data is not confused with Transaction Data.
- Master Data is not confused with Reference Data.
- Duplicate entities have been identified.
- Enterprise and project-level data are clearly distinguished.
- Ownership is clear.
- System of Record is clear.
- Major module dependencies are identified.
- The catalogue is scalable for future DCOS modules.
- The catalogue does not unnecessarily become a database specification.
- The document is consistent with **DCOS-MDM-STD-001**.
- Entity naming is consistent.
- Entity codes are unique.
- The architecture supports multi-company and multi-project environments.
- The catalogue can later become the foundation for **DCOS-MDM-DIC-001 — Master Data Dictionary**.

End the document with:

**END OF DCOS-MDM-CAT-001**