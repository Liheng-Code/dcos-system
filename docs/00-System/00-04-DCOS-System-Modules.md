# DCOS System Modules — Sub-Module Breakdown

> Full inventory of every module and its sub-modules (nav groups and pages) in
> the Digital Construction Operating System (DCOS).
>
> **12 top-level modules · 38 sub-module groups · ~170 individual pages**
>
> Source of truth: `apps/web/lib/modules/registry.ts` (manifests in
> `apps/web/lib/modules/manifests/` and the `*-nav.ts` nav files). The sidebar,
> module hub, route guard and permission map all derive from this registry.

## Modules at a Glance

| # | Module | Key | Sub-module groups |
|---|--------|-----|-------------------|
| 1 | Project | `project` | 7 pages (flat) |
| 2 | Reporting | `reporting` | 2 groups |
| 3 | Document Control | `document_control` | 2 groups |
| 4 | Planning | `planning` | 4 groups |
| 5 | Design | `design` | 4 groups |
| 6 | Procurement | `procurement` | 3 groups |
| 7 | Quantity Surveying | `qs` | 8 groups |
| 8 | Construction | `construction` | 2 groups |
| 9 | HR Management | `hr` | 2 groups |
| 10 | Inventory | `inventory` | 2 groups |
| 11 | Account | `account` | 2 groups |
| 12 | Administration | `administration` | 8 pages (flat) |

---

## 1. Project
`rbacModules: [task_management]` · hub order 1 · routes `/dashboard`, `/projects`, `/wbs`, `/tasks`, `/my-tasks`, `/department`, `/stakeholders`

| Sub-module | Route |
|------------|-------|
| Dashboard | `/dashboard` |
| Projects | `/dashboard/projects` |
| WBS | `/dashboard/wbs` |
| My Tasks | `/dashboard/my-tasks` |
| Tasks | `/dashboard/tasks` |
| Department | `/dashboard/department` |
| Stakeholders | `/dashboard/stakeholders` |

## 2. Reporting
`rbacModules: [reporting_kpi]` · hub order 2 · routes `/reports`, `/insights`

**Sub-module group: Reports** (`/dashboard/reports`)

| Sub-module | Route |
|------------|-------|
| Reports Hub | `/dashboard/reports` |
| Financial Reports | `/dashboard/account/reports` |
| Schedule Reports | `/dashboard/planning/reports` |

**Sub-module group: Insights & Automation** (`/dashboard/insights`)

| Sub-module | Route |
|------------|-------|
| Insights | `/dashboard/insights` |
| Scheduled Reports | `/dashboard/reports/schedule` |

## 3. Document Control
`rbacModules: [document_control]` · hub order 3 · routes `/documents`, `/transmittals`

**Sub-module group: Documents** (`/dashboard/documents`)

| Sub-module | Route |
|------------|-------|
| Document Register | `/dashboard/documents` |
| Master Register (MDR) | `/dashboard/documents/mdr` |
| Submittals | `/dashboard/documents/submittals` |
| Transmittals | `/dashboard/documents/transmittals` |

**Sub-module group: Controller** (`/dashboard/documents/controller`)

| Sub-module | Route |
|------------|-------|
| Controller Dashboard | `/dashboard/documents/controller` |
| Audit Log | `/dashboard/documents/audit-log` |

## 4. Planning
`rbacModules: [planning]` · hub order 4 · routes `/planning`

**Sub-module group: Schedule** (`/dashboard/planning`)

| Sub-module | Route | Notes |
|------------|-------|-------|
| Overview | `/dashboard/planning/overview` | |
| Dashboard | `/dashboard/planning` | |
| Gantt Chart | `/dashboard/planning/gantt` | |
| Sheet | `/dashboard/planning/sheet` | |
| Look-ahead | `/dashboard/wbs/lookahead` | execution only |
| ↳ Look-ahead | `/dashboard/wbs/lookahead?sub=lookahead` | |
| ↳ Weekly Plans | `/dashboard/wbs/lookahead?sub=weekly` | |
| ↳ S-Curve & EVM | `/dashboard/wbs/lookahead?sub=scurve` | |
| ↳ Progress Reviews | `/dashboard/wbs/lookahead?sub=progress-reviews` | |
| Calendars | `/dashboard/planning/calendars` | |
| ↳ Task View | `/dashboard/planning/calendars?sub=tasks` | |
| ↳ Work Calendar Settings | `/dashboard/planning/calendars?sub=settings` | |
| Comparison | `/dashboard/planning/comparison` | execution only |
| MS Project Sync | `/dashboard/planning/sync` | execution only |
| Activity Step Templates | `/dashboard/planning/activity-step-templates` | execution only |

**Sub-module group: Resources & Reports** (`/dashboard/planning/resource-loading`)

| Sub-module | Route | Notes |
|------------|-------|-------|
| Resources | `/dashboard/planning/resource-loading` | |
| Members | `/dashboard/planning/members` | |
| Delay Register | `/dashboard/planning/delays` | execution only |
| ↳ Register | `/dashboard/planning/delays?sub=register` | |
| ↳ Time Impact Analysis | `/dashboard/planning/delays?sub=tia` | |
| Reports | `/dashboard/planning/reports` | |
| ↳ Delay Analysis | `/dashboard/planning/reports?sub=delay` | execution only |
| ↳ Schedule Summary | `/dashboard/planning/reports?sub=summary` | |
| ↳ Milestones | `/dashboard/planning/reports?sub=milestone` | |

**Sub-module group: Productivity** (`/dashboard/planning/productivity`)

| Sub-module | Route | Notes |
|------------|-------|-------|
| Norm Library | `/dashboard/planning/productivity` | |
| Task Work | `/dashboard/planning/productivity/task-work` | execution only |
| BOQ Mapping | `/dashboard/planning/productivity/boq-mapping` | |
| Cost Rollup | `/dashboard/planning/productivity/cost-rollup` | |
| Site Records | `/dashboard/planning/productivity/site-records` | execution only |

**Sub-module group: Activity Library** (`/dashboard/planning/activity-library`)

| Sub-module | Route |
|------------|-------|
| Activities | `/dashboard/planning/activity-library` |
| Templates | `/dashboard/planning/activity-library/templates` |
| Generate | `/dashboard/planning/activity-library/generate` |
| Quantity Links | `/dashboard/planning/activity-library/quantity-links` |
| BIM Quantities | `/dashboard/planning/activity-library/bim` |
| Recovery | `/dashboard/planning/activity-library/recovery` |
| AI Assistant | `/dashboard/planning/activity-library/ai` |

## 5. Design
`rbacModules: []` · hub order 5 · routes `/design` · shown for Design & Build / Turnkey tenders only

**Sub-module group: Correspondence** (`/dashboard/design`)

| Sub-module | Route |
|------------|-------|
| Dashboard | `/dashboard/design` |
| Coordination | `/dashboard/design/coordination` |
| Drawing Markup | `/dashboard/design/markup` |
| BIM Viewer | `/dashboard/design/bim` |

**Sub-module group: Architecture** (`/dashboard/design/arc/drawings`)

| Sub-module | Route |
|------------|-------|
| ARC Drawings | `/dashboard/design/arc/drawings` |
| Room Data | `/dashboard/design/arc/room-data` |
| ARC RFI | `/dashboard/design/arc/rfi` |
| Door Schedule | `/dashboard/design/arc/door-schedule` |
| Window Schedule | `/dashboard/design/arc/window-schedule` |
| Finish Schedule | `/dashboard/design/arc/finish-schedule` |
| Material Approval | `/dashboard/design/arc/material-approval` |

**Sub-module group: Structure** (`/dashboard/design/str/drawings`)

| Sub-module | Route |
|------------|-------|
| STR Drawings | `/dashboard/design/str/drawings` |
| Calculations | `/dashboard/design/str/calculations` |
| BIM Models | `/dashboard/design/str/models` |
| Rebar Scheduling | `/dashboard/design/str/rebar` |
| STR RFI | `/dashboard/design/str/rfi` |
| Tech. Queries | `/dashboard/design/str/technical-queries` |
| Design Changes | `/dashboard/design/str/design-changes` |

**Sub-module group: MEP** (`/dashboard/design/mep/drawings`)

| Sub-module | Route |
|------------|-------|
| MEP Drawings | `/dashboard/design/mep/drawings` |
| Equipment | `/dashboard/design/mep/equipment` |
| Load Schedule | `/dashboard/design/mep/load-schedule` |
| Sleeve Details | `/dashboard/design/mep/sleeves` |
| Submittals | `/dashboard/design/mep/submittals` |
| MEP RFI | `/dashboard/design/mep/rfi` |
| Commissioning | `/dashboard/design/mep/commissioning` |

## 6. Procurement
`rbacModules: [procurement]` · hub order 6 · routes `/procurement`

**Sub-module group: Overview** (`/dashboard/procurement`)

| Sub-module | Route |
|------------|-------|
| Dashboard | `/dashboard/procurement` |
| Analytics | `/dashboard/procurement/analytics` |
| BOQ | `/dashboard/procurement/boq` |

**Sub-module group: Suppliers** (`/dashboard/procurement/supplier-portal`)

| Sub-module | Route |
|------------|-------|
| Supplier Portal | `/dashboard/procurement/supplier-portal` |
| ↳ RFQ Responses | `/dashboard/procurement/supplier-portal?sub=rfqs` |
| ↳ Purchase Orders | `/dashboard/procurement/supplier-portal?sub=pos` |
| ↳ Delivery Notice | `/dashboard/procurement/supplier-portal?sub=delivery` |
| Supplier List | `/dashboard/procurement/suppliers` |
| Pre-Qualification | `/dashboard/procurement/prequalification` |
| Performance | `/dashboard/procurement/supplier-performance` |

**Sub-module group: Sourcing & Receiving** (`/dashboard/procurement/pr`)

| Sub-module | Route |
|------------|-------|
| Purchase Requisitions | `/dashboard/procurement/pr` |
| RFQs | `/dashboard/procurement/rfq` |
| Purchase Orders | `/dashboard/procurement/po` |
| Auto Reorder | `/dashboard/procurement/auto-reorder` |
| Goods Receipt | `/dashboard/procurement/goods-receipt` |
| Invoice Matching | `/dashboard/procurement/invoice-matches` |
| Notifications | `/dashboard/procurement/notifications` |
| Audit Log | `/dashboard/procurement/audit-log` |

## 7. Quantity Surveying
`rbacModules: [qs, tender]` · hub order 7 · routes `/qs`, `/tenders`, `/subcontractors`, `/contracts`, `/qto`

**Sub-module group: Tender & Estimate** (`/dashboard/tenders/register`) · pre-contract only

| Sub-module | Route |
|------------|-------|
| Tender Register | `/dashboard/tenders/register` |
| Tender Management | `/dashboard/tenders/tender-management` |
| Cost Estimation | `/dashboard/tenders/cost-estimation` |
| Submissions | `/dashboard/tenders/submissions` |
| Bid Evaluation | `/dashboard/tenders/bid-evaluation` |

**Sub-module group: Cost & Rate Library** (`/dashboard/qs/dwl-materials`)

| Sub-module | Route |
|------------|-------|
| Material Master | `/dashboard/qs/dwl-materials` |
| Material Divisions | `/dashboard/qs/dwl-material-divisions` |
| Labor Rates | `/dashboard/qs/dwl-labor-rates` |
| Equipment Rates | `/dashboard/qs/dwl-equipment-rates` |
| Subcontractor Rates | `/dashboard/qs/dwl-subcontractor-rates` |
| All Resources | `/dashboard/qs/dwl-resources` |
| Supplier Master | `/dashboard/qs/dwl-suppliers` |
| Price Approvals | `/dashboard/qs/dwl-price-approvals` |
| Price Analytics | `/dashboard/qs/dwl-price-dashboard` |
| Import Template | `/dashboard/qs/dwl-material-import` |

**Sub-module group: Cost & Estimation** (`/dashboard/qs/dwl-cost-items`)

| Sub-module | Route | Notes |
|------------|-------|-------|
| Cost Item Library | `/dashboard/qs/dwl-cost-items` | |
| Direct Works Rate Build-Up | `/dashboard/qs/dwl-work-items` | hidden (reached from cost item) |
| Direct Works Assemblies | `/dashboard/qs/dwl-assemblies` | hidden (reached from cost item) |
| Direct Works Quick Estimate | `/dashboard/qs/dwl-estimate` | |
| Budget Codes | `/dashboard/tenders/budget-codes` | |
| Element Library | `/dashboard/qs/element-library` | |
| Prelim Cost Library | `/dashboard/tenders/cost-library` | |

**Sub-module group: Cost Database** (`/dashboard/qs/cost-database`)

| Sub-module | Route |
|------------|-------|
| Cost Database | `/dashboard/qs/cost-database` |

**Sub-module group: Cost Control** (`/dashboard/qs`) · execution only

| Sub-module | Route |
|------------|-------|
| Overview | `/dashboard/qs/overview` |
| Dashboard | `/dashboard/qs` |
| BOQ | `/dashboard/qs/boq` |
| Cost Control | `/dashboard/qs?tab=cost-control` |
| ↳ Cost Dashboard | `/dashboard/qs?tab=cost-control&sub=overview` |
| ↳ Budget & Variance | `/dashboard/qs?tab=cost-control&sub=variance` |
| ↳ Budget Revisions | `/dashboard/qs?tab=cost-control&sub=revisions` |
| ↳ Cost Transactions | `/dashboard/qs?tab=cost-control&sub=costs` |
| ↳ Cost / m² | `/dashboard/qs?tab=cost-control&sub=cost-per-m2` |
| Contingency | `/dashboard/qs?tab=contingency` |
| Earned Value | `/dashboard/qs/evm` |
| ↳ Dashboard | `/dashboard/qs/evm?sub=dashboard` |
| ↳ S-Curve | `/dashboard/qs/evm?sub=scurve` |
| Portfolio | `/dashboard/qs?tab=portfolio` |
| Audit Log | `/dashboard/qs?tab=audit` |
| ↳ All | `/dashboard/qs?tab=audit&sub=all` |
| ↳ Variation Orders | `/dashboard/qs?tab=audit&sub=qs_variation_orders` |
| ↳ Progress Claims | `/dashboard/qs?tab=audit&sub=qs_progress_claims` |
| ↳ Retention | `/dashboard/qs?tab=audit&sub=qs_retention_ledger` |
| ↳ Contingency | `/dashboard/qs?tab=audit&sub=qs_contingency_drawdowns` |
| ↳ Budget Revisions | `/dashboard/qs?tab=audit&sub=qs_budget_revisions` |
| Currency | `/dashboard/qs?tab=currency` |
| Progress Claims | `/dashboard/qs/claims` |
| ↳ Progress Claims | `/dashboard/qs/claims?sub=claims` |
| ↳ Sub-IPCs | `/dashboard/qs/claims?sub=subipcs` |
| ↳ Retention | `/dashboard/qs/claims?sub=retention` |
| ↳ Advance Recovery | `/dashboard/qs/claims?sub=advance` |
| ↳ Payments | `/dashboard/qs/claims?sub=payments` |
| Variations | `/dashboard/qs/variations` |
| ↳ Main Contract | `/dashboard/qs/variations?sub=main` |
| ↳ Subcontract | `/dashboard/qs/variations?sub=sub` |

**Sub-module group: Subcon Mgmt** (`/dashboard/subcontractors`) · execution only

| Sub-module | Route |
|------------|-------|
| Subcontracts | `/dashboard/subcontractors` |
| Back Charges | `/dashboard/subcontractors/back-charges` |
| Performance Notices | `/dashboard/subcontractors/performance-notices` |

**Sub-module group: Quantity Take-off** (`/dashboard/qto`)

| Sub-module | Route |
|------------|-------|
| Take-off | `/dashboard/qto` |
| Drawings | `/dashboard/qto?tab=drawings` |
| Documents | `/dashboard/qto?tab=documents` |

**Sub-module group: Contract Admin** (`/dashboard/contracts/register`) · execution only

| Sub-module | Route |
|------------|-------|
| Contract Register | `/dashboard/contracts/register` |
| Notices | `/dashboard/contracts/notices` |
| Employer Instructions | `/dashboard/contracts/employer-instructions` |
| Correspondence | `/dashboard/contracts/correspondence` |
| Entitlements | `/dashboard/contracts/entitlements` |

## 8. Construction
`rbacModules: [construction, qa_qc, hse]` · hub order 8 · routes `/site`, `/qaqc`, `/hse` · hidden for tender projects

**Sub-module group: Site & Quality** (`/dashboard/site`)

| Sub-module | Route |
|------------|-------|
| Dashboard | `/dashboard/site` |
| Daily Reporting | `/dashboard/site/daily-reporting` |
| Site Diary (legacy) | `/dashboard/site/daily-reports` |
| Manpower | `/dashboard/site/manpower` |
| Equipment | `/dashboard/site/equipment` |
| Progress Photos | `/dashboard/site/progress-photos` |
| Inspections & ITP | `/dashboard/qaqc` |
| ↳ Inspection & Test Plans | `/dashboard/qaqc?sub=itps` |
| ↳ Inspection Requests | `/dashboard/qaqc?sub=inspections` |
| ↳ NCRs | `/dashboard/qaqc?sub=ncrs` |

**Sub-module group: HSE** (`/dashboard/hse`)

| Sub-module | Route |
|------------|-------|
| Dashboard | `/dashboard/hse` |
| Work Permits | `/dashboard/hse/permits` |
| Toolbox Talks | `/dashboard/hse/toolbox-talks` |
| Incidents | `/dashboard/hse/incidents` |
| Risk Assessments | `/dashboard/hse/risk-assessments` |
| Observations | `/dashboard/hse/observations` |

## 9. HR Management
`rbacModules: [hr]` · hub order 9 · routes `/hr`

**Sub-module group: Workforce** (`/dashboard/hr/dashboard`)

| Sub-module | Route |
|------------|-------|
| Workforce Dashboard | `/dashboard/hr/dashboard` |
| Needs Attention | `/dashboard/hr/attention` |
| Organization Setup | `/dashboard/hr/organization` |
| Assignment Rules | `/dashboard/hr/organization/assignment-rules` |
| Employee Master | `/dashboard/hr/employees` |
| Resource Allocation | `/dashboard/hr/resources` |
| Employee Assets | `/dashboard/hr/assets` |
| Training & Competency | `/dashboard/hr/training` |
| Performance | `/dashboard/hr/performance` |
| Recruitment | `/dashboard/hr/recruitment` |

**Sub-module group: Time & Payroll** (`/dashboard/hr/attendance`)

| Sub-module | Route |
|------------|-------|
| Attendance | `/dashboard/hr/attendance` |
| Timesheet | `/dashboard/hr/timesheet` |
| OT Management | `/dashboard/hr/overtime` |
| E-Leave | `/dashboard/hr/leave` |
| Payroll | `/dashboard/hr/payroll` |

## 10. Inventory
`rbacModules: [inventory]` · hub order 10 · routes `/inventory`

**Sub-module group: Overview** (`/dashboard/inventory`)

| Sub-module | Route |
|------------|-------|
| Dashboard | `/dashboard/inventory` |
| ↳ Create GRN | `/dashboard/inventory/grns/new` |
| ↳ New MR | `/dashboard/inventory/mrs/new` |
| ↳ View Low Stock | `/dashboard/inventory/stock?low_stock=true` |
| ↳ Start Stock Take | `/dashboard/inventory/stocktakes/new` |
| ↳ New Adjustment | `/dashboard/inventory/adjustments/new` |
| Stock | `/dashboard/inventory/stock` |
| Item Master | `/dashboard/inventory/items` |
| Stores & Locations | `/dashboard/inventory/stores` |
| Tools | `/dashboard/inventory/tools` |

**Sub-module group: Stock Operations** (`/dashboard/inventory/grns`)

| Sub-module | Route |
|------------|-------|
| GRN | `/dashboard/inventory/grns` |
| Material Requisitions | `/dashboard/inventory/mrs` |
| Returns | `/dashboard/inventory/returns` |
| Transfers | `/dashboard/inventory/transfers` |
| Adjustments | `/dashboard/inventory/adjustments` |
| Stocktakes | `/dashboard/inventory/stocktakes` |
| Movements | `/dashboard/inventory/movements` |

## 11. Account
`rbacModules: [account_finance]` · hub order 11 · routes `/account`

**Sub-module group: Overview** (`/dashboard/account`)

| Sub-module | Route |
|------------|-------|
| Overview | `/dashboard/account` |
| ↳ Chart of Accounts | `/dashboard/account?sub=coa` |
| ↳ AP Invoices | `/dashboard/account?sub=ap` |
| ↳ AR Invoices | `/dashboard/account?sub=ar` |
| ↳ Payments | `/dashboard/account?sub=payments` |
| ↳ Journal Entries | `/dashboard/account?sub=journals` |
| ↳ General Ledger | `/dashboard/account?sub=gl` |
| ↳ Bank Accounts | `/dashboard/account?sub=bank` |
| ↳ Payment Runs | `/dashboard/account?sub=payment-runs` |
| ↳ Withholding Tax | `/dashboard/account?sub=wht` |
| ↳ Multi-Currency | `/dashboard/account/currencies` |

**Sub-module group: Reports** (`/dashboard/account/reports`)

| Sub-module | Route |
|------------|-------|
| Reports | `/dashboard/account/reports` |

## 12. Administration
`rbacModules: [admin_config]` · hub order 12 · admin-only · routes `/administration`, `/settings`

| Sub-module | Route |
|------------|-------|
| Settings | `/dashboard/settings` |
| User Management | `/dashboard/administration/users` |
| Roles & Permissions | `/dashboard/administration/roles-permissions` |
| Departments | `/dashboard/administration/departments` |
| Security | `/dashboard/administration/security` |
| Audit Logs | `/dashboard/administration/audit-logs` |
| Stakeholder Templates | `/dashboard/administration/stakeholder-templates` |
| Master Libraries | `/dashboard/administration/master-libraries` |

---

## Visibility Rules

| Module / Sub-module | Rule |
|---------------------|------|
| Design | Shown for tender projects only if Design & Build / Turnkey |
| Construction | Hidden for tender (pre-contract) projects |
| QS — Tender & Estimate | Pre-contract only |
| QS — Cost Control / Subcon / Contract Admin | Execution (post-contract) only |
| Planning — execution-only pages | Hidden for tender projects |
| Administration | Admin-only card; admin/HR sidebar gate |
| All modules | Also gated by `module_settings` per-project toggles |

Deployment can filter the registry via the `DCOS_ENABLED_MODULES` environment
variable; with no env var set, all 12 modules ship
(`apps/web/lib/modules/deployment.ts`).
