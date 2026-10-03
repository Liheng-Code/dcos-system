// Single source of truth for the Quantity Surveying navigation layout (mirrors
// lib/procurement/procurement-nav.ts):
//   - The sidebar shows one flat item per group
//   - The QS header shows the group's child pages as tabs
// QS routes span /dashboard/qs, /dashboard/tenders, /dashboard/subcontractors
// and /dashboard/contracts, so the header tabs are rendered by layouts in each
// of those directories via components/dashboard/qs-module-header-tabs.tsx.

import { getActiveModuleGroup, type ModuleNavGroup } from "@/lib/module-nav";

export type QsTabItem = ModuleNavGroup["items"][number];
export type QsGroup = ModuleNavGroup;

export const QS_GROUPS: ModuleNavGroup[] = [
  {
    key: "tendering",
    navKey: "group:qs:tendering",
    label: "Tender & Estimate",
    href: "/dashboard/tenders/register",
    visible: ({ isPrecontract }) => isPrecontract,
    items: [
      { label: "Tender Register", href: "/dashboard/tenders/register" },
      { label: "Tender Management", href: "/dashboard/tenders/tender-management" },
      { label: "Cost Estimation", href: "/dashboard/tenders/cost-estimation" },
      { label: "Submissions", href: "/dashboard/tenders/submissions" },
      { label: "Bid Evaluation", href: "/dashboard/tenders/bid-evaluation" },
    ],
  },
  {
    key: "cost_rate_library",
    navKey: "group:qs:cost_rate_library",
    label: "Cost & Rate Library",
    href: "/dashboard/qs/dwl-materials",
    // Level 1 (dwl_resources + prices): one resource table, one typed tab per
    // resource type, then the cross-type price register and supplier side.
    items: [
      { label: "Material Master", href: "/dashboard/qs/dwl-materials" },
      { label: "Material Divisions", href: "/dashboard/qs/dwl-material-divisions" },
      { label: "Labor Rates", href: "/dashboard/qs/dwl-labor-rates" },
      { label: "Equipment Rates", href: "/dashboard/qs/dwl-equipment-rates" },
      { label: "Subcontractor Rates", href: "/dashboard/qs/dwl-subcontractor-rates" },
      { label: "All Resources", href: "/dashboard/qs/dwl-resources" },
      { label: "Supplier Master", href: "/dashboard/qs/dwl-suppliers" },
      { label: "Price Approvals", href: "/dashboard/qs/dwl-price-approvals" },
      { label: "Price Analytics", href: "/dashboard/qs/dwl-price-dashboard" },
      { label: "Import Template", href: "/dashboard/qs/dwl-material-import" },
    ],
  },
  {
    // navKey keeps its historical "libraries" slug so nav_item_settings rows survive the relabel.
    key: "libraries",
    navKey: "group:qs:libraries",
    label: "Cost & Estimation",
    href: "/dashboard/qs/dwl-cost-items",
    // Levels 2-4 (work items, assemblies, estimates) plus the classification libraries.
    // Unit Rate Library is intentionally not linked: it is a legacy standalone list that no
    // tender consumes (pullFromUnitRateLibrary has no callers). Its route still exists.
    items: [
      { label: "Cost Item Library", href: "/dashboard/qs/dwl-cost-items" },
      // Advanced editors: Cost Item Library is the primary UI (one work item per item). These two
      // are for multi-work-item assemblies and recipe editing, and are reached from a Cost Item's
      // detail header, so they claim their routes but are not shown as tabs.
      { label: "Direct Works Rate Build-Up", href: "/dashboard/qs/dwl-work-items", hidden: true },
      { label: "Direct Works Assemblies", href: "/dashboard/qs/dwl-assemblies", hidden: true },
      { label: "Direct Works Quick Estimate", href: "/dashboard/qs/dwl-estimate" },
      { label: "Budget Codes", href: "/dashboard/tenders/budget-codes" },
      { label: "Element Library", href: "/dashboard/qs/element-library" },
      { label: "Prelim Cost Library", href: "/dashboard/tenders/cost-library" },
    ],
  },
  {
    // Saved Tender BOQ versions (20260928000009_tender_cost_database.sql). Shown for pre- and
    // post-contract projects alike: it is company history, not tied to the selected project.
    key: "cost_database",
    navKey: "group:qs:cost_database",
    label: "Cost Database",
    href: "/dashboard/qs/cost-database",
    items: [{ label: "Cost Database", href: "/dashboard/qs/cost-database" }],
  },
  {
    key: "cost_control",
    navKey: "group:qs:cost_control",
    label: "Cost Control",
    href: "/dashboard/qs",
    visible: ({ isPrecontract }) => !isPrecontract,
    items: [
      { label: "Overview", href: "/dashboard/qs/overview" },
      { label: "Dashboard", href: "/dashboard/qs" },
      { label: "BOQ", href: "/dashboard/qs/boq" },
      {
        label: "Cost Control",
        href: "/dashboard/qs?tab=cost-control",
        children: [
          { label: "Cost Dashboard", href: "/dashboard/qs?tab=cost-control&sub=overview" },
          { label: "Budget & Variance", href: "/dashboard/qs?tab=cost-control&sub=variance" },
          { label: "Budget Revisions", href: "/dashboard/qs?tab=cost-control&sub=revisions" },
          { label: "Cost Transactions", href: "/dashboard/qs?tab=cost-control&sub=costs" },
          { label: "Cost / m²", href: "/dashboard/qs?tab=cost-control&sub=cost-per-m2" },
        ],
      },
      { label: "Contingency", href: "/dashboard/qs?tab=contingency" },
      {
        label: "Earned Value",
        href: "/dashboard/qs/evm",
        children: [
          { label: "Dashboard", href: "/dashboard/qs/evm?sub=dashboard" },
          { label: "S-Curve", href: "/dashboard/qs/evm?sub=scurve" },
        ],
      },
      { label: "Portfolio", href: "/dashboard/qs?tab=portfolio" },
      {
        label: "Audit Log",
        href: "/dashboard/qs?tab=audit",
        children: [
          { label: "All", href: "/dashboard/qs?tab=audit&sub=all" },
          { label: "Variation Orders", href: "/dashboard/qs?tab=audit&sub=qs_variation_orders" },
          { label: "Progress Claims", href: "/dashboard/qs?tab=audit&sub=qs_progress_claims" },
          { label: "Retention", href: "/dashboard/qs?tab=audit&sub=qs_retention_ledger" },
          { label: "Contingency", href: "/dashboard/qs?tab=audit&sub=qs_contingency_drawdowns" },
          { label: "Budget Revisions", href: "/dashboard/qs?tab=audit&sub=qs_budget_revisions" },
        ],
      },
      { label: "Currency", href: "/dashboard/qs?tab=currency" },
      {
        label: "Progress Claims",
        href: "/dashboard/qs/claims",
        children: [
          { label: "Progress Claims", href: "/dashboard/qs/claims?sub=claims" },
          { label: "Sub-IPCs", href: "/dashboard/qs/claims?sub=subipcs" },
          { label: "Retention", href: "/dashboard/qs/claims?sub=retention" },
          { label: "Advance Recovery", href: "/dashboard/qs/claims?sub=advance" },
          { label: "Payments", href: "/dashboard/qs/claims?sub=payments" },
        ],
      },
      {
        label: "Variations",
        href: "/dashboard/qs/variations",
        children: [
          { label: "Main Contract", href: "/dashboard/qs/variations?sub=main" },
          { label: "Subcontract", href: "/dashboard/qs/variations?sub=sub" },
        ],
      },
    ],
  },
  {
    key: "subcontractor",
    navKey: "group:qs:subcontractor",
    label: "Subcon Mgmt",
    href: "/dashboard/subcontractors",
    visible: ({ isPrecontract }) => !isPrecontract,
    items: [
      { label: "Subcontracts", href: "/dashboard/subcontractors" },
      { label: "Back Charges", href: "/dashboard/subcontractors/back-charges" },
      { label: "Performance Notices", href: "/dashboard/subcontractors/performance-notices" },
    ],
  },
  {
    key: "qto",
    navKey: "group:qs:qto",
    label: "Quantity Take-off",
    href: "/dashboard/qto",
    items: [
      { label: "Take-off", href: "/dashboard/qto" },
      { label: "Drawings", href: "/dashboard/qto?tab=drawings" },
      { label: "Documents", href: "/dashboard/qto?tab=documents" },
    ],
  },
  {
    key: "contract_admin",
    navKey: "group:qs:contract_admin",
    label: "Contract Admin",
    href: "/dashboard/contracts/register",
    visible: ({ isPrecontract }) => !isPrecontract,
    items: [
      { label: "Contract Register", href: "/dashboard/contracts/register" },
      { label: "Notices", href: "/dashboard/contracts/notices" },
      { label: "Employer Instructions", href: "/dashboard/contracts/employer-instructions" },
      { label: "Correspondence", href: "/dashboard/contracts/correspondence" },
      { label: "Entitlements", href: "/dashboard/contracts/entitlements" },
    ],
  },
];

export function getActiveQsGroup(pathname: string, isPrecontract: boolean): ModuleNavGroup | null {
  return getActiveModuleGroup(QS_GROUPS, pathname, { isPrecontract });
}
