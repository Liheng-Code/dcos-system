# 02-Modules — DCOS Business Modules Directory

> **Hierarchical Number Sequence Map**: All modules follow strict numerical sequence coding (`02-XX` for primary modules, and `02-XX-YY` for sub-modules).

---

## 📂 Business Modules Sequence Index

| Code | Module Directory | Description | Status |
|---|---|---|---|
| **02-01** | [`02-01-Administration/`](./02-01-Administration/) | System administration, user management, RBAC, licensing control plane | Production |
| ↳ `02-01-01` | [`02-01-01-User-Management/`](./02-01-Administration/02-01-01-User-Management/) | User account onboarding, profile extensions, status transitions | Production |
| **02-02** | [`02-02-Project/`](./02-02-Project/) | Project foundation, setup wizards, pre/post contract staging, stakeholders | Production |
| ↳ `02-02-01` | [`02-02-01-Project-Setup/`](./02-02-Project/02-02-01-Project-Setup/) | Project creation, category allocators, setup blueprints | Production |
| ↳ `02-02-02` | [`02-02-02-Stakeholder-Management/`](./02-02-Project/02-02-02-Stakeholder-Management/) | Stakeholder tiers, vendor mappings, contact registers | Production |
| **02-03** | [`02-03-WBS-and-Tasks/`](./02-03-WBS-and-Tasks/) | Work breakdown structures, task spine, timeline, and alerts | Production |
| ↳ `02-03-01` | [`02-03-01-WBS-Management/`](./02-03-WBS-and-Tasks/02-03-01-WBS-Management/) | Hierarchical decomposition, WBS running numbers, code masks | Production |
| ↳ `02-03-02` | [`02-03-02-Task-Management/`](./02-03-WBS-and-Tasks/02-03-02-Task-Management/) | Task activities, milestone tracking, progress updates | Production |
| **02-04** | [`02-04-Planning-and-Scheduling/`](./02-04-Planning-and-Scheduling/) | Critical Path Method (CPM), calendars, resource levelling | Production |
| ↳ `02-04-04` | [`02-04-04-Activity-Database/`](./02-04-Planning-and-Scheduling/02-04-04-Activity-Database/) | Master activity knowledge base, CSI step duration templates | Production |
| **02-05** | [`02-05-Quantity-Surveying/`](./02-05-Quantity-Surveying/) | Commercial management, BOQ, rate libraries, claims | Production |
| ↳ `02-05-01` | [`02-05-01-Cost-and-BOQ-Core/`](./02-05-Quantity-Surveying/02-05-01-Cost-and-BOQ-Core/) | Division/Section cost libraries, BOQ items & alternates | Production |
| ↳ `02-05-04` | [`02-05-04-IPC-Progress-Claims/`](./02-05-Quantity-Surveying/02-05-04-IPC-Progress-Claims/) | Interim payment certificates, retention ledgers | Production |
| **02-06** | [`02-06-Procurement/`](./02-06-Procurement/) | Supply chain, purchase requisitions, RFQs, vendor comparisons | Production |
| **02-07** | [`02-07-Inventory/`](./02-07-Inventory/) | Warehouse stock, material master, GRN, movements | Production |
| **02-08** | [`02-08-Construction/`](./02-08-Construction/) | Site execution, daily logs, Telegram bot bridge, QA/QC, HSE | Production |
| ↳ `02-08-01` | [`02-08-01-Daily-Site-Reporting/`](./02-08-Construction/02-08-01-Daily-Site-Reporting/) | Daily report sync, weather logs, photo evidence | Production |
| **02-09** | [`02-09-HR-and-Workforce/`](./02-09-HR-and-Workforce/) | Human resources, employee master, attendance, leave, payroll | Production |
| ↳ `02-09-01` | [`02-09-01-Employee-Master/`](./02-09-HR-and-Workforce/02-09-01-Employee-Master/) | Staff database, designations, assignments | Production |
| ↳ `02-09-02` | [`02-09-02-Leave-Management/`](./02-09-HR-and-Workforce/02-09-02-Leave-Management/) | E-Leave types, balances, approver chains | Production |
| ↳ `02-09-03` | [`02-09-03-Attendance/`](./02-09-HR-and-Workforce/02-09-03-Attendance/) | Daily biometric/mobile site check-ins | Production |
| ↳ `02-09-04` | [`02-09-04-Overtime/`](./02-09-HR-and-Workforce/02-09-04-Overtime/) | OT requests, pre-approvals, rates | Production |
| ↳ `02-09-05` | [`02-09-05-Payroll/`](./02-09-HR-and-Workforce/02-09-05-Payroll/) | Timesheet splitting, salary deductions | Production |
| ↳ `02-09-06` | [`02-09-06-Asset-Management/`](./02-09-HR-and-Workforce/02-09-06-Asset-Management/) | Staff equipment and asset registry | Production |
| **02-10** | [`02-10-CWIMS/`](./02-10-CWIMS/) | Construction Water & Infrastructure Management System | Active |

---

## 📐 Standard File Layout for Sub-Modules

Inside every leaf folder (e.g. `02-01-01-User-Management/`), structure files as:
* `README.md` — Overview, checklist & quick links
* `01-Requirements.md` — Business requirements & user stories
* `02-Specs.md` — Functional specifications & lifecycle rules
* `03-Data-Model.md` — Tables, columns & Supabase RLS policies
* `04-API.md` — Route handlers & Server Actions
* `05-UI-UX.md` — Component wireframes & screen layouts
* `_assets/` — Images, mockups (`.png`), and spreadsheets (`.xlsx`)
