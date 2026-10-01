import { CalendarRange, GanttChartSquare, Gauge, Users } from "lucide-react";
import { PLANNING_GROUPS } from "@/lib/planning/planning-nav";
import type { ModuleManifest } from "@/lib/modules/types";

// Shown for tender projects too: the tender programme is a bid deliverable;
// execution-only pages are hidden per item in lib/planning/planning-nav.ts.
export const planningModule: ModuleManifest = {
  key: "planning",
  name: "Planning",
  rbacModules: ["planning"],
  roleGoverned: true,
  routePrefixes: ["/dashboard/planning"],
  navGroups: PLANNING_GROUPS,
  groupIcons: {
    schedule: GanttChartSquare,
    resources_reports: Users,
    productivity: Gauge,
  },
  hub: {
    title: "Planning",
    description: "Gantt chart, look-ahead, and resource loading",
    href: "/dashboard/planning",
    icon: CalendarRange,
    gradient: "from-indigo-500 to-violet-600",
    order: 4,
  },
};
