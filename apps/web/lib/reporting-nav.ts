// Single source of truth for the Reporting navigation layout (mirrors
// lib/qs-nav.ts): Reporting routes span /dashboard/reports and
// /dashboard/insights, so the header tabs are rendered by a thin layout in
// each of those directories via components/dashboard/reporting-module-header-tabs.tsx.
// "Financial Reports" and "Schedule Reports" link into the Account and
// Planning modules respectively, which own their own header tabs on those
// routes — they're included here only as sidebar-dropdown shortcuts.

import { getActiveModuleGroup, type ModuleNavGroup } from "@/lib/module-nav";

export type ReportingTabItem = ModuleNavGroup["items"][number];
export type ReportingGroup = ModuleNavGroup;

export const REPORTING_GROUPS: ModuleNavGroup[] = [
  {
    key: "reports",
    navKey: "group:reporting:reports",
    label: "Reports",
    href: "/dashboard/reports",
    items: [
      { label: "Reports Hub", href: "/dashboard/reports" },
      { label: "Financial Reports", href: "/dashboard/account/reports" },
      { label: "Schedule Reports", href: "/dashboard/planning/reports" },
    ],
  },
  {
    key: "insights_automation",
    navKey: "group:reporting:insights_automation",
    label: "Insights & Automation",
    href: "/dashboard/insights",
    items: [
      { label: "Insights", href: "/dashboard/insights" },
      { label: "Scheduled Reports", href: "/dashboard/reports/schedule" },
    ],
  },
];

export function getActiveReportingGroup(pathname: string): ModuleNavGroup | null {
  return getActiveModuleGroup(REPORTING_GROUPS, pathname);
}
