import {
  Database, CalendarRange, HardHat, TrendingUp, FileBarChart,
  LayoutDashboard, PenTool, ShoppingCart, Calculator, Box, Users, Landmark, FileText, BarChart2,
  ClipboardList, FileSpreadsheet, FileSignature, GitCompareArrows,
  GanttChartSquare, Wallet, LineChart, AlertTriangle, PieChart, LayoutGrid,
  type LucideIcon,
} from "lucide-react";

/**
 * Data for the Planning Overview "at a glance" infographic
 * (`planning-overview-infographic.tsx`) — modeled on the reference iCEP
 * roadmap poster, adapted to this app's actual routes/modules (verified
 * against `lib/nav-item-catalog.ts` and `components/dashboard/module-hub.tsx`
 * rather than inventing generic module names).
 */

// ---------------------------------------------------------------------------
// 1. "Planning at a Glance" — the 5-stage project lifecycle this module spans.
// ---------------------------------------------------------------------------

export interface GlanceStage {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Tailwind color family driving the icon chip + top accent bar. */
  color: "chart-1" | "primary" | "chart-2" | "chart-3" | "chart-5";
  items: string[];
}

export const PLANNING_GLANCE_STAGES: GlanceStage[] = [
  {
    id: "input",
    label: "Input & Data",
    icon: Database,
    color: "chart-1",
    items: ["WBS / BOQ", "Resources", "Cost / Norms", "Baseline"],
  },
  {
    id: "planning",
    label: "Planning",
    icon: CalendarRange,
    color: "primary",
    items: ["Schedule", "Resource Plan", "Productivity", "Cost Plan"],
  },
  {
    id: "execution",
    label: "Execution",
    icon: HardHat,
    color: "chart-2",
    items: ["Site Progress", "Task Update", "Time / Cost Tracking", "Daily / Weekly Plan"],
  },
  {
    id: "monitoring",
    label: "Monitoring & Control",
    icon: TrendingUp,
    color: "chart-3",
    items: ["Variance Analysis", "EVM / S-Curve", "Delay / TIA", "Progress Review"],
  },
  {
    id: "reporting",
    label: "Reporting",
    icon: FileBarChart,
    color: "chart-5",
    items: ["Dashboards", "Reports", "Comparison", "Decision Support"],
  },
];

// ---------------------------------------------------------------------------
// 2. "Related Modules" — the other real DCOS modules Planning integrates
//    with, mirrored from module-hub.tsx's MODULES list (same icons/labels).
// ---------------------------------------------------------------------------

export interface RelatedModule {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const PLANNING_RELATED_MODULES: RelatedModule[] = [
  { key: "project", label: "Project", href: "/dashboard", icon: LayoutDashboard },
  { key: "design", label: "Design", href: "/dashboard/design", icon: PenTool },
  { key: "procurement", label: "Procurement", href: "/dashboard/procurement", icon: ShoppingCart },
  { key: "qs", label: "QS", href: "/dashboard/qs", icon: Calculator },
  { key: "construction", label: "Construction", href: "/dashboard/site", icon: HardHat },
  { key: "inventory", label: "Inventory", href: "/dashboard/inventory", icon: Box },
  { key: "hr", label: "HR", href: "/dashboard/hr", icon: Users },
  { key: "account", label: "Finance", href: "/dashboard/account", icon: Landmark },
  { key: "document_control", label: "Documents", href: "/dashboard/documents", icon: FileText },
  { key: "reporting", label: "Reporting", href: "/dashboard/reports", icon: BarChart2 },
];

// ---------------------------------------------------------------------------
// 3. "Project Data" (left feeder card) and "Outputs" (right consumer card).
// ---------------------------------------------------------------------------

export interface SideCardItem {
  label: string;
  href?: string;
  icon: LucideIcon;
}

export const PLANNING_PROJECT_DATA_ITEMS: SideCardItem[] = [
  { label: "Project Info", href: "/dashboard/projects", icon: ClipboardList },
  { label: "WBS", href: "/dashboard/wbs", icon: LayoutGrid },
  { label: "BOQ", href: "/dashboard/qs/boq", icon: FileSpreadsheet },
  { label: "Contract", href: "/dashboard/contracts/register", icon: FileSignature },
  { label: "Baseline", href: "/dashboard/planning/comparison", icon: GitCompareArrows },
];

export const PLANNING_OUTPUT_ITEMS: SideCardItem[] = [
  { label: "Schedules", href: "/dashboard/planning/gantt", icon: GanttChartSquare },
  { label: "Resource Plan", href: "/dashboard/planning/resource-loading", icon: Users },
  { label: "Progress Report", href: "/dashboard/wbs/lookahead?sub=progress-reviews", icon: FileBarChart },
  { label: "EVM Report", href: "/dashboard/wbs/lookahead?sub=scurve", icon: LineChart },
  { label: "Delay Report", href: "/dashboard/planning/delays", icon: AlertTriangle },
  { label: "Productivity Report", href: "/dashboard/planning/productivity/cost-rollup", icon: Wallet },
  { label: "Dashboards", href: "/dashboard/planning", icon: PieChart },
];

// ---------------------------------------------------------------------------
// 4. "Data & Information Flow Across Modules" — the focused, captioned strip
//    of what actually flows into Planning from each upstream module.
// ---------------------------------------------------------------------------

export interface DataFlowModule {
  label: string;
  caption: string;
  href: string;
  icon: LucideIcon;
}

export const PLANNING_DATA_FLOW_MODULES: DataFlowModule[] = [
  { label: "Project", caption: "Structure", href: "/dashboard/projects", icon: LayoutDashboard },
  { label: "WBS", caption: "Structure", href: "/dashboard/wbs", icon: LayoutGrid },
  { label: "Design", caption: "Models / Drawings", href: "/dashboard/design", icon: PenTool },
  { label: "Procurement", caption: "PO / Delivery", href: "/dashboard/procurement", icon: ShoppingCart },
  { label: "Construction", caption: "Site Progress", href: "/dashboard/site", icon: HardHat },
  { label: "QS", caption: "Quantities / Cost", href: "/dashboard/qs", icon: Calculator },
  { label: "Finance", caption: "Cost / Payments", href: "/dashboard/account", icon: Landmark },
  { label: "HR", caption: "Manpower", href: "/dashboard/hr", icon: Users },
];

// ---------------------------------------------------------------------------
// 5. Footer "Key Benefits" strip.
// ---------------------------------------------------------------------------

export const PLANNING_KEY_BENEFITS: string[] = [
  "Better planning accuracy",
  "Real-time visibility",
  "Optimized resources",
  "Reduced delays & risks",
  "Higher productivity",
  "Data-driven decisions",
];
