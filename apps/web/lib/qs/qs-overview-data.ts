import {
  FileSignature, Database, BarChart2, FileText, FileBarChart,
  LayoutDashboard, PenTool, ShoppingCart, HardHat, CalendarRange, Box, Users, Landmark, BarChart2 as ReportIcon,
  ClipboardList, LayoutGrid, Award, Ruler, GanttChartSquare,
  Receipt, GitCompareArrows, LineChart, Briefcase, FileCheck2,
  type LucideIcon,
} from "lucide-react";

/**
 * Data for the QS Overview "at a glance" infographic
 * (`qs-overview-infographic.tsx`) — modeled on
 * `lib/planning/planning-overview-data.ts`, built from this app's actual
 * routes/modules (verified against `lib/qs-nav.ts` and
 * `components/dashboard/module-hub.tsx`) rather than generic placeholders.
 */

// ---------------------------------------------------------------------------
// 1. "QS at a Glance" — the 5-stage lifecycle this module spans.
// ---------------------------------------------------------------------------

export interface GlanceStage {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Tailwind color family driving the icon chip + top accent bar. */
  color: "chart-1" | "primary" | "chart-2" | "chart-3" | "chart-5";
  items: string[];
}

export const QS_GLANCE_STAGES: GlanceStage[] = [
  {
    id: "tender",
    label: "Tender & Estimate",
    icon: FileSignature,
    color: "chart-1",
    items: ["Tender Register", "Cost Estimation", "Bid Evaluation", "Budget Codes"],
  },
  {
    id: "libraries",
    label: "Cost & Rate Libraries",
    icon: Database,
    color: "primary",
    items: ["Material / Resource Master", "Rate Build-Up", "Assemblies", "Element Library"],
  },
  {
    id: "cost_control",
    label: "Cost Control",
    icon: BarChart2,
    color: "chart-2",
    items: ["BOQ", "Budget & Variance", "Contingency", "EVM / S-Curve"],
  },
  {
    id: "commercial",
    label: "Commercial Administration",
    icon: FileText,
    color: "chart-3",
    items: ["Progress Claims", "Variations", "Retention", "Subcontracts & Contract Admin"],
  },
  {
    id: "reporting",
    label: "Reporting & Audit",
    icon: FileBarChart,
    color: "chart-5",
    items: ["Audit Log", "Portfolio", "Cost / m²", "Final Account"],
  },
];

// ---------------------------------------------------------------------------
// 2. "Related Modules" — the other real DCOS modules QS integrates with,
//    mirrored from module-hub.tsx's MODULES list (same icons/labels).
// ---------------------------------------------------------------------------

export interface RelatedModule {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
}

export const QS_RELATED_MODULES: RelatedModule[] = [
  { key: "project", label: "Project", href: "/dashboard", icon: LayoutDashboard },
  { key: "design", label: "Design", href: "/dashboard/design", icon: PenTool },
  { key: "procurement", label: "Procurement", href: "/dashboard/procurement", icon: ShoppingCart },
  { key: "planning", label: "Planning", href: "/dashboard/planning", icon: CalendarRange },
  { key: "construction", label: "Construction", href: "/dashboard/site", icon: HardHat },
  { key: "inventory", label: "Inventory", href: "/dashboard/inventory", icon: Box },
  { key: "hr", label: "HR", href: "/dashboard/hr", icon: Users },
  { key: "account", label: "Finance", href: "/dashboard/account", icon: Landmark },
  { key: "document_control", label: "Documents", href: "/dashboard/documents", icon: FileText },
  { key: "reporting", label: "Reporting", href: "/dashboard/reports", icon: ReportIcon },
];

// ---------------------------------------------------------------------------
// 3. "Project Data" (left feeder card) and "Outputs" (right consumer card).
// ---------------------------------------------------------------------------

export interface SideCardItem {
  label: string;
  href?: string;
  icon: LucideIcon;
}

export const QS_PROJECT_DATA_ITEMS: SideCardItem[] = [
  { label: "Project Info", href: "/dashboard/projects", icon: ClipboardList },
  { label: "WBS / Quantities", href: "/dashboard/wbs", icon: LayoutGrid },
  { label: "Tender Award", href: "/dashboard/tenders/register", icon: Award },
  { label: "Drawings (Take-off)", href: "/dashboard/qto", icon: Ruler },
  { label: "Procurement POs", href: "/dashboard/procurement", icon: ShoppingCart },
];

export const QS_OUTPUT_ITEMS: SideCardItem[] = [
  { label: "BOQ", href: "/dashboard/qs/boq", icon: GanttChartSquare },
  { label: "IPC / Payment Certificate", href: "/dashboard/qs/claims", icon: Receipt },
  { label: "Variation Orders", href: "/dashboard/qs/variations", icon: GitCompareArrows },
  { label: "EVM / S-Curve", href: "/dashboard/qs/evm", icon: LineChart },
  { label: "Portfolio Report", href: "/dashboard/qs?tab=portfolio", icon: Briefcase },
  { label: "Final Account", href: "/dashboard/qs?tab=cost-control&sub=cost-per-m2", icon: FileCheck2 },
];

// ---------------------------------------------------------------------------
// 4. "Data & Information Flow Across Modules" — the focused, captioned strip
//    of what actually flows into QS from each upstream module.
// ---------------------------------------------------------------------------

export interface DataFlowModule {
  label: string;
  caption: string;
  href: string;
  icon: LucideIcon;
}

export const QS_DATA_FLOW_MODULES: DataFlowModule[] = [
  { label: "Project", caption: "Structure / Contract", href: "/dashboard/projects", icon: LayoutDashboard },
  { label: "WBS", caption: "Quantities", href: "/dashboard/wbs", icon: LayoutGrid },
  { label: "Design", caption: "Drawings for QTO", href: "/dashboard/design", icon: PenTool },
  { label: "Procurement", caption: "PO / Delivery Cost", href: "/dashboard/procurement", icon: ShoppingCart },
  { label: "Planning", caption: "Schedule / WBS Tie", href: "/dashboard/planning", icon: CalendarRange },
  { label: "Construction", caption: "Site Progress for Claims", href: "/dashboard/site", icon: HardHat },
  { label: "Finance", caption: "Payments / AP", href: "/dashboard/account", icon: Landmark },
  { label: "HR", caption: "Labor Cost", href: "/dashboard/hr", icon: Users },
];

// ---------------------------------------------------------------------------
// 5. Footer "Key Benefits" strip.
// ---------------------------------------------------------------------------

export const QS_KEY_BENEFITS: string[] = [
  "One source of BOQ truth",
  "Accurate cost control",
  "Faster claims cycle",
  "Audit-ready trail",
  "Real-time budget visibility",
  "Defensible final account",
];
