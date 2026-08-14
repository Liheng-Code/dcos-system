// Single source of truth for the Procurement navigation layout:
//   - The sidebar shows one flat item per group (see components/dashboard/sidebar.tsx)
//   - The procurement header shows the group's child pages as tabs (see
//     app/dashboard/procurement/layout.tsx)
// "Cost Management" folds into Overview (BOQ is reference data used across
// the module) and "Sourcing & Ordering" / "Receiving & Settlement" /
// "Administration" merge into one group since they're really one sequential
// pipeline: request -> RFQ -> PO -> receive -> match invoice -> notify/audit.

import { getActiveModuleGroup, type ModuleNavGroup } from "@/lib/module-nav";

export type ProcurementTabItem = ModuleNavGroup["items"][number];
export type ProcurementGroup = ModuleNavGroup;

export const PROCUREMENT_GROUPS: ModuleNavGroup[] = [
  {
    key: "overview",
    navKey: "group:procurement:overview",
    label: "Overview",
    href: "/dashboard/procurement",
    items: [
      { label: "Dashboard", href: "/dashboard/procurement" },
      { label: "Analytics", href: "/dashboard/procurement/analytics" },
      { label: "BOQ", href: "/dashboard/procurement/boq" },
    ],
  },
  {
    key: "suppliers",
    navKey: "group:procurement:suppliers",
    label: "Suppliers",
    href: "/dashboard/procurement/supplier-portal",
    items: [
      {
        label: "Supplier Portal",
        href: "/dashboard/procurement/supplier-portal",
        children: [
          { label: "RFQ Responses", href: "/dashboard/procurement/supplier-portal?sub=rfqs" },
          { label: "Purchase Orders", href: "/dashboard/procurement/supplier-portal?sub=pos" },
          { label: "Delivery Notice", href: "/dashboard/procurement/supplier-portal?sub=delivery" },
        ],
      },
      { label: "Supplier List", href: "/dashboard/procurement/suppliers" },
      { label: "Pre-Qualification", href: "/dashboard/procurement/prequalification" },
      { label: "Performance", href: "/dashboard/procurement/supplier-performance" },
    ],
  },
  {
    key: "sourcing_receiving",
    navKey: "group:procurement:sourcing_receiving",
    label: "Sourcing & Receiving",
    href: "/dashboard/procurement/pr",
    items: [
      { label: "Purchase Requisitions", href: "/dashboard/procurement/pr" },
      { label: "RFQs", href: "/dashboard/procurement/rfq" },
      { label: "Purchase Orders", href: "/dashboard/procurement/po" },
      { label: "Auto Reorder", href: "/dashboard/procurement/auto-reorder" },
      { label: "Goods Receipt", href: "/dashboard/procurement/goods-receipt" },
      { label: "Invoice Matching", href: "/dashboard/procurement/invoice-matches" },
      { label: "Notifications", href: "/dashboard/procurement/notifications" },
      { label: "Audit Log", href: "/dashboard/procurement/audit-log" },
    ],
  },
];

export function getActiveProcurementGroup(pathname: string): ModuleNavGroup | null {
  return getActiveModuleGroup(PROCUREMENT_GROUPS, pathname);
}
