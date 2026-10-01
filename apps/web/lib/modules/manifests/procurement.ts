import { Building2, FileText, LayoutDashboard, ShoppingCart } from "lucide-react";
import { PROCUREMENT_GROUPS } from "@/lib/procurement/procurement-nav";
import type { ModuleManifest } from "@/lib/modules/types";

export const procurementModule: ModuleManifest = {
  key: "procurement",
  name: "Procurement",
  rbacModules: ["procurement"],
  roleGoverned: true,
  routePrefixes: ["/dashboard/procurement"],
  navGroups: PROCUREMENT_GROUPS,
  groupIcons: {
    overview: LayoutDashboard,
    suppliers: Building2,
    sourcing_receiving: FileText,
  },
  hub: {
    title: "Procurement",
    description: "BOQ, suppliers, RFQs, and purchase orders",
    href: "/dashboard/procurement",
    icon: ShoppingCart,
    gradient: "from-amber-500 to-orange-600",
    order: 6,
  },
};
