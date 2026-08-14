// Single source of truth for the Inventory navigation layout (mirrors
// lib/procurement-nav.ts):
//   - The sidebar shows one flat item per group
//   - The inventory header shows the group's child pages as tabs

import { getActiveModuleGroup, type ModuleNavGroup } from "@/lib/module-nav";

export type InventoryTabItem = ModuleNavGroup["items"][number];
export type InventoryGroup = ModuleNavGroup;

export const INVENTORY_GROUPS: ModuleNavGroup[] = [
  {
    key: "overview",
    navKey: "group:inventory:overview",
    label: "Overview",
    href: "/dashboard/inventory",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard/inventory",
        children: [
          { label: "Create GRN", href: "/dashboard/inventory/grns/new" },
          { label: "New MR", href: "/dashboard/inventory/mrs/new" },
          { label: "View Low Stock", href: "/dashboard/inventory/stock?low_stock=true" },
          { label: "Start Stock Take", href: "/dashboard/inventory/stocktakes/new" },
          { label: "New Adjustment", href: "/dashboard/inventory/adjustments/new" },
        ],
      },
      { label: "Stock", href: "/dashboard/inventory/stock" },
      { label: "Item Master", href: "/dashboard/inventory/items" },
      { label: "Stores & Locations", href: "/dashboard/inventory/stores" },
      { label: "Tools", href: "/dashboard/inventory/tools" },
    ],
  },
  {
    key: "stock_operations",
    navKey: "group:inventory:stock_operations",
    label: "Stock Operations",
    href: "/dashboard/inventory/grns",
    items: [
      { label: "GRN", href: "/dashboard/inventory/grns" },
      { label: "Material Requisitions", href: "/dashboard/inventory/mrs" },
      { label: "Returns", href: "/dashboard/inventory/returns" },
      { label: "Transfers", href: "/dashboard/inventory/transfers" },
      { label: "Adjustments", href: "/dashboard/inventory/adjustments" },
      { label: "Stocktakes", href: "/dashboard/inventory/stocktakes" },
      { label: "Movements", href: "/dashboard/inventory/movements" },
    ],
  },
];

export function getActiveInventoryGroup(pathname: string): ModuleNavGroup | null {
  return getActiveModuleGroup(INVENTORY_GROUPS, pathname);
}
