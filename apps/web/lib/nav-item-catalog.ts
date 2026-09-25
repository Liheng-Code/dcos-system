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
    { navKey: "/dashboard/my-tasks", label: "My Tasks", nodeType: "item" },
    { navKey: "/dashboard/tasks", label: "Tasks", nodeType: "item" },
    { navKey: "/dashboard/department", label: "Department", nodeType: "item" },
    { navKey: "/dashboard/stakeholders", label: "Stakeholders", nodeType: "item" },
  ],

  reporting: [
    { navKey: "group:reporting:reports", label: "Reports", nodeType: "item" },
    { navKey: "/dashboard/reports", label: "Reports Hub", nodeType: "item", parentGroupKey: "group:reporting:reports" },
    { navKey: "/dashboard/account/reports", label: "Financial Reports", nodeType: "item", parentGroupKey: "group:reporting:reports" },
    { navKey: "/dashboard/planning/reports", label: "Schedule Reports", nodeType: "item", parentGroupKey: "group:reporting:reports" },

    { navKey: "group:reporting:insights_automation", label: "Insights & Automation", nodeType: "item" },
    { navKey: "/dashboard/insights", label: "Insights", nodeType: "item", parentGroupKey: "group:reporting:insights_automation" },
    { navKey: "/dashboard/reports/schedule", label: "Scheduled Reports", nodeType: "item", parentGroupKey: "group:reporting:insights_automation" },
  ],

  document_control: [
    { navKey: "group:document_control:documents", label: "Documents", nodeType: "item" },
    { navKey: "/dashboard/documents", label: "Documents", nodeType: "item", parentGroupKey: "group:document_control:documents" },
    { navKey: "/dashboard/documents/transmittals", label: "Transmittals", nodeType: "item", parentGroupKey: "group:document_control:documents" },

    { navKey: "group:document_control:controller", label: "Controller", nodeType: "item" },
    { navKey: "/dashboard/documents/controller", label: "Controller Dashboard", nodeType: "item", parentGroupKey: "group:document_control:controller" },
    { navKey: "/dashboard/documents/audit-log", label: "Audit Log", nodeType: "item", parentGroupKey: "group:document_control:controller" },
  ],

  planning: [
    { navKey: "group:planning:schedule", label: "Schedule", nodeType: "item" },
    { navKey: "/dashboard/planning", label: "Dashboard", nodeType: "item", parentGroupKey: "group:planning:schedule" },
    { navKey: "/dashboard/planning/gantt", label: "Gantt Chart", nodeType: "item", parentGroupKey: "group:planning:schedule" },
    { navKey: "/dashboard/planning/sheet", label: "Sheet", nodeType: "item", parentGroupKey: "group:planning:schedule" },
    { navKey: "/dashboard/wbs/lookahead", label: "Look-ahead", nodeType: "item", parentGroupKey: "group:planning:schedule" },
    { navKey: "/dashboard/planning/calendars", label: "Calendars", nodeType: "item", parentGroupKey: "group:planning:schedule" },
    { navKey: "/dashboard/planning/comparison", label: "Comparison", nodeType: "item", parentGroupKey: "group:planning:schedule" },

    { navKey: "group:planning:resources_reports", label: "Resources & Reports", nodeType: "item" },
    { navKey: "/dashboard/planning/resource-loading", label: "Resources", nodeType: "item", parentGroupKey: "group:planning:resources_reports" },
    { navKey: "/dashboard/planning/reports", label: "Reports", nodeType: "item", parentGroupKey: "group:planning:resources_reports" },
  ],

  design: [
    { navKey: "group:design:correspondence", label: "Correspondence", nodeType: "item" },
    { navKey: "/dashboard/design", label: "Dashboard", nodeType: "item", parentGroupKey: "group:design:correspondence" },
    { navKey: "/dashboard/design/coordination", label: "Coordination", nodeType: "item", parentGroupKey: "group:design:correspondence" },
    { navKey: "/dashboard/design/markup", label: "Drawing Markup", nodeType: "item", parentGroupKey: "group:design:correspondence" },
    { navKey: "/dashboard/design/bim", label: "BIM Viewer", nodeType: "item", parentGroupKey: "group:design:correspondence" },

    { navKey: "group:design:architecture", label: "Architecture", nodeType: "item" },
    { navKey: "/dashboard/design/arc/drawings", label: "ARC Drawings", nodeType: "item", parentGroupKey: "group:design:architecture" },
    { navKey: "/dashboard/design/arc/room-data", label: "Room Data", nodeType: "item", parentGroupKey: "group:design:architecture" },
    { navKey: "/dashboard/design/arc/rfi", label: "ARC RFI", nodeType: "item", parentGroupKey: "group:design:architecture" },
    { navKey: "/dashboard/design/arc/door-schedule", label: "Door Schedule", nodeType: "item", parentGroupKey: "group:design:architecture" },
    { navKey: "/dashboard/design/arc/window-schedule", label: "Window Schedule", nodeType: "item", parentGroupKey: "group:design:architecture" },
    { navKey: "/dashboard/design/arc/finish-schedule", label: "Finish Schedule", nodeType: "item", parentGroupKey: "group:design:architecture" },
    { navKey: "/dashboard/design/arc/material-approval", label: "Material Approval", nodeType: "item", parentGroupKey: "group:design:architecture" },

    { navKey: "group:design:structure", label: "Structure", nodeType: "item" },
    { navKey: "/dashboard/design/str/drawings", label: "STR Drawings", nodeType: "item", parentGroupKey: "group:design:structure" },
    { navKey: "/dashboard/design/str/calculations", label: "Calculations", nodeType: "item", parentGroupKey: "group:design:structure" },
    { navKey: "/dashboard/design/str/models", label: "BIM Models", nodeType: "item", parentGroupKey: "group:design:structure" },
    { navKey: "/dashboard/design/str/rebar", label: "Rebar Scheduling", nodeType: "item", parentGroupKey: "group:design:structure" },
    { navKey: "/dashboard/design/str/rfi", label: "STR RFI", nodeType: "item", parentGroupKey: "group:design:structure" },
    { navKey: "/dashboard/design/str/technical-queries", label: "Tech. Queries", nodeType: "item", parentGroupKey: "group:design:structure" },
    { navKey: "/dashboard/design/str/design-changes", label: "Design Changes", nodeType: "item", parentGroupKey: "group:design:structure" },

    { navKey: "group:design:mep", label: "MEP", nodeType: "item" },
    { navKey: "/dashboard/design/mep/drawings", label: "MEP Drawings", nodeType: "item", parentGroupKey: "group:design:mep" },
    { navKey: "/dashboard/design/mep/equipment", label: "Equipment", nodeType: "item", parentGroupKey: "group:design:mep" },
    { navKey: "/dashboard/design/mep/load-schedule", label: "Load Schedule", nodeType: "item", parentGroupKey: "group:design:mep" },
    { navKey: "/dashboard/design/mep/sleeves", label: "Sleeve Details", nodeType: "item", parentGroupKey: "group:design:mep" },
    { navKey: "/dashboard/design/mep/submittals", label: "Submittals", nodeType: "item", parentGroupKey: "group:design:mep" },
    { navKey: "/dashboard/design/mep/rfi", label: "MEP RFI", nodeType: "item", parentGroupKey: "group:design:mep" },
    { navKey: "/dashboard/design/mep/commissioning", label: "Commissioning", nodeType: "item", parentGroupKey: "group:design:mep" },
  ],

  procurement: [
    { navKey: "group:procurement:overview", label: "Overview", nodeType: "item" },
    { navKey: "/dashboard/procurement", label: "Dashboard", nodeType: "item", parentGroupKey: "group:procurement:overview" },
    { navKey: "/dashboard/procurement/analytics", label: "Analytics", nodeType: "item", parentGroupKey: "group:procurement:overview" },
    { navKey: "/dashboard/procurement/boq", label: "BOQ", nodeType: "item", parentGroupKey: "group:procurement:overview" },

    { navKey: "group:procurement:suppliers", label: "Suppliers", nodeType: "item" },
    { navKey: "/dashboard/procurement/supplier-portal", label: "Supplier Portal", nodeType: "item", parentGroupKey: "group:procurement:suppliers" },
    { navKey: "/dashboard/procurement/suppliers", label: "Supplier List", nodeType: "item", parentGroupKey: "group:procurement:suppliers" },
    { navKey: "/dashboard/procurement/prequalification", label: "Pre-Qualification", nodeType: "item", parentGroupKey: "group:procurement:suppliers" },
    { navKey: "/dashboard/procurement/supplier-performance", label: "Performance", nodeType: "item", parentGroupKey: "group:procurement:suppliers" },

    { navKey: "group:procurement:sourcing_receiving", label: "Sourcing & Receiving", nodeType: "item" },
    { navKey: "/dashboard/procurement/pr", label: "Purchase Requisitions", nodeType: "item", parentGroupKey: "group:procurement:sourcing_receiving" },
    { navKey: "/dashboard/procurement/rfq", label: "RFQs", nodeType: "item", parentGroupKey: "group:procurement:sourcing_receiving" },
    { navKey: "/dashboard/procurement/po", label: "Purchase Orders", nodeType: "item", parentGroupKey: "group:procurement:sourcing_receiving" },
    { navKey: "/dashboard/procurement/auto-reorder", label: "Auto Reorder", nodeType: "item", parentGroupKey: "group:procurement:sourcing_receiving" },
    { navKey: "/dashboard/procurement/goods-receipt", label: "Goods Receipt", nodeType: "item", parentGroupKey: "group:procurement:sourcing_receiving" },
    { navKey: "/dashboard/procurement/invoice-matches", label: "Invoice Matching", nodeType: "item", parentGroupKey: "group:procurement:sourcing_receiving" },
    { navKey: "/dashboard/procurement/notifications", label: "Notifications", nodeType: "item", parentGroupKey: "group:procurement:sourcing_receiving" },
    { navKey: "/dashboard/procurement/audit-log", label: "Audit Log", nodeType: "item", parentGroupKey: "group:procurement:sourcing_receiving" },
  ],

  inventory: [
    { navKey: "group:inventory:overview", label: "Overview", nodeType: "item" },
    { navKey: "/dashboard/inventory", label: "Dashboard", nodeType: "item", parentGroupKey: "group:inventory:overview" },
    { navKey: "/dashboard/inventory/stock", label: "Stock", nodeType: "item", parentGroupKey: "group:inventory:overview" },
    { navKey: "/dashboard/inventory/items", label: "Item Master", nodeType: "item", parentGroupKey: "group:inventory:overview" },
    { navKey: "/dashboard/inventory/stores", label: "Stores & Locations", nodeType: "item", parentGroupKey: "group:inventory:overview" },
    { navKey: "/dashboard/inventory/tools", label: "Tools", nodeType: "item", parentGroupKey: "group:inventory:overview" },

    { navKey: "group:inventory:stock_operations", label: "Stock Operations", nodeType: "item" },
    { navKey: "/dashboard/inventory/grns", label: "GRN", nodeType: "item", parentGroupKey: "group:inventory:stock_operations" },
    { navKey: "/dashboard/inventory/mrs", label: "Material Requisitions", nodeType: "item", parentGroupKey: "group:inventory:stock_operations" },
    { navKey: "/dashboard/inventory/returns", label: "Returns", nodeType: "item", parentGroupKey: "group:inventory:stock_operations" },
    { navKey: "/dashboard/inventory/transfers", label: "Transfers", nodeType: "item", parentGroupKey: "group:inventory:stock_operations" },
    { navKey: "/dashboard/inventory/adjustments", label: "Adjustments", nodeType: "item", parentGroupKey: "group:inventory:stock_operations" },
    { navKey: "/dashboard/inventory/stocktakes", label: "Stocktakes", nodeType: "item", parentGroupKey: "group:inventory:stock_operations" },
    { navKey: "/dashboard/inventory/movements", label: "Movements", nodeType: "item", parentGroupKey: "group:inventory:stock_operations" },
  ],

  qs: [
    { navKey: "group:qs:tendering", label: "Tender & Estimate", nodeType: "item" },
    { navKey: "/dashboard/tenders/register", label: "Tender Register", nodeType: "item", parentGroupKey: "group:qs:tendering" },
    { navKey: "/dashboard/tenders/tender-management", label: "Tender Management", nodeType: "item", parentGroupKey: "group:qs:tendering" },
    { navKey: "/dashboard/tenders/cost-estimation", label: "Cost Estimation", nodeType: "item", parentGroupKey: "group:qs:tendering" },
    { navKey: "/dashboard/tenders/submissions", label: "Submissions", nodeType: "item", parentGroupKey: "group:qs:tendering" },
    { navKey: "/dashboard/tenders/bid-evaluation", label: "Bid Evaluation", nodeType: "item", parentGroupKey: "group:qs:tendering" },

    { navKey: "group:qs:cost_rate_library", label: "Cost & Rate Library", nodeType: "item" },
    { navKey: "/dashboard/qs/dwl-materials", label: "Material Master", nodeType: "item", parentGroupKey: "group:qs:cost_rate_library" },
    { navKey: "/dashboard/qs/dwl-resources", label: "Resource Master", nodeType: "item", parentGroupKey: "group:qs:cost_rate_library" },
    { navKey: "/dashboard/qs/dwl-suppliers", label: "Supplier Master", nodeType: "item", parentGroupKey: "group:qs:cost_rate_library" },
    { navKey: "/dashboard/qs/dwl-subcontractor-rates", label: "Subcontractor Rates", nodeType: "item", parentGroupKey: "group:qs:cost_rate_library" },
    { navKey: "/dashboard/qs/dwl-labor-rates", label: "Labor Rates", nodeType: "item", parentGroupKey: "group:qs:cost_rate_library" },
    { navKey: "/dashboard/qs/dwl-price-approvals", label: "Price Approvals", nodeType: "item", parentGroupKey: "group:qs:cost_rate_library" },
    { navKey: "/dashboard/qs/dwl-price-dashboard", label: "Price Analytics", nodeType: "item", parentGroupKey: "group:qs:cost_rate_library" },
    { navKey: "/dashboard/qs/dwl-material-import", label: "Import Template", nodeType: "item", parentGroupKey: "group:qs:cost_rate_library" },

    // navKey keeps the historical "libraries" slug so existing nav_item_settings rows still apply.
    { navKey: "group:qs:libraries", label: "Cost & Estimation", nodeType: "item" },
    { navKey: "/dashboard/qs/dwl-cost-items", label: "Cost Item Library", nodeType: "item", parentGroupKey: "group:qs:libraries" },
    { navKey: "/dashboard/qs/dwl-estimate", label: "Direct Works Quick Estimate", nodeType: "item", parentGroupKey: "group:qs:libraries" },
    { navKey: "/dashboard/tenders/budget-codes", label: "Budget Codes", nodeType: "item", parentGroupKey: "group:qs:libraries" },
    { navKey: "/dashboard/qs/element-library", label: "Element Library", nodeType: "item", parentGroupKey: "group:qs:libraries" },
    { navKey: "/dashboard/tenders/cost-library", label: "Prelim Cost Library", nodeType: "item", parentGroupKey: "group:qs:libraries" },

    { navKey: "group:qs:cost_control", label: "Cost Control", nodeType: "item" },
    { navKey: "/dashboard/qs/overview", label: "Overview", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs", label: "Dashboard", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs/boq", label: "BOQ", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs?tab=cost-control", label: "Cost Control", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs?tab=contingency", label: "Contingency", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs/evm", label: "Earned Value", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs?tab=portfolio", label: "Portfolio", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs?tab=audit", label: "Audit Log", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs?tab=currency", label: "Currency", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs/claims", label: "Progress Claims", nodeType: "item", parentGroupKey: "group:qs:cost_control" },
    { navKey: "/dashboard/qs/variations", label: "Variations", nodeType: "item", parentGroupKey: "group:qs:cost_control" },

    { navKey: "group:qs:subcontractor", label: "Subcon Mgmt", nodeType: "item" },
    { navKey: "/dashboard/subcontractors", label: "Subcontracts", nodeType: "item", parentGroupKey: "group:qs:subcontractor" },
    { navKey: "/dashboard/subcontractors/back-charges", label: "Back Charges", nodeType: "item", parentGroupKey: "group:qs:subcontractor" },
    { navKey: "/dashboard/subcontractors/performance-notices", label: "Performance Notices", nodeType: "item", parentGroupKey: "group:qs:subcontractor" },

    { navKey: "group:qs:qto", label: "Quantity Take-off", nodeType: "item" },
    { navKey: "/dashboard/qto", label: "Take-off", nodeType: "item", parentGroupKey: "group:qs:qto" },
    { navKey: "/dashboard/qto?tab=drawings", label: "Drawings", nodeType: "item", parentGroupKey: "group:qs:qto" },
    { navKey: "/dashboard/qto?tab=documents", label: "Documents", nodeType: "item", parentGroupKey: "group:qs:qto" },

    { navKey: "group:qs:contract_admin", label: "Contract Admin", nodeType: "item" },
    { navKey: "/dashboard/contracts/register", label: "Contract Register", nodeType: "item", parentGroupKey: "group:qs:contract_admin" },
    { navKey: "/dashboard/contracts/notices", label: "Notices", nodeType: "item", parentGroupKey: "group:qs:contract_admin" },
    { navKey: "/dashboard/contracts/employer-instructions", label: "Employer Instructions", nodeType: "item", parentGroupKey: "group:qs:contract_admin" },
    { navKey: "/dashboard/contracts/correspondence", label: "Correspondence", nodeType: "item", parentGroupKey: "group:qs:contract_admin" },
    { navKey: "/dashboard/contracts/entitlements", label: "Entitlements", nodeType: "item", parentGroupKey: "group:qs:contract_admin" },
  ],

  construction: [
    { navKey: "group:construction:site_quality", label: "Site & Quality", nodeType: "item" },
    { navKey: "/dashboard/site", label: "Dashboard", nodeType: "item", parentGroupKey: "group:construction:site_quality" },
    { navKey: "/dashboard/site/daily-reports", label: "Daily Reports", nodeType: "item", parentGroupKey: "group:construction:site_quality" },
    { navKey: "/dashboard/site/manpower", label: "Manpower", nodeType: "item", parentGroupKey: "group:construction:site_quality" },
    { navKey: "/dashboard/site/equipment", label: "Equipment", nodeType: "item", parentGroupKey: "group:construction:site_quality" },
    { navKey: "/dashboard/site/progress-photos", label: "Progress Photos", nodeType: "item", parentGroupKey: "group:construction:site_quality" },
    { navKey: "/dashboard/qaqc", label: "Inspections & ITP", nodeType: "item", parentGroupKey: "group:construction:site_quality" },
    { navKey: "/dashboard/qaqc/ncrs", label: "NCR Management", nodeType: "item", parentGroupKey: "group:construction:site_quality" },

    { navKey: "group:construction:hse", label: "HSE", nodeType: "item" },
    { navKey: "/dashboard/hse", label: "Dashboard", nodeType: "item", parentGroupKey: "group:construction:hse" },
    { navKey: "/dashboard/hse/permits", label: "Work Permits", nodeType: "item", parentGroupKey: "group:construction:hse" },
    { navKey: "/dashboard/hse/toolbox-talks", label: "Toolbox Talks", nodeType: "item", parentGroupKey: "group:construction:hse" },
    { navKey: "/dashboard/hse/incidents", label: "Incidents", nodeType: "item", parentGroupKey: "group:construction:hse" },
    { navKey: "/dashboard/hse/risk-assessments", label: "Risk Assessments", nodeType: "item", parentGroupKey: "group:construction:hse" },
    { navKey: "/dashboard/hse/observations", label: "Observations", nodeType: "item", parentGroupKey: "group:construction:hse" },
  ],

  hr: [
    { navKey: "group:hr:workforce", label: "Workforce", nodeType: "item" },
    { navKey: "/dashboard/hr/dashboard", label: "Workforce Dashboard", nodeType: "item", parentGroupKey: "group:hr:workforce" },
    { navKey: "/dashboard/hr/organization", label: "Organization Setup", nodeType: "item", parentGroupKey: "group:hr:workforce" },
    { navKey: "/dashboard/hr/employees", label: "Employee Master", nodeType: "item", parentGroupKey: "group:hr:workforce" },
    { navKey: "/dashboard/hr/resources", label: "Resource Allocation", nodeType: "item", parentGroupKey: "group:hr:workforce" },
    { navKey: "/dashboard/hr/assets", label: "Employee Assets", nodeType: "item", parentGroupKey: "group:hr:workforce" },
    { navKey: "/dashboard/hr/training", label: "Training & Competency", nodeType: "item", parentGroupKey: "group:hr:workforce" },
    { navKey: "/dashboard/hr/performance", label: "Performance", nodeType: "item", parentGroupKey: "group:hr:workforce" },
    { navKey: "/dashboard/hr/recruitment", label: "Recruitment", nodeType: "item", parentGroupKey: "group:hr:workforce" },

    { navKey: "group:hr:time_payroll", label: "Time & Payroll", nodeType: "item" },
    { navKey: "/dashboard/hr/attendance", label: "Attendance", nodeType: "item", parentGroupKey: "group:hr:time_payroll" },
    { navKey: "/dashboard/hr/timesheet", label: "Timesheet", nodeType: "item", parentGroupKey: "group:hr:time_payroll" },
    { navKey: "/dashboard/hr/overtime", label: "OT Management", nodeType: "item", parentGroupKey: "group:hr:time_payroll" },
    { navKey: "/dashboard/hr/leave", label: "E-Leave", nodeType: "item", parentGroupKey: "group:hr:time_payroll" },
    { navKey: "/dashboard/hr/payroll", label: "Payroll", nodeType: "item", parentGroupKey: "group:hr:time_payroll" },
  ],

  account: [
    { navKey: "group:account:overview", label: "Overview", nodeType: "item" },
    { navKey: "/dashboard/account", label: "Overview", nodeType: "item", parentGroupKey: "group:account:overview" },

    { navKey: "group:account:reports", label: "Reports", nodeType: "item" },
    { navKey: "/dashboard/account/reports", label: "Reports", nodeType: "item", parentGroupKey: "group:account:reports" },
  ],

  administration: [
    { navKey: "/dashboard/settings", label: "Settings", nodeType: "item" },
    { navKey: "/dashboard/administration/users", label: "User Management", nodeType: "item" },
    { navKey: "/dashboard/administration/roles-permissions", label: "Roles & Permissions", nodeType: "item" },
    { navKey: "/dashboard/administration/departments", label: "Departments", nodeType: "item" },
    { navKey: "/dashboard/administration/security", label: "Security", nodeType: "item" },
    { navKey: "/dashboard/administration/audit-logs", label: "Audit Logs", nodeType: "item" },
    { navKey: "/dashboard/administration/stakeholder-templates", label: "Stakeholder Templates", nodeType: "item" },
    { navKey: "/dashboard/administration/master-libraries", label: "Master Libraries", nodeType: "item" },
  ],
};
