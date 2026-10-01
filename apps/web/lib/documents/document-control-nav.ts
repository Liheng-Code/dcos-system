// Single source of truth for the Document Control navigation layout (mirrors
// lib/account/account-nav.ts):
//   - The sidebar shows one flat item per group
//   - The Document Control header shows the group's child pages as tabs (see
//     app/dashboard/documents/layout.tsx)

import { getActiveModuleGroup, type ModuleNavGroup } from "@/lib/module-nav";

export type DocumentControlTabItem = ModuleNavGroup["items"][number];
export type DocumentControlGroup = ModuleNavGroup;

export const DOCUMENT_CONTROL_GROUPS: ModuleNavGroup[] = [
  {
    key: "documents",
    navKey: "group:document_control:documents",
    label: "Documents",
    href: "/dashboard/documents",
    items: [
      { label: "Document Register", href: "/dashboard/documents" },
      { label: "Master Register (MDR)", href: "/dashboard/documents/mdr" },
      { label: "Submittals", href: "/dashboard/documents/submittals" },
      { label: "Transmittals", href: "/dashboard/documents/transmittals" },
    ],
  },
  {
    key: "controller",
    navKey: "group:document_control:controller",
    label: "Controller",
    href: "/dashboard/documents/controller",
    items: [
      { label: "Controller Dashboard", href: "/dashboard/documents/controller" },
      { label: "Audit Log", href: "/dashboard/documents/audit-log" },
    ],
  },
];

export function getActiveDocumentControlGroup(pathname: string): ModuleNavGroup | null {
  return getActiveModuleGroup(DOCUMENT_CONTROL_GROUPS, pathname);
}
