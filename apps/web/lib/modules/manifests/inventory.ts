import { Box, LayoutDashboard, Truck } from "lucide-react";
import { INVENTORY_GROUPS } from "@/lib/inventory/inventory-nav";
import type { ModuleManifest } from "@/lib/modules/types";

export const inventoryModule: ModuleManifest = {
  key: "inventory",
  name: "Inventory",
  rbacModules: ["inventory"],
  roleGoverned: true,
  routePrefixes: ["/dashboard/inventory"],
  navGroups: INVENTORY_GROUPS,
  groupIcons: {
    overview: LayoutDashboard,
    stock_operations: Truck,
  },
  hub: {
    title: "Inventory",
    description: "Stores, stock, GRN, and tools",
    href: "/dashboard/inventory",
    icon: Box,
    gradient: "from-teal-500 to-cyan-600",
    order: 10,
  },
};
