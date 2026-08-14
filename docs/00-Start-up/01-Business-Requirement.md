# DCOS — Module 01 Company / Tenant Setup
## Document 01 — Business Requirement

**Digital Construction Operating System — Foundation Layer**

| Field | Value |
|---|---|
| Document Code | DCOS-CMP-01-BR |
| Module | 01 — Company / Tenant Setup |
| Module Code | `CMP` |
| Group | Foundation |
| Module Path | `01-Foundation / 01-Company-Tenant-Setup` |
| Document Tier | Tier 3 — Light (6 documents) |
| Version | R1 — Initial Issue |
| Parent Documents | DCOS System Architecture Module Design R0 (§5 Module 2, §23 Admin Configuration) · DCOS Gap Analysis R1 (§5.2 Multi-Tenant Security, §6 Module 01) |
| Related Modules | 03-01 Authentication · 03-02 RBAC · Admin Configuration · Project Setup · Account / Finance |
| Build Phase | P1 — Foundation (hard dependency for every other module) |
| Classification | Internal — Strategic Architecture |
| Status | For Development |

---

## 1. Purpose

The Company / Tenant Setup module creates and governs the **top-level container** that every other record in DCOS lives inside.

> Nothing exists in DCOS without a company. No project, no WBS node, no drawing, no purchase order, no timesheet, no audit log. The company record is row zero.

This module answers three questions:

1. **Who is the customer?** — the tenant: a construction company or group that has bought DCOS.
2. **Which legal entity is acting?** — the specific registered company whose name, tax number, and seal appear on a purchase order, subcontract, IPC, or transmittal.
3. **What is this tenant allowed to use?** — subscription plan, module entitlement, user seats, storage quota, data residency.

It does **not** manage users (03-01 Authentication), permissions (03-02 RBAC), or operational master data such as document types and cost codes (Admin Configuration). Those modules configure *behaviour*; this module establishes *identity and entitlement*.

---

## 2. Business Context — Why This Is Not a Simple "Company Profile" Form

Most SaaS platforms treat company setup as a settings page with a logo upload. In construction that assumption breaks within the first month of a real deployment.

| Construction Reality | Consequence for This Module |
|---|---|
| A contractor group runs **several registered legal entities** — main contractor, MEP subsidiary, precast/plant company, property development arm | One tenant must hold many legal entities. The entity that signs a PO is not always the entity that employs the person raising it |
| Projects are frequently won by a **Joint Venture** formed for that project only | JV must be a first-class entity type with participating interest percentages, not a free-text project note |
| Staff move **between group companies** week to week | One user identity, many company memberships. Employment entity and operating entity can differ |
| A subcontract is signed by Entity A but executed by staff on Entity B's payroll | Cost centre and employing entity must both be recorded, or labour cost allocation is wrong |
| The company **seal, letterhead, and authorised signatory** appear on every transmittal, IPC, and PO | Branding is contractual output, not decoration. A wrong letterhead on an IPC is a rejected claim |
| Contracts in **USD**, statutory reporting in **KHR** | Base currency, reporting currency, and contract currency are three different fields |
| Cambodian construction works a **6-day week** with roughly 22 public holidays | The company working calendar drives every schedule float calculation, timesheet, and leave balance in the platform |
| Site labour turnover is **weekly**; office headcount is stable | Named-seat licensing bankrupts the customer. Seat model must separate office seats from field seats |
| BIM models run to **gigabytes** | Storage quota is a real commercial lever, not a hidden limit |
| A client audit may occur **years after handover** | Company and entity records must be versioned and never hard-deleted |
| Multiple companies share one platform | Tenant isolation is a **commercial liability**, not a technical preference — see Gap Analysis R1 §5.2 |

A platform that gets this module wrong does not fail loudly. It fails when the first IPC goes out under the wrong legal entity's tax number and the client's QS rejects the claim, or when Company B's project director opens a dashboard and sees Company A's tender pipeline.

---

## 3. Key Stakeholders

| Stakeholder | Interaction with This Module |
|---|---|
| **Platform Owner / Super Admin** | Provisions tenants, sets plans and quotas, suspends for non-payment, executes break-glass access |
| **Company Admin** | Owns day-to-day company profile, legal entities, branches, departments, calendar, branding |
| **Director / CEO** | Approves legal entity additions, group restructures, JV formation, plan upgrades |
| **Finance Manager / Accountant** | Consumes legal entity tax data, bank accounts, fiscal year, base currency for all financial output |
| **QS / Commercial Manager** | Relies on the correct contracting entity appearing on subcontracts and IPCs |
| **Document Controller** | Relies on company code, project code prefix, and letterhead for document numbering and transmittals |
| **HR Officer** | Maps employees to employing legal entity, branch, and department; consumes the working calendar |
| **Project Manager** | Selects the executing entity and branch when creating a project |
| **IT / Security** | Data residency, tenant isolation verification, export and retention compliance |
| **Auditor / Claims Team** | Reads the historical entity record that was live on the date a document was issued |

---

## 4. Scope

### 4.1 In Scope

- Tenant provisioning, activation, suspension, termination, and archive
- Company (tenant) master profile and company code
- Legal entity register — registration numbers, tax identifiers, registered addresses, directors
- Group structure and ownership relationships, including Joint Ventures and SPVs
- Branch, regional office, site office, yard, and warehouse register
- Department and discipline master for the company
- Company working calendar, working week, shift patterns, and public holiday register
- Financial defaults — base currency, reporting currency, fiscal year start, tax profile per entity
- Company bank account register (reference data for payment instructions)
- Numbering conventions — company code, project code prefix, document number pattern seed
- Branding assets — logo, letterhead, company seal image, authorised signature blocks
- Subscription plan, billing cycle, seat allocation, module entitlement, storage quota
- Quota consumption tracking and threshold alerts
- Data residency selection and tenant isolation guarantees
- Tenant data export and offboarding
- Company-level audit of all of the above

### 4.2 Out of Scope

| Concern | Owning Module |
|---|---|
| User accounts, invitations, login, sessions, MFA | 03-01 Authentication |
| `tenant_auth_policy` definition (password rules, MFA enforcement, session timeouts) | 03-01 Authentication §7.8 — surfaced read/write in this module's UI, owned there |
| Role definition, permission matrix, delegation of authority limits | 03-02 RBAC |
| Document types, cost codes, material codes, checklist templates, approval workflow templates | Admin Configuration |
| Project creation and project team assignment | Project Setup |
| Chart of accounts, tax rates, exchange rates, GL posting | Account / Finance · Multi-Currency / FX |
| Employee master records, payroll, attendance | HR Module |
| Stakeholder (client, consultant, supplier) organisation records | Stakeholder Management |
| Actual billing, invoicing the customer, payment collection | Platform Billing (external — Stripe / manual invoice) |

**Boundary note — company vs stakeholder.** A *company* is the tenant: the DCOS customer. A *stakeholder* is an external organisation (client, consultant, supplier, subcontractor) that the tenant works with. They are separate tables and must never be merged, even when Company A is a subcontractor to Company B and both are DCOS tenants. Each sees the other only as a stakeholder record inside its own tenant.

---

## 5. Business Objectives

| # | Objective | Measure of Success |
|---|---|---|
| BO-01 | Guarantee absolute data isolation between tenants | Zero cross-tenant read events; automated leak test passing in CI on every build |
| BO-02 | Support multi-entity construction groups without duplicate tenants | One tenant supports ≥ 10 legal entities and ≥ 5 JVs with correct document attribution |
| BO-03 | Ensure every contractual output carries the correct legal entity and branding | 100% of POs, subcontracts, IPCs, and transmittals render the entity resolved from the project, not a global default |
| BO-04 | Reduce new tenant time-to-first-project | Onboarding wizard completed in under 60 minutes for a standard contractor |
| BO-05 | Make the working calendar the single source of truth for all date arithmetic | Planning, timesheet, leave, and SLA modules all read one calendar; no module holds its own holiday list |
| BO-06 | Make entitlement enforceable without code changes | Module on/off, seat count, and storage quota changed by Super Admin with effect inside 5 minutes |
| BO-07 | Preserve historical company data for the life of a dispute | Entity and profile changes are versioned; a document issued in 2026 resolves the 2026 entity details in 2033 |

---

## 6. Business Requirements

Priority uses MoSCoW: **M** = Must (P1 MVP), **S** = Should (P1/P2), **C** = Could (P2/P3), **W** = Won't (this release).

### 6.1 Tenant Provisioning and Lifecycle

| ID | Requirement | Priority |
|---|---|---|
| BR-CMP-001 | The platform shall create a tenant only through an authorised provisioning action by a Super Admin or a controlled self-serve trial flow. Tenants shall never be auto-created from a login. | M |
| BR-CMP-002 | Each tenant shall be assigned a globally unique, immutable **company code** (3–6 uppercase alphanumeric) used as the root of all project and document numbering. | M |
| BR-CMP-003 | The tenant shall progress through a defined lifecycle: `Provisioning → Trial → Active → Past Due → Suspended → Terminating → Terminated → Archived`, with reactivation permitted from Past Due and Suspended. | M |
| BR-CMP-004 | A suspended tenant shall retain all data, permit read-only access for Company Admin only, and block all create/update operations and all API traffic. | M |
| BR-CMP-005 | Termination shall require an explicit, dual-confirmed Super Admin action, a mandatory retention hold period (default 90 days), and a completed data export before data is purged. | M |
| BR-CMP-006 | The platform shall never hard-delete a tenant record. Archive only, with the company code permanently reserved. | M |
| BR-CMP-007 | Every lifecycle transition shall be recorded with actor, reason, effective date, and prior state, and shall be irreversible in the audit log. | M |

### 6.2 Company Master Profile

| ID | Requirement | Priority |
|---|---|---|
| BR-CMP-010 | The system shall hold a company master profile: trading name, company code, industry classification, head office address, primary contact, telephone, email, website, and logo. | M |
| BR-CMP-011 | The company profile shall define platform-wide defaults: base currency, reporting currency, default timezone, default language, date format, number format, and unit system (metric/imperial). | M |
| BR-CMP-012 | Base currency shall be immutable once the first financial transaction exists in the tenant. | M |
| BR-CMP-013 | Supported interface languages shall include English and Khmer at minimum, with the company setting a default and users able to override individually. | S |
| BR-CMP-014 | Changes to company profile fields shall be versioned, with the previous value retained and timestamped. | M |

### 6.3 Legal Entity Register

| ID | Requirement | Priority |
|---|---|---|
| BR-CMP-020 | The system shall support **multiple legal entities within one tenant**, with exactly one designated as the primary entity. | M |
| BR-CMP-021 | Each legal entity shall record: legal name (English and local script), entity type, registration number, tax identification number (TIN), VAT registration, incorporation date, registered address, operating address, and country of registration. | M |
| BR-CMP-022 | Entity types shall include: Holding, Operating Company, Subsidiary, Joint Venture, Special Purpose Vehicle, Branch Entity, and Representative Office. | M |
| BR-CMP-023 | The system shall record ownership and group relationships between entities, including parent entity and ownership percentage. | S |
| BR-CMP-024 | For Joint Venture entities, the system shall record each participant (internal entity or external stakeholder) and its participating interest percentage, which must total 100%. | S |
| BR-CMP-025 | Each entity shall record its directors/authorised signatories with name, position, and signing authority scope, for rendering on contractual output. | S |
| BR-CMP-026 | Each project shall be assigned a **contracting entity** at creation; this entity's details shall be used on all contractual output for that project. | M |
| BR-CMP-027 | An entity with linked projects, contracts, or financial transactions shall not be deleted. It may be set Dormant or Dissolved with an effective date. | M |
| BR-CMP-028 | Entity records shall be versioned so that a document issued on a past date renders the entity details as they were on that date. | S |
| BR-CMP-029 | Tax identifiers, registration numbers, and bank account details shall be treated as restricted fields, visible only to permitted roles and masked elsewhere. | M |

### 6.4 Organisation Structure — Branches, Departments, Disciplines

| ID | Requirement | Priority |
|---|---|---|
| BR-CMP-030 | The system shall maintain a branch/office register with types: Head Office, Regional Office, Project Office, Site Office, Yard, Workshop, Warehouse. | M |
| BR-CMP-031 | Each branch shall link to a legal entity, an address, geographic coordinates, a branch manager, and an optional cost centre code. | S |
| BR-CMP-032 | The system shall maintain a department master (e.g. Design, Procurement, Construction, QA/QC, HSE, HR, Finance, Commercial) with a department head and optional parent department for sub-departments. | M |
| BR-CMP-033 | The system shall maintain a discipline master with codes used throughout the platform (ARC, STR, MEP, CIVIL, GEO, BIM, LAND). Discipline codes are referenced by WBS, documents, drawings, tasks, and access scoping. | M |
| BR-CMP-034 | Discipline codes shall be immutable once referenced by any record; the display name may be edited. | M |
| BR-CMP-035 | Departments and branches shall support activate/deactivate rather than delete when historical records exist. | M |

### 6.5 Working Calendar

| ID | Requirement | Priority |
|---|---|---|
| BR-CMP-040 | The system shall define a default company working calendar: working days of week, standard daily hours, standard start/finish times, and break periods. | M |
| BR-CMP-041 | The calendar shall support a 6-day working week as the default configuration for the Cambodian market, and any other pattern by configuration. | M |
| BR-CMP-042 | The system shall maintain a public holiday register per calendar year and per country, with holiday name, date, and whether it is a paid non-working day. | M |
| BR-CMP-043 | The system shall support **multiple calendars per tenant** — e.g. an office calendar and a site calendar — with one designated as default and each project able to select one. | S |
| BR-CMP-044 | The working calendar shall be the single authoritative source consumed by Planning & Scheduling (working-day duration and float), Timesheet, Leave, and all SLA/escalation timers. No module shall hold a private holiday list. | M |
| BR-CMP-045 | Changing a calendar shall not retroactively alter closed timesheet periods or approved schedule baselines; the change applies forward from an effective date. | M |
| BR-CMP-046 | The system shall support per-project calendar overrides for shutdown periods (e.g. Khmer New Year site closure, monsoon suspension). | C |

### 6.6 Numbering and Coding Conventions

| ID | Requirement | Priority |
|---|---|---|
| BR-CMP-050 | The company code shall be the root segment of project codes and document numbers. | M |
| BR-CMP-051 | The system shall allow the Company Admin to define numbering patterns per record type (project, document, PR, PO, RFI, NCR, IPC, transmittal) using tokens: `{COMPANY}`, `{PROJECT}`, `{ENTITY}`, `{DISCIPLINE}`, `{TYPE}`, `{YEAR}`, `{SEQ:n}`. | M |
| BR-CMP-052 | Sequence counters shall be atomic, gap-free within a scope, and never reused after a record is voided. Voided numbers remain permanently consumed. | M |
| BR-CMP-053 | A numbering pattern shall not be editable once sequences have been issued under it; a new pattern takes effect from a stated effective date with the old pattern retained for historical records. | M |
| BR-CMP-054 | The system shall preview a sample generated number before a pattern is saved. | S |

### 6.7 Branding and Contractual Output

| ID | Requirement | Priority |
|---|---|---|
| BR-CMP-060 | The system shall store branding assets per legal entity: primary logo, monochrome logo, letterhead header and footer, company seal/stamp image, and brand colour. | M |
| BR-CMP-061 | Branding shall be applied automatically to all generated PDF output — transmittals, IPCs, POs, subcontracts, inspection requests, NCRs, and reports — resolved from the project's contracting entity. | M |
| BR-CMP-062 | The system shall store authorised signature blocks (name, position, signature image) usable on certificates and transmittals, with use restricted by RBAC and requiring step-up authentication. | S |
| BR-CMP-063 | Uploaded branding assets shall be validated for file type, dimension, and size, and scanned for malware before storage. | M |

### 6.8 Subscription, Entitlement, and Quota

| ID | Requirement | Priority |
|---|---|---|
| BR-CMP-070 | Each tenant shall hold a subscription record: plan, billing cycle, start date, renewal date, contracted seat counts, storage quota, and status. | M |
| BR-CMP-071 | Seats shall be tracked in at least two classes: **Full seats** (office/professional users) and **Field seats** (site staff, phone-OTP users), priced and counted separately. | M |
| BR-CMP-072 | External participants (client, consultant, subcontractor, supplier guests) shall not consume Full seats and shall be counted separately with their own cap. | M |
| BR-CMP-073 | Module entitlement shall be configurable per tenant. A disabled module shall be hidden from navigation and shall reject API calls with a distinct entitlement error, not a permission error. | M |
| BR-CMP-074 | The system shall track consumption against quotas: active users by class, projects, storage in GB, API calls per month, and generate alerts at 80% and 95%. | M |
| BR-CMP-075 | Exceeding a seat cap shall block new user activation with a clear upgrade message; it shall never deactivate existing users automatically. | M |
| BR-CMP-076 | Exceeding storage quota shall block new uploads at 100% while preserving all read and download access. | M |
| BR-CMP-077 | Plan changes shall take effect within 5 minutes across all sessions without requiring users to re-authenticate. | S |
| BR-CMP-078 | The system shall retain a full history of subscription changes for commercial dispute resolution. | S |

### 6.9 Tenant Isolation, Residency, and Exit

| ID | Requirement | Priority |
|---|---|---|
| BR-CMP-080 | Every tenant-scoped table shall carry `company_id` and enforce PostgreSQL Row-Level Security. A table without an RLS policy shall fail the CI build. | M |
| BR-CMP-081 | `company_id` shall be derived exclusively from the verified DCOS session token, never from a request body or query parameter. | M |
| BR-CMP-082 | File storage shall be partitioned by tenant with no shared path prefixes; signed URLs shall be scoped and time-limited. | M |
| BR-CMP-083 | Background jobs, scheduled tasks, exports, and report generation shall be tenant-scoped and shall not be able to enumerate other tenants. | M |
| BR-CMP-084 | Super Admin access to tenant data shall require explicit impersonation with a mandatory reason, a time-boxed session, and a high-priority notification to the Company Admin. | M |
| BR-CMP-085 | The tenant shall select a data residency region at provisioning; the region shall be immutable without a formal migration process. | S |
| BR-CMP-086 | The Company Admin shall be able to request a full tenant data export in open formats (CSV/JSON plus original files) at any time, delivered as a signed, expiring download. | M |
| BR-CMP-087 | Export requests shall be rate-limited, require step-up authentication, and be logged as a Critical-severity audit event. | M |

---

## 7. Business Rules

| ID | Rule |
|---|---|
| RULE-CMP-01 | One tenant = one DCOS customer account. Group companies share a tenant; competitors never do. |
| RULE-CMP-02 | `company_id` is the tenant key. Legal entities are a dimension inside the tenant, not separate tenants. |
| RULE-CMP-03 | Exactly one legal entity per tenant is flagged primary at all times. |
| RULE-CMP-04 | A project must reference a contracting entity before it can leave Draft status. |
| RULE-CMP-05 | Base currency cannot change once any financial transaction exists. |
| RULE-CMP-06 | Company code cannot change, ever. It is embedded in issued document numbers. |
| RULE-CMP-07 | Discipline codes cannot change once referenced. Names can. |
| RULE-CMP-08 | JV participating interests must total exactly 100.00%. |
| RULE-CMP-09 | Deactivating a department or branch requires reassignment of all active users linked to it. |
| RULE-CMP-10 | Deactivating a legal entity requires that it has no active projects or open contracts. |
| RULE-CMP-11 | Numbering sequences are gap-free and never reused. |
| RULE-CMP-12 | Suspension is reversible; termination after the retention hold is not. |
| RULE-CMP-13 | Restricted fields (TIN, VAT, bank account, subscription commercials) are masked by default and unmasked only by permitted roles, with the unmask event audited. |
| RULE-CMP-14 | Calendar changes apply from an effective date forward and never rewrite closed periods. |
| RULE-CMP-15 | Nothing in this module is hard-deleted. Deactivate, dissolve, or archive. |

---

## 8. Assumptions, Dependencies, and Constraints

### 8.1 Assumptions

- A tenant is onboarded by an authorised platform operator; unrestricted public self-signup is not offered for production tenants.
- Company Admin users are trained and act as the customer's system owner.
- Legal and tax data are supplied by the customer and are not validated against government registries in this release.
- The majority of first-market tenants operate in Cambodia with USD contracts and KHR statutory obligations.

### 8.2 Dependencies

| Depends On | Nature |
|---|---|
| 03-01 Authentication | Cannot verify a Company Admin without identity. Tenant status gates every login. |
| 03-02 RBAC | Role definitions used by this module's permission matrix. |
| Audit Trail Engine | All company events must be recorded. |
| Notification Engine | Provisioning, quota, expiry, and suspension alerts. |
| File Storage Architecture | Branding assets and export packages. |
| Platform Billing (external) | Subscription commercial state feeds tenant lifecycle. |

### 8.3 Constraints

- PostgreSQL / Supabase Row-Level Security is the isolation mechanism for the MVP; application-layer filtering alone is not acceptable.
- The module must be operable by a non-technical Company Admin — no SQL, no configuration files.
- Company setup must be completable on a laptop; mobile is read-only for this module.

---

## 9. Acceptance Criteria

| # | Criterion |
|---|---|
| AC-01 | A Super Admin can provision a new tenant, and a Company Admin can complete the onboarding wizard and create a first project, within 60 minutes with no engineering support. |
| AC-02 | A tenant with 3 legal entities and 1 JV produces a PO, a subcontract, and an IPC each carrying the correct entity name, TIN, address, logo, and signatory. |
| AC-03 | An automated test attempting to read Company B data using a Company A session fails on every tenant-scoped table. |
| AC-04 | A CI check fails the build when a new tenant-scoped table is added without an RLS policy. |
| AC-05 | Disabling a module hides it from navigation for all tenant users within 5 minutes and returns `MODULE_NOT_ENTITLED` on direct API access. |
| AC-06 | Reaching 80% of storage quota triggers an alert to the Company Admin; reaching 100% blocks uploads but not downloads. |
| AC-07 | Suspending a tenant blocks all writes within 5 minutes while preserving Company Admin read access. |
| AC-08 | A schedule task spanning Khmer New Year returns a finish date that excludes the configured holidays and non-working days. |
| AC-09 | Changing the company logo updates the next generated transmittal PDF without redeployment. |
| AC-10 | A data export request produces a downloadable archive containing all tenant records and files, and is logged as a Critical audit event. |
| AC-11 | Viewing a masked TIN requires an explicit unmask action which is recorded in the audit log with actor and timestamp. |
| AC-12 | A document issued in a prior period renders the legal entity details as they were on the issue date, after the entity has since been renamed. |

---

## 10. Reports and KPIs Contributed

Although this is a Tier 3 module without a dedicated Reports document, it contributes the following to the platform reporting layer:

- Tenant health summary — status, plan, renewal date, days to renewal (Super Admin)
- Seat utilisation — Full / Field / External used vs contracted, with 30-day trend
- Storage consumption by tenant and by project
- Module adoption — entitled vs actually used, per tenant
- Legal entity register export for finance and audit
- Organisation structure report — branches, departments, headcount per department
- Public holiday calendar for the coming year (operations planning input)
- Company configuration change log — what changed, who changed it, when

---

## 11. Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| A tenant-scoped table ships without RLS | Cross-tenant data leak — catastrophic commercial and legal breach | Possible | Mandatory CI policy check; table creation template; quarterly isolation penetration test |
| Company code chosen carelessly at onboarding | Embedded in every document number forever; cannot be corrected | Likely | Enforce validation, show a live preview of a sample document number, require explicit confirmation |
| Legal entity omitted, everything defaults to primary entity | Wrong tax number on IPC → claim rejected by client | Likely | Make contracting entity mandatory on project creation; block project activation without it |
| Base currency set wrong at onboarding | All financial reporting invalid; irreversible after first transaction | Possible | Confirmation step in the wizard; warn that the field locks; Super Admin-only correction before first transaction |
| Seat model too rigid for site turnover | Customer refuses to onboard site staff; field data stays on paper | Very Likely | Separate Field seat class; reassignable seats; deactivation frees a seat immediately |
| Calendar duplicated inside Planning module | Two sources of truth; schedule and timesheet disagree | Likely | Architectural rule: calendar service is the only date-arithmetic authority; code review gate |
| Super Admin impersonation misused | Trust and compliance failure | Possible | Mandatory reason, time-boxed session, loud notification to Company Admin, Critical audit event |
| Storage quota reached mid-project during BIM upload | Site work blocked | Likely | 80%/95% alerts, admin-visible usage dashboard, grace overage window before hard block |
| Tenant termination executed in error | Irrecoverable data loss | Rare | Dual confirmation, 90-day retention hold, mandatory export before purge |

---

## 12. Traceability

| Source | Reference | Addressed By |
|---|---|---|
| DCOS R0 §5, Module 2 — Company / Tenant Setup | "Manage company profile and access" | Whole module |
| DCOS R0 §23 — Admin Configuration | Company profile listed under admin config | Split clarified: identity/entitlement here, master data in Admin Configuration |
| DCOS R0 §24.3 — Audit Trail Engine | All actions logged | §6 requirements, all lifecycle events |
| Gap Analysis R1 §5.2 — Multi-Tenant Security Architecture | RLS, JWT-derived tenant, storage partitioning, job scoping, impersonation audit, CI leak tests | BR-CMP-080 to BR-CMP-084 |
| Gap Analysis R1 §5.1 — Data Archiving and Retention | Tenant-level retention and archive tiers | BR-CMP-005, BR-CMP-006 |
| Gap Analysis R1 §6, Module 01 | Company / Tenant Setup — Captured, Foundation | This document set |
| Auth Module R1 §5.5, D6 | One active tenant per token, RLS keyed on `tid` | BR-CMP-081 |
| Auth Module R1 §7.8 | `tenant_auth_policy` owned by Authentication | §4.2 boundary |

---

*Digital Construction Operating System — Foundation — Module 01 Company / Tenant Setup — Document 01 Business Requirement — Internal Controlled Document*
