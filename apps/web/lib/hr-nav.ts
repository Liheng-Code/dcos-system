// Single source of truth for the HR Management navigation layout (mirrors
// lib/account-nav.ts):
//   - The sidebar shows one flat item per group
//   - The HR header shows the group's child pages as tabs (see
//     app/dashboard/hr/layout.tsx)
// E-Leave, Payroll and OT Management each already have their own dedicated
// secondary sidebar (rendered by app/dashboard/hr/layout.tsx once inside
// those sections) — they only appear here as single leaf entry points.

import { getActiveModuleGroup, type ModuleNavGroup } from "@/lib/module-nav";

export type HrTabItem = ModuleNavGroup["items"][number];
export type HrGroup = ModuleNavGroup;

export const HR_GROUPS: ModuleNavGroup[] = [
  {
    key: "workforce",
    navKey: "group:hr:workforce",
    label: "Workforce",
    href: "/dashboard/hr/dashboard",
    items: [
      { label: "Workforce Dashboard", href: "/dashboard/hr/dashboard" },
      { label: "Organization Setup", href: "/dashboard/hr/organization" },
      { label: "Employee Master", href: "/dashboard/hr/employees" },
      { label: "Resource Allocation", href: "/dashboard/hr/resources" },
      { label: "Employee Assets", href: "/dashboard/hr/assets" },
      { label: "Training & Competency", href: "/dashboard/hr/training" },
      { label: "Performance", href: "/dashboard/hr/performance" },
      { label: "Recruitment", href: "/dashboard/hr/recruitment" },
    ],
  },
  {
    key: "time_payroll",
    navKey: "group:hr:time_payroll",
    label: "Time & Payroll",
    href: "/dashboard/hr/attendance",
    items: [
      { label: "Attendance", href: "/dashboard/hr/attendance" },
      { label: "Timesheet", href: "/dashboard/hr/timesheet" },
      { label: "OT Management", href: "/dashboard/hr/overtime" },
      { label: "E-Leave", href: "/dashboard/hr/leave" },
      { label: "Payroll", href: "/dashboard/hr/payroll" },
    ],
  },
];

export function getActiveHrGroup(pathname: string): ModuleNavGroup | null {
  return getActiveModuleGroup(HR_GROUPS, pathname);
}
