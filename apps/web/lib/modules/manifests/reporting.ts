import { BarChart2, TrendingUp } from "lucide-react";
import { REPORTING_GROUPS } from "@/lib/reporting/reporting-nav";
import type { ModuleManifest } from "@/lib/modules/types";

export const reportingModule: ModuleManifest = {
  key: "reporting",
  name: "Reporting",
  rbacModules: ["reporting_kpi"],
  roleGoverned: true,
  routePrefixes: ["/dashboard/reports", "/dashboard/insights"],
  navGroups: REPORTING_GROUPS,
  groupIcons: {
    reports: BarChart2,
    insights_automation: TrendingUp,
  },
  hub: {
    title: "Reporting",
    description: "Reports hub, scheduled reports, and insights",
    href: "/dashboard/reports",
    icon: BarChart2,
    gradient: "from-emerald-500 to-teal-600",
    order: 2,
  },
};
