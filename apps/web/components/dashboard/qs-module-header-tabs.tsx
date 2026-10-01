"use client";

import { usePathname } from "next/navigation";
import { useProject } from "@/components/dashboard/project-context";
import { ModuleHeaderTabs } from "@/components/dashboard/module-header-tabs";
import { getActiveQsGroup } from "@/lib/qs/qs-nav";

// QS routes span /dashboard/qs, /dashboard/tenders, /dashboard/subcontractors
// and /dashboard/contracts, so this is rendered by a thin layout in each of
// those directories (it resolves the active group from the current pathname).
export function QsModuleHeaderTabs() {
  const pathname = usePathname();
  const { selectedProject } = useProject();
  const isPrecontract = selectedProject?.project_type === "tender";
  const activeGroup = getActiveQsGroup(pathname, isPrecontract);
  return <ModuleHeaderTabs activeGroup={activeGroup} />;
}
