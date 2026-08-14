// Single source of truth for the Design navigation layout (mirrors
// lib/procurement-nav.ts):
//   - The sidebar shows one flat item per group
//   - The Design header shows the group's child pages as tabs (see
//     app/dashboard/design/layout.tsx)

import { getActiveModuleGroup, type ModuleNavGroup } from "@/lib/module-nav";

export type DesignTabItem = ModuleNavGroup["items"][number];
export type DesignGroup = ModuleNavGroup;

export const DESIGN_GROUPS: ModuleNavGroup[] = [
  {
    key: "correspondence",
    navKey: "group:design:correspondence",
    label: "Correspondence",
    href: "/dashboard/design",
    items: [
      { label: "Dashboard", href: "/dashboard/design" },
      { label: "Coordination", href: "/dashboard/design/coordination" },
      { label: "Drawing Markup", href: "/dashboard/design/markup" },
      { label: "BIM Viewer", href: "/dashboard/design/bim" },
    ],
  },
  {
    key: "architecture",
    navKey: "group:design:architecture",
    label: "Architecture",
    href: "/dashboard/design/arc/drawings",
    items: [
      { label: "ARC Drawings", href: "/dashboard/design/arc/drawings" },
      { label: "Room Data", href: "/dashboard/design/arc/room-data" },
      { label: "ARC RFI", href: "/dashboard/design/arc/rfi" },
      { label: "Door Schedule", href: "/dashboard/design/arc/door-schedule" },
      { label: "Window Schedule", href: "/dashboard/design/arc/window-schedule" },
      { label: "Finish Schedule", href: "/dashboard/design/arc/finish-schedule" },
      { label: "Material Approval", href: "/dashboard/design/arc/material-approval" },
    ],
  },
  {
    key: "structure",
    navKey: "group:design:structure",
    label: "Structure",
    href: "/dashboard/design/str/drawings",
    items: [
      { label: "STR Drawings", href: "/dashboard/design/str/drawings" },
      { label: "Calculations", href: "/dashboard/design/str/calculations" },
      { label: "BIM Models", href: "/dashboard/design/str/models" },
      { label: "Rebar Scheduling", href: "/dashboard/design/str/rebar" },
      { label: "STR RFI", href: "/dashboard/design/str/rfi" },
      { label: "Tech. Queries", href: "/dashboard/design/str/technical-queries" },
      { label: "Design Changes", href: "/dashboard/design/str/design-changes" },
    ],
  },
  {
    key: "mep",
    navKey: "group:design:mep",
    label: "MEP",
    href: "/dashboard/design/mep/drawings",
    items: [
      { label: "MEP Drawings", href: "/dashboard/design/mep/drawings" },
      { label: "Equipment", href: "/dashboard/design/mep/equipment" },
      { label: "Load Schedule", href: "/dashboard/design/mep/load-schedule" },
      { label: "Sleeve Details", href: "/dashboard/design/mep/sleeves" },
      { label: "Submittals", href: "/dashboard/design/mep/submittals" },
      { label: "MEP RFI", href: "/dashboard/design/mep/rfi" },
      { label: "Commissioning", href: "/dashboard/design/mep/commissioning" },
    ],
  },
];

export function getActiveDesignGroup(pathname: string): ModuleNavGroup | null {
  return getActiveModuleGroup(DESIGN_GROUPS, pathname);
}
