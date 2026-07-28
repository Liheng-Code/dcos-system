// Hand-authored catalog of every sidebar nav item (sub-group headings and leaf
// links) that admins can individually hide/show, in addition to the existing
// whole-module toggle. This is the single source of truth the "Manage
// navigation items" dialog (see components/settings/module-settings-page.tsx)
// reads from — it must stay in sync with apps/web/components/dashboard/sidebar.tsx.
//
// navKey rules (must match sidebar.tsx exactly):
//   - leaf items: the href rendered by NavItem/TabNavItem (including any "?tab="
//     query string for TabNavItem entries)
//   - sub-group headings: the synthetic "group:<module_key>:<slug>" key passed
//     to FolderHeader's `navKey` prop
//
// Keyed by module_key, matching module_settings.module_key exactly:
// project, reporting, document_control, planning, design, procurement, inventory,
// qs, construction, hr, account, administration.

export interface NavCatalogEntry {
  navKey: string;
  label: string;
  nodeType: "group" | "item";
  parentGroupKey?: string; // set for items nested under one of the group headings
}

export const NAV_ITEM_CATALOG: Record<string, NavCatalogEntry[]> = {
  project: [
    { navKey: "/dashboard", label: "Dashboard", nodeType: "item" },
    { navKey: "/dashboard/projects", label: "Projects", nodeType: "item" },
    { navKey: "/dashboard/wbs", label: "WBS", nodeType: "item" },
    { navKey: "/dashboard/tasks", label: "Tasks", nodeType: "item" },
  ],

  reporting: [
    { navKey: "/dashboard/reports", label: "Reports Hub", nodeType: "item" },
    { navKey: "/dashboard/reports/schedule", label: "Scheduled Reports", nodeType: "item" },
    { navKey: "/dashboard/account/reports", label: "Financial Reports", nodeType: "item" },
    { navKey: "/dashboard/planning/reports", label: "Schedule Reports", nodeType: "item" },
    { navKey: "/dashboard/insights", label: "Insights", nodeType: "item" },
  ],

  document_control: [
    { navKey: "/dashboard/documents", label: "Documents", nodeType: "item" },
    { navKey: "/dashboard/documents/transmittals", label: "Transmittals", nodeType: "item" },
    { navKey: "/dashboard/documents/controller", label: "Controller Dashboard", nodeType: "item" },
    { navKey: "/dashboard/documents/audit-log", label: "Audit Log", nodeType: "item" },
  ],

  planning: [
    { navKey: "/dashboard/planning", label: "Dashboard", nodeType: "item" },
    { navKey: "/dashboard/planning/gantt", label: "Gantt Chart", nodeType: "item" },
    { navKey: "/dashboard/wbs/lookahead", label: "Look-ahead", nodeType: "item" },
    { navKey: "/dashboard/planning/calendars", label: "Calendars", nodeType: "item" },
    { navKey: "/dashboard/planning/comparison", label: "Comparison", nodeType: "item" },
    { navKey: "/dashboard/planning/resource-loading", label: "Resources", nodeType: "item" },
    { navKey: "/dashboard/planning/reports", label: "Reports", nodeType: "item" },
  ],

  design: [
    { navKey: "/dashboard/design", label: "Dashboard", nodeType: "item" },
    { navKey: "/dashboard/design/coordination", label: "Coordination", nodeType: "item" },
    { navKey: "/dashboard/design/markup", label: "Drawing Markup", nodeType: "item" },
    { navKey: "/dashboard/design/bim", label: "BIM Viewer", nodeType: "item" },

    { navKey: "group:design:architecture", label: "Architecture", nodeType: "group" },
    { navKey: "/dashboard/design/arc/drawings", label: "ARC Drawings", nodeType: "item", parentGroupKey: "group:design:architecture" },
    { navKey: "/dashboard/design/arc/room-data", label: "Room Data", nodeType: "item", parentGroupKey: "group:design:architecture" },
    { navKey: "/dashboard/design/arc/rfi", label: "ARC RFI", nodeType: "item", parentGroupKey: "group:design:architecture" },
    { navKey: "/dashboard/design/arc/door-schedule", label: "Door Schedule", nodeType: "item", parentGroupKey: "group:design:architecture" },
    { navKey: "/dashboard/design/arc/window-schedule", label: "Window Schedule", nodeType: "item", parentGroupKey: "group:design:architecture" },
    { navKey: "/dashboard/design/arc/finish-schedule", label: "Finish Schedule", nodeType: "item", parentGroupKey: "group:design:architecture" },
    { navKey: "/dashboard/design/arc/material-approval", label: "Material Approval", nodeType: "item", parentGroupKey: "group:design:architecture" },

    { navKey: "group:design:structure", label: "Structure", nodeType: "group" },
    { navKey: "/dashboard/design/str/drawings", label: "STR Drawings", nodeType: "item", parentGroupKey: "group:design:structure" },
    { navKey: "/dashboard/design/str/calculations", label: "Calculations", nodeType: "item", parentGroupKey: "group:design:structure" },
    { navKey: "/dashboard/design/str/models", label: "BIM Models", nodeType: "item", parentGroupKey: "group:design:structure" },
    { navKey: "/dashboard/design/str/rebar", label: "Rebar Scheduling", nodeType: "item", parentGroupKey: "group:design:structure" },
    { navKey: "/dashboard/design/str/rfi", label: "STR RFI", nodeType: "item", parentGroupKey: "group:design:structure" },
    { navKey: "/dashboard/design/str/technical-queries", label: "Tech. Queries", nodeType: "item", parentGroupKey: "group:design:structure" },
    { navKey: "/dashboard/design/str/design-changes", label: "Design Changes", nodeType: "item", parentGroupKey: "group:design:structure" },

    { navKey: "group:design:mep", label: "MEP", nodeType: "group" },
    { navKey: "/dashboard/design/mep/drawings", label: "MEP Drawings", nodeType: "item", parentGroupKey: "group:design:mep" },
    { navKey: "/dashboard/design/mep/equipment", label: "Equipment", nodeType: "item", parentGroupKey: "group:design:mep" },
    { navKey: "/dashboard/design/mep/load-schedule", label: "Load Schedule", nodeType: "item", parentGroupKey: "group:design:mep" },
    { navKey: "/dashboard/design/mep/sleeves", label: "Sleeve Details", nodeType: "item", parentGroupKey: "group:design:mep" },
    { navKey: "/dashboard/design/mep/submittals", label: "Submittals", nodeType: "item", parentGroupKey: "group:design:mep" },
    { navKey: "/dashboard/design/mep/rfi", label: "MEP RFI", nodeType: "item", parentGroupKey: "group:design:mep" },
    { navKey: "/dashboard/design/mep/commissioning", label: "Commissioning", nodeType: "item", parentGroupKey: "group:design:mep" },
  ],

  procurement: [
    { navKey: "group:procurement:overview", label: "Overview", nodeType: "group" },
    { navKey: "/dashboard/procurement", label: "Dashboard", nodeType: "item", parentGroupKey: "group:procurement:overview" },
    { navKey: "/dashboard/procurement/analytics", label: "Analytics", nodeType: "item", parentGroupKey: "group:procurement:overview" },
    { navKey: "group:procurement:suppliers", label: "Suppliers", nodeType: "group" },
    { navKey: "/dashboard/procurement/supplier-portal", label: "Supplier Portal", nodeType: "item", parentGroupKey: "group:procurement:suppliers" },
    { navKey: "/dashboard/procurement/suppliers", label: "Supplier List", nodeType: "item", parentGroupKey: "group:procurement:suppliers" },
    { navKey: "/dashboard/procurement/prequalification", label: "Pre-Qualification", nodeType: "item", parentGroupKey: "group:procurement:suppliers" },
    { navKey: "/dashboard/procurement/supplier-performance", label: "Performance", nodeType: "item", parentGroupKey: "group:procurement:suppliers" },
    { navKey: "group:procurement:cost_management", label: "Cost Management", nodeType: "group" },
    { navKey: "/dashboard/procurement/boq", label: "BOQ", nodeType: "item", parentGroupKey: "group:procurement:cost_management" },
    { navKey: "group:procurement:sourcing", label: "Sourcing & Ordering", nodeType: "group" },
    { navKey: "/dashboard/procurement/pr", label: "Purchase Requisitions", nodeType: "item", parentGroupKey: "group:procurement:sourcing" },
    { navKey: "/dashboard/procurement/rfq", label: "RFQs", nodeType: "item", parentGroupKey: "group:procurement:sourcing" },
    { navKey: "/dashboard/procurement/po", label: "Purchase Orders", nodeType: "item", parentGroupKey: "group:procurement:sourcing" },
    { navKey: "/dashboard/procurement/auto-reorder", label: "Auto Reorder", nodeType: "item", parentGroupKey: "group:procurement:sourcing" },
    { navKey: "group:procurement:receiving", label: "Receiving & Settlement", nodeType: "group" },
    { navKey: "/dashboard/procurement/goods-receipt", label: "Goods Receipt", nodeType: "item", parentGroupKey: "group:procurement:receiving" },
    { navKey: "/dashboard/procurement/invoice-matches", label: "Invoice Matching", nodeType: "item", parentGroupKey: "group:procurement:receiving" },
    { navKey: "group:procurement:administration", label: "Administration", nodeType: "group" },
    { navKey: "/dashboard/procurement/notifications", label: "Notifications", nodeType: "item", parentGroupKey: "group:procurement:administration" },
    { navKey: "/dashboard/procurement/audit-log", label: "Audit Log", nodeType: "item", parentGroupKey: "group:procurement:administration" },
  ],

  inventory: [
    { navKey: "group:inventory:overview", label: "Overview", nodeType: "group" },
    { navKey: "/dashboard/inventory", label: "Dashboard", nodeType: "item", parentGroupKey: "group:inventory:overview" },
    { navKey: "/dashboard/inventory/stock", label: "Stock", nodeType: "item", parentGroupKey: "group:inventory:overview" },

    { navKey: "group:inventory:master_data", label: "Master Data", nodeType: "group" },
    { navKey: "/dashboard/inventory/items", label: "Item Master", nodeType: "item", parentGroupKey: "group:inventory:master_data" },
    { navKey: "/dashboard/inventory/stores", label: "Stores & Locations", nodeType: "item", parentGroupKey: "group:inventory:master_data" },

    { navKey: "group:inventory:receiving", label: "Receiving & Issuing", nodeType: "group" },
    { navKey: "/dashboard/inventory/grns", label: "GRN", nodeType: "item", parentGroupKey: "group:inventory:receiving" },
    { navKey: "/dashboard/inventory/mrs", label: "Material Requisitions", nodeType: "item", parentGroupKey: "group:inventory:receiving" },
    { navKey: "/dashboard/inventory/returns", label: "Returns", nodeType: "item", parentGroupKey: "group:inventory:receiving" },
    { navKey: "/dashboard/inventory/transfers", label: "Transfers", nodeType: "item", parentGroupKey: "group:inventory:receiving" },

    { navKey: "group:inventory:assets", label: "Tools & Equipment", nodeType: "group" },
    { navKey: "/dashboard/inventory/tools", label: "Tools", nodeType: "item", parentGroupKey: "group:inventory:assets" },

    { navKey: "group:inventory:stock_control", label: "Stock Control", nodeType: "group" },
    { navKey: "/dashboard/inventory/adjustments", label: "Adjustments", nodeType: "item", parentGroupKey: "group:inventory:stock_control" },
    { navKey: "/dashboard/inventory/stocktakes", label: "Stocktakes", nodeType: "item", parentGroupKey: "group:inventory:stock_control" },
    { navKey: "/dashboard/inventory/movements", label: "Movements", nodeType: "item", parentGroupKey: "group:inventory:stock_control" },
  ],

  qs: [
    { navKey: "group:qs:tendering", label: "Tender & Estimate", nodeType: "group" },
    { navKey: "/dashboard/tenders/register", label: "Tender Register", nodeType: "item", parentGroupKey: "group:qs:tendering" },
    { navKey: "/dashboard/tenders/tender-management", label: "Tender Management", nodeType: "item", parentGroupKey: "group:qs:tendering" },
    { navKey: "/dashboard/tenders/cost-estimation", label: "Cost Estimation", nodeType: "item", parentGroupKey: "group:qs:tendering" },
    { navKey: "/dashboard/tenders/submissions", label: "Submissions", nodeType: "item", parentGroupKey: "group:qs:tendering" },
    { navKey: "/dashboard/tenders/bid-evaluation", label: "Bid Evaluation", nodeType: "item", parentGroupKey: "group:qs:tendering" },

    { navKey: "group:qs:libraries", label: "Libraries", nodeType: "group" },
    { navKey: "/dashboard/qs/dwl-resources", label: "Direct Works Resources", nodeType: "item", parentGroupKey: "group:qs:libraries" },
    { navKey: "/dashboard/qs/dwl-work-items", label: "Direct Works Rate Build-Up", nodeType: "item", parentGroupKey: "group:qs:libraries" },
    { navKey: "/dashboard/qs/dwl-assemblies", label: "Direct Works Assemblies", nodeType: "item", parentGroupKey: "group:qs:libraries" },
    { navKey: "/dashboard/qs/dwl-estimate", label: "Direct Works Quick Estimate", nodeType: "item", parentGroupKey: "group:qs:libraries" },
    { navKey: "/dashboard/qs/dwl-price-dashboard", label: "Direct Works Price Dashboard", nodeType: "item", parentGroupKey: "group:qs:libraries" },
    { navKey: "/dashboard/tenders/budget-codes", label: "Budget Codes", nodeType: "item", parentGroupKey: "group:qs:libraries" },
    { navKey: "/dashboard/qs/element-library", label: "Element Library", nodeType: "item", parentGroupKey: "group:qs:libraries" },
    { navKey: "/dashboard/tenders/cost-library", label: "Prelim Cost Library", nodeType: "item", parentGroupKey: "group:qs:libraries" },
    { navKey: "/dashboard/tenders/unit-rates", label: "Unit Rate Library", nodeType: "item", parentGroupKey: "group:qs:libraries" },

    { navKey: "group:qs:cost_control", label: "Cost Control", nodeType: "group" },
    { navKey: "/dashboard/qs/boq", label: "BOQ", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs?tab=cost-control", label: "Cost Control", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs?tab=contingency", label: "Contingency", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs/evm", label: "Earned Value", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs?tab=portfolio", label: "Portfolio", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs?tab=audit", label: "Audit Log", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs?tab=currency", label: "Currency", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs/claims", label: "Progress Claims", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs/variations", label: "Variations", nodeType: "item", parentGroupKey: "group:qs:cost_control" },

    { navKey: "group:qs:subcontractor", label: "Subcon Mgmt", nodeType: "group" },
    { navKey: "/dashboard/subcontractors/back-charges", label: "Back Charges", nodeType: "item", parentGroupKey: "group:qs:subcontractor" },
    { navKey: "/dashboard/subcontractors/performance-notices", label: "Performance Notices", nodeType: "item", parentGroupKey: "group:qs:subcontractor" },

    { navKey: "group:qs:contract_admin", label: "Contract Admin", nodeType: "group" },
    { navKey: "/dashboard/contracts/register", label: "Contract Register", nodeType: "item", parentGroupKey: "group:qs:contract_admin" },
    { navKey: "/dashboard/contracts/notices", label: "Notices", nodeType: "item", parentGroupKey: "group:qs:contract_admin" },
    { navKey: "/dashboard/contracts/employer-instructions", label: "Employer Instructions", nodeType: "item", parentGroupKey: "group:qs:contract_admin" },
    { navKey: "/dashboard/contracts/correspondence", label: "Correspondence", nodeType: "item", parentGroupKey: "group:qs:contract_admin" },
    { navKey: "/dashboard/contracts/entitlements", label: "Entitlements", nodeType: "item", parentGroupKey: "group:qs:contract_admin" },
  ],

  construction: [
    { navKey: "/dashboard/site", label: "Dashboard", nodeType: "item" },
    { navKey: "/dashboard/site/daily-reports", label: "Daily Reports", nodeType: "item" },
    { navKey: "/dashboard/site/manpower", label: "Manpower", nodeType: "item" },
    { navKey: "/dashboard/site/equipment", label: "Equipment", nodeType: "item" },
    { navKey: "/dashboard/site/progress-photos", label: "Progress Photos", nodeType: "item" },
    { navKey: "/dashboard/qaqc", label: "Inspections & ITP", nodeType: "item" },
    { navKey: "/dashboard/qaqc/ncrs", label: "NCR Management", nodeType: "item" },

    { navKey: "group:construction:hse", label: "HSE", nodeType: "group" },
    { navKey: "/dashboard/hse", label: "Dashboard", nodeType: "item", parentGroupKey: "group:construction:hse" },
    { navKey: "/dashboard/hse/permits", label: "Work Permits", nodeType: "item", parentGroupKey: "group:construction:hse" },
    { navKey: "/dashboard/hse/toolbox-talks", label: "Toolbox Talks", nodeType: "item", parentGroupKey: "group:construction:hse" },
    { navKey: "/dashboard/hse/incidents", label: "Incidents", nodeType: "item", parentGroupKey: "group:construction:hse" },
    { navKey: "/dashboard/hse/risk-assessments", label: "Risk Assessments", nodeType: "item", parentGroupKey: "group:construction:hse" },
    { navKey: "/dashboard/hse/observations", label: "Observations", nodeType: "item", parentGroupKey: "group:construction:hse" },
  ],

  hr: [
    { navKey: "/dashboard/hr/dashboard", label: "Workforce Dashboard", nodeType: "item" },
    { navKey: "/dashboard/hr/organization", label: "Organization Setup", nodeType: "item" },
    { navKey: "/dashboard/hr/employees", label: "Employee Master", nodeType: "item" },
    { navKey: "/dashboard/hr/resources", label: "Resource Allocation", nodeType: "item" },
    { navKey: "/dashboard/hr/attendance", label: "Attendance", nodeType: "item" },
    { navKey: "/dashboard/hr/leave", label: "E-Leave", nodeType: "item" },
    { navKey: "/dashboard/hr/payroll", label: "Payroll", nodeType: "item" },
    { navKey: "/dashboard/hr/timesheet", label: "Timesheet", nodeType: "item" },
    { navKey: "/dashboard/hr/overtime", label: "OT Management", nodeType: "item" },
    { navKey: "/dashboard/hr/training", label: "Training & Competency", nodeType: "item" },
    { navKey: "/dashboard/hr/performance", label: "Performance", nodeType: "item" },
    { navKey: "/dashboard/hr/recruitment", label: "Recruitment", nodeType: "item" },
    { navKey: "/dashboard/hr/assets", label: "Employee Assets", nodeType: "item" },
  ],

  account: [
    { navKey: "/dashboard/account", label: "Overview", nodeType: "item" },
    { navKey: "/dashboard/account/coa", label: "Chart of Accounts", nodeType: "item" },
    { navKey: "/dashboard/account/ap", label: "AP Invoices", nodeType: "item" },
    { navKey: "/dashboard/account/ar", label: "AR Invoices", nodeType: "item" },
    { navKey: "/dashboard/account/payments", label: "Payments", nodeType: "item" },
    { navKey: "/dashboard/account/journals", label: "Journal Entries", nodeType: "item" },
    { navKey: "/dashboard/account/gl", label: "General Ledger", nodeType: "item" },
    { navKey: "/dashboard/account/bank", label: "Bank Accounts", nodeType: "item" },
    { navKey: "/dashboard/account/payment-runs", label: "Payment Runs", nodeType: "item" },
    { navKey: "/dashboard/account/wht", label: "Withholding Tax", nodeType: "item" },
    { navKey: "/dashboard/account/reports", label: "Reports", nodeType: "item" },
    { navKey: "/dashboard/account/currencies", label: "Multi-Currency", nodeType: "item" },
  ],

  administration: [
    { navKey: "/dashboard/settings", label: "Settings", nodeType: "item" },
    { navKey: "/dashboard/administration/stakeholders", label: "Stakeholders", nodeType: "item" },
    { navKey: "/dashboard/administration/stakeholder-templates", label: "Stakeholder Templates", nodeType: "item" },
  ],
};
