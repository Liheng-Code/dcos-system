import { Building2, PenTool, Send, Wind } from "lucide-react";
import { DESIGN_GROUPS } from "@/lib/design/design-nav";
import type { ModuleManifest } from "@/lib/modules/types";

export const designModule: ModuleManifest = {
  key: "design",
  name: "Design",
  // No role_permissions row uses a design/bim module code, so the module is
  // always treated as permitted (see lib/module-key-map.ts).
  rbacModules: [],
  roleGoverned: true,
  routePrefixes: ["/dashboard/design"],
  // Design & Build / Turnkey tenders carry the design, so the bid team needs the Design module.
  visible: ({ isPrecontract, isDesignTender }) => !isPrecontract || isDesignTender,
  navGroups: DESIGN_GROUPS,
  groupIcons: {
    correspondence: Send,
    architecture: Building2,
    structure: PenTool,
    mep: Wind,
  },
  hub: {
    title: "Design",
    description: "Architecture, structure, MEP, and BIM",
    href: "/dashboard/design",
    icon: PenTool,
    gradient: "from-violet-500 to-purple-600",
    order: 5,
  },
};
