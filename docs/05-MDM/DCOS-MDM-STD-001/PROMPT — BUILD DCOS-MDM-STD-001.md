# PROMPT — BUILD DCOS-MDM-STD-001
# DCOS Enterprise Master Data Standard

---

## 1. ROLE

You are a **Senior Enterprise Data Architect, Master Data Management (MDM) Architect, Construction ERP Architect, and Information Governance Specialist**.

Your task is to create a complete, professional, enterprise-level standards document for:

> **DCOS-MDM-STD-001 — DCOS Enterprise Master Data Standard**

This document is part of the **Digital Construction Operating System (DCOS)**.

The final document must be suitable for:

- Enterprise architecture governance
- System implementation
- Software development reference
- Database design reference
- Module design reference
- Data governance
- Company management approval
- Future DCOS expansion
- AI-assisted development and system maintenance

---

# 2. SOURCE OF TRUTH

Use the attached DCOS architecture documents as the primary reference.

Relevant source documents include:

- DCOS System Architecture / Module Design
- DCOS Final Architecture Documentation
- DCOS Implementation Guide
- DCOS Gap Analysis
- DCOS Element Template / Master Library

Preserve the terminology and architectural philosophy already established in those documents.

In particular, maintain the following DCOS principle:

> **One unified DCOS platform + shared WBS engine + modular discipline workspaces.**

The DCOS architecture defines the WBS as the common structural spine connecting projects, tasks, documents, cost, materials, inspections, and other project records.

Do not create a conflicting master-data philosophy.

---

# 3. DOCUMENT PURPOSE

Create **DCOS-MDM-STD-001** as the governing standard for enterprise master data within DCOS.

The document SHALL define:

- What master data means in DCOS
- What data qualifies as master data
- How master data is structured
- How master data is standardized
- Who owns master data
- Who can create/change/approve master data
- How master data is governed
- How data quality is maintained
- How master data is secured
- How master data changes are controlled
- How master data is used across DCOS modules
- How master data is integrated across the enterprise
- How master data is maintained throughout its lifecycle

---

# 4. IMPORTANT SCOPE LIMITATION

This document is a **STANDARD**, not a detailed database specification.

DO NOT turn this document into:

- A complete database schema
- SQL table definitions
- API documentation
- UI screen specifications
- Detailed workflow specifications for every module
- Complete material-code catalogs
- Complete equipment catalogs
- Complete employee-field definitions
- Complete BOQ item catalogs
- Complete document-type catalogs
- Complete room library
- Complete element library
- Complete task library

Instead:

> **STD-001 defines the governing rules that those detailed master-data libraries and systems SHALL follow.**

Detailed catalogs and data dictionaries may be referenced as future subordinate standards, specifications, libraries, or implementation documents.

---

# 5. CORE GOVERNING PRINCIPLE

The most important principle of this document is:

> **DCOS-MDM-STD-001 defines the rules and principles that every DCOS master-data component SHALL follow.**

For example:

```text
DCOS-MDM-STD-001
│
├── Defines what Master Data is
├── Defines Master Data Domains
├── Defines ownership
├── Defines responsibilities
├── Defines naming rules
├── Defines coding principles
├── Defines lifecycle rules
├── Defines governance
├── Defines quality requirements
├── Defines security
├── Defines change control
├── Defines audit requirements
└── Defines integration principles
```

Detailed implementation documents sit underneath the standard:

```text
DCOS-MDM-STD-001
        │
        ├── Master Data Domain Standards
        │
        ├── Master Data Dictionary
        │
        ├── Coding & Numbering Standards
        │
        ├── Material Master Library
        │
        ├── Equipment Master Library
        │
        ├── Task Master Library
        │
        ├── Room Template Library
        │
        ├── Element Template Library
        │
        ├── Document Type Master
        │
        └── Other controlled master-data libraries
```

---

# 6. REQUIRED DOCUMENT STRUCTURE

Create the document using exactly this high-level structure:

## 1. Document Control

Include:

- Document title
- Document code
- Version
- Revision
- Status
- Effective date
- Document owner
- Business owner
- Technical owner
- Approved by
- Classification
- Review frequency

Include a professional document-control table.

---

## 2. Purpose

Explain:

- Why DCOS requires enterprise master data
- Why uncontrolled master data creates operational problems
- How master data supports an integrated construction operating system
- Relationship between master data and operational transactions
- Relationship between master data and reporting

Explain that master data is the foundation upon which transactional processes operate.

---

## 3. Scope

Define the scope of master data across:

- Enterprise
- Company / Tenant
- Projects
- Project WBS
- Disciplines
- Stakeholders
- People / Users
- Organizations
- Locations
- Materials
- Equipment
- Suppliers
- Subcontractors
- Cost structures
- BOQ structures
- Tasks
- Elements
- Rooms
- Documents
- Units of Measure
- Currencies
- Countries
- Administrative classifications
- Other controlled reference/master datasets

Clearly distinguish:

### In Scope

Enterprise and construction-related master data required by DCOS.

### Out of Scope

Transactional records such as:

- Purchase Orders
- Invoices
- Daily Reports
- Inspection Requests
- RFIs
- NCRs
- Payment Certificates
- Attendance transactions
- Stock transactions
- Individual project progress records

Explain that transactions consume master data but are not themselves master data.

---

# 7. MASTER DATA PRINCIPLES

Define the core principles.

At minimum include:

### 7.1 Single Source of Truth

A master record should have one authoritative source.

### 7.2 Uniqueness

Each master record SHALL have a unique identifier.

### 7.3 Standardization

Master data SHALL follow common naming, coding, classification, and formatting rules.

### 7.4 Controlled Creation

Users SHALL NOT freely create uncontrolled duplicate master records where an approved master already exists.

### 7.5 Ownership

Every master-data domain SHALL have a defined owner.

### 7.6 Accountability

Creation, modification, approval, and retirement SHALL be traceable.

### 7.7 Reusability

Enterprise master data should be reusable across multiple projects where appropriate.

### 7.8 Project-Specific Extension

DCOS SHALL support project-specific master-data extensions without corrupting enterprise standards.

### 7.9 Data Quality

Master records must meet minimum quality requirements before becoming active.

### 7.10 Lifecycle Control

Master data SHALL have controlled states such as:

```text
Draft
→ Under Review
→ Approved
→ Active
→ Suspended
→ Deprecated
→ Archived
```

### 7.11 Security

Sensitive master data SHALL only be accessible to authorized users.

### 7.12 Auditability

All important changes SHALL be traceable.

---

# 8. DCOS MASTER DATA CONCEPT

Define the difference between:

### Master Data

Stable business entities reused across processes.

Examples:

- Company
- Project
- Stakeholder
- Supplier
- Material
- Equipment
- Employee
- Unit
- Currency
- WBS classification
- Element
- Room Template
- Task Template

### Transaction Data

Operational events generated during business processes.

Examples:

- Purchase Order
- Goods Receipt
- Stock Issue
- Invoice
- RFI
- Inspection
- Daily Report
- Payment Certificate

### Reference Data

Controlled values used to classify or validate master/transaction data.

Examples:

- Country
- Currency
- Unit of Measure
- Status
- Discipline
- Project Type
- Contract Type
- Employment Type
- Document Category

Clearly explain the relationship:

```text
Reference Data
      ↓
Master Data
      ↓
Transactional Data
      ↓
Reporting / KPI / Analytics
```

---

# 9. MASTER DATA ARCHITECTURE

Describe the conceptual architecture.

Use this model:

```text
                    DCOS ENTERPRISE MASTER DATA
                              	    │
              ┌───────────────┴───────────────┐
              │                               			  │
        Enterprise Master               	Project Master
              	 │                                     │
      ┌───────┼────────┐              	┌───────┼────────┐
      │       	 │           │                 │          │           │
   People  Supplier     Material       		Project  WBS   Stakeholder
      │          │           │                │          │
      └───────┴────────┘                │          │
                 │                            │          │
                 └──────────────┬──────────┘    │
                             	      │                  │
                           Transaction Modules
                             	     │
          ┌──────────────────┼──────────────────┐
          │                         │                        │
       Procurement        	Construction          	 Finance
          │                         │                  		  │
          └──────────────────┼──────────────────┘
                             	     │
                        	Reporting / KPI
```

Explain how master data flows through the DCOS platform.

---

# 10. MASTER DATA DOMAINS

Define the high-level master-data domains.

At minimum consider:

## 10.1 Enterprise / Company Master

Examples:

- Company
- Business Unit
- Branch
- Department
- Cost Centre

## 10.2 Project Master

Examples:

- Project
- Project Type
- Project Category
- Project Phase
- Project Status
- Contract Type

## 10.3 WBS Master

Examples:

- WBS
- Building
- Level
- Zone
- Room
- Element
- Task classification

Maintain the DCOS principle that WBS is the project control spine.

## 10.4 Stakeholder Master

Examples:

- Client
- Consultant
- Contractor
- Subcontractor
- Supplier
- Authority
- Testing Agency
- Other external organization

## 10.5 People / User Master

Examples:

- Employee
- System User
- External User
- Contact Person
- Role
- Position

Clearly distinguish:

```text
Person
≠
Employee
≠
System User
≠
Project Assignment
```

## 10.6 Material Master

Examples:

- Material
- Material Category
- Material Type
- Specification
- Grade
- Brand
- Unit
- Material classification

The standard should support the existing DCOS Material Library concept.

## 10.7 Equipment Master

Examples:

- Equipment
- Equipment Category
- Equipment Type
- Manufacturer
- Model
- Capacity
- Ownership Type

## 10.8 Supplier / Vendor Master

Examples:

- Supplier
- Vendor Category
- Supplier Type
- Qualification Status
- Payment Terms
- Contact Persons

## 10.9 Subcontractor Master

Examples:

- Subcontractor
- Trade
- Classification
- Qualification
- Performance status

## 10.10 Cost / Commercial Master

Examples:

- Cost Code
- Cost Category
- Cost Centre
- BOQ Classification
- Cost Type
- Rate Type

Do not design detailed BOQ tables here. Define governing principles only.

## 10.11 Document Master

Examples:

- Document Type
- Document Category
- Discipline
- Revision Classification
- Confidentiality Classification

## 10.12 Task Master

Examples:

- Task Type
- Task Template
- Activity Classification
- Work Category

## 10.13 Room Template Master

Examples:

- Room Type
- Room Template
- Space Classification

## 10.14 Element Master

Use the existing DCOS Element Template concept.

Examples include:

- Structural elements
- Architectural elements
- MEP elements

Do not reproduce the full element catalog. Define how the catalog SHALL be governed.

## 10.15 Reference Data

Examples:

- Country
- Currency
- Language
- Unit of Measure
- Calendar
- Time Zone
- Status
- Priority
- Discipline
- Trade
- Project Category

---

# 11. MASTER DATA OWNERSHIP & RESPONSIBILITY

Define governance roles.

At minimum:

### Executive Sponsor

Provides organizational authority.

### Master Data Governance Board

Sets enterprise policies.

### Data Owner

Business owner accountable for correctness.

### Data Steward

Responsible for operational quality and maintenance.

### Data Custodian

Responsible for technical storage and system implementation.

### System Administrator

Manages system configuration and access.

### Data Consumer

Uses approved master data.

Create a RACI-style responsibility model.

Example:

| Activity | Data Owner | Data Steward | System Admin | User |
|---|---|---|---|---|
| Define standard | A | R | C | I |
| Create master | A | R | C | R |
| Approve master | A | R | I | I |
| Modify master | A | R | C | R |
| Archive master | A | R | C | I |
| Audit | A | R | R | I |

Adjust the matrix where necessary.

---

# 12. MASTER DATA STANDARDIZATION RULES

Define enterprise rules for:

### 12.1 Naming

Establish consistent naming conventions.

### 12.2 Codes

Define principles for:

- Unique codes
- Prefixes
- Numbering
- Sequence
- Domain identification
- Project-specific codes
- Enterprise codes

Do NOT invent hundreds of codes.

Define the governing rules only.

### 12.3 Descriptions

Define:

- Standard terminology
- Abbreviations
- Capitalization
- Language
- Spelling
- Units

### 12.4 Dates

Define standard date formats.

### 12.5 Units of Measure

Define controlled UOM usage.

### 12.6 Currency

Define currency control.

### 12.7 Country / Location

Define standardized geographic values.

### 12.8 Status Values

Define controlled status values.

### 12.9 Classification

Define classification hierarchy principles.

---

# 13. MASTER DATA LIFECYCLE

Define the complete lifecycle.

Recommended:

```text
Identify
   ↓
Request
   ↓
Create Draft
   ↓
Validate
   ↓
Review
   ↓
Approve
   ↓
Activate
   ↓
Use
   ↓
Modify
   ↓
Suspend
   ↓
Deprecate
   ↓
Archive
```

For each stage explain:

- Purpose
- Responsible role
- Entry criteria
- Exit criteria
- Required validation
- Audit requirement

---

# 14. MASTER DATA CREATION & CHANGE CONTROL

Define:

- Who may request new master data
- Who may create it
- Who validates it
- Who approves it
- Who can modify it
- When changes require re-approval
- When a new version is required
- When a new record is required instead of editing an existing record

Include duplicate prevention.

Example:

```text
User requests new Supplier
        ↓
Search existing Supplier Master
        ↓
Potential duplicate?
   ┌──────┴──────┐
   YES           NO
   ↓             ↓
Review       Create Draft
                ↓
             Validate
                ↓
             Approve
                ↓
              Active
```

---

# 15. DUPLICATE DATA MANAGEMENT

Define the enterprise rules for:

- Duplicate detection
- Duplicate prevention
- Duplicate review
- Merge
- Survivorship
- Deactivation
- Audit history

Examples:

- Duplicate suppliers
- Duplicate materials
- Duplicate stakeholders
- Duplicate employees
- Duplicate equipment

Define that duplicates should generally be merged or retired rather than casually deleted.

---

# 16. DATA QUALITY REQUIREMENTS

Define minimum quality dimensions.

At minimum:

1. Accuracy
2. Completeness
3. Consistency
4. Uniqueness
5. Validity
6. Timeliness
7. Integrity
8. Traceability

Create a conceptual quality model.

Example:

```text
Master Data Quality Score
        │
        ├── Completeness
        ├── Accuracy
        ├── Uniqueness
        ├── Validity
        ├── Consistency
        └── Timeliness
```

Define minimum quality requirements before a master record can become ACTIVE.

---

# 17. DATA QUALITY CONTROL

Define:

- Validation rules
- Mandatory fields
- Controlled lists
- Duplicate checks
- Periodic data review
- Exception handling
- Data quality KPIs
- Data cleansing
- Data correction
- Data-quality reporting

Include example KPIs such as:

- Duplicate rate
- Missing mandatory data rate
- Invalid code rate
- Inactive master percentage
- Unapproved master records
- Data correction frequency

---

# 18. SECURITY & ACCESS CONTROL

Define master-data security principles.

Include:

- Role-based access control
- Least privilege
- Separation of duties
- Project-level access
- Company / tenant-level access
- Sensitive data protection
- Read-only access
- Administrative access
- Approval authority

Align this with DCOS RBAC architecture.

---

# 19. MULTI-TENANT MASTER DATA

DCOS is intended to support multiple construction companies.

Define how master data is classified into:

### Global / Platform Master Data

Shared across the DCOS platform where appropriate.

### Tenant / Company Master Data

Owned by a specific company.

### Project Master Data

Specific to one project.

### Project Extension

A controlled project-specific extension of enterprise master data.

Use a conceptual model:

```text
Platform
   │
   ├── Enterprise / Global Reference
   │
   └── Tenant
        │
        ├── Company Master
        │
        ├── Shared Master
        │
        └── Project
             ├── Project Master
             └── Project-specific extensions
```

Define isolation rules so one tenant cannot unintentionally access another tenant's private master data.

---

# 20. MASTER DATA AND WBS RELATIONSHIP

This section is CRITICAL.

Explain how master data connects to the DCOS WBS.

Use:

```text
Project
   ↓
WBS
   ↓
Building
   ↓
Level
   ↓
Zone
   ↓
Room / Space
   ↓
Element
   ↓
Task
```

Explain how master data such as:

- Materials
- Elements
- Tasks
- Equipment
- Cost codes
- Documents
- Suppliers
- Subcontractors

can be associated with WBS-controlled project records.

Maintain the principle:

> **WBS provides project context; Master Data provides standardized business identity.**

---

# 21. MASTER DATA AND DCOS MODULES

Define how master data is consumed by major modules.

Create a high-level integration matrix.

Example:

| Master Data | Project | Design | QS | Procurement | Stock | Construction | QA/QC | HSE | HR | Finance |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Project | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| WBS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  | ✓ |
| Material |  | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  | ✓ |
| Supplier |  |  | ✓ | ✓ | ✓ | ✓ |  |  |  | ✓ |
| Equipment |  |  | ✓ | ✓ | ✓ | ✓ | ✓ | HSE |  | ✓ |
| Employee |  |  |  |  |  | ✓ |  | ✓ | ✓ | ✓ |

Refine this matrix where necessary.

---

# 22. MASTER DATA INTEGRATION PRINCIPLES

Define:

- Master-data ownership
- Data synchronization
- Referential integrity
- API integration
- Event-driven updates where appropriate
- Import/export
- External system integration
- Data mapping
- Error handling
- Conflict resolution

Do not design detailed APIs.

Only establish standards that future API specifications must follow.

---

# 23. IMPORT / EXPORT CONTROL

Define rules for:

- Excel import
- CSV import
- Bulk upload
- API import
- Data migration
- Export
- Validation
- Error reporting
- Duplicate checking
- Approval after import

Recommended principle:

> Bulk import SHALL NOT bypass master-data governance.

---

# 24. MASTER DATA VERSIONING

Define:

- Version number
- Effective date
- Previous version
- New version
- Reason for change
- Change request
- Approval
- Effective period

Explain when a change should:

### Modify an existing record

versus

### Create a new master record/version.

---

# 25. MASTER DATA AUDIT & TRACEABILITY

Every controlled master-data change should be traceable.

Define audit requirements:

- Who
- What
- When
- Previous value
- New value
- Reason
- Approval
- Source
- Effective date

Align this conceptually with the DCOS Audit Trail Engine.

Do not create a detailed database schema.

---

# 26. MASTER DATA ARCHIVING & RETENTION

Define:

- When records may be archived
- Who approves archival
- Difference between inactive, deprecated, and archived
- Retention principles
- Historical reporting requirements
- Referential integrity requirements

Important:

> Historical transactions SHALL NOT lose their original master-data context simply because a master record becomes inactive.

---

# 27. MASTER DATA COMPLIANCE

Define compliance requirements covering:

- Internal company policies
- Contractual requirements
- Financial controls
- Audit requirements
- Document control requirements
- Data protection
- Industry requirements
- Applicable legal/regulatory requirements

Do not invent jurisdiction-specific legal requirements unless supported by the source material.

Use general wording where jurisdiction is not defined.

---

# 28. MASTER DATA GOVERNANCE

Define the governance framework.

Include:

### Governance Board

### Domain Owners

### Data Stewards

### Technical Custodians

### Change Control

### Data Quality Reviews

### Periodic Master Review

### Exception Management

### Escalation

### Compliance Monitoring

Provide a governance model.

---

# 29. MASTER DATA GOVERNANCE WORKFLOW

Create a generic workflow:

```text
Business Need
     ↓
Master Data Request
     ↓
Duplicate Search
     ↓
Draft Creation
     ↓
Validation
     ↓
Business Review
     ↓
Approval
     ↓
Activation
     ↓
System Availability
     ↓
Monitoring
     ↓
Periodic Review
```

Include exception workflow.

---

# 30. MASTER DATA CHANGE REQUEST

Define the minimum information required for a master-data change request:

- Request ID
- Requester
- Domain
- Record
- Current value
- Proposed value
- Reason
- Business justification
- Effective date
- Impact assessment
- Supporting documents
- Reviewer
- Approver
- Approval status

Do not turn this into a UI specification.

---

# 31. MASTER DATA QUALITY GOVERNANCE

Define periodic review cycles.

For example:

```text
Critical Master Data
→ Monthly / Quarterly Review

Important Master Data
→ Quarterly / Semi-Annual Review

Reference Data
→ Controlled Review

Archived Data
→ Annual Review
```

Do not force exact frequencies unless justified. Define recommended governance frequencies that can be configured by the organization.

---

# 32. MASTER DATA KPIs

Define enterprise-level master-data KPIs.

At minimum:

- Master Data Completeness %
- Duplicate Rate %
- Data Quality Score
- Unapproved Master Records
- Expired / Deprecated Records
- Change Request Aging
- Master Data Error Rate
- Data Steward Response Time
- Failed Import Rate
- Duplicate Prevention Rate

Explain the purpose of each KPI.

---

# 33. MASTER DATA OPERATING MODEL

Define how master data operates organizationally.

Use:

```text
Executive Governance
        ↓
MDM Governance Board
        ↓
Domain Data Owners
        ↓
Data Stewards
        ↓
System / Data Custodians
        ↓
Business Users
```

Explain responsibilities at each level.

---

# 34. IMPLEMENTATION PRINCIPLES

Define how DCOS should implement the standard.

The implementation should follow:

### Phase 1

Define enterprise reference data.

### Phase 2

Define core company and project master data.

### Phase 3

Define WBS and project master.

### Phase 4

Define operational domain master data.

### Phase 5

Implement governance and quality controls.

### Phase 6

Implement integration and analytics.

Do not create a detailed software development roadmap here.

---

# 35. MASTER DATA DOCUMENT HIERARCHY

Define the document hierarchy underneath STD-001.

Recommended:

```text
DCOS
│
├── DCOS-MDM-STD-001
│   Enterprise Master Data Standard
│
├── DCOS-MDM-STD-002
│   Coding & Numbering Standard
│
├── DCOS-MDM-DIC-001
│   Enterprise Master Data Dictionary
│
├── DCOS-MDM-LIB-001
│   Material Master Library
│
├── DCOS-MDM-LIB-002
│   Equipment Master Library
│
├── DCOS-MDM-LIB-003
│   Task Master Library
│
├── DCOS-MDM-LIB-004
│   Element Template Library
│
├── DCOS-MDM-LIB-005
│   Room Template Library
│
└── Other Domain Libraries / Standards
```

IMPORTANT:

Do not automatically create these documents in detail.

This section only establishes the hierarchy and relationship.

---

# 36. EXCEPTIONS

Define when an exception to the standard may be permitted.

Include:

- Business justification
- Impact assessment
- Risk assessment
- Approval authority
- Expiration date
- Review requirement
- Audit trail

Principle:

> Exceptions SHALL be controlled, documented, approved, and time-bound where practical.

---

# 37. REVIEW AND MAINTENANCE

Define:

- Document review cycle
- Ownership
- Revision control
- Change proposal
- Approval
- Publication
- Communication
- Retirement

Recommended:

> Review at least annually or when major DCOS architecture/business changes occur.

---

# 38. APPENDICES

Keep appendices at a high level.

Recommended appendices:

### Appendix A — Master Data Domain Catalogue

List domains only.

### Appendix B — Master Data Lifecycle

Lifecycle diagram.

### Appendix C — Governance Responsibility Matrix

RACI.

### Appendix D — Master Data Classification

Enterprise / Tenant / Project / Reference.

### Appendix E — Terminology

Important DCOS MDM definitions.

Do not place hundreds of individual master records in the appendices.

---

# 39. REQUIRED DEFINITIONS

Create a formal glossary containing terms such as:

- Master Data
- Transaction Data
- Reference Data
- Metadata
- Data Owner
- Data Steward
- Data Custodian
- Data Consumer
- Data Domain
- Data Quality
- Golden Record
- Single Source of Truth
- Data Lifecycle
- Data Governance
- Data Classification
- Tenant
- Project Master
- WBS
- Enterprise Master
- Project Extension
- Deprecated
- Archived

---

# 40. DOCUMENT WRITING STYLE

Write this as a **formal enterprise standard**, not as a casual explanation.

Use:

- Professional technical language
- Clear SHALL / SHOULD / MAY terminology
- Numbered sections
- Tables
- Process diagrams using Mermaid where useful
- Conceptual architecture diagrams
- Responsibility matrices
- Governance models
- Clear definitions
- Normative requirements

Use:

> **SHALL** = mandatory requirement

> **SHOULD** = recommended requirement

> **MAY** = optional capability

---

# 41. IMPORTANT — DO NOT OVER-DESIGN

The purpose of STD-001 is governance.

Avoid unnecessary technical implementation details such as:

- SQL
- PostgreSQL table structures
- API endpoints
- React components
- UI wireframes
- Supabase implementation
- Database indexes
- Code snippets
- Detailed screen specifications

Those belong in technical design documents.

---

# 42. DCOS ARCHITECTURAL ALIGNMENT

Ensure the standard remains compatible with these DCOS principles:

### Unified Platform

One integrated construction operating system.

### Shared WBS

WBS acts as the common project structure.

### Modular Architecture

Each discipline/module uses common enterprise master data.

### Multi-Tenant

Company data must be logically isolated.

### Role-Based Access

Master data access is controlled by authorization.

### Auditability

Important changes are traceable.

### Lifecycle Management

Master records are controlled from creation through retirement.

### Reusability

Enterprise master data can be reused across projects.

### Controlled Project Extension

Projects can extend enterprise master data without uncontrolled duplication.

---

# 43. REQUIRED QUALITY OF FINAL DOCUMENT

The final document must feel like a document that could realistically be issued by:

- Enterprise Architecture
- Information Management
- Digital Transformation
- Construction Technology
- Corporate IT Governance

It must NOT feel like:

- A generic MDM article
- A software tutorial
- A database design document
- A programming specification
- A simple project note

It must be a **formal DCOS corporate standard**.

---

# 44. REQUIRED OUTPUT

Produce the complete document:

# DCOS-MDM-STD-001
## DCOS Enterprise Master Data Standard

Include:

1. Document Control
2. Purpose
3. Scope
4. Master Data Principles
5. DCOS Master Data Concept
6. Master Data Architecture
7. Master Data Domains
8. Master Data Ownership & Responsibility
9. Master Data Standardization Rules
10. Master Data Lifecycle
11. Master Data Governance
12. Data Quality Requirements
13. Security & Access Control
14. Change & Version Control
15. Audit & Traceability
16. Integration with DCOS Modules
17. Master Data Compliance
18. Implementation & Maintenance
19. Appendices

---

# 45. FINAL VALIDATION BEFORE OUTPUT

Before finalizing the document, perform an internal review against these questions:

### Governance

- Does every major master-data domain have an owner?
- Is responsibility clearly defined?
- Is approval controlled?

### Standardization

- Are naming and coding principles defined?
- Are units, currencies, statuses, and classifications controlled?

### Lifecycle

- Can a record be created, approved, activated, changed, deprecated, and archived?

### Quality

- Are duplicate prevention and data quality addressed?

### Security

- Are tenant, company, project, role, and sensitive-data boundaries addressed?

### Integration

- Can the same master data be safely used across QS, Procurement, Stock, Construction, QA/QC, HSE, HR, Finance, Design, BIM, and Document Control?

### WBS

- Is the relationship between master data and WBS clearly defined?

### Governance

- Is there a clear Data Owner / Data Steward / Data Custodian model?

### Audit

- Can every important master-data change be traced?

### Scope

- Does the document remain a GOVERNING STANDARD rather than becoming a database or software specification?

If any answer is NO, revise the document before presenting the final version.

---

# 46. FINAL INSTRUCTION

Do not merely describe what the standard should contain.

**Actually write the complete DCOS-MDM-STD-001 document.**

Use the source DCOS documents as the primary reference.

Where the source documents define an existing DCOS concept, preserve that terminology and architecture.

Where the source documents do not define a specific MDM rule, create a reasonable enterprise-level standard based on sound master-data governance principles, but clearly avoid inventing DCOS-specific implementation details that have not yet been established.

The final result must be **Version 1.0 / Initial Issue quality**, structured so that future detailed MDM standards, dictionaries, libraries, database designs, and module specifications can be built underneath it without contradicting this document.

**Output only the completed document.**