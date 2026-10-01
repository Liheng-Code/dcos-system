import {
  BarChart2,
  Boxes,
  Calculator,
  Database,
  FileSearch,
  FileSignature,
  Handshake,
  Layers,
  Ruler,
} from "lucide-react";
import { QS_GROUPS } from "@/lib/qs/qs-nav";
import type { ModuleManifest } from "@/lib/modules/types";

export const qsModule: ModuleManifest = {
  key: "qs",
  name: "Quantity Surveying",
  rbacModules: ["qs", "tender"],
  roleGoverned: true,
  routePrefixes: [
    "/dashboard/qs",
    "/dashboard/tenders",
    "/dashboard/subcontractors",
    "/dashboard/contracts",
    "/dashboard/qto",
  ],
  navGroups: QS_GROUPS,
  groupIcons: {
    tendering: FileSearch,
    cost_rate_library: Boxes,
    libraries: Layers,
    cost_database: Database,
    cost_control: BarChart2,
    subcontractor: Handshake,
    contract_admin: FileSignature,
    qto: Ruler,
  },
  groupStyle: "animated",
  hub: {
    title: "Quantity Surveying",
    description: "Tenders, cost control, and contract admin",
    href: "/dashboard/qs",
    precontractHref: "/dashboard/tenders/register",
    icon: Calculator,
    gradient: "from-cyan-500 to-sky-600",
    order: 7,
  },
};
