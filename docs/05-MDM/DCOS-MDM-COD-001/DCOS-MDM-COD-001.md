# MASTER PROMPT FOR CLAUDE AI

## DCOS-MDM-COD-001 — DCOS Master Data Coding & Naming Standard

### ROLE

Act as a **Senior Enterprise Architect, Construction ERP Architect, Master Data Management (MDM) Architect, Data Governance Specialist, Construction Management Systems Architect, and Information Standards Specialist** with extensive experience designing coding, naming, classification, and identification standards for construction companies, real-estate organizations, and enterprise ERP platforms.

You are responsible for creating a professional, structured, implementation-ready coding and naming standard for the DCOS platform.

---

# DOCUMENT TO CREATE

**Document ID:** DCOS-MDM-COD-001  
**Document Title:** DCOS Master Data Coding & Naming Standard  
**Document Type:** Enterprise Master Data Coding & Naming Standard  
**Document Status:** Draft for Standardization  
**Parent Standard:** DCOS-MDM-STD-001 — DCOS Enterprise Master Data Standard  
**Related Document:** DCOS-MDM-CAT-001 — DCOS Master Data Catalogue

---

# 1. DCOS SYSTEM CONTEXT

DCOS is an integrated **Construction ERP & Operations Management Platform** designed to manage the complete lifecycle of construction and real-estate projects.

DCOS integrates areas including:

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

DCOS requires a consistent enterprise-wide approach to:

- Identification
- Coding
- Naming
- Numbering
- Classification
- Abbreviation
- Business codes
- Master-data identifiers

The objective is to ensure that the same business entity is consistently identified across all DCOS modules.

---

# 2. PURPOSE OF THIS DOCUMENT

Create the official:

> **DCOS Master Data Coding & Naming Standard**

The purpose of this document is to establish the rules governing **how DCOS master-data entities are identified, coded, named, numbered, classified, and referenced**.

The standard shall ensure:

- Unique identification
- Consistent naming
- Consistent coding
- Cross-module compatibility
- Human readability
- Machine readability
- Scalability
- Searchability
- Integration readiness
- Duplicate prevention
- Enterprise-wide consistency

The standard shall become the foundation for all future DCOS master-data codes.

---

# 3. RELATIONSHIP WITH OTHER DCOS DOCUMENTS

Clearly explain the relationship between:

```text
DCOS-MDM-STD-001
Enterprise Master Data Standard
          │
          ▼
DCOS-MDM-CAT-001
Master Data Catalogue
          │
          ▼
DCOS-MDM-COD-001
Coding & Naming Standard
          │
          ▼
Actual Master Data Records
```

Explain:

### DCOS-MDM-STD-001

Defines the overall enterprise master-data principles and governance.

### DCOS-MDM-CAT-001

Defines **what master-data entities exist**.

### DCOS-MDM-COD-001

Defines **how those entities are identified, coded, named, and numbered**.

### Actual Master Data

Contains the real records using the approved standards.

For example:

```text
Master Data Entity:
Material

Coding Standard:
MAT-[CATEGORY]-[SEQUENCE]

Actual Record:
MAT-STR-000123
```

Do not confuse the standard with the actual master-data records.

---

# 4. SCOPE

This standard SHALL apply to all DCOS master-data entities that require formal identification.

At minimum consider:

- Organization
- Company
- Business Unit
- Department
- Project
- WBS
- Building
- Level
- Zone
- Room
- Location
- Material
- Supplier
- Subcontractor
- Customer / Client
- Employee
- Equipment
- BOQ
- Cost Code
- Contract
- Document
- Warehouse
- Storage Location
- Design Discipline
- BIM Classification
- Resource
- Asset

Also determine whether reference-data entities require formal codes.

---

# 5. CODING AND NAMING PRINCIPLES

Establish the core principles.

At minimum:

1. **Uniqueness**
2. **Consistency**
3. **Stability**
4. **Readability**
5. **Simplicity**
6. **Scalability**
7. **Non-duplication**
8. **Machine compatibility**
9. **Human usability**
10. **Cross-module reuse**
11. **Traceability**
12. **Controlled change**
13. **Enterprise-wide consistency**
14. **Project-level flexibility where appropriate**

Explain each principle.

---

# 6. IDENTIFIER TYPES

Clearly distinguish different types of identifiers.

At minimum define:

### A. Technical Primary Key

Example:

```text
UUID
```

Purpose:

- Database identity
- Internal system relationships
- Stable technical reference

### B. Business Code

Example:

```text
PRJ-2026-00001
MAT-STR-00001
SUP-00001
EMP-00001
EQP-00001
```

Purpose:

- Human identification
- Business processes
- Reports
- Search
- Documents
- Communication

### C. Display Name

Example:

```text
Hattha Bank Tower
Portland Cement 42.5N
ABC Construction Supply Co., Ltd.
```

Explain why:

> **Technical ID ≠ Business Code ≠ Name**

This distinction SHALL be mandatory throughout DCOS.

---

# 7. GENERAL BUSINESS CODE STANDARD

Establish the general architecture for DCOS business codes.

Define:

- Prefix
- Domain code
- Category code
- Year component where applicable
- Sequence number
- Optional project identifier
- Optional discipline identifier
- Optional location identifier

Do not force every code to contain every component.

Establish a rule that each entity type SHALL have an appropriate coding pattern.

Example:

```text
MAT-STR-000001
SUP-000001
EMP-000001
EQP-000001
```

Project example:

```text
PRJ-2026-00001
```

WBS example:

```text
PRJ-2026-00001-WBS-001
```

Explain when hierarchical codes are appropriate and when they should be avoided.

---

# 8. PREFIX STANDARD

Create a controlled prefix standard for major DCOS master-data domains.

Develop and validate appropriate prefixes.

For example:

| Entity | Prefix |
|---|---|
| Organization | ORG |
| Company | COM |
| Project | PRJ |
| WBS | WBS |
| Location | LOC |
| Building | BLD |
| Level | LVL |
| Zone | ZON |
| Room | ROM |
| Material | MAT |
| Supplier | SUP |
| Subcontractor | SUB |
| Customer | CUS |
| Employee | EMP |
| Equipment | EQP |
| BOQ | BOQ |
| Cost Code | CST |
| Contract | CON |
| Document | DOC |
| Warehouse | WHS |
| Asset | AST |

Do not blindly accept these examples.

Review and optimize them for consistency.

Ensure:

- Prefixes are unique
- Prefixes are understandable
- Similar entities do not create ambiguity
- Abbreviations are controlled

---

# 9. DOMAIN CODE STANDARD

Define how DCOS domains are represented.

Example:

```text
ORG = Organization
PRJ = Project
RES = Resource
MAT = Material
FIN = Finance
DOC = Document
```

Determine whether domain codes and entity prefixes should be the same or different.

Avoid unnecessary duplication between:

- Domain code
- Entity code
- Module code
- Business code

Make the architecture simple.

---

# 10. SEQUENCE NUMBER STANDARD

Define rules for sequential numbering.

Establish:

- Minimum digits
- Leading zeros
- Starting number
- Sequence uniqueness
- Enterprise sequence vs project sequence
- Whether sequences can be reused
- Whether deleted/retired numbers can be reused
- Number reservation
- Concurrency control

Example:

```text
000001
000002
000003
```

Recommend an appropriate default sequence length.

Explain why sequence numbers generally SHALL NOT be reused after assignment.

---

# 11. YEAR COMPONENT

Determine when a year should be included in a business code.

For example:

```text
PRJ-2026-00001
PO-2026-000123
RFQ-2026-000045
```

Explain when year-based numbering is appropriate.

Do not unnecessarily include the year in stable master-data codes.

For example, evaluate:

```text
MAT-STR-000001
```

versus:

```text
MAT-2026-STR-000001
```

Establish the principle that a stable master entity should generally not receive a new identity simply because the calendar year changes.

---

# 12. PROJECT CODE STANDARD

Create the enterprise standard for project identification.

Define:

- Project prefix
- Year
- Sequence
- Optional project category
- Optional location
- Optional business unit

Evaluate examples such as:

```text
PRJ-2026-00001
```

Avoid unnecessarily complicated project codes.

The project code SHALL be:

- Unique
- Stable
- Short enough for daily use
- Suitable for reports
- Suitable for documents
- Suitable for database integration
- Suitable for BIM/project systems

---

# 13. WBS CODE STANDARD

Establish high-level rules for WBS coding.

DCOS uses a project hierarchy such as:

```text
Project
   ↓
Phase
   ↓
Discipline
   ↓
Building
   ↓
Level
   ↓
Zone
   ↓
Room
   ↓
Task
```

Define how WBS elements should be identified.

Consider:

```text
01
01.01
01.01.001
01.01.001.001
```

or another suitable structure.

Evaluate the difference between:

### WBS Code

and

### WBS Technical ID

and

### WBS Name.

Establish whether WBS codes should be:

- Hierarchical
- Sequential
- Immutable
- Reusable
- Project-specific

The WBS coding system SHALL support changes in project structure without unnecessarily breaking historical references.

---

# 14. MATERIAL CODE STANDARD

Establish the enterprise coding approach for materials.

Example:

```text
MAT-STR-000001
MAT-ARC-000001
MAT-MEP-000001
```

Consider:

- Discipline
- Material category
- Material family
- Material type
- Sequence

Do not put excessive technical specification information into the code.

For example, avoid codes like:

```text
CEM-PORTLAND-42.5N-50KG-CAMBODIA-2026-001
```

Prefer:

```text
MAT-STR-000123
```

with detailed attributes stored separately in the Material Master.

Explain this principle:

> **The code identifies the entity; the master attributes describe the entity.**

---

# 15. SUPPLIER / BUSINESS PARTNER CODE STANDARD

Define coding standards for:

- Supplier
- Subcontractor
- Customer
- Client
- Consultant
- Contractor
- Other business partners

Consider whether DCOS should use a common:

> **Business Partner / Party Master**

with different roles.

For example:

```text
BP-000001
```

rather than separate identities for the same company:

```text
SUP-000123
SUB-000123
CUS-000123
```

Make an architectural recommendation.

If specialized codes are retained, clearly explain why.

Prevent the same legal entity from receiving multiple uncontrolled identities.

---

# 16. EMPLOYEE / PERSON CODE STANDARD

Define the standard for:

- Employee ID
- Person ID
- Worker ID
- User ID

Clearly distinguish:

```text
Person
Employee
System User
Employee Number
Technical User ID
```

Do not expose sensitive personal information through business codes.

Define whether employee numbers should be:

- Sequential
- Department-based
- Project-based
- Year-based

Prefer stable identification that remains valid when the employee changes department or project.

---

# 17. EQUIPMENT CODE STANDARD

Define coding rules for equipment.

Examples:

```text
EQP-000001
EQP-CRN-000001
EQP-EXC-000001
```

Evaluate whether equipment category should be encoded in the business code.

Ensure the code remains stable even if:

- Equipment changes project
- Equipment changes location
- Equipment changes operator
- Equipment changes department

The code identifies the equipment, not its current assignment.

---

# 18. LOCATION CODE STANDARD

Define coding principles for:

- Site
- Building
- Block
- Level
- Zone
- Room
- Warehouse
- Storage Location

Consider hierarchical codes such as:

```text
BLD-01
LVL-03
ZON-A
ROM-0305
```

or:

```text
PRJ-001-B01-L03-ZA-R05
```

Evaluate carefully whether location codes should contain the project code.

Ensure that the location architecture supports:

- Multiple projects
- Multiple buildings
- Multiple levels
- Multiple zones
- Multiple rooms
- Temporary locations
- Warehouses
- Storage areas

Avoid creating unnecessary duplicated location identities.

---

# 19. BOQ CODE STANDARD

Define coding rules for:

- BOQ
- BOQ Section
- BOQ Item
- Work Item
- Resource Item

Distinguish:

### BOQ Item Code

from:

### Material Code

from:

### Cost Code

from:

### WBS Code.

Explain how these identifiers relate without becoming the same code.

Example:

```text
WBS: 01.02.03
Cost Code: CST-STR-001
BOQ Item: BOQ-STR-00125
Material: MAT-STR-00456
```

---

# 20. COST CODE STANDARD

Define the principles for cost-code identification.

The cost code SHALL support:

- Project cost control
- Budget
- Actual cost
- Commitment
- Forecast
- Finance integration
- Reporting

Evaluate whether cost codes should be:

- Enterprise-wide
- Project-specific
- Hierarchical
- Mapped to WBS
- Mapped to BOQ

Do not make the cost code identical to the WBS unless there is a strong architectural reason.

---

# 21. CONTRACT CODE STANDARD

Define coding for:

- Main Contract
- Subcontract
- Supplier Contract
- Consultant Contract
- Variation
- Claim

Example:

```text
CON-2026-00001
SUBCON-2026-00001
```

Ensure contract identity remains stable throughout its lifecycle.

---

# 22. DOCUMENT NUMBERING STANDARD

Define high-level document numbering principles.

Consider:

```text
Project
Discipline
Document Type
Sequence
Revision
```

Example:

```text
PRJ-001-STR-DRG-000123
```

Clearly distinguish:

### Document Number

### Revision

### Version

### File Name

### Document Technical ID

Do not treat revision as a new document identity.

Example:

```text
Document Number:
PRJ-001-STR-DRG-000123

Revision:
R00
R01
R02
```

The document number remains stable while revision changes.

---

# 23. NAMING STANDARD

Create enterprise naming rules.

Define standards for:

- Master-data names
- Project names
- Building names
- Material names
- Supplier names
- Equipment names
- WBS names
- BOQ names
- Contract names
- Document names

Establish:

- Capitalization
- Word order
- Abbreviations
- Special characters
- Punctuation
- Spacing
- Language
- Transliteration where required
- Legal entity naming
- Standard terminology

Example:

Prefer:

```text
Portland Cement 42.5N
```

instead of uncontrolled variations:

```text
Portland cement 42.5 N
PORTLAND CEMENT 42.5N
Cement Portland 42.5
P.C. 42.5N
```

---

# 24. ABBREVIATION STANDARD

Create a controlled abbreviation policy.

Define:

- Approved abbreviations
- Prohibited abbreviations
- Maximum abbreviation length
- Common construction abbreviations
- Discipline abbreviations
- Material abbreviations
- Document abbreviations

Examples may include:

```text
ARC = Architecture
STR = Structural
MEP = Mechanical, Electrical & Plumbing
CIV = Civil
ELC = Electrical
MEC = Mechanical
PLB = Plumbing
```

Do not allow departments to independently invent abbreviations for enterprise master data.

Create an appendix for the controlled abbreviation list.

---

# 25. CHARACTER STANDARD

Define allowed characters in business codes.

Consider:

### Allowed

```text
A-Z
0-9
-
.
```

### Generally prohibited

```text
/
\
&
%
#
@
!
?
'
"
,
:
;
```

Define whether spaces are allowed.

Ensure codes are:

- URL-safe where practical
- Database-safe
- API-safe
- Report-safe
- File-system-safe where required

Do not apply overly restrictive rules to human-readable names if they are not necessary.

---

# 26. LANGUAGE STANDARD

Define how DCOS handles:

- English
- Khmer
- Other languages

Establish whether business codes SHALL use Latin characters even when names are multilingual.

Recommended principle:

> **Business codes should remain language-neutral and stable; names may support multilingual display.**

Example:

```text
MAT-STR-000123
```

Name:

```text
English: Portland Cement 42.5N
Khmer: [localized name]
```

Do not encode language into the master-data identity unless required.

---

# 27. CASE STANDARD

Define capitalization rules.

For example:

### Codes

Use:

```text
UPPERCASE
```

Example:

```text
MAT-STR-000123
```

### Names

Use controlled title/sentence capitalization appropriate to the entity.

Do not allow random casing.

---

# 28. SPECIAL CHARACTER STANDARD

Define when special characters are permitted.

For codes, establish a controlled character set.

For names, allow legitimate business names where necessary.

Do not remove legally required characters from company names simply for convenience.

---

# 29. VERSION / REVISION / SEQUENCE DISTINCTION

Clearly distinguish:

- Identity
- Code
- Version
- Revision
- Sequence
- Status

Example:

```text
Material Code:
MAT-STR-000123

Material Revision:
V02

Document Number:
PRJ-001-STR-DRG-000123

Document Revision:
R03
```

Explain when a change requires:

- Updating the name
- Updating attributes
- New version
- New revision
- New business code
- New master record

The objective is to prevent unnecessary creation of duplicate master records.

---

# 30. CODE CHANGE POLICY

Establish rules for changing an assigned business code.

General principle:

> **Business codes SHOULD be stable and SHALL NOT be changed merely because an attribute or organizational assignment changes.**

Examples:

An employee moves from:

```text
Engineering → Project Management
```

The Employee ID should not change.

An equipment item moves from:

```text
Project A → Project B
```

The Equipment Code should not change.

A material changes warehouse:

```text
Warehouse A → Warehouse B
```

The Material Code should not change.

Explain when a code change is justified.

---

# 31. RETIRED CODE POLICY

Define what happens when a master record is retired.

Establish:

- No reuse of retired codes
- Historical traceability
- Status = RETIRED / INACTIVE
- Effective date
- Replacement mapping where applicable
- Historical transaction preservation

Example:

```text
MAT-STR-000123
Status: RETIRED

Replacement:
MAT-STR-000987
```

Do not silently delete or recycle old business codes.

---

# 32. DUPLICATE PREVENTION

Define coding and naming rules that reduce duplicates.

Examples:

Prevent:

```text
SUP-000123
ABC Construction Co.
```

and:

```text
SUP-000456
A.B.C Construction Company Ltd.
```

from representing the same legal entity without controlled review.

Similarly prevent:

```text
Portland Cement 42.5N
Portland Cement 42.5 N
Cement Portland 42.5N
```

from becoming uncontrolled duplicate material masters.

Explain that coding and naming alone cannot fully prevent duplicates; they must work together with MDM governance and validation.

---

# 33. PROJECT-SPECIFIC VS ENTERPRISE CODES

Clearly define which codes SHALL be:

### Enterprise-wide

Example:

```text
MAT
SUP
EMP
EQP
```

and which may be:

### Project-specific

Example:

```text
WBS
BOQ
Project Cost Code
Project Location
```

Explain how enterprise master data can be reused across multiple projects.

---

# 34. MULTI-COMPANY STANDARD

DCOS may support multiple companies/business entities.

Define whether codes are:

- Globally unique
- Company-specific
- Shared across companies

Recommend a model that supports:

```text
Company A
Company B
Company C
      │
      ▼
Shared Enterprise Master
```

while allowing company-specific numbering where justified.

Avoid duplicate identities when the same enterprise entity is shared.

---

# 35. MULTI-PROJECT STANDARD

Define how master-data codes operate across multiple projects.

Example:

```text
Project A
Project B
Project C
       │
       ▼
Shared Material Master
Shared Supplier Master
Shared Equipment Master
Shared Employee Master
```

while:

```text
Project A WBS
Project B WBS
Project C WBS
```

remain project-specific.

---

# 36. BIM AND ENGINEERING CODING

Define high-level principles for BIM and engineering identifiers.

Consider:

- Discipline codes
- Model codes
- Element classification
- Drawing numbers
- Design package numbers
- Engineering system codes

Avoid creating multiple identities for the same physical asset across:

- BIM
- Design
- Construction
- Asset management
- Handover

Establish the principle:

> **A physical asset should have a controlled identity that can remain traceable across its lifecycle where applicable.**

---

# 37. FILE AND FOLDER NAMING

Define high-level naming rules for DCOS-managed files and folders.

Consider:

```text
Project
Discipline
Document Type
Document Number
Revision
Description
```

Example:

```text
PRJ-2026-00001_STR_DRW_000123_R02
```

Clearly distinguish:

- File name
- Document number
- Revision
- Folder name
- Master-data code

Do not make the file name the authoritative identity.

---

# 38. CODE GENERATION

Define how codes are generated by DCOS.

Business codes SHALL preferably be system-generated where practical.

Define:

- Sequence service
- Uniqueness control
- Concurrency
- Number reservation
- Prefix configuration
- Company/project scope
- Error handling
- Audit trail

Users SHOULD NOT manually invent controlled master-data codes.

---

# 39. CODE VALIDATION

Define high-level validation requirements.

DCOS SHALL validate:

- Format
- Prefix
- Length
- Allowed characters
- Uniqueness
- Scope
- Sequence
- Status
- Entity type

Example:

```text
MAT-STR-000123
```

must not be accepted as:

```text
MAT/STR/123
```

if the standard prohibits `/`.

---

# 40. CODING GOVERNANCE

Define ownership for:

- Prefix creation
- New code structure
- Naming rules
- Abbreviation approval
- Sequence management
- Exception approval
- Code retirement
- Standard revision

Do not create a detailed RACI.

Identify the responsible governance function at a high level.

---

# 41. EXCEPTIONS

Define how exceptions are handled.

An exception SHALL require:

- Business justification
- Impact assessment
- Governance review
- Approval
- Documentation
- Effective date

Do not allow individual departments or projects to create permanent coding standards independently.

---

# 42. CODING ANTI-PATTERNS

Include prohibited or discouraged examples.

Examples:

### Bad

```text
Cement1
Cement2
Cement_New
Cement_Final
Cement_Final2
```

### Bad

```text
Supplier-A
Supplier-A-NEW
Supplier-A-NEW2
```

### Bad

Using changing attributes inside stable identity:

```text
MAT-STR-CEMENT-42.5N-2026
```

when the material's identity should remain stable.

### Bad

Project-dependent employee codes:

```text
EMP-PRJ001-0001
```

when the employee may move between projects.

### Bad

Reusing retired codes.

Explain why each is unacceptable.

---

# 43. CODING EXAMPLES

Provide practical construction examples.

At minimum include:

### Project

```text
PRJ-2026-00001
```

### Material

```text
MAT-STR-000001
```

### Supplier

```text
SUP-000001
```

### Employee

```text
EMP-000001
```

### Equipment

```text
EQP-000001
```

### WBS

```text
01.02.003
```

### BOQ Item

```text
BOQ-STR-000123
```

### Cost Code

```text
CST-STR-001
```

### Contract

```text
CON-2026-00001
```

### Document

```text
PRJ-2026-00001-STR-DRG-000123
```

These are examples only. Finalize the standard based on architectural judgment.

---

# 44. MASTER CODING MATRIX

Create a comprehensive coding matrix.

Use:

| Entity | Prefix | Scope | Code Pattern | Sequence | Year | Category | Project | Owner | Notes |
|---|---|---|---|---|---|---|---|---|---|

Populate it for the major DCOS master-data entities.

At minimum include:

- Company
- Organization
- Department
- Project
- WBS
- Building
- Level
- Zone
- Room
- Location
- Material
- Supplier
- Subcontractor
- Customer
- Employee
- Equipment
- BOQ
- Cost Code
- Contract
- Document
- Warehouse
- Asset

---

# 45. NAMING STANDARD MATRIX

Create a separate naming matrix.

| Entity | Naming Rule | Case | Abbreviation | Special Characters | Example |
|---|---|---|---|---|---|

Include the major master-data entities.

---

# 46. CODE COMPONENT MATRIX

Create a matrix showing the meaning of each code component.

Example:

| Component | Meaning | Example |
|---|---|---|
| PRJ | Project | PRJ |
| 2026 | Year | 2026 |
| STR | Structural | STR |
| 000123 | Sequence | 000123 |
| R02 | Revision | R02 |

Clearly distinguish components that identify the entity from components that describe status/version/revision.

---

# 47. MASTER DATA CODE HIERARCHY

Create a high-level hierarchy:

```text
Enterprise
   │
   ├── Organization Codes
   │
   ├── Resource Codes
   │   ├── Material
   │   ├── Supplier
   │   ├── Employee
   │   └── Equipment
   │
   └── Project Codes
       │
       ├── Project
       ├── WBS
       ├── BOQ
       ├── Cost Code
       ├── Location
       └── Document
```

Improve this architecture where necessary.

---

# 48. IMPLEMENTATION RULES

Explain how the coding standard should be implemented in DCOS.

At high level:

```text
Coding Standard
       ↓
Master Data Catalogue
       ↓
Code Configuration
       ↓
Code Generator
       ↓
Validation
       ↓
Master Record
       ↓
Transaction Usage
```

Users should select existing master records rather than manually entering controlled codes.

---

# 49. MIGRATION AND LEGACY DATA

Define high-level rules for importing existing company data.

Legacy codes may not follow the DCOS standard.

Therefore define:

- Legacy Code
- DCOS Code
- Mapping
- Conversion
- Duplicate review
- Data cleansing
- Approval
- Historical preservation

Example:

```text
Legacy Supplier Code → DCOS Supplier Code
SUP-ABC → SUP-000123
```

Do not destroy legacy references where historical traceability is required.

---

# 50. INTEGRATION REQUIREMENTS

Explain how codes support integration with:

- ERP
- Accounting
- HR
- Procurement
- BIM
- Document Management
- Inventory
- External APIs
- Reporting / BI

Establish that integration mappings SHALL be documented.

Do not assume every external system uses the same code structure.

Allow:

```text
DCOS Code
      ↕
External System Code
```

through controlled mapping.

---

# 51. AUDIT AND TRACEABILITY

Define that DCOS SHALL maintain traceability for:

- Code creation
- Code assignment
- Code change
- Code retirement
- Code mapping
- Exception approval

Historical transactions must remain traceable to the original master-data identity.

---

# 52. REQUIRED APPENDICES

Include:

### Appendix A — Master Prefix List

### Appendix B — Approved Abbreviations

### Appendix C — Code Pattern Examples

### Appendix D — Naming Examples

### Appendix E — Special Character Rules

### Appendix F — Construction Discipline Codes

### Appendix G — Document Type Codes

### Appendix H — Master Data Coding Matrix

### Appendix I — Naming Standard Matrix

### Appendix J — Code Governance Rules

Keep appendices focused on standards and examples, not actual operational master-data records.

---

# 53. DOCUMENT STRUCTURE

Produce the final document using this structure:

```text
DCOS-MDM-COD-001
DCOS Master Data Coding & Naming Standard

DOCUMENT CONTROL

1. Introduction
2. Purpose
3. Scope
4. Relationship to DCOS-MDM-STD-001
5. Relationship to DCOS-MDM-CAT-001
6. Coding & Naming Principles
7. Identifier Types
8. General Business Code Standard
9. Prefix Standard
10. Domain Code Standard
11. Sequence Number Standard
12. Year Component Standard
13. Project Code Standard
14. WBS Code Standard
15. Material Code Standard
16. Supplier / Business Partner Code Standard
17. Employee / Person Code Standard
18. Equipment Code Standard
19. Location Code Standard
20. BOQ Code Standard
21. Cost Code Standard
22. Contract Code Standard
23. Document Numbering Standard
24. Naming Standard
25. Abbreviation Standard
26. Character Standard
27. Language Standard
28. Case Standard
29. Special Character Standard
30. Version / Revision / Sequence
31. Code Change Policy
32. Retired Code Policy
33. Duplicate Prevention
34. Project vs Enterprise Codes
35. Multi-Company Standard
36. Multi-Project Standard
37. BIM & Engineering Coding
38. File & Folder Naming
39. Code Generation
40. Code Validation
41. Coding Governance
42. Exceptions
43. Coding Anti-Patterns
44. Coding Examples
45. Master Coding Matrix
46. Naming Standard Matrix
47. Code Component Matrix
48. Master Data Code Hierarchy
49. Implementation Rules
50. Migration & Legacy Data
51. Integration Requirements
52. Audit & Traceability
53. Appendices
```

---

# 54. WRITING REQUIREMENTS

Write the document as a **formal enterprise standard**, not as an AI explanation.

Use:

- Professional enterprise language
- Construction-industry terminology
- Data-governance terminology
- Clear tables
- Consistent terminology
- Numbered sections
- Practical examples
- Normative requirements

Use:

- **SHALL** = mandatory
- **SHOULD** = recommended
- **MAY** = optional

Avoid unnecessary academic theory.

Avoid making the document excessively complicated.

The objective is:

> **Simple enough for users to understand, strict enough for the system to enforce, and scalable enough for enterprise use.**

---

# 55. IMPORTANT ARCHITECTURAL RULE

Do not create codes that contain too much business information.

Follow this principle:

> **Identity should be stable; attributes should be stored separately.**

For example, avoid:

```text
MAT-STR-CEMENT-42.5N-50KG-2026
```

if the material master already stores:

- Material Category
- Material Type
- Specification
- Grade
- Size
- Brand
- UOM

Prefer:

```text
MAT-STR-000123
```

with the attributes maintained separately.

Likewise, do not make an employee code dependent on:

- Department
- Project
- Position
- Location

because those attributes can change.

---

# 56. IMPORTANT ARCHITECTURAL DISTINCTION

The document SHALL clearly distinguish:

```text
Technical ID
       ≠
Business Code
       ≠
Name
       ≠
Description
       ≠
Classification
       ≠
Version
       ≠
Revision
       ≠
Status
```

This distinction is one of the most important principles of the DCOS coding architecture.

---

# 57. FINAL QUALITY CONTROL

Before completing the document, perform an internal architecture review.

Check that:

- Every major DCOS master-data domain has a coding approach.
- Prefixes are unique.
- Codes are stable.
- Codes do not contain unnecessary attributes.
- Naming rules are consistent.
- Abbreviations are controlled.
- Sequence rules are clear.
- Year rules are clear.
- Enterprise and project codes are distinguished.
- Technical IDs and business codes are separated.
- Document numbers and revisions are separated.
- WBS and Cost Codes are not unnecessarily identical.
- Material codes are not overloaded with technical specifications.
- Supplier / Business Partner architecture is logically consistent.
- Employee codes remain stable across organizational changes.
- Equipment codes remain stable across project movements.
- Retired codes are not reused.
- Duplicate prevention is addressed.
- Legacy migration is considered.
- External integration is considered.
- BIM and engineering requirements are considered.
- Multi-company and multi-project environments are supported.
- The standard is consistent with DCOS-MDM-STD-001.
- The standard is consistent with DCOS-MDM-CAT-001.
- The document does not become a database specification.
- The document does not contain unnecessary individual master-data records.

---

# 58. EXPECTED FINAL OUTPUT

Produce a complete:

> **DCOS-MDM-COD-001 — DCOS Master Data Coding & Naming Standard**

The final document must allow DCOS management, business users, data stewards, developers, database architects, and system administrators to understand:

> **How should a DCOS master-data entity be identified?**

> **How should it be coded?**

> **How should it be named?**

> **What prefix should be used?**

> **When should a sequence be used?**

> **When should a year be included?**

> **What characters are allowed?**

> **How are enterprise and project codes differentiated?**

> **How are codes kept stable?**

> **How are duplicate codes prevented?**

> **How are retired codes handled?**

> **How are codes generated and validated by DCOS?**

Do not create detailed database tables, SQL, APIs, or UI specifications.

Those belong to later technical documentation.

The purpose of this document is to establish the **enterprise coding and naming rules** that every DCOS implementation SHALL follow.

End the document with:

**END OF DCOS-MDM-COD-001**