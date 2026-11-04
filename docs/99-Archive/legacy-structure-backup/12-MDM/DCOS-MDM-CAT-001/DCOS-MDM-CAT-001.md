# DCOS-MDM-CAT-001 â€” DCOS Master Data Catalogue

| Document control | Value |
|---|---|
| Document ID | DCOS-MDM-CAT-001 |
| Version | 1.0 Draft for Owner Review |
| Status | Draft for Standardization |
| Parent standard | [DCOS-MDM-STD-001](../DCOS-MDM-STD-001/DCOS-MDM-STD-001.md) |
| Related standard | [DCOS-MDM-COD-001](../DCOS-MDM-COD-001/DCOS-MDM-COD-001.md) |
| Owner | DCOS Enterprise Architecture / Data Governance |

> This catalogue defines the entities DCOS recognizes as master or controlled reference data. â€œCandidate/current sourceâ€ records existing repository evidence and does not certify deployed schema or approve a migration. Domain owners shall ratify ownership and first-release scope.

## 1. Purpose and scope

This catalogue answers **what master data exists in DCOS**. It establishes stable domain/entity identifiers, definitions, classification, business ownership, module consumers, and high-level relationships. It is not a database dictionary and does not define every field, SQL table, API, UI, validation rule, or populated library record.

The catalogue follows the DCOS principle: one business identity has one controlled definition in its approved scope. A consumer module may hold process-specific attributes or transaction snapshots but must not create a competing identity.

## 2. Classification

| Class | Meaning |
|---|---|
| Platform reference | Shared controlled vocabulary or classification managed for the DCOS platform. |
| Tenant | Company-owned identity or library reusable across the company's projects. |
| Project | Project-owned structure or configuration governed within one project. |
| Resource | Reusable material, labor, equipment, or cost/resource definition; scope is stated per entity. |
| Transaction-supporting reference | Controlled value used by transactions, whose historical meaning must be preserved. |

â€œMandatoryâ€ means required for the platform to operate consistently at enterprise level. It does not mean every tenant must populate every optional entity immediately.

## 3. Catalogue

| Entity code | Entity | Definition / purpose | Class | Enterprise mandatory | Business owner function | Primary DCOS consumers | High-level relationship / current source note |
|---|---|---|---|---|---|---|---|
| ORG | Organization | Legal or operating organization participating in DCOS. | Tenant | Yes | Corporate Administration | Admin, Project, Finance, HR | Parent concept for companies and parties; no new parallel organization table until party model is decided. |
| COM | Company / Tenant | Company boundary owning isolated DCOS data. | Tenant | Yes | Corporate Administration / IT | All modules | Current source candidate: `companies`; `profiles.company_id` and JWT `tenant_id` use this identity. |
| BUS | Business Unit | Internal operating unit with delegated ownership or reporting. | Tenant | Optional | Corporate Administration | Project, HR, Finance, Reporting | Belongs to Company; repository ownership/scope needs confirmation. |
| DEP | Department | Internal functional organization unit. | Tenant | Optional | HR / Corporate Administration | HR, Project, Finance, Admin | Current `departments` records; company scope requires review. |
| TEAM | Team | Working group under a department. | Tenant | Optional | HR | HR, Project, Construction | Related to Department and member profiles. |
| POS | Position | Approved organizational role/position, distinct from a user permission role. | Tenant | Optional | HR | HR, Admin | Current `positions` records; distinguish job position from authorization role. |
| PER | Person | Natural person identity, independent of login or employment relationship. | Tenant | Optional | HR / Data Governance | HR, Stakeholder, Project, HSE | Candidate shared identity; do not merge `profiles` and `stakeholder_staff` before privacy review. |
| USR | System User | Authenticated account with DCOS access. | Tenant | Yes | IT / Security | All authorized modules | Supabase Auth identity linked to `profiles`; not an employee number or person code. |
| EMP | Employee | Person with an employment relationship to a company. | Tenant | Optional | HR | HR, Payroll, Construction, HSE | HR attributes currently extend `profiles`; employment lifecycle and privacy remain HR-controlled. |
| PRJ | Project | Time-bound construction or real-estate undertaking. | Project | Yes | Project Controls | Project, WBS, Planning, Design, QS, Procurement, Execution, Finance | Current source candidate: `projects`; UUID remains identity and WBS is subordinate. |
| PHA | Project Phase | Governed project stage or delivery phase. | Project | Optional | Project Controls | Project, Planning, Reporting | Belongs to Project; may use a controlled phase template. |
| WBS | WBS Node | Project breakdown location or control node. | Project | Yes | Project Controls | Planning, Design, QS, Procurement, Execution, QA/QC, HSE, Documents | Current `wbs_nodes`; project-scoped; task records link to project/WBS as designed. |
| TSK | Task Template | Reusable definition of a work task, distinct from an actual scheduled task. | Resource | Optional | Construction / Planning | Construction, Planning, QA/QC | Template may generate project tasks; actual `wbs_tasks` remain project records. |
| BLD | Building | Building or major facility node within a project. | Project | Optional | Project Controls / Design | WBS, BIM, Design, Construction, Handover | Usually represented by a WBS node; do not duplicate if the WBS node is sufficient. |
| LVL | Level | Storey or level within a building. | Project | Optional | Project Controls / Design | WBS, BIM, Design, Construction | Child of Building or project WBS location. |
| ZON | Zone | Spatial subdivision within a project/building/level. | Project | Optional | Project Controls / Design | WBS, BIM, Construction, QA/QC | Part of project spatial/WBS context. |
| ROM | Room / Space | Defined room, space, or maintainable area. | Project | Optional | Design / Facility Management | Design, BIM, QA/QC, Handover, FM | Part of project location hierarchy; may instantiate a Room Template. |
| LOC | Location | Physical or logical location used for delivery, storage, documents, or work. | Project | Optional | Project Controls / Logistics | Project, Procurement, Inventory, Construction, HSE | Can reference WBS/spatial nodes; distinguish project location from postal address. |
| RMT | Room Template | Reusable room/space type and standard attributes. | Resource | Optional | Design / Facility Management | Design, BIM, Handover, FM | Template used to create project Rooms; not the project Room itself. |
| ELM | Element Template | Reusable construction element definition. | Resource | Optional | Design / BIM / Engineering | Design, BIM, QS, QA/QC, Handover | Can map to WBS, materials, tasks, inspection requirements. |
| PAR | Business Party | External legal or business entity participating in DCOS, independent of its business role. | Tenant | Optional | Corporate / Finance | Stakeholder, Procurement, QS, Finance, Contracts | Recommended future canonical identity; current `stakeholders`, `procurement_suppliers`, and DWL supplier records require survivorship mapping. |
| SUP | Supplier Role | Party qualified to supply goods/services to a company. | Tenant | Optional | Procurement | Procurement, Inventory, QS, Finance | Role/qualification of Party; supplier-specific ratings and terms belong to role/profile, not duplicate legal identity. |
| SUB | Subcontractor Role | Party contracted for defined subcontract works. | Tenant | Optional | Subcontract Management | Procurement, Construction, QS, Contracts, HSE | Role/qualification of Party; project contract and performance are separate records. |
| CUS | Customer / Client Role | Party receiving or commissioning work. | Tenant | Optional | Commercial / Business Development | Project, QS, Contracts, Finance | Role of Party; project-specific client relationship belongs to Project. |
| CON | Consultant / Contractor Role | Party engaged for professional or delivery services. | Tenant | Optional | Project / Procurement | Project, Design, Procurement, Contracts | Role of Party; project appointments are separate relationships. |
| MAT | Material / Resource | Reusable technical material identity with category and descriptive attributes. | Resource | Optional | Engineering / QS / Procurement | Design, BIM, QS, Procurement, Inventory, QA/QC | Candidate current source: DWL resources/attributes/spec revisions; map to tenant inventory `inv_items` before selecting authority. |
| MATS | Material Specification | Effective-dated technical specification/grade/standard applicable to a material. | Resource | Optional | Engineering / QA/QC | Design, BIM, Procurement, QA/QC, Handover | Revisions belong to Material; project material approvals are separate project records. |
| EQT | Equipment Type | Reusable equipment/plant/tool type or model definition. | Resource | Optional | Plant / Engineering | Procurement, Construction, QA/QC, HSE | Distinct from owned/leased physical asset. |
| AST | Equipment Asset | Individually identifiable owned, leased, or hired physical equipment item. | Tenant | Optional | Plant / Asset Management | Construction, HSE, Maintenance, Finance | May be an instance of Equipment Type and assigned to projects; utilization is transactional. |
| LAB | Labor Resource Type | Reusable labor/trade/crew classification or productivity resource. | Resource | Optional | HR / Planning / QS | Planning, QS, Construction, HR | Distinct from Employee identity and actual timesheet events. |
| CST | Cost Code | Controlled cost classification used for budgets, commitments, actuals, and reporting. | Tenant or Project | Optional | Finance / QS | QS, Procurement, Planning, Finance | Scope and chart ownership defined by company; project mapping may extend, not redefine, the chart. |
| BOQ | BOQ Classification | Controlled structure or item classification for bill-of-quantities work. | Tenant or Project | Optional | QS | QS, Procurement, Planning, Finance | Actual BOQ lines/quantities/prices are project/commercial records, not master data. |
| UOM | Unit of Measure | Controlled unit used in quantities and rates. | Platform reference | Yes | QS / Data Governance | QS, Procurement, Inventory, Construction, Finance | Canonical unit plus governed conversion factors; transaction captures unit used. |
| CUR | Currency | ISO or approved currency definition. | Platform reference | Yes | Finance | QS, Procurement, Finance, Reporting | Currency conversion rates are effective-dated reference/financial data, not currency identity. |
| TAX | Tax Category | Controlled tax classification or treatment code. | Tenant or Platform reference | Optional | Finance / Tax | Procurement, AP, Finance | Jurisdiction-specific application is configured separately; do not infer legal obligations from this catalogue. |
| DIS | Discipline | Controlled construction/design discipline classification. | Platform reference | Yes | Engineering / Data Governance | Design, BIM, WBS, QS, Construction, QA/QC, HSE | Platform vocabulary with governed tenant extensions only by exception. |
| DOC | Document Type | Controlled classification of managed documents and records. | Tenant or Platform reference | Optional | Document Control | Documents, Design, QA/QC, HSE, Handover | Document instances, revisions, and transmittals are managed records, not master data. |
| WHS | Warehouse / Store | Authorized inventory storage location. | Project | Optional | Inventory / Logistics | Inventory, Procurement, Finance | Project/tenant-owned location; stock balances and movements are transactions. |
| CTR | Contract Type | Controlled contract classification/template. | Tenant | Optional | Commercial / Legal | Contracts, QS, Procurement, Finance | Contract instance, terms, amendments, and claims remain transactional/project records. |
| HSE | HSE Classification | Controlled hazard, incident, risk, or control taxonomy. | Tenant or Platform reference | Optional | HSE | HSE, Construction, QA/QC, Reporting | Actual risk assessments and incidents are project records. |
| QAC | QA/QC Classification | Controlled inspection/test/checklist categories. | Tenant or Platform reference | Optional | Quality | QA/QC, Design, Construction, Handover | Templates are reusable; inspection results and NCRs are transactions. |

## 4. Catalogue interpretation and boundaries

1. **Master versus transaction:** A Supplier is a master/role; an RFQ, quotation, PO, invoice, and supplier performance event are transactions. A Material is a reusable identity; stock, batch/lot, approved submittal, purchase price, and consumption are separate records.
2. **Templates versus instances:** Task, element, and room templates are reusable resources. Project tasks, BIM elements, and rooms are project instances linked to the relevant template where appropriate.
3. **Person versus account:** Person, Employee, and System User are related but distinct concepts. A person may have an account; an account may not be an employee; external contacts may have no account.
4. **Party versus role:** Supplier, subcontractor, customer, consultant, and contractor describe business roles. One legal party may have several roles without receiving duplicate identities.
5. **Cost versus identity:** A resource price is effective-dated commercial evidence linked to resource, supplier, currency, and location. It does not redefine resource identity.
6. **WBS integration:** WBS gives project context and roll-up. It does not replace the identity of materials, parties, people, equipment, or reference values.
7. **Authority before migration:** The candidate sources in this catalogue are not consolidated automatically. Domain owners must approve a source-of-record and survivorship map before any merge or consumer cutover.

## 5. Initial release recommendation

The recommended first release is governance of existing Project/WBS identities plus a controlled supplier/party and material/resource reconciliation. Build no universal CRUD library for all entities in this catalogue at once. Reference lists and other resource domains enter implementation when an owner, consumer, and migration path are named.

## 6. Governance and maintenance

Each entity SHALL have a domain owner, steward, scope, authoritative source, and lifecycle before it is enabled for creation or change in DCOS. A new entity or material change to classification SHALL be reviewed by the MDM governance board. Revisions SHALL record effective date, reason, and affected consumers.

This catalogue SHALL be reviewed annually and when DCOS adds a material business domain or changes its enterprise architecture. Changes to entity codes require a documented cross-reference; retired codes SHALL not be reassigned.
