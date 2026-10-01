// Single source of truth for the Planning navigation layout (mirrors
// lib/reporting/reporting-nav.ts): Planning routes span /dashboard/planning and
// /dashboard/wbs/lookahead, so the header tabs are rendered by a thin layout
// in each of those directories via
// components/dashboard/planning-module-header-tabs.tsx.

import { getActiveModuleGroup, type ModuleNavContext, type ModuleNavGroup } from "@/lib/module-nav";

export type PlanningTabItem = ModuleNavGroup["items"][number];
export type PlanningGroup = ModuleNavGroup;

// A tender project needs a tender programme (Gantt/Sheet, calendars, resources, norms and
// cost rollup for time-related prelims) but not the tools for running a live job.
const executionOnly = ({ isPrecontract }: ModuleNavContext) => !isPrecontract;

export const PLANNING_GROUPS: ModuleNavGroup[] = [
  {
    key: "schedule",
    navKey: "group:planning:schedule",
    label: "Schedule",
    href: "/dashboard/planning",
    items: [
      { label: "Overview", href: "/dashboard/planning/overview" },
      { label: "Dashboard", href: "/dashboard/planning" },
      { label: "Gantt Chart", href: "/dashboard/planning/gantt" },
      { label: "Sheet", href: "/dashboard/planning/sheet" },
      {
        label: "Look-ahead",
        href: "/dashboard/wbs/lookahead",
        visible: executionOnly,
        children: [
          { label: "Look-ahead", href: "/dashboard/wbs/lookahead?sub=lookahead" },
          { label: "Weekly Plans", href: "/dashboard/wbs/lookahead?sub=weekly" },
          { label: "S-Curve & EVM", href: "/dashboard/wbs/lookahead?sub=scurve" },
          { label: "Progress Reviews", href: "/dashboard/wbs/lookahead?sub=progress-reviews" },
        ],
      },
      {
        label: "Calendars",
        href: "/dashboard/planning/calendars",
        children: [
          { label: "Task View", href: "/dashboard/planning/calendars?sub=tasks" },
          { label: "Work Calendar Settings", href: "/dashboard/planning/calendars?sub=settings" },
        ],
      },
      { label: "Comparison", href: "/dashboard/planning/comparison", visible: executionOnly },
      { label: "MS Project Sync", href: "/dashboard/planning/sync", visible: executionOnly },
      { label: "Activity Step Templates", href: "/dashboard/planning/activity-step-templates", visible: executionOnly },
    ],
  },
  {
    key: "resources_reports",
    navKey: "group:planning:resources_reports",
    label: "Resources & Reports",
    href: "/dashboard/planning/resource-loading",
    items: [
      { label: "Resources", href: "/dashboard/planning/resource-loading" },
      { label: "Members", href: "/dashboard/planning/members" },
      {
        label: "Delay Register",
        href: "/dashboard/planning/delays",
        visible: executionOnly,
        children: [
          { label: "Register", href: "/dashboard/planning/delays?sub=register" },
          { label: "Time Impact Analysis", href: "/dashboard/planning/delays?sub=tia" },
        ],
      },
      {
        label: "Reports",
        href: "/dashboard/planning/reports",
        children: [
          { label: "Delay Analysis", href: "/dashboard/planning/reports?sub=delay", visible: executionOnly },
          { label: "Schedule Summary", href: "/dashboard/planning/reports?sub=summary" },
          { label: "Milestones", href: "/dashboard/planning/reports?sub=milestone" },
        ],
      },
    ],
  },
  {
    // Productivity plan (docs/…/16-Productivity-and-Resource-Costing-Plan.md), Phase 1
    key: "productivity",
    navKey: "group:planning:productivity",
    label: "Productivity",
    href: "/dashboard/planning/productivity",
    items: [
      { label: "Norm Library", href: "/dashboard/planning/productivity" },
      { label: "Task Work", href: "/dashboard/planning/productivity/task-work", visible: executionOnly },
      { label: "BOQ Mapping", href: "/dashboard/planning/productivity/boq-mapping" },
      { label: "Cost Rollup", href: "/dashboard/planning/productivity/cost-rollup" },
      { label: "Site Records", href: "/dashboard/planning/productivity/site-records", visible: executionOnly },
    ],
  },
];

export function getActivePlanningGroup(pathname: string): ModuleNavGroup | null {
  return getActiveModuleGroup(PLANNING_GROUPS, pathname);
}
