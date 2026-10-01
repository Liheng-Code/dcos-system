// Single source of truth for the Construction navigation layout (mirrors
// lib/reporting/reporting-nav.ts): Construction routes span /dashboard/site,
// /dashboard/qaqc and /dashboard/hse, so the header tabs are rendered by a
// thin layout in each of those directories via
// components/dashboard/construction-module-header-tabs.tsx.

import { getActiveModuleGroup, type ModuleNavGroup } from "@/lib/module-nav";

export type ConstructionTabItem = ModuleNavGroup["items"][number];
export type ConstructionGroup = ModuleNavGroup;

export const CONSTRUCTION_GROUPS: ModuleNavGroup[] = [
  {
    key: "site_quality",
    navKey: "group:construction:site_quality",
    label: "Site & Quality",
    href: "/dashboard/site",
    items: [
      { label: "Dashboard", href: "/dashboard/site" },
      { label: "Daily Reports", href: "/dashboard/site/daily-reports" },
      { label: "Manpower", href: "/dashboard/site/manpower" },
      { label: "Equipment", href: "/dashboard/site/equipment" },
      { label: "Progress Photos", href: "/dashboard/site/progress-photos" },
      {
        label: "Inspections & ITP",
        href: "/dashboard/qaqc",
        children: [
          { label: "Inspection & Test Plans", href: "/dashboard/qaqc?sub=itps" },
          { label: "Inspection Requests", href: "/dashboard/qaqc?sub=inspections" },
          { label: "NCRs", href: "/dashboard/qaqc?sub=ncrs" },
        ],
      },
    ],
  },
  {
    key: "hse",
    navKey: "group:construction:hse",
    label: "HSE",
    href: "/dashboard/hse",
    items: [
      { label: "Dashboard", href: "/dashboard/hse" },
      { label: "Work Permits", href: "/dashboard/hse/permits" },
      { label: "Toolbox Talks", href: "/dashboard/hse/toolbox-talks" },
      { label: "Incidents", href: "/dashboard/hse/incidents" },
      { label: "Risk Assessments", href: "/dashboard/hse/risk-assessments" },
      { label: "Observations", href: "/dashboard/hse/observations" },
    ],
  },
];

export function getActiveConstructionGroup(pathname: string): ModuleNavGroup | null {
  return getActiveModuleGroup(CONSTRUCTION_GROUPS, pathname);
}
