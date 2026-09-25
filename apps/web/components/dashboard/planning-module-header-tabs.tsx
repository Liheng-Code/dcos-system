"use client";

import { usePathname } from "next/navigation";
import { useProject } from "@/components/dashboard/project-context";
import { ModuleHeaderTabs } from "@/components/dashboard/module-header-tabs";
import { filterGroupItems } from "@/lib/module-nav";
import { getActivePlanningGroup } from "@/lib/planning-nav";

// Planning routes span /dashboard/planning and /dashboard/wbs/lookahead, so
// this is rendered by a thin layout in each of those directories (it
// resolves the active group from the current pathname).
export function PlanningModuleHeaderTabs() {
  const pathname = usePathname();
  const { selectedProject } = useProject();
  const isPrecontract = selectedProject?.project_type === "tender";
  const activeGroup = filterGroupItems(getActivePlanningGroup(pathname), { isPrecontract });
  return <ModuleHeaderTabs activeGroup={activeGroup} />;
}
