import { HardHat, ShieldCheck } from "lucide-react";
import { CONSTRUCTION_GROUPS } from "@/lib/construction/construction-nav";
import type { ModuleManifest } from "@/lib/modules/types";

export const constructionModule: ModuleManifest = {
  key: "construction",
  name: "Construction",
  rbacModules: ["construction", "qa_qc", "hse"],
  roleGoverned: true,
  routePrefixes: ["/dashboard/site", "/dashboard/qaqc", "/dashboard/hse"],
  visible: ({ isPrecontract }) => !isPrecontract,
  navGroups: CONSTRUCTION_GROUPS,
  groupIcons: {
    site_quality: HardHat,
    hse: ShieldCheck,
  },
  hub: {
    title: "Construction",
    description: "Daily reports, inspections, and HSE",
    href: "/dashboard/site",
    icon: HardHat,
    gradient: "from-orange-500 to-red-600",
    order: 8,
  },
};
